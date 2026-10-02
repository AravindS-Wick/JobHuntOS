import React, { useState } from 'react';
import type { NavTabId, PlatformId, PlatformAuthInfo } from './types';
import type { Job, Company } from '@jobhunt/contracts';
import { appStore } from './lib/api';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ToastContext, ToastContainer, type ToastItem } from './components/common/Toast';
import { Modal } from './components/common/Modal';

// Views
import { DashboardView } from './views/DashboardView';
import { ApprovalInboxView } from './views/ApprovalInboxView';
import { OpportunityFeedView } from './views/OpportunityFeedView';
import { CompanyRegistryView } from './views/CompanyRegistryView';
import { PlatformIntegrationsView } from './views/PlatformIntegrationsView';
import { OutreachStudioView } from './views/OutreachStudioView';
import { MaterialSynthesizerView } from './views/MaterialSynthesizerView';
import { UnifiedInboxView } from './views/UnifiedInboxView';
import { ExtensionRunnerView } from './views/ExtensionRunnerView';
import { ProfileFactTableView } from './views/ProfileFactTableView';
import { AuditLogView } from './views/AuditLogView';
import { ApplyPipelineView } from './views/ApplyPipelineView';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTabId>('apply');
  const [jobs, setJobs] = useState<Job[]>(appStore.jobs);
  const [companies, setCompanies] = useState<Company[]>(appStore.companies);
  const [stats, setStats] = useState(appStore.stats);
  const [events, setEvents] = useState(appStore.events);
  const [recruiters] = useState(appStore.recruiters);
  const [inbox] = useState(appStore.inbox);
  const [proxyHealth, setProxyHealth] = useState(appStore.proxyHealth);
  const [platforms, setPlatforms] = useState<PlatformAuthInfo[]>(appStore.platforms);
  const [isScraping, setIsScraping] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [synthesizerJob, setSynthesizerJob] = useState<Job | null>(null);

  // Toast Notification System
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (
    message: string,
    type: 'info' | 'success' | 'warning' | 'cyan' = 'info',
    icon?: string,
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastItem = { id, message, type, icon };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Sync state on load
  React.useEffect(() => {
    const sync = async () => {
      await appStore.init();
      setJobs([...appStore.jobs]);
      setCompanies([...appStore.companies]);
      setStats({ ...appStore.stats });
      setEvents([...appStore.events]);
      setPlatforms([...appStore.platforms]);
    };
    sync();
  }, []);

  // Handlers
  const handleUpdateJobStatus = async (
    jobId: string,
    status: 'to_apply' | 'queued' | 'applied' | 'skipped' | 'expired',
  ) => {
    await appStore.updateJobStatus(jobId, status);
    setJobs([...appStore.jobs]);
    setStats({ ...appStore.stats });
    setEvents([...appStore.events]);
  };

  const handleAddCompany = async (company: Omit<Company, 'id' | 'createdAt'>) => {
    await appStore.addCompany(company);
    setCompanies([...appStore.companies]);
    setStats({ ...appStore.stats });
    setEvents([...appStore.events]);
  };

  const handleUpdatePlatform = (id: PlatformId, updates: Partial<PlatformAuthInfo>) => {
    appStore.updatePlatformAuth(id, updates);
    setPlatforms([...appStore.platforms]);
    setEvents([...appStore.events]);
  };

  const handleTriggerIngest = async () => {
    setIsScraping(true);
    showToast('Ingest scraper initiated across active ATS boards...', 'cyan', 'fa-arrows-rotate');

    try {
      const res = await appStore.triggerIngest();
      setJobs([...appStore.jobs]);
      setStats({ ...appStore.stats });
      setEvents([...appStore.events]);
      setIsScraping(false);
      showToast(`Scraper ingested ${res.inserted || 3} new matching opportunities into queue!`, 'success', 'fa-circle-check');
    } catch (e: any) {
      setIsScraping(false);
      showToast('Ingest error: ' + e.message, 'warning');
    }
  };

  const handleDispatchApply = (job: Job) => {
    showToast(`Extension auto-filling application for ${job.title} @ ${job.company}`, 'success', 'fa-paper-plane');
  };

  const handleNavigateToSynthesizer = (job: Job) => {
    setSynthesizerJob(job);
    setCurrentTab('synthesizer');
  };

  const handleNavigateToOutreach = (job: Job) => {
    showToast(`Loaded recruiter outreach context for ${job.company}`, 'info', 'fa-paper-plane');
    setCurrentTab('outreach');
  };

  const pendingInboxCount = jobs.filter((j) => j.status === 'to_apply').length;
  const unreadMessagesCount = inbox.filter((m) => !m.read).length;
  const connectedPlatformsCount = platforms.filter((p) => p.status === 'connected').length;

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="h-screen overflow-hidden flex flex-col bg-[#070a12] text-gray-100 font-sans">
        {/* Header */}
        <Header
          onOpenExtensionModal={() => setIsExtensionModalOpen(true)}
          onTriggerScraper={handleTriggerIngest}
          onSelectTab={setCurrentTab}
          isScraping={isScraping}
        />

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <Sidebar
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            pendingInboxCount={pendingInboxCount}
            totalOpportunityCount={jobs.length}
            unreadMessagesCount={unreadMessagesCount}
            connectedPlatformsCount={connectedPlatformsCount}
          />

          {/* Scrollable Content View */}
          <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 bg-[#070a12]/40">
            {currentTab === 'dashboard' && (
              <DashboardView
                stats={stats}
                proxyHealth={proxyHealth}
                onRefreshHealth={() => setProxyHealth([...appStore.proxyHealth])}
                onNavigateTab={setCurrentTab}
              />
            )}

            {currentTab === 'inbox' && (
              <ApprovalInboxView
                jobs={jobs}
                onUpdateStatus={handleUpdateJobStatus}
                onNavigateToSynthesizer={handleNavigateToSynthesizer}
                onNavigateToOutreach={handleNavigateToOutreach}
              />
            )}

            {currentTab === 'feed' && (
              <OpportunityFeedView
                jobs={jobs}
                onUpdateStatus={handleUpdateJobStatus}
                onDispatchApply={handleDispatchApply}
              />
            )}

            {currentTab === 'companies' && (
              <CompanyRegistryView
                companies={companies}
                onAddCompany={handleAddCompany}
                onTriggerIngest={handleTriggerIngest}
              />
            )}

            {currentTab === 'integrations' && (
              <PlatformIntegrationsView
                platforms={platforms}
                onUpdatePlatform={handleUpdatePlatform}
              />
            )}

            {currentTab === 'outreach' && (
              <OutreachStudioView
                recruiters={recruiters}
                onDispatchOutreach={(name, company) => {
                  showToast(`Outreach sent to ${name} (${company})!`, 'success', 'fa-paper-plane');
                }}
              />
            )}

            {currentTab === 'synthesizer' && (
              <MaterialSynthesizerView initialJob={synthesizerJob} />
            )}

            {currentTab === 'unified-inbox' && (
              <UnifiedInboxView messages={inbox} />
            )}

            {currentTab === 'extension' && <ExtensionRunnerView />}

            {currentTab === 'profile' && <ProfileFactTableView />}

            {currentTab === 'audit' && <AuditLogView events={events} />}
            {currentTab === 'apply' && <ApplyPipelineView />}
          </main>
        </div>

        {/* Global Toast Container */}
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

        {/* Extension Bridge Info Modal */}
        <Modal
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
          title="JobHunt OS — Manifest V3 Extension Bridge"
          subtitle="Client-side residential automation without headless browser bot detection"
          icon="fa-brands fa-chrome"
          iconColor="text-brand-400"
        >
          <div className="space-y-4 text-xs text-gray-300">
            <p className="leading-relaxed">
              JobHunt OS runs browser form-fills strictly through your own local Chrome profile. It communicates with
              the local Fastify bridge on <code className="text-brand-300 bg-black/40 px-1.5 py-0.5 rounded font-mono">localhost:4000/ws</code>.
            </p>
            <div className="p-3.5 bg-dark-card rounded-xl border border-gray-800 space-y-1.5 font-mono text-[11px]">
              <p className="text-accent-emerald flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check"></i> Residential Session Fingerprint: Active
              </p>
              <p className="text-accent-cyan flex items-center gap-1.5">
                <i className="fa-solid fa-shield-halved"></i> Daily Quotas: LinkedIn 12 / Naukri 30 / ATS 15
              </p>
              <p className="text-accent-purple flex items-center gap-1.5">
                <i className="fa-solid fa-clock"></i> Gaussian Delay Model: Enabled (μ=4.5s, σ=1.2s)
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setIsExtensionModalOpen(false);
                  setCurrentTab('extension');
                }}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold transition shadow-lg glow-effect"
              >
                Open Extension Runner Studio &rarr;
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </ToastContext.Provider>
  );
};
