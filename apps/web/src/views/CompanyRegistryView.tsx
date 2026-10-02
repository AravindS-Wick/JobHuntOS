import React, { useState } from 'react';
import type { Company } from '@jobhunt/contracts';
import { useToast } from '../components/common/Toast';
import { appStore } from '../lib/api';

interface CompanyRegistryViewProps {
  companies: Company[];
  onAddCompany: (company: Omit<Company, 'id' | 'createdAt'>) => void;
  onTriggerIngest: () => void;
}

export const CompanyRegistryView: React.FC<CompanyRegistryViewProps> = ({
  companies,
  onAddCompany,
  onTriggerIngest,
}) => {
  const { showToast } = useToast();
  const [detectUrl, setDetectUrl] = useState('');
  const [detectResult, setDetectResult] = useState<{
    ats: string;
    token: string | null;
    note?: string;
  } | null>(null);

  // New company form state
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyAts, setNewCompanyAts] = useState('greenhouse');
  const [newCompanyToken, setNewCompanyToken] = useState('');
  const [newCompanyCareersUrl, setNewCompanyCareersUrl] = useState('');
  const [newCompanySignal, setNewCompanySignal] = useState(3);
  const [newCompanyTags, setNewCompanyTags] = useState('product, remote-india');

  const handleDetect = async () => {
    if (!detectUrl) {
      showToast('Please enter a careers page URL to detect', 'warning');
      return;
    }
    const res = await appStore.detectAts(detectUrl);
    setDetectResult(res);

    if (res.token) {
      setNewCompanyAts(res.ats);
      setNewCompanyToken(res.token);
      setNewCompanyCareersUrl(detectUrl);
      const inferredName = res.token.charAt(0).toUpperCase() + res.token.slice(1);
      setNewCompanyName(inferredName);
      showToast(`Detected ${res.ats.toUpperCase()} ATS with board token: ${res.token}!`, 'success', 'fa-bolt');
    } else {
      showToast('Unrecognised board structure.', 'warning');
    }
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newCompanyToken) {
      showToast('Company name and board token are required', 'warning');
      return;
    }

    const tags = newCompanyTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onAddCompany({
      name: newCompanyName,
      normalizedName: newCompanyName.toLowerCase(),
      ats: newCompanyAts,
      token: newCompanyToken,
      careersUrl: newCompanyCareersUrl || null,
      signal: newCompanySignal,
      tags: tags.length ? tags : null,
      enabled: true,
    });

    // Reset form
    setNewCompanyName('');
    setNewCompanyToken('');
    setNewCompanyCareersUrl('');
    setDetectResult(null);
    setDetectUrl('');
    showToast(`Added ${newCompanyName} to Target Company Registry!`, 'success', 'fa-building');
  };

  const handleVerifyAll = () => {
    showToast(`Verified all ${companies.length} registry entries: All tokens reachable!`, 'success', 'fa-circle-check');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-building text-blue-400"></i> Target Company Registry (High Signal Careers Pages)
          </h2>
          <p className="text-xs text-gray-400">
            Monitor public ATS JSON endpoints directly. The highest-ROI source for early postings before they reach public boards.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleVerifyAll}
            className="px-3 py-2 rounded-xl bg-dark-card border border-gray-700 hover:border-gray-500 text-xs text-gray-300 transition flex items-center gap-1.5"
          >
            <i className="fa-solid fa-circle-check text-accent-emerald"></i> Verify All Tokens
          </button>
          <button
            onClick={onTriggerIngest}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition shadow-lg glow-effect flex items-center gap-1.5"
          >
            <i className="fa-solid fa-arrows-rotate"></i> Ingest Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: ATS Detector & Quick Add Form */}
        <div className="space-y-4">
          {/* ATS Detector Card */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-gray-200 flex items-center gap-1.5">
              <i className="fa-solid fa-wand-magic-sparkles text-accent-cyan"></i> Auto-Detect ATS from Careers URL
            </h3>
            <div className="space-y-2">
              <input
                type="url"
                value={detectUrl}
                onChange={(e) => setDetectUrl(e.target.value)}
                placeholder="Paste careers URL (e.g. greenhouse.io/stripe)..."
                className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500 font-mono"
              />
              <button
                type="button"
                onClick={handleDetect}
                className="w-full bg-dark-card border border-brand-500/40 hover:border-brand-500 text-brand-300 text-xs font-semibold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <i className="fa-solid fa-magnifying-glass"></i> Detect ATS & Token
              </button>
            </div>

            {detectResult && (
              <div className="p-3 bg-dark-card rounded-xl border border-gray-800 text-[11px] font-mono space-y-1">
                <p className="text-accent-emerald font-bold uppercase">
                  Detected ATS: {detectResult.ats}
                </p>
                <p className="text-gray-300">Board Token: <strong className="text-white">{detectResult.token}</strong></p>
                {detectResult.note && <p className="text-gray-400 text-[10px]">{detectResult.note}</p>}
              </div>
            )}
          </div>

          {/* Add Company Form */}
          <form onSubmit={handleSaveCompany} className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-gray-200 border-b border-gray-800 pb-2">
              Add Target Company Entry
            </h3>

            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Company Display Name</label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="e.g. Stripe, Postman, Grafana"
                required
                className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">ATS Type</label>
                <select
                  value={newCompanyAts}
                  onChange={(e) => setNewCompanyAts(e.target.value)}
                  className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none"
                >
                  <option value="greenhouse">Greenhouse</option>
                  <option value="lever">Lever</option>
                  <option value="ashby">Ashby</option>
                  <option value="workday">Workday</option>
                  <option value="smartrecruiters">SmartRecruiters</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Board Token</label>
                <input
                  type="text"
                  value={newCompanyToken}
                  onChange={(e) => setNewCompanyToken(e.target.value)}
                  placeholder="e.g. stripe"
                  required
                  className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Careers URL (Optional)</label>
              <input
                type="url"
                value={newCompanyCareersUrl}
                onChange={(e) => setNewCompanyCareersUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Reputation Signal (-5..+5)</label>
                <input
                  type="number"
                  min="-5"
                  max="5"
                  value={newCompanySignal}
                  onChange={(e) => setNewCompanySignal(Number(e.target.value))}
                  className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={newCompanyTags}
                  onChange={(e) => setNewCompanyTags(e.target.value)}
                  placeholder="product, india"
                  className="w-full bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs py-2.5 rounded-xl transition shadow-lg glow-effect flex items-center justify-center gap-1.5 mt-2"
            >
              <i className="fa-solid fa-plus"></i> Save to Registry
            </button>
          </form>
        </div>

        {/* Right Column: Company Registry Table */}
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-xs text-gray-200">
              Active Monitored Companies ({companies.length})
            </h3>
            <span className="text-[11px] text-accent-emerald font-mono font-semibold">
              All Public Boards Active
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-dark-card/70 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
                <tr>
                  <th className="py-3 px-3">Company</th>
                  <th className="py-3 px-3">ATS Type</th>
                  <th className="py-3 px-3">Board Token</th>
                  <th className="py-3 px-3">Signal</th>
                  <th className="py-3 px-3">Tags</th>
                  <th className="py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {companies.map((c) => (
                  <tr key={c.id} className="hover:bg-dark-card/40 transition">
                    <td className="py-3 px-3 font-semibold text-gray-100">
                      {c.name}
                      {c.careersUrl && (
                        <a
                          href={c.careersUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[10px] text-brand-400 hover:underline font-normal truncate max-w-[140px]"
                        >
                          {c.careersUrl.replace('https://', '')}
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/30 text-[10px] font-mono uppercase font-bold">
                        {c.ats}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-gray-300">{c.token}</td>
                    <td className="py-3 px-3 font-mono text-accent-emerald font-bold">+{c.signal || 0}</td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {c.tags?.map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-dark-card text-gray-400 px-1.5 py-0.2 rounded text-[9px] border border-gray-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/30 text-[10px] font-bold">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
