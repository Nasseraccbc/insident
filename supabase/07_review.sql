-- ============================================================================
--  ملف 07: الاعتماد والإرجاع — من مشرف الموقع وحده
--
--  القرار (طلب العميل): الاعتماد والملاحظات تصدر من عمّار (مشرف الموقع) فقط.
--  فيصل وخلف يرون كل شيء ولا يكتبون شيئًا.
--
--  فالمسار انكمش من ست مراحل إلى ثلاث تُستعمل فعليًا:
--      مسودة ──إرسال──> بانتظار الاعتماد ──اعتماد──> مغلق ومعتمد
--                              └────إرجاع بملاحظة────> مسودة
--
--  المراحل الثلاث الباقية (review · approved · client) تبقى في النوع ولا
--  تُستعمل: حذف قيمة من enum لا رجعة فيه، وقد يعود المسار الطويل لاحقًا.
-- ============================================================================

-- ─── من يكتب ومن يشاهد ─────────────────────────────────────────────────────
-- can_see_all() تعني «يرى الكل» وكانت تُستعمل أيضًا بمعنى «يكتب»، فورث ممثل
-- الهيئة صلاحية تعديل لم تُقصد له. الرؤية شيء والكتابة شيء آخر.

create or replace function public.can_write_ops()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(
       (select role in ('admin','supervisor') from profiles where id = auth.uid()),
       false) $$;

comment on function public.can_write_ops is
  'يكتب في السجلات والمهام: مدير المشروع ومشرف الموقع — لا ممثل الهيئة';

/**
 * المعتمِد: مشرف الموقع صاحب القرار، ومدير المشروع معه مخرجًا إداريًا
 * لا يتوقف العمل بغيابه. الواجهة تُظهر الأزرار للمشرف وحده.
 */
create or replace function public.is_reviewer()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(
       (select role in ('supervisor','admin') from profiles where id = auth.uid()),
       false) $$;


-- ─── الملاحظة ترافق الانتقال ───────────────────────────────────────────────
-- المشغّل هو الكاتب الوحيد في سجل التاريخ (وإلا زُوِّر)، فلا سبيل لتمرير
-- ملاحظة معه إلا عبر إعداد محصور بالمعاملة يقرؤه عند الكتابة.

create or replace function public.log_state_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into record_history (record_id, from_state, to_state, by_user)
    values (new.id, null, new.state, new.created_by);
  elsif new.state is distinct from old.state then
    insert into record_history (record_id, from_state, to_state, by_user, note)
    values (new.id, old.state, new.state, auth.uid(),
            nullif(btrim(coalesce(current_setting('app.review_note', true), '')), ''));
  end if;
  return new;
end $$;


-- ─── قرار الاعتماد ─────────────────────────────────────────────────────────

/**
 * قرار واحد على سجل واحد: اعتماد أو إرجاع بملاحظة.
 *
 * دالة لا تعديلًا مباشرًا من المتصفح، لأن ثلاثة شروط يجب أن تُفحص معًا
 * ولا تُترك للواجهة: الصلاحية · أن السجل فعلًا بانتظار الاعتماد · أن
 * الإرجاع لا يمرّ بلا ملاحظة. الواجهة تُخطئ أو تُتجاوز؛ القاعدة لا.
 */
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

  -- الإرجاع بلا سبب يترك الفني يخمّن ما المطلوب إصلاحه
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

  -- لا تتسرّب الملاحظة إلى انتقال آخر في المعاملة ذاتها
  perform set_config('app.review_note', '', true);
  return r;
end $$;

comment on function public.review_record is
  'قرار مشرف الموقع: اعتماد السجل وإغلاقه، أو إرجاعه للفني بملاحظة';

revoke all on function public.review_record(uuid, text, text) from public;
grant execute on function public.review_record(uuid, text, text) to authenticated;


-- ─── إحكام الكتابة: ممثل الهيئة يرى ولا يكتب ───────────────────────────────

drop policy if exists records_update on records;
create policy records_update on records
  for update to authenticated
  using (
    public.is_admin()
    or (
      state <> 'closed'
      and (public.can_write_ops() or assigned_to = auth.uid() or created_by = auth.uid())
    )
  )
  with check (
    public.is_admin()
    or public.can_write_ops()
    or assigned_to = auth.uid()
    or created_by  = auth.uid()
  );

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks
  for insert to authenticated
  with check (public.can_write_ops() and created_by = auth.uid());

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks
  for update to authenticated
  using (public.can_write_ops() or assigned_to = auth.uid())
  with check (public.can_write_ops() or assigned_to = auth.uid());
