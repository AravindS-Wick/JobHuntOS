import React, { useState, useRef } from 'react';
import type { RecruiterContact, OutreachPreset } from '../types';
import { OUTREACH_PRESETS } from '../lib/mockData';
import { useToast } from '../components/common/Toast';
import { appStore } from '../lib/api';

interface OutreachStudioViewProps {
  recruiters: RecruiterContact[];
  onDispatchOutreach: (name: string, company: string) => void;
}

export const OutreachStudioView: React.FC<OutreachStudioViewProps> = ({
  recruiters,
  onDispatchOutreach,
}) => {
  const { showToast } = useToast();
  const [selectedChannel, setSelectedChannel] = useState<'linkedin' | 'cutshort' | 'gmail'>('linkedin');
  const [presets, setPresets] = useState<Record<string, OutreachPreset>>({ ...OUTREACH_PRESETS });
  const [templateText, setTemplateText] = useState(OUTREACH_PRESETS.linkedin.bodyTemplate);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const currentPreset = presets[selectedChannel];

  const handleChannelChange = (channel: 'linkedin' | 'cutshort' | 'gmail') => {
    setSelectedChannel(channel);
    setTemplateText(presets[channel].bodyTemplate);
  };

  const handleInsertTag = (tag: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const updated = templateText.substring(0, start) + tag + templateText.substring(end);
    setTemplateText(updated);
    showToast(`Inserted dynamic tag ${tag}`, 'info', 'fa-code');
  };

  const handleSavePreset = () => {
    setPresets((prev) => ({
      ...prev,
      [selectedChannel]: {
        ...prev[selectedChannel],
        bodyTemplate: templateText,
      },
    }));
    showToast('Saved outreach template preset!', 'success', 'fa-floppy-disk');
  };

  const handleAiRefine = async () => {
    setIsAiGenerating(true);
    showToast('Synthesizing AI outreach variant with prompt caching...', 'cyan', 'fa-wand-magic-sparkles');

    const key = appStore.geminiApiKey;
    if (key) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are an expert tech recruiter advisor. Rewrite this ${selectedChannel} outreach pitch for candidate Aravindhan Sivaraman (Senior Full-Stack Lead, 5.5+ YOE) to be concise, impactful, and under ${
                        selectedChannel === 'linkedin' ? '300 characters' : '500 characters'
                      }:\n\n${templateText}`,
                    },
                  ],
                },
              ],
            }),
          },
        );
        const data = await response.json();
        const generated = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generated) {
          setTemplateText(generated.trim());
        }
      } catch (err: any) {
        showToast('Gemini API error: ' + err.message, 'warning');
      }
    } else {
      await new Promise((r) => setTimeout(r, 700));
      if (selectedChannel === 'linkedin') {
        setTemplateText(
          'Hi {first_name}, impressed by your engineering team at {company}. I bring 5.5+ YOE in production React/TypeScript & high-throughput Node.js systems ({top_skill}). Would love to share a 1-page systems breakdown if open to connecting!',
        );
      } else if (selectedChannel === 'cutshort') {
        setTemplateText(
          'Hello {first_name},\n\nI applied for {role} at {company}. My background aligns directly with your stack in {top_skill} and distributed message queues. Scaled scrapers to 50k requests/day with 0 flags. Would love to talk!',
        );
      }
    }

    setIsAiGenerating(false);
    showToast('AI Outreach variant refined!', 'success', 'fa-bolt');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-paper-plane text-accent-purple"></i> Multi-Channel Recruiter Outreach & Template Studio
          </h2>
          <p className="text-xs text-gray-400">
            PRD Module E: Multi-touch cadence (Gmail Cold Pitch → LinkedIn InMail → Cutshort Ping) with strict approval gates.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 rounded-full bg-accent-purple/10 text-accent-purple border border-accent-purple/30 text-xs font-mono font-bold">
            Cadence Queue: Active
          </span>
          <button
            onClick={() => showToast('Dispatched sequence step to all target contacts!', 'cyan', 'fa-play')}
            className="bg-gradient-to-r from-accent-purple to-brand-600 hover:from-accent-purple hover:to-brand-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-lg glow-effect flex items-center gap-2"
          >
            <i className="fa-solid fa-play"></i> Run Multi-Touch Sequence
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Template Editor & Dynamic Tags */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
          <div className="flex justify-between items-center border-b border-gray-800 pb-3">
            <h3 className="font-bold text-xs text-gray-200 flex items-center gap-1.5">
              <i className="fa-solid fa-sliders text-accent-cyan"></i> Channel Preset
            </h3>
            <select
              value={selectedChannel}
              onChange={(e) => handleChannelChange(e.target.value as any)}
              className="bg-dark-card border border-gray-800 text-xs rounded-lg px-2.5 py-1 text-gray-300 focus:outline-none font-semibold"
            >
              <option value="linkedin">LinkedIn InMail / Note</option>
              <option value="cutshort">Cutshort Direct Ping</option>
              <option value="gmail">Gmail Cold Pitch</option>
            </select>
          </div>

          {/* Dynamic Template Variables */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1.5">Available Dynamic Variables</label>
            <div className="flex flex-wrap gap-1.5">
              {['{first_name}', '{company}', '{role}', '{top_skill}', '{mutual_repo}', '{github_url}'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleInsertTag(tag)}
                  className="text-[10px] bg-brand-500/15 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 px-2 py-0.5 rounded font-mono transition"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Template Body */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Reusable Template Body</label>
            <textarea
              ref={textareaRef}
              rows={8}
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              className="w-full bg-dark-card border border-gray-800 rounded-xl p-3 text-xs text-gray-200 focus:outline-none focus:border-accent-purple font-mono custom-scrollbar"
            />
            <div className="flex justify-between items-center text-[11px] text-gray-400 mt-1 font-mono">
              <span>Length: <strong className="text-white">{templateText.length}</strong> chars</span>
              <span className="text-accent-emerald">{currentPreset.constraint}</span>
            </div>
          </div>

          <div className="flex space-x-2 pt-1">
            <button
              type="button"
              onClick={handleSavePreset}
              className="flex-1 bg-dark-card border border-gray-700 hover:border-accent-purple text-xs text-gray-200 py-2 rounded-xl transition font-semibold"
            >
              Save Preset
            </button>
            <button
              type="button"
              onClick={handleAiRefine}
              disabled={isAiGenerating}
              className="bg-gradient-to-r from-accent-purple to-accent-cyan text-white text-xs px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 shadow-md"
            >
              <i className={`fa-solid fa-wand-magic-sparkles ${isAiGenerating ? 'animate-spin' : ''}`}></i> AI Refine
            </button>
          </div>
        </div>

        {/* Right Column: Cadence Schedule & Recruiter Contacts */}
        <div className="lg:col-span-2 space-y-5">
          {/* Cadence Schedule Visualizer */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs text-gray-200 flex items-center gap-1.5">
                <i className="fa-solid fa-clock-rotate-left text-accent-amber"></i> Automated Multi-Touch Schedule
              </h3>
              <span className="text-[10px] text-gray-400 font-mono">Rate Limit: ≤15 cold emails/day</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-3 rounded-xl bg-dark-card border border-brand-500/40 space-y-1">
                <span className="text-[10px] text-brand-400 font-bold block">STEP 1 (Day 0)</span>
                <p className="font-semibold text-gray-200">
                  <i className="fa-solid fa-envelope text-red-400 mr-1"></i> Gmail Pitch
                </p>
                <span className="text-[10px] text-gray-500">Includes Tailored PDF</span>
              </div>
              <div className="p-3 rounded-xl bg-dark-card border border-gray-800 space-y-1">
                <span className="text-[10px] text-accent-purple font-bold block">STEP 2 (Day +2)</span>
                <p className="font-semibold text-gray-200">
                  <i className="fa-brands fa-linkedin text-blue-400 mr-1"></i> InMail Note
                </p>
                <span className="text-[10px] text-gray-500">Residential Browser</span>
              </div>
              <div className="p-3 rounded-xl bg-dark-card border border-gray-800 space-y-1">
                <span className="text-[10px] text-accent-cyan font-bold block">STEP 3 (Day +4)</span>
                <p className="font-semibold text-gray-200">
                  <i className="fa-solid fa-bolt text-rose-400 mr-1"></i> Cutshort Direct
                </p>
                <span className="text-[10px] text-gray-500">Session Cookie Intercept</span>
              </div>
              <div className="p-3 rounded-xl bg-dark-card border border-gray-800 space-y-1">
                <span className="text-[10px] text-accent-emerald font-bold block">STEP 4 (Day +7)</span>
                <p className="font-semibold text-gray-200">
                  <i className="fa-solid fa-paper-plane text-emerald-400 mr-1"></i> Follow-up
                </p>
                <span className="text-[10px] text-gray-500">Auto-Check Inbox Reply</span>
              </div>
            </div>
          </div>

          {/* Enriched Recruiter Directory */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs text-gray-200">Enriched Decision Makers & Recruiter Targets</h3>
              <button
                onClick={() => showToast('Target profile dialog opened', 'info', 'fa-user-plus')}
                className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
              >
                <i className="fa-solid fa-plus"></i> Add Contact
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-dark-card/70 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
                  <tr>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3">Company & Role</th>
                    <th className="py-2.5 px-3">Channels</th>
                    <th className="py-2.5 px-3">Cadence Status</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {recruiters.map((rec) => (
                    <tr key={rec.id} className="hover:bg-dark-card/40 transition">
                      <td className="py-3 px-3 font-semibold text-gray-100">
                        {rec.name}
                        <span className="block text-[10px] text-gray-500 font-normal font-mono">{rec.email}</span>
                      </td>
                      <td className="py-3 px-3">
                        <strong className="text-gray-200">{rec.company}</strong>
                        <span className="block text-[10px] text-gray-400">{rec.role}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex space-x-1 text-xs">
                          {rec.channels.includes('linkedin') && (
                            <i className="fa-brands fa-linkedin text-blue-400" title="LinkedIn Available"></i>
                          )}
                          {rec.channels.includes('gmail') && (
                            <i className="fa-solid fa-envelope text-red-400" title="Gmail Verified"></i>
                          )}
                          {rec.channels.includes('cutshort') && (
                            <i className="fa-solid fa-bolt text-rose-400" title="Cutshort Direct"></i>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald text-[10px] font-semibold">
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => onDispatchOutreach(rec.name, rec.company)}
                          className="text-[11px] bg-brand-600/20 text-brand-300 border border-brand-500/30 px-2.5 py-1 rounded hover:bg-brand-600/40 transition font-semibold"
                        >
                          Dispatch Next
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
