import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/common/Toast';
import {
  applyApi, ApplyApiError, blobUrl, factKeyFor, resumeFilePath, screenshotPath,
  type AgentTaskT, type ApplicationItemT, type BoardInfoT, type ResumeT, type SearchConfigT,
} from '../lib/applyApi';

type Section = 'resume' | 'sources' | 'review' | 'gate' | 'history';

const panel = 'glass-panel p-5 rounded-2xl border border-gray-800';
const btn = 'px-3 py-2 rounded-xl text-xs font-semibold border transition disabled:opacity-40';
const btnPrimary = `${btn} bg-brand-500/20 border-brand-500/40 text-brand-200 hover:bg-brand-500/30`;
const btnGhost = `${btn} border-gray-700 text-gray-300 hover:bg-gray-800`;
const input = 'bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-200 focus:outline-none w-full';

async function openFile(path: string) {
  window.open(await blobUrl(path), '_blank', 'noopener');
}

/** The apply engine, end to end, against the real API. No demo data. */
export const ApplyPipelineView: React.FC = () => {
  const { showToast } = useToast();
  const [section, setSection] = useState<Section>('review');
  const [offline, setOffline] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeT | null>(null);
  const [prepared, setPrepared] = useState<ApplicationItemT[]>([]);
  const [history, setHistory] = useState<ApplicationItemT[]>([]);
  const [gate, setGate] = useState<AgentTaskT[]>([]);
  const [queue, setQueue] = useState<AgentTaskT[]>([]);
  const [usage, setUsage] = useState<Record<string, { used: number; cap: number }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof ApplyApiError && e.status === 0) setOffline(msg);
    showToast(msg, 'warning');
  };

  const refresh = useCallback(async () => {
    try {
      const [p, h, g, q, u] = await Promise.all([
        applyApi.applications('prepared,blocked,manual'),
        applyApi.applications('queued,submitting,submitted,needs_human,failed'),
        applyApi.humanGate(),
        applyApi.queue(),
        applyApi.usage(),
      ]);
      setPrepared(p.items); setHistory(h.items); setGate(g.items); setQueue(q.items); setUsage(u);
      setResume(await applyApi.master().catch(() => null));
      setOffline(null);
    } catch (e) {
      fail(e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const msg = await fn();
      if (msg) showToast(msg, 'success');
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  if (offline) {
    return (
      <div className={`${panel} text-sm text-gray-300 space-y-2`}>
        <h2 className="font-bold text-gray-100">Apply pipeline needs the API</h2>
        <p>{offline}</p>
        <p className="text-xs text-gray-500">This screen never shows demo data: everything here is real resumes, real jobs and real submissions.</p>
        <button className={btnGhost} onClick={refresh}>Retry</button>
      </div>
    );
  }

  const tabs: { id: Section; label: string; count?: number }[] = [
    { id: 'resume', label: 'Resume' },
    { id: 'sources', label: 'Job sources' },
    { id: 'review', label: 'Review & approve', count: prepared.filter((p) => p.application.status === 'prepared').length },
    { id: 'gate', label: 'Human Gate', count: gate.length },
    { id: 'history', label: 'Submitted & queue', count: history.length },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className={`${panel} flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
        <div>
          <h2 className="font-bold text-base text-gray-100">Apply pipeline</h2>
          <p className="text-xs text-gray-400">
            Find → tailor (reorder only, never add) → you approve a batch → your local browser worker submits within daily caps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(usage).map(([k, v]) => (
            <span key={k} className="px-2 py-1 rounded-lg border border-gray-800 text-gray-400">
              {k === 'ats' ? 'Company ATS' : k}: <b className="text-gray-200">{v.used}/{v.cap}</b> today
            </span>
          ))}
          {queue.length > 0 && <span className="px-2 py-1 rounded-lg border border-brand-500/30 text-brand-300">{queue.length} scheduled</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setSection(t.id)} className={section === t.id ? btnPrimary : btnGhost}>
            {t.label}{t.count ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {section === 'resume' && <ResumeSection resume={resume} busy={busy} run={run} />}
      {section === 'sources' && <SourcesSection busy={busy} run={run} />}
      {section === 'review' && (
        <ReviewSection items={prepared} hasResume={Boolean(resume)} selected={selected} setSelected={setSelected} busy={busy} run={run} />
      )}
      {section === 'gate' && <GateSection tasks={gate} busy={busy} run={run} />}
      {section === 'history' && <HistorySection items={history} queue={queue} run={run} />}
    </div>
  );
};

type RunFn = (label: string, fn: () => Promise<string | void>) => Promise<void>;

// ---------------------------------------------------------------- resume ----

const ResumeSection: React.FC<{ resume: ResumeT | null; busy: string | null; run: RunFn }> = ({ resume, busy, run }) => {
  const [json, setJson] = useState('');
  useEffect(() => { setJson(resume ? JSON.stringify(resume.doc, null, 2) : ''); }, [resume]);

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className={`${panel} space-y-3`}>
        <h3 className="font-semibold text-gray-100 text-sm">Master resume</h3>
        <p className="text-xs text-gray-400">
          The only source tailoring may draw from. Every tailored version is checked against it: no skill, bullet, number or technology that isn't here can appear.
        </p>
        <label className={`${btnPrimary} inline-block cursor-pointer`}>
          {busy === 'upload' ? 'Reading…' : resume ? 'Replace (PDF, DOCX, TXT, JSON Resume)' : 'Upload resume (PDF, DOCX, TXT, JSON Resume)'}
          <input type="file" accept=".pdf,.docx,.txt,.md,.json" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) run('upload', async () => { const r = await applyApi.uploadResume(f); return `Parsed ${r.doc.experience.length} roles and ${r.doc.skills.flatMap((g) => g.items).length} skills. Check the result.`; });
          }} />
        </label>
        {resume && (
          <div className="text-xs space-y-1 text-gray-300">
            <div><b>{resume.doc.name}</b> — {resume.doc.headline}</div>
            <div>{resume.doc.contact.email} · {resume.doc.contact.phone}</div>
            <div>{resume.doc.experience.map((r) => `${r.title} @ ${r.company}`).join(' · ')}</div>
            {resume.readiness.ready
              ? <div className="text-accent-emerald">Ready to drive applications.</div>
              : <div className="text-accent-amber">Missing: {resume.readiness.missing.join(', ')}. Fix them on the right.</div>}
          </div>
        )}
      </div>
      <div className={`${panel} space-y-3`}>
        <h3 className="font-semibold text-gray-100 text-sm">Correct the parse</h3>
        <p className="text-xs text-gray-400">Resume layouts vary; fix anything the parser got wrong. What you save is the truth source.</p>
        <textarea className={`${input} font-mono h-80`} value={json} onChange={(e) => setJson(e.target.value)} disabled={!resume} />
        <button className={btnPrimary} disabled={!resume || busy === 'save'} onClick={() => run('save', async () => {
          await applyApi.saveResumeDoc(resume!.id, JSON.parse(json));
          return 'Master resume saved';
        })}>Save</button>
      </div>
    </div>
  );
};

// --------------------------------------------------------------- sources ----

const SourcesSection: React.FC<{ busy: string | null; run: RunFn }> = ({ busy, run }) => {
  const [boards, setBoards] = useState<BoardInfoT[]>([]);
  const [cfg, setCfg] = useState<SearchConfigT | null>(null);
  useEffect(() => {
    applyApi.boards().then((b) => setBoards(b.items)).catch(() => undefined);
    applyApi.searchConfig().then(setCfg).catch(() => undefined);
  }, []);
  if (!cfg) return <div className={panel}>Loading…</div>;
  const toggle = (id: string) => setCfg({ ...cfg, boards: cfg.boards.includes(id) ? cfg.boards.filter((b) => b !== id) : [...cfg.boards, id] });

  return (
    <div className="space-y-5">
      <div className={`${panel} grid md:grid-cols-3 gap-3`}>
        <label className="text-xs text-gray-400 space-y-1">Keywords (comma-separated)
          <input className={input} value={cfg.keywords.join(', ')} onChange={(e) => setCfg({ ...cfg, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </label>
        <label className="text-xs text-gray-400 space-y-1">Locations
          <input className={input} value={cfg.locations.join(', ')} onChange={(e) => setCfg({ ...cfg, locations: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </label>
        <label className="text-xs text-gray-400 space-y-1">Results per search
          <input type="number" className={input} value={cfg.limitPerQuery} onChange={(e) => setCfg({ ...cfg, limitPerQuery: Number(e.target.value) })} />
        </label>
      </div>
      <div className={`${panel} grid sm:grid-cols-2 lg:grid-cols-3 gap-2`}>
        {boards.map((b) => (
          <label key={b.id} className="flex items-start gap-2 text-xs text-gray-300 p-2 rounded-xl border border-gray-800">
            <input type="checkbox" checked={cfg.boards.includes(b.id)} onChange={() => toggle(b.id)} className="mt-0.5" />
            <span>
              <b>{b.name}</b>{' '}
              <span className={b.mode === 'browser' ? 'text-accent-amber' : 'text-accent-emerald'}>{b.mode === 'browser' ? 'via your browser' : 'direct'}</span>
              {b.note && <span className="block text-gray-500">{b.note}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btnGhost} onClick={() => run('cfg', async () => { await applyApi.saveSearchConfig(cfg); return 'Search settings saved'; })}>Save settings</button>
        <button className={btnPrimary} disabled={busy === 'boards'} onClick={() => run('boards', async () => {
          await applyApi.saveSearchConfig(cfg);
          const r = await applyApi.runBoards();
          const errs = r.boards.filter((b) => b.errors.length).map((b) => b.board);
          return `${r.received} jobs found, ${r.inserted} new. ${r.queuedForBrowser} searches queued for your browser worker.${errs.length ? ` Errors on: ${errs.join(', ')}` : ''}`;
        })}>{busy === 'boards' ? 'Searching…' : 'Search job boards now'}</button>
        <button className={btnGhost} disabled={busy === 'ats'} onClick={() => run('ats', async () => {
          const r = await applyApi.ingestCompanies();
          return `Company careers pages: ${r.fetched} postings, ${r.inserted} new`;
        })}>{busy === 'ats' ? 'Polling…' : 'Poll company careers pages'}</button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- review ----

const ReviewSection: React.FC<{
  items: ApplicationItemT[]; hasResume: boolean; selected: Set<string>;
  setSelected: (s: Set<string>) => void; busy: string | null; run: RunFn;
}> = ({ items, hasResume, selected, setSelected, busy, run }) => {
  const ready = items.filter((i) => i.application.status === 'prepared');
  const others = items.filter((i) => i.application.status !== 'prepared');
  const toggle = (id: string) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); };

  return (
    <div className="space-y-4">
      <div className={`${panel} flex flex-wrap items-center gap-2`}>
        <button className={btnPrimary} disabled={!hasResume || busy === 'prepare'} onClick={() => run('prepare', async () => {
          const r = await applyApi.prepare(20);
          return `Prepared ${r.prepared}, blocked ${r.blocked}, manual ${r.manual}. ${r.needsAnswers ? `${r.needsAnswers} need an answer from you.` : ''}`;
        })}>{busy === 'prepare' ? 'Tailoring…' : 'Prepare top 20 jobs'}</button>
        <button className={btnGhost} onClick={() => setSelected(new Set(ready.map((i) => i.application.id)))}>Select all</button>
        <button className={btnPrimary} disabled={!selected.size || busy === 'approve'} onClick={() => run('approve', async () => {
          const r = await applyApi.approve([...selected]);
          setSelected(new Set());
          const first = r.scheduled.map((s) => new Date(s.runAfter).getTime()).sort()[0];
          return `Approved ${r.approved}. First submission ${first ? new Date(first).toLocaleString() : '—'}; the rest are spaced out within daily caps.`;
        })}>Approve {selected.size || ''}</button>
        <button className={btnGhost} disabled={!selected.size} onClick={() => run('skip', async () => {
          const r = await applyApi.skip([...selected]); setSelected(new Set()); return `Skipped ${r.skipped}`;
        })}>Skip</button>
        {!hasResume && <span className="text-xs text-accent-amber">Upload your resume first.</span>}
      </div>

      {ready.length === 0 && <div className={`${panel} text-xs text-gray-400`}>Nothing to review. Search job sources, then press “Prepare”.</div>}
      {ready.map((it) => <ReviewCard key={it.application.id} it={it} checked={selected.has(it.application.id)} onToggle={() => toggle(it.application.id)} run={run} />)}

      {others.length > 0 && (
        <div className={`${panel} space-y-2`}>
          <h3 className="text-sm font-semibold text-gray-100">Not automated ({others.length})</h3>
          {others.map((it) => (
            <div key={it.application.id} className="text-xs text-gray-300 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-2">
              <span className={it.application.status === 'blocked' ? 'text-red-400' : 'text-accent-amber'}>{it.application.status}</span>
              <a href={it.job.url} target="_blank" rel="noreferrer" className="text-brand-300">{it.job.title} @ {it.job.company}</a>
              <span className="text-gray-500 w-full">{it.application.blockedReason}</span>
              {it.application.status === 'manual' && (
                <>
                  <button className={btnGhost} onClick={() => openFile(resumeFilePath(it.application.id, 'pdf'))}>Tailored PDF</button>
                  <button className={btnGhost} onClick={() => run('done', async () => { await applyApi.markSubmitted(it.application.id); return 'Marked as applied'; })}>I applied</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ReviewCard: React.FC<{ it: ApplicationItemT; checked: boolean; onToggle: () => void; run: RunFn }> = ({ it, checked, onToggle, run }) => {
  const { application: a, job, variant } = it;
  const asks = a.answers.filter((x) => x.outcome === 'ask');
  const [open, setOpen] = useState(false);
  return (
    <div className={`${panel} space-y-3`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" disabled={asks.length > 0} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <a href={job.url} target="_blank" rel="noreferrer" className="font-semibold text-gray-100 hover:text-brand-300">{job.title}</a>
            <span className="text-gray-400 text-sm">@ {job.company}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg border border-gray-700 text-gray-300">Tier {job.tier} · {job.score}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg border border-gray-700 text-gray-400">{a.platform}</span>
            <span className="text-[11px] text-gray-500">{job.locationRaw}</span>
          </div>
          <div className="text-xs mt-1 space-x-3">
            <span className="text-accent-emerald">match: {(variant?.changes.matched ?? job.matchedSkills ?? []).slice(0, 8).join(', ') || '—'}</span>
            {/* Gaps are always shown and never claimed. */}
            <span className="text-red-300">gaps: {(job.gaps ?? []).join(', ') || 'none'}</span>
            {variant?.changes.notOnResume?.length ? (
              <span className="text-accent-amber" title="The profile says you have these but your master resume doesn't mention them. Add them to the master resume yourself if true; tailoring never adds anything.">
                not on your resume: {variant.changes.notOnResume.join(', ')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => openFile(resumeFilePath(a.id, 'pdf'))}>PDF</button>
          <button className={btnGhost} onClick={() => openFile(resumeFilePath(a.id, 'docx'))}>DOCX</button>
          <button className={btnGhost} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Details'}</button>
        </div>
      </div>

      {variant && !variant.validation.ok && (
        <div className="text-xs text-red-400">Truth check failed: {variant.validation.issues.join('; ')}</div>
      )}
      {asks.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-accent-amber">Answer {asks.length} question{asks.length > 1 ? 's' : ''} before approving — the system won't guess:</div>
          {asks.map((q) => <AskRow key={q.question} question={q.question} onAnswer={(ans, remember) => run('answer', async () => {
            await applyApi.answer(a.id, q.question, ans, remember ? factKeyFor(q.question) : undefined);
            return remember ? 'Saved — you won’t be asked this again' : 'Answer saved';
          })} />)}
        </div>
      )}
      {open && (
        <div className="grid md:grid-cols-2 gap-4 text-xs text-gray-300">
          <div>
            <div className="font-semibold text-gray-100 mb-1">What changed in your resume</div>
            <ul className="list-disc ml-4 space-y-1">
              {(variant?.changes.changes ?? []).map((c, i) => <li key={i}><b>{c.section}</b>: {c.detail}</li>)}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-gray-100 mb-1">Form answers ({a.answers.length})</div>
            <ul className="space-y-1">
              {a.answers.filter((x) => x.outcome === 'answer' && x.formattedAnswer).map((x) => (
                <li key={x.question}><span className="text-gray-500">{x.question}:</span> {x.formattedAnswer.slice(0, 80)}</li>
              ))}
            </ul>
            {a.coverLetter && <details className="mt-2"><summary className="cursor-pointer">Cover letter</summary><pre className="whitespace-pre-wrap mt-1">{a.coverLetter}</pre></details>}
          </div>
        </div>
      )}
    </div>
  );
};

const AskRow: React.FC<{ question: string; options?: string[]; onAnswer: (a: string, remember: boolean) => void }> = ({ question, options, onAnswer }) => {
  const [v, setV] = useState('');
  const [remember, setRemember] = useState(true);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-200 w-full">{question}</span>
      {options?.length
        ? <select className={`${input} max-w-xs`} value={v} onChange={(e) => setV(e.target.value)}><option value="">Choose…</option>{options.map((o) => <option key={o}>{o}</option>)}</select>
        : <input className={`${input} max-w-md`} value={v} onChange={(e) => setV(e.target.value)} placeholder="Your truthful answer" />}
      <label className="flex items-center gap-1 text-gray-400"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> remember</label>
      <button className={btnPrimary} disabled={!v} onClick={() => onAnswer(v, remember)}>Save</button>
    </div>
  );
};

// ------------------------------------------------------------ human gate ----

const GateSection: React.FC<{ tasks: AgentTaskT[]; busy: string | null; run: RunFn }> = ({ tasks, run }) => {
  const [shots, setShots] = useState<Record<string, string>>({});
  useEffect(() => {
    for (const t of tasks) {
      const p = t.humanPrompt?.screenshotPath;
      if (p && !shots[t.id]) blobUrl(screenshotPath(p)).then((u) => setShots((s) => ({ ...s, [t.id]: u }))).catch(() => undefined);
    }
  }, [tasks]);
  if (!tasks.length) return <div className={`${panel} text-xs text-gray-400`}>Nothing waiting. CAPTCHAs, logins and questions the system won't guess land here.</div>;
  return (
    <div className="space-y-4">
      {tasks.map((t) => (
        <div key={t.id} className={`${panel} space-y-2`}>
          <div className="text-xs text-gray-400">{t.kind} · {t.platform} · attempt {t.attempts}</div>
          <div className="text-sm text-gray-100">{t.humanPrompt?.reason}</div>
          {shots[t.id] && <img src={shots[t.id]} alt="What the worker sees" className="max-h-72 rounded-xl border border-gray-800" />}
          {t.humanPrompt?.question
            ? <AskRow question={t.humanPrompt.question} options={t.humanPrompt.options} onAnswer={(ans, remember) => run('gate', async () => {
                await applyApi.resumeTask(t.id, t.humanPrompt!.question, ans, remember ? factKeyFor(t.humanPrompt!.question!) : undefined);
                return 'Answered — the worker continues';
              })} />
            : <button className={btnPrimary} onClick={() => run('gate', async () => { await applyApi.resumeTask(t.id); return 'Resumed — the worker continues on the same page'; })}>I've done it — Resume</button>}
          <button className={btnGhost} onClick={() => run('cancel', async () => { await applyApi.cancelTask(t.id); return 'Cancelled'; })}>Skip this one</button>
        </div>
      ))}
    </div>
  );
};

// --------------------------------------------------------------- history ----

const HistorySection: React.FC<{ items: ApplicationItemT[]; queue: AgentTaskT[]; run: RunFn }> = ({ items, queue }) => (
  <div className={`${panel} space-y-2 text-xs`}>
    {items.length === 0 && <div className="text-gray-400">No applications yet.</div>}
    {items.map((it) => {
      const task = queue.find((q) => q.applicationId === it.application.id);
      const color = it.application.status === 'submitted' ? 'text-accent-emerald' : it.application.status === 'failed' ? 'text-red-400' : 'text-accent-amber';
      return (
        <div key={it.application.id} className="flex flex-wrap items-center gap-2 border-t border-gray-800 pt-2 text-gray-300">
          <span className={`${color} w-24`}>{it.application.status}</span>
          <a href={it.job.url} target="_blank" rel="noreferrer" className="text-gray-100">{it.job.title} @ {it.job.company}</a>
          <span className="text-gray-500">{it.application.platform}</span>
          {it.application.submittedAt && <span className="text-gray-500">submitted {new Date(it.application.submittedAt).toLocaleString()}</span>}
          {task && <span className="text-gray-500">runs after {new Date(task.runAfter).toLocaleString()}</span>}
          {it.application.lastError && <span className="text-red-300 w-full">{it.application.lastError}</span>}
        </div>
      );
    })}
  </div>
);
