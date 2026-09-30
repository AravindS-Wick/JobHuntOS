import React, { useState } from 'react';
import type { Event } from '@jobhunt/contracts';
import { formatTimeAgo } from '../lib/utils';

interface AuditLogViewProps {
  events: Event[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ events }) => {
  const [filterType, setFilterType] = useState('all');

  const filteredEvents = events.filter((e) => {
    if (filterType === 'all') return true;
    return e.entityType.toLowerCase() === filterType.toLowerCase();
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-bold text-base text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-list-check text-gray-400"></i> Full Audit Log & System Event Trace
          </h2>
          <p className="text-xs text-gray-400">
            PRD Module H5: Complete traceability of every autonomous agent action and human decision.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-dark-card border border-gray-800 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none"
          >
            <option value="all">All Event Types</option>
            <option value="job">Job Status / Score</option>
            <option value="ingest">Ingestion Runs</option>
            <option value="company">Company Registry</option>
            <option value="outreach">Outreach Dispatch</option>
          </select>
        </div>
      </div>

      {/* Events Table */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-dark-card/70 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Payload Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-mono">
              {filteredEvents.map((evt) => {
                const isAgent = evt.actor === 'agent';
                return (
                  <tr key={evt.id} className="hover:bg-dark-card/40 transition">
                    <td className="py-3 px-4 text-gray-400 text-[11px] whitespace-nowrap">
                      {formatTimeAgo(evt.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                          isAgent
                            ? 'bg-brand-500/15 text-brand-300 border-brand-500/30'
                            : 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                        }`}
                      >
                        {evt.actor}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-300 uppercase font-semibold text-[11px]">
                      {evt.entityType}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-200">
                      {evt.action}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-gray-400 max-w-xs truncate">
                      {evt.payload ? JSON.stringify(evt.payload) : '—'}
                    </td>
                  </tr>
                );
              })}

              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500 font-sans text-xs">
                    No audit events found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
