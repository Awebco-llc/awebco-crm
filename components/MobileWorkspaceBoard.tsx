'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Flag, ListTree, MessageCircle, MoreHorizontal, Plus, X } from 'lucide-react';
import { getStatusBadgeClasses, type Ticket, type TeamMember } from './Shared';

type BoardGroup = { id: string; name: string };

function shortDate(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MobileWorkspaceBoard({
  groups, rowsForGroup, childrenForRow, expandedIds, collapsedGroupIds,
  toggleExpand, toggleGroup, onOpen, onConversation, onAddSubtask, teamMembers,
}: {
  groups: BoardGroup[];
  rowsForGroup: (groupId: string) => Ticket[];
  childrenForRow: (rowId: string) => Ticket[];
  expandedIds: Set<string>;
  collapsedGroupIds: Set<string>;
  toggleExpand: (id: string) => void;
  toggleGroup: (id: string) => void;
  onOpen: (id: string) => void;
  onConversation?: (id: string) => void;
  onAddSubtask: (id: string) => void;
  teamMembers: TeamMember[];
}) {
  const [actionRow, setActionRow] = useState<Ticket | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (actionRow && dialog && !dialog.open) dialog.showModal();
    if (!actionRow && dialog?.open) dialog.close();
  }, [actionRow]);

  function act(callback: (id: string) => void) {
    if (!actionRow) return;
    const id = actionRow.id;
    setActionRow(null);
    callback(id);
  }

  function renderRow(row: Ticket, ancestors = new Set<string>()) {
    if (ancestors.has(row.id)) return null;
    const nextAncestors = new Set(ancestors).add(row.id);
    const children = childrenForRow(row.id);
    const expanded = expandedIds.has(row.id);
    const assignees = (row.assignees?.length ? row.assignees : row.assignee ? [row.assignee] : [])
      .map(id => teamMembers.find(member => member.id === id)).filter(member => !!member);
    const highPriority = ['high', 'urgent'].includes(row.priority?.toLowerCase() || '');
    return (
      <li key={row.id} className="mobile-task-card relative rounded-2xl border border-[#E8EBF0] bg-white">
        <button type="button" aria-label={`Open task: ${row.projectName || 'Untitled task'}`} onClick={() => onOpen(row.id)} className="block w-full min-w-0 rounded-2xl px-4 pt-3 pb-2 text-left focus-visible:outline-2 focus-visible:outline-[#1061E3]">
            <span className="block pr-10 text-[15px] leading-6 font-semibold text-[#1C1F23] [overflow-wrap:anywhere]">{row.projectName || 'Untitled task'}</span>
            {row.companyName && row.companyName !== row.projectName && <span className="block mt-0.5 pr-10 truncate text-xs text-[#777E8A]">{row.companyName}</span>}
        <span className="flex min-h-11 items-center gap-2 text-xs text-[#777E8A]">
          <span className={`max-w-[45%] truncate rounded-md px-2 py-1 font-medium ${getStatusBadgeClasses(row.status || 'Not Started')}`}>{row.status || 'Not Started'}</span>
          {highPriority && <Flag size={14} className="shrink-0 text-[#D97706]" role="img" aria-label={`${row.priority} priority`}><title>{row.priority} priority</title></Flag>}
          {row.deadline && <span className="flex min-w-0 items-center gap-1 whitespace-nowrap" title={`Due ${row.deadline}`}><CalendarDays size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">{shortDate(row.deadline)}</span></span>}
          <span className="ml-auto flex shrink-0 -space-x-1.5">
            {assignees.slice(0, 2).map(member => <span key={member.id} role="img" aria-label={member.name} title={member.name} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[8px] font-semibold text-white" style={{ backgroundColor: member.color || '#003366' }}>{member.initials}</span>)}
            {assignees.length > 2 && <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[8px]">+{assignees.length - 2}</span>}
          </span>
        </span>
        </button>
        <button type="button" aria-label={`Actions for ${row.projectName || 'Untitled task'}`} title="Task actions" aria-haspopup="dialog" onClick={() => setActionRow(row)} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-[#777E8A] active:bg-gray-100"><MoreHorizontal size={20} /></button>
        {!!children.length && <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${children.length} ${children.length === 1 ? 'subtask' : 'subtasks'} for ${row.projectName}`} aria-expanded={expanded} onClick={() => toggleExpand(row.id)} className="flex min-h-11 w-full items-center gap-2 border-t border-[#F0F2F5] px-4 text-xs text-[#777E8A]">
          <ListTree size={15} aria-hidden="true" /><span>{children.length}</span>{expanded ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
        </button>}
        {expanded && !!children.length && <ul className="space-y-2 border-t border-[#F0F2F5] bg-[#F7F8FA] p-2">{children.map(child => renderRow(child, nextAncestors))}</ul>}
      </li>
    );
  }

  return <>
    <div className="space-y-5" aria-label="Compact board">
      {groups.map(group => {
        const rows = rowsForGroup(group.id);
        const collapsed = collapsedGroupIds.has(group.id);
        return <section key={group.id} aria-label={group.name}>
          <h2><button type="button" aria-expanded={!collapsed} onClick={() => toggleGroup(group.id)} className="flex min-h-11 w-full items-center gap-2 px-1 text-left text-sm font-semibold text-[#4A4D53]">
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}{group.name}<span className="rounded-md bg-[#E9EDF3] px-1.5 py-0.5 text-[10px] text-[#777E8A]">{rows.length}</span>
          </button></h2>
          {!collapsed && (rows.length ? <ul className="space-y-2.5">{rows.map(row => renderRow(row))}</ul> : <p className="px-1 py-2 text-xs text-[#777E8A]">No tasks</p>)}
        </section>;
      })}
    </div>
    <dialog ref={dialogRef} aria-labelledby={titleId} className="mobile-task-actions" onClose={() => setActionRow(null)} onClick={event => { if (event.target === event.currentTarget) setActionRow(null); }}>
      {actionRow && <div className="p-5 pb-6" onClick={event => event.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3"><h2 id={titleId} className="flex-1 pt-2 text-base font-semibold text-[#1C1F23]">{actionRow.projectName || 'Untitled task'}</h2><button type="button" onClick={() => setActionRow(null)} aria-label="Close task actions" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[#777E8A]"><X size={18} /></button></div>
        <button type="button" onClick={() => act(onAddSubtask)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-gray-50"><Plus size={20} className="text-[#777E8A]" />Add subtask</button>
        {onConversation && <button type="button" onClick={() => act(onConversation)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-blue-50 text-[#1061E3]"><MessageCircle size={20} />Client conversation</button>}
      </div>}
    </dialog>
  </>;
}
