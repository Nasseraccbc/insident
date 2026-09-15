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
  FORMS, formByCode, formName, renderSection, blankData, completion, tr, isWidgetSection,
} from "../forms/renderer.js";
import { photoGrid, uploadAll, loadExisting } from "../photos.js";
import { slaPanel, stampOpen, priorityOf, CLASS_OF } from "../forms/timer.js";

const L2 = (ar, en) => (lang === "ar" ? ar : en);

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
    /* فتح البلاغ هو بدء التنفيذ: تُختم لحظته على الخادم، ومنها — لا من
       ساعة الجهاز — يبدأ عدّ الاستجابة والإنجاز. */
    if (task && !task.started_at && task.status !== "done" && task.status !== "cancelled") {
      task = await tasks.start(task.id).catch(() => task);
    }
    if (!record && form?.timer) {
      /* البلاغ القادم من مهمة يرث تصنيفها وموقعها: المشرف صنّفه عند
         التوزيع، فلا يُسأل الفني عنه من جديد ولا يقف العدّ بانتظاره. */
      if (task) {
        if (!data.cls && CLASS_OF[task.priority]) data.cls = CLASS_OF[task.priority];
        if (!data.loc && task.location) data.loc = task.location;
        if (!data.desc) data.desc = task.description || task.title || "";
      }
      const at = task?.started_at ? new Date(task.started_at) : new Date();
      if (stampOpen(form, data, at)) writeDraft(form.code, taskId, data);
      else writeDraft(form.code, taskId, data);
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
      /* البلاغ خرج من يد الفني (أُرسل أو أُنجزت مهمته): العدّ يتجمّد عند
         تلك اللحظة. مواصلته تُظهر تأخّرًا لم يقع. */
      const stoppedAt = record && record.state !== "draft"
        ? record.updated_at
        : task?.status === "done" ? task.completed_at : null;
      sla = slaPanel(form, data, {
        stoppedAt,
        onStamp: (k, v) => { data[k] = v; onFieldChange(); build(); },
      });
      body.append(sla.node);
    }

    (form.secs || []).forEach((sec, i) => {
      /* صناديق التوقيع اليدوية بقايا نموذج ورقي: تطلب اسمًا وتاريخًا
         وقرارًا يكتبها أي أحد بلا أثر. والاعتماد الحقيقي في هذا النظام
         قرار مسجَّل باسم صاحبه ووقته. عرض الاثنين يجعل للاعتماد مصدرين. */
      if (sec.sig) { body.append(approvalCard(record)); return; }
      // قسم الودجة المركّبة هو لبّ النموذج، فطيّه يخفي العمل الحقيقي
      body.append(renderSection(sec, data, onFieldChange,
        { open: i < 2 || isWidgetSection(sec) }));
    });

    /* الصور: يعرضها المحرّك لكل نموذج — التوثيق البصري مطلوب في كلها */
    body.append(
      el("section", { class: "form-sec" },
        el("div", { class: "sec-head static" },
          el("span", { class: "grow", text: lang === "ar" ? "الصور والتوثيق" : "Photos & evidence" })
        ),
        el("div", { class: "sec-body" },
          photoGrid(photos, () => {}, { recordId: () => record?.id || null }))
      )
    );

    /* ما سجّله المشرف لا يُعاد كتابته ولا يُعدَّل من الميدان: البلاغ وثيقة
       بدايتها عند مَن استقبله. الفني يكمل التنفيذ لا يعيد التسجيل. */
    const OWNED_BY_SUPERVISOR = ["no", "rdt", "rtm", "loc", "cls", "desc"];
    if (task && form.timer && state.profile.role === "technician" && !readOnly) {
      const first = body.querySelector(".form-sec .sec-body");
      if (first) {
        for (const k of OWNED_BY_SUPERVISOR) {
          const f = [...first.querySelectorAll(".field")].find(
            (n) => n.querySelector("label")?.textContent?.trim() ===
                   (form.secs[0].f.find((x) => x.k === k)?.l || "").trim());
          f?.querySelectorAll("input,select,textarea").forEach((n) => { n.disabled = true; });
        }
        first.prepend(el("div", { class: "note small mb-4",
          text: lang === "ar"
            ? "بيانات التسجيل سجّلها مشرف الموقع عند إسناد البلاغ — للعرض فقط، "
              + "عدا «النظام المعني» فهو من تحديدك، وعليه تنزل قائمة المعدات."
            : "Registration data was entered by the site supervisor — read only, "
              + "except \u00abSystem Concerned\u00bb which you set; the equipment list follows it." }));
      }
    }

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
        /* لا تُنهى المهمة هنا: الإرسال ليس إنجازًا بل طلب اعتماد. المهمة
           تُنجَز حين يعتمد المشرف، وتعود للعمل إن أرجعها — ويتكفّل بذلك
           review_record في القاعدة. */
        if (task && task.status !== "in_progress") {
          await tasks.update(task.id, { status: "in_progress" });
        }
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

/* ─── حالة الاعتماد بدل صندوق التوقيع الورقي ───────────────────────── */

  function approvalCard(record) {
    const st = record?.state;
    const map = {
      undefined: [L2("لم يُحفظ بعد", "Not saved yet"),
                  L2("بعد الحفظ والإرسال يصل البلاغ إلى مشرف الموقع لاعتماده.",
                     "Once saved and submitted the request reaches the site supervisor.")],
      draft:  [L2("مسودة — لم تُرسل", "Draft — not submitted"),
               L2("اضغط «إرسال» ليصل البلاغ إلى مشرف الموقع.",
                  "Press Submit to send the request to the site supervisor.")],
      sent:   [L2("بانتظار اعتماد مشرف الموقع", "Awaiting supervisor approval"),
               L2("أُرسل ولم يُبتّ فيه بعد. يعتمده المشرف أو يُرجعه بملاحظة.",
                  "Submitted and pending. The supervisor approves it or returns it with a note.")],
      closed: [L2("معتمد ومغلق", "Approved and closed"),
               L2("اعتمده مشرف الموقع، وصار وثيقة لا تُعدَّل.",
                  "Approved by the site supervisor; now an uneditable document.")],
    };
    const [title, sub] = map[st] || map.undefined;
    return el("section", { class: "card apv-card" + (st === "closed" ? " ok" : st === "sent" ? " wait" : "") },
      el("div", { class: "card-body" },
        el("div", { class: "apv-t", text: title }),
        el("div", { class: "small muted mt-2", text: sub })
      )
    );
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
/* الوصف قبل الرقم: المشرف في شاشة الاعتمادات يقرأ عنوانًا يفهم منه ما
   البلاغ. «REP-20260915-0831» رقم لا يقول شيئًا، والرقم محفوظ في النموذج
   ويظهر في السجل على أي حال. */
function pickTitle(form, data) {
  for (const k of ["desc", "topic", "title", "work", "site", "loc"]) {
    const v = data[k];
    if (v && String(v).trim()) return String(v).trim().replace(/\s+/g, " ").slice(0, 90);
  }
  for (const k of ["no", "wo", "ref"]) {
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
