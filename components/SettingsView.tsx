import React, { useState } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { TeamMember } from '@/components/Shared';

export default function SettingsView({ teamMembers, setTeamMembers }: { teamMembers: TeamMember[], setTeamMembers: (members: TeamMember[]) => void }) {
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberColor, setNewMemberColor] = useState('#1061E3');

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const initials = newMemberName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const newMember: TeamMember = {
      id: Math.random().toString(36).substring(2, 9),
      name: newMemberName,
      initials,
      color: newMemberColor,
    };

    setTeamMembers([...teamMembers, newMember]);
    setNewMemberName('');
  };

  const handleRemoveMember = (id: string) => {
    setTeamMembers(teamMembers.filter(m => m.id !== id));
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <div className="p-8 max-w-4xl mx-auto w-full overflow-y-auto h-full">
        <h1 className="text-2xl font-bold text-[#1C1F23] mb-8">Settings</h1>

        <div className="bg-white rounded-xl shadow-sm border border-[#E2E4E9] overflow-hidden mb-8">
          <div className="px-6 py-5 border-b border-[#E2E4E9]">
            <h2 className="text-lg font-semibold text-[#1C1F23]">Team Members</h2>
            <p className="text-sm text-[#8E9299] mt-1">Manage the team members available for assignment.</p>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {teamMembers.map(member => (
                <div key={member.id} className="flex items-center justify-between p-4 border border-[#E2E4E9] rounded-lg bg-[#F9FAFB]">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full inline-flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-[#1C1F23] text-sm">{member.name}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveMember(member.id)}
                    className="text-[#8E9299] hover:text-[#D32F2F] transition-colors p-2"
                    title="Remove Member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-semibold text-[#4A4D53] mb-4">Add New Member</h3>
            <form onSubmit={handleAddMember} className="flex items-end gap-4 max-w-md">
              <div className="flex-grow">
                <label className="block text-xs font-semibold text-[#8E9299] mb-1.5 uppercase tracking-wider">Full Name</label>
                <input 
                  required
                  type="text" 
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                  placeholder="e.g. Alex Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8E9299] mb-1.5 uppercase tracking-wider">Color</label>
                <input 
                  type="color" 
                  value={newMemberColor}
                  onChange={e => setNewMemberColor(e.target.value)}
                  className="w-10 h-[38px] p-1 border border-[#E2E4E9] rounded-md cursor-pointer"
                />
              </div>
              <button 
                type="submit"
                className="px-4 py-[9px] rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2 h-[38px]"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
