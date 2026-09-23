"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { formatBytes } from "@/lib/utils";
import type { ProcessRow, ProcessesResponse } from "@/lib/types";

/* Task manager — which processes are costing the machine right now.
 *
 * Every column sorts both ways: click once for the heaviest first, again for
 * the lightest first. Unknown values (swap on macOS, disk I/O for processes
 * this user cannot read) always sink to the bottom whichever way the column
 * is sorted, so a column of dashes never pushes real numbers off the top.
 */

type Key = "name" | "pid" | "user" | "cpu" | "rss" | "swap" | "threads" | "ioRate";
type Dir = "asc" | "desc";

const COLS: { key: Key; label: string; title: string; numeric: boolean; hideMobile?: boolean }[] = [
  { key: "name", label: "Process", title: "Process name", numeric: false },
  { key: "cpu", label: "CPU", title: "Live CPU over the last half second, percent of one core (200% = two full cores)", numeric: true },
  { key: "rss", label: "Memory", title: "Resident memory (RAM actually held), with share of total RAM", numeric: true },
  { key: "swap", label: "Swap", title: "Memory of this process pushed out to swap", numeric: true },
  { key: "ioRate", label: "Disk I/O", title: "Disk read + write per second. A dash means the kernel does not let this user read it", numeric: true, hideMobile: true },
  { key: "threads", label: "Threads", title: "Thread count", numeric: true, hideMobile: true },
  { key: "user", label: "User", title: "Owning user", numeric: false, hideMobile: true },
  { key: "pid", label: "PID", title: "Process ID", numeric: true, hideMobile: true },
];

const DEFAULT_ROWS = 15;
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function TaskManager({ id }: { id?: string }) {
  const { data, isLoading } = useSWR<ProcessesResponse>("/api/processes", fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
    dedupingInterval: 2_000,
  });
  const [sort, setSort] = useState<{ key: Key; dir: Dir }>({ key: "cpu", dir: "desc" });
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.rows ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.command.toLowerCase().includes(q) || r.user.toLowerCase().includes(q) || String(r.pid) === q,
    );
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sort.key] as ProcessRow[Key];
      const bv = b[sort.key] as ProcessRow[Key];
      if (av == null && bv == null) return a.pid - b.pid;
      if (av == null) return 1;
      if (bv == null) return -1;
      const c = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return c !== 0 ? c * sign : a.pid - b.pid;
    });
  }, [data, sort, query]);

  const shown = all ? rows : rows.slice(0, DEFAULT_ROWS);
  const totals = useMemo(() => {
    const r = data?.rows ?? [];
    return {
      cpu: r.reduce((s, x) => s + x.cpu, 0),
      rss: r.reduce((s, x) => s + x.rss, 0),
      swap: r.reduce((s, x) => s + (x.swap ?? 0), 0),
    };
  }, [data]);

  const onSort = (key: Key, numeric: boolean) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: numeric ? "desc" : "asc" }));

  return (
    <section id={id} className="card-static overflow-hidden scroll-mt-16 md:scroll-mt-4">
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-elevated">
        <span className="section-label">Task Manager</span>
        {data?.ok && (
          <span className="text-[10px] text-txt-muted data-value">
            {data.rows.length} processes · CPU {totals.cpu.toFixed(0)}% of {(data.cores ?? 1) * 100}% · RAM {formatBytes(totals.rss)} · swap {formatBytes(totals.swap)}
            {data.source === "ps" && " · lifetime CPU averages (no /proc)"}
            {query.trim() && (
              <span className="text-accent"> · {rows.length} match{rows.length === 1 ? "" : "es"} (name, command, user or PID)</span>
            )}
          </span>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, command, user or PID"
          aria-label="Filter processes"
          className="ml-auto w-full sm:w-64 bg-surface-card border border-line-dim rounded px-2.5 py-1 text-[11px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent"
        />
      </div>

      <div className={clsx("overflow-auto", all && "max-h-[560px]")}>
        <table className="w-full text-left min-w-[340px]">
          <thead className="sticky top-0 z-[1]">
            <tr className="border-b border-line-dim">
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={clsx(
                      "p-0 bg-surface-elevated",
                      c.numeric && "text-right",
                      c.hideMobile && "hidden md:table-cell",
                    )}
                  >
                    <button
                      type="button"
                      title={c.title}
                      onClick={() => onSort(c.key, c.numeric)}
                      className={clsx(
                        "w-full px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1",
                        c.numeric ? "justify-end" : "justify-start",
                        active ? "text-accent" : "text-txt-muted hover:text-txt-primary",
                      )}
                    >
                      {c.label}
                      <span aria-hidden className={clsx("text-[9px] w-2", !active && "opacity-0")}>
                        {sort.dir === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length > 0 ? (
              shown.map((p) => (
                <tr key={p.pid} className="border-b border-line-dim last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="px-3 py-1.5 max-w-[220px]">
                    <div className="text-xs font-semibold text-txt-primary truncate" title={p.command}>{p.name}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={clsx("data-value text-xs font-semibold", heat(p.cpu, 50, 20))}>{p.cpu.toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <span className={clsx("data-value text-xs font-semibold", heat(p.memPct, 20, 8))}>{formatBytes(p.rss)}</span>
                    <span className="data-value text-[10px] text-txt-muted ml-1.5">{p.memPct.toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={clsx("data-value text-xs", p.swap ? "text-warning font-semibold" : "text-txt-muted")}>
                      {p.swap == null ? "—" : p.swap === 0 ? "0" : formatBytes(p.swap)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right hidden md:table-cell">
                    <span className="data-value text-xs text-txt-secondary">{p.ioRate == null ? "—" : p.ioRate === 0 ? "0" : `${formatBytes(p.ioRate)}/s`}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right hidden md:table-cell data-value text-xs text-txt-muted">{p.threads ?? "—"}</td>
                  <td className="px-3 py-1.5 hidden md:table-cell text-[11px] text-txt-muted truncate max-w-[120px]">{p.user}</td>
                  <td className="px-3 py-1.5 text-right hidden md:table-cell data-value text-[11px] text-txt-muted">{p.pid}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-4 text-xs text-txt-muted">
                  {isLoading || !data ? "Sampling processes…" : !data.ok ? `Could not read processes: ${data.error ?? "unknown error"}` : "No process matches the filter"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > DEFAULT_ROWS && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full px-4 py-2 text-[11px] font-medium text-accent bg-surface-elevated hover:bg-surface-hover transition-colors border-t border-line-dim"
        >
          {all ? `Show top ${DEFAULT_ROWS}` : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

function heat(v: number, hot: number, warm: number) {
  return v > hot ? "text-danger" : v > warm ? "text-warning" : "text-txt-secondary";
}
