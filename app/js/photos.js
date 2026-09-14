/* ============================================================================
   الصور: التقاط · ضغط · رفع إلى Supabase Storage.

   الضغط في المتصفح لا على الخادم: صورة جوّال حديثة ٤–٨ ميجابايت، ورفعها خامًا
   من موقع العمل على شبكة ضعيفة يفشل أو يستنزف باقة الفني. ١٢٨٠px/0.75 تعطي
   ~٢٠٠ كيلوبايت بوضوح كافٍ لإثبات الحالة.
   ============================================================================ */

import { files } from "./db.js";
import { lang } from "./i18n.js";
import { el, toast } from "./ui.js";

export const MAX_WIDTH = 1280;
export const QUALITY = 0.75;

export const KINDS = ["before", "during", "after"];

const KIND_LABEL = {
  ar: { before: "قبل العمل", during: "أثناء العمل", after: "بعد الانتهاء" },
  en: { before: "Before", during: "During", after: "After" },
};

export function kindLabel(kind) {
  return (KIND_LABEL[lang] || KIND_LABEL.ar)[kind] || kind;
}

/** يضغط ملف صورة ويرجّع Blob. يحترم اتجاه الصورة عبر createImageBitmap. */
export async function compress(file, maxW = MAX_WIDTH, q = QUALITY) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  let { width: w, height: h } = bitmap;
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
  if (!blob) throw new Error("تعذّر ضغط الصورة");
  return blob;
}

function fmtSize(n) {
  return n < 1024 * 1024 ? Math.round(n / 1024) + " KB"
                         : (n / 1024 / 1024).toFixed(1) + " MB";
}

/* ─── خانة صورة واحدة ──────────────────────────────────────────────────── */
/*
   state.photos[kind] = { blob, url, path, uploaded }
   الرفع الفعلي يقع عند حفظ السجل لأننا نحتاج record_id في المسار.
*/

export function photoSlot(kind, store, onChange) {
  const box = el("div", { class: "photo-slot" });

  const input = el("input", {
    type: "file", accept: "image/*",
    capture: "environment",           // الجوّال يفتح الكاميرا الخلفية مباشرة
    style: "display:none",
    onchange: (e) => handle(e.target.files?.[0]),
  });

  const preview = el("div", { class: "photo-preview" });
  const meta = el("div", { class: "tiny dim" });

  const pick = el("button", { class: "btn btn-sm btn-block", type: "button",
                              onclick: () => input.click() });

  async function handle(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast(lang === "ar" ? "الملف ليس صورة" : "Not an image", "warn");
      return;
    }
    pick.disabled = true;
    pick.textContent = lang === "ar" ? "جارٍ الضغط…" : "Compressing…";
    try {
      const blob = await compress(file);
      store[kind] = { blob, url: URL.createObjectURL(blob), uploaded: false };
      draw(file.size, blob.size);
      onChange?.();
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      pick.disabled = false;
    }
  }

  function draw(origSize, newSize) {
    const cur = store[kind];
    preview.replaceChildren();
    if (cur?.url) {
      preview.append(el("img", { src: cur.url, alt: kindLabel(kind) }));
      preview.classList.add("has");
      pick.textContent = (lang === "ar" ? "تغيير" : "Replace");
      meta.textContent = origSize
        ? `${fmtSize(origSize)} ← ${fmtSize(newSize)}`
        : (cur.path ? (lang === "ar" ? "مرفوعة" : "Uploaded") : "");
    } else {
      preview.classList.remove("has");
      preview.append(el("span", { class: "photo-ico", text: "▣" }));
      pick.textContent = "📷 " + (lang === "ar" ? "التقاط" : "Capture");
      meta.textContent = "";
    }
  }

  const clearBtn = el("button", {
    class: "btn btn-ghost btn-sm", type: "button",
    onclick: () => {
      if (store[kind]?.url?.startsWith("blob:")) URL.revokeObjectURL(store[kind].url);
      delete store[kind];
      draw();
      onChange?.();
    },
    text: "✕",
  });

  box.append(
    el("div", { class: "photo-head" },
      el("span", { class: "bold small", text: kindLabel(kind) }),
      clearBtn
    ),
    preview, input, pick, meta
  );

  draw();
  return box;
}

/** الخانات الثلاث. */
export function photoGrid(store, onChange) {
  return el("div", { class: "photo-grid" },
    ...KINDS.map((k) => photoSlot(k, store, onChange))
  );
}

/* ─── الرفع ────────────────────────────────────────────────────────────── */

/**
 * يرفع ما لم يُرفع بعد ويسجّله في جدول attachments.
 * فشل صورة لا يُسقط البقية — البيانات أهم من صورة واحدة.
 */
export async function uploadAll(store, { recordId, userId }) {
  const done = [];
  const failed = [];

  for (const kind of KINDS) {
    const item = store[kind];
    if (!item?.blob || item.uploaded) continue;

    const path = `records/${recordId}/${kind}-${Date.now()}.jpg`;
    try {
      await files.upload(path, item.blob, "image/jpeg");
      await files.record({
        record_id: recordId,
        kind,
        storage_path: path,
        mime: "image/jpeg",
        size_bytes: item.blob.size,
        uploaded_by: userId,
      });
      item.uploaded = true;
      item.path = path;
      done.push(kind);
    } catch (err) {
      console.error("photo upload failed", kind, err);
      failed.push(kind);
    }
  }

  return { done, failed };
}

/** يحمّل صور سجل محفوظ ويعرضها بروابط موقّتة. */
export async function loadExisting(recordId, store) {
  const rows = await files.forRecord(recordId);
  for (const r of rows) {
    if (!KINDS.includes(r.kind)) continue;
    try {
      store[r.kind] = { url: await files.signedUrl(r.storage_path), path: r.storage_path, uploaded: true };
    } catch { /* رابط منتهٍ أو ملف محذوف — نتجاوزه بلا إسقاط الشاشة */ }
  }
  return store;
}
