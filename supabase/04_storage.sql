-- ============================================================================
--  ملف 04: مساحة تخزين الصور
--
--  الحاوية خاصة (public = false): الوصول عبر روابط موقّعة قصيرة العمر فقط،
--  لا عبر رابط دائم يمكن تسريبه. صور مواقع العميل ليست محتوى عامًا.
--
--  تنظيم المسارات:  records/<record_id>/<kind>.jpg
--                   tasks/<task_id>/<kind>.jpg
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false,
  10485760,                                      -- ١٠ ميجابايت للملف
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;


-- ─── سياسات الوصول للملفات ─────────────────────────────────────────────────
-- مبسّطة عمدًا: التحكم الدقيق في جدول attachments الذي يحمل الروابط.
-- من لا يرى صف المرفق لا يعرف المسار أصلًا.

drop policy if exists att_files_read   on storage.objects;
drop policy if exists att_files_insert on storage.objects;
drop policy if exists att_files_update on storage.objects;
drop policy if exists att_files_delete on storage.objects;

create policy att_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments');

create policy att_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and owner = auth.uid());

create policy att_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and owner = auth.uid());

-- الحذف لمالك الملف أو مدير المشروع
create policy att_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or public.is_admin()));
