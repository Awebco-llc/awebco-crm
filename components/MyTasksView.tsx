'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Company, Contact, TeamMember, Ticket } from './Shared';
import { subscribeAllTickets } from '@/lib/crmStore';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const WORKSPACE_SERVICES: Array<{ key: keyof Company; label: string }> = [
  { key: 'awebco', label: 'Awebco' },
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
    s === 'launched' ||
    s === 'running' ||
    s === 'live'
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
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('awebco_tasks_sort_config');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }
    }
    return null;
  });

  useEffect(() => {
    if (sortConfig) {
      localStorage.setItem('awebco_tasks_sort_config', JSON.stringify(sortConfig));
    } else {
      localStorage.removeItem('awebco_tasks_sort_config');
    }
  }, [sortConfig]);

  useEffect(() => {
    if (!currentUserId) return;
    
    const unsub = subscribeAllTickets((allTickets) => {
      setTickets(allTickets);
    }, (err) => {
      console.error('Failed to subscribe to all tickets inside MyTasksView:', err);
    });

    return () => unsub();
  }, [currentUserId]);

  // Filter tickets where user is listed in assignees array OR in legacy assignee string
  const assignedTickets = useMemo(() => {
    if (!currentUserId) return [];
    return tickets.filter(t => {
      if (t.assignees && Array.isArray(t.assignees)) {
        return t.assignees.includes(currentUserId);
      }
      return t.assignee === currentUserId;
    });
  }, [tickets, currentUserId]);

  const activeTickets = useMemo(() => {
    return assignedTickets.filter(t => !isCompletedStatus(t.status));
  }, [assignedTickets]);

  const completedTickets = useMemo(() => {
    return assignedTickets.filter(t => isCompletedStatus(t.status));
  }, [assignedTickets]);

  const displayTickets = activeTab === 'active' ? activeTickets : completedTickets;

  const sortedTickets = useMemo(() => {
    if (!sortConfig) return displayTickets;

    return [...displayTickets].sort((a, b) => {
      let aVal = '';
      let bVal = '';

      if (sortConfig.column === 'projectName') {
        aVal = a.projectName;
        bVal = b.projectName;
      } else if (sortConfig.column === 'workspace') {
        aVal = a.workspace;
        bVal = b.workspace;
      } else if (sortConfig.column === 'status') {
        aVal = a.status || '';
        bVal = b.status || '';
      } else if (sortConfig.column === 'priority') {
        const priorityWeight: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        const wA = priorityWeight[(a.priority || '').toLowerCase()] || 0;
        const wB = priorityWeight[(b.priority || '').toLowerCase()] || 0;
        return sortConfig.direction === 'asc' ? wA - wB : wB - wA;
      } else if (sortConfig.column === 'deadline') {
        const valA = a.deadline;
        const valB = b.deadline;
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;
        const timeA = new Date(valA).getTime();
        const timeB = new Date(valB).getTime();
        if (isNaN(timeA) && isNaN(timeB)) return 0;
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      }

      const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [displayTickets, sortConfig]);

  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  };

  const renderSortIcon = (column: string) => {
    if (sortConfig?.column === column) {
      return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />;
    }
    return <ChevronsUpDown className="w-3.5 h-3.5 text-[#C8CDD5] shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  };

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

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <header className="min-h-16 md:h-16 bg-white border-b border-[#E2E4E9] flex flex-col sm:flex-row items-stretch sm:items-center px-6 py-3 sm:py-0 shrink-0 justify-between gap-2">
        <h1 className="text-xl font-bold text-[#1C1F23]">My Tasks</h1>
        <div className="text-xs font-semibold text-[#8E9299] bg-gray-100 px-3 py-1 rounded-full w-fit">
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
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="sticky top-0 z-10 shadow-sm select-none">
                  <tr>
                    <th 
                      onClick={() => handleSort('projectName')}
                      className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                    >
                      <div className="flex items-center gap-1">
                        <span>PROJECT / TASK NAME</span>
                        {renderSortIcon('projectName')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('workspace')}
                      className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                    >
                      <div className="flex items-center gap-1">
                        <span>WORKSPACE</span>
                        {renderSortIcon('workspace')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('status')}
                      className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                    >
                      <div className="flex items-center gap-1">
                        <span>STATUS</span>
                        {renderSortIcon('status')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('priority')}
                      className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                    >
                      <div className="flex items-center gap-1">
                        <span>PRIORITY</span>
                        {renderSortIcon('priority')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('deadline')}
                      className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                    >
                      <div className="flex items-center gap-1">
                        <span>DEADLINE</span>
                        {renderSortIcon('deadline')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTickets.map(ticket => {
                    const isCompleted = isCompletedStatus(ticket.status);
                    const navName = ticket.workspace;
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
