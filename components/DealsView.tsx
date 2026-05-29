'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Search, Plus, X, GripVertical, Paperclip, AtSign, File as FileIcon, FileText, Trash2, Upload, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TeamMember, AssigneeDropdown, Company, Contact, Proposal, Deal } from '@/components/Shared';
import { createDeal, updateDeal, deleteDeal } from '@/lib/crmStore';
import DealImportModal from '@/components/DealImportModal';
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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DEAL_STEPS = [
  '1. Onboarding',
  '2. Strategy Meeting',
  '3. Plan & Proposal',
  '4. Proposal Signing',
  '5. Deposit Payment',
  '6. Content Collection',
  '7. Website Design',
  '8. Design Proofing',
  '9. Website Development',
  '10. Development Proofing',
  '11. Final Payment',
  '12. Launch Checklist',
  '13. Launch'
];

const DEAL_STATUSES = [
  'Not started',
  'In Progress',
  'Need to Call / Email',
  'Need to Follow Up',
  'Awaiting Customer',
  'Client Hold Request',
  'Unresponsive',
  'WON',
  'LOST'
];

function EditableCell({ value, onSave, renderValue }: { value: string, onSave: (val: string) => void, renderValue?: (val: string) => React.ReactNode }) {
  return (
    <div className="min-h-[20px] truncate" title={value || ''}>
      {renderValue ? renderValue(value) : (value || '-')}
    </div>
  );
}

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
}

function getAvatarColor(name?: string) {
  const colors = ['#1061E3', '#10B981', '#F59E0B', '#D32F2F', '#8B5CF6', '#EC4899'];
  const value = name || 'User';
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function EditableSelect({ value, options, onSave }: { value: string, options: string[], onSave: (val: string) => void }) {
  return (
    <div className="min-h-[20px] truncate" title={value || ''}>
      {value || '-'}
    </div>
  );
}

function EditableStatus({ value, onSave }: { value: string, onSave: (val: string) => void }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase inline-block text-center ${
        value === 'WON' ? 'bg-[#ECFDF3] text-[#10B981]' : 
        value === 'LOST' ? 'bg-[#FFEBEB] text-[#D32F2F]' : 
        value === 'In Progress' ? 'bg-[#E3F2FD] text-[#1976D2]' :
        value === 'Need to Call / Email' || value === 'Need to Follow Up' ? 'bg-[#FFF4E5] text-[#ED6C02]' :
        'bg-gray-100 text-gray-700'
      }`}
    >
      {value || 'Not started'}
    </span>
  );
}

function SortableRow({ deal, onClick, onUpdate, teamMembers, companies, contacts, onDelete, isFaded = false, visibleColumns }: { deal: Deal; onClick: () => void; onUpdate: (id: string, field: keyof Deal, value: any) => void; teamMembers: TeamMember[]; companies: Company[]; contacts: Contact[]; onDelete: (id: string) => void; isFaded?: boolean; visibleColumns: string[] }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : (isFaded ? 0.5 : 1),
  };

  return (
    <tr ref={setNodeRef} style={style} onClick={onClick} className="hover:bg-gray-50 transition-colors cursor-pointer bg-white">
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
          <GripVertical className="w-4 h-4" />
        </div>
      </td>
      {visibleColumns.includes('name') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableCell value={deal.name} onSave={v => onUpdate(deal.id, 'name', v)} renderValue={v => <strong>{v}</strong>} />
        </td>
      )}
      {visibleColumns.includes('currentStep') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableSelect value={deal.currentStep} options={DEAL_STEPS} onSave={v => onUpdate(deal.id, 'currentStep', v)} />
        </td>
      )}
      {visibleColumns.includes('status') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableStatus value={deal.status} onSave={v => onUpdate(deal.id, 'status', v)} />
        </td>
      )}
      {visibleColumns.includes('assignedToId') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <AssigneeDropdown value={deal.assignedToId} onSave={v => onUpdate(deal.id, 'assignedToId', v)} teamMembers={teamMembers} />
        </td>
      )}
      {visibleColumns.includes('value') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableCell value={deal.value} onSave={v => onUpdate(deal.id, 'value', v)} />
        </td>
      )}
      {visibleColumns.includes('companyId') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <div className="min-h-[20px] truncate">
            {companies.find(c => c.id === deal.companyId)?.name || '-'}
          </div>
        </td>
      )}
      {visibleColumns.includes('contactId') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <div className="min-h-[20px] truncate">
            {(() => {
              const contact = contacts.find(c => c.id === deal.contactId);
              return contact ? `${contact.firstName} ${contact.lastName}` : '-';
            })()}
          </div>
        </td>
      )}
      {visibleColumns.includes('notes') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <div className="truncate max-w-[150px]" title={deal.notes && deal.notes.length > 0 ? deal.notes[deal.notes.length - 1].text : ''}>
            {deal.notes && deal.notes.length > 0 ? deal.notes[deal.notes.length - 1].text : '-'}
          </div>
        </td>
      )}
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-right w-12">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(deal.id); }}
          className="p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Delete Deal"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}


type DealTab = 'details' | 'notes' | 'proposals';

export default function DealsView({
  teamMembers,
  companies,
  contacts,
  deals,
  setDeals,
  proposals,
  setProposals,
  currentUserName,
  currentUserId,
  onMention,
  allowDeletingColumns = false,
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  contacts: Contact[],
  deals: Deal[],
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>,
  proposals: Proposal[],
  setProposals: React.Dispatch<React.SetStateAction<Proposal[]>>,
  currentUserName: string,
  currentUserId?: string,
  onMention?: (text: string, sourceLabel: string, sourceTitle: string, actorName: string, actorId?: string) => void,
  allowDeletingColumns?: boolean,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(['name', 'currentStep', 'status', 'assignedToId', 'value', 'companyId', 'contactId', 'notes']);
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = useCallback((column: string) => {
    setSortConfig(prev => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  }, []);

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.column === column) {
      return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />;
    }
    return <ChevronsUpDown className="w-3.5 h-3.5 text-[#C8CDD5] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />;
  };


  const renderTableHeaders = () => {
    return (
      <thead className="sticky top-0 z-10 shadow-sm select-none">
        <tr>
          <th className="w-10 sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 border-b border-[#E2E4E9]"></th>
          {visibleColumns.includes('name') && (
            <th
              className="w-[200px] sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group cursor-pointer hover:bg-[#F0F2F5] transition-colors"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span>DEAL NAME</span>
                  <SortIcon column="name" />
                </div>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'name')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          {visibleColumns.includes('currentStep') && (
            <th
              className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group cursor-pointer hover:bg-[#F0F2F5] transition-colors"
              onClick={() => handleSort('currentStep')}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span>CURRENT STEP</span>
                  <SortIcon column="currentStep" />
                </div>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'currentStep')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          {visibleColumns.includes('status') && (
            <th
              className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group cursor-pointer hover:bg-[#F0F2F5] transition-colors"
              onClick={() => handleSort('status')}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span>STATUS</span>
                  <SortIcon column="status" />
                </div>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'status')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          {visibleColumns.includes('assignedToId') && (
            <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group">
              <div className="flex items-center justify-between gap-1">
                <span>ASSIGNED</span>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'assignedToId')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          {visibleColumns.includes('value') && (
            <th
              className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group cursor-pointer hover:bg-[#F0F2F5] transition-colors"
              onClick={() => handleSort('value')}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span>DEAL VALUE</span>
                  <SortIcon column="value" />
                </div>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'value')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          {visibleColumns.includes('companyId') && (
            <th
              className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group cursor-pointer hover:bg-[#F0F2F5] transition-colors"
              onClick={() => handleSort('companyId')}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span>COMPANY</span>
                  <SortIcon column="companyId" />
                </div>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'companyId')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          {visibleColumns.includes('contactId') && (
            <th
              className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group cursor-pointer hover:bg-[#F0F2F5] transition-colors"
              onClick={() => handleSort('contactId')}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span>CONTACT</span>
                  <SortIcon column="contactId" />
                </div>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'contactId')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          {visibleColumns.includes('notes') && (
            <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group">
              <div className="flex items-center justify-between gap-1">
                <span>NOTES</span>
                {allowDeletingColumns && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'notes')); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </th>
          )}
          <th className="w-12 sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 border-b border-[#E2E4E9]"></th>
        </tr>
      </thead>
    );
  };

  // Form State
  const [formData, setFormData] = useState<Partial<Deal>>({});
  const [newNoteText, setNewNoteText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [activeTab, setActiveTab] = useState<DealTab>('details');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredDeals = useMemo(() => {
    const filtered = deals.filter(d => {
      const companyName = companies.find(c => c.id === d.companyId)?.name || '';
      const contactObj = contacts.find(c => c.id === d.contactId);
      const contactName = contactObj ? `${contactObj.firstName} ${contactObj.lastName}` : '';
      return d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.status.toLowerCase().includes(searchQuery.toLowerCase());
    });

    if (!sortConfig) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortConfig.column === 'companyId') {
        aVal = companies.find(c => c.id === a.companyId)?.name || '';
        bVal = companies.find(c => c.id === b.companyId)?.name || '';
      } else if (sortConfig.column === 'contactId') {
        const ac = contacts.find(c => c.id === a.contactId);
        const bc = contacts.find(c => c.id === b.contactId);
        aVal = ac ? `${ac.firstName} ${ac.lastName}` : '';
        bVal = bc ? `${bc.firstName} ${bc.lastName}` : '';
      } else {
        aVal = String(a[sortConfig.column as keyof Deal] ?? '').toLowerCase();
        bVal = String(b[sortConfig.column as keyof Deal] ?? '').toLowerCase();
      }
      const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [deals, searchQuery, companies, contacts, sortConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setDeals((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const activeDeals = filteredDeals.filter(d => d.status !== 'WON' && d.status !== 'LOST');
  const wonDeals = filteredDeals.filter(d => d.status === 'WON');
  const lostDeals = filteredDeals.filter(d => d.status === 'LOST');

  const openAddModal = () => {
    setEditingDealId(null);
    setFormData({});
    setNewNoteText('');
    setActiveTab('details');
    setIsAddModalOpen(true);
  };

  const openEditModal = (deal: Deal) => {
    setEditingDealId(deal.id);
    setFormData(deal);
    setNewNoteText('');
    setActiveTab('details');
    setIsAddModalOpen(true);
  };

  const handleUpdateDeal = async (id: string, field: keyof Deal, value: any) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
    try {
      await updateDeal(id, { [field]: value });
    } catch (e) {
      console.error('Failed to update deal in Firebase', e);
    }
  };

  const handleDeleteDeal = async (id: string) => {
    if (confirm('Are you sure you want to delete this deal? This action cannot be undone.')) {
      try {
        await deleteDeal(id);
      } catch (err) {
        console.error('Failed to delete deal', err);
        alert('Failed to delete deal. Check console.');
      }
    }
  };

  const handleAddNote = () => {
    if (!newNoteText.trim() && !attachedFile) return;
    
    const author = currentUserName || teamMembers?.[0]?.name || 'You';
    const newNote = { 
      id: Date.now().toString(), 
      author,
      text: newNoteText.trim(), 
      createdAt: new Date().toISOString(),
      attachment: attachedFile ? attachedFile.name : undefined
    };

    setFormData(prev => ({
      ...prev,
      notes: [...(prev.notes || []), newNote]
    }));
    
    setNewNoteText('');
    setAttachedFile(null);
  };

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const existingDeal = editingDealId ? deals.find(d => d.id === editingDealId) : undefined;
    let updatedNotes = formData.notes || [];
    if (newNoteText.trim() || attachedFile) {
      const author = currentUserName || teamMembers?.[0]?.name || 'You';
      updatedNotes = [...updatedNotes, { 
        id: Date.now().toString(), 
        author,
        text: newNoteText.trim(), 
        createdAt: new Date().toISOString(),
        attachment: attachedFile ? attachedFile.name : undefined
      }];
    }

    const existingNoteIds = new Set((existingDeal?.notes || []).map(note => note.id));
    const newNotes = updatedNotes.filter(note => !existingNoteIds.has(note.id));
    const sourceTitle = formData.name || existingDeal?.name || 'Untitled Deal';

    newNotes.forEach(note => {
      if (note.text.trim()) {
        onMention?.(note.text, 'Deal Comment', sourceTitle, note.author || currentUserName, currentUserId);
      }
    });

    if (editingDealId) {
      try {
        await updateDeal(editingDealId, { ...formData, notes: updatedNotes });
      } catch (err) {
        console.error('Failed to update deal', err);
      }
    } else {
      const newDealData = {
        name: formData.name || '',
        currentStep: formData.currentStep || '',
        status: formData.status || 'Not started',
        assignedToId: formData.assignedToId || '',
        value: formData.value || '',
        companyId: formData.companyId || '',
        contactId: formData.contactId || '',
        notes: updatedNotes,
        order: deals.length,
      };
      try {
        await createDeal(newDealData);
      } catch (err) {
        console.error('Failed to create deal', err);
      }
    }
    
    setIsAddModalOpen(false);
  };

  const updateForm = (field: keyof Deal, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const currentDealId = editingDealId || formData.id;
  const dealProposals = proposals.filter(proposal => proposal.dealId === currentDealId);
  const assignableProposals = proposals.filter(proposal => {
    const companyMatches = !formData.companyId || proposal.companyId === formData.companyId;
    const alreadyAssignedElsewhere = proposal.dealId && proposal.dealId !== currentDealId;
    return companyMatches && !alreadyAssignedElsewhere;
  });
  const calculateProposalTotal = (proposal: Proposal) => proposal.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  const assignProposalToDeal = (proposalId: string) => {
    if (!proposalId || !currentDealId) return;
    setProposals(prev =>
      prev.map(proposal =>
        proposal.id === proposalId ? { ...proposal, dealId: currentDealId } : proposal
      )
    );
  };

  const unassignProposalFromDeal = (proposalId: string) => {
    setProposals(prev =>
      prev.map(proposal =>
        proposal.id === proposalId ? { ...proposal, dealId: undefined } : proposal
      )
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
            placeholder="Search Deals..."
            className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          {visibleColumns.length < 8 && (
            <button
              type="button"
              onClick={() => setVisibleColumns(['name', 'currentStep', 'status', 'assignedToId', 'value', 'companyId', 'contactId', 'notes'])}
              className="px-3 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1061E3] hover:bg-blue-50 transition-all flex items-center gap-1.5 active:scale-95 select-none"
            >
              <RefreshCw className="w-4 h-4" />
              Reset Columns
            </button>
          )}
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button 
            onClick={openAddModal}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#1061E3] bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Deal
          </button>
        </div>
      </header>

      {/* View Header */}
      <div className="p-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="m-0 text-2xl font-bold text-[#1C1F23]">Deals / Sales</h1>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-grow px-6 pb-6 overflow-auto">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {/* Active Deals */}
          <div className="flex items-center gap-2 py-3 mb-2">
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#666]"></div>
            <span className="font-bold text-[15px] uppercase tracking-wide text-[#1061E3]">Active Deals</span>
            <span className="text-[#8E9299] text-[13px]">({activeDeals.length})</span>
          </div>
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-left mb-8">
            {renderTableHeaders()}
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={activeDeals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {activeDeals.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-4 py-8 text-center text-[#8E9299] text-sm">No active deals found.</td>
                  </tr>
                ) : activeDeals.map(deal => (
                  <SortableRow 
                    key={deal.id} 
                    deal={deal} 
                    onClick={() => openEditModal(deal)} 
                    onUpdate={handleUpdateDeal} 
                    teamMembers={teamMembers}
                    companies={companies}
                    contacts={contacts}
                    onDelete={handleDeleteDeal}
                    visibleColumns={visibleColumns}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>

          {/* Won Deals */}
          <div className="flex items-center gap-2 py-3 mb-2">
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#666]"></div>
            <span className="font-bold text-[15px] uppercase tracking-wide text-[#10B981]">Won Deals</span>
            <span className="text-[#8E9299] text-[13px]">({wonDeals.length})</span>
          </div>
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-left mb-8">
            {renderTableHeaders()}
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={wonDeals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {wonDeals.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-4 py-8 text-center text-[#8E9299] text-sm">No won deals found.</td>
                  </tr>
                ) : wonDeals.map(deal => (
                  <SortableRow 
                    key={deal.id} 
                    deal={deal} 
                    onClick={() => openEditModal(deal)} 
                    onUpdate={handleUpdateDeal} 
                    teamMembers={teamMembers}
                    companies={companies}
                    contacts={contacts}
                    onDelete={handleDeleteDeal}
                    visibleColumns={visibleColumns}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>

          {/* Lost Deals */}
          <div className="flex items-center gap-2 py-3 mb-2">
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#666]"></div>
            <span className="font-bold text-[15px] uppercase tracking-wide text-[#D32F2F]">Lost Deals</span>
            <span className="text-[#8E9299] text-[13px]">({lostDeals.length})</span>
          </div>
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-left mb-8">
            {renderTableHeaders()}
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={lostDeals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {lostDeals.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-4 py-8 text-center text-[#8E9299] text-sm">No lost deals found.</td>
                  </tr>
                ) : lostDeals.map(deal => (
                  <SortableRow 
                    key={deal.id} 
                    deal={deal} 
                    onClick={() => openEditModal(deal)} 
                    onUpdate={handleUpdateDeal} 
                    teamMembers={teamMembers}
                    companies={companies}
                    contacts={contacts}
                    onDelete={handleDeleteDeal}
                    isFaded={true}
                    visibleColumns={visibleColumns}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>

      {/* Add/Edit Deal Panel */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setIsAddModalOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-[#E2E4E9]"
            >
              <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB] shrink-0">
                <h3 className="font-bold text-lg text-[#1C1F23]">
                  {editingDealId ? 'Edit Deal' : 'Add New Deal'}
                </h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-3 border-b border-[#E2E4E9] bg-white shrink-0">
                <div className="flex gap-2 overflow-x-auto">
                  {[
                    { id: 'details', label: 'Details' },
                    { id: 'notes', label: 'Updates & Notes' },
                    { id: 'proposals', label: `Proposals${dealProposals.length > 0 ? ` (${dealProposals.length})` : ''}` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as DealTab)}
                      className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${
                        activeTab === tab.id
                          ? 'bg-[#1061E3] text-white'
                          : 'bg-[#F0F2F5] text-[#4A4D53] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <form onSubmit={handleSaveDeal} className="flex flex-col flex-grow overflow-hidden">
                <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
                  {activeTab === 'details' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Deal Name</label>
                        <input required type="text" value={formData.name || ''} onChange={e => updateForm('name', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Current Step</label>
                        <select value={formData.currentStep || ''} onChange={e => updateForm('currentStep', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white">
                          <option value="" disabled>Select Step</option>
                          {DEAL_STEPS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Status</label>
                        <select value={formData.status || 'Not started'} onChange={e => updateForm('status', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white">
                          {DEAL_STATUSES.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Deal Value</label>
                        <input type="text" value={formData.value || ''} onChange={e => updateForm('value', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="e.g. $5,000" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Company</label>
                        <select 
                          value={formData.companyId || ''} 
                          onChange={e => {
                            const newCompanyId = e.target.value;
                            const matchingContact = contacts.find(c => c.companyId === newCompanyId);
                            setFormData(prev => ({ 
                              ...prev, 
                              companyId: newCompanyId,
                              contactId: matchingContact ? matchingContact.id : ''
                            }));
                          }} 
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white"
                        >
                          <option value="" disabled>Select Company</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Contact</label>
                        <select 
                          value={formData.contactId || ''} 
                          onChange={e => updateForm('contactId', e.target.value)} 
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white"
                          disabled={!formData.companyId}
                        >
                          <option value="" disabled>Select Contact</option>
                          {contacts.filter(c => !formData.companyId || c.companyId === formData.companyId).map(c => (
                            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {activeTab === 'notes' && (
                    <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Updates & Notes</label>
                    
                    {formData.notes && formData.notes.length > 0 && (
                      <div className="flex flex-col gap-2 mb-3 max-h-[300px] overflow-y-auto">
                        {formData.notes.map(note => (
                          <div key={note.id} className="bg-[#F9FAFB] p-3 rounded-md border border-[#E2E4E9]">
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                  style={{ backgroundColor: teamMembers.find(member => member.name === (note.author || 'User'))?.color || getAvatarColor(note.author) }}
                                >
                                  {teamMembers.find(member => member.name === (note.author || 'User'))?.initials || getInitials(note.author || 'User')}
                                </div>
                                <span className="font-semibold text-xs text-[#1C1F23] truncate">{note.author || 'User'}</span>
                              </div>
                              <span className="text-[10px] text-[#8E9299]">
                                {new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(note.createdAt))}
                              </span>
                            </div>
                            <p className="text-sm text-[#4A4D53] whitespace-pre-wrap">{note.text}</p>
                            {note.attachment && (
                              <div className="mt-2 flex items-center gap-1.5 text-xs text-[#1061E3] bg-blue-50 border border-blue-100 rounded px-2 py-1 w-fit">
                                <FileIcon className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[200px]">{note.attachment}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-2 relative">
                      {attachedFile && (
                        <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-md p-2">
                          <div className="flex items-center gap-2 text-sm text-[#1061E3]">
                            <FileIcon className="w-4 h-4" />
                            <span className="truncate max-w-[250px] font-medium">{attachedFile.name}</span>
                          </div>
                          <button type="button" onClick={() => setAttachedFile(null)} className="text-[#8E9299] hover:text-[#D32F2F] transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                      <div className="flex gap-2 items-start relative">
                        <div className="relative flex-grow">
                          <textarea 
                            ref={textareaRef}
                            value={newNoteText}
                            onChange={e => {
                              const val = e.target.value;
                              setNewNoteText(val);
                              
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
                            placeholder="Write a note or update..."
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
                                    const textToCursor = newNoteText.slice(0, cursorP);
                                    const textAfterCursor = newNoteText.slice(cursorP);
                                    const newText = textToCursor.replace(/@\w*$/, `@${member.name} `) + textAfterCursor;
                                    setNewNoteText(newText);
                                    setShowMentionMenu(false);
                                    textareaRef.current?.focus();
                                  }
                                } else if (e.key === 'Escape') {
                                  setShowMentionMenu(false);
                                }
                              } else if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleAddNote();
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
                                  e.target.value = '';
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
                                  const newText = newNoteText.substring(0, start) + '@' + newNoteText.substring(end);
                                  setNewNoteText(newText);
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
                          {showMentionMenu && (
                            <div className="absolute z-10 bottom-full mb-1 left-0 w-48 bg-white border border-[#E2E4E9] rounded-md shadow-lg overflow-hidden py-1">
                              {teamMembers.filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase())).length > 0 ? (
                                teamMembers.filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase())).map((member, i) => (
                                  <button
                                    type="button"
                                    key={member.id}
                                    onClick={() => {
                                      const cursorP = textareaRef.current?.selectionStart || 0;
                                      const textToCursor = newNoteText.slice(0, cursorP);
                                      const textAfterCursor = newNoteText.slice(cursorP);
                                      const newText = textToCursor.replace(/@\w*$/, `@${member.name} `) + textAfterCursor;
                                      setNewNoteText(newText);
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
                          type="button"
                          onClick={handleAddNote}
                          disabled={!newNoteText.trim() && !attachedFile}
                          className="px-4 py-2 h-[80px] bg-[#1061E3] text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          Post
                        </button>
                      </div>
                    </div>
                    </div>
                  )}

                  {activeTab === 'proposals' && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Assign Proposal</label>
                        <select
                          value=""
                          onChange={e => {
                            assignProposalToDeal(e.target.value);
                            e.target.value = '';
                          }}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white"
                          disabled={!currentDealId}
                        >
                          <option value="" disabled>{currentDealId ? 'Select proposal to assign' : 'Save the deal first to assign proposals'}</option>
                          {assignableProposals
                            .filter(proposal => proposal.dealId !== currentDealId)
                            .map(proposal => (
                              <option key={proposal.id} value={proposal.id}>{proposal.title}</option>
                            ))}
                        </select>
                      </div>

                      {dealProposals.length === 0 ? (
                        <div className="border border-dashed border-[#D0D5DD] rounded-lg p-8 text-center text-sm text-[#8E9299]">
                          No proposals are assigned to this deal.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {dealProposals.map(proposal => (
                            <div key={proposal.id} className="rounded-lg border border-[#E2E4E9] bg-[#F9FAFB] p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileText className="w-4 h-4 text-[#8E9299]" />
                                    <h5 className="text-sm font-semibold text-[#1C1F23] truncate">{proposal.title}</h5>
                                  </div>
                                  <p className="text-xs text-[#8E9299]">
                                    Created {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(proposal.date))}
                                  </p>
                                  <p className="text-xs text-[#8E9299] mt-1">
                                    Valid until {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(proposal.validUntil))}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-2 shrink-0">
                                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase whitespace-nowrap ${
                                    proposal.status === 'Draft' ? 'bg-gray-100 text-gray-700' :
                                    proposal.status === 'Sent' ? 'bg-blue-100 text-blue-700' :
                                    proposal.status === 'Accepted' ? 'bg-green-100 text-green-700' :
                                    'bg-red-100 text-red-700'
                                  }`}>
                                    {proposal.status}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => unassignProposalFromDeal(proposal.id)}
                                    className="text-xs font-semibold text-[#D32F2F] hover:text-red-700 transition-colors"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between text-sm">
                                <span className="text-[#4A4D53]">{proposal.items.length} item{proposal.items.length === 1 ? '' : 's'}</span>
                                <span className="font-semibold text-[#1C1F23]">
                                  ${calculateProposalTotal(proposal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              {proposal.notes && (
                                <p className="mt-3 text-sm text-[#4A4D53] whitespace-pre-wrap">{proposal.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex justify-end gap-3 shrink-0">
                  {editingDealId && (
                    <button 
                      type="button"
                      onClick={() => {
                        handleDeleteDeal(editingDealId);
                        setIsAddModalOpen(false);
                      }}
                      className="px-4 py-2 rounded-md text-sm font-semibold text-[#D32F2F] hover:bg-[#FEE2E2] transition-colors flex items-center gap-2 mr-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Deal
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-md text-sm font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors"
                  >
                    {editingDealId ? 'Save Changes' : 'Save Deal'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deal Import Modal */}
      <DealImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        teamMembers={teamMembers}
        companies={companies}
        contacts={contacts}
        deals={deals}
      />
    </div>
  );
}
