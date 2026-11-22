"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, fmt, input, patch, card, Fld, Delivery, Preview, usePoll, Badge, Progress } from "../../lib";

const pick = (c) => ({ name: c.name, account_id: c.account_id, subject: c.subject, delay: c.delay, reply_to: c.reply_to, cc: c.cc, bcc: c.bcc, template: c.template });
const norm = (o) => JSON.stringify({ ...o, delay: Number(o.delay), account_id: Number(o.account_id) });

export default function CampaignPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: c, error, reload } = usePoll(() => api(`/campaigns/${id}`), 2000);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(null);
  const [csv, setCsv] = useState(null);
  const [mode, setMode] = useState("add");
  const [note, setNote] = useState({ ok: "", err: "" });
  const [busy, setBusy] = useState(false);
  const prev = useRef(null);
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => { api("/accounts").then(setAccounts).catch(() => {}); }, []);
  // Load the editable copy once; polling must never overwrite what the user is typing.
  useEffect(() => { if (c && !form) setForm(pick(c)); }, [c, form]);

  useEffect(() => {
    if (!c) return;
    if (prev.current === "running" && c.status !== "running" && "Notification" in window && Notification.permission === "granted") {
      new Notification("SireMailer", { body: c.status === "done" ? `${c.name} finished: ${c.sent} sent, ${c.failed} failed` : `${c.name} paused at ${c.sent} of ${c.total}` });
    }
    prev.current = c.status;
  }, [c]);

  async function act(path, opts = { method: "POST" }, okMsg = "") {
    setBusy(true); setNote({ ok: "", err: "" });
    try {
      await api(`/campaigns/${id}${path}`, opts);
      if (path === "/start" && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
      setNote({ ok: okMsg, err: "" });
      await reload();
    } catch (e) { setNote({ ok: "", err: e.message }); }
    setBusy(false);
  }

  async function save() {
    setBusy(true); setNote({ ok: "", err: "" });
    try {
      await api(`/campaigns/${id}`, patch(form));
      await reload();
      setNote({ ok: "Changes saved. The next mails sent will use them.", err: "" });
    } catch (e) { setNote({ ok: "", err: e.message }); }
    setBusy(false);
  }

  async function uploadCsv(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData();
    fd.append("csv", csv); fd.append("mode", mode);
    setBusy(true); setNote({ ok: "", err: "" });
    try {
      const r = await api(`/campaigns/${id}/recipients`, { method: "POST", body: fd });
      const s = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
      setNote({ ok: `Added ${s(r.added, "new contact")}${r.removed ? `, removed ${s(r.removed, "unsent contact")}` : ""}. ${r.existing} already in the campaign, ${s(r.skipped, "row")} skipped as invalid or duplicate.`, err: "" });
      setCsv(null); formEl.reset();
      await reload();
    } catch (er) { setNote({ ok: "", err: er.message }); }
    setBusy(false);
  }

  async function remove() {
    if (!confirm("Delete this campaign and its recipient list?")) return;
    try { await api(`/campaigns/${id}`, { method: "DELETE" }); router.push("/"); } catch (e) { setNote({ ok: "", err: e.message }); }
  }

  if (error && !c) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!c || !form) return null;

  const running = c.status === "running";
  const dirty = norm(form) !== norm(pick(c));
  const startLabel = c.status === "draft" ? "Start sending" : c.status === "paused" ? "Resume" : "Retry failed";
  const canStart = !running && (c.pending > 0 || c.failed > 0);
  const stats = [
    ["Sent", c.sent], ["Remaining", c.pending], ["Failed", c.failed],
    [c.status === "done" ? "Time taken" : "Time spent", fmt(c.active_seconds)],
    ...(running ? [["Time left", fmt(c.eta_seconds)]] : []),
  ];

  return (
    <main className="mx-auto max-w-[1600px] space-y-6">
      <Link href="/" className="text-sm text-slate-600 underline">Dashboard</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <Badge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">From {c.account_email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {running && <button disabled={busy} onClick={() => act("/pause")} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">Pause</button>}
          {canStart && <button disabled={busy || dirty} title={dirty ? "Save your changes first" : ""} onClick={() => act("/start")} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{startLabel}</button>}
          {!running && <button disabled={busy || dirty} title={dirty ? "Save your changes first" : ""} onClick={() => act("/test", { method: "POST" }, `Test mail sent to ${c.account_email}. Check the inbox and spam folder.`)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Send test to myself</button>}
          {!running && <button onClick={remove} className="px-2 text-sm text-red-700 underline">Delete</button>}
        </div>
      </div>

      {note.err && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{note.err}</p>}
      {note.ok && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{note.ok}</p>}
      {c.message && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{c.message}</p>}
      {c.status === "done" && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">Finished: {c.sent} of {c.total} mails sent in {fmt(c.active_seconds)} of sending time.{c.failed ? " Use Retry failed to try the rest again." : ""}</p>}

      <section className={card} aria-live="polite">
        <Progress c={c} tall />
        <p className="mt-2 text-sm text-slate-600">{running ? `Now sending to ${c.current ?? "..."}` : `${c.total} recipients in total`}</p>
        <dl className="mt-4 grid grid-cols-2 divide-x divide-slate-100 text-center sm:grid-cols-5">
          {stats.map(([label, v]) => (
            <div key={label} className="px-2 py-1"><dd className="text-2xl font-semibold tabular-nums">{v}</dd><dt className="text-xs text-slate-500">{label}</dt></div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <fieldset disabled={running} className="m-0 min-w-0 space-y-6 border-0 p-0">
          {running && <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">Pause the campaign to edit it.</p>}

          <section className={`grid gap-4 sm:grid-cols-2 ${card}`}>
            <h2 className="text-sm font-semibold sm:col-span-2">Campaign details</h2>
            <Fld label="Campaign name" className="sm:col-span-2">
              <input className={input} value={form.name} onChange={set("name")} />
            </Fld>
            <Fld label="Send from" hint="Changing the sender applies to mails not yet sent.">
              <select className={input} value={form.account_id} onChange={set("account_id")}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select>
            </Fld>
            <Fld label="Seconds between mails">
              <input type="number" min="2" max="120" className={input} value={form.delay} onChange={set("delay")} />
            </Fld>
            <Fld label="Subject" className="sm:col-span-2" hint="Variables work here too, like {{first_name}}.">
              <input className={input} value={form.subject} onChange={set("subject")} />
            </Fld>
            <Delivery form={form} set={set} />
          </section>

          <section className={`space-y-3 ${card}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">HTML template</h2>
              <label className="cursor-pointer text-sm underline">
                Load .html file
                <input type="file" accept=".html,.htm" className="hidden" onChange={(e) => e.target.files[0]?.text().then((t) => setForm((s) => ({ ...s, template: t })))} />
              </label>
            </div>
            <textarea rows={18} spellCheck={false} className={`${input} font-mono text-xs`} value={form.template} onChange={set("template")} />
            <p className="text-xs text-slate-500">Variables: {"{{name}}"}, {"{{first_name}}"}, {"{{email}}"}. The preview updates as you type.</p>
          </section>

          <form onSubmit={uploadCsv} className={`space-y-3 ${card}`}>
            <h2 className="text-sm font-semibold">Recipients</h2>
            <p className="text-sm text-slate-600">Upload a new CSV (name, email). Contacts already mailed are never sent to again.</p>
            <input required type="file" accept=".csv,text/csv" onChange={(e) => setCsv(e.target.files[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-medium" />
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2"><input type="radio" name="mode" className="mt-1" checked={mode === "add"} onChange={() => setMode("add")} /><span><b>Add new contacts</b><br /><span className="text-xs text-slate-500">Keeps everyone already in the campaign and adds addresses that are new.</span></span></label>
              <label className="flex items-start gap-2"><input type="radio" name="mode" className="mt-1" checked={mode === "replace"} onChange={() => setMode("replace")} /><span><b>Replace the unsent list</b><br /><span className="text-xs text-slate-500">Also removes contacts not yet mailed (pending or failed) that are missing from the new file.</span></span></label>
            </div>
            <button disabled={busy || !csv} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Upload CSV</button>
          </form>

          <section className={`space-y-5 ${card}`}>
            <div>
              <h2 className="mb-2 text-sm font-semibold">Recently sent</h2>
              {c.recent.length === 0 && <p className="text-sm text-slate-500">Nothing sent yet.</p>}
              <ul className="space-y-1 text-sm text-slate-600">
                {c.recent.map((r) => <li key={r.email} className="flex justify-between gap-3"><span className="truncate">{r.email}</span><span className="text-xs text-slate-400">{new Date(r.sent_at * 1000).toLocaleTimeString()}</span></li>)}
              </ul>
            </div>
            {c.failures.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold">Failed ({c.failed})</h2>
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
                  {c.failures.map((r) => <li key={r.email}>{r.email}: {r.error}</li>)}
                </ul>
              </div>
            )}
          </section>

          {dirty && (
            <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg bg-slate-900 p-3 text-sm text-white shadow-lg">
              <span>You have unsaved changes.</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => setForm(pick(c))} className="rounded-md px-3 py-1.5 hover:bg-slate-700">Discard</button>
                <button type="button" disabled={busy} onClick={save} className="rounded-md bg-amber-400 px-4 py-1.5 font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50">Save changes</button>
              </span>
            </div>
          )}
        </fieldset>

        <Preview template={form.template} subject={form.subject} className="h-[75vh] xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]" />
      </div>
    </main>
  );
}