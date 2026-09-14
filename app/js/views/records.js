/* ============================================================================
   السجلات — كل ما عُبِّئ، لمن له حق الاطلاع.

   مدير المشروع وممثل الهيئة يريان كل شيء من هنا دون أن يكتبا؛ والمشرف يرى
   ما يخصّه. الحدّ الحقيقي في RLS لا في هذه الشاشة: من بدّل الرابط يدويًا
   يصطدم بالقاعدة.
   ============================================================================ */

import { records, profiles } from "../db.js";
import { lang, fmtStamp } from "../i18n.js";
import { el, pageHead, empty, loading, table, stateBadge, priorityBadge, select } from "../ui.js";
import { formByCode, formName, FORMS } from "../forms/renderer.js";

const L = (ar, en) => (lang === "ar" ? ar : en);

const STATES = ["draft", "sent", "closed", "review", "approved", "client"];
const ST = {
  draft: ["مسودة", "Draft"], sent: ["بانتظار الاعتماد", "Awaiting approval"],
  closed: ["مغلق ومعتمد", "Closed"], review: ["قيد المراجعة", "Under review"],
  approved: ["معتمد داخليًا", "Approved"], client: ["مرفوع للهيئة", "With client"],
};

export async function recordsView(page, state) {
  const host = el("div", {});
  page.append(pageHead(L("السجلات", "Records"),
                       L("كل النماذج المعبّأة", "Every filled form")), host);
  host.append(loading());

  let rows = [], people = {};
  try {
    rows = await records.list({ limit: 300 });
    const list = await profiles.all().catch(() => []);
    people = Object.fromEntries(list.map((p) => [p.id, p.full_name || p.email]));
  } catch (err) {
    host.replaceChildren(empty(L("تعذّر التحميل", "Could not load"), err.message, "⚠"));
    return;
  }

  let fState = "", fForm = "";

  const used = [...new Set(rows.map((r) => r.form_code))].sort();

  const stateSel = select(
    [{ value: "", label: L("كل الحالات", "All states") },
     ...STATES.filter((s) => rows.some((r) => r.state === s))
              .map((s) => ({ value: s, label: ST[s][lang === "ar" ? 0 : 1] }))],
    { onchange: (e) => { fState = e.target.value; draw(); } }
  );

  const formSel = select(
    [{ value: "", label: L("كل النماذج", "All forms") },
     ...used.map((c) => ({ value: c, label: c + " · " + shortName(c) }))],
    { onchange: (e) => { fForm = e.target.value; draw(); } }
  );

  const body = el("div", {});
  host.replaceChildren(
    el("div", { class: "viz-filters" }, stateSel, formSel,
       el("span", { class: "tiny dim", id: "rec-count" })),
    body
  );

  function draw() {
    const view = rows.filter((r) => (!fState || r.state === fState) && (!fForm || r.form_code === fForm));
    host.querySelector("#rec-count").textContent =
      L(`${view.length} سجلًا`, `${view.length} records`);

    if (!view.length) {
      body.replaceChildren(empty(L("لا سجلات بهذا التصفية", "No records match this filter")));
      return;
    }

    body.replaceChildren(table(
      [L("النموذج", "Form"), L("العنوان", "Title"), L("الموقع", "Location"),
       L("الحالة", "State"), L("الأولوية", "Priority"), L("المنشئ", "Created by"),
       L("آخر تحديث", "Updated"), ""],
      view,
      (r) => el("tr", {},
        el("td", {}, el("span", { class: "form-code", text: r.form_code })),
        el("td", { text: r.title || "—" }),
        el("td", { text: r.location || "—" }),
        el("td", {}, stateBadge(r.state)),
        el("td", {}, priorityBadge(r.priority)),
        el("td", { class: "small", text: people[r.created_by] || "—" }),
        el("td", { class: "small dim", text: fmtStamp(r.updated_at || r.created_at) }),
        el("td", {}, el("a", { class: "btn btn-sm", href: "#/forms/r/" + r.id,
                               text: L("فتح", "Open") }))
      )
    ));
  }

  draw();
}

function shortName(code) {
  const f = formByCode(code);
  const n = f ? formName(f) : "";
  return n.length > 28 ? n.slice(0, 27) + "…" : n;
}
