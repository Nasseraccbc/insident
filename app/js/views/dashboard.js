/* ============================================================================
   لوحة المؤشرات — مشتركة بين مدير المشروع والمشرف وممثل الهيئة.

   الشاشة واحدة والبيانات تختلف: RLS في القاعدة هو ما يحدّد ما يراه كل دور،
   فلا فرع في الواجهة يقرّر ذلك ولا نسخة ثانية من الشاشة تُصان مرّتين.

   قواعد العرض مأخوذة من مهارة dataviz:
     • صفّ مرشّحات واحد أعلى الصفحة يشمل كل ما تحته — لا مرشّح داخل بطاقة
     • لكل رسم توأم جدولي: لا قيمة يحجبها اللون أو التمرير
     • رقم بطل واحد فقط في الشاشة
     • الحالة الفارغة مكتوبة صراحة — لا رسم يوهم ببيانات لا وجود لها
   ============================================================================ */

import { records, tasks } from "../db.js";
import { lang } from "../i18n.js";
import { el, pageHead, stat, empty, loading } from "../ui.js";
import { lineChart, stackedBar, barsH, riskMatrix, meter, legend, tableTwin, SERIES, ORD } from "../charts.js";
import { formByCode, formName } from "../forms/renderer.js";

const L = (ar, en) => (lang === "ar" ? ar : en);

const STATES = ["draft", "sent", "review", "approved", "client", "closed"];
const ST_AR = {
  draft: "مسودة", sent: "مُرسل للمشرف", review: "قيد المراجعة",
  approved: "معتمد داخليًا", client: "مرفوع للهيئة", closed: "مغلق ومعتمد",
};
const ST_EN = {
  draft: "Draft", sent: "Sent", review: "Under review",
  approved: "Approved", client: "Raised to client", closed: "Closed",
};
const stName = (s) => (lang === "ar" ? ST_AR[s] : ST_EN[s]) || s;

const RANGES = [7, 14, 30];

export async function dashboardView(page, state) {
  const host = el("div", {});
  page.append(
    pageHead(
      L("لوحة المؤشرات", "Dashboard"),
      L("الأرقام تُقرأ من القاعدة مباشرة", "Figures read straight from the database")
    ),
    host
  );
  host.append(loading());

  let recs = [], tks = [];
  try {
    [recs, tks] = await Promise.all([records.counts(), tasks.list({ limit: 500 })]);
  } catch (err) {
    host.replaceChildren(empty(L("تعذّر تحميل المؤشرات", "Could not load metrics"), err.message, "⚠"));
    return;
  }

  /* المخاطر تحتاج جسم النموذج لا عدّاداته */
  let risks = [];
  try {
    const rr = await records.list({ formCode: "RSK-01", limit: 50 });
    risks = rr.flatMap((r) => (Array.isArray(r.data?.risks) ? r.data.risks : []));
  } catch { /* سجل المخاطر قد يكون خارج صلاحية الدور — اللوحة تعمل بدونه */ }

  let days = 14;
  const body = el("div", { class: "stack" });

  /* ─── صفّ المرشّحات: واحد لكل الشاشة ─── */
  const chips = el("div", { class: "chips" });
  const drawChips = () => chips.replaceChildren(...RANGES.map((d) =>
    el("button", {
      class: "chip", type: "button", "aria-pressed": String(d === days),
      onclick: () => { days = d; drawChips(); render(); },
      text: L(`آخر ${d} يومًا`, `Last ${d} days`),
    })
  ));
  drawChips();

  host.replaceChildren(
    el("div", { class: "viz-filters" },
      el("span", { class: "tiny dim", text: L("المدة", "Range") }), chips),
    body
  );

  const cleanups = [];
  function render() {
    for (const c of cleanups.splice(0)) c();
    body.replaceChildren(...build());
  }

  function build() {
    const since = new Date(Date.now() - days * 864e5);
    const inRange = (d) => d && new Date(d) >= since;
    const rs = recs.filter((r) => inRange(r.created_at));
    const now = Date.now();

    /* ── الالتزام بمهلة الإغلاق: الرقم البطل ── */
    const judged = recs.filter((r) => r.sla_close_due && (r.closed_at || new Date(r.sla_close_due) < now));
    const onTime = judged.filter((r) => r.closed_at && new Date(r.closed_at) <= new Date(r.sla_close_due));
    const pct = judged.length ? Math.round((onTime.length / judged.length) * 100) : null;
    const kind = pct === null ? "" : pct >= 90 ? "ok" : pct >= 75 ? "warn" : "danger";

    const hero = el("div", { class: "card hero-card" },
      el("div", { class: "card-body" },
        el("div", { class: "stat-label", text: L("الالتزام بمهلة الإغلاق", "Closure SLA compliance") }),
        pct === null
          ? el("div", { class: "muted small mt-2",
              text: L("لا سجلات بلغت مهلتها بعد — المؤشر يظهر بعد أول إغلاق",
                      "No record has reached its deadline yet — the figure appears after the first closure") })
          : el("div", {},
              el("div", { class: "hero-num " + kind, text: pct + "%" }),
              meter(pct, kind || "ok"),
              el("div", { class: "tiny dim mt-2", text: L(
                `${onTime.length} من ${judged.length} سجلًا أُغلق داخل المهلة`,
                `${onTime.length} of ${judged.length} records closed within the deadline`) })
            )
      )
    );

    /* ── بطاقات الأرقام ── */
    const openRecs = recs.filter((r) => r.state !== "closed");
    const late = openRecs.filter((r) => r.sla_close_due && new Date(r.sla_close_due) < now);
    const unassigned = tks.filter((t) => !t.assigned_to && t.status === "new");
    const crit = tks.filter((t) => t.priority === "critical" && t.status !== "done" && t.status !== "cancelled");

    const tiles = el("div", { class: "stats" },
      stat(L("سجلات مفتوحة", "Open records"), openRecs.length,
           L(`${rs.length} أُنشئ خلال المدة`, `${rs.length} created in range`)),
      stat(L("متأخرة عن المهلة", "Past deadline"), late.length,
           L("تحتاج إغلاقًا فوريًا", "Need immediate closure"), late.length ? "danger" : "ok"),
      stat(L("مهام تنتظر التوزيع", "Awaiting assignment"), unassigned.length,
           L("في وارد المشرف", "In supervisor inbox"), unassigned.length ? "warn" : ""),
      stat(L("أوامر حرجة مفتوحة", "Open critical orders"), crit.length,
           L("أولوية حرجة لم تُنجز", "Critical priority, not done"), crit.length ? "danger" : "ok")
    );

    /* ── اتجاه المدة: أُنشئ مقابل أُغلق ── */
    const xs = [];
    for (let i = days - 1; i >= 0; i--) xs.push(dayKey(new Date(now - i * 864e5)));
    const bucket = (list, field) => {
      const m = Object.fromEntries(xs.map((k) => [k, 0]));
      for (const r of list) {
        const v = r[field];
        if (!v) continue;
        const k = dayKey(new Date(v));
        if (k in m) m[k]++;
      }
      return xs.map((k) => m[k]);
    };
    const created = bucket(recs, "created_at");
    const closed = bucket(recs, "closed_at");
    const trendSeries = [
      { label: L("سجلات أُنشئت", "Created"), color: SERIES[0], v: created },
      { label: L("سجلات أُغلقت", "Closed"), color: SERIES[1], v: closed },
    ];
    const trendHost = el("div", { class: "viz-host" });
    const trend = chartCard(
      L("حركة السجلات", "Record flow"),
      L(`${days} يومًا — ما دخل مقابل ما أُغلق`, `${days} days — opened against closed`),
      trendHost,
      legend(trendSeries.map((s) => ({ label: s.label, color: s.color })), { line: true }),
      tableTwin([L("اليوم", "Day"), ...trendSeries.map((s) => s.label)],
                xs.map((k, i) => [fmtDay(k), created[i], closed[i]]))
    );
    if (created.some(Boolean) || closed.some(Boolean)) {
      cleanups.push(lineChart(trendHost, { xs, series: trendSeries, fmtX: fmtDay }));
    } else {
      trendHost.append(noData());
    }

    /* ── توزيع الحالات: مقياس ترتيبي فسُلَّم أحادي الهوى ── */
    const byState = STATES.map((s, i) => ({
      key: s, label: stName(s), value: recs.filter((r) => r.state === s).length,
      color: ORD(i + 1),
    }));
    const stHost = el("div", { class: "viz-host" });
    const stCard = chartCard(
      L("أين تقف السجلات", "Where records stand"),
      L("مراحل الاعتماد الست بالترتيب", "The six approval stages, in order"),
      stHost,
      legend(byState.filter((b) => b.value)),
      tableTwin([L("المرحلة", "Stage"), L("العدد", "Count")],
                byState.map((b) => [b.label, b.value]))
    );
    if (recs.length) stackedBar(stHost, { parts: byState });
    else stHost.append(noData());

    /* ── أكثر النماذج استخدامًا ── */
    const counts = {};
    for (const r of recs) counts[r.form_code] = (counts[r.form_code] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7)
      .map(([code, v]) => ({ label: `${code} · ${shortName(code)}`, value: v }));
    const fHost = el("div", { class: "viz-host" });
    const fCard = chartCard(
      L("أكثر النماذج استخدامًا", "Most used forms"),
      L("عدد السجلات لكل نموذج", "Records per form"),
      fHost, null,
      tableTwin([L("النموذج", "Form"), L("سجلات", "Records")], top.map((t) => [t.label, t.value]))
    );
    if (top.length) barsH(fHost, { items: top });
    else fHost.append(noData());

    /* ── خريطة المخاطر ── */
    const cells = Array.from({ length: 5 }, () => new Array(5).fill(0));
    let openRisks = 0;
    for (const row of risks) {
      const p = +row[4], im = +row[5];
      if (!(p >= 1 && p <= 5 && im >= 1 && im <= 5)) continue;
      if (row[10] === "مغلق") continue;
      cells[p - 1][im - 1]++;
      openRisks++;
    }
    const rHost = el("div", { class: "viz-host" });
    const rCard = chartCard(
      L("خريطة المخاطر", "Risk matrix"),
      L("الاحتمالية (عمودي) × الأثر (أفقي) — الإطار الأحمر منطقة التصعيد (الدرجة ١٥ فأعلى)",
        "Likelihood (vertical) x Impact (horizontal) — the red outline marks the escalation zone (score 15+)"),
      rHost, null,
      tableTwin([L("الاحتمالية", "Likelihood"), L("الأثر", "Impact"), L("الدرجة", "Score"), L("مخاطر", "Risks")],
        cells.flatMap((row, p) => row.map((v, i) => [p + 1, i + 1, (p + 1) * (i + 1), v]))
             .filter((r) => r[3] > 0))
    );
    if (openRisks) riskMatrix(rHost, { cells });
    else rHost.append(noData(L("لا مخاطر مفتوحة في سجل RSK-01", "No open risks in the RSK-01 register")));

    return [hero, tiles, el("div", { class: "grid-2" }, trend, stCard),
            el("div", { class: "grid-2" }, fCard, rCard)];
  }

  render();
  return () => { for (const c of cleanups.splice(0)) c(); };
}

/* ─── قوالب ────────────────────────────────────────────────────────────── */

function chartCard(title, sub, host, legendNode, twin) {
  return el("section", { class: "card viz-card" },
    el("div", { class: "card-head" },
      el("div", { class: "grow" },
        el("h3", { text: title }),
        sub ? el("div", { class: "tiny dim", text: sub }) : null
      )
    ),
    el("div", { class: "card-body" }, legendNode, host, twin)
  );
}

function noData(msg) {
  return el("div", { class: "viz-empty small muted",
                     text: msg || L("لا بيانات في هذه المدة", "No data in this range") });
}

function shortName(code) {
  const f = formByCode(code);
  const n = f ? formName(f) : "";
  return n.length > 26 ? n.slice(0, 25) + "…" : n;
}

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmtDay = (k) => {
  const [, m, d] = k.split("-");
  return `${+d}/${+m}`;
};
