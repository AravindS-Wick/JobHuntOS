import React, { useState, useEffect } from 'react';
import type { Job } from '@jobhunt/contracts';
import { useToast } from '../components/common/Toast';
import { formatSalary, formatTimeAgo } from '../lib/utils';

interface ApprovalInboxViewProps {
  jobs: Job[];
  onUpdateStatus: (jobId: string, status: 'to_apply' | 'queued' | 'applied' | 'skipped' | 'expired') => void;
  onNavigateToSynthesizer: (job: Job) => void;
  onNavigateToOutreach: (job: Job) => void;
}

export const ApprovalInboxView: React.FC<ApprovalInboxViewProps> = ({
  jobs,
  onUpdateStatus,
  onNavigateToSynthesizer,
  onNavigateToOutreach,
}) => {
  const { showToast } = useToast();
  const pendingJobs = jobs.filter((j) => j.status === 'to_apply');
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentJob: Job | undefined = pendingJobs[currentIndex] || pendingJobs[0];

  useEffect(() => {
    if (currentIndex >= pendingJobs.length && pendingJobs.length > 0) {
      setCurrentIndex(pendingJobs.length - 1);
    }
  }, [pendingJobs.length, currentIndex]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (!currentJob) return;

      if (e.key === 'a' || e.key === 'A') {
        handleApprove();
      } else if (e.key === 's' || e.key === 'S') {
        handleSkip();
      } else if (e.key === 'r' || e.key === 'R') {
        handleReject();
      } else if (e.key === 'o' || e.key === 'O') {
        window.open(currentJob.url, '_blank');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentJob]);

  const handleApprove = () => {
    if (!currentJob) return;
    onUpdateStatus(currentJob.id, 'queued');
    showToast(`Approved & Queued application for ${currentJob.title} @ ${currentJob.company}!`, 'success', 'fa-check');
  };

  const handleSkip = () => {
    if (!currentJob) return;
    onUpdateStatus(currentJob.id, 'skipped');
    showToast(`Skipped ${currentJob.title}`, 'info', 'fa-forward');
  };

  const handleReject = () => {
    if (!currentJob) return;
    onUpdateStatus(currentJob.id, 'expired');
    showToast(`Archived ${currentJob.title}`, 'warning', 'fa-xmark');
  };

  if (pendingJobs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 glass-panel rounded-2xl border border-gray-800 text-center space-y-4 animate-in fade-in">
        <div className="w-16 h-16 rounded-2xl bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald flex items-center justify-center text-2xl shadow-lg">
          <i className="fa-solid fa-circle-check"></i>
        </div>
        <div>
          <h3 className="font-bold text-lg text-gray-100">Inbox Zero Reached!</h3>
          <p className="text-xs text-gray-400 max-w-md mt-1">
            All daily ingested opportunities have been reviewed. Run the Ingestion Scraper to poll new public ATS career postings.
          </p>
        </div>
        <div className="flex space-x-3 pt-2">
          <button
            onClick={() => setCurrentIndex(0)}
            className="text-xs bg-dark-card border border-gray-700 hover:border-brand-500 text-gray-300 px-4 py-2 rounded-xl transition"
          >
            Review All Scored Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Top Cockpit Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-inbox text-accent-amber"></i> Approval Inbox & Decision Cockpit
          </h2>
          <p className="text-xs text-gray-400">
            Review scored jobs, honest gap alerts, resume diffs, and drafted recruiter outreach in seconds.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono text-gray-400 bg-dark-card px-3 py-1.5 rounded-lg border border-gray-800">
            Card <strong className="text-white">{currentIndex + 1}</strong> of{' '}
            <strong className="text-white">{pendingJobs.length}</strong>
          </span>
          <div className="flex space-x-1">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="w-8 h-8 rounded-lg bg-dark-card border border-gray-700 hover:border-brand-500 text-gray-300 flex items-center justify-center transition disabled:opacity-30"
              title="Previous card"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <button
              onClick={() => setCurrentIndex((prev) => Math.min(pendingJobs.length - 1, prev + 1))}
              disabled={currentIndex === pendingJobs.length - 1}
              className="w-8 h-8 rounded-lg bg-dark-card border border-gray-700 hover:border-brand-500 text-gray-300 flex items-center justify-center transition disabled:opacity-30"
              title="Next card"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Main Focus Card */}
      {currentJob && (
        <div className="glass-panel p-6 rounded-2xl border border-brand-500/30 space-y-6 shadow-2xl relative overflow-hidden">
          {/* Card Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-brand-500/15 text-brand-300 border border-brand-500/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  <i className="fa-solid fa-layer-group mr-1"></i> {currentJob.source} ATS
                </span>
                <span className="text-[10px] bg-dark-card text-gray-400 border border-gray-800 px-2 py-0.5 rounded font-mono">
                  {formatTimeAgo(currentJob.postedAt)}
                </span>
                <span className="text-[10px] bg-dark-card text-accent-emerald border border-gray-800 px-2 py-0.5 rounded font-mono font-bold">
                  {formatSalary(currentJob.salaryInrLpa)}
                </span>
              </div>
              <h3 className="text-xl font-extrabold text-white mt-1">{currentJob.title}</h3>
              <p className="text-xs text-gray-400 font-medium">
                <strong className="text-gray-200">{currentJob.company}</strong> • {currentJob.locationRaw || 'Remote'} (
                {currentJob.workMode})
              </p>
            </div>

            {/* Score Pill */}
            <div className="flex items-center space-x-3 bg-dark-card/90 p-3 rounded-2xl border border-gray-800">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Cosine Fit Score</p>
                <span className="text-2xl font-black text-accent-emerald">{currentJob.score || 0}%</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald flex items-center justify-center text-lg font-black shadow-inner">
                T{currentJob.tier || 1}
              </div>
            </div>
          </div>

          {/* Skills Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Matched Skills */}
            <div className="p-4 rounded-xl bg-dark-card/60 border border-gray-800 space-y-2">
              <p className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check text-accent-emerald"></i> Matched Candidate Stack (
                {currentJob.matchedSkills?.length || 0})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {currentJob.matchedSkills?.map((skill, idx) => (
                  <span
                    key={idx}
                    className="text-[11px] bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/30 px-2.5 py-0.5 rounded font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Honest Gap Warning Box - PRD NON-NEGOTIABLE RULE 1 */}
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <i className="fa-solid fa-triangle-exclamation text-rose-400"></i> Honest Candidate Gaps (
                  {currentJob.gaps?.length || 0})
                </p>
                <span className="text-[10px] text-rose-400 font-mono">Never Fabricated</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentJob.gaps && currentJob.gaps.length > 0 ? (
                  currentJob.gaps.map((gap, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] bg-rose-500/15 text-rose-300 border border-rose-500/40 px-2.5 py-0.5 rounded font-mono font-medium"
                    >
                      {gap}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400 italic">No technology gaps identified for this role</span>
                )}
              </div>
            </div>
          </div>

          {/* Tailored Resume & Outreach Note Dual Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tailored Resume Bullets Preview */}
            <div className="p-4 rounded-xl bg-dark-card border border-gray-800 space-y-2">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <i className="fa-solid fa-file-lines text-brand-400"></i> Tailored ATS Resume Highlights
                </span>
                <button
                  onClick={() => onNavigateToSynthesizer(currentJob)}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold"
                >
                  Synthesizer Studio <i className="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                </button>
              </div>
              <div className="text-xs text-gray-300 font-mono space-y-2 leading-relaxed bg-black/40 p-3 rounded-lg border border-gray-800/80">
                <p>• Engineered high-throughput React 19 & TypeScript frontend platform with custom micro-animations.</p>
                <p>• Architected Fastify + Node.js REST endpoints adhering to strict Zod schemas and sub-50ms latency.</p>
                <p>• Deployed containerized microservices to GCP Cloud Run with automated GitHub Actions CI/CD.</p>
              </div>
            </div>

            {/* Recruiter Outreach Pitch Preview */}
            <div className="p-4 rounded-xl bg-dark-card border border-gray-800 space-y-2">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <i className="fa-solid fa-paper-plane text-accent-purple"></i> Draft Recruiter Cold Pitch
                </span>
                <button
                  onClick={() => onNavigateToOutreach(currentJob)}
                  className="text-[11px] text-accent-purple hover:text-purple-300 font-semibold"
                >
                  Outreach Studio <i className="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                </button>
              </div>
              <div className="text-xs text-gray-300 font-mono space-y-2 leading-relaxed bg-black/40 p-3 rounded-lg border border-gray-800/80">
                <p className="text-gray-400">
                  Subject: {currentJob.title} Application — Aravindhan S. (5.5+ YOE)
                </p>
                <p>
                  "Hi, I submitted my application for the {currentJob.title} opening at {currentJob.company}. My background aligns directly with your stack in {currentJob.matchedSkills?.[0] || 'React'} and TypeScript platform architecture..."
                </p>
              </div>
            </div>
          </div>

          {/* Action Bar & Hotkeys */}
          <div className="pt-3 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-3">
            {/* Keyboard Shortcuts Hint */}
            <div className="flex items-center space-x-2 text-[11px] text-gray-400 font-mono">
              <span className="hidden sm:inline">Hotkeys:</span>
              <kbd className="px-2 py-1 bg-dark-card border border-gray-700 rounded text-gray-300 font-bold">A</kbd> Approve
              <kbd className="px-2 py-1 bg-dark-card border border-gray-700 rounded text-gray-300 font-bold">S</kbd> Skip
              <kbd className="px-2 py-1 bg-dark-card border border-gray-700 rounded text-gray-300 font-bold">R</kbd> Archive
              <kbd className="px-2 py-1 bg-dark-card border border-gray-700 rounded text-gray-300 font-bold">O</kbd> Open Link
            </div>

            {/* Decision Buttons */}
            <div className="flex items-center space-x-2.5 w-full sm:w-auto">
              <a
                href={currentJob.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2.5 rounded-xl bg-dark-card border border-gray-700 hover:border-gray-500 text-gray-300 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <i className="fa-solid fa-arrow-up-right-from-square"></i> Open Board
              </a>
              <button
                onClick={handleSkip}
                className="px-3.5 py-2.5 rounded-xl bg-dark-card border border-gray-700 hover:border-accent-amber text-gray-300 hover:text-accent-amber text-xs font-semibold transition flex items-center gap-1.5"
              >
                <i className="fa-solid fa-forward"></i> Skip
              </button>
              <button
                onClick={handleReject}
                className="px-3.5 py-2.5 rounded-xl bg-dark-card border border-gray-700 hover:border-rose-500 text-gray-300 hover:text-rose-400 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <i className="fa-solid fa-xmark"></i> Reject
              </button>
              <button
                onClick={handleApprove}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-emerald hover:from-brand-500 hover:to-accent-emerald text-white text-xs font-bold transition shadow-lg glow-effect flex items-center gap-2"
              >
                <i className="fa-solid fa-check"></i> Approve & Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
