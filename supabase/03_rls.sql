-- ============================================================================
--  ملف 03: سياسات أمان الصفوف (RLS)
--
--  المبدأ: كل جدول عليه RLS مُفعّل. جدول بلا سياسة = ممنوع على الجميع،
--  وهذا هو السلوك الافتراضي المطلوب — نفتح بوعي لا نغلق بعد فوات الأوان.
--
--  خريطة الوصول:
--    admin       مدير المشروع   كل شيء + اعتماد تشغيلي
--    compliance  ممثل الهيئة    قراءة الكل + اعتماد نهائي
--    supervisor  مشرف تشغيلي    قراءة الكل + إنشاء المهام وتوزيعها
--    technician  فني            المسند إليه فقط
--    employee    موظف           ما أنشأه هو فقط
-- ============================================================================

alter table profiles       enable row level security;
alter table assets         enable row level security;
alter table records        enable row level security;
alter table record_history enable row level security;
alter table tasks          enable row level security;
alter table attachments    enable row level security;


-- ─── profiles ──────────────────────────────────────────────────────────────
-- الجميع يقرأ: لازم لقوائم الإسناد وعرض أسماء المنفّذين.
-- الكتابة للمدير فقط — الأدوار لا تُمنح ذاتيًا.

drop policy if exists profiles_read      on profiles;
drop policy if exists profiles_self_edit on profiles;
drop policy if exists profiles_admin_all on profiles;

create policy profiles_read on profiles
  for select to authenticated using (true);

-- يعدّل بياناته الشخصية فقط — والدور محروس بمشغّل أدناه
create policy profiles_self_edit on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_all on profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- حارس: منع رفع النفس إلى دور أعلى عبر سياسة التعديل الذاتي.
-- auth.uid() الفارغ يعني سياقًا خادميًا (SQL مباشر أو service_role) وهو
-- مميّز أصلًا ويتجاوز RLS كله — فلا معنى لحجبه هنا. الحارس موجّه لطلبات
-- المستخدمين المسجّلين فقط، وهي وحدها القادرة على إساءة الاستخدام.
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role or new.specialty is distinct from old.specialty)
     and not public.is_admin() then
    raise exception 'تغيير الدور أو التخصص يتطلب صلاحية مدير المشروع';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on profiles;
create trigger trg_profiles_guard before update on profiles
  for each row execute function public.guard_role_change();


-- ─── assets ────────────────────────────────────────────────────────────────

drop policy if exists assets_read      on assets;
drop policy if exists assets_admin_all on assets;

create policy assets_read on assets
  for select to authenticated using (true);

create policy assets_admin_all on assets
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ─── records ───────────────────────────────────────────────────────────────

drop policy if exists records_read   on records;
drop policy if exists records_insert on records;
drop policy if exists records_update on records;
drop policy if exists records_delete on records;

-- الفني يرى المسند إليه وما أنشأه؛ الموظف ما أنشأه فقط
create policy records_read on records
  for select to authenticated
  using (
    public.can_see_all()
    or assigned_to = auth.uid()
    or created_by  = auth.uid()
  );

create policy records_insert on records
  for insert to authenticated
  with check (created_by = auth.uid());

-- التعديل ممنوع بعد الإغلاق إلا على المدير — السجل المغلق وثيقة معتمدة
create policy records_update on records
  for update to authenticated
  using (
    public.is_admin()
    or (
      state <> 'closed'
      and (public.can_see_all() or assigned_to = auth.uid() or created_by = auth.uid())
    )
  )
  with check (
    public.is_admin()
    or public.can_see_all()
    or assigned_to = auth.uid()
    or created_by  = auth.uid()
  );

create policy records_delete on records
  for delete to authenticated using (public.is_admin());


-- ─── record_history ────────────────────────────────────────────────────────
-- قراءة فقط. الكتابة حصرًا عبر المشغّل (security definer) فلا يُزوَّر السجل.

drop policy if exists history_read on record_history;

create policy history_read on record_history
  for select to authenticated
  using (
    public.can_see_all()
    or exists (
      select 1 from records r
       where r.id = record_history.record_id
         and (r.assigned_to = auth.uid() or r.created_by = auth.uid())
    )
  );


-- ─── tasks ─────────────────────────────────────────────────────────────────

drop policy if exists tasks_read     on tasks;
drop policy if exists tasks_insert   on tasks;
drop policy if exists tasks_update   on tasks;
drop policy if exists tasks_delete   on tasks;

create policy tasks_read on tasks
  for select to authenticated
  using (public.can_see_all() or assigned_to = auth.uid() or created_by = auth.uid());

-- الإنشاء والتوزيع للمشرف فما فوق
create policy tasks_insert on tasks
  for insert to authenticated
  with check (public.can_see_all() and created_by = auth.uid());

-- الفني يحدّث حالة مهمته؛ المشرف يحدّث كل شيء
create policy tasks_update on tasks
  for update to authenticated
  using (public.can_see_all() or assigned_to = auth.uid())
  with check (public.can_see_all() or assigned_to = auth.uid());

create policy tasks_delete on tasks
  for delete to authenticated using (public.is_admin());


-- ─── attachments ───────────────────────────────────────────────────────────
-- الوصول يتبع السجل أو المهمة الأب

drop policy if exists att_read   on attachments;
drop policy if exists att_insert on attachments;
drop policy if exists att_delete on attachments;

create policy att_read on attachments
  for select to authenticated
  using (
    public.can_see_all()
    or uploaded_by = auth.uid()
    or exists (select 1 from records r where r.id = attachments.record_id
                 and (r.assigned_to = auth.uid() or r.created_by = auth.uid()))
    or exists (select 1 from tasks t where t.id = attachments.task_id
                 and (t.assigned_to = auth.uid() or t.created_by = auth.uid()))
  );

create policy att_insert on attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid());

create policy att_delete on attachments
  for delete to authenticated
  using (public.is_admin() or uploaded_by = auth.uid());
