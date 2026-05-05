'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { TeamMember } from '@/components/Shared';

interface AuthContextType {
  user: User | null;
  profile: TeamMember | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch profile from Firestore
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          setProfile({ id: firebaseUser.uid, ...profileSnap.data() } as TeamMember);
        } else {
          // If profile doesn't exist, create a basic one from Firebase Auth info
          const initials = firebaseUser.displayName 
            ? firebaseUser.displayName.split(' ').map(n => n[0]).join('').toUpperCase()
            : firebaseUser.email?.split('@')[0].slice(0, 2).toUpperCase() || '??';
            
          const newProfile: Omit<TeamMember, 'id'> = {
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            initials,
            color: '#1061E3',
            role: 'staff',
            email: firebaseUser.email || '',
            uid: firebaseUser.uid
          };
          
          await setDoc(profileRef, newProfile);
          setProfile({ id: firebaseUser.uid, ...newProfile } as TeamMember);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
