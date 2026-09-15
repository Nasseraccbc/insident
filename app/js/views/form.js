/* ============================================================================
   شاشة تعبئة النموذج.

   المسارات:
     #/forms                   قائمة النماذج
     #/forms/<CODE>            نموذج جديد
     #/forms/<CODE>/<taskId>   نموذج مرتبط بمهمة
     #/forms/r/<recordId>      فتح سجل محفوظ

   حفظ تلقائي محلي كل ثانيتين: الفني في الميدان قد ينقطع نته أو يُقفل جواله،
   وإعادة تعبئة أربعين حقلًا من الصفر تجربة لا تُحتمل.
   ============================================================================ */

import { records, tasks, profiles } from "../db.js";
import { t, lang, fmtStamp } from "../i18n.js";
import {
  el, pageHead, empty, loading, toast, stateBadge, priorityBadge,
  field, select, modal, confirmDialog,
} from "../ui.js";
import {
  FORMS, formByCode, formName, renderSection, blankData, completion, tr,
} from "../forms/renderer.js";
import { photoGrid, uploadAll, loadExisting } from "../photos.js";
import { slaPanel, stampOpen, priorityOf } from "../forms/timer.js";

const DRAFT_KEY = (code, taskId) => `sce_draft_${code}_${taskId || "new"}`;

export async function formView(page, state) {
  const parts = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  const arg1 = parts[1];
  const arg2 = parts[2];

  if (!arg1) return formsList(page, state);
  if (arg1 === "r" && arg2) return formEditor(page, state, { recordId: arg2 });

  const form = formByCode(arg1);
  if (!form) {
    page.append(empty(lang === "ar" ? "نموذج غير معروف" : "Unknown form", arg1, "⚠"));
    return;
  }
  return formEditor(page, state, { form, taskId: arg2 });
}

/* ─── قائمة النماذج ────────────────────────────────────────────────────── */

function formsList(page) {
  page.append(pageHead(t("navForms"), `${FORMS.length} ${lang === "ar" ? "نموذجًا" : "forms"}`));

  const groups = {};
  for (const f of FORMS) {
    const key = f.code.split("-")[0];
    (groups[key] ||= []).push(f);
  }

  const wrap = el("div", { class: "stack" });
  for (const [key, list] of Object.entries(groups)) {
    const grid = el("div", { class: "grid-3" });
    for (const f of list) {
      grid.append(
        el("a", { class: "form-card", href: "#/forms/" + f.code },
          el("div", { class: "form-code", text: f.code }),
          el("div", { class: "form-name", text: formName(f) }),
          el("div", { class: "tiny dim", text: tr(f.owner || "") }),
          el("div", { class: "tiny dim mt-2",
                      text: `${(f.secs || []).length} ${lang === "ar" ? "قسمًا" : "sections"}` })
        )
      );
    }
    wrap.append(el("div", {}, el("div", { class: "section-title", text: key }), grid));
  }
  page.append(wrap);
}

/* ─── المحرّر ──────────────────────────────────────────────────────────── */

async function formEditor(page, state, { form, taskId, recordId }) {
  const host = el("div", {});
  page.append(host);
  host.append(loading());

  let record = null;
  let task = null;
  let data = null;
  let history = [];
  let people = {};
  const photos = {};

  /* تحميل */
  try {
    if (recordId) {
      record = await records.get(recordId);
      form = formByCode(record.form_code);
      data = { ...blankData(form), ...(record.data || {}) };
      await loadExisting(recordId, photos);
      history = await records.history(recordId).catch(() => []);
    } else {
      data = blankData(form);
      const saved = readDraft(form.code, taskId);
      if (saved) Object.assign(data, saved);
      // بلاغ جديد: تُختم لحظة الفتح في رقم البلاغ وتاريخه ووقته، ومنها
      // يبدأ عدّ الاستجابة والإنجاز — كما كان في النظام القديم.
      if (stampOpen(form, data)) writeDraft(form.code, taskId, data);
    }
    if (taskId) {
      const list = await tasks.list({});
      task = list.find((x) => x.id === taskId) || null;
      if (task?.record_id && !record) {
        record = await records.get(task.record_id);
        data = { ...blankData(form), ...(record.data || {}) };
        await loadExisting(record.id, photos);
        history = await records.history(record.id).catch(() => []);
      }
    }
  } catch (err) {
    host.replaceChildren(empty(t("errNet"), err.message, "⚠"));
    return;
  }

  if (history.length) {
    const list = await profiles.all().catch(() => []);
    people = Object.fromEntries(list.map((p) => [p.id, p.full_name || p.email]));
  }

  const readOnly = record?.state === "closed" && state.profile.role !== "admin";

  /* ─── رأس الصفحة ─── */
  const pct = el("i", {});
  const pctText = el("span", { class: "tiny dim" });
  const bar = el("div", { class: "bar", style: "width:140px" }, pct);

  // الكحلي للإجراء الأساسي كما في التصميم القديم، والثانوي محايد بإطار.
  // الكهرماني يبقى للتنبيه والشارات لا لزرّ يُضغط كل يوم.
  const saveBtn = el("button", { class: "btn", onclick: () => save(false) },
    "💾 " + t("save"));
  const submitBtn = el("button", { class: "btn btn-primary", onclick: () => save(true) },
    "✓ " + t("submit"));

  page.insertBefore(
    pageHead(
      formName(form),
      form.code + (task ? " · " + task.title : ""),
      [t("navForms"), form.code],
      readOnly ? [] : [bar, pctText, saveBtn, submitBtn]
    ),
    host
  );

  function refreshProgress() {
    const c = completion(form, data);
    pct.style.width = c.pct + "%";
    bar.className = "bar " + (c.pct === 100 ? "ok" : c.pct > 50 ? "" : "warn");
    pctText.textContent = `${c.filled}/${c.total} · ${c.pct}%`;
  }

  /* ─── الجسم ─── */
  let autosaveTimer = null;

  let sla = null;

  function onFieldChange() {
    refreshProgress();
    sla?.refresh();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => writeDraft(form.code, taskId, data), 2000);
  }

  function build() {
    const body = el("div", { class: "stack" });

    if (record) {
      body.append(
        el("div", { class: "card" }, el("div", { class: "card-body row wrap" },
          stateBadge(record.state),
          record.priority ? priorityBadge(record.priority) : null,
          el("span", { class: "tiny dim", text: t("createdAt") + ": " + fmtStamp(record.created_at) }),
          record.ref_no ? el("span", { class: "badge", text: record.ref_no }) : null
        ))
      );

      // الإرجاع بلا إبراز يضيع بين الحقول: الفني يفتح النموذج ولا يعرف لماذا
      // عاد إليه. الملاحظة أول ما يقع عليه بصره.
      const back = lastReturn(history);
      if (back && record.state === "draft") {
        body.append(el("div", { class: "card ret-card" },
          el("div", { class: "card-body" },
            el("div", { class: "ret-head" },
              el("span", { text: "↩" }),
              el("span", { text: lang === "ar" ? "أُرجع للتصحيح" : "Returned for correction" })),
            el("p", { class: "ret-note", text: back.note || "" }),
            el("div", { class: "tiny dim",
                        text: (people[back.by_user] || "—") + " · " + fmtStamp(back.at) })
          )
        ));
      }

      if (history.length) body.append(timeline(history, people));
    }

    /* المؤقّت أعلى النموذج: الفني يراه قبل أن يبدأ التعبئة لا بعدها */
    sla?.stop();
    if (form.timer) {
      sla = slaPanel(form, data);
      body.append(sla.node);
    }

    (form.secs || []).forEach((sec, i) => {
      body.append(renderSection(sec, data, onFieldChange, { open: i < 2 }));
    });

    /* الصور: يعرضها المحرّك لكل نموذج — التوثيق البصري مطلوب في كلها */
    body.append(
      el("section", { class: "form-sec" },
        el("div", { class: "sec-head static" },
          el("span", { class: "grow", text: lang === "ar" ? "الصور والتوثيق" : "Photos & evidence" })
        ),
        el("div", { class: "sec-body" }, photoGrid(photos, () => {}))
      )
    );

    if (readOnly) {
      // أزرار الطيّ والتصفية ليست إدخالًا: تعطيلها يحبس محتوى سجل مغلق
      // خلف أقسام لا تُفتح — وهي حالة العرض الأكثر شيوعًا للمراجِع.
      body.querySelectorAll("input,select,textarea,button").forEach((n) => {
        if (!n.closest(".page-head") && n.dataset.ui !== "toggle") n.disabled = true;
      });
      body.prepend(el("div", { class: "card" },
        el("div", { class: "card-body small muted",
          text: lang === "ar" ? "السجل مغلق ومعتمد — للعرض فقط"
                              : "Record closed and approved — read only" })));
    }

    host.replaceChildren(body);
    refreshProgress();
  }

  /* ─── الحفظ ─── */
  async function save(submit) {
    saveBtn.disabled = submitBtn.disabled = true;
    const label = saveBtn.textContent;
    saveBtn.textContent = lang === "ar" ? "جارٍ الحفظ…" : "Saving…";

    try {
      const payload = {
        form_code: form.code,
        title: pickTitle(form, data) || formName(form),
        location: data.site || data.loc || data.location || null,
        data,
      };

      // تصنيف البلاغ يقود أولوية السجل، ومنها تحسب القاعدة مواعيد SLA
      const pr = priorityOf(form, data);
      if (pr) payload.priority = pr;

      if (record) {
        record = await records.update(record.id, payload);
      } else {
        record = await records.create({
          ...payload,
          state: "draft",
          // أولوية النموذج تسبق أولوية المهمة: تصنيف البلاغ أدقّ ممّا
          // قدّره المشرف عند التوزيع. وترتيب المفاتيح هنا مهم — كان
          // السطر يأتي بعد نشر payload فيدهس القيمة بـ null.
          priority: payload.priority || task?.priority || null,
          created_by: state.profile.id,
          assigned_to: task?.assigned_to || state.profile.id,
        });
        if (task) await tasks.update(task.id, { record_id: record.id });
      }

      const up = await uploadAll(photos, { recordId: record.id, userId: state.profile.id });
      if (up.failed.length) {
        toast((lang === "ar" ? "تعذّر رفع: " : "Failed to upload: ") + up.failed.join(", "), "warn", 6000);
      }

      if (submit) {
        record = await records.update(record.id, { state: "sent" });
        if (task) await tasks.update(task.id, { status: "done", completed_at: new Date().toISOString() });
      }

      clearDraft(form.code, taskId);
      toast(t("save") + " ✓" + (up.done.length ? ` · ${up.done.length} 📷` : ""), "ok");

      if (submit) { location.hash = "#/" + (task ? "mytasks" : "records"); return; }
      build();
    } catch (err) {
      console.error(err);
      toast(err.message || t("errNet"), "danger", 7000);
    } finally {
      saveBtn.disabled = submitBtn.disabled = false;
      saveBtn.textContent = label;
    }
  }

  build();

  return () => {
    sla?.stop();
    clearTimeout(autosaveTimer);
    for (const p of Object.values(photos)) {
      if (p?.url?.startsWith("blob:")) URL.revokeObjectURL(p.url);
    }
  };
}

/* ─── خطّ زمن الاعتماد ─────────────────────────────────────────────────── */
/* من نقل السجل ومتى وبأي ملاحظة — هذا هو الدليل عند الخلاف بعد أشهر. */

const TL_LABEL = {
  draft:   ["مسودة", "Draft"],
  sent:    ["أُرسل للاعتماد", "Sent for approval"],
  review:  ["قيد المراجعة", "Under review"],
  approved:["معتمد داخليًا", "Approved internally"],
  client:  ["مرفوع للهيئة", "Raised to client"],
  closed:  ["اعتُمد وأُغلق", "Approved and closed"],
};

/** آخر انتقال أعاد السجل مسودة — أي إرجاع من المشرف. */
function lastReturn(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.to_state === "draft" && h.from_state) return h;
  }
  return null;
}

function timeline(history, people) {
  const rows = [...history].reverse().map((h) => {
    const lbl = TL_LABEL[h.to_state] || [h.to_state, h.to_state];
    const ret = h.to_state === "draft" && h.from_state;
    return el("li", { class: "tl-item" + (ret ? " ret" : "") },
      el("div", { class: "tl-dot" }),
      el("div", { class: "grow" },
        el("div", { class: "tl-title",
                    text: ret ? (lang === "ar" ? "أُرجع للتصحيح" : "Returned for correction")
                              : lbl[lang === "ar" ? 0 : 1] }),
        h.note ? el("div", { class: "tl-note", text: h.note }) : null,
        el("div", { class: "tiny dim",
                    text: (people[h.by_user] || "—") + " · " + fmtStamp(h.at) })
      )
    );
  });

  return el("details", { class: "card tl-card" },
    el("summary", { text: (lang === "ar" ? "سجل الاعتماد" : "Approval history") +
                          ` (${history.length})` }),
    el("ul", { class: "tl" }, ...rows)
  );
}

/* ─── مساعدات ──────────────────────────────────────────────────────────── */

/** يبحث عن أول حقل يصلح عنوانًا للسجل في الجداول. */
function pickTitle(form, data) {
  for (const k of ["no", "wo", "ref", "topic", "title", "site", "loc"]) {
    const v = data[k];
    if (v && String(v).trim()) return String(v).trim().slice(0, 120);
  }
  return null;
}

function readDraft(code, taskId) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(code, taskId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeDraft(code, taskId, data) {
  try { localStorage.setItem(DRAFT_KEY(code, taskId), JSON.stringify(data)); } catch {}
}

function clearDraft(code, taskId) {
  try { localStorage.removeItem(DRAFT_KEY(code, taskId)); } catch {}
}
