import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, Share, StyleSheet,
  Text, TouchableOpacity, View, ScrollView,
} from 'react-native';
import { coachesListAPI, moderationAPI } from '../src/api';

interface CoachProfile {
  user_id: number;
  coach_id: number;
  name: string;
  specialization?: string;
  bio?: string;
  profilePicture?: string;
  avg_rating?: number | null;
  review_count?: number;
  completed_sessions_count?: number;
  courtLocation?: string;
  Hourly_pay?: number;
  hide_price?: boolean;
}

interface Props {
  coachUserId: number | string;
  coachName: string;
  currentUserId: number | undefined;
  visible: boolean;
  onClose: () => void;
  /** Called after the coach is successfully blocked so the parent can update its state */
  onBlocked?: () => void;
}

const REPORT_REASONS = [
  'Inappropriate behavior',
  'Harassment or abuse',
  'Spam or scam',
  'Fake profile',
  'Other',
];

export default function CoachProfileSheet({
  coachUserId,
  coachName,
  currentUserId,
  visible,
  onClose,
  onBlocked,
}: Props) {
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setProfile(null);
    setLoading(true);
    coachesListAPI.getById(coachUserId)
      .then((data: CoachProfile) => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [visible, coachUserId]);

  const handleShare = async () => {
    const coachId = profile?.coach_id ?? coachUserId;
    const url = `https://tenncoach.com/preview/coach/${coachId}`;
    try {
      await Share.share({ message: `Check out this tennis coach on TennCoach: ${url}`, url });
    } catch {
      // user cancelled or share unavailable — no-op
    }
  };

  const handleReport = () => {
    Alert.alert(
      'Report Coach',
      'Why are you reporting this profile?',
      [
        ...REPORT_REASONS.map(reason => ({
          text: reason,
          onPress: () => submitReport(reason),
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const submitReport = async (reason: string) => {
    if (!currentUserId) return;
    try {
      await moderationAPI.reportContent({
        reporter_user_id: currentUserId,
        reported_user_id: Number(coachUserId),
        content_type: 'user',
        reason,
      });
      Alert.alert('Report Submitted', 'Thank you. Our team will review this profile.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  };

  const handleBlock = () => {
    Alert.alert(
      'Block Coach',
      `Block ${coachName}? They will no longer be able to contact you and you won't see their profile.`,
      [
        {
          text: 'Block',
          style: 'destructive',
          onPress: confirmBlock,
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const confirmBlock = async () => {
    if (!currentUserId) return;
    setBlocking(true);
    try {
      await moderationAPI.blockUser(currentUserId, Number(coachUserId));
      onClose();
      onBlocked?.();
    } catch {
      Alert.alert('Error', 'Could not block this user. Please try again.');
    } finally {
      setBlocking(false);
    }
  };

  const initials = coachName
    .trim()
    .split(/\s+/)
    .map(p => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header row */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Coach Profile</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#2e7d32" style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              {/* Avatar */}
              <View style={styles.avatarRow}>
                {profile?.profilePicture ? (
                  <Image source={{ uri: profile.profilePicture }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.nameBlock}>
                  <Text style={styles.coachName}>{profile?.name ?? coachName}</Text>
                  {profile?.specialization ? (
                    <Text style={styles.specialization}>{profile.specialization}</Text>
                  ) : null}
                  {profile?.avg_rating ? (
                    <Text style={styles.rating}>
                      ★ {Number(profile.avg_rating).toFixed(1)}
                      {profile.review_count ? `  (${profile.review_count} reviews)` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Stats row */}
              {(profile?.completed_sessions_count != null || profile?.courtLocation) ? (
                <View style={styles.statsRow}>
                  {profile?.completed_sessions_count != null && (
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{profile.completed_sessions_count}</Text>
                      <Text style={styles.statLabel}>Sessions</Text>
                    </View>
                  )}
                  {profile?.courtLocation ? (
                    <View style={[styles.statBox, { flex: 2 }]}>
                      <Text style={styles.statValue} numberOfLines={1}>{profile.courtLocation}</Text>
                      <Text style={styles.statLabel}>Location</Text>
                    </View>
                  ) : null}
                  {!profile?.hide_price && profile?.Hourly_pay ? (
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>${profile.Hourly_pay}/hr</Text>
                      <Text style={styles.statLabel}>Rate</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Bio */}
              {profile?.bio ? (
                <View style={styles.bioBox}>
                  <Text style={styles.bioText}>{profile.bio}</Text>
                </View>
              ) : null}

              {/* Action buttons */}
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareBtnText}>🔗  Share Profile</Text>
              </TouchableOpacity>

              <View style={styles.moderationRow}>
                <TouchableOpacity style={styles.reportBtn} onPress={handleReport}>
                  <Text style={styles.reportBtnText}>🚩  Report</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.blockBtn}
                  onPress={handleBlock}
                  disabled={blocking}
                >
                  <Text style={styles.blockBtnText}>
                    {blocking ? 'Blocking…' : '🚫  Block'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#ddd',
    borderRadius: 2, alignSelf: 'center', marginBottom: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 18, color: '#888' },

  body: { paddingBottom: 8 },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: {
    backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 24, fontWeight: '700' },
  nameBlock: { flex: 1 },
  coachName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  specialization: { fontSize: 14, color: '#4b7a52', marginBottom: 3 },
  rating: { fontSize: 13, color: '#b45309' },

  statsRow: {
    flexDirection: 'row', gap: 10, marginBottom: 14,
    backgroundColor: '#f5f7f5', borderRadius: 12, padding: 12,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },

  bioBox: {
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 20,
  },
  bioText: { fontSize: 14, color: '#444', lineHeight: 21 },

  shareBtn: {
    backgroundColor: '#2e7d32', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginBottom: 10,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  moderationRow: { flexDirection: 'row', gap: 10 },
  reportBtn: {
    flex: 1, borderWidth: 1, borderColor: '#f97316', borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  reportBtnText: { color: '#f97316', fontSize: 14, fontWeight: '600' },
  blockBtn: {
    flex: 1, borderWidth: 1, borderColor: '#dc2626', borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  blockBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
});
