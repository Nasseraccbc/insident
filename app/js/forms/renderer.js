/* ============================================================================
   محرّك تصيير النماذج.

   يقرأ تعريف النموذج (بيانات) ويبني الحقول. إضافة نموذج جديد = إضافة تعريف،
   بلا كود جديد. وإضافة نوع حقل جديد = إدخال واحد في TYPES أدناه.

   الأنواع الأساسية: text · area · sel · date · time · num · rows · chkg · reg · calc
   والودجات المركّبة تأتي من widgets.js: egrid · drinks · triparty
   ============================================================================ */

import { FORMS, DICT } from "./definitions.js";
import { WIDGETS } from "./widgets.js";
import { lang } from "../i18n.js";
import { el } from "../ui.js";

export { FORMS };

export function formByCode(code) {
  return FORMS.find((f) => f.code === code) || null;
}

/** ترجمة تسمية عربية إلى الإنجليزية عبر القاموس المستخرج. */
export function tr(ar) {
  if (lang !== "en") return ar;
  return DICT[ar] || ar;
}

export function formName(form) {
  if (!form) return "";
  return lang === "en" ? form.en || form.name : form.name;
}

export function sectionTitle(sec) {
  return lang === "en" ? sec.en || tr(sec.t) : sec.t;
}

/* ─── قيمة افتراضية لكل نوع ────────────────────────────────────────────── */

export function blankValue(field) {
  const w = WIDGETS[field.t];
  if (w) return w.blank();
  switch (field.t) {
    case "rows": return [];
    case "chkg": return [];
    case "num":  return "";
    default:     return "";
  }
}

export function blankData(form) {
  const data = {};
  for (const sec of form.secs || []) {
    for (const f of sec.f || []) data[f.k] = blankValue(f);
  }
  return data;
}

/* ─── بنّاؤو الأنواع ───────────────────────────────────────────────────── */
/* كل بنّاء يستقبل (field, value, onChange) ويرجّع عنصر DOM. */

const TYPES = {
  text: (f, v, on) =>
    el("input", {
      class: "input", type: "text", value: v ?? "",
      placeholder: f.ph ? tr(f.ph) : "",
      oninput: (e) => on(e.target.value),
    }),

  num: (f, v, on) =>
    el("input", {
      class: "input", type: "number", value: v ?? "",
      placeholder: f.ph ? tr(f.ph) : "",
      min: f.min, max: f.max, step: f.step || "any",
      oninput: (e) => on(e.target.value),
    }),

  date: (f, v, on) =>
    el("input", { class: "input", type: "date", value: v ?? "",
                  oninput: (e) => on(e.target.value) }),

  time: (f, v, on) =>
    el("input", { class: "input", type: "time", value: v ?? "",
                  oninput: (e) => on(e.target.value) }),

  area: (f, v, on) =>
    el("textarea", {
      class: "textarea", rows: f.rows || 3,
      placeholder: f.ph ? tr(f.ph) : "",
      oninput: (e) => on(e.target.value),
    }, v ?? ""),

  sel: (f, v, on) => {
    const s = el("select", { class: "select", onchange: (e) => on(e.target.value) });
    s.append(el("option", { value: "" }, "— " + (lang === "ar" ? "اختر" : "Select") + " —"));
    for (const o of f.o || []) {
      s.append(el("option", { value: o, selected: o === v }, tr(o)));
    }
    return s;
  },

  /* مجموعة اختيارات متعددة */
  chkg: (f, v, on) => {
    const on_ = new Set(Array.isArray(v) ? v : []);
    const box = el("div", { class: "chk-group" });
    for (const o of f.o || []) {
      const id = "c" + Math.random().toString(36).slice(2, 9);
      const cb = el("input", {
        type: "checkbox", id, checked: on_.has(o),
        onchange: (e) => {
          e.target.checked ? on_.add(o) : on_.delete(o);
          on((f.o || []).filter((x) => on_.has(x)));
        },
      });
      box.append(el("label", { class: "chk", for: id }, cb, el("span", { text: tr(o) })));
    }
    return box;
  },

  /* حقل للقراءة فقط — يُحتسب من حقول أخرى */
  calc: (f, v) =>
    el("input", { class: "input", value: v ?? "", readonly: true, tabindex: -1 }),

  reg: (f, v, on) =>
    el("input", {
      class: "input mono", type: "text", value: v ?? "",
      placeholder: f.ph ? tr(f.ph) : "",
      oninput: (e) => on(e.target.value),
    }),

  /* جدول ديناميكي متعدد الأعمدة */
  rows: (f, v, on) => {
    const cols = f.cols || [];
    const data = Array.isArray(v) ? v.map((r) => [...r]) : [];

    const wrap = el("div", { class: "rows-field" });
    const body = el("tbody", {});

    const emit = () => on(data.map((r) => [...r]));

    function drawRow(row, i) {
      const tr_ = el("tr", {});
      tr_.append(el("td", { class: "mono dim tiny", text: String(i + 1) }));

      cols.forEach((c, ci) => {
        const cell = el("td", {});
        const val = row[ci] ?? "";
        let ctrl;
        if (c.t === "sel") {
          ctrl = el("select", { class: "select",
            onchange: (e) => { data[i][ci] = e.target.value; emit(); } });
          ctrl.append(el("option", { value: "" }, "—"));
          for (const o of c.o || []) {
            ctrl.append(el("option", { value: o, selected: o === val }, tr(o)));
          }
        } else if (c.t === "area") {
          ctrl = el("textarea", { class: "textarea", rows: 2,
            oninput: (e) => { data[i][ci] = e.target.value; emit(); } }, val);
        } else {
          ctrl = el("input", {
            class: "input", type: c.t === "num" ? "number" : c.t === "date" ? "date" : "text",
            value: val, placeholder: c.ph ? tr(c.ph) : "",
            oninput: (e) => { data[i][ci] = e.target.value; emit(); },
          });
        }
        cell.append(ctrl);
        tr_.append(cell);
      });

      tr_.append(el("td", {},
        el("button", {
          class: "btn btn-ghost btn-icon", type: "button",
          title: lang === "ar" ? "حذف الصف" : "Remove row",
          onclick: () => { data.splice(i, 1); emit(); redraw(); },
          text: "✕",
        })
      ));
      return tr_;
    }

    function redraw() {
      body.replaceChildren(...data.map(drawRow));
      if (!data.length) {
        body.append(el("tr", {}, el("td", {
          colspan: cols.length + 2, class: "dim small center",
          text: lang === "ar" ? "لا صفوف — أضف صفًا" : "No rows — add one",
        })));
      }
    }

    redraw();

    wrap.append(
      el("div", { class: "table-wrap" },
        el("table", { class: "tbl rows-tbl" },
          el("thead", {}, el("tr", {},
            el("th", { style: "width:36px", text: "#" }),
            ...cols.map((c) => el("th", { text: tr(c.l || c.t || "") })),
            el("th", { style: "width:44px" })
          )),
          body
        )
      ),
      el("button", {
        class: "btn btn-sm mt-2", type: "button",
        onclick: () => { data.push(new Array(cols.length).fill("")); emit(); redraw(); },
      }, "+ " + (lang === "ar" ? "إضافة صف" : "Add row"))
    );

    return wrap;
  },
};

/* الودجات المركّبة تدخل السجل نفسه: المحرّك لا يعرف الفرق بين نوع أساسي
   وودجة، وهذا ما يجعل إضافة نوع رابع إدخالًا واحدًا لا تعديلًا في المحرّك. */
for (const [name, w] of Object.entries(WIDGETS)) TYPES[name] = w.build;

/* ─── تصيير حقل واحد ───────────────────────────────────────────────────── */

export function renderField(field, value, onChange) {
  const build = TYPES[field.t] || TYPES.text;
  const control = build(field, value, onChange);

  const wide = field.t === "rows" || field.t === "area" || WIDGETS[field.t]?.wide || field.full;

  return el("div", { class: "field" + (wide ? " wide" : "") },
    el("label", {},
      tr(field.l),
      field.req ? el("span", { class: "req", text: "*" }) : null
    ),
    control,
    field.hint ? el("div", { class: "hint", text: tr(field.hint) }) : null
  );
}

/** هل في القسم ودجة مركّبة؟ أقسامها تُفتح ابتداءً لأنها لبّ النموذج. */
export function isWidgetSection(sec) {
  return (sec.f || []).some((f) => !!WIDGETS[f.t]);
}

/* ─── تصيير قسم ────────────────────────────────────────────────────────── */
/* الأقسام قابلة للطي: نموذج فيه ٤٠ حقلًا غير قابل للقراءة مفتوحًا دفعة واحدة،
   خصوصًا على شاشة جوّال. */

export function renderSection(sec, data, onChange, { open = true } = {}) {
  const grid = el("div", { class: "form-grid" });

  for (const f of sec.f || []) {
    grid.append(renderField(f, data[f.k], (v) => { data[f.k] = v; onChange(f.k, v); }));
  }

  // أقسام الاعتماد معرّفة بـ sig:true بلا مصفوفة حقول، فكانت تُصيَّر فارغة.
  // لكل جهة اعتماد: الاسم والتاريخ والقرار — تُخزَّن تحت مفاتيح sig_<i>_*
  if (sec.sig) grid.append(...signatureBoxes(sec, data, onChange));

  // ملاحظة القسم تشرح كيف يُملأ وما أثره — إخفاؤها يترك الفني يخمّن
  const note = sec.note
    ? el("div", { class: "note small mb-4",
                  text: lang === "en" ? sec.noteEn || tr(sec.note) : sec.note })
    : null;

  const bodyWrap = el("div", { class: "sec-body" }, note, grid);
  const caret = el("span", { class: "sec-caret", text: open ? "▾" : "◂" });

  const head = el("button", {
    class: "sec-head", type: "button", "data-ui": "toggle",
    onclick: () => {
      const hidden = bodyWrap.classList.toggle("collapsed");
      caret.textContent = hidden ? "◂" : "▾";
    },
  },
    caret,
    el("span", { class: "grow", text: sectionTitle(sec) }),
    // أقسام الاعتماد بلا مصفوفة حقول، فكان العدّاد يعرض صفرًا فوق ثلاثة صناديق
    el("span", { class: "tiny dim", text: String(
      (sec.f || []).length || (sec.sig ? (sec.roles || DEFAULT_ROLES).length : 0)) })
  );

  if (!open) bodyWrap.classList.add("collapsed");

  return el("section", { class: "form-sec" }, head, bodyWrap);
}

/* ─── صناديق الاعتماد والتوقيع ─────────────────────────────────────────── */

const DEFAULT_ROLES = ["أعدّه", "راجعه", "اعتمده"];

const DECISIONS = ["معتمد", "معتمد مع ملاحظات", "غير معتمد"];

/** صندوق لكل جهة اعتماد. الأسماء تُكتب يدويًا — التوقيع الرقمي المرتبط
    بالحساب يأتي في مرحلة الاعتمادات، وهذا سجل الجهات الورقي. */
function signatureBoxes(sec, data, onChange) {
  const roles = sec.roles && sec.roles.length ? sec.roles : DEFAULT_ROLES;

  return roles.map((role, i) => {
    const kName = `sig_${i}_name`;
    const kDate = `sig_${i}_date`;
    const kDec  = `sig_${i}_decision`;

    const name = el("input", {
      class: "input", type: "text", value: data[kName] ?? "",
      placeholder: lang === "ar" ? "الاسم" : "Name",
      oninput: (e) => { data[kName] = e.target.value; onChange(kName, e.target.value); },
    });

    const date = el("input", {
      class: "input", type: "date", value: data[kDate] ?? "",
      oninput: (e) => { data[kDate] = e.target.value; onChange(kDate, e.target.value); },
    });

    const dec = el("select", {
      class: "select",
      onchange: (e) => { data[kDec] = e.target.value; onChange(kDec, e.target.value); },
    });
    dec.append(el("option", { value: "" }, "— " + (lang === "ar" ? "القرار" : "Decision") + " —"));
    for (const d of DECISIONS) {
      dec.append(el("option", { value: d, selected: d === data[kDec] }, tr(d)));
    }

    return el("div", { class: "field wide sig-box" },
      el("div", { class: "sig-role", text: tr(role) }),
      el("div", { class: "sig-grid" }, name, date, dec)
    );
  });
}

/* ─── حساب الاكتمال ────────────────────────────────────────────────────── */

export function completion(form, data) {
  let total = 0, filled = 0;
  for (const sec of form.secs || []) {
    for (const f of sec.f || []) {
      if (f.t === "calc") continue;
      total++;
      const v = data[f.k];
      const w = WIDGETS[f.t];
      if (w ? w.filled(v)
            : Array.isArray(v) ? v.length : String(v ?? "").trim()) filled++;
    }
  }
  return { total, filled, pct: total ? Math.round((filled / total) * 100) : 0 };
}
