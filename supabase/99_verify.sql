-- ============================================================================
--  ملف 99: تحقّق من سلامة القاعدة — يُشغَّل بعد أي هجرة
--
--  يُنشئ سجلات اختبار ويفحص السلوك ثم يرتدّ بالكامل (rollback) فلا يترك أثرًا.
--  كل الفحوص في تقرير واحد لأن الـ API يرجّع نتيجة آخر استعلام فقط.
-- ============================================================================

begin;

insert into records (form_code, title, priority, state) values
  ('WO-01', 'زز-حرج',   'critical', 'draft'),
  ('WO-01', 'زز-عالي',  'high',     'draft'),
  ('WO-01', 'زز-متوسط', 'medium',   'draft');

update records set state='sent'   where title='زز-حرج';
update records set state='review' where title='زز-حرج';
update records set state='closed' where title='زز-حرج';

with
mins as (
  select priority::text p,
         round(extract(epoch from (sla_response_due-created_at))/60) rmin,
         round(extract(epoch from (sla_close_due   -created_at))/60) cmin
    from records where title like 'زز-%'
),
chk as (
  select 1 n, 'SLA حرج ١٥د/١٢٠د'   t, (select rmin=15  and cmin=120  from mins where p='critical') ok
  union all select 2, 'SLA عالي ٣٠د/٤٨٠د',  (select rmin=30  and cmin=480  from mins where p='high')
  union all select 3, 'SLA متوسط ١٢٠د/١٤٤٠د',(select rmin=120 and cmin=1440 from mins where p='medium')
  union all select 4, 'سجل الاعتماد يُكتب تلقائيًا',
    (select count(*)=4 from record_history h join records r on r.id=h.record_id where r.title='زز-حرج')
  union all select 5, 'انتقالات مرتّبة صحيحًا',
    (select array_agg(to_state::text order by at) = array['draft','sent','review','closed']
       from record_history h join records r on r.id=h.record_id where r.title='زز-حرج')
  union all select 6, 'ختم وقت الإغلاق',
    (select closed_at is not null from records where title='زز-حرج')
  union all select 7, 'الأصول الكهربائية ٢٤',  (select count(*)=24 from assets)
  union all select 8, 'المستخدمون ٤',          (select count(*)=4  from profiles)
  union all select 9, 'الأدوار الأربعة مميّزة',
    (select count(distinct role)=4 from profiles)
  union all select 10,'الفني له تخصص',
    (select specialty is not null from profiles where role='technician' limit 1)
  union all select 11,'RLS مفعّل على كل الجداول',
    (select count(*) filter (where relrowsecurity) = count(*)
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r')
  union all select 12,'لكل جدول سياسة واحدة على الأقل',
    (select count(*)=0 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r'
        and not exists (select 1 from pg_policies p
                         where p.schemaname='public' and p.tablename=c.relname))
  union all select 13,'حاوية التخزين خاصة',
    (select not public from storage.buckets where id='attachments')
)
select n as "#",
       t as "الفحص",
       case when ok then '✅ نجح' else '❌ فشل' end as "النتيجة"
  from chk
 union all
select 99, '── الإجمالي ──',
       (select count(*) filter (where ok)::text || ' / ' || count(*)::text from chk)
 order by 1;

rollback;
