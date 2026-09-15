-- ============================================================================
--  ملف 13: ختم لحظة الاستجابة على الخادم
--
--  العمود responded_at موجود منذ المخطّط الأول ولم يكتبه أحد: صفر من ثلاثة
--  عشر سجلًا. ووقت الاستجابة الفعلي كان يعيش داخل data->>'rsp' — نصًّا في
--  JSON لا يُقاس عليه ولا يُرتَّب به، فلا تُبنى عليه شاشة مؤقتات.
--
--  واللحظة تُؤخذ من ساعة الخادم لا ممّا يرسله المتصفح: زمن الاستجابة رقمٌ
--  يُحتجّ به في التقرير الشهري، وساعة الجوّال تُضبط خطأً وتُغيَّر عمدًا.
--  أمّا data->>'rsp' فيبقى كما كتبه الفني — هو شهادته الميدانية، والعمود
--  هو القياس. اختلافهما بذاته دليل يُراجَع لا خطأ يُخفى.
-- ============================================================================

create or replace function public.stamp_responded()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(btrim(new.data->>'rsp'), '') <> '' then
      new.responded_at := now();
    end if;
    return new;
  end if;

  -- أول ظهور لوقت الاستجابة في النموذج هو لحظة الختم
  if coalesce(btrim(new.data->>'rsp'), '') <> ''
     and coalesce(btrim(old.data->>'rsp'), '') = '' then
    new.responded_at := coalesce(old.responded_at, now());
  end if;

  -- ومتى خُتم لا يُعاد: لا بمسح الحقل ولا بقيمة من المتصفح
  if old.responded_at is not null then
    new.responded_at := old.responded_at;
  end if;

  return new;
end $$;

comment on function public.stamp_responded is
  'لحظة الاستجابة من ساعة الخادم عند أول تسجيل لوقت الاستجابة في النموذج';

drop trigger if exists trg_records_responded on records;
create trigger trg_records_responded
  before insert or update on records
  for each row execute function public.stamp_responded();

create index if not exists records_sla_open_idx
  on records (sla_close_due)
  where state <> 'closed' and sla_close_due is not null;
