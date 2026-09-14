/* ============================================================================
   الاعتمادات — شاشة مشرف الموقع.

   القرار (طلب العميل): الاعتماد والملاحظات من عمّار وحده. مدير المشروع
   وممثل الهيئة يريان كل شيء ولا يقرّران. الأزرار هنا للمشرف، والقاعدة
   تفحص الصلاحية من جديد عبر review_record — الواجهة تُخطئ، والقاعدة لا.

   تسلسل العمل: الفني يرسل ← تظهر هنا ← اعتماد يُغلقها، أو إرجاع بملاحظة
   يعيدها مسودة عند الفني ومعها سبب الإرجاع.
   ============================================================================ */

import { records, profiles } from "../db.js";
import { lang, fmtStamp } from "../i18n.js";
import { el, pageHead, empty, loading, toast, modal, textarea } from "../ui.js";
import { formByCode, formName } from "../forms/renderer.js";

const L = (ar, en) => (lang === "ar" ? ar : en);

export async function approvalsView(page, state) {
  const host = el("div", {});
  page.append(
    pageHead(L("الاعتمادات", "Approvals"),
             L("سجلات أرسلها الفنيون وتنتظر قرارك", "Records sent by technicians, awaiting your decision")),
    host
  );
  host.append(loading());

  let rows = [], people = {};
  async function load() {
    rows = await records.list({ state: "sent", limit: 100 });
    const list = await profiles.all().catch(() => []);
    people = Object.fromEntries(list.map((p) => [p.id, p.full_name || p.email]));
  }

  try { await load(); }
  catch (err) { host.replaceChildren(empty(L("تعذّر التحميل", "Could not load"), err.message, "⚠")); return; }

  function draw() {
    if (!rows.length) {
      host.replaceChildren(empty(
        L("لا شيء ينتظر قرارك", "Nothing awaiting your decision"),
        L("كل ما أُرسل جرى البتّ فيه", "Everything sent has been decided"), "✓"));
      return;
    }
    host.replaceChildren(el("div", { class: "field-list" }, ...rows.map(card)));
  }

  function card(r) {
    const f = formByCode(r.form_code);
    const node = el("article", { class: "task-card" },
      el("div", { class: "task-top" },
        el("div", { class: "grow" },
          el("div", { class: "form-code", text: r.form_code }),
          el("div", { class: "task-title", text: r.title || (f ? formName(f) : r.form_code) })
        )
      ),
      el("div", { class: "task-meta" },
        r.location ? el("span", { text: "◎ " + r.location }) : null,
        el("span", { text: "◔ " + fmtStamp(r.updated_at || r.created_at) }),
        el("span", { text: "✎ " + (people[r.created_by] || "—") })
      ),
      el("div", { class: "task-actions" },
        el("a", { class: "btn", href: "#/forms/r/" + r.id,
                  text: L("فتح السجل", "Open record") }),
        el("button", { class: "btn btn-ghost", onclick: () => decide(r, "return"),
                       text: L("إرجاع بملاحظة", "Return with note") }),
        el("button", { class: "btn btn-primary", onclick: () => decide(r, "approve"),
                       text: "✓ " + L("اعتماد", "Approve") })
      )
    );
    return node;
  }

  /* الملاحظة اختيارية مع الاعتماد، وواجبة مع الإرجاع — والقاعدة ترفض
     الإرجاع الفارغ حتى لو تجاوزت الواجهة. */
  function decide(r, decision) {
    const ret = decision === "return";
    const note = textarea({ rows: 3, placeholder: ret
      ? L("ما المطلوب تصحيحه؟ يصل نصّها إلى الفني", "What needs fixing? The technician sees this text")
      : L("ملاحظة اختيارية تُحفظ في سجل السجل", "Optional note kept in the record history") });

    const m = modal({
      title: (ret ? L("إرجاع للتصحيح", "Return for correction") : L("اعتماد وإغلاق", "Approve and close"))
             + " — " + (r.title || r.form_code),
      body: el("div", { class: "stack" },
        el("p", { class: "small muted", text: ret
          ? L("يعود السجل مسودة عند الفني ومعه ملاحظتك.",
              "The record returns to the technician as a draft, with your note.")
          : L("يُغلق السجل ويصير وثيقة معتمدة لا تُعدَّل.",
              "The record closes and becomes an approved, uneditable document.") }),
        note
      ),
      actions: [
        { label: L("إلغاء", "Cancel") },
        {
          label: ret ? L("إرجاع", "Return") : L("اعتماد", "Approve"),
          kind: ret ? "btn-danger" : "btn-primary",
          onClick: () => {
            const txt = note.value.trim();
            if (ret && !txt) {
              toast(L("الإرجاع يتطلب ملاحظة", "A return needs a note"), "warn");
              note.focus();
              return false;                      // أبقِ النافذة مفتوحة
            }
            run(r, decision, txt);
          },
        },
      ],
    });
    note.focus();
    return m;
  }

  async function run(r, decision, note) {
    try {
      await records.review(r.id, decision, note);
      rows = rows.filter((x) => x.id !== r.id);
      draw();
      toast(decision === "approve"
        ? L("اعتُمد وأُغلق ✓", "Approved and closed")
        : L("أُرجع إلى الفني", "Returned to the technician"), "ok");
    } catch (err) {
      toast(err.message || L("تعذّر تنفيذ القرار", "Could not apply the decision"), "danger", 6000);
    }
  }

  draw();
}
