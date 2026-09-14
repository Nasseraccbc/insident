# -*- coding: utf-8 -*-
"""
اختبار دورة العمل من الطرف للطرف — كما تفعلها الواجهة بالضبط:
مفتاح anon + رمز دخول الفني، لا صلاحيات إدارية.

    python tools/test_flow.py <كلمة مرور test@sce-ops.local>
"""
import io
import json
import os
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
import zlib

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


def req(url, anon, token=None, payload=None, method="GET", raw=None, mime=None, extra=None):
    headers = {"apikey": anon, "Authorization": "Bearer " + (token or anon)}
    if extra:
        headers.update(extra)
    body = None
    if raw is not None:
        body = raw
        headers["Content-Type"] = mime or "application/octet-stream"
    elif payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            t = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(t) if t.strip().startswith(("{", "[")) else t)
    except urllib.error.HTTPError as e:
        t = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(t)
        except ValueError:
            return e.code, t


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print("  %s %s" % ("✅" if ok else "❌", name))
    if detail:
        print("       " + str(detail)[:190])


def tiny_png():
    """PNG 2×2 مولّد برمجيًا — لا اعتماد على ملف خارجي."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    w = h = 2
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\x1a\x4d\x2e" * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def main():
    if len(sys.argv) < 2:
        sys.exit("الاستخدام: python tools/test_flow.py <كلمة مرور test>")
    env = load_env()
    base = env["SUPABASE_URL"].rstrip("/")
    anon = env["SUPABASE_ANON_KEY"]

    print("=" * 68)
    print(" اختبار دورة العمل: مهمة ← نموذج ← سجل ← صورة")
    print("=" * 68)

    print("\n[1] دخول الفني")
    code, d = req(base + "/auth/v1/token?grant_type=password", anon,
                  payload={"email": "test@sce-ops.local", "password": sys.argv[1]}, method="POST")
    ok = code == 200 and d.get("access_token")
    check("تسجيل الدخول", bool(ok), "" if ok else str(d)[:160])
    if not ok:
        sys.exit(1)
    tok, uid = d["access_token"], d["user"]["id"]

    print("\n[2] الفني يرى مهامه")
    code, my = req(base + "/rest/v1/tasks?select=*&assigned_to=eq." + uid, anon, tok)
    check("قراءة المهام", code == 200 and isinstance(my, list), "عدد=%s" % (len(my) if isinstance(my, list) else "?"))
    task = my[0] if isinstance(my, list) and my else None
    check("توجد مهمة مسندة", bool(task), task["title"] if task else "لا مهام")

    print("\n[3] إنشاء سجل نموذج بحقول JSONB")
    payload = {
        "form_code": "QA-01",
        "title": "زز-تدفق",
        "priority": "high",
        "created_by": uid,
        "assigned_to": uid,
        "data": {"no": "WO-9001", "site": "مبنى الاختبار",
                 "items": [["بند أول", "مطابق", "صورة"], ["بند ثانٍ", "يحتاج معالجة", "فحص"]],
                 "notes": "ملاحظة اختبارية"},
    }
    code, rec = req(base + "/rest/v1/records", anon, tok, payload=payload, method="POST",
                    extra={"Prefer": "return=representation"})
    made = code in (200, 201) and isinstance(rec, list) and rec
    check("إنشاء السجل", bool(made), "HTTP %s · %s" % (code, str(rec)[:130]))
    if not made:
        sys.exit(1)
    rec = rec[0]
    rid = rec["id"]

    check("SLA احتُسب على الخادم", bool(rec.get("sla_response_due")), rec.get("sla_response_due"))
    check("JSONB حُفظ كاملًا", rec["data"].get("no") == "WO-9001"
          and len(rec["data"].get("items", [])) == 2,
          "حقول=%d · صفوف الجدول=%d" % (len(rec["data"]), len(rec["data"].get("items", []))))

    print("\n[4] رفع صورة إلى Storage")
    png = tiny_png()
    path = "records/%s/before-test.png" % rid
    code, d = req(base + "/storage/v1/object/attachments/" + urllib.parse.quote(path),
                  anon, tok, raw=png, mime="image/png", method="POST",
                  extra={"x-upsert": "true"})
    up = code in (200, 201)
    check("رفع الملف", up, "HTTP %s · %s" % (code, str(d)[:140]))

    if up:
        code, d = req(base + "/rest/v1/attachments", anon, tok, method="POST",
                      payload={"record_id": rid, "kind": "before", "storage_path": path,
                               "mime": "image/png", "size_bytes": len(png), "uploaded_by": uid},
                      extra={"Prefer": "return=representation"})
        check("تسجيل المرفق", code in (200, 201), "HTTP %s · %s" % (code, str(d)[:130]))

        code, d = req(base + "/storage/v1/object/sign/attachments/" + urllib.parse.quote(path),
                      anon, tok, payload={"expiresIn": 600}, method="POST")
        check("رابط موقّت للصورة", code == 200 and "signedURL" in str(d), str(d)[:110])

    print("\n[5] الانتقال في مسار الاعتماد")
    code, d = req(base + "/rest/v1/records?id=eq." + rid, anon, tok,
                  payload={"state": "sent"}, method="PATCH")
    check("مسودة ← مُرسل", code in (200, 204), "HTTP %s" % code)

    code, h = req(base + "/rest/v1/record_history?select=from_state,to_state&record_id=eq."
                  + rid + "&order=at", anon, tok)
    seq = [(x["from_state"], x["to_state"]) for x in h] if isinstance(h, list) else []
    check("السجل التاريخي كُتب تلقائيًا", len(seq) == 2 and seq[-1] == ("draft", "sent"), str(seq))

    print("\n[6] العزل")
    code, d = req(base + "/rest/v1/profiles?id=eq." + uid, anon, tok,
                  payload={"role": "admin"}, method="PATCH")
    check("لا يرقّي نفسه", code >= 400, "HTTP %s" % code)

    print("\n" + "=" * 68)
    print(" نجح: %d   |   فشل: %d" % (len(PASS), len(FAIL)))
    for f in FAIL:
        print("   ❌ " + f)
    print("=" * 68)
    print("\nنظّف:  python tools/sb.py --allow-destructive "
          "-q \"delete from records where title like 'زز-%'\"")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
