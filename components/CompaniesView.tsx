'use client';

import React, { useState, useMemo } from 'react';
import { Search, Plus, X, Check, GripVertical, FileText, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TeamMember, AssigneeDropdown, Company, Contact, ContactDropdown, Proposal } from '@/components/Shared';
import { createCompany, updateCompany, deleteCompany } from '@/lib/crmStore';
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

function SortableRow({ company, onClick, onUpdate, toggleService, teamMembers, contacts, onDelete }: { company: Company; onClick: () => void; onUpdate: (id: string, field: keyof Company, value: any) => void; toggleService: (e: React.MouseEvent, id: string, field: keyof Company) => void; teamMembers: TeamMember[]; contacts: Contact[]; onDelete: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: company.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} onClick={onClick} className="hover:bg-gray-50 transition-colors cursor-pointer bg-white">
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
          <GripVertical className="w-4 h-4" />
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={company.name} onSave={v => onUpdate(company.id, 'name', v)} renderValue={v => <strong>{v}</strong>} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={company.domain} onSave={v => onUpdate(company.id, 'domain', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={company.industry} onSave={v => onUpdate(company.id, 'industry', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <ContactDropdown value={company.primaryContactId || ''} onSave={v => onUpdate(company.id, 'primaryContactId', v)} contacts={contacts} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={company.phone} onSave={v => onUpdate(company.id, 'phone', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'web')}>
        {company.web && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'seo')}>
        {company.seo && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'll')}>
        {company.ll && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'ppc')}>
        {company.ppc && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'smm')}>
        {company.smm && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'sma')}>
        {company.sma && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'em')}>
        {company.em && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'dp')}>
        {company.dp && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <AssigneeDropdown value={company.assignedToId} onSave={v => onUpdate(company.id, 'assignedToId', v)} teamMembers={teamMembers} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-right w-12">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(company.id); }}
          className="p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Delete Company"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

type CompanyProfileTab = 'details' | 'description' | 'updates' | 'proposals';

export default function CompaniesView({ teamMembers, companies, setCompanies, contacts, proposals }: { teamMembers: TeamMember[], companies: Company[], setCompanies: React.Dispatch<React.SetStateAction<Company[]>>, contacts: Contact[], proposals: Proposal[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyProfileTab>('details');

  // Form State
  const [formData, setFormData] = useState<Partial<Company>>({});
  const [newUpdateText, setNewUpdateText] = useState('');

  const [confirmAction, setConfirmAction] = useState<{id: string, field: keyof Company} | null>(null);

  const filteredCompanies = useMemo(() => {
    return companies.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.industry.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [companies, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setCompanies((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const openAddModal = () => {
    setEditingCompanyId(null);
    setFormData({});
    setNewUpdateText('');
    setActiveTab('details');
    setIsAddModalOpen(true);
  };

  const openEditModal = (company: Company) => {
    setEditingCompanyId(company.id);
    setFormData(company);
    setNewUpdateText('');
    setActiveTab('details');
    setIsAddModalOpen(true);
  };

  const handleUpdateCompany = (id: string, field: keyof Company, value: any) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleDeleteCompany = async (id: string) => {
    if (confirm('Are you sure you want to delete this company? This action cannot be undone.')) {
      try {
        await deleteCompany(id);
      } catch (err) {
        console.error('Failed to delete company', err);
        alert('Failed to delete company. Check console.');
      }
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    let updatedUpdates = formData.updates || [];
    if (newUpdateText.trim()) {
      const author = teamMembers?.[0]?.name || 'You';
      updatedUpdates = [
        ...updatedUpdates,
        {
          id: Date.now().toString(),
          author,
          text: newUpdateText.trim(),
          createdAt: new Date().toISOString(),
        }
      ];
    }
    
    if (editingCompanyId) {
      try {
        await updateCompany(editingCompanyId, { ...(formData as Partial<Omit<Company, 'id'>>), updates: updatedUpdates });
      } catch (err) {
        console.error('Failed to update company', err);
        alert('Failed to save company to Firestore. Check console for details (often Security Rules).');
        return;
      }
    } else {
      const newCompany: Omit<Company, 'id'> = {
        name: formData.name || '',
        domain: formData.domain || '',
        phone: formData.phone || '',
        email: formData.email || '',
        street: formData.street || '',
        city: formData.city || '',
        state: formData.state || '',
        zipcode: formData.zipcode || '',
        industry: formData.industry || '',
        founded: formData.founded || '',
        servicesOffered: formData.servicesOffered || '',
        productsOffered: formData.productsOffered || '',
        hoursOfOperation: formData.hoursOfOperation || '',
        servicesNeeded: formData.servicesNeeded || '',
        facebookUrl: formData.facebookUrl || '',
        referralSource: formData.referralSource || '',
        assignedToId: formData.assignedToId || teamMembers[0]?.id || '1',
        primaryContactId: formData.primaryContactId || '',
        description: formData.description || '',
        updates: updatedUpdates,
        web: formData.web || false,
        seo: formData.seo || false,
        ll: formData.ll || false,
        ppc: formData.ppc || false,
        smm: formData.smm || false,
        sma: formData.sma || false,
        em: formData.em || false,
        dp: formData.dp || false,
      };
      try {
        await createCompany(newCompany);
      } catch (err) {
        console.error('Failed to create company', err);
        alert('Failed to create company in Firestore. Check console for details (often Security Rules).');
        return;
      }
    }
    
    setNewUpdateText('');
    setIsAddModalOpen(false);
  };

  const updateForm = (field: keyof Company, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleService = (e: React.MouseEvent, id: string, field: keyof Company) => {
    e.stopPropagation();
    const company = companies.find(c => c.id === id);
    if (company && company[field] === true) {
      setConfirmAction({ id, field });
      return;
    }
    
    // If checking, just do it directly
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: !c[field] } : c));
  };

  const companyProposals = proposals.filter(proposal => proposal.companyId === editingCompanyId);
  const calculateProposalTotal = (proposal: Proposal) => proposal.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center justify-between px-6 shrink-0">
        <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
          <Search className="w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder="Search Companies..."
            className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button 
            onClick={openAddModal}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#1061E3] bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Company
          </button>
        </div>
      </header>

      {/* View Header */}
      <div className="p-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="m-0 text-2xl font-bold text-[#1C1F23]">Companies</h1>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-grow px-6 pb-6 overflow-auto">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden text-left mb-8">
            <thead>
              <tr>
                <th className="w-10 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
                <th className="w-[200px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY NAME</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DOMAIN</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">INDUSTRY</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">PRIMARY CONTACT</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">PHONE</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">WEB</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">SEO</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">LL</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">PPC</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">SMM</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">SMA</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">EM</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center">DP</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">ASSIGNED</th>
                <th className="w-12 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
              </tr>
            </thead>
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={filteredCompanies.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-8 text-center text-[#8E9299] text-sm">No companies found.</td>
                  </tr>
                ) : filteredCompanies.map(company => (
                  <SortableRow 
                    key={company.id} 
                    company={company} 
                    onClick={() => openEditModal(company)} 
                    onUpdate={handleUpdateCompany} 
                    toggleService={toggleService}
                    teamMembers={teamMembers}
                    contacts={contacts}
                    onDelete={handleDeleteCompany}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>

      {/* Add/Edit Company Panel */}
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
              className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-[#E2E4E9]"
            >
              <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB] shrink-0">
                <h3 className="font-bold text-lg text-[#1C1F23]">
                  {editingCompanyId ? 'Edit Company' : 'Add New Company'}
                </h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-3 border-b border-[#E2E4E9] bg-white shrink-0">
                <div className="flex gap-2 overflow-x-auto">
                  {[
                    { id: 'details', label: 'Details' },
                    { id: 'description', label: 'Description' },
                    { id: 'updates', label: 'Updates & Comments' },
                    { id: 'proposals', label: `Proposals${editingCompanyId && companyProposals.length > 0 ? ` (${companyProposals.length})` : ''}` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as CompanyProfileTab)}
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
              <form onSubmit={handleSaveCompany} className="flex flex-col flex-grow overflow-hidden">
                <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-6">
                  {activeTab === 'details' && (
                    <>
                      <div>
                        <h4 className="text-sm font-bold text-[#1C1F23] mb-3 uppercase tracking-wider">Basic Information</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Company Name</label>
                            <input required type="text" value={formData.name || ''} onChange={e => updateForm('name', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Domain</label>
                            <input type="text" value={formData.domain || ''} onChange={e => updateForm('domain', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="e.g. acme.com" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Primary Contact</label>
                            <select value={formData.primaryContactId || ''} onChange={e => updateForm('primaryContactId', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white">
                              <option value="">Select Contact</option>
                              {contacts.map(c => (
                                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Phone</label>
                            <input type="tel" value={formData.phone || ''} onChange={e => updateForm('phone', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Email</label>
                            <input type="email" value={formData.email || ''} onChange={e => updateForm('email', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-[#1C1F23] mb-3 uppercase tracking-wider">Location</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Street</label>
                            <input type="text" value={formData.street || ''} onChange={e => updateForm('street', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">City</label>
                            <input type="text" value={formData.city || ''} onChange={e => updateForm('city', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">State</label>
                              <input type="text" value={formData.state || ''} onChange={e => updateForm('state', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Zipcode</label>
                              <input type="text" value={formData.zipcode || ''} onChange={e => updateForm('zipcode', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-[#1C1F23] mb-3 uppercase tracking-wider">Company Details</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Industry</label>
                            <input type="text" value={formData.industry || ''} onChange={e => updateForm('industry', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Founded</label>
                            <input type="text" value={formData.founded || ''} onChange={e => updateForm('founded', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="e.g. 2010" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Services Offered</label>
                            <input type="text" value={formData.servicesOffered || ''} onChange={e => updateForm('servicesOffered', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Products Offered</label>
                            <input type="text" value={formData.productsOffered || ''} onChange={e => updateForm('productsOffered', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Hours of Operation</label>
                            <input type="text" value={formData.hoursOfOperation || ''} onChange={e => updateForm('hoursOfOperation', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Services Needed</label>
                            <input type="text" value={formData.servicesNeeded || ''} onChange={e => updateForm('servicesNeeded', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Facebook URL</label>
                            <input type="text" value={formData.facebookUrl || ''} onChange={e => updateForm('facebookUrl', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Referral Source</label>
                            <input type="text" value={formData.referralSource || ''} onChange={e => updateForm('referralSource', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {activeTab === 'description' && (
                    <div>
                      <h4 className="text-sm font-bold text-[#1C1F23] mb-3 uppercase tracking-wider">Description</h4>
                      <textarea
                        value={formData.description || ''}
                        onChange={e => updateForm('description', e.target.value)}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] min-h-[320px] resize-y"
                        placeholder="Add a company description..."
                      />
                    </div>
                  )}

                  {activeTab === 'updates' && (
                    <div>
                      <h4 className="text-sm font-bold text-[#1C1F23] mb-3 uppercase tracking-wider">Updates & Comments</h4>
                      {formData.updates && formData.updates.length > 0 ? (
                        <div className="flex flex-col gap-3 mb-4 max-h-[280px] overflow-y-auto">
                          {formData.updates.map(update => (
                            <div key={update.id} className="bg-[#F9FAFB] p-3 rounded-md border border-[#E2E4E9]">
                              <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                    style={{ backgroundColor: teamMembers.find(member => member.name === (update.author || 'User'))?.color || getAvatarColor(update.author) }}
                                  >
                                    {teamMembers.find(member => member.name === (update.author || 'User'))?.initials || getInitials(update.author || 'User')}
                                  </div>
                                  <span className="font-semibold text-xs text-[#1C1F23] truncate">{update.author || 'User'}</span>
                                </div>
                                <span className="text-[10px] text-[#8E9299]">
                                  {new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(update.createdAt))}
                                </span>
                              </div>
                              <p className="text-sm text-[#4A4D53] whitespace-pre-wrap">{update.text}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[#8E9299] mb-4">No updates yet.</p>
                      )}
                      <textarea
                        value={newUpdateText}
                        onChange={e => setNewUpdateText(e.target.value)}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] min-h-[100px] resize-y"
                        placeholder="Write an update or comment..."
                      />
                    </div>
                  )}

                  {activeTab === 'proposals' && (
                    <div>
                      <h4 className="text-sm font-bold text-[#1C1F23] mb-3 uppercase tracking-wider">Proposals</h4>
                      {companyProposals.length === 0 ? (
                        <div className="border border-dashed border-[#D0D5DD] rounded-lg p-8 text-center text-sm text-[#8E9299]">
                          No proposals are attached to this company.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {companyProposals.map(proposal => (
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
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase whitespace-nowrap ${
                                  proposal.status === 'Draft' ? 'bg-gray-100 text-gray-700' :
                                  proposal.status === 'Sent' ? 'bg-blue-100 text-blue-700' :
                                  proposal.status === 'Accepted' ? 'bg-green-100 text-green-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {proposal.status}
                                </span>
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
                  <div className="flex gap-3">
                    {editingCompanyId && (
                      <button 
                        type="button"
                        onClick={() => {
                          handleDeleteCompany(editingCompanyId);
                          setIsAddModalOpen(false);
                        }}
                        className="px-4 py-2 rounded-md text-sm font-semibold text-[#D32F2F] hover:bg-[#FEE2E2] transition-colors flex items-center gap-2 mr-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Company
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
                      {editingCompanyId ? 'Save Changes' : 'Save Company'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Modal */}
      <AnimatePresence>
        {confirmAction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setConfirmAction(null)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 border border-[#E2E4E9]"
            >
              <h3 className="font-bold text-lg text-[#1C1F23] mb-2">Uncheck Option</h3>
              <p className="text-sm text-[#4A4D53] mb-6">Are you sure you want to uncheck this option? This action might affect related services.</p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 rounded-md text-sm font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setCompanies(prev => prev.map(c => c.id === confirmAction.id ? { ...c, [confirmAction.field]: false } : c));
                    setConfirmAction(null);
                  }}
                  className="px-4 py-2 rounded-md text-sm font-semibold bg-[#D32F2F] text-white hover:bg-red-700 transition-colors"
                >
                  Uncheck
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
