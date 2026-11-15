"use client";
import { useState } from "react";
import { api, post, input, usePoll } from "../lib";

export default function Senders() {
  const { data, reload } = usePoll(() => api("/accounts"), 10000);
  const [f, setF] = useState({ email: "", password: "", sender_name: "", daily_limit: 450 });
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg({ ok: "", err: "" });
    try {
      await api("/accounts", post(f));
      setMsg({ ok: `Saved ${f.email}. The password is stored encrypted.`, err: "" });
      setF({ email: "", password: "", sender_name: "", daily_limit: 450 });
      reload();
    } catch (er) { setMsg({ ok: "", err: er.message }); }
    setBusy(false);
  }

  async function remove(a) {
    if (!confirm(`Remove ${a.email}?`)) return;
    try { await api(`/accounts/${a.id}`, { method: "DELETE" }); reload(); } catch (er) { setMsg({ ok: "", err: er.message }); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Senders</h1>

      <section className="rounded-lg bg-white shadow-sm">
        {data?.length === 0 && <p className="p-6 text-sm text-slate-600">No senders yet. Add a Gmail account below.</p>}
        <ul className="divide-y divide-slate-100">
          {data?.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.email}</p>
                <p className="text-xs text-slate-500">{a.sender_name || "No display name"} · limit {a.daily_limit} mails per 24 hours · {a.campaigns} campaigns</p>
              </div>
              <button onClick={() => remove(a)} className="cursor-pointer text-sm text-red-700 underline">Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={save} className="grid gap-4 rounded-lg bg-white p-5 shadow-sm sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Add or update a sender</h2>
        <label className="block text-sm font-medium">Gmail address
          <input required type="email" className={`${input} mt-1`} value={f.email} onChange={set("email")} />
        </label>
        <label className="block text-sm font-medium">App password
          <input required type="password" autoComplete="off" className={`${input} mt-1`} value={f.password} onChange={set("password")} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Create one at myaccount.google.com/apppasswords. 2-Step Verification must be on.</span>
        </label>
        <label className="block text-sm font-medium">Display name
          <input className={`${input} mt-1`} value={f.sender_name} onChange={set("sender_name")} placeholder="NanoTechX" />
        </label>
        <label className="block text-sm font-medium">Daily limit
          <input type="number" min="1" className={`${input} mt-1`} value={f.daily_limit} onChange={set("daily_limit")} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Sending pauses here. Gmail allows about 500 a day, Workspace about 2,000.</span>
        </label>
        <div className="space-y-3 sm:col-span-2">
          {msg.err && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{msg.err}</p>}
          {msg.ok && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{msg.ok}</p>}
          <button disabled={busy} className="cursor-pointer rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {busy ? "Checking with Gmail..." : "Save sender"}
          </button>
        </div>
      </form>
    </main>
  );
}
