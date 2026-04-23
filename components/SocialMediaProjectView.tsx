'use client';

import React, { useState } from 'react';
import { Plus, GripHorizontal, GripVertical, X, Search, ChevronDown, ChevronRight, CornerDownRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TeamMember, EditableStatus, AssigneeDropdown, Company } from '@/components/Shared';

interface Column {
  id: string;
  header: string;
}

const INITIAL_COLUMNS: Column[] = [
  { id: 'projectName', header: 'Project Name' },
  { id: 'assignee', header: 'Assignee' },
  { id: 'status', header: 'Status' },
  { id: 'deadline', header: 'Deadline' },
  { id: 'notes', header: 'Notes' },
];

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

function EditableCell({ value, onSave, renderValue }: { value: string, onSave: (val: string) => void, renderValue?: (val: string) => React.ReactNode }) {
  return (
    <div className="min-h-[20px] min-w-[50px] truncate" title={value || ''}>
      {renderValue ? renderValue(value) : (value || '-')}
    </div>
  );
}

function SortableRow({ row, columns, data, setData, setEditingRowId, teamMembers, expandedIds, toggleExpand, addSubRow, isSubRow = false, deleteRow }: any) {
  const sortable = useSortable({ id: `row-${row.id}` });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = isSubRow ? ({} as any) : sortable;
  const style = isSubRow ? {} : {
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
      className={`hover:bg-gray-50 transition-colors cursor-pointer group ${isSubRow ? 'bg-[#FAFAFA]' : ''}`}
    >
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        {!isSubRow && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
            <GripVertical className="w-4 h-4" />
          </div>
        )}
      </td>
      {columns.map((col: any) => (
        <td key={col.id} className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] whitespace-nowrap max-w-[200px] truncate relative">
          {col.id === 'status' ? (
            <EditableStatus 
              value={row[col.id]} 
              options={STATUS_OPTIONS}
              onSave={(newVal) => {
                const newData = [...data];
                const rowIndex = newData.findIndex((r: any) => r.id === row.id);
                newData[rowIndex] = { ...newData[rowIndex], [col.id]: newVal };
                setData(newData);
              }} 
            />
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

const STATUS_OPTIONS = [
  'Not Started',
  'Setup',
  'In Progress',
  'Awaiting Customer',
  'Needs Invoiced',
  'Running',
  'On Hold',
  'Done'
];

const MONTH_SUBTASKS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function createMonthlySubTasks(parentId: string, parent: any, existingSubRows: any[] = []) {
  const existingNames = new Set(existingSubRows.map(row => row.projectName));

  return MONTH_SUBTASKS
    .filter(month => !existingNames.has(month))
    .map(month => ({
      id: `sub-${parentId}-${month.toLowerCase()}`,
      parentId,
      serviceType: parent?.serviceType || 'smm',
      projectName: month,
      assignee: parent?.assignee || '',
      status: 'Not Started',
      deadline: '',
      description: '',
      notes: '',
      updates: []
    }));
}

export default function SocialMediaProjectView({
  teamMembers,
  companies,
  openRowId,
  boardMemberships,
  setBoardMemberships,
  canManageBoardMembers,
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  openRowId?: string,
  boardMemberships: Record<string, string[]>,
  setBoardMemberships: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
  canManageBoardMembers: boolean,
}) {
  type EditTab = 'details' | 'description' | 'updates';
  const [columns, setColumns] = useState<Column[]>(INITIAL_COLUMNS);
  const [data, setData] = useState<any[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [isAddColOpen, setIsAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [activeEditTab, setActiveEditTab] = useState<EditTab>('details');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newUpdateText, setNewUpdateText] = useState('');
  const [isBoardMembersOpen, setIsBoardMembersOpen] = useState(false);

  React.useEffect(() => {
    setData((prev) => {
      // Find what smm and sma rows we currently have
      const existingSMM = prev.filter(r => r.serviceType === 'smm');
      const existingSMA = prev.filter(r => r.serviceType === 'sma');

      const requiredSMMIds = new Set(companies.filter(c => c.smm && !deletedIds.has(c.id + '-smm')).map(c => c.id + '-smm'));
      const requiredSMAIds = new Set(companies.filter(c => c.sma && !deletedIds.has(c.id + '-sma')).map(c => c.id + '-sma'));

      const newSMMRows = companies
        .filter(c => c.smm && !deletedIds.has(c.id + '-smm') && !existingSMM.some(r => r.id === c.id + '-smm'))
        .flatMap(c => {
          const parentRow = {
            id: c.id + '-smm',
            companyId: c.id,
            serviceType: 'smm',
          projectName: c.name + ' SMM',
          assignee: c.assignedToId || teamMembers[0]?.id || '',
          status: 'Not Started',
          deadline: '',
          description: '',
          notes: '',
          updates: []
          };

          return [parentRow, ...createMonthlySubTasks(parentRow.id, parentRow)];
        });

      const newSMARows = companies
        .filter(c => c.sma && !deletedIds.has(c.id + '-sma') && !existingSMA.some(r => r.id === c.id + '-sma'))
        .map(c => ({
          id: c.id + '-sma',
          companyId: c.id,
          serviceType: 'sma',
          projectName: c.name + ' SMA',
          assignee: c.assignedToId || teamMembers[0]?.id || '',
          status: 'Not Started',
          deadline: '',
          description: '',
          notes: '',
          updates: []
        }));

      const keptRows = prev.filter(r => 
        r.isManual ||
        (r.serviceType === 'smm' && requiredSMMIds.has(r.id)) || 
        (r.serviceType === 'sma' && requiredSMAIds.has(r.id)) ||
        (r.parentId && prev.some(parent => parent.id === r.parentId && (
          parent.isManual ||
          (parent.serviceType === 'smm' && requiredSMMIds.has(parent.id)) ||
          (parent.serviceType === 'sma' && requiredSMAIds.has(parent.id))
        )))
      );

      const smmParents = keptRows.filter(row => row.serviceType === 'smm' && !row.parentId);
      const missingMonthlyRows = smmParents.flatMap(parent =>
        createMonthlySubTasks(parent.id, parent, keptRows.filter(row => row.parentId === parent.id))
      );

      return [...keptRows, ...missingMonthlyRows, ...newSMMRows, ...newSMARows];
    });

  }, [companies, teamMembers, deletedIds]);

  React.useEffect(() => {
    if (openRowId && data.some(row => row.id === openRowId)) {
      setEditingRowId(openRowId);
    }
  }, [openRowId, data]);

  React.useEffect(() => {
    if (editingRowId) {
      setActiveEditTab('details');
    }
  }, [editingRowId]);

  const deleteRow = (id: string) => {
    setData(prev => prev.filter(r => r.id !== id && r.parentId !== id));
    if (!String(id).startsWith('manual-')) {
      setDeletedIds(prev => new Set(prev).add(id));
    }
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
      serviceType: parent?.serviceType,
      projectName: 'New Sub-Task',
      assignee: parent?.assignee || teamMembers[0]?.id || '',
      status: 'Not Started',
      deadline: '',
      description: '',
      notes: '',
      updates: []
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

  const handleAddWebsite = (type: 'smm' | 'sma') => {
    const manualProject = {
      id: `manual-${Date.now()}`,
      serviceType: type,
      projectName: `New ${type === 'smm' ? 'SMM' : 'SMA'} Project`,
      assignee: teamMembers[0]?.id || '',
      status: 'Not Started',
      deadline: '',
      description: '',
      notes: '',
      updates: [],
      isManual: true,
    };
    if (type === 'smm') {
      setData(prev => [manualProject, ...createMonthlySubTasks(manualProject.id, manualProject), ...prev]);
      return;
    }

    setData(prev => [manualProject, ...prev]);
  };

  const handleAddUpdate = (rowId: string) => {
    const trimmedText = newUpdateText.trim();
    if (!trimmedText) return;

    setData(prev => {
      const idx = prev.findIndex(row => row.id === rowId);
      if (idx === -1) return prev;

      const author = teamMembers[0]?.name || 'You';
      const next = [...prev];
      const updates = next[idx].updates ? [...next[idx].updates] : [];
      updates.push({
        id: `update-${Date.now()}`,
        author,
        text: trimmedText,
        timestamp: new Date().toISOString(),
      });
      next[idx] = { ...next[idx], updates };
      return next;
    });

    setNewUpdateText('');
  };

  const toggleBoardMember = (memberId: string) => {
    setBoardMemberships(prev => {
      const currentMemberIds = prev['Social Media'] || [];
      const isMember = currentMemberIds.includes(memberId);

      return {
        ...prev,
        'Social Media': isMember
          ? currentMemberIds.filter(id => id !== memberId)
          : [...currentMemberIds, memberId],
      };
    });
  };

  const boardMemberIds = boardMemberships['Social Media'] || [];
  const visibleBoardMembers = teamMembers.filter(member =>
    member.role === 'master_admin' || member.role === 'admin' || boardMemberIds.includes(member.id)
  );

  const renderTableData = (groupData: any[], emptyMessage: string, options?: { hideDone?: boolean }) => {
    const visibleGroupData = groupData.filter(row => {
      if (options?.hideDone && row.status === 'Done') {
        return false;
      }
      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }
      return true;
    });
    const visibleParentRows = visibleGroupData.filter(r => !r.parentId);

    return (
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
        <tbody className="min-h-[50px]">
          <SortableContext items={visibleParentRows.map(r => `row-${r.id}`)} strategy={verticalListSortingStrategy}>
            {visibleParentRows.map(row => (
              <React.Fragment key={row.id}>
                <SortableRow 
                  row={row} 
                  columns={columns} 
                  data={data} 
                  setData={setData} 
                  setEditingRowId={setEditingRowId} 
                  teamMembers={teamMembers} 
                  expandedIds={expandedIds}
                  toggleExpand={toggleExpand}
                  addSubRow={addSubRow}
                  isSubRow={false}
                  deleteRow={deleteRow}
                />
                {expandedIds.has(row.id) && visibleGroupData.filter(r => r.parentId === row.id).map(subRow => (
                  <SortableRow 
                    key={subRow.id} 
                    row={subRow} 
                    columns={columns} 
                    data={data} 
                    setData={setData} 
                    setEditingRowId={setEditingRowId} 
                    teamMembers={teamMembers} 
                    isSubRow={true}
                    deleteRow={deleteRow}
                  />
                ))}
              </React.Fragment>
            ))}
          </SortableContext>
          {visibleParentRows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-[#8E9299] text-sm">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    );
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center justify-between px-6 shrink-0">
        <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
          <Search className="w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder="Search within Social Media..."
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
                  <h3 className="text-sm font-bold text-[#1C1F23] mb-1">Social Media Members</h3>
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 rounded-md text-sm font-semibold border border-[#E2E4E9] bg-white text-[#1C1F23] outline-none focus:ring-2 focus:ring-[#1061E3]"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <div className="flex border border-[#1061E3] rounded-md overflow-hidden bg-[#1061E3] transition-colors">
            <button 
              onClick={() => handleAddWebsite('smm')}
              className="px-3 py-2 text-sm font-semibold cursor-pointer text-white hover:bg-blue-700 border-r border-[#0d50bc] flex items-center"
            >
              + New SMM
            </button>
            <button 
              onClick={() => handleAddWebsite('sma')}
              className="px-3 py-2 text-sm font-semibold cursor-pointer text-white hover:bg-blue-700 flex items-center"
            >
              + New SMA
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="m-0 text-2xl font-bold text-[#1C1F23]">Social Media</h1>
        </div>
      </div>

      <div className="flex-grow px-6 pb-6 overflow-auto">
        <DndContext id="social-media-dnd-context" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="mb-8">
            <h2 className="text-lg font-bold text-[#1C1F23] mb-3">Social Media Management</h2>
            {renderTableData(data.filter(r => r.serviceType === 'smm'), 'No Social Media Management projects found.', { hideDone: true })}
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#1C1F23] mb-3">Social Media Advertising</h2>
            {renderTableData(data.filter(r => r.serviceType === 'sma'), 'No Social Media Advertising projects found.')}
          </div>
        </DndContext>
      </div>

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
                <h3 className="font-bold text-lg text-[#1C1F23]">Edit Social Media Details</h3>
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
                            newData[rowIndex] = { ...newData[rowIndex], [col.id]: e.target.value };
                            setData(newData);
                          }}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                        >
                          {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
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
                        placeholder="Add a description for this social media project..."
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent min-h-[280px] resize-y"
                      />
                    </div>
                  );
                })()}
                {activeEditTab === 'updates' && (() => {
                  const editingRow = data.find(r => r.id === editingRowId);
                  return (
                    <div>
                      <h4 className="font-bold text-sm text-[#1C1F23] mb-4">Updates</h4>
                      <div className="flex flex-col gap-4 mb-4">
                        {editingRow?.updates && editingRow.updates.length > 0 ? (
                          editingRow.updates.map((update: any) => {
                            const member = teamMembers.find(teamMember => teamMember.name === update.author);
                            return (
                              <div key={update.id} className="bg-[#F9FAFB] rounded-lg p-3 border border-[#E2E4E9]">
                                <div className="flex justify-between items-center mb-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                      style={{ backgroundColor: member?.color || getColor(update.author || 'User') }}
                                    >
                                      {member?.initials || getInitials(update.author)}
                                    </div>
                                    <span className="font-semibold text-xs text-[#1C1F23] truncate">{update.author || 'User'}</span>
                                  </div>
                                  <span className="text-[10px] text-[#8E9299]">
                                    {new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(update.timestamp))}
                                  </span>
                                </div>
                                <p className="text-sm text-[#4A4D53] whitespace-pre-wrap">{update.text}</p>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-sm text-[#8E9299] text-center py-2">No updates yet.</p>
                        )}
                      </div>
                      <div className="flex gap-2 items-start">
                        <textarea
                          value={newUpdateText}
                          onChange={e => setNewUpdateText(e.target.value)}
                          placeholder="Write an update..."
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent min-h-[90px] resize-y"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddUpdate(editingRowId);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddUpdate(editingRowId)}
                          disabled={!newUpdateText.trim()}
                          className="px-4 py-2 h-[90px] bg-[#1061E3] text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          Post
                        </button>
                      </div>
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
