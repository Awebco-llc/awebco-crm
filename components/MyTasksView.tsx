'use client';

import React from 'react';
import { Company, Contact, TeamMember } from './Shared';

export default function MyTasksView({
  teamMembers,
  companies,
  contacts,
  currentUserId
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  contacts: Contact[],
  currentUserId: string | undefined
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

  // Aggregate tasks from different areas. For now we use Companies, Contacts and maybe other static project rows if we passed them down, 
  // but Workspace/SocialMedia are tightly coupled inside their own components right now. 
  // We will show assigned Contacts and Companies as tasks.
  const myContacts = contacts.filter(c => c.assignedToId === currentUserId);
  const myCompanies = companies.filter(c => c.assignedToId === currentUserId);

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center px-6 shrink-0">
        <h1 className="text-xl font-bold text-[#1C1F23]">My Tasks</h1>
      </header>
      <div className="flex-grow p-6 overflow-auto">
        
        <div className="mb-8">
          <h2 className="text-lg font-bold text-[#1C1F23] mb-4">Assigned Active Leads & Contacts</h2>
          {myContacts.length === 0 ? (
            <p className="text-sm text-[#8E9299]">You have no assigned contacts.</p>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#E2E4E9]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">NAME</th>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY</th>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {myContacts.map(c => (
                    <tr key={c.id} className="border-b border-[#F0F2F5] hover:bg-gray-50">
                      <td className="px-4 py-3 text-[13px] font-medium text-[#1C1F23]">{c.firstName} {c.lastName}</td>
                      <td className="px-4 py-3 text-[13px] text-[#8E9299]">
                        {companies.find(comp => comp.id === c.companyId)?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                          c.status === 'Lead' ? 'bg-[#FFEBEB] text-[#D32F2F]' : 'bg-[#ECFDF3] text-[#10B981]'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold text-[#1C1F23] mb-4">Assigned Companies</h2>
          {myCompanies.length === 0 ? (
            <p className="text-sm text-[#8E9299]">You have no assigned companies.</p>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#E2E4E9]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">COMPANY NAME</th>
                    <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">SERVICES NEEDED</th>
                  </tr>
                </thead>
                <tbody>
                  {myCompanies.map(c => (
                    <tr key={c.id} className="border-b border-[#F0F2F5] hover:bg-gray-50">
                      <td className="px-4 py-3 text-[13px] font-medium text-[#1C1F23]">{c.name}</td>
                      <td className="px-4 py-3 text-[13px] text-[#8E9299]">{c.servicesNeeded || '-'}</td>
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
