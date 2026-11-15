"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, input, usePoll } from "../../lib";

const SAMPLE = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6">
  <h2>Hi {{first_name}},</h2>
  <p>Thank you for being part of our event. Here is what's next.</p>
  <p><a href="https://example.com">Read more</a></p>
</div>`;
const VARS = { name: "Ayesha Khan", first_name: "Ayesha", email: "ayesha@example.com" };

export default function NewCampaign() {
  const router = useRouter();
  const { data: accounts } = usePoll(() => api("/accounts"), 60000);
  const [f, setF] = useState({ name: "", account_id: "", subject: "", delay: 5, template: SAMPLE });
  const [csv, setCsv] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function pickCsv(e) {
    const file = e.target.files[0];
    setCsv(file || null);
    setRows(file ? Math.max(0, (await file.text()).split(/\r?\n/).filter((l) => l.trim()).length - 1) : null);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData();
    Object.entries({ ...f, account_id: f.account_id || accounts?.[0]?.id }).forEach(([k, v]) => fd.append(k, v));
    fd.append("csv", csv);
    try {
      const r = await api("/campaigns", { method: "POST", body: fd });
      router.push(`/campaigns/${r.id}`);
    } catch (er) { setError(er.message); setBusy(false); }
  }

  const preview = f.template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => VARS[k.toLowerCase()] ?? "");

  return (
    <main className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New campaign</h1>
      {accounts?.length === 0 && (
        <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">You need a sender first. <Link href="/senders" className="underline">Add a Gmail account</Link>.</p>
      )}
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="grid gap-4 rounded-lg bg-white p-5 shadow-sm sm:grid-cols-2">
            <label className="block text-sm font-medium sm:col-span-2">Campaign name
              <input required className={`${input} mt-1`} value={f.name} onChange={set("name")} placeholder="Tech Tayari 2.0 announcement" />
            </label>
            <label className="block text-sm font-medium">Send from
              <select className={`${input} mt-1`} value={f.account_id || accounts?.[0]?.id || ""} onChange={set("account_id")}>
                {accounts?.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">Seconds between mails
              <input type="number" min="2" max="120" className={`${input} mt-1`} value={f.delay} onChange={set("delay")} />
            </label>
            <label className="block text-sm font-medium sm:col-span-2">Subject
              <input required className={`${input} mt-1`} value={f.subject} onChange={set("subject")} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Variables work here too, like {"{{first_name}}"}.</span>
            </label>
          </section>

          <section className="space-y-3 rounded-lg bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium">Recipients CSV
              <input required type="file" accept=".csv,text/csv" onChange={pickCsv} className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-medium" />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                {rows != null ? `${rows} rows found. ` : ""}Columns must be named name and email. Invalid and duplicate addresses are skipped.
              </span>
            </label>
          </section>

          <section className="space-y-3 rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">HTML template</span>
              <label className="cursor-pointer text-sm underline">
                Load .html file
                <input type="file" accept=".html,.htm" className="hidden" onChange={(e) => e.target.files[0]?.text().then((t) => setF((s) => ({ ...s, template: t })))} />
              </label>
            </div>
            <textarea required rows={12} spellCheck={false} className={`${input} font-mono text-xs`} value={f.template} onChange={set("template")} />
            <p className="text-xs text-slate-500">Variables: {"{{name}}"}, {"{{first_name}}"}, {"{{email}}"}</p>
          </section>

          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button disabled={busy || !accounts?.length} className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 cursor-pointer">
            {busy ? "Creating..." : "Create campaign"}
          </button>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <section className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">Template preview</h2>
            <iframe title="Template preview" sandbox="" srcDoc={preview} className="h-96 w-full rounded-md border border-slate-200" />
          </section>
        </aside>
      </form>
    </main>
  );
}
