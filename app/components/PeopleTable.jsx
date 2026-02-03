"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiCreatePerson, apiPutDb, apiUpdateTaskStatus, apiDeleteTask, apiUpdateTask } from "@/app/lib/dbClient";

/* ================= helpers ================= */

function clsx(...a) {
  return a.filter(Boolean).join(" ");
}

function parseDateOrNull(s) {
  if (!s) return null;
  const raw = normalizeDateOnly(s);
  if (!raw) return null;
  const [y, m, d] = raw.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// 6 месяцев от текущей даты, будущее включено
function getFromDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(today);
  from.setMonth(from.getMonth() - 6);
  return { from, today };
}

// 5 статусов -> фон
function taskDateClassByStatus(status) {
  if (status === "assigned") return "bg-slate-200 text-slate-800";
  if (status === "sent") return "bg-sky-200 text-sky-900";
  if (status === "confirmed") return "bg-amber-200 text-amber-900";
  if (status === "done") return "bg-emerald-200 text-emerald-900";
  if (status === "failed") return "bg-rose-200 text-rose-900";
  return "bg-slate-100 text-slate-600";
}

function formatDateShort(value) {
  if (!value) return "—";
  const raw = normalizeDateOnly(value);
  if (!raw) return String(value);
  const [y, m, d] = raw.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("ru-RU");
}

function normalizeDateOnly(value) {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function DatePill({ date, status, className = "" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium",
        taskDateClassByStatus(status),
        className
      )}
    >
      {formatDateShort(date)}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M10 11v7" />
      <path d="M14 11v7" />
      <path d="M6 7l1-2h10l1 2" />
      <path d="M7 7l1 14h8l1-14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
    </svg>
  );
}

/* ================= Popovers ================= */

function InlinePopover({ open, title, children, popoverRef, side = "right" }) {
  if (!open) return null;
  const sideClass = side === "right" ? "left-full ml-2" : "right-full mr-2";

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        "absolute z-50 top-1/2 -translate-y-1/2 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg",
        sideClass
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="truncate text-sm font-medium text-slate-900">
          {title}
        </div>
      </div>
      <div className="max-h-80 overflow-auto p-3">{children}</div>
    </div>
  );
}

function StatusPopover({ open, side = "right", popRef, children }) {
  if (!open) return null;
  const sideClass = side === "right" ? "left-full ml-2" : "right-full mr-2";

  return (
    <div
      ref={popRef}
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        "absolute z-50 top-1/2 -translate-y-1/2 w-[200px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg",
        sideClass
      )}
    >
      <div className="p-2">{children}</div>
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "assigned", label: "Назначено" },
  { value: "sent", label: "Отправлено" },
  { value: "confirmed", label: "Подтверждено" },
  { value: "done", label: "Выполнено" },
  { value: "failed", label: "Не выполнено" },
];

const STATUS_SORT_ORDER = {
  assigned: 0,
  sent: 1,
  confirmed: 2,
  done: 3,
  failed: 4,
};

const YES_NO = ["Да", "Нет"];

/* ================= UI (modal + form) ================= */

function Input(props) {
  return (
    <input
      {...props}
      className={clsx(
        "h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none",
        "focus:border-slate-300"
      )}
    />
  );
}
function Textarea(props) {
  return (
    <textarea
      {...props}
      className={clsx(
        "min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none",
        "focus:border-slate-300"
      )}
    />
  );
}
function Select(props) {
  return (
    <select
      {...props}
      className={clsx(
        "h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none",
        "focus:border-slate-300"
      )}
    />
  );
}

function Labeled({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function ModalShell({ open, title, onClose, children, footer, busy }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose?.();
    }
    function onDown(e) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target)) return;
      if (!busy) onClose?.();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, busy]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-4 sm:items-center sm:px-4">
      <div
        ref={panelRef}
        className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] flex flex-col"
      >
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="text-base font-semibold text-slate-900">{title}</div>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>

        {footer ? (
          <div className="border-t border-slate-100 bg-slate-50 p-3 sm:p-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ================= Main ================= */

export default function PeopleTable({
  initialPeople = [],
  tasks = [],
}) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("all"); // all | М | Ж
  const [statusSortEnabled, setStatusSortEnabled] = useState(false);
  const [dateSortDir, setDateSortDir] = useState("desc"); // desc | asc
  const [impromptuOnly, setImpromptuOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");

  // локальные state
  const [people, setPeople] = useState(Array.isArray(initialPeople) ? initialPeople : []);
  const [localTasks, setLocalTasks] = useState(Array.isArray(tasks) ? tasks : []);

  useEffect(() => {
    setPeople(Array.isArray(initialPeople) ? initialPeople : []);
  }, [initialPeople]);

  useEffect(() => {
    setLocalTasks(Array.isArray(tasks) ? tasks : []);
  }, [tasks]);

  // autosave
  const saveTimerRef = useRef(null);

  function scheduleAutosave(nextPeople, nextTasks) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      try {
        await apiPutDb({ people: nextPeople, tasks: nextTasks });
      } catch (e) {
        console.error("Autosave failed", e);
      }
    }, 600);
  }

  function updatePeople(updater) {
    setPeople((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const next = typeof updater === "function" ? updater(base) : updater;
      scheduleAutosave(next, localTasks);
      return next;
    });
  }

  function updateTasks(updater) {
    setLocalTasks((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const next = typeof updater === "function" ? updater(base) : updater;
      scheduleAutosave(people, next);
      return next;
    });
  }

  const { from } = useMemo(() => getFromDate(), []);
  const peopleById = useMemo(() => {
    const m = new Map();
    for (const p of people || []) m.set(String(p.id), p);
    return m;
  }, [people]);

  // ====== cleanup: если assignment.personId нет в people -> убрать, и если task пустой -> удалить
  const cleanedTasks = useMemo(() => {
    const peopleSet = new Set((people || []).map((p) => String(p.id)));
    return (localTasks || [])
      .map((t) => {
        const baseAssignments = Array.isArray(t.assignments) ? t.assignments : [];
        const nextAssignments = baseAssignments.filter((a) =>
          peopleSet.has(String(a.personId))
        );
        return { ...t, assignments: nextAssignments };
      })
      .filter((t) => (t.assignments || []).length > 0);
  }, [localTasks, people]);

  useEffect(() => {
    const a = JSON.stringify(localTasks || []);
    const b = JSON.stringify(cleanedTasks || []);
    if (a === b) return;
    updateTasks(cleanedTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanedTasks]);

  function getSide(btnEl, w) {
    if (!btnEl) return "right";
    const r = btnEl.getBoundingClientRect();
    const gap = 8;
    const fitsRight = r.right + gap + w <= window.innerWidth - 12;
    return fitsRight ? "right" : "left";
  }

  // popovers
  const [openKey, setOpenKey] = useState(null);
  const [popSide, setPopSide] = useState("right");
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const [statusOpenKey, setStatusOpenKey] = useState(null);
  const [statusSide, setStatusSide] = useState("right");
  const statusTriggerRef = useRef(null);
  const statusPopoverRef = useRef(null);

  // tasksState
  const tasksState = localTasks ?? [];

  // rows: сначала назначения, потом люди без назначений (внизу)
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const assigned = [];
    const assignedPersonSet = new Set();

    for (const t of tasksState || []) {
      const d = parseDateOrNull(t.taskDate);
      if (!d) continue;
      d.setHours(0, 0, 0, 0);
      if (d < from) continue;

      const assignments = Array.isArray(t.assignments) ? t.assignments : [];
      for (const a of assignments) {
        const p = peopleById.get(String(a.personId));
        if (!p) continue;
        if (genderFilter !== "all" && String(p.gender) !== genderFilter) continue;
        if (impromptuOnly && String(p.impromptuStatus) !== "Да") continue;
        if (groupFilter && String(p.groupNumber) !== groupFilter) continue;

        const perStatus = a.status || "assigned";

        const hay = `${p.name} ${t.taskDate} ${t.title || ""} ${
          t.situation || ""
        } ${a.role || ""} ${p.groupNumber} ${p.notes || ""}`.toLowerCase();
        if (q && !hay.includes(q)) continue;

        assigned.push({
          kind: "assigned",
          key: `${t.id}_${p.id}_${a.role || ""}`,
          taskId: t.id,
          date: t.taskDate || "-",
          status: perStatus,
          isImpromptu: t.isImpromptu || "Нет",
          title: t.title || "-",
          situation: t.situation || "",
          taskNumber: Number(t.taskNumber ?? 0),
          role: a.role || "-",
          personId: p.id,
          name: p.name,
          group: p.groupNumber,
          participationStatus: p.participationStatus || "Да",
          limitationsStatus: p.limitationsStatus || "Нет",
          notes: p.notes || "",
        });

        assignedPersonSet.add(String(p.id));
      }
    }

    const dateSortFactor = dateSortDir === "asc" ? 1 : -1;
    const roleOrder = (role) =>
      role === "Проводящий" ? 0 : role === "Помощник" ? 1 : 2;
    const sortByDate = (a, b) =>
      ((parseDateOrNull(a.date)?.getTime() ?? 0) -
        (parseDateOrNull(b.date)?.getTime() ?? 0)) *
      dateSortFactor;
    const sortBytaskNumberAndRole = (a, b) => {
      const pr = (a.taskNumber ?? 0) - (b.taskNumber ?? 0);
      if (pr !== 0) return pr;
      const rr = roleOrder(a.role) - roleOrder(b.role);
      if (rr !== 0) return rr;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru");
    };

    if (statusSortEnabled) {
      assigned.sort((a, b) => {
        const aOrder = STATUS_SORT_ORDER[a.status] ?? 99;
        const bOrder = STATUS_SORT_ORDER[b.status] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const d = sortByDate(a, b);
        if (d !== 0) return d;
        return sortBytaskNumberAndRole(a, b);
      });
    } else {
      assigned.sort((a, b) => {
        const d = sortByDate(a, b);
        if (d !== 0) return d;
        return sortBytaskNumberAndRole(a, b);
      });
    }

    // люди без заданий за период — внизу
    const idle = [];
    for (const p of people || []) {
      if (assignedPersonSet.has(String(p.id))) continue;
      if (genderFilter !== "all" && String(p.gender) !== genderFilter) continue;
      if (impromptuOnly && String(p.impromptuStatus) !== "Да") continue;
      if (groupFilter && String(p.groupNumber) !== groupFilter) continue;

      const hay = `${p.name} ${p.groupNumber} ${p.notes || ""}`.toLowerCase();
      if (q && !hay.includes(q)) continue;

      idle.push({
        kind: "idle",
        key: `idle_${p.id}`,
        taskId: null,
        date: "—",
        status: null,
        title: "—",
        situation: "",
        role: "—",
        personId: p.id,
        name: p.name,
        group: p.groupNumber,
        participationStatus: p.participationStatus || "Да",
        limitationsStatus: p.limitationsStatus || "Нет",
        notes: p.notes || "",
      });
    }

    // можно отсортировать по имени
    idle.sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));

    return [...assigned, ...idle];
  }, [
    tasksState,
    peopleById,
    people,
    query,
    from,
    genderFilter,
    statusSortEnabled,
    dateSortDir,
    impromptuOnly,
    groupFilter,
  ]);

  // кэш: задания по personId для поповера (только для assigned строк)
  const tasksByPerson = useMemo(() => {
    const map = new Map();

    for (const t of tasksState || []) {
      const d = parseDateOrNull(t.taskDate);
      if (!d) continue;
      d.setHours(0, 0, 0, 0);
      if (d < from) continue;

      const baseAssignments = Array.isArray(t.assignments) ? t.assignments : [];
      for (const a of baseAssignments) {
        const arr = map.get(String(a.personId)) || [];
        arr.push({
          id: t.id,
          taskDate: t.taskDate || "-",
          title: t.title || "-",
          status: a.status || "assigned",
          role: a.role || "-",
          isImpromptu: t.isImpromptu || "Нет",
        });
        map.set(String(a.personId), arr);
      }
    }

    for (const [pid, arr] of map.entries()) {
      arr.sort(
        (a, b) =>
          (parseDateOrNull(b.taskDate)?.getTime() ?? 0) -
          (parseDateOrNull(a.taskDate)?.getTime() ?? 0)
      );
      map.set(pid, arr);
    }

    return map;
  }, [tasksState, from]);

  // удалить assignment у этого человека, и если в задаче больше нет assignments -> удалить task
  function removeAssignment(info) {
    const { taskId, personId, role } = info || {};
    if (!taskId) {
      console.error("Remove assignment failed: missing task id", {
        taskId,
        personId,
        role,
      });
      return;
    }
    const baseTasks = Array.isArray(localTasks) ? localTasks : [];
    const resolvedTask = baseTasks.find((t) => String(t.id) === String(taskId));
    if (!resolvedTask) {
      console.error("Remove assignment failed: task not found", {
        taskId,
        personId,
        role,
      });
      return;
    }

    const resolvedId = resolvedTask.id;

      let nextAssignments = (resolvedTask.assignments || []).filter((a) => {
        const samePerson = String(a.personId) === String(personId);
        const sameRole = String(a.role || "") === String(role || "");
        return !(samePerson && sameRole);
      });
      const nextConductor = nextAssignments.find(
        (a) => a.role === "Проводящий"
      );
      const nextAssistant = nextAssignments.find(
        (a) => a.role === "Помощник"
      );
      const nextStatus = nextAssignments[0]?.status || resolvedTask.status;
      const nextTaskDate = normalizeDateOnly(resolvedTask.taskDate);

      setLocalTasks((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const next = base.map((t) => {
          if (t.id !== resolvedId) return t;
          return {
            ...t,
            assignments: nextAssignments,
            conductorId: nextConductor?.personId,
            assistantId: nextAssistant?.personId || null,
            status: nextStatus,
            taskDate: nextTaskDate || t.taskDate,
          };
        });
        return next.filter((t) => (t.assignments || []).length > 0);
      });

      if (!nextAssignments.length && resolvedId) {
        apiDeleteTask(resolvedId).then((res) => {
          if (res?.ok === false) {
            console.error("Delete task failed", res);
          }
        }).catch((e) => {
          console.error("Delete task failed", e);
        });
      } else if (resolvedId) {
        apiUpdateTask(resolvedId, {
          ...resolvedTask,
          assignments: nextAssignments,
          conductorId: nextConductor?.personId,
          assistantId: nextAssistant?.personId || null,
          status: nextStatus,
          taskDate: nextTaskDate || resolvedTask.taskDate,
        }).catch((e) => {
          console.error("Update task failed", e);
        });
      }
  }

  // смена статуса: только нужного человека в нужной роли
  function setAssignmentStatus(taskId, personId, role, newStatus) {
    setLocalTasks((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const next = base.map((t) => {
        if (t.id !== taskId) return t;

        const baseAssignments = Array.isArray(t.assignments)
          ? t.assignments
          : t.assignments
          ? [t.assignments]
          : [];
        const nextAssignments = baseAssignments.map((a) => ({
          ...a,
          status: newStatus,
        }));

        return { ...t, status: newStatus, assignments: nextAssignments };
      });

      return next;
    });

    apiUpdateTaskStatus({ taskId, status: newStatus }).catch((e) => {
      console.error("Status update failed", e);
    });
  }

  // закрытие popover списка заданий (по дате)
  useEffect(() => {
    function onDown(e) {
      if (!openKey) return;

      const popEl = popoverRef.current;
      const trgEl = triggerRef.current;

      if (popEl && popEl.contains(e.target)) return;
      if (trgEl && trgEl.contains(e.target)) return;

      setOpenKey(null);
    }

    function onKey(e) {
      if (e.key === "Escape") setOpenKey(null);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey]);

  // закрытие popover статусов (по клику снаружи)
  useEffect(() => {
    function onDown(e) {
      if (!statusOpenKey) return;

      const popEl = statusPopoverRef.current;
      const trgEl = statusTriggerRef.current;

      if (popEl && popEl.contains(e.target)) return;
      if (trgEl && trgEl.contains(e.target)) return;

      setStatusOpenKey(null);
    }

    function onKey(e) {
      if (e.key === "Escape") setStatusOpenKey(null);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [statusOpenKey]);

  /* ============ Add person (modal) ============ */

  const [addOpen, setAddOpen] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [adding, setAdding] = useState(false);

  const [form, setForm] = useState({
    name: "",
    gender: "М",
    groupNumber: 1,
    studyStatus: "Нет",
    impromptuStatus: "Нет",
    limitationsStatus: "Нет",
    participationStatus: "Да",
    notes: "",
  });

  function normalizeForDup(s) {
    return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function resetAdd() {
    setForm({
      name: "",
      gender: "М",
      groupNumber: 1,
      studyStatus: "Нет",
      impromptuStatus: "Нет",
      limitationsStatus: "Нет",
      participationStatus: "Да",
      notes: "",
    });
    setAddErr("");
    setAdding(false);
  }

  function validateAdd() {
    const name = String(form.name || "").trim().replace(/\s+/g, " ");
    if (!name) return "Введите имя";
    const dup = (people || []).some(
      (p) => normalizeForDup(p.name) === normalizeForDup(name)
    );
    if (dup) return "Человек с таким именем уже существует";
    const g = Number(form.groupNumber);
    if (!Number.isFinite(g) || g <= 0) return "Группа должна быть числом больше 0";
    return "";
  }

  async function submitAdd() {
    const err = validateAdd();
    if (err) {
      setAddErr(err);
      return;
    }

    setAdding(true);
    setAddErr("");

    try {
      const created = await apiCreatePerson({
        ...form,
        name: String(form.name || "").trim().replace(/\s+/g, " "),
        groupNumber: Number(form.groupNumber),
      });

      if (!created?.id) throw new Error("Сервер не вернул созданного человека");

      // обновляем people, и он появится внизу таблицы (idle rows)
      updatePeople((prev) => [...prev, created]);

      setAddOpen(false);
      resetAdd();
    } catch (e) {
      setAddErr(String(e?.message || e));
    } finally {
      setAdding(false);
    }
  }

  /* ============ Confirm delete for assignment (trash) ============ */

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState(null); // { taskId, personId, role, name, title, date }

  function askRemoveAssignment(info) {
    setConfirmInfo(info);
    setConfirmOpen(true);
  }

  function confirmRemove() {
    if (!confirmInfo) return;
    removeAssignment(confirmInfo);
    setConfirmOpen(false);
    setConfirmInfo(null);
  }

  const filterButtonClass = (active, tone = "slate") =>
    clsx(
      "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-xl border px-2.5 text-xs font-medium transition md:h-10 md:rounded-2xl md:px-3.5 md:text-sm",
      active
        ? {
            slate: "border-slate-900 bg-slate-900 text-white shadow-sm",
            blue: "border-sky-700 bg-sky-700 text-white shadow-sm",
            rose: "border-rose-600 bg-rose-600 text-white shadow-sm",
            amber: "border-amber-600 bg-amber-600 text-white shadow-sm",
            violet: "border-violet-700 bg-violet-700 text-white shadow-sm",
          }[tone]
        : {
            slate:
              "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            blue: "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100",
            rose: "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
            amber:
              "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
            violet:
              "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100",
          }[tone]
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по человеку, заданию, роли, дате..."
              className="w-full rounded-xl border border-slate-300 bg-white px-9 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => router.push("/schedule")}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              title="Открыть график"
            >
              График
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="grid w-full grid-cols-3 gap-2 md:w-auto md:grid-cols-none md:flex md:flex-wrap md:items-center">
            <input
              inputMode="numeric"
              value={groupFilter}
              onChange={(e) =>
                setGroupFilter(String(e.target.value || "").replace(/[^\d]/g, ""))
              }
              placeholder="Группа"
              className="col-span-3 h-8 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-slate-300 md:col-auto md:h-10 md:w-28 md:rounded-2xl md:px-3 md:text-sm"
            />
          <button
            type="button"
            onClick={() => setGenderFilter("all")}
            className={filterButtonClass(genderFilter === "all", "slate")}
            aria-pressed={genderFilter === "all"}
          >
            Все
          </button>
          <button
            type="button"
            onClick={() => setGenderFilter("М")}
            className={filterButtonClass(genderFilter === "М", "blue")}
            aria-pressed={genderFilter === "М"}
            title="Братья (мужчины)"
          >
            Братья
          </button>
          <button
            type="button"
            onClick={() => setGenderFilter("Ж")}
            className={filterButtonClass(genderFilter === "Ж", "rose")}
            aria-pressed={genderFilter === "Ж"}
            title="Сестры (женщины)"
          >
            Сестры
          </button>

            <button
              type="button"
              onClick={() => setImpromptuOnly((prev) => !prev)}
              className={filterButtonClass(impromptuOnly, "violet")}
              aria-pressed={impromptuOnly}
              title="Экспромт: Да"
            >
              Экспромт
            </button>

            <button
              type="button"
              onClick={() => setStatusSortEnabled((prev) => !prev)}
              className={filterButtonClass(statusSortEnabled, "amber")}
              aria-pressed={statusSortEnabled}
              title="Сортировка по статусу"
            >
              Статус
            </button>

            <button
              type="button"
              onClick={() =>
                setDateSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
              }
              className={clsx(
                filterButtonClass(dateSortDir === "asc", "slate"),
                "md:hidden"
              )}
              aria-pressed={dateSortDir === "asc"}
              title={
                dateSortDir === "asc"
                  ? "Сортировка: сначала старые"
                  : "Сортировка: сначала новые"
              }
            >
              Дата {dateSortDir === "asc" ? "↑" : "↓"}
            </button>

          <button
            type="button"
            onClick={() => {
              setQuery("");
              setGenderFilter("all");
              setImpromptuOnly(false);
              setStatusSortEnabled(false);
              setDateSortDir("desc");
              setGroupFilter("");
            }}
            className={filterButtonClass(false, "slate")}
            title="Сбросить фильтры"
          >
            Сброс
          </button>
          </div>
          <button
            type="button"
            onClick={() => {
              resetAdd();
              setAddOpen(true);
            }}
            className="h-10 w-full shrink-0 rounded-2xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm hover:opacity-90 md:w-auto"
            title="Добавить нового человека"
          >
            + Добавить человека
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="space-y-3 md:hidden">
        {rows.map((r, idx) => {
          const rowKey = r.key;
          const isAssigned = r.kind === "assigned";
          const isOpen = openKey === rowKey;
          const isStatusOpen = statusOpenKey === rowKey;
          const isImpromptuConductor =
            isAssigned &&
            r.role === "Проводящий" &&
            String(r.isImpromptu || "Нет") === "Да" &&
            String(r.status || "") === "done";
          const rowHighlight =
            r.limitationsStatus === "Да"
              ? "bg-orange-200/70"
              : r.participationStatus === "Нет"
              ? "bg-yellow-100"
              : "bg-white";

          const personTasks = tasksByPerson.get(String(r.personId)) || [];
          const title = `Задания: ${r.name}`;

          return (
            <div
              key={rowKey}
              onClick={() => router.push(`/person?id=${r.personId}`)}
              className={clsx(
                "rounded-2xl border border-slate-200 p-3 shadow-sm cursor-pointer",
                rowHighlight
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">#{idx + 1}</div>
                  <div className="truncate font-medium text-slate-900">{r.name}</div>
                  {!isAssigned ? (
                    <div className="mt-1 text-xs text-slate-400">Нет заданий за период</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isAssigned) {
                      askRemoveAssignment({
                        taskId: r.taskId,
                        personId: r.personId,
                        role: r.role,
                        name: r.name,
                        title: r.title,
                        date: r.date,
                      });
                    }
                  }}
                  className={clsx(
                    "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-500",
                    isAssigned
                      ? "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      : "opacity-40 cursor-not-allowed"
                  )}
                  title={
                    isAssigned
                      ? "Убрать это задание у этого человека"
                      : "Удалять нечего (нет заданий)"
                  }
                >
                  <TrashIcon />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="relative inline-block">
                  <button
                    type="button"
                    ref={isOpen ? triggerRef : null}
                    className="inline-flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isAssigned) return;
                      if (statusOpenKey) setStatusOpenKey(null);
                      if (openKey === rowKey) {
                        setOpenKey(null);
                        return;
                      }
                      const btn = e.currentTarget;
                      triggerRef.current = btn;
                      setPopSide(getSide(btn, 320));
                      setOpenKey(rowKey);
                    }}
                  >
                    {isAssigned ? (
                      <DatePill
                        date={r.date}
                        status={r.status}
                        className={clsx(
                          "cursor-pointer hover:brightness-95",
                          isImpromptuConductor ? "bg-violet-200 text-violet-950" : ""
                        )}
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium bg-slate-100 text-slate-500">
                        —
                      </span>
                    )}
                  </button>

                  <InlinePopover
                    open={isOpen}
                    title={title}
                    popoverRef={isOpen ? popoverRef : null}
                    side={popSide}
                  >
                    {personTasks.length === 0 ? (
                      <div className="text-sm text-slate-500">Нет заданий за период.</div>
                    ) : (
                      <div className="space-y-2">
                        {personTasks.map((t) => {
                          const isImpromptuConductorTask =
                            t.role === "Проводящий" &&
                            String(t.isImpromptu || "Нет") === "Да" &&
                            String(t.status || "") === "done";
                          return (
                            <div key={`${t.id}_${t.taskDate}`} className="flex items-center gap-2">
                              <DatePill
                                date={t.taskDate}
                                status={t.status}
                                className={clsx(
                                  isImpromptuConductorTask ? "bg-violet-200 text-violet-950" : ""
                                )}
                              />
                              <div className="min-w-0 flex-1 truncate text-xs text-slate-600" title={t.title}>
                                {t.title}
                              </div>
                              <div className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                {t.role || "—"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </InlinePopover>
                </div>

                <div className="relative inline-block">
                  <button
                    type="button"
                    ref={isStatusOpen ? statusTriggerRef : null}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isAssigned) return;
                      if (openKey) setOpenKey(null);
                      if (statusOpenKey === rowKey) {
                        setStatusOpenKey(null);
                        return;
                      }
                      const btn = e.currentTarget;
                      statusTriggerRef.current = btn;
                      setStatusSide(getSide(btn, 200));
                      setStatusOpenKey(rowKey);
                    }}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-500",
                      isAssigned
                        ? "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                        : "opacity-40 cursor-not-allowed"
                    )}
                    title={isAssigned ? "Изменить статус" : "Нет задания"}
                  >
                    <PencilIcon />
                  </button>

                  <StatusPopover
                    open={isStatusOpen}
                    side={statusSide}
                    popRef={isStatusOpen ? statusPopoverRef : null}
                  >
                    <div className="space-y-2">
                      {STATUS_OPTIONS.map((s) => {
                        const isActive = r.status === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignmentStatus(r.taskId, r.personId, r.role, s.value);
                              setStatusOpenKey(null);
                            }}
                            className={clsx(
                              "w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                              taskDateClassByStatus(s.value),
                              "hover:brightness-95",
                              isActive ? "ring-2 ring-white/60" : "ring-1 ring-black/5"
                            )}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </StatusPopover>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="truncate">
                  {r.title && r.title !== "—" ? `${r.taskNumber ?? "—"}. ${r.title}` : r.title}
                </div>
                {r.situation ? (
                  <div className="truncate text-xs text-slate-500">{r.situation}</div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {r.role}
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    Гр. {r.group}
                  </span>
                </div>
                <div className="truncate text-xs text-slate-600">
                  {r.notes ? r.notes : <span className="text-slate-400">—</span>}
                </div>
              </div>
            </div>
          );
        })}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            За период записей нет.
          </div>
        ) : null}
      </div>

      <div className="hidden md:block w-full overflow-x-auto">
        <table className="min-w-[860px] w-full table-fixed text-sm md:min-w-0">
          <thead className="text-left text-slate-600">
            <tr className="border-b border-slate-200 bg-white">
              <th className="w-12 px-3 py-3">№</th>
              <th className="w-[24%] px-3 py-3">Человек</th>
              <th className="w-40 px-3 py-3 text-center">
                <button
                  type="button"
                  onClick={() =>
                    setDateSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
                  }
                  className="inline-flex items-center justify-center gap-2 text-sm font-medium text-slate-700"
                  title={
                    dateSortDir === "asc"
                      ? "Сортировать от новых к старым"
                      : "Сортировать от старых к новым"
                  }
                >
                  Дата
                  <span className="inline-flex items-center justify-center text-lg font-bold text-slate-700 leading-none cursor-pointer relative -top-0.5">
                    {dateSortDir === "asc" ? "↑" : "↓"}
                  </span>
                </button>
              </th>
              <th className="w-[30%] px-3 py-3">Задание</th>
              <th className="w-28 px-3 py-3 text-center">Роль</th>
              <th className="hidden md:table-cell w-20 px-3 py-3 text-center">Группа</th>
              <th className="hidden lg:table-cell w-[18%] px-3 py-3">Заметки</th>
              <th className="w-14 px-3 py-3 text-center" />
            </tr>
          </thead>

          <tbody className="text-slate-900">
            {rows.map((r, idx) => {
              const rowKey = r.key;
              const isAssigned = r.kind === "assigned";
              const isOpen = openKey === rowKey;
              const isStatusOpen = statusOpenKey === rowKey;
              const isImpromptuConductor =
                isAssigned &&
                r.role === "Проводящий" &&
                String(r.isImpromptu || "Нет") === "Да" &&
                String(r.status || "") === "done";
              const rowHighlight =
                r.limitationsStatus === "Да"
                  ? "bg-orange-200/70"
                  : r.participationStatus === "Нет"
                  ? "bg-yellow-100"
                  : "";

              const personTasks = tasksByPerson.get(String(r.personId)) || [];
              const title = `Задания: ${r.name}`;

              return (
                <tr
                  key={rowKey}
                  onClick={() => router.push(`/person?id=${r.personId}`)}
                  className={clsx(
                    "border-t border-slate-200 hover:bg-slate-50 cursor-pointer",
                    rowHighlight ? rowHighlight : !isAssigned ? "bg-slate-50/60" : ""
                  )}
                >
                  <td className="px-3 py-3 align-middle text-slate-500">
                    {idx + 1}
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <div className="truncate font-medium">{r.name}</div>
                    {!isAssigned ? (
                      <div className="mt-1 text-xs text-slate-400">
                        Нет заданий за период
                      </div>
                    ) : null}
                  </td>

                  {/* Дата + карандаш справа */}
                  <td className="px-2 py-3 text-center align-middle">
                    <div className="relative inline-flex items-center gap-2">
                      {/* Кнопка даты -> список заданий человека (только если есть задания) */}
                      <div className="relative inline-block">
                        <button
                          type="button"
                          ref={isOpen ? triggerRef : null}
                          className="inline-flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isAssigned) return;

                            if (statusOpenKey) setStatusOpenKey(null);

                            if (openKey === rowKey) {
                              setOpenKey(null);
                              return;
                            }

                            const btn = e.currentTarget;
                            triggerRef.current = btn;
                            setPopSide(getSide(btn, 320));
                            setOpenKey(rowKey);
                          }}
                          title={
                            isAssigned
                              ? "Показать список всех заданий этого человека"
                              : "Нет заданий"
                          }
                        >
                          {isAssigned ? (
                            <DatePill
                              date={r.date}
                              status={r.status}
                              className={clsx(
                                "cursor-pointer hover:brightness-95",
                                isImpromptuConductor
                                  ? "bg-violet-200 text-violet-950"
                                  : ""
                              )}
                            />
                          ) : (
                            <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium bg-slate-100 text-slate-500">
                              —
                            </span>
                          )}
                        </button>

                        <InlinePopover
                          open={isOpen}
                          title={title}
                          popoverRef={isOpen ? popoverRef : null}
                          side={popSide}
                        >
                          {personTasks.length === 0 ? (
                            <div className="text-sm text-slate-500">
                              Нет заданий за период.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {personTasks.map((t) => {
                                const isImpromptuConductorTask =
                                  t.role === "Проводящий" &&
                                  String(t.isImpromptu || "Нет") === "Да" &&
                                  String(t.status || "") === "done";
                                  return (
                                    <div
                                      key={`${t.id}_${t.taskDate}`}
                                      className="flex items-center gap-2"
                                    >
                                    <DatePill
                                      date={t.taskDate}
                                      status={t.status}
                                      className={clsx(
                                        isImpromptuConductorTask
                                          ? "bg-violet-200 text-violet-950"
                                          : ""
                                      )}
                                    />
                                    <div
                                      className="min-w-0 flex-1 truncate text-xs text-slate-600"
                                      title={t.title}
                                    >
                                      {t.title}
                                    </div>
                                    <div className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                      {t.role || "—"}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </InlinePopover>
                      </div>

                      {/* Карандаш -> только 5 статусов (только если есть задание) */}
                      <div className="relative inline-block">
                        <button
                          type="button"
                          ref={isStatusOpen ? statusTriggerRef : null}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isAssigned) return;

                            if (openKey) setOpenKey(null);

                            if (statusOpenKey === rowKey) {
                              setStatusOpenKey(null);
                              return;
                            }

                            const btn = e.currentTarget;
                            statusTriggerRef.current = btn;
                            setStatusSide(getSide(btn, 200));
                            setStatusOpenKey(rowKey);
                          }}
                          className={clsx(
                            "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-500",
                            isAssigned
                              ? "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                              : "opacity-40 cursor-not-allowed"
                          )}
                          title={isAssigned ? "Изменить статус" : "Нет задания"}
                        >
                          <PencilIcon />
                        </button>

                        <StatusPopover
                          open={isStatusOpen}
                          side={statusSide}
                          popRef={isStatusOpen ? statusPopoverRef : null}
                        >
                          <div className="space-y-2">
                            {STATUS_OPTIONS.map((s) => {
                              const isActive = r.status === s.value;
                              return (
                                <button
                                  key={s.value}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssignmentStatus(
                                      r.taskId,
                                      r.personId,
                                      r.role,
                                      s.value
                                    );
                                    setStatusOpenKey(null);
                                  }}
                                  className={clsx(
                                    "w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                                    taskDateClassByStatus(s.value),
                                    "hover:brightness-95",
                                    isActive
                                      ? "ring-2 ring-white/60"
                                      : "ring-1 ring-black/5"
                                  )}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </StatusPopover>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <div
                      className="truncate"
                      title={
                        r.title && r.title !== "—"
                          ? `${r.taskNumber ?? "—"}. ${r.title}`
                          : r.title
                      }
                    >
                      {r.title && r.title !== "—"
                        ? `${r.taskNumber ?? "—"}. ${r.title}`
                        : r.title}
                    </div>
                    {r.situation ? (
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {r.situation}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-3 py-3 text-center align-middle">
                    <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {r.role}
                    </span>
                  </td>

                  <td className="hidden md:table-cell px-3 py-3 text-center align-middle">
                    <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {r.group}
                    </span>
                  </td>

                  <td className="hidden lg:table-cell px-3 py-3 align-middle text-slate-700">
                    <div className="truncate">
                      {r.notes ? r.notes : <span className="text-slate-400">—</span>}
                    </div>
                  </td>

                  {/* ONLY ONE DELETE BUTTON: trash */}
                  <td className="px-3 py-3 text-center align-middle">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isAssigned) {
                          askRemoveAssignment({
                            taskId: r.taskId,
                            personId: r.personId,
                            role: r.role,
                            name: r.name,
                            title: r.title,
                            date: r.date,
                          });
                        }
                      }}
                      className={clsx(
                        "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-500",
                        isAssigned
                          ? "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          : "opacity-40 cursor-not-allowed"
                      )}
                      title={
                        isAssigned
                          ? "Убрать это задание у этого человека"
                          : "Удалять нечего (нет заданий)"
                      }
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-slate-500" colSpan={8}>
                  За период записей нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ====== Add person modal ====== */}
      <ModalShell
        open={addOpen}
        title="Добавить человека"
        busy={adding}
        onClose={() => {
          if (adding) return;
          setAddOpen(false);
        }}
        footer={
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-rose-700">
              {addErr ? addErr : <span className="text-slate-500">Имя должно быть уникальным.</span>}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:justify-end sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  if (adding) return;
                  setAddOpen(false);
                }}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 w-full sm:w-auto"
              >
                Отмена
              </button>

              <button
                type="button"
                disabled={adding}
                onClick={submitAdd}
                className={clsx(
                  "rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white w-full sm:w-auto",
                  adding ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
                )}
              >
                {adding ? "Добавление…" : "Добавить"}
              </button>
            </div>
          </div>
        }
      >
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900">Профиль</div>
          <div className="mt-1 text-xs text-slate-500">Основные данные человека</div>

          <div className="mt-5 grid grid-cols-1 gap-4">
            <Labeled label="Имя">
              <Input
                value={form.name}
                onChange={(e) => {
                  setForm((p) => ({ ...p, name: e.target.value }));
                  setAddErr("");
                }}
                placeholder="Например: Иван Петров"
              />
            </Labeled>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Labeled label="Пол">
                <Select
                  value={form.gender}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, gender: e.target.value }))
                  }
                >
                  <option value="М">М</option>
                  <option value="Ж">Ж</option>
                </Select>
              </Labeled>

              <Labeled label="Группа">
                <Input
                  inputMode="numeric"
                  value={form.groupNumber}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, groupNumber: Number(e.target.value) }))
                  }
                />
              </Labeled>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Labeled label="Изучение">
                <Select
                  value={form.studyStatus}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, studyStatus: e.target.value }))
                  }
                >
                  {YES_NO.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Labeled>

              <Labeled label="Экспромт">
                <Select
                  value={form.impromptuStatus}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, impromptuStatus: e.target.value }))
                  }
                >
                  {YES_NO.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Labeled>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Labeled label="Ограничения">
                <Select
                  value={form.limitationsStatus}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, limitationsStatus: e.target.value }))
                  }
                >
                  {YES_NO.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Labeled>

              <Labeled label="Участвует">
                <Select
                  value={form.participationStatus}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      participationStatus: e.target.value,
                    }))
                  }
                >
                  {YES_NO.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Labeled>
            </div>

            <Labeled label="Заметки">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Например: Ответственный / Нужна практика…"
              />
            </Labeled>
          </div>
        </div>
      </ModalShell>

      {/* ====== Confirm delete (trash removes assignment) ====== */}
      <ModalShell
        open={confirmOpen}
        title="Убрать задание у человека?"
        onClose={() => {
          setConfirmOpen(false);
          setConfirmInfo(null);
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmInfo(null);
              }}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={confirmRemove}
              className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Убрать
            </button>
          </div>
        }
      >
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
          {confirmInfo ? (
            <div className="space-y-2">
              <div>
                <span className="text-slate-500">Человек:</span>{" "}
                <span className="font-medium text-slate-900">{confirmInfo.name}</span>
              </div>
              <div>
                <span className="text-slate-500">Задание:</span>{" "}
                <span className="font-medium text-slate-900">{confirmInfo.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Дата:</span>{" "}
                <span className="font-medium text-slate-900">{confirmInfo.date}</span>
                <span className="text-slate-500">Роль:</span>{" "}
                <span className="font-medium text-slate-900">{confirmInfo.role}</span>
              </div>
              <div className="text-slate-500">
                Если после удаления в задании не останется назначений — задание удалится из базы.
              </div>
            </div>
          ) : (
            "—"
          )}
        </div>
      </ModalShell>
    </section>
  );
}

