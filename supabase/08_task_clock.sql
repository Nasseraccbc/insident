-- ============================================================================
--  ملف 08: ساعة المهمة على الخادم
--
--  المطلوب: أول ما يفتح الفني البلاغ يبدأ التوقيت. ولحظة البدء دليل يُحتجّ
--  به عند قياس زمن الاستجابة، فلا تُؤخذ من ساعة الجوّال — قد تكون مضبوطة
--  خطأ أو مُغيَّرة عمدًا. المشغّل يفرض ساعة الخادم مهما أرسل المتصفح.
-- ============================================================================

create or replace function public.stamp_task_times()
returns trigger language plpgsql as $$
begin
  -- بدء التنفيذ: يُختم مرّة واحدة ولا يُعاد لو رجعت الحالة وتقدّمت
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    new.started_at := coalesce(old.started_at, now());
  end if;

  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := coalesce(old.completed_at, now());
    -- أُنجزت دون أن تُفتح: نختم البدء أيضًا حتى لا يبقى فارغًا
    new.started_at := coalesce(new.started_at, now());
  end if;

  -- ما يرسله المتصفح من أوقات لا يُعتدّ به في هذين العمودين
  if tg_op = 'UPDATE' and old.started_at is not null then
    new.started_at := old.started_at;
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then
    new.completed_at := old.completed_at;
  end if;

  return new;
end $$;

comment on function public.stamp_task_times is
  'ساعة المهمة من الخادم: بدء التنفيذ والإنجاز يُختمان هنا لا من المتصفح';

drop trigger if exists trg_task_times on tasks;
create trigger trg_task_times
  before update on tasks
  for each row execute function public.stamp_task_times();
