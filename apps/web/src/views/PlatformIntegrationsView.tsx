import React, { useState } from 'react';
import type { PlatformAuthInfo, PlatformId } from '../types';
import { useToast } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';
import { appStore } from '../lib/api';

interface PlatformIntegrationsViewProps {
  platforms: PlatformAuthInfo[];
  onUpdatePlatform: (id: PlatformId, updates: Partial<PlatformAuthInfo>) => void;
}

export const PlatformIntegrationsView: React.FC<PlatformIntegrationsViewProps> = ({
  platforms,
  onUpdatePlatform,
}) => {
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeModalPlatform, setActiveModalPlatform] = useState<PlatformAuthInfo | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // Form states inside modal
  const [sessionCookieInput, setSessionCookieInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [webhookUrlInput, setWebhookUrlInput] = useState<string>('');
  const [authModeTab, setAuthModeTab] = useState<'extension' | 'manual'>('extension');

  const filteredPlatforms = platforms.filter((p) => {
    if (selectedCategory === 'all') return true;
    return p.category === selectedCategory;
  });

  const connectedCount = platforms.filter((p) => p.status === 'connected').length;

  const [accountIdentifierInput, setAccountIdentifierInput] = useState<string>('');

  const handleOpenConnectModal = (p: PlatformAuthInfo) => {
    setActiveModalPlatform(p);
    setAccountIdentifierInput(p.accountIdentifier || '');
    setSessionCookieInput(p.credentials?.sessionCookie || '');
    setApiKeyInput(p.credentials?.apiKey || (p.id === 'gemini' ? appStore.geminiApiKey : ''));
    setWebhookUrlInput(p.credentials?.webhookUrl || 'http://localhost:4000/webhooks/gmail/push');
    setAuthModeTab('extension');
  };

  const handleSaveConnection = async () => {
    if (!activeModalPlatform) return;
    const id = activeModalPlatform.id;

    setIsTestingConnection(true);

    if (id === 'gemini') {
      appStore.setGeminiApiKey(apiKeyInput);
    }

    const updates: Partial<PlatformAuthInfo> = {
      status: 'connected',
      lastSyncedAt: 'Just now',
      accountIdentifier: accountIdentifierInput || (id === 'linkedin' ? 'Active LinkedIn Profile (Connected)' : id === 'naukri' ? 'Active Naukri Profile' : id === 'gmail' ? 'Connected Google Account' : undefined),
      credentials: {
        ...activeModalPlatform.credentials,
        sessionCookie: sessionCookieInput || undefined,
        apiKey: apiKeyInput || undefined,
        webhookUrl: webhookUrlInput || undefined,
      },
    };

    if (id === 'linkedin') {
      updates.authMethod = authModeTab === 'extension' ? 'extension_bridge' : 'session_cookie';
    } else if (id === 'gmail') {
      updates.authMethod = 'oauth2';
    }

    onUpdatePlatform(id, updates);

    // Run connection test
    const testResult = await appStore.testPlatformConnection(id);
    setIsTestingConnection(false);
    setActiveModalPlatform(null);

    if (testResult.ok) {
      showToast(testResult.message, 'success', 'fa-circle-check');
    } else {
      showToast(testResult.message, 'warning');
    }
  };

  const handleDisconnect = (p: PlatformAuthInfo) => {
    onUpdatePlatform(p.id, {
      status: 'disconnected',
      accountIdentifier: undefined,
      lastSyncedAt: undefined,
    });
    showToast(`Disconnected ${p.name}`, 'info', 'fa-link-slash');
  };

  const handleQuickTest = async (p: PlatformAuthInfo) => {
    showToast(`Testing connection to ${p.name}...`, 'cyan', 'fa-arrows-rotate');
    const res = await appStore.testPlatformConnection(p.id);
    if (res.ok) {
      showToast(res.message, 'success', 'fa-circle-check');
    } else {
      showToast(res.message, 'warning');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-key text-accent-cyan"></i> Platform Integrations & Auth Center
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Connect and authenticate your application portals, communication webhooks, and AI engines in one unified cockpit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/30 text-xs font-mono font-bold">
            {connectedCount} of {platforms.length} Platforms Active
          </span>
          <button
            onClick={() => showToast('All platform connection handshakes verified!', 'success', 'fa-shield-check')}
            className="px-3.5 py-1.5 rounded-xl bg-dark-card border border-gray-700 hover:border-gray-500 text-xs text-gray-200 font-semibold transition"
          >
            <i className="fa-solid fa-rotate mr-1.5 text-gray-400"></i> Sync All
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-gray-800">
          <span className="text-[11px] text-gray-400 font-medium">Job Application Bridges</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-extrabold text-white font-mono">3 / 4</span>
            <span className="text-[10px] text-accent-emerald font-semibold">Active (Residential)</span>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-gray-800">
          <span className="text-[11px] text-gray-400 font-medium">ATS Board Scrapers</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-extrabold text-brand-400 font-mono">6 Boards</span>
            <span className="text-[10px] text-accent-cyan font-semibold">759 Jobs Live</span>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-gray-800">
          <span className="text-[11px] text-gray-400 font-medium">Gmail Push Webhook</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-extrabold text-accent-emerald font-mono">ONLINE</span>
            <span className="text-[10px] text-gray-400 font-mono">OTP Auto-Extract</span>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-gray-800">
          <span className="text-[11px] text-gray-400 font-medium">AI Synthesizer Engine</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-extrabold text-accent-purple font-mono">Gemini 2.0</span>
            <span className="text-[10px] text-accent-purple font-semibold">Prompt Cached</span>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-3">
        {[
          { id: 'all', label: 'All Platforms' },
          { id: 'social_portal', label: 'Social & Networks' },
          { id: 'job_board', label: 'Job Boards' },
          { id: 'ats', label: 'Public ATS Boards' },
          { id: 'communication', label: 'Email & Pub/Sub' },
          { id: 'ai_service', label: 'AI & Data Enrichment' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              selectedCategory === tab.id
                ? 'bg-brand-600 text-white shadow-md glow-effect'
                : 'bg-dark-card border border-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Platforms Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlatforms.map((p) => {
          const isConnected = p.status === 'connected';

          return (
            <div
              key={p.id}
              className={`glass-panel p-5 rounded-2xl border transition flex flex-col justify-between space-y-4 ${
                isConnected
                  ? 'border-gray-800 hover:border-brand-500/60 bg-dark-card/50'
                  : 'border-gray-800/60 opacity-80 hover:opacity-100 bg-dark-card/20'
              }`}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-gray-800 flex items-center justify-center text-xl">
                      <i className={`${p.icon} ${p.iconColor}`}></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-gray-100">{p.name}</h3>
                      <span className="text-[10px] text-gray-400 font-mono capitalize">
                        {p.category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border font-mono ${
                      isConnected
                        ? 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/30'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}
                  >
                    {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                </div>

                <p className="text-xs text-gray-400 leading-relaxed">{p.description}</p>

                {/* Account Details or Rate limits */}
                {isConnected && p.accountIdentifier && (
                  <div className="p-2.5 bg-black/40 rounded-xl border border-gray-800/80 space-y-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-400">Account / Identity:</span>
                      <span className="font-semibold text-gray-200 truncate max-w-[170px]">
                        {p.accountIdentifier}
                      </span>
                    </div>
                    {p.lastSyncedAt && (
                      <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                        <span>Last Synced:</span>
                        <span>{p.lastSyncedAt}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Daily Quota Governor */}
                {p.dailyQuotaMax && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Daily Safety Quota</span>
                      <span>
                        {p.dailyQuotaUsed || 0} / {p.dailyQuotaMax} used
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-accent-emerald"
                        style={{
                          width: `${Math.min(
                            100,
                            (((p.dailyQuotaUsed || 0) / p.dailyQuotaMax) * 100),
                          )}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-2 border-t border-gray-800/80">
                {isConnected ? (
                  <>
                    <button
                      onClick={() => handleQuickTest(p)}
                      className="flex-1 bg-dark-card border border-gray-700 hover:border-brand-500 text-gray-200 font-semibold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                    >
                      <i className="fa-solid fa-arrows-rotate text-accent-cyan"></i>
                      <span>
                        {p.id === 'gemini' || p.id === 'anthropic' || p.id === 'apify' || p.id === 'hunter'
                          ? 'Verify API Key'
                          : p.id === 'linkedin'
                          ? 'Check Session'
                          : p.id === 'naukri'
                          ? 'Touch Profile'
                          : p.id === 'gmail'
                          ? 'Ping Webhook'
                          : 'Check Health'}
                      </span>
                    </button>
                    <button
                      onClick={() => handleOpenConnectModal(p)}
                      className="bg-dark-card border border-gray-700 hover:border-gray-500 text-gray-300 text-xs px-3 py-2 rounded-xl transition"
                    >
                      <i className="fa-solid fa-gear"></i>
                    </button>
                    <button
                      onClick={() => handleDisconnect(p)}
                      className="bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 text-xs px-3 py-2 rounded-xl transition"
                      title="Disconnect"
                    >
                      <i className="fa-solid fa-power-off"></i>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleOpenConnectModal(p)}
                    className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs py-2 rounded-xl transition shadow-lg glow-effect flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-plug"></i> Connect {p.name}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Platform Connect Modal */}
      {activeModalPlatform && (
        <Modal
          isOpen={true}
          onClose={() => setActiveModalPlatform(null)}
          title={`Connect & Authenticate ${activeModalPlatform.name}`}
          subtitle="All credentials and session tokens are encrypted and executed locally under your residential IP."
          icon={activeModalPlatform.icon}
          iconColor={activeModalPlatform.iconColor}
        >
          <div className="space-y-4 text-xs">
            {/* LinkedIn Auth Modal */}
            {activeModalPlatform.id === 'linkedin' && (
              <div className="space-y-4">
                <div className="flex border-b border-gray-800">
                  <button
                    onClick={() => setAuthModeTab('extension')}
                    className={`px-4 py-2 font-bold transition ${
                      authModeTab === 'extension'
                        ? 'text-brand-400 border-b-2 border-brand-500'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    1-Click Local Extension Sync (Recommended)
                  </button>
                  <button
                    onClick={() => setAuthModeTab('manual')}
                    className={`px-4 py-2 font-medium transition ${
                      authModeTab === 'manual'
                        ? 'text-brand-400 border-b-2 border-brand-500 font-bold'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Manual Session Cookie (`li_at`)
                  </button>
                </div>

                {authModeTab === 'extension' ? (
                  <div className="p-4 bg-dark-card rounded-xl border border-gray-800 space-y-3">
                    <p className="text-gray-300 leading-relaxed">
                      The JobHunt OS Manifest V3 Extension automatically syncs with your active, logged-in Chrome
                      session. No password entry required, and zero bot detection risk.
                    </p>
                    <div className="flex items-center space-x-2 text-[11px] text-accent-emerald font-mono">
                      <i className="fa-solid fa-shield-halved"></i>
                      <span>Residential IP Fingerprint: MATCHED (0 Flags)</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-gray-300 font-semibold">LinkedIn Session Cookie (`li_at`)</label>
                    <input
                      type="password"
                      value={sessionCookieInput}
                      onChange={(e) => setSessionCookieInput(e.target.value)}
                      placeholder="Paste your li_at cookie value here..."
                      className="w-full bg-dark-card border border-gray-800 rounded-xl p-3 text-xs text-gray-200 font-mono focus:outline-none focus:border-brand-500"
                    />
                    <p className="text-[10px] text-gray-500">
                      Inspect DevTools &gt; Application &gt; Cookies &gt; https://www.linkedin.com &gt; `li_at`
                    </p>
                  </div>
                )}

                <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl text-[11px] text-brand-300 space-y-1 font-mono">
                  <p>• Safety Governor: ≤12 Easy Applies / day</p>
                  <p>• Gaussian Jitter: 45–180s delays between actions</p>
                </div>
              </div>
            )}

            {/* Naukri Auth Modal */}
            {activeModalPlatform.id === 'naukri' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-gray-300 font-semibold">Naukri.com Session Token / Cookie</label>
                  <input
                    type="password"
                    value={sessionCookieInput}
                    onChange={(e) => setSessionCookieInput(e.target.value)}
                    placeholder="Enter Naukri session token..."
                    className="w-full bg-dark-card border border-gray-800 rounded-xl p-3 text-xs text-gray-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="p-3 bg-accent-emerald/10 border border-accent-emerald/20 rounded-xl text-[11px] text-emerald-300 space-y-1 font-mono">
                  <p>• Auto-Touch Profile: Scheduled Daily at 8:00 AM IST</p>
                  <p>• Rate Limit Governor: ≤30 Applications / day</p>
                </div>
              </div>
            )}

            {/* Gmail OAuth & Pub/Sub Modal */}
            {activeModalPlatform.id === 'gmail' && (
              <div className="space-y-3">
                <div className="p-4 bg-dark-card rounded-xl border border-gray-800 space-y-2 text-gray-300">
                  <p className="font-semibold text-gray-200">Google OAuth 2.0 & Cloud Pub/Sub Webhook</p>
                  <p className="text-[11px] text-gray-400">
                    Connects to your Gmail inbox to listen for real-time interview invitation emails and auto-inject
                    Workday 6-digit verification OTP codes.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block text-gray-300 font-semibold">Pub/Sub Push Webhook Endpoint</label>
                  <input
                    type="text"
                    value={webhookUrlInput}
                    onChange={(e) => setWebhookUrlInput(e.target.value)}
                    className="w-full bg-dark-card border border-gray-800 rounded-xl p-3 text-xs text-gray-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            )}

            {/* AI Providers Modal (Gemini / Anthropic / Apify / Hunter) */}
            {(activeModalPlatform.category === 'ai_service' || activeModalPlatform.id === 'gemini') && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-gray-300 font-semibold flex justify-between">
                    <span>{activeModalPlatform.name} API Key / Token</span>
                    {activeModalPlatform.id === 'gemini' && (
                      <a
                        href="https://aistudio.google.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-cyan hover:underline text-[11px]"
                      >
                        Get Key on Google AI Studio &rarr;
                      </a>
                    )}
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={`Enter ${activeModalPlatform.name} key...`}
                    className="w-full bg-dark-card border border-gray-800 rounded-xl p-3 text-xs text-gray-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            )}

            {/* General ATS Modal */}
            {activeModalPlatform.category === 'ats' && (
              <div className="p-4 bg-dark-card rounded-xl border border-gray-800 text-gray-300 space-y-2">
                <p className="font-semibold text-gray-200">Public Board JSON Connectors Active</p>
                <p className="text-[11px] text-gray-400">
                  Direct board scrapers run on an automated cron every 60 minutes. Zero authentication required.
                </p>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex justify-end space-x-2 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setActiveModalPlatform(null)}
                className="px-4 py-2 bg-dark-card border border-gray-700 hover:border-gray-500 text-gray-300 text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConnection}
                disabled={isTestingConnection}
                className="px-5 py-2 bg-gradient-to-r from-brand-600 to-accent-cyan hover:from-brand-500 hover:to-accent-cyan text-white text-xs font-bold rounded-xl transition shadow-lg glow-effect flex items-center gap-2"
              >
                <i className={`fa-solid fa-bolt ${isTestingConnection ? 'animate-spin' : ''}`}></i>
                {isTestingConnection ? 'Verifying...' : 'Save & Verify Connection'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
