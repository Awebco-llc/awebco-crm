'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Company, Contact, TeamMember, Ticket } from './Shared';
import { subscribeAllTickets } from '@/lib/crmStore';
import { ChevronUp, ChevronDown, ChevronsUpDown, Calendar, List, Clock, AlertCircle } from 'lucide-react';

const CATEGORIES = [
  { id: 'Overdue', label: 'Overdue', colorClass: 'border-red-200 bg-red-50/50 text-red-700', badgeClass: 'bg-red-100 text-red-800' },
  { id: 'Today', label: 'Today', colorClass: 'border-amber-200 bg-amber-50/50 text-amber-700', badgeClass: 'bg-amber-100 text-amber-800' },
  { id: 'Tomorrow', label: 'Tomorrow', colorClass: 'border-blue-200 bg-blue-50/50 text-blue-700', badgeClass: 'bg-blue-100 text-blue-800' },
  { id: 'This Week', label: 'This Week', colorClass: 'border-indigo-200 bg-indigo-50/50 text-indigo-700', badgeClass: 'bg-indigo-100 text-indigo-800' },
  { id: 'Next Week', label: 'Next Week', colorClass: 'border-purple-200 bg-purple-50/50 text-purple-700', badgeClass: 'bg-purple-100 text-purple-800' },
  { id: 'This Month', label: 'This Month', colorClass: 'border-slate-200 bg-slate-50 text-slate-700', badgeClass: 'bg-slate-100 text-slate-800' },
  { id: 'Next Month', label: 'Next Month', colorClass: 'border-gray-200 bg-gray-50 text-gray-700', badgeClass: 'bg-gray-100 text-gray-800' },
  { id: 'Later', label: 'Later', colorClass: 'border-gray-100 bg-gray-50/50 text-gray-500', badgeClass: 'bg-gray-100 text-gray-600' },
  { id: 'No Deadline', label: 'No Deadline', colorClass: 'border-gray-100 bg-gray-50/50 text-gray-400', badgeClass: 'bg-[#F0F2F5] text-gray-500' },
];

function getDeadlineCategory(deadlineStr?: string): string {
  if (!deadlineStr) return 'No Deadline';

  const date = new Date(`${deadlineStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No Deadline';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'Overdue';
  } else if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Tomorrow';
  }

  const currentDayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
  const daysToSaturday = 6 - currentDayOfWeek;
  
  if (diffDays <= daysToSaturday) {
    return 'This Week';
  }

  const daysToNextSaturday = daysToSaturday + 7;
  if (diffDays <= daysToNextSaturday) {
    return 'Next Week';
  }

  const lastDayOfThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysToMonthEnd = lastDayOfThisMonth - today.getDate();
  if (diffDays <= daysToMonthEnd) {
    return 'This Month';
  }

  const lastDayOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const diffTimeToNextMonthEnd = lastDayOfNextMonth.getTime() - today.getTime();
  const daysToNextMonthEnd = Math.ceil(diffTimeToNextMonthEnd / (1000 * 60 * 60 * 24));
  if (diffDays <= daysToNextMonthEnd) {
    return 'Next Month';
  }

  return 'Later';
}

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
  const [viewMode, setViewMode] = useState<'list' | 'deadline'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('awebco_tasks_view_mode') as 'list' | 'deadline') || 'list';
    }
    return 'list';
  });

  useEffect(() => {
    localStorage.setItem('awebco_tasks_view_mode', viewMode);
  }, [viewMode]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Overdue: true,
    Today: true,
    Tomorrow: true,
    'This Week': true,
    'Next Week': false,
    'This Month': false,
    'Next Month': false,
    Later: false,
    'No Deadline': false,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

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

  const deadlineCategories = useMemo(() => {
    const categories: Record<string, Ticket[]> = {
      Overdue: [],
      Today: [],
      Tomorrow: [],
      'This Week': [],
      'Next Week': [],
      'This Month': [],
      'Next Month': [],
      Later: [],
      'No Deadline': [],
    };

    activeTickets.forEach(ticket => {
      const cat = getDeadlineCategory(ticket.deadline);
      if (categories[cat]) {
        categories[cat].push(ticket);
      } else {
        categories['No Deadline'].push(ticket);
      }
    });

    return categories;
  }, [activeTickets]);

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
            
            <div className="flex items-center gap-4 flex-wrap">
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

              {/* View Mode Toggle (only show when Active Tasks is active) */}
              {activeTab === 'active' && (
                <div className="flex items-center bg-[#F0F2F5] p-0.5 rounded-lg border border-[#E2E4E9]">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      viewMode === 'list'
                        ? 'bg-white text-[#1061E3] shadow-sm'
                        : 'text-[#8E9299] hover:text-[#1C1F23]'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('deadline')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      viewMode === 'deadline'
                        ? 'bg-white text-[#1061E3] shadow-sm'
                        : 'text-[#8E9299] hover:text-[#1C1F23]'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Deadlines
                  </button>
                </div>
              )}
            </div>
          </div>

          {activeTab === 'active' && activeTickets.length === 0 ? (
            <div className="p-8 bg-white rounded-lg border border-dashed border-[#D0D5DD] text-center">
              <p className="text-sm text-[#8E9299]">
                You have no active tasks or support tickets assigned.
              </p>
            </div>
          ) : activeTab === 'completed' && completedTickets.length === 0 ? (
            <div className="p-8 bg-white rounded-lg border border-dashed border-[#D0D5DD] text-center">
              <p className="text-sm text-[#8E9299]">
                No completed tasks or support tickets found.
              </p>
            </div>
          ) : viewMode === 'deadline' && activeTab === 'active' ? (
            <div className="space-y-4">
              {CATEGORIES.map(cat => {
                const list = deadlineCategories[cat.id] || [];
                if (list.length === 0 && cat.id === 'Overdue') {
                  return null;
                }
                const isExpanded = expandedSections[cat.id] ?? false;

                return (
                  <div key={cat.id} className="border border-[#E2E4E9] rounded-xl overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    {/* Header */}
                    <button
                      type="button"
                      onClick={() => toggleSection(cat.id)}
                      className={`w-full px-5 py-3.5 flex items-center justify-between transition-colors border-l-4 ${cat.colorClass} border-l-current select-none`}
                    >
                      <div className="flex items-center gap-2.5 font-bold text-sm">
                        {cat.id === 'Overdue' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        <span>{cat.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cat.badgeClass}`}>
                          {list.length}
                        </span>
                      </div>
                      <div className="text-gray-400">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>

                    {/* Content */}
                    {isExpanded && (
                      <div className="p-4 bg-[#F9FAFB] border-t border-[#E2E4E9]">
                        {list.length === 0 ? (
                          <p className="text-xs text-[#8E9299] py-2 px-1">No tasks in this group.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {list.map(ticket => {
                              const navName = ticket.workspace;
                              const rowId = ticket.id;

                              let priorityBorder = 'border-l-gray-300';
                              let priorityBadge = 'bg-gray-50 text-gray-600 border border-gray-200';
                              
                              if (ticket.priority?.toLowerCase() === 'high' || ticket.priority?.toLowerCase() === 'urgent') {
                                priorityBorder = 'border-l-red-500';
                                priorityBadge = 'bg-[#FFEBEB] text-[#D32F2F] border border-[#FFCCD2]';
                              } else if (ticket.priority?.toLowerCase() === 'medium') {
                                priorityBorder = 'border-l-amber-500';
                                priorityBadge = 'bg-[#FFF9E6] text-[#D97706] border border-[#FFEBAE]';
                              } else if (ticket.priority?.toLowerCase() === 'low') {
                                priorityBorder = 'border-l-blue-500';
                                priorityBadge = 'bg-[#EFF8FF] text-[#175CD3] border border-[#B2DDFF]';
                              }

                              const statusClass = ticket.status?.toLowerCase() === 'in progress'
                                ? 'bg-[#EFF8FF] text-[#175CD3]'
                                : 'bg-gray-100 text-gray-700';

                              return (
                                <div
                                  key={ticket.id}
                                  onClick={() => onOpenTask?.(navName, rowId)}
                                  className={`bg-white p-4 rounded-xl border border-[#E2E4E9] ${priorityBorder} border-l-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 group`}
                                >
                                  {/* Workspace & Priority */}
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-[#1061E3] bg-[#F0F5FF] px-2.5 py-0.5 rounded-full select-none">
                                      {ticket.workspace}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${priorityBadge}`}>
                                      {ticket.priority || 'Medium'}
                                    </span>
                                  </div>

                                  {/* Title & Company */}
                                  <div>
                                    <h4 className="text-[13px] font-semibold text-[#1C1F23] group-hover:text-[#1061E3] transition-colors line-clamp-2">
                                      {ticket.projectName}
                                    </h4>
                                    {ticket.companyName && (
                                      <p className="text-[11px] text-[#8E9299] mt-0.5 truncate">{ticket.companyName}</p>
                                    )}
                                  </div>

                                  {/* Footer: Status & Deadline */}
                                  <div className="flex items-center justify-between border-t border-gray-50 pt-2.5 mt-1 flex-wrap gap-2">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${statusClass}`}>
                                      {ticket.status || 'Not Started'}
                                    </span>
                                    {ticket.deadline && (
                                      <div className="flex items-center gap-1 text-[11px] text-[#8E9299]">
                                        <Clock className="w-3 h-3" />
                                        <span>{formatDeadline(ticket.deadline)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
