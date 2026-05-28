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
  emailNotificationsEnabled?: boolean;
}

export interface ProductService {
  id: string;
  name: string;
  description: string;
  price: string;
  url?: string;
  sku?: string;
  type?: string;
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
  emailedAssignees?: string[];
}

export interface TicketUpdate {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  attachment?: string;
}

export interface TicketFile {
  id: string;
  name: string;
  uploadedAt: string;
  url?: string;
}

export interface Ticket {
  id: string;
  parentId?: string;
  projectName: string;
  assignee: string;
  assignees?: string[];
  status: string;
  deadline: string;
  url: string;
  description: string;
  pastelUrl?: string;
  googleDriveUrl?: string;
  notes?: string;
  updates?: TicketUpdate[];
  files?: TicketFile[];
  planType?: string;
  priority?: string;
  billableHours?: string;
  companyId?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  category?: string;
  isManual?: boolean;
  groupId?: string;
  workspace: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
  emailedAssignees?: string[];
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
  webNotes?: string;
  seoNotes?: string;
  llNotes?: string;
  ppcNotes?: string;
  smmNotes?: string;
  smaNotes?: string;
  emNotes?: string;
  dpNotes?: string;
  supportNotes?: string;
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

export function AssigneeDropdown({ 
  value, 
  onSave, 
  teamMembers,
  values,
  onSaveMultiple
}: { 
  value?: string, 
  onSave?: (val: string) => void, 
  teamMembers: TeamMember[],
  values?: string[],
  onSaveMultiple?: (vals: string[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isMulti = Boolean(values && onSaveMultiple);
  const member = teamMembers.find(m => m.id === value);
  const assignedMembers = teamMembers.filter(m => values?.includes(m.id));

  useEffect(() => {
    const handleGlobalClick = () => setIsOpen(false);
    
    const updatePosition = () => {
      if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
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
        Select Assignee${isMulti ? 's' : ''}
      </div>
      <div className="max-h-48 overflow-y-auto pt-1">
        <button
          className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-red-50 transition-colors text-red-600 font-semibold border-b border-gray-100 pb-2 mb-1"
          onClick={() => {
            if (isMulti && onSaveMultiple) {
              onSaveMultiple([]);
            } else if (onSave) {
              onSave('');
              setIsOpen(false);
            }
          }}
        >
          <div className="w-5 h-5 rounded-full border border-dashed border-red-300 flex items-center justify-center text-red-500 shrink-0 text-xs bg-red-50">
            ×
          </div>
          <span>Clear Assignees</span>
        </button>
        {teamMembers.map(tm => {
          const isSelected = isMulti ? values?.includes(tm.id) : value === tm.id;
          return (
            <button
              key={tm.id}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-[#F0F2F5] transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-[#1C1F23]'}`}
              onClick={() => {
                if (isMulti && values && onSaveMultiple) {
                  const alreadySelected = values.includes(tm.id);
                  const updated = alreadySelected
                    ? values.filter(v => v !== tm.id)
                    : [...values, tm.id];
                  onSaveMultiple(updated);
                } else if (onSave) {
                  onSave(tm.id);
                  setIsOpen(false);
                }
              }}
            >
              <div 
                className="w-5 h-5 rounded-full inline-flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                style={{ backgroundColor: tm.color }}
              >
                {tm.initials}
              </div>
              <span className="truncate flex-grow">{tm.name}</span>
              {isSelected && isMulti && (
                <div className="w-3.5 h-3.5 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 ml-auto">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block hover:bg-gray-100 rounded px-1 -mx-1" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
      <button 
        ref={buttonRef}
        type="button"
        className="inline-flex items-center justify-center cursor-pointer hover:ring-2 ring-gray-200 transition-all rounded-full p-0.5"
      >
        {isMulti ? (
          <div className="flex -space-x-1.5 overflow-hidden items-center">
            {assignedMembers.length > 0 ? (
              assignedMembers.slice(0, 3).map(tm => (
                <div
                  key={tm.id}
                  className="w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: tm.color }}
                  title={tm.name}
                >
                  {tm.initials}
                </div>
              ))
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-100 border border-dashed border-[#D0D5DD] flex items-center justify-center text-[#8E9299] text-xs hover:bg-gray-200 transition-colors" title="Unassigned">
                +
              </div>
            )}
            {assignedMembers.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-[#F0F2F5] ring-2 ring-white flex items-center justify-center text-[#4A4D53] text-[9px] font-bold shrink-0" title={`${assignedMembers.length - 3} more`}>
                +${assignedMembers.length - 3}
              </div>
            )}
          </div>
        ) : member ? (
          <div 
            className="w-6 h-6 rounded-full inline-flex items-center justify-center text-white text-[10px] font-bold"
            style={{ backgroundColor: member.color || '#ccc' }}
            title={member.name}
          >
            {member.initials}
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-100 border border-dashed border-[#D0D5DD] flex items-center justify-center text-[#8E9299] text-xs hover:bg-gray-200 transition-colors" title="Unassigned">
            +
          </div>
        )}
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

export function Toggle({ checked, onChange, disabled }: { checked: boolean, onChange: (v: boolean) => void, disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={"relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none  "}
    >
      <span
        className={"pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out "}
      />
    </button>
  );
}

export function EditableDeadline({ value, onSave }: { value: string; onSave: (val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (typeof inputRef.current.showPicker === 'function') {
        try {
          inputRef.current.showPicker();
        } catch (e) {
          // ignore
        }
      }
    }
  }, [isEditing]);

  const displayValue = () => {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
  };

  if (isEditing) {
    return (
      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="date"
          value={value || ''}
          onChange={(e) => {
            onSave(e.target.value);
            setIsEditing(false);
          }}
          onBlur={() => setIsEditing(false)}
          className="px-2 py-1 text-xs border border-[#E2E4E9] rounded-md outline-none bg-white font-medium text-[#1C1F23] focus:ring-2 focus:ring-[#1061E3] focus:border-transparent cursor-pointer"
        />
      </div>
    );
  }

  return (
    <div 
      className="relative inline-block hover:bg-gray-100 rounded px-2 py-0.5 -mx-2 cursor-pointer transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      title="Click to select deadline"
    >
      <span className="text-[#4A4D53] hover:text-[#1C1F23]">
        {displayValue()}
      </span>
    </div>
  );
}
