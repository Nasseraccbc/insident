-- ============================================================================
--  نظام إدارة التشغيل والصيانة — SCE-2026-0119
--  ملف 01: الأنواع والجداول والفهارس
--
--  آمن لإعادة التشغيل: كل شيء بـ if not exists
-- ============================================================================

-- ─── الأنواع المعدودة ───────────────────────────────────────────────────────

do $$ begin
  create type user_role as enum (
    'admin',        -- مدير المشروع — كل الصلاحيات + اعتماد تشغيلي
    'compliance',   -- ممثل الهيئة — اعتماد نهائي
    'supervisor',   -- مشرف تشغيلي — إنشاء المهام وتوزيعها
    'technician',   -- فني ميداني — مهامه فقط
    'employee'      -- موظف — خدمة ذاتية فقط
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type specialty as enum (
    'electrical',   -- كهرباء
    'plumbing',     -- سباكة
    'hvac',         -- تكييف وتبريد
    'hospitality',  -- ضيافة
    'cleaning'      -- نظافة
  );
exception when duplicate_object then null; end $$;

-- مسار الاعتماد الست مراحل
do $$ begin
  create type record_state as enum (
    'draft',     -- مسودة
    'sent',      -- مُرسل لمشرف الموقع
    'review',    -- قيد مراجعة مدير المشروع
    'approved',  -- معتمد داخليًا
    'client',    -- مرفوع لممثل الهيئة
    'closed'     -- مغلق ومعتمد
  );
exception when duplicate_object then null; end $$;

-- ثلاثة مستويات فقط — راجع PROJECT-SPEC.md §7
do $$ begin
  create type priority as enum ('critical', 'high', 'medium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('new', 'assigned', 'in_progress', 'done', 'cancelled');
exception when duplicate_object then null; end $$;


-- ─── المستخدمون ─────────────────────────────────────────────────────────────
-- مرتبط بـ auth.users: الهوية والمصادقة هناك، والدور والتخصص هنا

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text        not null,
  full_name_en text,
  email        text,
  role         user_role   not null default 'employee',
  specialty    specialty,                      -- للفنيين فقط
  phone        text,
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is 'المستخدمون وأدوارهم — مرتبط بـ auth.users';


-- ─── الأصول الكهربائية (٢٤ أصلاً لنموذج QA-02-EL) ──────────────────────────

create table if not exists assets (
  id        bigint generated always as identity primary key,
  code      text not null unique,
  name_ar   text not null,
  name_en   text not null,
  category  text not null default 'electrical',
  location  text,
  sort      int  not null default 0,
  active    boolean not null default true
);

comment on table assets is 'الأصول القابلة للفحص — ٢٤ أصلاً كهربائيًا';


-- ─── السجلات: صف لكل نموذج معبّأ ───────────────────────────────────────────
-- الحقول التي تُفلتر وتُحسب عليها اللوحة = أعمدة حقيقية مفهرسة.
-- ما يختلف بين نموذج وآخر = داخل data (JSONB).

create table if not exists records (
  id               uuid primary key default gen_random_uuid(),
  form_code        text not null,               -- WO-01 · HSE-03 · QA-02-EL …
  seq              bigint generated always as identity,
  ref_no           text,                        -- رقم مقروء للبشر
  state            record_state not null default 'draft',
  priority         priority,
  title            text,
  location         text,

  created_by       uuid references profiles(id) on delete set null,
  assigned_to      uuid references profiles(id) on delete set null,

  -- مواعيد SLA تُحتسب على الخادم لا في المتصفح
  responded_at     timestamptz,
  sla_response_due timestamptz,
  sla_close_due    timestamptz,
  closed_at        timestamptz,

  data             jsonb not null default '{}'::jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table records is 'سجل لكل نموذج معبّأ — الحقول المتغيرة في data';
comment on column records.data is 'حقول النموذج المتغيرة حسب form_code';

create index if not exists records_form_idx     on records (form_code);
create index if not exists records_state_idx    on records (state);
create index if not exists records_assigned_idx on records (assigned_to);
create index if not exists records_creator_idx  on records (created_by);
create index if not exists records_created_idx  on records (created_at desc);
create index if not exists records_priority_idx on records (priority) where priority is not null;
create index if not exists records_data_gin     on records using gin (data);


-- ─── سجل مسار الاعتماد ─────────────────────────────────────────────────────

create table if not exists record_history (
  id         bigint generated always as identity primary key,
  record_id  uuid not null references records(id) on delete cascade,
  from_state record_state,
  to_state   record_state not null,
  by_user    uuid references profiles(id) on delete set null,
  note       text,
  at         timestamptz not null default now()
);

comment on table record_history is 'كل انتقال في مسار الاعتماد — من · إلى · مَن · متى';

create index if not exists history_record_idx on record_history (record_id, at desc);


-- ─── المهام التي ينشئها المشرف ويوزّعها ────────────────────────────────────

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity,
  title        text not null,
  description  text,
  specialty    specialty,                    -- يُستخدم لتجميع قائمة الفنيين
  priority     priority    not null default 'medium',
  status       task_status not null default 'new',

  assigned_to  uuid references profiles(id) on delete set null,
  created_by   uuid references profiles(id) on delete set null,

  form_code    text,                         -- النموذج المطلوب تعبئته
  record_id    uuid references records(id) on delete set null,

  location     text,
  due_at       timestamptz,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table tasks is 'مهام ينشئها المشرف ويوزّعها يدويًا على الفنيين';

create index if not exists tasks_assigned_idx on tasks (assigned_to);
create index if not exists tasks_status_idx   on tasks (status);
create index if not exists tasks_created_idx  on tasks (created_at desc);


-- ─── المرفقات: الملفات في Storage والبيانات الوصفية هنا ────────────────────

create table if not exists attachments (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid references records(id) on delete cascade,
  task_id      uuid references tasks(id)   on delete cascade,
  kind         text,                        -- before · during · after
  storage_path text not null,
  mime         text,
  size_bytes   integer,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint attachments_parent_ck check (record_id is not null or task_id is not null)
);

comment on table attachments is 'صور وملفات — المسار يشير إلى Supabase Storage';

create index if not exists att_record_idx on attachments (record_id);
create index if not exists att_task_idx   on attachments (task_id);
