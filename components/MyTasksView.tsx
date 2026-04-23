'use client';

import React from 'react';
import { Company, Contact, TeamMember } from './Shared';

const WORKSPACE_SERVICES: Array<{ key: keyof Company; label: string }> = [
  { key: 'web', label: 'Websites' },
  { key: 'dp', label: 'Design & Print' },
  { key: 'seo', label: 'SEO' },
  { key: 'll', label: 'Local Listings' },
  { key: 'ppc', label: 'Google Ads' },
  { key: 'smm', label: 'Social Media Management' },
  { key: 'sma', label: 'Social Media Ads' },
  { key: 'support', label: 'Support Tickets' },
];

function formatDeadline(value?: string) {
  if (!value) return '-';

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function getWorkspaceTasks(companies: Company[], currentUserId: string) {
  return companies
    .filter(company => company.assignedToId === currentUserId)
    .flatMap(company =>
      WORKSPACE_SERVICES
        .filter(service => Boolean(company[service.key]))
        .map(service => ({
          id: `${company.id}-${String(service.key)}`,
          companyName: company.name,
          workspace: service.label,
          navName: service.key === 'smm' || service.key === 'sma' ? 'Social Media' : service.label,
          rowId: service.key === 'smm' || service.key === 'sma' ? `${company.id}-${String(service.key)}` : company.id,
          status: company.deadline ? 'Scheduled' : 'Pending',
          deadline: company.deadline,
        }))
    );
}

export default function MyTasksView({
  companies,
  currentUserId,
  onOpenTask
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  contacts: Contact[],
  currentUserId: string | undefined,
  onOpenTask?: (navName: string, rowId: string) => void
}) {
  if (!currentUserId) {
    return (
      <div className="flex-grow flex items-center justify-center bg-gray-50">
        <div className="p-8 bg-white rounded-lg border border-[#E2E4E9] text-center max-w-sm">
          <h2 className="text-xl font-bold text-[#1C1F23] mb-2">No Matching Profile</h2>
          <p className="text-sm text-[#8E9299]">
            Your email doesn&apos;t match any team member in the system. Contact an admin to add you.
          </p>
        </div>
      </div>
    );
  }

  const workspaceTasks = getWorkspaceTasks(companies, currentUserId);

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center px-6 shrink-0">
        <h1 className="text-xl font-bold text-[#1C1F23]">My Tasks</h1>
      </header>
      <div className="flex-grow p-6 overflow-auto">
        <div>
          <h2 className="text-lg font-bold text-[#1C1F23] mb-4">Assigned Workspace Items</h2>
          {workspaceTasks.length === 0 ? (
            <p className="text-sm text-[#8E9299]">You have no assigned workspace items.</p>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#E2E4E9]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY</th>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">WORKSPACE</th>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">STATUS</th>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DEADLINE</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaceTasks.map(task => (
                    <tr
                      key={task.id}
                      className="border-b border-[#F0F2F5] hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => onOpenTask?.(task.navName, task.rowId)}
                    >
                      <td className="px-4 py-3 text-[13px] font-medium text-[#1C1F23]">{task.companyName}</td>
                      <td className="px-4 py-3 text-[13px] text-[#8E9299]">{task.workspace}</td>
                      <td className="px-4 py-3 text-[13px]">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                          task.status === 'Scheduled' ? 'bg-[#E3F2FD] text-[#1976D2]' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#8E9299]">{formatDeadline(task.deadline)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
