/* ============================================================================
   مكوّنات واجهة مشتركة — بناء DOM آمن بلا innerHTML لبيانات المستخدم
   ============================================================================ */

import { t, fmtDur } from "./i18n.js";

/** منشئ عناصر مختصر. النصوص تمرّ كـ textContent فلا يمكن حقن HTML. */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;              // للأيقونات الثابتة فقط
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ─── التنبيهات ────────────────────────────────────────────────────────── */

export function toast(msg, kind = "info", ms = 4000) {
  let host = document.getElementById("toasts");
  if (!host) {
    host = el("div", { id: "toasts" });
    document.body.append(host);
  }
  const icon = { ok: "✓", warn: "!", danger: "✕", info: "i" }[kind] || "i";
  const node = el("div", { class: "toast " + kind, role: "status" },
    el("b", { text: icon, class: "dim", style: "flex:none;width:14px;text-align:center" }),
    el("div", { class: "grow small", text: msg })
  );
  host.append(node);
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 200);
  }, ms);
}

/* ─── نافذة ────────────────────────────────────────────────────────────── */

export function modal({ title, body, actions = [], wide = false }) {
  const back = el("div", { class: "modal-back" });
  const box = el("div", { class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true" });

  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  box.append(
    el("div", { class: "modal-head" },
      el("h3", { text: title }),
      el("button", { class: "btn btn-ghost btn-icon", onclick: close, "aria-label": t("close"), text: "✕" })
    ),
    el("div", { class: "modal-body" }, body),
    actions.length
      ? el("div", { class: "modal-foot" },
          ...actions.map((a) =>
            el("button", {
              class: "btn " + (a.kind || ""),
              onclick: () => { const r = a.onClick?.(); if (r !== false) close(); },
            }, a.label)
          ))
      : null
  );

  back.append(box);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", onKey);
  document.body.append(back);
  box.querySelector("input,select,textarea,button")?.focus();
  return { close };
}

export function confirmDialog(title, message, onYes) {
  modal({
    title,
    body: el("p", { text: message }),
    actions: [
      { label: t("cancel") },
      { label: t("confirm"), kind: "btn-danger", onClick: onYes },
    ],
  });
}

/* ─── حالات ────────────────────────────────────────────────────────────── */

export function empty(title, sub, icon = "◎") {
  return el("div", { class: "empty" },
    el("div", { class: "empty-icon", text: icon }),
    el("div", { class: "empty-title", text: title || t("noData") }),
    el("div", { class: "small", text: sub || t("noDataSub") })
  );
}

export function loading(label) {
  return el("div", { class: "empty" },
    el("div", { class: "row", style: "justify-content:center;gap:10px" },
      el("div", { class: "spinner" }),
      el("span", { class: "small", text: label || t("loading") })
    )
  );
}

export function errorBox(message, onRetry) {
  return el("div", { class: "empty" },
    el("div", { class: "empty-icon", text: "⚠" }),
    el("div", { class: "empty-title", text: message }),
    onRetry ? el("button", { class: "btn mt-4", onclick: onRetry, text: t("retry") }) : null
  );
}

/* ─── شارات ────────────────────────────────────────────────────────────── */

const STATE_KIND = {
  draft: "", sent: "badge-info", review: "badge-info",
  approved: "badge-brand", client: "badge-warn", closed: "badge-ok",
};

export function stateBadge(state) {
  return el("span", { class: "badge " + (STATE_KIND[state] || ""), text: t("st_" + state) });
}

const PRIORITY_KIND = { critical: "badge-danger", high: "badge-warn", medium: "badge-info" };

export function priorityBadge(p) {
  if (!p) return el("span", { class: "dim", text: "—" });
  return el("span", { class: "badge " + (PRIORITY_KIND[p] || ""), text: t("pr_" + p) });
}

export function taskStatusBadge(s) {
  const kind = { pending: "badge-warn", new: "badge-info", assigned: "badge-brand",
                 in_progress: "badge-warn", done: "badge-ok", cancelled: "" }[s] || "";
  return el("span", { class: "badge " + kind, text: t("ts_" + s) });
}

/* ─── بطاقة إحصائية ────────────────────────────────────────────────────── */

export function stat(label, value, note, kind = "") {
  return el("div", { class: "stat " + (kind ? "is-" + kind : "") },
    el("div", { class: "stat-label", text: label }),
    el("div", { class: "stat-value", text: value }),
    note ? el("div", { class: "stat-note", text: note }) : null
  );
}

/* ─── مؤقّت حيّ ────────────────────────────────────────────────────────── */
/* يُرجع العنصر ودالة إيقاف — الشاشة مسؤولة عن الإيقاف عند مغادرتها،
   وإلا بقيت مؤقتات معلّقة تستهلك بطارية الجوّال. */

export function liveTimer(dueAt, { stoppedAt } = {}) {
  const node = el("span", { class: "task-timer" });
  if (!dueAt) { node.textContent = "—"; return { node, stop() {} }; }

  const due = new Date(dueAt).getTime();
  const paint = (left) => {
    node.textContent = fmtDur(left);
    node.className = "task-timer " + (left < 0 ? "late" : left < 15 * 60000 ? "warn" : "ok");
  };

  // مهمة انتهت: الوقت يتجمّد عند لحظة إنجازها. مواصلة العدّ بعد الإنجاز
  // تُظهر تأخّرًا لم يقع، وتكذب على مؤشر الالتزام.
  if (stoppedAt) {
    paint(due - new Date(stoppedAt).getTime());
    node.classList.add("frozen");
    return { node, stop() {} };
  }

  paint(due - Date.now());
  const id = setInterval(() => paint(due - Date.now()), 1000);
  return { node, stop: () => clearInterval(id) };
}

/* ─── جدول ─────────────────────────────────────────────────────────────── */

export function table(columns, rows, renderRow) {
  if (!rows.length) return empty();
  return el("div", { class: "table-wrap" },
    el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ...columns.map((c) => el("th", { text: c })))),
      el("tbody", {}, ...rows.map(renderRow))
    )
  );
}

/* ─── حقل ──────────────────────────────────────────────────────────────── */

export function field(label, control, { required, hint } = {}) {
  return el("div", { class: "field" },
    el("label", {}, label, required ? el("span", { class: "req", text: "*" }) : null),
    control,
    hint ? el("div", { class: "hint", text: hint }) : null
  );
}

export function input(attrs = {}) { return el("input", { class: "input", ...attrs }); }
export function textarea(attrs = {}) { return el("textarea", { class: "textarea", ...attrs }); }

export function select(options, attrs = {}) {
  const s = el("select", { class: "select", ...attrs });
  for (const o of options) {
    s.append(el("option", { value: o.value, selected: o.value === attrs.value }, o.label));
  }
  return s;
}

/* ─── رأس الصفحة ───────────────────────────────────────────────────────── */

export function pageHead(title, sub, crumbs = [], actions = []) {
  return el("div", { class: "page-head" },
    el("div", {},
      crumbs.length ? el("div", { class: "crumbs" }, ...crumbs.map((c) => el("span", { text: c }))) : null,
      el("h1", { class: "page-title", text: title }),
      sub ? el("div", { class: "page-sub", text: sub }) : null
    ),
    actions.length ? el("div", { class: "row wrap" }, ...actions) : null
  );
}
