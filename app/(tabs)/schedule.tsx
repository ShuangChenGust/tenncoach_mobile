import { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { bookingsAPI, groupLessonsAPI, coachBlocksAPI, coachesAPI, studentsAPI } from '../../src/api';
import type { Booking, GroupLesson } from '../../src/types';

type Tab = 'calendar' | 'requests' | 'upcoming' | 'past';

interface StudentStats {
  ntrpLevel?: string;
  ntrpHistory?: { date: string; value: string }[];
  strongSkills?: string[];
  workOnSkills?: string[];
}

function parseStudentStats(statsData?: string): StudentStats {
  try {
    const p = JSON.parse(statsData || '{}');
    const history = Array.isArray(p.ntrpHistory) ? p.ntrpHistory : [];
    const ntrp = history.length > 0 ? history[history.length - 1].value : p.ntrpLevel ?? '';
    return {
      ntrpLevel: ntrp,
      strongSkills: p.strongSkills ?? p.checkedSkills ?? [],
      workOnSkills: p.workOnSkills ?? [],
    };
  } catch { return {}; }
}

// ── Calendar helpers ────────────────────────────────────────────────────────
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type MonthBlock = { label: string; weeks: (string | null)[][] };

function buildCalMonths(): MonthBlock[] {
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const dateList: Date[] = [];
  for (let i = 0; i <= 60; i++) {
    const d = new Date(todayD); d.setDate(todayD.getDate() + i); dateList.push(d);
  }
  const blocks: MonthBlock[] = [];
  let di = 0;
  while (di < dateList.length) {
    const first = dateList[di];
    const m = first.getMonth(); const y = first.getFullYear();
    const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthDates: Date[] = [];
    while (di < dateList.length && dateList[di].getMonth() === m && dateList[di].getFullYear() === y) {
      monthDates.push(dateList[di++]);
    }
    const padded: (string | null)[] = [];
    for (let p = 0; p < monthDates[0].getDay(); p++) padded.push(null);
    padded.push(...monthDates.map(d => d.toISOString().slice(0, 10)));
    while (padded.length % 7 !== 0) padded.push(null);
    const weeks: (string | null)[][] = [];
    for (let wi = 0; wi < padded.length; wi += 7) weeks.push(padded.slice(wi, wi + 7));
    blocks.push({ label, weeks });
  }
  return blocks;
}

const calMonths = buildCalMonths();

// ── Availability helpers (mirrors web CombinedCalendar) ────────────────────
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type DayKey = typeof DAY_KEYS[number];
type TimeWindow = { start: string; end: string };
type DayAvail = { available?: boolean; windows?: TimeWindow[]; start?: string; end?: string };
type AdhocSlot = { id?: string; date: string; start: string; end: string; label?: string };
type AvailJson = Partial<Record<DayKey, DayAvail>> & { adhoc_slots?: AdhocSlot[] };

function parseAvailability(json?: string): AvailJson {
  try {
    const parsed = JSON.parse(json || '{}') as AvailJson;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function getWeeklyWindows(dateStr: string, avail: AvailJson): TimeWindow[] {
  const key = DAY_KEYS[new Date(dateStr + 'T12:00:00').getDay()];
  const day = avail[key];
  if (!day?.available) return [];
  if (Array.isArray(day.windows) && day.windows.length > 0)
    return day.windows.filter(w => !!w?.start && !!w?.end);
  if (day.start && day.end) return [{ start: day.start, end: day.end }];
  return [];
}

function getAdhocWindows(dateStr: string, avail: AvailJson): AdhocSlot[] {
  const slots = Array.isArray(avail.adhoc_slots) ? avail.adhoc_slots : [];
  return slots.filter(s => s.date === dateStr && !!s.start && !!s.end);
}
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatDateLong(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function maskName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length <= 1 ? name : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function canMarkAttendance(b: Booking) {
  const dt = new Date(`${b.date}T${b.start_time}:00`);
  return Date.now() >= dt.getTime() - 30 * 60 * 1000;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#2e7d32',
  new_time_proposed: '#7c3aed',
  reschedule_requested: '#0284c7',
  rejected: '#dc2626',
  cancelled: '#6b7280',
};

export default function ScheduleScreen() {
  const { coach } = useAuth();
  const [tab, setTab] = useState<Tab>('calendar');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [groupLessons, setGroupLessons] = useState<GroupLesson[]>([]);
  const [coachBlocks, setCoachBlocks] = useState<{ block_id: number; start_date: string; end_date: string; label?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<number | null>(null);

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Calendar day-management state
  const [coachProfile, setCoachProfile] = useState<any>(coach);
  const [calActionMode, setCalActionMode] = useState<'block' | 'slot' | null>(null);
  const [calBlockLabel, setCalBlockLabel] = useState('');
  const [calSlotStart, setCalSlotStart] = useState('09:00');
  const [calSlotEnd, setCalSlotEnd] = useState('10:00');
  const [calSlotLabel, setCalSlotLabel] = useState('');
  const [calSaving, setCalSaving] = useState(false);
  const [calActionError, setCalActionError] = useState('');
  const [calActionSuccess, setCalActionSuccess] = useState('');

  // Action modals
  const [rejectModal, setRejectModal] = useState<Booking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [proposeModal, setProposeModal] = useState<Booking | null>(null);
  const [proposeDate, setProposeDate] = useState('');
  const [proposeStart, setProposeStart] = useState('');
  const [proposeEnd, setProposeEnd] = useState('');
  const [proposeNote, setProposeNote] = useState('');

  // Auto-set propose end time to 1 hour after start (preserving minutes)
  useEffect(() => {
    if (!proposeStart) { setProposeEnd(''); return; }
    const parts = proposeStart.split(':');
    if (parts.length < 2) return;
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    if (isNaN(h)) return;
    const newH = Math.min(h + 1, 23);
    setProposeEnd(`${String(newH).padStart(2, '0')}:${m}`);
  }, [proposeStart]);

  // Student profile cache: studentId → StudentStats
  const [studentProfiles, setStudentProfiles] = useState<Record<number, StudentStats | null>>({});
  const [expandedProfiles, setExpandedProfiles] = useState<Set<number>>(new Set());

  const toggleStudentProfile = async (studentId: number) => {
    if (expandedProfiles.has(studentId)) {
      setExpandedProfiles(prev => { const s = new Set(prev); s.delete(studentId); return s; });
      return;
    }
    setExpandedProfiles(prev => new Set([...prev, studentId]));
    if (studentProfiles[studentId] !== undefined) return;
    // Mark loading
    setStudentProfiles(prev => ({ ...prev, [studentId]: null }));
    try {
      const data = await studentsAPI.getById(studentId);
      setStudentProfiles(prev => ({
        ...prev,
        [studentId]: parseStudentStats(data?.stats_data),
      }));
    } catch {
      setStudentProfiles(prev => ({ ...prev, [studentId]: {} }));
    }
  };

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const coachId = coach?.coach_id ?? coach?.user_id;

  const loadBookings = useCallback(async () => {
    if (!coachId) return;
    try {
      const [bData, gData, blockData, profileData] = await Promise.all([
        bookingsAPI.getForCoach(String(coachId)),
        groupLessonsAPI.getForCoach(Number(coachId)),
        coachBlocksAPI.getBlocks(String(coachId)),
        coachesAPI.getById(String(coachId)),
      ]);
      setBookings(Array.isArray(bData) ? bData : []);
      setGroupLessons(Array.isArray(gData) ? gData : []);
      setCoachBlocks(Array.isArray(blockData) ? blockData : []);
      if (profileData && !profileData.error) setCoachProfile(profileData);
    } catch {
      setBookings([]);
    }
  }, [coachId]);

  useEffect(() => {
    setLoading(true);
    loadBookings().finally(() => setLoading(false));
  }, [loadBookings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  };

  // Reset cal action state when selected date changes
  useEffect(() => {
    setCalActionMode(null);
    setCalBlockLabel('');
    setCalSlotStart('09:00');
    setCalSlotEnd('10:00');
    setCalSlotLabel('');
    setCalActionError('');
    setCalActionSuccess('');
  }, [selectedDate]);

  // ── Calendar day-management handlers ─────────────────────────────────────
  const updateAdhocSlots = async (nextSlots: AdhocSlot[], successMsg: string) => {
    const avail = parseAvailability(coachProfile?.availability);
    const newJson = JSON.stringify({ ...avail, adhoc_slots: nextSlots });
    const updated = await coachesAPI.update(String(coachId), { availability: newJson });
    if (updated && !updated.error) {
      setCoachProfile(updated);
      setCalActionSuccess(successMsg);
    } else {
      throw new Error(updated?.error || 'Failed to update');
    }
  };

  const handleBlockDate = async () => {
    if (!selectedDate) return;
    setCalSaving(true);
    setCalActionError('');
    setCalActionSuccess('');
    try {
      const created = await coachBlocksAPI.addBlock(String(coachId), {
        start_date: selectedDate,
        end_date: selectedDate,
        label: calBlockLabel.trim() || undefined,
      });
      if (created?.error) { setCalActionError(created.error); return; }
      setCoachBlocks(prev => [...prev, created].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setCalActionMode(null);
      setCalBlockLabel('');
      setCalActionSuccess('Date blocked.');
    } catch {
      setCalActionError('Unable to block that date.');
    } finally {
      setCalSaving(false);
    }
  };

  const handleRemoveBlock = async (blockId: number) => {
    setCalSaving(true);
    setCalActionError('');
    setCalActionSuccess('');
    try {
      await coachBlocksAPI.deleteBlock(String(coachId), blockId);
      setCoachBlocks(prev => prev.filter(bl => bl.block_id !== blockId));
      setCalActionSuccess('Block removed.');
    } catch {
      setCalActionError('Unable to remove block.');
    } finally {
      setCalSaving(false);
    }
  };

  const handleAddSlot = async () => {
    if (!selectedDate) return;
    if (!calSlotStart || !calSlotEnd || calSlotEnd <= calSlotStart) {
      setCalActionError('Choose a valid start and end time (e.g. 09:00 or 09:30).');
      return;
    }
    setCalSaving(true);
    setCalActionError('');
    setCalActionSuccess('');
    try {
      const avail = parseAvailability(coachProfile?.availability);
      const allSlots = Array.isArray(avail.adhoc_slots) ? avail.adhoc_slots : [];
      const newSlot: AdhocSlot = {
        id: String(Date.now()),
        date: selectedDate,
        start: calSlotStart,
        end: calSlotEnd,
        label: calSlotLabel.trim() || undefined,
      };
      const updated = [...allSlots, newSlot].sort((a, b) =>
        a.date !== b.date ? a.date.localeCompare(b.date) : a.start.localeCompare(b.start)
      );
      await updateAdhocSlots(updated, 'Available slot added.');
      setCalActionMode(null);
      setCalSlotStart('09:00');
      setCalSlotEnd('10:00');
      setCalSlotLabel('');
    } catch {
      setCalActionError('Unable to save that slot.');
    } finally {
      setCalSaving(false);
    }
  };

  const handleDeleteSlot = async (slotId?: string, slotStart?: string, slotEnd?: string) => {
    setCalSaving(true);
    setCalActionError('');
    setCalActionSuccess('');
    try {
      const avail = parseAvailability(coachProfile?.availability);
      const allSlots = Array.isArray(avail.adhoc_slots) ? avail.adhoc_slots : [];
      const updated = allSlots.filter(s => {
        if (slotId && s.id) return s.id !== slotId;
        return !(s.date === selectedDate && s.start === slotStart && s.end === slotEnd);
      });
      await updateAdhocSlots(updated, 'Slot removed.');
    } catch {
      setCalActionError('Unable to remove that slot.');
    } finally {
      setCalSaving(false);
    }
  };

  const now = Date.now();
  const endMs = (b: Booking) => new Date(`${b.date}T${b.end_time}:00`).getTime();

  const requests = bookings.filter(
    b => b.status === 'pending' || b.status === 'new_time_proposed',
  );
  const upcoming = bookings.filter(
    b =>
      (b.status === 'confirmed' || b.status === 'reschedule_requested') &&
      endMs(b) > now,
  );
  const past = bookings.filter(b => b.status === 'confirmed' && endMs(b) <= now);

  // Sessions where attendance can be marked right now
  const currentSessions = upcoming.filter(
    b => b.status === 'confirmed' && canMarkAttendance(b),
  );

  async function doAction(id: number, fn: () => Promise<any>) {
    setActioning(id);
    try {
      const result = await fn();
      if (result?.error) {
        Alert.alert('Error', result.error);
      } else {
        setBookings(prev => prev.map(b => (b.booking_id === id ? result : b)));
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setActioning(null);
    }
  }

  const handleConfirm = (b: Booking) => {
    Alert.alert(
      'Confirm Booking',
      `Confirm session with ${maskName(b.student_name)} on ${formatDate(b.date)} ${b.start_time}–${b.end_time}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => doAction(b.booking_id, () => bookingsAPI.confirm(b.booking_id)),
        },
      ],
    );
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    const b = rejectModal;
    setRejectModal(null);
    await doAction(b.booking_id, () =>
      bookingsAPI.reject(b.booking_id, rejectReason.trim() || undefined),
    );
    setRejectReason('');
  };

  const handlePropose = async () => {
    if (!proposeModal || !proposeDate || !proposeStart || !proposeEnd) return;
    const b = proposeModal;
    setProposeModal(null);
    await doAction(b.booking_id, () =>
      bookingsAPI.proposeTime(b.booking_id, {
        counter_date: proposeDate,
        counter_start: proposeStart,
        counter_end: proposeEnd,
        counter_note: proposeNote.trim() || undefined,
      }),
    );
    setProposeDate(''); setProposeStart(''); setProposeEnd(''); setProposeNote('');
  };

  const handleCancelConfirm = async () => {
    if (!cancelModal) return;
    const b = cancelModal;
    setCancelModal(null);
    await doAction(b.booking_id, () =>
      bookingsAPI.cancel(b.booking_id, cancelReason.trim() || undefined),
    );
    setCancelReason('');
  };

  const handleAttendance = (b: Booking, action: 'attended' | 'noshow' | 'unmark') => {
    const labels = { attended: 'Check-in', noshow: 'Mark No-show', unmark: 'Undo' };
    Alert.alert(labels[action], `${labels[action]} for ${maskName(b.student_name)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        onPress: () =>
          doAction(b.booking_id, () => {
            if (action === 'attended') return bookingsAPI.markAttended(b.booking_id);
            if (action === 'noshow') return bookingsAPI.markNoShow(b.booking_id);
            return bookingsAPI.unmarkAttendance(b.booking_id);
          }),
      },
    ]);
  };

  // ── Calendar helpers ────────────────────────────────────────────────────
  const privateByDate: Record<string, Booking[]> = {};
  const alertsByDate: Record<string, Booking[]> = {};
  const groupByDate: Record<string, GroupLesson[]> = {};

  for (const b of bookings) {
    if (b.status === 'confirmed' || b.status === 'reschedule_requested') {
      privateByDate[b.date] = [...(privateByDate[b.date] || []), b];
    }
    if (b.status === 'pending' || b.status === 'new_time_proposed' || b.status === 'cancel_requested') {
      alertsByDate[b.date] = [...(alertsByDate[b.date] || []), b];
    }
  }
  for (const l of groupLessons) {
    if (l.status === 'active') {
      groupByDate[l.lesson_date] = [...(groupByDate[l.lesson_date] || []), l];
    }
  }

  const renderCalendar = () => {
    const availability = parseAvailability(coachProfile?.availability);
    return (
      <ScrollView contentContainerStyle={styles.calScroll}>
        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2e7d32' }]} />
            <Text style={styles.legendText}>Private</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#667eea' }]} />
            <Text style={styles.legendText}>Group</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f39c12' }]} />
            <Text style={styles.legendText}>Pending</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotAvail]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotBlocked]} />
            <Text style={styles.legendText}>Blocked</Text>
          </View>
        </View>

        {calMonths.map((monthBlock, mi) => (
          <View key={mi} style={styles.calMonth}>
            <Text style={styles.calMonthLabel}>{monthBlock.label}</Text>
            <View style={styles.calWeekRow}>
              {DAY_SHORT.map(d => (
                <Text key={d} style={styles.calWday}>{d}</Text>
              ))}
            </View>
            {monthBlock.weeks.map((week, wi) => (
              <View key={wi} style={styles.calWeekRow}>
                {week.map((ds, di) => {
                  if (!ds) return <View key={di} style={styles.calEmpty} />;
                  const priv = privateByDate[ds] || [];
                  const grp = groupByDate[ds] || [];
                  const alerts = alertsByDate[ds] || [];
                  const isBlocked = coachBlocks.some(bl => ds >= bl.start_date && ds <= bl.end_date);
                  const hasAvail = !isBlocked && (
                    getWeeklyWindows(ds, availability).length > 0 ||
                    getAdhocWindows(ds, availability).length > 0
                  );
                  const isToday = ds === today;
                  const isPast = ds < today;
                  const isSel = selectedDate === ds;
                  const dayNum = parseInt(ds.slice(8), 10);

                  let bgColor = isPast ? '#f9f9f9' : '#fff';
                  let borderColor = '#e5e7eb';
                  let borderWidth = 1.5;
                  if (isBlocked) { bgColor = '#fecaca'; borderColor = '#dc2626'; borderWidth = 2; }
                  else if (priv.length > 0 && grp.length > 0) { bgColor = '#e8f5e9'; borderColor = '#2e7d32'; }
                  else if (priv.length > 0) { bgColor = '#e8f5e9'; borderColor = '#2e7d32'; }
                  else if (grp.length > 0) { bgColor = '#eef0ff'; borderColor = '#667eea'; }
                  else if (alerts.length > 0) { bgColor = '#fffbeb'; borderColor = '#f39c12'; }
                  else if (hasAvail) { bgColor = '#f0fdf4'; borderColor = '#86efac'; }
                  if (isToday && !isBlocked) { borderColor = '#2e7d32'; borderWidth = 2.5; }
                  if (isSel) { bgColor = '#dcfce7'; borderColor = '#16a34a'; borderWidth = 2.5; }

                  return (
                    <Pressable
                      key={di}
                      style={[styles.calDay, { backgroundColor: bgColor, borderColor, borderWidth }]}
                      onPress={() => setSelectedDate(isSel ? null : ds)}
                    >
                      <Text style={[
                        styles.calDayNum,
                        isToday && styles.calDayNumToday,
                        isPast && { color: '#bbb' },
                        isBlocked && { color: '#b91c1c' },
                      ]}>{dayNum}</Text>
                      <View style={styles.calDots}>
                        {priv.length > 0 && (
                          <View style={[styles.calCountPill, { backgroundColor: '#2e7d32' }]}>
                            <Text style={styles.calCountText}>{priv.length}</Text>
                          </View>
                        )}
                        {grp.length > 0 && (
                          <View style={[styles.calCountPill, { backgroundColor: '#667eea' }]}>
                            <Text style={styles.calCountText}>{grp.length}</Text>
                          </View>
                        )}
                        {alerts.length > 0 && (
                          <View style={[styles.calCountPill, { backgroundColor: '#f39c12' }]}>
                            <Text style={styles.calCountText}>{alerts.length}</Text>
                          </View>
                        )}
                        {isBlocked && priv.length === 0 && grp.length === 0 && alerts.length === 0 && (
                          <Text style={styles.calBlockedMark}>✕</Text>
                        )}
                        {hasAvail && priv.length === 0 && grp.length === 0 && alerts.length === 0 && (
                          <View style={styles.calAvailDot} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ))}

        {/* Day detail panel */}
        {selectedDate && (() => {
          const priv = privateByDate[selectedDate] || [];
          const grp = groupByDate[selectedDate] || [];
          const alerts = alertsByDate[selectedDate] || [];
          const activeBlock = coachBlocks.find(bl => selectedDate >= bl.start_date && selectedDate <= bl.end_date) ?? null;
          const isBlocked = !!activeBlock;
          const isPastDate = selectedDate < today;
          const weeklyWins = getWeeklyWindows(selectedDate, availability);
          const adhocWins = getAdhocWindows(selectedDate, availability);
          const total = priv.length + grp.length + alerts.length;

          return (
            <View style={styles.calDetail}>
              <Text style={styles.calDetailTitle}>{formatDateLong(selectedDate)}</Text>

              {/* ── Manage this day ───────────────────────────────── */}
              {!isPastDate && (
                <View style={styles.calManagePanel}>
                  <Text style={styles.calManageTitle}>Manage this day</Text>
                  <Text style={styles.calManageDesc}>
                    {isBlocked
                      ? 'This date is blocked. Remove the block to re-enable bookings.'
                      : 'Block the day or add extra bookable time.'}
                  </Text>
                  <View style={styles.calActionBtns}>
                    {!isBlocked && (
                      <TouchableOpacity
                        style={[styles.calActionBtn, calActionMode === 'block' && styles.calActionBtnActive]}
                        onPress={() => setCalActionMode(m => m === 'block' ? null : 'block')}
                        disabled={calSaving}
                      >
                        <Text style={[styles.calActionBtnText, calActionMode === 'block' && { color: '#fff' }]}>
                          🚫 Block day
                        </Text>
                      </TouchableOpacity>
                    )}
                    {!isBlocked && (
                      <TouchableOpacity
                        style={[styles.calActionBtn, calActionMode === 'slot' && styles.calActionBtnActive]}
                        onPress={() => setCalActionMode(m => m === 'slot' ? null : 'slot')}
                        disabled={calSaving}
                      >
                        <Text style={[styles.calActionBtnText, calActionMode === 'slot' && { color: '#fff' }]}>
                          ➕ Add slot
                        </Text>
                      </TouchableOpacity>
                    )}
                    {activeBlock && (
                      <TouchableOpacity
                        style={[styles.calActionBtn, styles.calActionBtnDanger]}
                        onPress={() => handleRemoveBlock(activeBlock.block_id)}
                        disabled={calSaving}
                      >
                        <Text style={[styles.calActionBtnText, { color: '#dc2626' }]}>
                          {calSaving ? 'Removing…' : '✓ Unblock day'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {!!calActionError && <Text style={[styles.calMsg, styles.calMsgError]}>{calActionError}</Text>}
                  {!!calActionSuccess && <Text style={[styles.calMsg, styles.calMsgSuccess]}>{calActionSuccess}</Text>}

                  {/* Block form */}
                  {calActionMode === 'block' && !isBlocked && (
                    <View style={styles.calFormCard}>
                      <Text style={styles.calFormLabel}>Reason (optional)</Text>
                      <TextInput
                        style={styles.calFormInput}
                        value={calBlockLabel}
                        onChangeText={setCalBlockLabel}
                        placeholder="Tournament, travel, personal day…"
                        maxLength={120}
                      />
                      <TouchableOpacity
                        style={[styles.calPrimaryBtn, calSaving && { opacity: 0.6 }]}
                        onPress={handleBlockDate}
                        disabled={calSaving}
                      >
                        <Text style={styles.calPrimaryBtnText}>{calSaving ? 'Blocking…' : 'Confirm block'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Add slot form */}
                  {calActionMode === 'slot' && !isBlocked && (
                    <View style={styles.calFormCard}>
                      <View style={styles.calTimeRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.calFormLabel}>Start (HH:MM)</Text>
                          <TextInput
                            style={styles.calFormInput}
                            value={calSlotStart}
                            onChangeText={setCalSlotStart}
                            placeholder="09:30"
                            autoCapitalize="none"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.calFormLabel}>End (HH:MM)</Text>
                          <TextInput
                            style={styles.calFormInput}
                            value={calSlotEnd}
                            onChangeText={setCalSlotEnd}
                            placeholder="10:30"
                            autoCapitalize="none"
                          />
                        </View>
                      </View>
                      <Text style={styles.calFormLabel}>Label (optional)</Text>
                      <TextInput
                        style={styles.calFormInput}
                        value={calSlotLabel}
                        onChangeText={setCalSlotLabel}
                        placeholder="Morning clinic, extra hour…"
                        maxLength={80}
                      />
                      <TouchableOpacity
                        style={[styles.calPrimaryBtn, calSaving && { opacity: 0.6 }]}
                        onPress={handleAddSlot}
                        disabled={calSaving}
                      >
                        <Text style={styles.calPrimaryBtnText}>{calSaving ? 'Saving…' : 'Save slot'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {isPastDate && (
                <Text style={[styles.calMsg, { color: '#aaa', marginBottom: 8 }]}>
                  Availability management is only available for today and future dates.
                </Text>
              )}

              {/* Blocked notice */}
              {isBlocked && (
                <View style={[styles.calEventCard, styles.calCardBlocked, { marginBottom: 10 }]}>
                  <Text style={styles.calEventType}>⛔ Blocked</Text>
                  <Text style={styles.calEventBody}>{activeBlock?.label || 'Unavailable for booking'}</Text>
                </View>
              )}

              {/* Availability windows */}
              {!isBlocked && (weeklyWins.length > 0 || adhocWins.length > 0) && (
                <View style={styles.calAvailSection}>
                  <Text style={styles.calAvailHeader}>🟢 Available windows</Text>
                  {weeklyWins.map((w, wi) => (
                    <View key={`weekly-${wi}`} style={styles.calAvailSlotCard}>
                      <Text style={styles.calAvailSlotIcon}>📅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.calAvailSlotTime}>{w.start} – {w.end}</Text>
                        <Text style={styles.calAvailSlotLabel}>Weekly template</Text>
                      </View>
                    </View>
                  ))}
                  {adhocWins.map((s, i) => (
                    <View key={`adhoc-${s.id ?? i}`} style={styles.calAvailSlotCard}>
                      <Text style={styles.calAvailSlotIcon}>⏰</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.calAvailSlotTime}>{s.start} – {s.end}</Text>
                        <Text style={styles.calAvailSlotLabel}>{s.label || 'Extra slot'}</Text>
                      </View>
                      {!isPastDate && (
                        <TouchableOpacity
                          style={styles.calInlineBtn}
                          onPress={() => handleDeleteSlot(s.id, s.start, s.end)}
                          disabled={calSaving}
                        >
                          <Text style={styles.calInlineBtnText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {total === 0 && !isBlocked && weeklyWins.length === 0 && adhocWins.length === 0 && (
                <Text style={styles.calDetailEmpty}>No sessions or availability on this day.</Text>
              )}

              {/* Pending request cards with inline actions */}
              {alerts.map(b => (
                <View key={`alert-${b.booking_id}`} style={[styles.calEventCard, styles.calCardPending]}>
                  <Text style={styles.calEventType}>
                    🔔 {b.status === 'new_time_proposed' ? 'Time Proposed' : b.status === 'cancel_requested' ? 'Cancel Requested' : 'Pending Request'}
                  </Text>
                  <Text style={styles.calEventBody}>{maskName(b.student_name)}</Text>
                  <Text style={styles.calEventMeta}>{b.start_time}–{b.end_time}</Text>
                  {b.court_address ? <Text style={styles.calEventMeta}>📍 {b.court_address}</Text> : null}
                  {b.note ? <Text style={[styles.calEventMeta, { fontStyle: 'italic' }]}>"{b.note}"</Text> : null}
                  {b.status === 'new_time_proposed' && b.counter_date ? (
                    <View style={styles.counterBox}>
                      <Text style={styles.counterTitle}>Proposed: {formatDate(b.counter_date)} · {b.counter_start}–{b.counter_end}</Text>
                      {b.counter_note ? <Text style={styles.counterNote}>"{b.counter_note}"</Text> : null}
                      <Text style={styles.counterHint}>Awaiting student response</Text>
                    </View>
                  ) : b.status === 'pending' ? (
                    <View style={[styles.row, { marginTop: 10, flexWrap: 'wrap' }]}>
                      <TouchableOpacity
                        style={[styles.pill, styles.pillGreen]}
                        onPress={() => handleConfirm(b)}
                        disabled={actioning === b.booking_id}
                      >
                        <Text style={styles.pillText}>✓ Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pill, styles.pillRed]}
                        onPress={() => { setRejectModal(b); setRejectReason(''); }}
                        disabled={actioning === b.booking_id}
                      >
                        <Text style={styles.pillText}>✗ Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pill, styles.pillPurple]}
                        onPress={() => { setProposeModal(b); setProposeDate(b.date); setProposeStart(''); setProposeEnd(''); setProposeNote(''); }}
                        disabled={actioning === b.booking_id}
                      >
                        <Text style={styles.pillText}>↩ Propose</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ))}

              {/* Confirmed private lesson cards */}
              {priv.map(b => (
                <View key={`priv-${b.booking_id}`} style={[styles.calEventCard, styles.calCardPrivate]}>
                  <Text style={styles.calEventType}>🎾 Private Lesson</Text>
                  <Text style={styles.calEventBody}>{maskName(b.student_name)}</Text>
                  <Text style={styles.calEventMeta}>{b.start_time}–{b.end_time}</Text>
                  {b.status === 'reschedule_requested' && <Text style={styles.calEventMeta}>⚠ Reschedule review pending</Text>}
                  {b.court_address ? <Text style={styles.calEventMeta}>📍 {b.court_address}</Text> : null}
                  {canMarkAttendance(b) && b.no_show == null && (
                    <View style={[styles.row, { marginTop: 8 }]}>
                      <TouchableOpacity
                        style={[styles.pill, styles.pillGreen]}
                        onPress={() => handleAttendance(b, 'attended')}
                        disabled={actioning === b.booking_id}
                      >
                        <Text style={styles.pillText}>✓ Check-in</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pill, styles.pillRed]}
                        onPress={() => handleAttendance(b, 'noshow')}
                        disabled={actioning === b.booking_id}
                      >
                        <Text style={styles.pillText}>✗ No-show</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {b.no_show === 0 && <Text style={[styles.calEventMeta, { color: '#2e7d32', fontWeight: '600' }]}>✓ Attended</Text>}
                  {b.no_show === 1 && <Text style={[styles.calEventMeta, { color: '#dc2626', fontWeight: '600' }]}>✗ No-show</Text>}
                </View>
              ))}

              {/* Group lesson cards */}
              {grp.map(l => (
                <View key={`grp-${l.group_lesson_id}`} style={[styles.calEventCard, styles.calCardGroup]}>
                  <Text style={styles.calEventType}>👥 Group Lesson</Text>
                  <Text style={styles.calEventBody}>{l.title || l.description || 'Group lesson'}</Text>
                  <Text style={styles.calEventMeta}>{l.start_time}–{l.end_time} · 📍 {l.location}</Text>
                  <Text style={styles.calEventMeta}>{l.registration_count ?? 0}/{l.max_registration} confirmed</Text>
                </View>
              ))}
            </View>
          );
        })()}
      </ScrollView>
    );
  };

  // ── Current sessions banner ──────────────────────────────────────────────
  const renderCurrentBanner = () => {
    if (currentSessions.length === 0) return null;
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>📋 Current Sessions — Mark Attendance</Text>
        {currentSessions.map(b => (
          <View key={b.booking_id} style={styles.bannerCard}>
            <Text style={styles.bannerName}>{maskName(b.student_name)}</Text>
            <Text style={styles.bannerTime}>{b.start_time}–{b.end_time}</Text>
            {b.court_address ? (
              <Text style={styles.bannerCourt}>
                📍 {b.court_label ? `${b.court_label}: ` : ''}{b.court_address}
              </Text>
            ) : null}
            <View style={styles.row}>
              {b.no_show == null ? (
                <>
                  <TouchableOpacity
                    style={[styles.pill, styles.pillGreen]}
                    onPress={() => handleAttendance(b, 'attended')}
                    disabled={actioning === b.booking_id}
                  >
                    <Text style={styles.pillText}>✓ Check-in</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pill, styles.pillRed]}
                    onPress={() => handleAttendance(b, 'noshow')}
                    disabled={actioning === b.booking_id}
                  >
                    <Text style={styles.pillText}>✗ No-show</Text>
                  </TouchableOpacity>
                </>
              ) : b.no_show === 0 ? (
                <>
                  <View style={[styles.pill, styles.pillGreenLight]}>
                    <Text style={[styles.pillText, { color: '#2e7d32' }]}>✓ Checked In</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.pill, styles.pillRed]}
                    onPress={() => handleAttendance(b, 'noshow')}
                    disabled={actioning === b.booking_id}
                  >
                    <Text style={styles.pillText}>✗ No-show instead</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pill, styles.pillGhost]}
                    onPress={() => handleAttendance(b, 'unmark')}
                    disabled={actioning === b.booking_id}
                  >
                    <Text style={[styles.pillText, { color: '#555' }]}>Undo</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={[styles.pill, styles.pillRedLight]}>
                    <Text style={[styles.pillText, { color: '#dc2626' }]}>✗ No-show</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.pill, styles.pillGreen]}
                    onPress={() => handleAttendance(b, 'attended')}
                    disabled={actioning === b.booking_id}
                  >
                    <Text style={styles.pillText}>✓ Check-in instead</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pill, styles.pillGhost]}
                    onPress={() => handleAttendance(b, 'unmark')}
                    disabled={actioning === b.booking_id}
                  >
                    <Text style={[styles.pillText, { color: '#555' }]}>Undo</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))}
      </View>
    );
  };

  // ── Request card ─────────────────────────────────────────────────────────
  const renderRequestCard = ({ item: b }: { item: Booking }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{maskName(b.student_name)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[b.status] ?? '#888' }]}>
          <Text style={styles.statusText}>
            {b.status === 'new_time_proposed' ? 'Time Proposed' : 'Pending'}
          </Text>
        </View>
      </View>
      <Text style={styles.cardDate}>{formatDate(b.date)} · {b.start_time}–{b.end_time}</Text>
      {b.court_address ? (
        <Text style={styles.cardCourt}>📍 {b.court_label ? `${b.court_label}: ` : ''}{b.court_address}</Text>
      ) : null}
      {b.note ? <Text style={styles.cardNote}>"{b.note}"</Text> : null}

      {/* Student Profile (lazy) */}
      {b.student_id != null && (
        <TouchableOpacity
          style={styles.viewProfileBtn}
          onPress={() => toggleStudentProfile(b.student_id)}
          activeOpacity={0.7}
        >
          <Text style={styles.viewProfileBtnText}>
            {expandedProfiles.has(b.student_id)
              ? '▲ Hide student profile'
              : '▼ View student profile'}
          </Text>
        </TouchableOpacity>
      )}
      {expandedProfiles.has(b.student_id) && (
        <View style={styles.studentProfileBox}>
          {studentProfiles[b.student_id] == null ? (
            <ActivityIndicator size="small" color="#2e7d32" />
          ) : (
            <>
              {studentProfiles[b.student_id]?.ntrpLevel ? (
                <Text style={styles.studentProfileRow}>
                  🎾 NTRP: <Text style={{ fontWeight: '700' }}>{studentProfiles[b.student_id]?.ntrpLevel}</Text>
                </Text>
              ) : null}
              {(studentProfiles[b.student_id]?.strongSkills?.length ?? 0) > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.studentProfileLabel}>✅ Good at</Text>
                  <View style={styles.profileChipRow}>
                    {studentProfiles[b.student_id]?.strongSkills?.map(s => (
                      <View key={s} style={styles.profileChipStrong}><Text style={styles.profileChipTextStrong}>{s}</Text></View>
                    ))}
                  </View>
                </View>
              )}
              {(studentProfiles[b.student_id]?.workOnSkills?.length ?? 0) > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.studentProfileLabel}>🔧 Working on</Text>
                  <View style={styles.profileChipRow}>
                    {studentProfiles[b.student_id]?.workOnSkills?.map(s => (
                      <View key={s} style={styles.profileChipWork}><Text style={styles.profileChipTextWork}>{s}</Text></View>
                    ))}
                  </View>
                </View>
              )}
              {!studentProfiles[b.student_id]?.ntrpLevel &&
                !(studentProfiles[b.student_id]?.strongSkills?.length) &&
                !(studentProfiles[b.student_id]?.workOnSkills?.length) && (
                <Text style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>No profile info yet.</Text>
              )}
            </>
          )}
        </View>
      )}

      {b.status === 'new_time_proposed' && b.counter_date ? (
        <View style={styles.counterBox}>
          <Text style={styles.counterTitle}>Proposed new time:</Text>
          <Text style={styles.counterDetail}>
            {formatDate(b.counter_date)} · {b.counter_start}–{b.counter_end}
          </Text>
          {b.counter_note ? <Text style={styles.counterNote}>"{b.counter_note}"</Text> : null}
          <Text style={styles.counterHint}>Student's response pending</Text>
        </View>
      ) : (
        <View style={[styles.row, { marginTop: 12, flexWrap: 'wrap', gap: 8 }]}>
          <TouchableOpacity
            style={[styles.pill, styles.pillGreen]}
            onPress={() => handleConfirm(b)}
            disabled={actioning === b.booking_id}
          >
            <Text style={styles.pillText}>✓ Confirm</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, styles.pillRed]}
            onPress={() => { setRejectModal(b); setRejectReason(''); }}
            disabled={actioning === b.booking_id}
          >
            <Text style={styles.pillText}>✗ Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, styles.pillPurple]}
            onPress={() => { setProposeModal(b); setProposeDate(''); setProposeStart(''); setProposeEnd(''); setProposeNote(''); }}
            disabled={actioning === b.booking_id}
          >
            <Text style={styles.pillText}>↩ Propose Time</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ── Upcoming card ────────────────────────────────────────────────────────
  const renderUpcomingCard = ({ item: b }: { item: Booking }) => {
    const isPast = endMs(b) <= now;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName}>{maskName(b.student_name)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[b.status] ?? '#888' }]}>
            <Text style={styles.statusText}>
              {b.status === 'reschedule_requested' ? 'Reschedule' : 'Confirmed'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDate}>{formatDate(b.date)} · {b.start_time}–{b.end_time}</Text>
        {b.court_address ? (
          <Text style={styles.cardCourt}>📍 {b.court_label ? `${b.court_label}: ` : ''}{b.court_address}</Text>
        ) : null}

        {/* Student Profile (lazy) */}
        {b.student_id != null && (
          <TouchableOpacity
            style={styles.viewProfileBtn}
            onPress={() => toggleStudentProfile(b.student_id)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewProfileBtnText}>
              {expandedProfiles.has(b.student_id)
                ? '▲ Hide student profile'
                : '▼ View student profile'}
            </Text>
          </TouchableOpacity>
        )}
        {expandedProfiles.has(b.student_id) && (
          <View style={styles.studentProfileBox}>
            {studentProfiles[b.student_id] == null ? (
              <ActivityIndicator size="small" color="#2e7d32" />
            ) : (
              <>
                {studentProfiles[b.student_id]?.ntrpLevel ? (
                  <Text style={styles.studentProfileRow}>
                    🎾 NTRP: <Text style={{ fontWeight: '700' }}>{studentProfiles[b.student_id]?.ntrpLevel}</Text>
                  </Text>
                ) : null}
                {(studentProfiles[b.student_id]?.strongSkills?.length ?? 0) > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={styles.studentProfileLabel}>✅ Good at</Text>
                    <View style={styles.profileChipRow}>
                      {studentProfiles[b.student_id]?.strongSkills?.map(s => (
                        <View key={s} style={styles.profileChipStrong}><Text style={styles.profileChipTextStrong}>{s}</Text></View>
                      ))}
                    </View>
                  </View>
                )}
                {(studentProfiles[b.student_id]?.workOnSkills?.length ?? 0) > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={styles.studentProfileLabel}>🔧 Working on</Text>
                    <View style={styles.profileChipRow}>
                      {studentProfiles[b.student_id]?.workOnSkills?.map(s => (
                        <View key={s} style={styles.profileChipWork}><Text style={styles.profileChipTextWork}>{s}</Text></View>
                      ))}
                    </View>
                  </View>
                )}
                {!studentProfiles[b.student_id]?.ntrpLevel &&
                  !(studentProfiles[b.student_id]?.strongSkills?.length) &&
                  !(studentProfiles[b.student_id]?.workOnSkills?.length) && (
                  <Text style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>No profile info yet.</Text>
                )}
              </>
            )}
          </View>
        )}

        {!isPast && (
          <TouchableOpacity
            style={[styles.pill, styles.pillGhost, { marginTop: 10 }]}
            onPress={() => { setCancelModal(b); setCancelReason(''); }}
          >
            <Text style={[styles.pillText, { color: '#dc2626' }]}>Cancel Session</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Past card ────────────────────────────────────────────────────────────
  const renderPastCard = ({ item: b }: { item: Booking }) => (
    <View style={[styles.card, { opacity: 0.85 }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{maskName(b.student_name)}</Text>
        {b.no_show === 0 ? (
          <View style={[styles.statusBadge, { backgroundColor: '#2e7d32' }]}>
            <Text style={styles.statusText}>Attended</Text>
          </View>
        ) : b.no_show === 1 ? (
          <View style={[styles.statusBadge, { backgroundColor: '#dc2626' }]}>
            <Text style={styles.statusText}>No-show</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, { backgroundColor: '#6b7280' }]}>
            <Text style={styles.statusText}>Past</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardDate}>{formatDate(b.date)} · {b.start_time}–{b.end_time}</Text>
      {b.court_address ? (
        <Text style={styles.cardCourt}>
          📍 {b.court_label ? `${b.court_label}: ` : ''}{b.court_address}
        </Text>
      ) : null}
    </View>
  );

  const tabData = tab === 'requests' ? requests : tab === 'upcoming' ? upcoming : past;
  const renderItem =
    tab === 'requests'
      ? renderRequestCard
      : tab === 'upcoming'
        ? renderUpcomingCard
        : renderPastCard;

  const emptyText: Record<Tab, string> = {
    calendar: '',
    requests: 'No pending booking requests.',
    upcoming: 'No upcoming sessions.',
    past: 'No past sessions yet.',
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {(['calendar', 'requests', 'upcoming', 'past'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'calendar' ? '📅' : t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'requests' && requests.length > 0 ? ` (${requests.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
      ) : tab === 'calendar' ? (
        renderCalendar()
      ) : (
        <FlatList
          data={tabData}
          keyExtractor={item => String(item.booking_id)}
          renderItem={renderItem}
          ListHeaderComponent={tab === 'upcoming' ? renderCurrentBanner : null}
          ListEmptyComponent={
            <Text style={styles.empty}>{emptyText[tab]}</Text>
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Reject modal */}
      <Modal visible={!!rejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Booking</Text>
            <Text style={styles.modalSub}>
              {rejectModal ? `${maskName(rejectModal.student_name)} — ${formatDate(rejectModal.date)}` : ''}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason (optional)"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                onPress={() => setRejectModal(null)}
              >
                <Text style={[styles.pillText, { color: '#555' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, styles.pillRed, { flex: 1 }]}
                onPress={handleReject}
              >
                <Text style={styles.pillText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Propose time modal */}
      <Modal visible={!!proposeModal} transparent animationType="slide">
        <ScrollView contentContainerStyle={styles.modalOverlay} keyboardShouldPersistTaps="handled">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Propose New Time</Text>
            <Text style={styles.modalSub}>
              {proposeModal ? `${maskName(proposeModal.student_name)}` : ''}
            </Text>

            <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="2026-04-15"
              value={proposeDate}
              onChangeText={setProposeDate}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Start time (HH:MM)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="09:30"
              value={proposeStart}
              onChangeText={setProposeStart}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>End time (HH:MM)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="10:30"
              value={proposeEnd}
              onChangeText={setProposeEnd}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for new time"
              value={proposeNote}
              onChangeText={setProposeNote}
              multiline
            />

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                onPress={() => setProposeModal(null)}
              >
                <Text style={[styles.pillText, { color: '#555' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.pill,
                  styles.pillPurple,
                  { flex: 1 },
                  (!proposeDate || !proposeStart || !proposeEnd) && styles.pillDisabled,
                ]}
                onPress={handlePropose}
                disabled={!proposeDate || !proposeStart || !proposeEnd}
              >
                <Text style={styles.pillText}>Send Proposal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>

      {/* Cancel session modal */}
      <Modal visible={!!cancelModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel Session</Text>
            <Text style={styles.modalSub}>
              {cancelModal
                ? `${maskName(cancelModal.student_name)} — ${formatDate(cancelModal.date)} ${cancelModal.start_time}–${cancelModal.end_time}`
                : ''}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason (optional)"
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.pill, styles.pillGhost, { flex: 1 }]}
                onPress={() => setCancelModal(null)}
              >
                <Text style={[styles.pillText, { color: '#555' }]}>Keep Session</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, styles.pillRed, { flex: 1 }]}
                onPress={handleCancelConfirm}
              >
                <Text style={styles.pillText}>Cancel It</Text>
              </TouchableOpacity>
            </View>
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

  // Current session banner
  banner: { backgroundColor: '#e8f5e9', margin: 0, marginBottom: 4, padding: 12, borderRadius: 12 },
  bannerTitle: { fontWeight: '700', fontSize: 14, color: '#2e7d32', marginBottom: 8 },
  bannerCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  bannerName: { fontWeight: '700', fontSize: 15, color: '#222' },
  bannerTime: { fontSize: 13, color: '#555', marginTop: 2 },
  bannerCourt: { fontSize: 12, color: '#666', marginTop: 2 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: '700', color: '#222' },
  cardDate: { fontSize: 13, color: '#555', marginTop: 4 },
  cardCourt: { fontSize: 12, color: '#666', marginTop: 3 },
  cardNote: { fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 6 },
  viewProfileBtn: { marginTop: 10, paddingVertical: 6 },
  viewProfileBtnText: { fontSize: 13, color: '#2e7d32', textDecorationLine: 'underline' },
  studentProfileBox: { backgroundColor: '#f0faf1', borderRadius: 10, padding: 12, marginTop: 6 },
  studentProfileRow: { fontSize: 13, color: '#333', marginBottom: 2 },
  studentProfileLabel: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 4 },
  profileChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  profileChipStrong: { backgroundColor: '#e8f5e9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  profileChipTextStrong: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },
  profileChipWork: { backgroundColor: '#fff7ed', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  profileChipTextWork: { fontSize: 12, color: '#c2410c', fontWeight: '600' },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  counterBox: { backgroundColor: '#f3f0ff', borderRadius: 8, padding: 10, marginTop: 10 },
  counterTitle: { fontSize: 12, fontWeight: '600', color: '#7c3aed' },
  counterDetail: { fontSize: 13, color: '#333', marginTop: 2 },
  counterNote: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 4 },
  counterHint: { fontSize: 11, color: '#999', marginTop: 4 },

  // Pill buttons
  row: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pillGreen: { backgroundColor: '#2e7d32' },
  pillGreenLight: { backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#2e7d32' },
  pillRed: { backgroundColor: '#dc2626' },
  pillRedLight: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#dc2626' },
  pillPurple: { backgroundColor: '#7c3aed' },
  pillGhost: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  pillDisabled: { opacity: 0.4 },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36, gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  modalSub: { fontSize: 14, color: '#666' },
  modalInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#222', minHeight: 44,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: -4 },

  // ── Calendar ────────────────────────────────────────────────
  calScroll: { padding: 12, paddingBottom: 40 },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14,
    padding: 10, backgroundColor: '#fafafa',
    borderWidth: 1, borderColor: '#e8e8f0', borderRadius: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendDotAvail: {
    backgroundColor: '#d1fae5', borderWidth: 1.5, borderColor: '#34d399', borderRadius: 5,
  },
  legendDotBlocked: {
    backgroundColor: '#fee2e2', borderRadius: 2, borderWidth: 1.5, borderColor: '#dc2626',
  },
  legendText: { fontSize: 12, fontWeight: '600', color: '#555' },

  calMonth: { marginBottom: 20 },
  calMonthLabel: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },

  calWeekRow: { flexDirection: 'row', marginBottom: 3 },
  calWday: { flex: 1, textAlign: 'center', fontSize: 11, color: '#999', fontWeight: '600', paddingBottom: 4 },

  calEmpty: { flex: 1, aspectRatio: 1, margin: 1.5 },
  calDay: {
    flex: 1, aspectRatio: 1, margin: 1.5, borderRadius: 8,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  calDayNum: { fontSize: 12, fontWeight: '600', color: '#333' },
  calDayNumToday: { color: '#16a34a', fontWeight: '800' },

  // Count-pill badges (mirrors web ccal-dot pills)
  calDots: { flexDirection: 'row', gap: 2, flexWrap: 'wrap', justifyContent: 'center' },
  calCountPill: {
    borderRadius: 10, paddingHorizontal: 4, paddingVertical: 1, minWidth: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  calCountText: { fontSize: 8, fontWeight: '800', color: '#fff', lineHeight: 12 },
  calAvailDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#d1fae5', borderWidth: 1.5, borderColor: '#34d399',
  },
  calBlockedMark: { fontSize: 10, color: '#b91c1c', fontWeight: '800' },

  // Detail panel
  calDetail: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
    shadowRadius: 4, elevation: 2,
  },
  calDetailTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },
  calDetailEmpty: { fontSize: 14, color: '#aaa', textAlign: 'center', paddingVertical: 8 },

  calEventCard: {
    borderRadius: 10, padding: 12, marginBottom: 10,
    borderLeftWidth: 4,
  },
  calCardPending: { backgroundColor: '#fffbeb', borderLeftColor: '#f59e0b' },
  calCardPrivate: { backgroundColor: '#eff6ff', borderLeftColor: '#0284c7' },
  calCardGroup: { backgroundColor: '#f5f3ff', borderLeftColor: '#7c3aed' },
  calCardBlocked: { backgroundColor: '#fee2e2', borderLeftColor: '#dc2626' },

  calEventType: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  calEventBody: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  calEventMeta: { fontSize: 12, color: '#666', marginTop: 3 },

  calNavBtn: {
    marginTop: 8, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#2e7d32', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  calNavBtnText: { fontSize: 12, fontWeight: '600', color: '#2e7d32' },

  // ── Calendar: Available slots display ────────────────────────
  calAvailSection: {
    backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12,
    borderLeftWidth: 4, borderLeftColor: '#22c55e', marginBottom: 10,
  },
  calAvailHeader: {
    fontSize: 11, fontWeight: '700', color: '#166534',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  calAvailSlotCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8, padding: 10,
    marginBottom: 6, borderWidth: 1, borderColor: '#bbf7d0', gap: 8,
  },
  calAvailSlotIcon: { fontSize: 14 },
  calAvailSlotTime: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  calAvailSlotLabel: { fontSize: 11, color: '#6ee7b7', marginTop: 1 },

  // ── Calendar: Manage panel ───────────────────────────────────
  calManagePanel: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12,
  },
  calManageTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 2 },
  calManageDesc: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  calActionBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  calActionBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#fff',
  },
  calActionBtnActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  calActionBtnDanger: { borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  calActionBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  calFormCard: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#e5e7eb', marginTop: 8, gap: 6,
  },
  calFormLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 2 },
  calFormInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#222',
  },
  calTimeRow: { flexDirection: 'row', gap: 8 },
  calPrimaryBtn: {
    backgroundColor: '#2e7d32', borderRadius: 8, paddingVertical: 10,
    alignItems: 'center', marginTop: 4,
  },
  calPrimaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  calMsg: { fontSize: 12, marginTop: 6 },
  calMsgError: { color: '#dc2626' },
  calMsgSuccess: { color: '#2e7d32' },

  // ── Calendar: Availability slot row ─────────────────────────
  calSlotRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  calInlineBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff7f7', marginLeft: 8,
  },
  calInlineBtnText: { fontSize: 12, fontWeight: '600', color: '#dc2626' },
});
