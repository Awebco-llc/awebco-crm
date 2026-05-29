'use client';

import React, { useState, useEffect } from 'react';
import { Company, Contact, TeamMember, Ticket } from './Shared';
import { subscribeAllTickets } from '@/lib/crmStore';

const WORKSPACE_SERVICES: Array<{ key: keyof Company; label: string }> = [
  { key: 'web', label: 'Websites' },
  { key: 'dp', label: 'Design & Print' },
  { key: 'seo', label: 'SEO' },
  { key: 'll', label: 'Local Listings' },
  { key: 'ppc', label: 'Google Ads' },
  { key: 'smm', label: 'Social Media Management' },
  { key: 'sma', label: 'Social Media Ads' },
  { key: 'support', label: 'Support Tickets' },
];

function formatDeadline(value?: string) {
  if (!value) return '-';

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function isCompletedStatus(status?: string) {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s === 'done' || 
    s === 'complete' || 
    s === 'completed' || 
    s === 'needs invoiced' || 
    s === 'invoiced' || 
    s === 'closed' || 
    s === 'completed / launched' || 
    s === 'launched'
  );
}

export default function MyTasksView({
  teamMembers,
  companies,
  contacts,
  currentUserId,
  onOpenTask
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  contacts: Contact[],
  currentUserId: string | undefined,
  onOpenTask?: (navName: string, rowId: string) => void
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    if (!currentUserId) return;
    
    const unsub = subscribeAllTickets((allTickets) => {
      setTickets(allTickets);
    }, (err) => {
      console.error('Failed to subscribe to all tickets inside MyTasksView:', err);
    });

    return () => unsub();
  }, [currentUserId]);

  if (!currentUserId) {
    return (
      <div className="flex-grow flex items-center justify-center bg-gray-50">
        <div className="p-8 bg-white rounded-lg border border-[#E2E4E9] text-center max-w-sm">
          <h2 className="text-xl font-bold text-[#1C1F23] mb-2">No Matching Profile</h2>
          <p className="text-sm text-[#8E9299]">
            Your email doesn&apos;t match any team member in the system. Contact an admin to add you.
          </p>
        </div>
      </div>
    );
  }

  // Filter tickets where user is listed in assignees array OR in legacy assignee string
  const assignedTickets = tickets.filter(t => {
    if (t.assignees && Array.isArray(t.assignees)) {
      return t.assignees.includes(currentUserId);
    }
    return t.assignee === currentUserId;
  });

  const activeTickets = assignedTickets.filter(t => !isCompletedStatus(t.status));
  const completedTickets = assignedTickets.filter(t => isCompletedStatus(t.status));

  const displayTickets = activeTab === 'active' ? activeTickets : completedTickets;

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center px-6 shrink-0 justify-between">
        <h1 className="text-xl font-bold text-[#1C1F23]">My Tasks</h1>
        <div className="text-xs font-semibold text-[#8E9299] bg-gray-100 px-3 py-1 rounded-full">
          {activeTickets.length} Active Tasks • {completedTickets.length} Completed
        </div>
      </header>

      <div className="flex-grow p-6 overflow-auto space-y-8">
        {/* Section 1: Assigned Project & Support Tickets with Tab Headers */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <h2 className="text-lg font-bold text-[#1C1F23]">My Workspace Tasks & Tickets</h2>
            
            {/* Segmented Tab Controls */}
            <div className="flex border-b border-[#E2E4E9]">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'active'
                    ? 'border-[#1061E3] text-[#1061E3]'
                    : 'border-transparent text-[#8E9299] hover:text-[#1C1F23]'
                }`}
              >
                Active Tasks
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === 'active' ? 'bg-[#F0F5FF] text-[#1061E3]' : 'bg-gray-100 text-gray-600'
                }`}>
                  {activeTickets.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'completed'
                    ? 'border-[#1061E3] text-[#1061E3]'
                    : 'border-transparent text-[#8E9299] hover:text-[#1C1F23]'
                }`}
              >
                Completed & Invoiced
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === 'completed' ? 'bg-[#F0F5FF] text-[#1061E3]' : 'bg-gray-100 text-gray-600'
                }`}>
                  {completedTickets.length}
                </span>
              </button>
            </div>
          </div>

          {displayTickets.length === 0 ? (
            <div className="p-8 bg-white rounded-lg border border-dashed border-[#D0D5DD] text-center">
              <p className="text-sm text-[#8E9299]">
                {activeTab === 'active' ? 'You have no active tasks or support tickets assigned.' : 'No completed tasks or support tickets found.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#E2E4E9]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">PROJECT / TASK NAME</th>
                    <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">WORKSPACE</th>
                    <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">STATUS</th>
                    <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">PRIORITY</th>
                    <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEADLINE</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTickets.map(ticket => {
                    const isCompleted = isCompletedStatus(ticket.status);
                    const navName = ticket.workspace === 'Support Tickets' ? 'Tickets' : ticket.workspace;
                    const rowId = ticket.id;

                    const statusClass = isCompleted
                      ? 'bg-[#ECFDF3] text-[#10B981]'
                      : ticket.status?.toLowerCase() === 'in progress'
                        ? 'bg-[#EFF8FF] text-[#175CD3]'
                        : 'bg-gray-100 text-gray-700';

                    let priorityClass = 'bg-gray-50 text-gray-600 border border-gray-200';
                    if (ticket.priority?.toLowerCase() === 'high' || ticket.priority?.toLowerCase() === 'urgent') {
                      priorityClass = 'bg-[#FFEBEB] text-[#D32F2F] border border-[#FFCCD2]';
                    } else if (ticket.priority?.toLowerCase() === 'medium') {
                      priorityClass = 'bg-[#FFF9E6] text-[#D97706] border border-[#FFEBAE]';
                    }

                    return (
                      <tr
                        key={ticket.id}
                        className="border-b border-[#F0F2F5] hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => onOpenTask?.(navName, rowId)}
                      >
                        <td className="px-4 py-3 text-[13px] font-medium text-[#1C1F23]">
                          <div className="flex flex-col">
                            <span>{ticket.projectName}</span>
                            {ticket.companyName && (
                              <span className="text-[11px] text-[#8E9299] font-normal">{ticket.companyName}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-[#8E9299] font-medium">{ticket.workspace}</td>
                        <td className="px-4 py-3 text-[13px]">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${statusClass}`}>
                            {ticket.status || 'Not Started'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px]">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${priorityClass}`}>
                            {ticket.priority || 'Medium'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-[#8E9299]">{formatDeadline(ticket.deadline)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
