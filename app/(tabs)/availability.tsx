import { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Modal, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { coachesAPI, coachBlocksAPI } from '../../src/api';
import type { Coach } from '../../src/types';

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

export default function AvailabilityScreen() {
  const { coach, logout } = useAuth();
  const [avail, setAvail] = useState<AvailTemplate>(parseAvail(coach?.availability));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  // Block add modal
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockLabel, setBlockLabel] = useState('');
  const [savingBlock, setSavingBlock] = useState(false);

  const coachId = coach?.coach_id ?? coach?.user_id;

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

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

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
            await coachBlocksAPI.deleteBlock(String(coachId), b.block_id);
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Weekly Schedule ──────────────────────────────────────────────── */}
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
                    <TextInput
                      style={styles.timeInput}
                      value={win.start}
                      onChangeText={v => updateWindow(day, wi, 'start', v)}
                      placeholder="09:00"
                      autoCapitalize="none"
                    />
                    <Text style={styles.to}>–</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={win.end}
                      onChangeText={v => updateWindow(day, wi, 'end', v)}
                      placeholder="17:00"
                      autoCapitalize="none"
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
                <TouchableOpacity
                  style={styles.addWindowBtn}
                  onPress={() => addWindow(day)}
                >
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
          <Text style={styles.saveBtnText}>{saved ? '✅ Saved!' : saving ? 'Saving…' : 'Save Weekly Schedule'}</Text>
        </TouchableOpacity>

        {/* ── Blocked Periods ──────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🚫 Blocked Dates</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowBlockModal(true)}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Dates when you're not available regardless of weekly schedule.</Text>

        {loadingBlocks ? (
          <ActivityIndicator color="#2e7d32" />
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

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

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
                style={[styles.pill, styles.pillGreen, { flex: 1 }, savingBlock && { opacity: 0.6 }]}
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
  scroll: { padding: 16, gap: 8 },
  hint: { fontSize: 13, color: '#888', marginBottom: 10, marginTop: -4 },
  empty: { fontSize: 14, color: '#aaa', textAlign: 'center', marginVertical: 12 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#222', marginBottom: 6, marginTop: 16 },

  // Day rows
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

  // Block items
  addBtn: { backgroundColor: '#2e7d32', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  blockItem: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  blockDates: { fontSize: 14, fontWeight: '600', color: '#333' },
  blockLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  deleteBtn: { fontSize: 18, color: '#dc2626', paddingHorizontal: 4 },

  logoutBtn: {
    borderWidth: 1, borderColor: '#dc2626', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 24, marginBottom: 8,
  },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36, gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: -4 },
  modalInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#222',
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  pillGreen: { backgroundColor: '#2e7d32' },
  pillGhost: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
});
