-- ============================================================================
--  تحقّق من حالة «أُرسل» وأثر قرار المشرف عليها — يرتدّ بالكامل
-- ============================================================================

begin;

create temporary table ids (k text primary key, v uuid);
insert into ids values ('ammar', 'd33292d5-2909-44d1-b882-7a3b2b48ad67'),
                       ('tech',  'c5cdc703-26b8-4d37-a1b6-243804b29015');

insert into records (form_code, title, state, priority, created_by, assigned_to, data)
values ('WO-01', 'زز-إرسال', 'draft', 'high',
        (select v from ids where k='tech'), (select v from ids where k='tech'), '{}'::jsonb);

create temporary table r as select id from records where title = 'زز-إرسال';

insert into tasks (title, status, priority, created_by, assigned_to, record_id)
values ('زز-إرسال', 'assigned', 'high',
        (select v from ids where k='ammar'), (select v from ids where k='tech'),
        (select id from r));

create temporary table tk as select id from tasks where title = 'زز-إرسال';

-- الفني يفتحها ثم يرسلها
update tasks set status = 'in_progress' where id = (select id from tk);
update tasks set status = 'submitted'   where id = (select id from tk);
update records set state = 'sent' where id = (select id from r);

create temporary table c1 as select
  (select status::text = 'submitted' from tasks where id = (select id from tk)) as is_submitted,
  (select submitted_at is not null from tasks where id = (select id from tk)) as stamped,
  (select submitted_at between now() - interval '1 minute' and now() + interval '1 minute'
     from tasks where id = (select id from tk)) as server_clock,
  (select completed_at is null from tasks where id = (select id from tk)) as not_done_yet;

-- ① الإرجاع يعيدها للعمل ويُبطل الإرسال
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from ids where k='ammar'))::text, true);
select review_record((select id from r), 'return', 'ينقص وصف الإجراء');

create temporary table c2 as select
  (select status::text = 'in_progress' from tasks where id = (select id from tk)) as back_to_work,
  (select submitted_at is null from tasks where id = (select id from tk)) as stamp_cleared,
  (select state::text = 'draft' from records where id = (select id from r)) as rec_draft;

-- ② يعيد الفني الإرسال، فيُختم من جديد
update tasks   set status = 'submitted' where id = (select id from tk);
update records set state  = 'sent'      where id = (select id from r);

create temporary table c3 as select
  (select submitted_at is not null from tasks where id = (select id from tk)) as restamped;

-- ③ والاعتماد يُنجزها ويختم إنجازها
select review_record((select id from r), 'approve', null);

create temporary table c4 as select
  (select status::text = 'done' from tasks where id = (select id from tk)) as now_done,
  (select completed_at is not null from tasks where id = (select id from tk)) as completed,
  (select state::text = 'closed' from records where id = (select id from r)) as rec_closed;

select 'الإرسال يضع المهمة في «أُرسل»' as check, is_submitted as ok from c1
union all select 'ويختم لحظته',                 stamped       from c1
union all select 'من ساعة الخادم',              server_clock  from c1
union all select 'ولا يعدّها منجزة',            not_done_yet  from c1
union all select 'الإرجاع يعيدها قيد التنفيذ',  back_to_work  from c2
union all select 'ويُبطل ختم الإرسال',          stamp_cleared from c2
union all select 'والسجل يعود مسودة',           rec_draft     from c2
union all select 'وإعادة الإرسال تُختم',        restamped     from c3
union all select 'والاعتماد يُنجز المهمة',      now_done      from c4
union all select 'ويختم إنجازها',               completed     from c4
union all select 'ويغلق سجلّها',                rec_closed    from c4;

rollback;
