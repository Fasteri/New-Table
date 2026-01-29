async function getTauriCore() {
  const core = await import("@tauri-apps/api/core");
  return core;
}

export async function apiGetDb() {
  const core = await getTauriCore();
  if (core.isTauri()) return core.invoke("get_db");
  const res = await fetch("/api/db", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/db failed: ${res.status}`);
  return res.json();
}

export async function apiPutDb(db) {
  const core = await getTauriCore();
  if (core.isTauri()) return core.invoke("put_db", { db });
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
  const core = await getTauriCore();
  if (core.isTauri()) return core.invoke("create_person", { person });
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

export async function openDataDir() {
  const core = await getTauriCore();
  if (core.isTauri()) {
    try {
      return await core.invoke("open_data_dir");
    } catch (e) {
      alert(String(e?.message || e));
      return null;
    }
  }
  alert("Открытие папки доступно только в приложении (Tauri не найден).");
  return null;
}
