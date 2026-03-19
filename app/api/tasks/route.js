import { getSql } from "@/app/lib/neon";

export const runtime = "nodejs";

function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ROLE_CONDUCTOR = "\u041f\u0440\u043e\u0432\u043e\u0434\u044f\u0449\u0438\u0439";
const ROLE_ASSISTANT = "\u041f\u043e\u043c\u043e\u0449\u043d\u0438\u043a";

function garbleUtf8AsWin1251(value, passes = 1) {
  let out = String(value || "");
  for (let i = 0; i < passes; i += 1) {
    out = new TextDecoder("windows-1251").decode(Buffer.from(out, "utf8"));
  }
  return out;
}

function isRoleMatch(role, expected) {
  const value = String(role || "");
  if (!value) return false;
  return (
    value === expected ||
    value === garbleUtf8AsWin1251(expected, 1) ||
    value === garbleUtf8AsWin1251(expected, 2)
  );
}

function isConductorRole(role) {
  return isRoleMatch(role, ROLE_CONDUCTOR);
}

function isAssistantRole(role) {
  return isRoleMatch(role, ROLE_ASSISTANT);
}
export async function POST(req) {
  const body = await req.json().catch(() => null);
  const assignments = Array.isArray(body?.assignments)
    ? body.assignments
    : body?.assignments
    ? [body.assignments]
    : [];
  const hasAssignments = assignments.length > 0;
  const conductor = assignments.find((a) => isConductorRole(a.role));
  const assistant = assignments.find((a) => isAssistantRole(a.role));
  const conductorId = hasAssignments ? conductor?.personId : body?.conductorId;
  const assistantId = hasAssignments
    ? assistant?.personId || null
    : body?.assistantId || null;
  const status =
    body?.status || conductor?.status || assistant?.status || "assigned";

  const taskDate = normalizeDateOnly(body?.taskDate);
  if (!body?.id || !taskDate || (!conductorId && !assistantId)) {
    return Response.json({ message: "INVALID_DATA" }, { status: 400 });
  }

  const sql = getSql();
  await sql`
    insert into tasks (
      id, task_date, title, situation, is_impromptu, task_number,
      status, conductor_id, assistant_id
    ) values (
      ${body.id},
      ${taskDate},
      ${body.title || ""},
      ${body.situation ?? null},
      ${body.isImpromptu || "\u041d\u0435\u0442"},
      ${Number(body.taskNumber) || 0},
      ${status},
      ${conductorId},
      ${assistantId}
    )
  `;

  return Response.json({ ok: true });
}
