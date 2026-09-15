-- ============================================================================
--  ملف 12: البلاغ الميداني — يرفعه الفني، ويبتّ فيه المشرف
--
--  قاعدتان تحكمان التصميم:
--    · الرفع ليس إسنادًا. البلاغ المرفوع لا يُسنَد إلى أحد ولا يبدأ عليه
--      وقت حتى يعتمده المشرف — وإلا صار كل فني يوزّع العمل على نفسه.
--    · القرار يُعلَّل. الرفض بلا سبب يترك رافع البلاغ لا يدري: أخطأ في
--      التشخيص؟ أم البلاغ مكرَّر؟ أم الأمر مجدول أصلًا؟
--
--  ملف 11 يُنفَّذ قبل هذا (قيمة pending يجب أن تكون معتمَدة قبل استعمالها).
-- ============================================================================

-- ─── أثر القرار على المهمة ─────────────────────────────────────────────────

alter table tasks add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table tasks add column if not exists reviewed_at timestamptz;
alter table tasks add column if not exists review_note text;

comment on column tasks.review_note is
  'سبب رفض البلاغ الميداني أو ملاحظة المشرف عند اعتماده — يقرؤه رافع البلاغ';

create index if not exists tasks_pending_idx on tasks (status) where status = 'pending';


-- ─── من يرفع بلاغًا ────────────────────────────────────────────────────────
-- سياسة إدراج ثانية بجانب tasks_insert (السياسات المتساهلة تُجمع بـ OR):
-- أي مستخدم مصادَق يرفع بلاغًا، لكن بهيئة واحدة لا غير — معلَّق، بلا
-- مُسنَد إليه، وبلا سجل. فلا يستطيع أحد أن يُسند لنفسه عملًا باسم بلاغ.

drop policy if exists tasks_report on tasks;
create policy tasks_report on tasks
  for insert to authenticated
  with check (
    created_by  = auth.uid()
    and status  = 'pending'
    and assigned_to is null
    and record_id   is null
  );

-- ولا يستطيع تحديثه بعد رفعه: tasks_update تشترط can_write_ops() أو أن
-- يكون هو المُسنَد إليه، والبلاغ المعلّق غير مُسنَد إلى أحد.


-- ─── قرار المشرف ───────────────────────────────────────────────────────────
-- security definer لأن الفني لا يملك تحديث بلاغه، والقرار وحده هو الذي
-- يحرّكه. الصلاحية تُفحص هنا من جديد: الواجهة تُخطئ، والقاعدة لا.

create or replace function public.review_task(
  p_task     uuid,
  p_decision text,                       -- 'approve' | 'reject'
  p_note     text     default null,
  p_assign   uuid     default null,      -- الافتراضي: رافع البلاغ نفسه
  p_form     text     default null,      -- الافتراضي: WO-01
  p_priority priority default null
) returns tasks
language plpgsql security definer set search_path = public as $$
declare tk tasks;
begin
  if not public.is_reviewer() then
    raise exception 'البتّ في البلاغات الميدانية من صلاحية مشرف الموقع';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'قرار غير معروف: %', p_decision;
  end if;

  if p_decision = 'reject' and coalesce(btrim(p_note), '') = '' then
    raise exception 'الرفض يتطلب سببًا يصل إلى رافع البلاغ';
  end if;

  select * into tk from tasks where id = p_task;
  if not found then
    raise exception 'البلاغ غير موجود';
  end if;
  if tk.status <> 'pending' then
    raise exception 'هذا البلاغ بُتَّ فيه من قبل (حالته: %)', tk.status;
  end if;

  update tasks set
    status      = (case when p_decision = 'approve' then 'assigned' else 'cancelled' end)::task_status,
    -- الاعتماد يُسنده إلى من رفعه ما لم يختر المشرف غيره: هو من رآه بعينه
    assigned_to = case when p_decision = 'approve'
                       then coalesce(p_assign, tk.created_by) end,
    form_code   = case when p_decision = 'approve'
                       then coalesce(p_form, tk.form_code, 'WO-01') else tk.form_code end,
    priority    = coalesce(p_priority, tk.priority),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_task
  returning * into tk;

  return tk;
end $$;

comment on function public.review_task is
  'قرار مشرف الموقع في بلاغ ميداني: اعتماده وإسناده، أو رفضه بسبب';

revoke all on function public.review_task(uuid, text, text, uuid, text, priority) from public;
grant execute on function public.review_task(uuid, text, text, uuid, text, priority) to authenticated;
