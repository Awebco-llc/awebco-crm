import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type Status = 'Lead' | 'Active';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  phone: string;
  companyId: string;
  assignedToId: string;
  email: string;
  status: Status;
  deadline?: string;
  groupId?: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  color: string;
  order?: number;
}

export interface StorageFile {
  id: string;
  name: string;
  size: number;
  type: string;
  storagePath: string;
  downloadUrl: string;
  uploadedBy: string;
}

export interface TeamMemberPermissions {
  canViewCRM?: boolean;
  allowedWorkspaces?: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  role?: 'master_admin' | 'admin' | 'staff' | 'freelancer';
  email?: string;
  password?: string;
  photoUrl?: string;
  uid?: string;
  permissions?: TeamMemberPermissions;
}

export interface ProductService {
  id: string;
  name: string;
  description: string;
  price: string;
  order?: number;
}

export interface ProposalItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  price: number;
}

export interface Proposal {
  id: string;
  title: string;
  companyId: string;
  contactId: string;
  dealId?: string;
  date: string;
  validUntil: string;
  items: ProposalItem[];
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
  notes: string;
  clientPrintedName?: string;
  signatureName?: string;
  signatureDate?: string;
  cardholderName?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  billingZip?: string;
  order?: number;
}

export interface DealNote {
  id: string;
  author?: string;
  text: string;
  createdAt: string;
  attachment?: string;
}

export interface Deal {
  id: string;
  name: string;
  currentStep: string;
  status: string;
  assignedToId: string;
  value: string;
  companyId: string;
  contactId: string;
  notes: DealNote[];
  order?: number;
}



export interface Company {
  id: string;
  name: string;
  domain: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zipcode: string;
  industry: string;
  founded: string;
  servicesOffered: string;
  productsOffered: string;
  hoursOfOperation: string;
  servicesNeeded: string;
  facebookUrl: string;
  referralSource: string;
  assignedToId: string;
  web: boolean;
  seo: boolean;
  ll: boolean;
  ppc: boolean;
  smm: boolean;
  sma: boolean;
  em: boolean;
  dp?: boolean;
  support?: boolean;
  primaryContactId?: string;
  deadline?: string;
  description?: string;
  updates?: Array<{
    id: string;
    author?: string;
    text: string;
    createdAt: string;
  }>;
}



export function EditablePriority({ value }: { value: string }) {
  if (!value) return <span>-</span>;
  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase inline-block text-center ${
        value === 'Low' ? 'bg-[#F3F4F6] text-[#4B5563]' :
        value === 'Medium' ? 'bg-[#FEF9C3] text-[#CA8A04]' :
        value === 'High' ? 'bg-[#FFF4E5] text-[#ED6C02]' :
        value === 'Urgent' ? 'bg-[#FFEBEB] text-[#D32F2F]' :
        'bg-gray-100 text-gray-700'
      }`}
    >
      {value}
    </span>
  );
}

function getStatusBadgeClasses(value: string) {
  return value === 'Lead' ? 'bg-[#FFEBEB] text-[#D32F2F]' : 
    value === 'Active' ? 'bg-[#ECFDF3] text-[#10B981]' : 
    value === 'In Progress' ? 'bg-[#FFF4E5] text-[#ED6C02]' :
    value === 'Not Started' ? 'bg-gray-100 text-gray-700' :
    value === 'Setup' ? 'bg-[#E3F2FD] text-[#1976D2]' :
    value === 'Awaiting Customer' ? 'bg-[#FEF9C3] text-[#CA8A04]' :
    value === 'Needs Invoiced' ? 'bg-[#FFF4E5] text-[#ED6C02]' :
    value === 'Done' ? 'bg-[#ECFDF3] text-[#10B981]' :
    value === 'Running' ? 'bg-[#ECFDF3] text-[#10B981]' :
    value === 'On Hold' ? 'bg-[#FFEBEB] text-[#D32F2F]' :
    value === 'Planning' ? 'bg-[#E3F2FD] text-[#1976D2]' :
    value === 'S7: Content Collection' ? 'bg-[#FFF4E5] text-[#ED6C02]' :
    value === 'S8: Design' ? 'bg-[#F3E8FF] text-[#9333EA]' :
    value === 'S9: Design Proofing' ? 'bg-[#FAE8FF] text-[#C026D3]' :
    value === 'S10: Development' ? 'bg-[#E0F2FE] text-[#0284C7]' :
    value === 'S11: Development Proofing' ? 'bg-[#CCFBF1] text-[#0D9488]' :
    value === 'S12: Final Payment' ? 'bg-[#FEF9C3] text-[#CA8A04]' :
    value === 'S13: Launch Checklist' ? 'bg-[#DCFCE7] text-[#16A34A]' :
    value === 'S14: Launched' ? 'bg-[#ECFDF3] text-[#10B981]' :
    value === 'Launched' ? 'bg-[#ECFDF3] text-[#10B981]' :
    value === 'ON HOLD' ? 'bg-[#FFEBEB] text-[#D32F2F]' :
    value === 'Need to Call / Email' ? 'bg-[#FFF4E5] text-[#ED6C02]' :
    value === 'WON' ? 'bg-[#ECFDF3] text-[#10B981]' :
    value === 'LOST' ? 'bg-[#FFEBEB] text-[#D32F2F]' :
    'bg-gray-100 text-gray-700';
}

const DEFAULT_STATUS_OPTIONS = [
  'Lead',
  'Active',
  'Not Started',
  'Setup',
  'In Progress',
  'Awaiting Customer',
  'Needs Invoiced',
  'Running',
  'On Hold',
  'Done',
  'Planning',
  'S7: Content Collection',
  'S8: Design',
  'S9: Design Proofing',
  'S10: Development',
  'S11: Development Proofing',
  'S12: Final Payment',
  'S13: Launch Checklist',
  'S14: Launched',
  'Launched',
  'ON HOLD',
  'Need to Call / Email',
  'WON',
  'LOST',
];

export function EditableStatus({ value, onSave, options = DEFAULT_STATUS_OPTIONS }: { value: string, onSave: (val: string) => void, options?: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleGlobalClick = () => setIsOpen(false);

    const updatePosition = () => {
      if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const leftPos = rect.left + 224 > window.innerWidth ? window.innerWidth - 232 : rect.left;
        setPosition({
          top: rect.bottom + window.scrollY + 4,
          left: leftPos + window.scrollX
        });
      }
    };

    if (isOpen) {
      updatePosition();
      document.addEventListener('click', handleGlobalClick);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        document.removeEventListener('click', handleGlobalClick);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  const dropdownMenu = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      className="absolute z-[9999] w-56 bg-white border border-[#E2E4E9] rounded-md shadow-lg overflow-hidden pb-1"
      style={{ top: position.top, left: position.left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-xs font-semibold text-[#8E9299] bg-[#F9FAFB] border-b border-[#E2E4E9]">
        Select Status
      </div>
      <div className="max-h-64 overflow-y-auto pt-1">
        {options.map((option) => (
          <button
            key={option}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-[#F0F2F5] transition-colors ${value === option ? 'bg-blue-50 text-blue-700' : 'text-[#1C1F23]'}`}
            onClick={() => {
              onSave(option);
              setIsOpen(false);
            }}
          >
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase inline-block text-center ${getStatusBadgeClasses(option)}`}>
              {option}
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block hover:bg-gray-100 rounded px-1 -mx-1" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
      <button
        ref={buttonRef}
        type="button"
        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase inline-block text-center cursor-pointer ${getStatusBadgeClasses(value)}`}
        title={value || 'Lead'}
      >
        {value || 'Lead'}
      </button>

      {dropdownMenu}
    </div>
  );
}

export function AssigneeDropdown({ value, onSave, teamMembers }: { value: string, onSave: (val: string) => void, teamMembers: TeamMember[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const member = teamMembers.find(m => m.id === value) || teamMembers[0];

  useEffect(() => {
    const handleGlobalClick = () => setIsOpen(false);
    
    // Update position on scroll or resize when open
    const updatePosition = () => {
      if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        // Keep it onscreen if too far right
        const leftPos = rect.left + 192 > window.innerWidth ? window.innerWidth - 200 : rect.left;
        setPosition({
          top: rect.bottom + window.scrollY + 4,
          left: leftPos + window.scrollX
        });
      }
    };

    if (isOpen) {
      updatePosition();
      document.addEventListener('click', handleGlobalClick);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        document.removeEventListener('click', handleGlobalClick);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  const dropdownMenu = isOpen && typeof document !== 'undefined' ? createPortal(
    <div 
      className="absolute z-[9999] w-48 bg-white border border-[#E2E4E9] rounded-md shadow-lg overflow-hidden pb-1" 
      style={{ top: position.top, left: position.left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-xs font-semibold text-[#8E9299] bg-[#F9FAFB] border-b border-[#E2E4E9]">
        Select Assignee
      </div>
      <div className="max-h-48 overflow-y-auto pt-1">
        {teamMembers.map(tm => (
          <button
            key={tm.id}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-[#F0F2F5] transition-colors ${value === tm.id ? 'bg-blue-50 text-blue-700' : 'text-[#1C1F23]'}`}
            onClick={() => {
              onSave(tm.id);
              setIsOpen(false);
            }}
          >
            <div 
              className="w-5 h-5 rounded-full inline-flex items-center justify-center text-white text-[9px] font-bold shrink-0"
              style={{ backgroundColor: tm.color }}
            >
              {tm.initials}
            </div>
            {tm.name}
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block hover:bg-gray-100 rounded px-1 -mx-1" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
      <button 
        ref={buttonRef}
        type="button"
        className="w-6 h-6 rounded-full inline-flex items-center justify-center text-white text-[10px] font-bold cursor-pointer hover:ring-2 ring-gray-200 transition-all"
        style={{ backgroundColor: member?.color || '#ccc' }}
        title={member?.name || 'Unassigned'}
      >
        {member?.initials || '?'}
      </button>

      {dropdownMenu}
    </div>
  );
}

export function CompanyDropdown({ value, onSave, companies }: { value: string, onSave: (val: string) => void, companies: Company[] }) {
  const company = companies.find(c => c.id === value);

  return (
    <div className="min-h-[20px] px-1 -mx-1 truncate">
      {company ? company.name : '-'}
    </div>
  );
}

export function ContactDropdown({ value, onSave, contacts }: { value: string, onSave: (val: string) => void, contacts: Contact[] }) {
  const contact = contacts.find(c => c.id === value);

  return (
    <div className="min-h-[20px] px-1 -mx-1 truncate">
      {contact ? `${contact.firstName} ${contact.lastName}` : '-'}
    </div>
  );
}
