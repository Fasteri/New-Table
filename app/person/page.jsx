"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiCreateTask,
  apiDeleteTask,
  apiDeletePerson,
  apiGetDb,
  apiUpdatePerson,
  apiUpdateTask,
} from "@/app/lib/dbClient";

/* ====== Константы ====== */

const STATUS = [
  { value: "assigned", label: "Назначено" },
  { value: "sent", label: "Отправлено" },
  { value: "confirmed", label: "Подтверждено" },
  { value: "done", label: "Выполнено" },
  { value: "failed", label: "Не выполнено" },
];

const YES_NO = ["Да", "Нет"];
const ROLE_OPTIONS = ["Проводящий", "Помощник"];

const TASK_TITLES = [
  "Чтение Библии",
  "Начинайте разговор",
  "Развивайте интерес",
  "Подготавливайте учеников",
  "Объясняйте свои взгляды",
  "Речь",
];

const SITUATIONS = [
  "Проповедь по домам",
  "Неформальное служение",
  "Проповедь в общественных местах",
];

/* ====== helpers ====== */

function clsx(...a) {
  return a.filter(Boolean).join(" ");
}

  function normalizeDateOnly(value) {
    if (!value) return "";
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function toDateValue(s) {
    return normalizeDateOnly(s);
  }
  
  function parseDateOrNull(s) {
    if (!s) return null;
    const raw = String(s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function normalizePairAssignments(assignments, meId) {
    const list = Array.isArray(assignments) ? assignments : [];
    if (list.length !== 2) return list;
    const hasConductor = list.some((a) => a.role === "Проводящий");
    if (hasConductor) return list;
    const next = list.map((a) => ({ ...a }));
    const otherIdx = next.findIndex(
      (a) => String(a.personId) !== String(meId)
    );
    const idx = otherIdx >= 0 ? otherIdx : 0;
    next[idx] = { ...next[idx], role: "Проводящий" };
    return next;
  }

  function applyAssignmentsToTask(task, assignments, meId) {
    if (!assignments) return task;
    const normalized = normalizePairAssignments(assignments, meId);
    const conductor = normalized.find((a) => a.role === "Проводящий");
    const assistant = normalized.find((a) => a.role === "Помощник");
    const status = normalized[0]?.status || task.status || "assigned";
    return {
      ...task,
      assignments: normalized,
      conductorId: conductor?.personId,
      assistantId: assistant?.personId || null,
      status,
    };
  }

  function statusMeta(value) {
  switch (value) {
    case "assigned":
      return {
        label: "Назначено",
        pill: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
      };
    case "sent":
      return {
        label: "Отправлено",
        pill: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
      };
    case "confirmed":
      return {
        label: "Подтверждено",
        pill: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
      };
    case "done":
      return {
        label: "Выполнено",
        pill: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
      };
    case "failed":
      return {
        label: "Не выполнено",
        pill: "bg-rose-100 text-rose-900 ring-1 ring-rose-200",
      };
    default:
      return {
        label: value || "—",
        pill: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
      };
  }
}

function sortByDateDesc(a, b) {
  const ta = parseDateOrNull(a?.task?.taskDate)?.getTime() ?? 0;
  const tb = parseDateOrNull(b?.task?.taskDate)?.getTime() ?? 0;
  return tb - ta;
}

function extractTaskNumber(id) {
  const m = String(id || "").match(/^t_(\d+)$/);
  if (!m) return null;
  return Number(m[1]);
}

function nextTaskId(tasks) {
  let max = 0;
  for (const t of tasks || []) {
    const n = extractTaskNumber(t.id);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  const next = max + 1;
  return `t_${String(next).padStart(4, "0")}`;
}

/* ====== Page ====== */

export default function Page() {
  const router = useRouter();
  const [personId, setPersonId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setPersonId(String(params.get("id") || ""));
  }, []);

  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const dirtyTasksRef = useRef(new Set());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Inline подтверждение удаления (без модалки)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Inline форма добавления задания (без модалки)
  const [addOpen, setAddOpen] = useState(false);

  const [newTask, setNewTask] = useState(() => ({
    title: TASK_TITLES[0],
    taskDate: "",
    isImpromptu: "Нет",
    taskNumber: 2,
    situation: "",
    myRole: "Проводящий",
    partnerId: "",
    partnerRole: "Помощник",
  }));

  // поиск напарника
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerListOpen, setPartnerListOpen] = useState(false);
  const [partnerListMode, setPartnerListMode] = useState("match"); // match | all
  const partnerWrapRef = useRef(null);

  // “схлопнуть аккордеоны” после сохранения
  const [collapseSignal, setCollapseSignal] = useState(0);

  // загрузка
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiGetDb();
        if (!alive) return;
        setDb(data);
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // закрытие списка напарника по клику снаружи
  useEffect(() => {
    function onDown(e) {
      if (!partnerListOpen) return;
      const box = partnerWrapRef.current;
      if (box && box.contains(e.target)) return;
      setPartnerListOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setPartnerListOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [partnerListOpen]);

  const people = db?.people || [];
  const tasks = db?.tasks || [];

  const person = useMemo(
    () => people.find((p) => String(p.id) === String(personId)),
    [people, personId]
  );

  const eligiblePeople = useMemo(() => {
    const meId = String(personId);
    return (people || []).filter((p) => {
      if (String(p.id) === meId) return false;
      if (String(p.limitationsStatus || "Нет") === "Да") return false;
      if (String(p.participationStatus || "Да") === "Нет") return false;
      return true;
    });
  }, [people, personId]);

  const partnerOptions = useMemo(() => {
    return eligiblePeople
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
  }, [eligiblePeople]);

  const matchingPartners = useMemo(() => {
    if (!person) return [];
    const myGender = String(person.gender || "");
    const candidates = eligiblePeople.filter(
      (p) => String(p.gender || "") === myGender
    );

    const lastTogetherByPartner = new Map();
    const lastRoleByPerson = new Map();
    const lastAnyByPerson = new Map();

    for (const t of tasks || []) {
      const d = parseDateOrNull(t.taskDate);
      if (!d) continue;
      d.setHours(0, 0, 0, 0);
      const ts = d.getTime();
      const assignments = Array.isArray(t.assignments) ? t.assignments : [];

      for (const a of assignments) {
        const pid = String(a.personId);
        const prev = lastAnyByPerson.get(pid) || 0;
        if (ts > prev) {
          lastAnyByPerson.set(pid, ts);
          lastRoleByPerson.set(pid, a.role || "");
        }
      }

      const hasMe = assignments.some(
        (a) => String(a.personId) === String(person.id)
      );
      if (!hasMe) continue;
      for (const a of assignments) {
        const pid = String(a.personId);
        if (pid === String(person.id)) continue;
        const prev = lastTogetherByPartner.get(pid) || 0;
        if (ts > prev) lastTogetherByPartner.set(pid, ts);
      }
    }

    const cat1 = [];
    const cat2 = [];
    const cat3 = [];

    for (const p of candidates) {
      const pid = String(p.id);
      const neverTogether = !lastTogetherByPartner.has(pid);
      const hasAny = lastAnyByPerson.has(pid);
      const lastRole = lastRoleByPerson.get(pid) || "";

      if (neverTogether && !hasAny) {
        cat1.push(p);
        continue;
      }
      if (neverTogether && lastRole === "Проводящий") {
        cat2.push(p);
        continue;
      }
      if (!neverTogether && lastRole === "Проводящий") {
        cat3.push(p);
      }
    }

    cat1.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
    cat2.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
    cat3.sort((a, b) => {
      const ta = lastTogetherByPartner.get(String(a.id)) || 0;
      const tb = lastTogetherByPartner.get(String(b.id)) || 0;
      if (ta !== tb) return ta - tb;
      return (a.name || "").localeCompare(b.name || "", "ru");
    });

    return [...cat1, ...cat2, ...cat3];
  }, [eligiblePeople, person, tasks]);

  const selectedPartner = useMemo(() => {
    if (!newTask.partnerId) return null;
    return (
      (people || []).find((p) => String(p.id) === String(newTask.partnerId)) ||
      null
    );
  }, [newTask.partnerId, people]);

  const filteredPartners = useMemo(() => {
    const q = String(partnerQuery || "").trim().toLowerCase();
    const base =
      partnerListMode === "all" ? partnerOptions : matchingPartners;
    if (!q) return base;
    return base.filter((p) =>
      String(p.name || "").toLowerCase().includes(q)
    );
  }, [partnerQuery, partnerOptions, matchingPartners, partnerListMode]);

  const personTasks = useMemo(() => {
    const list = tasks
      .flatMap((t) =>
        (t.assignments || [])
          .filter((a) => String(a.personId) === String(personId))
          .map((a) => ({ task: t, assignment: a }))
      )
      .sort(sortByDateDesc);

    if (statusFilter === "all") return list;
    return list.filter(
      (x) => (x.assignment?.status || "assigned") === statusFilter
    );
  }, [tasks, personId, statusFilter]);

  function updatePerson(field, value) {
    setDb((prev) => {
      if (!prev) return prev;
      const nextPeople = (prev.people || []).map((p) =>
        String(p.id) === String(personId) ? { ...p, [field]: value } : p
      );
      return { ...prev, people: nextPeople };
    });
  }

  function updateTask(taskId, updater) {
    setDb((prev) => {
      if (!prev) return prev;
      const nextTasks = (prev.tasks || []).map((t) =>
        t.id === taskId
          ? (() => {
              const nextTask = updater(t);
              return applyAssignmentsToTask(
                nextTask,
                nextTask.assignments,
                personId
              );
            })()
          : t
      );
      return { ...prev, tasks: nextTasks };
    });
    dirtyTasksRef.current.add(String(taskId));
  }

  function updateAssignment(taskId, updater) {
    setDb((prev) => {
      if (!prev) return prev;
      const nextTasks = (prev.tasks || []).map((t) => {
        if (t.id !== taskId) return t;
        const nextAssignments = (t.assignments || []).map((a) =>
          String(a.personId) === String(personId) ? updater(a) : a
        );
        return applyAssignmentsToTask(t, nextAssignments, personId);
      });
      return { ...prev, tasks: nextTasks };
    });
    dirtyTasksRef.current.add(String(taskId));
  }

  function removeFromTask(taskId) {
    setDb((prev) => {
      if (!prev) return prev;
      const nextTasks = (prev.tasks || []).map((t) => {
        if (t.id !== taskId) return t;
        const nextAssignments = (t.assignments || []).filter(
          (a) => String(a.personId) !== String(personId)
        );
        return applyAssignmentsToTask(t, nextAssignments, personId);
      });
      return { ...prev, tasks: nextTasks };
    });

    const task = (db?.tasks || []).find((t) => String(t.id) === String(taskId));
    if (!task) return;
    const nextAssignments = (task.assignments || []).filter(
      (a) => String(a.personId) !== String(personId)
    );
    const normalizedTask = applyAssignmentsToTask(task, nextAssignments, personId);

    if (!nextAssignments.length) {
      apiDeleteTask(taskId).catch((e) => {
        console.error("Delete task failed", e);
        setError(String(e?.message || e));
      });
    } else {
      apiUpdateTask(taskId, normalizedTask).catch((e) => {
        console.error("Update task failed", e);
        setError(String(e?.message || e));
      });
    }
  }

  async function save() {
    if (!db) return;

    try {
      setSaving(true);
      setError("");

      await apiUpdatePerson(personId, person);

      const dirtyIds = Array.from(dirtyTasksRef.current);
      for (const taskId of dirtyIds) {
        const task = (db.tasks || []).find((t) => String(t.id) === taskId);
        if (!task) continue;
        await apiUpdateTask(taskId, task);
      }
      dirtyTasksRef.current.clear();

      setCollapseSignal((v) => v + 1);
      router.push("/");
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function deletePerson() {
    if (!db) return;
    try {
      setSaving(true);
      setError("");

      const deleteId = String(person?.id || personId || "").trim();
      await apiDeletePerson(deleteId);

      setDeleteConfirmOpen(false);
      router.back();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

    async function createTask() {
    if (!db || !person) return;

    try {
      setSaving(true);
      setError("");

      const taskDate = String(newTask.taskDate || "").trim();
      if (!taskDate) {
        setError("Укажите дату задания.");
        return;
      }

      const meId = String(personId);
      const partnerId = String(newTask.partnerId || "").trim();
      const finalPartnerId = partnerId && partnerId !== meId ? partnerId : "";

      const id = nextTaskId(db.tasks || []);

      const assignments = [
        {
          personId: meId,
          role: newTask.myRole || "Проводящий",
          status: "assigned",
        },
      ];

      if (finalPartnerId) {
        assignments.push({
          personId: finalPartnerId,
          role: newTask.partnerRole || "Помощник",
          status: "assigned",
        });
      }

        const t = applyAssignmentsToTask(
          {
            id,
            taskDate,
            title: newTask.title || TASK_TITLES[0],
            situation: newTask.situation ? newTask.situation : null,
            isImpromptu: newTask.isImpromptu || "Нет",
            taskNumber: Number(newTask.taskNumber ?? 2),
            assignments,
          },
          assignments,
          meId
        );

      await apiCreateTask(t);
      setDb((prev) => {
        if (!prev) return prev;
        return { ...prev, tasks: [...(prev.tasks || []), t] };
      });

      setNewTask({
        title: TASK_TITLES[0],
        taskDate: "",
        isImpromptu: "Нет",
        taskNumber: 2,
        situation: "",
        myRole: "Проводящий",
        partnerId: "",
        partnerRole: "Помощник",
      });
      setPartnerQuery("");
      setPartnerListOpen(false);
      setAddOpen(false);

      setCollapseSignal((v) => v + 1);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error && !db) {
    return (
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-800 shadow-sm">
          Ошибка: {error}
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
          Человек не найден
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Назад
        </button>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-3 py-4 space-y-4 sm:px-4 sm:py-8 sm:space-y-6">
      {/* Header: минимум кнопок */}
      <header className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-semibold">
              {(person.name || "—").trim().slice(0, 1).toUpperCase()}
            </div>

            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 truncate">
                {person.name}
              </h1>

            </div>
          </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/")}
            className={clsx(
              "h-10 w-full sm:w-auto rounded-2xl px-4 text-sm font-medium",
              "inline-flex items-center justify-center",
              "bg-white text-slate-900 ring-1 ring-slate-200",
              "hover:bg-slate-50"
            )}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={clsx(
                "h-10 w-full sm:w-auto rounded-2xl px-4 text-sm font-medium",
                "inline-flex items-center justify-center",
                "border border-transparent",
                "outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                "bg-slate-900 text-white transition-opacity select-none",
                saving
                  ? "cursor-not-allowed opacity-80"
                  : "hover:opacity-90 active:scale-[0.97]"
              )}
            >
              Сохранить
            </button>
          </div>
        </div>

        {error ? (
          <div className="border-t border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Profile */}
        <section className="lg:col-span-5 space-y-4">
          <Card
            title="Профиль"
            subtitle="Основные данные человека"
            right={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen((v) => !v)}
                  className="rounded-2xl px-3 py-2 text-sm font-medium bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
                  title="Удалить человека"
                >
                  Удалить
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4">
              <Labeled label="Имя">
                <Input
                  value={person.name || ""}
                  onChange={(e) => updatePerson("name", e.target.value)}
                />
              </Labeled>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Labeled label="Пол">
                  <Select
                    value={person.gender || "М"}
                    onChange={(e) => updatePerson("gender", e.target.value)}
                  >
                    <option value="М">М</option>
                    <option value="Ж">Ж</option>
                  </Select>
                </Labeled>

                <Labeled label="Группа">
                  <Input
                    inputMode="numeric"
                    value={person.groupNumber ?? ""}
                    onChange={(e) =>
                      updatePerson("groupNumber", Number(e.target.value))
                    }
                  />
                </Labeled>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Labeled label="Изучение">
                  <Select
                    value={person.studyStatus || "Нет"}
                    onChange={(e) => updatePerson("studyStatus", e.target.value)}
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
                    value={person.impromptuStatus || "Нет"}
                    onChange={(e) =>
                      updatePerson("impromptuStatus", e.target.value)
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
                    value={person.limitationsStatus || "Нет"}
                    onChange={(e) =>
                      updatePerson("limitationsStatus", e.target.value)
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
                    value={person.participationStatus || "Нет"}
                    onChange={(e) =>
                      updatePerson("participationStatus", e.target.value)
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
                  value={person.notes || ""}
                  onChange={(e) => updatePerson("notes", e.target.value)}
                />
              </Labeled>

              {/* Inline подтверждение удаления */}
              {deleteConfirmOpen ? (
                <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-sm font-semibold text-rose-900">
                    Удалить человека?
                  </div>
                  <div className="mt-1 text-sm text-rose-800">
                    Это удалит <span className="font-medium">{person.name}</span> из базы и
                    уберёт его из всех заданий. Если в задании никого не останется —
                    задание тоже будет удалено.
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setDeleteConfirmOpen(false)}
                      className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={deletePerson}
                      className={clsx(
                        "rounded-2xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:opacity-95",
                        saving ? "opacity-90 cursor-not-allowed" : ""
                      )}
                    >
                      {saving ? "Удаление..." : "Удалить"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </section>

        {/* Tasks */}
        <section className="lg:col-span-7 space-y-4">
          <Card
            title="Задания"
            subtitle={`Всего: ${personTasks.length}`}
            right={
              <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-slate-300 sm:h-10 sm:rounded-2xl sm:px-3 sm:text-sm"
                >
                  <option value="all">Все статусы</option>
                  {STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setAddOpen((v) => !v)}
                  className={clsx(
                    "h-8 rounded-xl px-2.5 text-xs font-medium transition sm:h-10 sm:rounded-2xl sm:px-3 sm:text-sm",
                    addOpen
                      ? "bg-slate-900 text-white hover:opacity-90"
                      : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                  )}
                >
                  + Добавить
                </button>
              </div>
            }
          >
            {/* Inline форма добавления задания */}
            {addOpen ? (
              <div className="mb-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Новое задание
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Labeled label="Задание">
                    <Select
                      value={newTask.title}
                      onChange={(e) =>
                        setNewTask((p) => ({ ...p, title: e.target.value }))
                      }
                    >
                      {TASK_TITLES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Labeled>

                  <Labeled label="Дата">
                    <Input
                      type="date"
                      value={toDateValue(newTask.taskDate)}
                      onChange={(e) =>
                        setNewTask((p) => ({ ...p, taskDate: e.target.value }))
                      }
                    />
                  </Labeled>

                  <Labeled label="Экспромт">
                    <Select
                      value={newTask.isImpromptu}
                      onChange={(e) =>
                        setNewTask((p) => ({ ...p, isImpromptu: e.target.value }))
                      }
                    >
                      {YES_NO.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Labeled>

                  <Labeled label="Номер задания">
                    <Input
                      inputMode="numeric"
                      value={newTask.taskNumber ?? ""}
                      onChange={(e) =>
                        setNewTask((p) => ({ ...p, taskNumber: Number(e.target.value) }))
                      }
                    />
                  </Labeled>

                  <Labeled label="Ситуация (необязательно)">
                    <Select
                      value={newTask.situation}
                      onChange={(e) =>
                        setNewTask((p) => ({ ...p, situation: e.target.value }))
                      }
                    >
                      <option value="">—</option>
                      {SITUATIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Labeled>

                  <Labeled label="Роль">
                    <Select
                      value={newTask.myRole}
                      onChange={(e) =>
                        setNewTask((p) => ({ ...p, myRole: e.target.value }))
                      }
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </Labeled>

                  {/* Напарник с поиском */}
                  <div className="md:col-span-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        Напарник (поиск)
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="partner-mode"
                            value="all"
                            checked={partnerListMode === "all"}
                            onChange={() => setPartnerListMode("all")}
                          />
                          Показать всех
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="partner-mode"
                            value="match"
                            checked={partnerListMode === "match"}
                            onChange={() => setPartnerListMode("match")}
                          />
                          Подходящие напарники
                        </label>
                      </div>

                      <div ref={partnerWrapRef} className="mt-3 relative">
                        <div className="flex items-center gap-2">
                          <input
                            value={partnerQuery}
                            onChange={(e) => {
                              setPartnerQuery(e.target.value);
                              setPartnerListOpen(true);
                            }}
                            onFocus={() => setPartnerListOpen(true)}
                            placeholder="Введите имя напарника..."
                            className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                          />

                          {newTask.partnerId ? (
                            <button
                              type="button"
                              onClick={() => {
                                setNewTask((p) => ({ ...p, partnerId: "" }));
                                setPartnerQuery("");
                                setPartnerListOpen(false);
                              }}
                              className="h-10 rounded-2xl px-3 text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                              title="Убрать напарника"
                            >
                              Очистить
                            </button>
                          ) : null}
                        </div>

                        {partnerListOpen ? (
                          <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                            <div className="max-h-64 overflow-auto p-1">
                              {filteredPartners.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-slate-500">
                                  {partnerListMode === "match"
                                    ? "Нет подходящих напарников"
                                    : "Ничего не найдено"}
                                </div>
                              ) : (
                                filteredPartners.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setNewTask((x) => ({ ...x, partnerId: p.id }));
                                      setPartnerQuery(p.name || "");
                                      setPartnerListOpen(false);
                                    }}
                                    className={clsx(
                                      "w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-slate-50",
                                      String(newTask.partnerId) === String(p.id)
                                        ? "bg-slate-50"
                                        : ""
                                    )}
                                  >
                                    <div className="font-medium text-slate-900">
                                      {p.name}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Группа: {p.groupNumber ?? "—"}
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ) : null}

                        {selectedPartner ? (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                              <div className="text-xs font-medium text-slate-500">
                                Выбран напарник
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {selectedPartner.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                Группа: {selectedPartner.groupNumber ?? "—"}
                              </div>
                            </div>

                            <Labeled label="Роль напарника">
                              <Select
                                value={newTask.partnerRole}
                                onChange={(e) =>
                                  setNewTask((p) => ({ ...p, partnerRole: e.target.value }))
                                }
                              >
                                {ROLE_OPTIONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </Select>
                            </Labeled>
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-slate-500">
                            Если напарника не выбрать — задание создастся только для этого человека.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setAddOpen(false);
                      setPartnerListOpen(false);
                    }}
                    className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    Отмена
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={createTask}
                    className={clsx(
                      "rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-95",
                      saving ? "opacity-90 cursor-not-allowed" : ""
                    )}
                  >
                    {saving ? "Создание..." : "Создать задание"}
                  </button>
                </div>
              </div>
            ) : null}

            {personTasks.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                У человека пока нет заданий (или они отфильтрованы).
              </div>
            ) : (
              <div key={collapseSignal} className="space-y-3">
                {personTasks.map(({ task, assignment }) => (
                  <TaskCard
                    key={`${task.id}_${assignment.personId}`}
                    task={task}
                    assignment={assignment}
                    people={people}
                    allTasks={tasks}
                    onAssignmentChange={(updater) =>
                      updateAssignment(task.id, updater)
                    }
                    onTaskChange={(updater) => updateTask(task.id, updater)}
                    onRemove={() => removeFromTask(task.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>

    </main>
  );
}

/* ====== UI blocks ====== */

function Card({ title, subtitle, right, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle ? (
            <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function Pill({ className, children }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
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

function ReadLine({ children }) {
  return (
    <div className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-800">
      <div className="truncate">{children}</div>
    </div>
  );
}

function ReadBlock({ children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
      {children}
    </div>
  );
}

function formatTaskDate(value) {
  if (!value) return "";
  const raw = normalizeDateOnly(value);
  const parts = raw.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return String(value).trim();
}

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

/* ====== Task Card ====== */

function TaskCard({
  task,
  assignment,
  people,
  allTasks,
  onAssignmentChange,
  onTaskChange,
  onRemove,
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerListOpen, setPartnerListOpen] = useState(false);
  const [partnerListMode, setPartnerListMode] = useState("match");
  const partnerWrapRef = useRef(null);

  const st = statusMeta(assignment?.status || "assigned");
  const meId = String(assignment?.personId || "");
  const mePerson = (people || []).find((p) => String(p.id) === meId);
  const partnerAssignment = (task.assignments || []).find(
    (a) => String(a.personId) !== meId
  );
  const partnerId = partnerAssignment ? String(partnerAssignment.personId) : "";
  const partnerName =
    (people || []).find((p) => String(p.id) === partnerId)?.name || "";
  const partnerRole = partnerAssignment?.role || "Помощник";

  useEffect(() => {
    if (!partnerId) setPartnerQuery("");
  }, [partnerId]);

  useEffect(() => {
    function onDown(e) {
      if (!partnerListOpen) return;
      const box = partnerWrapRef.current;
      if (box && box.contains(e.target)) return;
      setPartnerListOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setPartnerListOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [partnerListOpen]);

  const eligiblePeople = useMemo(() => {
    return (people || []).filter((p) => {
      if (String(p.id) === meId) return false;
      if (String(p.limitationsStatus || "Нет") === "Да") return false;
      if (String(p.participationStatus || "Да") === "Нет") return false;
      return true;
    });
  }, [people, meId]);

  const partnerOptions = useMemo(() => {
    return eligiblePeople
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
  }, [eligiblePeople]);

  const matchingPartners = useMemo(() => {
    if (!mePerson) return [];
    const myGender = String(mePerson.gender || "");
    const candidates = eligiblePeople.filter(
      (p) => String(p.gender || "") === myGender
    );

    const lastTogetherByPartner = new Map();
    const lastRoleByPerson = new Map();
    const lastAnyByPerson = new Map();

    for (const t of allTasks || []) {
      const d = parseDateOrNull(t.taskDate);
      if (!d) continue;
      d.setHours(0, 0, 0, 0);
      const ts = d.getTime();
      const assignments = Array.isArray(t.assignments) ? t.assignments : [];

      for (const a of assignments) {
        const pid = String(a.personId);
        const prev = lastAnyByPerson.get(pid) || 0;
        if (ts > prev) {
          lastAnyByPerson.set(pid, ts);
          lastRoleByPerson.set(pid, a.role || "");
        }
      }

      const hasMe = assignments.some((a) => String(a.personId) === meId);
      if (!hasMe) continue;
      for (const a of assignments) {
        const pid = String(a.personId);
        if (pid === meId) continue;
        const prev = lastTogetherByPartner.get(pid) || 0;
        if (ts > prev) lastTogetherByPartner.set(pid, ts);
      }
    }

    const cat1 = [];
    const cat2 = [];
    const cat3 = [];

    for (const p of candidates) {
      const pid = String(p.id);
      const neverTogether = !lastTogetherByPartner.has(pid);
      const hasAny = lastAnyByPerson.has(pid);
      const lastRole = lastRoleByPerson.get(pid) || "";

      if (neverTogether && !hasAny) {
        cat1.push(p);
        continue;
      }
      if (neverTogether && lastRole === "Проводящий") {
        cat2.push(p);
        continue;
      }
      if (!neverTogether && lastRole === "Проводящий") {
        cat3.push(p);
      }
    }

    cat1.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
    cat2.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
    cat3.sort((a, b) => {
      const ta = lastTogetherByPartner.get(String(a.id)) || 0;
      const tb = lastTogetherByPartner.get(String(b.id)) || 0;
      if (ta !== tb) return ta - tb;
      return (a.name || "").localeCompare(b.name || "", "ru");
    });

    return [...cat1, ...cat2, ...cat3];
  }, [allTasks, eligiblePeople, meId, mePerson]);

  const filteredPartners = useMemo(() => {
    const q = String(partnerQuery || "").trim().toLowerCase();
    const base = partnerListMode === "all" ? partnerOptions : matchingPartners;
    if (!q) return base;
    return base.filter((p) =>
      String(p.name || "").toLowerCase().includes(q)
    );
  }, [matchingPartners, partnerListMode, partnerOptions, partnerQuery]);

  const partners = (task.assignments || [])
    .filter((a) => a.personId !== assignment.personId)
    .map((a) => people.find((x) => x.id === a.personId)?.name)
    .filter(Boolean);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm md:text-base font-semibold text-slate-900 truncate">
                {task.title || "—"}
              </div>
              <span
                className={clsx(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium sm:px-2 sm:py-1 sm:text-xs",
                  st.pill
                )}
              >
                {st.label}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 sm:gap-2 sm:text-xs">
              <span className="rounded-full bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-200 sm:px-2 sm:py-1">
                Дата: {formatTaskDate(task.taskDate) || "—"}
              </span>
              <span className="rounded-full bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-200 sm:px-2 sm:py-1">
                Экспромт: {task.isImpromptu || "—"}
              </span>
              <span className="rounded-full bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-200 sm:px-2 sm:py-1">
                Номер задания: {task.taskNumber ?? "—"}
              </span>
              <span className="rounded-full bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-200 sm:px-2 sm:py-1">
                Ваша роль: {assignment.role || "—"}
              </span>
              <span className="rounded-full bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-200 sm:px-2 sm:py-1">
                Ситуация: {task.situation ? task.situation : "—"}
              </span>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-slate-500">Напарник</div>
              <div className="mt-1 text-sm text-slate-700">
                {partners.length ? partners.join(", ") : "Нет"}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex w-full flex-row items-center justify-end gap-2 sm:w-auto sm:flex-col sm:items-end">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={clsx(
                "rounded-2xl px-3 py-2 text-xs font-medium transition sm:text-sm",
                open
                  ? "bg-slate-900 text-white hover:opacity-90"
                  : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              )}
            >
              {open ? "Скрыть" : "Изменить"}
            </button>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="text-xs text-rose-600 hover:underline sm:text-sm"
              title="Убрать этого человека из задания"
            >
              Убрать из задания
            </button>
          </div>
        </div>
      </div>

      <div
        className={clsx(
          "border-t border-slate-200 bg-slate-50 transition-all duration-300",
          open
            ? "max-h-[85dvh] overflow-y-auto opacity-100"
            : "max-h-0 overflow-hidden opacity-0"
        )}
      >
        <div className="p-4 md:p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Labeled label="Задание">
              <Select
                value={task.title || TASK_TITLES[0]}
                onChange={(e) =>
                  onTaskChange((t) => ({ ...t, title: e.target.value }))
                }
              >
                {TASK_TITLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Labeled>

            <Labeled label="Дата">
              <Input
                type="date"
                value={toDateValue(task.taskDate)}
                onChange={(e) =>
                  onTaskChange((t) => ({ ...t, taskDate: e.target.value }))
                }
              />
            </Labeled>

            <Labeled label="Экспромт">
              <Select
                value={task.isImpromptu || "Нет"}
                onChange={(e) =>
                  onTaskChange((t) => ({ ...t, isImpromptu: e.target.value }))
                }
              >
                {YES_NO.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </Labeled>

            <Labeled label="Номер задания">
              <Input
                inputMode="numeric"
                value={task.taskNumber ?? ""}
                onChange={(e) =>
                  onTaskChange((t) => ({
                    ...t,
                    taskNumber: Number(e.target.value),
                  }))
                }
              />
            </Labeled>

            <Labeled label="Ситуация (необязательно)">
              <Select
                value={task.situation || ""}
                onChange={(e) =>
                  onTaskChange((t) => {
                    const v = e.target.value;
                    if (!v) return { ...t, situation: null };
                    return { ...t, situation: v };
                  })
                }
              >
                <option value="">—</option>
                {SITUATIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Labeled>

            <Labeled label="Роль">
              <Select
                value={assignment.role || "Проводящий"}
                onChange={(e) =>
                  onAssignmentChange((a) => ({ ...a, role: e.target.value }))
                }
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Labeled>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-medium text-slate-500">Напарник</div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:flex sm:flex-wrap sm:items-center sm:gap-5">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name={`partner-mode-${task.id}-${meId}`}
                    checked={partnerListMode === "all"}
                    onChange={() => setPartnerListMode("all")}
                  />
                  Показать всех
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name={`partner-mode-${task.id}-${meId}`}
                    checked={partnerListMode === "match"}
                    onChange={() => setPartnerListMode("match")}
                  />
                  Подходящие напарники
                </label>
              </div>

              <div ref={partnerWrapRef} className="mt-2 relative">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={partnerQuery}
                    onFocus={() => setPartnerListOpen(true)}
                    onChange={(e) => {
                      setPartnerQuery(e.target.value);
                      setPartnerListOpen(true);
                    }}
                    placeholder={partnerName || "Поиск напарника"}
                  />
                  {partnerId ? (
                    <button
                      type="button"
                      className="h-10 w-full rounded-2xl px-3 text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 sm:w-auto"
                      onClick={() => {
                        onTaskChange((t) => {
                          const base = Array.isArray(t.assignments)
                            ? t.assignments
                            : [];
                          const meAssignments = base.filter(
                            (a) => String(a.personId) === meId
                          );
                          return { ...t, assignments: meAssignments };
                        });
                        setPartnerQuery("");
                        setPartnerListOpen(false);
                      }}
                    >
                      Очистить
                    </button>
                  ) : null}
                </div>

                {partnerListOpen ? (
                  <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                    <div className="max-h-64 overflow-auto p-1">
                      {filteredPartners.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">
                          {partnerListMode === "match"
                            ? "Нет подходящих напарников"
                            : "Ничего не найдено"}
                        </div>
                      ) : (
                        filteredPartners.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={clsx(
                              "w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-slate-50",
                              String(partnerId) === String(p.id) ? "bg-slate-50" : ""
                            )}
                            onClick={() => {
                              const nextId = String(p.id || "");
                              onTaskChange((t) => {
                                const base = Array.isArray(t.assignments)
                                  ? t.assignments
                                  : [];
                                const meAssignments = base.filter(
                                  (a) => String(a.personId) === meId
                                );
                                const existing = base.find(
                                  (a) => String(a.personId) === nextId
                                );
                                const nextPartner = {
                                  ...(existing || partnerAssignment || {}),
                                  personId: nextId,
                                  role:
                                    (existing && existing.role) ||
                                    partnerRole ||
                                    "Помощник",
                                  status: (existing && existing.status) || "assigned",
                                };
                                return {
                                  ...t,
                                  assignments: [...meAssignments, nextPartner],
                                };
                              });
                              setPartnerQuery(p.name || "");
                              setPartnerListOpen(false);
                            }}
                          >
                            <div className="font-medium text-slate-900">{p.name}</div>
                            <div className="text-xs text-slate-500">
                              Группа: {p.groupNumber ?? "—"}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <Labeled label="Роль напарника">
              <Select
                value={partnerRole}
                disabled={!partnerId}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  if (!partnerId) return;
                  onTaskChange((t) => {
                    const base = Array.isArray(t.assignments)
                      ? t.assignments
                      : [];
                    const nextAssignments = base.map((a) => {
                      if (String(a.personId) !== partnerId) return a;
                      return { ...a, role: nextRole };
                    });
                    return { ...t, assignments: nextAssignments };
                  });
                }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Labeled>

            <Labeled label="Статус">
              <Select
                value={assignment.status || "assigned"}
                onChange={(e) =>
                  onAssignmentChange((a) => ({ ...a, status: e.target.value }))
                }
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Labeled>
          </div>
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 px-3 py-3 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[90dvh]">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="text-base font-semibold text-slate-900">
                Убрать человека из задания?
              </div>
            </div>
            <div className="p-5 text-sm text-slate-700">
              Действие нельзя отменить. Человек будет удален из этого задания.
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onRemove();
                }}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Убрать
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}




