# -*- coding: utf-8 -*-
"""
إنشاء مستخدمي النظام عبر Supabase Auth Admin API.

مفتاح service_role يُجلب من Management API ويبقى في الذاكرة فقط —
لا يُطبع ولا يُكتب على القرص. كلمات المرور تُولَّد عشوائيًا وتُعرض مرة
واحدة هنا لتسليمها لأصحابها، ولا تُحفظ في أي ملف.

    python tools/create_users.py            عرض ما سيُنشأ (بلا تنفيذ)
    python tools/create_users.py --apply    التنفيذ الفعلي
"""
import io
import json
import os
import secrets
import string
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# الدفعة الأولى — راجع PROJECT-SPEC.md §4
USERS = [
    {"email": "faisal@sce-ops.local", "full_name": "فيصل",  "full_name_en": "Faisal",
     "role": "admin",       "specialty": None,         "note": "مدير المشروع — اعتماد تشغيلي"},
    {"email": "khalaf@sce-ops.local", "full_name": "خلف",   "full_name_en": "Khalaf",
     "role": "compliance",  "specialty": None,         "note": "ممثل الهيئة — اعتماد نهائي"},
    {"email": "ammar@sce-ops.local",  "full_name": "عمّار", "full_name_en": "Ammar",
     "role": "supervisor",  "specialty": None,         "note": "مشرف تشغيلي — المهام والتوزيع"},
    {"email": "test@sce-ops.local",   "full_name": "test",  "full_name_en": "test",
     "role": "technician",  "specialty": "electrical", "note": "فني — حساب تجريبي"},
]


def load_env():
    env = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def http(url, token, payload=None, method="GET"):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                 "apikey": token},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def get_service_key(env):
    """يجلب مفتاح service_role عبر Management API — يبقى في الذاكرة فقط."""
    code, data = http(
        "https://api.supabase.com/v1/projects/%s/api-keys?reveal=true" % env["SUPABASE_PROJECT_REF"],
        env["SUPABASE_ACCESS_TOKEN"],
    )
    if code >= 300:
        sys.exit("تعذّر جلب المفاتيح — HTTP %s\n%s" % (code, str(data)[:300]))
    keys = {k.get("name"): k.get("api_key") for k in data}
    svc = keys.get("service_role")
    anon = keys.get("anon")
    if not svc:
        sys.exit("لم يُعثر على مفتاح service_role")
    return svc, anon


def gen_password(n=16):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(n))


def main():
    apply = "--apply" in sys.argv
    env = load_env()
    base = env["SUPABASE_URL"].rstrip("/")

    print("المستخدمون المزمع إنشاؤهم:\n")
    print("  %-26s %-8s %-14s %s" % ("البريد", "الاسم", "الدور", "الملاحظة"))
    print("  " + "-" * 88)
    for u in USERS:
        print("  %-26s %-8s %-14s %s" % (u["email"], u["full_name"], u["role"], u["note"]))

    if not apply:
        print("\n(عرض فقط — أضف --apply للتنفيذ)")
        return

    svc, anon = get_service_key(env)
    print("\n✅ تم جلب مفاتيح المشروع (service_role في الذاكرة فقط)\n")

    created = []
    for u in USERS:
        pwd = gen_password()
        code, data = http(
            base + "/auth/v1/admin/users",
            svc,
            {
                "email": u["email"],
                "password": pwd,
                "email_confirm": True,
                "user_metadata": {"full_name": u["full_name"], "role": u["role"]},
            },
            "POST",
        )
        if code < 300:
            created.append((u, pwd, data.get("id")))
            print("  ✅ %-26s أُنشئ" % u["email"])
        elif "already" in str(data).lower() or code == 422:
            print("  ⏭  %-26s موجود مسبقًا — تُخطّى" % u["email"])
        else:
            print("  ❌ %-26s HTTP %s — %s" % (u["email"], code, str(data)[:160]))

    # ضبط الدور والتخصص في profiles (المشغّل أنشأ الصف بدور افتراضي)
    print("\nضبط الأدوار والتخصصات…")
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import sb  # noqa: E402

    for u in USERS:
        spec = "'%s'::specialty" % u["specialty"] if u["specialty"] else "null"
        ok, _ = sb.run_sql(env, """
            update profiles set
              full_name    = %s,
              full_name_en = %s,
              role         = '%s'::user_role,
              specialty    = %s
            where email = '%s'
        """ % ("'" + u["full_name"].replace("'", "''") + "'",
               "'" + u["full_name_en"].replace("'", "''") + "'",
               u["role"], spec, u["email"]))
        print("  %s %s" % ("✅" if ok else "❌", u["email"]))

    if created:
        print("\n" + "=" * 74)
        print("  كلمات المرور — تُعرض مرة واحدة ولا تُحفظ في أي ملف")
        print("  سلّم كل واحد كلمته ثم غيّرها من لوحة Supabase عند اللزوم")
        print("=" * 74)
        for u, pwd, _ in created:
            print("  %-26s  %s" % (u["email"], pwd))
        print("=" * 74)


if __name__ == "__main__":
    main()
