/* ============================================================================
   لوحة الفني — الجوّال أولًا.

   الفني في الميدان بيد واحدة وأحيانًا بقفاز وتحت شمس. لذلك:
   بطاقات لا جداول · إجراء واحد بارز لكل بطاقة · لمسات ٥٢px · مؤقّت كبير.
   ============================================================================ */

import { tasks } from "../db.js";
import { CLOSE_MIN } from "../forms/timer.js";
import { t, lang, fmtStamp } from "../i18n.js";
import {
  el, pageHead, empty, loading, liveTimer, taskStatusBadge, priorityBadge, toast,
  modal, field, input, textarea, select,
} from "../ui.js";

const ORDER = { critical: 0, high: 1, medium: 2 };
const PRIORITIES = ["critical", "high", "medium"];
const L = (ar, en) => (lang === "ar" ? ar : en);

export async function mytasksView(page, state) {
  page.append(pageHead(t("navMyTasks"), `${t("welcome")} ${state.profile.full_name}`, [], [
    el("button", { class: "btn btn-primary", onclick: () => openReport() },
      "+ " + L("رفع بلاغ", "Raise a request")),
  ]));

  const host = el("div", {});
  page.append(host);
  host.append(loading());

  const timers = [];
  const stopAll = () => { timers.forEach((x) => x.stop()); timers.length = 0; };

  async function load() {
    stopAll();
    host.replaceChildren(loading());

    let rows, mine;
    try {
      [rows, mine] = await Promise.all([
        tasks.list({ assignedTo: state.profile.id }),
        tasks.list({ createdBy: state.profile.id }),
      ]);
    } catch (err) {
      host.replaceChildren(empty(t("errNet"), err.message, "⚠"));
      return;
    }

    const active = rows.filter((r) => r.status !== "done" && r.status !== "cancelled");
    const done = rows.filter((r) => r.status === "done");

    /* بلاغات رفعها هو: المعلّقة تنتظر المشرف، والمرفوضة تحمل سببها.
       أمّا المعتمدة فتصير مهمة مسندة إليه وتظهر أعلاه — فلا تُكرَّر هنا. */
    const raised = mine.filter((r) =>
      r.status === "pending" || (r.status === "cancelled" && r.reviewed_at));

    if (!rows.length && !raised.length) {
      host.replaceChildren(empty(t("noData"), t("noDataSub"), "◉"));
      return;
    }

    active.sort((a, b) =>
      (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9) ||
      new Date(a.created_at) - new Date(b.created_at)
    );

    const list = el("div", { class: "field-list" });
    for (const task of active) list.append(card(task));

    const frag = el("div", { class: "stack" }, list);

    if (raised.length) {
      frag.append(
        el("div", { class: "section-title mt-6",
                    text: L("بلاغات رفعتها", "Requests you raised") + " · " + raised.length }),
        el("div", { class: "field-list" }, ...raised.map(raisedCard))
      );
    }

    if (done.length) {
      frag.append(
        el("div", { class: "section-title mt-6", text: `${t("ts_done")} · ${done.length}` }),
        el("div", { class: "field-list" }, ...done.slice(0, 10).map(card))
      );
    }

    host.replaceChildren(frag);
  }

  /** مهلة مقروءة: «٢٤ ساعة» لا «1440». */
  function fmtSpan(min) {
    if (!min) return "—";
    const h = Math.floor(min / 60), m = min % 60;
    if (lang !== "ar") return h ? `${h}h${m ? " " + m + "m" : ""}` : `${m}m`;
    return h ? `${h} ساعة${m ? ` و${m} د` : ""}` : `${m} دقيقة`;
  }

  function card(task) {
    /* الساعة لا تجري قبل أن يفتح الفني البلاغ: قبل ذلك تُعرض المهلة رقمًا
       ساكنًا. وبعد البدء تُحتسب من started_at المختوم على الخادم + مهلة
       الأولوية — وهي المهلة نفسها التي يعرضها النموذج، لا ساعة رابعة. */
    const mins = CLOSE_MIN[task.priority];
    const dueISO = task.started_at && mins
      ? new Date(new Date(task.started_at).getTime() + mins * 60000).toISOString()
      : task.due_at;

    let clock, clockNote;
    if (!task.started_at) {
      clock = { node: el("span", { class: "task-timer idle", text: fmtSpan(mins) }), stop() {} };
      clockNote = lang === "ar" ? "المهلة تبدأ عند الفتح" : "starts when opened";
    } else {
      clock = liveTimer(dueISO, { stoppedAt: task.completed_at });
      clockNote = task.completed_at
        ? (lang === "ar" ? "عند الإنجاز" : "at completion")
        : (lang === "ar" ? "متبقٍ للإنجاز" : "left to complete");
    }
    const timer = clock;
    timers.push(timer);

    const actions = el("div", { class: "task-actions" });

    /* ضغطة واحدة تفتح البلاغ وتبدأ التوقيت. كانت ضغطتين — «ابدأ» ثم «افتح
       النموذج» — والفني تحت ضغط البلاغ يضغط الأولى ويمضي، فيبقى النموذج
       فارغًا والساعة تجري بلا تعبئة. البدء يُختم على الخادم عند الفتح. */
    if (task.status === "new" || task.status === "assigned") {
      actions.append(el("button", {
        class: "btn btn-primary", onclick: () => openForm(task),
      }, "▶ " + (lang === "ar" ? "ابدأ البلاغ" : "Start request")));
    } else if (task.status === "in_progress") {
      actions.append(
        el("button", { class: "btn btn-primary", onclick: () => openForm(task) },
          "✎ " + (lang === "ar" ? "أكمل " : "Continue ") + (task.form_code || "")),
        el("button", {
          class: "btn",
          onclick: () => change(task, { status: "done" }),
        }, "✓ " + t("ts_done"))
      );
    }

    return el("div", { class: "task-card p-" + (task.priority || "medium") },
      el("div", { class: "task-top" },
        el("div", { class: "grow" },
          // الأولوية بشارة نصية لا بلون الحافة وحده: تحت شمس الميدان قد لا
          // يُميَّز اللون، ومَن لا يميّز الألوان لا يراه أصلًا.
          el("div", { class: "row wrap", style: "gap:6px;margin-bottom:6px" },
            priorityBadge(task.priority),
            task.specialty ? el("span", { class: "badge", text: t("sp_" + task.specialty) }) : null
          ),
          el("div", { class: "task-title", text: task.title }),
          el("div", { class: "task-meta" },
            el("span", {}, "#", String(task.seq ?? "")),
            task.location ? el("span", {}, "⌖ ", task.location) : null,
            el("span", {}, "◷ ", fmtStamp(task.created_at))
          )
        ),
        el("div", { style: "text-align:center;flex:none" },
          timer.node,
          el("div", { class: "tiny dim", text: clockNote }),
          el("div", { class: "mt-2" }, taskStatusBadge(task.status))
        )
      ),
      task.description ? el("p", { class: "small muted mt-2", text: task.description }) : null,
      actions.childElementCount ? actions : null
    );
  }

  /* بطاقة بلاغ مرفوع: لا مؤقّت ولا زرّ بدء — لم يُعتمد بعد فلا عمل عليه. */
  function raisedCard(r) {
    const waiting = r.status === "pending";
    return el("div", { class: "task-card p-" + (r.priority || "medium") },
      el("div", { class: "task-top" },
        el("div", { class: "grow" },
          el("div", { class: "row wrap", style: "gap:6px;margin-bottom:6px" },
            priorityBadge(r.priority),
            taskStatusBadge(waiting ? "pending" : "cancelled")
          ),
          el("div", { class: "task-title", text: r.title }),
          el("div", { class: "task-meta" },
            el("span", {}, "#", String(r.seq ?? "")),
            r.location ? el("span", {}, "⌖ ", r.location) : null,
            el("span", {}, "◷ ", fmtStamp(r.created_at))
          )
        )
      ),
      r.description ? el("p", { class: "small muted mt-2", text: r.description }) : null,
      waiting
        ? el("div", { class: "note small mt-2",
            text: L("وصل إلى مشرف الموقع. لا يبدأ عليه وقت حتى يعتمده.",
                    "Sent to the site supervisor. No clock runs until it is approved.") })
        : el("div", { class: "note danger mt-2" },
            el("b", { text: "✕ " + L("لم يُعتمد", "Not approved") }),
            el("p", { class: "small mt-2", text: r.review_note || "—" }),
            el("div", { class: "tiny dim", text: fmtStamp(r.reviewed_at) })
          )
    );
  }

  /* رفع البلاغ من الميدان. الفني يرى عطلًا لم يبلّغ عنه أحد، فلا ينتظر
     مشرفًا يسجّله — لكن رفعه ليس إسنادًا: يقف عند المشرف حتى يقرّر. */
  function openReport() {
    const title = input({ required: true });
    const desc = textarea({ rows: 3 });
    const loc = input({});
    const prio = select(PRIORITIES.map((p) => ({ value: p, label: t("pr_" + p) })),
                        { value: "medium" });

    modal({
      title: L("رفع بلاغ من الميدان", "Raise a field request"),
      body: el("div", { class: "stack" },
        field(L("ما المشكلة؟", "What is the problem?"), title, { required: true }),
        el("div", { class: "grid-fields" },
          field(t("priority"), prio),
          field(t("location"), loc, { hint: L("المبنى والدور", "Building and floor") })
        ),
        field(L("تفصيل ما رأيته", "Detail what you saw"), desc),
        el("p", { class: "small muted",
          text: L("يصل البلاغ إلى مشرف الموقع. إن اعتمده عاد إليك مهمةً وبدأت الإجراءات.",
                  "The request goes to the site supervisor. If approved it returns to you as a task and work begins.") })
      ),
      actions: [
        { label: t("cancel") },
        {
          label: L("رفع البلاغ", "Send request"), kind: "btn-primary",
          onClick: () => {
            if (!title.value.trim()) {
              toast(L("اكتب ما المشكلة", "Say what the problem is"), "warn");
              title.focus();
              return false;
            }
            send({
              title: title.value.trim(),
              description: desc.value.trim() || null,
              location: loc.value.trim() || null,
              priority: prio.value,
              specialty: state.profile.specialty || null,
              created_by: state.profile.id,
            });
          },
        },
      ],
    });
    title.focus();
  }

  async function send(row) {
    try {
      await tasks.report(row);
      toast(L("رُفع البلاغ — بانتظار اعتماد المشرف", "Request sent — awaiting supervisor approval"),
            "ok", 4000);
      load();
    } catch (err) {
      toast(err.message || t("errNet"), "danger", 6000);
    }
  }

  async function change(task, patch) {
    try {
      await tasks.update(task.id, patch);
      toast(t("save") + " ✓", "ok", 2000);
      load();
    } catch (err) {
      toast(err.message || t("errNet"), "danger");
    }
  }

  function openForm(task) {
    location.hash = "#/forms/" + (task.form_code || "") + "/" + task.id;
  }

  await load();
  return stopAll;   // الشاشة توقف مؤقتاتها عند مغادرتها — بطارية الجوّال
}
