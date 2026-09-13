/**
 * ============================================================================
 *  نظام البلاغات وأوامر العمل — الباك-إند (Google Apps Script)
 *  Incident Report & Work Order System — Backend
 *  Power Support Co.
 * ============================================================================
 */

// ============================ الإعدادات ====================================
// ⬇️ الشيء الوحيد الذي يجب تغييره: الصق معرّف جدول البيانات هنا
const SPREADSHEET_ID = "1Cw70pz7b5qWYTR_mL8WxQ1MmUZGUj1wKlogF0fgexGo";

const ROOT_FOLDER_NAME  = "Incident Photos";
const SHEET_WORKORDERS  = "WorkOrders";
const SHEET_INSPECTIONS = "Inspections";

// ============================ رؤوس الأعمدة ==================================
const WORKORDER_HEADERS = [
  "Timestamp",              // 1  — وقت الخادم (المرجع الموثوق)
  "Incident No",            // 2
  "Reporting Date",         // 3
  "Reporting Time",         // 4
  "Recipient Name",         // 5
  "Client Name",            // 6
  "Client Contact",         // 7
  "Client Email",           // 8
  "Location",               // 9
  "Facility",               // 10
  "Incident Text",          // 11
  "Classification",         // 12
  "Incident Repeated",      // 13
  "Service",                // 14
  "System",                 // 15
  "SLA Response (mins)",    // 16
  "SLA Processing (mins)",  // 17
  "SLA Completion (mins)",  // 18
  "Receipt Timestamp",      // 19
  "Employee Name",          // 20
  "Maintenance Type",       // 21
  "General Notes",          // 22
  "Total Exams",            // 23
  "Failed Exams",           // 24
  "Photo Before",           // 25
  "Photo During",           // 26
  "Photo After",            // 27
  "Photos Folder",          // 28
  "Signature"               // 29
];

const INSPECTION_HEADERS = [
  "Timestamp",
  "Incident No",
  "Service",
  "System",
  "Equipment",
  "Qty",
  "Exam",
  "Status",
  "Action"
];

// عرض الأعمدة (بالبكسل) للأعمدة التي تحتاج ضبطاً — الباقي يبقى افتراضياً
const WORKORDER_COL_WIDTHS = {
  1: 150,  // Timestamp
  2: 165,  // Incident No
  11: 300, // Incident Text
  22: 300, // General Notes
  25: 110, 26: 110, 27: 110, 28: 130
};

// ============================ نقطة الدخول ===================================

/**
 * يستقبل إرسال النموذج. يرجّع دائماً JSON — لا صفحات HTML ولا استثناءات صامتة.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut_({ ok: false, error: "لم تصل أي بيانات إلى الخادم" });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonOut_({ ok: false, error: "صيغة البيانات غير صالحة (JSON)" });
    }

    var validationError = validate_(data);
    if (validationError) {
      return jsonOut_({ ok: false, error: validationError });
    }

    // قفل يمنع تداخل الصفوف عند إرسال متزامن من أكثر من فنّي
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return jsonOut_({ ok: false, error: "الخادم مشغول حالياً، أعد المحاولة بعد لحظات" });
    }

    try {
      var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheets = ensureSheets_(ss);

      // حماية من إعادة الإرسال: لو انقطع الاتصال بعد نجاح الحفظ فعلياً
      if (isDuplicate_(sheets.workOrders, data.incident_no)) {
        return jsonOut_({
          ok: true,
          duplicate: true,
          incident_no: data.incident_no
        });
      }

      var inspections = Array.isArray(data.inspections) ? data.inspections : [];
      var stats = {
        total:  inspections.length,
        failed: inspections.filter(function (r) {
          return String(r.status || "").toLowerCase() === "fail";
        }).length
      };

      var photos = savePhotos_(data);

      appendWorkOrder_(sheets.workOrders, data, photos, stats);
      var written = appendInspections_(sheets.inspections, data, inspections);

      return jsonOut_({
        ok: true,
        incident_no: data.incident_no,
        folder_url: photos.folderUrl,
        inspections_written: written
      });

    } finally {
      lock.releaseLock();
    }

  } catch (err) {
    console.error("doPost failed: " + err + "\n" + (err && err.stack));
    return jsonOut_({ ok: false, error: String((err && err.message) || err) });
  }
}

/**
 * فتح رابط النشر في المتصفح يعرض هذه الرسالة — طريقة سريعة للتأكد أن النشر شغّال.
 */
function doGet() {
  return jsonOut_({
    ok: true,
    service: "Incident Report & Work Order System",
    message: "الخادم يعمل. هذه الواجهة تستقبل البيانات عبر POST فقط."
  });
}

// ============================ التحقق =======================================

/**
 * يرجّع رسالة خطأ عربية عند نقص حقل مطلوب، أو null إذا كانت البيانات سليمة.
 */
function validate_(data) {
  var required = [
    ["incident_no",    "رقم البلاغ"],
    ["client_name",    "اسم العميل"],
    ["location",       "الموقع"],
    ["incident_text",  "وصف البلاغ"],
    ["classification", "تصنيف البلاغ"]
  ];

  for (var i = 0; i < required.length; i++) {
    var key   = required[i][0];
    var label = required[i][1];
    if (!data[key] || !String(data[key]).trim()) {
      return "حقل مطلوب ناقص: " + label;
    }
  }
  return null;
}

/**
 * يبحث عن رقم البلاغ في عمود Incident No (العمود 2).
 */
function isDuplicate_(sheet, incidentNo) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var target = String(incidentNo).trim();
  var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === target) return true;
  }
  return false;
}

// ============================ الشيتات ======================================

function ensureSheets_(ss) {
  return {
    workOrders:  ensureSheet_(ss, SHEET_WORKORDERS,  WORKORDER_HEADERS, WORKORDER_COL_WIDTHS),
    inspections: ensureSheet_(ss, SHEET_INSPECTIONS, INSPECTION_HEADERS, null)
  };
}

/**
 * ينشئ الشيت ورأسه عند أول تشغيل. لا يلمس شيئاً إذا كان موجوداً مسبقاً.
 */
function ensureSheet_(ss, name, headers, colWidths) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange
      .setFontWeight("bold")
      .setBackground("#1e4268")
      .setFontColor("#ffffff")
      .setVerticalAlignment("middle");

    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 34);

    if (colWidths) {
      for (var col in colWidths) {
        sheet.setColumnWidth(Number(col), colWidths[col]);
      }
    }

    // ملاحظة مقصودة: لا يُنشأ فلتر برمجياً هنا. الفلتر المُنشأ عبر الـ API يثبُت
    // على نطاق ثابت (ارتفاع الشيت لحظة الإنشاء = 1000 صف) ولا يتمدد مع الصفوف
    // الجديدة، فيُخفي البيانات لاحقاً بصمت. المستخدم ينشئه بنقرة واحدة من
    // البيانات ← إنشاء فلتر، وعندها يتمدد تلقائياً. انظر SETUP.md.
  }

  return sheet;
}

// ============================ الصور ========================================

/**
 * يرفع الصور الثلاث إلى مجلد باسم رقم البلاغ.
 * فشل صورة واحدة لا يُسقط العملية — يُكتب "UPLOAD FAILED" مكان رابطها فقط.
 */
function savePhotos_(data) {
  var result = { before: "", during: "", after: "", folderUrl: "" };

  var photos = [
    { key: "before", dataUrl: data.photo_before },
    { key: "during", dataUrl: data.photo_during },
    { key: "after",  dataUrl: data.photo_after  }
  ];

  var hasAny = photos.some(function (p) { return !!p.dataUrl; });
  if (!hasAny) return result;  // بلا صور → بلا مجلد فارغ

  // المجلد الجذر مشارَك مرة واحدة في عمر النظام، والمجلدات والملفات تحته ترث
  // إذنه. setSharing تكلف ~7 ثوانٍ، وميزانية الطلب كلها ~20 ثانية قبل أن
  // ينتهي مفتاح جلب النتيجة عند Google ويرجع 404.
  var folder = getOrCreateFolder_(getSharedRoot_(), String(data.incident_no));
  result.folderUrl = folder.getUrl();

  photos.forEach(function (p) {
    if (!p.dataUrl) return;
    try {
      result[p.key] = savePhoto_(folder, p.dataUrl, data.incident_no + "_" + p.key + ".jpg");
    } catch (err) {
      console.error("فشل رفع صورة " + p.key + ": " + err);
      result[p.key] = "UPLOAD FAILED";
    }
  });

  return result;
}

function savePhoto_(folder, dataUrl, filename) {
  var base64 = String(dataUrl).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  var blob   = Utilities.newBlob(Utilities.base64Decode(base64), "image/jpeg", filename);
  return folder.createFile(blob).getUrl();
}

function getOrCreateFolder_(parent, name) {
  var existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

/**
 * يرجّع مجلد الصور الجذر مشارَكاً بـ "أي شخص لديه الرابط".
 * المعرّف يُحفظ في خصائص السكربت، فالبحث والمشاركة يحدثان مرة واحدة فقط
 * لا مع كل بلاغ — توفير ~8 ثوانٍ من ميزانية الطلب.
 */
function getSharedRoot_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("ROOT_FOLDER_ID");

  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // حُذف المجلد أو تغيّر — نعيد بناءه أدناه
    }
  }

  var folder = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty("ROOT_FOLDER_ID", folder.getId());

  return folder;
}

// ============================ كتابة الصفوف =================================

function appendWorkOrder_(sheet, data, photos, stats) {
  var row = [
    new Date(),                          // 1  Timestamp
    str_(data.incident_no),              // 2
    str_(data.reporting_date),           // 3
    str_(data.reporting_time),           // 4
    str_(data.recipient_name),           // 5
    str_(data.client_name),              // 6
    str_(data.client_contact),           // 7
    str_(data.client_email),             // 8
    str_(data.location),                 // 9
    str_(data.facility),                 // 10
    str_(data.incident_text),            // 11
    str_(data.classification),           // 12
    str_(data.incident_repeated),        // 13
    str_(data.service),                  // 14
    str_(data.system),                   // 15
    num_(data.sla_response),             // 16
    num_(data.sla_processing),           // 17
    num_(data.sla_completion),           // 18
    str_(data.receipt_timestamp),        // 19
    str_(data.employee_name),            // 20
    str_(data.maintenance_type),         // 21
    str_(data.general_notes),            // 22
    stats.total,                         // 23
    stats.failed,                        // 24
    link_(photos.before,    "Before"),   // 25
    link_(photos.during,    "During"),   // 26
    link_(photos.after,     "After"),    // 27
    link_(photos.folderUrl, "Open Folder"), // 28
    str_(data.signature)                 // 29
  ];

  sheet.appendRow(row);
}

function appendInspections_(sheet, data, rows) {
  if (!rows.length) return 0;

  var now = new Date();
  var values = rows.map(function (r) {
    return [
      now,
      str_(data.incident_no),
      str_(data.service),
      str_(data.system),
      str_(r.equipment),
      num_(r.qty),
      str_(r.exam),
      str_(r.status),
      str_(r.action)
    ];
  });

  sheet
    .getRange(sheet.getLastRow() + 1, 1, values.length, INSPECTION_HEADERS.length)
    .setValues(values);

  return values.length;
}

// ============================ مساعدات ======================================

function str_(v) {
  return (v === null || v === undefined) ? "" : String(v);
}

function num_(v) {
  if (v === null || v === undefined || v === "") return "";
  var n = Number(v);
  return isNaN(n) ? String(v) : n;
}

/**
 * يبني صيغة رابط قابل للنقر. صيغ Apps Script تُكتب دائماً بفواصل إنجليزية
 * بغض النظر عن لغة جدول البيانات.
 */
function link_(url, label) {
  if (!url) return "";
  if (url === "UPLOAD FAILED") return "UPLOAD FAILED";
  return '=HYPERLINK("' + String(url).replace(/"/g, '""') + '","' + label + '")';
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================ تشغيل يدوي للتجهيز ===========================

/**
 * شغّل هذه الدالة مرة واحدة من محرر Apps Script قبل النشر.
 * تنشئ الشيتين والمجلد الجذر، وتطلب الأذونات، وتؤكد صحة SPREADSHEET_ID.
 */
function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureSheets_(ss);
  getSharedRoot_();

  Logger.log("✅ تم التجهيز بنجاح");
  Logger.log("الشيت: " + ss.getName() + " — " + ss.getUrl());
  Logger.log("مجلد الصور: " + ROOT_FOLDER_NAME + " (في جذر Drive)");
}
