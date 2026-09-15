/* ============================================================================
   طلبات الموظف: ضيافة المكاتب (HS-01) وتجهيز القاعات (MR-01).

   الموظف ليس منفّذًا ولا معتمِدًا — هو صاحب حاجة. فلا يُفتح له النموذج
   كاملًا بمراحل توقيته وقوائم تحققه، بل قسم الطلب منه وحده.

   والحقول تُقرأ من تعريف النموذج نفسه لا تُكتب هنا: تسمية أو خيار يتغيّر
   في الكراسة يتغيّر في الشاشتين معًا. نسخة ثانية تنحرف بصمت.

   ومسار الطلب هو مسار البلاغ الميداني ذاته — بُني ومُحقّق من قبل:
       معلَّق ──اعتماد عمّار وإسناده──▶ مهمة عند المنفّذ ──▶ منجزة
          └────────رفض بسبب─────────▶ ملغاة، والسبب عند صاحبه
   ============================================================================ */

import { tasks } from "../db.js";
import { formByCode, renderField, blankValue } from "../forms/renderer.js";
import { t, lang } from "../i18n.js";
import { el, pageHead, empty, loading, toast } from "../ui.js";

const L = (ar, en) => (lang === "ar" ? ar : en);

/* لكل شاشة: النموذج، وحقول الطلب منه، وكيف يُصاغ عنوانه ووصفه. المفاتيح
   أسماء حقول في التعريف — لا تُكرَّر تسمياتها ولا خياراتها هنا. */
const SPECS = {
  hospitality: {
    code: "HS-01",
    icon: "☕",
    title: L("طلب ضيافة", "Hospitality request"),
    lead: L("يصل الطلب إلى مشرف الموقع. حين يعتمده يُسنده إلى الضيافة وتبدأ مهلته.",
            "The request reaches the site supervisor. Once approved it is assigned to hospitality and its clock starts."),
    keys: ["site", "dt", "pax", "occ", "drinks", "sugar", "milk", "allergy", "note"],
    req: ["site", "dt", "pax"],
    locKey: "site",
    title_of: (d, f) =>
      `${L("ضيافة", "Hospitality")}: ${d.occ || L("طلب مكتب", "office order")}` +
      (d.pax ? ` — ${d.pax} ${L("أشخاص", "people")}` : ""),
    desc_of: (d, f) => {
      const items = drinkLines(d.drinks, f);
      return [items.join(" · "), d.allergy, d.note].filter(Boolean).join("\n");
    },
  },
  room: {
    code: "MR-01",
    icon: "▣",
    title: L("تجهيز قاعة اجتماعات", "Meeting room preparation"),
    lead: L("يصل الطلب إلى مشرف الموقع. حين يعتمده يُسنده للتجهيز وتبدأ مهلته.",
            "The request reaches the site supervisor. Once approved it is assigned for preparation and its clock starts."),
    keys: ["site", "dt", "t_from", "t_to", "pax", "org", "layout", "note"],
    req: ["site", "dt", "t_from"],
    locKey: "site",
    // «ملاحظات وإجراءات متخذة» تسمية قسم التنفيذ في MR-01، ولا معنى لها
    // أمام الطالب — الحقل واحد والتسمية تتبع من يقرأها
    labels: { note: L("ملاحظات الطلب", "Request notes") },
    title_of: (d) => `${L("قاعة", "Room")}: ${d.site || ""}`.trim(),
    desc_of: (d) => [
      [d.dt, d.t_from && d.t_to ? `${d.t_from}–${d.t_to}` : d.t_from].filter(Boolean).join(" "),
      d.pax ? `${d.pax} ${L("حضورًا", "attendees")}` : "",
      d.layout ? `${L("ترتيب", "layout")}: ${d.layout}` : "",
      d.org, d.note,
    ].filter(Boolean).join(" · "),
  },
};

/** أسطر المشروبات المطلوبة: «لاتيه ×٣». الودجة تخزّن { key: {q, note} }. */
function drinkLines(value, form) {
  if (!value || typeof value !== "object") return [];
  const fld = fieldOf(form, "drinks");
  const items = fld?.items || [];
  const out = [];
  for (const it of items) {
    const q = +(value[it.k]?.q ?? value[it.k] ?? 0);
    if (q > 0) out.push(`${lang === "en" ? it.en : it.ar} ×${q}`);
  }
  return out;
}

function fieldOf(form, key) {
  for (const sec of form.secs || []) {
    for (const f of sec.f || []) if (f.k === key) return f;
  }
  return null;
}

export function requestView(kind) {
  return async function view(page, state) {
    const spec = SPECS[kind];
    const form = formByCode(spec.code);
    if (!form) {
      page.append(empty(L("النموذج غير معرّف", "Form not defined"), spec.code, "⚠"));
      return;
    }

    const fields = spec.keys.map((k) => fieldOf(form, k)).filter(Boolean);
    const data = {};
    for (const f of fields) data[f.k] = blankValue(f);

    const host = el("div", { class: "stack" });
    page.append(pageHead(spec.title, spec.lead), host);

    const grid = el("div", { class: "form-grid" });
    for (const f of fields) {
      const required = spec.req.includes(f.k);
      const over = spec.labels?.[f.k];
      grid.append(renderField(
        { ...f, ...(required ? { req: true } : {}), ...(over ? { l: over } : {}) },
        data[f.k],
        (v) => { data[f.k] = v; },
        data
      ));
    }

    const send = el("button", { class: "btn btn-primary", onclick: submit },
                    spec.icon + " " + L("أرسل الطلب", "Send request"));

    host.append(
      el("section", { class: "card" },
        el("div", { class: "card-body" }, grid)
      ),
      el("div", { class: "row wrap", style: "justify-content:flex-end;gap:10px" }, send)
    );

    async function submit() {
      const missing = spec.req.filter((k) => !String(data[k] ?? "").trim());
      if (missing.length) {
        const f = fieldOf(form, missing[0]);
        toast(L("ناقص: ", "Missing: ") + (f?.l || missing[0]), "warn");
        return;
      }

      send.disabled = true;
      send.textContent = L("جارٍ الإرسال…", "Sending…");
      try {
        await tasks.report({
          title: spec.title_of(data, form) || spec.title,
          description: spec.desc_of(data, form) || null,
          location: data[spec.locKey] || null,
          priority: "medium",
          form_code: spec.code,
          request: data,
          created_by: state.profile.id,
        });
        toast(L("أُرسل الطلب — بانتظار اعتماد المشرف",
                "Request sent — awaiting supervisor approval"), "ok", 4000);
        location.hash = "#/requests";
      } catch (err) {
        toast(err.message || t("errNet"), "danger", 6000);
        send.disabled = false;
        send.textContent = spec.icon + " " + L("أرسل الطلب", "Send request");
      }
    }
  };
}

/* ─── طلباتي ───────────────────────────────────────────────────────────── */

const STATE_VIEW = {
  pending:     { label: L("بانتظار اعتماد المشرف", "Awaiting approval"),   cls: "badge-warn" },
  assigned:    { label: L("اعتُمد وأُسند", "Approved and assigned"),        cls: "badge-brand" },
  new:         { label: L("اعتُمد", "Approved"),                            cls: "badge-brand" },
  in_progress: { label: L("قيد التنفيذ", "In progress"),                    cls: "badge-warn" },
  // من عين الطالب: العمل تمّ وينتظر تأكيد المشرف — لا شأن له بهذا الانتظار
  submitted:   { label: L("نُفِّذ وينتظر التأكيد", "Done, awaiting confirmation"), cls: "badge-info" },
  done:        { label: L("نُفِّذ", "Completed"),                            cls: "badge-ok" },
  cancelled:   { label: L("لم يُعتمد", "Not approved"),                      cls: "badge-danger" },
};

export async function myRequestsView(page, state) {
  const host = el("div", {});
  page.append(
    pageHead(t("navRequests"),
             L("ما طلبته وأين وصل", "What you asked for, and where it stands"),
             [], [
      el("a", { class: "btn", href: "#/hospitality", text: "☕ " + L("ضيافة", "Hospitality") }),
      el("a", { class: "btn btn-primary", href: "#/room", text: "▣ " + L("قاعة", "Room") }),
    ]),
    host
  );
  host.append(loading());

  let rows;
  try {
    rows = await tasks.list({ createdBy: state.profile.id });
  } catch (err) {
    host.replaceChildren(empty(t("errNet"), err.message, "⚠"));
    return;
  }

  if (!rows.length) {
    host.replaceChildren(empty(
      L("لا طلبات بعد", "No requests yet"),
      L("اطلب ضيافة لمكتبك أو تجهيز قاعة اجتماعات من الزرّين أعلاه.",
        "Request office hospitality or a meeting room from the buttons above."), "☕"));
    return;
  }

  host.replaceChildren(el("div", { class: "field-list" }, ...rows.map(card)));

  function card(r) {
    const view = STATE_VIEW[r.status] || STATE_VIEW.pending;
    const rejected = r.status === "cancelled";
    return el("article", { class: "task-card" },
      el("div", { class: "task-top" },
        el("div", { class: "grow" },
          el("div", { class: "row wrap", style: "gap:6px;margin-bottom:6px" },
            el("span", { class: "badge " + view.cls, text: view.label }),
            r.form_code ? el("span", { class: "form-code", text: r.form_code }) : null
          ),
          el("div", { class: "task-title", text: r.title }),
          el("div", { class: "task-meta" },
            el("span", {}, "#", String(r.seq ?? "")),
            r.location ? el("span", {}, "⌖ ", r.location) : null
          )
        )
      ),
      r.description
        ? el("p", { class: "small muted mt-2", style: "white-space:pre-line", text: r.description })
        : null,
      // سبب الرفض يُعرض كما كتبه المشرف: طلبٌ رُفض بلا سبب يُعاد رفعه كما هو
      rejected && r.review_note
        ? el("div", { class: "note danger mt-2" },
            el("b", { text: "✕ " + L("لم يُعتمد", "Not approved") }),
            el("p", { class: "small mt-2", text: r.review_note }))
        : null
    );
  }
}
