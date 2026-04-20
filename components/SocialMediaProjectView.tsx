'use client';

import React, { useState } from 'react';
import { Plus, GripHorizontal, GripVertical, X, Search, Filter, ChevronDown, ChevronRight, CornerDownRight, Trash2 } from 'lucide-react';
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
                    <strong className={isSubRow ? 'font-medium text-[#4A4D53]' : ''}>{v}</strong>
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
  'Planning',
  'In Progress',
  'Active',
  'ON HOLD'
];

export default function SocialMediaProjectView({ teamMembers, companies }: { teamMembers: TeamMember[], companies: Company[] }) {
  const [columns, setColumns] = useState<Column[]>(INITIAL_COLUMNS);
  const [data, setData] = useState<any[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [isAddColOpen, setIsAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  React.useEffect(() => {
    setData((prev) => {
      // Find what smm and sma rows we currently have
      const existingSMM = prev.filter(r => r.serviceType === 'smm');
      const existingSMA = prev.filter(r => r.serviceType === 'sma');

      const requiredSMMIds = new Set(companies.filter(c => c.smm && !deletedIds.has(c.id + '-smm')).map(c => c.id + '-smm'));
      const requiredSMAIds = new Set(companies.filter(c => c.sma && !deletedIds.has(c.id + '-sma')).map(c => c.id + '-sma'));

      const newSMMRows = companies
        .filter(c => c.smm && !deletedIds.has(c.id + '-smm') && !existingSMM.some(r => r.id === c.id + '-smm'))
        .map(c => ({
          id: c.id + '-smm',
          companyId: c.id,
          serviceType: 'smm',
          projectName: c.name + ' SMM',
          assignee: c.assignedToId || teamMembers[0]?.id || '',
          status: 'Planning',
          deadline: '',
          notes: ''
        }));

      const newSMARows = companies
        .filter(c => c.sma && !deletedIds.has(c.id + '-sma') && !existingSMA.some(r => r.id === c.id + '-sma'))
        .map(c => ({
          id: c.id + '-sma',
          companyId: c.id,
          serviceType: 'sma',
          projectName: c.name + ' SMA',
          assignee: c.assignedToId || teamMembers[0]?.id || '',
          status: 'Planning',
          deadline: '',
          notes: ''
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

      return [...keptRows, ...newSMMRows, ...newSMARows];
    });
  }, [companies, teamMembers, deletedIds]);

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
      notes: ''
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
      status: 'Planning',
      deadline: '',
      notes: '',
      isManual: true,
    };
    setData(prev => [manualProject, ...prev]);
  };

  const renderTableData = (groupData: any[], emptyMessage: string) => (
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
          <SortableContext items={groupData.filter(r => !r.parentId).map(r => `row-${r.id}`)} strategy={verticalListSortingStrategy}>
            {groupData.filter(r => !r.parentId).map(row => (
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
                {expandedIds.has(row.id) && groupData.filter(r => r.parentId === row.id).map(subRow => (
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
          {groupData.filter(r => !r.parentId).length === 0 && (
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
          <button className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </button>
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
            {renderTableData(data.filter(r => r.serviceType === 'smm'), 'No Social Media Management projects found.')}
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
              <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
                {(() => {
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
                          {(editingRow?.parentId ? ['Not Started', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'On Hold', 'Done'] : STATUS_OPTIONS).map(opt => <option key={opt} value={opt}>{opt}</option>)}
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
