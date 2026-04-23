import React, { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { TeamMember } from '@/components/Shared';

const formatRole = (role?: TeamMember['role']) => {
  if (role === 'master_admin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'freelancer') return 'Freelancer';
  return 'Staff';
};

type WorkspaceBoardMemberships = Record<string, string[]>;

export default function SettingsView({
  teamMembers,
  setTeamMembers,
  setBoardMemberships,
  currentUserRole,
}: {
  teamMembers: TeamMember[],
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>,
  setBoardMemberships: React.Dispatch<React.SetStateAction<WorkspaceBoardMemberships>>,
  currentUserRole?: TeamMember['role'],
}) {
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<TeamMember['role']>('staff');
  const [newMemberColor, setNewMemberColor] = useState('#1061E3');
  const [newMemberPhotoUrl, setNewMemberPhotoUrl] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberEmail, setEditMemberEmail] = useState('');
  const [editMemberRole, setEditMemberRole] = useState<TeamMember['role']>('staff');
  const [editMemberPassword, setEditMemberPassword] = useState('');
  const [editMemberColor, setEditMemberColor] = useState('#1061E3');
  const canEditProfiles = currentUserRole === 'master_admin';

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const initials = newMemberName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const newMember: TeamMember = {
      id: Math.random().toString(36).substring(2, 9),
      name: newMemberName,
      initials,
      color: newMemberColor,
      role: newMemberRole,
      email: newMemberEmail.trim() || undefined,
      password: newMemberPassword || 'changeme',
      photoUrl: newMemberPhotoUrl || undefined,
    };

    setTeamMembers([...teamMembers, newMember]);
    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberRole('staff');
    setNewMemberPassword('');
    setNewMemberPhotoUrl('');
  };

  const handlePhotoChange = (file?: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setNewMemberPhotoUrl(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveMember = (id: string) => {
    const member = teamMembers.find(m => m.id === id);
    if (member?.role === 'master_admin') {
      window.alert('The master admin cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete ${member?.name || 'this user'}?`);
    if (!confirmed) return;

    setTeamMembers(teamMembers.filter(m => m.id !== id));
    setBoardMemberships(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(board => {
        next[board] = next[board].filter(memberId => memberId !== id);
      });
      return next;
    });
  };

  const startEditMember = (member: TeamMember) => {
    setEditingMemberId(member.id);
    setEditMemberName(member.name);
    setEditMemberEmail(member.email || '');
    setEditMemberRole(member.role || 'staff');
    setEditMemberPassword(member.password || '');
    setEditMemberColor(member.color);
  };

  const saveEditMember = () => {
    if (!editingMemberId || !editMemberName.trim()) return;

    setTeamMembers(prev => prev.map(member => {
      if (member.id !== editingMemberId) return member;

      const role = member.role === 'master_admin' ? 'master_admin' : editMemberRole;
      const initials = editMemberName.split(' ').map(namePart => namePart[0]).join('').substring(0, 2).toUpperCase();

      return {
        ...member,
        name: editMemberName,
        initials,
        email: editMemberEmail.trim() || undefined,
        role,
        password: editMemberPassword,
        color: editMemberColor,
      };
    }));
    setEditingMemberId(null);
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
                  {editingMemberId === member.id ? (
                    <div className="w-full flex flex-col gap-3">
                      <input
                        type="text"
                        value={editMemberName}
                        onChange={e => setEditMemberName(e.target.value)}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]"
                      />
                      <input
                        type="email"
                        value={editMemberEmail}
                        onChange={e => setEditMemberEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]"
                        placeholder="Email"
                      />
                      <input
                        type="text"
                        value={editMemberPassword}
                        onChange={e => setEditMemberPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]"
                        placeholder="Password"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={editMemberRole}
                          onChange={e => setEditMemberRole(e.target.value as TeamMember['role'])}
                          disabled={member.role === 'master_admin'}
                          className="flex-1 h-[38px] px-3 border border-[#E2E4E9] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] disabled:opacity-50"
                        >
                          <option value="admin">Admin</option>
                          <option value="staff">Staff</option>
                          <option value="freelancer">Freelancer</option>
                        </select>
                        <input
                          type="color"
                          value={editMemberColor}
                          onChange={e => setEditMemberColor(e.target.value)}
                          className="w-10 h-[38px] p-1 border border-[#E2E4E9] rounded-md cursor-pointer"
                        />
                        <button type="button" onClick={saveEditMember} className="p-2 text-[#1061E3] hover:bg-blue-50 rounded">
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setEditingMemberId(null)} className="p-2 text-[#8E9299] hover:bg-gray-100 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  <div className="flex items-center gap-3">
                    {member.photoUrl ? (
                      <div
                        aria-label={member.name}
                        className="w-10 h-10 rounded-full bg-cover bg-center border border-[#E2E4E9]"
                        style={{ backgroundImage: `url(${member.photoUrl})` }}
                      />
                    ) : (
                      <div 
                        className="w-10 h-10 rounded-full inline-flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: member.color }}
                      >
                        {member.initials}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-[#1C1F23] text-sm">{member.name}</div>
                      <div className="text-[11px] font-semibold text-[#1061E3] uppercase tracking-wider">{formatRole(member.role)}</div>
                      {member.email && (
                        <div className="text-xs text-[#8E9299] truncate max-w-[150px]">{member.email}</div>
                      )}
                    </div>
                  </div>
                  {canEditProfiles && (
                    <div className="flex items-center">
                      <button
                        onClick={() => startEditMember(member)}
                        className="text-[#8E9299] hover:text-[#1061E3] transition-colors p-2"
                        title="Edit Member"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-[#8E9299] hover:text-[#D32F2F] transition-colors p-2"
                        title="Remove Member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {canEditProfiles ? (
              <>
            <h3 className="text-sm font-semibold text-[#4A4D53] mb-4">Add New Member</h3>
            <form onSubmit={handleAddMember} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] items-end gap-4 max-w-5xl">
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
              <div className="flex-grow">
                <label className="block text-xs font-semibold text-[#8E9299] mb-1.5 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                  placeholder="alex@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8E9299] mb-1.5 uppercase tracking-wider">Role</label>
                <select
                  value={newMemberRole}
                  onChange={e => setNewMemberRole(e.target.value as TeamMember['role'])}
                  className="h-[38px] px-3 border border-[#E2E4E9] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                >
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                  <option value="freelancer">Freelancer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8E9299] mb-1.5 uppercase tracking-wider">Photo</label>
                <label className="h-[38px] px-3 rounded-md border border-[#E2E4E9] bg-white text-sm font-semibold text-[#4A4D53] hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-2">
                  {newMemberPhotoUrl ? (
                    <span
                      aria-label="New member preview"
                      className="w-6 h-6 rounded-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${newMemberPhotoUrl})` }}
                    />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-[#F0F2F5] inline-flex items-center justify-center text-[#8E9299] text-xs">+</span>
                  )}
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handlePhotoChange(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div className="flex-grow">
                <label className="block text-xs font-semibold text-[#8E9299] mb-1.5 uppercase tracking-wider">Password</label>
                <input
                  type="text"
                  value={newMemberPassword}
                  onChange={e => setNewMemberPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] focus:border-transparent"
                  placeholder="Defaults to changeme"
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
            {newMemberPhotoUrl && (
              <button
                type="button"
                onClick={() => setNewMemberPhotoUrl('')}
                className="mt-3 text-xs font-semibold text-[#8E9299] hover:text-[#D32F2F] transition-colors"
              >
                Remove selected photo
              </button>
            )}
              </>
            ) : (
              <p className="text-sm text-[#8E9299]">
                Only the master admin can add, edit, or delete team member accounts.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
