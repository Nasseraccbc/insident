# -*- coding: utf-8 -*-
"""
اختبار الواجهة بمتصفح حقيقي — يضغط ويعبّي ويلتقط صورًا كما يفعل المستخدم.

    python tools/test_ui.py                 كل الاختبارات
    python tools/test_ui.py --headed        بمتصفح مرئي لتتابعه بعينك
    python tools/test_ui.py --only tech     فحص واحد فقط

الصور تُحفظ في tools/shots/ ويمكن فتحها لمراجعة الشكل.
"""
import io
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "tools", "shots")
BASE = "http://127.0.0.1:8080"

PASS, FAIL, CONSOLE = [], [], []

USERS = {
    "tech": ("test@sce-ops.local", None),
    "sup": ("ammar@sce-ops.local", None),
    "admin": ("faisal@sce-ops.local", None),
    "client": ("khalaf@sce-ops.local", None),
}


def load_passwords():
    """كلمات المرور من .env.test إن وُجد — لا تُكتب في الكود ولا تُرفع."""
    path = os.path.join(ROOT, ".env.test")
    if not os.path.exists(path):
        sys.exit(
            "ناقص .env.test — أنشئه بهذا الشكل (محجوب عن Git):\n"
            "  TEST_PW=...\n  AMMAR_PW=...\n  FAISAL_PW=...\n"
        )
    env = {}
    for line in io.open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    USERS["tech"] = (USERS["tech"][0], env.get("TEST_PW"))
    USERS["sup"] = (USERS["sup"][0], env.get("AMMAR_PW"))
    USERS["admin"] = (USERS["admin"][0], env.get("FAISAL_PW"))
    USERS["client"] = (USERS["client"][0], env.get("KHALAF_PW"))
    missing = [k for k, (_, p) in USERS.items() if not p]
    if missing:
        sys.exit("ناقص كلمة مرور في .env.test لـ: " + ", ".join(missing))


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print("  %s %s" % ("✅" if ok else "❌", name))
    if detail:
        print("       " + str(detail)[:200])


def shot(page, name):
    os.makedirs(SHOTS, exist_ok=True)
    p = os.path.join(SHOTS, name + ".png")
    page.screenshot(path=p, full_page=True)
    return p


def login(page, who):
    """يضمن حالة خروج أولًا — كل فحص يبدأ من صفحة نظيفة."""
    email, pw = USERS[who]
    page.goto(BASE + "/", wait_until="networkidle")
    page.evaluate("() => { try { for (const k of Object.keys(localStorage)) "
                  "if (k.startsWith('sb-')) localStorage.removeItem(k); } catch(e){} }")
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_selector(".login-card", timeout=15000)
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', pw)
    page.click('button[type="submit"]')
    page.wait_for_selector(".sidebar", timeout=20000)
    page.wait_for_timeout(800)


def nav_items(page):
    return [t.strip() for t in page.eval_on_selector_all(
        ".nav-item .nav-label", "els => els.map(e => e.textContent)")]


# ─── الفحوص ────────────────────────────────────────────────────────────────

def test_login(page):
    print("\n[1] شاشة الدخول")
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_selector(".login-card", timeout=15000)
    check("تظهر بطاقة الدخول", page.is_visible(".login-card"))
    check("العنوان عربي", "نظام" in page.inner_text(".login-card"))
    check("الاتجاه RTL", page.get_attribute("html", "dir") == "rtl")
    shot(page, "01-login")

    page.fill('input[type="email"]', "wrong@x.local")
    page.fill('input[type="password"]', "wrongwrong")
    page.click('button[type="submit"]')
    page.wait_for_timeout(2500)
    err = page.inner_text(".err") if page.is_visible(".err") else ""
    check("بيانات خاطئة تُرفض برسالة", bool(err.strip()), err[:60])


def test_tech(page):
    print("\n[2] لوحة الفني")
    login(page, "tech")
    items = nav_items(page)
    check("يرى مهامي", any("مهام" in i for i in items), str(items))
    check("لا يرى المستخدمين", not any("المستخدم" in i for i in items), str(items))
    check("لا يرى الاعتمادات", not any("اعتماد" in i for i in items))
    check("عدد أقسامه محدود", len(items) <= 4, "%d قسم" % len(items))

    cards = page.query_selector_all(".task-card")
    check("تظهر بطاقات المهام", len(cards) > 0, "%d بطاقة" % len(cards))
    if cards:
        first = cards[0].inner_text()
        check("الحرج أولًا", "حرج" in first, first.split("\n")[0][:60])
        timer = page.query_selector(".task-timer")
        check("مؤقّت حيّ يعمل", bool(timer) and ":" in (timer.inner_text() or ""),
              timer.inner_text() if timer else "—")
    shot(page, "02-tech-desktop")

    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(600)
    off = page.eval_on_selector(".sidebar", """e => {
        const r = e.getBoundingClientRect();
        return r.right <= 2 || r.left >= window.innerWidth - 2;
    }""")
    check("الشريط الجانبي ينطوي على الجوّال", off,
          page.eval_on_selector(".sidebar",
            "e => JSON.stringify({l:Math.round(e.getBoundingClientRect().left),"
            "r:Math.round(e.getBoundingClientRect().right),w:window.innerWidth})"))
    btn = page.query_selector(".task-actions .btn")
    if btn:
        h = btn.bounding_box()["height"]
        check("أزرار الجوّال ≥ 48px", h >= 48, "%.0fpx" % h)
    shot(page, "03-tech-mobile")
    page.set_viewport_size({"width": 1440, "height": 900})


def test_forms(page):
    print("\n[3] النماذج")
    login(page, "tech")
    page.goto(BASE + "/#/forms", wait_until="networkidle")
    page.wait_for_timeout(1200)
    cards = page.query_selector_all(".form-card")
    check("تظهر النماذج الـ19", len(cards) == 19, "%d نموذج" % len(cards))
    shot(page, "04-forms-list")

    page.goto(BASE + "/#/forms/QA-01", wait_until="networkidle")
    page.wait_for_timeout(1500)
    secs = page.query_selector_all(".form-sec")
    check("أقسام النموذج تُصيَّر", len(secs) >= 2, "%d قسم" % len(secs))
    check("شريط التقدّم موجود", page.is_visible(".bar"))

    inputs = page.query_selector_all(".sec-body input.input, .sec-body textarea, .sec-body select")
    check("حقول قابلة للتعبئة", len(inputs) > 0, "%d حقل" % len(inputs))

    txt = page.query_selector('.sec-body input.input[type="text"]')
    if txt:
        txt.fill("اختبار آلي")
        page.wait_for_timeout(500)
        pctxt = page.inner_text(".page-head")
        check("التقدّم يتحدّث بالكتابة", re.search(r"\d+/\d+", pctxt) is not None,
              re.search(r"\d+/\d+ · \d+%", pctxt).group(0) if re.search(r"\d+/\d+ · \d+%", pctxt) else pctxt[:60])

    rowsbtn = page.query_selector("button:has-text('إضافة صف')")
    if rowsbtn:
        cells = lambda: len(page.query_selector_all(".rows-tbl tbody tr td input, "
                                                    ".rows-tbl tbody tr td select"))
        before = cells()
        rowsbtn.click(); page.wait_for_timeout(500)
        mid = cells()
        check("زر إضافة صف يضيف حقولًا", mid > before, "%d ← %d خلية" % (before, mid))
        rm = page.query_selector(".rows-tbl tbody button")
        if rm:
            rm.click(); page.wait_for_timeout(400)
            check("زر حذف الصف يعمل", cells() == before, "%d ← %d خلية" % (mid, cells()))


    sigs = page.query_selector_all(".sig-box")
    check("أقسام الاعتماد تُصيَّر", len(sigs) >= 1, "%d صندوق توقيع" % len(sigs))
    check("خانات الصور الثلاث", len(page.query_selector_all(".photo-slot")) == 3,
          "%d خانة" % len(page.query_selector_all(".photo-slot")))
    shot(page, "05-form-qa01")


def test_supervisor(page):
    print("\n[4] لوحة المشرف")
    login(page, "sup")
    items = nav_items(page)
    check("يرى المهام", any("المهام" in i for i in items), str(items))
    check("لا يرى المستخدمين", not any("المستخدم" in i for i in items))

    page.goto(BASE + "/#/tasks", wait_until="networkidle")
    page.wait_for_timeout(1500)
    check("جدول المهام يظهر", page.is_visible("table.tbl"))
    check("بطاقات إحصائية", len(page.query_selector_all(".stat")) >= 3,
          "%d بطاقة" % len(page.query_selector_all(".stat")))

    btn = page.query_selector("button:has-text('المكلَّف')")
    if btn:
        btn.click(); page.wait_for_timeout(700)
        check("نافذة الإسناد تفتح", page.is_visible(".modal"))
        groups = page.query_selector_all(".modal optgroup")
        check("الفنيون مجمّعون بالتخصص", len(groups) >= 1,
              str([g.get_attribute("label") for g in groups]))
        shot(page, "06-assign-modal")
        page.keyboard.press("Escape")
    shot(page, "07-supervisor-tasks")


def test_theme_lang(page):
    print("\n[5] المظهر واللغة")
    login(page, "tech")
    page.click('.topbar button:has-text("English")')
    page.wait_for_timeout(900)
    check("التبديل للإنجليزية", page.get_attribute("html", "dir") == "ltr",
          page.get_attribute("html", "lang"))
    shot(page, "08-english")
    page.click('.topbar button:has-text("عربي")')
    page.wait_for_timeout(900)
    check("الرجوع للعربية", page.get_attribute("html", "dir") == "rtl")

    page.click('.topbar button[title="المظهر"], .topbar button:has-text("◐")')
    page.wait_for_timeout(600)
    check("الوضع الليلي", page.get_attribute("html", "data-theme") == "dark")
    shot(page, "09-dark")


def test_widgets(page):
    """الودجات الثلاث المركّبة — egrid و drinks و triparty."""
    print("\n[5] الودجات المركّبة")
    login(page, "tech")

    # ── QA-02-EL: شبكة ٢٤ أصلًا × ١٢ نقطة ──────────────────────────────
    page.goto(BASE + "/#/forms/QA-02-EL", wait_until="networkidle")
    page.wait_for_selector(".ast", timeout=20000)
    page.wait_for_timeout(600)

    asts = page.query_selector_all(".ast")
    check("٢٤ بطاقة أصل", len(asts) == 24, "%d بطاقة" % len(asts))
    pts = page.query_selector_all(".ast .pt")
    check("٢٨٨ نقطة فحص", len(pts) == 288, "%d نقطة" % len(pts))
    check("النقاط الحرجة معلّمة", len(page.query_selector_all(".ast .pt-crit")) == 24 * 4,
          "%d علامة" % len(page.query_selector_all(".ast .pt-crit")))

    # البطاقات مطوية ابتداءً ثم تُفتح بالنقر
    check("البطاقات مطوية ابتداءً",
          page.eval_on_selector_all(".ast-body",
              "els => els.every(e => e.classList.contains('collapsed'))"))
    page.query_selector_all(".ast-head")[11].click()      # EL-12
    page.wait_for_timeout(300)
    check("النقر يفتح بطاقة الأصل",
          not page.eval_on_selector_all(".ast-body",
              "els => els[11].classList.contains('collapsed')"))

    # ✕ على نقطة حرجة (سلامة التأريض) — يجب أن يُظلَّل الأصل أحمر
    card = page.query_selector_all(".ast")[11]
    rows = card.query_selector_all(".pt")
    crit_row = None
    for r in rows:
        if r.query_selector(".pt-crit"):
            crit_row = r
            break
    crit_row.query_selector(".seg-btn.fail").click()
    page.wait_for_timeout(400)

    cls = card.get_attribute("class")
    check("العطل يُظلِّل الأصل أحمر", "crit" in cls, cls)
    tag = card.query_selector(".ast-tag").inner_text()
    check("شارة الأصل تعدّ الأعطال", "1" in tag, tag)
    summ = page.inner_text(".egrid-sum")
    check("الملخّص يعدّ الأصول المعطوبة", "1" in summ, summ.replace("\n", " ")[:80])
    check("تحذير توليد أمر العمل يظهر", "أمر عمل" in summ, summ.replace("\n", " ")[:80])

    head = page.inner_text(".page-head")
    check("الشبكة تُحتسب في التقدّم", re.search(r"[1-9]\d*/\d+", head) is not None, head[:60])

    # التصفية «بها أعطال» تُبقي بطاقة واحدة
    page.click(".chips .chip:last-child")
    page.wait_for_timeout(300)
    vis = page.eval_on_selector_all(".ast", "els => els.filter(e => !e.hidden).length")
    check("تصفية «بها أعطال» تعرض واحدة", vis == 1, "%d ظاهرة" % vis)
    page.click(".chips .chip:first-child")
    page.wait_for_timeout(200)

    # زر «كل النقاط سليمة» يملأ الاثنتي عشرة نقطة
    page.query_selector_all(".ast-head")[0].click()
    page.wait_for_timeout(250)
    page.query_selector_all(".ast")[0].query_selector(".ast-tools .btn").click()
    page.wait_for_timeout(400)
    tag0 = page.query_selector_all(".ast")[0].query_selector(".ast-tag").inner_text()
    check("«كل النقاط سليمة» يملأ ١٢ نقطة", "12/12" in tag0, tag0)
    shot(page, "10-egrid")

    # الحفظ يمرّ فعلًا إلى القاعدة ويولّد أمر العمل
    # الموقع تحديدًا لا أوّل حقل نصّي: منه يرث أمر العمل المتولّد موقعه،
    # وبادئة «زز-» تميّز صفوف الاختبار في القاعدة لتنظيفها لاحقًا.
    page.fill('.field:has(label:has-text("الموقع")) input.input', "زز-غرفة اختبار الودجات")
    page.click("button:has-text('حفظ')")
    page.wait_for_timeout(3500)
    ok = page.query_selector(".toast.ok")
    check("الحفظ ينجح مع الشبكة", bool(ok), ok.inner_text()[:60] if ok else "لا إشعار نجاح")

    # ── HS-01: شبكة المشروبات ──────────────────────────────────────────
    page.goto(BASE + "/#/forms/HS-01", wait_until="networkidle")
    page.wait_for_selector(".drink", timeout=15000)
    drinks = page.query_selector_all(".drink")
    check("١٤ صنف مشروبات", len(drinks) == 14, "%d صنف" % len(drinks))
    check("ثلاث فئات", len(page.query_selector_all(".drink-cat")) == 3)

    plus = drinks[0].query_selector_all(".qty-b")[1]
    for _ in range(3):
        plus.click()
    page.wait_for_timeout(400)
    check("الزيادة تضبط الكمية", drinks[0].query_selector(".qty-n").inner_text().strip() == "3",
          drinks[0].query_selector(".qty-n").inner_text())
    check("ملاحظة التحضير تظهر عند الطلب",
          drinks[0].query_selector(".drink-note").is_visible())
    check("الإجمالي يتحدّث", "3" in page.inner_text(".egrid-sum"),
          page.inner_text(".egrid-sum")[:40])

    minus = drinks[0].query_selector_all(".qty-b")[0]
    for _ in range(5):
        minus.click()
    page.wait_for_timeout(300)
    check("لا كمية سالبة", drinks[0].query_selector(".qty-n").inner_text().strip() == "0",
          drinks[0].query_selector(".qty-n").inner_text())
    shot(page, "11-drinks")

    # ── MR-01: التحقق الثلاثي ──────────────────────────────────────────
    page.goto(BASE + "/#/forms/MR-01", wait_until="networkidle")
    page.wait_for_selector(".tri-card", timeout=15000)
    cards3 = page.query_selector_all(".tri-card")
    check("ثلاث جهات", len(cards3) == 3, "%d جهة" % len(cards3))
    check("عشرة بنود", len(page.query_selector_all(".tri .pt")) == 10,
          "%d بند" % len(page.query_selector_all(".tri .pt")))
    check("اعتماد مستقل لكل جهة",
          len(page.query_selector_all(".tri-foot select")) == 3)

    first = cards3[0]
    for r in first.query_selector_all(".pt"):
        r.query_selector(".seg-btn.ok").click()
    page.wait_for_timeout(400)
    cnt = first.query_selector(".tri-count").inner_text().strip()
    check("عدّاد الجهة يكتمل", cnt == "6/6", cnt)
    check("العدّاد يخضرّ عند الاكتمال",
          "ok" in first.query_selector(".tri-count").get_attribute("class"))
    shot(page, "12-triparty")

    # ── الجوّال: لا فيض أفقي ───────────────────────────────────────────
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/#/forms/QA-02-EL", wait_until="networkidle")
    page.wait_for_selector(".ast", timeout=15000)
    page.wait_for_timeout(600)
    ov = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check("لا فيض أفقي على الجوّال", ov <= 1, "%dpx زائدة" % ov)
    # القياس بعد فتح بطاقة: الأزرار المطوية ارتفاعها صفر لا لأنها صغيرة
    page.query_selector_all(".ast-head")[0].click()
    page.wait_for_timeout(300)
    h = page.eval_on_selector(".ast-body:not(.collapsed) .seg-btn",
                              "e => e.getBoundingClientRect().height")
    check("أزرار الفحص ≥ 44px على الجوّال", h >= 44, "%.0fpx" % h)
    shot(page, "13-egrid-mobile")
    page.set_viewport_size({"width": 1440, "height": 900})


# زر المظهر في الشريط العلوي — يُعرّف بنصّه لا بموقعه
THEME_BTN = '.topbar button:has-text("◐")'


def test_dashboard(page):
    """لوحة المؤشرات: الأرقام والرسوم وتفاعلها وتبديل المظهر."""
    print("\n[6] لوحة المؤشرات")
    login(page, "admin")
    page.goto(BASE + "/#/dashboard", wait_until="networkidle")
    page.wait_for_selector(".viz-card", timeout=20000)
    page.wait_for_timeout(1200)

    check("بطاقة الرقم البطل تظهر", page.is_visible(".hero-card"))
    check("رقم بطل واحد لا أكثر", len(page.query_selector_all(".hero-num")) <= 1,
          "%d" % len(page.query_selector_all(".hero-num")))
    check("بطاقات الأرقام أربع", len(page.query_selector_all(".stats .stat")) == 4,
          "%d بطاقة" % len(page.query_selector_all(".stats .stat")))
    check("أربع بطاقات رسم", len(page.query_selector_all(".viz-card")) == 4,
          "%d بطاقة" % len(page.query_selector_all(".viz-card")))
    check("لكل رسم توأم جدولي", len(page.query_selector_all(".viz-table")) == 4,
          "%d جدول" % len(page.query_selector_all(".viz-table")))
    check("صفّ مرشّحات واحد أعلى الصفحة",
          len(page.query_selector_all(".viz-filters")) == 1 and
          len(page.query_selector_all(".viz-card .chips")) == 0)

    # الشبكة صلبة لا متقطّعة (نمط مضادّ صريح في مرجع dataviz)
    dashed = page.eval_on_selector_all(
        "svg.viz line",
        "els => els.filter(e => getComputedStyle(e).strokeDasharray !== 'none').length")
    check("لا شبكة متقطّعة", dashed == 0, "%d خط متقطّع" % dashed)

    # النصوص لا ترتدي لون السلسلة
    series_ink = page.eval_on_selector_all(
        "svg.viz text",
        "els => els.filter(e => { const f = getComputedStyle(e).fill;"
        " return f === 'rgb(0, 97, 51)' || f === 'rgb(221, 172, 55)'; }).length")
    check("النصوص برموز النص لا بلون السلسلة", series_ink == 0, "%d نص ملوّن" % series_ink)

    # تبديل المدة يعيد البناء
    page.click(".viz-filters .chip:last-child")
    page.wait_for_timeout(900)
    check("تبديل المدة يعيد بناء الرسوم", page.is_visible(".viz-card"),
          page.inner_text(".viz-filters")[:40].replace("\n", " "))

    # تبديل المظهر يعيد طلاء العلامات فورًا
    line = page.query_selector("svg.viz path.viz-line")
    if line:
        before = page.eval_on_selector("svg.viz path.viz-line", "e => getComputedStyle(e).stroke")
        page.click(THEME_BTN)
        page.wait_for_timeout(700)
        after = page.eval_on_selector("svg.viz path.viz-line", "e => getComputedStyle(e).stroke")
        check("المظهر الليلي يعيد طلاء الرسوم", before != after, "%s ← %s" % (before, after))
        page.click(THEME_BTN)
        page.wait_for_timeout(500)

    shot(page, "23-dashboard")

    # الجوّال: بلا فيض أفقي
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(900)
    ov = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check("لا فيض أفقي على الجوّال", ov <= 1, "%dpx زائدة" % ov)
    shot(page, "24-dashboard-mobile")
    page.set_viewport_size({"width": 1440, "height": 900})


def test_review(page):
    """مسار الاعتماد كاملًا: الفني يرسل ← المشرف يُرجع ← يصلّح ← يعتمد."""
    print("\n[7] مسار الاعتماد")

    # ① الفني يعبّي ويرسل
    login(page, "tech")
    page.goto(BASE + "/#/forms/QA-01", wait_until="networkidle")
    page.wait_for_selector(".form-sec", timeout=15000)
    page.fill('.sec-body input.input[type="text"]', "زز-اعتماد-واجهة")
    page.click("button:has-text('إرسال')")
    page.wait_for_timeout(3500)
    check("الإرسال ينقل الفني بعيدًا عن النموذج", "/forms/QA-01" not in page.url, page.url[-40:])

    # ② المشرف يجد السجل في الاعتمادات
    login(page, "sup")
    items = nav_items(page)
    check("المشرف يرى الاعتمادات", any("اعتماد" in i for i in items), str(items))
    page.goto(BASE + "/#/approvals", wait_until="networkidle")
    page.wait_for_timeout(2000)
    card = page.query_selector(".task-card:has-text('زز-اعتماد-واجهة')")
    check("السجل المرسل يظهر عند المشرف", bool(card),
          "%d بطاقة" % len(page.query_selector_all(".task-card")))
    if not card:
        return
    rid = card.query_selector("a.btn").get_attribute("href").split("/")[-1]

    # ③ الإرجاع بلا ملاحظة مرفوض
    card.query_selector_all("button")[0].click()      # إرجاع بملاحظة
    page.wait_for_selector(".modal", timeout=5000)
    page.click(".modal-foot button:has-text('إرجاع')")
    page.wait_for_timeout(700)
    check("الإرجاع الفارغ يُرفض والنافذة تبقى", page.is_visible(".modal"))

    NOTE = "الصورة الثانية غير واضحة — أعد التقاطها"
    page.fill(".modal textarea", NOTE)
    page.click(".modal-foot button:has-text('إرجاع')")
    page.wait_for_timeout(2500)
    check("الإرجاع ينفّذ ويخرج السجل من القائمة",
          not page.query_selector(".task-card:has-text('زز-اعتماد-واجهة')"))

    # ④ الفني يرى سبب الإرجاع
    login(page, "tech")
    page.goto(BASE + "/#/forms/r/" + rid, wait_until="networkidle")
    page.wait_for_selector(".form-sec", timeout=15000)
    page.wait_for_timeout(800)
    check("بانر الإرجاع يظهر للفني", page.is_visible(".ret-card"))
    check("نصّ الملاحظة يصل كما كُتب",
          NOTE in (page.inner_text(".ret-card") if page.is_visible(".ret-card") else ""),
          page.inner_text(".ret-card").replace("\n", " ")[:70] if page.is_visible(".ret-card") else "—")
    check("خطّ الزمن يسجّل الخطوات", page.is_visible(".tl-card"))

    # ⑤ يصلّح ويعيد الإرسال، والمشرف يعتمد
    page.click("button:has-text('إرسال')")
    page.wait_for_timeout(3500)

    login(page, "sup")
    page.goto(BASE + "/#/approvals", wait_until="networkidle")
    page.wait_for_timeout(2000)
    card = page.query_selector(".task-card:has-text('زز-اعتماد-واجهة')")
    check("السجل يعود للاعتماد بعد التصحيح", bool(card))
    if card:
        card.query_selector_all("button")[1].click()   # اعتماد
        page.wait_for_selector(".modal", timeout=5000)
        page.click(".modal-foot button:has-text('اعتماد')")
        page.wait_for_timeout(2500)
        check("الاعتماد يخرجه من القائمة",
              not page.query_selector(".task-card:has-text('زز-اعتماد-واجهة')"))

    # ⑥ المغلق وثيقة لا تُعدَّل
    login(page, "tech")
    page.goto(BASE + "/#/forms/r/" + rid, wait_until="networkidle")
    page.wait_for_selector(".form-sec", timeout=15000)
    page.wait_for_timeout(700)
    dis = page.eval_on_selector_all(
        ".sec-body input.input, .sec-body textarea",
        "els => els.length > 0 && els.every(e => e.disabled)")
    check("السجل المغلق للعرض فقط", dis, "الحقول معطّلة" if dis else "قابلة للتحرير")

    # ⑦ ممثل الهيئة يرى ولا يقرّر
    login(page, "client")
    items = nav_items(page)
    check("ممثل الهيئة لا يرى الاعتمادات", not any("اعتماد" in i for i in items), str(items))
    check("ممثل الهيئة يرى السجلات", any("سجلات" in i for i in items), str(items))
    page.goto(BASE + "/#/records", wait_until="networkidle")
    page.wait_for_timeout(2000)
    check("جدول السجلات يظهر له", page.is_visible("table.tbl"))
    page.goto(BASE + "/#/approvals", wait_until="networkidle")
    page.wait_for_timeout(1200)
    check("رابط الاعتمادات المكتوب يدويًا لا يفتح له شاشة قرار",
          not page.query_selector("button:has-text('اعتماد')"))
    shot(page, "25-client-records")


TESTS = {"login": test_login, "tech": test_tech, "forms": test_forms,
         "sup": test_supervisor, "widgets": test_widgets, "dash": test_dashboard,
         "review": test_review, "theme": test_theme_lang}


def main():
    load_passwords()
    headed = "--headed" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]

    print("=" * 70)
    print(" اختبار الواجهة بمتصفح حقيقي" + ("  [مرئي]" if headed else ""))
    print("=" * 70)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page = ctx.new_page()

        page.on("console", lambda m: CONSOLE.append((m.type, m.text))
                if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: CONSOLE.append(("pageerror", str(e))))

        for name, fn in TESTS.items():
            if only and name != only:
                continue
            try:
                fn(page)
            except Exception as e:
                check("[%s] انهار الفحص" % name, False, str(e).split("\n")[0][:190])

        browser.close()

    # الـ400 من محاولة الدخول الخاطئة المتعمَّدة في الفحص الأول متوقّعة
    errs = [c for c in CONSOLE
            if c[0] in ("error", "pageerror")
            and "status of 400" not in c[1]]
    print("\n" + "=" * 70)
    if errs:
        print(" أخطاء الكونسول (%d):" % len(errs))
        seen = set()
        for kind, txt in errs:
            key = txt[:80]
            if key in seen:
                continue
            seen.add(key)
            print("   ⚠ [%s] %s" % (kind, txt[:180]))
    else:
        print(" كونسول نظيف — لا أخطاء ✅")
    print("-" * 70)
    print(" نجح: %d   |   فشل: %d" % (len(PASS), len(FAIL)))
    for f in FAIL:
        print("   ❌ " + f)
    print(" الصور: tools/shots/")
    print("=" * 70)
    sys.exit(1 if (FAIL or errs) else 0)


if __name__ == "__main__":
    main()
