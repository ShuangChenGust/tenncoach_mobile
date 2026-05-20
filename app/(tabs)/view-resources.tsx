// ── Coach Session Management Modal ───────────────────────────────────────
import type { Booking, Student } from '../../src/types';

type CoachSessionsModalProps = {
  visible: boolean;
  onClose: () => void;
  coachId?: string | number;
};

const CoachSessionsModal: React.FC<CoachSessionsModalProps> = ({ visible, onClose, coachId }) => {
  const [sessions, setSessions] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [studentDetail, setStudentDetail] = useState<Student | null>(null);
  useEffect(() => {
    if (!visible || !coachId) return;
    setLoading(true);
    import('../../src/api').then(({ bookingsAPI }) => {
      bookingsAPI.getForCoach(coachId).then((data: Booking[] = []) => {
        setSessions(Array.isArray(data) ? data : []);
        setLoading(false);
      });
    });
  }, [visible, coachId]);

  const handleAction = async (
    type: 'attended' | 'noShow' | 'studentDetail',
    bookingId: number,
    studentId?: number
  ): Promise<void> => {
    setActionLoading(true);
    const { bookingsAPI, studentsAPI } = await import('../../src/api');
    if (type === 'attended') await bookingsAPI.markAttended(bookingId);
    if (type === 'noShow') await bookingsAPI.markNoShow(bookingId);
    // Refresh session list
    if (coachId !== undefined) {
      const data = await bookingsAPI.getForCoach(coachId);
      setSessions(Array.isArray(data) ? data : []);
    }
    setActionLoading(false);
    if (type === 'studentDetail' && studentId) {
      const detail = await studentsAPI.getById(studentId);
      setStudentDetail(detail as Student);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '92%', maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '700', fontSize: 18 }}>My Sessions</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 22 }}>✕</Text></TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator style={{ margin: 32 }} color="#2e7d32" />
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              {sessions.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#888', margin: 32 }}>No upcoming sessions.</Text>
              ) : sessions.map(session => (
                <View key={session.booking_id} style={{ borderBottomWidth: 1, borderColor: '#eee', padding: 16 }}>
                  <Text style={{ fontWeight: '700', fontSize: 16 }}>{session.student_name}</Text>
                  <Text style={{ color: '#555', marginBottom: 4 }}>{session.date} {session.start_time}–{session.end_time}</Text>
                  <Text style={{ color: '#888', marginBottom: 4 }}>Status: {session.status}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                    <TouchableOpacity disabled={actionLoading} style={{ backgroundColor: '#2e7d32', borderRadius: 8, padding: 8, marginRight: 8 }} onPress={() => handleAction('attended', session.booking_id)}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Check In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={actionLoading} style={{ backgroundColor: '#dc2626', borderRadius: 8, padding: 8, marginRight: 8 }} onPress={() => handleAction('noShow', session.booking_id)}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Mark No Show</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={actionLoading} style={{ backgroundColor: '#2563eb', borderRadius: 8, padding: 8 }} onPress={() => handleAction('studentDetail', session.booking_id, session.student_id)}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Student Detail</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
          {studentDetail && (
            <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#eee' }}>
              <Text style={{ fontWeight: '700', fontSize: 16 }}>Student Detail</Text>
              <Text>Name: {studentDetail.name}</Text>
              <Text>Email: {studentDetail.email}</Text>
              {studentDetail.zipCode && <Text>ZIP: {studentDetail.zipCode}</Text>}
              {studentDetail.gender && <Text>Gender: {studentDetail.gender}</Text>}
              <TouchableOpacity style={{ marginTop: 8 }} onPress={() => setStudentDetail(null)}><Text style={{ color: '#2563eb' }}>Close</Text></TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../src/context/AuthContext';
import {
  coachesListAPI, reviewsAPI, studentGroupLessonsAPI,
  studentBookingRequestAPI, coachBlocksAPI, moderationAPI,
} from '../../src/api';
import CoachMapWebView, { CoachSingleMapWebView } from '../../components/CoachMapWebView';
import WeatherWidget from '../../components/WeatherWidget';
import CoachProfileSheet from '../../components/CoachProfileSheet';

// ── Types ────────────────────────────────────────────────────────────────────
interface CoachItem {
  coach_id: number;
  user_id: number;
  name: string;
  specialization?: string;
  bio?: string;
  hourlyRate?: number;
  Hourly_pay?: number;
  hide_price?: boolean | number;
  profilePicture?: string;
  profile_picture?: string;
  certifications?: string;
  promotion?: string;
  experience?: number;
  coachType?: string;
  courtLocation?: string;
  court_locations?: string;
  courtLatitude?: number;
  courtLongitude?: number;
  address?: string;
  availability?: string;
  faq?: string;
  photos?: string;
  avg_rating?: number | null;
  review_count?: number;
  completed_sessions_count?: number;
  on_time_rate?: number | null;
  verified?: boolean;
}

interface GroupLessonItem {
  group_lesson_id: number;
  coach_id: number;
  coach_user_id: number;
  coach_name: string;
  title?: string;
  description?: string;
  skill_level?: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  price: number;
  location: string;
  max_registration: number;
  waitlist_max: number;
  status: 'active' | 'cancelled';
  require_confirmation: boolean;
  waiver_text?: string | null;
  confirmed_count?: number;
  waitlisted_count?: number;
  pending_count?: number;
  remaining_spots?: number;
  student_registration_id?: number | null;
  student_registration_status?: string | null;
}

interface ReviewData {
  reviews: Array<{ review_id: number; student_id: number; student_name: string; rating: number; body?: string; created_at?: string }>;
  avg_rating: number | null;
  count: number;
  can_review?: boolean;
}

type ActiveTab = 'coaches' | 'classes';

const COACH_TYPES = [
  { id: 'hitting-partner', label: 'Hitting Partner' },
  { id: 'private-coach',   label: 'Private Coach'   },
  { id: 'group-lesson',    label: 'Group Lesson'     },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function fmtTime(t: string) {
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return t; }
}

function fmtDate(d: string) {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return d; }
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Text key={s} style={{ fontSize: size, color: s <= Math.round(rating) ? '#f59e0b' : '#e5e7eb' }}>★</Text>
      ))}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function ViewResourcesScreen() {
  const { student } = useAuth();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('coaches');

  // Coaches list
  const [coaches, setCoaches] = useState<CoachItem[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  // Group lessons list
  const [lessons, setLessons] = useState<GroupLessonItem[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  // Coach detail
  const [selectedCoach, setSelectedCoach] = useState<CoachItem | null>(null);
  const [reviews, setReviews] = useState<ReviewData | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Booking modal
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingCoach, setBookingCoach] = useState<CoachItem | null>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingStart, setBookingStart] = useState('10:00');
  const [bookingEnd, setBookingEnd] = useState('11:00');
  const [bookingNote, setBookingNote] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingMsg, setBookingMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  // Step-based booking flow
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookingCourts, setBookingCourts] = useState<Array<{ label: string; address: string }>>([]);
  const [selectedCourt, setSelectedCourt] = useState<number>(-1);
  // Availability-aware calendar
  const [coachBlocks, setCoachBlocks] = useState<Array<{ start_date: string; end_date: string }>>([]);
  const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(new Set());
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverAlreadyAccepted, setWaiverAlreadyAccepted] = useState(false);

  // Group lesson detail
  const [selectedLesson, setSelectedLesson] = useState<GroupLessonItem | null>(null);
  const [glRegistering, setGlRegistering] = useState(false);
  const [glMsg, setGlMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [glShowForm, setGlShowForm] = useState(false);
  const [glRegName, setGlRegName] = useState('');
  const [glRegRating, setGlRegRating] = useState('');
  const [glRegEmail, setGlRegEmail] = useState('');
  const [glRegPhone, setGlRegPhone] = useState('');
  const [glRegGender, setGlRegGender] = useState('');
  const [glWaiverAccepted, setGlWaiverAccepted] = useState(false);



  // Lightbox
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Coach profile sheet (report / block)
  const [showCoachProfileSheet, setShowCoachProfileSheet] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<Set<number>>(new Set());

  const studentId = Number(student?.user_id ?? 0);
  const studentName = student?.name ?? '';

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadCoaches = useCallback(async () => {
    try {
      const data = await coachesListAPI.getAll();
      setCoaches(Array.isArray(data) ? data : []);
    } catch {
      setCoaches([]);
    } finally {
      setLoadingCoaches(false);
    }
  }, []);

  useEffect(() => {
    if (!studentId) return;
    moderationAPI.getBlockedUsers(studentId)
      .then((ids: number[]) => { if (Array.isArray(ids)) setBlockedUsers(new Set(ids)); })
      .catch(() => {});
  }, [studentId]);

  const loadGroupLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const data = await studentGroupLessonsAPI.getAllPublic(studentId || undefined);
      setLessons(Array.isArray(data) ? data : []);
    } catch {
      setLessons([]);
    } finally {
      setLoadingLessons(false);
    }
  }, [studentId]);

  useEffect(() => { loadCoaches(); }, [loadCoaches]);
  useEffect(() => {
    if (activeTab === 'classes') loadGroupLessons();
  }, [activeTab, loadGroupLessons]);

  // Load reviews when coach selected
  useEffect(() => {
    if (!selectedCoach) return;
    const coachId = selectedCoach.coach_id ?? selectedCoach.user_id;
    setReviews(null);
    setReviewBody('');
    setReviewRating(5);
    setReviewMsg(null);
    setShowReviewForm(false);
    setReviewsLoading(true);
    reviewsAPI.getForCoach(coachId, studentId || undefined)
      .then(d => setReviews(d))
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [selectedCoach]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredCoaches = useMemo(() => {
    let result = coaches.filter(c => !blockedUsers.has(c.user_id));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.specialization ?? '').toLowerCase().includes(q) ||
        (c.bio ?? '').toLowerCase().includes(q)
      );
    }
    if (typeFilter.length > 0) {
      result = result.filter(c => {
        if (!c.coachType) return false;
        const types = c.coachType.split(',').map(t => t.trim());
        return typeFilter.some(f => types.includes(f));
      });
    }
    return result;
  }, [coaches, search, typeFilter, blockedUsers]);

  const filteredLessons = useMemo(() => {
    let result = lessons.filter(l => !blockedUsers.has(l.coach_user_id));
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter(l =>
      (l.title ?? '').toLowerCase().includes(q) ||
      l.coach_name.toLowerCase().includes(q) ||
      (l.description ?? '').toLowerCase().includes(q)
    );
  }, [lessons, search, blockedUsers]);

  // Calendar state for booking
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleTypeFilter = (type: string) =>
    setTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );

  const handleContactCoach = (coach: CoachItem) => {
    router.push({
      pathname: '/(tabs)/messages',
      params: { coachUserId: String(coach.user_id), coachName: coach.name },
    });
  };

  // ── Availability helpers ──────────────────────────────────────────────────
  const WEEKDAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  const bookingAvailParsed: Record<string, any> = useMemo(() => {
    try { return JSON.parse(bookingCoach?.availability || '{}'); } catch { return {}; }
  }, [bookingCoach]);

  const bookingAdhocSlots: Array<{ date: string; start: string; end: string }> = useMemo(() =>
    Array.isArray(bookingAvailParsed.adhoc_slots) ? bookingAvailParsed.adhoc_slots : [],
  [bookingAvailParsed]);

  const bookingCalToStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const hasWeeklyAvailability = (d: Date) => {
    const key = WEEKDAY_KEYS[d.getDay()];
    const dayCfg = bookingAvailParsed[key];
    if (!dayCfg?.available) return false;
    if (Array.isArray(dayCfg.windows)) return dayCfg.windows.some((w: any) => !!w?.start && !!w?.end);
    return !!dayCfg.start && !!dayCfg.end;
  };

  const isAvailableDay = (d: Date): boolean => {
    const ds = bookingCalToStr(d);
    if (fullyBookedDates.has(ds)) return false;
    if (coachBlocks.some(bl => ds >= bl.start_date && ds <= bl.end_date)) return false;

    // For today: check if end time is more than 30 min in the future
    const nowLocal = new Date();
    const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
    if (ds === todayStr) {
      const nowObj = new Date();
      const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();
      const toEndMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const key = WEEKDAY_KEYS[d.getDay()];
      const dayCfg = bookingAvailParsed[key];
      let weeklyHasFuture = false;
      if (dayCfg?.available) {
        if (Array.isArray(dayCfg.windows)) {
          weeklyHasFuture = dayCfg.windows.some(
            (w: any) => w?.end && toEndMins(w.end) > nowMins + 30,
          );
        } else if (dayCfg.end) {
          weeklyHasFuture = toEndMins(dayCfg.end) > nowMins + 30;
        }
      }
      const adhocHasFuture = bookingAdhocSlots.some(
        s => s.date === ds && s.end && toEndMins(s.end) > nowMins + 30,
      );
      return weeklyHasFuture || adhocHasFuture;
    }

    if (hasWeeklyAvailability(d)) return true;
    return bookingAdhocSlots.some(s => s.date === ds && !!s.start && !!s.end);
  };

  const handleOpenBooking = async (coach: CoachItem) => {
    setBookingCoach(coach);
    setBookingDate('');
    setBookingStart('10:00');
    setBookingEnd('11:00');
    setBookingNote('');
    setBookingMsg(null);
    setBookingStep(1);
    setAvailableSlots([]);
    setSelectedSlots([]);
    setSlotsLoading(false);
    setFullyBookedDates(new Set());
    // Check if user has already accepted the waiver in a previous session
    const prevAccepted = await SecureStore.getItemAsync('tenncoach_waiver_accepted');
    const alreadyAccepted = prevAccepted === 'true';
    setWaiverAlreadyAccepted(alreadyAccepted);
    setWaiverAccepted(alreadyAccepted);
    // Reset calendar to current month
    const today = new Date();
    today.setDate(1);
    today.setHours(0, 0, 0, 0);
    setCalendarMonth(today);
    let courts: Array<{ label: string; address: string }> = [];
    try { courts = JSON.parse(coach.court_locations || '[]'); } catch {}
    setBookingCourts(courts);
    setSelectedCourt(courts.length > 0 ? 0 : -1);
    // Load blocked dates for this coach
    setCoachBlocks([]);
    const cid = coach.coach_id ?? coach.user_id;
    coachBlocksAPI.getBlocks(String(cid))
      .then((data: any) => { if (Array.isArray(data)) setCoachBlocks(data); })
      .catch(() => {});
    setShowBookingModal(true);
  };

  const handleSelectDate = async (date: string, coachToUse?: CoachItem) => {
    const c = coachToUse ?? bookingCoach;
    if (!c) return;
    setBookingDate(date);
    setBookingStep(2);
    setSlotsLoading(true);
    setAvailableSlots([]);
    setSelectedSlots([]);
    try {
      const result = await studentBookingRequestAPI.getAvailableSlots(
        c.coach_id ?? c.user_id, date,
      );
      let slots: string[] = Array.isArray(result?.slots) ? [...new Set<string>(result.slots)].sort() : [];
      // For today, filter past slots (minute-precise)
      const nowLocal = new Date();
      const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
      const nowObj = new Date();
      const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();
      if (date === todayStr) {
        slots = slots.filter(s => { const [sh, sm] = s.split(':').map(Number); return sh * 60 + sm > nowMins; });
      }
      // If no slots, mark date as fully booked and go back to calendar
      if (slots.length === 0) {
        setFullyBookedDates(prev => { const s = new Set(prev); s.add(date); return s; });
        setBookingStep(1);
        setBookingDate('');
      }
      setAvailableSlots(slots);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMins = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const handleSelectSlot = (slot: string) => {
    setSelectedSlots(prev => {
      if (prev.length === 0) return [slot];
      const first = prev[0];
      const last = prev[prev.length - 1];
      // Deselect last slot
      if (slot === last) return prev.length > 1 ? prev.slice(0, -1) : [];
      // Deselect first slot
      if (slot === first) return prev.slice(1);
      // Extend at end (slot is 30 min after last AND consecutive in availableSlots)
      if (toMins(slot) === toMins(last) + 30 && availableSlots.includes(slot)) return [...prev, slot];
      // Extend at start (slot is 30 min before first AND consecutive in availableSlots)
      if (toMins(first) === toMins(slot) + 30 && availableSlots.includes(slot)) return [slot, ...prev];
      // Non-adjacent: start fresh
      return [slot];
    });
  };

  const handleConfirmSlots = () => {
    if (selectedSlots.length === 0) return;
    const first = selectedSlots[0];
    const last = selectedSlots[selectedSlots.length - 1];
    setBookingStart(first);
    setBookingEnd(fromMins(toMins(last) + 30));
    setBookingStep(3);
  };

  const handleSubmitBooking = async () => {
    if (!bookingCoach || !studentId || !bookingDate || selectedSlots.length === 0) return;
    const court = selectedCourt >= 0 ? bookingCourts[selectedCourt] : null;
    setBookingSubmitting(true);
    setBookingMsg(null);
    try {
      const result = await studentBookingRequestAPI.create({
        coach_id: bookingCoach.coach_id,
        coach_user_id: Number(bookingCoach.user_id),
        student_id: studentId,
        student_name: studentName,
        coach_name: bookingCoach.name,
        date: bookingDate,
        start_time: bookingStart,
        end_time: bookingEnd,
        court_label: court?.label,
        court_address: court?.address,
        note: bookingNote.trim() || undefined,
      });
      if (result?.error) {
        setBookingMsg({ type: 'err', text: result.error });
      } else {
        // Persist waiver acceptance so it is not shown again
        await SecureStore.setItemAsync('tenncoach_waiver_accepted', 'true');
        setWaiverAlreadyAccepted(true);
        setBookingMsg({ type: 'ok', text: 'Booking request sent! The coach will confirm shortly.' });
      }
    } catch {
      setBookingMsg({ type: 'err', text: 'Failed to send request. Please try again.' });
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedCoach || !studentId) return;
    setReviewSubmitting(true);
    setReviewMsg(null);
    try {
      const result = await reviewsAPI.create(selectedCoach.coach_id ?? selectedCoach.user_id, {
        student_id: studentId,
        student_name: studentName,
        rating: reviewRating,
        body: reviewBody.trim() || undefined,
      });
      if (result?.error) {
        setReviewMsg({ type: 'err', text: result.error });
      } else {
        setReviewMsg({ type: 'ok', text: 'Review submitted!' });
        setShowReviewForm(false);
        setReviews(prev => prev ? {
          ...prev,
          reviews: [result, ...prev.reviews],
          count: prev.count + 1,
          avg_rating: parseFloat(((prev.reviews.reduce((s, r) => s + r.rating, 0) + reviewRating) / (prev.count + 1)).toFixed(1)),
        } : null);
      }
    } catch {
      setReviewMsg({ type: 'err', text: 'Failed to submit review.' });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDeleteReview = async (reviewId: number) => {
    if (!studentId) return;
    try {
      await reviewsAPI.delete(reviewId, studentId);
      setReviews(prev => {
        if (!prev) return prev;
        const updated = prev.reviews.filter(r => r.review_id !== reviewId);
        return {
          reviews: updated,
          count: updated.length,
          avg_rating: updated.length
            ? parseFloat((updated.reduce((s, r) => s + r.rating, 0) / updated.length).toFixed(1))
            : null,
          can_review: true,
        };
      });
    } catch {}
  };

  const handleRegisterLesson = async (lesson: GroupLessonItem) => {
    if (!studentId) return;
    setGlRegistering(true);
    setGlMsg(null);
    try {
      const result = await studentGroupLessonsAPI.register(lesson.group_lesson_id, {
        student_id: studentId,
        student_name: glRegName.trim() || studentName,
        student_rating: glRegRating.trim() || undefined,
        student_email: glRegEmail.trim() || student?.email,
        student_phone: glRegPhone.trim() || undefined,
        student_gender: glRegGender || (student as any)?.gender || undefined,
      });
      if (result?.error) {
        setGlMsg({ type: 'err', text: result.error });
      } else {
        const status = result?.status ?? 'confirmed';
        const msg = status === 'waitlisted'
          ? 'Added to waitlist! The coach will notify you if a spot opens.'
          : lesson.require_confirmation
            ? 'Request sent! Waiting for coach confirmation.'
            : 'Registered successfully!';
        setGlShowForm(false);
        setGlMsg({ type: 'ok', text: msg });
        setLessons(prev => prev.map(l =>
          l.group_lesson_id === lesson.group_lesson_id
            ? { ...l, student_registration_id: result?.registration_id ?? 0, student_registration_status: status }
            : l
        ));
        if (selectedLesson?.group_lesson_id === lesson.group_lesson_id) {
          setSelectedLesson(prev => prev ? {
            ...prev,
            student_registration_id: result?.registration_id ?? 0,
            student_registration_status: status,
          } : prev);
        }
      }
    } catch {
      setGlMsg({ type: 'err', text: 'Registration failed. Please try again.' });
    } finally {
      setGlRegistering(false);
    }
  };

  // ── Availability renderer ─────────────────────────────────────────────────
  function renderAvailability(coach: CoachItem) {
    try {
      const avail = JSON.parse(coach.availability || '{}');
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const labels: Record<string, string> = {
        monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
        friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
      };
      const getWindows = (d: any): { start: string; end: string }[] => {
        if (!d?.available) return [];
        if (Array.isArray(d.windows) && d.windows.length > 0) return d.windows;
        if (d.start && d.end) return [{ start: d.start, end: d.end }];
        return [];
      };
      const availDays = days.filter(d => avail[d]?.available);
      const todayStr = new Date().toISOString().slice(0, 10);
      const futureAdhoc = (Array.isArray(avail.adhoc_slots) ? avail.adhoc_slots : [])
        .filter((s: any) => s.date > todayStr)
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .slice(0, 6);

      if (!availDays.length && !futureAdhoc.length) return null;
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗓️?AVAILABILITY</Text>
          {availDays.length > 0 && (
            <View style={styles.availGrid}>
              {availDays.map(day => {
                const wins = getWindows(avail[day]);
                return (
                  <View key={day} style={styles.availDay}>
                    <Text style={styles.availDayName}>{labels[day]}</Text>
                    <Text style={styles.availTime}>
                      {wins.length > 0 ? wins.map(w => `${w.start}–${w.end}`).join(', ') : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          {futureAdhoc.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.adhocLabel}>⊕ Extra open slots</Text>
              {futureAdhoc.map((s: any, i: number) => (
                <View key={i} style={styles.adhocSlot}>
                  <Text style={styles.adhocDate}>{fmtDate(s.date)}</Text>
                  <Text style={styles.adhocTime}>{s.start} – {s.end}</Text>
                  {s.label ? <Text style={styles.adhocNote}>{s.label}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      );
    } catch { return null; }
  }

  function renderFaq(coach: CoachItem) {
    try {
      const items: { question: string; answer: string }[] = JSON.parse(coach.faq || '[]');
      if (!items.length) return null;
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>❓ FAQ</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.faqItem}>
              <Text style={styles.faqQ}>{item.question}</Text>
              <Text style={styles.faqA}>{item.answer}</Text>
            </View>
          ))}
        </View>
      );
    } catch { return null; }
  }

  // ── Coach Detail View ─────────────────────────────────────────────────────
  if (selectedCoach) {
    const rate = selectedCoach.Hourly_pay ?? selectedCoach.hourlyRate;
    const pic = selectedCoach.profilePicture || selectedCoach.profile_picture;
    let courts: Array<{ label: string; address: string }> = [];
    try { courts = JSON.parse(selectedCoach.court_locations || '[]'); } catch {}
    let photos: string[] = [];
    try { photos = JSON.parse(selectedCoach.photos || '[]'); } catch {}

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Top bar — outside ScrollView so it stays frozen */}
        <View style={styles.detailTopBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedCoach(null)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.detailTopTitle} numberOfLines={1}>{maskName(selectedCoach.name)}</Text>
          <TouchableOpacity
            style={styles.coachMenuBtn}
            onPress={() => setShowCoachProfileSheet(true)}
          >
            <Text style={styles.coachMenuBtnText}>•••</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Profile header */}
          <View style={styles.profileHeader}>
            {pic ? (
              <Image source={{ uri: pic }} style={styles.cdAvatar} />
            ) : (
              <View style={[styles.cdAvatar, styles.cdAvatarPlaceholder]}>
                <Text style={styles.cdAvatarEmoji}>🎾</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text style={styles.cdName}>{maskName(selectedCoach.name)}</Text>
                {selectedCoach.verified && (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓ Verified</Text>
                  </View>
                )}
              </View>
              {selectedCoach.specialization ? (
                <View style={styles.specBadge}>
                  <Text style={styles.specBadgeText}>{selectedCoach.specialization}</Text>
                </View>
              ) : null}
              {selectedCoach.coachType ? (
                <Text style={styles.typeBadgeText}>
                  {selectedCoach.coachType.split(',').map(t => t.trim()).join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{selectedCoach.experience ?? 0}</Text>
              <Text style={styles.statLabel}>Yrs Exp.</Text>
            </View>
            {selectedCoach.avg_rating != null && (selectedCoach.review_count ?? 0) > 0 && (
              <View style={styles.statCard}>
                <Text style={styles.statValue}>★ {Number(selectedCoach.avg_rating).toFixed(1)}</Text>
                <Text style={styles.statLabel}>{selectedCoach.review_count} Reviews</Text>
              </View>
            )}
            {selectedCoach.completed_sessions_count != null && Number(selectedCoach.completed_sessions_count) > 0 && (
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{Number(selectedCoach.completed_sessions_count)}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
                {selectedCoach.on_time_rate != null && (
                  <Text style={styles.statSubLabel}>{selectedCoach.on_time_rate}% on-time</Text>
                )}
              </View>
            )}
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {selectedCoach.hide_price ? '—' : rate != null ? `$${rate}` : '—'}
              </Text>
              <Text style={styles.statLabel}>{selectedCoach.hide_price ? 'Ask Price' : 'Per Hour'}</Text>
            </View>
          </View>

          {/* Bio */}
          {selectedCoach.bio ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ABOUT</Text>
              <Text style={styles.sectionText}>{selectedCoach.bio}</Text>
            </View>
          ) : null}

          {/* Courts */}
          {courts.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 HOME COURT{courts.length > 1 ? 'S' : ''}</Text>
              {courts.map((c, i) => (
                <View key={i} style={styles.courtRow}>
                  <Text style={styles.courtLabel}>{c.label}</Text>
                  <Text style={styles.courtAddr}>{c.address}</Text>
                </View>
              ))}
            </View>
          ) : (selectedCoach.courtLocation || selectedCoach.address) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 HOME COURT</Text>
              <Text style={styles.sectionText}>{selectedCoach.courtLocation || selectedCoach.address}</Text>
            </View>
          ) : null}

          {/* Court map — shown when lat/lng are available */}
          {selectedCoach.courtLatitude && selectedCoach.courtLongitude ? (
            <View style={[styles.section, { padding: 0, overflow: 'hidden', height: 220 }]}>
              <CoachSingleMapWebView
                lat={selectedCoach.courtLatitude}
                lng={selectedCoach.courtLongitude}
                label={courts[0]?.label || selectedCoach.courtLocation || 'Court'}
                address={courts[0]?.address || selectedCoach.address}
              />
            </View>
          ) : null}

          {/* Certifications */}
          {selectedCoach.certifications ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏆 CERTIFICATIONS</Text>
              <Text style={styles.sectionText}>{selectedCoach.certifications}</Text>
            </View>
          ) : null}

          {/* Promotion */}
          {selectedCoach.promotion ? (
            <View style={[styles.section, styles.promoSection]}>
              <Text style={styles.sectionTitle}>🎉 CURRENT OFFER</Text>
              <Text style={styles.sectionText}>{selectedCoach.promotion}</Text>
            </View>
          ) : null}

          {/* Availability */}
          {renderAvailability(selectedCoach)}

          {/* FAQ */}
          {renderFaq(selectedCoach)}

          {/* Photos */}
          {photos.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PHOTOS</Text>
              <View style={styles.photoGrid}>
                {photos.map((url, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { setLightboxPhotos(photos); setLightboxIdx(i); }}
                  >
                    <Image source={{ uri: url }} style={styles.photoThumb} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.msgBtn} onPress={() => handleContactCoach(selectedCoach)}>
              <Text style={styles.msgBtnText}>💬 Message Coach</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bookBtn} onPress={() => handleOpenBooking(selectedCoach)}>
              <Text style={styles.bookBtnText}>📅 Book Session</Text>
            </TouchableOpacity>
          </View>

          {/* Reviews */}
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>
                ⭐ REVIEWS
                {reviews && reviews.count > 0 ? `  ${reviews.avg_rating?.toFixed(1)} · ${reviews.count}` : ''}
              </Text>
            </View>

            {reviews && reviews.count > 0 && (
              <View style={styles.ratingSummary}>
                <Text style={styles.ratingBigNum}>{reviews.avg_rating?.toFixed(1)}</Text>
                <View>
                  <StarRow rating={reviews.avg_rating ?? 0} size={18} />
                  <Text style={styles.ratingSubText}>
                    {reviews.count} {reviews.count === 1 ? 'student' : 'students'}
                  </Text>
                </View>
              </View>
            )}

            {reviewsLoading ? (
              <ActivityIndicator size="small" color="#2e7d32" style={{ marginVertical: 12 }} />
            ) : reviews && reviews.reviews.length > 0 ? (
              reviews.reviews.map(rv => {
                const isOwn = rv.student_id === studentId;
                return (
                  <View key={rv.review_id} style={styles.reviewItem}>
                    <View style={styles.reviewRow}>
                      <StarRow rating={rv.rating} size={13} />
                      <Text style={styles.reviewAuthor}>{rv.student_name}</Text>
                      {rv.created_at ? (
                        <Text style={styles.reviewDate}>
                          {new Date(rv.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </Text>
                      ) : null}
                      {isOwn && (
                        <TouchableOpacity onPress={() => handleDeleteReview(rv.review_id)}>
                          <Text style={styles.reviewDel}>🗑</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {rv.body ? <Text style={styles.reviewBody}>{rv.body}</Text> : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.reviewsEmpty}>
                {reviews?.can_review ? 'No reviews yet. Be the first!' : 'No reviews yet.'}
              </Text>
            )}

            {reviewMsg ? (
              <View style={[styles.msgBox, reviewMsg.type === 'ok' ? styles.msgBoxOk : styles.msgBoxErr]}>
                <Text style={reviewMsg.type === 'ok' ? styles.msgBoxOkText : styles.msgBoxErrText}>
                  {reviewMsg.text}
                </Text>
              </View>
            ) : null}

            {reviews?.can_review && !reviews.reviews.some(r => r.student_id === studentId) && (
              !showReviewForm ? (
                <TouchableOpacity style={styles.reviewBtn} onPress={() => setShowReviewForm(true)}>
                  <Text style={styles.reviewBtnText}>⭐ Leave a Review</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.reviewForm}>
                  <Text style={styles.reviewFormLabel}>Your Rating</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <TouchableOpacity key={s} onPress={() => setReviewRating(s)}>
                        <Text style={{ fontSize: 28, color: s <= reviewRating ? '#f59e0b' : '#e5e7eb' }}>★</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.reviewTextarea}
                    placeholder="Share your experience (optional)"
                    value={reviewBody}
                    onChangeText={setReviewBody}
                    multiline
                    numberOfLines={3}
                    editable={!reviewSubmitting}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={styles.reviewCancelBtn} onPress={() => setShowReviewForm(false)}>
                      <Text style={styles.reviewCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reviewSubmitBtn, reviewSubmitting && { opacity: 0.5 }]}
                      onPress={handleSubmitReview}
                      disabled={reviewSubmitting}
                    >
                      <Text style={styles.reviewSubmitText}>{reviewSubmitting ? 'Submitting…' : 'Submit'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            )}
          </View>
        </ScrollView>

        {/* Lightbox */}
        <Modal visible={lightboxIdx !== null} transparent animationType="fade" onRequestClose={() => setLightboxIdx(null)}>
          <View style={styles.lightboxOverlay}>
            {/* Background — tap anywhere outside the image to close */}
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setLightboxIdx(null)} />
            {lightboxIdx !== null && (
              <>
                {/* Image — tap on image also closes */}
                <Pressable onPress={() => setLightboxIdx(null)}>
                  <Image
                    source={{ uri: lightboxPhotos[lightboxIdx] }}
                    style={{ width: screenWidth, height: screenHeight * 0.75 }}
                    resizeMode="contain"
                  />
                </Pressable>
                {/* Close button — big and clearly visible */}
                <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxIdx(null)}>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
                {/* Tap hint */}
                <Text style={styles.lightboxHint}>Tap anywhere to close</Text>
                {/* Prev arrow */}
                {lightboxIdx > 0 && (
                  <TouchableOpacity
                    style={[styles.lightboxNav, styles.lightboxNavLeft]}
                    onPress={() => setLightboxIdx(i => Math.max(0, (i ?? 1) - 1))}
                  >
                    <Text style={{ color: '#fff', fontSize: 36 }}>‹</Text>
                  </TouchableOpacity>
                )}
                {/* Next arrow */}
                {lightboxIdx < lightboxPhotos.length - 1 && (
                  <TouchableOpacity
                    style={[styles.lightboxNav, styles.lightboxNavRight]}
                    onPress={() => setLightboxIdx(i => Math.min(lightboxPhotos.length - 1, (i ?? 0) + 1))}
                  >
                    <Text style={{ color: '#fff', fontSize: 36 }}>›</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </Modal>

        {/* Booking Modal — available from coach detail */}
        <Modal visible={showBookingModal} transparent animationType="slide" onRequestClose={() => setShowBookingModal(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { maxHeight: '85%' }]}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => {
                    if (bookingStep > 1 && bookingMsg?.type !== 'ok') {
                      setBookingStep(s => (s - 1) as 1 | 2 | 3);
                      if (bookingStep === 2) { setBookingDate(''); setAvailableSlots([]); }
                      if (bookingStep === 3) { setSelectedSlots([]); }
                    } else {
                      setShowBookingModal(false);
                    }
                  }}>
                    <Text style={styles.modalClose}>{bookingStep > 1 && bookingMsg?.type !== 'ok' ? '‹' : '✕'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {bookingMsg?.type === 'ok' ? '✅ Booking Sent!' : `Book with ${bookingCoach ? maskName(bookingCoach.name) : ''}`}
                  </Text>
                  <View style={{ width: 32 }} />
                </View>

                {bookingMsg?.type !== 'ok' && (
                  <View style={styles.bookingSteps}>
                    {['Date', 'Time', 'Confirm'].map((label, idx) => (
                      <View key={label} style={styles.bookingStepItem}>
                        <View style={[
                          styles.bookingStepDot,
                          bookingStep === idx + 1 && styles.bookingStepDotActive,
                          bookingStep > idx + 1 && styles.bookingStepDotDone,
                        ]}>
                          <Text style={[
                            styles.bookingStepDotText,
                            (bookingStep === idx + 1 || bookingStep > idx + 1) && { color: '#fff' },
                          ]}>
                            {bookingStep > idx + 1 ? '✓' : String(idx + 1)}
                          </Text>
                        </View>
                        <Text style={[
                          styles.bookingStepLabel,
                          bookingStep === idx + 1 && styles.bookingStepLabelActive,
                        ]}>{label}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {bookingStep === 1 && (
                    <View style={{ padding: 16 }}>
                      <Text style={styles.bookFormLabel}>Select a date</Text>
                      {/* Month navigation */}
                      <View style={styles.calNavRow}>
                        <TouchableOpacity
                          style={styles.calNavBtn}
                          onPress={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                          disabled={
                            calendarMonth.getFullYear() === new Date().getFullYear() &&
                            calendarMonth.getMonth() <= new Date().getMonth()
                          }
                        >
                          <Text style={styles.calNavText}>‹</Text>
                        </TouchableOpacity>
                        <Text style={styles.calMonthLabel}>
                          {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </Text>
                        <TouchableOpacity
                          style={styles.calNavBtn}
                          onPress={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                        >
                          <Text style={styles.calNavText}>›</Text>
                        </TouchableOpacity>
                      </View>
                      {/* Day headers */}
                      <View style={styles.calDayHeaders}>
                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                          <Text key={d} style={styles.calDayHeader}>{d}</Text>
                        ))}
                      </View>
                      {/* Calendar grid */}
                      {(() => {
                        const year = calendarMonth.getFullYear();
                        const month = calendarMonth.getMonth();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const firstDow = new Date(year, month, 1).getDay();
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const cells: (number | null)[] = [
                          ...Array(firstDow).fill(null),
                          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
                        ];
                        while (cells.length % 7 !== 0) cells.push(null);
                        const toStr = (day: number) =>
                          `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        return (
                          <View style={styles.calGrid}>
                            {cells.map((day, i) => {
                              if (!day) return <View key={`e-${i}`} style={styles.calCell} />;
                              const ds = toStr(day);
                              const dateObj = new Date(year, month, day);
                              const isPast = ds < todayStr;
                              const isToday = ds === todayStr;
                              const isSelected = ds === bookingDate;
                              const hasAvail = !isPast && isAvailableDay(dateObj);
                              const isUnavail = !isPast && !hasAvail;
                              const isFullyBooked = fullyBookedDates.has(ds);
                              const disabled = isPast || isUnavail;
                              return (
                                <TouchableOpacity
                                  key={ds}
                                  style={[
                                    styles.calCell,
                                    isSelected && styles.calCellSelected,
                                    isToday && !isSelected && styles.calCellToday,
                                    (isPast || isUnavail) && styles.calCellPast,
                                    hasAvail && !isSelected && styles.calCellAvail,
                                  ]}
                                  onPress={() => !disabled && handleSelectDate(ds)}
                                  disabled={disabled}
                                  activeOpacity={disabled ? 1 : 0.7}
                                >
                                  <Text style={[
                                    styles.calCellText,
                                    isSelected && styles.calCellTextSelected,
                                    isToday && !isSelected && styles.calCellTextToday,
                                    (isPast || isUnavail) && styles.calCellTextPast,
                                    hasAvail && !isSelected && styles.calCellTextAvail,
                                  ]}>
                                    {day}
                                  </Text>
                                  {isFullyBooked && !isSelected && (
                                    <View style={styles.calCellFullDot} />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        );
                      })()}
                    </View>
                  )}

                  {bookingStep === 2 && (
                    <View style={{ padding: 16 }}>
                      <Text style={styles.bookFormLabel}>
                        Available slots — {bookingDate ? fmtDate(bookingDate) : ''}
                      </Text>
                      {slotsLoading ? (
                        <ActivityIndicator style={{ marginVertical: 32 }} color="#2e7d32" />
                      ) : availableSlots.length === 0 ? (
                        <View style={styles.noSlotsBox}>
                          <Text style={styles.noSlotsIcon}>😔</Text>
                          <Text style={styles.noSlotsTitle}>No slots available</Text>
                          <Text style={styles.noSlotsHint}>This coach has no openings on this day.</Text>
                          <TouchableOpacity
                            style={[styles.bookBtn, { marginTop: 12 }]}
                            onPress={() => { setBookingStep(1); setBookingDate(''); }}
                          >
                            <Text style={styles.bookBtnText}>Pick another date</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <Text style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                            Tap slots to select. Tap again to deselect. Multiple consecutive slots = longer session.
                          </Text>
                          <View style={styles.slotsGrid}>
                            {availableSlots.map(slot => (
                              <TouchableOpacity
                                key={slot}
                                style={[styles.slotChip, selectedSlots.includes(slot) && styles.slotChipActive]}
                                onPress={() => handleSelectSlot(slot)}
                              >
                                <Text style={[styles.slotChipText, selectedSlots.includes(slot) && styles.slotChipTextActive]}>
                                  {fmtTime(slot)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          {selectedSlots.length > 0 && (
                            <View style={{ marginTop: 16 }}>
                              <Text style={{ textAlign: 'center', color: '#2e7d32', fontWeight: '600', marginBottom: 8 }}>
                                {selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''} selected
                                {' '}({selectedSlots.length * 30} min)
                              </Text>
                              <TouchableOpacity
                                style={styles.bookBtn}
                                onPress={handleConfirmSlots}
                              >
                                <Text style={styles.bookBtnText}>
                                  Continue — {fmtTime(selectedSlots[0])} to {fmtTime(fromMins(toMins(selectedSlots[selectedSlots.length - 1]) + 30))}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  )}

                  {bookingStep === 3 && bookingMsg?.type !== 'ok' && (
                    <View style={{ padding: 16 }}>
                      <View style={styles.bookSummaryCard}>
                        <Text style={styles.bookSummaryTitle}>📋 Session Summary</Text>
                        <View style={styles.bookSummaryRow}>
                          <Text style={styles.bookSummaryLabel}>Coach</Text>
                          <Text style={styles.bookSummaryValue}>{bookingCoach ? maskName(bookingCoach.name) : ''}</Text>
                        </View>
                        <View style={styles.bookSummaryRow}>
                          <Text style={styles.bookSummaryLabel}>Date</Text>
                          <Text style={styles.bookSummaryValue}>{fmtDate(bookingDate)}</Text>
                        </View>
                        <View style={styles.bookSummaryRow}>
                          <Text style={styles.bookSummaryLabel}>Time</Text>
                          <Text style={styles.bookSummaryValue}>{fmtTime(bookingStart)} – {fmtTime(bookingEnd)}</Text>
                        </View>
                        {bookingDate && bookingStart && (() => {
                          const court = selectedCourt >= 0 ? bookingCourts[selectedCourt] : null;
                          const addr = court?.address || bookingCoach?.courtLocation || bookingCoach?.address || '';
                          return addr ? (
                            <View style={[styles.bookSummaryRow, { alignItems: 'center' }]}>
                              <Text style={styles.bookSummaryLabel}>Weather</Text>
                              <WeatherWidget date={bookingDate} startTime={bookingStart} address={addr} />
                            </View>
                          ) : null;
                        })()}
                      </View>

                      {bookingCourts.length > 0 && (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={styles.bookFormLabel}>📍 Select Court</Text>
                          {bookingCourts.map((court, idx) => (
                            <TouchableOpacity
                              key={idx}
                              style={[styles.courtOption, selectedCourt === idx && styles.courtOptionActive]}
                              onPress={() => setSelectedCourt(idx)}
                            >
                              <View style={[styles.courtOptionRadio, selectedCourt === idx && styles.courtOptionRadioActive]}>
                                {selectedCourt === idx && <View style={styles.courtOptionRadioDot} />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.courtOptionLabel}>{court.label}</Text>
                                <Text style={styles.courtOptionAddr} numberOfLines={2}>{court.address}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <Text style={styles.bookFormLabel}>Note (optional)</Text>
                      <TextInput
                        style={[styles.bookFormInput, { height: 80, textAlignVertical: 'top' }]}
                        placeholder="Any requests or information for the coach…"
                        value={bookingNote}
                        onChangeText={setBookingNote}
                        multiline
                      />

                      {bookingMsg?.type === 'err' && (
                        <View style={[styles.msgBox, styles.msgBoxErr]}>
                          <Text style={styles.msgBoxErrText}>{bookingMsg.text}</Text>
                        </View>
                      )}

                      {/* Waiver – only shown on first booking */}
                      {!waiverAlreadyAccepted && (
                        <View style={styles.bookWaiverSection}>
                          <Text style={styles.waiverTitle}>
                            Waiver &amp; Terms <Text style={{ color: '#dc2626' }}>*</Text>
                          </Text>
                          <ScrollView
                            style={styles.waiverScroll}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={true}
                          >
                            <Text style={styles.waiverText}>
                              <Text style={{ fontWeight: '700' }}>TENNCOACH PLATFORM – LIABILITY WAIVER &amp; RELEASE AGREEMENT{'\n\n'}</Text>
                              <Text style={{ fontWeight: '700' }}>1. Independent Contractors{'\n'}</Text>TennCoach connects students with independent tennis coaches. TennCoach does not employ or supervise Coaches and is not responsible for their actions or conduct.{'\n\n'}
                              <Text style={{ fontWeight: '700' }}>2. Assumption of Risk{'\n'}</Text>You understand that participation in tennis involves inherent risks including physical injury, illness, or property damage. You voluntarily assume all such risks.{'\n\n'}
                              <Text style={{ fontWeight: '700' }}>3. Release of Liability{'\n'}</Text>To the fullest extent permitted by law, you release TennCoach, its owners, officers, and affiliates from any claims arising from participation in coaching sessions, interactions with Coaches, or use of the Platform.{'\n\n'}
                              <Text style={{ fontWeight: '700' }}>4. User Responsibility{'\n'}</Text>You are responsible for ensuring you are physically fit to participate and for using appropriate safety precautions.{'\n\n'}
                              <Text style={{ fontWeight: '700' }}>5. Acceptance{'\n'}</Text>By booking a session, you acknowledge you have read, understood, and agree to this waiver.
                            </Text>
                          </ScrollView>
                          <TouchableOpacity
                            style={styles.waiverCheckRow}
                            onPress={() => setWaiverAccepted(v => !v)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.waiverCheckbox, waiverAccepted && styles.waiverCheckboxChecked]}>
                              {waiverAccepted && <Text style={styles.waiverCheckmark}>✓</Text>}
                            </View>
                            <Text style={styles.waiverCheckLabel}>
                              I agree to the TennCoach Waiver &amp; Terms
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <TouchableOpacity
                        style={[styles.bookBtn, (bookingSubmitting || !waiverAccepted) && { opacity: 0.4 }]}
                        onPress={handleSubmitBooking}
                        disabled={bookingSubmitting || !waiverAccepted}
                      >
                        <Text style={styles.bookBtnText}>
                          {bookingSubmitting ? 'Sending…' : '📅 Send Booking Request'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {bookingMsg?.type === 'ok' && (
                    <View style={{ padding: 28, alignItems: 'center', gap: 12 }}>
                      <Text style={{ fontSize: 48 }}>🎉</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#2e7d32', textAlign: 'center' }}>
                        Booking Request Sent!
                      </Text>
                      <Text style={{ fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 }}>
                        {bookingMsg.text}
                      </Text>
                      <TouchableOpacity
                        style={[styles.bookBtn, { marginTop: 8, alignSelf: 'stretch' }]}
                        onPress={() => setShowBookingModal(false)}
                      >
                        <Text style={styles.bookBtnText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={{ height: 20 }} />
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Coach profile sheet — report / block */}
        <CoachProfileSheet
          coachUserId={selectedCoach.user_id}
          coachName={selectedCoach.name}
          currentUserId={studentId || undefined}
          visible={showCoachProfileSheet}
          onClose={() => setShowCoachProfileSheet(false)}
          onBlocked={() => {
            setBlockedUsers(prev => new Set([...prev, selectedCoach.user_id]));
            setShowCoachProfileSheet(false);
            setSelectedCoach(null);
          }}
        />
      </SafeAreaView>
    );
  }
  if (selectedLesson) {
    const regStatus = selectedLesson.student_registration_status;
    const regCount = selectedLesson.confirmed_count ?? 0;
    const spotsLeft = selectedLesson.remaining_spots ?? Math.max(selectedLesson.max_registration - regCount, 0);
    const isWaitlist = spotsLeft <= 0;
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.detailTopBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { setSelectedLesson(null); setGlMsg(null); setGlShowForm(false); setGlRegName(''); setGlRegRating(''); setGlRegEmail(''); setGlRegPhone(''); setGlRegGender(''); setGlWaiverAccepted(false); }}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.detailTopTitle} numberOfLines={1}>
            {selectedLesson.title || 'Group Lesson'}
          </Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.glDetailHeader}>
            <Text style={styles.glDetailTitle}>{selectedLesson.title || 'Group Lesson'}</Text>
            <Text style={styles.glDetailCoach}>👤 {selectedLesson.coach_name}</Text>
            <View style={styles.glDetailBadgeRow}>
              <View style={styles.glBadge}>
                <Text style={styles.glBadgeText}>📅 {fmtDate(selectedLesson.lesson_date)}</Text>
              </View>
              <View style={styles.glBadge}>
                <Text style={styles.glBadgeText}>🕐 {fmtTime(selectedLesson.start_time)} – {fmtTime(selectedLesson.end_time)}</Text>
              </View>
              <View style={[styles.glBadge, { backgroundColor: '#d1fae5' }]}>
                <Text style={[styles.glBadgeText, { color: '#065f46' }]}>${selectedLesson.price}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.glInfoRow}>
              <Text style={styles.glInfoLabel}>📍 Location</Text>
              <Text style={styles.glInfoValue}>{selectedLesson.location}</Text>
            </View>
            {selectedLesson.skill_level && (
              <View style={styles.glInfoRow}>
                <Text style={styles.glInfoLabel}>🎾 Skill Level</Text>
                <Text style={styles.glInfoValue}>{selectedLesson.skill_level}</Text>
              </View>
            )}
            <View style={styles.glInfoRow}>
              <Text style={styles.glInfoLabel}>👥 Spots</Text>
              <Text style={[styles.glInfoValue, spotsLeft === 0 && { color: '#ef4444' }]}>
                {regCount} / {selectedLesson.max_registration}
                {isWaitlist ? ' (Waitlist available)' : ` (${spotsLeft} left)`}
              </Text>
            </View>
            {selectedLesson.require_confirmation && (
              <View style={styles.glInfoRow}>
                <Text style={styles.glInfoLabel}>ℹ️ Approval</Text>
                <Text style={styles.glInfoValue}>Coach approval required</Text>
              </View>
            )}
          </View>

          {selectedLesson.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DESCRIPTION</Text>
              <Text style={styles.sectionText}>{selectedLesson.description}</Text>
            </View>
          ) : null}

          {selectedLesson.waiver_text ? (
            <View style={[styles.section, styles.waiverSection]}>
              <Text style={[styles.sectionTitle, { color: '#92400e' }]}>⚠️ WAIVER</Text>
              <Text style={[styles.sectionText, { color: '#78350f' }]}>{selectedLesson.waiver_text}</Text>
            </View>
          ) : null}

          {glMsg ? (
            <View style={[styles.msgBox, glMsg.type === 'ok' ? styles.msgBoxOk : styles.msgBoxErr]}>
              <Text style={glMsg.type === 'ok' ? styles.msgBoxOkText : styles.msgBoxErrText}>{glMsg.text}</Text>
            </View>
          ) : null}

          {/* ── Registration action (top) ── */}
          {regStatus ? (
            <View style={styles.regStatusCard}>
              <Text style={styles.regStatusText}>
                {regStatus === 'confirmed' ? '✅ You are registered for this class!'
                  : regStatus === 'pending' ? '⏳ Your request is pending coach confirmation.'
                    : regStatus === 'waitlisted' ? '⏳ You are on the waitlist.'
                      : `Status: ${regStatus}`}
              </Text>
            </View>
          ) : selectedLesson.status === 'cancelled' ? (
            <View style={[styles.regStatusCard, { backgroundColor: '#fee2e2' }]}>
              <Text style={[styles.regStatusText, { color: '#991b1b' }]}>This class has been cancelled.</Text>
            </View>
          ) : !glShowForm ? (
            <TouchableOpacity
              style={styles.glRegisterBtn}
              onPress={() => {
                setGlRegName(studentName);
                setGlRegEmail(student?.email || '');
                setGlRegGender((student as any)?.gender || '');
                setGlRegRating('');
                setGlRegPhone('');
                setGlWaiverAccepted(false);
                setGlShowForm(true);
              }}
            >
              <Text style={styles.glRegisterBtnText}>
                {isWaitlist ? '📋 Join Waitlist'
                  : selectedLesson.require_confirmation ? '✋ Request to Join'
                    : '✅ Register Now'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.glFormSection}>
              <Text style={styles.glFormTitle}>Your Registration Details</Text>

              <Text style={styles.bookFormLabel}>Full Name *</Text>
              <TextInput
                style={styles.bookFormInput}
                value={glRegName}
                onChangeText={setGlRegName}
                placeholder="Your full name"
                editable={!glRegistering}
              />

              <Text style={styles.bookFormLabel}>NTRP Rating *</Text>
              <TextInput
                style={styles.bookFormInput}
                value={glRegRating}
                onChangeText={setGlRegRating}
                placeholder="e.g. 3.5"
                keyboardType="decimal-pad"
                editable={!glRegistering}
              />

              <Text style={styles.bookFormLabel}>Email *</Text>
              <TextInput
                style={styles.bookFormInput}
                value={glRegEmail}
                onChangeText={setGlRegEmail}
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!glRegistering}
              />

              <Text style={styles.bookFormLabel}>Phone (optional)</Text>
              <TextInput
                style={styles.bookFormInput}
                value={glRegPhone}
                onChangeText={setGlRegPhone}
                placeholder="e.g. 555-123-4567"
                keyboardType="phone-pad"
                editable={!glRegistering}
              />

              <TouchableOpacity
                style={styles.waiverCheckRow}
                onPress={() => setGlWaiverAccepted(v => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.waiverCheckbox, glWaiverAccepted && styles.waiverCheckboxChecked]}>
                  {glWaiverAccepted && <Text style={styles.waiverCheckmark}>✓</Text>}
                </View>
                <Text style={styles.waiverCheckLabel}>
                  I agree to the waiver &amp; terms shown above
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.glRegisterBtn, { marginTop: 14 }, (!glRegName.trim() || !glRegRating.trim() || !glRegEmail.trim() || !glWaiverAccepted || glRegistering) && { opacity: 0.45 }]}
                onPress={() => void handleRegisterLesson(selectedLesson)}
                disabled={!glRegName.trim() || !glRegRating.trim() || !glRegEmail.trim() || !glWaiverAccepted || glRegistering}
              >
                <Text style={styles.glRegisterBtnText}>
                  {glRegistering ? 'Submitting…'
                    : isWaitlist ? '📋 Submit Waitlist Request'
                      : selectedLesson.require_confirmation ? '✋ Send Request'
                        : '✅ Complete Registration'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.glCancelFormBtn}
                onPress={() => { setGlShowForm(false); setGlMsg(null); }}
              >
                <Text style={styles.glCancelFormBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Message Organizer (always at bottom) ── */}
          <TouchableOpacity
            style={styles.glMsgOrgBtn}
            onPress={() => router.push({
              pathname: '/(tabs)/messages',
              params: { coachUserId: String(selectedLesson.coach_user_id), coachName: selectedLesson.coach_name },
            })}
          >
            <Text style={styles.glMsgOrgBtnText}>💬 Message Organizer</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── List View ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'coaches' ? 'Search coaches…' : 'Search classes…'}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'coaches' && styles.tabBtnActive]}
          onPress={() => setActiveTab('coaches')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'coaches' && styles.tabBtnTextActive]}>🎾 Coaches</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'classes' && styles.tabBtnActive]}
          onPress={() => setActiveTab('classes')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'classes' && styles.tabBtnTextActive]}>👥 Group Classes</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'coaches' && (
        <View style={styles.filterRow}>
          {COACH_TYPES.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.filterChip, typeFilter.includes(t.id) && styles.filterChipActive]}
              onPress={() => toggleTypeFilter(t.id)}
            >
              <Text style={[styles.filterChipText, typeFilter.includes(t.id) && styles.filterChipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {activeTab === 'coaches' ? (
        loadingCoaches ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
        ) : (
          <FlatList
            data={filteredCoaches}
            keyExtractor={item => String(item.coach_id ?? item.user_id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#2e7d32"
                onRefresh={async () => { setRefreshing(true); await loadCoaches(); setRefreshing(false); }}
              />
            }
            ListHeaderComponent={
              <View style={styles.mapContainer}>
                <CoachMapWebView
                  coaches={filteredCoaches}
                  onCoachPress={coachId => {
                    const found = coaches.find(c => c.coach_id === coachId);
                    if (found) setSelectedCoach(found);
                  }}
                />
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {search || typeFilter.length ? 'No coaches match your filters.' : 'No coaches found.'}
              </Text>
            }
            renderItem={({ item }) => {
              const itemRate = item.Hourly_pay ?? item.hourlyRate;
              const pic = item.profilePicture || item.profile_picture;
              return (
                <TouchableOpacity style={styles.card} onPress={() => setSelectedCoach(item)}>
                  <View style={styles.cardLeft}>
                    {pic ? (
                      <Image source={{ uri: pic }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardBody}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.coachName}>{maskName(item.name)}</Text>
                      {item.verified && <Text style={{ fontSize: 11, color: '#2e7d32', fontWeight: '700' }}>★</Text>}
                    </View>
                    {item.specialization ? <Text style={styles.spec}>{item.specialization}</Text> : null}
                    {item.bio ? <Text style={styles.bio} numberOfLines={2}>{item.bio}</Text> : null}
                    {item.avg_rating != null && (item.review_count ?? 0) > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <StarRow rating={item.avg_rating ?? 0} size={12} />
                        <Text style={{ fontSize: 11, color: '#888' }}>({item.review_count})</Text>
                      </View>
                    )}
                    <View style={styles.cardFooter}>
                      {!item.hide_price && itemRate != null && (
                        <Text style={styles.rate}>${itemRate}/hr</Text>
                      )}
                      {item.coachType ? (
                        <Text style={styles.coachTypeChip}>{item.coachType.split(',')[0]?.trim()}</Text>
                      ) : null}
                      <Text style={styles.viewBtn}>View →</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )
      ) : (
        loadingLessons ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#667eea" />
        ) : (
          <FlatList
            data={filteredLessons}
            keyExtractor={item => String(item.group_lesson_id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#667eea"
                onRefresh={async () => { setRefreshing(true); await loadGroupLessons(); setRefreshing(false); }}
              />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {search ? 'No classes match your search.' : 'No group classes available right now.'}
              </Text>
            }
            renderItem={({ item }) => {
              const regCount = item.confirmed_count ?? 0;
              const spotsLeft = item.remaining_spots ?? Math.max(item.max_registration - regCount, 0);
              const regStatus = item.student_registration_status;
              return (
                <TouchableOpacity
                  style={styles.glCard}
                  onPress={() => { setSelectedLesson(item); setGlMsg(null); }}
                >
                  <View style={styles.glCardTop}>
                    <Text style={styles.glCardTitle}>{item.title || 'Group Lesson'}</Text>
                    <View style={[styles.glCardBadge, { backgroundColor: spotsLeft > 0 ? '#d1fae5' : '#fee2e2' }]}>
                      <Text style={[styles.glCardBadgeText, { color: spotsLeft > 0 ? '#065f46' : '#991b1b' }]}>
                        {spotsLeft > 0 ? `${spotsLeft} spots` : 'Full'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.glCardCoach}>👤 {item.coach_name}</Text>
                  <View style={styles.glCardMeta}>
                    <Text style={styles.glCardMetaText}>📅 {fmtDate(item.lesson_date)}</Text>
                    <Text style={styles.glCardMetaText}>🕐 {fmtTime(item.start_time)} – {fmtTime(item.end_time)}</Text>
                    <Text style={styles.glCardMetaText}>💰 ${item.price}</Text>
                  </View>
                  <Text style={styles.glCardLocation} numberOfLines={1}>📍 {item.location}</Text>
                  {regStatus && (
                    <View style={styles.glCardRegBadge}>
                      <Text style={styles.glCardRegText}>
                        {regStatus === 'confirmed' ? '✅ Registered'
                          : regStatus === 'pending' ? '⏳ Pending'
                            : regStatus === 'waitlisted' ? '⏳ Waitlisted'
                              : regStatus}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )
      )}

      {/* Message Modal */}
      {/* Removed — message coach now navigates to the Messages tab */}

      {/* Booking Modal — kept here for list-level booking access (coach cards) */}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f5' },

  searchRow: {
    padding: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  searchInput: {
    backgroundColor: '#f3f4f6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#222',
  },

  tabRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#2e7d32' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#888' },
  tabBtnTextActive: { color: '#2e7d32' },

  filterRow: {
    flexDirection: 'row', gap: 8, padding: 10, flexWrap: 'wrap',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
    alignItems: 'center',
  },
  mapContainer: {
    height: 260, marginBottom: 12, borderRadius: 0,
    overflow: 'hidden',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#d0d0d0', backgroundColor: '#f8f9fa',
  },
  filterChipActive: { borderColor: '#2ecc71', backgroundColor: '#2ecc71' },
  filterChipText: { fontSize: 12, color: '#555', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },

  list: { padding: 14, gap: 12 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 15 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    flexDirection: 'row', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardLeft: { justifyContent: 'flex-start' },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 22, color: '#fff', fontWeight: '700' },
  cardBody: { flex: 1, minWidth: 0 },
  coachName: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  spec: { fontSize: 13, color: '#2e7d32', fontWeight: '600', marginBottom: 2 },
  bio: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rate: { fontSize: 13, fontWeight: '700', color: '#374151' },
  coachTypeChip: {
    fontSize: 11, color: '#667eea', fontWeight: '600',
    backgroundColor: '#eef0ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  viewBtn: { fontSize: 13, color: '#2e7d32', fontWeight: '700', marginLeft: 'auto' },

  glCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  glCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  glCardTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937', flex: 1, marginRight: 8 },
  glCardBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  glCardBadgeText: { fontSize: 11, fontWeight: '700' },
  glCardCoach: { fontSize: 13, color: '#667eea', fontWeight: '600', marginBottom: 6 },
  glCardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  glCardMetaText: { fontSize: 12, color: '#555' },
  glCardLocation: { fontSize: 12, color: '#888', marginBottom: 6 },
  glCardRegBadge: {
    alignSelf: 'flex-start', backgroundColor: '#d1fae5',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4,
  },
  glCardRegText: { fontSize: 12, color: '#065f46', fontWeight: '600' },

  detailTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: {},
  backText: { color: '#667eea', fontSize: 15, fontWeight: '600' },
  detailTopTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', flex: 1, textAlign: 'center' },
  coachMenuBtn: { padding: 6, width: 44, alignItems: 'flex-end' },
  coachMenuBtnText: { fontSize: 18, color: '#555', letterSpacing: 2 },

  profileHeader: {
    flexDirection: 'row', gap: 16, alignItems: 'center',
    marginTop: 0, marginHorizontal: 16, marginBottom: 4, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#667eea', borderRadius: 16,
  },
  cdAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
  cdAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  cdAvatarEmoji: { fontSize: 32 },
  cdName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  verifiedBadge: {
    backgroundColor: '#4ade80', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  verifiedText: { fontSize: 11, fontWeight: '800', color: '#133a22' },
  specBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10, alignSelf: 'flex-start', marginBottom: 4,
  },
  specBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  typeBadgeText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 4 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    borderWidth: 1, borderColor: '#e8e8f0',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: '#667eea', lineHeight: 22 },
  statLabel: { fontSize: 10, fontWeight: '600', color: '#888', textTransform: 'uppercase', marginTop: 2 },
  statSubLabel: { fontSize: 10, color: '#27ae60', fontWeight: '600' },

  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, margin: 16, marginTop: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    borderWidth: 1, borderColor: '#e8e8f0',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 8,
  },
  sectionText: { fontSize: 14, color: '#444', lineHeight: 22 },
  promoSection: { borderColor: '#f39c12', backgroundColor: '#fffbf0' },
  waiverSection: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },

  courtRow: { flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  courtLabel: { fontSize: 12, fontWeight: '700', color: '#667eea', textTransform: 'uppercase' },
  courtAddr: { fontSize: 13, color: '#444', flex: 1 },

  availGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  availDay: {
    backgroundColor: '#e8f5e9', borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: '#c8e6c9', minWidth: 90,
  },
  availDayName: { fontSize: 13, fontWeight: '700', color: '#2e7d32' },
  availTime: { fontSize: 12, color: '#555', marginTop: 2 },
  adhocLabel: { fontSize: 12, fontWeight: '700', color: '#1b8c5a', letterSpacing: 0.5, marginBottom: 6 },
  adhocSlot: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#e6faf0', borderRadius: 8, padding: 8, marginBottom: 6,
    borderWidth: 1, borderColor: '#b2dfcf',
  },
  adhocDate: { fontSize: 13, fontWeight: '700', color: '#1b8c5a', minWidth: 90 },
  adhocTime: { fontSize: 13, color: '#333' },
  adhocNote: { fontSize: 12, color: '#666', fontStyle: 'italic' },

  faqItem: { borderLeftWidth: 3, borderLeftColor: '#667eea', paddingLeft: 10, marginBottom: 10 },
  faqQ: { fontSize: 14, fontWeight: '600', color: '#1a1a2e', marginBottom: 3 },
  faqA: { fontSize: 13, color: '#555', lineHeight: 19 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: 90, height: 90, borderRadius: 8 },

  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 4 },
  msgBtn: {
    flex: 1, backgroundColor: '#667eea', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  msgBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bookBtn: {
    flex: 1, backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  ratingSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fffbf0', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#fde68a',
  },
  ratingBigNum: { fontSize: 32, fontWeight: '900', color: '#f59e0b' },
  ratingSubText: { fontSize: 12, color: '#78716c', marginTop: 2 },
  reviewItem: { backgroundColor: '#f8f9ff', borderRadius: 10, padding: 12, marginBottom: 8 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  reviewAuthor: { fontSize: 13, fontWeight: '700', color: '#1a1a2e' },
  reviewDate: { fontSize: 11, color: '#bbb', marginLeft: 'auto' },
  reviewDel: { fontSize: 14, color: '#ef4444' },
  reviewBody: { fontSize: 13, color: '#555', lineHeight: 20 },
  reviewsEmpty: { fontSize: 13, color: '#bbb', marginBottom: 12 },
  reviewBtn: {
    borderWidth: 2, borderColor: '#764ba2', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8,
  },
  reviewBtnText: { color: '#764ba2', fontWeight: '700', fontSize: 14 },
  reviewForm: { marginTop: 12 },
  reviewFormLabel: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 6, textTransform: 'uppercase' },
  reviewTextarea: {
    borderWidth: 1.5, borderColor: '#e0e0ee', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#222', minHeight: 80, textAlignVertical: 'top',
  },
  reviewCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#f4f4f8', borderRadius: 20,
  },
  reviewCancelText: { color: '#555', fontWeight: '600', fontSize: 13 },
  reviewSubmitBtn: {
    paddingHorizontal: 20, paddingVertical: 9, backgroundColor: '#667eea', borderRadius: 20,
  },
  reviewSubmitText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  glDetailHeader: {
    backgroundColor: '#667eea', borderRadius: 16, padding: 20, marginBottom: 16,
  },
  glDetailTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 6 },
  glDetailCoach: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 10 },
  glDetailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  glBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  glBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  glInfoRow: { flexDirection: 'row', marginBottom: 10 },
  glInfoLabel: { fontSize: 13, fontWeight: '600', color: '#888', minWidth: 110 },
  glInfoValue: { fontSize: 13, color: '#333', flex: 1 },

  regBtn: {
    backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
  },
  regBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  glRegisterBtn: {
    backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  glRegisterBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  glMsgOrgBtn: {
    backgroundColor: '#667eea', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 10, marginBottom: 8,
  },
  glMsgOrgBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  glFormSection: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 8,
    borderWidth: 1, borderColor: '#e8e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  glFormTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 14 },
  glCancelFormBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  glCancelFormBtnText: { color: '#888', fontSize: 14, fontWeight: '600' },
  regStatusCard: {
    backgroundColor: '#d1fae5', borderRadius: 12, padding: 14,
    marginTop: 8, alignItems: 'center',
  },
  regStatusText: { fontSize: 14, color: '#065f46', fontWeight: '600', textAlign: 'center' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  modalClose: { fontSize: 18, color: '#888', padding: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#222', flex: 1, textAlign: 'center' },

  bookFormLabel: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 4, textTransform: 'uppercase' },
  bookFormInput: {
    borderWidth: 1.5, borderColor: '#e0e0ee', borderRadius: 10,
    padding: 11, fontSize: 14, color: '#222', marginBottom: 12,
  },

  // Step-based booking flow styles
  bookingSteps: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f8',
  },
  bookingStepItem: { alignItems: 'center', gap: 4 },
  bookingStepDot: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: '#ddd', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  bookingStepDotActive: { borderColor: '#2e7d32', backgroundColor: '#2e7d32' },
  bookingStepDotDone: { borderColor: '#2e7d32', backgroundColor: '#2e7d32' },
  bookingStepDotText: { fontSize: 12, fontWeight: '700', color: '#aaa' },
  bookingStepLabel: { fontSize: 10, color: '#aaa', fontWeight: '600' },
  bookingStepLabelActive: { color: '#2e7d32' },

  // Calendar styles for booking date picker
  calNavRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, marginTop: 4,
  },
  calNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f0f0f8', alignItems: 'center', justifyContent: 'center',
  },
  calNavText: { fontSize: 20, color: '#2e7d32', fontWeight: '700', lineHeight: 22 },
  calMonthLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  calDayHeaders: { flexDirection: 'row', marginBottom: 4 },
  calDayHeader: {
    flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700',
    color: '#aaa', textTransform: 'uppercase',
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  calCellSelected: {
    backgroundColor: '#2e7d32',
    borderRadius: 20,
  },
  calCellToday: {
    borderWidth: 1.5,
    borderColor: '#2e7d32',
    borderRadius: 20,
  },
  calCellPast: { opacity: 0.25 },
  calCellAvail: { borderWidth: 1.5, borderColor: '#4caf50', borderRadius: 20 },
  calCellText: { fontSize: 14, fontWeight: '600', color: '#333' },
  calCellTextSelected: { color: '#fff' },
  calCellTextToday: { color: '#2e7d32' },
  calCellTextPast: { color: '#bbb' },
  calCellTextAvail: { color: '#2e7d32' },
  calCellFullDot: {
    position: 'absolute', bottom: 4, width: 5, height: 5,
    borderRadius: 3, backgroundColor: '#ef9a9a',
  },

  // Waiver
  bookWaiverSection: {
    marginTop: 20, backgroundColor: '#fafafa', borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0', padding: 14, marginBottom: 4,
  },
  waiverTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8 },
  waiverScroll: {
    maxHeight: 180, backgroundColor: '#f5f5f5', borderRadius: 8,
    padding: 10, marginBottom: 12,
  },
  waiverText: { fontSize: 12, color: '#555', lineHeight: 18 },
  waiverCheckRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  waiverCheckbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#aaa', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  waiverCheckboxChecked: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  waiverCheckmark: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  waiverCheckLabel: { fontSize: 13, color: '#333', flex: 1, lineHeight: 19 },

  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  slotChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#2e7d32', backgroundColor: '#fff',
    minWidth: 80, alignItems: 'center',
  },
  slotChipActive: { backgroundColor: '#2e7d32' },
  slotChipText: { fontSize: 14, fontWeight: '600', color: '#2e7d32' },
  slotChipTextActive: { color: '#fff' },

  noSlotsBox: { alignItems: 'center', padding: 24, gap: 6 },
  noSlotsIcon: { fontSize: 36 },
  noSlotsTitle: { fontSize: 15, fontWeight: '700', color: '#555' },
  noSlotsHint: { fontSize: 13, color: '#888', textAlign: 'center' },

  bookSummaryCard: {
    backgroundColor: '#f0fdf4', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#86efac',
    padding: 14, marginBottom: 16, gap: 8,
  },
  bookSummaryTitle: { fontSize: 13, fontWeight: '700', color: '#166534', marginBottom: 4 },
  bookSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookSummaryLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  bookSummaryValue: { fontSize: 13, color: '#1f2937', fontWeight: '700' },

  courtOption: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#ddd',
    marginBottom: 8, backgroundColor: '#f9f9f9',
  },
  courtOptionActive: { borderColor: '#2e7d32', backgroundColor: '#f0fdf4' },
  courtOptionRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  courtOptionRadioActive: { borderColor: '#2e7d32' },
  courtOptionRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2e7d32' },
  courtOptionLabel: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  courtOptionAddr: { fontSize: 12, color: '#666', marginTop: 2 },

  msgBox: { borderRadius: 8, padding: 10, marginVertical: 8, borderWidth: 1 },
  msgBoxOk: { backgroundColor: '#f0fff4', borderColor: '#b8f0ce' },
  msgBoxErr: { backgroundColor: '#fff0f0', borderColor: '#fbd0d0' },
  msgBoxOkText: { color: '#27ae60', fontSize: 13, fontWeight: '500' },
  msgBoxErrText: { color: '#e74c3c', fontSize: 13, fontWeight: '500' },

  lightboxOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute', top: 52, right: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', width: 48, height: 48,
    borderRadius: 24, alignItems: 'center', justifyContent: 'center',
  },
  lightboxHint: {
    position: 'absolute', bottom: 32,
    color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center',
  },
  lightboxNav: {
    position: 'absolute', top: '50%',
    backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 16, paddingHorizontal: 14, borderRadius: 8,
  },
  lightboxNavLeft: { left: 10 },
  lightboxNavRight: { right: 10 },
});
