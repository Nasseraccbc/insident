-- ============================================================================
--  ملف 06: نقاط الفحص الكهربائي ومشغّل أمر العمل التصحيحي
--
--  القرارات (PROJECT-SPEC.md §6):
--    • أمر عمل واحد لكل أصل يجمع كل أعطاله — لا واحد لكل نقطة
--    • يُنشأ غير مسند بتخصص كهرباء، ويوزّعه المشرف يدويًا
--    • الأولوية حسب نوع العطل: حرج للنقاط الخطرة على الأرواح، وعالي للباقي
-- ============================================================================

-- ─── نقاط الفحص الاثنتا عشرة ───────────────────────────────────────────────
-- جدول لا ثابت في الكود: الواجهة تقرأ منه لبناء الشبكة، والمشغّل يقرأ منه
-- لتسمية الأعطال وتحديد خطورتها. مصدر واحد للحقيقة.

create table if not exists check_points (
  key      text primary key,
  name_ar  text    not null,
  name_en  text    not null,
  critical boolean not null default false,   -- خطر على الأرواح ← أولوية حرجة
  sort     int     not null default 0
);

comment on table check_points is 'نقاط فحص الأصول الكهربائية — QA-02-EL';

alter table check_points enable row level security;

drop policy if exists cp_read on check_points;
create policy cp_read on check_points for select to authenticated using (true);

drop policy if exists cp_admin on check_points;
create policy cp_admin on check_points for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into check_points (key, name_ar, name_en, critical, sort) values
  ('visual', 'الفحص الظاهري',            'Visual inspection',      false,  1),
  ('clean',  'النظافة',                  'Cleanliness',            false,  2),
  ('conn',   'التوصيل الكهربائي',        'Electrical connections', false,  3),
  ('insul',  'فك الجهد والعزل',          'Isolation & insulation', false,  4),
  ('amp',    'قياس التيار واتزان الأوجه', 'Amperage & balance',     false,  5),
  ('leak',   'فحص التسريب ELCB',         'Leakage test (ELCB)',    true,   6),
  ('earth',  'سلامة التأريض',            'Earthing integrity',     true,   7),
  ('func',   'الأداء الوظيفي',           'Functional performance', false,  8),
  ('spare',  'قطع الغيار',               'Spare parts',            false,  9),
  ('temp',   'قياس الحرارة Infrared',    'Infrared thermography',  true,  10),
  ('corr',   'فحص التآكل',               'Corrosion check',        false, 11),
  ('damage', 'فحص التلف الفيزيائي',      'Physical damage',        true,  12)
on conflict (key) do update
  set name_ar = excluded.name_ar, name_en = excluded.name_en,
      critical = excluded.critical, sort = excluded.sort;


-- ─── حماية التكرار ─────────────────────────────────────────────────────────
-- الفني يحفظ النموذج مرارًا أثناء التعبئة. بلا هذا القيد يُولَّد أمر عمل
-- جديد في كل حفظ لنفس العطل. البصمة: (السجل المصدر + رمز الأصل).

alter table tasks add column if not exists source_record_id uuid
  references records(id) on delete set null;
alter table tasks add column if not exists source_key text;

comment on column tasks.source_key is 'بصمة المصدر — رمز الأصل في QA-02-EL';

create unique index if not exists tasks_source_uniq
  on tasks (source_record_id, source_key)
  where source_record_id is not null and source_key is not null;


-- ─── المشغّل ───────────────────────────────────────────────────────────────

/**
 * يقرأ data->'grid' بالشكل:
 *   { "EL-12": { "clean": "fail", "earth": "fail", "visual": "ok" }, ... }
 * وينشئ أمر عمل تصحيحيًا واحدًا لكل أصل فيه عطل واحد فأكثر.
 */
create or replace function public.gen_corrective_wo()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  entry     record;
  failed    text[];
  labels    text;
  has_crit  boolean;
  asset_ar  text;
  made      int := 0;
begin
  if new.form_code <> 'QA-02-EL' then return new; end if;
  if new.data is null or new.data->'grid' is null then return new; end if;

  for entry in
    select key as asset_code, value as checks
      from jsonb_each(new.data->'grid')
  loop
    -- نقاط هذا الأصل التي رُصد فيها عطل
    select array_agg(e.k order by cp.sort),
           string_agg(cp.name_ar, ' · ' order by cp.sort),
           bool_or(cp.critical)
      into failed, labels, has_crit
      from jsonb_each_text(entry.checks) as e(k, v)
      join check_points cp on cp.key = e.k
     where e.v = 'fail';

    if failed is null or array_length(failed, 1) = 0 then
      continue;
    end if;

    select name_ar into asset_ar from assets where code = entry.asset_code;

    insert into tasks (
      title, description, specialty, priority, status,
      created_by, form_code, location,
      source_record_id, source_key
    ) values (
      'إصلاح تصحيحي — ' || entry.asset_code || ' ' || coalesce(asset_ar, ''),
      'أعطال مرصودة أثناء الفحص (' || array_length(failed, 1) || '): ' || labels
        || E'\nالمصدر: نموذج الفحص الكهربائي QA-02-EL',
      'electrical'::specialty,
      (case when has_crit then 'critical' else 'high' end)::priority,
      'new'::task_status,
      new.created_by,
      'WO-01',
      new.location,
      new.id,
      entry.asset_code
    )
    -- شرط الفهرس الجزئي يجب أن يتكرر هنا حرفيًا، وإلا لم يطابق Postgres
    -- الفهرس وأطلق: there is no unique or exclusion constraint matching
    on conflict (source_record_id, source_key)
      where source_record_id is not null and source_key is not null
      do update
      -- الفني قد يضيف عطلًا آخر لنفس اللوحة في حفظ لاحق: نحدّث الوصف
      -- والأولوية ولا ننشئ أمرًا ثانيًا. ولا نلمس الإسناد أو الحالة حتى
      -- لا نُلغي عمل المشرف إن كان قد وزّعها بالفعل.
      set description = excluded.description,
          priority    = excluded.priority
      where tasks.status in ('new', 'assigned');

    made := made + 1;
  end loop;

  return new;
end $$;

drop trigger if exists trg_corrective_wo on records;
create trigger trg_corrective_wo
  after insert or update of data on records
  for each row execute function public.gen_corrective_wo();
