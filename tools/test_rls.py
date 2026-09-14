# -*- coding: utf-8 -*-
"""
اختبار سلسلة المصادقة والصلاحيات من جهة العميل — بمفتاح anon فقط،
تمامًا كما ستفعل الواجهة. يثبت أن RLS يعزل فعلًا لا نظريًا.

    python tools/test_rls.py <كلمة مرور test@sce-ops.local>
"""
import io
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASS, FAIL = [], []


def load_env():
    env = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def req(url, anon, token=None, payload=None, method="GET"):
    headers = {"apikey": anon, "Content-Type": "application/json"}
    headers["Authorization"] = "Bearer " + (token or anon)
    r = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, body


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print("  %s %s" % ("✅" if ok else "❌", name))
    if detail:
        print("       " + str(detail)[:200])


def main():
    if len(sys.argv) < 2:
        sys.exit("الاستخدام: python tools/test_rls.py <كلمة مرور test@sce-ops.local>")
    pwd = sys.argv[1]
    env = load_env()
    base = env["SUPABASE_URL"].rstrip("/")
    anon = env["SUPABASE_ANON_KEY"]
    if not anon:
        sys.exit("SUPABASE_ANON_KEY فارغ في .env")

    print("=" * 66)
    print(" اختبار المصادقة والصلاحيات — بمفتاح anon فقط")
    print("=" * 66)

    # ── ١) زائر غير مسجّل ──────────────────────────────────────────────────
    print("\n[1] زائر غير مسجّل دخول")
    code, data = req(base + "/rest/v1/assets?select=code", anon)
    check("لا يرى الأصول (RLS يحجب)", code == 200 and data == [],
          "HTTP %s · %s" % (code, str(data)[:90]))

    code, data = req(base + "/rest/v1/profiles?select=email", anon)
    check("لا يرى المستخدمين", code == 200 and data == [],
          "HTTP %s · %s" % (code, str(data)[:90]))

    # ── ٢) تسجيل الدخول ────────────────────────────────────────────────────
    print("\n[2] تسجيل دخول الفني test")
    code, data = req(base + "/auth/v1/token?grant_type=password", anon,
                     payload={"email": "test@sce-ops.local", "password": pwd}, method="POST")
    ok = code == 200 and isinstance(data, dict) and data.get("access_token")
    check("تسجيل الدخول نجح", bool(ok), "" if ok else "HTTP %s · %s" % (code, str(data)[:180]))
    if not ok:
        print("\n❌ توقف: بدون رمز وصول لا يمكن إكمال بقية الاختبارات")
        sys.exit(1)
    token = data["access_token"]
    uid = data["user"]["id"]

    # ── ٣) مستخدم مسجّل ────────────────────────────────────────────────────
    print("\n[3] بعد تسجيل الدخول")
    code, data = req(base + "/rest/v1/assets?select=code", anon, token)
    check("يرى الأصول الـ٢٤", code == 200 and isinstance(data, list) and len(data) == 24,
          "HTTP %s · عدد=%s" % (code, len(data) if isinstance(data, list) else "?"))

    code, data = req(base + "/rest/v1/profiles?select=email,role&id=eq." + uid, anon, token)
    ok = code == 200 and data and data[0].get("role") == "technician"
    check("دوره technician", bool(ok), str(data)[:120])

    code, data = req(base + "/rest/v1/profiles?select=email", anon, token)
    check("يرى قائمة المستخدمين (لازمة للإسناد)",
          code == 200 and isinstance(data, list) and len(data) == 4,
          "عدد=%s" % (len(data) if isinstance(data, list) else "?"))

    # ── ٤) عزل السجلات ─────────────────────────────────────────────────────
    print("\n[4] عزل السجلات")
    code, data = req(base + "/rest/v1/records", anon, token,
                     payload={"form_code": "WO-01", "title": "زز-اختبار-عزل",
                              "priority": "high", "created_by": uid}, method="POST")
    made = code in (200, 201)
    check("الفني ينشئ سجلًا باسمه", made, "HTTP %s · %s" % (code, str(data)[:140]))

    code, data = req(base + "/rest/v1/records?select=title,sla_response_due,created_by", anon, token)
    mine = [r for r in data if r.get("created_by") == uid] if isinstance(data, list) else []
    check("يرى ما أنشأه", len(mine) >= 1 if made else True,
          "يرى %s سجلًا" % (len(data) if isinstance(data, list) else "?"))
    if mine:
        check("SLA احتُسب على الخادم عند الإنشاء", bool(mine[0].get("sla_response_due")),
              mine[0].get("sla_response_due"))

    # ── ٥) منع رفع الصلاحية ────────────────────────────────────────────────
    print("\n[5] منع رفع الصلاحية الذاتي")
    code, data = req(base + "/rest/v1/profiles?id=eq." + uid, anon, token,
                     payload={"role": "admin"}, method="PATCH")
    blocked = code >= 400 or "مدير المشروع" in str(data)
    check("الفني لا يستطيع ترقية نفسه إلى admin", blocked,
          "HTTP %s · %s" % (code, str(data)[:140]))

    code, data = req(base + "/rest/v1/profiles?select=role&id=eq." + uid, anon, token)
    check("دوره ما زال technician", code == 200 and data and data[0]["role"] == "technician",
          str(data)[:90])

    # ── ٦) الحذف محصور بالمدير ─────────────────────────────────────────────
    # الترميز إلزامي: urllib يرفض أي حرف غير ASCII في مسار الطلب
    if made:
        import urllib.parse
        req(base + "/rest/v1/records?title=eq." + urllib.parse.quote("زز-اختبار-عزل"),
            anon, token, method="DELETE")
        code, data = req(base + "/rest/v1/records?select=title&title=eq."
                         + urllib.parse.quote("زز-اختبار-عزل"), anon, token)
        print("\n[6] الحذف محصور بالمدير")
        check("الفني لا يستطيع حذف سجله", isinstance(data, list) and len(data) > 0,
              "السجل باقٍ — السياسة تعمل")
        print("       نظّف بعدها:  python tools/sb.py --allow-destructive "
              "-q \"delete from records where title like 'زز-%'\"")

    print("\n" + "=" * 66)
    print(" نجح: %d   |   فشل: %d" % (len(PASS), len(FAIL)))
    for f in FAIL:
        print("   ❌ " + f)
    print("=" * 66)
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
