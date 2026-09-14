/* ============================================================================
   هيكل التطبيق: شاشة الدخول · الشريط الجانبي · الشريط العلوي · التوجيه
   ============================================================================ */

import { auth, profiles } from "./db.js";
import { t, lang, toggleLang, applyDir } from "./i18n.js";
import { el, clear, toast, field, input, empty } from "./ui.js";
import { groupedRoutes, canAccess, homeRoute, routeLabel } from "./nav.js";

export const state = { user: null, profile: null, route: null };

const root = () => document.getElementById("root");

/* ─── المظهر ───────────────────────────────────────────────────────────── */

const THEME_KEY = "sce_theme";

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch {}
  const dark = saved ? saved === "dark"
    : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}

/* ─── شاشة الدخول ──────────────────────────────────────────────────────── */

export function renderLogin() {
  const emailEl = input({ type: "email", autocomplete: "username", required: true,
                          placeholder: "name@sce-ops.local" });
  const passEl  = input({ type: "password", autocomplete: "current-password", required: true });
  const msg     = el("div", { class: "err", style: "min-height:18px" });
  const btn     = el("button", { class: "btn btn-primary btn-block btn-lg", type: "submit" },
                     t("signIn"));

  const form = el("form", { class: "stack" },
    field(t("email"), emailEl, { required: true }),
    field(t("password"), passEl, { required: true }),
    msg,
    btn
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    btn.disabled = true;
    btn.textContent = t("signingIn");
    try {
      await auth.signIn(emailEl.value.trim(), passEl.value);
      // onAuthStateChange يتكفّل بإعادة الرسم
    } catch (err) {
      const net = /fetch|network|failed to/i.test(err?.message || "");
      msg.textContent = net ? t("errNet") : t("errCreds");
      passEl.value = "";
      passEl.focus();
      btn.disabled = false;
      btn.textContent = t("signIn");
    }
  });

  clear(root()).append(
    el("div", { class: "login-wrap" },
      el("div", { class: "login-card" },
        el("div", { class: "login-brand" },
          el("div", { class: "login-mark", text: "SCE" }),
          el("h2", { text: t("appName") }),
          el("div", { class: "small dim mt-2", text: t("org") })
        ),
        form,
        el("div", { class: "center mt-6" },
          el("button", { class: "btn btn-ghost btn-sm", onclick: () => { toggleLang(); renderLogin(); },
                         text: t("lang") }),
          el("button", { class: "btn btn-ghost btn-sm", onclick: toggleTheme, text: "◐" })
        )
      )
    )
  );
}

/* ─── الهيكل بعد الدخول ────────────────────────────────────────────────── */

function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
}

function buildSidebar() {
  const p = state.profile;
  const nav = el("nav", { class: "nav" });

  for (const g of groupedRoutes(p.role)) {
    const grp = el("div", { class: "nav-group" },
      el("div", { class: "nav-group-title", text: g.title })
    );
    for (const r of g.items) {
      grp.append(el("a", {
        class: "nav-item" + (state.route === r.id ? " active" : ""),
        href: "#/" + r.id,
        dataset: { route: r.id },
      },
        el("span", { class: "nav-ico", text: r.icon }),
        el("span", { class: "nav-label", text: t(r.label) })
      ));
    }
    nav.append(grp);
  }

  return el("aside", { class: "sidebar", id: "sidebar" },
    el("div", { class: "brand" },
      el("div", { class: "brand-mark", text: "SCE" }),
      el("div", { class: "brand-text" },
        el("div", { class: "brand-name", text: t("appName") }),
        el("div", { class: "brand-sub", text: "SCE-2026-0119" })
      )
    ),
    nav,
    el("div", { class: "side-foot" },
      el("button", { class: "nav-item", onclick: doSignOut },
        el("span", { class: "nav-ico", text: "⏻" }),
        el("span", { class: "nav-label", text: t("signOut") })
      )
    )
  );
}

function buildTopbar() {
  const p = state.profile;
  return el("header", { class: "topbar" },
    el("button", { class: "btn btn-ghost btn-icon burger", "aria-label": "menu",
                   onclick: toggleSidebar, text: "☰" }),
    el("div", { class: "search" },
      el("span", { class: "ico", text: "⌕" }),
      el("input", { type: "search", placeholder: t("search"), id: "globalSearch" })
    ),
    el("div", { class: "grow" }),
    el("button", { class: "btn btn-ghost btn-sm", onclick: () => { toggleLang(); render(); },
                   title: "language", text: t("lang") }),
    el("button", { class: "btn btn-ghost btn-icon", onclick: toggleTheme,
                   title: t("theme"), text: "◐" }),
    el("button", { class: "user-chip" },
      el("span", { class: "avatar", text: initials(p.full_name) }),
      el("span", { class: "user-meta" },
        el("span", { class: "user-name", text: p.full_name }),
        el("br"),
        el("span", { class: "user-role", text: t("role_" + p.role) })
      )
    )
  );
}

function toggleSidebar() {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  const open = sb.classList.toggle("open");
  document.getElementById("scrim")?.remove();
  if (open) {
    const scrim = el("div", { class: "scrim", id: "scrim", onclick: toggleSidebar });
    document.body.append(scrim);
  }
}

async function doSignOut() {
  await auth.signOut();
  location.hash = "";
}

/* ─── التوجيه ──────────────────────────────────────────────────────────── */

const views = {};

/** تسجيل شاشة: تُستدعى بـ (container) وتُرجع دالة تنظيف اختيارية. */
export function registerView(id, fn) { views[id] = fn; }

let cleanup = null;

function currentRoute() {
  const raw = (location.hash || "").replace(/^#\/?/, "").split("/")[0];
  const role = state.profile.role;
  if (raw && canAccess(role, raw)) return raw;
  return homeRoute(role);
}

export async function render() {
  applyDir();

  if (!state.profile) { renderLogin(); return; }

  state.route = currentRoute();

  cleanup?.();
  cleanup = null;

  const main = el("main", { class: "main" }, el("div", { class: "page", id: "page" }));
  clear(root()).append(
    el("div", { class: "app" }, buildSidebar(), buildTopbar(), main)
  );

  const page = document.getElementById("page");
  const view = views[state.route];

  if (!view) {
    page.append(empty(routeLabel(state.route) + " — " + t("soon"), t("soonSub"), "◔"));
    return;
  }

  try {
    cleanup = (await view(page, state)) || null;
  } catch (err) {
    console.error(err);
    page.append(empty(t("errNet"), err?.message || "", "⚠"));
    toast(err?.message || t("errNet"), "danger");
  }
}

/* ─── الإقلاع ──────────────────────────────────────────────────────────── */

export async function boot() {
  initTheme();
  applyDir();

  window.addEventListener("hashchange", () => { if (state.profile) render(); });

  auth.onChange(async (session) => {
    if (!session) {
      state.user = null; state.profile = null;
      renderLogin();
      return;
    }
    if (state.profile && state.user?.id === session.user.id) return;
    state.user = session.user;
    try {
      state.profile = await profiles.me(session.user.id);
    } catch {
      toast(t("errNoProfile"), "danger", 8000);
      await auth.signOut();
      return;
    }
    render();
  });

  const session = await auth.session();
  if (!session) renderLogin();
}
