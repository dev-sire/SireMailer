"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, fmt, usePoll, Badge, Progress } from "../../lib";

const VARS = { name: "Ayesha Khan", first_name: "Ayesha", email: "ayesha@example.com" };

export default function CampaignPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: c, error, reload } = usePoll(() => api(`/campaigns/${id}`), 2000);
  const [note, setNote] = useState({ ok: "", err: "" });
  const [busy, setBusy] = useState(false);
  const prev = useRef(null);

  // Browser notification when a running campaign stops.
  useEffect(() => {
    if (!c) return;
    if (prev.current === "running" && c.status !== "running" && "Notification" in window && Notification.permission === "granted") {
      new Notification("Sire Mailer", { body: c.status === "done" ? `${c.name} finished: ${c.sent} sent, ${c.failed} failed` : `${c.name} paused at ${c.sent} of ${c.total}` });
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

  async function remove() {
    if (!confirm("Delete this campaign and its recipient list?")) return;
    try { await api(`/campaigns/${id}`, { method: "DELETE" }); router.push("/"); } catch (e) { setNote({ ok: "", err: e.message }); }
  }

  if (error && !c) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!c) return null;

  const running = c.status === "running";
  const startLabel = c.status === "draft" ? "Start sending" : c.status === "paused" ? "Resume" : "Retry failed";
  const canStart = !running && (c.pending > 0 || c.failed > 0);
  const preview = c.template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => VARS[k.toLowerCase()] ?? "");
  const stats = [
    ["Sent", c.sent], ["Remaining", c.pending], ["Failed", c.failed],
    [c.status === "done" ? "Time taken" : "Time spent", fmt(c.active_seconds)],
    ...(running ? [["Time left", fmt(c.eta_seconds)]] : []),
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <Link href="/" className="text-sm text-slate-600 underline">Dashboard</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <Badge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">From {c.account_email}. Subject: {c.subject}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {running && <button disabled={busy} onClick={() => act("/pause")} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">Pause</button>}
          {canStart && <button disabled={busy} onClick={() => act("/start")} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{startLabel}</button>}
          {!running && <button disabled={busy} onClick={() => act("/test", { method: "POST" }, `Test mail sent to ${c.account_email}. Check the inbox and spam folder.`)} className="rounded-md cursor-pointer border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Send test to myself</button>}
          {!running && <button onClick={remove} className="cursor-pointer px-2 text-sm text-red-700 underline">Delete</button>}
        </div>
      </div>

      {note.err && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{note.err}</p>}
      {note.ok && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{note.ok}</p>}
      {c.message && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{c.message}</p>}
      {c.status === "done" && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">Finished: {c.sent} of {c.total} mails sent in {fmt(c.active_seconds)} of sending time.{c.failed ? " Use Retry failed to try the rest again." : ""}</p>}

      <section className="rounded-lg bg-white p-5 shadow-sm" aria-live="polite">
        <Progress c={c} tall />
        <p className="mt-2 text-sm text-slate-600">{running ? `Now sending to ${c.current ?? "..."}` : `${c.total} recipients in total`}</p>
        <dl className="mt-4 grid grid-cols-2 divide-x divide-slate-100 text-center sm:grid-cols-5">
          {stats.map(([label, v]) => (
            <div key={label} className="px-2 py-1"><dd className="text-2xl font-semibold tabular-nums">{v}</dd><dt className="text-xs text-slate-500">{label}</dt></div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Template preview</h2>
          <iframe title="Template preview" sandbox="" srcDoc={preview} className="h-80 w-full rounded-md border border-slate-200" />
        </section>
        <section className="space-y-5 rounded-lg bg-white p-5 shadow-sm">
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
      </div>
    </main>
  );
}
