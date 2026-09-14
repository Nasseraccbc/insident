/* ============================================================================
   ودجات النماذج الثلاثة الجديدة — لا تُختزل إلى حقول عادية.

     egrid     ٢٤ أصلًا × ١٢ نقطة فحص  → QA-02-EL
     drinks    ١٤ صنف مشروبات بكمية     → HS-01
     triparty  قائمة تحقق ثلاثية        → MR-01

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
