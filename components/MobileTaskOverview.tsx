'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, ListTree, Plus, Trash2 } from 'lucide-react';
import { getStatusBadgeClasses, type Ticket } from './Shared';

export default function MobileTaskOverview({ row, primaryFields, extraFields, subtasks, onOpenTask, onAddSubtask, onDescription, onDelete }: {
  row: Ticket;
  primaryFields: ReactNode;
  extraFields: ReactNode;
  subtasks: Ticket[];
  onOpenTask: (id: string) => void;
  onAddSubtask: () => void;
  onDescription: () => void;
  onDelete?: () => void;
}) {
  const description = (row.description || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  return <div className="mobile-task-overview space-y-4">
    <div className="grid grid-cols-2 gap-3">{primaryFields}</div>
    <section className="rounded-2xl border border-[#E8EBF0] bg-white p-4" aria-label="Subtasks">
      <div className="flex items-center gap-2">
        <ListTree size={17} className="text-[#777E8A]" />
        <h3 className="flex-1 text-sm font-semibold">Subtasks <span className="ml-1 font-normal text-[#777E8A]">{subtasks.length}</span></h3>
        <button type="button" onClick={onAddSubtask} aria-label="Add subtask" title="Add subtask" className="flex h-11 w-11 items-center justify-center rounded-xl text-[#1061E3] active:bg-blue-50"><Plus size={20} /></button>
      </div>
      {subtasks.length ? <ul className="divide-y divide-[#F0F2F5]">
        {subtasks.map(subtask => <li key={subtask.id}><button type="button" onClick={() => onOpenTask(subtask.id)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
          <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{subtask.projectName || 'Untitled subtask'}</span>
          <span className={`max-w-[40%] truncate rounded-md px-2 py-1 text-[10px] ${getStatusBadgeClasses(subtask.status || 'Not Started')}`}>{subtask.status || 'Not Started'}</span>
          <ChevronRight size={15} className="shrink-0 text-[#777E8A]" />
        </button></li>)}
      </ul> : <p className="text-xs text-[#777E8A]">No subtasks yet.</p>}
    </section>
    <button type="button" onClick={onDescription} className="w-full rounded-2xl border border-[#E8EBF0] bg-white p-4 text-left">
      <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={17} className="text-[#777E8A]" />Description<ChevronRight size={15} className="ml-auto text-[#777E8A]" /></span>
      <span className="mt-2 block line-clamp-3 text-sm leading-6 text-[#777E8A]">{description || 'Add a description…'}</span>
    </button>
    <details className="rounded-2xl border border-[#E8EBF0] bg-white">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">More details<ChevronDown size={16} className="text-[#777E8A]" /></summary>
      <div className="space-y-4 border-t border-[#F0F2F5] p-4">{extraFields}
        {onDelete && <button type="button" onClick={onDelete} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-red-700"><Trash2 size={16} />Delete task</button>}
      </div>
    </details>
  </div>;
}
