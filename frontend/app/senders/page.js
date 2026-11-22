"use client";
import { useRef, useState } from "react";
import { api, post, patch, input, card, Fld, usePoll } from "../lib";

const BLANK = { email: "", password: "", sender_name: "", daily_limit: 450 };

export default function Senders() {
  const { data, reload } = usePoll(() => api("/accounts"), 10000);
  const [f, setF] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function edit(a) {
    setEditing(a.id);
    setF({ email: a.email, password: "", sender_name: a.sender_name, daily_limit: a.daily_limit });
    setMsg({ ok: "", err: "" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancel() { setEditing(null); setF(BLANK); setMsg({ ok: "", err: "" }); }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg({ ok: "", err: "" });
    try {
      if (editing) await api(`/accounts/${editing}`, patch(f));
      else await api("/accounts", post(f));
      setMsg({ ok: `Saved ${f.email}.${f.password ? " The new password is stored encrypted." : ""}`, err: "" });
      setEditing(null); setF(BLANK);
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
            <li key={a.id} className={`flex items-center justify-between gap-4 p-4 ${editing === a.id ? "bg-slate-50" : ""}`}>
              <div className="min-w-0">
                <p className="truncate font-medium">{a.email}</p>
                <p className="text-xs text-slate-500">{a.sender_name || "No display name"} · limit {a.daily_limit} mails per 24 hours · {a.campaigns} campaigns</p>
              </div>
              <div className="flex shrink-0 gap-4 text-sm">
                <button onClick={() => edit(a)} className="underline">Edit</button>
                <button onClick={() => remove(a)} className="text-red-700 underline">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form ref={formRef} onSubmit={save} className={`grid gap-4 sm:grid-cols-2 ${card}`}>
        <h2 className="text-sm font-semibold sm:col-span-2">{editing ? "Edit sender" : "Add a sender"}</h2>
        <Fld label="Gmail address">
          <input required type="email" className={input} value={f.email} onChange={set("email")} />
        </Fld>
        <Fld label="App password" hint={editing ? "Leave blank to keep the current password. Required if you change the address." : "Create one at myaccount.google.com/apppasswords. 2-Step Verification must be on."}>
          <input required={!editing} type="password" autoComplete="off" className={input} value={f.password} onChange={set("password")} />
        </Fld>
        <Fld label="Display name">
          <input className={input} value={f.sender_name} onChange={set("sender_name")} placeholder="NanoTechX" />
        </Fld>
        <Fld label="Daily limit" hint="Sending pauses here. Gmail allows about 500 a day, Workspace about 2,000.">
          <input type="number" min="1" className={input} value={f.daily_limit} onChange={set("daily_limit")} />
        </Fld>
        <div className="space-y-3 sm:col-span-2">
          {msg.err && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{msg.err}</p>}
          {msg.ok && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{msg.ok}</p>}
          <div className="flex items-center gap-4">
            <button disabled={busy} className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy ? "Checking with Gmail..." : editing ? "Save changes" : "Save sender"}
            </button>
            {editing && <button type="button" onClick={cancel} className="text-sm underline">Cancel</button>}
          </div>
        </div>
      </form>
    </main>
  );
}