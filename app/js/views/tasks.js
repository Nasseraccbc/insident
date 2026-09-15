/* ============================================================================
   لوحة المهام — إنشاء وتوزيع (عمّار).

   التوزيع يدوي بقرار المشرف، والقائمة مجمّعة بالتخصص لتسهيل الاختيار
   لا لأتمتته. راجع PROJECT-SPEC.md §5.
   ============================================================================ */

import { tasks, profiles } from "../db.js";
import { formSelect, techSelect } from "../pickers.js";
import { t, fmtStamp, fmtDur } from "../i18n.js";
import {
  el, pageHead, empty, loading, table, modal, field, input, textarea, select,
  taskStatusBadge, priorityBadge, toast, stat,
} from "../ui.js";

const PRIORITIES = ["critical", "high", "medium"];

export async function tasksView(page, state) {
  let techGroups = {};
  let rows = [];

  const host = el("div", {});

  page.append(
    pageHead(t("navTasks"), null, [], [
      el("button", { class: "btn btn-primary", onclick: () => openCreate() }, "+ " + t("add")),
    ]),
    host
  );

  host.append(loading());

  async function load() {
    try {
      [rows, techGroups] = await Promise.all([
        tasks.list(),
        profiles.techniciansBySpecialty(),
      ]);
    } catch (err) {
      host.replaceChildren(empty(t("errNet"), err.message, "⚠"));
      return;
    }

    const active = rows.filter((r) => !["done", "cancelled"].includes(r.status));
    const unassigned = rows.filter((r) => !r.assigned_to && r.status !== "cancelled");
    const overdue = active.filter((r) => r.due_at && new Date(r.due_at) < new Date());

    const stats = el("div", { class: "stats" },
      stat(t("kpiTasks"), String(active.length)),
      stat(t("unassigned"), String(unassigned.length), null, unassigned.length ? "warn" : ""),
      stat(t("kpiOverdue"), String(overdue.length), null, overdue.length ? "danger" : ""),
      stat(t("ts_done"), String(rows.filter((r) => r.status === "done").length), null, "ok")
    );

    const body = rows.length
      ? table(
          ["#", t("navTasks"), t("priority"), t("assignedTo"), t("status"), t("remaining"), ""],
          rows,
          (r) => {
            const tech = findTech(r.assigned_to);
            const left = r.due_at ? new Date(r.due_at) - Date.now() : null;
            return el("tr", {},
              el("td", { class: "mono dim", text: "#" + (r.seq ?? "") }),
              el("td", {},
                el("div", { class: "bold", text: r.title }),
                r.location ? el("div", { class: "tiny dim", text: r.location }) : null
              ),
              el("td", {}, priorityBadge(r.priority)),
              el("td", {},
                tech
                  ? el("div", {},
                      el("div", { text: tech.full_name }),
                      el("div", { class: "tiny dim", text: t("sp_" + (tech.specialty || "other")) })
                    )
                  : el("span", { class: "badge badge-warn", text: t("unassigned") })
              ),
              el("td", {}, taskStatusBadge(r.status)),
              el("td", { class: "mono" + (left !== null && left < 0 ? " " : "") },
                left === null ? "—"
                  : el("span", { style: left < 0 ? "color:var(--danger);font-weight:700" : "",
                                 text: fmtDur(left) })
              ),
              el("td", {},
                el("button", { class: "btn btn-sm", onclick: () => openAssign(r) },
                  r.assigned_to ? t("edit") : t("assignedTo"))
              )
            );
          }
        )
      : empty(t("noData"), t("noDataSub"), "☰");

    host.replaceChildren(el("div", { class: "stack" }, stats,
      el("div", { class: "card" },
        el("div", { class: "card-head" }, el("h3", { text: t("navTasks") }),
          el("span", { class: "small dim", text: `${rows.length}` })),
        el("div", { class: "card-body flush" }, body)
      )
    ));
  }

  function findTech(id) {
    if (!id) return null;
    for (const list of Object.values(techGroups)) {
      const hit = list.find((x) => x.id === id);
      if (hit) return hit;
    }
    return null;
  }

  function openCreate() {
    const title = input({ required: true });
    const desc = textarea({ rows: 3 });
    const loc = input({});
    const prio = select(PRIORITIES.map((p) => ({ value: p, label: t("pr_" + p) })), { value: "medium" });
    const form = formSelect(null);
    const tech = techSelect(techGroups, null);

    modal({
      title: t("add") + " — " + t("navTasks"),
      body: el("div", { class: "stack" },
        field(t("navTasks"), title, { required: true }),
        el("div", { class: "grid-fields" },
          field(t("priority"), prio),
          field(t("location"), loc)
        ),
        field("الوصف", desc),
        el("div", { class: "grid-fields" },
          field("النموذج المطلوب", form, { hint: "الذي يفتحه الفني على المهمة" }),
          field(t("assignedTo"), tech)
        )
      ),
      actions: [
        { label: t("cancel") },
        {
          label: t("save"), kind: "btn-primary",
          onClick: () => {
            if (!title.value.trim()) { toast("العنوان مطلوب", "warn"); return false; }
            create({
              title: title.value.trim(),
              description: desc.value.trim() || null,
              location: loc.value.trim() || null,
              priority: prio.value,
              form_code: form.value || null,
              assigned_to: tech.value || null,
              status: tech.value ? "assigned" : "new",
              created_by: state.profile.id,
            });
          },
        },
      ],
    });
  }

  function openAssign(row) {
    const tech = techSelect(techGroups, row.assigned_to);
    modal({
      title: t("assignedTo") + " — " + row.title,
      body: el("div", { class: "stack" },
        field(t("assignedTo"), tech, { hint: "الفنيون مجمّعون حسب التخصص" }),
        el("div", { class: "small dim" }, t("createdAt") + ": " + fmtStamp(row.created_at))
      ),
      actions: [
        { label: t("cancel") },
        {
          label: t("save"), kind: "btn-primary",
          onClick: () => update(row.id, {
            assigned_to: tech.value || null,
            status: tech.value ? (row.status === "new" ? "assigned" : row.status) : "new",
          }),
        },
      ],
    });
  }

  async function create(row) {
    try { await tasks.create(row); toast(t("save") + " ✓", "ok", 2000); load(); }
    catch (err) { toast(err.message || t("errNet"), "danger"); }
  }

  async function update(id, patch) {
    try { await tasks.update(id, patch); toast(t("save") + " ✓", "ok", 2000); load(); }
    catch (err) { toast(err.message || t("errNet"), "danger"); }
  }

  await load();
}
