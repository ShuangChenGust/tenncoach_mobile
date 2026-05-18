import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { studentBookingsAPI, studentGroupLessonsAPI } from '../../src/api';
import CoachProfileSheet from '../../components/CoachProfileSheet';
import type { Booking } from '../../src/types';
type CancelableGroupStatus = 'pending' | 'confirmed' | 'waitlisted';

const DIRECT_CANCEL_HOURS = 12;
function canDirectCancel(b: Booking): boolean {
  const dt = new Date(`${b.date}T${b.start_time}:00`);
  return Date.now() < dt.getTime() - DIRECT_CANCEL_HOURS * 3600 * 1000;
}

type FilterTab = 'upcoming' | 'past' | 'pending';
type MainTab = 'private' | 'group';

interface GroupReg {
  registration_id: number;
  group_lesson_id: number;
  coach_name: string;
  title: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  location: string;
  lesson_status: string;
  registration_status: string;
  description?: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${ampm}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#15803d';
    case 'pending': return '#b45309';
    case 'rejected':
    case 'cancelled': return '#dc2626';
    case 'cancel_requested': return '#f97316';
    case 'new_time_proposed':
    case 'reschedule_requested': return '#7c3aed';
    case 'waitlisted': return '#b45309';
    default: return '#6b7280';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmed': return 'Confirmed';
    case 'pending': return 'Pending';
    case 'rejected': return 'Rejected';
    case 'cancelled': return 'Cancelled';
    case 'cancel_requested': return 'Cancel Requested';
    case 'new_time_proposed': return 'New Time Proposed';
    case 'reschedule_requested': return 'Reschedule Requested';
    case 'waitlisted': return 'Waitlisted';
    default: return status;
  }
}

export default function StudentScheduleScreen() {
  const { student } = useAuth();
  const [mainTab, setMainTab] = useState<MainTab>('private');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [groupRegs, setGroupRegs] = useState<GroupReg[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('upcoming');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCoachProfile, setShowCoachProfile] = useState(false);
  const [coachProfileTarget, setCoachProfileTarget] = useState<{ userId: number; name: string } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupReg | null>(null);
  const [groupCancelling, setGroupCancelling] = useState(false);
  const [cancelRequestedGroups, setCancelRequestedGroups] = useState<Set<number>>(new Set());
  const [cancelRequesting, setCancelRequesting] = useState(false);

  const studentId = student?.user_id;

  const loadBookings = useCallback(async () => {
    if (!studentId) return;
    try {
      const [bData, gData] = await Promise.all([
        studentBookingsAPI.getForStudent(String(studentId)),
        studentGroupLessonsAPI.getForStudent(String(studentId)),
      ]);
      setBookings(Array.isArray(bData) ? bData : []);
      setGroupRegs(Array.isArray(gData) ? gData : []);
    } catch {
      setBookings([]);
      setGroupRegs([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Refresh whenever this tab comes into focus (e.g. after making a booking)
  useFocusEffect(useCallback(() => { loadBookings(); }, [loadBookings]));

  const now = new Date().toISOString().slice(0, 10);

  const filtered = bookings.filter(b => {
    if (activeFilter === 'upcoming') {
      return b.date >= now && b.status !== 'cancelled' && b.status !== 'rejected';
    }
    if (activeFilter === 'pending') {
      return b.status === 'pending' || b.status === 'new_time_proposed' || b.status === 'reschedule_requested';
    }
    return b.date < now || b.status === 'cancelled' || b.status === 'rejected';
  }).sort((a, b) => {
    if (activeFilter === 'past') return b.date.localeCompare(a.date);
    return a.date.localeCompare(b.date);
  });

  const handleCancel = async (b: Booking) => {
    // Pending requests can always be cancelled directly.
    // Confirmed sessions: direct cancel if > 12 hrs away, otherwise request cancel.
    const isPending = b.status === 'pending';
    const direct = isPending || canDirectCancel(b);
    const confirmMsg = direct
      ? 'Are you sure you want to cancel this session?'
      : 'This session is within 12 hours. A cancellation request will be sent to the coach for approval.';
    Alert.alert('Cancel Booking', confirmMsg, [
      { text: 'No', style: 'cancel' },
      {
        text: direct ? 'Yes, Cancel' : 'Send Request',
        style: 'destructive',
        onPress: async () => {
          if (direct) {
            await studentBookingsAPI.cancel(b.booking_id).catch(() => {});
            setBookings(prev =>
              prev.map(x => x.booking_id === b.booking_id ? { ...x, status: 'cancelled' } : x),
            );
          } else {
            setCancelRequesting(true);
            try {
              await studentBookingsAPI.cancelRequest(b.booking_id).catch(() => {});
              setBookings(prev =>
                prev.map(x => x.booking_id === b.booking_id ? { ...x, status: 'cancel_requested' } : x),
              );
            } finally {
              setCancelRequesting(false);
            }
          }
          setSelectedBooking(null);
        },
      },
    ]);
  };

  const handleAcceptReschedule = async (b: Booking) => {
    await studentBookingsAPI.acceptReschedule(b.booking_id).catch(() => {});
    await loadBookings();
    setSelectedBooking(null);
  };

  const handleDeclineReschedule = async (b: Booking) => {
    await studentBookingsAPI.declineReschedule(b.booking_id).catch(() => {});
    await loadBookings();
    setSelectedBooking(null);
  };

  const handleGroupCancelRequest = async (g: GroupReg) => {
    Alert.alert(
      'Request Cancellation',
      'Send a cancellation request to the coach?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Request Cancel',
          style: 'destructive',
          onPress: async () => {
            setGroupCancelling(true);
            try {
              const result = await studentGroupLessonsAPI.requestCancel(g.registration_id);
              if (!result?.error) {
                setCancelRequestedGroups(prev => new Set([...prev, g.registration_id]));
                setGroupRegs(prev => prev.map(x =>
                  x.registration_id === g.registration_id
                    ? { ...x, registration_status: 'cancel_requested' }
                    : x,
                ));
                setSelectedGroup(prev =>
                  prev?.registration_id === g.registration_id
                    ? { ...prev, registration_status: 'cancel_requested' }
                    : prev,
                );
              } else {
                Alert.alert('Error', result.error ?? 'Could not send cancellation request.');
              }
            } catch {
              Alert.alert('Error', 'Could not send cancellation request.');
            } finally {
              setGroupCancelling(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  const FILTERS: { key: FilterTab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'pending', label: 'Pending' },
    { key: 'past', label: 'Past' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Main tab: Private vs Group */}
      <View style={styles.mainTabRow}>
        <TouchableOpacity
          style={[styles.mainTabBtn, mainTab === 'private' && styles.mainTabBtnActive]}
          onPress={() => setMainTab('private')}
        >
          <Text style={[styles.mainTabText, mainTab === 'private' && styles.mainTabTextActive]}>🎾 Private</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTabBtn, mainTab === 'group' && styles.mainTabBtnActive]}
          onPress={() => setMainTab('group')}
        >
          <Text style={[styles.mainTabText, mainTab === 'group' && styles.mainTabTextActive]}>
            👥 Group Classes {groupRegs.length > 0 ? `(${groupRegs.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {mainTab === 'group' ? (
        /* ── Group lesson registrations ── */
        <FlatList
          data={groupRegs}
          keyExtractor={item => String(item.registration_id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadBookings(); setRefreshing(false); }} tintColor="#2e7d32" />
          }
          ListEmptyComponent={<Text style={styles.empty}>No group class registrations yet.</Text>}
          renderItem={({ item: g }) => {
            const isCancelled = g.lesson_status === 'cancelled' || g.registration_status === 'cancelled';
            const color = isCancelled ? '#dc2626' : statusColor(g.registration_status);
            const label = isCancelled ? 'Cancelled' : statusLabel(g.registration_status);
            const isPast = g.lesson_date < new Date().toISOString().slice(0, 10);
            return (
              <TouchableOpacity style={[styles.card, isPast && { opacity: 0.7 }]} onPress={() => setSelectedGroup(g)} activeOpacity={0.8}>
                <View style={styles.cardTop}>
                  <Text style={styles.coachName}>{g.title || 'Group Lesson'}</Text>
                  <View style={[styles.statusBadge, { borderColor: color }]}>
                    <Text style={[styles.statusText, { color }]}>{label}</Text>
                  </View>
                </View>
                <Text style={styles.dateText}>{formatDate(g.lesson_date)}</Text>
                <Text style={styles.timeText}>{formatTime(g.start_time)} – {formatTime(g.end_time)}</Text>
                <Text style={styles.court}>👤 {g.coach_name}</Text>
                {g.location ? <Text style={styles.court}>📍 {g.location}</Text> : null}
                {g.lesson_status === 'cancelled' && (
                  <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 4, fontWeight: '600' }}>This class has been cancelled by the coach.</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        /* ── Private bookings ── */
        <>
          {/* Filter tabs */}
          <View style={styles.filterRow}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterBtn, activeFilter === f.key && styles.filterBtnActive]}
                onPress={() => setActiveFilter(f.key)}
              >
                <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={item => String(item.booking_id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await loadBookings();
            setRefreshing(false);
          }} tintColor="#2e7d32" />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No {activeFilter} sessions.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelectedBooking(item)}>
            <View style={styles.cardTop}>
              <Text style={styles.coachName}>with {item.coach_name}</Text>
              <View style={[styles.statusBadge, { borderColor: statusColor(item.status) }]}>
                <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                  {statusLabel(item.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
            <Text style={styles.timeText}>
              {formatTime(item.start_time)} – {formatTime(item.end_time)}
            </Text>
            {item.court_label ? <Text style={styles.court}>📍 {item.court_label}</Text> : null}
          </TouchableOpacity>
        )}
      />
        </>
      )}

      {/* Group lesson detail modal */}
      <Modal visible={!!selectedGroup} transparent animationType="slide" onRequestClose={() => setSelectedGroup(null)}>
        <View style={styles.modalOverlay}>
          {selectedGroup && (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSelectedGroup(null)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Group Class</Text>
                <View style={{ width: 32 }} />
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Class</Text>
                  <Text style={styles.detailValue}>{selectedGroup.title || 'Group Lesson'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Coach</Text>
                  <Text style={styles.detailValue}>{selectedGroup.coach_name}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedGroup.lesson_date)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>{formatTime(selectedGroup.start_time)} – {formatTime(selectedGroup.end_time)}</Text>
                </View>
                {selectedGroup.location ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>{selectedGroup.location}</Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, { color: statusColor(selectedGroup.registration_status) }]}>
                    {statusLabel(selectedGroup.registration_status)}
                  </Text>
                </View>
                {selectedGroup.description ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Description</Text>
                    <Text style={styles.noteText}>{selectedGroup.description}</Text>
                  </View>
                ) : null}
                {selectedGroup.lesson_status === 'cancelled' && (
                  <View style={[styles.noteBox, { backgroundColor: '#fee2e2' }]}>
                    <Text style={[styles.noteLabel, { color: '#991b1b' }]}>This class has been cancelled by the coach.</Text>
                  </View>
                )}

                {/* Cancel request button */}
                {selectedGroup.lesson_status !== 'cancelled' &&
                  (['pending', 'confirmed', 'waitlisted'] as CancelableGroupStatus[]).includes(
                    selectedGroup.registration_status as CancelableGroupStatus,
                  ) && (
                    cancelRequestedGroups.has(selectedGroup.registration_id) ||
                    selectedGroup.registration_status === 'cancel_requested' ? (
                      <View style={[styles.noteBox, { backgroundColor: '#fff7ed', marginTop: 16 }]}>
                        <Text style={{ color: '#c2410c', fontSize: 13, fontWeight: '600' }}>
                          ✅ Cancellation request sent to coach.
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.cancelBtn, { marginTop: 16 }]}
                        disabled={groupCancelling}
                        onPress={() => handleGroupCancelRequest(selectedGroup)}
                      >
                        <Text style={styles.cancelBtnText}>
                          {groupCancelling ? 'Sending…' : 'Request Cancellation'}
                        </Text>
                      </TouchableOpacity>
                    )
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Private booking detail modal */}
      <Modal visible={!!selectedBooking} transparent animationType="slide" onRequestClose={() => setSelectedBooking(null)}>
        <View style={styles.modalOverlay}>
          {selectedBooking && (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSelectedBooking(null)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Session Details</Text>
                <View style={{ width: 32 }} />
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  onPress={() => {
                    if (selectedBooking.coach_user_id) {
                      setCoachProfileTarget({ userId: selectedBooking.coach_user_id, name: selectedBooking.coach_name });
                      setShowCoachProfile(true);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.detailRow, styles.coachDetailRow]}>
                    <Text style={styles.detailLabel}>Coach</Text>
                    <Text style={[styles.detailValue, styles.coachDetailLink]}>{selectedBooking.coach_name}  ›</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedBooking.date)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>
                    {formatTime(selectedBooking.start_time)} – {formatTime(selectedBooking.end_time)}
                  </Text>
                </View>
                {selectedBooking.court_label ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>{selectedBooking.court_label}</Text>
                  </View>
                ) : null}
                {selectedBooking.court_address ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Address</Text>
                    <Text style={styles.detailValue}>{selectedBooking.court_address}</Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, { color: statusColor(selectedBooking.status) }]}>
                    {statusLabel(selectedBooking.status)}
                  </Text>
                </View>
                {selectedBooking.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Your note</Text>
                    <Text style={styles.noteText}>{selectedBooking.note}</Text>
                  </View>
                ) : null}

                {/* Reschedule proposal from coach */}
                {(selectedBooking.status === 'new_time_proposed' || selectedBooking.status === 'reschedule_requested') &&
                  selectedBooking.counter_date && (
                    <View style={styles.proposeBox}>
                      <Text style={styles.proposeTitle}>Coach Proposed New Time</Text>
                      <Text style={styles.proposeDetail}>
                        {formatDate(selectedBooking.counter_date)} · {formatTime(selectedBooking.counter_start ?? '')} – {formatTime(selectedBooking.counter_end ?? '')}
                      </Text>
                      {selectedBooking.counter_note ? (
                        <Text style={styles.proposeNote}>{selectedBooking.counter_note}</Text>
                      ) : null}
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.acceptBtn]}
                          onPress={() => handleAcceptReschedule(selectedBooking)}
                        >
                          <Text style={styles.actionBtnText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.declineBtn]}
                          onPress={() => handleDeclineReschedule(selectedBooking)}
                        >
                          <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                {/* Cancel */}
                {(selectedBooking.status === 'confirmed' || selectedBooking.status === 'pending') && (
                  selectedBooking.status === 'pending' || canDirectCancel(selectedBooking) ? (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      disabled={cancelRequesting}
                      onPress={() => handleCancel(selectedBooking)}
                    >
                      <Text style={styles.cancelBtnText}>
                        {cancelRequesting ? 'Cancelling\u2026' : selectedBooking.status === 'pending' ? 'Cancel Request' : 'Cancel Session'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Text style={{ fontSize: 12, color: '#b45309', marginTop: 16, marginBottom: 6 }}>
                        \u26a0\ufe0f Within 12 hours — the coach must approve your cancellation.
                      </Text>
                      <TouchableOpacity
                        style={[styles.cancelBtn, { borderColor: '#f97316' }]}
                        disabled={cancelRequesting}
                        onPress={() => handleCancel(selectedBooking)}
                      >
                        <Text style={[styles.cancelBtnText, { color: '#f97316' }]}>
                          {cancelRequesting ? 'Sending\u2026' : 'Request Cancellation'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )
                )}
                {selectedBooking.status === 'cancel_requested' && (
                  <View style={[styles.noteBox, { backgroundColor: '#fff7ed', marginTop: 16 }]}>
                    <Text style={{ color: '#c2410c', fontSize: 13, fontWeight: '600' }}>
                      \u2705 Cancellation request sent — awaiting coach approval.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Coach profile sheet */}
      {coachProfileTarget && (
        <CoachProfileSheet
          coachUserId={coachProfileTarget.userId}
          coachName={coachProfileTarget.name}
          currentUserId={student?.user_id != null ? Number(student.user_id) : undefined}
          visible={showCoachProfile}
          onClose={() => setShowCoachProfile(false)}
          onBlocked={() => {
            setShowCoachProfile(false);
            setSelectedBooking(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  mainTabRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 2, borderBottomColor: '#eee',
  },
  mainTabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  mainTabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#2e7d32' },
  mainTabText: { fontSize: 14, color: '#888', fontWeight: '600' },
  mainTabTextActive: { color: '#2e7d32' },

  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterBtn: {
    flex: 1, paddingVertical: 13, alignItems: 'center',
  },
  filterBtnActive: {
    borderBottomWidth: 2, borderBottomColor: '#2e7d32',
  },
  filterText: { fontSize: 14, color: '#888', fontWeight: '600' },
  filterTextActive: { color: '#2e7d32' },

  list: { padding: 14, gap: 12 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 15 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  coachName: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  statusBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  dateText: { fontSize: 14, color: '#555', marginBottom: 2 },
  timeText: { fontSize: 14, color: '#555', marginBottom: 4 },
  court: { fontSize: 13, color: '#888' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
  },
  closeBtn: { fontSize: 18, color: '#888', padding: 4 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#222' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailLabel: { fontSize: 13, color: '#999', fontWeight: '600' },
  detailValue: { fontSize: 14, color: '#333', fontWeight: '600', flex: 1, textAlign: 'right' },

  noteBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginTop: 14 },
  noteLabel: { fontSize: 12, color: '#999', fontWeight: '600', marginBottom: 4 },
  noteText: { fontSize: 14, color: '#444', lineHeight: 20 },

  proposeBox: { backgroundColor: '#faf5ff', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#e9d5ff' },
  proposeTitle: { fontSize: 14, fontWeight: '700', color: '#7c3aed', marginBottom: 6 },
  proposeDetail: { fontSize: 14, color: '#6b21a8', fontWeight: '600', marginBottom: 4 },
  proposeNote: { fontSize: 13, color: '#888', marginBottom: 10 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  acceptBtn: { backgroundColor: '#2e7d32' },
  declineBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dc2626' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  cancelBtn: {
    borderWidth: 1, borderColor: '#dc2626', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 20,
  },
  cancelBtnText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },

  coachDetailRow: { paddingVertical: 10 },
  coachDetailLink: { color: '#2e7d32' },
});
