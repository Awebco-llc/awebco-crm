import React, { useState } from 'react';
import { TeamMember } from './Shared';
import { updateTeamMember } from '@/lib/crmStore';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { getAuthClient } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword as updateAuthPassword } from 'firebase/auth';

export default function ProfileView({
  teamMembers,
  setTeamMembers,
  currentUserId
}: {
  teamMembers: TeamMember[],
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>,
  currentUserId: string | undefined
}) {
  const currentMember = teamMembers.find(m => m.id === currentUserId);
  
  const [name, setName] = useState(currentMember?.name || '');
  const [initials, setInitials] = useState(currentMember?.initials || '');
  const [color, setColor] = useState(currentMember?.color || '#1061E3');
  const [photoUrl, setPhotoUrl] = useState(currentMember?.photoUrl || '');
  
  // Password change states
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(currentMember?.emailNotificationsEnabled ?? true);

  if (!currentMember) {
    return (
      <div className="flex-grow flex items-center justify-center bg-gray-50">
        <div className="p-8 bg-white rounded-lg border border-[#E2E4E9] text-center max-w-sm">
          <h2 className="text-xl font-bold text-[#1C1F23] mb-2">Profile Not Found</h2>
          <p className="text-sm text-[#8E9299]">
            We could not find your team member profile. Please contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (showChangePassword) {
      if (!currentPassword) {
        alert('Please enter your current password.');
        return;
      }
      if (newPassword.length < 6) {
        alert('New password must be at least 6 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        alert('New passwords do not match.');
        return;
      }

      // Re-authenticate and update Firebase Auth password
      const auth = getAuthClient();
      const user = auth.currentUser;
      if (!user || !user.email) {
        alert('Error: No authenticated user session found.');
        return;
      }

      try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
      } catch (err) {
        console.error('Re-authentication failed:', err);
        alert('Failed to change password: Your current password is incorrect.');
        return;
      }

      try {
        await updateAuthPassword(user, newPassword);
      } catch (err: any) {
        console.error('Firebase Auth update password failed:', err);
        alert(`Failed to update auth password: ${err.message || 'Unknown error'}`);
        return;
      }
    }

    const updatedFields: Partial<Omit<TeamMember, 'id'>> = {
      name,
      initials,
      color,
      photoUrl: photoUrl || undefined,
      emailNotificationsEnabled,
    };

    if (showChangePassword) {
      updatedFields.password = newPassword;
    }

    const updated = {
      ...currentMember,
      ...updatedFields,
    };

    setTeamMembers(prev => prev.map(m => m.id === currentMember.id ? updated : m));

    try {
      await updateTeamMember(currentMember.id, updatedFields);
      alert('Profile updated successfully!');
      
      if (showChangePassword) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowChangePassword(false);
      }
    } catch (err) {
      console.error('Failed to save profile changes:', err);
      alert('Failed to save profile changes to database.');
    }
  };

  const handlePhotoChange = (file?: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUrl(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center px-6 shrink-0">
        <h1 className="text-xl font-bold text-[#1C1F23]">My Profile</h1>
      </header>
      
      <div className="flex-grow p-6 overflow-auto">
        <div className="max-w-2xl bg-white border border-[#E2E4E9] rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-6 mb-8 pb-8 border-b border-[#E2E4E9]">
            {photoUrl ? (
              <div
                aria-label={name || currentMember.name}
                className="w-20 h-20 rounded-full bg-cover bg-center border border-[#E2E4E9] shadow-sm"
                style={{ backgroundImage: `url(${photoUrl})` }}
              />
            ) : (
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-sm"
                style={{ backgroundColor: color }}
              >
                {initials || '!'}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-[#1C1F23]">{currentMember.name}</h2>
              <p className="text-sm text-[#8E9299]">{currentMember.email}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-[#1C1F23] mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-[#E2E4E9] text-sm focus:ring-2 focus:ring-[#1061E3] outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1F23] mb-1.5">Initials (Max 2 chars)</label>
                <input 
                  type="text" 
                  value={initials}
                  onChange={e => setInitials(e.target.value.substring(0, 2).toUpperCase())}
                  className="w-full h-10 px-3 rounded-md border border-[#E2E4E9] text-sm focus:ring-2 focus:ring-[#1061E3] outline-none"
                  required
                />
              </div>
            </div>

            <div className="border border-[#E2E4E9] rounded-lg p-5 bg-[#F9FAFB] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#8E9299]" />
                  <span className="text-sm font-semibold text-[#1C1F23]">Security & Password</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(!showChangePassword);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="text-xs font-bold text-[#1061E3] hover:underline"
                >
                  {showChangePassword ? 'Cancel' : 'Change Password'}
                </button>
              </div>

              {!showChangePassword ? (
                <div className="flex items-center justify-between py-2 border-t border-[#E2E4E9] pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#8E9299] uppercase tracking-wider">Password</label>
                    <div className="text-sm text-[#1C1F23] font-mono mt-1">••••••••</div>
                  </div>
                  <div className="text-xs text-[#8E9299]">Last updated recently</div>
                </div>
              ) : (
                <div className="space-y-4 border-t border-[#E2E4E9] pt-4">
                  {/* Current Password */}
                  <div>
                    <label className="block text-xs font-semibold text-[#8E9299] uppercase tracking-wider mb-1.5">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        className="w-full h-10 pl-3 pr-10 rounded-md border border-[#E2E4E9] text-sm focus:ring-2 focus:ring-[#1061E3] outline-none bg-white text-[#1C1F23]"
                        placeholder="Enter current password"
                        required={showChangePassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E9299] hover:text-[#1C1F23]"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-xs font-semibold text-[#8E9299] uppercase tracking-wider mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full h-10 pl-3 pr-10 rounded-md border border-[#E2E4E9] text-sm focus:ring-2 focus:ring-[#1061E3] outline-none bg-white text-[#1C1F23]"
                        placeholder="At least 6 characters"
                        required={showChangePassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E9299] hover:text-[#1C1F23]"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-xs font-semibold text-[#8E9299] uppercase tracking-wider mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full h-10 pl-3 pr-10 rounded-md border border-[#E2E4E9] text-sm focus:ring-2 focus:ring-[#1061E3] outline-none bg-white text-[#1C1F23]"
                        placeholder="Confirm new password"
                        required={showChangePassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E9299] hover:text-[#1C1F23]"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1C1F23] mb-1.5">Avatar Color</label>
              <div className="flex items-center gap-4">
                <input 
                  type="color" 
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-12 h-10 p-1 rounded border border-[#E2E4E9] cursor-pointer"
                />
                <div className="text-sm text-[#8E9299]">Choose a color for your avatar.</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1C1F23] mb-1.5">Profile Photo</label>
              <div className="flex items-center gap-3">
                <label className="h-10 px-4 rounded-md border border-[#E2E4E9] bg-white text-sm font-semibold text-[#4A4D53] hover:bg-gray-50 transition-colors cursor-pointer flex items-center">
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handlePhotoChange(e.target.files?.[0])}
                  />
                </label>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl('')}
                    className="text-sm font-semibold text-[#8E9299] hover:text-[#D32F2F] transition-colors"
                  >
                    Remove photo
                  </button>
                )}
              </div>
              <p className="text-xs text-[#8E9299] mt-2">This photo will be used as your avatar where profile photos are supported.</p>
            </div>

            <div className="flex flex-col gap-2 p-4 bg-[#F9FAFB] border border-[#E2E4E9] rounded-md">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#1C1F23] cursor-pointer">
                <input 
                  type="checkbox"
                  checked={emailNotificationsEnabled}
                  onChange={e => setEmailNotificationsEnabled(e.target.checked)}
                  className="rounded border-[#D0D5DD] text-[#1061E3] focus:ring-[#1061E3] w-4 h-4 cursor-pointer"
                />
                Enable Email Notifications
              </label>
              <p className="text-xs text-[#8E9299]">
                Receive periodic email digests summarizing unread messages and new task/deal assignments.
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <button 
                type="submit"
                className="bg-[#1061E3] hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
