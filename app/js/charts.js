/* ============================================================================
   رسوم SVG مبنية باليد — بلا مكتبة خارجية.

   السبب: مواصفات العلامات هنا دقيقة (خط 2px، طرف مستدير 4px، فجوة سطح 2px،
   حلقة سطح حول النقاط، شبكة شعرية صلبة)، وضبطها في مكتبة جاهزة أطول من
   رسمها. ولأن الاتجاه عربي: الزمن يمضي من اليمين إلى اليسار، وهو ما لا
   تدعمه المكتبات إلا بالتفافات.

   مبدأ اللون هنا: العلامات ترتدي متغيّرات CSS داخل style لا قيمًا محسوبة.
   قراءة اللون مرّة واحدة عند الرسم كانت تترك المخطط بألوان الوضع النهاري
   فوق سطح ليلي عند تبديل المظهر؛ أما var() فيعيد المتصفح طلاءها بنفسه.

   اللوحة مُتحقَّق منها بـ validate_palette.js من مهارة dataviz — الأرقام
   والتفاصيل في tokens.css عند تعريف ‎--viz-*‎.
   ============================================================================ */

import { lang } from "./i18n.js";
import { el } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";

/** منشئ عناصر SVG — نظير el() لكن في فضاء أسماء SVG. */
export function s(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid) n.append(kid);
  return n;
}

/** قيمة رمز CSS — حين تُطلب القيمة نصًّا لا طلاءً. */
export function tok(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** اللون كما يُكتب في style: يبقى حيًّا مع تبديل المظهر. */
export const SERIES = ["var(--viz-1)", "var(--viz-2)"];
export const ORD = (i) => `var(--viz-ord-${i})`;

/* ─── التلميح العائم ───────────────────────────────────────────────────── */
/* التلميح يُثري ولا يحجب: كل قيمة فيه متاحة أيضًا في العرض الجدولي. */

let tipNode = null;

export function showTip(x, y, rows, title) {
  if (!tipNode) {
    tipNode = el("div", { class: "viz-tip", role: "status", "aria-live": "polite" });
    document.body.append(tipNode);
  }
  tipNode.replaceChildren(
    title ? el("div", { class: "viz-tip-t", text: title }) : null,
    ...rows.map((r) =>
      el("div", { class: "viz-tip-r" },
        r.color ? el("i", { class: "viz-key", style: `background:${r.color}` }) : null,
        el("b", { text: String(r.value) }),
        el("span", { text: r.label })
      )
    )
  );
  tipNode.classList.add("on");
  const w = tipNode.offsetWidth, h = tipNode.offsetHeight;
  let left = x + 14, top = y - h - 12;
  if (left + w > innerWidth - 8) left = x - w - 14;
  if (left < 8) left = 8;
  if (top < 8) top = y + 18;
  tipNode.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function hideTip() { tipNode?.classList.remove("on"); }

/* ─── التركيب: قياس فعلي وإعادة رسم عند تغيّر العرض ────────────────────── */
/* viewBox ثابت مع width:100% يصغّر النصوص على الجوّال حتى تُقرأ بالعدسة.
   القياس الحقيقي أطول سطرين ويُبقي النص ١٢px في كل العروض. */

export function mount(host, draw, { height = 220 } = {}) {
  let last = 0;
  const render = () => {
    const w = Math.max(240, Math.floor(host.clientWidth));
    if (w === last) return;
    last = w;
    host.replaceChildren(draw(w, height));
    // القصّ يحتاج قياسًا فعليًا، وgetComputedTextLength يرجّع صفرًا قبل الإلحاق
    for (const n of host.querySelectorAll("[data-fit]")) fit(n, +n.dataset.fit);
  };
  render();
  const ro = new ResizeObserver(render);
  ro.observe(host);
  return () => ro.disconnect();
}

/* ─── العرض الجدولي: التوأم الذي لا يعتمد على اللون ────────────────────── */

export function tableTwin(head, rows) {
  return el("details", { class: "viz-table" },
    el("summary", { text: lang === "ar" ? "عرض القيم كجدول" : "View values as a table" }),
    el("div", { class: "table-wrap" },
      el("table", { class: "tbl viz-tbl" },
        el("thead", {}, el("tr", {}, ...head.map((h) => el("th", { text: h })))),
        el("tbody", {}, ...rows.map((r) => el("tr", {}, ...r.map((c) => el("td", { text: String(c) })))))
      )
    )
  );
}

/* ─── وسيلة الإيضاح ────────────────────────────────────────────────────── */

export function legend(items, { line = false } = {}) {
  return el("div", { class: "viz-legend" },
    ...items.map((i) =>
      el("span", { class: "viz-leg" },
        el("i", { class: "viz-key" + (line ? " ln" : ""), style: `background:${i.color}` }),
        el("span", { text: i.label })
      )
    )
  );
}

/* ============================================================================
   ١ · مخطط خطي زمني — سلسلتان كحدّ أقصى
   ============================================================================ */

export function lineChart(host, { xs, series, fmtX, unit = "" }) {
  return mount(host, (W, H) => {
    const rtl = lang === "ar";
    const padT = 14, padB = 26, padS = 34;      // padS: جهة المحور القيمي
    const plotW = W - padS - 14, plotH = H - padT - padB;
    const n = xs.length;

    const maxV = Math.max(1, ...series.flatMap((se) => se.v));
    const stp = niceStep(maxV);
    const top = Math.ceil(maxV / stp) * stp;

    // في العربية الزمن يمضي من اليمين إلى اليسار
    const X = (i) => {
      const f = n === 1 ? 0.5 : i / (n - 1);
      return rtl ? 14 + (1 - f) * plotW : padS + f * plotW;
    };
    const Y = (v) => padT + plotH - (v / top) * plotH;

    const g = s("svg", {
      class: "viz", viewBox: `0 0 ${W} ${H}`, width: W, height: H,
      tabindex: "0", role: "img",
      "aria-label": series.map((se) => `${se.label}: ${se.v[n - 1]}`).join(" · "),
    });

    /* شبكة شعرية صلبة — أربعة خطوط لا أكثر */
    for (let i = 0; i <= 4; i++) {
      const v = (top / 4) * i;
      g.append(s("line", {
        class: i ? "viz-grid" : "viz-axis",
        x1: rtl ? 14 : padS, x2: rtl ? 14 + plotW : padS + plotW, y1: Y(v), y2: Y(v),
      }));
      g.append(s("text", {
        x: rtl ? 14 + plotW + 6 : padS - 6, y: Y(v) + 4,
        "text-anchor": rtl ? "start" : "end",
        class: "viz-tick", text: fmtNum(v),
      }));
    }

    /* تسميات المحور الزمني — أربع فقط حتى لا تتزاحم */
    const everyX = Math.max(1, Math.round(n / 4));
    xs.forEach((x, i) => {
      if (i % everyX && i !== n - 1) return;
      g.append(s("text", {
        x: X(i), y: H - 8, "text-anchor": "middle", class: "viz-tick", text: fmtX(x),
      }));
    });

    /* الخطوط: 2px، وصلات مستديرة. والتسمية المباشرة عند الطرف هي التعويض
       الواجب حين يقلّ تباين لون السلسلة عن 3:1 مقابل السطح. */
    series.forEach((se) => {
      const d = se.v.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
      g.append(s("path", { class: "viz-line", d, style: `stroke:${se.color}` }));

      const li = n - 1;
      g.append(s("circle", { class: "viz-dot", cx: X(li), cy: Y(se.v[li]), r: 4.5,
                             style: `fill:${se.color}` }));
      g.append(s("text", {
        x: X(li) + (rtl ? 10 : -10), y: Y(se.v[li]) - 9,
        "text-anchor": rtl ? "start" : "end",
        class: "viz-lbl", text: String(se.v[li]),
      }));
    });

    /* طبقة التفاعل: خطّ تعقّب يلتقط أقرب يوم — لا يُطلب من القارئ إصابة الخط */
    const cross = s("line", { class: "viz-cross", y1: padT, y2: padT + plotH, opacity: 0 });
    const dots = series.map((se) => s("circle", { class: "viz-dot", r: 4.5, opacity: 0,
                                                  style: `fill:${se.color}` }));
    g.append(cross, ...dots);

    let idx = -1;
    const focus = (i, cx, cy) => {
      if (i < 0 || i >= n) return;
      idx = i;
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i));
      cross.setAttribute("opacity", 1);
      series.forEach((se, k) => {
        dots[k].setAttribute("cx", X(i)); dots[k].setAttribute("cy", Y(se.v[i]));
        dots[k].setAttribute("opacity", 1);
      });
      const box = g.getBoundingClientRect();
      const sc = box.width / W;
      showTip(
        cx ?? box.left + X(i) * sc, cy ?? box.top + padT * sc,
        series.map((se) => ({ color: se.color, value: se.v[i] + unit, label: se.label })),
        fmtX(xs[i])
      );
    };
    const blur = () => {
      cross.setAttribute("opacity", 0);
      dots.forEach((d) => d.setAttribute("opacity", 0));
      hideTip();
    };

    g.append(s("rect", {
      x: 0, y: 0, width: W, height: H, fill: "transparent",
      onpointermove: (e) => {
        const box = g.getBoundingClientRect();
        const px = (e.clientX - box.left) * (W / box.width);
        let best = 0, bd = Infinity;
        for (let i = 0; i < n; i++) { const d = Math.abs(X(i) - px); if (d < bd) { bd = d; best = i; } }
        focus(best, e.clientX, e.clientY);
      },
      onpointerleave: blur,
    }));

    /* لوحة المفاتيح ترى ما يراه الفأر */
    g.addEventListener("keydown", (e) => {
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        focus(idx + (e.key === back ? -1 : 1)); e.preventDefault();
      } else if (e.key === "Home") { focus(0); e.preventDefault(); }
      else if (e.key === "End") { focus(n - 1); e.preventDefault(); }
      else if (e.key === "Escape") blur();
    });
    g.addEventListener("focus", () => idx < 0 && focus(n - 1));
    g.addEventListener("blur", blur);

    return g;
  }, { height: 230 });
}

/* ============================================================================
   ٢ · شريط مكدّس أفقي — توزيع ترتيبي (حالات السجل)
   ============================================================================ */

export function stackedBar(host, { parts }) {
  return mount(host, (W) => {
    const rtl = lang === "ar";
    const H = 46, barH = 24, y = 8, GAP = 2;     // فجوة السطح بين القطع
    const g = s("svg", { class: "viz", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img" });

    const live = parts.filter((p) => p.value > 0);
    const sum = live.reduce((a, p) => a + p.value, 0) || 1;
    const avail = W - GAP * Math.max(0, live.length - 1);

    let off = 0;
    live.forEach((p, i) => {
      const w = Math.max(2, (p.value / sum) * avail);
      const x = rtl ? W - off - w : off;
      const first = i === 0, last = i === live.length - 1;
      const side = rtl ? (first ? "e" : last ? "s" : "") : (first ? "s" : last ? "e" : "");
      g.append(s("path", {
        d: roundedBar(x, y, w, barH, 4, side), style: `fill:${p.color}`,
        onpointermove: (e) => showTip(e.clientX, e.clientY,
          [{ color: p.color, value: `${p.value} · ${Math.round((p.value / sum) * 100)}%`, label: p.label }]),
        onpointerleave: hideTip,
      }));
      off += w + GAP;
    });
    return g;
  }, { height: 46 });
}

/* ============================================================================
   ٣ · أشرطة أفقية — فئات اسمية بلون واحد
   ============================================================================ */
/* اللون لا يعيد ترميز الطول: كل الأشرطة بلون السلسلة الأولى. تدرّجها حسب
   القيمة ينفق قناة الهوية على ما يقوله الطول أصلًا. */

export function barsH(host, { items, unit = "" }) {
  return mount(host, (W) => {
    const rtl = lang === "ar";
    const rowH = 30, barH = 18;
    const labelW = Math.min(210, Math.max(110, W * 0.4));
    const H = items.length * rowH + 6;
    const max = Math.max(1, ...items.map((i) => i.value));
    const plotW = W - labelW - 44;

    const g = s("svg", { class: "viz", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img" });

    items.forEach((it, i) => {
      const y = i * rowH + 4;
      const w = Math.max(2, (it.value / max) * plotW);
      const x = rtl ? W - labelW - w : labelW;

      g.append(s("text", {
        x: rtl ? W - 4 : 4, y: y + barH / 2 + 4,
        "text-anchor": rtl ? "end" : "start",
        class: "viz-lbl soft", text: it.label, "data-fit": Math.round(labelW - 10),
      }));
      g.append(s("path", {
        d: roundedBar(x, y, w, barH, 4, rtl ? "s" : "e"), style: `fill:${SERIES[0]}`,
        onpointermove: (e) => showTip(e.clientX, e.clientY,
          [{ color: SERIES[0], value: it.value + unit, label: it.label }]),
        onpointerleave: hideTip,
      }));
      g.append(s("text", {
        x: rtl ? x - 6 : x + w + 6, y: y + barH / 2 + 4,
        "text-anchor": rtl ? "end" : "start",
        class: "viz-lbl", text: String(it.value),
      }));
    });
    return g;
  }, { height: 0 });
}

/* ============================================================================
   ٤ · خريطة المخاطر ٥×٥
   ============================================================================ */
/* اللون يشفّر العدد (متدرّج أحادي الهوى) لا الخطورة: الخطورة يحملها الموضع
   في الشبكة وإطار منطقة التصعيد. تلوين الخلايا أخضر→أصفر→أحمر يجعل اللون
   يكرّر ما يقوله الموضع، ويكسر قاعدة «هوى واحد للمقدار». */

export function riskMatrix(host, { cells, escalate = 15 }) {
  return mount(host, (W) => {
    const rtl = lang === "ar";
    const axis = 30, gap = 2;
    const size = Math.min(58, Math.floor((W - axis - 8) / 5));
    const H = size * 5 + axis + 16;
    const g = s("svg", { class: "viz", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img" });

    const max = Math.max(1, ...cells.flat());
    const step = (v) => Math.min(4, Math.max(1, Math.ceil((v / max) * 4)));   // ١..٤

    const gx = (i) => (rtl ? W - axis - (i + 1) * size : axis + i * size);   // الأثر ١..٥
    const gy = (j) => (4 - j) * size + 6;                                    // الاحتمالية ١..٥

    for (let p = 0; p < 5; p++) {
      for (let im = 0; im < 5; im++) {
        const v = cells[p][im];
        const k = v ? step(v) : 0;
        const x = gx(im), y = gy(p);
        g.append(s("rect", {
          class: "viz-heat" + (v ? "" : " empty"),
          x: x + gap / 2, y: y + gap / 2, width: size - gap, height: size - gap, rx: 4,
          style: v ? `fill:var(--viz-heat-${k})` : "",
          onpointermove: (e) => showTip(e.clientX, e.clientY,
            [{ value: v, label: lang === "ar" ? "خطر مفتوح" : "open risks" }],
            `${lang === "ar" ? "احتمالية" : "Likelihood"} ${p + 1} × ` +
            `${lang === "ar" ? "أثر" : "Impact"} ${im + 1} = ${(p + 1) * (im + 1)}`),
          onpointerleave: hideTip,
        }));
        if (v) g.append(s("text", {
          x: x + size / 2, y: y + size / 2 + 5, "text-anchor": "middle",
          // الحبر رمز مرافق لكل درجة لا قيمة محسوبة: في الوضع الليلي أعلى
          // الدرجات هي الأفتح، فربط الحبر بالقيمة يكتب أبيض على أخضر فاتح.
          class: "viz-cell", style: `fill:var(--viz-heat-${k}-ink)`, text: String(v),
        }));
      }
    }

    /* إطار منطقة التصعيد: الدرجة ١٥ فأعلى تُرفع إلى مدير المشروع */
    const zone = [];
    for (let p = 0; p < 5; p++) for (let im = 0; im < 5; im++)
      if ((p + 1) * (im + 1) >= escalate) zone.push([p, im]);
    for (const [p, im] of zone) {
      const x = gx(im), y = gy(p);
      const nb = (dp, di) => zone.some(([a, b]) => a === p + dp && b === im + di);
      const d = [
        !nb(1, 0)  && `M${x},${y} h${size}`,
        !nb(-1, 0) && `M${x},${y + size} h${size}`,
        !nb(0, rtl ? 1 : -1) && `M${x},${y} v${size}`,
        !nb(0, rtl ? -1 : 1) && `M${x + size},${y} v${size}`,
      ].filter(Boolean).join(" ");
      if (d) g.append(s("path", { class: "viz-zone", d }));
    }

    /* محاور مرقّمة */
    for (let i = 0; i < 5; i++) {
      g.append(s("text", { x: gx(i) + size / 2, y: H - 14, "text-anchor": "middle",
                           class: "viz-tick", text: String(i + 1) }));
      g.append(s("text", { x: rtl ? W - 8 : 8, y: gy(i) + size / 2 + 4,
                           "text-anchor": rtl ? "end" : "start",
                           class: "viz-tick", text: String(i + 1) }));
    }
    return g;
  }, { height: 0 });
}

/* ============================================================================
   ٥ · مقياس نسبة — المسار درجة أفتح من هوى التعبئة نفسه
   ============================================================================ */

export function meter(pct, kind = "ok") {
  const fill = `var(--${kind === "warn" ? "warn" : kind === "danger" ? "danger" : "ok"})`;
  const p = Math.max(0, Math.min(100, pct));
  return el("div", {
    class: "viz-meter", role: "img", "aria-label": `${p}%`,
    // المسار درجة أفتح من التعبئة لا رمادًا محايدًا: الحالة تُقرأ على طول
    // الشريط كلّه لا في الجزء الممتلئ وحده.
    style: `background: color-mix(in oklab, ${fill} 16%, var(--surface-3))`,
  }, el("i", { style: `width:${p}%;background:${fill}` }));
}

/* ─── أدوات ────────────────────────────────────────────────────────────── */

/** مسار شريط بطرف مستدير في جهة البيانات فقط، مربّع عند خط الأساس. */
function roundedBar(x, y, w, h, r, side) {
  r = Math.min(r, w / 2, h / 2);
  if (!side) return `M${x},${y} h${w} v${h} h${-w} Z`;
  if (side === "e")
    return `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} Z`;
  return `M${x + r},${y} h${w - r} v${h} h${-(w - r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} Z`;
}

/** درجة محور نظيفة. العدّ صحيح دائمًا فلا كسور: «٢٫٥ سجلًا» لا معنى له. */
function niceStep(max) {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) || mag * 10;
  return Math.max(1, Math.round(step));
}

/** يقصّ نصّ SVG بثلاث نقاط حتى يسع العرض المتاح. القصّ بعدد الحروف تخمين
    يخطئ مع العربية؛ القياس الفعلي هو ما يمنع اصطدام التسمية بالشريط. */
function fit(node, maxW) {
  if (!node.getComputedTextLength || node.getComputedTextLength() <= maxW) return;
  const full = node.textContent;
  let lo = 0, hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    node.textContent = full.slice(0, mid) + "…";
    if (node.getComputedTextLength() <= maxW) lo = mid; else hi = mid - 1;
  }
  node.textContent = lo ? full.slice(0, lo) + "…" : "";
}

const fmtNum = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
