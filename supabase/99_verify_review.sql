-- ============================================================================
--  تحقّق من الاعتماد والإرجاع — ينتحل كل دور بجلسته ثم يرتدّ بالكامل
--
--  auth.uid() تقرأ من request.jwt.claims، فضبطها هنا يجعل الفحص يجري بصلاحية
--  المستخدم الحقيقية لا بصلاحية المالك — وإلا لم يُختبر شيء.
-- ============================================================================

begin;

create temporary table ids (k text primary key, v uuid);
insert into ids values
  ('ammar',  'd33292d5-2909-44d1-b882-7a3b2b48ad67'),
  ('khalaf', '0e76b26b-5ae1-42e3-b065-5104993f7d25'),
  ('tech',   'c5cdc703-26b8-4d37-a1b6-243804b29015');

-- الجداول المؤقتة يملكها المالك، والفحوص تجري بدور authenticated
grant select on ids to authenticated;

/* ضبط الهوية وحده لا يكفي: مالك الجدول يتجاوز RLS دائمًا، فتمرّ فحوص
   الصلاحية كذبًا. التحوّل إلى دور authenticated هو ما يجعل السياسات تُطبَّق
   كما تُطبَّق على مستخدم حقيقي قادم من المتصفح. */
create or replace function pg_temp.be(who text) returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
                     json_build_object('sub', (select v from ids where k = who))::text,
                     true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.fails(sql text) returns boolean
language plpgsql as $$
begin
  execute sql;
  return false;                      -- نجح وكان يجب أن يفشل
exception when others then
  return true;
end $$;

-- سجل بانتظار الاعتماد، أنشأه الفني
select pg_temp.be('tech');
insert into records (form_code, title, location, state, created_by, assigned_to)
values ('WO-01', 'زز-اعتماد', 'موقع اختبار', 'sent',
        (select v from ids where k='tech'), (select v from ids where k='tech'));

create temporary table rec as
  select id from records where title = 'زز-اعتماد';
grant select on rec to authenticated;

-- ① ممثل الهيئة لا يعتمد ولا يعدّل
select pg_temp.be('khalaf');
create temporary table r1 as select
  pg_temp.fails(format('select review_record(%L, %L, %L)',
                       (select id from rec), 'approve', null)) as no_review,
  (select count(*) = 1 from records where title = 'زز-اعتماد') as can_read;

-- ② الفني لا يعتمد سجله بنفسه
select pg_temp.be('tech');
create temporary table r2 as select
  pg_temp.fails(format('select review_record(%L, %L, %L)',
                       (select id from rec), 'approve', null)) as no_review;

-- ③ المشرف: الإرجاع بلا ملاحظة مرفوض، وبملاحظة يعيدها مسودة
select pg_temp.be('ammar');
create temporary table r3 as select
  pg_temp.fails(format('select review_record(%L, %L, %L)',
                       (select id from rec), 'return', '   ')) as needs_note;

select review_record((select id from rec), 'return', 'الصورة الثانية غير واضحة — أعد التقاطها');

create temporary table r4 as select
  (select state = 'draft' from records where title = 'زز-اعتماد') as back_to_draft,
  -- now() ثابتة داخل المعاملة فكل الصفوف بالطابع ذاته: الترتيب بالمعرّف
  (select note = 'الصورة الثانية غير واضحة — أعد التقاطها'
     from record_history where record_id = (select id from rec)
     order by id desc limit 1) as note_kept,
  (select by_user = (select v from ids where k='ammar')
     from record_history where record_id = (select id from rec)
     order by id desc limit 1) as by_ammar,
  -- سجل مسودة لا يقبل قرارًا: لا اعتماد لما لم يُرسَل بعد
  pg_temp.fails(format('select review_record(%L, %L, %L)',
                       (select id from rec), 'approve', null)) as draft_not_reviewable;

-- ④ الفني يعيد الإرسال، والمشرف يعتمد فيُغلق
select pg_temp.be('tech');
update records set state = 'sent' where title = 'زز-اعتماد';

select pg_temp.be('ammar');
select review_record((select id from rec), 'approve', 'مطابق — اعتُمد');

create temporary table r5 as select
  (select state = 'closed' from records where title = 'زز-اعتماد') as closed,
  (select closed_at is not null from records where title = 'زز-اعتماد') as stamped,
  pg_temp.fails(format('select review_record(%L, %L, %L)',
                       (select id from rec), 'approve', null)) as closed_is_final,
  (select count(*) from record_history where record_id = (select id from rec)) as steps;

-- ⑤ ممثل الهيئة لا ينشئ مهمة
select pg_temp.be('khalaf');
create temporary table r6 as select
  pg_temp.fails(format(
    'insert into tasks (title, specialty, created_by) values (%L, %L, %L)',
    'زز-مهمة', 'electrical', (select v from ids where k='khalaf'))) as no_task_insert;

reset role;
select set_config('request.jwt.claims', null, true);

with chk as (
  select 1 n, 'ممثل الهيئة لا يعتمد' t, (select no_review from r1) ok
  union all select 2, 'ممثل الهيئة يقرأ كل شيء',      (select can_read from r1)
  union all select 3, 'الفني لا يعتمد سجله',          (select no_review from r2)
  union all select 4, 'الإرجاع بلا ملاحظة مرفوض',     (select needs_note from r3)
  union all select 5, 'الإرجاع يعيدها مسودة',         (select back_to_draft from r4)
  union all select 6, 'الملاحظة محفوظة في التاريخ',   (select note_kept from r4)
  union all select 7, 'القرار منسوب إلى المشرف',      (select by_ammar from r4)
  union all select 8, 'المسودة لا تقبل اعتمادًا',      (select draft_not_reviewable from r4)
  union all select 9, 'الاعتماد يُغلق السجل',          (select closed from r5)
  union all select 10,'وقت الإغلاق مختوم',            (select stamped from r5)
  union all select 11,'المغلق لا يقبل قرارًا جديدًا',  (select closed_is_final from r5)
  union all select 12,'التاريخ سجّل الخطوات الأربع',   (select steps = 4 from r5)
  union all select 13,'ممثل الهيئة لا ينشئ مهمة',     (select no_task_insert from r6)
)
select n as "#", t as "الفحص",
       case when ok then '✅ نجح' else '❌ فشل' end as "النتيجة"
  from chk
union all
select 99, '── الإجمالي ──',
       (select count(*) filter (where ok)::text || ' / ' || count(*)::text from chk)
 order by 1;

rollback;
