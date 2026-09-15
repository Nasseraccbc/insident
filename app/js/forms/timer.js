/* ============================================================================
   مؤقّت اتفاقية مستوى الخدمة داخل نموذج البلاغ.

   يبدأ العدّ من لحظة فتح البلاغ: تاريخ ووقت التسجيل يُختمان تلقائيًا عند
   الفتح (كما كان في النموذج القديم: حقول "Auto")، ومنهما تُحتسب المواعيد.

   جدول الأزمنة بالدقائق منقول حرفيًا من النظام القديم (slaRules):

     التصنيف     الاستجابة   بدء المعالجة   الإنجاز
     طارئ            ١٥          فورًا        ١٢٠
     عالي            ٣٠           ٦٠          ٤٨٠
     متوسط          ١٢٠          ٢٤٠        ١٤٤٠
     منخفض         ١٤٤٠         ١٤٤٠        ٤٣٢٠

   هذا العدّاد مرآة للفني في الميدان. أما المرجع الرسمي في التقارير ولوحة
   المؤشرات فهو عمودا sla_response_due و sla_close_due اللذان تحسبهما
   القاعدة من طابعها الزمني — لا من ساعة المتصفح التي قد تكون مضبوطة خطأ.
   ============================================================================ */

import { lang, fmtDur } from "../i18n.js";
import { el } from "../ui.js";

const RULES = {
  "طارئ":   { resp: 15,   start: 0,    fin: 120 },
  "عالي":   { resp: 30,   start: 60,   fin: 480 },
  "متوسط":  { resp: 120,  start: 240,  fin: 1440 },
  "منخفض":  { resp: 1440, start: 1440, fin: 4320 },
};

const L = (ar, en) => (lang === "ar" ? ar : en);

/* تصنيف البلاغ في النموذج أربع درجات، وعمود الأولوية في القاعدة ثلاث
   (الكراسة أسقطت «منخفض»). بلا هذه الخريطة يبقى العمود فارغًا فلا تحسب
   القاعدة مواعيد SLA ولا تظهر البلاغات في مؤشرات الالتزام. */
const PRIORITY = { "طارئ": "critical", "عالي": "high", "متوسط": "medium", "منخفض": "medium" };

/** مهلة الإنجاز بالدقائق حسب أولوية القاعدة — هي الثالثة من الأوقات
    الثلاثة ذاتها، حتى لا تختلف البطاقة عن النموذج. */
export const CLOSE_MIN = { critical: 120, high: 480, medium: 1440 };

/** التصنيف المقابل لأولوية القاعدة — لتعبئة البلاغ القادم من مهمة. */
export const CLASS_OF = { critical: "طارئ", high: "عالي", medium: "متوسط" };

/** أولوية القاعدة المقابلة لتصنيف البلاغ، أو null إن لم يُختر بعد. */
export function priorityOf(form, data) {
  if (!form.timer) return null;
  return PRIORITY[data.cls] || null;
}

/** رقم بلاغ مقروء: REP-YYYYMMDD-HHMM كما في النظام القديم. */
export function makeRef(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `REP-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * يختم لحظة الفتح في حقول البلاغ الفارغة — وبها يبدأ العدّ.
 * يُرجع true إن غيّر شيئًا.
 */
export function stampOpen(form, data, at) {
  const t = form.timer;
  if (!t) return false;
  const now = at instanceof Date && !isNaN(at) ? at : new Date();
  const p = (n) => String(n).padStart(2, "0");
  let touched = false;

  const set = (k, v) => {
    if (k && !String(data[k] ?? "").trim()) { data[k] = v; touched = true; }
  };
  set(t.dateField, `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`);
  set(t.timeField, `${p(now.getHours())}:${p(now.getMinutes())}`);
  set("no", makeRef(now));

  return touched;
}

/** لحظة التسجيل من حقلي التاريخ والوقت، أو null إن نقص أحدهما. */
function regMoment(form, data) {
  const t = form.timer;
  const d = data[t.dateField], tm = data[t.timeField];
  if (!d || !tm) return null;
  const at = new Date(`${d}T${tm}`);
  return isNaN(at) ? null : at;
}

/* عدّاد حقيقي ينزل ثانية بثانية: hh:mm:ss، وبإشارة سالبة عند التجاوز.
   «14 د» رقم جامد لا يُشعر الفني بمرور الوقت. */
const fmtLeft = (ms) => fmtDur(ms);

const fmtTarget = (min) =>
  min === 0 ? L("فورًا", "immediate")
  : min < 60 ? `${min} ${L("دقيقة", "min")}`
  : min % 60 === 0 ? `${min / 60} ${L("ساعة", "h")}`
  : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/**
 * لوحة المؤقّت. تُرجع { node, stop } — الإيقاف مسؤولية الشاشة وإلا بقي
 * المؤقّت يعمل بعد مغادرتها ويستهلك بطارية الجوّال.
 */
export function slaPanel(form, data, { stoppedAt, onStamp } = {}) {
  const node = el("div", { class: "sla-card" });
  let timerId = null;
  const frozen = stoppedAt ? new Date(stoppedAt).getTime() : null;

  function draw() {
    const cls = data.cls;
    const rules = RULES[cls];
    const reg = regMoment(form, data);

    if (!rules) {
      node.replaceChildren(el("div", { class: "sla-hint small",
        text: L("اختر «تصنيف البلاغ» ليبدأ احتساب أزمنة الاستجابة والإنجاز.",
                "Pick a request classification to start the response and completion clocks.") }));
      return;
    }
    if (!reg) {
      node.replaceChildren(el("div", { class: "sla-hint small",
        text: L("أكمل تاريخ ووقت التسجيل ليبدأ العدّ.",
                "Fill the registration date and time to start the clock.") }));
      return;
    }

    const now = frozen || Date.now();
    const boxes = (form.timer.steps || []).map((st) => {
      const min = rules[st.sla];
      const due = reg.getTime() + min * 60000;
      const done = String(data[st.field] ?? "").trim();

      /* أُنجزت الخطوة: نقارن وقتها الفعلي بالموعد بدل مواصلة العدّ */
      if (done) {
        const at = new Date(`${data[form.timer.dateField]}T${done}`);
        const ok = !isNaN(at) && at.getTime() <= due;
        return el("div", { class: "sla-box " + (ok ? "ok" : "late") },
          el("div", { class: "sla-l", text: lang === "ar" ? st.l : st.en || st.l }),
          el("div", { class: "sla-v", text: done }),
          el("div", { class: "sla-n",
            text: ok ? L("داخل المهلة ✓", "within SLA") : L("تجاوز المهلة", "SLA missed") })
        );
      }

      /* زرّ يختم اللحظة بدل أن يكتبها الفني بيده: هو في الميدان وربما
         بقفاز، وكتابة الوقت يدويًا تُغري بالتقريب أو التزوير اللاحق. */
      const stampBtn = onStamp && !frozen
        ? el("button", {
            class: "btn btn-sm sla-btn", type: "button",
            onclick: () => {
              const n = new Date();
              const p2 = (x) => String(x).padStart(2, "0");
              onStamp(st.field, `${p2(n.getHours())}:${p2(n.getMinutes())}`);
            },
          }, L("سجّل الآن", "Stamp now"))
        : null;

      /* مهلة «فورًا» صفر دقيقة، فعدّها التنازلي يبدأ متأخرًا من اللحظة
         الأولى ويُنذر بلا سبب. تُعرض مطلبًا قائمًا لا تأخيرًا. */
      if (min === 0) {
        return el("div", { class: "sla-box warn" },
          el("div", { class: "sla-l", text: lang === "ar" ? st.l : st.en || st.l }),
          el("div", { class: "sla-v", text: L("فورًا", "Immediate") }),
          el("div", { class: "sla-n", text: L("ابدأ فور الاستجابة", "Start as soon as you respond") }),
          stampBtn
        );
      }

      const left = due - now;
      const state = left < 0 ? "late" : left < Math.max(60000, min * 60000 * 0.25) ? "warn" : "run";
      return el("div", { class: "sla-box " + state + (frozen ? " frozen" : "") },
        el("div", { class: "sla-l", text: lang === "ar" ? st.l : st.en || st.l }),
        el("div", { class: "sla-v mono", text: fmtLeft(left) }),
        el("div", { class: "sla-n",
          text: frozen ? L("توقّف عند الإرسال", "stopped at submission")
                       : (left < 0 ? L("تأخّر عن ", "over by ") : L("متبقٍ من ", "left of ")) + fmtTarget(min) }),
        stampBtn
      );
    });

    node.replaceChildren(
      el("div", { class: "sla-head small",
        text: frozen
          ? L(`توقّف العدّ — البلاغ أُرسل. بدأ من ${data[form.timer.timeField]}`,
              `Clock stopped — request submitted. Started ${data[form.timer.timeField]}`)
          : L(`بدأ العدّ من ${data[form.timer.timeField]} — تصنيف: ${cls}`,
              `Counting from ${data[form.timer.timeField]} — class: ${cls}`) }),
      el("div", { class: "sla-grid" }, ...boxes)
    );
  }

  draw();
  // ثانية بثانية: المطلوب عدّاد يُرى نزوله لا رقم يتغيّر كل نصف دقيقة
  if (!frozen) timerId = setInterval(draw, 1000);

  return { node, refresh: draw, stop: () => clearInterval(timerId) };
}
