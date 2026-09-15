/* ============================================================================
   الاعتمادات — شاشة مشرف الموقع.

   القرار (طلب العميل): الاعتماد والملاحظات من عمّار وحده. مدير المشروع
   وممثل الهيئة يريان كل شيء ولا يقرّران. الأزرار هنا للمشرف، والقاعدة
   تفحص الصلاحية من جديد عبر review_record — الواجهة تُخطئ، والقاعدة لا.

   تسلسل العمل: الفني يرسل ← تظهر هنا ← اعتماد يُغلقها، أو إرجاع بملاحظة
   يعيدها مسودة عند الفني ومعها سبب الإرجاع.
   ============================================================================ */

import { records, profiles, tasks } from "../db.js";
import { lang, t, fmtStamp } from "../i18n.js";
import {
  el, pageHead, empty, loading, toast, modal, textarea, field, select,
  priorityBadge,
} from "../ui.js";
import { formByCode, formName } from "../forms/renderer.js";
import { formSelect, techSelect } from "../pickers.js";

const L = (ar, en) => (lang === "ar" ? ar : en);

export async function approvalsView(page, state) {
  const host = el("div", {});
  page.append(
    pageHead(L("الاعتمادات", "Approvals"),
             L("بلاغات رفعها الفنيون وسجلات أرسلوها — تنتظر قرارك",
               "Requests raised and records sent by technicians, awaiting your decision")),
    host
  );
  host.append(loading());

  let rows = [], pending = [], people = {}, techGroups = {};
  async function load() {
    const [recs, pend, list, groups] = await Promise.all([
      records.list({ state: "sent", limit: 100 }),
      tasks.list({ status: "pending", limit: 100 }),
      profiles.all().catch(() => []),
      profiles.techniciansBySpecialty().catch(() => ({})),
    ]);
    rows = recs;
    pending = pend;
    techGroups = groups;
    people = Object.fromEntries(list.map((p) => [p.id, p.full_name || p.email]));
  }

  try { await load(); }
  catch (err) { host.replaceChildren(empty(L("تعذّر التحميل", "Could not load"), err.message, "⚠")); return; }

  function draw() {
    if (!rows.length && !pending.length) {
      host.replaceChildren(empty(
        L("لا شيء ينتظر قرارك", "Nothing awaiting your decision"),
        L("كل ما وصلك جرى البتّ فيه", "Everything received has been decided"), "✓"));
      return;
    }

    const frag = el("div", { class: "stack" });

    /* البلاغات الميدانية أولًا: كل بلاغ معلّق عطلٌ قائم لم يبدأ عليه أحد،
       بينما السجلّ المرسَل عملٌ تمّ وينتظر توثيقه. الأول أعجل. */
    if (pending.length) {
      frag.append(
        el("div", { class: "section-title",
                    text: L("بلاغات من الميدان", "Field requests") + " · " + pending.length }),
        el("div", { class: "field-list" }, ...pending.map(reportCard))
      );
    }
    if (rows.length) {
      frag.append(
        el("div", { class: "section-title" + (pending.length ? " mt-6" : ""),
                    text: L("سجلات بانتظار الاعتماد", "Records awaiting approval") + " · " + rows.length }),
        el("div", { class: "field-list" }, ...rows.map(card))
      );
    }
    host.replaceChildren(frag);
  }

  /* ─── البلاغ الميداني ──────────────────────────────────────────────────── */

  function reportCard(r) {
    return el("article", { class: "task-card p-" + (r.priority || "medium") },
      el("div", { class: "task-top" },
        el("div", { class: "grow" },
          el("div", { class: "row wrap", style: "gap:6px;margin-bottom:6px" },
            priorityBadge(r.priority),
            r.specialty ? el("span", { class: "badge", text: t("sp_" + r.specialty) }) : null
          ),
          el("div", { class: "task-title", text: r.title })
        )
      ),
      el("div", { class: "task-meta" },
        el("span", {}, "#", String(r.seq ?? "")),
        r.location ? el("span", { text: "◎ " + r.location }) : null,
        el("span", { text: "◔ " + fmtStamp(r.created_at) }),
        el("span", { text: "✎ " + (people[r.created_by] || "—") })
      ),
      r.description ? el("p", { class: "small muted mt-2", text: r.description }) : null,
      el("div", { class: "task-actions" },
        el("button", { class: "btn btn-ghost", onclick: () => decideReport(r, "reject"),
                       text: L("رفض بسبب", "Reject with reason") }),
        el("button", { class: "btn btn-primary", onclick: () => decideReport(r, "approve"),
                       text: "✓ " + L("اعتماد وإسناد", "Approve and assign") })
      )
    );
  }

  /* الاعتماد قرار وإسناد في خطوة واحدة: بلاغ معتمد بلا فنيّ ولا نموذج
     يبقى معلّقًا بصورة أخرى. والافتراض أن من رفعه يتولّاه — رآه بعينه. */
  function decideReport(r, decision) {
    const rej = decision === "reject";
    const note = textarea({ rows: 3, placeholder: rej
      ? L("لماذا لم يُعتمد؟ يقرؤه من رفعه", "Why not approved? The reporter reads this")
      : L("ملاحظة اختيارية للفني", "Optional note to the technician") });

    let tech = null, form = null, prio = null;
    const body = el("div", { class: "stack" });

    if (rej) {
      body.append(el("p", { class: "small muted",
        text: L("يُلغى البلاغ ويظهر لرافعه ومعه سببك.",
                "The request is cancelled and shown to its reporter with your reason.") }));
    } else {
      tech = techSelect(techGroups, r.created_by);
      form = formSelect(r.form_code || "WO-01");
      prio = select(["critical", "high", "medium"].map((x) => ({ value: x, label: t("pr_" + x) })),
                    { value: r.priority || "medium" });
      body.append(
        el("p", { class: "small muted",
          text: L("يصير مهمة مسندة، وتبدأ مهلتها حين يفتحها الفني.",
                  "It becomes an assigned task; its clock starts when the technician opens it.") }),
        el("div", { class: "grid-fields" },
          field(t("assignedTo"), tech),
          field(t("priority"), prio)
        ),
        field(L("النموذج المطلوب", "Required form"), form,
              { hint: L("الذي يفتحه الفني على المهمة", "What the technician opens on the task") })
      );
    }
    body.append(field(L("ملاحظة", "Note"), note, { required: rej }));

    modal({
      title: (rej ? L("رفض بلاغ", "Reject request") : L("اعتماد بلاغ", "Approve request"))
             + " — " + r.title,
      body,
      actions: [
        { label: L("إلغاء", "Cancel") },
        {
          label: rej ? L("رفض", "Reject") : L("اعتماد وإسناد", "Approve and assign"),
          kind: rej ? "btn-danger" : "btn-primary",
          onClick: () => {
            const txt = note.value.trim();
            if (rej && !txt) {
              toast(L("الرفض يتطلب سببًا", "A rejection needs a reason"), "warn");
              note.focus();
              return false;
            }
            runReport(r, decision, {
              note: txt,
              assign: rej ? null : (tech.value || null),
              form: rej ? null : (form.value || null),
              priority: rej ? null : (prio.value || null),
            });
          },
        },
      ],
    });
    (rej ? note : tech).focus();
  }

  async function runReport(r, decision, opts) {
    try {
      await tasks.review(r.id, decision, opts);
      pending = pending.filter((x) => x.id !== r.id);
      draw();
      toast(decision === "approve"
        ? L("اعتُمد وأُسند ✓", "Approved and assigned")
        : L("رُفض البلاغ وأُبلغ رافعه", "Rejected — the reporter was told"), "ok");
    } catch (err) {
      toast(err.message || L("تعذّر تنفيذ القرار", "Could not apply the decision"), "danger", 6000);
    }
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
