import { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Modal, ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { groupLessonsAPI, recurringProgramsAPI } from '../../src/api';
import type { GroupLesson, GroupLessonRequest, RecurringProgram, RecurringProgramReg } from '../../src/types';
import AmPmTimePicker from '../../components/AmPmTimePicker';

// Load WebView lazily (same pattern as CoachMapWebView)
let WebViewComponent: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewComponent = require('react-native-webview').WebView;
} catch {}

const NTRP_OPTIONS = ['2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5+', 'Open / All'];

function buildPinMapHtml(lat: number, lng: number, label: string): string {
  const safe = label.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body,#map{width:100%;height:100%;overflow:hidden}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var icon=L.divIcon({html:'<div style="font-size:22px">\uD83D\uDCCD<\/div>',className:'',iconSize:[28,28],iconAnchor:[14,28]});
L.marker([${lat},${lng}],{icon:icon}).addTo(map).bindPopup('${safe}').openPopup();
<\/script></body></html>`;
}

type Tab = 'lessons' | 'requests' | 'programs';

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function hasStarted(dateStr: string, startTime: string) {
  return Date.now() >= new Date(`${dateStr}T${startTime}:00`).getTime();
}

export default function GroupLessonsScreen() {
  const { coach } = useAuth();
  const [tab, setTab] = useState<Tab>('lessons');
  const [lessons, setLessons] = useState<GroupLesson[]>([]);
  const [requests, setRequests] = useState<GroupLessonRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<number | null>(null);

  // Detail modal
  const [detailLesson, setDetailLesson] = useState<GroupLesson | null>(null);
  const [detailRequests, setDetailRequests] = useState<GroupLessonRequest[]>([]);

  // Recurring programs
  const [programs, setPrograms] = useState<RecurringProgram[]>([]);
  const [programRegs, setProgramRegs] = useState<RecurringProgramReg[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<RecurringProgram | null>(null);
  const [programActioning, setProgramActioning] = useState<number | null>(null);

  // Create lesson modal
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [createStart, setCreateStart] = useState('09:00');
  const [createEnd, setCreateEnd] = useState('10:00');
  const [createLocation, setCreateLocation] = useState('');
  const [createLocationLat, setCreateLocationLat] = useState<number | null>(null);
  const [createLocationLng, setCreateLocationLng] = useState<number | null>(null);
  const [createLocationConfirmed, setCreateLocationConfirmed] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [createPrice, setCreatePrice] = useState('35');
  const [createMax, setCreateMax] = useState('12');
  const [createWaitlist, setCreateWaitlist] = useState('4');
  const [createSkillLevel, setCreateSkillLevel] = useState('');
  const [createRequireConfirm, setCreateRequireConfirm] = useState(true);
  const [createWaiver, setCreateWaiver] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const coachId = coach?.coach_id ?? coach?.user_id;

  const loadData = useCallback(async () => {
    if (!coachId) return;
    try {
      const [lessonData, reqData, progData, progRegData] = await Promise.all([
        groupLessonsAPI.getForCoach(coachId),
        groupLessonsAPI.getRequestsForCoach(coachId),
        recurringProgramsAPI.getForCoach(coachId),
        recurringProgramsAPI.getRegistrationsForCoach(coachId),
      ]);
      setLessons(Array.isArray(lessonData) ? lessonData : []);
      setRequests(Array.isArray(reqData) ? reqData : []);
      setPrograms(Array.isArray(progData) ? progData : []);
      setProgramRegs(Array.isArray(progRegData) ? progRegData : []);
    } catch {
      setLessons([]); setRequests([]); setPrograms([]); setProgramRegs([]);
    }
  }, [coachId]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  async function doAction(id: number, fn: () => Promise<any>, onSuccess: (r: any) => void) {
    setActioning(id);
    try {
      const result = await fn();
      if (result?.error) {
        Alert.alert('Error', result.error);
      } else {
        onSuccess(result);
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setActioning(null);
    }
  }

  const resetCreate = () => {
    setCreateTitle(''); setCreateDesc(''); setCreateDate('');
    setCreateStart('09:00'); setCreateEnd('10:00');
    setCreateLocation(''); setCreateLocationLat(null); setCreateLocationLng(null);
    setCreateLocationConfirmed(false); setLocationQuery('');
    setLocationSuggestions([]); setLocationSearching(false); setLocationError('');
    setCreatePrice('35');
    setCreateMax('12'); setCreateWaitlist('4');
    setCreateSkillLevel(''); setCreateRequireConfirm(true);
    setCreateWaiver(''); setCreateError('');
  };

  const searchLocation = async () => {
    const q = locationQuery.trim();
    if (q.length < 3) return;
    setLocationSearching(true);
    setLocationError('');
    setLocationSuggestions([]);
    try {
      const params = new URLSearchParams({
        format: 'json', q, countrycodes: 'us',
        limit: '5', addressdetails: '0', 'accept-language': 'en',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept': 'application/json' },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setLocationSuggestions(data);
      } else {
        setLocationError('No locations found. Try a more specific address.');
      }
    } catch {
      setLocationError('Search failed. Please check your connection.');
    } finally {
      setLocationSearching(false);
    }
  };

  const selectLocation = (s: { display_name: string; lat: string; lon: string }) => {
    setCreateLocation(s.display_name);
    setCreateLocationLat(parseFloat(s.lat));
    setCreateLocationLng(parseFloat(s.lon));
    setCreateLocationConfirmed(true);
    setLocationSuggestions([]);
    setLocationQuery('');
    setLocationError('');
  };

  const clearLocation = () => {
    setCreateLocation('');
    setCreateLocationLat(null);
    setCreateLocationLng(null);
    setCreateLocationConfirmed(false);
    setLocationQuery('');
    setLocationSuggestions([]);
    setLocationError('');
  };

  const handleCreate = async () => {
    setCreateError('');
    if (!createDate.trim() || !createLocation.trim()) {
      setCreateError('Date and location are required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(createDate.trim())) {
      setCreateError('Date must be in YYYY-MM-DD format (e.g. 2026-06-15).');
      return;
    }
    if (!coachId) return;
    setCreating(true);
    try {
      const result = await groupLessonsAPI.create({
        coach_id: coachId,
        coach_user_id: coachId,
        coach_name: coach?.name ?? '',
        title: createTitle.trim() || undefined,
        description: createDesc.trim() || undefined,
        lesson_date: createDate.trim(),
        start_time: createStart,
        end_time: createEnd,
        location: createLocation.trim(),
        location_lat: createLocationLat ?? undefined,
        location_lng: createLocationLng ?? undefined,
        price: Number(createPrice || 0),
        max_registration: Number(createMax || 12),
        waitlist_max: Number(createWaitlist || 0),
        skill_level: createSkillLevel || undefined,
        require_confirmation: createRequireConfirm,
        waiver_text: createWaiver.trim() || undefined,
      });
      if (result?.error) {
        setCreateError(result.error);
      } else {
        setShowCreate(false);
        resetCreate();
        await loadData();
      }
    } catch {
      setCreateError('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmRequest = (r: GroupLessonRequest) => {
    Alert.alert('Confirm', `Confirm ${r.student_name}'s registration?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () =>
          doAction(r.registration_id, () => groupLessonsAPI.confirmRequest(r.registration_id), () => {
            setRequests(prev => prev.map(x => x.registration_id === r.registration_id ? { ...x, status: 'confirmed' } : x));
            setDetailRequests(prev => prev.map(x => x.registration_id === r.registration_id ? { ...x, status: 'confirmed' } : x));
          }),
      },
    ]);
  };

  const handleRejectRequest = (r: GroupLessonRequest) => {
    Alert.alert('Reject', `Reject ${r.student_name}'s registration?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: () =>
          doAction(r.registration_id, () => groupLessonsAPI.rejectRequest(r.registration_id), () => {
            setRequests(prev => prev.map(x => x.registration_id === r.registration_id ? { ...x, status: 'rejected' } : x));
            setDetailRequests(prev => prev.map(x => x.registration_id === r.registration_id ? { ...x, status: 'rejected' } : x));
          }),
      },
    ]);
  };

  const handleCancelLesson = (lesson: GroupLesson) => {
    Alert.alert('Cancel Lesson', `Cancel "${lesson.title || lesson.description || 'Group Lesson'}" on ${formatDate(lesson.lesson_date)}? This will notify all registered students.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Lesson',
        style: 'destructive',
        onPress: () =>
          doAction(lesson.group_lesson_id, () => groupLessonsAPI.cancelLesson(lesson.group_lesson_id), () => {
            setLessons(prev => prev.map(l => l.group_lesson_id === lesson.group_lesson_id ? { ...l, status: 'cancelled' } : l));
            setDetailLesson(null);
          }),
      },
    ]);
  };

  const openLesson = (lesson: GroupLesson) => {
    setDetailLesson(lesson);
    setDetailRequests(requests.filter(r => r.group_lesson_id === lesson.group_lesson_id));
  };

  const handleConfirmProgReg = (r: RecurringProgramReg) => {
    Alert.alert('Confirm', `Confirm ${r.masked_student_name || r.student_name}'s registration for ${r.selected_date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          setProgramActioning(r.reg_id);
          recurringProgramsAPI.confirmRegistration(r.reg_id)
            .then((result: any) => {
              if (result?.error) Alert.alert('Error', result.error);
              else setProgramRegs(prev => prev.map(x => x.reg_id === r.reg_id ? { ...x, status: 'confirmed' } : x));
            })
            .catch(() => Alert.alert('Error', 'Could not confirm. Please try again.'))
            .finally(() => setProgramActioning(null));
        },
      },
    ]);
  };

  const handleRejectProgReg = (r: RecurringProgramReg) => {
    Alert.alert('Reject', `Reject ${r.masked_student_name || r.student_name}'s registration?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive',
        onPress: () => {
          setProgramActioning(r.reg_id);
          recurringProgramsAPI.rejectRegistration(r.reg_id)
            .then((result: any) => {
              if (result?.error) Alert.alert('Error', result.error);
              else setProgramRegs(prev => prev.filter(x => x.reg_id !== r.reg_id));
            })
            .catch(() => Alert.alert('Error', 'Could not reject. Please try again.'))
            .finally(() => setProgramActioning(null));
        },
      },
    ]);
  };

  const handleApproveProgramCancel = (r: RecurringProgramReg) => {
    Alert.alert('Approve Cancellation', `Approve ${r.masked_student_name || r.student_name}'s cancel request?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Approve', style: 'destructive',
        onPress: () => {
          setProgramActioning(r.reg_id);
          recurringProgramsAPI.approveCancelRequest(r.reg_id)
            .then((result: any) => {
              if (result?.error) Alert.alert('Error', result.error);
              else setProgramRegs(prev => prev.filter(x => x.reg_id !== r.reg_id));
            })
            .catch(() => Alert.alert('Error', 'Could not approve. Please try again.'))
            .finally(() => setProgramActioning(null));
        },
      },
    ]);
  };

  const handleDeclineProgramCancel = (r: RecurringProgramReg) => {
    Alert.alert('Decline Cancellation', `Decline cancel request? ${r.masked_student_name || r.student_name} will remain registered.`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Decline',
        onPress: () => {
          setProgramActioning(r.reg_id);
          recurringProgramsAPI.declineCancelRequest(r.reg_id)
            .then((result: any) => {
              if (result?.error) Alert.alert('Error', result.error);
              else setProgramRegs(prev => prev.map(x => x.reg_id === r.reg_id ? { ...x, status: x.cancel_requested_from || 'confirmed' } : x));
            })
            .catch(() => Alert.alert('Error', 'Could not decline. Please try again.'))
            .finally(() => setProgramActioning(null));
        },
      },
    ]);
  };

  const handleDeactivateProgram = (p: RecurringProgram) => {
    Alert.alert('Deactivate Program', `Deactivate "${p.title || 'this program'}"? It will no longer accept new registrations.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive',
        onPress: () => {
          setProgramActioning(p.program_id);
          recurringProgramsAPI.deactivate(p.program_id)
            .then((result: any) => {
              if (result?.error) Alert.alert('Error', result.error);
              else {
                setPrograms(prev => prev.map(x => x.program_id === p.program_id ? { ...x, status: 'inactive' } : x));
                setSelectedProgram(prev => prev?.program_id === p.program_id ? { ...prev, status: 'inactive' } : prev);
              }
            })
            .catch(() => Alert.alert('Error', 'Could not deactivate. Please try again.'))
            .finally(() => setProgramActioning(null));
        },
      },
    ]);
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const activeLessons = lessons.filter(l => l.status === 'active');
  const pastLessons = lessons.filter(l => l.status !== 'active');

  // ── Lesson Card ──────────────────────────────────────────────────────────
  const renderLesson = ({ item: l }: { item: GroupLesson }) => {
    const started = hasStarted(l.lesson_date, l.start_time);
    const cancelled = l.status === 'cancelled';
    return (
      <TouchableOpacity
        style={[styles.card, cancelled && { opacity: 0.6 }]}
        onPress={() => openLesson(l)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {l.title || l.description || 'Group Lesson'}
          </Text>
          <View style={[
            styles.badge,
            cancelled ? styles.badgeGrey : started ? styles.badgeBlue : styles.badgeGreen,
          ]}>
            <Text style={styles.badgeText}>
              {cancelled ? 'Cancelled' : started ? 'Started' : 'Active'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDate}>{formatDate(l.lesson_date)} · {l.start_time}–{l.end_time}</Text>
        <Text style={styles.cardSub}>📍 {l.location}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statItem}>👥 {l.registration_count ?? 0}/{l.max_registration}</Text>
          {l.waitlist_count && l.waitlist_count > 0 ? (
            <Text style={styles.statItem}>⏳ {l.waitlist_count} waitlist</Text>
          ) : null}
          <Text style={styles.statItem}>💰 ${l.price}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Request Card ─────────────────────────────────────────────────────────
  const renderRequest = ({ item: r }: { item: GroupLessonRequest }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{r.student_name}</Text>
        <View style={[
          styles.badge,
          r.status === 'confirmed' ? styles.badgeGreen
            : r.status === 'rejected' ? styles.badgeRed
              : styles.badgeYellow,
        ]}>
          <Text style={styles.badgeText}>
            {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
          </Text>
        </View>
      </View>
      {r.lesson_date ? (
        <Text style={styles.cardDate}>{formatDate(r.lesson_date)} · {r.start_time}–{r.end_time}</Text>
      ) : null}
      {r.student_email ? <Text style={styles.cardSub}>{r.student_email}</Text> : null}

      {r.status === 'pending' && (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.pill, styles.pillGreen]}
            onPress={() => handleConfirmRequest(r)}
            disabled={actioning === r.registration_id}
          >
            <Text style={styles.pillText}>✓ Confirm</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, styles.pillRed]}
            onPress={() => handleRejectRequest(r)}
            disabled={actioning === r.registration_id}
          >
            <Text style={styles.pillText}>✗ Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'lessons' && styles.tabBtnActive]}
          onPress={() => setTab('lessons')}
        >
          <Text style={[styles.tabText, tab === 'lessons' && styles.tabTextActive]}>Lessons</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'requests' && styles.tabBtnActive]}
          onPress={() => setTab('requests')}
        >
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>
            Requests{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'programs' && styles.tabBtnActive]}
          onPress={() => setTab('programs')}
        >
          <Text style={[styles.tabText, tab === 'programs' && styles.tabTextActive]}>
            Programs{programs.filter(p => p.status === 'active').length > 0 ? ` (${programs.filter(p => p.status === 'active').length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
      ) : tab === 'lessons' ? (
        <FlatList
          data={[...activeLessons, ...pastLessons]}
          keyExtractor={item => String(item.group_lesson_id)}
          renderItem={renderLesson}
          ListEmptyComponent={<Text style={styles.empty}>No group lessons yet.</Text>}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      ) : tab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={item => String(item.registration_id)}
          renderItem={renderRequest}
          ListEmptyComponent={<Text style={styles.empty}>No registration requests.</Text>}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={item => String(item.program_id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>No recurring programs yet.</Text>}
          renderItem={({ item: p }) => {
            const regs = programRegs.filter(r => r.program_id === p.program_id);
            const pendingCount = regs.filter(r => r.status === 'pending' || r.status === 'cancel_requested').length;
            return (
              <TouchableOpacity
                style={[styles.card, p.status === 'inactive' && { opacity: 0.6 }]}
                onPress={() => setSelectedProgram(p)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{p.title || 'Recurring Program'}</Text>
                  <View style={[styles.badge, p.status === 'active' ? styles.badgeGreen : styles.badgeGrey]}>
                    <Text style={styles.badgeText}>{p.status === 'active' ? 'Active' : 'Inactive'}</Text>
                  </View>
                </View>
                {Array.isArray(p.schedule_slots) && p.schedule_slots.length > 0
                  ? p.schedule_slots.map((s, i) => (
                      <Text key={i} style={styles.cardDate}>
                        {s.day.charAt(0).toUpperCase() + s.day.slice(1)}: {s.start_time}–{s.end_time}
                      </Text>
                    ))
                  : p.day_of_week ? (
                      <Text style={styles.cardDate}>
                        {p.day_of_week.charAt(0).toUpperCase() + p.day_of_week.slice(1)}: {p.start_time}–{p.end_time}
                      </Text>
                    ) : null}
                <Text style={styles.cardSub}>📍 {p.location}</Text>
                <View style={styles.statsRow}>
                  <Text style={styles.statItem}>👥 {regs.length}/{p.max_registration}</Text>
                  {pendingCount > 0 ? (
                    <Text style={[styles.statItem, { color: '#d97706' }]}>⏳ {pendingCount} pending</Text>
                  ) : null}
                  <Text style={styles.statItem}>💰 ${p.price}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Lesson Detail Modal */}
      <Modal visible={!!detailLesson} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {detailLesson && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>
                  {detailLesson.title || detailLesson.description || 'Group Lesson'}
                </Text>
                <Text style={styles.modalSub}>
                  {formatDate(detailLesson.lesson_date)} · {detailLesson.start_time}–{detailLesson.end_time}
                </Text>
                <Text style={styles.modalSub}>📍 {detailLesson.location}</Text>
                {detailLesson.skill_level ? (
                  <Text style={styles.modalSub}>🎾 Level: {detailLesson.skill_level}</Text>
                ) : null}
                <Text style={styles.modalSub}>
                  👥 {detailLesson.registration_count ?? 0}/{detailLesson.max_registration} registered
                  {detailLesson.waitlist_count && detailLesson.waitlist_count > 0
                    ? ` · ${detailLesson.waitlist_count} waitlist`
                    : ''}
                </Text>
                <Text style={styles.modalSub}>💰 ${detailLesson.price}/person</Text>

                {/* Registrations for this lesson */}
                {detailRequests.length > 0 && (
                  <>
                    <Text style={styles.detailSectionTitle}>Registrations</Text>
                    {detailRequests.map(r => (
                      <View key={r.registration_id} style={styles.detailReqRow}>
                        <Text style={styles.detailReqName}>{r.student_name}</Text>
                        <View style={[
                          styles.badge,
                          r.status === 'confirmed' ? styles.badgeGreen
                            : r.status === 'rejected' ? styles.badgeRed
                              : styles.badgeYellow,
                        ]}>
                          <Text style={styles.badgeText}>
                            {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                          </Text>
                        </View>
                        {r.status === 'pending' && (
                          <View style={{ flexDirection: 'row', gap: 6, marginLeft: 6 }}>
                            <TouchableOpacity
                              style={[styles.pill, styles.pillGreen, { paddingHorizontal: 10, paddingVertical: 5 }]}
                              onPress={() => handleConfirmRequest(r)}
                            >
                              <Text style={styles.pillText}>✓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.pill, styles.pillRed, { paddingHorizontal: 10, paddingVertical: 5 }]}
                              onPress={() => handleRejectRequest(r)}
                            >
                              <Text style={styles.pillText}>✗</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))}
                  </>
                )}

                <View style={[styles.row, { marginTop: 20 }]}>
                  {detailLesson.status === 'active' && (
                    <TouchableOpacity
                      style={[styles.pill, styles.pillRed, { flex: 1 }]}
                      onPress={() => handleCancelLesson(detailLesson)}
                    >
                      <Text style={styles.pillText}>Cancel Lesson</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                    onPress={() => setDetailLesson(null)}
                  >
                    <Text style={[styles.pillText, { color: '#555' }]}>Close</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Recurring Program Detail Modal */}
      <Modal visible={!!selectedProgram} transparent animationType="slide" onRequestClose={() => setSelectedProgram(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedProgram && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{selectedProgram.title || 'Recurring Program'}</Text>
                {Array.isArray(selectedProgram.schedule_slots) && selectedProgram.schedule_slots.length > 0
                  ? selectedProgram.schedule_slots.map((s, i) => (
                      <Text key={i} style={styles.modalSub}>
                        📅 {s.day.charAt(0).toUpperCase() + s.day.slice(1)}: {s.start_time}–{s.end_time}
                      </Text>
                    ))
                  : selectedProgram.day_of_week ? (
                      <Text style={styles.modalSub}>
                        📅 {selectedProgram.day_of_week.charAt(0).toUpperCase() + selectedProgram.day_of_week.slice(1)}: {selectedProgram.start_time}–{selectedProgram.end_time}
                      </Text>
                    ) : null}
                <Text style={styles.modalSub}>📍 {selectedProgram.location}</Text>
                {selectedProgram.skill_level ? (
                  <Text style={styles.modalSub}>🎾 Level: {selectedProgram.skill_level}</Text>
                ) : null}
                {selectedProgram.season_start ? (
                  <Text style={styles.modalSub}>📆 Season: {selectedProgram.season_start} → {selectedProgram.season_end || 'ongoing'}</Text>
                ) : null}
                <Text style={styles.modalSub}>💰 ${selectedProgram.price}/session · Max {selectedProgram.max_registration}</Text>

                {(() => {
                  const regs = programRegs.filter(r => r.program_id === selectedProgram.program_id);
                  if (regs.length === 0) return <Text style={[styles.modalSub, { marginTop: 12 }]}>No active registrations.</Text>;
                  return (
                    <>
                      <Text style={styles.detailSectionTitle}>Registrations</Text>
                      {regs.map(r => (
                        <View key={r.reg_id} style={styles.detailReqRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailReqName}>{r.masked_student_name || r.student_name}</Text>
                            <Text style={{ fontSize: 11, color: '#888' }}>{r.selected_date}</Text>
                          </View>
                          <View style={[
                            styles.badge,
                            r.status === 'confirmed' ? styles.badgeGreen
                              : r.status === 'cancel_requested' ? { backgroundColor: '#f97316' }
                              : r.status === 'waitlisted' ? styles.badgeYellow
                              : styles.badgeYellow,
                          ]}>
                            <Text style={styles.badgeText}>
                              {r.status === 'cancel_requested' ? 'Cancel Req'
                                : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </Text>
                          </View>
                          {r.status === 'pending' && (
                            <View style={{ flexDirection: 'row', gap: 6, marginLeft: 6 }}>
                              <TouchableOpacity
                                style={[styles.pill, styles.pillGreen, { paddingHorizontal: 10, paddingVertical: 5 }]}
                                onPress={() => handleConfirmProgReg(r)}
                                disabled={programActioning === r.reg_id}
                              >
                                <Text style={styles.pillText}>✓</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.pill, styles.pillRed, { paddingHorizontal: 10, paddingVertical: 5 }]}
                                onPress={() => handleRejectProgReg(r)}
                                disabled={programActioning === r.reg_id}
                              >
                                <Text style={styles.pillText}>✗</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {r.status === 'cancel_requested' && (
                            <View style={{ flexDirection: 'row', gap: 6, marginLeft: 6 }}>
                              <TouchableOpacity
                                style={[styles.pill, styles.pillGreen, { paddingHorizontal: 10, paddingVertical: 5 }]}
                                onPress={() => handleApproveProgramCancel(r)}
                                disabled={programActioning === r.reg_id}
                              >
                                <Text style={styles.pillText}>✓</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.pill, { backgroundColor: '#6b7280', paddingHorizontal: 10, paddingVertical: 5 }]}
                                onPress={() => handleDeclineProgramCancel(r)}
                                disabled={programActioning === r.reg_id}
                              >
                                <Text style={styles.pillText}>✗</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      ))}
                    </>
                  );
                })()}

                <View style={[styles.row, { marginTop: 20 }]}>
                  {selectedProgram.status === 'active' && (
                    <TouchableOpacity
                      style={[styles.pill, styles.pillRed, { flex: 1 }]}
                      onPress={() => handleDeactivateProgram(selectedProgram)}
                      disabled={programActioning === selectedProgram.program_id}
                    >
                      <Text style={styles.pillText}>
                        {programActioning === selectedProgram.program_id ? 'Deactivating…' : 'Deactivate'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                    onPress={() => setSelectedProgram(null)}
                  >
                    <Text style={[styles.pillText, { color: '#555' }]}>Close</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* FAB — Create Group Lesson (only on Lessons tab) */}
      {tab === 'lessons' && (
        <TouchableOpacity style={styles.fab} onPress={() => { resetCreate(); setShowCreate(true); }}>
          <Text style={styles.fabText}>+ New Lesson</Text>
        </TouchableOpacity>
      )}

      {/* Create Lesson Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '92%' }]}>
            <Text style={styles.modalTitle}>Create Group Lesson</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {createError ? (
                <View style={styles.createErrBox}>
                  <Text style={styles.createErrText}>{createError}</Text>
                </View>
              ) : null}

              <Text style={styles.createLabel}>Title (optional)</Text>
              <TextInput
                style={styles.createInput}
                value={createTitle}
                onChangeText={setCreateTitle}
                placeholder="e.g. Beginner Clinic"
              />

              <Text style={styles.createLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.createInput, { height: 72, textAlignVertical: 'top' }]}
                value={createDesc}
                onChangeText={setCreateDesc}
                placeholder="What will students learn?"
                multiline
              />

              <Text style={styles.createLabel}>Date <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <TextInput
                style={styles.createInput}
                value={createDate}
                onChangeText={setCreateDate}
                placeholder="YYYY-MM-DD (e.g. 2026-06-15)"
                keyboardType="numeric"
              />

              <Text style={styles.createLabel}>Start Time <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <View style={{ marginBottom: 14 }}>
                <AmPmTimePicker value={createStart} onChange={setCreateStart} />
              </View>

              <Text style={styles.createLabel}>End Time <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <View style={{ marginBottom: 14 }}>
                <AmPmTimePicker value={createEnd} onChange={setCreateEnd} />
              </View>

              <Text style={styles.createLabel}>Location <Text style={{ color: '#dc2626' }}>*</Text></Text>
              {createLocationConfirmed ? (
                <View style={styles.locationConfirmed}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationConfirmedText} numberOfLines={2}>{createLocation}</Text>
                  </View>
                  <TouchableOpacity onPress={clearLocation} style={styles.locationClearBtn}>
                    <Text style={styles.locationClearText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginBottom: 6 }}>
                  <View style={styles.locationSearchRow}>
                    <TextInput
                      style={[styles.createInput, { flex: 1, marginBottom: 0 }]}
                      value={locationQuery}
                      onChangeText={setLocationQuery}
                      placeholder="Search address or court name…"
                      onSubmitEditing={searchLocation}
                      returnKeyType="search"
                      blurOnSubmit={false}
                    />
                    <TouchableOpacity
                      style={styles.locationSearchBtn}
                      onPress={searchLocation}
                      disabled={locationSearching}
                    >
                      <Text style={styles.locationSearchBtnText}>
                        {locationSearching ? '…' : '🔍'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {locationError ? (
                    <Text style={styles.locationErrText}>{locationError}</Text>
                  ) : null}
                  {locationSuggestions.length > 0 && (
                    <View style={styles.suggestionList}>
                      {locationSuggestions.map((s, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.suggestionItem, i > 0 && { borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}
                          onPress={() => selectLocation(s)}
                        >
                          <Text style={styles.suggestionText} numberOfLines={2}>{s.display_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
              {/* Map preview once location is confirmed */}
              {createLocationConfirmed && createLocationLat !== null && createLocationLng !== null && WebViewComponent && (
                <View style={styles.mapPreview}>
                  <WebViewComponent
                    source={{ html: buildPinMapHtml(createLocationLat, createLocationLng, createLocation) }}
                    style={{ flex: 1 }}
                    javaScriptEnabled
                    scrollEnabled={false}
                    pointerEvents="none"
                  />
                </View>
              )}

              <Text style={styles.createLabel}>Skill Level</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {NTRP_OPTIONS.map(lvl => (
                    <TouchableOpacity
                      key={lvl}
                      style={[
                        styles.levelChip,
                        createSkillLevel === lvl && styles.levelChipSel,
                      ]}
                      onPress={() => setCreateSkillLevel(prev => prev === lvl ? '' : lvl)}
                    >
                      <Text style={[
                        styles.levelChipText,
                        createSkillLevel === lvl && styles.levelChipTextSel,
                      ]}>{lvl}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.createLabel}>Price ($) <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <TextInput
                    style={styles.createInput}
                    value={createPrice}
                    onChangeText={setCreatePrice}
                    placeholder="35"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.createLabel}>Max Spots <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <TextInput
                    style={styles.createInput}
                    value={createMax}
                    onChangeText={setCreateMax}
                    placeholder="12"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.createLabel}>Waitlist</Text>
                  <TextInput
                    style={styles.createInput}
                    value={createWaitlist}
                    onChangeText={setCreateWaitlist}
                    placeholder="4"
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.createToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.createLabel}>Require confirmation</Text>
                  <Text style={{ fontSize: 12, color: '#888' }}>
                    {createRequireConfirm ? 'You approve each registration.' : 'Auto-confirm all registrations.'}
                  </Text>
                </View>
                <Switch
                  value={createRequireConfirm}
                  onValueChange={setCreateRequireConfirm}
                  trackColor={{ true: '#2e7d32', false: '#ccc' }}
                  thumbColor="#fff"
                />
              </View>

              <Text style={styles.createLabel}>Waiver / Notes (optional)</Text>
              <TextInput
                style={[styles.createInput, { height: 72, textAlignVertical: 'top' }]}
                value={createWaiver}
                onChangeText={setCreateWaiver}
                placeholder="e.g. All participants must wear proper tennis shoes."
                multiline
              />

              <View style={[styles.row, { marginTop: 8 }]}>
                <TouchableOpacity
                  style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                  onPress={() => setShowCreate(false)}
                  disabled={creating}
                >
                  <Text style={[styles.pillText, { color: '#555' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, styles.pillGreen, { flex: 2 }, creating && { opacity: 0.6 }]}
                  onPress={handleCreate}
                  disabled={creating}
                >
                  <Text style={styles.pillText}>{creating ? 'Creating…' : 'Create Lesson'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f5' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#2e7d32' },
  tabText: { fontSize: 13, color: '#888' },
  tabTextActive: { color: '#2e7d32', fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 15 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#222', flex: 1, marginRight: 8 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#222' },
  cardDate: { fontSize: 13, color: '#555', marginTop: 4 },
  cardSub: { fontSize: 12, color: '#777', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  statItem: { fontSize: 12, color: '#555' },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  badgeGreen: { backgroundColor: '#2e7d32' },
  badgeBlue: { backgroundColor: '#0284c7' },
  badgeYellow: { backgroundColor: '#d97706' },
  badgeRed: { backgroundColor: '#dc2626' },
  badgeGrey: { backgroundColor: '#6b7280' },

  row: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pillGreen: { backgroundColor: '#2e7d32' },
  pillRed: { backgroundColor: '#dc2626' },
  pillGhost: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36, maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#666', marginTop: 4 },
  detailSectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 8 },
  detailReqRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  detailReqName: { flex: 1, fontSize: 14, color: '#333' },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    backgroundColor: '#2e7d32', borderRadius: 28,
    paddingHorizontal: 20, paddingVertical: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Create modal form
  createLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 5 },
  createInput: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1f2937', marginBottom: 14,
  },
  createToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 14, paddingVertical: 8,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f0f0f0',
  },
  createErrBox: {
    backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginBottom: 12,
  },
  createErrText: { fontSize: 13, color: '#dc2626' },
  levelChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  levelChipSel: { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' },
  levelChipText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  levelChipTextSel: { color: '#2e7d32' },

  // Location search
  locationSearchRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 },
  locationSearchBtn: {
    backgroundColor: '#2e7d32', borderRadius: 10, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  locationSearchBtnText: { fontSize: 18, color: '#fff' },
  locationErrText: { fontSize: 12, color: '#dc2626', marginBottom: 8 },
  suggestionList: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#e5e7eb', marginBottom: 10, overflow: 'hidden',
  },
  suggestionItem: { paddingHorizontal: 14, paddingVertical: 12 },
  suggestionText: { fontSize: 13, color: '#374151' },
  locationConfirmed: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f0fdf4', borderRadius: 10, borderWidth: 1,
    borderColor: '#86efac', padding: 12, marginBottom: 10,
  },
  locationConfirmedText: { fontSize: 13, color: '#166534', flex: 1 },
  locationClearBtn: { padding: 4 },
  locationClearText: { fontSize: 16, color: '#6b7280' },
  mapPreview: {
    height: 180, borderRadius: 12, overflow: 'hidden',
    marginBottom: 14, borderWidth: 1, borderColor: '#e5e7eb',
  },
});
