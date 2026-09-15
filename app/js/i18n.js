/* ============================================================================
   الترجمة — عربي افتراضًا، والاتجاه يتبع اللغة تلقائيًا
   ============================================================================ */

const AR = {
  /* عام */
  appName: "نظام إدارة التشغيل والصيانة",
  org: "الهيئة السعودية للمهندسين",
  search: "بحث…", loading: "جارٍ التحميل…", save: "حفظ", cancel: "إلغاء",
  close: "إغلاق", confirm: "تأكيد", delete: "حذف", edit: "تعديل", add: "إضافة",
  back: "رجوع", next: "التالي", submit: "إرسال", retry: "إعادة المحاولة",
  yes: "نعم", no: "لا", all: "الكل", none: "لا شيء", of: "من",
  noData: "لا توجد بيانات", noDataSub: "لم يُسجَّل شيء بعد",
  signOut: "تسجيل الخروج", theme: "المظهر", lang: "English",

  /* الدخول */
  loginTitle: "تسجيل الدخول", loginSub: "ادخل ببيانات حسابك",
  email: "البريد الإلكتروني", password: "كلمة المرور",
  signIn: "دخول", signingIn: "جارٍ الدخول…",
  errCreds: "البريد أو كلمة المرور غير صحيحة",
  errNet: "تعذّر الاتصال — تحقّق من الإنترنت",
  errNoProfile: "الحساب بلا ملف تعريف — راجع مدير النظام",

  /* الأدوار */
  role_admin: "مدير المشروع", role_compliance: "ممثل الهيئة",
  role_supervisor: "مشرف تشغيلي", role_technician: "فني", role_employee: "موظف",

  /* التخصصات */
  sp_electrical: "كهرباء", sp_plumbing: "سباكة", sp_hvac: "تكييف وتبريد",
  sp_hospitality: "ضيافة", sp_cleaning: "نظافة", sp_other: "أخرى",

  /* التنقّل */
  navDash: "لوحة المؤشرات", navOps: "لوحة التشغيل", navCompliance: "لوحة الامتثال",
  navTasks: "المهام", navMyTasks: "مهامي",
  navRecords: "السجلات", navForms: "النماذج", navSla: "مؤقتات SLA",
  navRisks: "المخاطر", navApprovals: "الاعتمادات", navUsers: "المستخدمون",
  navSettings: "الإعدادات", navRequests: "طلباتي",
  navNewHospitality: "طلب ضيافة", navNewRoom: "تجهيز قاعة",
  grpMain: "الرئيسية", grpWork: "العمل", grpOversight: "الإشراف", grpSystem: "النظام",

  /* الحالات */
  st_draft: "مسودة", st_sent: "مُرسل للمشرف", st_review: "قيد المراجعة",
  st_approved: "معتمد داخليًا", st_client: "مرفوع للهيئة", st_closed: "مغلق ومعتمد",

  /* الأولويات */
  pr_critical: "حرج", pr_high: "عالي", pr_medium: "متوسط",

  /* حالات المهام */
  /* كل حالة تسمّي ما ينتظره العمل لا مجرّد موضعه: «جديدة» و«مسندة» تصفان
     زمنًا لا عائقًا، فلا يعرف المشرف أهو المتأخّر أم الفني. */
  ts_pending: "بانتظار الاعتماد",
  ts_new: "غير مسندة", ts_assigned: "بانتظار البدء", ts_in_progress: "قيد التنفيذ",
  ts_done: "منجزة", ts_cancelled: "ملغاة",

  /* المؤشرات */
  kpiOpen: "أوامر مفتوحة", kpiClosed: "مغلقة", kpiSla: "الالتزام بـ SLA",
  kpiAvgResp: "متوسط الاستجابة", kpiRisks: "مخاطر مفتوحة", kpiPending: "بانتظار الاعتماد",
  kpiTasks: "مهام نشطة", kpiOverdue: "متأخرة",

  /* عام */
  remaining: "المتبقّي", overdue: "متأخر", dueIn: "يستحق خلال",
  createdAt: "أُنشئ", assignedTo: "المكلَّف", priority: "الأولوية",
  status: "الحالة", location: "الموقع", unassigned: "غير مسند",
  welcome: "أهلًا", today: "اليوم",
  soon: "قريبًا", soonSub: "هذا القسم قيد الإنشاء",
};

const EN = {
  appName: "Operations & Maintenance System",
  org: "Saudi Council of Engineers",
  search: "Search…", loading: "Loading…", save: "Save", cancel: "Cancel",
  close: "Close", confirm: "Confirm", delete: "Delete", edit: "Edit", add: "Add",
  back: "Back", next: "Next", submit: "Submit", retry: "Retry",
  yes: "Yes", no: "No", all: "All", none: "None", of: "of",
  noData: "No data", noDataSub: "Nothing recorded yet",
  signOut: "Sign out", theme: "Theme", lang: "عربي",

  loginTitle: "Sign in", loginSub: "Enter your account details",
  email: "Email", password: "Password",
  signIn: "Sign in", signingIn: "Signing in…",
  errCreds: "Incorrect email or password",
  errNet: "Connection failed — check your internet",
  errNoProfile: "Account has no profile — contact the administrator",

  role_admin: "Project Manager", role_compliance: "Client Representative",
  role_supervisor: "Operations Supervisor", role_technician: "Technician",
  role_employee: "Employee",

  sp_electrical: "Electrical", sp_plumbing: "Plumbing", sp_hvac: "HVAC",
  sp_hospitality: "Hospitality", sp_cleaning: "Cleaning", sp_other: "Other",

  navDash: "Dashboard", navOps: "Operations", navCompliance: "Compliance",
  navTasks: "Tasks", navMyTasks: "My Tasks",
  navRecords: "Records", navForms: "Forms", navSla: "SLA Timers",
  navRisks: "Risks", navApprovals: "Approvals", navUsers: "Users",
  navSettings: "Settings", navRequests: "My Requests",
  navNewHospitality: "Hospitality Request", navNewRoom: "Meeting Room",
  grpMain: "Main", grpWork: "Work", grpOversight: "Oversight", grpSystem: "System",

  st_draft: "Draft", st_sent: "Sent to supervisor", st_review: "Under review",
  st_approved: "Approved internally", st_client: "Raised to client",
  st_closed: "Closed & approved",

  pr_critical: "Critical", pr_high: "High", pr_medium: "Medium",

  ts_pending: "Awaiting approval",
  ts_new: "Unassigned", ts_assigned: "Awaiting start", ts_in_progress: "In progress",
  ts_done: "Done", ts_cancelled: "Cancelled",

  kpiOpen: "Open orders", kpiClosed: "Closed", kpiSla: "SLA compliance",
  kpiAvgResp: "Avg response", kpiRisks: "Open risks", kpiPending: "Awaiting approval",
  kpiTasks: "Active tasks", kpiOverdue: "Overdue",

  remaining: "Remaining", overdue: "Overdue", dueIn: "Due in",
  createdAt: "Created", assignedTo: "Assigned to", priority: "Priority",
  status: "Status", location: "Location", unassigned: "Unassigned",
  welcome: "Welcome", today: "Today",
  soon: "Coming soon", soonSub: "This section is under construction",
};

const DICTS = { ar: AR, en: EN };
const KEY = "sce_lang";

export let lang = (() => {
  try { const v = localStorage.getItem(KEY); if (v === "ar" || v === "en") return v; } catch {}
  return "ar";
})();

/** الترجمة؛ المفتاح المفقود يُعاد كما هو ليظهر النقص بدل أن يختفي بصمت. */
export function t(key) {
  return DICTS[lang][key] ?? DICTS.ar[key] ?? key;
}

export function setLang(next) {
  lang = next;
  try { localStorage.setItem(KEY, next); } catch {}
  applyDir();
}

export function toggleLang() {
  setLang(lang === "ar" ? "en" : "ar");
}

export function applyDir() {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === "ar" ? "rtl" : "ltr";
}

/** يختار الحقل العربي أو الإنجليزي من صف قاعدة بيانات. */
export function pick(row, base) {
  if (!row) return "";
  return (lang === "en" ? row[base + "_en"] : row[base]) || row[base] || "";
}

/* ─── تنسيق ────────────────────────────────────────────────────────────── */

export function fmtDate(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB",
    { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function fmtStamp(v) {
  if (!v) return "—";
  return fmtDate(v) + " " + fmtTime(v);
}

/** مدة مقروءة من ميلي ثانية — سالبة تعني تجاوز الموعد. */
export function fmtDur(ms) {
  const neg = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600);  s -= h * 3600;
  const m = Math.floor(s / 60);    s -= m * 60;
  const p = (n) => String(n).padStart(2, "0");
  const core = d > 0 ? `${d}${lang === "ar" ? "ي" : "d"} ${p(h)}:${p(m)}`
                     : `${p(h)}:${p(m)}:${p(s)}`;
  return (neg ? "−" : "") + core;
}
