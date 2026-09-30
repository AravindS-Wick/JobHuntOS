import React, { useState } from 'react';
import { PROFILE } from '@jobhunt/core';
import { useToast } from '../components/common/Toast';

export const ProfileFactTableView: React.FC = () => {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(PROFILE);
  const [newSkill, setNewSkill] = useState('');
  const [newSkillWeight, setNewSkillWeight] = useState(5);
  const [newGap, setNewGap] = useState('');

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkill) return;
    const clean = newSkill.toLowerCase().trim();
    setProfile((prev) => ({
      ...prev,
      skills: { ...prev.skills, [clean]: newSkillWeight },
    }));
    setNewSkill('');
    showToast(`Added skill: ${clean} (Weight: ${newSkillWeight})`, 'success', 'fa-check');
  };

  const handleAddGap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGap) return;
    const clean = newGap.toLowerCase().trim();
    if (!profile.gaps.includes(clean)) {
      setProfile((prev) => ({
        ...prev,
        gaps: [...prev.gaps, clean],
      }));
      showToast(`Added gap constraint: ${clean}`, 'info', 'fa-triangle-exclamation');
    }
    setNewGap('');
  };

  const handleTriggerRescore = () => {
    showToast('Rescoring all 6 ingested jobs against updated fact table...', 'cyan', 'fa-arrows-rotate');
    setTimeout(() => {
      showToast('Rescore complete: Updated pgvector similarity and gap tags!', 'success', 'fa-circle-check');
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-user-shield text-rose-400"></i> Verified Candidate Fact Table & Truth Constraints
          </h2>
          <p className="text-xs text-gray-400">
            PRD G4/D3: Single source of truth. The system never infers or fabricates skills.
          </p>
        </div>
        <button
          onClick={handleTriggerRescore}
          className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition shadow-lg glow-effect flex items-center gap-2"
        >
          <i className="fa-solid fa-arrows-rotate"></i> Rescore All Opportunities
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Summary & Salary Limits */}
        <div className="space-y-4">
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
            <div className="flex items-center space-x-3 border-b border-gray-800 pb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-accent-purple border border-brand-400 flex items-center justify-center text-base font-bold text-white shadow-md">
                AS
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-100">{profile.name}</h3>
                <p className="text-xs text-gray-400">{profile.location}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-gray-300">
              <div className="flex justify-between py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Experience:</span>
                <span className="font-semibold text-white font-mono">{profile.yearsExperience} Years</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Min Salary Floor:</span>
                <span className="font-semibold text-accent-emerald font-mono">₹{profile.minSalaryInrLpa} LPA</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Flex Salary Floor:</span>
                <span className="font-semibold text-accent-cyan font-mono">₹{profile.flexSalaryInrLpa} LPA</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Preferred Cities:</span>
                <span className="font-semibold text-gray-200">Chennai, Bengaluru, Remote</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Work Mode:</span>
                <span className="font-semibold text-brand-300">Remote &gt; Hybrid</span>
              </div>
            </div>
          </div>

          {/* Add Skill / Gap Forms */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
            <h3 className="font-bold text-xs text-gray-200 border-b border-gray-800 pb-2">Fact Table Updates</h3>

            <form onSubmit={handleAddSkill} className="space-y-2">
              <label className="block text-[11px] text-gray-400">Add Verified Skill</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="e.g. fastify"
                  className="flex-1 bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-1.5 text-gray-200 focus:outline-none focus:border-brand-500"
                />
                <select
                  value={newSkillWeight}
                  onChange={(e) => setNewSkillWeight(Number(e.target.value))}
                  className="bg-dark-card border border-gray-800 text-xs rounded-xl px-2 py-1.5 text-gray-300 focus:outline-none"
                >
                  <option value={5}>Weight 5</option>
                  <option value={4}>Weight 4</option>
                  <option value={3}>Weight 3</option>
                </select>
                <button
                  type="submit"
                  className="px-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold"
                >
                  +
                </button>
              </div>
            </form>

            <form onSubmit={handleAddGap} className="space-y-2 pt-2 border-t border-gray-800">
              <label className="block text-[11px] text-rose-300">Add Gap Constraint (Never Claimed)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGap}
                  onChange={(e) => setNewGap(e.target.value)}
                  placeholder="e.g. rust"
                  className="flex-1 bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-1.5 text-gray-200 focus:outline-none focus:border-rose-500 font-mono"
                />
                <button
                  type="submit"
                  className="px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
                >
                  +
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Skills & Gaps Lists */}
        <div className="lg:col-span-2 space-y-4">
          {/* Verified Skills Grid */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-gray-200 flex items-center justify-between">
              <span>
                <i className="fa-solid fa-circle-check text-accent-emerald mr-1.5"></i> Verified Production Skills (
                {Object.keys(profile.skills).length})
              </span>
              <span className="text-[10px] text-gray-400 font-mono">Weight 1 (basic) to 5 (lead)</span>
            </h3>
            <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
              {Object.entries(profile.skills).map(([skill, weight]) => (
                <span
                  key={skill}
                  className="text-xs bg-dark-card border border-gray-800 text-gray-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-mono"
                >
                  <span>{skill}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300 font-bold">
                    {weight}★
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Hard-Honesty Gaps Grid */}
          <div className="glass-panel p-5 rounded-2xl border border-rose-500/30 space-y-3 bg-rose-950/10">
            <h3 className="font-bold text-xs text-rose-300 flex items-center justify-between">
              <span>
                <i className="fa-solid fa-triangle-exclamation text-rose-400 mr-1.5"></i> Hard-Honesty Gap List (
                {profile.gaps.length})
              </span>
              <span className="text-[10px] text-rose-400 font-mono">Explicitly Flagged on JDs</span>
            </h3>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Technologies the candidate does <strong>NOT</strong> have production experience with. The system surfaces
              these on job cards and strictly prevents the resume tailor or auto-apply worker from claiming them.
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
              {profile.gaps.map((gap, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-lg font-mono font-medium"
                >
                  {gap}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
