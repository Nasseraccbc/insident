/* ============================================================================
   ودجات النماذج الثلاثة الجديدة — لا تُختزل إلى حقول عادية.

     egrid     ٢٤ أصلًا × ١٢ نقطة فحص  → QA-02-EL
     drinks    ١٤ صنف مشروبات بكمية     → HS-01
     triparty  قائمة تحقق ثلاثية        → MR-01
     syscheck  فحص معدات نظام بكمية وحالة → INS-01 · WO-01
     syspick   اختيار النظام من الكتالوج  → WO-01

   كل ودجة تُصدَّر كواصف موحّد { build, blank, filled, wide } فيسجّلها المحرّك
   في TYPES بلا معرفة بتفاصيلها. إضافة ودجة رابعة = إدخال واحد هنا.

   المرجع: PROJECT-SPEC.md §6
   ============================================================================ */

import { assets as assetsApi, checkPoints } from "../db.js";
import { lang } from "../i18n.js";
import { el } from "../ui.js";
import { DICT } from "./definitions.js";

/* ترجمة محلية بدل الاستيراد من renderer.js — استيراد متبادل بين الوحدتين
   يعمل لكنه هشّ، وسطران أرخص من دورة اعتماد. */
const tr = (ar) => (lang === "en" ? DICT[ar] || ar : ar);
const ar = (a, e) => (lang === "en" ? e || a : a);

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const copy = (v) => JSON.parse(JSON.stringify(v ?? {}));

/* ─── مرجع الأصول ونقاط الفحص ──────────────────────────────────────────── */
/* يُقرأ من القاعدة لا من ثابت في الكود: المشغّل يقرأ من الجدول ذاته، فمصدر
   واحد للحقيقة يمنع انحراف الواجهة عن منطق الأعمال. */

let refsPromise = null;

function refs() {
  if (!refsPromise) {
    refsPromise = Promise.all([assetsApi.list(), checkPoints.list()])
      .then(([list, points]) => ({ list, points }))
      .catch((err) => {
        refsPromise = null;   // وإلا بقي الفشل محفوظًا ولم تنفع إعادة المحاولة
        throw err;
      });
  }
  return refsPromise;
}

/* ─── عنصر اختيار مجزّأ ────────────────────────────────────────────────── */
/* ثلاث حالات لا خانة اختيار: «لم يُفحص» تختلف عن «سليم»، وطمسها تحت خانة
   فارغة يجعل النموذج يكذب. الضغط على الخيار المختار يلغيه. */

function seg(opts, value, pick) {
  const box = el("div", { class: "seg", role: "group" });
  const btns = opts.map((o) =>
    el("button", {
      class: "seg-btn " + (o.cls || ""), type: "button",
      "data-ui": "toggle",
      "aria-pressed": String(value === o.v),
      title: o.title || o.label,
      onclick: () => {
        const next = value === o.v ? "" : o.v;
        value = next;
        btns.forEach((b, i) => b.setAttribute("aria-pressed", String(opts[i].v === next)));
        pick(next);
      },
    }, o.label)
  );
  box.append(...btns);
  return box;
}

/* ============================================================================
   ١ · egrid — شبكة الفحص الكهربائي
   الشكل المخزَّن:  { "EL-12": { "earth": "fail", "visual": "ok" }, ... }
   وهو بالضبط ما يقرأه المشغّل gen_corrective_wo — أي تغيير هنا يكسر توليد
   أوامر العمل التصحيحية.
   ============================================================================ */

const G_OPTS = () => [
  { v: "ok",   label: "✓", cls: "ok",   title: ar("سليم", "Pass") },
  { v: "fail", label: "✕", cls: "fail", title: ar("عطل", "Fail") },
  { v: "na",   label: "—", cls: "na",   title: ar("لا ينطبق", "N/A") },
];

function egridBuild(f, v, on) {
  const value = isObj(v) ? copy(v) : {};
  const host = el("div", { class: "egrid" });

  host.append(el("div", { class: "dim small",
    text: ar("جارٍ تحميل الأصول ونقاط الفحص…", "Loading assets and check points…") }));

  refs()
    .then(({ list, points }) => host.replaceChildren(draw(list, points)))
    .catch((err) => host.replaceChildren(
      el("div", { class: "note danger small",
        text: ar("تعذّر تحميل الأصول: ", "Could not load assets: ") + (err.message || "") })
    ));

  function draw(list, points) {
    const wrap = el("div", {});
    const listBox = el("div", { class: "egrid-list" });
    const summary = el("div", { class: "egrid-sum" });
    const cards = [];
    let filter = "all";

    const emit = () => { on(copy(value)); sync(); };

    /* حالة أصل واحد: عدد الأعطال وعدد النقاط المسجّلة */
    function stat(code) {
      const rec = value[code] || {};
      const keys = Object.keys(rec);
      const bad = keys.filter((k) => rec[k] === "fail");
      return { done: keys.length, bad, crit: bad.some((k) => points.find((p) => p.key === k)?.critical) };
    }

    function sync() {
      let inspected = 0, broken = 0;
      for (const c of cards) {
        const s = stat(c.code);
        if (s.done) inspected++;
        if (s.bad.length) broken++;
        c.apply(s);
        const show =
          filter === "all" ? true :
          filter === "bad" ? s.bad.length > 0 :
          s.done < points.length;               // «غير مكتمل»
        c.node.hidden = !show;
      }
      summary.replaceChildren(
        el("b", { text: `${inspected}/${cards.length}` }),
        el("span", { class: "dim", text: " " + ar("أصل مفحوص", "assets inspected") }),
        el("span", { class: "dot" }),
        el("b", { class: broken ? "bad" : "", text: String(broken) }),
        el("span", { class: "dim", text: " " + ar("بها أعطال", "with faults") }),
        broken
          ? el("span", { class: "tiny warn-text",
              text: " · " + ar("يُولَّد أمر عمل تصحيحي لكل أصل معطوب عند الحفظ",
                               "a corrective work order is raised per faulty asset on save") })
          : null
      );
    }

    /* صف نقطة فحص واحدة — تُستعمل عند البناء وعند إعادة الرسم الجماعي */
    function pointRow(code, p) {
      return el("div", { class: "pt" },
        el("span", { class: "pt-l" },
          lang === "en" ? p.name_en : p.name_ar,
          p.critical
            ? el("span", { class: "pt-crit", text: " ⚠",
                title: ar("نقطة حرجة — عطلها يرفع أولوية أمر العمل إلى حرج",
                          "Critical point — a fault here raises the work order to critical") })
            : null
        ),
        seg(G_OPTS(), (value[code] || {})[p.key] || "", (nv) => {
          const rec = (value[code] ||= {});
          if (nv) rec[p.key] = nv; else delete rec[p.key];
          if (!Object.keys(rec).length) delete value[code];
          emit();
        })
      );
    }

    /* بطاقة أصل: مطوية افتراضيًا — ٢٨٨ خانة مفتوحة دفعة واحدة غير قابلة للقراءة */
    for (const a of list) {
      const tag = el("span", { class: "ast-tag" });
      const body = el("div", { class: "ast-body collapsed" });
      const caret = el("span", { class: "sec-caret", text: "◂" });

      const head = el("button", {
        class: "ast-head", type: "button", "data-ui": "toggle",
        onclick: () => {
          const hidden = body.classList.toggle("collapsed");
          caret.textContent = hidden ? "◂" : "▾";
        },
      },
        caret,
        el("span", { class: "ast-code", text: a.code }),
        el("span", { class: "ast-name grow", text: lang === "en" ? a.name_en : a.name_ar }),
        tag
      );

      const rows = el("div", { class: "pt-list" }, ...points.map((p) => pointRow(a.code, p)));

      body.append(
        el("div", { class: "ast-tools" },
          el("button", {
            class: "btn btn-sm btn-ghost", type: "button",
            onclick: () => {
              value[a.code] = Object.fromEntries(points.map((p) => [p.key, "ok"]));
              on(copy(value));
              redrawCard(a.code);
            },
            text: "✓ " + ar("كل النقاط سليمة", "All points pass"),
          }),
          el("button", {
            class: "btn btn-sm btn-ghost", type: "button",
            onclick: () => { delete value[a.code]; on(copy(value)); redrawCard(a.code); },
            text: "↺ " + ar("مسح", "Clear"),
          })
        ),
        rows
      );

      const node = el("div", { class: "ast" }, head, body);
      const card = {
        code: a.code, node, body, rows, points,
        apply(s) {
          node.classList.toggle("bad", s.bad.length > 0);
          node.classList.toggle("crit", s.crit);
          tag.className = "ast-tag " + (s.bad.length ? "bad" : s.done ? "ok" : "");
          tag.textContent = s.bad.length
            ? `${s.bad.length} ${ar("عطل", "faults")}`
            : s.done
              ? `${s.done}/${points.length}`
              : ar("لم يُفحص", "Not inspected");
        },
      };
      cards.push(card);
      listBox.append(node);
    }

    /* إعادة رسم بطاقة واحدة بعد تغيير جماعي (كل النقاط سليمة / مسح) */
    function redrawCard(code) {
      const card = cards.find((c) => c.code === code);
      if (!card) return;
      card.rows.replaceChildren(...points.map((p) => pointRow(code, p)));
      sync();
    }

    const filterBtns = [
      { v: "all",  l: ar("الكل", "All") },
      { v: "todo", l: ar("غير مكتمل", "Incomplete") },
      { v: "bad",  l: ar("بها أعطال", "Faulty") },
    ].map((o) =>
      el("button", {
        class: "chip", type: "button", "data-ui": "toggle",
        "aria-pressed": String(filter === o.v),
        onclick: (e) => {
          filter = o.v;
          e.target.parentElement.querySelectorAll(".chip")
            .forEach((b) => b.setAttribute("aria-pressed", String(b === e.target)));
          sync();
        },
      }, o.l)
    );

    wrap.append(
      el("div", { class: "egrid-bar" }, summary, el("div", { class: "chips" }, ...filterBtns)),
      listBox
    );
    sync();
    return wrap;
  }

  return host;
}

/* ============================================================================
   ٢ · drinks — شبكة المشروبات
   الشكل المخزَّن: { "espresso": { q: 2, n: "سكر قليل" }, ... }
   الأصناف تأتي من تعريف النموذج (f.items) لا من هنا — قائمة الأصناف بيانات.
   ============================================================================ */

function drinksBuild(f, v, on) {
  const value = isObj(v) ? copy(v) : {};
  const items = f.items || [];
  const total = el("b", {});

  const emit = () => {
    on(copy(value));
    const n = Object.values(value).reduce((s, x) => s + (Number(x?.q) || 0), 0);
    total.textContent = String(n);
  };

  const wrap = el("div", { class: "drinks" });

  /* تجميع حسب الفئة بترتيب ورودها في التعريف */
  const cats = [];
  for (const it of items) {
    let c = cats.find((x) => x.k === it.cat);
    if (!c) cats.push((c = { k: it.cat, en: it.catEn, items: [] }));
    c.items.push(it);
  }

  for (const c of cats) {
    const rows = el("div", { class: "drink-list" });
    for (const it of c.items) {
      const rec = (value[it.k] ||= { q: 0, n: "" });
      const qty = el("span", { class: "qty-n", text: String(rec.q || 0) });
      const note = el("input", {
        class: "input drink-note", type: "text",
        value: rec.n || "", placeholder: ar("ملاحظة التحضير", "Preparation note"),
        oninput: (e) => { rec.n = e.target.value; emit(); },
      });
      note.hidden = !(rec.q > 0);

      let row;
      const set = (n) => {
        rec.q = Math.max(0, Math.min(99, n));
        qty.textContent = String(rec.q);
        note.hidden = rec.q === 0;
        row.classList.toggle("on", rec.q > 0);
        if (!rec.q) rec.n = "";
        if (!rec.q) note.value = "";
        emit();
      };

      row = el("div", { class: "drink" + (rec.q > 0 ? " on" : "") },
        el("div", { class: "drink-top" },
          el("span", { class: "drink-name grow", text: ar(it.ar, it.en) }),
          el("div", { class: "qty" },
            el("button", { class: "qty-b", type: "button", "data-ui": "toggle",
                           "aria-label": ar("إنقاص", "Decrease"),
                           onclick: () => set((rec.q || 0) - 1), text: "−" }),
            qty,
            el("button", { class: "qty-b", type: "button", "data-ui": "toggle",
                           "aria-label": ar("زيادة", "Increase"),
                           onclick: () => set((rec.q || 0) + 1), text: "+" })
          )
        ),
        note
      );
      rows.append(row);
    }
    wrap.append(el("div", { class: "drink-cat" },
      el("div", { class: "drink-cat-t", text: ar(c.k, c.en) }), rows));
  }

  const n0 = Object.values(value).reduce((s, x) => s + (Number(x?.q) || 0), 0);
  total.textContent = String(n0);

  return el("div", {},
    el("div", { class: "egrid-bar" },
      el("div", { class: "egrid-sum" }, total,
        el("span", { class: "dim", text: " " + ar("وحدة مطلوبة", "units ordered") }))),
    wrap
  );
}

/* ============================================================================
   ٣ · triparty — قائمة تحقق ثلاثية باعتماد مستقل لكل جهة
   الشكل المخزَّن:
     { "hosp": { items: { "layout": "done" }, by: "اسم", at: "2026-09-14T10:00",
                 dec: "معتمد" }, ... }
   الجهات وبنودها تأتي من f.parties.
   ============================================================================ */

const DEC = ["جاهز", "جاهز مع ملاحظات", "غير جاهز"];

const T_OPTS = () => [
  { v: "done", label: "✓", cls: "ok",   title: ar("منفَّذ", "Done") },
  { v: "na",   label: "—", cls: "na",   title: ar("لا ينطبق", "N/A") },
  { v: "fail", label: "✕", cls: "fail", title: ar("غير منفَّذ", "Not done") },
];

function tripartyBuild(f, v, on) {
  const value = isObj(v) ? copy(v) : {};
  const parties = f.parties || [];
  const wrap = el("div", { class: "tri" });

  const emit = () => on(copy(value));

  for (const p of parties) {
    const rec = (value[p.k] ||= { items: {}, by: "", at: "", dec: "" });
    rec.items ||= {};

    const count = el("span", { class: "tri-count" });
    const refresh = () => {
      const done = p.items.filter((i) => rec.items[i.k] === "done").length;
      const na = p.items.filter((i) => rec.items[i.k] === "na").length;
      count.textContent = `${done}/${p.items.length - na}`;
      count.className = "tri-count " + (done === p.items.length - na ? "ok" : "");
    };

    const rows = el("div", { class: "pt-list" });
    for (const it of p.items) {
      rows.append(el("div", { class: "pt" },
        el("span", { class: "pt-l", text: ar(it.ar, it.en) }),
        seg(T_OPTS(), rec.items[it.k] || "", (nv) => {
          if (nv) rec.items[it.k] = nv; else delete rec.items[it.k];
          refresh(); emit();
        })
      ));
    }

    const dec = el("select", { class: "select",
      onchange: (e) => { rec.dec = e.target.value; emit(); } });
    dec.append(el("option", { value: "" }, "— " + ar("الجاهزية", "Readiness") + " —"));
    for (const d of DEC) dec.append(el("option", { value: d, selected: d === rec.dec }, tr(d)));

    wrap.append(el("section", { class: "tri-card" },
      el("div", { class: "tri-head" },
        el("span", { class: "grow", text: ar(p.ar, p.en) }), count),
      rows,
      /* اعتماد مستقل لكل جهة: من نفّذ ومتى وبأي حكم — لا توقيع واحد يغطي الثلاث */
      el("div", { class: "tri-foot" },
        el("input", { class: "input", type: "text", value: rec.by || "",
          placeholder: ar("المسؤول", "Responsible"),
          oninput: (e) => { rec.by = e.target.value; emit(); } }),
        el("input", { class: "input", type: "datetime-local", value: rec.at || "",
          oninput: (e) => { rec.at = e.target.value; emit(); } }),
        dec
      )
    ));
    refresh();
  }

  return wrap;
}

/* ============================================================================
   السجل الموحّد
   ============================================================================ */

export const WIDGETS = {
  egrid: {
    build: egridBuild,
    blank: () => ({}),
    filled: (v) => isObj(v) && Object.keys(v).length > 0,
    wide: true,
  },
  drinks: {
    build: drinksBuild,
    blank: () => ({}),
    filled: (v) => isObj(v) && Object.values(v).some((x) => Number(x?.q) > 0),
    wide: true,
  },
  triparty: {
    build: tripartyBuild,
    blank: () => ({}),
    filled: (v) => isObj(v) &&
      Object.values(v).some((p) => p?.items && Object.keys(p.items).length > 0),
    wide: true,
  },
};

/* ============================================================================
   ٤ · syscheck — جولة فحص الأنظمة
   تطابق تسلسل النموذج الذي يعرفه الفريق: مجموعة ← نظام ← تنزل معداته،
   ولكل معدة كمية وحالة. الشكل المخزَّن:
     { "group": "hvac", "system": "HVAC",
       "items": { "MC-01": { q: 2, s: "bad", f: "replace" }, ... } }
     s حكم الفني على المعدة، وf تشخيصه لعطبها.
   ============================================================================ */

const GROUPS = [
  { k: "hvac",     ar: "التكييف والتبريد والتهوية", en: "HVAC, Refrigeration & Ventilation" },
  { k: "civil",    ar: "الأعمال المدنية والمعمارية", en: "Civil & Architectural" },
  { k: "plumbing", ar: "السباكة والتصريف",           en: "Plumbing & Drainage" },
];

/* الحكم ثنائي: ممتازة أو سيئة. وكان الطرف الثاني «تحتاج صيانة» فيحمل
   تشخيصًا بعينه — فالتالف يُسجَّل «يحتاج صيانة» وهو لا يُصلَح، ومن يقرأ
   التقرير لا يميّز ما يُصلَح ممّا يُستبدل. صار الحكم وحده في الزرّين،
   والتشخيص في قائمة تحته. */
const ST = () => [
  { v: "ok",  label: ar("ممتازة", "Excellent"), cls: "ok" },
  { v: "bad", label: ar("سيئة", "Poor"),        cls: "fail" },
];

const FAULTS = () => [
  { v: "maint",   label: ar("تحتاج صيانة", "Needs service") },
  { v: "replace", label: ar("تحتاج استبدال", "Needs replacement") },
  { v: "broken",  label: ar("تالفة", "Out of order") },
];

/* سجلات حُفظت قبل الفصل تحمل s = "maint" حكمًا وتشخيصًا معًا. تُقرأ على
   معناها الأول: سيئة، وعطبها يحتاج صيانة. */
function migrate(rec) {
  if (rec && rec.s === "maint") { rec.s = "bad"; rec.f ||= "maint"; }
  return rec;
}

const groupCache = {};
function groupAssets(cat) {
  if (!groupCache[cat]) {
    groupCache[cat] = assetsApi.byGroup(cat).catch((e) => { delete groupCache[cat]; throw e; });
  }
  return groupCache[cat];
}

/** النظام المخزَّن في حقل آخر (syspick) — أو null إن لم يُختر بعد. */
function pickOf(v) {
  return isObj(v) && v.g && v.s ? v : null;
}

function syscheckBuild(f, v, on, data) {
  const value = isObj(v) ? copy(v) : { group: "", system: "", items: {} };
  value.items ||= {};

  /* الربط بحقل النظام: البلاغ يُسجَّل على نظام بعينه، فلا معنى لأن يعيد
     الفني اختياره — تنزل معدات ذلك النظام وحدها. ويبقى له تغييرها إن
     تبيّن أن العطل في نظام آخر. */
  const bindKey = f.bind;

  const flash = el("div", { class: "note warn small mb-4", hidden: true });

  function adopt(src, explicit) {
    if (!src || (value.group === src.g && value.system === src.s)) return false;
    const dirty = Object.values(value.items).some((x) => x && x.s);
    // إعادة بناء الشاشة ليست قرارًا من الفني: لا تمسّ عملًا مُدخلًا
    if (dirty && !explicit) return false;
    // أمّا تبديله النظام صراحةً فقرار: حالات معدات نظام لا تنتقل إلى غيره،
    // ومسحها صامتًا خيانة — تُمسح ويُقال له.
    if (dirty) {
      flash.textContent = ar(
        "بُدِّل النظام — أُفرغت حالات معدات النظام السابق.",
        "System switched — the previous system's equipment statuses were cleared.");
      flash.hidden = false;
    }
    value.group = src.g;
    value.system = src.s;
    value.items = {};
    return true;
  }

  if (bindKey) adopt(pickOf(data && data[bindKey]));

  const host = el("div", { class: "sysc" });
  const sysBox = el("div", { class: "sysc-systems" });
  const listBox = el("div", { class: "sysc-list" });
  const sum = el("div", { class: "egrid-sum" });

  const emit = () => { on(copy(value)); count(); };

  function count() {
    const items = Object.values(value.items);
    const maint = items.filter((x) => x.s === "bad" || x.s === "maint").length;
    const good = items.filter((x) => x.s === "ok").length;
    sum.replaceChildren(
      el("b", { class: maint ? "bad" : "", text: String(maint) }),
      el("span", { class: "dim", text: " " + ar("سيئة", "poor") }),
      el("span", { class: "dot" }),
      el("b", { text: String(good) }),
      el("span", { class: "dim", text: " " + ar("ممتازة", "excellent") })
    );
  }

  /* المجموعة أولًا: ثلاث كتل كبيرة لا قائمة منسدلة — الفني يختار بإبهامه */
  const groupRow = el("div", { class: "chips" }, ...GROUPS.map((g) =>
    el("button", {
      class: "chip", type: "button", "data-ui": "toggle",
      "aria-pressed": String(value.group === g.k),
      onclick: () => {
        if (value.group !== g.k) { value.group = g.k; value.system = ""; }
        groupRow.querySelectorAll(".chip").forEach((b, i) =>
          b.setAttribute("aria-pressed", String(GROUPS[i].k === value.group)));
        emit(); loadSystems();
      },
    }, ar(g.ar, g.en))
  ));

  function loadSystems() {
    if (!value.group) {
      sysBox.replaceChildren();
      listBox.replaceChildren(bindKey
        ? el("div", { class: "viz-empty small muted", text: ar(
            "اختر «النظام المعني» في قسم تسجيل البلاغ لتظهر معداته هنا.",
            "Pick the system concerned in the request section to list its equipment here.") })
        : el("div", { class: "viz-empty small muted", text: ar(
            "اختر المجموعة ثم النظام", "Pick a group then a system") }));
      return;
    }
    sysBox.replaceChildren(el("div", { class: "dim small", text: ar("جارٍ التحميل…", "Loading…") }));
    groupAssets(value.group).then((rows) => {
      const systems = [];
      for (const r of rows) {
        let s = systems.find((x) => x.key === r.system_key);
        if (!s) systems.push((s = { key: r.system_key, ar: r.system_ar, en: r.system_en, rows: [] }));
        s.rows.push(r);
      }
      const cur = systems.find((x) => x.key === value.system);
      sysBox.replaceChildren(bindKey
        // مفتاحان لشيء واحد يفترقان: النظام مصدره حقل البلاغ، وهنا يُعرض فقط
        ? el("div", { class: "sysc-head small" },
            el("span", { class: "dim", text: ar("معدات نظام:", "Equipment of:") }),
            el("b", { text: cur ? ar(cur.ar, cur.en) : ar("— لم يُحدَّد —", "— not set —") }))
        : el("div", { class: "field" },
            el("label", { text: ar("النظام", "System") }),
            selectSystems(systems)));
      drawList(systems);
    }).catch((err) => sysBox.replaceChildren(
      el("div", { class: "note danger small", text: (err.message || "") })));
  }

  function selectSystems(systems) {
    const sel = el("select", { class: "select", onchange: (e) => {
      value.system = e.target.value; emit(); drawList(systems);
    } });
    sel.append(el("option", { value: "" }, "— " + ar("اختر النظام", "Select a system") + " —"));
    for (const s of systems) {
      sel.append(el("option", { value: s.key, selected: s.key === value.system },
        `${ar(s.ar, s.en)} (${s.rows.length})`));
    }
    return sel;
  }

  function drawList(systems) {
    const s = systems.find((x) => x.key === value.system);
    if (!s) {
      listBox.replaceChildren(el("div", { class: "viz-empty small muted",
        text: ar("اختر النظام لتظهر معداته", "Pick a system to list its equipment") }));
      return;
    }
    listBox.replaceChildren(...s.rows.map(equipRow));
  }

  function equipRow(r) {
    const rec = migrate(value.items[r.code] ||= { q: 1, s: "" });
    const qty = el("span", { class: "qty-n", text: String(rec.q ?? 1) });
    const row = el("div", { class: "sysc-item" + (rec.s ? " on" : "") });
    const faultBox = el("div", { class: "sysc-fault" });

    const setQ = (n) => {
      rec.q = Math.max(1, Math.min(99, n));
      qty.textContent = String(rec.q);
      emit();
    };

    row.append(
      el("div", { class: "sysc-top" },
        el("span", { class: "sysc-code mono", text: r.code }),
        el("span", { class: "sysc-name grow", text: lang === "en" ? r.name_en : r.name_ar }),
        el("div", { class: "qty" },
          el("button", { class: "qty-b", type: "button", "data-ui": "toggle",
                         "aria-label": ar("إنقاص", "Decrease"),
                         onclick: () => setQ((rec.q || 1) - 1), text: "−" }),
          qty,
          el("button", { class: "qty-b", type: "button", "data-ui": "toggle",
                         "aria-label": ar("زيادة", "Increase"),
                         onclick: () => setQ((rec.q || 1) + 1), text: "+" })
        )
      ),
      seg(ST(), rec.s || "", (nv) => {
        if (nv) rec.s = nv; else delete rec.s;
        if (rec.s !== "bad") delete rec.f;      // تشخيص بلا حكم لا معنى له
        row.classList.toggle("on", !!rec.s);
        row.classList.toggle("bad", rec.s === "bad");
        drawFault();
        emit();
      }),
      faultBox
    );

    /* القائمة تظهر مع «سيئة» وحدها، وتبدأ فارغة: اختيار «تحتاج صيانة»
       تلقائيًا تشخيصٌ لم يقله أحد. */
    function drawFault() {
      faultBox.replaceChildren();
      if (rec.s !== "bad") return;
      const sel = el("select", { class: "select", onchange: (e) => {
        if (e.target.value) rec.f = e.target.value; else delete rec.f;
        faultBox.classList.toggle("undiagnosed", !rec.f);
        emit();
      } });
      sel.append(el("option", { value: "" }, "— " + ar("حدّد نوع العطل", "Specify the fault") + " —"));
      for (const f of FAULTS()) {
        sel.append(el("option", { value: f.v, selected: f.v === rec.f }, f.label));
      }
      faultBox.append(sel);
      faultBox.classList.toggle("undiagnosed", !rec.f);
    }

    drawFault();
    row.classList.toggle("bad", rec.s === "bad");
    return row;
  }

  host.append(
    flash,
    // المربوطة لا تعرض شريط المجموعات: مصدر النظام حقل البلاغ وحده
    el("div", { class: "egrid-bar" }, sum, bindKey ? null : groupRow),
    sysBox,
    listBox
  );

  if (bindKey) {
    const follow = (e) => {
      // الشاشة تُعاد بناؤها كثيرًا؛ بلا هذا يبقى المستمع معلّقًا على عقدة ميتة
      if (!host.isConnected) return document.removeEventListener("form:field", follow);
      if (e.detail?.k !== bindKey || !adopt(pickOf(e.detail.v), true)) return;
      groupRow.querySelectorAll(".chip").forEach((b, i) =>
        b.setAttribute("aria-pressed", String(GROUPS[i].k === value.group)));
      emit();
      loadSystems();
    };
    document.addEventListener("form:field", follow);
  }

  count();
  loadSystems();
  return host;
}

/* ============================================================================
   ٥ · syspick — اختيار النظام عند تسجيل البلاغ
   قائمة واحدة مجمَّعة بالمجموعات، مصدرها جدول الأصول لا ثابت في الكود.
   قيمتها { g, s, ar, en } لأن نصًّا حرًّا لا تُبنى عليه قائمة معدات.
   ============================================================================ */

function syspickBuild(f, v, on) {
  const cur = isObj(v) ? copy(v) : {};
  const legacy = !isObj(v) && String(v ?? "").trim();   // نصّ قديم من قبل القوائم

  const sel = el("select", { class: "select" });
  sel.append(el("option", { value: "" }, "— " + ar("اختر النظام", "Select a system") + " —"));
  if (legacy) sel.append(el("option", { value: "?", selected: true }, legacy));
  sel.append(el("option", { value: "…", disabled: true }, ar("جارٍ التحميل…", "Loading…")));

  Promise.all(GROUPS.map((g) => groupAssets(g.k).then((rows) => [g, rows])))
    .then((pairs) => {
      sel.replaceChildren(
        el("option", { value: "" }, "— " + ar("اختر النظام", "Select a system") + " —")
      );
      const index = {};
      for (const [g, rows] of pairs) {
        const og = el("optgroup", { label: ar(g.ar, g.en) });
        const seen = [];
        for (const r of rows) {
          if (seen.includes(r.system_key)) continue;
          seen.push(r.system_key);
          const key = g.k + "|" + r.system_key;
          index[key] = { g: g.k, s: r.system_key, ar: r.system_ar, en: r.system_en };
          const n = rows.filter((x) => x.system_key === r.system_key).length;
          og.append(el("option", { value: key, selected: cur.g === g.k && cur.s === r.system_key },
            `${ar(r.system_ar, r.system_en)} (${n})`));
        }
        sel.append(og);
      }
      if (legacy && !sel.value) {
        sel.append(el("option", { value: "?", selected: true }, legacy));
      }
      sel.onchange = (e) => on(index[e.target.value] ? copy(index[e.target.value]) : {});
    })
    .catch((err) => {
      sel.replaceChildren(el("option", { value: "" }, err.message || ar("تعذّر التحميل", "Load failed")));
    });

  return sel;
}

WIDGETS.syspick = {
  build: syspickBuild,
  blank: () => ({}),
  filled: (v) => (isObj(v) ? !!v.s : !!String(v ?? "").trim()),
  wide: false,
};

WIDGETS.syscheck = {
  build: syscheckBuild,
  blank: () => ({ group: "", system: "", items: {} }),
  filled: (v) => isObj(v) && Object.values(v.items || {}).some((x) => x?.s),
  wide: true,
};
