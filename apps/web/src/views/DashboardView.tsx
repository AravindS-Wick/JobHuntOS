import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import type { StatsResponse } from '@jobhunt/contracts';
import type { ProxyHealthItem, NavTabId } from '../types';
import { useToast } from '../components/common/Toast';

Chart.register(...registerables);

interface DashboardViewProps {
  stats: StatsResponse;
  proxyHealth: ProxyHealthItem[];
  onRefreshHealth: () => void;
  onNavigateTab: (tab: NavTabId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  proxyHealth,
  onRefreshHealth,
  onNavigateTab,
}) => {
  const { showToast } = useToast();
  const velocityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const portalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const velocityChartInstance = useRef<Chart | null>(null);
  const portalChartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    // 1. Velocity Chart
    if (velocityCanvasRef.current) {
      if (velocityChartInstance.current) {
        velocityChartInstance.current.destroy();
      }

      const ctx = velocityCanvasRef.current.getContext('2d');
      if (ctx) {
        velocityChartInstance.current = new Chart(ctx, {
          type: 'line',
          data: {
            labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7', 'Day 8', 'Day 9', 'Day 10', 'Day 11', 'Day 12', 'Day 13', 'Today'],
            datasets: [
              {
                label: 'Applications Reviewed / Sent',
                data: [4, 6, 8, 12, 10, 15, 14, 18, 20, 16, 22, 19, 24, 28],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                tension: 0.35,
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#818cf8',
              },
              {
                label: 'Recruiter Callback & Interview Invites',
                data: [0, 0, 1, 1, 2, 1, 3, 2, 4, 3, 5, 4, 6, 8],
                borderColor: '#10b981',
                backgroundColor: 'transparent',
                tension: 0.35,
                borderWidth: 2,
                borderDash: [4, 4],
                pointRadius: 4,
                pointBackgroundColor: '#10b981',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: {
                  color: '#9ca3af',
                  font: { size: 11, family: 'Inter' },
                  boxWidth: 12,
                },
              },
              tooltip: {
                backgroundColor: '#0f172a',
                borderColor: '#374151',
                borderWidth: 1,
                titleColor: '#f3f4f6',
                bodyColor: '#cbd5e1',
                padding: 10,
              },
            },
            scales: {
              x: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6b7280', font: { size: 10 } },
              },
              y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6b7280', font: { size: 10 } },
              },
            },
          },
        });
      }
    }

    // 2. Portal Distribution Chart
    if (portalCanvasRef.current) {
      if (portalChartInstance.current) {
        portalChartInstance.current.destroy();
      }

      const ctx = portalCanvasRef.current.getContext('2d');
      if (ctx) {
        portalChartInstance.current = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Greenhouse ATS', 'Lever ATS', 'Ashby ATS', 'LinkedIn EasyApply', 'Naukri Direct'],
            datasets: [
              {
                data: [42, 24, 18, 10, 6],
                backgroundColor: ['#6366f1', '#a855f7', '#06b6d4', '#3b82f6', '#10b981'],
                borderColor: '#0f172a',
                borderWidth: 3,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#9ca3af',
                  font: { size: 10, family: 'Inter' },
                  boxWidth: 10,
                  padding: 12,
                },
              },
            },
            cutout: '70%',
          },
        });
      }
    }

    return () => {
      velocityChartInstance.current?.destroy();
      portalChartInstance.current?.destroy();
    };
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Stat Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Applications Sent */}
        <div
          onClick={() => onNavigateTab('inbox')}
          className="glass-panel glass-panel-interactive p-4 rounded-2xl border border-gray-800 cursor-pointer"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-400">Total Scored Opportunities</p>
              <h3 className="text-2xl font-bold text-white mt-1">{stats.jobs.total}</h3>
              <p className="text-[11px] text-brand-300 mt-1 font-medium flex items-center gap-1">
                <i className="fa-solid fa-arrow-trend-up"></i> {stats.jobs.byTier['1'] || 0} Tier 1 Matches
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shadow-md">
              <i className="fa-solid fa-briefcase text-lg"></i>
            </div>
          </div>
        </div>

        {/* Recruiter Response Rate */}
        <div
          onClick={() => onNavigateTab('unified-inbox')}
          className="glass-panel glass-panel-interactive p-4 rounded-2xl border border-gray-800 cursor-pointer"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-400">Interview Invites Received</p>
              <h3 className="text-2xl font-bold text-white mt-1">3 Active</h3>
              <p className="text-[11px] text-accent-emerald mt-1 font-medium flex items-center gap-1">
                <i className="fa-solid fa-circle-check"></i> 8.4% Callback Rate (Target ≥8%)
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent-emerald/10 border border-accent-emerald/20 text-accent-emerald flex items-center justify-center shadow-md">
              <i className="fa-solid fa-calendar-check text-lg"></i>
            </div>
          </div>
        </div>

        {/* Target Companies */}
        <div
          onClick={() => onNavigateTab('companies')}
          className="glass-panel glass-panel-interactive p-4 rounded-2xl border border-gray-800 cursor-pointer"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-400">Target Companies Monitored</p>
              <h3 className="text-2xl font-bold text-white mt-1">{stats.companies.total}</h3>
              <p className="text-[11px] text-accent-cyan mt-1 font-medium flex items-center gap-1">
                <i className="fa-solid fa-bolt"></i> {stats.companies.enabled} Active Board Scrapers
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan flex items-center justify-center shadow-md">
              <i className="fa-solid fa-building text-lg"></i>
            </div>
          </div>
        </div>

        {/* Monthly Operating Expense */}
        <div className="glass-panel p-4 rounded-2xl border border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-400">Operating Cost Runway</p>
              <h3 className="text-2xl font-bold text-white mt-1">$0.00 / mo</h3>
              <p className="text-[11px] text-gray-400 mt-1 font-medium">Local Fastify + Residential IP</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent-amber/10 border border-accent-amber/20 text-accent-amber flex items-center justify-center shadow-md">
              <i className="fa-solid fa-wallet text-lg"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm text-gray-100 flex items-center gap-2">
                <i className="fa-solid fa-chart-line text-brand-400"></i> Application Velocity & Conversions
              </h3>
              <p className="text-xs text-gray-400">Daily reviewed submissions vs real recruiter interview invites</p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-lg bg-dark-card border border-gray-700 text-gray-300">
              14-Day Trajectory
            </span>
          </div>
          <div className="h-64">
            <canvas ref={velocityCanvasRef}></canvas>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm text-gray-100 flex items-center gap-2">
                <i className="fa-solid fa-chart-pie text-accent-purple"></i> Portal Sourcing Mix
              </h3>
              <p className="text-xs text-gray-400">≥60% direct careers page target</p>
            </div>
          </div>
          <div className="h-64 flex items-center justify-center">
            <canvas ref={portalCanvasRef}></canvas>
          </div>
        </div>
      </div>

      {/* Anti-Bot Rate Limit & Proxy Health Matrix */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="font-bold text-sm text-gray-100 flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-accent-emerald"></i> Portal Automation Engine & Rate Limit Governor Matrix
            </h3>
            <p className="text-xs text-gray-400">
              Deterministic daily caps (PRD §5.4 D5), Gaussian inter-action delays, and anti-detection telemetry
            </p>
          </div>
          <button
            onClick={() => {
              onRefreshHealth();
              showToast('Refreshed residential proxy health check matrix!', 'info', 'fa-arrows-rotate');
            }}
            className="text-xs bg-dark-card border border-gray-700 hover:border-brand-500 text-gray-300 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
          >
            <i className="fa-solid fa-arrows-rotate text-brand-400"></i> Refresh Health Check
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-dark-card/70 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
              <tr>
                <th className="py-3 px-4">Portal Platform</th>
                <th className="py-3 px-4">Integration Type</th>
                <th className="py-3 px-4">Daily Safety Cap</th>
                <th className="py-3 px-4">Used Today</th>
                <th className="py-3 px-4">Timing Delay Model</th>
                <th className="py-3 px-4">Security / Anti-Bot Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {proxyHealth.map((item, idx) => (
                <tr key={idx} className="hover:bg-dark-card/40 transition">
                  <td className="py-3 px-4 font-semibold flex items-center gap-2 text-gray-100">
                    <i className={`${item.icon} ${item.color} text-sm`}></i> {item.portal}
                  </td>
                  <td className="py-3 px-4 text-gray-300">{item.integration}</td>
                  <td className="py-3 px-4 font-mono">{item.dailyCap} Apps/day</td>
                  <td className="py-3 px-4">
                    <span className="text-accent-emerald font-bold font-mono">
                      {item.usedToday} / {item.dailyCap}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-gray-400">{item.delayModel}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald font-semibold text-[10px] flex items-center gap-1 w-max">
                      <i className="fa-solid fa-circle-check text-[9px]"></i> {item.status} ({item.flags} Flags)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
