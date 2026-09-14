# -*- coding: utf-8 -*-
"""
أداة تنفيذ SQL على Supabase عبر Management API.

    python tools/sb.py -f supabase/01_schema.sql    تنفيذ ملف
    python tools/sb.py -q "select 1"                تنفيذ استعلام
    python tools/sb.py --tables                     عرض جداول public
    python tools/sb.py --check                      فحص الاتصال

المفاتيح تُقرأ من .env ولا تُطبع أبداً.
عمليات الحذف (drop/delete/truncate) محجوبة إلا مع --allow-destructive.
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env")
API = "https://api.supabase.com"

# ما يفقد بيانات فعلًا فقط. أما drop trigger/policy/function/index مع
# if exists فنمط قياسي لجعل ملفات الهجرة قابلة لإعادة التشغيل، ولا يمس صفًا.
DESTRUCTIVE = re.compile(
    r"\b(drop\s+(table|schema|database|materialized\s+view|view)\b"
    r"|alter\s+table\s+\S+\s+drop\s+(column|constraint)\b"
    r"|truncate\b"
    r"|delete\s+from\b)",
    re.I,
)


def load_env():
    if not os.path.exists(ENV_PATH):
        sys.exit("لم يُعثر على .env — انسخ .env.example إليه واملأ القيم")
    env = {}
    for line in io.open(ENV_PATH, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    missing = [k for k in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF") if not env.get(k)]
    if missing:
        sys.exit("ناقص في .env: " + ", ".join(missing))
    return env


def request(env, method, path, payload=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={
            "Authorization": "Bearer " + env["SUPABASE_ACCESS_TOKEN"],
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def run_sql(env, sql):
    """يرجّع (ok، نتيجة أو نص الخطأ). الـ API يرجّع 200 أو 201 عند النجاح."""
    code, data = request(
        env, "POST", "/v1/projects/%s/database/query" % env["SUPABASE_PROJECT_REF"], {"query": sql}
    )
    return (200 <= code < 300), data


def guard(sql, allow):
    hit = DESTRUCTIVE.search(sql)
    if hit and not allow:
        sys.exit(
            "\n⛔ أمر حذف مرفوض: %s\n"
            "   الحذف يحتاج موافقة صريحة — أعد التشغيل بـ --allow-destructive\n" % hit.group(0)
        )


def show(data):
    if data is None:
        print("   (تم — بلا نتائج)")
        return
    if isinstance(data, str):
        print("  ", data[:1500])
        return
    if isinstance(data, list):
        if not data:
            print("   (صفر صفوف)")
            return
        cols = list(data[0].keys())
        widths = {c: max(len(str(c)), *(len(str(r.get(c, ""))) for r in data)) for c in cols}
        widths = {c: min(w, 45) for c, w in widths.items()}
        print("   " + " | ".join(str(c).ljust(widths[c]) for c in cols))
        print("   " + "-+-".join("-" * widths[c] for c in cols))
        for r in data[:100]:
            print("   " + " | ".join(str(r.get(c, ""))[: widths[c]].ljust(widths[c]) for c in cols))
        if len(data) > 100:
            print("   … و%d صفاً آخر" % (len(data) - 100))
    else:
        print("  ", json.dumps(data, ensure_ascii=False)[:1500])


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("-f", "--file", help="ملف SQL للتنفيذ")
    ap.add_argument("-q", "--query", help="استعلام SQL مباشر")
    ap.add_argument("--tables", action="store_true", help="عرض جداول public")
    ap.add_argument("--check", action="store_true", help="فحص الاتصال")
    ap.add_argument("--allow-destructive", action="store_true", help="السماح بأوامر الحذف")
    a = ap.parse_args()

    env = load_env()

    if a.check:
        ok, d = run_sql(env, "select current_database() db, version() v")
        if not ok:
            print("❌ فشل الاتصال"); show(d); sys.exit(1)
        print("✅ الاتصال يعمل")
        print("   القاعدة:", d[0]["db"])
        print("   الإصدار:", d[0]["v"].split(" on ")[0])
        return

    if a.tables:
        ok, d = run_sql(env, """
            select t.table_name,
                   (select count(*) from information_schema.columns c
                     where c.table_schema='public' and c.table_name=t.table_name) as cols,
                   coalesce(p.rowsecurity,false) as rls
              from information_schema.tables t
              left join pg_tables p
                     on p.schemaname='public' and p.tablename=t.table_name
             where t.table_schema='public' and t.table_type='BASE TABLE'
             order by 1
        """)
        if not ok:
            print("❌"); show(d); sys.exit(1)
        if not d:
            print("لا جداول في public — لوحة بيضاء")
        else:
            show(d)
        return

    sql = None
    label = ""
    if a.file:
        path = a.file if os.path.isabs(a.file) else os.path.join(ROOT, a.file)
        if not os.path.exists(path):
            sys.exit("الملف غير موجود: " + path)
        sql = io.open(path, encoding="utf-8").read()
        label = os.path.basename(path)
    elif a.query:
        sql = a.query
        label = "استعلام"
    else:
        ap.print_help()
        sys.exit(0)

    guard(sql, a.allow_destructive)
    print("▶ تنفيذ %s (%d حرفاً)…" % (label, len(sql)))
    ok, d = run_sql(env, sql)
    if ok:
        print("✅ نجح")
        show(d)
    else:
        print("❌ فشل")
        show(d)
        sys.exit(1)


if __name__ == "__main__":
    main()
