'use client';

import React, { useState, useRef } from 'react';
import { Plus, GripHorizontal, GripVertical, X, Search, ChevronDown, ChevronRight, CornerDownRight, Trash2, Copy, Pencil, Paperclip, AtSign, File as FileIcon, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TeamMember, EditableStatus, EditablePriority, AssigneeDropdown, Company } from '@/components/Shared';

interface Column {
  id: string;
  header: string;
}

const INITIAL_COLUMNS: Column[] = [
  { id: 'projectName', header: 'Project Name' },
  { id: 'assignee', header: 'Assignee' },
  { id: 'status', header: 'Status' },
  { id: 'deadline', header: 'Deadline' },
  { id: 'url', header: 'URL' },
  { id: 'pastelUrl', header: 'Pastel URL' },
  { id: 'googleDriveUrl', header: 'Google Drive URL' },
  { id: 'notes', header: 'Notes' },
];

const INITIAL_DATA = [
  {
    id: '1',
    projectName: 'Acme Corp Website',
    assignee: '1',
    status: 'In Progress',
    deadline: '2026-05-01',
    url: 'https://acme.com',
    pastelUrl: 'https://pastel.com/acme',
    googleDriveUrl: 'https://drive.google.com/folderview?id=123',
    notes: 'Waiting on client assets',
  },
  {
    id: '2',
    projectName: 'Horizon Redesign',
    assignee: '2',
    status: 'Planning',
    deadline: '2026-06-15',
    url: 'https://horizon.co',
    pastelUrl: 'https://pastel.com/horizon',
    googleDriveUrl: 'https://drive.google.com/folderview?id=456',
    notes: 'Kickoff meeting next week',
  },
];

const SUPPORT_TICKETS_BOARD_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_TICKETS_EMAIL || 'tickets@awebco.com';

function SortableHeader({ column }: { column: Column }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] whitespace-nowrap group select-none uppercase"
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-[#8E9299] hover:text-[#1C1F23]">
          <GripHorizontal className="w-3.5 h-3.5" />
        </button>
        {column.header}
      </div>
    </th>
  );
}

const getColor = (str: string) => {
  const colors = ['#1061E3', '#10B981', '#F59E0B', '#D32F2F', '#8B5CF6', '#EC4899'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name?: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
};

function EditableCell({ value, onSave, renderValue }: { value: string, onSave: (val: string) => void, renderValue?: (val: string) => React.ReactNode }) {
  return (
    <div className="min-h-[20px] min-w-[50px] truncate" title={value || ''}>
      {renderValue ? renderValue(value) : (value || '-')}
    </div>
  );
}

function SortableRow({ row, columns, data, setData, setEditingRowId, teamMembers, expandedIds, toggleExpand, addSubRow, isSubRow = false, deleteRow, projectType, statusOptions, onContextMenu }: any) {
  const sortable = useSortable({ id: `row-${row.id}` });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : 1,
  };

  const isExpanded = expandedIds?.has(row.id);
  const subtaskCount = data.filter((item: any) => item.parentId === row.id).length;

  return (
    <tr 
      ref={isSubRow ? undefined : setNodeRef}
      style={style}
      onClick={() => setEditingRowId(row.id)}
      onContextMenu={(e) => onContextMenu?.(e, row.id, isSubRow)}
      className={`hover:bg-gray-50 transition-colors cursor-pointer group ${isSubRow ? 'bg-[#FAFAFA]' : ''}`}
    >
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
          <GripVertical className="w-4 h-4" />
        </div>
      </td>
      {columns.map((col: any) => (
        <td key={col.id} className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] whitespace-nowrap max-w-[200px] truncate relative">
          {col.id === 'status' ? (
            <EditableStatus 
              value={row[col.id]} 
              options={projectType === 'Local Listings'
                ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done']
                : row.parentId
                  ? (projectType === 'Local Listings'
                    ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done']
                    : ['Not Started', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'On Hold', 'Done'])
                  : (statusOptions || [])}
              onSave={(newVal) => {
                const newData = [...data];
                const rowIndex = newData.findIndex((r: any) => r.id === row.id);
                const updatedRow = { ...newData[rowIndex], [col.id]: newVal };
                if (projectType === 'Google Ads') {
                  updatedRow.groupId = newVal === 'Running' ? 'group-running' : 'group-active';
                } else if (newVal === 'Running') {
                  updatedRow.groupId = 'group-running';
                } else if (newVal === 'Needs Invoiced') {
                  updatedRow.groupId = 'group-needs-invoiced';
                } else if (newVal === 'S14: Launched' || newVal === 'Launched' || newVal === 'Done') {
                  updatedRow.groupId = 'group-completed';
                } else if (newData[rowIndex].groupId === 'group-needs-invoiced' || newData[rowIndex].groupId === 'group-completed' || newData[rowIndex].groupId === 'group-running') {
                  updatedRow.groupId = projectType === 'Local Listings' ? 'group-setup' : 'group-active';
                }
                newData[rowIndex] = updatedRow;
                setData(newData);
              }} 
            />
          ) : col.id === 'priority' ? (
            <EditablePriority value={row[col.id]} />
          ) : col.id === 'planType' ? (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <select
                value={row[col.id] || 'Basic Plan'}
                onChange={(e) => {
                  const newData = [...data];
                  const rowIndex = newData.findIndex((r: any) => r.id === row.id);
                  newData[rowIndex] = { ...newData[rowIndex], [col.id]: e.target.value };
                  setData(newData);
                }}
                className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1"
              >
                <option value="Basic Plan">Basic Plan</option>
                <option value="Plus Plan">Plus Plan</option>
              </select>
            </div>
          ) : col.id === 'assignee' ? (
            <AssigneeDropdown 
              value={row[col.id]} 
              onSave={(newVal) => {
                const newData = [...data];
                const rowIndex = newData.findIndex((r: any) => r.id === row.id);
                newData[rowIndex] = { ...newData[rowIndex], [col.id]: newVal };
                setData(newData);
              }} 
              teamMembers={teamMembers} 
            />
          ) : (
            <div className={`flex items-center gap-2 ${col.id === 'projectName' && isSubRow ? 'pl-6' : ''}`}>
              {col.id === 'projectName' && !isSubRow && (
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleExpand(row.id); }}
                  className="p-1 hover:bg-[#E2E4E9] rounded text-[#8E9299] hover:text-[#1C1F23] transition-colors -ml-1 shrink-0"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              {col.id === 'projectName' && isSubRow && (
                <CornerDownRight className="w-4 h-4 text-[#8E9299] shrink-0" />
              )}
              <EditableCell
                value={row[col.id]}
                onSave={(newVal) => {
                  const newData = [...data];
                  const rowIndex = newData.findIndex((r: any) => r.id === row.id);
                  newData[rowIndex] = { ...newData[rowIndex], [col.id]: newVal };
                  setData(newData);
                }}
                renderValue={
                  col.id === 'projectName' ? (v) => (
                    <div className="flex items-center gap-2 min-w-0">
                      <strong className={`truncate ${isSubRow ? 'font-medium text-[#4A4D53]' : ''}`}>{v}</strong>
                      {!isSubRow && subtaskCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-[#F0F2F5] text-[#4A4D53] text-[10px] font-semibold shrink-0">
                          {subtaskCount}
                        </span>
                      )}
                    </div>
                  ) : undefined
                }
              />
              {col.id === 'projectName' && !isSubRow && (
                <button
                  onClick={(e) => { e.stopPropagation(); addSubRow(row.id); }}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#E2E4E9] rounded text-[#1061E3] transition-colors ml-2 shrink-0 border border-transparent hover:border-[#1061E3]/20"
                  title="Add Sub Row"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </td>
      ))}
      <td className="px-4 py-3 border-b border-[#F0F2F5] text-right w-12">
        <button
          onClick={(e) => { e.stopPropagation(); deleteRow(row.id); }}
          className="p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Delete Row"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

function GroupDroppableBody({ groupId, children }: { groupId: string, children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `group-container-${groupId}` });
  return <tbody ref={setNodeRef} className="min-h-[50px] align-top">{children}</tbody>;
}

function GroupHeader({ group, onUpdate, onRemove }: { group: { id: string, name: string }, onUpdate: (id: string, name: string) => void, onRemove: (id: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);

  const save = () => {
    setIsEditing(false);
    if (name.trim()) onUpdate(group.id, name);
    else setName(group.name);
  };

  return (
    <div className="flex items-center justify-between mb-3 group/header">
      {isEditing ? (
        <input 
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="text-lg font-bold text-[#1C1F23] bg-transparent border-b border-[#1061E3] outline-none px-1 py-0 w-full max-w-sm"
        />
      ) : (
        <h2 
          onDoubleClick={() => setIsEditing(true)}
          className="text-lg font-bold text-[#1C1F23] cursor-text hover:bg-gray-100 rounded px-1 -ml-1 inline-block transition-colors"
          title="Double click to rename"
        >
          {group.name}
        </h2>
      )}
      <button 
        onClick={() => onRemove(group.id)}
        className="opacity-0 group-hover/header:opacity-100 p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors"
        title="Remove group"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function WorkspaceProjectView({
  teamMembers,
  companies,
  projectType,
  flagKey,
  currentUserName,
  currentUserId,
  openRowId,
  onMention,
  boardMemberships,
  setBoardMemberships,
  canManageBoardMembers,
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  projectType: string,
  flagKey: keyof Company,
  currentUserName: string,
  currentUserId?: string,
  openRowId?: string,
  onMention?: (text: string, sourceLabel: string, sourceTitle: string, actorName: string, actorId?: string) => void,
  boardMemberships: Record<string, string[]>,
  setBoardMemberships: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
  canManageBoardMembers: boolean,
}) {
  type EditTab = 'details' | 'description' | 'updates' | 'files';
  const [columns, setColumns] = useState<Column[]>(() => {
    if (projectType === 'Local Listings') {
      return [
        { id: 'projectName', header: 'Project Name' },
        { id: 'assignee', header: 'Assignee' },
        { id: 'status', header: 'Status' },
        { id: 'planType', header: 'Plan Type' }
      ];
    }
    if (projectType === 'Design & Print' || projectType === 'Support Tickets') {
      const filtered = INITIAL_COLUMNS.filter(c => c.id !== 'pastelUrl' && c.id !== 'googleDriveUrl');
      filtered.splice(5, 0, { id: 'billableHours', header: 'Billable Hours' });
      if (projectType === 'Support Tickets' || projectType === 'Design & Print') {
        filtered.splice(4, 0, { id: 'priority', header: 'Priority' });
      }
      return filtered;
    }
    if (projectType === 'SEO' || projectType === 'Google Ads') {
      return INITIAL_COLUMNS.filter(c => c.id !== 'pastelUrl');
    }
    return INITIAL_COLUMNS;
  });
  const [data, setData] = useState<any[]>([]);
  const [groups, setGroups] = useState<{id: string, name: string}[]>(() => {
    if (projectType === 'Local Listings') {
      return [
        { id: 'group-setup', name: 'Setup' },
        { id: 'group-running', name: 'Running' }
      ];
    }
    if (projectType === 'SEO' || projectType === 'Google Ads') {
      return [
        { id: 'group-active', name: 'Setup' },
        { id: 'group-running', name: 'Running' }
      ];
    }
    const defaultGroups = [
      { id: 'group-active', name: 'Active' }
    ];
    if (projectType === 'Design & Print' || projectType === 'Support Tickets') {
      defaultGroups.push({ id: 'group-needs-invoiced', name: 'Needs Invoiced' });
      defaultGroups.push({ id: 'group-completed', name: 'Complete' });
    } else {
      defaultGroups.push({ id: 'group-completed', name: 'Completed / Launched' });
    }
    return defaultGroups;
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [isAddColOpen, setIsAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowToDeleteId, setRowToDeleteId] = useState<string | null>(null);
  const [newUpdateText, setNewUpdateText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [activeEditTab, setActiveEditTab] = useState<EditTab>('details');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, isSubRow: boolean } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isBoardEmailOpen, setIsBoardEmailOpen] = useState(false);
  const [copiedBoardEmail, setCopiedBoardEmail] = useState(false);
  const [isBoardMembersOpen, setIsBoardMembersOpen] = useState(false);

  React.useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [contextMenu]);

  React.useEffect(() => {
    if (editingRowId) {
      setActiveEditTab('details');
    }
  }, [editingRowId]);

  React.useEffect(() => {
    if (openRowId && data.some(row => row.id === openRowId)) {
      setEditingRowId(openRowId);
    }
  }, [openRowId, data]);

  const getRowGroupId = (row: any) => {
    if (row.groupId) return row.groupId;
    if (row.status === 'Running') return 'group-running';
    if (projectType === 'Google Ads') return 'group-active';
    if (row.status === 'Needs Invoiced') return 'group-needs-invoiced';
    if (row.status === 'S14: Launched' || row.status === 'Launched' || row.status === 'Done') {
      return 'group-completed';
    }
    if (projectType === 'Local Listings') return 'group-setup';
    return 'group-active';
  };

  const getStatusOptions = () => {
    if (projectType === 'Local Listings') {
      return [
        'Not Started',
        'Setup',
        'In Progress',
        'Awaiting Customer',
        'Needs Invoiced',
        'Running',
        'On Hold',
        'Done'
      ];
    }
    if (projectType === 'Google Ads') {
      return [
        'Not Started',
        'Setup',
        'In Progress',
        'Awaiting Customer',
        'Needs Invoiced',
        'Running',
        'On Hold',
        'Done'
      ];
    }
    if (projectType === 'SEO' || projectType === 'Design & Print' || projectType === 'Support Tickets') {
      return [
        'Not Started',
        'In Progress',
        'Awaiting Customer',
        'Needs Invoiced',
        'On Hold',
        'Done'
      ];
    }
    return [
      'S7: Content Collection',
      'S8: Design',
      'S9: Design Proofing',
      'S10: Development',
      'S11: Development Proofing',
      'S12: Final Payment',
      'S13: Launch Checklist',
      'S14: Launched',
      'ON HOLD'
    ];
  };

  const statusOptions = getStatusOptions();
  const defaultStatus = statusOptions[0];

  React.useEffect(() => {
    setData((prev) => {
      const requiredIds = new Set(companies.filter(c => c[flagKey] && !deletedIds.has(c.id)).map(c => c.id));
      const newRows = companies
        .filter(c => c[flagKey] && !deletedIds.has(c.id) && !prev.some(r => r.id === c.id))
        .map(c => ({
          id: c.id,
          projectName: c.name + ' Project',
          assignee: c.assignedToId || teamMembers[0]?.id || '',
          status: defaultStatus,
          deadline: '',
          url: c.domain || '',
          description: '',
          pastelUrl: '',
          googleDriveUrl: '',
          notes: '',
          files: [],
          planType: projectType === 'Local Listings' ? 'Basic Plan' : undefined,
          priority: projectType === 'Support Tickets' || projectType === 'Design & Print' ? 'Medium' : undefined,
          groupId: projectType === 'Local Listings' ? 'group-setup' : 'group-active'
        }));
        
      const keptRows = prev.filter(r => r.isManual || requiredIds.has(r.id) || (r.parentId && prev.some(parent => parent.id === r.parentId && (parent.isManual || requiredIds.has(parent.id)))));
      return [...keptRows, ...newRows];
    });
  }, [companies, flagKey, teamMembers, deletedIds, defaultStatus, projectType]);

  const handleAddUpdate = (rowId: string) => {
    if (!newUpdateText.trim() && !attachedFile) return;

    const row = data.find(item => item.id === rowId);
    const author = currentUserName || teamMembers?.[0]?.name || 'You';
    const trimmedText = newUpdateText.trim();

    if (row && trimmedText) {
      onMention?.(trimmedText, 'Project Comment', `${projectType}: ${row.projectName}`, author, currentUserId);
    }
    
    setData(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      
      const newUpdate = {
        id: `update-${Date.now()}`,
        author,
        text: trimmedText,
        timestamp: new Date().toISOString(),
        attachment: attachedFile ? attachedFile.name : undefined
      };
      
      const next = [...prev];
      const updates = prev[idx].updates ? [...prev[idx].updates, newUpdate] : [newUpdate];
      next[idx] = { ...prev[idx], updates };
      return next;
    });
    
    setNewUpdateText('');
    setAttachedFile(null);
  };

  const handleAddProjectFile = (rowId: string, file: File) => {
    setData(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;

      const next = [...prev];
      const files = next[idx].files ? [...next[idx].files] : [];
      files.push({
        id: `file-${Date.now()}`,
        name: file.name,
        uploadedAt: new Date().toISOString(),
      });
      next[idx] = { ...next[idx], files };
      return next;
    });
  };

  const handleRemoveProjectFile = (rowId: string, fileId: string) => {
    setData(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        files: (row.files || []).filter((file: any) => file.id !== fileId)
      };
    }));
  };

  const deleteRow = (id: string) => {
    setData(prev => prev.filter(r => r.id !== id && r.parentId !== id));
    if (!String(id).startsWith('manual-')) {
      setDeletedIds(prev => new Set(prev).add(id));
    }
  };

  const duplicateRow = (id: string) => {
    setData(prev => {
      const rowToDuplicate = prev.find(r => r.id === id);
      if (!rowToDuplicate) return prev;

      const newRow = {
        ...rowToDuplicate,
        id: `dup-${Date.now()}`,
        projectName: `${rowToDuplicate.projectName} (Copy)`,
        isManual: true, // Duplicates are essentially manual items
      };

      const idx = prev.findIndex(r => r.id === id);
      const next = [...prev];
      // For groups/lists, inserting right after the original row
      next.splice(idx + 1, 0, newRow);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addSubRow = (parentId: string) => {
    setExpandedIds(prev => new Set(prev).add(parentId));
    
    // Find parent to inherit some properties
    const parent = data.find(r => r.id === parentId);

    const newSubRow = {
      id: `sub-${Date.now()}`,
      parentId,
      projectName: 'New Sub-Task',
      assignee: parent?.assignee || teamMembers[0]?.id || '',
      status: 'Not Started',
      deadline: '',
      url: '',
      description: '',
      notes: '',
      files: [],
      planType: projectType === 'Local Listings' ? 'Basic Plan' : undefined,
      priority: projectType === 'Support Tickets' || projectType === 'Design & Print' ? 'Medium' : undefined,
      groupId: parent?.groupId || (projectType === 'Local Listings' ? 'group-setup' : 'group-active')
    };
    
    setData(prev => {
      // Insert immediately after parent's last subrow or just after parent
      const parentIndex = prev.findIndex(r => r.id === parentId);
      if (parentIndex === -1) return prev;
      
      let insertIndex = parentIndex + 1;
      while (insertIndex < prev.length && prev[insertIndex].parentId === parentId) {
        insertIndex++;
      }
      
      const nextData = [...prev];
      nextData.splice(insertIndex, 0, newSubRow);
      return nextData;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    if (String(active.id).startsWith('row-')) {
       let targetGroupId: string | null = null;
       if (String(over.id).startsWith('row-')) {
         const overIdStr = String(over.id).replace('row-', '');
         const overData = data.find(r => r.id === overIdStr);
         if (overData) targetGroupId = getRowGroupId(overData);
       } else if (String(over.id).startsWith('group-container-')) {
         targetGroupId = String(over.id).replace('group-container-', '');
       }
       
       if (targetGroupId) {
          const activeIdStr = String(active.id).replace('row-', '');
          const activeData = data.find(r => r.id === activeIdStr);
          if (activeData && getRowGroupId(activeData) !== targetGroupId) {
            setData(prev => {
              const next = [...prev];
              const activeIndex = next.findIndex(r => r.id === activeIdStr);
              if (activeIndex !== -1) {
                next[activeIndex] = { ...next[activeIndex], groupId: targetGroupId };
              }
              return next;
            });
          }
       }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (String(active.id).startsWith('row-')) {
      setData((items) => {
        const oldIndex = items.findIndex((r) => `row-${r.id}` === active.id);
        const newIndex = items.findIndex((r) => `row-${r.id}` === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    } else {
      setColumns((items) => {
        const oldIndex = items.findIndex((col) => col.id === active.id);
        const newIndex = items.findIndex((col) => col.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    
    // Generate a simple camelCase ID from the column name
    const newColId = newColName
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
      
    // Ensure unique ID
    let finalId = newColId;
    let counter = 1;
    while (columns.some(c => c.id === finalId)) {
      finalId = `${newColId}${counter}`;
      counter++;
    }

    setColumns([...columns, { id: finalId, header: newColName }]);
    setNewColName('');
    setIsAddColOpen(false);
  };

  const handleAddWebsite = () => {
    const manualProject = {
      id: `manual-${Date.now()}`,
      projectName: 'New Manual Project',
      assignee: teamMembers[0]?.id || '',
      status: defaultStatus,
      deadline: '',
      url: '',
      description: '',
      notes: '',
      files: [],
      planType: projectType === 'Local Listings' ? 'Basic Plan' : undefined,
      priority: projectType === 'Support Tickets' || projectType === 'Design & Print' ? 'Medium' : undefined,
      isManual: true,
      groupId: projectType === 'Local Listings' ? 'group-setup' : 'group-active'
    };
    setData(prev => [manualProject, ...prev]);
  };

  const handleCopyBoardEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_TICKETS_BOARD_EMAIL);
      setCopiedBoardEmail(true);
      window.setTimeout(() => setCopiedBoardEmail(false), 1800);
    } catch (error) {
      console.error(error);
    }
  };

  const toggleBoardMember = (memberId: string) => {
    setBoardMemberships(prev => {
      const currentMemberIds = prev[projectType] || [];
      const isMember = currentMemberIds.includes(memberId);

      return {
        ...prev,
        [projectType]: isMember
          ? currentMemberIds.filter(id => id !== memberId)
          : [...currentMemberIds, memberId],
      };
    });
  };

  const boardMemberIds = boardMemberships[projectType] || [];
  const visibleBoardMembers = teamMembers.filter(member =>
    member.role === 'master_admin' || member.role === 'admin' || boardMemberIds.includes(member.id)
  );

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center justify-between px-6 shrink-0">
        <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
          <Search className="w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder={`Search in ${projectType}...`}
            className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
          />
        </div>
        <div className="flex gap-3">
          {canManageBoardMembers && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsBoardMembersOpen(prev => !prev)}
                className="h-[38px] px-3 rounded-md border border-[#E2E4E9] bg-white hover:bg-gray-50 transition-colors flex items-center"
                title="Manage board members"
              >
                <div className="flex -space-x-2">
                  {visibleBoardMembers.slice(0, 4).map(member => (
                    member.photoUrl ? (
                      <span
                        key={member.id}
                        className="w-7 h-7 rounded-full bg-cover bg-center border-2 border-white shadow-sm"
                        style={{ backgroundImage: `url(${member.photoUrl})` }}
                        title={member.name}
                      />
                    ) : (
                      <span
                        key={member.id}
                        className="w-7 h-7 rounded-full border-2 border-white shadow-sm inline-flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: member.color }}
                        title={member.name}
                      >
                        {member.initials}
                      </span>
                    )
                  ))}
                  {visibleBoardMembers.length > 4 && (
                    <span className="w-7 h-7 rounded-full border-2 border-white shadow-sm inline-flex items-center justify-center bg-[#F0F2F5] text-[#4A4D53] text-[10px] font-bold">
                      +{visibleBoardMembers.length - 4}
                    </span>
                  )}
                  {visibleBoardMembers.length === 0 && (
                    <span className="w-7 h-7 rounded-full border-2 border-white shadow-sm inline-flex items-center justify-center bg-[#F0F2F5] text-[#8E9299] text-sm font-bold">
                      +
                    </span>
                  )}
                </div>
              </button>
              {isBoardMembersOpen && (
                <div className="absolute right-0 top-11 z-30 w-[320px] rounded-xl border border-[#E2E4E9] bg-white shadow-xl p-4">
                  <h3 className="text-sm font-bold text-[#1C1F23] mb-1">{projectType} Members</h3>
                  <p className="text-xs text-[#8E9299] mb-3">
                    Choose who can see and access this workspace board. Admins always have access.
                  </p>
                  <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
                    {teamMembers.map(member => {
                      const hasGlobalAccess = member.role === 'master_admin' || member.role === 'admin';
                      const isChecked = hasGlobalAccess || boardMemberIds.includes(member.id);

                      return (
                        <label key={member.id} className="flex items-center justify-between gap-3 rounded-md border border-[#E2E4E9] bg-[#F9FAFB] px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#1C1F23] truncate">{member.name}</div>
                            <div className="text-[11px] text-[#8E9299] uppercase tracking-wider">{member.role === 'master_admin' ? 'Master Admin' : member.role || 'staff'}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={hasGlobalAccess}
                            onChange={() => toggleBoardMember(member.id)}
                            className="h-4 w-4 rounded border-[#D0D5DD] text-[#1061E3] focus:ring-[#1061E3] disabled:opacity-50"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {projectType === 'Support Tickets' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsBoardEmailOpen(prev => !prev)}
                className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Email to Board
              </button>
              {isBoardEmailOpen && (
                <div className="absolute right-0 top-11 z-30 w-[340px] rounded-xl border border-[#E2E4E9] bg-white shadow-xl p-4">
                  <h3 className="text-sm font-bold text-[#1C1F23] mb-1">Support Tickets Board Email</h3>
                  <p className="text-xs text-[#8E9299] mb-3">
                    Send support requests to this address so they can be routed into this board.
                  </p>
                  <div className="rounded-md border border-[#E2E4E9] bg-[#F9FAFB] px-3 py-2 text-sm font-semibold text-[#1C1F23] break-all">
                    {SUPPORT_TICKETS_BOARD_EMAIL}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyBoardEmail}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-semibold border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors"
                    >
                      {copiedBoardEmail ? 'Copied' : 'Copy Email'}
                    </button>
                    <a
                      href={`mailto:${SUPPORT_TICKETS_BOARD_EMAIL}?subject=New Support Ticket`}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors text-center"
                    >
                      Compose
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 rounded-md text-sm font-semibold border border-[#E2E4E9] bg-white text-[#1C1F23] outline-none focus:ring-2 focus:ring-[#1061E3]"
          >
            <option value="all">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button 
            onClick={handleAddWebsite}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#1061E3] bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </header>

      <div className="p-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="m-0 text-2xl font-bold text-[#1C1F23]">{projectType}</h1>
          <button 
            onClick={() => setGroups([...groups, { id: `group-${Date.now()}`, name: 'New Group' }])}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#1061E3] hover:text-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Group
          </button>
        </div>
      </div>

      <div className="flex-grow px-6 pb-6 overflow-auto">
        <DndContext id="websites-dnd-context" sensors={sensors} collisionDetection={closestCenter} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {groups.map((group) => {
            const rowMatchesStatus = (row: any) => statusFilter === 'all' || row.status === statusFilter;
            const visibleData = data.filter(r => rowMatchesStatus(r));
            const groupRows = visibleData.filter(r => !r.parentId && getRowGroupId(r) === group.id);
            return (
              <div key={group.id} className="mb-8">
                <GroupHeader 
                  group={group} 
                  onUpdate={(id, name) => setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g))} 
                  onRemove={(id) => {
                    // move items to first available other group, or delete them
                    const fallbackGroup = groups.find(g => g.id !== id)?.id;
                    if (fallbackGroup) {
                      setData(prev => prev.map(r => getRowGroupId(r) === id ? { ...r, groupId: fallbackGroup } : r));
                    }
                    setGroups(prev => prev.filter(g => g.id !== id));
                  }} 
                />
                <div className="overflow-x-auto bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#E2E4E9]">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr>
                        <th className="w-10 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
                        <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                          {columns.map(col => (
                            <SortableHeader key={col.id} column={col} />
                          ))}
                        </SortableContext>
                        <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] w-[50px]">
                          <button 
                            onClick={() => setIsAddColOpen(true)} 
                            className="p-1 hover:bg-[#E2E4E9] rounded text-[#1C1F23] transition-colors flex items-center justify-center w-6 h-6"
                            title="Add Column"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <GroupDroppableBody groupId={group.id}>
                      <SortableContext items={groupRows.flatMap(r => [
                        `row-${r.id}`,
                        ...(expandedIds.has(r.id) ? visibleData.filter((sub: any) => sub.parentId === r.id).map((sub: any) => `row-${sub.id}`) : [])
                      ])} strategy={verticalListSortingStrategy}>
                        {groupRows.map(row => (
                          <React.Fragment key={row.id}>
                            <SortableRow 
                              row={row} 
                              columns={columns} 
                              data={data} 
                              setData={setData} 
                              setEditingRowId={setEditingRowId} 
                              teamMembers={teamMembers}
                              statusOptions={statusOptions}
                              expandedIds={expandedIds}
                              toggleExpand={toggleExpand}
                              addSubRow={addSubRow}
                              isSubRow={false}
                              deleteRow={deleteRow}
                              projectType={projectType}
                              onContextMenu={(e: React.MouseEvent, rowId: string, isSubRow: boolean) => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, rowId, isSubRow });
                              }}
                            />
                            {expandedIds.has(row.id) && visibleData.filter(r => r.parentId === row.id).map(subRow => (
                              <SortableRow 
                                key={subRow.id} 
                                row={subRow} 
                                columns={columns} 
                                data={data} 
                                setData={setData} 
                                setEditingRowId={setEditingRowId} 
                                teamMembers={teamMembers}
                                statusOptions={statusOptions}
                                isSubRow={true}
                                deleteRow={deleteRow}
                                projectType={projectType}
                                onContextMenu={(e: React.MouseEvent, rowId: string, isSubRow: boolean) => {
                                  e.preventDefault();
                                  setContextMenu({ x: e.clientX, y: e.clientY, rowId, isSubRow });
                                }}
                              />
                            ))}
                          </React.Fragment>
                        ))}
                      </SortableContext>
                      {groupRows.length === 0 && (
                        <tr>
                          <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-[#8E9299] text-sm">
                            No projects in this group.
                          </td>
                        </tr>
                      )}
                    </GroupDroppableBody>
                  </table>
                </div>
              </div>
            );
          })}
        </DndContext>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 w-48 bg-white rounded-md shadow-lg border border-[#E2E4E9] overflow-hidden py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={() => {
              setEditingRowId(contextMenu.rowId);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-[#1C1F23] hover:bg-gray-50 flex items-center gap-2"
          >
            <Pencil className="w-4 h-4 text-[#8E9299]" />
            Edit
          </button>
          <button 
            onClick={() => {
              duplicateRow(contextMenu.rowId);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-[#1C1F23] hover:bg-gray-50 flex items-center gap-2"
          >
            <Copy className="w-4 h-4 text-[#8E9299]" />
            Duplicate
          </button>
          <div className="h-px bg-[#E2E4E9] my-1" />
          <button 
            onClick={() => {
              setRowToDeleteId(contextMenu.rowId);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-[#D32F2F] hover:bg-[#FEE2E2] flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {rowToDeleteId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setRowToDeleteId(null)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col z-10"
            >
              <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB]">
                <h3 className="font-bold text-lg text-[#1C1F23]">Confirm Deletion</h3>
                <button onClick={() => setRowToDeleteId(null)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-[#4A4D53]">
                  Are you sure you want to delete this row? This action cannot be undone.
                </p>
                <div className="mt-2 flex justify-end gap-3 pt-4 border-t border-[#E2E4E9]">
                  <button 
                    onClick={() => setRowToDeleteId(null)}
                    className="px-4 py-2 rounded-md text-sm font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      deleteRow(rowToDeleteId);
                      setRowToDeleteId(null);
                    }}
                    className="px-4 py-2 rounded-md text-sm font-semibold bg-[#D32F2F] text-white hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Column Modal */}
      <AnimatePresence>
        {isAddColOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setIsAddColOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col z-10"
            >
              <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB]">
                <h3 className="font-bold text-lg text-[#1C1F23]">Add New Column</h3>
                <button onClick={() => setIsAddColOpen(false)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddColumn} className="p-6 flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Column Name</label>
                  <input 
                    required
                    autoFocus
                    type="text" 
                    value={newColName || ''}
                    onChange={e => setNewColName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                    placeholder="e.g. Budget, Client Approval"
                  />
                </div>
                <div className="mt-2 flex justify-end gap-3 pt-4 border-t border-[#E2E4E9]">
                  <button 
                    type="button"
                    onClick={() => setIsAddColOpen(false)}
                    className="px-4 py-2 rounded-md text-sm font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors"
                  >
                    Add Column
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Row Panel */}
      <AnimatePresence>
        {editingRowId && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setEditingRowId(null)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-[#E2E4E9]"
            >
              <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB] shrink-0">
                <h3 className="font-bold text-lg text-[#1C1F23]">Edit {projectType} Details</h3>
                <button onClick={() => setEditingRowId(null)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-3 border-b border-[#E2E4E9] bg-white shrink-0">
                <div className="flex gap-2 overflow-x-auto">
                  {[
                    { id: 'details', label: 'Details' },
                    { id: 'description', label: 'Description' },
                    { id: 'updates', label: 'Updates' },
                    { id: 'files', label: 'Files' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveEditTab(tab.id as EditTab)}
                      className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${
                        activeEditTab === tab.id
                          ? 'bg-[#1061E3] text-white'
                          : 'bg-[#F0F2F5] text-[#4A4D53] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
                {activeEditTab === 'details' && (() => {
                  const editingRow = data.find(r => r.id === editingRowId);
                  return columns.map(col => (
                    <div key={col.id}>
                      <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">{col.header}</label>
                      {col.id === 'status' ? (
                        <select 
                          value={editingRow?.[col.id] ?? ''}
                          onChange={e => {
                            const newData = [...data];
                            const rowIndex = newData.findIndex(r => r.id === editingRowId);
                            const updatedRow = { ...newData[rowIndex], [col.id]: e.target.value };
                            if (projectType === 'Google Ads') {
                              updatedRow.groupId = e.target.value === 'Running' ? 'group-running' : 'group-active';
                            } else if (e.target.value === 'Running') {
                              updatedRow.groupId = 'group-running';
                            } else if (e.target.value === 'Needs Invoiced') {
                              updatedRow.groupId = 'group-needs-invoiced';
                            } else if (e.target.value === 'S14: Launched' || e.target.value === 'Launched' || e.target.value === 'Done') {
                              updatedRow.groupId = 'group-completed';
                            } else if (newData[rowIndex].groupId === 'group-needs-invoiced' || newData[rowIndex].groupId === 'group-completed' || newData[rowIndex].groupId === 'group-running') {
                              updatedRow.groupId = projectType === 'Local Listings' ? 'group-setup' : 'group-active';
                            }
                            newData[rowIndex] = updatedRow;
                            setData(newData);
                          }}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                        >
                          {(editingRow?.parentId ? (projectType === 'Local Listings' ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done'] : ['Not Started', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'On Hold', 'Done']) : statusOptions).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : col.id === 'priority' ? (
                        <select
                          value={editingRow?.[col.id] ?? ''}
                          onChange={e => {
                            const newData = [...data];
                            const rowIndex = newData.findIndex(r => r.id === editingRowId);
                            newData[rowIndex] = { ...newData[rowIndex], [col.id]: e.target.value };
                            setData(newData);
                          }}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                        >
                          <option value="">Select Priority</option>
                          {['Low', 'Medium', 'High', 'Urgent'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : col.id === 'planType' ? (
                        <select
                          value={editingRow?.[col.id] ?? 'Basic Plan'}
                          onChange={e => {
                            const newData = [...data];
                            const rowIndex = newData.findIndex(r => r.id === editingRowId);
                            newData[rowIndex] = { ...newData[rowIndex], [col.id]: e.target.value };
                            setData(newData);
                          }}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                        >
                          <option value="Basic Plan">Basic Plan</option>
                          <option value="Plus Plan">Plus Plan</option>
                        </select>
                      ) : col.id === 'billableHours' ? (
                        <select
                          value={editingRow?.[col.id] ?? ''}
                          onChange={e => {
                            const newData = [...data];
                            const rowIndex = newData.findIndex(r => r.id === editingRowId);
                            newData[rowIndex] = { ...newData[rowIndex], [col.id]: e.target.value };
                            setData(newData);
                          }}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                        >
                          <option value="">Select Hours</option>
                          {Array.from({ length: 40 }, (_, i) => i + 1).map(h => (
                            <option key={h} value={`${h}/hr`}>{h}/hr</option>
                          ))}
                        </select>
                      ) : col.id === 'assignee' ? (
                        <div className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md bg-white">
                          <AssigneeDropdown 
                            value={editingRow?.[col.id] || ''} 
                            onSave={(newVal) => {
                              const newData = [...data];
                              const rowIndex = newData.findIndex(r => r.id === editingRowId);
                              newData[rowIndex] = { ...newData[rowIndex], [col.id]: newVal };
                              setData(newData);
                            }} 
                            teamMembers={teamMembers} 
                          />
                        </div>
                      ) : (
                        <input 
                          type={col.id === 'deadline' ? 'date' : 'text'}
                          value={editingRow?.[col.id] ?? ''}
                          onChange={e => {
                            const newData = [...data];
                            const rowIndex = newData.findIndex(r => r.id === editingRowId);
                            newData[rowIndex] = { ...newData[rowIndex], [col.id]: e.target.value };
                            setData(newData);
                          }}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                        />
                      )}
                    </div>
                  ));
                })()}

                {/* Updates Section */}
                {activeEditTab === 'description' && (() => {
                  const editingRow = data.find(r => r.id === editingRowId);
                  return (
                    <div>
                      <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Description</label>
                      <textarea
                        value={editingRow?.description ?? ''}
                        onChange={e => {
                          const newData = [...data];
                          const rowIndex = newData.findIndex(r => r.id === editingRowId);
                          newData[rowIndex] = { ...newData[rowIndex], description: e.target.value };
                          setData(newData);
                        }}
                        placeholder={`Add a description for this ${projectType.toLowerCase()} project...`}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent min-h-[280px] resize-y"
                      />
                    </div>
                  );
                })()}

                {activeEditTab === 'updates' && (
                <div>
                  <h4 className="font-bold text-sm text-[#1C1F23] mb-4">Updates</h4>
                  <div className="flex flex-col gap-4 mb-4">
                    {(() => {
                      const editingRow = data.find(r => r.id === editingRowId);
                      return editingRow?.updates?.map((update: any) => (
                        <div key={update.id} className="bg-[#F9FAFB] rounded-lg p-3 border border-[#E2E4E9]">
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                style={{ backgroundColor: teamMembers.find(member => member.name === update.author)?.color || getColor(update.author || 'User') }}
                              >
                                {teamMembers.find(member => member.name === update.author)?.initials || getInitials(update.author)}
                              </div>
                              <span className="font-semibold text-xs text-[#1C1F23] truncate">{update.author}</span>
                            </div>
                            <span className="text-[10px] text-[#8E9299]">
                              {new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(update.timestamp))}
                            </span>
                          </div>
                          <p className="text-sm text-[#4A4D53] whitespace-pre-wrap">{update.text}</p>
                          {update.attachment && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#1061E3] bg-blue-50 border border-blue-100 rounded px-2 py-1 w-fit">
                              <FileIcon className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[200px]">{update.attachment}</span>
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                    {(() => {
                      const editingRow = data.find(r => r.id === editingRowId);
                      if (!editingRow?.updates || editingRow.updates.length === 0) {
                        return <p className="text-sm text-[#8E9299] text-center py-2">No updates yet.</p>;
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex flex-col gap-2 relative">
                    {attachedFile && (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-md p-2">
                        <div className="flex items-center gap-2 text-sm text-[#1061E3]">
                          <FileIcon className="w-4 h-4" />
                          <span className="truncate max-w-[250px] font-medium">{attachedFile.name}</span>
                        </div>
                        <button onClick={() => setAttachedFile(null)} className="text-[#8E9299] hover:text-[#D32F2F] transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    )}
                    <div className="flex gap-2 items-start relative">
                      <div className="relative flex-grow">
                        <textarea 
                          ref={textareaRef}
                          value={newUpdateText}
                          onChange={e => {
                            const val = e.target.value;
                            setNewUpdateText(val);
                            
                            // Mentions logic
                            const cursorP = e.target.selectionStart;
                            const textToCursor = val.slice(0, cursorP);
                            const match = textToCursor.match(/@(\w*)$/);
                            if (match) {
                              setMentionFilter(match[1]);
                              setShowMentionMenu(true);
                              setMentionIndex(0);
                            } else {
                              setShowMentionMenu(false);
                            }
                          }}
                          placeholder="Write an update..."
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent min-h-[80px] resize-y pb-8"
                          onKeyDown={e => {
                            if (showMentionMenu) {
                              const filteredMembers = teamMembers.filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase()));
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setMentionIndex(prev => (prev + 1) % filteredMembers.length);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (filteredMembers.length > 0) {
                                  const member = filteredMembers[mentionIndex];
                                  const cursorP = textareaRef.current?.selectionStart || 0;
                                  const textToCursor = newUpdateText.slice(0, cursorP);
                                  const textAfterCursor = newUpdateText.slice(cursorP);
                                  const newText = textToCursor.replace(/@\w*$/, `@${member.name} `) + textAfterCursor;
                                  setNewUpdateText(newText);
                                  setShowMentionMenu(false);
                                  textareaRef.current?.focus();
                                }
                              } else if (e.key === 'Escape') {
                                setShowMentionMenu(false);
                              }
                            } else if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddUpdate(editingRowId);
                            }
                          }}
                        />
                        <div className="absolute bottom-2 left-2 flex gap-1">
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                setAttachedFile(e.target.files[0]);
                                e.target.value = ''; // Reset input to allow selecting same file again
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 text-[#8E9299] hover:text-[#1061E3] hover:bg-[#F0F2F5] rounded transition-colors"
                            title="Attach File"
                          >
                            <Paperclip className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const textarea = textareaRef.current;
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const newText = newUpdateText.substring(0, start) + '@' + newUpdateText.substring(end);
                                setNewUpdateText(newText);
                                setShowMentionMenu(true);
                                setMentionFilter('');
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + 1, start + 1);
                                }, 0);
                              }
                            }}
                            className="p-1.5 text-[#8E9299] hover:text-[#1061E3] hover:bg-[#F0F2F5] rounded transition-colors"
                            title="Tag Member"
                          >
                            <AtSign className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Mention Menu */}
                        {showMentionMenu && (
                          <div className="absolute z-10 bottom-full mb-1 left-0 w-48 bg-white border border-[#E2E4E9] rounded-md shadow-lg overflow-hidden py-1">
                            {teamMembers.filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase())).length > 0 ? (
                              teamMembers.filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase())).map((member, i) => (
                                <button
                                  key={member.id}
                                  onClick={() => {
                                    const cursorP = textareaRef.current?.selectionStart || 0;
                                    const textToCursor = newUpdateText.slice(0, cursorP);
                                    const textAfterCursor = newUpdateText.slice(cursorP);
                                    const newText = textToCursor.replace(/@\w*$/, `@${member.name} `) + textAfterCursor;
                                    setNewUpdateText(newText);
                                    setShowMentionMenu(false);
                                    textareaRef.current?.focus();
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${i === mentionIndex ? 'bg-[#F0F2F5] text-[#1061E3]' : 'text-[#1C1F23] hover:bg-gray-50'}`}
                                >
                                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-[10px]">
                                    {member.name.charAt(0)}
                                  </div>
                                  {member.name}
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-xs text-[#8E9299]">No members found</div>
                            )}
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => handleAddUpdate(editingRowId)}
                        disabled={!newUpdateText.trim() && !attachedFile}
                        className="px-4 py-2 h-[80px] bg-[#1061E3] text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        Post
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {activeEditTab === 'files' && (() => {
                  const editingRow = data.find(r => r.id === editingRowId);
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-sm text-[#1C1F23]">Files</h4>
                        <div>
                          <input
                            type="file"
                            ref={projectFileInputRef}
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleAddProjectFile(editingRowId, e.target.files[0]);
                                e.target.value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => projectFileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                          >
                            <Paperclip className="w-4 h-4" />
                            Add File
                          </button>
                        </div>
                      </div>
                      {editingRow?.files && editingRow.files.length > 0 ? (
                        <div className="flex flex-col gap-3">
                          {editingRow.files.map((file: any) => (
                            <div key={file.id} className="bg-[#F9FAFB] rounded-lg p-3 border border-[#E2E4E9] flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileIcon className="w-4 h-4 text-[#1061E3] shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-[#1C1F23] truncate">{file.name}</p>
                                  <p className="text-[11px] text-[#8E9299]">
                                    {file.uploadedAt ? new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(file.uploadedAt)) : 'Just now'}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveProjectFile(editingRowId, file.id)}
                                className="p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors"
                                title="Remove File"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[#8E9299] text-center py-8 border border-dashed border-[#D0D5DD] rounded-lg">
                          No files attached yet.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="p-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setEditingRowId(null)}
                  className="px-4 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
