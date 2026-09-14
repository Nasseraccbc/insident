-- ============================================================================
--  ملف 02: الدوال والمشغّلات
-- ============================================================================

-- ─── دوال مساعدة للصلاحيات ─────────────────────────────────────────────────
-- security definer ضروري: تقرأ من profiles التي عليها RLS، وبدونه يقع
-- تكرار لا نهائي (السياسة تستدعي الدالة التي تقرأ الجدول الذي عليه السياسة).
-- search_path مثبّت لمنع اختطاف الدالة عبر مخطط وهمي.

create or replace function public.my_role()
returns user_role
language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create or replace function public.my_specialty()
returns specialty
language sql stable security definer set search_path = public
as $$ select specialty from profiles where id = auth.uid() $$;

-- يرى كل السجلات: مدير المشروع · ممثل الهيئة · المشرف التشغيلي
create or replace function public.can_see_all()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(
       (select role in ('admin','compliance','supervisor') from profiles where id = auth.uid()),
       false) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from profiles where id = auth.uid()), false) $$;


-- ─── تحديث updated_at تلقائيًا ─────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_profiles_touch on profiles;
create trigger trg_profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_records_touch on records;
create trigger trg_records_touch before update on records
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_tasks_touch on tasks;
create trigger trg_tasks_touch before update on tasks
  for each row execute function public.touch_updated_at();


-- ─── احتساب مواعيد SLA على الخادم ──────────────────────────────────────────
-- المصدر الوحيد للحقيقة. ساعة المتصفح غير موثوقة ويمكن تغييرها.
--   حرج   ١٥ دقيقة / ساعتان
--   عالي  ٣٠ دقيقة / ٨ ساعات
--   متوسط ساعتان   / ٢٤ ساعة

create or replace function public.compute_sla()
returns trigger language plpgsql as $$
declare base timestamptz;
begin
  if new.priority is null then
    new.sla_response_due := null;
    new.sla_close_due    := null;
    return new;
  end if;

  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    base := coalesce(new.created_at, now());
    new.sla_response_due := base + case new.priority
      when 'critical' then interval '15 minutes'
      when 'high'     then interval '30 minutes'
      when 'medium'   then interval '2 hours'
    end;
    new.sla_close_due := base + case new.priority
      when 'critical' then interval '2 hours'
      when 'high'     then interval '8 hours'
      when 'medium'   then interval '24 hours'
    end;
  end if;

  return new;
end $$;

drop trigger if exists trg_records_sla on records;
create trigger trg_records_sla before insert or update of priority on records
  for each row execute function public.compute_sla();


-- ─── ختم وقت الإغلاق ───────────────────────────────────────────────────────

create or replace function public.stamp_closed()
returns trigger language plpgsql as $$
begin
  if new.state = 'closed' and (old.state is distinct from 'closed') then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.state <> 'closed' then
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_records_closed on records;
create trigger trg_records_closed before update of state on records
  for each row execute function public.stamp_closed();


-- ─── تسجيل انتقالات مسار الاعتماد تلقائيًا ─────────────────────────────────
-- في القاعدة لا في المتصفح: لا يمكن تخطّي السجل ولو عُدّل الصف من أي مكان.

create or replace function public.log_state_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into record_history (record_id, from_state, to_state, by_user)
    values (new.id, null, new.state, new.created_by);
  elsif new.state is distinct from old.state then
    insert into record_history (record_id, from_state, to_state, by_user)
    values (new.id, old.state, new.state, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_records_history on records;
create trigger trg_records_history after insert or update of state on records
  for each row execute function public.log_state_change();


-- ─── إنشاء ملف تعريف تلقائيًا عند إضافة مستخدم ─────────────────────────────
-- يضمن أن كل مستخدم في auth.users له صف في profiles دائمًا.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'employee')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
