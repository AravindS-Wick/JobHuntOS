import React, { useState } from 'react';
import { useToast } from '../common/Toast';
import { appStore } from '../../lib/api';
import type { NavTabId } from '../../types';

interface HeaderProps {
  onOpenExtensionModal: () => void;
  onTriggerScraper: () => void;
  onSelectTab?: (tab: NavTabId) => void;
  isScraping: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenExtensionModal,
  onTriggerScraper,
  onSelectTab,
  isScraping,
}) => {
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState(appStore.geminiApiKey);
  const [showKey, setShowKey] = useState(false);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setApiKey(val);
    appStore.setGeminiApiKey(val);
  };

  const handleApiKeyBlur = () => {
    if (apiKey) {
      showToast('Gemini API key saved for live synthesis!', 'success', 'fa-key');
    }
  };

  return (
    <header className="h-16 border-b border-gray-800 bg-[#070a12]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 flex-shrink-0">
      <div className="flex items-center space-x-3 sm:space-x-4">
        <div
          onClick={() => onSelectTab?.('dashboard')}
          className="flex items-center space-x-3 cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 via-accent-purple to-accent-cyan flex items-center justify-center text-white shadow-lg glow-effect">
            <i className="fa-solid fa-robot text-base"></i>
          </div>
          <div>
            <h1 className="font-bold text-sm sm:text-base tracking-wide text-white flex items-center gap-2">
              JobHunt OS{' '}
              <span className="bg-gradient-to-r from-brand-400 via-accent-cyan to-accent-emerald bg-clip-text text-transparent text-[10px] sm:text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30">
                S-Tier Cockpit
              </span>
            </h1>
          </div>
        </div>
        <span className="h-5 w-px bg-gray-800 hidden lg:block"></span>

        {/* Platform Status Indicators */}
        <div className="hidden lg:flex items-center text-xs space-x-2">
          <button
            onClick={() => onSelectTab?.('integrations')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-card border border-gray-800 hover:border-gray-600 text-gray-300 transition"
            title={appStore.isBackendConnected ? 'Fastify API backend connected on port 4000' : 'API unreachable on port 4000 - showing built-in demo data'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                appStore.isBackendConnected ? 'bg-accent-emerald animate-pulse' : 'bg-red-500'
              }`}
            ></span>
            <span className="font-mono text-[11px]">{appStore.isBackendConnected ? 'API :4000' : 'API offline (demo data)'}</span>
          </button>

          <button
            onClick={() => onSelectTab?.('integrations')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-card border border-gray-800 hover:border-[#0A66C2]/60 text-gray-300 transition"
            title="LinkedIn Extension Session Bridge"
          >
            <i className="fa-brands fa-linkedin text-[#0A66C2]"></i>
            <span className="text-[11px]">LinkedIn</span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
          </button>

          <button
            onClick={() => onSelectTab?.('integrations')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-card border border-gray-800 hover:border-accent-emerald/60 text-gray-300 transition"
            title="Naukri.com Session Bridge"
          >
            <i className="fa-solid fa-briefcase text-accent-cyan"></i>
            <span className="text-[11px]">Naukri</span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
          </button>

          <button
            onClick={() => onSelectTab?.('integrations')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-card border border-gray-800 hover:border-red-500/60 text-gray-300 transition"
            title="Gmail Pub/Sub Webhook Active"
          >
            <i className="fa-solid fa-envelope text-[#EA4335]"></i>
            <span className="text-[11px]">Gmail</span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Global Gemini API Key Input */}
        <div className="relative hidden sm:block">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={handleApiKeyChange}
            onBlur={handleApiKeyBlur}
            placeholder="Gemini API Key (Optional)..."
            className="w-40 md:w-52 bg-dark-card border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand-500 transition font-mono pr-7"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-2 text-gray-500 hover:text-gray-300 text-xs"
            title={showKey ? 'Hide key' : 'Show key'}
          >
            <i className={`fa-solid ${showKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
          </button>
        </div>

        {/* Ingestion Trigger */}
        <button
          onClick={onTriggerScraper}
          disabled={isScraping}
          className="px-3 py-1.5 rounded-lg bg-brand-600/20 border border-brand-500/40 hover:bg-brand-600/30 text-xs text-brand-300 flex items-center gap-1.5 transition font-medium disabled:opacity-50"
        >
          <i className={`fa-solid fa-arrows-rotate ${isScraping ? 'animate-spin' : ''}`}></i>
          <span className="hidden md:inline">{isScraping ? 'Ingesting...' : 'Run Ingest Scraper'}</span>
        </button>

        {/* Extension Bridge Trigger */}
        <button
          onClick={onOpenExtensionModal}
          className="px-3 py-1.5 rounded-lg bg-dark-card border border-gray-700 hover:border-brand-500 text-xs text-gray-300 flex items-center gap-2 transition"
        >
          <i className="fa-brands fa-chrome text-brand-400"></i>
          <span className="hidden sm:inline">Extension Bridge</span>
          <span className="w-2 h-2 rounded-full bg-accent-emerald"></span>
        </button>

        {/* Candidate Profile Pill */}
        <div
          onClick={() => onSelectTab?.('profile')}
          className="flex items-center space-x-2 border-l border-gray-800 pl-3 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-accent-purple border border-brand-400 flex items-center justify-center text-xs font-bold text-white shadow-md">
            AS
          </div>
          <div className="hidden xl:block text-left">
            <p className="text-xs font-medium text-gray-200 leading-tight">Aravindhan S.</p>
            <p className="text-[10px] text-gray-400">Senior Full-Stack Lead</p>
          </div>
        </div>
      </div>
    </header>
  );
};
