import React, { useState } from 'react';
import type { Job } from '@jobhunt/contracts';
import { Modal } from '../components/common/Modal';
import { formatSalary, formatTimeAgo } from '../lib/utils';
import { useToast } from '../components/common/Toast';
import { appStore } from '../lib/api';

interface OpportunityFeedViewProps {
  jobs: Job[];
  onUpdateStatus?: (jobId: string, status: 'to_apply' | 'queued' | 'applied' | 'skipped' | 'expired') => void;
  onDispatchApply: (job: Job) => void;
}

export const OpportunityFeedView: React.FC<OpportunityFeedViewProps> = ({
  jobs,
  onDispatchApply,
}) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPortal, setSelectedPortal] = useState('all');
  const [selectedTier, setSelectedTier] = useState<number>(0);
  const [inspectJob, setInspectJob] = useState<Job | null>(null);
  const [isPulling, setIsPulling] = useState<string | null>(null);

  const handlePullSource = async (source: 'linkedin' | 'naukri' | 'indeed', query: string, location: string) => {
    setIsPulling(source);
    showToast(`Polling live jobs from ${source.toUpperCase()}...`, 'cyan', 'fa-arrows-rotate');
    try {
      const res = await appStore.searchAndIngestSource(source, { query, location, limit: 20 });
      showToast(`Ingested ${res.fetched || 0} live postings from ${source.toUpperCase()} into scoring pipeline!`, 'success', 'fa-circle-check');
    } catch (e: any) {
      showToast(e.message || `Failed to fetch from ${source}`, 'warning');
    } finally {
      setIsPulling(null);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      job.title.toLowerCase().includes(q) ||
      job.company.toLowerCase().includes(q) ||
      (job.matchedSkills && job.matchedSkills.some((s) => s.toLowerCase().includes(q)));
    const matchesPortal = selectedPortal === 'all' || job.source.toLowerCase() === selectedPortal.toLowerCase();
    const matchesTier = selectedTier === 0 || job.tier === selectedTier;

    return matchesQuery && matchesPortal && matchesTier;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Filter Bar */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
              <i className="fa-solid fa-briefcase text-brand-400"></i> Opportunity Match Feed (pgvector Cosine Search)
            </h2>
            <p className="text-xs text-gray-400">
              Scraped directly from target company ATS career pages (Greenhouse, Lever, Ashby) with similarity scoring.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-60">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-xs text-gray-500"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, company, stack..."
                className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl pl-8 pr-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Portal Filter */}
            <select
              value={selectedPortal}
              onChange={(e) => setSelectedPortal(e.target.value)}
              className="bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none"
            >
              <option value="all">All Portals</option>
              <option value="linkedin">LinkedIn</option>
              <option value="naukri">Naukri</option>
              <option value="indeed">Indeed</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
              <option value="workday">Workday</option>
            </select>

            {/* Tier Filter */}
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(Number(e.target.value))}
              className="bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none font-semibold"
            >
              <option value={0}>All Tiers</option>
              <option value={1}>Tier 1 (≥70 Score)</option>
              <option value={2}>Tier 2 (50–69 Score)</option>
              <option value={3}>Tier 3 (30–49 Score)</option>
              <option value={4}>Tier 4 (Disqualified)</option>
            </select>
          </div>
        </div>

        {/* Live Board Ingestion Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-800/80 text-xs">
          <div className="text-gray-400 flex items-center gap-1.5 font-medium">
            <i className="fa-solid fa-cloud-arrow-down text-accent-cyan"></i>
            <span>Live Multi-Source Ingestion:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPulling !== null}
              onClick={() => handlePullSource('linkedin', 'Senior Backend Engineer', 'India')}
              className="px-3 py-1.5 rounded-lg bg-[#0077B5]/10 text-[#70b5f9] border border-[#0077B5]/30 hover:bg-[#0077B5]/20 font-semibold transition flex items-center gap-1.5"
            >
              <i className={`fa-brands fa-linkedin ${isPulling === 'linkedin' ? 'animate-spin' : ''}`}></i>
              {isPulling === 'linkedin' ? 'Pulling...' : 'Pull LinkedIn Jobs'}
            </button>

            <button
              type="button"
              disabled={isPulling !== null}
              onClick={() => handlePullSource('naukri', 'Lead Engineer', 'Chennai, Bangalore, Remote')}
              className="px-3 py-1.5 rounded-lg bg-[#009688]/10 text-[#4db6ac] border border-[#009688]/30 hover:bg-[#009688]/20 font-semibold transition flex items-center gap-1.5"
            >
              <i className={`fa-solid fa-briefcase ${isPulling === 'naukri' ? 'animate-spin' : ''}`}></i>
              {isPulling === 'naukri' ? 'Pulling...' : 'Pull Naukri Jobs'}
            </button>

            <button
              type="button"
              disabled={isPulling !== null}
              onClick={() => handlePullSource('indeed', 'Staff Software Engineer', 'India')}
              className="px-3 py-1.5 rounded-lg bg-[#2164f3]/10 text-[#64b5f6] border border-[#2164f3]/30 hover:bg-[#2164f3]/20 font-semibold transition flex items-center gap-1.5"
            >
              <i className={`fa-solid fa-magnifying-glass ${isPulling === 'indeed' ? 'animate-spin' : ''}`}></i>
              {isPulling === 'indeed' ? 'Pulling...' : 'Pull Indeed Jobs'}
            </button>
          </div>
        </div>
      </div>

      {/* Job Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredJobs.map((job) => {
          let tierBadgeColor = 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/30';
          if (job.tier === 2) tierBadgeColor = 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30';
          if (job.tier === 3) tierBadgeColor = 'bg-accent-amber/10 text-accent-amber border-accent-amber/30';
          if (job.tier === 4) tierBadgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/30';

          return (
            <div
              key={job.id}
              className="glass-panel glass-panel-interactive p-4 rounded-xl border border-gray-800 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] bg-brand-500/15 text-brand-300 border border-brand-500/30 px-2 py-0.5 rounded font-semibold uppercase">
                      <i className="fa-solid fa-layer-group mr-1"></i> {job.source} ATS
                    </span>
                    <h3 className="font-bold text-sm text-gray-100 mt-1">{job.title}</h3>
                    <p className="text-xs text-gray-400">
                      <strong className="text-gray-200">{job.company}</strong> • {job.locationRaw || 'Remote'}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${tierBadgeColor}`}>
                    {job.score || 0}% Match
                  </span>
                </div>

                {/* Skills Preview */}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {job.matchedSkills?.slice(0, 5).map((skill, idx) => (
                    <span key={idx} className="bg-dark-card text-gray-300 px-2 py-0.5 rounded border border-gray-800">
                      {skill}
                    </span>
                  ))}
                  {job.gaps && job.gaps.length > 0 && (
                    <span className="bg-rose-950/40 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-mono font-medium">
                      Gaps: {job.gaps.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-800/80">
                <span className="text-[11px] text-gray-400 font-mono">
                  {formatSalary(job.salaryInrLpa)} • {formatTimeAgo(job.postedAt)}
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setInspectJob(job)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-dark-card border border-gray-700 hover:border-brand-500 text-gray-300 transition"
                  >
                    Inspect
                  </button>
                  <button
                    onClick={() => onDispatchApply(job)}
                    className="text-xs px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold transition glow-effect"
                  >
                    Auto-Fill
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredJobs.length === 0 && (
          <div className="col-span-full text-center p-8 glass-panel rounded-2xl border border-gray-800 text-gray-400">
            <p className="text-xs">No opportunities matched your search or tier filter.</p>
          </div>
        )}
      </div>

      {/* Job Inspection Detail Modal */}
      {inspectJob && (
        <Modal
          isOpen={true}
          onClose={() => setInspectJob(null)}
          title={inspectJob.title}
          subtitle={`${inspectJob.company} • ${inspectJob.source.toUpperCase()} ATS Portal`}
          icon="fa-briefcase"
        >
          <div className="space-y-5 text-xs text-gray-300">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-dark-card rounded-xl border border-gray-800">
                <span className="text-[10px] text-gray-500 uppercase block">Match Score</span>
                <span className="text-base font-bold text-accent-emerald">{inspectJob.score || 0}% Fit</span>
              </div>
              <div className="p-3 bg-dark-card rounded-xl border border-gray-800">
                <span className="text-[10px] text-gray-500 uppercase block">Tier Category</span>
                <span className="text-base font-bold text-brand-400">Tier {inspectJob.tier || 1}</span>
              </div>
              <div className="p-3 bg-dark-card rounded-xl border border-gray-800">
                <span className="text-[10px] text-gray-500 uppercase block">Salary Estimate</span>
                <span className="text-base font-bold text-gray-200">{formatSalary(inspectJob.salaryInrLpa)}</span>
              </div>
              <div className="p-3 bg-dark-card rounded-xl border border-gray-800">
                <span className="text-[10px] text-gray-500 uppercase block">Work Mode</span>
                <span className="text-base font-bold text-accent-cyan uppercase">{inspectJob.workMode}</span>
              </div>
            </div>

            {/* Score Breakdown */}
            {inspectJob.breakdown && (
              <div className="p-3 bg-dark-card/60 rounded-xl border border-gray-800 space-y-2">
                <span className="font-bold text-gray-200 block text-xs">Deterministic Score Breakdown</span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono text-gray-400">
                  <div>Stack Match: <strong className="text-gray-200">{inspectJob.breakdown.stackMatch || 0} pts</strong></div>
                  <div>Seniority Fit: <strong className="text-gray-200">{inspectJob.breakdown.seniorityFit || 0} pts</strong></div>
                  <div>Work Mode: <strong className="text-gray-200">{inspectJob.breakdown.workMode || 0} pts</strong></div>
                  <div>Compensation: <strong className="text-gray-200">{inspectJob.breakdown.compensation || 0} pts</strong></div>
                  <div>Recency: <strong className="text-gray-200">{inspectJob.breakdown.recency || 0} pts</strong></div>
                </div>
              </div>
            )}

            {/* Matched Skills vs Gaps */}
            <div className="space-y-3">
              <div>
                <span className="font-bold text-gray-200 block mb-1">Matched Candidate Stack:</span>
                <div className="flex flex-wrap gap-1.5">
                  {inspectJob.matchedSkills?.map((skill, idx) => (
                    <span key={idx} className="bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30 px-2 py-0.5 rounded font-mono text-[11px]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {inspectJob.gaps && inspectJob.gaps.length > 0 && (
                <div>
                  <span className="font-bold text-rose-300 block mb-1">Honest Gaps (Never Claimed / Fabricated):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectJob.gaps.map((gap, idx) => (
                      <span key={idx} className="bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-mono text-[11px]">
                        {gap}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Description Body */}
            <div>
              <span className="font-bold text-gray-200 block mb-1">Job Description:</span>
              <div className="bg-black/50 p-4 rounded-xl border border-gray-800/80 font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto custom-scrollbar text-gray-300 whitespace-pre-wrap">
                {inspectJob.descriptionText || 'No full description text available.'}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end space-x-2 pt-3 border-t border-gray-800">
              <a
                href={inspectJob.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-dark-card border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold transition"
              >
                Open Official Post
              </a>
              <button
                onClick={() => {
                  onDispatchApply(inspectJob);
                  setInspectJob(null);
                }}
                className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold transition glow-effect flex items-center gap-1.5"
              >
                <i className="fa-solid fa-play text-xs"></i> Trigger Auto-Fill
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
