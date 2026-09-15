-- ============================================================================
--  تحقّق من البلاغ الميداني — ينتحل كل دور بجلسته ثم يرتدّ بالكامل
--
--  السؤال الذي يجيب عنه: هل يستطيع الفني أن يُسند لنفسه عملًا باسم بلاغ؟
--  الواجهة لا تعرض له ذلك، لكن الواجهة ليست حارسًا. الحارس هنا.
-- ============================================================================

begin;

create temporary table ids (k text primary key, v uuid);
insert into ids values
  ('ammar',  'd33292d5-2909-44d1-b882-7a3b2b48ad67'),
  ('khalaf', '0e76b26b-5ae1-42e3-b065-5104993f7d25'),
  ('tech',   'c5cdc703-26b8-4d37-a1b6-243804b29015');

grant select on ids to authenticated;

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


-- ① الفني يرفع بلاغًا: معلَّق، بلا مُسنَد إليه
select pg_temp.be('tech');
insert into tasks (title, location, priority, status, created_by)
values ('زز-بلاغ ميداني', 'موقع اختبار', 'high', 'pending',
        (select v from ids where k='tech'));

create temporary table tk as
  select id from tasks where title = 'زز-بلاغ ميداني';
grant select on tk to authenticated;

create temporary table r1 as select
  (select count(*) = 1 from tasks
    where title = 'زز-بلاغ ميداني' and status = 'pending' and assigned_to is null) as raised;

-- ② ولا يستطيع أن يُسند لنفسه عملًا ابتداءً
create temporary table r2 as select
  pg_temp.fails(format(
    'insert into tasks (title, status, assigned_to, created_by) values (%L, %L, %L, %L)',
    'زز-إسناد ذاتي', 'assigned',
    (select v from ids where k='tech'), (select v from ids where k='tech'))) as no_self_assign;

-- ③ ولا يحرّك بلاغه بعد رفعه: غير مُسنَد إليه فلا تشمله tasks_update
create temporary table r3 as
  with u as (
    update tasks set status = 'assigned', assigned_to = (select v from ids where k='tech')
     where id = (select id from tk) returning 1)
  select count(*) = 0 as no_self_approve from u;

-- ④ ولا يبتّ فيه بالدالة
create temporary table r4 as select
  pg_temp.fails(format('select review_task(%L, %L)',
                       (select id from tk), 'approve')) as no_review_rpc;

-- ⑤ ممثل الهيئة يرى ولا يقرّر
select pg_temp.be('khalaf');
create temporary table r5 as select
  (select count(*) = 1 from tasks where title = 'زز-بلاغ ميداني') as can_read,
  pg_temp.fails(format('select review_task(%L, %L)',
                       (select id from tk), 'approve')) as no_review;

-- ⑥ المشرف: الرفض بلا سبب مرفوض
select pg_temp.be('ammar');
create temporary table r6 as select
  pg_temp.fails(format('select review_task(%L, %L, %L)',
                       (select id from tk), 'reject', '   ')) as reject_needs_reason;

-- ⑦ والاعتماد يُسنده إلى رافعه ويعطيه نموذجًا
select review_task((select id from tk), 'approve', 'ابدأ اليوم');

create temporary table r7 as select
  (select status = 'assigned' from tasks where id = (select id from tk)) as now_assigned,
  (select assigned_to = (select v from ids where k='tech')
     from tasks where id = (select id from tk)) as to_reporter,
  (select form_code = 'WO-01' from tasks where id = (select id from tk)) as has_form,
  (select reviewed_by = (select v from ids where k='ammar')
     from tasks where id = (select id from tk)) as decided_by_ammar;

-- ⑧ ولا يُبتّ فيه مرتين
create temporary table r8 as select
  pg_temp.fails(format('select review_task(%L, %L)',
                       (select id from tk), 'reject')) as no_double_decision;


reset role;
select 'رفع الفني بلاغًا معلّقًا بلا إسناد'        as check, raised            as ok from r1
union all select 'لا يُسند لنفسه عملًا ابتداءً',        no_self_assign      from r2
union all select 'لا يعتمد بلاغه بتحديث مباشر',        no_self_approve     from r3
union all select 'لا يعتمد بلاغه بالدالة',             no_review_rpc       from r4
union all select 'ممثل الهيئة يرى البلاغ',             can_read            from r5
union all select 'ممثل الهيئة لا يبتّ فيه',            no_review           from r5
union all select 'الرفض بلا سبب مرفوض',                reject_needs_reason from r6
union all select 'الاعتماد يجعلها مسندة',              now_assigned        from r7
union all select 'مسندة إلى رافع البلاغ',              to_reporter         from r7
union all select 'ومعها نموذج WO-01',                  has_form            from r7
union all select 'والقرار منسوب إلى المشرف',           decided_by_ammar    from r7
union all select 'لا يُبتّ في البلاغ مرتين',           no_double_decision  from r8;

rollback;
