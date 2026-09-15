/* ============================================================================
   سجل المخاطر — ما لم يقع بعد.

   باقي النماذج توثّق ما وقع: بلاغٌ وعطلٌ وحادث. وهذا يوثّق ما يمكن أن يقع،
   واحتمالَه وأثره ومن يمنعه. ولذلك لا يُقرأ بترتيب الزمن بل بترتيب الدرجة.

   الدرجة = الاحتمالية × الأثر على مقياس خماسي. وما بلغ خمسة عشر فأعلى
   يُصعَّد إلى مدير المشروع ولجنة الإشراف — القاعدة مكتوبة في النموذج نفسه
   (مرفق ١٤)، وهذه الشاشة تجعلها مرئية بدل أن تبقى سطرًا في ملاحظة.

   المصدر واحد: سجلات RSK-01 المحفوظة. لا كتالوج ثانٍ ينحرف عن النموذج.
   ============================================================================ */

import { records } from "../db.js";
import { riskMatrix, tableTwin } from "../charts.js";
import { lang, fmtStamp } from "../i18n.js";
import { el, pageHead, empty, loading, select, stat } from "../ui.js";

const L = (ar, en) => (lang === "ar" ? ar : en);

/** حدّ التصعيد — القيمة ذاتها التي تكتبها ملاحظة النموذج وترسمها الخريطة. */
const ESCALATE = 15;

/* ترتيب أعمدة جدول المخاطر في RSK-01. القراءة بالموضع هشّة، فتُسمّى هنا
   مرّة واحدة بدل أن تتناثر أرقام سحرية في الشاشة. */
const C = {
  cat: 0, desc: 1, src: 2, effect: 3,
  likely: 4, impact: 5, score: 6,
  control: 7, owner: 8, track: 9, state: 10,
};

const STATES = ["مفتوح", "قيد المعالجة", "مغلق"];

export async function risksView(page, state) {
  const host = el("div", {});
  page.append(
    pageHead(L("سجل المخاطر", "Risk register"),
             L("ما يمكن أن يقع — مرتّبًا بدرجته لا بتاريخه",
               "What could go wrong — ordered by score, not by date")),
    host
  );
  host.append(loading());

  const cleanups = [];
  const stopAll = () => { for (const c of cleanups.splice(0)) c(); };

  let items = [];
  try {
    const regs = await records.list({ formCode: "RSK-01", limit: 50 });
    for (const r of regs) {
      for (const row of (Array.isArray(r.data?.risks) ? r.data.risks : [])) {
        const likely = +row[C.likely], impact = +row[C.impact];
        if (!(likely >= 1 && likely <= 5 && impact >= 1 && impact <= 5)) continue;
        if (!String(row[C.desc] ?? "").trim()) continue;
        items.push({
          row,
          reg: r,
          likely, impact,
          // الدرجة تُحتسب هنا لا تُقرأ من الحقل: حقل calc قد يكون فارغًا في
          // سجل حُفظ قبل إعادة الحساب، والضرب لا يحتمل خلافًا
          score: likely * impact,
          state: String(row[C.state] ?? "").trim() || "مفتوح",
        });
      }
    }
  } catch (err) {
    host.replaceChildren(empty(L("تعذّر التحميل", "Could not load"), err.message, "⚠"));
    return stopAll;
  }

  if (!items.length) {
    host.replaceChildren(el("div", { class: "stack" },
      empty(L("لا سجل مخاطر بعد", "No risk register yet"),
            L("سجل المخاطر نموذج RSK-01 (مرفق ١٤) ويأتي معبّأً بأحد عشر خطرًا مستخرجة من الكراسة — احفظه مرّة لتبدأ هذه الشاشة والخريطة في لوحة التشغيل بالعمل.",
              "The register is form RSK-01 (annex 14), pre-filled with eleven risks drawn from the tender. Save it once and this screen — and the dashboard matrix — start working."),
            "△"),
      el("div", { class: "center" },
        el("a", { class: "btn btn-primary", href: "#/forms/RSK-01",
                  text: L("افتح RSK-01", "Open RSK-01") }))
    ));
    return stopAll;
  }

  let fCat = "", fState = "";
  const cats = [...new Set(items.map((x) => String(x.row[C.cat] ?? "").trim()).filter(Boolean))];

  const visible = () => items.filter((x) =>
    (!fCat || String(x.row[C.cat] ?? "").trim() === fCat) &&
    (!fState || x.state === fState));

  function draw() {
    stopAll();
    const view = visible();

    const open = view.filter((x) => x.state !== "مغلق");
    const esc = open.filter((x) => x.score >= ESCALATE);

    /* الخريطة تُرسم من المفتوح وحده: خطرٌ عولج وأُغلق ليس تهديدًا قائمًا،
       وإبقاؤه في الخانة يضخّم الصورة ويجعل المعالجة بلا أثر مرئي. */
    const cells = Array.from({ length: 5 }, () => new Array(5).fill(0));
    for (const x of open) cells[x.likely - 1][x.impact - 1]++;

    const vizHost = el("div", { class: "viz-host" });

    const frag = el("div", { class: "stack" },
      el("div", { class: "stats" },
        stat(L("في منطقة التصعيد", "In the escalation zone"), String(esc.length),
             L(`الدرجة ${ESCALATE} فأعلى — تُرفع لمدير المشروع`,
               `Score ${ESCALATE}+ — escalated to the project manager`),
             esc.length ? "danger" : "ok"),
        stat(L("مفتوح", "Open"),
             String(view.filter((x) => x.state === "مفتوح").length),
             L("لم تبدأ معالجته", "no treatment started"),
             view.some((x) => x.state === "مفتوح") ? "warn" : ""),
        stat(L("قيد المعالجة", "Being treated"),
             String(view.filter((x) => x.state === "قيد المعالجة").length),
             L("إجراء الضبط جارٍ", "control action under way")),
        stat(L("مغلق", "Closed"),
             String(view.filter((x) => x.state === "مغلق").length),
             L("عولج وأُثبت أثره", "treated and evidenced"), "ok")
      ),

      el("div", { class: "viz-filters sla-filters" },
        select([{ value: "", label: L("كل الفئات", "All categories") },
                ...cats.map((c) => ({ value: c, label: c }))],
               { value: fCat, onchange: (e) => { fCat = e.target.value; draw(); } }),
        select([{ value: "", label: L("كل الحالات", "All states") },
                ...STATES.map((s) => ({ value: s, label: s }))],
               { value: fState, onchange: (e) => { fState = e.target.value; draw(); } })
      ),

      el("section", { class: "card viz-card" },
        el("div", { class: "card-head" },
          el("div", { class: "grow" },
            el("h3", { text: L("خريطة المخاطر المفتوحة", "Open risk matrix") }),
            el("div", { class: "tiny dim",
              text: L("الاحتمالية (عمودي) × الأثر (أفقي) — الإطار يحدّ منطقة التصعيد",
                      "Likelihood (vertical) x Impact (horizontal) — the outline marks the escalation zone") })
          )
        ),
        el("div", { class: "card-body" },
          vizHost,
          tableTwin(
            [L("الاحتمالية", "Likelihood"), L("الأثر", "Impact"),
             L("الدرجة", "Score"), L("مخاطر", "Risks")],
            cells.flatMap((r, p) => r.map((v, i) => [p + 1, i + 1, (p + 1) * (i + 1), v]))
                 .filter((r) => r[3] > 0)
                 .sort((a, b) => b[2] - a[2])
          )
        )
      )
    );

    /* المرتّب بالدرجة تنازليًا: الشاشة تُقرأ من أعلاها، وأعلاها أخطرها.
       والمغلق يهبط إلى الذيل مهما علت درجته — لم يعد تهديدًا قائمًا. */
    const sorted = [...view].sort((a, b) =>
      (a.state === "مغلق") - (b.state === "مغلق") || b.score - a.score);

    frag.append(
      el("div", { class: "section-title mt-6",
                  text: L("المخاطر", "Risks") + " · " + sorted.length }),
      el("div", { class: "field-list" }, ...sorted.map(riskCard))
    );

    host.replaceChildren(frag);
    if (open.length) cleanups.push(riskMatrix(vizHost, { cells, escalate: ESCALATE }));
    else vizHost.append(el("div", { class: "viz-empty small muted",
      text: L("لا مخاطر مفتوحة ضمن هذه التصفية", "No open risks under this filter") }));
  }

  function riskCard(x) {
    const closed = x.state === "مغلق";
    const hot = !closed && x.score >= ESCALATE;
    const cell = (label, value) => value
      ? el("div", { class: "rk-cell" },
          el("div", { class: "tiny dim", text: label }),
          el("div", { class: "small", text: value }))
      : null;

    return el("article", { class: "task-card" + (hot ? " p-critical" : closed ? "" : " p-medium") },
      el("div", { class: "task-top" },
        el("div", { class: "grow" },
          el("div", { class: "row wrap", style: "gap:6px;margin-bottom:6px" },
            el("span", { class: "badge", text: String(x.row[C.cat] ?? "—") }),
            el("span", { class: "badge " + (closed ? "badge-ok" : x.state === "مفتوح" ? "badge-warn" : "badge-brand"),
                         text: x.state }),
            // التصعيد بعبارة لا بلون: من لا يميّز الألوان يقرأها
            hot ? el("span", { class: "badge badge-danger",
                               text: "▲ " + L("يُصعَّد", "escalate") }) : null
          ),
          el("div", { class: "task-title", text: String(x.row[C.desc] ?? "") })
        ),
        el("div", { style: "text-align:center;flex:none" },
          el("div", { class: "rk-score" + (hot ? " hot" : ""), text: String(x.score) }),
          el("div", { class: "tiny dim",
                      text: `${x.likely} × ${x.impact} ${L("(احتمالية × أثر)", "(likelihood x impact)")}` })
        )
      ),
      el("div", { class: "rk-grid mt-2" },
        cell(L("المصدر / السبب", "Source / cause"), x.row[C.src]),
        cell(L("الأثر المحتمل", "Potential effect"), x.row[C.effect]),
        cell(L("إجراء الضبط", "Control action"), x.row[C.control]),
        cell(L("المالك", "Owner"), x.row[C.owner]),
        cell(L("وسيلة المتابعة", "Evidence / tracking"), x.row[C.track])
      ),
      el("div", { class: "task-meta mt-2" },
        el("a", { href: "#/forms/r/" + x.reg.id,
                  text: (x.reg.title || "RSK-01") + " · " + fmtStamp(x.reg.updated_at || x.reg.created_at) })
      )
    );
  }

  draw();
  return stopAll;
}
