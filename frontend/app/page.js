"use client";
import Link from "next/link";
import { api, fmt, usePoll, Badge, Progress } from "./lib";

export default function Dashboard() {
  const { data, error } = usePoll(() => api("/campaigns"));
  const cs = data?.campaigns ?? [];
  const sum = (k) => cs.reduce((n, c) => n + c[k], 0);
  const stats = [
    ["Campaigns", cs.length],
    ["Mails sent", sum("sent")],
    ["Waiting to send", sum("pending")],
    ["Sent in the last 24 hours", data?.sent_24h ?? 0],
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Link href="/campaigns/new" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">New campaign</Link>
      </div>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">Cannot reach the backend: {error}</p>}

      <dl className="grid grid-cols-2 divide-x divide-slate-200 rounded-lg bg-white shadow-sm lg:grid-cols-4">
        {stats.map(([label, n]) => (
          <div key={label} className="p-5">
            <dd className="text-3xl font-semibold tabular-nums">{n}</dd>
            <dt className="mt-1 text-sm text-slate-500">{label}</dt>
          </div>
        ))}
      </dl>

      <section className="rounded-lg bg-white shadow-sm">
        {data && cs.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-600">
            No campaigns yet. <Link href="/senders" className="underline">Add a sender</Link>, then <Link href="/campaigns/new" className="underline">create your first campaign</Link>.
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {cs.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`} className="grid items-center gap-3 p-5 hover:bg-slate-50 md:grid-cols-[1.2fr_2fr_auto]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-slate-500">{c.account_email}</p>
                </div>
                <div>
                  <Progress c={c} />
                  <p className="mt-1.5 text-xs text-slate-600 tabular-nums">
                    {c.sent} of {c.total} sent{c.failed ? `, ${c.failed} failed` : ""} · {c.status === "running" ? `${fmt(c.eta_seconds)} left` : c.status === "done" ? `finished in ${fmt(c.active_seconds)}` : c.active_seconds ? `${fmt(c.active_seconds)} spent so far` : "not started"}
                  </p>
                </div>
                <Badge status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
