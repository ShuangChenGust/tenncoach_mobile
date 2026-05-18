import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Image, Linking, Modal, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { coachesAPI, studentsAPI, coachBlocksAPI, uploadAPI, paymentsAPI } from '../../src/api';
import AmPmTimePicker from '../../components/AmPmTimePicker';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];
const DAY_LABELS: Record<Day, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

type TimeWindow = { start: string; end: string };
type DayAvail = { available: boolean; windows: TimeWindow[] };
type AvailTemplate = Record<Day, DayAvail>;

interface Block {
  block_id: number;
  start_date: string;
  end_date: string;
  label?: string;
}

const DEFAULT_WIN: TimeWindow = { start: '09:00', end: '17:00' };

function parseAvail(json?: string): AvailTemplate {
  try {
    const p = JSON.parse(json || '{}');
    return DAYS.reduce((acc, d) => {
      const day = p[d];
      if (!day) {
        acc[d] = { available: false, windows: [{ ...DEFAULT_WIN }] };
      } else if (Array.isArray(day.windows) && day.windows.length > 0) {
        acc[d] = { available: !!day.available, windows: day.windows };
      } else {
        acc[d] = {
          available: !!day.available,
          windows: [{ start: day.start || '09:00', end: day.end || '17:00' }],
        };
      }
      return acc;
    }, {} as AvailTemplate);
  } catch {
    return DAYS.reduce((acc, d) => {
      acc[d] = { available: false, windows: [{ ...DEFAULT_WIN }] };
      return acc;
    }, {} as AvailTemplate);
  }
}

function buildAvailJson(template: AvailTemplate, existingJson?: string): string {
  try {
    const existing = JSON.parse(existingJson || '{}');
    return JSON.stringify({ ...existing, ...template });
  } catch {
    return JSON.stringify(template);
  }
}

function formatDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Tab = 'profile' | 'availability' | 'tokens' | 'skills';

// ─── NTRP levels ─────────────────────────────────────────────────────────────
const NTRP_LEVELS = [
  { value: '1.0', label: '1.0', desc: 'Just starting out' },
  { value: '1.5', label: '1.5', desc: 'Limited experience' },
  { value: '2.0', label: '2.0', desc: 'Learning the basics' },
  { value: '2.5', label: '2.5', desc: 'Getting consistent' },
  { value: '3.0', label: '3.0', desc: 'Solid baseline rallies' },
  { value: '3.5', label: '3.5', desc: 'Above average club player' },
  { value: '4.0', label: '4.0', desc: 'Competitive club player' },
  { value: '4.5', label: '4.5', desc: 'Tournament contender' },
  { value: '5.0', label: '5.0', desc: 'Advanced / semi-pro' },
  { value: '5.5+', label: '5.5+', desc: 'Elite / professional' },
];

// ─── Skill categories ─────────────────────────────────────────────────────────
const SKILL_CATEGORIES = [
  {
    category: 'Groundstrokes',
    skills: ['Forehand Topspin', 'Backhand Topspin', 'Slice Backhand', 'Slice Forehand', 'Deep Cross-Court'],
  },
  {
    category: 'Net Game',
    skills: ['Forehand Volley', 'Backhand Volley', 'Overhead Smash', 'Drop Volley', 'Approach Shot'],
  },
  {
    category: 'Serve & Return',
    skills: ['Flat Serve', 'Kick Serve', 'Slice Serve', 'Return of Serve', '2nd Serve Consistency'],
  },
  {
    category: 'Strategy & Fitness',
    skills: ['Court Positioning', 'Pattern Play', 'Mental Toughness', 'Footwork', 'Match Tactics'],
  },
];

// ─── Level coaching tips ──────────────────────────────────────────────────────
const LEVEL_TIPS: Record<string, { emoji: string; title: string; tips: string[] }> = {
  '1.0-2.0': {
    emoji: '🟢', title: 'Beginner',
    tips: ['Learn basic grips — forehand, backhand, and continental', 'Focus on contact point: hit the ball in front of your body', 'Develop rally skills with repetitive drills', 'Build hand-eye coordination', 'Learn basic rules, scoring, and court positioning'],
  },
  '2.5': {
    emoji: '🟡', title: 'Advanced Beginner',
    tips: ['Improve consistency — aim for 5–10 ball rallies', 'Introduce topspin on the forehand', 'Work on basic serve (getting it in reliably)', 'Start moving to the ball instead of reaching for it', 'Learn recovery position — return to centre after each shot'],
  },
  '3.0': {
    emoji: '🟠', title: 'Lower Intermediate',
    tips: ['Develop a dependable forehand as your primary weapon', 'Improve backhand consistency', 'Learn to aim crosscourt vs down-the-line with intent', 'Build a reliable second serve', 'Understand basic match strategy — keep the ball deep'],
  },
  '3.5': {
    emoji: '🔵', title: 'Intermediate',
    tips: ['Develop reliable topspin on both forehand and backhand', 'Improve footwork — split step, spacing, and balance', 'Add net play: volleys and approach shots', 'Serve with placement, not just getting it in', 'Start constructing points instead of just rallying'],
  },
  '4.0': {
    emoji: '🟣', title: 'Upper Intermediate',
    tips: ['Build consistent depth and pace on groundstrokes', 'Develop shot tolerance under pressure', 'Use patterns — e.g. crosscourt → short ball → attack', 'Improve return of serve', 'Strengthen your mental game'],
  },
  '4.5': {
    emoji: '🔴', title: 'Advanced',
    tips: ['Turn strengths into weapons — serve, forehand, etc.', 'Recognise opponent weaknesses quickly', 'Improve transition game — baseline to net', 'Add variety: slice, drop shots, and sharp angles', 'Increase consistency at higher pace and intensity'],
  },
  '5.0+': {
    emoji: '⭐', title: 'Elite Amateur',
    tips: ['Dictate play with aggressive but controlled shots', 'Master point construction and adaptability', 'Maintain consistency against strong opponents', 'Optimise physical conditioning', 'Develop advanced mental toughness'],
  },
};

function getNtrpKey(ntrp: string): string {
  const n = parseFloat(ntrp);
  if (n <= 2.0) return '1.0-2.0';
  if (n <= 2.5) return '2.5';
  if (n <= 3.0) return '3.0';
  if (n <= 3.5) return '3.5';
  if (n <= 4.0) return '4.0';
  if (n <= 4.5) return '4.5';
  return '5.0+';
}

const TIMEZONES = [
  { id: 'America/New_York',    label: 'Eastern Time (ET)' },
  { id: 'America/Chicago',     label: 'Central Time (CT)' },
  { id: 'America/Denver',      label: 'Mountain Time (MT)' },
  { id: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { id: 'America/Anchorage',   label: 'Alaska Time (AKT)' },
  { id: 'Pacific/Honolulu',    label: 'Hawaii Time (HT)' },
  { id: 'Europe/London',       label: 'London (GMT/BST)' },
  { id: 'Europe/Paris',        label: 'Central Europe (CET)' },
  { id: 'Asia/Tokyo',          label: 'Japan (JST)' },
  { id: 'Australia/Sydney',    label: 'Sydney (AEST)' },
];

export default function AccountScreen() {
  const { coach, student, role, logout, switchRole, canSwitchRole } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Fresh profile data fetched from API
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Edit modal
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editSpecialization, setEditSpecialization] = useState('');
  const [editHourlyRate, setEditHourlyRate] = useState('');
  const [editCertifications, setEditCertifications] = useState('');
  const [editExperience, setEditExperience] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [editTimezone, setEditTimezone] = useState('');
  const [showTimezoneSelector, setShowTimezoneSelector] = useState(false);
  const [profileAlertDismissed, setProfileAlertDismissed] = useState(false);

  // Profile picture upload
  const [profilePicUri, setProfilePicUri] = useState<string | null>(null);
  const [uploadingPic, setUploadingPic] = useState(false);

  // Marketing photos
  const [photoUris, setPhotoUris] = useState<string[]>([]);  // new local URIs queued
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // FAQ
  interface FaqItem { question: string; answer: string; }
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqEditIdx, setFaqEditIdx] = useState<number | null>(null);
  const [faqEditQ, setFaqEditQ] = useState('');
  const [faqEditA, setFaqEditA] = useState('');
  const [faqSaving, setFaqSaving] = useState(false);

  // Availability (coach only)
  const [avail, setAvail] = useState<AvailTemplate>(parseAvail(coach?.availability));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockLabel, setBlockLabel] = useState('');
  const [savingBlock, setSavingBlock] = useState(false);

  // Coach visibility (live toggle on profile tab)
  const [coachActive, setCoachActive] = useState(true);
  const [visibilityToggling, setVisibilityToggling] = useState(false);

  // Tokens tab
  const [tokenHistory, setTokenHistory] = useState<any[]>([]);
  const [tokenHistoryLoading, setTokenHistoryLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  // Student skills & NTRP
  const [ntrpLevel, setNtrpLevel] = useState('');
  const [strongSkills, setStrongSkills] = useState<string[]>([]);
  const [workOnSkills, setWorkOnSkills] = useState<string[]>([]);
  const [ntrpHistory, setNtrpHistory] = useState<{ date: string; value: string }[]>([]);
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [skillsSaved, setSkillsSaved] = useState(false);
  const [showNtrpPicker, setShowNtrpPicker] = useState(false);

  const userId = coach?.user_id ?? coach?.coach_id ?? student?.user_id;
  const coachId = coach?.coach_id ?? coach?.user_id;

  // Load token history when Tokens tab is opened
  useEffect(() => {
    if (activeTab !== 'tokens' || !userId) return;
    setTokenHistoryLoading(true);
    paymentsAPI.getTokenHistory(String(userId))
      .then((rows: any) => setTokenHistory(Array.isArray(rows) ? rows : []))
      .catch(() => setTokenHistory([]))
      .finally(() => setTokenHistoryLoading(false));
  }, [activeTab, userId]);

  // Load fresh profile from API
  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setProfileLoading(true);
    try {
      const data = role === 'coach'
        ? await coachesAPI.getById(String(userId))
        : await studentsAPI.getById(String(userId));
      if (data && !data.error) setProfile(data);
      else setProfile(coach ?? student ?? null);
    } catch {
      setProfile(coach ?? student ?? null);
    } finally {
      setProfileLoading(false);
    }
  }, [userId, role]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Sync coach visibility from fresh profile
  useEffect(() => {
    if (role === 'coach' && profile) {
      setCoachActive((profile.Active ?? 'true') === 'true');
    }
  }, [profile, role]);

  const handleToggleVisibility = async (val: boolean) => {
    if (!coachId) return;
    setCoachActive(val);
    setVisibilityToggling(true);
    try {
      await coachesAPI.setActive(String(coachId), val);
    } catch {
      setCoachActive(!val); // revert on error
      Alert.alert('Error', 'Failed to update visibility. Please try again.');
    } finally {
      setVisibilityToggling(false);
    }
  };

  // Load student stats (NTRP, skills) on mount
  useEffect(() => {
    if (role !== 'student') return;
    const uid = student?.user_id;
    if (!uid) return;
    studentsAPI.getById(String(uid)).then((data: any) => {
      if (data?.stats_data) {
        try {
          const stats = JSON.parse(data.stats_data);
          // Support both old (checkedSkills) and new (strongSkills/workOnSkills) format
          setStrongSkills(stats.strongSkills ?? stats.checkedSkills ?? []);
          setWorkOnSkills(stats.workOnSkills ?? stats.goalSkills ?? []);
          setNtrpHistory(Array.isArray(stats.ntrpHistory) ? stats.ntrpHistory : []);
          // Derive current level from history or legacy flat field
          const latestNtrp = Array.isArray(stats.ntrpHistory) && stats.ntrpHistory.length > 0
            ? stats.ntrpHistory[stats.ntrpHistory.length - 1].value
            : stats.ntrpLevel ?? '';
          setNtrpLevel(latestNtrp);
        } catch {}
      }
    }).catch(() => {});
  }, [role, student?.user_id]);

  const handleSaveSkills = async () => {
    const uid = student?.user_id;
    if (!uid) return;
    setSkillsSaving(true);
    try {
      // Add a new NTRP history entry if user selected a level
      const today = new Date().toISOString().slice(0, 10);
      const newHistory = ntrpLevel
        ? [...ntrpHistory.filter(e => e.date !== today), { date: today, value: ntrpLevel }]
        : ntrpHistory;
      await studentsAPI.saveStats(String(uid), {
        ntrpHistory: newHistory,
        strongSkills,
        workOnSkills,
        // Legacy compat field so older web reads still work
        ntrpLevel,
      });
      setNtrpHistory(newHistory);
      setSkillsSaved(true);
      setTimeout(() => setSkillsSaved(false), 2500);
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSkillsSaving(false);
    }
  };

  const toggleStrongSkill = (skill: string) => {
    setStrongSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill],
    );
    // Remove from workOn if added to strong
    setWorkOnSkills(prev => prev.filter(s => s !== skill));
  };

  const toggleWorkOnSkill = (skill: string) => {
    // Cannot mark as work-on if already a strength
    if (strongSkills.includes(skill)) return;
    setWorkOnSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill],
    );
  };

  const openEditModal = () => {
    const p = profile ?? coach ?? student;
    setEditName(p?.name ?? '');
    setEditEmail(p?.email ?? '');
    setEditPhone(p?.Phone ?? p?.phone ?? '');
    setEditBio(p?.bio ?? '');
    setEditSpecialization(p?.specialization ?? '');
    setEditHourlyRate(p?.Hourly_pay != null ? String(p.Hourly_pay) : p?.hourlyRate != null ? String(p.hourlyRate) : '');
    setEditCertifications(p?.certifications ?? '');
    setEditExperience(p?.experience != null ? String(p.experience) : '');
    // Load existing photos
    try { setExistingPhotos(JSON.parse(p?.photos || '[]')); } catch { setExistingPhotos([]); }
    setPhotoUris([]);
    // Load FAQ
    try { setFaqItems(JSON.parse(p?.faq || '[]')); } catch { setFaqItems([]); }
    setFaqQuestion(''); setFaqAnswer(''); setFaqEditIdx(null);
    setEditActive((p?.Active ?? 'true') === 'true');
    setEditTimezone(p?.timezone ?? '');
    setShowTimezoneSelector(false);
    setProfilePicUri(null);
    setEditVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    setEditSaving(true);
    try {
      // Upload profile picture if a new one was selected
      let profilePictureUrl: string | undefined = undefined;
      if (profilePicUri) {
        setUploadingPic(true);
        const result = await uploadAPI.profilePicture(profilePicUri);
        profilePictureUrl = result.url;
        setUploadingPic(false);
      }

      // Upload new marketing photos and merge with existing
      let finalPhotos = [...existingPhotos];
      if (photoUris.length > 0) {
        setUploadingPhotos(true);
        const { urls } = await uploadAPI.marketingPhotos(photoUris);
        finalPhotos = [...finalPhotos, ...urls];
        setUploadingPhotos(false);
      }

      const data: any = {
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        phone: editPhone.trim(),
        Phone: editPhone.trim(),
        bio: editBio.trim(),
        faq: JSON.stringify(faqItems),
        photos: JSON.stringify(finalPhotos),
      };
      if (profilePictureUrl) {
        data.profilePicture = profilePictureUrl;  // coaches
        data.profile_picture = profilePictureUrl; // students
      }
      if (editTimezone) data.timezone = editTimezone;
      if (role === 'coach') {
        data.specialization = editSpecialization.trim();
        if (editHourlyRate) data.Hourly_pay = parseFloat(editHourlyRate);
        if (editCertifications) data.certifications = editCertifications.trim();
        if (editExperience) data.experience = parseInt(editExperience, 10);
      }
      const updated = role === 'coach'
        ? await coachesAPI.update(String(userId), data)
        : await studentsAPI.update(String(userId), data);
      if (updated && !updated.error) {
        // Update visibility separately if changed
        if (role === 'coach') {
          const currentActive = (updated.Active ?? 'true') === 'true';
          if (currentActive !== editActive) {
            await coachesAPI.setActive(String(userId), editActive).catch(() => {});
          }
        }
        setEditVisible(false);
        // Re-fetch full profile so all fields (picture, stats, etc.) are fresh
        await loadProfile();
        Alert.alert('Saved', 'Profile updated successfully.');
      } else {
        Alert.alert('Error', updated?.error ?? 'Failed to save. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setEditSaving(false);
      setUploadingPic(false);
      setUploadingPhotos(false);
    }
  };

  const pickProfilePic = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setProfilePicUri(result.assets[0].uri);
    }
  };

  const pickMarketingPhoto = async () => {
    if (existingPhotos.length + photoUris.length >= 5) {
      Alert.alert('Limit reached', 'You can upload up to 5 marketing photos.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUris(prev => [...prev, result.assets[0].uri]);
    }
  };

  const addFaqItem = () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setFaqItems(prev => [...prev, { question: faqQuestion.trim(), answer: faqAnswer.trim() }]);
    setFaqQuestion(''); setFaqAnswer('');
  };

  const removeFaqItem = (idx: number) => {
    setFaqItems(prev => prev.filter((_, i) => i !== idx));
    if (faqEditIdx === idx) setFaqEditIdx(null);
  };

  const startEditFaq = (idx: number) => {
    setFaqEditIdx(idx);
    setFaqEditQ(faqItems[idx].question);
    setFaqEditA(faqItems[idx].answer);
  };

  const saveEditFaq = (idx: number) => {
    if (!faqEditQ.trim()) return;
    setFaqItems(prev => prev.map((item, i) =>
      i === idx ? { question: faqEditQ.trim(), answer: faqEditA.trim() } : item,
    ));
    setFaqEditIdx(null);
  };

  const handleSaveFaqOnly = async () => {
    if (!userId) return;
    setFaqSaving(true);
    try {
      const updated = await coachesAPI.update(String(userId), { faq: JSON.stringify(faqItems) });
      if (updated && !updated.error) {
        setProfile(updated);
        Alert.alert('Saved', 'FAQ updated.');
      } else {
        Alert.alert('Error', updated?.error ?? 'Failed to save FAQ.');
      }
    } catch {
      Alert.alert('Error', 'Network error.');
    } finally {
      setFaqSaving(false);
    }
  };

  const loadBlocks = useCallback(async () => {
    if (!coachId) return;
    try {
      const data = await coachBlocksAPI.getBlocks(String(coachId));
      setBlocks(Array.isArray(data) ? data : []);
    } catch {
      setBlocks([]);
    } finally {
      setLoadingBlocks(false);
    }
  }, [coachId]);

  useEffect(() => {
    if (role === 'coach') loadBlocks();
  }, [loadBlocks, role]);

  const handleSaveAvail = async () => {
    if (!coachId) return;
    setSaving(true);
    try {
      const newAvailJson = buildAvailJson(avail, coach?.availability);
      await coachesAPI.update(String(coachId), { availability: newAvailJson });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Alert.alert('Error', 'Failed to save availability. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBlock = async () => {
    if (!coachId || !blockStart || !blockEnd || blockEnd < blockStart) {
      Alert.alert('Invalid dates', 'Please enter a valid start and end date.');
      return;
    }
    setSavingBlock(true);
    try {
      const created = await coachBlocksAPI.addBlock(String(coachId), {
        start_date: blockStart,
        end_date: blockEnd,
        label: blockLabel.trim() || undefined,
      });
      if (!created?.error) {
        setBlocks(prev => [...prev, created].sort((a, b) => a.start_date.localeCompare(b.start_date)));
        setBlockStart(''); setBlockEnd(''); setBlockLabel('');
        setShowBlockModal(false);
      } else {
        Alert.alert('Error', created.error);
      }
    } catch {
      Alert.alert('Error', 'Failed to add block.');
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteBlock = (b: Block) => {
    Alert.alert(
      'Remove Block',
      `Remove blocked period ${formatDate(b.start_date)} – ${formatDate(b.end_date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await coachBlocksAPI.deleteBlock(String(coachId!), b.block_id);
            setBlocks(prev => prev.filter(x => x.block_id !== b.block_id));
          },
        },
      ],
    );
  };

  const updateWindow = (day: Day, wi: number, field: 'start' | 'end', value: string) => {
    setAvail(a => {
      const wins = [...a[day].windows];
      wins[wi] = { ...wins[wi], [field]: value };
      return { ...a, [day]: { ...a[day], windows: wins } };
    });
  };

  const addWindow = (day: Day) => {
    setAvail(a => ({
      ...a,
      [day]: { ...a[day], windows: [...a[day].windows, { start: '09:00', end: '17:00' }] },
    }));
  };

  const removeWindow = (day: Day, wi: number) => {
    setAvail(a => ({
      ...a,
      [day]: { ...a[day], windows: a[day].windows.filter((_, i) => i !== wi) },
    }));
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? All your data will be permanently removed and this cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              `Type "DELETE" to confirm account deletion for ${displayEmail}.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm Delete',
                  style: 'destructive',
                  onPress: async () => {
                    if (!userId) return;
                    try {
                      const result = role === 'coach'
                        ? await coachesAPI.deleteAccount(String(userId))
                        : await studentsAPI.deleteAccount(String(userId));
                      if (result?.error) {
                        Alert.alert('Error', result.error);
                        return;
                      }
                      logout();
                    } catch {
                      Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const p = profile ?? coach ?? student;
  const today = new Date().toISOString().slice(0, 10);
  const displayName = p?.name ?? 'User';
  const displayEmail = p?.email ?? coach?.email ?? student?.email ?? '';

  // Coach profile completeness check
  const missingFields: string[] = [];
  if (role === 'coach' && p) {
    if (!p.profilePicture && !p.profile_picture) missingFields.push('Profile photo');
    if (!p.specialization) missingFields.push('Specialization');
    if (!p.bio) missingFields.push('Bio / About');
    if (!p.Phone && !p.phone) missingFields.push('Phone number');
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    ...(role === 'coach' ? [{ key: 'availability' as Tab, label: 'Availability' }] : []),
    ...(role === 'coach' ? [{ key: 'tokens' as Tab, label: 'Tokens' }] : []),
    ...(role === 'student' ? [{ key: 'skills' as Tab, label: 'Skills' }] : []),
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tab switcher */}
      <View style={styles.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── PROFILE TAB ── */}
      {activeTab === 'profile' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {profileLoading ? (
            <ActivityIndicator color="#2e7d32" style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* Profile completion banner (coach only) */}
              {!profileAlertDismissed && missingFields.length > 0 && (
                <View style={styles.completionBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.completionTitle}>📋 Complete your profile to attract more students</Text>
                    {missingFields.map(f => (
                      <Text key={f} style={styles.completionItem}>• {f} is missing</Text>
                    ))}
                    <TouchableOpacity onPress={openEditModal} style={{ marginTop: 8 }}>
                      <Text style={styles.completionCta}>Update profile →</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => setProfileAlertDismissed(true)} style={{ padding: 4 }}>
                    <Text style={{ fontSize: 18, color: '#4a7c59' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Header card */}
              <View style={styles.profileCard}>
                {p?.profilePicture || p?.profile_picture ? (
                  <Image
                    source={{ uri: p.profilePicture ?? p.profile_picture }}
                    style={styles.avatarImg}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileEmail}>{displayEmail}</Text>
                {role === 'coach' && (
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>🎾 Coach</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.editBtn} onPress={openEditModal}>
                  <Text style={styles.editBtnText}>✏️ Edit Profile</Text>
                </TouchableOpacity>
              </View>

              {/* Coach visibility toggle */}
              {role === 'coach' && (
                <View style={[styles.infoCard, { paddingVertical: 14 }]}>
                  <View style={styles.visibilityRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>Profile Visibility</Text>
                      <Text style={styles.visibilityLabel}>
                        {coachActive ? '✅ Visible to students' : '🔒 Hidden from students'}
                      </Text>
                      <Text style={styles.visibilityHint}>
                        {coachActive
                          ? 'Students can find and book you.'
                          : 'Your profile is hidden from students.'}
                      </Text>
                    </View>
                    <Switch
                      value={coachActive}
                      onValueChange={handleToggleVisibility}
                      trackColor={{ true: '#2e7d32', false: '#ccc' }}
                      thumbColor="#fff"
                      disabled={visibilityToggling}
                    />
                  </View>
                </View>
              )}

              {/* Coach-specific fields */}
              {role === 'coach' && (
                <>
                  {p?.specialization ? (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Specialization</Text>
                      <Text style={styles.infoValue}>{p.specialization}</Text>
                    </View>
                  ) : null}
                  {(p?.Hourly_pay != null || p?.hourlyRate != null) ? (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Hourly Rate</Text>
                      <Text style={styles.infoValue}>${p.Hourly_pay ?? p.hourlyRate}/hr</Text>
                    </View>
                  ) : null}
                  {p?.experience ? (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Experience</Text>
                      <Text style={styles.infoValue}>{p.experience} years</Text>
                    </View>
                  ) : null}
                  {p?.certifications ? (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Certifications</Text>
                      <Text style={styles.infoValue}>{p.certifications}</Text>
                    </View>
                  ) : null}
                </>
              )}

              {/* Shared fields */}
              {p?.bio ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Bio</Text>
                  <Text style={styles.infoValue}>{p.bio}</Text>
                </View>
              ) : null}

              {(p?.Phone || p?.phone) ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{p.Phone ?? p.phone}</Text>
                </View>
              ) : null}

              {/* Student-specific fields */}
              {role === 'student' && (
                <>
                  {p?.zipCode ? (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>ZIP Code</Text>
                      <Text style={styles.infoValue}>{p.zipCode}</Text>
                    </View>
                  ) : null}
                  {p?.gender ? (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Gender</Text>
                      <Text style={styles.infoValue}>
                        {p.gender === 'prefer_not_to_say' ? 'Prefer not to say' : p.gender.charAt(0).toUpperCase() + p.gender.slice(1)}
                      </Text>
                    </View>
                  ) : null}
                  {ntrpLevel ? (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>NTRP Level</Text>
                      <Text style={styles.infoValue}>
                        {ntrpLevel}{NTRP_LEVELS.find(l => l.value === ntrpLevel)?.desc ? ` — ${NTRP_LEVELS.find(l => l.value === ntrpLevel)!.desc}` : ''}
                      </Text>
                    </View>
                  ) : null}
                  {strongSkills.length > 0 && (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>✅ Good At</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {strongSkills.map(s => (
                          <View key={s} style={[styles.skillChip, styles.skillChipStrong]}>
                            <Text style={[styles.skillChipText, styles.skillChipStrongText]}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {workOnSkills.length > 0 && (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>🔧 Working On</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {workOnSkills.map(s => (
                          <View key={s} style={[styles.skillChip, styles.skillChipWork]}>
                            <Text style={[styles.skillChipText, styles.skillChipWorkText]}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Marketing Photos (coach only) */}
              {role === 'coach' && (() => {
                try {
                  const photos: string[] = JSON.parse(p?.photos || '[]');
                  if (!photos.length) return null;
                  return (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Marketing Photos</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {photos.map((url, i) => (
                            <Image key={i} source={{ uri: url }} style={styles.galleryImg} />
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  );
                } catch { return null; }
              })()}

              {/* FAQ (coach only) */}
              {role === 'coach' && (() => {
                try {
                  const faq: { question: string; answer: string }[] = JSON.parse(p?.faq || '[]');
                  if (!faq.length) return null;
                  return (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>FAQ</Text>
                      {faq.map((item, i) => (
                        <View key={i} style={i > 0 ? { marginTop: 12 } : {}}>
                          <Text style={styles.faqDisplayQ}>{item.question}</Text>
                          {item.answer ? <Text style={styles.faqDisplayA}>{item.answer}</Text> : null}
                        </View>
                      ))}
                    </View>
                  );
                } catch { return null; }
              })()}

              {/* Switch role button — visible only when both coach + student accounts exist */}
              {canSwitchRole && (
                <TouchableOpacity
                  style={styles.switchRoleBtn}
                  onPress={() => {
                    Alert.alert(
                      `Switch to ${role === 'coach' ? 'Student' : 'Coach'} View`,
                      `Switch to your ${role === 'coach' ? 'student' : 'coach'} account for this session?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Switch', onPress: () => switchRole() },
                      ],
                    );
                  }}
                >
                  <Text style={styles.switchRoleBtnText}>
                    {role === 'coach' ? '📚 Switch to Student View' : '🎾 Switch to Coach View'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Text style={styles.logoutText}>Log Out</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
                <Text style={styles.deleteAccountText}>Delete Account</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* ── TOKENS TAB (coach only) ── */}
      {activeTab === 'tokens' && (
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Balance card */}
          <View style={styles.tokenBalanceCard}>
            <View style={styles.tokenBalanceLeft}>
              <View style={styles.tokenCoinBig}>
                <Text style={styles.tokenCoinBigText}>T</Text>
              </View>
              <View>
                <Text style={styles.tokenBalanceTitle}>Token Balance</Text>
                <Text style={styles.tokenBalanceSubtitle}>You spend tokens, we save your time.</Text>
              </View>
            </View>
            <Text style={styles.tokenBalanceBig}>
              {(profile ?? coach)?.token_balance ?? 20}
            </Text>
          </View>

          {/* Rules */}
          <View style={styles.tokenRulesCard}>
            <View style={styles.tokenRule}>
              <View style={[styles.tokenDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.tokenRuleText}>
                Each confirmed private/group student consumes <Text style={{ fontWeight: '700' }}>2 tokens</Text>
              </Text>
            </View>
            <View style={[styles.tokenRule, { marginTop: 8 }]}>
              <View style={[styles.tokenDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.tokenRuleText}>
                Cancelling before lesson start <Text style={{ fontWeight: '700' }}>returns the token</Text> · Reschedule confirm does not deduct extra
              </Text>
            </View>
          </View>

          {/* Purchase */}
          <Text style={styles.sectionTitle}>Purchase Tokens</Text>
          <Text style={styles.hint}>Top up your balance to keep receiving student bookings.</Text>

          {([
            { id: 'starter', tokens: 10,  price: '$9.80',  link: 'https://buy.stripe.com/00waEW3KY5dAaLKeiGeUU03' },
            { id: 'value',   tokens: 20,  price: '$15.80', link: 'https://buy.stripe.com/6oU00i1CQ5dA4nm6QeeUU02', featured: true },
            { id: 'pro',     tokens: 160, price: '$44.80', link: 'https://buy.stripe.com/eVq00iepCeOabPO1vUeUU01' },
          ] as { id: string; tokens: number; price: string; link: string; featured?: boolean }[]).map(pkg => (
            <View key={pkg.id} style={[styles.tokenPkgCard, pkg.featured && styles.tokenPkgFeatured]}>
              {pkg.featured && (
                <View style={styles.tokenPkgPopular}>
                  <Text style={styles.tokenPkgPopularText}>Most Popular</Text>
                </View>
              )}
              <View style={styles.tokenPkgRow}>
                <View>
                  <Text style={styles.tokenPkgCount}>{pkg.tokens} tokens</Text>
                  <Text style={styles.tokenPkgPrice}>{pkg.price}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.tokenBuyBtn, checkingOut === pkg.id && { opacity: 0.6 }]}
                  disabled={checkingOut !== null}
                  onPress={async () => {
                    if (!userId) return;
                    setCheckingOut(pkg.id);
                    const url = `${pkg.link}?client_reference_id=${userId}`;
                    try { await Linking.openURL(url); } catch {
                      Alert.alert('Error', 'Could not open payment page.');
                    } finally {
                      setCheckingOut(null);
                    }
                  }}
                >
                  <Text style={styles.tokenBuyBtnText}>
                    {checkingOut === pkg.id ? 'Opening…' : 'Buy Now'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* History */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Token Usage History</Text>
          {tokenHistoryLoading ? (
            <ActivityIndicator color="#2e7d32" style={{ marginVertical: 16 }} />
          ) : tokenHistory.length === 0 ? (
            <View style={styles.tokenHistoryEmpty}>
              <Text style={styles.tokenHistoryEmptyIcon}>T</Text>
              <Text style={styles.tokenHistoryEmptyTitle}>No token activity yet.</Text>
              <Text style={styles.hint}>Your token usage log will appear here.</Text>
            </View>
          ) : (
            tokenHistory.map((item: any) => (
              <View key={item.token_history_id} style={styles.tokenHistoryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tokenHistoryReason}>{item.reason}</Text>
                  <Text style={styles.tokenHistoryTime}>
                    {item.created_at
                      ? new Date(item.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })
                      : ''}
                  </Text>
                </View>
                <Text style={[
                  styles.tokenHistoryDelta,
                  item.delta >= 0 ? styles.tokenHistoryPlus : styles.tokenHistoryMinus,
                ]}>
                  {item.delta >= 0 ? '+' : ''}{item.delta}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── EDIT PROFILE MODAL ── */}
      <Modal visible={editVisible} transparent animationType="slide">
        <ScrollView contentContainerStyle={styles.modalOverlay} keyboardShouldPersistTaps="handled">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            {/* ── Profile Picture ── */}
            <Text style={styles.sectionSubtitle}>Profile Picture</Text>
            <View style={styles.picRow}>
              <View style={styles.picPreview}>
                {profilePicUri ? (
                  <Image source={{ uri: profilePicUri }} style={styles.picPreviewImg} />
                ) : (p?.profilePicture || p?.profile_picture) ? (
                  <Image source={{ uri: p.profilePicture ?? p.profile_picture }} style={styles.picPreviewImg} />
                ) : (
                  <Text style={styles.picPreviewPlaceholder}>🎾</Text>
                )}
              </View>
              <View style={{ gap: 8, flex: 1 }}>
                <TouchableOpacity style={styles.uploadBtn} onPress={pickProfilePic}>
                  <Text style={styles.uploadBtnText}>
                    {profilePicUri ? 'Change Photo' : 'Upload Photo'}
                  </Text>
                </TouchableOpacity>
                {profilePicUri && (
                  <TouchableOpacity
                    style={[styles.uploadBtn, { borderColor: '#dc2626' }]}
                    onPress={() => setProfilePicUri(null)}
                  >
                    <Text style={[styles.uploadBtnText, { color: '#dc2626' }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.fieldLabel}>Full Name <Text style={styles.requiredStar}>*</Text></Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
            />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={[styles.modalInput, { color: '#888', backgroundColor: '#f5f5f5' }]}
              value={editEmail}
              editable={false}
              placeholder="Email address"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.modalInput}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.modalInput, { height: 90, textAlignVertical: 'top' }]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Tell students about yourself…"
              multiline
            />

            {role === 'coach' && (
              <>
                {/* ── Visibility Toggle ── */}
                <Text style={styles.sectionSubtitle}>Profile Visibility</Text>
                <View style={styles.visibilityRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.visibilityLabel}>
                      {editActive ? '✅ Visible to students' : '🔒 Hidden from students'}
                    </Text>
                    <Text style={styles.visibilityHint}>
                      {editActive
                        ? 'Students can find and book you.'
                        : 'Your profile is hidden. Students cannot find you.'}
                    </Text>
                  </View>
                  <Switch
                    value={editActive}
                    onValueChange={setEditActive}
                    trackColor={{ true: '#2e7d32', false: '#ccc' }}
                    thumbColor="#fff"
                  />
                </View>

                <Text style={styles.fieldLabel}>Specialization <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={styles.modalInput}
                  value={editSpecialization}
                  onChangeText={setEditSpecialization}
                  placeholder="e.g. Competitive, Beginner, Kids"
                />

                <Text style={styles.fieldLabel}>Hourly Rate (USD) <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  style={styles.modalInput}
                  value={editHourlyRate}
                  onChangeText={setEditHourlyRate}
                  placeholder="e.g. 80"
                  keyboardType="decimal-pad"
                />

                <Text style={styles.fieldLabel}>Certifications</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editCertifications}
                  onChangeText={setEditCertifications}
                  placeholder="e.g. USPTA, PTR"
                />

                <Text style={styles.fieldLabel}>Years of Experience</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editExperience}
                  onChangeText={setEditExperience}
                  placeholder="e.g. 5"
                  keyboardType="number-pad"
                />

                {/* ── Marketing Photos ── */}
                <Text style={styles.sectionSubtitle}>Marketing Photos ({existingPhotos.length + photoUris.length}/5)</Text>
                <View style={styles.photoGrid}>
                  {existingPhotos.map((url, i) => (
                    <View key={`ex-${i}`} style={styles.photoThumb}>
                      <Image source={{ uri: url }} style={styles.photoThumbImg} />
                      <Pressable
                        style={styles.photoRemoveBtn}
                        onPress={() => setExistingPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <Text style={styles.photoRemoveText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                  {photoUris.map((uri, i) => (
                    <View key={`new-${i}`} style={styles.photoThumb}>
                      <Image source={{ uri }} style={styles.photoThumbImg} />
                      <Pressable
                        style={styles.photoRemoveBtn}
                        onPress={() => setPhotoUris(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <Text style={styles.photoRemoveText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                  {(existingPhotos.length + photoUris.length) < 5 && (
                    <TouchableOpacity style={styles.photoAddBtn} onPress={pickMarketingPhoto}>
                      <Text style={styles.photoAddText}>+</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── FAQ ── */}
                <Text style={styles.sectionSubtitle}>FAQ</Text>
                {faqItems.map((item, idx) => (
                  <View key={idx} style={styles.faqItem}>
                    {faqEditIdx === idx ? (
                      <>
                        <TextInput
                          style={styles.modalInput}
                          value={faqEditQ}
                          onChangeText={setFaqEditQ}
                          placeholder="e.g. Do you offer group lessons?"
                        />
                        <TextInput
                          style={[styles.modalInput, { marginTop: 6, textAlignVertical: 'top', height: 70 }]}
                          value={faqEditA}
                          onChangeText={setFaqEditA}
                          placeholder="e.g. Yes, I offer group lessons for up to 4 students."
                          multiline
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                          <TouchableOpacity
                            style={[styles.faqActionBtn, { backgroundColor: '#2e7d32' }]}
                            onPress={() => saveEditFaq(idx)}
                          >
                            <Text style={styles.faqActionText}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.faqActionBtn, { borderWidth: 1, borderColor: '#ccc' }]}
                            onPress={() => setFaqEditIdx(null)}
                          >
                            <Text style={[styles.faqActionText, { color: '#555' }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.faqQ}>{item.question}</Text>
                          {item.answer ? <Text style={styles.faqA}>{item.answer}</Text> : null}
                        </View>
                        <TouchableOpacity onPress={() => startEditFaq(idx)} style={{ padding: 4 }}>
                          <Text style={{ color: '#667eea', fontSize: 13, fontWeight: '600' }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeFaqItem(idx)} style={{ padding: 4 }}>
                          <Text style={{ color: '#dc2626', fontSize: 16 }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
                <View style={styles.faqAddForm}>
                  <TextInput
                    style={styles.modalInput}
                    value={faqQuestion}
                    onChangeText={setFaqQuestion}
                    placeholder="e.g. Do you offer group lessons?"
                  />
                  <TextInput
                    style={[styles.modalInput, { marginTop: 6, textAlignVertical: 'top', height: 70 }]}
                    value={faqAnswer}
                    onChangeText={setFaqAnswer}
                    placeholder="e.g. Yes, I offer group lessons for up to 4 students."
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.faqActionBtn, { backgroundColor: '#2e7d32', marginTop: 8, alignSelf: 'flex-start' }]}
                    onPress={addFaqItem}
                    disabled={!faqQuestion.trim() || !faqAnswer.trim()}
                  >
                    <Text style={styles.faqActionText}>+ Add FAQ</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Timezone ── */}
            <Text style={styles.sectionSubtitle}>Timezone</Text>
            <TouchableOpacity
              style={[styles.modalInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
              onPress={() => setShowTimezoneSelector(v => !v)}
            >
              <Text style={{ color: editTimezone ? '#1f2937' : '#aaa', fontSize: 15 }}>
                {TIMEZONES.find(t => t.id === editTimezone)?.label ?? 'Select timezone…'}
              </Text>
              <Text style={{ color: '#888' }}>{showTimezoneSelector ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showTimezoneSelector && (
              <View style={styles.tzList}>
                {TIMEZONES.map(tz => (
                  <TouchableOpacity
                    key={tz.id}
                    style={[styles.tzItem, editTimezone === tz.id && styles.tzItemActive]}
                    onPress={() => { setEditTimezone(tz.id); setShowTimezoneSelector(false); }}
                  >
                    <Text style={[styles.tzItemText, editTimezone === tz.id && { color: '#2e7d32', fontWeight: '700' }]}>
                      {tz.label}
                    </Text>
                    {editTimezone === tz.id && <Text style={{ color: '#2e7d32' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                onPress={() => setEditVisible(false)}
                disabled={editSaving}
              >
                <Text style={[styles.pillText, { color: '#555' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, styles.pillPurple, { flex: 1 }, editSaving && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={editSaving}
              >
                <Text style={styles.pillText}>
                  {editSaving
                    ? uploadingPic
                      ? 'Uploading pic…'
                      : uploadingPhotos
                        ? 'Uploading photos…'
                        : 'Saving…'
                    : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>

      {/* ── SKILLS TAB (student only) ── */}
      {activeTab === 'skills' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* NTRP Level */}
          <Text style={styles.sectionTitle}>🎾 My NTRP Level</Text>
          <Text style={styles.hint}>Select your current NTRP skill level.</Text>
          <TouchableOpacity
            style={styles.ntrpSelector}
            onPress={() => setShowNtrpPicker(true)}
          >
            {ntrpLevel ? (
              <View>
                <Text style={styles.ntrpValue}>{ntrpLevel}</Text>
                <Text style={styles.ntrpDesc}>
                  {NTRP_LEVELS.find(l => l.value === ntrpLevel)?.desc ?? ''}
                </Text>
              </View>
            ) : (
              <Text style={styles.ntrpPlaceholder}>Tap to select your level…</Text>
            )}
            <Text style={styles.ntrpArrow}>›</Text>
          </TouchableOpacity>

          {/* Coaching tips based on level */}
          {ntrpLevel ? (() => {
            const key = getNtrpKey(ntrpLevel);
            const tips = LEVEL_TIPS[key];
            if (!tips) return null;
            return (
              <View style={styles.tipsCard}>
                <Text style={styles.tipsHeader}>{tips.emoji} {tips.title} — Coaching Tips</Text>
                {tips.tips.map((tip, i) => (
                  <View key={i} style={styles.tipRow}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            );
          })() : null}

          {/* Skills tracker */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>🎾 My Skills</Text>
          <Text style={styles.hint}>
            Tag the skills you've mastered and those you're actively working on. Coaches can see this when you book a session.
          </Text>

          {/* ── Skills I'm Good At ── */}
          <View style={styles.skillPanelHeader}>
            <Text style={styles.skillPanelTitle}>✅ Skills I'm Good At</Text>
            {strongSkills.length > 0 && (
              <TouchableOpacity onPress={() => setStrongSkills([])}>
                <Text style={styles.skillClearBtn}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          {SKILL_CATEGORIES.map(cat => (
            <View key={`strong-${cat.category}`} style={styles.skillCategoryCard}>
              <Text style={styles.skillCategoryTitle}>{cat.category}</Text>
              <View style={styles.chipWrap}>
                {cat.skills.map(skill => {
                  const selected = strongSkills.includes(skill);
                  return (
                    <TouchableOpacity
                      key={skill}
                      style={[styles.skillChip, selected && styles.skillChipStrong]}
                      onPress={() => toggleStrongSkill(skill)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.skillChipText, selected && styles.skillChipStrongText]}>
                        {selected ? '\u2713 ' : ''}{skill}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* ── Skills I Need to Work On ── */}
          <View style={[styles.skillPanelHeader, { marginTop: 8 }]}>
            <Text style={styles.skillPanelTitle}>🔧 Skills I Need to Work On</Text>
            {workOnSkills.length > 0 && (
              <TouchableOpacity onPress={() => setWorkOnSkills([])}>
                <Text style={styles.skillClearBtn}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          {SKILL_CATEGORIES.map(cat => (
            <View key={`work-${cat.category}`} style={styles.skillCategoryCard}>
              <Text style={styles.skillCategoryTitle}>{cat.category}</Text>
              <View style={styles.chipWrap}>
                {cat.skills.map(skill => {
                  const selected = workOnSkills.includes(skill);
                  const isStrong = strongSkills.includes(skill);
                  return (
                    <TouchableOpacity
                      key={skill}
                      style={[
                        styles.skillChip,
                        selected && styles.skillChipWork,
                        isStrong && styles.skillChipDisabled,
                      ]}
                      onPress={() => toggleWorkOnSkill(skill)}
                      activeOpacity={isStrong ? 1 : 0.7}
                      disabled={isStrong}
                    >
                      <Text style={[
                        styles.skillChipText,
                        selected && styles.skillChipWorkText,
                        isStrong && styles.skillChipDisabledText,
                      ]}>
                        {selected ? '🔧 ' : ''}{skill}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.saveBtn, skillsSaving && styles.saveBtnDisabled]}
            onPress={handleSaveSkills}
            disabled={skillsSaving}
          >
            <Text style={styles.saveBtnText}>
              {skillsSaved ? '✅ Saved!' : skillsSaving ? 'Saving…' : 'Save Skills & NTRP'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* NTRP picker modal */}
      <Modal visible={showNtrpPicker} transparent animationType="slide" onRequestClose={() => setShowNtrpPicker(false)}>
        <View style={styles.ntrpModalOverlay}>
          <View style={styles.ntrpModalCard}>
            <Text style={styles.ntrpModalTitle}>Select NTRP Level</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {NTRP_LEVELS.map(l => (
                <TouchableOpacity
                  key={l.value}
                  style={[styles.ntrpOption, ntrpLevel === l.value && styles.ntrpOptionActive]}
                  onPress={() => { setNtrpLevel(l.value); setShowNtrpPicker(false); }}
                >
                  <Text style={[styles.ntrpOptionValue, ntrpLevel === l.value && styles.ntrpOptionValueActive]}>{l.value}</Text>
                  <Text style={[styles.ntrpOptionDesc, ntrpLevel === l.value && styles.ntrpOptionDescActive]}>{l.desc}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.saveBtn, { marginTop: 12 }]} onPress={() => setShowNtrpPicker(false)}>
              <Text style={styles.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── AVAILABILITY TAB (coach only) ── */}
      {activeTab === 'availability' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionTitle}>📅 Weekly Schedule</Text>
          <Text style={styles.hint}>Set your regular repeating availability.</Text>

          {DAYS.map(day => (
            <View key={day} style={styles.dayRow}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{DAY_LABELS[day]}</Text>
                <Switch
                  value={avail[day].available}
                  onValueChange={val =>
                    setAvail(a => ({ ...a, [day]: { ...a[day], available: val } }))
                  }
                  trackColor={{ true: '#2e7d32', false: '#ccc' }}
                  thumbColor="#fff"
                />
              </View>
              {avail[day].available && (
                <View style={styles.windowList}>
                  {avail[day].windows.map((win, wi) => (
                    <View key={wi} style={styles.windowRow}>
                      <AmPmTimePicker
                        value={win.start}
                        onChange={v => updateWindow(day, wi, 'start', v)}
                      />
                      <Text style={styles.to}>–</Text>
                      <AmPmTimePicker
                        value={win.end}
                        onChange={v => updateWindow(day, wi, 'end', v)}
                      />
                      {avail[day].windows.length > 1 && (
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => removeWindow(day, wi)}
                        >
                          <Text style={styles.removeBtnText}>×</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addWindowBtn} onPress={() => addWindow(day)}>
                    <Text style={styles.addWindowText}>+ Add window</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSaveAvail}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saved ? '✅ Saved!' : saving ? 'Saving…' : 'Save Weekly Schedule'}
            </Text>
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🚫 Blocked Dates</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowBlockModal(true)}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Dates when you're unavailable regardless of weekly schedule.</Text>

          {loadingBlocks ? (
            <ActivityIndicator color="#2e7d32" style={{ marginVertical: 12 }} />
          ) : blocks.length === 0 ? (
            <Text style={styles.empty}>No blocked dates.</Text>
          ) : (
            blocks.map(b => (
              <View key={b.block_id} style={styles.blockItem}>
                <View>
                  <Text style={styles.blockDates}>
                    {formatDate(b.start_date)}{b.end_date !== b.start_date ? ` – ${formatDate(b.end_date)}` : ''}
                  </Text>
                  {b.label ? <Text style={styles.blockLabel}>{b.label}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => handleDeleteBlock(b)}>
                  <Text style={styles.deleteBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Block Modal */}
      <Modal visible={showBlockModal} transparent animationType="slide">
        <ScrollView contentContainerStyle={styles.modalOverlay} keyboardShouldPersistTaps="handled">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Block Dates</Text>

            <Text style={styles.fieldLabel}>Start date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={today}
              value={blockStart}
              onChangeText={setBlockStart}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>End date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={today}
              value={blockEnd}
              onChangeText={setBlockEnd}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Label (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Vacation, Tournament"
              value={blockLabel}
              onChangeText={setBlockLabel}
            />

            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                onPress={() => setShowBlockModal(false)}
              >
                <Text style={[styles.pillText, { color: '#555' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, styles.pillPurple, { flex: 1 }, savingBlock && { opacity: 0.6 }]}
                onPress={handleAddBlock}
                disabled={savingBlock}
              >
                <Text style={styles.pillText}>{savingBlock ? 'Saving…' : 'Add Block'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f5' },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 32 },

  // Internal tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#2e7d32',
  },
  tabLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  tabLabelActive: { color: '#2e7d32' },

  // Profile
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  avatarImg: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  avatarText: { fontSize: 30, color: '#fff', fontWeight: '700' },
  profileName: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 4 },
  profileEmail: { fontSize: 14, color: '#888', marginBottom: 12 },
  rolePill: {
    backgroundColor: '#f0faf0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: '#c8e6c9',
    marginBottom: 12,
  },
  rolePillText: { fontSize: 13, color: '#2e7d32', fontWeight: '600' },
  editBtn: {
    borderWidth: 1, borderColor: '#2e7d32', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 7,
  },
  editBtnText: { color: '#2e7d32', fontSize: 14, fontWeight: '600' },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  infoLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 },
  infoValue: { fontSize: 15, color: '#333' },

  logoutBtn: {
    borderWidth: 1, borderColor: '#dc2626', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },

  deleteAccountBtn: {
    borderWidth: 1, borderColor: '#9ca3af', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 10, marginBottom: 8,
  },
  deleteAccountText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },

  switchRoleBtn: {
    borderWidth: 1.5, borderColor: '#2e7d32', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 24,
    backgroundColor: '#f0faf0',
  },
  switchRoleBtnText: { color: '#2e7d32', fontSize: 15, fontWeight: '600' },

  // Skills tab
  ntrpSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: '#2e7d32', marginBottom: 14,
  },
  ntrpValue: { fontSize: 28, fontWeight: '800', color: '#2e7d32' },
  ntrpDesc: { fontSize: 13, color: '#555', marginTop: 2 },
  ntrpPlaceholder: { fontSize: 15, color: '#aaa' },
  ntrpArrow: { fontSize: 24, color: '#2e7d32', fontWeight: '700' },
  tipsCard: {
    backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#c8e6c9', marginBottom: 8,
  },
  tipsHeader: { fontSize: 15, fontWeight: '700', color: '#2e7d32', marginBottom: 10 },
  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  tipBullet: { fontSize: 14, color: '#2e7d32', marginTop: 1 },
  tipText: { fontSize: 14, color: '#444', flex: 1, lineHeight: 20 },
  skillCategoryCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  skillCategoryTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  skillPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  skillPanelTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  skillClearBtn: { fontSize: 13, color: '#888', textDecorationLine: 'underline' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#f9f9f9', paddingHorizontal: 12, paddingVertical: 6 },
  skillChipStrong: { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' },
  skillChipStrongText: { color: '#2e7d32', fontWeight: '600' },
  skillChipWork: { backgroundColor: '#fff7ed', borderColor: '#f97316' },
  skillChipWorkText: { color: '#c2410c', fontWeight: '600' },
  skillChipDisabled: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', opacity: 0.5 },
  skillChipDisabledText: { color: '#9ca3af' },
  skillChipText: { fontSize: 13, color: '#555' },
  ntrpModalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  ntrpModalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  ntrpModalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 16 },
  ntrpOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10,
    marginBottom: 6, backgroundColor: '#f9f9f9',
  },
  ntrpOptionActive: { backgroundColor: '#e8f5e9', borderWidth: 1.5, borderColor: '#2e7d32' },
  ntrpOptionValue: { fontSize: 18, fontWeight: '700', color: '#222', minWidth: 36 },
  ntrpOptionValueActive: { color: '#2e7d32' },
  ntrpOptionDesc: { fontSize: 13, color: '#888', flex: 1, marginLeft: 12 },
  ntrpOptionDescActive: { color: '#2e7d32' },

  // Notifications
  notifIcon: { fontSize: 22, marginRight: 4, marginTop: 1 },
  hint: { fontSize: 13, color: '#888', marginBottom: 10, marginTop: -4 },
  empty: { fontSize: 14, color: '#aaa', textAlign: 'center', marginVertical: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#222', marginBottom: 6, marginTop: 16 },

  dayRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { fontSize: 15, fontWeight: '600', color: '#333' },

  windowList: { marginTop: 10, gap: 6 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#222',
  },
  to: { fontSize: 16, color: '#888' },
  removeBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { fontSize: 18, color: '#dc2626', lineHeight: 20 },
  addWindowBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  addWindowText: { color: '#2e7d32', fontSize: 13, fontWeight: '600' },

  saveBtn: {
    backgroundColor: '#2e7d32', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 8, marginBottom: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  addBtn: { backgroundColor: '#2e7d32', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  blockItem: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  blockDates: { fontSize: 14, fontWeight: '600', color: '#222' },
  blockLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  deleteBtn: { fontSize: 18, color: '#dc2626', paddingHorizontal: 4 },

  // Profile completion banner
  completionBanner: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f0fdf4',
    borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#86efac', gap: 10,
  },
  completionTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 6 },
  completionItem:  { fontSize: 13, color: '#15803d', marginBottom: 2 },
  completionCta:   { fontSize: 13, fontWeight: '700', color: '#2e7d32', marginTop: 4 },

  // Timezone selector
  tzList:      { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 4 },
  tzItem:      { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tzItemActive: { backgroundColor: '#f0fdf4' },
  tzItemText:  { fontSize: 14, color: '#374151' },

  // Notifications
  markAllBtn: {
    backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#eee',
    padding: 12, alignItems: 'flex-end',
  },
  markAllText: { color: '#2e7d32', fontSize: 13, fontWeight: '600' },
  notifItem: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  notifUnread: { backgroundColor: '#f0fdf4' },
  notifDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#2e7d32', marginTop: 5,
  },
  notifMsg: { fontSize: 14, color: '#333', lineHeight: 20 },
  notifTime: { fontSize: 12, color: '#aaa', marginTop: 4 },

  // Modal
  modalOverlay: { flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 8 },
  modalInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  pill: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  pillGhost: { borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  pillGreen: { backgroundColor: '#2e7d32' },
  pillPurple: { backgroundColor: '#2e7d32' },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  requiredStar: { color: '#dc2626', fontSize: 13 },

  // Visibility row
  visibilityRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc',
    borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 4,
  },
  visibilityLabel: { fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 2 },
  visibilityHint: { fontSize: 12, color: '#6b7280', lineHeight: 16 },

  // Section subtitle inside modal
  sectionSubtitle: {
    fontSize: 13, fontWeight: '700', color: '#444',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 18, marginBottom: 8,
  },

  // Profile pic upload row
  picRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  picPreview: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#f0f4f0', borderWidth: 1, borderColor: '#e0e0e0',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  picPreviewImg: { width: 72, height: 72, borderRadius: 36 },
  picPreviewPlaceholder: { fontSize: 28 },
  uploadBtn: {
    borderWidth: 1, borderColor: '#2e7d32', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  uploadBtnText: { color: '#2e7d32', fontSize: 13, fontWeight: '600' },

  // Marketing photo grid
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  photoThumb: {
    width: 80, height: 80, borderRadius: 8, overflow: 'hidden',
    position: 'relative', backgroundColor: '#f0f0f0',
  },
  photoThumbImg: { width: 80, height: 80 },
  photoRemoveBtn: {
    position: 'absolute', top: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 15, lineHeight: 17 },
  photoAddBtn: {
    width: 80, height: 80, borderRadius: 8,
    borderWidth: 2, borderColor: '#ccc', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddText: { fontSize: 28, color: '#aaa', lineHeight: 32 },

  // Gallery display (profile view)
  galleryImg: { width: 90, height: 90, borderRadius: 8 },

  // FAQ inside modal
  faqItem: {
    backgroundColor: '#f8fafc', borderRadius: 8,
    padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  faqQ: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  faqA: { fontSize: 13, color: '#555', marginTop: 3 },
  faqAddForm: { marginTop: 8 },
  faqActionBtn: {
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
  },
  faqActionText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // FAQ display (profile view)
  faqDisplayQ: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  faqDisplayA: { fontSize: 13, color: '#555', marginTop: 2 },

  // ── Token tab ──────────────────────────────────────────────────────────────
  tokenBalanceCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  tokenBalanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  tokenCoinBig: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2e7d32', alignItems: 'center', justifyContent: 'center',
  },
  tokenCoinBigText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  tokenBalanceTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  tokenBalanceSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  tokenBalanceBig: { fontSize: 36, fontWeight: '900', color: '#2e7d32' },

  tokenRulesCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  tokenRule: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tokenDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  tokenRuleText: { fontSize: 13, color: '#444', flex: 1, lineHeight: 19 },

  tokenPkgCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  tokenPkgFeatured: { borderColor: '#2e7d32', backgroundColor: '#f0fdf4' },
  tokenPkgPopular: {
    alignSelf: 'flex-start', backgroundColor: '#2e7d32',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10,
  },
  tokenPkgPopularText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tokenPkgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tokenPkgCount: { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  tokenPkgPrice: { fontSize: 15, color: '#555', marginTop: 2 },
  tokenBuyBtn: {
    backgroundColor: '#2e7d32', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  tokenBuyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  tokenHistoryRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 6,
    flexDirection: 'row', alignItems: 'center',
  },
  tokenHistoryReason: { fontSize: 14, color: '#222', fontWeight: '500' },
  tokenHistoryTime: { fontSize: 12, color: '#aaa', marginTop: 2 },
  tokenHistoryDelta: { fontSize: 18, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  tokenHistoryPlus: { color: '#2e7d32' },
  tokenHistoryMinus: { color: '#ef4444' },
  tokenHistoryEmpty: { alignItems: 'center', paddingVertical: 32 },
  tokenHistoryEmptyIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#e8f5e9', textAlign: 'center', lineHeight: 52,
    fontSize: 24, fontWeight: '900', color: '#2e7d32',
    marginBottom: 10, overflow: 'hidden',
  },
  tokenHistoryEmptyTitle: { fontSize: 15, fontWeight: '700', color: '#555', marginBottom: 4 },
});
