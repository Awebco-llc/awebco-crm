'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuthClient, getDb } from '@/lib/firebase';
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
    const auth = getAuthClient();
    const db = getDb();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch profile from Firestore
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const profileData = profileSnap.data();
          // Enforce role-based access
          if (['master_admin', 'admin', 'staff', 'freelancer'].includes(profileData.role)) {
             setProfile({ id: firebaseUser.uid, ...profileData } as TeamMember);
          } else {
             console.error("Unauthorized access attempt by user without a valid role.");
             await auth.signOut();
             setProfile(null);
             setUser(null);
          }
        } else {
          // If profile doesn't exist, they are not authorized. Log them out.
          console.error("Unauthorized access attempt by unapproved user.");
          await auth.signOut();
          setProfile(null);
          setUser(null);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await getAuthClient().signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
