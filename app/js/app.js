/* ============================================================================
   نقطة البدء — تسجيل الشاشات ثم الإقلاع
   ============================================================================ */

import { boot, registerView } from "./shell.js";
import { mytasksView } from "./views/mytasks.js";
import { tasksView } from "./views/tasks.js";
import { formView } from "./views/form.js";
import { dashboardView } from "./views/dashboard.js";
import { approvalsView } from "./views/approvals.js";
import { recordsView } from "./views/records.js";
import { slaView } from "./views/sla.js";
import { risksView } from "./views/risks.js";

registerView("mytasks", mytasksView);
registerView("tasks", tasksView);
registerView("forms", formView);

// اللوحة ذاتها للأدوار الثلاثة: الفرق في البيانات لا في الشاشة،
// وRLS في القاعدة هو ما يحسم ما يراه كل دور.
for (const id of ["dashboard", "ops", "compliance"]) registerView(id, dashboardView);
registerView("approvals", approvalsView);
registerView("records", recordsView);
registerView("sla", slaView);
registerView("risks", risksView);

// الشاشات غير المسجّلة تعرض "قيد الإنشاء" — التنقّل يعمل من الآن
// وتُبنى الشاشات على دفعات دون كسر النظام.

boot().catch((err) => {
  console.error("boot failed", err);
  document.getElementById("root").innerHTML =
    '<div class="login-wrap"><div class="empty">' +
    '<div class="empty-icon">⚠</div>' +
    '<div class="empty-title">تعذّر تشغيل النظام</div>' +
    '<div class="small">' + (err?.message || "") + "</div></div></div>";
});
