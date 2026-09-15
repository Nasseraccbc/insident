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
} from "../ui.js";

const ORDER = { critical: 0, high: 1, medium: 2 };

export async function mytasksView(page, state) {
  page.append(pageHead(t("navMyTasks"), `${t("welcome")} ${state.profile.full_name}`));

  const host = el("div", {});
  page.append(host);
  host.append(loading());

  const timers = [];
  const stopAll = () => { timers.forEach((x) => x.stop()); timers.length = 0; };

  async function load() {
    stopAll();
    host.replaceChildren(loading());

    let rows;
    try {
      rows = await tasks.list({ assignedTo: state.profile.id });
    } catch (err) {
      host.replaceChildren(empty(t("errNet"), err.message, "⚠"));
      return;
    }

    const active = rows.filter((r) => r.status !== "done" && r.status !== "cancelled");
    const done = rows.filter((r) => r.status === "done");

    if (!rows.length) {
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
