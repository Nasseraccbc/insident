/* ============================================================================
   طبقة الوصول للبيانات — كل نداء لـ Supabase يمرّ من هنا.

   لماذا طبقة وسيطة بدل نداء supabase مباشرة من كل شاشة:
   الشاشات لا تعرف أسماء الجداول ولا شكل الاستعلامات، فتغيير عمود واحد
   يُعدَّل في مكان واحد بدل ملاحقته في عشر شاشات.
   ============================================================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** يفكّ غلاف {data,error} ويرفع الخطأ ليُلتقط في مكان واحد أعلى. */
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/* ─── المصادقة ─────────────────────────────────────────────────────────── */

export const auth = {
  async signIn(email, password) {
    return unwrap(await sb.auth.signInWithPassword({ email, password }));
  },
  async signOut() {
    await sb.auth.signOut();
  },
  async session() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onChange(fn) {
    return sb.auth.onAuthStateChange((_e, s) => fn(s));
  },
};

/* ─── المستخدمون ───────────────────────────────────────────────────────── */

export const profiles = {
  async me(userId) {
    return unwrap(
      await sb.from("profiles").select("*").eq("id", userId).single()
    );
  },
  async all() {
    return unwrap(
      await sb.from("profiles").select("*").eq("active", true).order("full_name")
    );
  },
  /** الفنيون مجمّعون بالتخصص — الشكل الذي تحتاجه قائمة الإسناد عند المشرف. */
  async techniciansBySpecialty() {
    const rows = unwrap(
      await sb.from("profiles").select("*")
        .eq("role", "technician").eq("active", true).order("full_name")
    );
    const groups = {};
    for (const r of rows) {
      const k = r.specialty || "other";
      (groups[k] ||= []).push(r);
    }
    return groups;
  },
};

/* ─── السجلات ──────────────────────────────────────────────────────────── */

export const records = {
  async list({ formCode, state, assignedTo, limit = 200 } = {}) {
    let q = sb.from("records").select("*").order("created_at", { ascending: false }).limit(limit);
    if (formCode) q = q.eq("form_code", formCode);
    if (state) q = q.eq("state", state);
    if (assignedTo) q = q.eq("assigned_to", assignedTo);
    return unwrap(await q);
  },
  async get(id) {
    return unwrap(await sb.from("records").select("*").eq("id", id).single());
  },
  async create(row) {
    return unwrap(await sb.from("records").insert(row).select().single());
  },
  async update(id, patch) {
    return unwrap(await sb.from("records").update(patch).eq("id", id).select().single());
  },
  async history(id) {
    // الترتيب بالمعرّف لا بالوقت: كل انتقالات المعاملة الواحدة تحمل الطابع
    // الزمني ذاته، فالترتيب بالوقت بينها عشوائي.
    return unwrap(
      await sb.from("record_history").select("*").eq("record_id", id).order("id")
    );
  },

  /** قرار مشرف الموقع. الصلاحية والشروط تُفحص في القاعدة لا هنا. */
  async review(id, decision, note) {
    const { data, error } = await sb.rpc("review_record", {
      p_record: id, p_decision: decision, p_note: note || null,
    });
    if (error) throw error;
    return data;
  },
  async counts() {
    return unwrap(await sb.from("records").select("state, priority, form_code, created_at, closed_at, sla_close_due"));
  },
};

/* ─── المهام ───────────────────────────────────────────────────────────── */

export const tasks = {
  async list({ assignedTo, createdBy, status, limit = 200 } = {}) {
    let q = sb.from("tasks").select("*").order("created_at", { ascending: false }).limit(limit);
    if (assignedTo) q = q.eq("assigned_to", assignedTo);
    if (createdBy) q = q.eq("created_by", createdBy);
    if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
    return unwrap(await q);
  },
  /** بلاغ ميداني: يقف عند المشرف ولا يُسنَد إلى أحد حتى يُعتمد. */
  async report(row) {
    return unwrap(await sb.from("tasks").insert({
      ...row, status: "pending", assigned_to: null, record_id: null,
    }).select().single());
  },
  /** قرار المشرف في بلاغ ميداني — عبر الدالة لا بتحديث مباشر. */
  async review(id, decision, { note = null, assign = null, form = null, priority = null } = {}) {
    return unwrap(await sb.rpc("review_task", {
      p_task: id, p_decision: decision, p_note: note || null,
      p_assign: assign || null, p_form: form || null, p_priority: priority || null,
    }));
  },
  async create(row) {
    return unwrap(await sb.from("tasks").insert(row).select().single());
  },
  async update(id, patch) {
    return unwrap(await sb.from("tasks").update(patch).eq("id", id).select().single());
  },
  /** بدء التنفيذ. الوقت يختمه مشغّل القاعدة لا المتصفح. */
  async start(id) {
    return unwrap(
      await sb.from("tasks").update({ status: "in_progress" }).eq("id", id).select().single()
    );
  },
};

/* ─── مؤقتات مستوى الخدمة ──────────────────────────────────────────────── */
/* شاشة المؤقتات تسأل عن اللحظة: ما الذي يوشك أن يتجاوز مهلته الآن. فهي
   تقرأ المهام المفتوحة ومعها مواعيد سجلّها المحسوبة على الخادم. */

export const sla = {
  /** المهام التي لم تُغلق بعد، ومعها مواعيد SLA من سجلّها إن وُجد. */
  async open() {
    return unwrap(
      await sb.from("tasks")
        // للمهمة مفتاحان إلى records (سجلّها ومصدرها)، فيلزم تسمية المقصود
        .select("*, record:records!tasks_record_id_fkey(id, state, responded_at, sla_response_due, sla_close_due, closed_at)")
        .in("status", ["pending", "new", "assigned", "in_progress"])
        .order("created_at", { ascending: true })
        .limit(300)
    );
  },
  /** سجلات أُغلقت — التجاوز منها يُحسب بمقارنة الإغلاق بموعده. */
  async closed(limit = 200) {
    return unwrap(
      await sb.from("records")
        .select("id, form_code, title, priority, location, assigned_to, created_at, closed_at, sla_close_due, responded_at, sla_response_due")
        .eq("state", "closed")
        .not("sla_close_due", "is", null)
        .order("closed_at", { ascending: false })
        .limit(limit)
    );
  },
};

/* ─── الأصول ───────────────────────────────────────────────────────────── */

export const assets = {
  async list() {
    return unwrap(
      await sb.from("assets").select("*").eq("active", true).order("sort")
    );
  },
  /** معدات مجموعة (تكييف · مدني · سباكة) مرتّبة، لبناء جولة الفحص. */
  async byGroup(category) {
    return unwrap(
      await sb.from("assets").select("*")
        .eq("active", true).eq("category", category).order("sort")
    );
  },
};

/* ─── نقاط الفحص الكهربائي ─────────────────────────────────────────────── */
/* مصدرها جدول القاعدة لا ثابت في الواجهة — المشغّل gen_corrective_wo يقرأ
   من الجدول ذاته لتسمية الأعطال وتحديد خطورتها. */

export const checkPoints = {
  async list() {
    return unwrap(await sb.from("check_points").select("*").order("sort"));
  },
};

/* ─── المرفقات ─────────────────────────────────────────────────────────── */

const BUCKET = "attachments";

export const files = {
  async upload(path, blob, mime = "image/jpeg") {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: mime, upsert: true,
    });
    if (error) throw error;
    return path;
  },
  /** الحاوية خاصة: الوصول برابط موقّت لا برابط دائم قابل للتسريب. */
  async signedUrl(path, seconds = 3600) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, seconds);
    if (error) throw error;
    return data.signedUrl;
  },
  async record(row) {
    return unwrap(await sb.from("attachments").insert(row).select().single());
  },
  async forRecord(recordId) {
    return unwrap(await sb.from("attachments").select("*").eq("record_id", recordId));
  },
  /**
   * يحذف مرفقات نوع واحد من سجل: صفوفها ثم ملفاتها.
   *
   * الترتيب مقصود. لو سقط الاتصال بين الخطوتين بقي ملف لا يشير إليه صفّ —
   * لا يظهر لأحد ولا يكسر شاشة. أمّا العكس فيترك صفًّا يشير إلى ملف محذوف،
   * فتُطلب له روابط موقّعة تفشل ويظهر للفني خانة مكسورة لا يفهمها.
   */
  async dropKind(recordId, kind) {
    const rows = unwrap(
      await sb.from("attachments").select("*")
        .eq("record_id", recordId).eq("kind", kind)
    );
    if (!rows.length) return 0;

    const del = await sb.from("attachments").delete()
      .eq("record_id", recordId).eq("kind", kind);
    if (del.error) throw del.error;

    const paths = rows.map((r) => r.storage_path).filter(Boolean);
    if (paths.length) {
      const { error } = await sb.storage.from(BUCKET).remove(paths);
      if (error) throw error;
    }
    return rows.length;
  },
};
