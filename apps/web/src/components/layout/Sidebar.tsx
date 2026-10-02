import React from 'react';
import type { NavTabId } from '../../types';

interface SidebarProps {
  currentTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  pendingInboxCount: number;
  totalOpportunityCount: number;
  unreadMessagesCount: number;
  connectedPlatformsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingInboxCount,
  totalOpportunityCount,
  unreadMessagesCount,
  connectedPlatformsCount = 6,
}) => {
  const navItems: {
    id: NavTabId;
    label: string;
    icon: string;
    color?: string;
    badge?: string | number;
    badgeColor?: string;
  }[] = [
    {
      id: 'apply',
      label: 'Apply Pipeline',
      icon: 'fa-solid fa-rocket',
      color: 'text-accent-emerald',
    },
    {
      id: 'dashboard',
      label: 'Analytics & Control',
      icon: 'fa-solid fa-chart-pie',
      color: 'text-brand-400',
    },
    {
      id: 'inbox',
      label: 'Approval Inbox (Core)',
      icon: 'fa-solid fa-inbox',
      color: 'text-accent-amber',
      badge: pendingInboxCount > 0 ? pendingInboxCount : undefined,
      badgeColor: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
    },
    {
      id: 'feed',
      label: 'Opportunity Match Feed',
      icon: 'fa-solid fa-briefcase',
      color: 'text-brand-300',
      badge: totalOpportunityCount,
      badgeColor: 'bg-brand-500/20 text-brand-300 border-brand-500/30',
    },
    {
      id: 'companies',
      label: 'Target Company Registry',
      icon: 'fa-solid fa-building',
      color: 'text-blue-400',
    },
    {
      id: 'integrations',
      label: 'Platform Integrations & Auth',
      icon: 'fa-solid fa-key',
      color: 'text-accent-cyan',
      badge: `${connectedPlatformsCount} Active`,
      badgeColor: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30',
    },
    {
      id: 'outreach',
      label: 'Auto-Outreach Studio',
      icon: 'fa-solid fa-paper-plane',
      color: 'text-accent-purple',
    },
    {
      id: 'synthesizer',
      label: 'ATS Material Synthesizer',
      icon: 'fa-solid fa-wand-magic-sparkles',
      color: 'text-accent-cyan',
    },
    {
      id: 'unified-inbox',
      label: 'Unified Inbox & Sentiment',
      icon: 'fa-solid fa-envelope-open-text',
      color: 'text-emerald-400',
      badge: unreadMessagesCount > 0 ? `${unreadMessagesCount} New` : undefined,
      badgeColor: 'bg-accent-emerald/20 text-accent-emerald border-accent-emerald/30',
    },
    {
      id: 'extension',
      label: 'Extension Bridge Runner',
      icon: 'fa-brands fa-chrome',
      color: 'text-accent-emerald',
    },
    {
      id: 'profile',
      label: 'Candidate Fact Table',
      icon: 'fa-solid fa-user-shield',
      color: 'text-rose-400',
    },
    {
      id: 'audit',
      label: 'Audit Log & Events',
      icon: 'fa-solid fa-list-check',
      color: 'text-gray-400',
    },
  ];

  return (
    <aside className="w-16 md:w-64 border-r border-gray-800 bg-[#070a12]/80 flex flex-col justify-between py-4 flex-shrink-0 z-20 overflow-y-auto custom-scrollbar">
      <nav className="space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                isActive
                  ? 'bg-brand-500/15 border-l-2 border-brand-500 text-brand-300 font-semibold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-dark-card/60'
              }`}
            >
              <i className={`${item.icon} text-sm w-5 text-center ${item.color || 'text-gray-400'}`}></i>
              <span className="hidden md:inline truncate">{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={`hidden md:inline-block ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    item.badgeColor || 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Safety Governor & Rate Limit Monitor Card */}
      <div className="px-3 hidden md:block mt-4">
        <div className="glass-panel p-3.5 rounded-xl border border-gray-800 text-xs space-y-2.5">
          <div className="flex justify-between items-center text-gray-300 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5">
              <i className="fa-solid fa-shield-halved text-accent-emerald"></i> Daily Safety Governor
            </span>
            <span className="text-accent-emerald font-mono">4 / 12 Apps</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-brand-500 to-accent-emerald h-full rounded-full transition-all duration-500"
              style={{ width: '33%' }}
            ></div>
          </div>
          <div className="flex justify-between items-center text-[10px] text-gray-500 pt-0.5">
            <span className="font-mono">Gaussian: μ=4.5s</span>
            <span className="text-accent-emerald flex items-center gap-1">
              <i className="fa-solid fa-circle-check"></i> 0 Flags
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
