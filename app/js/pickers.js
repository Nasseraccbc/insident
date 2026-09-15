/* ============================================================================
   قوائم مشتركة: النموذج والفني.

   كانتا داخل شاشة المهام وحدها، ثم احتاجتهما شاشة الاعتمادات حين صار
   المشرف يعتمد بلاغًا ميدانيًا فيُسنده ويحدّد نموذجه. نسخة ثانية منهما
   تعني عائلة نموذج تُضاف في مكان وتُنسى في الآخر.
   ============================================================================ */

import { t } from "./i18n.js";
import { el } from "./ui.js";
import { FORMS, formName } from "./forms/renderer.js";

export const SPECIALTIES = ["electrical", "plumbing", "hvac", "hospitality", "cleaning"];

/* عائلات النماذج بترتيب ما يُسنده المشرف فعلًا لا بترتيب المرفقات.
   الرمز المكتوب يدويًا كان يُخطئ (WO1 · wo-01 · «أمر عمل») فيُفتح البلاغ
   بلا نموذج، والقائمة تُغني عن الحفظ والإملاء. */
const FORM_FAMILIES = [
  { pre: "WO",  ar: "البلاغات وأوامر العمل" },
  { pre: "INS", ar: "الفحص الميداني" },
  { pre: "QA",  ar: "الجودة والتحقق" },
  { pre: "HSE", ar: "السلامة والصحة المهنية" },
  { pre: "RSK", ar: "المخاطر" },
  { pre: "HS",  ar: "الضيافة" },
  { pre: "MR",  ar: "قاعات الاجتماعات" },
  { pre: "HR",  ar: "الموارد البشرية" },
];

const familyOf = (code) =>
  FORM_FAMILIES.find((f) => code === f.pre || code.startsWith(f.pre + "-"));

/** النماذج العشرون مجمّعة بعائلاتها — بديل كتابة الرمز. */
export function formSelect(value) {
  const sel = el("select", { class: "select" });
  sel.append(el("option", { value: "" }, "— بلا نموذج —"));
  for (const fam of FORM_FAMILIES) {
    const list = FORMS.filter((f) => familyOf(f.code) === fam);
    if (!list.length) continue;
    const g = el("optgroup", { label: fam.ar });
    for (const f of list) {
      g.append(el("option", { value: f.code, selected: f.code === value },
        `${f.code} — ${formName(f)}`));
    }
    sel.append(g);
  }
  return sel;
}

/** قائمة الفنيين مجمّعة بالتخصص عبر optgroup — بحث بصري سريع. */
export function techSelect(groups, value) {
  const sel = el("select", { class: "select" });
  sel.append(el("option", { value: "" }, "— " + t("unassigned") + " —"));
  for (const sp of SPECIALTIES) {
    const list = groups?.[sp];
    if (!list?.length) continue;
    const g = el("optgroup", { label: t("sp_" + sp) });
    for (const p of list) {
      g.append(el("option", { value: p.id, selected: p.id === value }, p.full_name));
    }
    sel.append(g);
  }
  return sel;
}
