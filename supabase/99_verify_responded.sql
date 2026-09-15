-- ============================================================================
--  تحقّق من ختم لحظة الاستجابة — يرتدّ بالكامل
-- ============================================================================

begin;

insert into records (form_code, title, state, priority, data)
values ('WO-01', 'زز-ختم الاستجابة', 'draft', 'high', '{}'::jsonb);

create temporary table r as
  select id from records where title = 'زز-ختم الاستجابة';

create temporary table c1 as select
  (select responded_at is null from records where id = (select id from r)) as blank_at_first;

-- تسجيل وقت الاستجابة في النموذج يختم العمود من ساعة الخادم
update records set data = jsonb_set(data, '{rsp}', '"09:41"')
 where id = (select id from r);

create temporary table c2 as select
  (select responded_at is not null from records where id = (select id from r)) as stamped,
  (select responded_at between now() - interval '1 minute' and now() + interval '1 minute'
     from records where id = (select id from r)) as server_clock;

-- ما يرسله المتصفح لا يزحزح الختم
update records set responded_at = '2020-01-01'::timestamptz
 where id = (select id from r);

create temporary table c3 as select
  (select responded_at > '2024-01-01'::timestamptz
     from records where id = (select id from r)) as not_overwritten;

-- ومسح الحقل من النموذج لا يمحو الختم
update records set data = data - 'rsp' where id = (select id from r);

create temporary table c4 as select
  (select responded_at is not null from records where id = (select id from r)) as survives_erase;

-- وسجلّ يولد ووقت الاستجابة فيه يُختم عند الإدراج
insert into records (form_code, title, state, priority, data)
values ('WO-01', 'زز-ختم عند الإدراج', 'draft', 'high', '{"rsp":"10:00"}'::jsonb);

create temporary table c5 as select
  (select responded_at is not null from records where title = 'زز-ختم عند الإدراج') as stamped_on_insert;

select 'يبدأ فارغًا'                    as check, blank_at_first    as ok from c1
union all select 'يُختم عند تسجيل الاستجابة', stamped           from c2
union all select 'من ساعة الخادم',            server_clock      from c2
union all select 'لا يُزحزح بقيمة من المتصفح', not_overwritten   from c3
union all select 'ولا يمحوه مسح الحقل',       survives_erase    from c4
union all select 'ويُختم عند الإدراج أيضًا',   stamped_on_insert from c5;

rollback;
