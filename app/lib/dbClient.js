export async function apiGetDb() {
  const res = await fetch("/api/db", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/db failed: ${res.status}`);
  return res.json();
}

export async function apiPutDb(db) {
  const res = await fetch("/api/db", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(db),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `PUT /api/db failed: ${res.status}`);
  }

  return res.json();
}

export async function apiCreatePerson(person) {
  const res = await fetch("/api/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(person),
  });

  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    throw new Error(json?.message || `POST /api/people failed: ${res.status}`);
  }
  return json?.person;
}

export async function apiUpdateTaskStatus(payload) {
  const res = await fetch("/api/tasks/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      err?.message || `POST /api/tasks/status failed: ${res.status}`
    );
  }

  return res.json();
}

export async function apiUpdatePerson(id, payload) {
  const res = await fetch(`/api/people/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `PUT /api/people/${id} failed: ${res.status}`);
  }

  return res.json();
}

export async function apiDeletePerson(id) {
  const safeId = String(id || "").trim();
  if (!safeId || safeId === "undefined" || safeId === "null") {
    throw new Error("INVALID_ID");
  }
  const res = await fetch(`/api/people?id=${encodeURIComponent(safeId)}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      err?.message || `DELETE /api/people?id=${safeId} failed: ${res.status}`
    );
  }

  return res.json();
}

export async function apiCreateTask(payload) {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `POST /api/tasks failed: ${res.status}`);
  }

  return res.json();
}

export async function apiUpdateTask(taskId, payload) {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `PUT /api/tasks/${taskId} failed: ${res.status}`);
  }

  return res.json();
}

export async function apiDeleteTask(taskId) {
  if (!taskId || taskId === "undefined" || taskId === "null") {
    return { ok: false, message: "INVALID_ID" };
  }
  const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `DELETE /api/tasks/${taskId} failed: ${res.status}`);
  }

  return res.json();
}
