-- ============================================================================
--  ملف 10: قرار المشرف يحرّك المهمة معه
--
--  العلّة: الفني يرسل البلاغ فتُعلَّم مهمته «منجزة» فورًا، قبل أن يراه
--  المشرف. فإذا أرجعه المشرف للتصحيح عاد السجل مسودة بينما المهمة باقية
--  «منجزة» — فلا تظهر في قائمة الفني ولا يدري أن عليه عملًا.
--
--  القاعدة الصحيحة: الإنجاز يقرّره المعتمِد لا مقدّم العمل.
--      يرسل الفني  → المهمة «قيد التنفيذ» والسجل «بانتظار الاعتماد»
--      يعتمد المشرف → المهمة «منجزة»
--      يُرجع المشرف → المهمة تبقى «قيد التنفيذ» ومعها ملاحظته
-- ============================================================================

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

  -- المهمة المرتبطة تتبع القرار: تُنجَز بالاعتماد، وتعود للعمل بالإرجاع
  update tasks
     set status = (case when p_decision = 'approve' then 'done' else 'in_progress' end)::task_status
   where record_id = p_record
     and status <> 'cancelled';

  return r;
end $$;

comment on function public.review_record is
  'قرار مشرف الموقع: اعتماد السجل وإغلاقه وإنجاز مهمته، أو إرجاعه بملاحظة';
