'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Plus, GripHorizontal, GripVertical, X, Search, ChevronDown, ChevronRight, CornerDownRight, Trash2, Copy, Pencil, Paperclip, AtSign, File as FileIcon, Mail, Upload, Loader2, ArrowRight, ExternalLink, RefreshCw, CheckCircle2, MessageCircle, MessageCirclePlus, Info, ChevronUp, ChevronsUpDown, Download, Calendar } from 'lucide-react';
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
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TeamMember, EditableStatus, EditablePriority, AssigneeDropdown, Company, Toggle, Ticket, EditableDeadline } from '@/components/Shared';
import { subscribeTickets, createTicket, updateTicket, deleteTicket, subscribeGroups, updateGroup, createGroup, deleteGroup, subscribeBillableHours, createBillableHour, createGroupWithId, createMessage } from '@/lib/crmStore';
import TicketImportModal from './TicketImportModal';
import RichTextEditor from './RichTextEditor';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getStorageClient } from '@/lib/firebase';

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
  { id: 'companyName', header: 'Company Name' },
  { id: 'contactName', header: 'Contact Name' },
  { id: 'email', header: 'Contact Email' },
  { id: 'category', header: 'Category' },
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

function SortableHeader({
  column,
  onDelete,
  allowDeletingColumns,
  sortConfig,
  onSort,
  onRename
}: {
  column: Column,
  onDelete?: (id: string) => void,
  allowDeletingColumns?: boolean,
  sortConfig: { column: string; direction: 'asc' | 'desc' } | null,
  onSort: (colId: string) => void,
  onRename?: (id: string, newHeader: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : 1,
    width: getColumnWidth(column.id),
    minWidth: getColumnWidth(column.id),
    maxWidth: getColumnWidth(column.id),
  };

  const [isEditing, setIsEditing] = useState(false);
  const [tempHeader, setTempHeader] = useState(column.header);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (tempHeader.trim() && tempHeader.trim() !== column.header) {
      onRename?.(column.id, tempHeader.trim());
    }
  };

  // Core columns cannot be deleted, unless allowDeletingColumns is enabled
  const isDeletable = allowDeletingColumns || !['projectName', 'assignee', 'status', 'updatesCount'].includes(column.id);

  const renderSortIcon = (columnId: string) => {
    if (sortConfig?.column === columnId) {
      return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />;
    }
    return <ChevronsUpDown className="w-3.5 h-3.5 text-[#C8CDD5] shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      onClick={() => {
        if (!isEditing) {
          onSort(column.id);
        }
      }}
      className="sticky top-0 z-10 bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] whitespace-nowrap group select-none uppercase truncate cursor-pointer hover:bg-[#F0F2F5] transition-colors"
    >
      <div className="flex items-center gap-1 justify-between">
        <div className="flex items-center gap-1 group/th" onClick={(e) => { if (isEditing) e.stopPropagation(); }}>
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-[#8E9299] hover:text-[#1C1F23]"
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </button>

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={tempHeader}
              onChange={(e) => setTempHeader(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleSave();
                else if (e.key === 'Escape') {
                  setTempHeader(column.header);
                  setIsEditing(false);
                }
              }}
              onBlur={handleSave}
              className="px-1.5 py-0.5 text-[11px] border border-[#1061E3] rounded outline-none bg-white text-[#1C1F23] focus:ring-1 focus:ring-[#1061E3] font-semibold uppercase max-w-[120px]"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (column.id !== 'updatesCount') {
                  setIsEditing(true);
                }
              }}
              title="Double click to rename column"
              className="hover:underline cursor-text"
            >
              {column.header}
            </span>
          )}

          {column.id !== 'updatesCount' && !isEditing && renderSortIcon(column.id)}
        </div>
        {isDeletable && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete column "${column.header}"? This will hide it from all rows.`)) onDelete(column.id); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#C8CDD5] hover:text-[#D32F2F] rounded"
            title={`Delete column "${column.header}"`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
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

/**
 * Safely format a date value that may be a string, number, JS Date, or
 * Firestore Timestamp object. Returns a fallback string if the value is
 * missing or produces an invalid Date.
 */
const safeFormatDate = (value: any, opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }, fallback = 'Just now'): string => {
  if (!value) return fallback;
  let date: Date;
  if (typeof value?.toDate === 'function') {
    // Firestore Timestamp
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);
  }
  if (isNaN(date.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat('en-US', opts).format(date);
  } catch {
    return fallback;
  }
};

const getColumnWidth = (colId: string): string => {
  switch (colId) {
    case 'projectName':
      return '350px';
    case 'assignee':
      return '125px';
    case 'status':
      return '160px';
    case 'updatesCount':
      return '60px';
    case 'deadline':
      return '120px';
    case 'notes':
      return '300px';
    case 'priority':
      return '110px';
    case 'billableHours':
      return '130px';
    case 'url':
      return '180px';
    case 'planType':
      return '130px';
    case 'category':
      return '130px';
    case 'contactName':
      return '130px';
    case 'email':
      return '180px';
    case 'username':
      return '180px';
    case 'password':
      return '150px';
    default:
      return '150px';
  }
};

interface BillableHoursDropdownProps {
  value: string;
  onChange: (val: string) => void;
  customLabels: string[];
  onCreateLabel: (val: string) => void;
  isInline?: boolean;
}

function BillableHoursDropdown({ value, onChange, customLabels, onCreateLabel, isInline = false }: BillableHoursDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const defaultOptions = [
    'No Fee',
    '.5/hr',
    '1/hr',
    '2/hr',
    '3/hr',
    '4/hr',
    '5/hr',
    '6/hr',
    '7/hr',
    '8/hr',
    '9/hr',
    '10/hr',
    '16/hr',
    '24/hr',
    '40/hr'
  ];

  const combined = Array.from(new Set([...defaultOptions, ...customLabels]));
  const filtered = combined.filter(opt =>
    opt.toLowerCase().includes(tempValue.toLowerCase())
  );

  const formatLabel = (val: string): string => {
    const trimmed = val.trim();
    if (!trimmed) return '';
    if (!trimmed.toLowerCase().endsWith('/hr') && !trimmed.toLowerCase().endsWith('hr') && !isNaN(Number(trimmed))) {
      return `${trimmed}/hr`;
    }
    return trimmed;
  };

  const saveValue = (rawVal: string) => {
    const formatted = formatLabel(rawVal);
    if (formatted) {
      const isNew = !combined.some(opt => opt.toLowerCase() === formatted.toLowerCase());
      if (isNew) {
        onCreateLabel(formatted);
      }
      onChange(formatted);
    } else {
      onChange('');
    }
    setIsOpen(false);
  };

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        portalRef.current && !portalRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        if (isInline) {
          setIsEditing(false);
        }
      }
    };

    const updatePosition = () => {
      const el = inputRef.current || containerRef.current;
      if (isOpen && el) {
        const rect = el.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width
        });
      }
    };

    if (isOpen) {
      updatePosition();
      document.addEventListener('mousedown', handleGlobalClick);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, isInline]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      saveValue(tempValue);
      if (isInline) {
        setIsEditing(false);
      }
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setIsOpen(false);
      if (isInline) {
        setIsEditing(false);
      }
      inputRef.current?.blur();
    }
  };

  const handleBlur = () => {
    saveValue(tempValue);
    if (isInline) {
      setIsEditing(false);
    }
  };

  const portalMenu = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={portalRef}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-[9999] bg-[#1F2235] border border-[#2C314D] rounded-lg shadow-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        minWidth: '220px'
      }}
    >
      {value && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-[#181A2A] border-b border-[#2C314D]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-[#0B3C5D] text-[#38BDF8] font-bold">
            <span>{value}</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTempValue('');
                saveValue('');
                if (isInline) {
                  setIsEditing(false);
                }
              }}
              className="hover:text-white font-bold ml-1 text-sm leading-none"
              title="Clear hours"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="max-h-[200px] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-slate-700">
        {tempValue.trim() && !combined.some(o => o.toLowerCase() === tempValue.trim().toLowerCase()) && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveValue(tempValue);
              if (isInline) {
                setIsEditing(false);
              }
            }}
            className="w-full text-left px-3 py-2 rounded text-xs text-[#38BDF8] hover:bg-[#2C314D] font-semibold transition-colors border-b border-[#2C314D]/40"
          >
            + Create label &quot;{formatLabel(tempValue)}&quot;
          </button>
        )}

        {filtered.map(opt => (
          <button
            type="button"
            key={opt}
            onMouseDown={(e) => {
              e.preventDefault();
              setTempValue(opt);
              saveValue(opt);
              if (isInline) {
                setIsEditing(false);
              }
            }}
            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${value === opt
                ? 'bg-[#2C314D] text-white font-semibold'
                : 'text-gray-300 hover:bg-[#2C314D] hover:text-white'
              }`}
          >
            <span>{opt}</span>
            {value === opt && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
            )}
          </button>
        ))}

        {filtered.length === 0 && !tempValue.trim() && (
          <div className="text-center py-4 text-xs text-[#626C8F]">No options found</div>
        )}
      </div>

      <div className="p-2 border-t border-[#2C314D] text-center bg-[#181A2A]">
        <span className="text-[10px] text-[#626C8F]">
          Press enter or click Create to add custom amount
        </span>
      </div>
    </div>,
    document.body
  ) : null;

  if (isInline) {
    if (!isEditing) {
      return (
        <div
          className="min-h-[20px] min-w-[50px] truncate hover:bg-gray-100/80 rounded px-1 -mx-1 transition-colors cursor-text flex items-center justify-between group/cell"
          title={value ? `${value} (Click to edit)` : 'Click to edit'}
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
            setIsOpen(true);
          }}
        >
          <span>{value || '-'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#8E9299] opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0 ml-1" />
        </div>
      );
    }

    return (
      <div className="w-full h-full flex items-center relative" ref={containerRef}>
        <input
          ref={inputRef}
          type="text"
          value={tempValue}
          onChange={(e) => {
            setTempValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full px-1.5 py-0.5 text-[13px] border border-[#1061E3] rounded outline-none bg-white text-[#1C1F23] focus:ring-1 focus:ring-[#1061E3] font-medium"
        />
        {portalMenu}
      </div>
    );
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          type="text"
          value={tempValue}
          onChange={(e) => {
            setTempValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Select or type hours"
          className="w-full pl-3 pr-10 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23] h-[38px] transition-all hover:border-[#CCCCCC]"
        />
        <div className="absolute right-2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setTempValue('');
                saveValue('');
              }}
              className="text-[#8E9299] hover:text-[#1C1F23] p-1 font-bold text-sm leading-none"
              title="Clear"
            >
              &times;
            </button>
          )}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              if (isOpen) {
                setIsOpen(false);
              } else {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }
            }}
            className="text-[#8E9299] hover:text-[#1C1F23] p-1 flex items-center justify-center"
          >
            <ChevronDown className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {portalMenu}
    </div>
  );
}

function RowPlanNotes({ notes, projectType }: { notes: string; projectType: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const updatePosition = useCallback(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 330)
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  if (!notes) return <span className="text-[#C8CDD5] text-xs">—</span>;

  const portalMenu = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popoverRef}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[9999] w-80 bg-white rounded-xl shadow-2xl border border-[#E2E4E9] overflow-hidden"
      style={{
        top: position.top - window.scrollY,
        left: position.left - window.scrollX,
      }}
    >
      <div className="px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E2E4E9] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#1061E3]" />
          <span className="text-xs font-bold text-[#1C1F23] uppercase tracking-wide">{projectType} Plan Notes</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="p-0.5 text-[#8E9299] hover:text-[#1C1F23] rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-4 text-sm text-[#4A4D53] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
        {notes}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(p => !p)}
        className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 text-xs font-semibold ${isOpen
            ? 'bg-[#1061E3] text-white shadow-sm'
            : 'bg-blue-50 text-[#1061E3] hover:bg-blue-100'
          }`}
        title={`View ${projectType} plan notes`}
      >
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>View Plan</span>
      </button>
      {portalMenu}
    </>
  );
}

function EditableCell({ value, onSave, renderValue }: { value: string, onSave: (val: string) => void, renderValue?: (val: string) => React.ReactNode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
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
      className="min-h-[20px] min-w-[50px] truncate hover:bg-gray-100/80 rounded px-1 -mx-1 transition-colors cursor-text"
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

function SortableRow({ row, columns, onUpdate, setEditingRowId, teamMembers, expandedIds, toggleExpand, addSubRow, isSubRow = false, deleteRow, projectType, statusOptions, onContextMenu, subtaskCount, isSelected, onToggleSelect, onCommentsClick, isNestTarget = false, selectedCount = 0, customBillableHours, onCreateBillableHour, companies, runningLiveCount, holdDownCount }: any) {
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

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => setEditingRowId(row.id)}
      onContextMenu={(e) => onContextMenu?.(e, row.id, isSubRow)}
      className={`hover:bg-gray-50 transition-colors cursor-pointer group ${isSubRow ? 'bg-[#FAFAFA]' : ''} ${isSelected ? 'bg-blue-50/40 hover:bg-blue-50/60' : ''} ${isNestTarget ? 'outline outline-2 outline-[#1061E3] outline-offset-[-2px] !bg-blue-50/40' : ''}`}
    >
      <td style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] select-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {isSubRow && <div className="w-5 shrink-0" />}
          <input
            type="checkbox"
            checked={isSelected || false}
            onChange={() => onToggleSelect?.(false)}
            onMouseDown={(e) => { if (e.shiftKey) { e.preventDefault(); onToggleSelect?.(true); } }}
            className="rounded border-[#C8CDD5] text-[#1061E3] focus:ring-[#1061E3] cursor-pointer w-4 h-4 shrink-0 transition-all hover:border-[#1061E3]"
          />
          <div
            data-drag-handle
            className="text-[#8E9299] group-hover:text-[#1C1F23] relative shrink-0 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <GripVertical className="w-4 h-4" />
            {isDragging && isSelected && selectedCount > 1 && (
              <span className="absolute -top-2 -right-2.5 bg-[#1061E3] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm pointer-events-none z-10">
                {selectedCount}
              </span>
            )}
          </div>
        </div>
      </td>
      {columns.map((col: any) => (
        <td
          key={col.id}
          style={{
            width: getColumnWidth(col.id),
            minWidth: getColumnWidth(col.id),
            maxWidth: getColumnWidth(col.id),
          }}
          className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] whitespace-nowrap truncate relative"
        >
          {col.id === 'updatesCount' ? (
            <div className="flex items-center justify-center w-full" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={(e) => onCommentsClick?.(e, row.id)}
                className={`group/btn flex items-center justify-center w-8 h-8 rounded-full transition-all relative ${row.updates && row.updates.length > 0
                    ? 'text-[#1061E3] hover:bg-[#F0F2F5]'
                    : 'text-[#8E9299] hover:text-[#1061E3] hover:bg-[#F0F2F5]'
                  }`}
                title={
                  row.updates && row.updates.length > 0
                    ? `${row.updates.length} updates. Click to leave update.`
                    : 'No updates. Click to leave update.'
                }
              >
                {row.updates && row.updates.length > 0 ? (
                  <div className="relative">
                    <MessageCircle className="w-5 h-5 text-[#8E9299] hover:text-[#1061E3] transition-colors" />
                    <span className="absolute -top-1.5 -right-1.5 bg-[#1061E3] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-white shadow-sm">
                      {row.updates.length}
                    </span>
                  </div>
                ) : (
                  <MessageCirclePlus className="w-5 h-5 opacity-40 group-hover/btn:opacity-100 transition-opacity" />
                )}
              </button>
            </div>
          ) : col.id === 'status' ? (
            <EditableStatus
              value={row[col.id]}
              options={
                projectType === 'Local Listings'
                  ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done', 'Down']
                  : projectType === 'Social Media'
                    ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done']
                    : row.parentId
                      ? (projectType === 'Local Listings'
                        ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done', 'Down']
                        : projectType === 'Social Media'
                          ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done']
                          : ['Not Started', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'On Hold', 'Done', ...(projectType === 'Support Tickets' ? ['Closed'] : [])])
                      : (statusOptions || [])
              }
              onSave={(newVal) => {
                const patch: any = { [col.id]: newVal };
                if (projectType !== 'SEO') {
                  if (projectType === 'Google Ads') {
                    patch.groupId = newVal === 'Running' ? 'group-running' : 'group-active';
                  } else if (newVal === 'Running' && projectType === 'Local Listings') {
                    patch.groupId = 'group-running';
                  } else if (newVal === 'Needs Invoiced') {
                    patch.groupId = 'group-needs-invoiced';
                  } else if (newVal === 'S14: Launched' || newVal === 'Launched' || newVal === 'Done' || newVal === 'Closed') {
                    patch.groupId = 'group-completed';
                  } else if (row.groupId === 'group-needs-invoiced' || row.groupId === 'group-completed' || row.groupId === 'group-running') {
                    patch.groupId = projectType === 'Local Listings' ? 'group-setup' : projectType === 'Social Media' ? 'group-smm' : 'group-active';
                  }
                }
                onUpdate(row.id, patch);
              }}
            />
          ) : col.id === 'priority' ? (
            <EditablePriority value={row[col.id]} />
          ) : col.id === 'planType' ? (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <select
                value={row[col.id] || 'Basic Plan'}
                onChange={(e) => {
                  onUpdate(row.id, { [col.id]: e.target.value });
                }}
                className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1"
              >
                <option value="Basic Plan">Basic Plan</option>
                <option value="Plus Plan">Plus Plan</option>
              </select>
            </div>
          ) : col.id === 'assignee' ? (
            <AssigneeDropdown
              values={row.assignees || (row[col.id] ? [row[col.id]] : [])}
              onSaveMultiple={(newVals) => {
                onUpdate(row.id, {
                  assignees: newVals,
                  assignee: newVals[0] || ''
                });
              }}
              teamMembers={teamMembers}
            />
          ) : col.id === 'deadline' ? (
            <EditableDeadline
              value={row[col.id] || ''}
              onSave={(newVal) => {
                onUpdate(row.id, { [col.id]: newVal });
              }}
            />
          ) : col.id === 'billableHours' ? (
            <div onClick={(e) => e.stopPropagation()}>
              <BillableHoursDropdown
                value={row[col.id] || ''}
                onChange={(newVal) => onUpdate(row.id, { [col.id]: newVal })}
                customLabels={customBillableHours || []}
                onCreateLabel={onCreateBillableHour}
                isInline={true}
              />
            </div>
          ) : col.id === 'planDescription' ? (
            <div onClick={(e) => e.stopPropagation()}>
              <RowPlanNotes
                notes={row.companyId ? (() => {
                  const comp = companies?.find((c: any) => c.id === row.companyId);
                  if (!comp) return '';
                  switch (projectType) {
                    case 'Google Ads': return comp.ppcNotes || '';
                    case 'SEO': return comp.seoNotes || '';
                    case 'Social Media': return comp.smmNotes || '';
                    case 'Websites': return comp.webNotes || '';
                    case 'Local Listings': return comp.llNotes || '';
                    case 'Design & Print': return comp.dpNotes || '';
                    case 'Support Tickets': return comp.supportNotes || '';
                    default: return '';
                  }
                })() : ''}
                projectType={projectType}
              />
            </div>
          ) : col.id === 'url' ? (
            <EditableCell
              value={row[col.id] || ''}
              onSave={(newVal) => {
                onUpdate(row.id, { [col.id]: newVal });
              }}
              renderValue={(v) => {
                if (!v) return <span className="text-[#C8CDD5] text-xs">—</span>;
                const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[#1061E3] hover:text-blue-800 hover:underline font-medium truncate max-w-[180px] transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{v.replace(/^https?:\/\//i, '')}</span>
                  </a>
                );
              }}
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
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await onUpdate(row.id, { parentId: null });
                  }}
                  className="p-1 hover:bg-[#E2E4E9] rounded text-[#8E9299] hover:text-[#1061E3] transition-all -ml-1 shrink-0 group/subtask-btn"
                  title="Promote to Main Task"
                >
                  <CornerDownRight className="w-4 h-4 text-[#8E9299] group-hover/subtask-btn:text-[#1061E3] shrink-0 transition-colors" />
                </button>
              )}
              <EditableCell
                value={row[col.id]}
                onSave={(newVal) => {
                  onUpdate(row.id, { [col.id]: newVal });
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
                      {projectType === 'Local Listings' && !isSubRow && runningLiveCount !== undefined && runningLiveCount > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6] text-[10px] font-bold shrink-0 flex items-center gap-0.5 select-none shadow-2xs"
                          title={`${runningLiveCount} live citations`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#137333]"></span>
                          <span>{runningLiveCount}</span>
                        </span>
                      )}
                      {projectType === 'Local Listings' && !isSubRow && holdDownCount !== undefined && holdDownCount > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C] border border-[#FDE2E2] text-[10px] font-bold shrink-0 flex items-center gap-0.5 select-none shadow-2xs"
                          title={`${holdDownCount} down / hold citations`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#B91C1C]"></span>
                          <span>{holdDownCount}</span>
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
      <td style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }} className="px-4 py-3 border-b border-[#F0F2F5] text-right">
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

function GroupHeader({
  group,
  onUpdate,
  onRemove,
  dragHandleProps,
  isCollapsed,
  onToggleCollapse,
  allowDeletingGroups = false,
  planNotes,
  itemCount,
  totalHours,
  runningLiveCount,
  holdDownCount,
  projectType,
}: {
  group: { id: string, name: string },
  onUpdate: (id: string, name: string) => void,
  onRemove: (id: string) => void,
  dragHandleProps?: any,
  isCollapsed?: boolean,
  onToggleCollapse?: () => void,
  allowDeletingGroups?: boolean,
  planNotes?: string,
  itemCount?: number,
  totalHours?: number,
  runningLiveCount?: number,
  holdDownCount?: number,
  projectType?: string,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isNotesOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (notesRef.current && !notesRef.current.contains(e.target as Node)) {
        setIsNotesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isNotesOpen]);

  const save = () => {
    setIsEditing(false);
    if (name.trim()) onUpdate(group.id, name);
    else setName(group.name);
  };

  return (
    <div className="flex items-center justify-between mb-3 group/header">
      <div className="flex items-center gap-2">
        {dragHandleProps && (
          <div data-drag-handle {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23] p-1 hover:bg-gray-100 rounded">
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-gray-100 rounded text-[#8E9299] hover:text-[#1C1F23] transition-colors"
          title={isCollapsed ? "Expand group" : "Collapse group"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {isEditing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={save}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') save();
            }}
            className="text-lg font-bold text-[#1C1F23] bg-transparent border-b border-[#1061E3] outline-none px-1 py-0 w-full max-w-sm"
          />
        ) : (
          <div className="flex items-center gap-2">
            <h2
              onDoubleClick={() => setIsEditing(true)}
              className="text-lg font-bold text-[#1C1F23] cursor-text hover:bg-gray-100 rounded px-1 -ml-1 inline-block transition-colors"
              title="Double click to rename"
            >
              {group.name}
            </h2>
            {itemCount !== undefined && (
              <span
                className="px-2 py-0.5 rounded-full bg-[#F0F2F5] text-[#4A4D53] text-xs font-semibold shrink-0 select-none"
                title={`${itemCount} items in this group`}
              >
                {itemCount}
              </span>
            )}

            {totalHours !== undefined && (totalHours > 0 || group.id === 'group-needs-invoiced' || group.name.toLowerCase().includes('invoice')) && (
              <span
                className="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6] text-xs font-semibold shrink-0"
                title={`${totalHours} total billable hours`}
              >
                {totalHours} hrs
              </span>
            )}
            {planNotes && (
              <div className="relative" ref={notesRef}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsNotesOpen(p => !p); }}
                  className={`p-1 rounded-full transition-all flex items-center gap-1 text-xs font-semibold ${isNotesOpen
                      ? 'bg-[#1061E3] text-white shadow-sm'
                      : 'bg-blue-50 text-[#1061E3] hover:bg-blue-100'
                    }`}
                  title="View SEO plan notes"
                >
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span className="pr-0.5">Plan Notes</span>
                </button>
                {isNotesOpen && (
                  <div
                    className="absolute left-0 top-full mt-2 z-50 w-80 bg-white rounded-xl shadow-2xl border border-[#E2E4E9] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E2E4E9] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#1061E3]" />
                        <span className="text-xs font-bold text-[#1C1F23] uppercase tracking-wide">SEO Plan Notes</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNotesOpen(false)}
                        className="p-0.5 text-[#8E9299] hover:text-[#1C1F23] rounded transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-4 text-sm text-[#4A4D53] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {planNotes}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 opacity-0 group-hover/header:opacity-100 text-[#8E9299] hover:text-[#1061E3] hover:bg-blue-50 rounded transition-all"
              title="Rename group"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {allowDeletingGroups && (
        <button
          onClick={() => onRemove(group.id)}
          className="opacity-0 group-hover/header:opacity-100 p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors"
          title="Remove group"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function SortableGroupWrapper({ group, children }: { group: any, children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `group-sortable-${group.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="mb-8">
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === GroupHeader) {
          return React.cloneElement(child, { dragHandleProps: { ...attributes, ...listeners } } as any);
        }
        return child;
      })}
    </div>
  );
}

const isDropAnimationEnabled = false;

// Y-axis only vertical collision detection for table rows and empty group body dropzones.
// Columns and groups reordering will fallback to closestCenter.
const verticalCollisionDetection = (args: any) => {
  const { active, droppableContainers, pointerCoordinates } = args;

  const activeIdStr = String(active.id);
  // If dragging a column (which doesn't start with row- or group-), fallback to closestCenter
  if (!activeIdStr.startsWith('row-') && !activeIdStr.startsWith('group-')) {
    return closestCenter(args);
  }

  // If dragging a group, fallback to closestCenter
  if (activeIdStr.startsWith('group-sortable-')) {
    return closestCenter(args);
  }

  // If we have pointerCoordinates, perform vertical-only checking
  if (pointerCoordinates) {
    const { y } = pointerCoordinates;
    const targets = [];

    for (const container of droppableContainers) {
      const containerIdStr = String(container.id);

      // Only consider rows and group container bodies when dragging a row
      if (!containerIdStr.startsWith('row-') && !containerIdStr.startsWith('group-container-')) {
        continue;
      }

      const rect = container.rect.current;
      if (!rect) continue;

      // Check if pointer Y is between the top and bottom bounds of the container
      const isWithinY = y >= rect.top && y <= rect.bottom;
      
      // Calculate distance to the vertical center of the container
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(y - centerY);

      // Prioritize containers that actually envelope the pointer's Y coordinate
      const score = isWithinY ? -1000 + distance : distance;

      targets.push({
        id: container.id,
        score
      });
    }

    // Sort by score ascending
    targets.sort((a, b) => a.score - b.score);

    if (targets.length > 0 && targets[0].score < Infinity) {
      return [{ id: targets[0].id }];
    }
  }

  return closestCenter(args);
};

export default function WorkspaceProjectView({
  teamMembers,
  companies,
  projectType,
  flagKey,
  currentUserName,
  currentUserId,
  openRowId,
  onMention,
  canManageBoardMembers,
  onUpdateMemberPermissions,
  useFullScreenUnifiedTicketView,
  allowDeletingGroups = false,
  allowDeletingColumns = false,
  onCloseRow
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  projectType: string,
  flagKey: keyof Company,
  currentUserName: string,
  currentUserId?: string,
  openRowId?: string,
  onMention?: (
    text: string,
    sourceLabel: string,
    sourceTitle: string,
    actorName: string,
    actorId?: string,
    workspaceName?: string,
    rowId?: string
  ) => void,
  canManageBoardMembers: boolean,
  onUpdateMemberPermissions?: (memberId: string, workspaceName: string, hasAccess: boolean) => void,
  useFullScreenUnifiedTicketView?: boolean,
  allowDeletingGroups?: boolean,
  allowDeletingColumns?: boolean,
  onCloseRow?: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [subtaskFilters, setSubtaskFilters] = useState<Record<string, string>>({});
  const [subtaskSorts, setSubtaskSorts] = useState<Record<string, string>>({}); // 'none' | 'asc' | 'desc'
  type EditTab = 'details' | 'description' | 'updates' | 'files';
  const [columns, setColumns] = useState<Column[]>(() => {
    if (typeof window !== 'undefined') {
      const storageKey = `awebco_workspace_columns_${projectType.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (projectType === 'Local Listings') {
              if (!parsed.some((c: any) => c.id === 'username')) {
                parsed.push({ id: 'username', header: 'Username' });
              }
              if (!parsed.some((c: any) => c.id === 'password')) {
                parsed.push({ id: 'password', header: 'Password' });
              }
              if (!parsed.some((c: any) => c.id === 'url')) {
                parsed.push({ id: 'url', header: 'Link' });
              }
            }
            return parsed;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    let result: Column[];
    if (projectType === 'Local Listings') {
      result = [
        { id: 'projectName', header: 'Project Name' },
        { id: 'assignee', header: 'Assignee' },
        { id: 'status', header: 'Status' },
        { id: 'planType', header: 'Plan Type' },
        { id: 'username', header: 'Username' },
        { id: 'password', header: 'Password' },
        { id: 'url', header: 'Link' }
      ];
    } else if (projectType === 'Design & Print' || projectType === 'Support Tickets') {
      const filtered = INITIAL_COLUMNS.filter(c => {
        if (['companyName', 'contactName', 'email', 'category'].includes(c.id)) {
          return false;
        }
        return c.id !== 'pastelUrl' && c.id !== 'googleDriveUrl';
      });
      filtered.splice(5, 0, { id: 'billableHours', header: 'Billable Hours' });
      if (projectType === 'Support Tickets' || projectType === 'Design & Print') {
        filtered.splice(4, 0, { id: 'priority', header: 'Priority' });
      }
      result = filtered;
    } else if (projectType === 'SEO' || projectType === 'Google Ads' || projectType === 'Social Media') {
      result = INITIAL_COLUMNS.filter(c => !['pastelUrl', 'companyName', 'contactName', 'email', 'category'].includes(c.id));
      if (projectType === 'Google Ads') {
        result.push({ id: 'planDescription', header: 'Plan Description' });
      }
    } else {
      result = INITIAL_COLUMNS.filter(c => !['companyName', 'contactName', 'email', 'category'].includes(c.id));
    }

    const statusIndex = result.findIndex(c => c.id === 'status');
    if (statusIndex !== -1) {
      result.splice(statusIndex + 1, 0, { id: 'updatesCount', header: '' });
    } else {
      result.push({ id: 'updatesCount', header: '' });
    }
    return result;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && columns.length > 0) {
      const storageKey = `awebco_workspace_columns_${projectType.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      localStorage.setItem(storageKey, JSON.stringify(columns));
    }
  }, [columns, projectType]);

  useEffect(() => {
    if (columns.length === 0) {
      let result: Column[];
      if (projectType === 'Local Listings') {
        result = [
          { id: 'projectName', header: 'Project Name' },
          { id: 'assignee', header: 'Assignee' },
          { id: 'status', header: 'Status' },
          { id: 'planType', header: 'Plan Type' },
          { id: 'username', header: 'Username' },
          { id: 'password', header: 'Password' },
          { id: 'url', header: 'Link' }
        ];
      } else if (projectType === 'Design & Print' || projectType === 'Support Tickets') {
        const filtered = INITIAL_COLUMNS.filter(c => {
          if (['companyName', 'contactName', 'email', 'category'].includes(c.id)) {
            return false;
          }
          return c.id !== 'pastelUrl' && c.id !== 'googleDriveUrl';
        });
        filtered.splice(5, 0, { id: 'billableHours', header: 'Billable Hours' });
        if (projectType === 'Support Tickets' || projectType === 'Design & Print') {
          filtered.splice(4, 0, { id: 'priority', header: 'Priority' });
        }
        result = filtered;
      } else if (projectType === 'SEO' || projectType === 'Google Ads' || projectType === 'Social Media') {
        result = INITIAL_COLUMNS.filter(c => !['pastelUrl', 'companyName', 'contactName', 'email', 'category'].includes(c.id));
        if (projectType === 'Google Ads') {
          result.push({ id: 'planDescription', header: 'Plan Description' });
        }
      } else {
        result = INITIAL_COLUMNS.filter(c => !['companyName', 'contactName', 'email', 'category'].includes(c.id));
      }

      const statusIndex = result.findIndex(c => c.id === 'status');
      if (statusIndex !== -1) {
        result.splice(statusIndex + 1, 0, { id: 'updatesCount', header: '' });
      } else {
        result.push({ id: 'updatesCount', header: '' });
      }
      setColumns(result);
    }
  }, [columns.length, projectType]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleRenameColumn = (id: string, newHeader: string) => {
    setColumns(prev => prev.map(col => col.id === id ? { ...col, header: newHeader } : col));
  };
  const [rawTickets, setRawTickets] = useState<any[]>([]);

  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(() => {
    if (typeof window !== 'undefined') {
      const storageKey = `awebco_workspace_sort_config_${projectType.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      const saved = localStorage.getItem(storageKey);
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

  useEffect(() => {
    const storageKey = `awebco_workspace_sort_config_${projectType.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
    if (sortConfig) {
      localStorage.setItem(storageKey, JSON.stringify(sortConfig));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [sortConfig, projectType]);

  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  };

  const data = React.useMemo(() => {
    let filtered = rawTickets.filter(r => {
      if (r.companyId) {
        const company = companies.find(c => c.id === r.companyId);
        if (company && flagKey && company[flagKey] === false) {
          return false;
        }
      }
      return true;
    });

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = (row: any) => {
        if (row.projectName?.toLowerCase().includes(q)) return true;
        if (row.status?.toLowerCase().includes(q)) return true;
        if (row.planType?.toLowerCase().includes(q)) return true;
        if (row.category?.toLowerCase().includes(q)) return true;
        if (row.companyId) {
          const comp = companies.find(c => c.id === row.companyId);
          if (comp?.name?.toLowerCase().includes(q)) return true;
        }
        if (row.companyName?.toLowerCase().includes(q)) return true;
        if (row.assignees && Array.isArray(row.assignees)) {
          const matchedAssignee = row.assignees.some((id: string) => {
            const name = teamMembers.find(t => t.id === id)?.name;
            return name?.toLowerCase().includes(q);
          });
          if (matchedAssignee) return true;
        } else if (row.assignee) {
          const name = teamMembers.find(t => t.id === row.assignee)?.name;
          if (name?.toLowerCase().includes(q)) return true;
        }
        for (const col of columns) {
          if (['projectName', 'status', 'assignee'].includes(col.id)) continue;
          const val = row[col.id];
          if (val && String(val).toLowerCase().includes(q)) return true;
        }
        return false;
      };

      const ticketMap = new Map<string, any>();
      filtered.forEach(t => ticketMap.set(t.id, t));

      const subtasksByParent = new Map<string, any[]>();
      filtered.forEach(t => {
        if (t.parentId) {
          if (!subtasksByParent.has(t.parentId)) {
            subtasksByParent.set(t.parentId, []);
          }
          subtasksByParent.get(t.parentId)!.push(t);
        }
      });

      const matchesCache = new Map<string, boolean>();
      filtered.forEach(t => {
        matchesCache.set(t.id, matchesSearch(t));
      });

      filtered = filtered.filter(t => {
        if (matchesCache.get(t.id)) return true;
        if (t.parentId) {
          if (matchesCache.get(t.parentId)) return true;
        }
        if (!t.parentId) {
          const subs = subtasksByParent.get(t.id) || [];
          const anySubMatches = subs.some(sub => matchesCache.get(sub.id));
          if (anySubMatches) return true;
        }
        return false;
      });
    }

    if (!sortConfig) return filtered;

    const getAssigneeName = (row: any) => {
      if (row.assignees && Array.isArray(row.assignees) && row.assignees.length > 0) {
        return row.assignees.map((id: string) => teamMembers.find(t => t.id === id)?.name || '').join(', ');
      }
      return teamMembers.find(t => t.id === row.assignee)?.name || '';
    };

    return [...filtered].sort((a, b) => {
      const colId = sortConfig.column;
      if (colId === 'deadline') {
        const valA = a[colId];
        const valB = b[colId];
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

      let aVal = '';
      let bVal = '';

      if (colId === 'assignee') {
        aVal = getAssigneeName(a);
        bVal = getAssigneeName(b);
      } else {
        aVal = String(a[colId] ?? '');
        bVal = String(b[colId] ?? '');
      }

      const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [rawTickets, companies, flagKey, sortConfig, teamMembers, searchQuery, columns]);

  const [rawGroups, setRawGroups] = useState<any[]>([]);

  const groups = React.useMemo(() => {
    return rawGroups.filter(g => {
      if (g.companyId) {
        const company = companies.find(c => c.id === g.companyId);
        if (company && flagKey && company[flagKey] === false) {
          return false;
        }
      }
      return true;
    });
  }, [rawGroups, companies, flagKey]);
  const [isGroupsLoaded, setIsGroupsLoaded] = useState(false);
  const [isDefaultGroups, setIsDefaultGroups] = useState(true);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [isAddColOpen, setIsAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const prevEditingRowId = useRef<string | null>(null);
  useEffect(() => {
    if (editingRowId === null && prevEditingRowId.current !== null) {
      onCloseRow?.();
    }
    prevEditingRowId.current = editingRowId;
  }, [editingRowId, onCloseRow]);
  const [rowToDeleteId, setRowToDeleteId] = useState<string | null>(null);
  const [newUpdateText, setNewUpdateText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState<{ [filename: string]: number }>({});
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [activeCommentsRowId, setActiveCommentsRowId] = useState<string | null>(null);
  const [commentsPopoverPosition, setCommentsPopoverPosition] = useState({ top: 0, left: 0 });
  const [quickUpdateText, setQuickUpdateText] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [showQuickMentionMenu, setShowQuickMentionMenu] = useState(false);
  const [quickMentionFilter, setQuickMentionFilter] = useState('');
  const [quickMentionIndex, setQuickMentionIndex] = useState(-1);
  const quickUpdateTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeEditTab, setActiveEditTab] = useState<EditTab>('details');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, isSubRow: boolean } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const getSubtaskRows = useCallback((parentId: string, visibleDataList: any[]) => {
    let subRows = visibleDataList.filter((sub: any) => sub.parentId === parentId);
    const filterVal = subtaskFilters[parentId] || 'all';
    if (filterVal !== 'all') {
      subRows = subRows.filter(s => s.status === filterVal);
    }
    const sortVal = subtaskSorts[parentId] || 'none';
    if (sortVal !== 'none') {
      subRows = [...subRows].sort((a, b) => {
        const cmp = (a.status || '').localeCompare(b.status || '');
        return sortVal === 'asc' ? cmp : -cmp;
      });
    }
    return subRows;
  }, [subtaskFilters, subtaskSorts]);

  const rowMatchesStatus = useCallback((row: any) => {
    if (statusFilter === 'all') return true;
    if (row.parentId) {
      return row.status === statusFilter;
    } else {
      if (row.status === statusFilter) return true;
      const subs = data.filter(t => t.parentId === row.id);
      return subs.some(s => s.status === statusFilter);
    }
  }, [statusFilter, data]);
  const [isBoardEmailOpen, setIsBoardEmailOpen] = useState(false);
  const [copiedBoardEmail, setCopiedBoardEmail] = useState(false);
  const [isBoardMembersOpen, setIsBoardMembersOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const handleExportSelected = () => {
    if (selectedRowIds.size === 0) return;

    // Get the selected rows from the data array
    const selectedRows = data.filter(row => selectedRowIds.has(row.id));

    // Build CSV headers based on active columns
    const csvHeaders = columns.map(col => col.header);

    // Build CSV rows
    const csvRows = selectedRows.map(row => {
      return columns.map(col => {
        let val = '';
        if (col.id === 'assignee') {
          if (row.assignees && Array.isArray(row.assignees) && row.assignees.length > 0) {
            val = row.assignees.map((id: string) => teamMembers.find(t => t.id === id)?.name || '').join(', ');
          } else {
            val = teamMembers.find(t => t.id === row.assignee)?.name || '';
          }
        } else if (col.id === 'companyName') {
          val = companies.find(c => c.id === row.companyId)?.name || '';
        } else {
          val = row[col.id] || '';
        }
        return val;
      });
    });

    const escapeCsvCell = (cell: any) => {
      if (cell === null || cell === undefined) return '';
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      csvHeaders.map(escapeCsvCell).join(','),
      ...csvRows.map(row => row.map(escapeCsvCell).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${projectType}_Selected_Projects.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const [customBillableHours, setCustomBillableHours] = useState<string[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [activeBulkGroupDropdown, setActiveBulkGroupDropdown] = useState(false);
  const [activeBulkStatusDropdown, setActiveBulkStatusDropdown] = useState(false);
  const [activeBulkAssigneeDropdown, setActiveBulkAssigneeDropdown] = useState(false);
  const [activeBulkDeadlineDropdown, setActiveBulkDeadlineDropdown] = useState(false);
  const [activeBulkStartDateDropdown, setActiveBulkStartDateDropdown] = useState(false);
  const [bulkDeadlineValue, setBulkDeadlineValue] = useState('');
  const [bulkStartDateValue, setBulkStartDateValue] = useState('');
  const [sheetsSyncStatus, setSheetsSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  // Nest-as-subtask drag state
  const [nestHighlightId, setNestHighlightId] = useState<string | null>(null);
  const nestTargetIdRef = useRef<string | null>(null);
  const nestHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nestLastOverIdRef = useRef<string | null>(null);
  const nestClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shift-click range selection
  const lastCheckedRowId = useRef<string | null>(null);

  // Always-fresh ref so the debounced sync uses latest data
  const dataRef = React.useRef(data);
  const groupsRef = React.useRef(groups);
  React.useEffect(() => { dataRef.current = data; }, [data]);
  React.useEffect(() => { groupsRef.current = groups; }, [groups]);
  const sheetsSyncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSheetsSync = React.useCallback(() => {
    if (projectType !== 'SEO') return;
    if (sheetsSyncTimerRef.current) clearTimeout(sheetsSyncTimerRef.current);
    sheetsSyncTimerRef.current = setTimeout(async () => {
      setSheetsSyncStatus('syncing');
      try {
        const res = await fetch('/api/sheets/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_SECRET}`
          },
          body: JSON.stringify({
            tickets: dataRef.current,
            groups: groupsRef.current,
            teamMembers,
          }),
        });
        if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
        setSheetsSyncStatus('success');
        setTimeout(() => setSheetsSyncStatus('idle'), 3000);
      } catch (err) {
        console.error('[Sheets Sync]', err);
        setSheetsSyncStatus('error');
        setTimeout(() => setSheetsSyncStatus('idle'), 4000);
      }
    }, 2000);
  }, [projectType, teamMembers]);

  const handleToggleSelectRow = (id: string, shiftKey: boolean = false) => {
    if (shiftKey && lastCheckedRowId.current && lastCheckedRowId.current !== id) {
      // Build ordered list of currently visible rows in DOM to detect range
      const orderedIds: string[] = [];
      const visibleData = data.filter(r => rowMatchesStatus(r));
      for (const group of groups) {
        const groupRows = visibleData.filter(r => !r.parentId && getRowGroupId(r) === group.id);
        for (const row of groupRows) {
          orderedIds.push(row.id);
          if (expandedIds.has(row.id)) {
            const subRows = getSubtaskRows(row.id, visibleData);
            for (const sub of subRows) {
              orderedIds.push(sub.id);
            }
          }
        }
      }
      const from = orderedIds.indexOf(lastCheckedRowId.current);
      const to = orderedIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const range = orderedIds.slice(start, end + 1);
        setSelectedRowIds(prev => {
          const next = new Set(prev);
          range.forEach(rid => next.add(rid));
          return next;
        });
        lastCheckedRowId.current = id;
        return;
      }
    }
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastCheckedRowId.current = id;
  };

  const handleClearSelection = () => {
    setSelectedRowIds(new Set());
    setActiveBulkGroupDropdown(false);
    setActiveBulkStatusDropdown(false);
    setActiveBulkAssigneeDropdown(false);
    setActiveBulkDeadlineDropdown(false);
    setActiveBulkStartDateDropdown(false);
  };

  const handleBulkMoveSelected = async (targetGroupId: string) => {
    try {
      const ids = Array.from(selectedRowIds);
      for (const id of ids) {
        await handleUpdateRow(id, { groupId: targetGroupId });
      }
      handleClearSelection();
    } catch (err) {
      console.error('Failed to bulk move rows', err);
    }
  };

  const handleBulkStatusSelected = async (status: string) => {
    try {
      const ids = Array.from(selectedRowIds);
      for (const id of ids) {
        const row = data.find(r => r.id === id);
        const patch: any = { status };
        if (row && projectType !== 'SEO') {
          const currentGroupId = row.groupId || getRowGroupId(row);
          if (projectType === 'Google Ads') {
            patch.groupId = status === 'Running' ? 'group-running' : 'group-active';
          } else if (status === 'Running') {
            patch.groupId = 'group-running';
          } else if (status === 'Needs Invoiced') {
            patch.groupId = 'group-needs-invoiced';
          } else if (status === 'S14: Launched' || status === 'Launched' || status === 'Done' || status === 'Closed') {
            patch.groupId = 'group-completed';
          } else if (currentGroupId === 'group-needs-invoiced' || currentGroupId === 'group-completed' || currentGroupId === 'group-running') {
            patch.groupId = projectType === 'Local Listings' ? 'group-setup' : projectType === 'Social Media' ? 'group-smm' : 'group-active';
          }
        }
        await handleUpdateRow(id, patch);
      }
      handleClearSelection();
    } catch (err) {
      console.error('Failed to bulk change status', err);
    }
  };

  const handleBulkAssigneeSelected = async (assigneeId: string) => {
    try {
      const ids = Array.from(selectedRowIds);
      for (const id of ids) {
        await handleUpdateRow(id, {
          assignee: assigneeId,
          assignees: assigneeId ? [assigneeId] : []
        });
      }
      handleClearSelection();
    } catch (err) {
      console.error('Failed to bulk set assignee', err);
    }
  };

  const handleBulkDeleteSelected = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedRowIds.size} selected rows? This action cannot be undone.`)) {
      return;
    }
    try {
      const ids = Array.from(selectedRowIds);
      for (const id of ids) {
        await deleteTicket(id);
      }
      handleClearSelection();
    } catch (err) {
      console.error('Failed to bulk delete rows', err);
    }
  };

  const findStartDateColumnId = () => {
    const col = columns.find(c => 
      c.id === 'startDate' || 
      c.id === 'start_date' || 
      c.header.toLowerCase() === 'start date' || 
      c.header.toLowerCase() === 'start'
    );
    return col ? col.id : 'startDate';
  };

  const findDeadlineColumnId = () => {
    const col = columns.find(c => 
      c.id === 'deadline' || 
      c.id === 'due_date' || 
      c.id === 'dueDate' || 
      c.header.toLowerCase() === 'deadline' || 
      c.header.toLowerCase() === 'due date'
    );
    return col ? col.id : 'deadline';
  };

  const handleBulkDateUpdate = async (type: 'startDate' | 'deadline', value: string) => {
    try {
      const fieldId = type === 'startDate' ? findStartDateColumnId() : findDeadlineColumnId();
      const ids = Array.from(selectedRowIds);
      for (const id of ids) {
        await handleUpdateRow(id, { [fieldId]: value });
      }
      handleClearSelection();
    } catch (err) {
      console.error(`Failed to bulk update date for type: ${type}`, err);
    }
  };

  React.useEffect(() => {
    const unsub = subscribeBillableHours((labels) => {
      setCustomBillableHours(labels);
    });
    return () => unsub();
  }, []);

  const handleCreateBillableHour = async (label: string) => {
    try {
      await createBillableHour(label);
    } catch (err) {
      console.error('Failed to create billable hour label', err);
    }
  };

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
    let gid = row.groupId;

    // If the group ID exists in our groups list, use it
    if (gid && groups.some((g: any) => g.id === gid)) {
      return gid;
    }

    // If gid is a default or status is completed, map to the completed group
    const isCompletedStatus = projectType !== 'SEO' && (row.status === 'S14: Launched' || row.status === 'Launched' || row.status === 'Done' || row.status === 'Closed');
    if (gid === 'group-completed' || isCompletedStatus) {
      const compGroup = groups.find((g: any) =>
        g.id === 'group-completed' ||
        g.name.toLowerCase().includes('clos') ||
        g.name.toLowerCase().includes('complet') ||
        g.name.toLowerCase().includes('done')
      );
      if (compGroup) return compGroup.id;
      if (groups.length > 0) return groups[groups.length - 1].id;
    }

    if (gid === 'group-running' || row.status === 'Running') {
      const runningGroup = groups.find((g: any) => g.id === 'group-running' || g.name.toLowerCase().includes('run'));
      if (runningGroup) return runningGroup.id;
    }

    if (gid === 'group-needs-invoiced' || row.status === 'Needs Invoiced') {
      const invoiceGroup = groups.find((g: any) => g.id === 'group-needs-invoiced' || g.name.toLowerCase().includes('invoice'));
      if (invoiceGroup) return invoiceGroup.id;
    }

    if (gid === 'group-active') {
      const activeGroup = groups.find((g: any) =>
        g.id === 'group-active' ||
        g.name.toLowerCase().includes('activ') ||
        g.name.toLowerCase().includes('setup')
      );
      if (activeGroup) return activeGroup.id;
    }

    // Default fallback to the first group
    if (groups.length > 0) return groups[0].id;

    return gid || 'group-active';
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
        'Done',
        'Down'
      ];
    }
    if (projectType === 'Google Ads' || projectType === 'Social Media') {
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
        'Done',
        ...(projectType === 'Support Tickets' ? ['Closed'] : [])
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
    const unsub = subscribeTickets(projectType, (tickets) => {
      setRawTickets(tickets);
    }, (err: any) => {
      console.error('Subscription error:', err);
      if (err.message?.includes('index')) {
        alert('This board needs a Firestore index. Check the browser console for the setup link!');
      }
    });
    return () => unsub();
  }, [projectType]);

  React.useEffect(() => {
    setCollapsedGroupIds(new Set());
    const unsub = subscribeGroups(projectType, (fetchedGroups) => {
      setIsGroupsLoaded(true);
      if (fetchedGroups.length === 0) {
        setIsDefaultGroups(true);
        // Just show the UI defaults for now
        const defaults = projectType === 'Local Listings'
          ? [{ name: 'Setup', id: 'group-setup' }, { name: 'Running', id: 'group-running' }]
          : projectType === 'SEO' || projectType === 'Google Ads'
            ? [{ name: 'Setup', id: 'group-active' }, { name: 'Running', id: 'group-running' }]
            : projectType === 'Design & Print' || projectType === 'Support Tickets'
              ? [{ name: 'Active', id: 'group-active' }, { name: 'Needs Invoiced', id: 'group-needs-invoiced' }, { name: 'Complete', id: 'group-completed' }]
              : projectType === 'Social Media'
                ? [{ name: 'Social Media Management', id: 'group-smm' }, { name: 'Social Media Advertising', id: 'group-sma' }]
                : [{ name: 'Active', id: 'group-active' }, { name: 'Completed / Launched', id: 'group-completed' }];

        setRawGroups(defaults);
      } else {
        setIsDefaultGroups(false);
        setRawGroups(fetchedGroups);
      }
    }, (err: any) => {
      console.error('Group subscription error:', err);
      // Fallback to defaults on error
      const defaults = [{ id: 'group-active', name: 'Active' }, { id: 'group-completed', name: 'Completed' }];
      setRawGroups(defaults);
      setIsGroupsLoaded(true);
      setIsDefaultGroups(true);
    });
    return () => unsub();
  }, [projectType]);

  const handleUpdateRow = async (id: string, patch: any) => {
    try {
      const updatedPatch = { ...patch };

      // Map status change to the correct groupId dynamically if status is changed
      if (updatedPatch.status && projectType !== 'SEO') {
        const status = updatedPatch.status;
        const row = data.find(r => r.id === id);
        const currentGroupId = row ? (row.groupId || getRowGroupId(row)) : 'group-active';

        if (projectType === 'Google Ads') {
          updatedPatch.groupId = status === 'Running' ? 'group-running' : 'group-active';
        } else if (status === 'Running' && projectType === 'Local Listings') {
          const runningGroup = groups.find((g: any) => g.id === 'group-running' || g.name.toLowerCase().includes('run'));
          updatedPatch.groupId = runningGroup ? runningGroup.id : 'group-running';
        } else if (status === 'Needs Invoiced') {
          const invoiceGroup = groups.find((g: any) => g.id === 'group-needs-invoiced' || g.name.toLowerCase().includes('invoice'));
          updatedPatch.groupId = invoiceGroup ? invoiceGroup.id : 'group-needs-invoiced';
        } else if (status === 'S14: Launched' || status === 'Launched' || status === 'Done' || status === 'Closed') {
          const compGroup = groups.find((g: any) =>
            g.id === 'group-completed' ||
            g.name.toLowerCase().includes('clos') ||
            g.name.toLowerCase().includes('complet') ||
            g.name.toLowerCase().includes('done')
          );
          updatedPatch.groupId = compGroup ? compGroup.id : 'group-completed';
        } else if (currentGroupId === 'group-needs-invoiced' || currentGroupId === 'group-completed' || currentGroupId === 'group-running') {
          const activeGroup = groups.find((g: any) =>
            g.id === 'group-active' ||
            g.name.toLowerCase().includes('activ') ||
            g.name.toLowerCase().includes('setup')
          );
          updatedPatch.groupId = activeGroup ? activeGroup.id : 'group-active';
        }
      } else if (updatedPatch.groupId) {
        // If groupId is specifically set (e.g. from inline status changes calling handleUpdateRow with a hardcoded groupId like 'group-completed'),
        // resolve it if that group ID does not exist in groups.
        const gid = updatedPatch.groupId;
        if (!groups.some((g: any) => g.id === gid)) {
          if (gid === 'group-completed') {
            const compGroup = groups.find((g: any) =>
              g.id === 'group-completed' ||
              g.name.toLowerCase().includes('clos') ||
              g.name.toLowerCase().includes('complet') ||
              g.name.toLowerCase().includes('done')
            );
            if (compGroup) updatedPatch.groupId = compGroup.id;
            else if (groups.length > 0) updatedPatch.groupId = groups[groups.length - 1].id;
          } else if (gid === 'group-running') {
            const runningGroup = groups.find((g: any) => g.id === 'group-running' || g.name.toLowerCase().includes('run'));
            if (runningGroup) updatedPatch.groupId = runningGroup.id;
          } else if (gid === 'group-needs-invoiced') {
            const invoiceGroup = groups.find((g: any) => g.id === 'group-needs-invoiced' || g.name.toLowerCase().includes('invoice'));
            if (invoiceGroup) updatedPatch.groupId = invoiceGroup.id;
          } else if (gid === 'group-active') {
            const activeGroup = groups.find((g: any) =>
              g.id === 'group-active' ||
              g.name.toLowerCase().includes('activ') ||
              g.name.toLowerCase().includes('setup')
            );
            if (activeGroup) updatedPatch.groupId = activeGroup.id;
          }
        }
      }

      if (updatedPatch.assignees !== undefined) {
        const row = data.find(r => r.id === id);
        const oldAssignees = row?.assignees || (row?.assignee ? [row.assignee] : []);
        const newAssignees = updatedPatch.assignees || [];
        const addedAssignees = newAssignees.filter((uid: string) => uid && !oldAssignees.includes(uid));

        if (addedAssignees.length > 0 && currentUserId) {
          const taskName = row?.projectName || 'Unnamed Task';
          for (const recipientId of addedAssignees) {
            if (recipientId === currentUserId) continue;
            const messageText = `I assigned you to the task: "${taskName}" (task:${projectType}:${id})`;
            createMessage({
              senderId: currentUserId,
              receiverId: recipientId,
              text: messageText,
            }).catch(e => console.error('Failed to send assignee message', e));
          }
        }
      }

      // Optimistic update
      setRawTickets(prev => prev.map(t => t.id === id ? { ...t, ...updatedPatch } : t));

      await updateTicket(id, updatedPatch);
      triggerSheetsSync();
    } catch (err) {
      console.error('Failed to update ticket', err);
    }
  };

  const handleUpdateGroup = async (id: string, name: string) => {
    try {
      if (isDefaultGroups) {
        // Initialize default groups in Firestore first, changing the name of the target group
        for (let i = 0; i < groups.length; i++) {
          const defGroup = groups[i];
          await createGroupWithId(defGroup.id, {
            name: defGroup.id === id ? name : defGroup.name,
            workspace: projectType,
            order: i
          });
        }
      } else {
        await updateGroup(id, { name });
      }
    } catch (err) {
      console.error('Failed to update group:', err);
    }
  };

  const handleRemoveGroup = async (id: string) => {
    try {
      const fallbackGroup = groups.find(g => g.id !== id)?.id;

      // Move tickets belonging to the deleted group
      const ticketsToMove = data.filter(r => getRowGroupId(r) === id);
      if (fallbackGroup) {
        for (const r of ticketsToMove) {
          await handleUpdateRow(r.id, { groupId: fallbackGroup });
        }
      }

      if (isDefaultGroups) {
        // Initialize default groups in Firestore (excluding the deleted one)
        let orderIdx = 0;
        for (let i = 0; i < groups.length; i++) {
          const defGroup = groups[i];
          if (defGroup.id === id) continue;
          await createGroupWithId(defGroup.id, {
            name: defGroup.name,
            workspace: projectType,
            order: orderIdx++
          });
        }
      } else {
        await deleteGroup(id);
      }
    } catch (err) {
      console.error('Failed to remove group:', err);
    }
  };

  const handleAddUpdate = async (rowId: string) => {
    if (!newUpdateText.trim() && !attachedFile) return;

    const row = data.find(item => item.id === rowId);
    if (!row) return;

    const author = currentUserName || teamMembers?.[0]?.name || 'You';
    const trimmedText = newUpdateText.trim();

    if (trimmedText) {
      onMention?.(trimmedText, 'Project Comment', `${projectType}: ${row.projectName}`, author, currentUserId, projectType, rowId);
    }

    let attachmentUrl = '';
    if (attachedFile) {
      try {
        setIsPostingUpdate(true);
        const storage = getStorageClient();
        const uniqueName = `${Date.now()}_${attachedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const path = currentUserId || 'anonymous';
        const storageRef = ref(storage, `update-attachments/${path}/${uniqueName}`);
        const uploadTask = uploadBytesResumable(storageRef, attachedFile);
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            null,
            (error) => {
              console.error('Upload failed:', error);
              reject(error);
            },
            async () => {
              try {
                attachmentUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve();
              } catch (err) {
                reject(err);
              }
            }
          );
        });
      } catch (err) {
        console.error('Failed to upload comment attachment:', err);
        alert('Failed to upload attachment.');
        setIsPostingUpdate(false);
        return;
      }
    }

    const newUpdate: any = {
      id: `update-${Date.now()}`,
      author,
      text: trimmedText,
      timestamp: new Date().toISOString()
    };
    if (attachedFile) {
      newUpdate.attachment = attachedFile.name;
      if (attachmentUrl) {
        newUpdate.attachmentUrl = attachmentUrl;
      }
    }

    const updates = row.updates ? [...row.updates, newUpdate] : [newUpdate];
    await handleUpdateRow(rowId, { updates });

    setNewUpdateText('');
    setAttachedFile(null);
    setIsPostingUpdate(false);
  };

  const handleCommentsButtonClick = (e: React.MouseEvent, rowId: string) => {
    e.stopPropagation();
    if (activeCommentsRowId === rowId) {
      setActiveCommentsRowId(null);
    } else {
      setActiveCommentsRowId(rowId);
      setQuickUpdateText('');
      const rect = e.currentTarget.getBoundingClientRect();
      setCommentsPopoverPosition({
        top: rect.bottom + window.scrollY + 6,
        left: Math.max(10, Math.min(window.innerWidth - 300, rect.left + window.scrollX - 120))
      });
    }
  };

  const handleQuickAddUpdate = async (rowId: string) => {
    if (!quickUpdateText.trim()) return;

    const row = data.find(item => item.id === rowId);
    if (!row) return;

    const author = currentUserName || teamMembers?.[0]?.name || 'You';
    const trimmedText = quickUpdateText.trim();

    if (onMention && trimmedText) {
      onMention(trimmedText, 'Project Comment', `${projectType}: ${row.projectName}`, author, currentUserId, projectType, rowId);
    }

    const newUpdate = {
      id: `update-${Date.now()}`,
      author,
      text: trimmedText,
      timestamp: new Date().toISOString()
    };

    const updates = row.updates ? [...row.updates, newUpdate] : [newUpdate];
    await handleUpdateRow(rowId, { updates });

    setQuickUpdateText('');
    setActiveCommentsRowId(null);
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveCommentsRowId(null);
    };

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveCommentsRowId(null);
      }
    };

    if (activeCommentsRowId) {
      document.addEventListener('click', handleGlobalClick);
      document.addEventListener('keydown', handleGlobalKeydown);
      return () => {
        document.removeEventListener('click', handleGlobalClick);
        document.removeEventListener('keydown', handleGlobalKeydown);
      };
    }
  }, [activeCommentsRowId]);

  useEffect(() => {
    if (!activeCommentsRowId) {
      setShowQuickMentionMenu(false);
      setQuickMentionFilter('');
      setQuickMentionIndex(-1);
    }
  }, [activeCommentsRowId]);

  const handleAddProjectFile = async (rowId: string, file: File) => {
    const row = data.find(item => item.id === rowId);
    if (!row) return;

    try {
      setIsUploadingFile(true);
      const storage = getStorageClient();
      const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const path = currentUserId || 'anonymous';
      const storageRef = ref(storage, `project-attachments/${path}/${uniqueName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      setFileUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setFileUploadProgress(prev => ({ ...prev, [file.name]: progress }));
          },
          (error) => {
            console.error('Upload failed:', error);
            setFileUploadProgress(prev => {
              const next = { ...prev };
              delete next[file.name];
              return next;
            });
            reject(error);
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              setFileUploadProgress(prev => {
                const next = { ...prev };
                delete next[file.name];
                return next;
              });
              resolve(url);
            } catch (err) {
              reject(err);
            }
          }
        );
      });

      const files = row.files ? [...row.files] : [];
      files.push({
        id: `file-${Date.now()}`,
        name: file.name,
        url: downloadUrl,
        uploadedAt: new Date().toISOString(),
      });
      await handleUpdateRow(rowId, { files });
    } catch (err) {
      console.error('Failed to add project file:', err);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleRemoveProjectFile = async (rowId: string, fileId: string) => {
    const row = data.find(item => item.id === rowId);
    if (!row) return;

    const files = (row.files || []).filter((file: any) => file.id !== fileId);
    await handleUpdateRow(rowId, { files });
  };

  const deleteRow = async (id: string) => {
    try {
      await deleteTicket(id);
    } catch (err) {
      console.error('Failed to delete ticket', err);
    }
  };

  const duplicateRow = async (id: string) => {
    const rowToDuplicate = data.find(r => r.id === id);
    if (!rowToDuplicate) return;

    const { id: _, createdAt: __, updatedAt: ___, ...rest } = rowToDuplicate;
    const newRow = {
      ...rest,
      projectName: `${rowToDuplicate.projectName} (Copy)`,
      isManual: true,
      order: (rowToDuplicate.order || 0) + 0.5, // Simple way to insert after
    };

    try {
      await createTicket(newRow);
    } catch (err) {
      console.error('Failed to duplicate ticket', err);
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

  const addSubRow = async (parentId: string) => {
    setExpandedIds(prev => new Set(prev).add(parentId));
    const parent = data.find(r => r.id === parentId);

    const newSubRow: any = {
      parentId,
      projectName: 'New Sub-Task',
      assignee: '',
      assignees: [],
      status: 'Not Started',
      deadline: '',
      url: '',
      description: '',
      notes: '',
      files: [],
      groupId: parent?.groupId || groups[0]?.id || (projectType === 'Local Listings' ? 'group-setup' : projectType === 'Social Media' ? 'group-smm' : 'group-active'),
      workspace: projectType,
      order: data.filter(r => r.parentId === parentId).length,
    };

    if (projectType === 'Local Listings') {
      newSubRow.planType = 'Basic Plan';
    }
    if (projectType === 'Support Tickets' || projectType === 'Design & Print') {
      newSubRow.priority = 'Medium';
    }

    try {
      await createTicket(newSubRow);
    } catch (err) {
      console.error('Failed to create sub-task', err);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
      bypassActivationConstraint({ event }) {
        const target = event.target as HTMLElement | null;
        return !!target?.closest('[data-drag-handle]');
      }
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over) {
      if (nestHoverTimerRef.current) { clearTimeout(nestHoverTimerRef.current); nestHoverTimerRef.current = null; }
      if (nestTargetIdRef.current && !nestClearTimerRef.current) {
        nestClearTimerRef.current = setTimeout(() => {
          nestTargetIdRef.current = null;
          setNestHighlightId(null);
          nestClearTimerRef.current = null;
        }, 300);
      }
      return;
    }

    if (String(active.id).startsWith('row-')) {
      const activeIdStr = String(active.id).replace('row-', '');
      const activeData = data.find(r => r.id === activeIdStr);

      // --- Nest-as-subtask gesture (200ms hover over an expanded top-level row) ---
      if (String(over.id).startsWith('row-') && activeData) {
        const overIdStr = String(over.id).replace('row-', '');
        const overData = data.find(r => r.id === overIdStr);
        const activeHasChildren = data.some(r => r.parentId === activeIdStr);
        if (
          overData && 
          !overData.parentId && 
          overIdStr !== activeIdStr && 
          overIdStr !== activeData.parentId && 
          expandedIds.has(overIdStr) &&
          !activeHasChildren
        ) {
          if (nestClearTimerRef.current) {
            clearTimeout(nestClearTimerRef.current);
            nestClearTimerRef.current = null;
          }

          if (nestLastOverIdRef.current !== overIdStr) {
            nestLastOverIdRef.current = overIdStr;
            if (nestHoverTimerRef.current) { clearTimeout(nestHoverTimerRef.current); nestHoverTimerRef.current = null; }
            const capturedId = overIdStr;
            nestHoverTimerRef.current = setTimeout(() => {
              nestTargetIdRef.current = capturedId;
              setNestHighlightId(capturedId);
              nestHoverTimerRef.current = null;
              if (nestClearTimerRef.current) {
                clearTimeout(nestClearTimerRef.current);
                nestClearTimerRef.current = null;
              }
            }, 200); // Trigger quickly (200ms) so snapping doesn't reset it easily
          }
        } else {
          nestLastOverIdRef.current = null;
          if (nestHoverTimerRef.current) { clearTimeout(nestHoverTimerRef.current); nestHoverTimerRef.current = null; }
          if (nestTargetIdRef.current && !nestClearTimerRef.current) {
            nestClearTimerRef.current = setTimeout(() => {
              nestTargetIdRef.current = null;
              setNestHighlightId(null);
              nestClearTimerRef.current = null;
            }, 300); // 300ms cooldown to keep highlight active if snapping occurs
          }
        }
      } else {
        nestLastOverIdRef.current = null;
        if (nestHoverTimerRef.current) { clearTimeout(nestHoverTimerRef.current); nestHoverTimerRef.current = null; }
        if (nestTargetIdRef.current && !nestClearTimerRef.current) {
          nestClearTimerRef.current = setTimeout(() => {
            nestTargetIdRef.current = null;
            setNestHighlightId(null);
            nestClearTimerRef.current = null;
          }, 300);
        }
      }

      // --- Existing cross-group move ---
      let targetGroupId: string | null = null;
      if (String(over.id).startsWith('row-')) {
        const overIdStr = String(over.id).replace('row-', '');
        const overData = data.find(r => r.id === overIdStr);
        if (overData) targetGroupId = getRowGroupId(overData);
      } else if (String(over.id).startsWith('group-container-')) {
        targetGroupId = String(over.id).replace('group-container-', '');
      } else if (String(over.id).startsWith('group-sortable-')) {
        targetGroupId = String(over.id).replace('group-sortable-', '');
      }
      if (targetGroupId && activeData && getRowGroupId(activeData) !== targetGroupId) {
        if (!activeData.parentId) {
          setRawTickets(prev => prev.map(t => t.id === activeIdStr ? { ...t, groupId: targetGroupId! } : t));
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Clean up nest gesture state
    if (nestHoverTimerRef.current) { clearTimeout(nestHoverTimerRef.current); nestHoverTimerRef.current = null; }
    if (nestClearTimerRef.current) { clearTimeout(nestClearTimerRef.current); nestClearTimerRef.current = null; }
    const nestTarget = nestTargetIdRef.current;
    nestTargetIdRef.current = null;
    nestLastOverIdRef.current = null;
    setNestHighlightId(null);

    if (String(active.id).startsWith('row-')) {
      const activeId = String(active.id).replace('row-', '');
      const activeRowData = data.find(r => r.id === activeId);

      // Feature 1: Nest as subtask when hover-hold triggered (checked FIRST before returning)
      if (nestTarget && activeRowData) {
        const targetRow = data.find(r => r.id === nestTarget);
        if (targetRow) {
          const targetGroupId = getRowGroupId(targetRow);
          // Optimistic update
          flushSync(() => {
            setRawTickets(prev => prev.map(t => t.id === activeId ? { ...t, parentId: nestTarget, groupId: targetGroupId } : t));
          });

          handleUpdateRow(activeId, { parentId: nestTarget, groupId: targetGroupId });
          setExpandedIds(prev => new Set(prev).add(nestTarget));
          return;
        }
      }
    }

    if (!over || active.id === over.id) return;

    if (String(active.id).startsWith('row-')) {
      const activeId = String(active.id).replace('row-', '');
      const activeRowData = data.find(r => r.id === activeId);
      if (!activeRowData) return;

      let overRowData: any = null;
      let newParentId = null;
      let newGroupId = activeRowData.groupId || getRowGroupId(activeRowData);
      const overIdStr = String(over.id);

      if (overIdStr.startsWith('row-')) {
        const overId = overIdStr.replace('row-', '');
        overRowData = data.find(r => r.id === overId);
        if (overRowData) {
          if (activeRowData.parentId) {
            // Dragging a subtask
            if (!overRowData.parentId) {
              // Dropped on a top-level row
              if (expandedIds.has(overRowData.id)) {
                newParentId = overRowData.id;
              } else {
                newParentId = null; // Un-nest!
              }
            } else {
              // Dropped on a subtask
              newParentId = overRowData.parentId;
            }
          } else {
            // Dragging a top-level row
            newParentId = null; // Always keep top-level unless nestTarget was set
          }
          newGroupId = getRowGroupId(overRowData);

          // If we resolved newParentId to null, but overRowData is a subtask,
          // resolve the target overRowData to be the parent row of that subtask
          // so that the ordering places the dragged top-level row relative to the parent row!
          if (newParentId === null && overRowData.parentId) {
            const parentRow = data.find(r => r.id === overRowData.parentId);
            if (parentRow) {
              overRowData = parentRow;
            }
          }
        }
      } else if (overIdStr.startsWith('group-container-')) {
        newGroupId = overIdStr.replace('group-container-', '');
        newParentId = null;
      } else if (overIdStr.startsWith('group-sortable-')) {
        newGroupId = overIdStr.replace('group-sortable-', '');
        newParentId = null;
      } else {
        return;
      }

      // Build ordered list of currently visible rows in DOM to detect direction
      const orderedIds: string[] = [];
      const visibleData = data.filter(r => rowMatchesStatus(r));
      for (const group of groups) {
        const groupRows = visibleData.filter(r => !r.parentId && getRowGroupId(r) === group.id);
        for (const row of groupRows) {
          orderedIds.push(row.id);
          if (expandedIds.has(row.id)) {
            const subRows = visibleData.filter((sub: any) => sub.parentId === row.id);
            for (const sub of subRows) {
              orderedIds.push(sub.id);
            }
          }
        }
      }

      const flatActiveIdx = orderedIds.indexOf(activeId);
      const flatOverIdx = overRowData ? orderedIds.indexOf(overRowData.id) : -1;
      const dragDown = flatActiveIdx !== -1 && flatOverIdx !== -1 && flatActiveIdx < flatOverIdx;

      // Handle multi-drag or single drag row selection
      const isMultiDrag = selectedRowIds.has(activeId) && selectedRowIds.size > 1;
      const draggedIds = isMultiDrag ? Array.from(selectedRowIds) : [activeId];

      // Sort draggedIds according to their current visual order
      draggedIds.sort((a, b) => orderedIds.indexOf(a) - orderedIds.indexOf(b));

      // Get target sibling rows from rawTickets, excluding the dragged ones, and sort them by current order
      const targetSiblings = rawTickets
        .filter(t => (t.parentId || null) === (newParentId || null) && getRowGroupId(t) === newGroupId && !draggedIds.includes(t.id))
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

      const draggedRows = draggedIds.map(id => rawTickets.find(t => t.id === id)).filter(Boolean) as any[];

      const newOrderedSiblings = [...targetSiblings];
      if (overRowData && !draggedIds.includes(overRowData.id)) {
        const overIdx = targetSiblings.findIndex(r => r.id === overRowData.id);
        if (overIdx !== -1) {
          const insertIdx = dragDown ? overIdx + 1 : overIdx;
          newOrderedSiblings.splice(insertIdx, 0, ...draggedRows);
        } else {
          newOrderedSiblings.push(...draggedRows);
        }
      } else {
        newOrderedSiblings.push(...draggedRows);
      }

      console.log('[CRM DnD] Drag Result re-indexed visually:', {
        draggedIds,
        overRowId: overRowData?.id,
        dragDown,
        newOrderedSiblings: newOrderedSiblings.map(s => s.projectName)
      });

      const updates: { id: string; patch: any }[] = [];
      const localUpdatedTickets = rawTickets.map(t => {
        const siblingIdx = newOrderedSiblings.findIndex(s => s.id === t.id);
        if (siblingIdx !== -1) {
          const targetOrder = siblingIdx + 1;
          const targetParentId = draggedIds.includes(t.id) ? newParentId : t.parentId;
          const targetGroupId = draggedIds.includes(t.id) ? newGroupId : t.groupId;

          const hasOrderChanged = (Number(t.order) || 0) !== targetOrder;
          const hasParentChanged = (t.parentId || null) !== (targetParentId || null);
          const hasGroupChanged = (t.groupId || null) !== (targetGroupId || null);

          if (hasOrderChanged || hasParentChanged || hasGroupChanged) {
            const patch: any = { order: targetOrder };
            if (draggedIds.includes(t.id)) {
              patch.parentId = targetParentId;
              patch.groupId = targetGroupId;
            }
            updates.push({ id: t.id, patch });
            return { ...t, order: targetOrder, parentId: targetParentId, groupId: targetGroupId };
          }
        }
        return t;
      });

      // Optimistic update all siblings in local state
      flushSync(() => {
        setRawTickets(localUpdatedTickets);
      });

      // Write updates to Firestore
      updates.forEach(u => {
        updateTicket(u.id, u.patch).catch(err => {
          console.error('[CRM DnD] Failed to write drag update to Firestore for ticket', u.id, err);
        });
      });
      triggerSheetsSync();
    } else if (String(active.id).startsWith('group-sortable-')) {
      const activeId = String(active.id).replace('group-sortable-', '');
      const overId = String(over.id).replace('group-sortable-', '');

      const oldIndex = groups.findIndex(g => g.id === activeId);
      const newIndex = groups.findIndex(g => g.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newGroups = arrayMove(groups, oldIndex, newIndex);
        setRawGroups(newGroups);
        (async () => {
          try {
            if (isDefaultGroups) {
              for (let i = 0; i < newGroups.length; i++) {
                await createGroupWithId(newGroups[i].id, { name: newGroups[i].name, workspace: projectType, order: i });
              }
            } else {
              for (let i = 0; i < newGroups.length; i++) {
                await updateGroup(newGroups[i].id, { order: i });
              }
            }
          } catch (err) {
            console.error('Failed to update group orders:', err);
          }
        })();
      }
    } else {
      setColumns(items => {
        const oldIndex = items.findIndex(col => col.id === active.id);
        const newIndex = items.findIndex(col => col.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const newColId = newColName
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');

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

  const handleAddWebsite = async () => {
    console.log('New Project button clicked');
    try {
      // Find the current max order to put the new item at the end
      const orders = (data || []).map(r => Number(r.order) || 0);
      const maxOrder = orders.length > 0 ? Math.max(...orders) : 0;

      const newTicket: any = {
        projectName: 'New Manual Project',
        assignee: '',
        assignees: [],
        status: defaultStatus || 'Not Started',
        deadline: '',
        url: '',
        description: 'Manually created ticket.',
        notes: '',
        files: [],
        isManual: true,
        groupId: groups[0]?.id || (projectType === 'Local Listings' ? 'group-setup' : projectType === 'Social Media' ? 'group-smm' : 'group-active'),
        workspace: projectType,
        order: maxOrder + 1,
      };

      if (projectType === 'Local Listings') {
        newTicket.planType = 'Basic Plan';
      }
      if (projectType === 'Support Tickets' || projectType === 'Design & Print') {
        newTicket.priority = 'Medium';
      }

      console.log('Payload being sent to Firestore:', newTicket);
      const id = await createTicket(newTicket);
      console.log('Successfully created ticket with ID:', id);
    } catch (err) {
      console.error('CRITICAL ERROR in handleAddWebsite:', err);
      alert('An error occurred. Check the console for details.');
    }
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

  const visibleBoardMembers = teamMembers.filter(member => {
    if (member.role === 'master_admin' || member.role === 'admin') return true;
    if (member.permissions?.allowedWorkspaces) {
      return member.permissions.allowedWorkspaces.includes(projectType);
    }
    return member.role === 'staff';
  });

  const [isAddingGroup, setIsAddingGroup] = useState(false);

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
      {/* Top Bar */}
      <header className="min-h-16 bg-white border-b border-[#E2E4E9] flex flex-col lg:flex-row lg:items-center justify-between p-4 lg:px-6 gap-3 shrink-0">
        <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-full lg:w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
          <Search className="w-4 h-4 text-[#8E9299]" />
          <input
            type="text"
            placeholder={`Search in ${projectType}...`}
            className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {projectType === 'SEO' && (
            <button
              onClick={() => triggerSheetsSync()}
              disabled={sheetsSyncStatus === 'syncing'}
              title="Sync this board to Google Sheets"
              className={`h-[38px] px-3 rounded-md border text-sm font-semibold flex items-center gap-2 transition-all ${sheetsSyncStatus === 'success'
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : sheetsSyncStatus === 'error'
                    ? 'border-red-300 bg-red-50 text-red-600'
                    : 'border-[#E2E4E9] bg-white text-[#4A4D53] hover:bg-gray-50 hover:text-[#1061E3]'
                }`}
            >
              {sheetsSyncStatus === 'syncing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : sheetsSyncStatus === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>
                {sheetsSyncStatus === 'syncing' ? 'Syncing…' :
                  sheetsSyncStatus === 'success' ? 'Synced!' :
                    sheetsSyncStatus === 'error' ? 'Sync Failed' :
                      'Sync to Sheets'}
              </span>
            </button>
          )}
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
                    {canManageBoardMembers
                      ? 'Toggle switches to grant or remove access for staff and freelancers.'
                      : `These members have access to ${projectType}. Go to Settings > Team Members to change access.`}
                  </p>
                  <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
                    {teamMembers.map(member => {
                      const hasGlobalAccess = member.role === 'master_admin' || member.role === 'admin';
                      let hasAccess = false;
                      if (hasGlobalAccess) hasAccess = true;
                      else if (member.permissions?.allowedWorkspaces) hasAccess = member.permissions.allowedWorkspaces.includes(projectType);
                      else hasAccess = member.role === 'staff';

                      return (
                        <div key={member.id} className="flex items-center justify-between gap-3 rounded-md border border-[#E2E4E9] bg-[#F9FAFB] px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#1C1F23] truncate">{member.name}</div>
                            <div className="text-[11px] text-[#8E9299] uppercase tracking-wider">{member.role === 'master_admin' ? 'Master Admin' : member.role || 'staff'}</div>
                          </div>
                          {canManageBoardMembers ? (
                            <div className="flex items-center gap-2">
                              {hasGlobalAccess && (
                                <span className="text-[10px] font-bold text-[#1061E3] bg-[#EBF5FF] px-1.5 py-0.5 rounded uppercase tracking-tighter">Global</span>
                              )}
                              <Toggle
                                checked={hasAccess}
                                onChange={(val) => onUpdateMemberPermissions?.(member.id, projectType, val)}
                                disabled={hasGlobalAccess}
                              />
                            </div>
                          ) : (
                            <div className={`text-xs font-semibold ${hasAccess ? 'text-[#10B981]' : 'text-[#8E9299]'}`}>
                              {hasAccess ? 'Access Granted' : 'No Access'}
                            </div>
                          )}
                        </div>
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
          {selectedRowIds.size > 0 && (
            <button
              onClick={handleExportSelected}
              className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Export Selected ({selectedRowIds.size})
            </button>
          )}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Import
          </button>
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
            disabled={isAddingGroup}
            onClick={async () => {
              setIsAddingGroup(true);
              try {
                if (isDefaultGroups) {
                  // Initialize default groups in Firestore first so they don't disappear
                  for (let i = 0; i < groups.length; i++) {
                    const defGroup = groups[i];
                    await createGroupWithId(defGroup.id, {
                      name: defGroup.name,
                      workspace: projectType,
                      order: i
                    });
                  }
                }

                await createGroup({
                  name: 'New Group',
                  workspace: projectType,
                  order: groups.length
                });
              } catch (err) {
                console.error('Failed to create group:', err);
                // Force a temporary UI update so they can at least use it
                setRawGroups(prev => [...prev, { id: `temp-${Date.now()}`, name: 'New Group' }]);
              } finally {
                setIsAddingGroup(false);
              }
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#1061E3] hover:text-blue-700 transition-colors disabled:opacity-50"
          >
            {isAddingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isAddingGroup ? 'Adding...' : 'Add Group'}
          </button>
        </div>
      </div>      <div className="flex-grow px-6 pb-6 overflow-auto">
        <DndContext
          id="websites-dnd-context"
          sensors={sensors}
          collisionDetection={verticalCollisionDetection}
          accessibility={{ restoreFocus: false }}
          onDragStart={(e) => {
            setActiveDragId(e.active.id as string);
            if (String(e.active.id).startsWith('row-')) {
              setSortConfig(null);
            }
            // Clear any stale nest state when a new drag starts
            if (nestHoverTimerRef.current) { clearTimeout(nestHoverTimerRef.current); nestHoverTimerRef.current = null; }
            if (nestClearTimerRef.current) { clearTimeout(nestClearTimerRef.current); nestClearTimerRef.current = null; }
            nestTargetIdRef.current = null;
            nestLastOverIdRef.current = null;
            setNestHighlightId(null);
          }} onDragOver={handleDragOver} onDragEnd={(e) => {
            setActiveDragId(null);
            handleDragEnd(e);
          }} onDragCancel={() => setActiveDragId(null)}>
          <SortableContext items={groups.map(g => `group-sortable-${g.id}`)} strategy={verticalListSortingStrategy}>
            {groups.map((group) => {
              const visibleData = data.filter(r => rowMatchesStatus(r));
              const groupRows = visibleData.filter(r => !r.parentId && getRowGroupId(r) === group.id);
              const isCollapsed = collapsedGroupIds.has(group.id);

              const hasBillableHoursCol = columns.some(c => c.id === 'billableHours');
              let totalHours = 0;
              if (hasBillableHoursCol) {
                const parseHours = (val: any) => {
                  if (!val) return 0;
                  const str = String(val).trim().toLowerCase();
                  if (str === 'no fee' || str === 'no-fee') return 0;
                  const match = str.match(/([0-9]*\.[0-9]+|[0-9]+)/);
                  if (match) {
                    const num = parseFloat(match[1]);
                    return isNaN(num) ? 0 : num;
                  }
                  return 0;
                };

                groupRows.forEach(row => {
                  totalHours += parseHours(row.billableHours);
                  const subRows = visibleData.filter(sub => sub.parentId === row.id);
                  subRows.forEach(sub => {
                    totalHours += parseHours(sub.billableHours);
                  });
                });
              }
              const finalTotalHours = hasBillableHoursCol ? Number(totalHours.toFixed(2)) : undefined;

              let runningLiveCount = 0;
              let holdDownCount = 0;
              if (projectType === 'Local Listings') {
                const countRow = (r: any) => {
                  const status = (r.status || '').trim().toLowerCase();
                  if (status === 'running' || status === 'live') {
                    runningLiveCount++;
                  } else if (status === 'on hold' || status === 'down') {
                    holdDownCount++;
                  }
                };

                groupRows.forEach(row => {
                  countRow(row);
                  const subRows = visibleData.filter(sub => sub.parentId === row.id);
                  subRows.forEach(sub => {
                    countRow(sub);
                  });
                });
              }

              return (
                <SortableGroupWrapper key={group.id} group={group}>
                  <GroupHeader
                    group={group}
                    onUpdate={handleUpdateGroup}
                    onRemove={handleRemoveGroup}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => {
                      setCollapsedGroupIds(prev => {
                        const next = new Set(prev);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      });
                    }}
                    allowDeletingGroups={allowDeletingGroups}
                    planNotes={projectType === 'SEO' && group.companyId
                      ? companies.find(c => c.id === group.companyId)?.seoNotes || undefined
                      : undefined
                    }
                    itemCount={groupRows.length}
                    totalHours={finalTotalHours}
                    runningLiveCount={runningLiveCount}
                    holdDownCount={holdDownCount}
                    projectType={projectType}
                  />
                  {!isCollapsed && (
                    <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#E2E4E9] overflow-x-auto">
                      <table className="w-full border-collapse text-left table-fixed min-w-[1200px]" style={{ minWidth: '1200px' }}>
                        <thead className="sticky top-0 z-10 shadow-sm">
                          <tr>
                            <th style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 border-b border-[#E2E4E9]">
                              <div className="flex items-center pl-1">
                                <input
                                  type="checkbox"
                                  checked={groupRows.length > 0 && groupRows.every(r => selectedRowIds.has(r.id))}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    const rowIds = groupRows.map(r => r.id);
                                    setSelectedRowIds(prev => {
                                      const next = new Set(prev);
                                      if (isChecked) {
                                        rowIds.forEach(id => next.add(id));
                                      } else {
                                        rowIds.forEach(id => next.delete(id));
                                      }
                                      return next;
                                    });
                                  }}
                                  className="rounded border-[#C8CDD5] text-[#1061E3] focus:ring-[#1061E3] cursor-pointer w-4 h-4"
                                />
                              </div>
                            </th>
                            <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                              {columns.map(col => {
                                let displayCol = col;
                                if (projectType === 'Websites' && group.id === 'group-completed' && col.id === 'deadline') {
                                  displayCol = { ...col, header: 'Launched Date' };
                                }
                                return (
                                  <SortableHeader
                                    key={`${col.id}-${displayCol.header}`}
                                    column={displayCol}
                                    onDelete={(colId) => setColumns(prev => prev.filter(c => c.id !== colId))}
                                    allowDeletingColumns={allowDeletingColumns}
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    onRename={handleRenameColumn}
                                  />
                                );
                              })}
                            </SortableContext>
                            <th style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }} className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">
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
                            ...(expandedIds.has(r.id) ? getSubtaskRows(r.id, visibleData).map((sub: any) => `row-${sub.id}`) : [])
                          ])} strategy={verticalListSortingStrategy}>
                            {groupRows.map(row => (
                              <React.Fragment key={row.id}>
                                <SortableRow
                                  row={row}
                                  columns={columns}
                                  onUpdate={handleUpdateRow}
                                  setEditingRowId={setEditingRowId}
                                  teamMembers={teamMembers}
                                  statusOptions={statusOptions}
                                  expandedIds={expandedIds}
                                  toggleExpand={toggleExpand}
                                  addSubRow={addSubRow}
                                  isSubRow={false}
                                  deleteRow={deleteRow}
                                  projectType={projectType}
                                  runningLiveCount={
                                    projectType === 'Local Listings'
                                      ? data.filter(r => r.parentId === row.id).filter(r => {
                                          const status = (r.status || '').trim().toLowerCase();
                                          return status === 'running' || status === 'live';
                                        }).length
                                      : undefined
                                  }
                                  holdDownCount={
                                    projectType === 'Local Listings'
                                      ? data.filter(r => r.parentId === row.id).filter(r => {
                                          const status = (r.status || '').trim().toLowerCase();
                                          return status === 'on hold' || status === 'down';
                                        }).length
                                      : undefined
                                  }
                                  onContextMenu={(e: React.MouseEvent, rowId: string, isSubRow: boolean) => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.clientX, y: e.clientY, rowId, isSubRow });
                                  }}
                                  subtaskCount={data.filter(r => r.parentId === row.id).length}
                                  isSelected={selectedRowIds.has(row.id)}
                                  onToggleSelect={(shiftKey?: boolean) => handleToggleSelectRow(row.id, shiftKey)}
                                  onCommentsClick={handleCommentsButtonClick}
                                  isNestTarget={nestHighlightId === row.id}
                                  selectedCount={selectedRowIds.size}
                                  customBillableHours={customBillableHours}
                                  onCreateBillableHour={handleCreateBillableHour}
                                  companies={companies}
                                  subtaskFilter={subtaskFilters[row.id] || 'all'}
                                  onSetSubtaskFilter={(rid: string, val: string) => setSubtaskFilters(prev => ({ ...prev, [rid]: val }))}
                                  subtaskSort={subtaskSorts[row.id] || 'none'}
                                  onSetSubtaskSort={(rid: string, val: string) => setSubtaskSorts(prev => ({ ...prev, [rid]: val }))}
                                  uniqueSubtaskStatuses={Array.from(new Set(data.filter((s: any) => s.parentId === row.id).map((s: any) => s.status).filter(Boolean)))}
                                />
                                {expandedIds.has(row.id) && getSubtaskRows(row.id, visibleData).map(subRow => (
                                  <SortableRow
                                    key={subRow.id}
                                    row={subRow}
                                    columns={columns}
                                    onUpdate={handleUpdateRow}
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
                                    isSelected={selectedRowIds.has(subRow.id)}
                                    onToggleSelect={(shiftKey?: boolean) => handleToggleSelectRow(subRow.id, shiftKey)}
                                    onCommentsClick={handleCommentsButtonClick}
                                    isNestTarget={nestHighlightId === subRow.id}
                                    selectedCount={selectedRowIds.size}
                                    customBillableHours={customBillableHours}
                                    onCreateBillableHour={handleCreateBillableHour}
                                    companies={companies}
                                    subtaskFilter={subtaskFilters[subRow.id] || 'all'}
                                    onSetSubtaskFilter={(rid: string, val: string) => setSubtaskFilters(prev => ({ ...prev, [rid]: val }))}
                                    subtaskSort={subtaskSorts[subRow.id] || 'none'}
                                    onSetSubtaskSort={(rid: string, val: string) => setSubtaskSorts(prev => ({ ...prev, [rid]: val }))}
                                    uniqueSubtaskStatuses={Array.from(new Set(data.filter((s: any) => s.parentId === subRow.id).map((s: any) => s.status).filter(Boolean)))}
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
                      {/* Add Row to this group */}
                      <button
                        onClick={async () => {
                          try {
                            const orders = (data || []).map((r: any) => Number(r.order) || 0);
                            const maxOrder = orders.length > 0 ? Math.max(...orders) : 0;
                            const newTicket: any = {
                              projectName: 'New Project',
                              assignee: '',
                              assignees: [],
                              status: defaultStatus || 'Not Started',
                              deadline: '',
                              url: '',
                              description: '',
                              notes: '',
                              files: [],
                              isManual: true,
                              groupId: group.id,
                              workspace: projectType,
                              order: maxOrder + 1,
                            };
                            if (projectType === 'Local Listings') newTicket.planType = 'Basic Plan';
                            if (projectType === 'Support Tickets' || projectType === 'Design & Print') newTicket.priority = 'Medium';
                            await createTicket(newTicket);
                          } catch (err) {
                            console.error('Failed to add row:', err);
                          }
                        }}
                        className="mt-1 w-full flex items-center gap-2 px-4 py-2 text-sm text-[#8E9299] hover:text-[#1061E3] hover:bg-blue-50/60 rounded-b-lg transition-colors font-medium group/addrow"
                      >
                        <Plus className="w-4 h-4 opacity-50 group-hover/addrow:opacity-100 transition-opacity" />
                        Add Row
                      </button>
                    </div>
                  )}
                </SortableGroupWrapper>
              );
            })}
          </SortableContext>
          <DragOverlay adjustScale={false} dropAnimation={isDropAnimationEnabled ? undefined : null}>
            {activeDragId ? (() => {
              if (activeDragId.startsWith('group-sortable-')) {
                const groupId = activeDragId.replace('group-sortable-', '');
                const activeGroup = groups.find(g => g.id === groupId);
                return activeGroup ? (
                  <div className="bg-white rounded-lg shadow-lg border border-[#E2E4E9] p-4 opacity-90 w-[300px] pointer-events-none select-none">
                    <div className="font-bold text-[#1C1F23] text-sm uppercase tracking-wide">{activeGroup.name}</div>
                  </div>
                ) : null;
              } else if (activeDragId.startsWith('row-')) {
                const rowId = activeDragId.replace('row-', '');
                const activeRow = data.find(r => r.id === rowId);
                return activeRow ? (
                  <div className="bg-white rounded-lg shadow-lg border border-[#E2E4E9] overflow-hidden opacity-95 pointer-events-none select-none">
                    <table className="w-full border-collapse text-left table-fixed min-w-[1200px]" style={{ minWidth: '1200px', width: '1200px' }}>
                      <tbody>
                        <tr className="bg-white">
                          <td style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
                            <div className="flex items-center gap-2 text-[#8E9299]">
                              <GripVertical className="w-4 h-4" />
                            </div>
                          </td>
                          {columns.map(col => {
                            let displayCol = col;
                            if (projectType === 'Websites' && activeRow.groupId === 'group-completed' && col.id === 'deadline') {
                              displayCol = { ...col, header: 'Launched Date' };
                            }
                            const val = activeRow[col.id];
                            return (
                              <td
                                key={col.id}
                                style={{
                                  width: getColumnWidth(col.id),
                                  minWidth: getColumnWidth(col.id),
                                  maxWidth: getColumnWidth(col.id),
                                }}
                                className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] whitespace-nowrap truncate text-[#1C1F23]"
                              >
                                {col.id === 'projectName' ? <strong>{val}</strong> : (val || '-')}
                              </td>
                            );
                          })}
                          <td style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }} className="px-4 py-3 border-b border-[#F0F2F5]"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null;
              }
              return null;
            })() : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 w-48 bg-white rounded-md shadow-lg border border-[#E2E4E9] overflow-hidden py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isSubRow && (
            <>
              <button 
                onClick={async () => {
                  await handleUpdateRow(contextMenu.rowId, { parentId: null });
                  setContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-[#1061E3] hover:bg-blue-50/60 flex items-center gap-2 font-medium"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                Convert to Main Task
              </button>
              <div className="h-px bg-[#E2E4E9] my-1" />
            </>
          )}
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
          useFullScreenUnifiedTicketView ? (
            <div className="fixed inset-0 z-50 bg-[#F9FAFB] flex flex-col h-screen w-screen overflow-hidden">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="flex flex-col h-full w-full"
              >
                {/* Header bar */}
                <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingRowId(null)}
                      className="flex items-center gap-2 text-sm font-semibold text-[#4A4D53] hover:text-[#1C1F23] transition-colors bg-[#F0F2F5] hover:bg-[#E2E8F0] px-4 py-2 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                      Back to {projectType}
                    </button>
                    <button
                      onClick={() => {
                        setRowToDeleteId(editingRowId);
                        setEditingRowId(null);
                      }}
                      className="flex items-center gap-2 text-sm font-semibold text-[#D32F2F] hover:text-white border border-[#D32F2F] hover:bg-[#D32F2F] transition-all px-3 py-2 rounded-lg shadow-sm ml-2"
                      title="Delete Project"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                  <h2 className="text-base font-bold text-[#1C1F23]">{projectType} — Detail View</h2>
                  <button
                    onClick={() => setEditingRowId(null)}
                    className="flex items-center gap-2 text-sm font-semibold text-white bg-[#1061E3] hover:bg-blue-700 transition-colors px-4 py-2 rounded-lg shadow-sm"
                  >
                    Done
                  </button>
                </header>

                {/* Scrollable Content Container */}
                <div className="flex-grow overflow-y-auto p-6 md:p-10">
                  {(() => {
                    const editingRow = data.find(r => r.id === editingRowId);
                    if (!editingRow) return null;

                    return (
                      <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-20">

                        {/* Card 1: Header / Title & Metadata */}
                        <div className="bg-white rounded-xl border border-[#E2E4E9] shadow-sm relative z-20">
                          <div className="p-6 md:p-8">
                            <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Ticket Title</label>
                            <input
                              type="text"
                              value={editingRow.projectName ?? ''}
                              onChange={e => handleUpdateRow(editingRowId, { projectName: e.target.value })}
                              className="w-full text-2xl md:text-3xl font-extrabold text-[#1C1F23] border-none outline-none focus:bg-[#F4F5F7] px-2 py-1 -mx-2 rounded-md mb-6 transition-colors"
                              placeholder="Untitled Ticket"
                            />

                            {/* Metadata Flex Container with Generous Widths */}
                            <div className="flex flex-wrap items-stretch gap-6 p-6 bg-[#F9FAFB] border border-[#E2E4E9] rounded-xl">
                              {/* Status */}
                              <div className="flex-grow flex-shrink-0 min-w-[160px] md:min-w-[180px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Status</label>
                                <select
                                  value={editingRow.status ?? ''}
                                  onChange={e => {
                                    const patch: any = { status: e.target.value };
                                    if (projectType !== 'SEO') {
                                      if (e.target.value === 'Running') {
                                        patch.groupId = 'group-running';
                                      } else if (e.target.value === 'Needs Invoiced') {
                                        patch.groupId = 'group-needs-invoiced';
                                      } else if (e.target.value === 'Done' || e.target.value === 'Launched' || e.target.value === 'S14: Launched') {
                                        patch.groupId = 'group-completed';
                                      } else {
                                        patch.groupId = 'group-active';
                                      }
                                    }
                                    handleUpdateRow(editingRowId, patch);
                                  }}
                                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23]"
                                >
                                  {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </div>

                              {/* Priority */}
                              <div className="flex-grow flex-shrink-0 min-w-[140px] md:min-w-[150px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Priority</label>
                                <select
                                  value={editingRow.priority ?? ''}
                                  onChange={e => handleUpdateRow(editingRowId, { priority: e.target.value })}
                                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23]"
                                >
                                  <option value="">Select Priority</option>
                                  {['Low', 'Medium', 'High', 'Urgent'].map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Assignee */}
                              <div className="flex-grow flex-shrink-0 min-w-[140px] md:min-w-[150px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Assignee</label>
                                <div className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg bg-white h-[38px] flex items-center justify-between">
                                  <AssigneeDropdown
                                    values={editingRow.assignees || (editingRow.assignee ? [editingRow.assignee] : [])}
                                    onSaveMultiple={(newVals) => {
                                      handleUpdateRow(editingRowId, {
                                        assignees: newVals,
                                        assignee: newVals[0] || ''
                                      });
                                    }}
                                    teamMembers={teamMembers}
                                  />
                                </div>
                              </div>

                              {/* Deadline */}
                              <div className="flex-grow flex-shrink-0 min-w-[150px] md:min-w-[160px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">
                                  {projectType === 'Websites' && (editingRow.groupId === 'group-completed' || getRowGroupId(editingRow) === 'group-completed')
                                    ? 'Launched Date'
                                    : 'Deadline'}
                                </label>
                                <input
                                  type="date"
                                  value={editingRow.deadline ?? ''}
                                  onChange={e => handleUpdateRow(editingRowId, { deadline: e.target.value })}
                                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23] h-[38px]"
                                />
                              </div>

                              {/* Billable Hours */}
                              <div className="flex-grow flex-shrink-0 min-w-[160px] md:min-w-[180px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Billable Hours</label>
                                <BillableHoursDropdown
                                  value={editingRow.billableHours || ''}
                                  onChange={(newVal) => handleUpdateRow(editingRowId, { billableHours: newVal })}
                                  customLabels={customBillableHours}
                                  onCreateLabel={handleCreateBillableHour}
                                />
                              </div>

                              {/* Company Name */}
                              <div className="flex-grow flex-shrink-0 min-w-[160px] md:min-w-[180px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Company Name</label>
                                <input
                                  type="text"
                                  value={editingRow.companyName ?? ''}
                                  onChange={e => handleUpdateRow(editingRowId, { companyName: e.target.value })}
                                  placeholder="N/A"
                                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23] h-[38px] transition-all hover:border-[#CCCCCC]"
                                />
                              </div>

                              {/* Contact Name */}
                              <div className="flex-grow flex-shrink-0 min-w-[150px] md:min-w-[160px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Contact Name</label>
                                <input
                                  type="text"
                                  value={editingRow.contactName ?? ''}
                                  onChange={e => handleUpdateRow(editingRowId, { contactName: e.target.value })}
                                  placeholder="N/A"
                                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23] h-[38px] transition-all hover:border-[#CCCCCC]"
                                />
                              </div>

                              {/* Contact Email */}
                              <div className="flex-grow flex-shrink-0 min-w-[160px] md:min-w-[180px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Contact Email</label>
                                <input
                                  type="email"
                                  value={editingRow.email ?? ''}
                                  onChange={e => handleUpdateRow(editingRowId, { email: e.target.value })}
                                  placeholder="N/A"
                                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23] h-[38px] transition-all hover:border-[#CCCCCC]"
                                />
                              </div>

                              {/* Category */}
                              <div className="flex-grow flex-shrink-0 min-w-[150px] md:min-w-[160px]">
                                <label className="block text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-2">Category</label>
                                <input
                                  type="text"
                                  value={editingRow.category ?? ''}
                                  onChange={e => handleUpdateRow(editingRowId, { category: e.target.value })}
                                  placeholder="N/A"
                                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] font-medium text-[#1C1F23] h-[38px] transition-all hover:border-[#CCCCCC]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card 2: Description */}
                        <div className="bg-white rounded-xl border border-[#E2E4E9] shadow-sm overflow-hidden p-6 md:p-8">
                          <h3 className="text-base font-bold text-[#1C1F23] mb-4">Description</h3>
                          <RichTextEditor
                            value={editingRow.description ?? ''}
                            onChange={val => handleUpdateRow(editingRowId, { description: val })}
                            placeholder="Add a detailed description..."
                            minHeight="160px"
                          />
                        </div>

                        {/* Card 3: Files & Media */}
                        <div className="bg-white rounded-xl border border-[#E2E4E9] shadow-sm overflow-hidden p-6 md:p-8">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-[#1C1F23]">Files & Attachments</h3>
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
                                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#1061E3] hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                Add File
                              </button>
                            </div>
                          </div>

                          <div className="border border-[#E2E4E9] rounded-xl overflow-hidden bg-[#F9FAFB] p-4">
                            {(editingRow.files && editingRow.files.length > 0) || Object.keys(fileUploadProgress).length > 0 ? (
                              <div className="flex flex-col gap-2">
                                {Object.entries(fileUploadProgress).map(([name, progress]) => (
                                  <div key={name} className="flex items-center justify-between bg-white border border-[#E2E4E9] rounded-lg px-4 py-2.5 shadow-xs">
                                    <div className="flex items-center gap-3 min-w-0 flex-grow">
                                      <Loader2 className="w-4 h-4 text-[#1061E3] animate-spin shrink-0" />
                                      <div className="flex-grow min-w-0">
                                        <div className="text-xs font-medium text-[#1C1F23] truncate mb-1">{name}</div>
                                        <div className="h-1.5 w-full bg-[#E3F2FD] rounded-full overflow-hidden">
                                          <div 
                                            className="h-full bg-[#1061E3] transition-all duration-300 ease-out"
                                            style={{ width: `${progress}%` }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {editingRow.files && editingRow.files.map((file: any, index: number) => (
                                  <div key={index} className="flex items-center justify-between bg-white border border-[#E2E4E9] rounded-lg px-4 py-2.5 shadow-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileIcon className="w-4 h-4 text-[#8E9299] shrink-0" />
                                      {file.url ? (
                                        <a
                                          href={file.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm font-semibold text-[#1061E3] hover:text-blue-700 transition-colors truncate hover:underline"
                                        >
                                          {file.name}
                                        </a>
                                      ) : (
                                        <span className="text-sm font-semibold text-[#1C1F23] truncate">{file.name}</span>
                                      )}
                                      {file.size && (
                                        <span className="text-[11px] text-[#8E9299] font-medium">({file.size})</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {file.url && (
                                        <a
                                          href={file.url}
                                          download={file.name}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[#8E9299] hover:text-[#1061E3] p-1 rounded hover:bg-blue-50 transition-colors flex items-center justify-center shrink-0"
                                          title="Download file"
                                        >
                                          <Download className="w-4 h-4" />
                                        </a>
                                      )}
                                      <button
                                        onClick={() => {
                                          if (confirm('Delete this file?')) {
                                            const updatedFiles = editingRow.files.filter((_: any, i: number) => i !== index);
                                            handleUpdateRow(editingRowId, { files: updatedFiles });
                                          }
                                        }}
                                        className="text-[#8E9299] hover:text-[#D32F2F] p-1 rounded hover:bg-red-50 transition-colors"
                                        title="Delete attachment"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-6 text-sm text-[#8E9299]">
                                No attachments yet. Add files.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card 4: Updates & Discussion */}
                        <div className="bg-white rounded-xl border border-[#E2E4E9] shadow-sm overflow-hidden p-6 md:p-8">
                          <h3 className="text-base font-bold text-[#1C1F23] mb-6">Updates & Activity</h3>

                          <div className="flex flex-col gap-4 mb-6">
                            {editingRow.updates && editingRow.updates.length > 0 ? (
                              editingRow.updates.map((update: any) => (
                                <div key={update.id} className="bg-[#F9FAFB] rounded-xl p-4 border border-[#E2E4E9] shadow-xs flex flex-col gap-2">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                        style={{ backgroundColor: teamMembers.find(member => member.name === update.author)?.color || getColor(update.author || 'User') }}
                                      >
                                        {teamMembers.find(member => member.name === update.author)?.initials || getInitials(update.author)}
                                      </div>
                                      <span className="font-bold text-xs text-[#1C1F23] truncate">{update.author}</span>
                                    </div>
                                    <span className="text-[10px] font-medium text-[#8E9299]">
                                      {safeFormatDate(update.timestamp)}
                                    </span>
                                  </div>
                                  <p className="text-sm text-[#4A4D53] whitespace-pre-wrap pl-9">{update.text}</p>
                                  {update.attachment && (
                                    <div className="mt-1 ml-9 flex items-center gap-1.5 text-xs text-[#1061E3] bg-blue-50 border border-blue-100 rounded px-2.5 py-1.5 w-fit">
                                      <FileIcon className="w-3.5 h-3.5" />
                                      {update.attachmentUrl ? (
                                        <a
                                          href={update.attachmentUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-semibold hover:underline truncate max-w-[200px]"
                                          title={update.attachment}
                                        >
                                          {update.attachment}
                                        </a>
                                      ) : (
                                        <span className="truncate max-w-[200px] font-semibold">{update.attachment}</span>
                                      )}
                                      {update.attachmentUrl && (
                                        <a
                                          href={update.attachmentUrl}
                                          download={update.attachment}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[#8E9299] hover:text-[#1061E3] ml-1 p-0.5 rounded hover:bg-blue-100 transition-colors flex items-center justify-center shrink-0"
                                          title="Download attachment"
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-6 text-sm text-[#8E9299] border border-dashed border-[#E2E4E9] rounded-xl bg-[#F9FAFB]">
                                No updates posted yet.
                              </div>
                            )}
                          </div>

                          {/* Add Update Input Area */}
                          <div className="flex flex-col gap-3 relative border border-[#E2E4E9] rounded-xl p-3 bg-white focus-within:ring-2 focus-within:ring-[#1061E3] focus-within:border-transparent transition-all">
                            {attachedFile && (
                              <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg p-2 shrink-0">
                                <div className="flex items-center gap-2 text-sm text-[#1061E3]">
                                  <FileIcon className="w-4 h-4" />
                                  <span className="truncate max-w-[250px] font-semibold">{attachedFile.name}</span>
                                </div>
                                <button onClick={() => setAttachedFile(null)} className="text-[#8E9299] hover:text-[#D32F2F] transition-colors"><X className="w-4 h-4" /></button>
                              </div>
                            )}
                            <div className="flex gap-3 items-start relative">
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
                                  placeholder="Post a comment or update (use @ to mention)..."
                                  className="w-full border-none outline-none resize-none text-sm text-[#1C1F23] placeholder:text-[#8E9299] min-h-[60px]"
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

                              {/* Post button */}
                              <button
                                onClick={() => handleAddUpdate(editingRowId)}
                                disabled={(!newUpdateText.trim() && !attachedFile) || isPostingUpdate}
                                className="px-4 py-2 bg-[#1061E3] hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
                              >
                                {isPostingUpdate && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Post
                              </button>
                            </div>

                            {/* Textarea Bottom Action Bar */}
                            <div className="flex gap-2 border-t border-[#F0F2F5] pt-2 mt-1">
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
                          </div>
                        </div>

                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          ) : (
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
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${activeEditTab === tab.id
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
                    const displayCols = [...columns.filter(c => c.id !== 'updatesCount')];
                    if (projectType === 'Support Tickets' || projectType === 'Design & Print') {
                      const extraFields = [
                        { id: 'companyName', header: 'Company Name' },
                        { id: 'contactName', header: 'Contact Name' },
                        { id: 'email', header: 'Contact Email' },
                        { id: 'category', header: 'Category' }
                      ];
                      extraFields.forEach(f => {
                        if (!displayCols.some(c => c.id === f.id)) {
                          displayCols.push(f);
                        }
                      });
                    }
                    return displayCols.map(col => (
                      <div key={col.id}>
                        <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">{col.header}</label>
                        {col.id === 'status' ? (
                          <select
                            value={editingRow?.[col.id] ?? ''}
                            onChange={e => {
                              const patch: any = { [col.id]: e.target.value };
                              if (projectType !== 'SEO') {
                                if (projectType === 'Google Ads') {
                                  patch.groupId = e.target.value === 'Running' ? 'group-running' : 'group-active';
                                } else if (e.target.value === 'Running') {
                                  patch.groupId = 'group-running';
                                } else if (e.target.value === 'Needs Invoiced') {
                                  patch.groupId = 'group-needs-invoiced';
                                } else if (e.target.value === 'S14: Launched' || e.target.value === 'Launched' || e.target.value === 'Done') {
                                  patch.groupId = 'group-completed';
                                } else if (editingRow.groupId === 'group-needs-invoiced' || editingRow.groupId === 'group-completed' || editingRow.groupId === 'group-running') {
                                  patch.groupId = projectType === 'Local Listings' ? 'group-setup' : projectType === 'Social Media' ? 'group-smm' : 'group-active';
                                  }
                              }
                              handleUpdateRow(editingRowId, patch);
                            }}
                            className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                          >
                            {(editingRow?.parentId
                               ? (projectType === 'Local Listings'
                                 ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done', 'Down']
                                 : projectType === 'Social Media'
                                   ? ['Not Started', 'Setup', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'Running', 'On Hold', 'Done']
                                   : ['Not Started', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'On Hold', 'Done'])
                               : statusOptions
                             ).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : col.id === 'priority' ? (
                          <select
                            value={editingRow?.[col.id] ?? ''}
                            onChange={e => {
                              handleUpdateRow(editingRowId, { [col.id]: e.target.value });
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
                              handleUpdateRow(editingRowId, { [col.id]: e.target.value });
                            }}
                            className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent bg-white"
                          >
                            <option value="Basic Plan">Basic Plan</option>
                            <option value="Plus Plan">Plus Plan</option>
                          </select>
                        ) : col.id === 'billableHours' ? (
                          <BillableHoursDropdown
                            value={editingRow?.[col.id] || ''}
                            onChange={(newVal) => handleUpdateRow(editingRowId, { [col.id]: newVal })}
                            customLabels={customBillableHours}
                            onCreateLabel={handleCreateBillableHour}
                          />
                        ) : col.id === 'assignee' ? (
                          <div className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md bg-white">
                            <AssigneeDropdown
                              values={editingRow?.assignees || (editingRow?.[col.id] ? [editingRow[col.id]] : [])}
                              onSaveMultiple={(newVals) => {
                                handleUpdateRow(editingRowId, {
                                  assignees: newVals,
                                  assignee: newVals[0] || ''
                                });
                              }}
                              teamMembers={teamMembers}
                            />
                          </div>
                        ) : (
                          <input
                            type={col.id === 'deadline' ? 'date' : 'text'}
                            value={editingRow?.[col.id] ?? ''}
                            onChange={e => {
                              handleUpdateRow(editingRowId, { [col.id]: e.target.value });
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
                        <RichTextEditor
                          value={editingRow?.description ?? ''}
                          onChange={val => {
                            handleUpdateRow(editingRowId, { description: val });
                          }}
                          placeholder={`Add a description for this ${projectType.toLowerCase()} project...`}
                          minHeight="280px"
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
                                  {safeFormatDate(update.timestamp)}
                                </span>
                              </div>
                              <p className="text-sm text-[#4A4D53] whitespace-pre-wrap">{update.text}</p>
                              {update.attachment && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#1061E3] bg-blue-50 border border-blue-100 rounded px-2 py-1 w-fit">
                                  <FileIcon className="w-3.5 h-3.5" />
                                  {update.attachmentUrl ? (
                                    <a
                                      href={update.attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold hover:underline truncate max-w-[200px]"
                                      title={update.attachment}
                                    >
                                      {update.attachment}
                                    </a>
                                  ) : (
                                    <span className="truncate max-w-[200px] font-semibold">{update.attachment}</span>
                                  )}
                                  {update.attachmentUrl && (
                                    <a
                                      href={update.attachmentUrl}
                                      download={update.attachment}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#8E9299] hover:text-[#1061E3] ml-1 p-0.5 rounded hover:bg-blue-100 transition-colors flex items-center justify-center shrink-0"
                                      title="Download attachment"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  )}
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
                            disabled={(!newUpdateText.trim() && !attachedFile) || isPostingUpdate}
                            className="px-4 py-2 h-[80px] bg-[#1061E3] text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center gap-1.5"
                          >
                            {isPostingUpdate && <Loader2 className="w-4 h-4 animate-spin" />}
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
                                  e.target.value = ''; // Reset input to allow selecting same file again
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
                        {(editingRow?.files && editingRow.files.length > 0) || Object.keys(fileUploadProgress).length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {Object.entries(fileUploadProgress).map(([name, progress]) => (
                              <div key={name} className="flex items-center justify-between p-3 border border-[#E2E4E9] rounded-lg bg-[#F9FAFB]">
                                <div className="flex items-center gap-3 min-w-0 flex-grow">
                                  <div className="p-2 bg-white border border-[#E2E4E9] rounded-md text-[#1061E3]">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                  </div>
                                  <div className="flex-grow min-w-0">
                                    <div className="text-sm font-medium text-[#1C1F23] truncate mb-1">{name}</div>
                                    <div className="h-1.5 w-full bg-[#E3F2FD] rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-[#1061E3] transition-all duration-300 ease-out"
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {editingRow?.files && editingRow.files.map((file: any) => (
                              <div key={file.id} className="flex items-center justify-between p-3 border border-[#E2E4E9] rounded-lg bg-[#F9FAFB] group/file">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="p-2 bg-white border border-[#E2E4E9] rounded-md text-[#8E9299]">
                                    <FileIcon className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    {file.url ? (
                                      <a
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-semibold text-[#1061E3] hover:text-blue-700 hover:underline transition-colors truncate block max-w-[200px]"
                                        title={file.name}
                                      >
                                        {file.name}
                                      </a>
                                    ) : (
                                      <p className="text-sm font-medium text-[#1C1F23] truncate block max-w-[200px]" title={file.name}>
                                        {file.name}
                                      </p>
                                    )}
                                    <p className="text-[11px] text-[#8E9299]">
                                      {safeFormatDate(file.uploadedAt)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {file.url && (
                                    <a
                                      href={file.url}
                                      download={file.name}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 text-[#8E9299] hover:text-[#1061E3] hover:bg-blue-50 rounded transition-colors"
                                      title="Download File"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveProjectFile(editingRowId, file.id)}
                                    className="p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors"
                                    title="Remove File"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
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
                <div className="p-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex justify-between items-center shrink-0">
                  <button
                    onClick={() => {
                      setRowToDeleteId(editingRowId);
                      setEditingRowId(null);
                    }}
                    className="px-4 py-2 rounded-md text-sm font-semibold text-[#D32F2F] hover:bg-[#FEE2E2] transition-colors flex items-center gap-2 border border-[#D32F2F]/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                  <button
                    onClick={() => setEditingRowId(null)}
                    className="px-4 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </div>
          )
        )}
      </AnimatePresence>

      {/* Bulk Multi-Select Floating Bar */}
      <AnimatePresence>
        {selectedRowIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1C1F23]/95 backdrop-blur-md text-white px-6 py-3.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.25)] border border-white/10 flex items-center gap-6 select-none"
          >
            {/* Selected Count */}
            <div className="flex items-center gap-3 pr-4 border-r border-white/10">
              <span className="w-6 h-6 rounded-full bg-[#1061E3] flex items-center justify-center font-bold text-xs">
                {selectedRowIds.size}
              </span>
              <span className="text-sm font-semibold tracking-wide">
                {selectedRowIds.size === 1 ? 'row selected' : 'rows selected'}
              </span>
            </div>

            {/* Actions */}
            {(() => {
              const hasStartDateColumn = columns.some(c => 
                c.id === 'startDate' || 
                c.id === 'start_date' || 
                c.header.toLowerCase() === 'start date' || 
                c.header.toLowerCase() === 'start'
              );

              const hasDeadlineColumn = columns.some(c => 
                c.id === 'deadline' || 
                c.id === 'due_date' || 
                c.id === 'dueDate' || 
                c.header.toLowerCase() === 'deadline' || 
                c.header.toLowerCase() === 'due date'
              );

              return (
                <div className="flex items-center gap-2">
                  {/* Move to Group Button with Dropdown Popover */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setActiveBulkGroupDropdown(prev => !prev);
                        setActiveBulkStatusDropdown(false);
                        setActiveBulkAssigneeDropdown(false);
                        setActiveBulkStartDateDropdown(false);
                        setActiveBulkDeadlineDropdown(false);
                      }}
                      className="flex items-center gap-2 text-xs font-bold hover:bg-white/10 px-4 py-2 rounded-lg transition-all border border-white/5 active:scale-95 text-gray-200"
                    >
                      <ArrowRight className="w-4 h-4 text-blue-400" />
                      Move to
                    </button>

                    {/* Custom Sleek Dropdown */}
                    <AnimatePresence>
                      {activeBulkGroupDropdown && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActiveBulkGroupDropdown(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full mb-2 left-0 z-50 w-48 bg-[#1C1F23] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1.5 flex flex-col gap-0.5"
                          >
                            <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 mb-1">
                              Select Group
                            </div>
                            {groups.map(group => (
                              <button
                                key={group.id}
                                onClick={() => {
                                  handleBulkMoveSelected(group.id);
                                  setActiveBulkGroupDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-white/5 text-gray-200 transition-colors flex items-center justify-between"
                              >
                                <span>{group.name}</span>
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Change Status Button with Dropdown Popover */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setActiveBulkStatusDropdown(prev => !prev);
                        setActiveBulkGroupDropdown(false);
                        setActiveBulkAssigneeDropdown(false);
                        setActiveBulkStartDateDropdown(false);
                        setActiveBulkDeadlineDropdown(false);
                      }}
                      className="flex items-center gap-2 text-xs font-bold hover:bg-white/10 px-4 py-2 rounded-lg transition-all border border-white/5 active:scale-95 text-gray-200"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Status
                    </button>

                    <AnimatePresence>
                      {activeBulkStatusDropdown && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActiveBulkStatusDropdown(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full mb-2 left-0 z-50 w-48 bg-[#1C1F23] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1.5 flex flex-col gap-0.5"
                          >
                            <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 mb-1">
                              Select Status
                            </div>
                            {statusOptions.map(opt => (
                              <button
                                key={opt}
                                onClick={() => {
                                  handleBulkStatusSelected(opt);
                                  setActiveBulkStatusDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-white/5 text-gray-200 transition-colors flex items-center justify-between"
                              >
                                <span>{opt}</span>
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Set Assignee Button with Dropdown Popover */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setActiveBulkAssigneeDropdown(prev => !prev);
                        setActiveBulkGroupDropdown(false);
                        setActiveBulkStatusDropdown(false);
                        setActiveBulkStartDateDropdown(false);
                        setActiveBulkDeadlineDropdown(false);
                      }}
                      className="flex items-center gap-2 text-xs font-bold hover:bg-white/10 px-4 py-2 rounded-lg transition-all border border-white/5 active:scale-95 text-gray-200"
                    >
                      <AtSign className="w-4 h-4 text-indigo-400" />
                      Assignee
                    </button>

                    <AnimatePresence>
                      {activeBulkAssigneeDropdown && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActiveBulkAssigneeDropdown(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full mb-2 left-0 z-50 w-48 bg-[#1C1F23] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1.5 flex flex-col gap-0.5"
                          >
                            <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 mb-1">
                              Select Assignee
                            </div>
                            <button
                              onClick={() => {
                                handleBulkAssigneeSelected('');
                                setActiveBulkAssigneeDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-red-500/10 text-red-400 border-b border-white/5 transition-colors"
                            >
                              Clear Assignee
                            </button>
                            {teamMembers.map(member => (
                              <button
                                key={member.id}
                                onClick={() => {
                                  handleBulkAssigneeSelected(member.id);
                                  setActiveBulkAssigneeDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-white/5 text-gray-200 transition-colors flex items-center gap-2"
                              >
                                <div
                                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                                  style={{ backgroundColor: member.color }}
                                >
                                  {member.initials}
                                </div>
                                <span className="truncate">{member.name}</span>
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Start Date Button with Popover */}
                  {hasStartDateColumn && (
                    <div className="relative">
                      <button
                        onClick={() => {
                          setActiveBulkStartDateDropdown(prev => !prev);
                          setActiveBulkDeadlineDropdown(false);
                          setActiveBulkGroupDropdown(false);
                          setActiveBulkStatusDropdown(false);
                          setActiveBulkAssigneeDropdown(false);
                        }}
                        className="flex items-center gap-2 text-xs font-bold hover:bg-white/10 px-4 py-2 rounded-lg transition-all border border-white/5 active:scale-95 text-gray-200"
                      >
                        <Calendar className="w-4 h-4 text-amber-400" />
                        Start Date
                      </button>

                      <AnimatePresence>
                        {activeBulkStartDateDropdown && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActiveBulkStartDateDropdown(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute bottom-full mb-2 left-0 z-50 w-56 bg-[#1C1F23] border border-white/10 rounded-xl shadow-2xl p-3 flex flex-col gap-2.5"
                            >
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 pb-1">
                                Set Start Date
                              </div>
                              <input
                                type="date"
                                value={bulkStartDateValue}
                                onChange={(e) => setBulkStartDateValue(e.target.value)}
                                className="w-full bg-[#2A2E35] border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-[#1061E3] color-scheme-dark"
                                style={{ colorScheme: 'dark' }}
                              />
                              <div className="flex gap-2 justify-end mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleBulkDateUpdate('startDate', '');
                                    setBulkStartDateValue('');
                                    setActiveBulkStartDateDropdown(false);
                                  }}
                                  className="px-2.5 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleBulkDateUpdate('startDate', bulkStartDateValue);
                                    setActiveBulkStartDateDropdown(false);
                                  }}
                                  className="px-2.5 py-1 text-[10px] font-bold bg-[#1061E3] text-white hover:bg-[#1061E3]/95 rounded transition-colors"
                                >
                                  Apply
                                </button>
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Due Date Button with Popover */}
                  {hasDeadlineColumn && (
                    <div className="relative">
                      <button
                        onClick={() => {
                          setActiveBulkDeadlineDropdown(prev => !prev);
                          setActiveBulkStartDateDropdown(false);
                          setActiveBulkGroupDropdown(false);
                          setActiveBulkStatusDropdown(false);
                          setActiveBulkAssigneeDropdown(false);
                        }}
                        className="flex items-center gap-2 text-xs font-bold hover:bg-white/10 px-4 py-2 rounded-lg transition-all border border-white/5 active:scale-95 text-gray-200"
                      >
                        <Calendar className="w-4 h-4 text-rose-400" />
                        Due Date
                      </button>

                      <AnimatePresence>
                        {activeBulkDeadlineDropdown && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActiveBulkDeadlineDropdown(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute bottom-full mb-2 left-0 z-50 w-56 bg-[#1C1F23] border border-white/10 rounded-xl shadow-2xl p-3 flex flex-col gap-2.5"
                            >
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 pb-1">
                                Set Due Date
                              </div>
                              <input
                                type="date"
                                value={bulkDeadlineValue}
                                onChange={(e) => setBulkDeadlineValue(e.target.value)}
                                className="w-full bg-[#2A2E35] border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-[#1061E3] color-scheme-dark"
                                style={{ colorScheme: 'dark' }}
                              />
                              <div className="flex gap-2 justify-end mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleBulkDateUpdate('deadline', '');
                                    setBulkDeadlineValue('');
                                    setActiveBulkDeadlineDropdown(false);
                                  }}
                                  className="px-2.5 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleBulkDateUpdate('deadline', bulkDeadlineValue);
                                    setActiveBulkDeadlineDropdown(false);
                                  }}
                                  className="px-2.5 py-1 text-[10px] font-bold bg-[#1061E3] text-white hover:bg-[#1061E3]/95 rounded transition-colors"
                                >
                                  Apply
                                </button>
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Delete Button */}
                  <button
                    onClick={handleBulkDeleteSelected}
                    className="flex items-center gap-2 text-xs font-bold hover:bg-red-500/10 hover:text-red-400 text-red-500 px-4 py-2 rounded-lg transition-all border border-red-500/10 active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              );
            })()}

            {/* Clear / Dismiss Selection */}
            <button
              onClick={handleClearSelection}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all active:scale-95"
              title="Clear Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <TicketImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        teamMembers={teamMembers}
        companies={companies}
        workspace={projectType}
        groups={groups}
        existingTickets={data}
      />

      {activeCommentsRowId && (() => {
        const row = data.find(r => r.id === activeCommentsRowId);
        if (!row) return null;
        return createPortal(
          <div
            className="fixed z-[9999] w-72 bg-white border border-[#E2E4E9] rounded-xl shadow-xl p-4 flex flex-col gap-3 font-sans"
            style={{ top: commentsPopoverPosition.top, left: commentsPopoverPosition.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-[#F0F2F5]">
              <span className="font-bold text-xs text-[#1C1F23] uppercase tracking-wider">Leave Update</span>
              <button
                type="button"
                onClick={() => setActiveCommentsRowId(null)}
                className="text-[#8E9299] hover:text-[#1C1F23] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {row.updates && row.updates.length > 0 && (
              <div className="max-h-36 overflow-y-auto flex flex-col gap-2 pr-1 border-b border-[#F0F2F5] pb-2">
                {row.updates.slice().reverse().slice(0, 3).reverse().map((update: any) => (
                  <div key={update.id} className="text-xs bg-[#F9FAFB] rounded-lg p-2 border border-[#E2E4E9] flex flex-col gap-1">
                    <div className="flex justify-between items-center font-semibold text-[#1C1F23]">
                      <span className="truncate max-w-[120px]">{update.author}</span>
                      <span className="text-[9px] text-[#8E9299]">
                        {safeFormatDate(update.timestamp)}
                      </span>
                    </div>
                    <p className="text-[#4A4D53] whitespace-pre-wrap">{update.text}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <textarea
                ref={quickUpdateTextareaRef}
                autoFocus
                value={quickUpdateText}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuickUpdateText(val);

                  // Mentions logic
                  const cursorP = e.target.selectionStart;
                  const textToCursor = val.slice(0, cursorP);
                  const match = textToCursor.match(/@(\w*)$/);
                  if (match) {
                    setQuickMentionFilter(match[1]);
                    setShowQuickMentionMenu(true);
                    setQuickMentionIndex(0);
                  } else {
                    setShowQuickMentionMenu(false);
                  }
                }}
                placeholder="Type an update or comment (use @ to mention)..."
                className="w-full border border-[#E2E4E9] rounded-lg p-2.5 text-xs text-[#1C1F23] placeholder:text-[#8E9299] min-h-[60px] focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent resize-none"
                onKeyDown={(e) => {
                  if (showQuickMentionMenu) {
                    const filteredMembers = teamMembers.filter(m => m.name.toLowerCase().includes(quickMentionFilter.toLowerCase()));
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setQuickMentionIndex(prev => (prev + 1) % filteredMembers.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setQuickMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredMembers.length > 0) {
                        const member = filteredMembers[quickMentionIndex];
                        const cursorP = quickUpdateTextareaRef.current?.selectionStart || 0;
                        const textToCursor = quickUpdateText.slice(0, cursorP);
                        const textAfterCursor = quickUpdateText.slice(cursorP);
                        const newText = textToCursor.replace(/@\w*$/, `@${member.name} `) + textAfterCursor;
                        setQuickUpdateText(newText);
                        setShowQuickMentionMenu(false);
                        quickUpdateTextareaRef.current?.focus();
                      }
                    } else if (e.key === 'Escape') {
                      setShowQuickMentionMenu(false);
                    }
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleQuickAddUpdate(row.id);
                  } else if (e.key === 'Escape') {
                    setActiveCommentsRowId(null);
                  }
                }}
              />
              {/* Quick Mention Menu */}
              {showQuickMentionMenu && (
                <div className="absolute z-[10000] bottom-full mb-1 left-0 w-48 bg-white border border-[#E2E4E9] rounded-md shadow-lg overflow-hidden py-1">
                  {teamMembers.filter(m => m.name.toLowerCase().includes(quickMentionFilter.toLowerCase())).length > 0 ? (
                    teamMembers.filter(m => m.name.toLowerCase().includes(quickMentionFilter.toLowerCase())).map((member, i) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          const cursorP = quickUpdateTextareaRef.current?.selectionStart || 0;
                          const textToCursor = quickUpdateText.slice(0, cursorP);
                          const textAfterCursor = quickUpdateText.slice(cursorP);
                          const newText = textToCursor.replace(/@\w*$/, `@${member.name} `) + textAfterCursor;
                          setQuickUpdateText(newText);
                          setShowQuickMentionMenu(false);
                          quickUpdateTextareaRef.current?.focus();
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${i === quickMentionIndex ? 'bg-[#F0F2F5] text-[#1061E3]' : 'text-[#1C1F23] hover:bg-gray-50'}`}
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

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveCommentsRowId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!quickUpdateText.trim()}
                onClick={() => handleQuickAddUpdate(row.id)}
                className="px-3 py-1.5 bg-[#1061E3] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                Post
              </button>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
