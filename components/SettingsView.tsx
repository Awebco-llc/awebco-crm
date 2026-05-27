import React, { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { TeamMember } from '@/components/Shared';
import { createTeamMember, updateTeamMember, deleteTeamMember } from '@/lib/crmStore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getAuthClient } from '@/lib/firebase';

const formatRole = (role?: TeamMember['role']) => {
  if (role === 'master_admin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'freelancer') return 'Freelancer';
  return 'Staff';
};

const ALL_WORKSPACES = [
  'Support Tickets',
  'Websites',
  'Design & Print',
  'SEO',
  'Local Listings',
  'Google Ads',
  'Social Media'
];

export default function SettingsView({
  teamMembers,
  setTeamMembers,
  currentUserRole,
  useFullScreenUnifiedTicketView,
  setUseFullScreenUnifiedTicketView,
  allowDeletingGroups = false,
  setAllowDeletingGroups,
}: {
  teamMembers: TeamMember[],
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>,
  currentUserRole?: TeamMember['role'],
  useFullScreenUnifiedTicketView?: boolean,
  setUseFullScreenUnifiedTicketView?: React.Dispatch<React.SetStateAction<boolean>>,
  allowDeletingGroups?: boolean,
  setAllowDeletingGroups?: React.Dispatch<React.SetStateAction<boolean>>,
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
  const [editMemberColor, setEditMemberColor] = useState('#1061E3');
  const [editMemberCanViewCRM, setEditMemberCanViewCRM] = useState(true);
  const [editMemberWorkspaces, setEditMemberWorkspaces] = useState<string[]>(ALL_WORKSPACES);
  const [editMemberEmailNotificationsEnabled, setEditMemberEmailNotificationsEnabled] = useState(true);
  const canEditProfiles = currentUserRole === 'master_admin';

  const handleAddMember = async (e: React.FormEvent) => {
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

    try {
      await createTeamMember(newMember);
    } catch (err: any) {
      console.error('Failed to create team member:', err);
      alert(`Failed to create user. Ensure email is unique. Error: ${err.message}`);
    }
  };

  const handlePhotoChange = (file?: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setNewMemberPhotoUrl(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveMember = async (id: string) => {
    const member = teamMembers.find(m => m.id === id);
    if (member?.role === 'master_admin') {
      window.alert('The master admin cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete ${member?.name || 'this user'}?`);
    if (!confirmed) return;

    setTeamMembers(teamMembers.filter(m => m.id !== id));


    try {
      await deleteTeamMember(id);
    } catch (err) {
      console.error('Failed to delete team member:', err);
    }
  };

  const startEditMember = (member: TeamMember) => {
    setEditingMemberId(member.id);
    setEditMemberName(member.name);
    setEditMemberEmail(member.email || '');
    setEditMemberRole(member.role || 'staff');
    setEditMemberColor(member.color || '#1061E3');
    setEditMemberCanViewCRM(member.permissions?.canViewCRM ?? true);
    setEditMemberWorkspaces(member.permissions?.allowedWorkspaces ?? ALL_WORKSPACES);
    setEditMemberEmailNotificationsEnabled(member.emailNotificationsEnabled ?? true);
  };

  const saveEditMember = async () => {
    if (!editingMemberId || !editMemberName.trim()) return;

    let updatedMember: TeamMember | undefined;

    setTeamMembers(prev => prev.map(member => {
      if (member.id !== editingMemberId) return member;

      const role = member.role === 'master_admin' ? 'master_admin' : editMemberRole;
      const initials = editMemberName.split(' ').map(namePart => namePart[0]).join('').substring(0, 2).toUpperCase();

      const val: TeamMember = {
        ...member,
        name: editMemberName,
        initials,
        email: editMemberEmail.trim() || undefined,
        role: role,
        color: editMemberColor,
        emailNotificationsEnabled: editMemberEmailNotificationsEnabled,
        permissions: {
          canViewCRM: editMemberCanViewCRM,
          allowedWorkspaces: editMemberWorkspaces,
        }
      };
      updatedMember = val;
      return val;
    }));
    setEditingMemberId(null);

    if (updatedMember) {
      try {
        await updateTeamMember(editingMemberId, updatedMember);
      } catch (err) {
        console.error('Failed to update team member:', err);
      }
    }
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
                      {member.role !== 'master_admin' && editMemberRole !== 'master_admin' && (
                        <div className="flex flex-col gap-2 mt-1 p-3 bg-white border border-[#E2E4E9] rounded-md">
                          <h4 className="text-xs font-bold text-[#4A4D53] uppercase">Access Permissions</h4>
                          <label className="flex items-center gap-2 text-sm font-semibold text-[#1C1F23]">
                            <input 
                              type="checkbox"
                              checked={editMemberCanViewCRM}
                              onChange={e => setEditMemberCanViewCRM(e.target.checked)}
                              className="rounded border-[#D0D5DD] text-[#1061E3] focus:ring-[#1061E3]"
                            />
                            Can View CRM
                          </label>
                          <div className="text-xs font-semibold text-[#8E9299] mt-1 mb-0.5">Allowed Workspaces</div>
                          <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1">
                            {ALL_WORKSPACES.map(ws => (
                              <label key={ws} className="flex items-center gap-2 text-[13px] text-[#4A4D53] cursor-pointer hover:text-[#1C1F23]">
                                <input
                                  type="checkbox"
                                  checked={editMemberWorkspaces.includes(ws)}
                                  onChange={e => {
                                    if (e.target.checked) setEditMemberWorkspaces([...editMemberWorkspaces, ws]);
                                    else setEditMemberWorkspaces(editMemberWorkspaces.filter(w => w !== ws));
                                  }}
                                  className="rounded border-[#D0D5DD] text-[#1061E3] focus:ring-[#1061E3]"
                                />
                                {ws}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-2 mt-1 p-3 bg-white border border-[#E2E4E9] rounded-md">
                        <h4 className="text-xs font-bold text-[#4A4D53] uppercase">Notifications</h4>
                        <label className="flex items-center gap-2 text-sm font-semibold text-[#1C1F23] cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={editMemberEmailNotificationsEnabled}
                            onChange={e => setEditMemberEmailNotificationsEnabled(e.target.checked)}
                            className="rounded border-[#D0D5DD] text-[#1061E3] focus:ring-[#1061E3] w-4 h-4 cursor-pointer"
                          />
                          Email Notifications
                        </label>
                      </div>
                      {editMemberEmail && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const auth = getAuthClient();
                              await sendPasswordResetEmail(auth, editMemberEmail);
                              window.alert(`Password reset email sent to ${editMemberEmail}`);
                            } catch (e) {
                              console.error(e);
                              window.alert('Failed to send password reset email.');
                            }
                          }}
                          className="w-full mt-2 px-3 py-2 border border-[#E2E4E9] rounded-md text-sm font-semibold bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors"
                        >
                          Send Password Reset Email
                        </button>
                      )}
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

        {/* Workspace & Ticket Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E4E9] overflow-hidden mb-8">
          <div className="px-6 py-5 border-b border-[#E2E4E9]">
            <h2 className="text-lg font-semibold text-[#1C1F23]">Workspace & Ticket Settings</h2>
            <p className="text-sm text-[#8E9299] mt-1">Customize how your CRM workspace interfaces look and behave.</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4 p-4 border border-[#E2E4E9] rounded-lg bg-[#F9FAFB]">
              <div>
                <h3 className="font-semibold text-[#1C1F23] text-sm">Full Screen Support Ticket View</h3>
                <p className="text-xs text-[#8E9299] mt-0.5">When clicked, support tickets will open in a beautiful, distraction-free full screen layout showing all metadata, description, files, and updates in a single unified scroll view.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={useFullScreenUnifiedTicketView}
                  onChange={(e) => {
                    const newVal = e.target.checked;
                    if (setUseFullScreenUnifiedTicketView) {
                      setUseFullScreenUnifiedTicketView(newVal);
                    }
                    localStorage.setItem('useFullScreenUnifiedTicketView', String(newVal));
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1061E3] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1061E3]"></div>
              </label>
            </div>

            {(currentUserRole === 'master_admin' || currentUserRole === 'admin') && (
              <div className="flex items-center justify-between gap-4 p-4 border border-red-100 rounded-lg bg-red-50/30">
                <div>
                  <h3 className="font-semibold text-[#1C1F23] text-sm">Allow Deleting Groups (Admin Only)</h3>
                  <p className="text-xs text-red-600 font-medium mt-0.5">⚠️ WARNING: Enabling this will show a &quot;Remove group&quot; button next to all workspace groups. Deleting a group will permanently delete all task data inside that group!</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={allowDeletingGroups}
                    onChange={(e) => {
                      const newVal = e.target.checked;
                      if (setAllowDeletingGroups) {
                        setAllowDeletingGroups(newVal);
                      }
                      localStorage.setItem('allowDeletingGroups', String(newVal));
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1061E3] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1061E3]"></div>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
