'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, Plus, X, GripVertical, Paperclip, AtSign, File as FileIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TeamMember, AssigneeDropdown, Company, Contact } from '@/components/Shared';
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

interface DealNote {
  id: string;
  author?: string;
  text: string;
  createdAt: string;
  attachment?: string;
}

interface Deal {
  id: string;
  name: string;
  currentStep: string;
  status: string;
  assignedToId: string;
  value: string;
  companyId: string;
  contactId: string;
  notes: DealNote[];
}

const DEAL_STEPS = [
  'Step 1: Discovery Call',
  'Step 2: Onboarding',
  'Step 3: Strategy Meeting',
  'Step 4: Plan & Proposal',
  'Step 5: Proposal Signing',
  'Step 6: Deposit Payment'
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

const INITIAL_DEALS: Deal[] = [
  {
    id: '1',
    name: 'Website Redesign',
    currentStep: 'Step 4: Plan & Proposal',
    status: 'In Progress',
    assignedToId: '1',
    value: '$5,000',
    companyId: '1',
    contactId: '1',
    notes: [{ id: 'n1', text: 'Follow up next Tuesday', createdAt: new Date().toISOString() }],
  },
  {
    id: '2',
    name: 'SEO Campaign',
    currentStep: 'Step 1: Discovery Call',
    status: 'Need to Call / Email',
    assignedToId: '2',
    value: '$1,500/mo',
    companyId: '1', /* matching Acme for testing */
    contactId: '2',
    notes: [{ id: 'n2', text: 'Interested in local SEO', createdAt: new Date().toISOString() }],
  },
  {
    id: '3',
    name: 'Logo Design',
    currentStep: 'Step 6: Deposit Payment',
    status: 'WON',
    assignedToId: '1',
    value: '$800',
    companyId: '1',
    contactId: '3',
    notes: [{ id: 'n3', text: 'Paid via Stripe', createdAt: new Date().toISOString() }],
  },
  {
    id: '4',
    name: 'Social Media Management',
    currentStep: 'Step 5: Proposal Signing',
    status: 'LOST',
    assignedToId: '3',
    value: '$2,000/mo',
    companyId: '1',
    contactId: '4',
    notes: [{ id: 'n4', text: 'Went with another agency', createdAt: new Date().toISOString() }],
  }
];

function EditableCell({ value, onSave, renderValue }: { value: string, onSave: (val: string) => void, renderValue?: (val: string) => React.ReactNode }) {
  return (
    <div className="min-h-[20px] truncate" title={value || ''}>
      {renderValue ? renderValue(value) : (value || '-')}
    </div>
  );
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

function SortableRow({ deal, onClick, onUpdate, teamMembers, companies, contacts, isFaded = false }: { deal: Deal; onClick: () => void; onUpdate: (id: string, field: keyof Deal, value: any) => void; teamMembers: TeamMember[]; companies: Company[]; contacts: Contact[]; isFaded?: boolean }) {
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
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={deal.name} onSave={v => onUpdate(deal.id, 'name', v)} renderValue={v => <strong>{v}</strong>} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableSelect value={deal.currentStep} options={DEAL_STEPS} onSave={v => onUpdate(deal.id, 'currentStep', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableStatus value={deal.status} onSave={v => onUpdate(deal.id, 'status', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <AssigneeDropdown value={deal.assignedToId} onSave={v => onUpdate(deal.id, 'assignedToId', v)} teamMembers={teamMembers} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={deal.value} onSave={v => onUpdate(deal.id, 'value', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <div className="min-h-[20px] truncate">
          {companies.find(c => c.id === deal.companyId)?.name || '-'}
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <div className="min-h-[20px] truncate">
          {(() => {
            const contact = contacts.find(c => c.id === deal.contactId);
            return contact ? `${contact.firstName} ${contact.lastName}` : '-';
          })()}
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <div className="truncate max-w-[150px]" title={deal.notes && deal.notes.length > 0 ? deal.notes[deal.notes.length - 1].text : ''}>
          {deal.notes && deal.notes.length > 0 ? deal.notes[deal.notes.length - 1].text : '-'}
        </div>
      </td>
    </tr>
  );
}


export default function DealsView({ teamMembers, companies, contacts }: { teamMembers: TeamMember[], companies: Company[], contacts: Contact[] }) {
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Deal>>({});
  const [newNoteText, setNewNoteText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      const companyName = companies.find(c => c.id === d.companyId)?.name || '';
      const contactObj = contacts.find(c => c.id === d.contactId);
      const contactName = contactObj ? `${contactObj.firstName} ${contactObj.lastName}` : '';
      return d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.status.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [deals, searchQuery, companies, contacts]);

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
    setIsAddModalOpen(true);
  };

  const openEditModal = (deal: Deal) => {
    setEditingDealId(deal.id);
    setFormData(deal);
    setNewNoteText('');
    setIsAddModalOpen(true);
  };

  const handleUpdateDeal = (id: string, field: keyof Deal, value: any) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleAddNote = () => {
    if (!newNoteText.trim() && !attachedFile) return;
    
    const author = teamMembers?.[0]?.name || 'You';
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

  const handleSaveDeal = (e: React.FormEvent) => {
    e.preventDefault();
    
    let updatedNotes = formData.notes || [];
    if (newNoteText.trim() || attachedFile) {
      const author = teamMembers?.[0]?.name || 'You';
      updatedNotes = [...updatedNotes, { 
        id: Date.now().toString(), 
        author,
        text: newNoteText.trim(), 
        createdAt: new Date().toISOString(),
        attachment: attachedFile ? attachedFile.name : undefined
      }];
    }

    if (editingDealId) {
      setDeals(deals.map(d => {
        if (d.id === editingDealId) {
          return { ...d, ...formData, notes: updatedNotes } as Deal;
        }
        return d;
      }));
    } else {
      const newDeal: Deal = {
        id: Date.now().toString(),
        name: formData.name || '',
        currentStep: formData.currentStep || '',
        status: formData.status || 'Not started',
        assignedToId: formData.assignedToId || teamMembers[0]?.id || '1',
        value: formData.value || '',
        companyId: formData.companyId || '',
        contactId: formData.contactId || '',
        notes: updatedNotes,
      };
      setDeals([...deals, newDeal]);
    }
    
    setIsAddModalOpen(false);
  };

  const updateForm = (field: keyof Deal, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
          <button className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter
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
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden text-left mb-8">
            <thead>
              <tr>
                <th className="w-10 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
                <th className="w-[200px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEAL NAME</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">CURRENT STEP</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">STATUS</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">ASSIGNED</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEAL VALUE</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">CONTACT</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">NOTES</th>
              </tr>
            </thead>
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={activeDeals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {activeDeals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[#8E9299] text-sm">No active deals found.</td>
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
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden text-left mb-8">
            <thead>
              <tr>
                <th className="w-10 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
                <th className="w-[200px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEAL NAME</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">CURRENT STEP</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">STATUS</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">ASSIGNED</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEAL VALUE</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">CONTACT</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">NOTES</th>
              </tr>
            </thead>
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={wonDeals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {wonDeals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[#8E9299] text-sm">No won deals found.</td>
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
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden text-left mb-8">
            <thead>
              <tr>
                <th className="w-10 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
                <th className="w-[200px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEAL NAME</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">CURRENT STEP</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">STATUS</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">ASSIGNED</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEAL VALUE</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">CONTACT</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">NOTES</th>
              </tr>
            </thead>
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={lostDeals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {lostDeals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[#8E9299] text-sm">No lost deals found.</td>
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
                    isFaded={true}
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
              <form onSubmit={handleSaveDeal} className="flex flex-col flex-grow overflow-hidden">
                <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
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
                  <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Updates & Notes</label>
                    
                    {formData.notes && formData.notes.length > 0 && (
                      <div className="flex flex-col gap-2 mb-3 max-h-[300px] overflow-y-auto">
                        {formData.notes.map(note => (
                          <div key={note.id} className="bg-[#F9FAFB] p-3 rounded-md border border-[#E2E4E9]">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-xs text-[#1C1F23]">{note.author || 'User'}</span>
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
                </div>
                <div className="p-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex justify-end gap-3 shrink-0">
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
    </div>
  );
}
