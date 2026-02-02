import { getSql } from "@/app/lib/neon";

export const runtime = "nodejs";

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const name = normalizeName(body?.name);
  if (!name) {
    return Response.json({ message: "NAME_REQUIRED" }, { status: 400 });
  }

  const sql = getSql();
  const exists = await sql`
    select 1 from people where lower(name) = lower(${name}) limit 1
  `;
  if (exists.length) {
    return Response.json({ message: "DUPLICATE_NAME" }, { status: 400 });
  }

  const maxRow =
    await sql`select max(cast(substring(id from 3) as integer)) as max_id from people`;
  const next = Number(maxRow[0]?.max_id || 0) + 1;
  const id = `p_${String(next).padStart(3, "0")}`;

  const gender = body?.gender === "Ж" ? "Ж" : "М";
  const groupNumber = Number(body?.groupNumber) || 1;
  const studyStatus = body?.studyStatus === "Да" ? "Да" : "Нет";
  const impromptuStatus = body?.impromptuStatus === "Да" ? "Да" : "Нет";
  const limitationsStatus =
    body?.limitationsStatus === "Да" ? "Да" : "Нет";
  const participationStatus =
    body?.participationStatus === "Да" ? "Да" : "Нет";
  const notes = body?.notes || "";

  const row = {
    id,
    name,
    gender,
    groupNumber,
    studyStatus,
    impromptuStatus,
    limitationsStatus,
    participationStatus,
    notes,
  };

  await sql`
    insert into people (
      id, name, gender, group_number, study_status, impromptu_status,
      limitations_status, participation_status, notes
    ) values (
      ${row.id},
      ${row.name},
      ${row.gender},
      ${row.groupNumber},
      ${row.studyStatus},
      ${row.impromptuStatus},
      ${row.limitationsStatus},
      ${row.participationStatus},
      ${row.notes}
    )
  `;

  return Response.json({ person: row });
}

export async function DELETE(req) {
  const url = new URL(req.url);
  const queryId = url.searchParams.get("id");
  const body = await req.json().catch(() => null);
  const personId = String(queryId || body?.id || "").trim();

  if (!personId) {
    return Response.json({ message: "INVALID_ID" }, { status: 400 });
  }

  const sql = getSql();
  await sql`begin`;
  try {
    await sql`
      delete from tasks
      where conductor_id = ${personId} or assistant_id = ${personId}
    `;
    await sql`delete from people where id = ${personId}`;
    await sql`commit`;
  } catch (e) {
    await sql`rollback`;
    throw e;
  }

  return Response.json({ ok: true });
}
