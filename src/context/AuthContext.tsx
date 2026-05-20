import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI, coachesAPI, studentsAPI } from '../api';
import type { Coach, Student } from '../types';

interface AuthState {
  coach: Coach | null;
  student: Student | null;
  role: 'coach' | 'student' | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (name: string, email: string, password: string, asRole: 'coach' | 'student', extra?: { zipCode?: string; gender?: string }) => Promise<{ error?: string }>;
  googleLogin: (credential: string, asRole: 'coach' | 'student') => Promise<{ error?: string }>;
  appleLogin: (identityToken: string, asRole: 'coach' | 'student', fullName?: { givenName?: string | null; familyName?: string | null } | null, email?: string | null) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  switchRole: () => Promise<void>;
  canSwitchRole: boolean;
  refreshCoach: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  coach: null,
  student: null,
  role: null,
  loading: true,
  login: async () => ({}),
  register: async () => ({}),
  googleLogin: async () => ({}),
  appleLogin: async () => ({}),
  logout: async () => {},
  switchRole: async () => {},
  canSwitchRole: false,
  refreshCoach: async () => {},
});

const COACH_KEY = 'tenncoach_coach';
const STUDENT_KEY = 'tenncoach_student';
const ROLE_KEY = 'tenncoach_active_role';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [coach, setCoach] = useState<Coach | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [activeRole, setActiveRole] = useState<'coach' | 'student' | null>(null);
  const [loading, setLoading] = useState(true);

  const role: 'coach' | 'student' | null = activeRole ?? (coach ? 'coach' : student ? 'student' : null);
  const canSwitchRole = !!(coach && student);

  const persistCoach = async (user: Coach) => {
    await SecureStore.setItemAsync(COACH_KEY, JSON.stringify(user));
    setCoach(user);
  };

  const persistStudent = async (user: Student) => {
    await SecureStore.setItemAsync(STUDENT_KEY, JSON.stringify(user));
    setStudent(user);
  };

  const safeParse = <T,>(raw: string | null): T | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const extractCoachUser = (data: any): Coach | null => {
    const user = data?.user ?? data;
    if (!user || typeof user !== 'object') return null;
    if (user.Role !== 1 && user.role !== 'coach') return null;
    return user as Coach;
  };

  const extractStudentUser = (data: any): Student | null => {
    const user = data?.user ?? data;
    if (!user || typeof user !== 'object') return null;
    if (user.Role !== 0 && user.role !== 'student') return null;
    return user as Student;
  };

  useEffect(() => {
    (async () => {
      try {
        const [coachRaw, studentRaw, roleRaw] = await Promise.all([
          SecureStore.getItemAsync(COACH_KEY).catch(() => null),
          SecureStore.getItemAsync(STUDENT_KEY).catch(() => null),
          SecureStore.getItemAsync(ROLE_KEY).catch(() => null),
        ]);

        const parsedCoach = safeParse<Coach>(coachRaw);
        if (parsedCoach) {
          // If cached data is missing profile fields (saved before login returned
          // full coach+Coaches JOIN), refresh before the RouteGuard evaluates so
          // coaches with completed profiles are never wrongly sent to setup.
          if (parsedCoach.user_id && parsedCoach.courtLatitude == null && !parsedCoach.court_locations) {
            try {
              const fresh = await coachesAPI.getById(String(parsedCoach.user_id));
              await persistCoach((!fresh?.error ? fresh : parsedCoach) as Coach);
            } catch {
              setCoach(parsedCoach);
            }
          } else {
            setCoach(parsedCoach);
          }
        }

        const parsedStudent = safeParse<Student>(studentRaw);
        if (parsedStudent) setStudent(parsedStudent);
        if (roleRaw === 'coach' || roleRaw === 'student') setActiveRole(roleRaw);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Try both roles in parallel so dual-role users get both persisted
      const [coachData, studentData] = await Promise.all([
        authAPI.login(email, password, tz, 'coach'),
        authAPI.login(email, password, tz, 'student'),
      ]);
      const coachUser = !coachData.error ? extractCoachUser(coachData) : null;
      const studentUser = !studentData.error ? extractStudentUser(studentData) : null;

      if (!coachUser && !studentUser) {
        return { error: coachData.error || studentData.error || 'No account found with these credentials.' };
      }
      if (coachUser) await persistCoach(coachUser);
      if (studentUser) await persistStudent(studentUser);

      // Default to coach if both exist; otherwise whatever succeeded
      const preferredRole: 'coach' | 'student' = coachUser ? 'coach' : 'student';
      await SecureStore.setItemAsync(ROLE_KEY, preferredRole);
      setActiveRole(preferredRole);
      return {};
    } catch {
      return { error: 'Network error. Please check your connection.' };
    }
  };

  const register = async (name: string, email: string, password: string, asRole: 'coach' | 'student', extra?: { zipCode?: string; gender?: string }): Promise<{ error?: string }> => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (asRole === 'student') {
        const data = await studentsAPI.create({ name, email, password, timezone: tz, ...extra });
        if (data.error) return { error: data.error };
        const studentData = extractStudentUser(data);
        if (!studentData) return { error: 'Student account was created, but response was invalid.' };
        await persistStudent(studentData);
        await SecureStore.setItemAsync(ROLE_KEY, 'student');
        setActiveRole('student');
      } else {
        const data = await coachesAPI.create({ name, email, password, timezone: tz });
        if (data.error) return { error: data.error };
        const coachData = extractCoachUser(data);
        if (!coachData) return { error: 'Coach account was created, but response was invalid.' };
        await persistCoach(coachData);
        await SecureStore.setItemAsync(ROLE_KEY, 'coach');
        setActiveRole('coach');
      }
      return {};
    } catch {
      return { error: 'Network error. Please check your connection.' };
    }
  };

  const googleLogin = async (credential: string, asRole: 'coach' | 'student'): Promise<{ error?: string }> => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data = await authAPI.googleLogin(credential, tz, asRole);
      if (data.error) return { error: data.error };
      const coachUser = extractCoachUser(data);
      const studentUser = extractStudentUser(data);
      if (!coachUser && !studentUser) {
        return { error: 'Google sign-in failed. Please try again.' };
      }

      if (coachUser) await persistCoach(coachUser);
      if (studentUser) await persistStudent(studentUser);

      const resolvedRole: 'coach' | 'student' = coachUser ? 'coach' : 'student';
      await SecureStore.setItemAsync(ROLE_KEY, resolvedRole);
      setActiveRole(resolvedRole);
      return {};
    } catch {
      return { error: 'Network error. Please check your connection.' };
    }
  };

  const appleLogin = async (identityToken: string, asRole: 'coach' | 'student', fullName?: { givenName?: string | null; familyName?: string | null } | null, email?: string | null): Promise<{ error?: string }> => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data = await authAPI.appleLogin(identityToken, tz, asRole, fullName, email);
      if (data.error) return { error: data.error };
      const coachUser = extractCoachUser(data);
      const studentUser = extractStudentUser(data);
      if (!coachUser && !studentUser) {
        return { error: 'Apple sign-in failed. Please try again.' };
      }

      if (coachUser) await persistCoach(coachUser);
      if (studentUser) await persistStudent(studentUser);

      const resolvedRole: 'coach' | 'student' = coachUser ? 'coach' : 'student';
      await SecureStore.setItemAsync(ROLE_KEY, resolvedRole);
      setActiveRole(resolvedRole);
      return {};
    } catch {
      return { error: 'Network error. Please check your connection.' };
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(COACH_KEY);
    await SecureStore.deleteItemAsync(STUDENT_KEY);
    await SecureStore.deleteItemAsync(ROLE_KEY);
    setCoach(null);
    setStudent(null);
    setActiveRole(null);
  };

  const switchRole = async () => {
    if (!coach || !student) return;
    const newRole: 'coach' | 'student' = activeRole === 'coach' ? 'student' : 'coach';
    await SecureStore.setItemAsync(ROLE_KEY, newRole);
    setActiveRole(newRole);
  };

  const refreshCoach = async () => {
    const id = coach?.user_id ?? coach?.coach_id;
    if (!id) return;
    try {
      const fresh = await coachesAPI.getById(String(id));
      if (fresh && !fresh.error) {
        await persistCoach(fresh as Coach);
      }
    } catch {
      // ignore network errors during refresh
    }
  };

  return (
    <AuthContext.Provider value={{ coach, student, role, loading, login, register, googleLogin, appleLogin, logout, switchRole, canSwitchRole, refreshCoach }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
