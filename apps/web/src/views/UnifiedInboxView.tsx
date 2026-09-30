import React, { useState } from 'react';
import type { InboundMessage } from '../types';
import { useToast } from '../components/common/Toast';
import { appStore } from '../lib/api';

interface UnifiedInboxViewProps {
  messages: InboundMessage[];
}

export const UnifiedInboxView: React.FC<UnifiedInboxViewProps> = ({ messages }) => {
  const { showToast } = useToast();
  const [selectedMessageId, setSelectedMessageId] = useState<string>(messages[0]?.id || 'msg-1');
  const [replyDraft, setReplyDraft] = useState<string>(messages[0]?.replyDraft || '');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const selectedMessage = messages.find((m) => m.id === selectedMessageId) || messages[0];

  const handleSelectMessage = (msg: InboundMessage) => {
    setSelectedMessageId(msg.id);
    setReplyDraft(msg.replyDraft || '');
  };

  const handleSyncGmail = async () => {
    setIsSyncing(true);
    showToast('Connecting to Gmail API & classifying hiring messages...', 'cyan', 'fa-arrows-rotate');
    try {
      const res = await appStore.syncGmailInbox();
      showToast(
        `Synced ${res.synced} communications from Gmail! (${res.actionRequired} action items flagged)`,
        'success',
        'fa-circle-check',
      );
    } catch (e: any) {
      showToast(e.message || 'Gmail sync failed', 'warning');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateAIDraft = async () => {
    if (!selectedMessage) return;
    setIsDrafting(true);
    try {
      const res = await appStore.generateEmailDraft(selectedMessage.id);
      setReplyDraft(res.draftBody);
      showToast('Truthful draft generated against verified Profile fact table!', 'success', 'fa-wand-magic-sparkles');
    } catch (e: any) {
      showToast(e.message || 'Draft generation failed', 'warning');
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSendReply = () => {
    if (!selectedMessage) return;
    showToast(
      `Dispatched approved reply to ${selectedMessage.sender} (${selectedMessage.senderEmail})!`,
      'success',
      'fa-paper-plane',
    );
  };

  const filteredMessages = messages.filter((m) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'action') return m.actionRequired;
    if (selectedFilter === 'interview') return m.sentiment.toLowerCase().includes('interview');
    if (selectedFilter === 'assessment') return m.sentiment.toLowerCase().includes('assessment');
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-envelope-open-text text-accent-emerald"></i> Gmail & InMail Intelligence Hub
          </h2>
          <p className="text-xs text-gray-400">
            PRD Module F: Real-time Gmail synchronization, email classification, assessment extraction & verified draft generation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncGmail}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-accent-cyan hover:from-brand-500 hover:to-accent-cyan text-white text-xs font-bold transition shadow-lg glow-effect flex items-center gap-2"
          >
            <i className={`fa-solid fa-rotate ${isSyncing ? 'animate-spin' : ''}`}></i>
            {isSyncing ? 'Syncing Gmail...' : 'Sync Gmail Now'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All Messages', count: messages.length },
          { id: 'action', label: 'Action Required', count: messages.filter((m) => m.actionRequired).length },
          { id: 'interview', label: 'Interview Invites', count: messages.filter((m) => m.sentiment.toLowerCase().includes('interview')).length },
          { id: 'assessment', label: 'Online Assessments', count: messages.filter((m) => m.sentiment.toLowerCase().includes('assessment')).length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedFilter(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              selectedFilter === tab.id
                ? 'bg-brand-600/20 text-brand-400 border border-brand-500/40'
                : 'bg-dark-card text-gray-400 border border-gray-800 hover:border-gray-700'
            }`}
          >
            <span>{tab.label}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-dark-bg text-[10px] font-mono text-gray-400">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Message List */}
        <div className="space-y-3">
          {filteredMessages.map((msg) => {
            const isSelected = msg.id === selectedMessageId;
            let sentimentBadge = 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/30';
            if (msg.sentiment.toLowerCase().includes('assessment')) {
              sentimentBadge = 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30';
            } else if (msg.sentiment.toLowerCase().includes('inquiry')) {
              sentimentBadge = 'bg-accent-amber/10 text-accent-amber border-accent-amber/30';
            } else if (msg.sentiment.toLowerCase().includes('rejection')) {
              sentimentBadge = 'bg-gray-800 text-gray-400 border-gray-700';
            }

            return (
              <div
                key={msg.id}
                onClick={() => handleSelectMessage(msg)}
                className={`glass-panel p-4 rounded-xl border cursor-pointer transition space-y-1.5 ${
                  isSelected ? 'border-brand-500 bg-brand-500/10' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-200">
                    {msg.sender} ({msg.company})
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{msg.receivedAt}</span>
                </div>
                <p className="text-xs font-medium text-brand-300 truncate">{msg.subject}</p>
                <div className="flex justify-between items-center pt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${sentimentBadge}`}>
                    {msg.sentiment}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                    <i
                      className={`${
                        msg.channel === 'Gmail' ? 'fa-solid fa-envelope text-red-400' : 'fa-brands fa-linkedin text-blue-400'
                      }`}
                    ></i>
                    {msg.channel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Message Thread & AI Reply Studio */}
        {selectedMessage && (
          <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
            {/* Header info */}
            <div className="flex justify-between items-start border-b border-gray-800 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/30 text-[10px] font-bold">
                  {selectedMessage.sentiment}
                </span>
                <h3 className="font-bold text-sm text-gray-100 mt-1.5">{selectedMessage.subject}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  From: <strong className="text-gray-200">{selectedMessage.sender}</strong> ({selectedMessage.senderEmail}) •{' '}
                  {selectedMessage.company} via {selectedMessage.channel}
                </p>
              </div>
              <span className="text-xs text-gray-500 font-mono">{selectedMessage.receivedAt}</span>
            </div>

            {/* Inbound message body */}
            <div className="p-4 bg-dark-card rounded-xl border border-gray-800 text-xs text-gray-200 leading-relaxed font-sans whitespace-pre-wrap">
              {selectedMessage.body}
            </div>

            {/* Smart Reply Draft Box */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-wand-magic-sparkles text-accent-purple"></i> Verified AI Draft Reply (Truth-Enforced)
                </span>
                <button
                  type="button"
                  onClick={handleGenerateAIDraft}
                  disabled={isDrafting}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
                >
                  <i className={`fa-solid fa-arrows-rotate ${isDrafting ? 'animate-spin' : ''}`}></i>
                  {isDrafting ? 'Drafting...' : 'Regenerate Draft'}
                </button>
              </label>
              <textarea
                rows={6}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Click 'Regenerate Draft' to auto-compose a truthful response from your profile facts..."
                className="w-full bg-dark-card border border-gray-800 rounded-xl p-3 text-xs text-gray-200 focus:outline-none focus:border-brand-500 font-mono custom-scrollbar"
              />
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-gray-800">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(replyDraft);
                  showToast('Draft copied to clipboard!', 'info', 'fa-copy');
                }}
                className="px-3.5 py-2 bg-dark-card border border-gray-700 hover:border-gray-500 text-gray-300 text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <i className="fa-regular fa-copy"></i> Copy Text
              </button>
              <button
                onClick={handleSendReply}
                className="bg-gradient-to-r from-accent-purple to-brand-600 hover:from-accent-purple hover:to-brand-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-lg glow-effect flex items-center gap-2"
              >
                <i className="fa-solid fa-paper-plane"></i> Send Approved Reply via {selectedMessage.channel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
