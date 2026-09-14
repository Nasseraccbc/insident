/* ============================================================================
   خريطة التنقّل حسب الدور.

   المبدأ: الأقسام الممنوعة غير موجودة في شجرة التنقّل أصلًا، لا مخفيّة بـ CSS.
   والحارس الحقيقي هو RLS في القاعدة — هذه الخريطة للتجربة لا للأمان:
   مَن عدّل الرابط يدويًا يصطدم بالقاعدة لا بالواجهة.
   ============================================================================ */

import { t } from "./i18n.js";

/** كل قسم: معرّفه · مفتاح ترجمته · أيقونته · الأدوار المسموح لها. */
const ROUTES = [
  { id: "dashboard",   icon: "▦", label: "navDash",       group: "grpMain",      roles: ["admin"] },
  { id: "ops",         icon: "▦", label: "navOps",        group: "grpMain",      roles: ["supervisor"] },
  { id: "compliance",  icon: "▦", label: "navCompliance", group: "grpMain",      roles: ["compliance"] },
  { id: "mytasks",     icon: "◉", label: "navMyTasks",    group: "grpMain",      roles: ["technician"] },
  { id: "requests",    icon: "◉", label: "navRequests",   group: "grpMain",      roles: ["employee"] },

  { id: "tasks",       icon: "☰", label: "navTasks",      group: "grpWork",      roles: ["admin", "supervisor"] },
  { id: "inbox",       icon: "↓", label: "navInbox",      group: "grpWork",      roles: ["admin", "supervisor"] },
  { id: "records",     icon: "▤", label: "navRecords",    group: "grpWork",      roles: ["admin", "supervisor", "compliance"] },
  // الاعتماد قرار مشرف الموقع وحده؛ المدير وممثل الهيئة يريان ولا يقرّران
  { id: "approvals",   icon: "✓", label: "navApprovals",  group: "grpWork",      roles: ["supervisor"] },
  { id: "forms",       icon: "✎", label: "navForms",      group: "grpWork",      roles: ["admin", "supervisor", "technician"] },

  { id: "hospitality", icon: "☕", label: "navNewHospitality", group: "grpWork", roles: ["employee"] },
  { id: "room",        icon: "▣", label: "navNewRoom",         group: "grpWork", roles: ["employee"] },

  { id: "sla",         icon: "◷", label: "navSla",        group: "grpOversight", roles: ["admin", "supervisor", "compliance"] },
  { id: "risks",       icon: "△", label: "navRisks",      group: "grpOversight", roles: ["admin", "compliance"] },

  { id: "users",       icon: "⚇", label: "navUsers",      group: "grpSystem",    roles: ["admin"] },
  { id: "settings",    icon: "⚙", label: "navSettings",   group: "grpSystem",    roles: ["admin"] },
];

const GROUP_ORDER = ["grpMain", "grpWork", "grpOversight", "grpSystem"];

export function routesFor(role) {
  return ROUTES.filter((r) => r.roles.includes(role));
}

/** الأقسام مجمّعة بترتيب ثابت — لا تقفز مواضعها بين الأدوار. */
export function groupedRoutes(role) {
  const mine = routesFor(role);
  return GROUP_ORDER
    .map((g) => ({ group: g, title: t(g), items: mine.filter((r) => r.group === g) }))
    .filter((g) => g.items.length);
}

export function canAccess(role, routeId) {
  const r = ROUTES.find((x) => x.id === routeId);
  return !!r && r.roles.includes(role);
}

/** أول قسم في قائمة الدور — وجهة الدخول الافتراضية. */
export function homeRoute(role) {
  return routesFor(role)[0]?.id || "dashboard";
}

export function routeLabel(id) {
  const r = ROUTES.find((x) => x.id === id);
  return r ? t(r.label) : id;
}
