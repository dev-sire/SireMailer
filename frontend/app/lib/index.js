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
