/* ============================================================================
   مؤقتات مستوى الخدمة — شاشة اللحظة لا شاشة التقرير.

   لوحة التشغيل تقول «٨٧٪ التزام خلال أربعة عشر يومًا»: حكمٌ على ما مضى.
   وهذه تقول «هذان بلاغان يتجاوزان مهلتهما خلال نصف ساعة»: موضع التدخّل
   الآن. بغيرها يُكتشف الإخلال بعد وقوعه — في تقرير آخر الشهر.

   المهلة تبدأ حين يفتح الفني البلاغ (قرار متّفق عليه). وهذا يترك ثغرة:
   بلاغٌ لم يُفتح لا ساعة عليه مهما طال. فأوّل ما تعرضه الشاشة هو ما لم
   يبدأ بعد — الخطر يسكن حيث لا مؤقّت.
   ============================================================================ */

import { sla, profiles } from "../db.js";
import { CLOSE_MIN } from "../forms/timer.js";
import { t, lang, fmtStamp, fmtDur } from "../i18n.js";
import {
  el, pageHead, empty, loading, liveTimer, priorityBadge, select, stat,
} from "../ui.js";

const L = (ar, en) => (lang === "ar" ? ar : en);
const ORDER = { critical: 0, high: 1, medium: 2 };

/** مهلة الاستجابة بالدقائق — من الكراسة نفسها التي تحسب بها القاعدة. */
const RESP_MIN = { critical: 15, high: 30, medium: 120 };

export async function slaView(page, state) {
  const host = el("div", {});
  page.append(
    pageHead(t("navSla"),
             L("ما الذي يوشك أن يتجاوز مهلته الآن", "What is about to breach its deadline now")),
    host
  );
  host.append(loading());

  const timers = [];
  let poll = null;
  const stopAll = () => {
    timers.forEach((x) => x.stop());
    timers.length = 0;
    clearInterval(poll);
  };

  let rows = [], closed = [], people = {}, read = new Map();
  let fPrio = "", fTech = "";

  async function fetchAll() {
    const [open, done, list] = await Promise.all([
      sla.open(),
      sla.closed(),
      profiles.all().catch(() => []),
    ]);
    rows = open;
    closed = done.filter((r) => r.closed_at && r.sla_close_due
                                && new Date(r.closed_at) > new Date(r.sla_close_due));
    people = Object.fromEntries(list.map((p) => [p.id, p.full_name || p.email]));
    read = new Map(rows.map((r) => [r.id, reading(r)]));
  }

  try { await fetchAll(); }
  catch (err) {
    host.replaceChildren(empty(L("تعذّر التحميل", "Could not load"), err.message, "⚠"));
    return stopAll;
  }

  /* التصنيف يُحسب عند القراءة، فصفٌّ عبَر من «ضمن المهلة» إلى «متجاوِز»
     يبقى في مكانه حتى تُقرأ الشاشة من جديد. وشاشةُ اللحظة لا تُترك بائتة
     على مكتب مفتوح طول النهار، فتُحدّث نفسها كل دقيقة. */
  poll = setInterval(async () => {
    try { await fetchAll(); draw(); } catch { /* شبكة متقطّعة: تُحاول لاحقًا */ }
  }, 60000);

  /* ─── تصنيف كل مهمة ──────────────────────────────────────────────────── */
  /* المهلة نفسها التي تعرضها البطاقة والنموذج — لا ساعة رابعة تخالفهما. */

  function reading(task) {
    const mins = CLOSE_MIN[task.priority];

    if (task.status === "pending") {
      return { bucket: "idle", since: task.created_at,
               why: L("بانتظار اعتمادك", "awaiting your approval") };
    }
    /* «لم يبدأ» ليست حالة واحدة: سببها هو ما يحدّد من يتحرّك. ولهذا تُفصَل
       — بلاغ بلا فنيّ ينتظر قرارك، وبلاغ مُسنَد لم يُفتح ينتظر فنيَّه. */
    if (!task.assigned_to) {
      return { bucket: "idle", since: task.created_at,
               why: L("غير مسند إلى فني", "not assigned to a technician") };
    }
    if (!task.started_at) {
      return { bucket: "idle", since: task.created_at,
               why: L("مُسنَد ولم يفتحه الفني بعد", "assigned but not yet opened") };
    }
    if (!mins) {
      return { bucket: "idle", since: task.created_at,
               why: L("بلا أولوية — لا مهلة محسوبة", "no priority — no deadline computed") };
    }

    const due = new Date(task.started_at).getTime() + mins * 60000;
    const left = due - Date.now();
    const bucket = left < 0 ? "late" : left < mins * 60000 * 0.25 ? "soon" : "ok";
    return { bucket, due: new Date(due).toISOString(), mins };
  }


  /* ─── التصفية ────────────────────────────────────────────────────────── */

  function visible() {
    return rows.filter((r) =>
      (!fPrio || r.priority === fPrio) &&
      (!fTech || r.assigned_to === fTech));
  }

  function filters() {
    const prio = select(
      [{ value: "", label: L("كل الأولويات", "All priorities") },
       ...["critical", "high", "medium"].map((p) => ({ value: p, label: t("pr_" + p) }))],
      { value: fPrio, onchange: (e) => { fPrio = e.target.value; draw(); } });

    const ids = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))];
    const tech = select(
      [{ value: "", label: L("كل الفنيين", "All technicians") },
       ...ids.map((id) => ({ value: id, label: people[id] || "—" }))],
      { value: fTech, onchange: (e) => { fTech = e.target.value; draw(); } });

    return el("div", { class: "viz-filters sla-filters" }, prio, tech);
  }

  /* ─── الرسم ──────────────────────────────────────────────────────────── */

  function draw() {
    stopAll();

    const view = visible();
    const late = view.filter((r) => read.get(r.id).bucket === "late");
    const soon = view.filter((r) => read.get(r.id).bucket === "soon");
    const ok   = view.filter((r) => read.get(r.id).bucket === "ok");
    const idle = view.filter((r) => read.get(r.id).bucket === "idle");

    /* الترتيب بأقرب موعد نفاد لا بتاريخ الإنشاء: الشاشة تُقرأ من أعلاها،
       فليكن أعلاها ما يوشك أن يفوت. */
    const byDue = (a, b) =>
      new Date(read.get(a.id).due) - new Date(read.get(b.id).due);
    late.sort(byDue); soon.sort(byDue); ok.sort(byDue);
    idle.sort((a, b) =>
      (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9) ||
      new Date(a.created_at) - new Date(b.created_at));

    const frag = el("div", { class: "stack" },
      el("div", { class: "stats" },
        stat(L("متجاوِز الآن", "Breaching now"), String(late.length),
             L("تجاوزت مهلة الإنجاز", "past the completion deadline"), late.length ? "danger" : ""),
        stat(L("يوشك", "Due soon"), String(soon.length),
             L("بقي أقل من ربع المهلة", "less than a quarter of the window left"),
             soon.length ? "warn" : ""),
        stat(L("ضمن المهلة", "Within SLA"), String(ok.length),
             L("تجري وفق الاتفاقية", "running within the agreement"), "ok"),
        stat(L("لم تبدأ بعد", "Not started"), String(idle.length),
             L("لا ساعة عليها — وهنا الخطر", "no clock running — the blind spot"),
             idle.length ? "warn" : "")
      ),
      filters()
    );

    if (idle.length) frag.append(group(L("لم تبدأ بعد", "Not started"), idle, idleRow));
    if (late.length) frag.append(group(L("متجاوِز الآن", "Breaching now"), late, liveRow));
    if (soon.length) frag.append(group(L("يوشك", "Due soon"), soon, liveRow));
    if (ok.length)   frag.append(group(L("ضمن المهلة", "Within SLA"), ok, liveRow));

    if (!view.length) {
      frag.append(empty(L("لا شيء مفتوح", "Nothing open"),
                        L("كل ما أُسند أُنجز", "Everything assigned is done"), "✓"));
    }

    if (closed.length) {
      frag.append(
        el("div", { class: "section-title mt-6",
                    text: L("تجاوزات مغلقة تنتظر تبريرًا", "Closed breaches awaiting justification")
                          + " · " + closed.length }),
        el("p", { class: "small muted",
          text: L("التقرير الشهري يطالب بسبب كل تجاوز — جمعُه لاحقًا من الذاكرة تلفيق.",
                  "The monthly report requires a reason for each breach; reconstructing them later is invention.") }),
        el("div", { class: "field-list mt-2" }, ...closed.slice(0, 20).map(breachRow))
      );
    }

    host.replaceChildren(frag);
  }

  function group(title, list, row) {
    return el("div", {},
      el("div", { class: "section-title mt-6", text: title + " · " + list.length }),
      el("div", { class: "field-list" }, ...list.map(row))
    );
  }

  function head(r) {
    return el("div", { class: "grow" },
      el("div", { class: "row wrap", style: "gap:6px;margin-bottom:6px" },
        priorityBadge(r.priority),
        r.form_code ? el("span", { class: "form-code", text: r.form_code }) : null
      ),
      el("div", { class: "task-title", text: r.title }),
      el("div", { class: "task-meta" },
        el("span", {}, "#", String(r.seq ?? "")),
        r.location ? el("span", {}, "⌖ ", r.location) : null,
        el("span", {}, "◷ ", fmtStamp(r.created_at)),
        el("span", {}, "✎ ", people[r.assigned_to] || L("غير مسند", "unassigned"))
      )
    );
  }

  /* صفّ عليه ساعة تجري: عدّادان لا واحد — الوصول شيء والإنهاء شيء آخر،
     وخلطهما يخفي أين الخلل. */
  function liveRow(r) {
    const rd = read.get(r.id);
    const rec = r.record;
    const timer = liveTimer(rd.due);
    timers.push(timer);

    const resp = respCell(r, rec);

    return el("a", { class: "task-card p-" + (r.priority || "medium"),
                     href: "#/forms/" + (r.form_code || "") + "/" + r.id },
      el("div", { class: "task-top" },
        head(r),
        el("div", { style: "text-align:center;flex:none" },
          timer.node,
          el("div", { class: "tiny dim",
                      text: L("متبقٍ للإنجاز", "left to complete") })
        )
      ),
      resp
    );
  }

  /** حالة مهلة الاستجابة: خُتمت في وقتها، أو تأخّرت، أو لم تُسجَّل بعد. */
  function respCell(r, rec) {
    const mins = RESP_MIN[r.priority];
    if (!r.started_at || !mins) return null;
    const due = new Date(r.started_at).getTime() + mins * 60000;

    if (rec?.responded_at) {
      const at = new Date(rec.responded_at).getTime();
      const ok = at <= due;
      return el("div", { class: "small mt-2 " + (ok ? "ok-text" : "late-text"),
        text: (ok ? "✓ " : "✕ ") + L("الاستجابة: ", "Response: ") + fmtStamp(rec.responded_at)
              + (ok ? L(" — داخل المهلة", " — within SLA")
                    : L(" — تجاوزت بـ ", " — late by ") + fmtDur(at - due)) });
    }
    const left = due - Date.now();
    return el("div", { class: "small mt-2 " + (left < 0 ? "late-text" : "dim"),
      text: left < 0
        ? "✕ " + L("لم تُسجَّل الاستجابة — تجاوزت مهلتها", "Response not stamped — its deadline passed")
        : L("الاستجابة لم تُسجَّل — متبقٍ ", "Response not stamped — ") + fmtDur(left) });
  }

  /* صفّ بلا ساعة: الشاشة تقول منذ متى ينتظر، لأن الانتظار هنا لا يُقاس
     بمؤقّت وهو أخطر ما فيها. */
  function idleRow(r) {
    const rd = read.get(r.id);
    const waited = Date.now() - new Date(rd.since).getTime();
    return el("div", { class: "task-card p-" + (r.priority || "medium") },
      el("div", { class: "task-top" },
        head(r),
        el("div", { style: "text-align:center;flex:none" },
          el("span", { class: "task-timer idle", text: fmtDur(waited) }),
          el("div", { class: "tiny dim", text: L("منذ الإنشاء", "since created") })
        )
      ),
      el("div", { class: "note warn small mt-2", text: rd.why })
    );
  }

  function breachRow(r) {
    const over = new Date(r.closed_at) - new Date(r.sla_close_due);
    return el("a", { class: "task-card p-" + (r.priority || "medium"),
                     href: "#/forms/r/" + r.id },
      el("div", { class: "task-top" },
        el("div", { class: "grow" },
          el("div", { class: "row wrap", style: "gap:6px;margin-bottom:6px" },
            priorityBadge(r.priority),
            el("span", { class: "form-code", text: r.form_code })
          ),
          el("div", { class: "task-title", text: r.title || r.form_code }),
          el("div", { class: "task-meta" },
            r.location ? el("span", {}, "⌖ ", r.location) : null,
            el("span", {}, "◷ ", fmtStamp(r.closed_at)),
            el("span", {}, "✎ ", people[r.assigned_to] || "—")
          )
        ),
        el("div", { style: "text-align:center;flex:none" },
          el("span", { class: "task-timer late", text: "+" + fmtDur(over) }),
          el("div", { class: "tiny dim", text: L("بعد الموعد", "past due") })
        )
      )
    );
  }

  draw();
  return stopAll;   // الشاشة توقف مؤقتاتها عند مغادرتها
}
