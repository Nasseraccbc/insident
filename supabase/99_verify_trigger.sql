-- ============================================================================
--  تحقّق من مشغّل أمر العمل التصحيحي — يرتدّ بالكامل فلا يترك أثرًا
-- ============================================================================

begin;

-- الحفظ الأول: لوحتان فيهما أعطال، وثالثة سليمة تمامًا
insert into records (form_code, title, location, data)
values ('QA-02-EL', 'زز-فحص', 'غرفة الكهرباء', jsonb_build_object('grid', jsonb_build_object(
  'EL-12', jsonb_build_object('visual','ok','clean','fail','earth','fail','temp','ok'),
  'EL-07', jsonb_build_object('visual','ok','clean','fail','spare','fail'),
  'EL-01', jsonb_build_object('visual','ok','clean','ok','earth','ok')
)));

-- الحفظ الثاني (نفس السجل): الفني يضيف عطلًا جديدًا للوحة EL-07
update records set data = jsonb_build_object('grid', jsonb_build_object(
  'EL-12', jsonb_build_object('visual','ok','clean','fail','earth','fail','temp','ok'),
  'EL-07', jsonb_build_object('visual','ok','clean','fail','spare','fail','damage','fail'),
  'EL-01', jsonb_build_object('visual','ok','clean','ok','earth','ok')
)) where title = 'زز-فحص';

-- الحفظ الثالث: بلا تغيير — يجب ألا ينشئ شيئًا
update records set data = data where title = 'زز-فحص';

with tk as (
  select t.* from tasks t
   join records r on r.id = t.source_record_id
  where r.title = 'زز-فحص'
),
chk as (
  select 1 n, 'أمران فقط — واحد لكل أصل معطوب لا لكل نقطة' t,
         (select count(*) = 2 from tk) ok
  union all select 2, 'الأصل السليم EL-01 لم يولّد شيئًا',
         (select count(*) = 0 from tk where source_key = 'EL-01')
  union all select 3, 'ثلاثة حفظات لم تكرّر الأوامر',
         (select count(*) = 2 from tk)
  union all select 4, 'EL-12 حرج (فيه عطل تأريض)',
         (select priority = 'critical' from tk where source_key = 'EL-12')
  union all select 5, 'EL-07 صار حرجًا بعد إضافة التلف الفيزيائي',
         (select priority = 'critical' from tk where source_key = 'EL-07')
  union all select 6, 'الوصف تحدّث ليشمل العطل الجديد',
         (select description like '%التلف الفيزيائي%' from tk where source_key = 'EL-07')
  union all select 7, 'عدد أعطال EL-07 صار ثلاثة',
         (select description like '%(3)%' from tk where source_key = 'EL-07')
  union all select 8, 'غير مسندة — تنتظر توزيع المشرف',
         (select bool_and(assigned_to is null) from tk)
  union all select 9, 'التخصص كهرباء',
         (select bool_and(specialty = 'electrical') from tk)
  union all select 10,'الحالة جديدة',
         (select bool_and(status = 'new') from tk)
  union all select 11,'الموقع مورّث من السجل',
         (select bool_and(location = 'غرفة الكهرباء') from tk)
  union all select 12,'أسماء الأعطال بالعربية لا بالمفاتيح',
         (select description like '%سلامة التأريض%' from tk where source_key = 'EL-12')
)
select n as "#", t as "الفحص",
       case when ok then '✅ نجح' else '❌ فشل' end as "النتيجة"
  from chk
union all
select 99, '── الإجمالي ──',
       (select count(*) filter (where ok)::text || ' / ' || count(*)::text from chk)
 order by 1;

rollback;
