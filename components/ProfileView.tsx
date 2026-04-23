import React, { useState } from 'react';
import { TeamMember } from './Shared';

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
  const [password, setPassword] = useState(currentMember?.password || '');

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setTeamMembers(prev => prev.map(m => m.id === currentMember.id ? {
      ...m,
      name,
      initials,
      color,
      password,
      photoUrl: photoUrl || undefined,
    } : m));
    alert('Profile updated successfully!');
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

            <div>
              <label className="block text-sm font-semibold text-[#1C1F23] mb-1.5">Password</label>
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-[#E2E4E9] text-sm focus:ring-2 focus:ring-[#1061E3] outline-none"
                required
              />
              <p className="text-xs text-[#8E9299] mt-2">This controls your local app login password.</p>
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
