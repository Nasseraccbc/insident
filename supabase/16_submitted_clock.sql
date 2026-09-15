-- ============================================================================
--  ملف 16: ساعة الفني تقف عند الإرسال، وقرار المشرف يحرّكها
--
--  ملف 15 يُنفَّذ قبل هذا.
-- ============================================================================

alter table tasks add column if not exists submitted_at timestamptz;

comment on column tasks.submitted_at is
  'لحظة إرسال الفني للاعتماد — عندها يقف احتساب مهلته، فما بعدها انتظار قرار';


-- ─── ختم لحظة الإرسال على الخادم ───────────────────────────────────────────

create or replace function public.stamp_task_times()
returns trigger language plpgsql as $$
begin
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    new.started_at := coalesce(old.started_at, now());
  end if;

  -- الإرسال للاعتماد: تُختم لحظته ومنها يتوقّف احتساب مهلة الفني
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    new.submitted_at := now();
    new.started_at   := coalesce(old.started_at, now());
  end if;

  -- الإرجاع للتصحيح يُبطل الإرسال: ما عاد ينتظر قرارًا، والعمل عاد إليه
  if new.status = 'in_progress' and old.status = 'submitted' then
    new.submitted_at := null;
  end if;

  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := coalesce(old.completed_at, now());
    new.started_at   := coalesce(new.started_at, now());
  end if;

  -- ما يرسله المتصفح من أوقات لا يُعتدّ به في هذه الأعمدة
  if tg_op = 'UPDATE' and old.started_at is not null then
    new.started_at := old.started_at;
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then
    new.completed_at := old.completed_at;
  end if;

  return new;
end $$;

comment on function public.stamp_task_times is
  'ساعة المهمة من الخادم: البدء والإرسال والإنجاز تُختم هنا لا من المتصفح';


-- ─── قرار المشرف يحرّك المهمة من «أُرسل» ───────────────────────────────────

create or replace function public.review_record(
  p_record   uuid,
  p_decision text,               -- 'approve' | 'return'
  p_note     text default null
) returns records
language plpgsql security definer set search_path = public as $$
declare r records;
begin
  if not public.is_reviewer() then
    raise exception 'الاعتماد والإرجاع من صلاحية مشرف الموقع';
  end if;

  if p_decision not in ('approve', 'return') then
    raise exception 'قرار غير معروف: %', p_decision;
  end if;

  if p_decision = 'return' and coalesce(btrim(p_note), '') = '' then
    raise exception 'الإرجاع يتطلب ملاحظة تبيّن المطلوب تصحيحه';
  end if;

  select * into r from records where id = p_record;
  if not found then
    raise exception 'السجل غير موجود';
  end if;
  if r.state = 'closed' then
    raise exception 'السجل مغلق ومعتمد — لا يقبل قرارًا جديدًا';
  end if;
  if r.state <> 'sent' then
    raise exception 'السجل ليس بانتظار الاعتماد (حالته: %)', r.state;
  end if;

  perform set_config('app.review_note', coalesce(p_note, ''), true);

  update records
     set state = (case when p_decision = 'approve' then 'closed' else 'draft' end)::record_state
   where id = p_record
  returning * into r;

  perform set_config('app.review_note', '', true);

  -- المهمة تتبع القرار: تُنجَز بالاعتماد، وتعود للعمل بالإرجاع
  update tasks
     set status = (case when p_decision = 'approve' then 'done' else 'in_progress' end)::task_status
   where record_id = p_record
     and status <> 'cancelled';

  return r;
end $$;

comment on function public.review_record is
  'قرار مشرف الموقع: اعتماد السجل وإغلاقه وإنجاز مهمته، أو إرجاعه بملاحظة';
