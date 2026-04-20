'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Filter, Plus, ChevronDown, X, Mail, GripVertical,
  Users, Building2, Handshake, Package, Globe, Palette,
  LineChart, MapPin, MousePointerClick, Share2, Ticket, Settings as SettingsIcon, LayoutList,
  FolderOpen, UserCircle, Receipt, LogOut, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import WorkspaceProjectView from '@/components/WorkspaceProjectView';
import SocialMediaProjectView from '@/components/SocialMediaProjectView';
import InboxView from '@/components/InboxView';
import SettingsView from '@/components/SettingsView';
import CompaniesView from '@/components/CompaniesView';
import DealsView from '@/components/DealsView';
import ProposalsView from '@/components/ProposalsView';
import ProductsServicesView from '@/components/ProductsServicesView';
import EmailModal from '@/components/EmailModal';
import MyTasksView from '@/components/MyTasksView';
import ProfileView from '@/components/ProfileView';
import FilesView from '@/components/FilesView';
import { EditableStatus, AssigneeDropdown, TeamMember, INITIAL_TEAM_MEMBERS, Company, INITIAL_COMPANIES, CompanyDropdown, Contact, Status, ProductService, INITIAL_PRODUCTS } from '@/components/Shared';
import { auth, googleProvider } from '@/lib/firebase';
import { User, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

const INITIAL_CONTACTS: Contact[] = [
  { id: '1', firstName: 'Sarah', lastName: 'Jenkins', title: 'CEO', phone: '555-0101', companyId: '1', assignedToId: '1', email: 'sarah.j@apex.com', status: 'Lead' },
  { id: '2', firstName: 'Michael', lastName: 'Thorne', title: 'Marketing Director', phone: '555-0102', companyId: '1', assignedToId: '2', email: 'm.thorne@horizon.co', status: 'Lead' },
  { id: '3', firstName: 'Laura', lastName: 'Bennett', title: 'Founder', phone: '555-0103', companyId: '1', assignedToId: '1', email: 'contact@blaw.com', status: 'Lead' },
  { id: '4', firstName: 'David', lastName: 'Chen', title: 'CTO', phone: '555-0104', companyId: '1', assignedToId: '3', email: 'dchen@cloudnine.io', status: 'Active' },
  { id: '5', firstName: 'Emma', lastName: 'Wright', title: 'Operations Manager', phone: '555-0105', companyId: '1', assignedToId: '1', email: 'emma@greenspace.com', status: 'Active' },
];

const NAV_ITEMS_MAIN = [
  { name: 'My Tasks', icon: LayoutList },
  { name: 'Inbox', icon: MessageSquare }
];

const NAV_ITEMS_CRM = [
  { name: 'Contacts', icon: Users },
  { name: 'Companies', icon: Building2 },
  { name: 'Deals / Sales', icon: Handshake },
  { name: 'Proposals', icon: Receipt },
  { name: 'Price Catalog', icon: Package },
  { name: 'Files', icon: FolderOpen }
];
const NAV_ITEMS_WORKSPACE = [
  { name: 'Websites', icon: Globe },
  { name: 'Design & Print', icon: Palette },
  { name: 'SEO', icon: LineChart },
  { name: 'Local Listings', icon: MapPin },
  { name: 'Google Ads', icon: MousePointerClick },
  { name: 'Social Media', icon: Share2 },
  { name: 'Support Tickets', icon: Ticket }
];
const NAV_ITEMS_SETTINGS = [
  { name: 'Settings', icon: SettingsIcon },
  { name: 'Profile', icon: UserCircle }
];

function EditableCell({ value, onSave, renderValue }: { value: string, onSave: (val: string) => void, renderValue?: (val: string) => React.ReactNode }) {
  return (
    <div className="min-h-[20px] truncate" title={value || ''}>
      {renderValue ? renderValue(value) : (value || '-')}
    </div>
  );
}

function SortableRow({ contact, onClick, onUpdate, teamMembers, companies, onEmailClick }: { contact: Contact; onClick: () => void; onUpdate: (id: string, field: keyof Contact, value: any) => void; teamMembers: TeamMember[], companies: Company[], onEmailClick: (contact: Contact) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: contact.id, data: { contact } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className="hover:bg-gray-50 transition-colors cursor-pointer bg-white"
    >
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
          <GripVertical className="w-4 h-4" />
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={contact.firstName} onSave={v => onUpdate(contact.id, 'firstName', v)} renderValue={v => <strong>{v}</strong>} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={contact.lastName} onSave={v => onUpdate(contact.id, 'lastName', v)} renderValue={v => <strong>{v}</strong>} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={contact.title} onSave={v => onUpdate(contact.id, 'title', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={contact.phone} onSave={v => onUpdate(contact.id, 'phone', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <CompanyDropdown value={contact.companyId} onSave={v => onUpdate(contact.id, 'companyId', v)} companies={companies} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <AssigneeDropdown value={contact.assignedToId} onSave={v => onUpdate(contact.id, 'assignedToId', v)} teamMembers={teamMembers} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <div className="flex items-center justify-between group">
          <EditableCell value={contact.email} onSave={v => onUpdate(contact.id, 'email', v)} />
          <button
            onClick={(e) => { e.stopPropagation(); onEmailClick(contact); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-[#8E9299] hover:text-[#1061E3] transition-all"
            title="Send Email"
          >
            <Mail className="w-4 h-4" />
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableStatus value={contact.status} onSave={v => onUpdate(contact.id, 'status', v)} />
      </td>
    </tr>
  );
}

function DroppableTable({ id, contacts, onRowClick, onUpdateContact, teamMembers, companies, onEmailClick }: { id: string; contacts: Contact[]; onRowClick: (c: Contact) => void; onUpdateContact: (id: string, field: keyof Contact, value: any) => void; teamMembers: TeamMember[], companies: Company[], onEmailClick: (contact: Contact) => void }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <SortableContext id={id} items={contacts.map(c => c.id)} strategy={verticalListSortingStrategy}>
      <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden text-left mb-8">
        <thead>
          <tr>
            <th className="w-10 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
            <th className="w-[120px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">FIRST NAME</th>
            <th className="w-[120px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">LAST NAME</th>
            <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">TITLE</th>
            <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">PHONE</th>
            <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY</th>
            <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">ASSIGNED</th>
            <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">EMAIL</th>
            <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">STATUS</th>
          </tr>
        </thead>
        <tbody ref={setNodeRef} className="min-h-[50px]">
          {contacts.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-[#8E9299] text-sm">No contacts found. Drop here to add.</td>
            </tr>
          ) : contacts.map(contact => (
            <SortableRow key={contact.id} contact={contact} onClick={() => onRowClick(contact)} onUpdate={onUpdateContact} teamMembers={teamMembers} companies={companies} onEmailClick={onEmailClick} />
          ))}
        </tbody>
      </table>
    </SortableContext>
  );
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(INITIAL_TEAM_MEMBERS);
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [products, setProducts] = useState<ProductService[]>(INITIAL_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNav, setActiveNav] = useState('My Tasks');
  const [navFilter, setNavFilter] = useState<'All' | 'CRM' | 'Workspace'>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [emailingContact, setEmailingContact] = useState<Contact | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  };

  const currentTeamMember = user ? teamMembers.find(m => m.email?.toLowerCase() === user.email?.toLowerCase()) : undefined;

  // New Contact Form State
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newStatus, setNewStatus] = useState<Status>('Lead');

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleUpdateContact = (id: string, field: keyof Contact, value: any) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const company = companies.find(comp => comp.id === c.companyId);
      return c.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (company && company.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [contacts, companies, searchQuery]);

  const leads = filteredContacts.filter(c => c.status === 'Lead');
  const activeClients = filteredContacts.filter(c => c.status === 'Active');

  const openAddModal = () => {
    setEditingContactId(null);
    setNewFirstName('');
    setNewLastName('');
    setNewTitle('');
    setNewPhone('');
    setNewCompanyId('');
    setNewEmail('');
    setNewStatus('Lead');
    setIsAddModalOpen(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContactId(contact.id);
    setNewFirstName(contact.firstName || '');
    setNewLastName(contact.lastName || '');
    setNewTitle(contact.title || '');
    setNewPhone(contact.phone || '');
    setNewCompanyId(contact.companyId || '');
    setNewEmail(contact.email || '');
    setNewStatus(contact.status || 'Lead');
    setIsAddModalOpen(true);
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingContactId) {
      setContacts(contacts.map(c => {
        if (c.id === editingContactId) {
          return {
            ...c,
            firstName: newFirstName,
            lastName: newLastName,
            title: newTitle,
            phone: newPhone,
            companyId: newCompanyId,
            email: newEmail,
            status: newStatus
          };
        }
        return c;
      }));
    } else {
      const initials = (newFirstName[0] || '') + (newLastName[0] || '').toUpperCase() || 'NA';
      const colors = ['#1061E3', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      const newContact: Contact = {
        id: Date.now().toString(),
        firstName: newFirstName,
        lastName: newLastName,
        title: newTitle,
        phone: newPhone,
        companyId: newCompanyId,
        email: newEmail,
        status: newStatus,
        assignedToId: teamMembers[0]?.id || '1'
      };

      setContacts([...contacts, newContact]);
    }
    
    setIsAddModalOpen(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveContact = active.data.current?.contact;
    const isOverContact = over.data.current?.contact;

    if (!isActiveContact) return;

    const activeStatus = isActiveContact.status;
    const overStatus = isOverContact ? isOverContact.status : overId;

    if (activeStatus !== overStatus && (overStatus === 'Lead' || overStatus === 'Active')) {
      setContacts((prev) => {
        const activeIndex = prev.findIndex(c => c.id === activeId);
        const overIndex = prev.findIndex(c => c.id === overId);

        const newContacts = [...prev];
        const [movedContact] = newContacts.splice(activeIndex, 1);
        movedContact.status = overStatus as Status;

        if (overIndex >= 0) {
          newContacts.splice(overIndex, 0, movedContact);
        } else {
          newContacts.push(movedContact);
        }

        return newContacts;
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId !== overId) {
      setContacts((prev) => {
        const activeIndex = prev.findIndex(c => c.id === activeId);
        const overIndex = prev.findIndex(c => c.id === overId);

        if (activeIndex !== -1 && overIndex !== -1) {
          return arrayMove(prev, activeIndex, overIndex);
        }
        return prev;
      });
    }
  };

  const activeDragContact = activeDragId ? contacts.find(c => c.id === activeDragId) : null;

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F7F8FA] text-[#1C1F23]">
        <div className="text-sm text-[#8E9299]">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F7F8FA] text-[#1C1F23]">
        <div className="bg-white p-8 rounded-lg border border-[#E2E4E9] shadow-sm max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-[#003366] text-white rounded-md flex items-center justify-center text-xl font-bold mx-auto mb-4">A</div>
          <h1 className="text-xl font-bold mb-2">Welcome to Awebco</h1>
          <p className="text-sm text-[#8E9299] mb-6">Please log in to access your dashboard.</p>
          <button 
            onClick={login}
            className="w-full bg-[#1061E3] hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Log in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#F7F8FA] text-[#1C1F23] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] bg-[#003366] border-r border-[#002244] flex flex-col shrink-0 overflow-y-auto">
        <div className="p-6 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-[#003366] font-bold text-lg shadow-sm">
            A
          </div>
          <span className="font-bold text-lg tracking-tight text-white">Awebco</span>
        </div>

        <div className="px-5 pb-4">
          <div className="relative">
            <select 
              value={navFilter}
              onChange={e => setNavFilter(e.target.value as any)}
              className="w-full bg-[#002244] border border-[#004080] text-white rounded-md px-3 py-2 text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#66B2FF] cursor-pointer hover:bg-[#002a55] transition-colors"
            >
              <option value="All">All Apps</option>
              <option value="CRM">CRM</option>
              <option value="Workspace">Workspace</option>
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <ChevronDown className="w-4 h-4 text-[#88AADD]" />
            </div>
          </div>
        </div>

        <nav className="py-2.5">
          {NAV_ITEMS_MAIN.map(item => (
            <div 
              key={item.name}
              onClick={() => setActiveNav(item.name)}
              className={`px-5 py-2 text-sm flex items-center gap-3 cursor-pointer transition-colors ${
                activeNav === item.name 
                  ? 'text-white bg-[#004080] border-r-[3px] border-[#66B2FF] font-medium' 
                  : 'text-[#B3D4FF] hover:bg-[#002244] hover:text-white border-r-[3px] border-transparent'
              }`}
            >
              <item.icon className={`w-4 h-4 ${activeNav === item.name ? 'text-[#66B2FF]' : 'text-[#88AADD]'}`} />
              {item.name}
            </div>
          ))}
        </nav>

        {(navFilter === 'All' || navFilter === 'CRM') && (
          <nav className="py-2.5">
            <div className="text-[11px] font-bold uppercase text-[#88AADD] px-5 pb-2 tracking-wide">
              CRM
            </div>
            {NAV_ITEMS_CRM.map(item => (
              <div 
                key={item.name}
                onClick={() => setActiveNav(item.name)}
                className={`px-5 py-2 text-sm flex items-center gap-3 cursor-pointer transition-colors ${
                  activeNav === item.name 
                    ? 'text-white bg-[#004080] border-r-[3px] border-[#66B2FF] font-medium' 
                    : 'text-[#B3D4FF] hover:bg-[#002244] hover:text-white border-r-[3px] border-transparent'
                }`}
              >
                <item.icon className={`w-4 h-4 ${activeNav === item.name ? 'text-[#66B2FF]' : 'text-[#88AADD]'}`} />
                {item.name}
              </div>
            ))}
          </nav>
        )}

        {(navFilter === 'All' || navFilter === 'Workspace') && (
          <nav className="py-2.5">
            <div className="text-[11px] font-bold uppercase text-[#88AADD] px-5 pb-2 tracking-wide">
              Workspace
            </div>
            {NAV_ITEMS_WORKSPACE.map(item => (
              <div 
                key={item.name}
                onClick={() => setActiveNav(item.name)}
                className={`px-5 py-2 text-sm flex items-center gap-3 cursor-pointer transition-colors ${
                  activeNav === item.name 
                    ? 'text-white bg-[#004080] border-r-[3px] border-[#66B2FF] font-medium' 
                    : 'text-[#B3D4FF] hover:bg-[#002244] hover:text-white border-r-[3px] border-transparent'
                }`}
              >
                <item.icon className={`w-4 h-4 ${activeNav === item.name ? 'text-[#66B2FF]' : 'text-[#88AADD]'}`} />
                {item.name}
              </div>
            ))}
          </nav>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col overflow-hidden relative bg-[#F7F8FA]">
        {/* Global Top Navigation */}
        <header className="h-14 bg-white border-b border-[#E2E4E9] flex items-center justify-end px-6 shrink-0 z-20">
          <div className="flex items-center gap-5">
            <button 
              onClick={() => setActiveNav('Settings')} 
              className={`hover:text-[#1C1F23] transition-colors ${activeNav === 'Settings' ? 'text-[#1061E3]' : 'text-[#8E9299]'}`}
              title="Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={logout} 
              className="text-[#8E9299] hover:text-[#D32F2F] transition-colors"
              title="Log Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-[#E2E4E9]"></div>
            <button 
              onClick={() => setActiveNav('Profile')} 
              className="w-8 h-8 rounded-full bg-[#003366] text-white flex items-center justify-center font-bold text-xs shrink-0 border-2 border-transparent hover:border-[#1061E3] transition-all cursor-pointer shadow-sm hover:shadow"
              title="Profile"
            >
              {currentTeamMember?.initials || 'A'}
            </button>
          </div>
        </header>

        <div className="flex-grow relative overflow-hidden">
          {activeNav === 'Contacts' ? (
          <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
            {/* Top Bar */}
            <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center justify-between px-6 shrink-0">
              <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
                <Search className="w-4 h-4 text-[#8E9299]" />
                <input 
                  type="text"
                  placeholder="Search in Contacts..."
                  className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
                  value={searchQuery || ''}
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
                  New Contact
                </button>
              </div>
            </header>

            {/* View Header */}
            <div className="p-6 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h1 className="m-0 text-2xl font-bold text-[#1C1F23]">Contacts View</h1>
                <div className="flex gap-4 text-[13px] text-[#666]">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-gray-900">Group by: Status <ChevronDown className="w-3 h-3" /></span>
                  <span className="flex items-center gap-1 cursor-pointer hover:text-gray-900">Sort by: Last Activity <ChevronDown className="w-3 h-3" /></span>
                </div>
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-grow px-6 pb-6 overflow-auto">
              <DndContext 
                id="contacts-dnd-context"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                {/* Group 1: Leads */}
                <div className="flex items-center gap-2 py-3 mt-2">
                  <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#666]"></div>
                  <span className="font-bold text-[15px] uppercase tracking-wide text-[#D32F2F]">Leads</span>
                  <span className="text-[#8E9299] text-[13px]">({leads.length})</span>
                </div>
                <DroppableTable id="Lead" contacts={leads} onRowClick={openEditModal} onUpdateContact={handleUpdateContact} teamMembers={teamMembers} companies={companies} onEmailClick={setEmailingContact} />

                {/* Group 2: Website Clients */}
                <div className="flex items-center gap-2 py-3 mt-2">
                  <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#666]"></div>
                  <span className="font-bold text-[15px] uppercase tracking-wide text-[#10B981]">Website Clients</span>
                  <span className="text-[#8E9299] text-[13px]">({activeClients.length})</span>
                </div>
                <DroppableTable id="Active" contacts={activeClients} onRowClick={openEditModal} onUpdateContact={handleUpdateContact} teamMembers={teamMembers} companies={companies} onEmailClick={setEmailingContact} />

                <DragOverlay>
                  {activeDragContact ? (
                    <table className="w-full border-collapse bg-white rounded-lg shadow-lg overflow-hidden text-left opacity-90">
                      <tbody>
                        <tr className="bg-white">
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
                            <div className="text-[#8E9299]">
                              <GripVertical className="w-4 h-4" />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-[120px]"><strong>{activeDragContact.firstName}</strong></td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-[120px]"><strong>{activeDragContact.lastName}</strong></td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">{activeDragContact.title}</td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">{activeDragContact.phone}</td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">{companies.find(c => c.id === activeDragContact.companyId)?.name || '-'}</td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
                            <div 
                              className="w-6 h-6 rounded-full inline-flex items-center justify-center text-white text-[10px] font-bold"
                              style={{ backgroundColor: teamMembers.find(m => m.id === activeDragContact.assignedToId)?.color || '#ccc' }}
                            >
                              {teamMembers.find(m => m.id === activeDragContact.assignedToId)?.initials || '?'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">{activeDragContact.email}</td>
                          <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                              activeDragContact.status === 'Lead' ? 'bg-[#FFEBEB] text-[#D32F2F]' : 'bg-[#ECFDF3] text-[#10B981]'
                            }`}>
                              {activeDragContact.status}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        ) : activeNav === 'My Tasks' ? (
          <MyTasksView teamMembers={teamMembers} companies={companies} contacts={contacts} currentUserId={currentTeamMember?.id} />
        ) : activeNav === 'Inbox' ? (
          <InboxView teamMembers={teamMembers} currentUserId={currentTeamMember?.id} />
        ) : activeNav === 'Websites' ? (
          <WorkspaceProjectView key="web" teamMembers={teamMembers} companies={companies} projectType="Websites" flagKey="web" />
        ) : activeNav === 'Design & Print' ? (
          <WorkspaceProjectView key="dp" teamMembers={teamMembers} companies={companies} projectType="Design & Print" flagKey="dp" />
        ) : activeNav === 'Google Ads' ? (
          <WorkspaceProjectView key="ppc" teamMembers={teamMembers} companies={companies} projectType="Google Ads" flagKey="ppc" />
        ) : activeNav === 'Local Listings' ? (
          <WorkspaceProjectView key="ll" teamMembers={teamMembers} companies={companies} projectType="Local Listings" flagKey="ll" />
        ) : activeNav === 'SEO' ? (
          <WorkspaceProjectView key="seo" teamMembers={teamMembers} companies={companies} projectType="SEO" flagKey="seo" />
        ) : activeNav === 'Social Media' ? (
          <SocialMediaProjectView teamMembers={teamMembers} companies={companies} />
        ) : activeNav === 'Support Tickets' ? (
          <WorkspaceProjectView key="support" teamMembers={teamMembers} companies={companies} projectType="Support Tickets" flagKey="support" />
        ) : activeNav === 'Companies' ? (
          <CompaniesView teamMembers={teamMembers} companies={companies} setCompanies={setCompanies} contacts={contacts} />
        ) : activeNav === 'Deals / Sales' ? (
          <DealsView teamMembers={teamMembers} companies={companies} contacts={contacts} />
        ) : activeNav === 'Proposals' ? (
          <ProposalsView teamMembers={teamMembers} companies={companies} contacts={contacts} products={products} />
        ) : activeNav === 'Price Catalog' ? (
          <ProductsServicesView products={products} setProducts={setProducts} />
        ) : activeNav === 'Files' ? (
          <FilesView />
        ) : activeNav === 'Profile' ? (
          <ProfileView teamMembers={teamMembers} setTeamMembers={setTeamMembers} currentUserId={currentTeamMember?.id} />
        ) : activeNav === 'Settings' ? (
          <SettingsView teamMembers={teamMembers} setTeamMembers={setTeamMembers} />
        ) : (
          <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
            {/* Top Bar */}
            <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center justify-between px-6 shrink-0">
              <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
                <Search className="w-4 h-4 text-[#8E9299]" />
                <input 
                  type="text"
                  placeholder={`Search in ${activeNav}...`}
                  className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
                />
              </div>
              <div className="flex gap-3">
                <button className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filter
                </button>
                <button 
                  onClick={() => alert('This module is currently under construction.')}
                  className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#1061E3] bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New {activeNav === 'Companies' ? 'Company' : activeNav === 'Deals / Sales' ? 'Deal' : activeNav.replace(/s$/, '')}
                </button>
              </div>
            </header>
            <div className="flex-grow flex items-center justify-center text-[#8E9299]">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2 text-[#1C1F23]">{activeNav}</h2>
                <p>This module is currently under construction.</p>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Email Modal */}
        {emailingContact && (
          <EmailModal contact={emailingContact} onClose={() => setEmailingContact(null)} />
        )}

        {/* Add/Edit Contact Panel */}
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
                    {editingContactId ? 'Edit Contact' : 'Add New Contact'}
                  </h3>
                  <button onClick={() => setIsAddModalOpen(false)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveContact} className="flex flex-col flex-grow overflow-hidden">
                  <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">First Name</label>
                        <input 
                          required
                          type="text" 
                          value={newFirstName || ''}
                          onChange={e => setNewFirstName(e.target.value)}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                          placeholder="e.g. Jane"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Last Name</label>
                        <input 
                          required
                          type="text" 
                          value={newLastName || ''}
                          onChange={e => setNewLastName(e.target.value)}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                          placeholder="e.g. Doe"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Title</label>
                        <input 
                          type="text" 
                          value={newTitle || ''}
                          onChange={e => setNewTitle(e.target.value)}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                          placeholder="e.g. CEO"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Phone</label>
                        <input 
                          type="tel" 
                          value={newPhone || ''}
                          onChange={e => setNewPhone(e.target.value)}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                          placeholder="e.g. 555-0123"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Company</label>
                      <select 
                        required
                        value={newCompanyId || ''}
                        onChange={e => setNewCompanyId(e.target.value)}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white"
                      >
                        <option value="" disabled>Select Company</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Email Address</label>
                      <input 
                        required
                        type="email" 
                        value={newEmail || ''}
                        onChange={e => setNewEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                        placeholder="jane@acme.com"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Status</label>
                        <select 
                          value={newStatus || 'Lead'}
                          onChange={e => setNewStatus(e.target.value as Status)}
                          className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                        >
                          <option value="Lead">Lead</option>
                          <option value="Active">Active</option>
                        </select>
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
                      {editingContactId ? 'Save Changes' : 'Save Contact'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
