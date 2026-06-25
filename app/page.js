"use client";

import { useEffect, useState } from "react";
import PeopleTable from "@/app/components/PeopleTable";
import { apiGetDb } from "@/app/lib/dbClient";

export default function Page() {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.8";
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) {
    return (
      <main className="p-3 sm:p-4 md:p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">
          Загрузка...
        </div>
      </main>
    );
  }

  if (!db) {
    return (
      <main className="p-3 sm:p-4 md:p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          Ошибка загрузки: {error || "db пустой"}
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-2 px-2 pb-4 pt-0 sm:px-4 sm:pb-6 md:px-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          {error ? (
            <div className="mt-2 text-sm text-rose-700">Ошибка: {error}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Версия:{" "}
            <span className="font-medium text-slate-900">{appVersion}</span>
          </div>
        </div>
      </header>

      <PeopleTable initialPeople={db.people || []} tasks={db.tasks || []} />
    </main>
  );
}
