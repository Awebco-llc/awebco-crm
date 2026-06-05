'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Search, Plus, X, Check, GripVertical, FileText, Trash2, ExternalLink, Filter, ChevronDown, RefreshCw, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TeamMember, AssigneeDropdown, Company, Contact, ContactDropdown, Proposal } from '@/components/Shared';
import RichTextEditor from './RichTextEditor';
import { createCompany, updateCompany, deleteCompany, createTicket, createGroup, createGroupWithId, updateTicket } from '@/lib/crmStore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
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
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setTempValue(value);
  }, [value]);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      setIsEditing(false);
      if (tempValue !== value) {
        onSave(tempValue);
      }
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (tempValue !== value) {
      onSave(tempValue);
    }
  };

  if (isEditing) {
    return (
      <div 
        className="w-full h-full flex items-center" 
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={tempValue || ''}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full px-1.5 py-0.5 text-[13px] border border-[#1061E3] rounded outline-none bg-white text-[#1C1F23] focus:ring-1 focus:ring-[#1061E3] font-medium"
        />
      </div>
    );
  }

  return (
    <div 
      className="min-h-[20px] truncate hover:bg-gray-100/80 rounded px-1 -mx-1 transition-colors cursor-text" 
      title={value ? `${value} (Click to edit)` : 'Click to edit'}
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
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

function SortableRow({ company, onClick, onUpdate, toggleService, teamMembers, contacts, onDelete, visibleColumns }: { company: Company; onClick: () => void; onUpdate: (id: string, field: keyof Company, value: any) => void; toggleService: (e: React.MouseEvent, id: string, field: keyof Company) => void; teamMembers: TeamMember[]; contacts: Contact[]; onDelete: (id: string) => void; visibleColumns: string[] }) {
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
    <tr 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      onClick={onClick} 
      className="hover:bg-gray-50 transition-colors cursor-pointer bg-white"
    >
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        <div className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
          <GripVertical className="w-4 h-4" />
        </div>
      </td>
      {visibleColumns.includes('name') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableCell value={company.name} onSave={v => onUpdate(company.id, 'name', v)} renderValue={v => <strong>{v}</strong>} />
        </td>
      )}
      {visibleColumns.includes('domain') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableCell 
            value={company.domain} 
            onSave={v => onUpdate(company.id, 'domain', v)} 
            renderValue={v => {
              if (!v) return '-';
              const url = v.startsWith('http://') || v.startsWith('https://') ? v : `https://${v}`;
              return (
                <a 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  onClick={e => e.stopPropagation()} 
                  className="text-[#1061E3] hover:underline inline-flex items-center gap-1 group/link"
                >
                  <span>{v}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#1061E3] opacity-60 group-hover/link:opacity-100 transition-opacity shrink-0" />
                </a>
              );
            }}
          />
        </td>
      )}
      {visibleColumns.includes('industry') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableCell value={company.industry} onSave={v => onUpdate(company.id, 'industry', v)} />
        </td>
      )}
      {visibleColumns.includes('primaryContactId') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <ContactDropdown value={company.primaryContactId || ''} onSave={v => onUpdate(company.id, 'primaryContactId', v)} contacts={contacts} />
        </td>
      )}
      {visibleColumns.includes('phone') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
          <EditableCell value={company.phone} onSave={v => onUpdate(company.id, 'phone', v)} />
        </td>
      )}
      {visibleColumns.includes('web') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'web')}>
          {company.web && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
      {visibleColumns.includes('seo') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'seo')}>
          {company.seo && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
      {visibleColumns.includes('ll') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'll')}>
          {company.ll && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
      {visibleColumns.includes('ppc') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'ppc')}>
          {company.ppc && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
      {visibleColumns.includes('smm') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'smm')}>
          {company.smm && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
      {visibleColumns.includes('sma') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'sma')}>
          {company.sma && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
      {visibleColumns.includes('em') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'em')}>
          {company.em && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
      {visibleColumns.includes('dp') && (
        <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-center" onClick={(e) => toggleService(e, company.id, 'dp')}>
          {company.dp && <Check className="w-4 h-4 text-[#10B981] mx-auto" />}
        </td>
      )}
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

const PLANS_CONFIG = [
  { field: 'web', notesField: 'webNotes', name: 'Websites', desc: 'Professional web design, development, and hosting.' },
  { field: 'seo', notesField: 'seoNotes', name: 'SEO', desc: 'Search engine optimization to improve search rankings.' },
  { field: 'll', notesField: 'llNotes', name: 'Local Listings', desc: 'Manage local directory citations and map visibility.' },
  { field: 'ppc', notesField: 'ppcNotes', name: 'Google Ads', desc: 'Pay-per-click advertising setup and optimization.' },
  { field: 'smm', notesField: 'smmNotes', name: 'Social Media Management', desc: 'Organic scheduling, posting, and profile management.' },
  { field: 'sma', notesField: 'smaNotes', name: 'Social Media Ads', desc: 'Paid social media ad campaign setup and running.' },
  { field: 'em', notesField: 'emNotes', name: 'Email Marketing', desc: 'Automated list building, newsletters, and email flows.' },
  { field: 'dp', notesField: 'dpNotes', name: 'Design & Print', desc: 'Graphic design for digital files and print materials.' },
  { field: 'support', notesField: 'supportNotes', name: 'Support Tickets', desc: 'Technical troubleshooting, hosting management, and support.' }
] as const;

type CompanyProfileTab = 'details' | 'description' | 'plans' | 'updates' | 'proposals';

export default function CompaniesView({ teamMembers, companies, setCompanies, contacts, proposals, allowDeletingColumns = false }: { teamMembers: TeamMember[], companies: Company[], setCompanies: React.Dispatch<React.SetStateAction<Company[]>>, contacts: Contact[], proposals: Proposal[], allowDeletingColumns?: boolean }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyProfileTab>('details');

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [serviceFilterMode, setServiceFilterMode] = useState<'all' | 'any'>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [isIndustryFilterOpen, setIsIndustryFilterOpen] = useState(false);
  const [tempSelectedIndustries, setTempSelectedIndustries] = useState<string[]>([]);
  const [industrySearchQuery, setIndustrySearchQuery] = useState('');

  const industryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    companies.forEach(c => {
      const ind = c.industry || 'Unassigned';
      counts[ind] = (counts[ind] || 0) + 1;
    });
    return counts;
  }, [companies]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(['name', 'domain', 'industry', 'primaryContactId', 'phone', 'web', 'seo', 'll', 'ppc', 'smm', 'sma', 'em']);
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('awebco_companies_sort_config');
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

  React.useEffect(() => {
    if (sortConfig) {
      localStorage.setItem('awebco_companies_sort_config', JSON.stringify(sortConfig));
    } else {
      localStorage.removeItem('awebco_companies_sort_config');
    }
  }, [sortConfig]);

  const handleSort = useCallback((column: string) => {
    setSortConfig(prev => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  }, []);

  const renderSortIcon = (column: string) => {
    if (sortConfig?.column === column) {
      return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />;
    }
    return <ChevronsUpDown className="w-3.5 h-3.5 text-[#C8CDD5] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />;
  };

  // Form State
  const [formData, setFormData] = useState<Partial<Company>>({});
  const [newUpdateText, setNewUpdateText] = useState('');

  const onTogglePlan = (field: keyof Company) => {
    const newVal = !formData[field];
    updateForm(field, newVal);
    if (editingCompanyId) {
      handleToggleService(editingCompanyId, field, newVal);
    }
  };

  const [confirmAction, setConfirmAction] = useState<{id: string, field: keyof Company} | null>(null);

  const filteredCompanies = useMemo(() => {
    const filtered = companies.filter(c => {
      const matchesSearch = 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.industry.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      if (selectedServices.length > 0) {
        const matchesServices = serviceFilterMode === 'all'
          ? selectedServices.every(service => !!c[service as keyof Company])
          : selectedServices.some(service => !!c[service as keyof Company]);
        if (!matchesServices) return false;
      }

      if (selectedIndustries.length > 0) {
        const ind = c.industry || 'Unassigned';
        if (!selectedIndustries.includes(ind)) return false;
      }

      return true;
    });

    if (!sortConfig) return filtered;
    return [...filtered].sort((a, b) => {
      const col = sortConfig.column as keyof Company;
      if (col === 'deadline') {
        const valA = a[col];
        const valB = b[col];
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
      const aVal = String(a[col] ?? '').toLowerCase();
      const bVal = String(b[col] ?? '').toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [companies, searchQuery, selectedServices, serviceFilterMode, selectedIndustries, sortConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
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

  const handleUpdateCompany = async (id: string, field: keyof Company, value: any) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    try {
      await updateCompany(id, { [field]: value });
    } catch (err) {
      console.error('Failed to update company in Firestore:', err);
    }
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
        assignedToId: formData.assignedToId || '',
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

  const handleToggleService = async (companyId: string, field: keyof Company, isChecked: boolean) => {
    try {
      // 1. Update company service in Firestore
      await updateCompany(companyId, { [field]: isChecked });

      // 2. If checking service, check if a ticket already exists or needs to be created
      if (isChecked) {
        const SERVICE_TO_WORKSPACE_MAP: Record<string, string> = {
          web: 'Websites',
          seo: 'SEO',
          ll: 'Local Listings',
          ppc: 'Google Ads',
          smm: 'Social Media',
          dp: 'Design & Print',
          support: 'Support Tickets',
        };

        const workspaceName = SERVICE_TO_WORKSPACE_MAP[field as string];
        if (workspaceName) {
          const db = getDb();
          let targetGroupId = '';

          if (workspaceName === 'SEO') {
            const company = companies.find(c => c.id === companyId);
            if (company) {
              // Check if a group for this company already exists on the SEO board
              const groupQuery = query(
                collection(db, 'groups'),
                where('workspace', '==', 'SEO'),
                where('companyId', '==', companyId)
              );
              const groupSnapshot = await getDocs(groupQuery);

              if (groupSnapshot.empty) {
                // Check if there are no groups in Firestore for SEO to write default groups first
                const allGroupsQuery = query(
                  collection(db, 'groups'),
                  where('workspace', '==', 'SEO')
                );
                const allGroupsSnapshot = await getDocs(allGroupsQuery);
                let nextOrder = 0;

                if (allGroupsSnapshot.empty) {
                  // Create default groups first so they don't disappear
                  const defaults = [
                    { id: 'group-active', name: 'Setup' },
                    { id: 'group-running', name: 'Running' }
                  ];
                  for (const def of defaults) {
                    await createGroupWithId(def.id, {
                      name: def.name,
                      workspace: 'SEO',
                      order: nextOrder++
                    });
                  }
                } else {
                  // Find maximum order among existing groups
                  let maxOrder = 0;
                  allGroupsSnapshot.forEach((doc) => {
                    const gData = doc.data();
                    if (gData.order !== undefined && gData.order > maxOrder) {
                      maxOrder = gData.order;
                    }
                  });
                  nextOrder = maxOrder + 1;
                }

                // Create the new group named after the business name
                const newGroupRef = await createGroup({
                  name: company.name,
                  workspace: 'SEO',
                  companyId: company.id,
                  order: nextOrder
                });
                targetGroupId = newGroupRef.id;
              } else {
                targetGroupId = groupSnapshot.docs[0].id;
              }
            }
          } else {
            // Non-SEO workspace: resolve the target group ID dynamically.
            const groupsQuery = query(
              collection(db, 'groups'),
              where('workspace', '==', workspaceName)
            );
            const groupsSnapshot = await getDocs(groupsQuery);
            if (!groupsSnapshot.empty) {
              const existingGroups = groupsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })) as any[];
              existingGroups.sort((a, b) => (a.order || 0) - (b.order || 0));
              targetGroupId = existingGroups[0].id;
            } else {
              // No groups exist in Firestore for this workspace. Initialize default groups.
              const defaults = workspaceName === 'Local Listings'
                ? [{ id: 'group-setup', name: 'Setup' }, { id: 'group-running', name: 'Running' }]
                : workspaceName === 'Social Media'
                ? [{ id: 'group-smm', name: 'Social Media Management' }, { id: 'group-sma', name: 'Social Media Advertising' }]
                : workspaceName === 'Design & Print' || workspaceName === 'Support Tickets'
                ? [{ id: 'group-active', name: 'Active' }, { id: 'group-needs-invoiced', name: 'Needs Invoiced' }, { id: 'group-completed', name: 'Complete' }]
                : [{ id: 'group-active', name: 'Active' }, { id: 'group-completed', name: 'Completed / Launched' }];

              targetGroupId = defaults[0].id;
              let nextOrder = 0;
              for (const def of defaults) {
                await createGroupWithId(def.id, {
                  name: def.name,
                  workspace: workspaceName,
                  order: nextOrder++
                });
              }
            }
          }

          // Check if ticket already exists
          const q = query(
            collection(db, 'tickets'),
            where('companyId', '==', companyId),
            where('workspace', '==', workspaceName)
          );
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
            const company = companies.find(c => c.id === companyId);
            if (company) {
              const primaryContact = contacts.find(c => c.id === company.primaryContactId);
              const contactName = primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}`.trim() : '';
              const contactEmail = primaryContact ? primaryContact.email : (company.email || '');

              const newTicket: any = {
                projectName: company.name,
                assignee: company.assignedToId || '',
                assignees: company.assignedToId ? [company.assignedToId] : [],
                status: 'Not Started',
                deadline: company.deadline || '',
                url: company.domain || '',
                description: '',
                notes: '',
                files: [],
                isManual: false,
                groupId: targetGroupId || (workspaceName === 'Local Listings' ? 'group-setup' : workspaceName === 'Social Media' ? 'group-smm' : 'group-active'),
                workspace: workspaceName,
                companyId: company.id,
                companyName: company.name,
                contactName,
                email: contactEmail,
                order: 0,
              };

              if (workspaceName === 'Local Listings') {
                newTicket.planType = 'Basic Plan';
              }
              if (workspaceName === 'Support Tickets' || workspaceName === 'Design & Print') {
                newTicket.priority = 'Medium';
              }

              await createTicket(newTicket);
            }
          } else {
            // Ticket exists. If it's SEO and group is created/exists, sync the ticket's groupId if needed
            if (workspaceName === 'SEO' && targetGroupId) {
              const existingTicketDoc = querySnapshot.docs[0];
              const ticketData = existingTicketDoc.data();
              if (ticketData.groupId !== targetGroupId) {
                await updateTicket(existingTicketDoc.id, { groupId: targetGroupId });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle service:', err);
      alert('Failed to toggle service. Check console.');
    }
  };

  const toggleService = (e: React.MouseEvent, id: string, field: keyof Company) => {
    e.stopPropagation();
    const company = companies.find(c => c.id === id);
    if (company && company[field] === true) {
      setConfirmAction({ id, field });
      return;
    }
    
    // If checking, just do it directly through Firestore
    handleToggleService(id, field, true);
  };

  const companyProposals = proposals.filter(proposal => proposal.companyId === editingCompanyId);
  const calculateProposalTotal = (proposal: Proposal) => proposal.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
      {/* Top Bar */}
      <header className="min-h-16 bg-white border-b border-[#E2E4E9] flex flex-col lg:flex-row lg:items-center justify-between p-4 lg:px-6 gap-3 shrink-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-full sm:w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
            <Search className="w-4 h-4 text-[#8E9299]" />
            <input 
              type="text"
              placeholder="Search Companies..."
              className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Service Filter Popover Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(prev => !prev)}
              className={`px-3 py-2 rounded-md text-sm font-semibold cursor-pointer border flex items-center gap-2 transition-all duration-200 select-none w-full sm:w-auto justify-between ${
                selectedServices.length > 0
                  ? 'border-blue-500 bg-blue-50/50 text-[#1061E3] hover:bg-blue-50'
                  : 'border-[#E2E4E9] bg-white text-[#4A4D53] hover:bg-[#F0F2F5]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Filter className={`w-4 h-4 ${selectedServices.length > 0 ? 'text-[#1061E3]' : 'text-[#8E9299]'}`} />
                <span>Filter Services</span>
                {selectedServices.length > 0 && (
                  <span className="bg-[#1061E3] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {selectedServices.length}
                  </span>
                )}
              </div>
              <ChevronDown className="w-4 h-4 text-[#8E9299]" />
            </button>

            <AnimatePresence>
              {isFilterDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsFilterDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 mt-2 z-50 w-64 bg-white border border-[#E2E4E9] rounded-xl shadow-xl overflow-hidden p-3 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[#F0F2F5]">
                      <span className="text-xs font-bold text-[#1C1F23] uppercase tracking-wider">Filter Services</span>
                      {selectedServices.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => setSelectedServices([])}
                          className="text-xs font-semibold text-[#1061E3] hover:text-blue-700 hover:underline"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* Mode Selector */}
                    <div className="flex bg-[#F0F2F5] p-0.5 rounded-lg text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setServiceFilterMode('all')}
                        className={`flex-1 py-1 rounded-md text-center transition-all ${
                          serviceFilterMode === 'all' 
                            ? 'bg-white text-[#1C1F23] shadow-sm font-bold' 
                            : 'text-[#4A4D53] hover:text-[#1C1F23]'
                        }`}
                      >
                        Match All (AND)
                      </button>
                      <button
                        type="button"
                        onClick={() => setServiceFilterMode('any')}
                        className={`flex-1 py-1 rounded-md text-center transition-all ${
                          serviceFilterMode === 'any' 
                            ? 'bg-white text-[#1C1F23] shadow-sm font-bold' 
                            : 'text-[#4A4D53] hover:text-[#1C1F23]'
                        }`}
                      >
                        Match Any (OR)
                      </button>
                    </div>

                    {/* Services List */}
                    <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto pr-1">
                      {PLANS_CONFIG.map(plan => {
                        const isChecked = selectedServices.includes(plan.field);
                        return (
                          <button
                            key={plan.field}
                            type="button"
                            onClick={() => {
                              setSelectedServices(prev => 
                                isChecked 
                                  ? prev.filter(f => f !== plan.field)
                                  : [...prev, plan.field]
                                );
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                              isChecked 
                                ? 'bg-blue-50 text-[#1061E3]' 
                                : 'hover:bg-[#F0F2F5] text-[#4A4D53]'
                            }`}
                          >
                            <span>{plan.name}</span>
                            {isChecked && <Check className="w-3.5 h-3.5 text-[#1061E3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {visibleColumns.length < 12 && (
            <button
              type="button"
              onClick={() => setVisibleColumns(['name', 'domain', 'industry', 'primaryContactId', 'phone', 'web', 'seo', 'll', 'ppc', 'smm', 'sma', 'em'])}
              className="px-3 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1061E3] hover:bg-blue-50 transition-all flex items-center gap-1.5 active:scale-95 select-none"
            >
              <RefreshCw className="w-4 h-4" />
              Reset Columns
            </button>
          )}
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
      <div className="p-6 shrink-0 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="m-0 text-2xl font-bold text-[#1C1F23]">Companies</h1>
        </div>

        {/* Active Filters */}
        {(selectedServices.length > 0 || selectedIndustries.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs font-semibold text-[#8E9299]">Active Filters:</span>
            {selectedServices.map(serviceKey => {
              const plan = PLANS_CONFIG.find(p => p.field === serviceKey);
              return (
                <div 
                  key={serviceKey}
                  className="bg-blue-50 border border-blue-100 rounded-full px-3 py-1 flex items-center gap-1.5 text-xs font-semibold text-[#1061E3]"
                >
                  <span>{plan?.name || serviceKey}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedServices(prev => prev.filter(f => f !== serviceKey))}
                    className="hover:bg-blue-100 p-0.5 rounded-full text-blue-400 hover:text-[#1061E3] transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {selectedIndustries.map(industry => (
              <div 
                key={industry}
                className="bg-blue-50 border border-blue-100 rounded-full px-3 py-1 flex items-center gap-1.5 text-xs font-semibold text-[#1061E3]"
              >
                <span>{industry}</span>
                <button
                  type="button"
                  onClick={() => setSelectedIndustries(prev => prev.filter(i => i !== industry))}
                  className="hover:bg-blue-100 p-0.5 rounded-full text-blue-400 hover:text-[#1061E3] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setSelectedServices([]);
                setSelectedIndustries([]);
              }}
              className="text-xs font-semibold text-[#D32F2F] hover:text-red-700 hover:underline ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="flex-grow px-6 pb-6 overflow-auto">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-left mb-8 min-w-[1100px]" style={{ minWidth: '1100px' }}>
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="w-10 sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 border-b border-[#E2E4E9]"></th>
                {visibleColumns.includes('name') && (
                  <th
                    className="w-[200px] sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group select-none cursor-pointer hover:bg-[#F0F2F5] transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span>COMPANY NAME</span>
                        {renderSortIcon('name')}
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
                {visibleColumns.includes('domain') && (
                  <th
                    className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group select-none cursor-pointer hover:bg-[#F0F2F5] transition-colors"
                    onClick={() => handleSort('domain')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span>DOMAIN</span>
                        {renderSortIcon('domain')}
                      </div>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'domain')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                 {visibleColumns.includes('industry') && (
                  <th
                    className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group select-none cursor-pointer hover:bg-[#F0F2F5] transition-colors relative"
                    onClick={() => handleSort('industry')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span>INDUSTRY</span>
                        {renderSortIcon('industry')}
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTempSelectedIndustries(selectedIndustries);
                            setIndustrySearchQuery('');
                            setIsIndustryFilterOpen(prev => !prev);
                          }}
                          className={`p-1 rounded hover:bg-gray-200/80 transition-colors shrink-0 ${
                            selectedIndustries.length > 0 ? 'text-[#1061E3] bg-blue-50' : 'text-[#8E9299]'
                          }`}
                          title="Filter Industries"
                        >
                          <Filter className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'industry')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {isIndustryFilterOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40 cursor-default" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsIndustryFilterOpen(false);
                          }} 
                        />
                        <div
                          className="absolute left-0 mt-2 z-50 w-60 bg-white border border-[#E2E4E9] rounded-lg shadow-lg p-3 text-left font-normal normal-case text-sm text-[#1C1F23] cursor-default flex flex-col gap-2.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Search box */}
                          <div className="relative flex items-center border border-[#E2E4E9] rounded px-2 py-1 bg-[#F9FAFB]">
                            <Search className="w-3.5 h-3.5 text-[#8E9299] mr-1.5 shrink-0" />
                            <input
                              type="text"
                              placeholder="Search..."
                              className="bg-transparent border-none outline-none text-xs w-full text-[#1C1F23]"
                              value={industrySearchQuery}
                              onChange={(e) => setIndustrySearchQuery(e.target.value)}
                            />
                            {industrySearchQuery && (
                              <button
                                type="button"
                                onClick={() => setIndustrySearchQuery('')}
                                className="text-[#8E9299] hover:text-[#1C1F23]"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Quick Select Buttons */}
                          <div className="flex gap-2 text-xs font-semibold text-[#1061E3]">
                            <button
                              type="button"
                              onClick={() => setTempSelectedIndustries(Object.keys(industryCounts))}
                              className="hover:underline"
                            >
                              Select All
                            </button>
                            <span className="text-[#E2E4E9]">|</span>
                            <button
                              type="button"
                              onClick={() => setTempSelectedIndustries([])}
                              className="hover:underline text-red-500"
                            >
                              Clear All
                            </button>
                          </div>

                          {/* List of Industries */}
                          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {Object.entries(industryCounts)
                              .filter(([name]) => 
                                name.toLowerCase().includes(industrySearchQuery.toLowerCase())
                              )
                              .map(([name, count]) => {
                                const isChecked = tempSelectedIndustries.includes(name);
                                return (
                                  <label key={name} className="flex items-center gap-2 text-xs font-medium cursor-pointer py-0.5 hover:bg-gray-50 rounded select-none">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setTempSelectedIndustries(prev =>
                                          isChecked
                                            ? prev.filter(i => i !== name)
                                            : [...prev, name]
                                        );
                                      }}
                                      className="rounded border-gray-300 text-[#1061E3] focus:ring-[#1061E3] w-3.5 h-3.5"
                                    />
                                    <span className="truncate flex-grow">{name}</span>
                                    <span className="text-[10px] text-[#8E9299] font-semibold bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
                                      {count}
                                    </span>
                                  </label>
                                );
                              })}
                            {Object.keys(industryCounts).filter(name => 
                              name.toLowerCase().includes(industrySearchQuery.toLowerCase())
                            ).length === 0 && (
                              <div className="text-xs text-[#8E9299] text-center py-2">No matches</div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex justify-end gap-2 pt-2 border-t border-[#F0F2F5] shrink-0">
                            <button
                              type="button"
                              onClick={() => setIsIndustryFilterOpen(false)}
                              className="px-2.5 py-1.5 rounded text-xs font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors border border-transparent"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIndustries(tempSelectedIndustries);
                                setIsIndustryFilterOpen(false);
                              }}
                              className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors shadow-sm"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </th>
                )}
                {visibleColumns.includes('primaryContactId') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group select-none">
                    <div className="flex items-center justify-between gap-1">
                      <span>PRIMARY CONTACT</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'primaryContactId')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('phone') && (
                  <th
                    className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] group select-none cursor-pointer hover:bg-[#F0F2F5] transition-colors"
                    onClick={() => handleSort('phone')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span>PHONE</span>
                        {renderSortIcon('phone')}
                      </div>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'phone')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('web') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center group select-none">
                    <div className="flex items-center justify-center gap-1">
                      <span>WEB</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'web')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('seo') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center group select-none">
                    <div className="flex items-center justify-center gap-1">
                      <span>SEO</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'seo')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('ll') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center group select-none">
                    <div className="flex items-center justify-center gap-1">
                      <span>LL</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'll')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('ppc') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center group select-none">
                    <div className="flex items-center justify-center gap-1">
                      <span>PPC</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'ppc')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('smm') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center group select-none">
                    <div className="flex items-center justify-center gap-1">
                      <span>SMM</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'smm')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('sma') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center group select-none">
                    <div className="flex items-center justify-center gap-1">
                      <span>SMA</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'sma')); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.includes('em') && (
                  <th className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] text-center group select-none">
                    <div className="flex items-center justify-center gap-1">
                      <span>EM</span>
                      {allowDeletingColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setVisibleColumns(prev => prev.filter(c => c !== 'em')); }}
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
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={filteredCompanies.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-4 py-8 text-center text-[#8E9299] text-sm">No companies found.</td>
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
                    visibleColumns={visibleColumns}
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
                    { id: 'plans', label: 'Plans' },
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

                  {activeTab === 'plans' && (
                    <div className="flex flex-col gap-4">
                      <h4 className="text-sm font-bold text-[#1C1F23] mb-1 uppercase tracking-wider">Plans & Services</h4>
                      <p className="text-xs text-[#8E9299] mb-3">Enable or disable service plans for this client account. Active plans will automatically create corresponding boards and project tasks.</p>
                      
                      <div className="flex flex-col gap-3">
                        {PLANS_CONFIG.map(plan => {
                          const isActive = !!formData[plan.field];
                          const notesKey = plan.notesField as keyof Company;
                          return (
                            <div key={plan.field} className={`border rounded-xl transition-all duration-200 overflow-hidden ${
                              isActive 
                                ? 'border-[#1061E3] bg-[#F5F9FF] shadow-sm' 
                                : 'border-[#E2E4E9] bg-white hover:border-[#CCCCCC]'
                            }`}>
                              {/* Header row: plan name + toggle */}
                              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                                <div className="flex-grow pr-4">
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-bold text-sm text-[#1C1F23]">{plan.name}</h5>
                                    {isActive && (
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#E3F2FD] text-[#1061E3] uppercase">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-[#8E9299] mt-0.5">{plan.desc}</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0" onClick={e => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    checked={isActive}
                                    onChange={() => onTogglePlan(plan.field)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1061E3] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1061E3]"></div>
                                </label>
                              </div>
                              {/* Notes textarea — always visible */}
                              <div className="px-4 pb-4">
                                <textarea
                                  value={(formData[notesKey] as string) || ''}
                                  onChange={e => updateForm(notesKey, e.target.value)}
                                  onBlur={e => {
                                    if (editingCompanyId) {
                                      updateCompany(editingCompanyId, { [notesKey]: e.target.value });
                                    }
                                  }}
                                  placeholder={`Notes for ${plan.name} — e.g. what they receive, their rate, plan details...`}
                                  rows={2}
                                  className={`w-full px-3 py-2 text-xs rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-[#1061E3] transition-colors placeholder:text-[#C8CDD5] ${
                                    isActive
                                      ? 'border-[#BFDBFE] bg-white text-[#1C1F23]'
                                      : 'border-[#E2E4E9] bg-[#F9FAFB] text-[#4A4D53]'
                                  }`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'description' && (
                    <div>
                      <h4 className="text-sm font-bold text-[#1C1F23] mb-3 uppercase tracking-wider">Description</h4>
                      <RichTextEditor
                        value={formData.description || ''}
                        onChange={val => updateForm('description', val)}
                        placeholder="Add a company description..."
                        minHeight="320px"
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
                    handleToggleService(confirmAction.id, confirmAction.field, false);
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
