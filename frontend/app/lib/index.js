import { useEffect, useRef, useState } from "react";

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const post = (body) => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const patch = (body) => ({
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const card = "rounded-lg bg-white p-5 shadow-sm";

export function fmt(s) {
  if (s == null) return "-";
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${r}s` : `${r}s`;
}

export const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

export function usePoll(load, ms = 3000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const fn = useRef(load);
  fn.current = load;
  const run = async () => {
    try { setData(await fn.current()); setError(""); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    let on = true, t;
    const tick = async () => { await run(); if (on) t = setTimeout(tick, ms); };
    tick();
    return () => { on = false; clearTimeout(t); };
  }, [ms]);
  return { data, error, reload: run };
}

const BADGES = {
  draft: "bg-slate-200 text-slate-700",
  running: "bg-blue-100 text-blue-800",
  paused: "bg-amber-100 text-amber-900",
  done: "bg-emerald-100 text-emerald-800",
};

export function Badge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGES[status]}`}>
      {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />}
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

export function Progress({ c, tall }) {
  const pct = (n) => (c.total ? (n / c.total) * 100 : 0);
  return (
    <div className={`flex overflow-hidden rounded-full bg-slate-200 ${tall ? "h-3" : "h-2"}`}>
      <div className="bg-emerald-600 transition-all" style={{ width: `${pct(c.sent)}%` }} />
      <div className="bg-red-500 transition-all" style={{ width: `${pct(c.failed)}%` }} />
    </div>
  );
}

export function Fld({ label, hint, className = "", children }) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

// Reply-To, CC and BCC fields, shared by the new-campaign and campaign pages.
export function Delivery({ form, set }) {
  return (
    <>
      <Fld label="Reply-To (optional)" className="sm:col-span-2" hint="Replies go here instead of the sender address.">
        <input type="email" className={input} value={form.reply_to} onChange={set("reply_to")} placeholder="team@yourdomain.com" />
      </Fld>
      <Fld label="CC (optional)" hint="Separate several addresses with commas. Copied on every mail.">
        <input className={input} value={form.cc} onChange={set("cc")} />
      </Fld>
      <Fld label="BCC (optional)" hint="Hidden copy on every mail. CC and BCC count toward Gmail's daily limit.">
        <input className={input} value={form.bcc} onChange={set("bcc")} />
      </Fld>
    </>
  );
}

const SAMPLE = { name: "Ayesha Khan", first_name: "Ayesha", email: "ayesha@example.com" };
const fill = (t = "") => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => SAMPLE[k.toLowerCase()] ?? "");

// Large live preview. Renders unsaved edits, so changes can be reviewed before saving.
export function Preview({ template, subject, className = "" }) {
  const [mobile, setMobile] = useState(false);
  const tab = (on) => `rounded px-3 py-1 text-xs font-medium ${on ? "bg-white shadow-sm" : "text-slate-600"}`;
  return (
    <section className={`flex flex-col overflow-hidden rounded-lg bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Live preview as {SAMPLE.name}</p>
          <p className="truncate text-sm font-medium">{fill(subject) || "(no subject yet)"}</p>
        </div>
        <div className="flex shrink-0 rounded-md bg-slate-100 p-0.5">
          <button type="button" onClick={() => setMobile(false)} className={tab(!mobile)}>Desktop</button>
          <button type="button" onClick={() => setMobile(true)} className={tab(mobile)}>Mobile</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-slate-100 p-3">
        <iframe title="Template preview" sandbox="" srcDoc={fill(template)}
          className={`mx-auto block h-full w-full rounded bg-white transition-all ${mobile ? "max-w-[390px]" : ""}`} />
      </div>
    </section>
  );
}