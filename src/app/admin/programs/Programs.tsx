"use client";

import { useState } from "react";
import type { ProgramDTO } from "@/lib/programs";
import { useApi, useToast } from "@/components/Toast";
import { Empty, Icon, Panel } from "@/components/ui";

type Row = { id?: string; title: string };

export function Programs({ initial }: { initial: ProgramDTO[] }) {
  const api = useApi();
  const toast = useToast();
  const [programs, setPrograms] = useState(initial);
  const [name, setName] = useState("");
  const [titles, setTitles] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const p = await api<ProgramDTO>("/api/programs", { method: "POST", json: { name, titles: titles.split("\n") } });
    setBusy(false);
    if (!p) return;
    setPrograms((ps) => [...ps, p].sort((a, b) => a.name.localeCompare(b.name)));
    setName(""); setTitles("");
    toast("Program created.", "ok");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Panel title="New program">
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="pname">Name</label>
            <input id="pname" className="input" placeholder="e.g. Financial Literacy - L1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ptitles">Sessions, one per line</label>
            <textarea id="ptitles" className="input min-h-36 font-mono text-xs" placeholder={"Orientation\nBudgeting\nBanking"} value={titles} onChange={(e) => setTitles(e.target.value)} />
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy || !name.trim() || !titles.trim()} onClick={create}>Create program</button>
        </div>
      </Panel>

      <div className="space-y-4">
        {programs.length === 0 && <Empty>No programs yet. Create one on the left.</Empty>}
        {programs.map((p) => (
          <Editor key={p.id} program={p} onSaved={(np) => setPrograms((ps) => ps.map((x) => (x.id === np.id ? np : x)))} onDeleted={() => setPrograms((ps) => ps.filter((x) => x.id !== p.id))} />
        ))}
      </div>
    </div>
  );
}

function Editor({ program, onSaved, onDeleted }: { program: ProgramDTO; onSaved: (p: ProgramDTO) => void; onDeleted: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [name, setName] = useState(program.name);
  const [rows, setRows] = useState<Row[]>(program.sessions.map((s) => ({ id: s.id, title: s.title })));
  const [busy, setBusy] = useState(false);
  const dirty = name !== program.name || JSON.stringify(rows) !== JSON.stringify(program.sessions.map((s) => ({ id: s.id, title: s.title })));

  const set = (i: number, title: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, title } : x)));
  const move = (i: number, dir: -1 | 1) => setRows((r) => { const n = [...r]; const j = i + dir; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save() {
    setBusy(true);
    const p = await api<ProgramDTO>(`/api/programs/${program.id}`, { method: "PATCH", json: { name, sessions: rows } });
    setBusy(false);
    if (!p) return;
    onSaved(p);
    setRows(p.sessions.map((s) => ({ id: s.id, title: s.title })));
    toast("Program saved.", "ok");
  }
  async function remove() {
    if (!confirm(`Delete "${program.name}"?`)) return;
    if (await api(`/api/programs/${program.id}`, { method: "DELETE" })) { toast("Program deleted.", "ok"); onDeleted(); }
  }

  return (
    <Panel
      title={<input className="input py-1.5 font-semibold" value={name} onChange={(e) => setName(e.target.value)} aria-label="Program name" />}
      badge={<span className="pill bg-neutral-100 text-neutral-600">{program._count.students} enrolled</span>}
      action={
        <span className="flex gap-2">
          <button type="button" className="btn-danger px-3 py-1.5 text-xs" onClick={remove}>Delete</button>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </span>
      }
    >
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="flex items-center gap-2">
            <span className="w-7 font-mono text-xs text-neutral-400">{String(i + 1).padStart(2, "0")}</span>
            <input className="input" value={r.title} onChange={(e) => set(i, e.target.value)} placeholder="Session title" />
            <button type="button" className="btn-ghost px-2 py-1.5 text-xs" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn-ghost px-2 py-1.5 text-xs" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn-danger px-2 py-1.5 text-xs" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove">×</button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-ghost mt-3 text-xs" onClick={() => setRows((r) => [...r, { title: "" }])}><Icon name="plus" className="size-3.5" /> Add session</button>
    </Panel>
  );
}
