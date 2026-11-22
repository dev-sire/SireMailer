"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, input, card, Fld, Delivery, Preview, usePoll } from "../../lib";

const SAMPLE = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6">
  <h2>Hi {{first_name}},</h2>
  <p>Thank you for being part of our event. Here is what's next.</p>
  <p><a href="https://example.com">Read more</a></p>
</div>`;

export default function NewCampaign() {
  const router = useRouter();
  const { data: accounts } = usePoll(() => api("/accounts"), 60000);
  const [f, setF] = useState({ name: "", account_id: "", subject: "", delay: 5, reply_to: "", cc: "", bcc: "", template: SAMPLE });
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

  return (
    <main className="mx-auto max-w-[1600px]">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New campaign</h1>
      {accounts?.length === 0 && (
        <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">You need a sender first. <Link href="/senders" className="underline">Add a Gmail account</Link>.</p>
      )}
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0 space-y-5">
          <section className={`grid gap-4 sm:grid-cols-2 ${card}`}>
            <Fld label="Campaign name" className="sm:col-span-2">
              <input required className={input} value={f.name} onChange={set("name")} placeholder="Tech Tayari 2.0 announcement" />
            </Fld>
            <Fld label="Send from">
              <select className={input} value={f.account_id || accounts?.[0]?.id || ""} onChange={set("account_id")}>
                {accounts?.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select>
            </Fld>
            <Fld label="Seconds between mails">
              <input type="number" min="2" max="120" className={input} value={f.delay} onChange={set("delay")} />
            </Fld>
            <Fld label="Subject" className="sm:col-span-2" hint="Variables work here too, like {{first_name}}.">
              <input required className={input} value={f.subject} onChange={set("subject")} />
            </Fld>
            <Delivery form={f} set={set} />
          </section>

          <section className={card}>
            <Fld label="Recipients CSV" hint={`${rows != null ? `${rows} rows found. ` : ""}Columns must be named name and email. Invalid and duplicate addresses are skipped.`}>
              <input required type="file" accept=".csv,text/csv" onChange={pickCsv} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-medium" />
            </Fld>
          </section>

          <section className={`space-y-3 ${card}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">HTML template</span>
              <label className="cursor-pointer text-sm underline">
                Load .html file
                <input type="file" accept=".html,.htm" className="hidden" onChange={(e) => e.target.files[0]?.text().then((t) => setF((s) => ({ ...s, template: t })))} />
              </label>
            </div>
            <textarea required rows={16} spellCheck={false} className={`${input} font-mono text-xs`} value={f.template} onChange={set("template")} />
            <p className="text-xs text-slate-500">Variables: {"{{name}}"}, {"{{first_name}}"}, {"{{email}}"}</p>
          </section>

          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button disabled={busy || !accounts?.length} className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {busy ? "Creating..." : "Create campaign"}
          </button>
        </div>

        <Preview template={f.template} subject={f.subject} className="h-[75vh] xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]" />
      </form>
    </main>
  );
}