'use client';

import { ChevronDown, ChevronRight, MessageCircle, Plus } from 'lucide-react';
import { getStatusBadgeClasses, type Ticket, type TeamMember } from './Shared';

type BoardRow = Ticket;
type BoardGroup = { id: string; name: string };

export default function MobileWorkspaceBoard({
  groups, rowsForGroup, childrenForRow, expandedIds, collapsedGroupIds,
  toggleExpand, toggleGroup, onOpen, onConversation, onAddSubtask, teamMembers,
}: {
  groups: BoardGroup[];
  rowsForGroup: (groupId: string) => BoardRow[];
  childrenForRow: (rowId: string) => BoardRow[];
  expandedIds: Set<string>;
  collapsedGroupIds: Set<string>;
  toggleExpand: (id: string) => void;
  toggleGroup: (id: string) => void;
  onOpen: (id: string) => void;
  onConversation?: (id: string) => void;
  onAddSubtask: (id: string) => void;
  teamMembers: TeamMember[];
}) {
  function renderRow(row: BoardRow, ancestors = new Set<string>()) {
    // Guard against malformed ancestry without hiding otherwise valid tasks.
    if (ancestors.has(row.id)) return null;
    const nextAncestors = new Set(ancestors).add(row.id);
    const children = childrenForRow(row.id);
    const expanded = expandedIds.has(row.id);
    const assignees = row.assignees?.length ? row.assignees : row.assignee ? [row.assignee] : [];
    return (
      <li key={row.id} className="mobile-task-card rounded-xl border border-[#E2E4E9] bg-white p-3 space-y-2">
        <button type="button" onClick={() => onOpen(row.id)} className="w-full min-h-11 text-left">
          <span className="block font-semibold text-[#1C1F23] [overflow-wrap:anywhere]">{row.projectName || 'Untitled task'}</span>
          {row.companyName && <span className="block mt-1 text-sm text-[#4A4D53]">{row.companyName}</span>}
          <span className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <span className={`rounded px-2 py-1 font-semibold ${getStatusBadgeClasses(row.status || 'Not Started')}`}>{row.status || 'Not Started'}</span>
            {row.priority && <span>{row.priority} priority</span>}
            {row.deadline && <span>Due {row.deadline}</span>}
          </span>
          {!!assignees.length && <span className="block mt-2 text-xs text-[#4A4D53]">{assignees.map(id => teamMembers.find(member => member.id === id)?.name || id).join(', ')}</span>}
        </button>
        <div className="flex flex-wrap gap-1 border-t border-[#F0F2F5] pt-1">
          {!!children.length && <button type="button" aria-expanded={expanded} onClick={() => toggleExpand(row.id)} className="min-h-11 px-2 flex items-center gap-1 text-sm text-[#1061E3]">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{children.length} {children.length === 1 ? 'subtask' : 'subtasks'}
          </button>}
          <button type="button" onClick={() => onAddSubtask(row.id)} className="min-h-11 px-2 flex items-center gap-1 text-sm text-[#1061E3]"><Plus size={16} />Subtask</button>
          {onConversation && <button type="button" onClick={() => onConversation(row.id)} className="min-h-11 px-2 flex items-center gap-1 text-sm text-[#1061E3]"><MessageCircle size={16} />Client reply</button>}
        </div>
        {expanded && !!children.length && <ul className="space-y-2 border-l-2 border-blue-100 pl-2">{children.map(child => renderRow(child, nextAncestors))}</ul>}
      </li>
    );
  }

  return <div className="space-y-5" aria-label="Compact board">
    {groups.map(group => {
      const rows = rowsForGroup(group.id);
      const collapsed = collapsedGroupIds.has(group.id);
      return <section key={group.id} aria-label={group.name}>
        <h2><button type="button" aria-expanded={!collapsed} onClick={() => toggleGroup(group.id)} className="min-h-11 w-full flex items-center gap-2 text-left font-bold">
          {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}{group.name}<span className="ml-auto text-sm font-normal text-[#4A4D53]">{rows.length}</span>
        </button></h2>
        {!collapsed && (rows.length ? <ul className="space-y-3">{rows.map(row => renderRow(row))}</ul> : <p className="py-3 text-sm text-[#4A4D53]">No matching tasks in this group.</p>)}
      </section>;
    })}
  </div>;
}
