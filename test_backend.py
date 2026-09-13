# -*- coding: utf-8 -*-
"""
اختبار الباك-إند مباشرة عبر HTTP — يتجاوز المتصفح تماماً.
الاستخدام:  python test_backend.py <رابط /exec>
"""
import json, sys, time, urllib.request, urllib.error

# صورة JPEG حقيقية 1x1 بكسل — كافية لإثبات أن مسار الرفع كامل يعمل
TINY_JPEG = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR"
    "CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA"
    "AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK"
    "FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG"
    "h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl"
    "5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA"
    "AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYk"
    "NOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE"
    "hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk"
    "5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
)

PASS, FAIL = [], []


def call_once(url, payload=None):
    if payload is None:
        req = urllib.request.Request(url, method="GET")
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            method="POST",
        )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def call(url, payload=None, attempts=3):
    """
    يرجّع (كود HTTP، dict أو نص خام).

    /exec يحوّل إلى script.googleusercontent.com برمز لمرة واحدة، وGoogle
    يفشل أحياناً في جلبه ويرجّع 404 — عطل متقطّع من طرفه لا من الكود.
    إعادة المحاولة آمنة لأن الخادم يكشف التكرار برقم البلاغ.
    """
    last = None
    for i in range(attempts):
        code, raw = call_once(url, payload)
        try:
            res = json.loads(raw)
        except ValueError:
            last = (code, raw)
            reason = "HTTP %s بلا JSON" % code
        else:
            # عطل نقل ثانٍ: Google يتبع تحويل الـ POST كـ GET فينفّذ doGet
            # ويرجّع رد الخدمة بدل نتيجة الإرسال. نكشفه ونعيد المحاولة.
            if payload is not None and "service" in res:
                last = (code, res)
                reason = "رجع رد doGet بدل نتيجة POST"
            else:
                return code, res
        if i < attempts - 1:
            print("         (محاولة %d: %s — إعادة المحاولة)" % (i + 1, reason))
            time.sleep(2)
    return last


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  [OK]   " if condition else "  [FAIL] ") + name)
    if detail:
        print("         " + str(detail)[:400])


def base_payload(incident_no, with_photos=True):
    p = {
        "incident_no": incident_no,
        "reporting_date": "13/09/2026",
        "reporting_time": "10:30",
        "recipient_name": "Test Recipient",
        "client_name": "شركة اختبار",
        "client_contact": "0500000000",
        "client_email": "test@example.com",
        "location": "الرياض - مبنى الاختبار",
        "facility": "الدور الثالث",
        "incident_text": "بلاغ اختباري آلي - يمكن حذف هذا الصف",
        "classification": "High",
        "incident_repeated": "No",
        "service": "HVAC",
        "system": "Central AC",
        "sla_response": 30,
        "sla_processing": 60,
        "sla_completion": 480,
        "receipt_timestamp": "13/09/2026 10:35:00",
        "employee_name": "فني اختبار",
        "maintenance_type": "Preventive",
        "general_notes": "ملاحظات اختبارية",
        "inspections": [
            {"equipment": "AHU", "qty": "1", "exam": "Cleanliness", "status": "Pass",  "action": ""},
            {"equipment": "AHU", "qty": "1", "exam": "Airflow",     "status": "Fail",  "action": "Repair"},
            {"equipment": "AHU", "qty": "1", "exam": "Vibration",   "status": "Pass",  "action": ""},
            {"equipment": "FCU", "qty": "2", "exam": "Air Filters", "status": "Fail",  "action": "Replacement"},
            {"equipment": "FCU", "qty": "2", "exam": "Thermostat",  "status": "Pass",  "action": ""},
        ],
        "photo_before": TINY_JPEG if with_photos else "",
        "photo_during": TINY_JPEG if with_photos else "",
        "photo_after":  TINY_JPEG if with_photos else "",
        "signature": "Automated Test",
    }
    return p


def main():
    if len(sys.argv) < 2:
        print("الاستخدام: python test_backend.py <رابط /exec>")
        sys.exit(1)

    url = sys.argv[1].strip()
    if "script.google.com" not in url or not url.rstrip("/").endswith("/exec"):
        print("! الرابط لا يبدو رابط نشر Apps Script ينتهي بـ /exec")
        sys.exit(1)

    stamp = time.strftime("%H%M%S")
    inc_main = "TEST-" + stamp + "-A"
    inc_nophoto = "TEST-" + stamp + "-B"

    print("=" * 62)
    print(" اختبار الباك-إند")
    print("=" * 62)

    # ---------- 1: الخادم حي ----------
    print("\n[1] الخادم يستجيب (GET)")
    code, res = call(url)
    check("GET يرجّع JSON صالح", isinstance(res, dict), res)
    check("ok = true", isinstance(res, dict) and res.get("ok") is True)

    # ---------- 2: بلاغ كامل بثلاث صور ----------
    print("\n[2] بلاغ كامل + 3 صور  (" + inc_main + ")")
    code, res = call(url, base_payload(inc_main))
    ok2 = isinstance(res, dict) and res.get("ok") is True
    check("الحفظ نجح", ok2, res)
    if ok2 and res.get("duplicate"):
        # المحاولة الأولى كتبت الصف لكن ردّها ضاع في النقل؛ حماية التكرار
        # ردّت على الثانية. الكتابة تمّت مرة واحدة — وهذا هو السلوك المطلوب.
        check("رقم البلاغ رجع صحيحاً", res.get("incident_no") == inc_main, res.get("incident_no"))
        print("         (كُتب في المحاولة الأولى؛ ضاع ردّها في النقل ومنع التكرارُ الازدواج)")
        print("\n  >> افتح الشيت وتأكد أن " + inc_main + " له صف واحد فقط")
    elif ok2:
        check("رقم البلاغ رجع صحيحاً", res.get("incident_no") == inc_main, res.get("incident_no"))
        check("5 فحوصات كُتبت", res.get("inspections_written") == 5, res.get("inspections_written"))
        check("رابط مجلد الصور رجع", bool(res.get("folder_url")), res.get("folder_url"))
        print("\n  >> افتح هذا المجلد وتأكد أن فيه 3 ملفات:")
        print("     " + str(res.get("folder_url")))

    # ---------- 3: حماية التكرار ----------
    print("\n[3] إعادة إرسال نفس البلاغ (يجب ألا يتكرر)")
    code, res = call(url, base_payload(inc_main))
    check("رجع duplicate = true", isinstance(res, dict) and res.get("duplicate") is True, res)

    # ---------- 4: حقل مطلوب ناقص ----------
    print("\n[4] إرسال باسم عميل فارغ (يجب أن يُرفض)")
    bad = base_payload("TEST-" + stamp + "-C", with_photos=False)
    bad["client_name"] = ""
    code, res = call(url, bad)
    check("رُفض الطلب (ok = false)", isinstance(res, dict) and res.get("ok") is False, res)
    check("رسالة الخطأ تذكر اسم العميل",
          isinstance(res, dict) and "اسم العميل" in str(res.get("error", "")),
          res.get("error") if isinstance(res, dict) else res)

    # ---------- 5: بلا صور ----------
    print("\n[5] بلاغ بلا أي صور  (" + inc_nophoto + ")")
    code, res = call(url, base_payload(inc_nophoto, with_photos=False))
    ok5 = isinstance(res, dict) and res.get("ok") is True
    check("الحفظ نجح", ok5, res)
    if ok5:
        check("لم يُنشأ مجلد فارغ", not res.get("folder_url"), repr(res.get("folder_url")))

    # ---------- 6: JSON تالف ----------
    print("\n[6] بيانات تالفة (يجب أن تُرفض بلطف لا أن تنهار)")
    req = urllib.request.Request(url, data=b"{{{ not json",
                                 headers={"Content-Type": "text/plain;charset=utf-8"},
                                 method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
    try:
        res = json.loads(raw)
        check("رجع JSON خطأ منظّم لا صفحة انهيار",
              res.get("ok") is False, res.get("error"))
    except ValueError:
        check("رجع JSON خطأ منظّم لا صفحة انهيار", False, raw[:200])

    # ---------- الخلاصة ----------
    print("\n" + "=" * 62)
    print(" نجح: %d   |   فشل: %d" % (len(PASS), len(FAIL)))
    if FAIL:
        print(" الفاشل:")
        for f in FAIL:
            print("   - " + f)
    print("=" * 62)
    print("\nصفوف الاختبار في الشيت أرقامها تبدأ بـ TEST- — احذفها بعد المراجعة.")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
