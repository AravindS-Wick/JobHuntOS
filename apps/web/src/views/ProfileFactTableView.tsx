import React, { useState } from 'react';
import {
  DEFAULT_FACTS,
  resolveScreeningQuestion,
  type Fact,
  type QuestionResolution,
} from '@jobhunt/core';
import { useToast } from '../components/common/Toast';

const PRESET_QUESTIONS = [
  'What is your notice period in days?',
  'How many years of experience do you have with React?',
  'Do you have production experience with AWS?',
  'This role has a mandatory requirement: Do you have at least 3 years Kubernetes experience?',
  'Are you legally authorized to work in India?',
  'Will you require visa sponsorship in the United States?',
  'What is your expected CTC (INR LPA)?',
  'Are you open to relocating to Bengaluru?',
];

export const ProfileFactTableView: React.FC = () => {
  const { showToast } = useToast();
  const [facts] = useState<Fact[]>(DEFAULT_FACTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Screening Question Simulator State
  const [simQuestion, setSimQuestion] = useState(PRESET_QUESTIONS[0]!);
  const [simOptions, setSimOptions] = useState('');
  const [simResult, setSimResult] = useState<QuestionResolution>(() =>
    resolveScreeningQuestion(PRESET_QUESTIONS[0]!)
  );

  const handleRunSimulation = (questionToRun?: string) => {
    const q = questionToRun ?? simQuestion;
    if (!q.trim()) return;

    const optionsList = simOptions
      ? simOptions.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const res = resolveScreeningQuestion(q, {
      options: optionsList,
      facts: Object.fromEntries(facts.map((f) => [f.key, f])),
    });

    setSimResult(res);
    if (res.outcome === 'answer') {
      showToast(`Answered: "${res.formattedAnswer}"`, 'success', 'fa-check');
    } else if (res.outcome === 'abort') {
      showToast('Aborted: Gap technology conflict detected', 'warning', 'fa-ban');
    } else {
      showToast('Human Gate: Novel question queued for input', 'info', 'fa-circle-question');
    }
  };

  const categories = ['all', 'personal', 'availability', 'authorization', 'compensation', 'experience', 'education', 'links', 'preferences'];

  const filteredFacts = selectedCategory === 'all'
    ? facts
    : facts.filter((f) => f.category === selectedCategory);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-user-shield text-rose-400"></i> Verified Candidate Fact Table & Truth Engine
          </h2>
          <p className="text-xs text-gray-400">
            PRD G4/D3: Ground truth constraint. Auto-answers ATS screening questions with zero fabrication.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-medium border border-emerald-500/30">
            <i className="fa-solid fa-shield-halved mr-1"></i> Truth Constraint Active
          </span>
        </div>
      </div>

      {/* Simulator Section */}
      <div className="glass-panel p-5 rounded-2xl border border-brand-500/30 bg-brand-950/10 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <h3 className="font-bold text-sm text-brand-200 flex items-center gap-2">
            <i className="fa-solid fa-robot text-brand-400"></i> Screening Question Resolver Simulator
          </h3>
          <span className="text-[11px] text-gray-400 font-mono">Simulates Greenhouse / Lever / Ashby auto-fill logic</span>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_QUESTIONS.map((pq, idx) => (
            <button
              key={idx}
              onClick={() => {
                setSimQuestion(pq);
                handleRunSimulation(pq);
              }}
              className={`text-xs px-2.5 py-1 rounded-lg transition border ${
                simQuestion === pq
                  ? 'bg-brand-600/40 border-brand-400 text-white'
                  : 'bg-dark-card/60 border-gray-800 text-gray-300 hover:border-gray-700'
              }`}
            >
              {pq.length > 40 ? pq.substring(0, 37) + '...' : pq}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3 space-y-2">
            <input
              type="text"
              value={simQuestion}
              onChange={(e) => setSimQuestion(e.target.value)}
              placeholder="Enter an arbitrary ATS screening question..."
              className="w-full bg-dark-card border border-gray-700/80 rounded-xl px-3.5 py-2 text-xs text-gray-100 focus:outline-none focus:border-brand-500"
            />
            <input
              type="text"
              value={simOptions}
              onChange={(e) => setSimOptions(e.target.value)}
              placeholder="Optional ATS form options (comma-separated, e.g. Yes, No or 30 days, 60 days)"
              className="w-full bg-dark-card/70 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex items-start">
            <button
              onClick={() => handleRunSimulation()}
              className="w-full h-full py-2.5 px-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-play"></i> Resolve
            </button>
          </div>
        </div>

        {/* Result Card */}
        {simResult && (
          <div className="p-4 rounded-xl border border-gray-800 bg-dark-card/90 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-gray-400 uppercase font-mono">Resolver Outcome:</span>
                {simResult.outcome === 'answer' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <i className="fa-solid fa-circle-check"></i> ANSWER (Truth Verified)
                  </span>
                )}
                {simResult.outcome === 'abort' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                    <i className="fa-solid fa-ban"></i> ABORT (Gap Conflict)
                  </span>
                )}
                {simResult.outcome === 'ask' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <i className="fa-solid fa-circle-question"></i> ASK (Human Gate Queue)
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 font-mono">
                Confidence: <span className="font-bold text-gray-200">{(simResult.confidence * 100).toFixed(0)}%</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs border-t border-gray-800/80 pt-3">
              <div>
                <span className="text-gray-400 block mb-1">Form Input Value to Inject:</span>
                <div className="p-2.5 rounded-lg bg-dark-bg/80 border border-gray-800 text-sm font-mono text-cyan-300 font-bold">
                  {simResult.formattedAnswer || '<None - Human Input Required>'}
                </div>
              </div>
              <div>
                <span className="text-gray-400 block mb-1">Audit Rationale:</span>
                <div className="p-2.5 rounded-lg bg-dark-bg/80 border border-gray-800 text-xs text-gray-300 leading-relaxed">
                  {simResult.reason}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Facts Table Explorer */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-sm text-gray-100 flex items-center gap-2">
              <i className="fa-solid fa-database text-brand-400"></i> Fact Table Records ({filteredFacts.length})
            </h3>
            <p className="text-xs text-gray-400">All verified candidate claims backed by real contracts and master profile.</p>
          </div>
          {/* Category filter */}
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-[11px] px-2.5 py-1 rounded-lg capitalize transition ${
                  selectedCategory === cat
                    ? 'bg-brand-600 text-white font-bold'
                    : 'bg-dark-card border border-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-dark-card/80 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-800">
              <tr>
                <th className="py-2.5 px-3">Key / Slug</th>
                <th className="py-2.5 px-3">Label</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Verified Value</th>
                <th className="py-2.5 px-3">Evidence Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-mono">
              {filteredFacts.map((fact) => (
                <tr key={fact.key} className="hover:bg-dark-card/40 transition">
                  <td className="py-2.5 px-3 font-semibold text-brand-300">{fact.key}</td>
                  <td className="py-2.5 px-3 font-sans text-gray-200">{fact.label}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-gray-800 text-[10px] text-gray-300 uppercase">
                      {fact.category}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">
                    {typeof fact.value === 'boolean'
                      ? fact.value ? 'Yes' : 'No'
                      : Array.isArray(fact.value)
                      ? fact.value.join(', ')
                      : String(fact.value)}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-gray-400 text-[11px]">{fact.evidence ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
