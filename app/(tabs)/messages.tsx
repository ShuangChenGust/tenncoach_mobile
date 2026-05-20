import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text,
  TextInput, TouchableOpacity, View, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { messagesAPI, coachesListAPI } from '../../src/api';
import AmPmTimePicker from '../../components/AmPmTimePicker';
import CoachProfileSheet from '../../components/CoachProfileSheet';
import type { Conversation, Message } from '../../src/types';

// ── Booking intent detection (mirrors web MessageThread) ─────────────────────
const BOOKING_INTENT_RE = [
  /\bfree\b.{0,25}(today|tomorrow|tonight|this week|weekend)/i,
  /\bavailable\b/i,
  /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i,
  /\bhow much\b/i,
  /\b(price|cost|rate|fee|charges?)\b/i,
  /\bcan we (do|meet|have)\b/i,
  /\b(book|schedule)\b/i,
  /\b(next week|this week)\b/i,
];
function detectBookingIntent(msgs: Message[]): boolean {
  return msgs.slice(-6).some(m => BOOKING_INTENT_RE.some(re => re.test(m.body || '')));
}

function maskCoachName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// ── Propose-a-time helpers ────────────────────────────────────────────────────
const PROPOSE_PREFIX = '📅 Proposed Session Time\n';

function buildProposalMessage(date: string, start: string, end: string, note: string): string {
  const fmt = (t: string) => {
    const [hStr, mStr] = t.split(':');
    const h = parseInt(hStr, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${mStr} ${period}`;
  };
  const [y, mo, d2] = date.split('-');
  const label = new Date(Number(y), Number(mo) - 1, Number(d2)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  let msg = `${PROPOSE_PREFIX}📆 ${label}\n⏰ ${fmt(start)} – ${fmt(end)}`;
  if (note.trim()) msg += `\n📝 ${note.trim()}`;
  return msg;
}

function parseProposal(body: string): { date: string; time: string; note?: string } | null {
  if (!body.startsWith(PROPOSE_PREFIX)) return null;
  const lines = body.split('\n').slice(1);
  const dateLine = lines.find(l => l.startsWith('📆'));
  const timeLine = lines.find(l => l.startsWith('⏰'));
  const noteLine = lines.find(l => l.startsWith('📝'));
  if (!dateLine || !timeLine) return null;
  return {
    date: dateLine.replace('📆 ', ''),
    time: timeLine.replace('⏰ ', ''),
    note: noteLine?.replace('📝 ', ''),
  };
}
// ─────────────────────────────────────────────────────────────────────────────

interface CoachListItem {
  coach_id: number;
  user_id: number;
  name: string;
  specialization?: string;
}

export default function MessagesScreen() {
  const { student, coach, role } = useAuth();
  const { coachUserId, coachName } = useLocalSearchParams<{ coachUserId?: string; coachName?: string }>();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Compose / search
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [convSearch, setConvSearch] = useState('');

  // For students: coaches list to start new conversations
  const [coachesList, setCoachesList] = useState<CoachListItem[]>([]);
  const [coachesLoading, setCoachesLoading] = useState(false);

  // Coach profile sheet (student-only)
  const [showCoachProfile, setShowCoachProfile] = useState(false);

  // Booking nudge
  const [bookingNudge, setBookingNudge] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Propose-a-time modal
  const [showPropose, setShowPropose] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [proposeDate, setProposeDate] = useState(today);
  const [proposeStart, setProposeStart] = useState('09:00');
  const [proposeEnd, setProposeEnd] = useState('10:00');
  const [proposeNote, setProposeNote] = useState('');

  const insets = useSafeAreaInsets();
  const userId = String(student?.user_id ?? coach?.user_id ?? coach?.coach_id ?? '');

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await messagesAPI.getConversations(userId);
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load coaches list for students to start new conversations
  const loadCoachesList = useCallback(async () => {
    if (role !== 'student') return;
    setCoachesLoading(true);
    try {
      const data = await coachesListAPI.getAll();
      setCoachesList(Array.isArray(data) ? data : []);
    } catch {
      setCoachesList([]);
    } finally {
      setCoachesLoading(false);
    }
  }, [role]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadCoachesList(); }, [loadCoachesList]);

  // When navigated from Resources with a coachUserId, auto-open that conversation
  const didNavigateRef = useRef(false);
  useEffect(() => {
    if (!coachUserId || loading || didNavigateRef.current) return;
    didNavigateRef.current = true;
    const uid = Number(coachUserId);
    const name = Array.isArray(coachName) ? coachName[0] : (coachName ?? 'Coach');
    const existing = conversations.find(cv => cv.other_user_id === uid);
    if (existing) {
      openConversation(existing);
    } else {
      openConversation({
        other_user_id: uid,
        other_user_name: name,
        unread_count: 0,
        last_message_date: '',
      } as Conversation);
    }
  }, [coachUserId, loading, conversations]);

  const openConversation = async (conv: Conversation) => {
    setSelected(conv);
    setThread([]);
    setThreadLoading(true);
    setBookingNudge(false);
    setNudgeDismissed(false);
    try {
      const data = await messagesAPI.getThread(userId, String(conv.other_user_id));
      const msgs: Message[] = Array.isArray(data) ? data : [];
      setThread(msgs);
      // Mark unread messages as read
      for (const m of msgs) {
        if (!m.is_read && m.receiver_id === Number(userId)) {
          messagesAPI.markAsRead(String(m.message_id)).catch(() => {});
        }
      }
      setConversations(prev =>
        prev.map(c =>
          c.other_user_id === conv.other_user_id ? { ...c, unread_count: 0 } : c,
        ),
      );
      // Detect booking intent on load
      if (detectBookingIntent(msgs)) setBookingNudge(true);
    } catch {
      setThread([]);
    } finally {
      setThreadLoading(false);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    const body = reply.trim();
    setReply('');
    setSending(true);
    try {
      const msg = await messagesAPI.send(
        Number(userId),
        selected.other_user_id,
        'Re: Conversation',
        body,
      );
      if (!msg?.error) {
        const newMsg = {
          ...msg,
          sender_id: Number(userId),
          receiver_id: selected.other_user_id,
          body,
          is_read: false,
        };
        setThread(prev => {
          const next = [...prev, newMsg];
          if (!nudgeDismissed && detectBookingIntent(next)) setBookingNudge(true);
          return next;
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {}
    setSending(false);
  };

  // Filtered conversations for search (coach mode / conversation search)
  const filteredConvs = convSearch.trim()
    ? conversations.filter(c =>
        c.other_user_name.toLowerCase().includes(convSearch.toLowerCase())
      )
    : conversations;

  // Filtered coaches for student compose mode
  const filteredCoaches = convSearch.trim()
    ? coachesList.filter(c =>
        c.name.toLowerCase().includes(convSearch.toLowerCase()) ||
        (c.specialization ?? '').toLowerCase().includes(convSearch.toLowerCase())
      )
    : coachesList;

  // Display name: students see masked coach names in thread
  const getDisplayName = (name: string, isCoachUser?: boolean) => {
    if (role === 'student' && isCoachUser) return maskCoachName(name);
    return name;
  };

  // ── Conversation List ────────────────────────────────────────────────────
  if (!selected) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Header */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Messages</Text>
          <TouchableOpacity
            style={[styles.composeBtn, showNewMsg && styles.composeBtnActive]}
            onPress={() => { setShowNewMsg(v => !v); setConvSearch(''); }}
          >
            <Text style={styles.composeBtnText}>✏️</Text>
          </TouchableOpacity>
        </View>

        {/* Community Board shortcut */}
        {!showNewMsg && (
          <TouchableOpacity
            style={styles.communityCard}
            onPress={() => router.push('/(tabs)/community' as any)}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 22 }}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.communityCardTitle}>Community Board</Text>
              <Text style={styles.communityCardSub}>Ask questions · Share tips · Connect</Text>
            </View>
            <Text style={{ color: '#2e7d32', fontSize: 18, fontWeight: '600' }}>›</Text>
          </TouchableOpacity>
        )}

        {showNewMsg ? (
          /* New conversation panel */
          <View style={{ flex: 1 }}>
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder={role === 'student' ? 'Search coaches…' : 'Search conversations…'}
                value={convSearch}
                onChangeText={setConvSearch}
                autoFocus
                autoCapitalize="none"
              />
            </View>

            {/* Student: show coaches list to start new conversation */}
            {role === 'student' ? (
              coachesLoading ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
              ) : filteredCoaches.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🎾</Text>
                  <Text style={styles.emptyTitle}>No coaches found</Text>
                  <Text style={styles.emptyHint}>Try a different search term.</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredCoaches}
                  keyExtractor={item => String(item.coach_id ?? item.user_id)}
                  renderItem={({ item: c }) => (
                    <TouchableOpacity
                      style={styles.convRow}
                      onPress={() => {
                        setShowNewMsg(false);
                        setConvSearch('');
                        // Start or open conversation with this coach
                        const existing = conversations.find(cv => cv.other_user_id === c.user_id);
                        if (existing) {
                          openConversation(existing);
                        } else {
                          // Create a provisional conversation object to open the thread
                          openConversation({
                            other_user_id: c.user_id,
                            other_user_name: c.name,
                            unread_count: 0,
                            last_message_date: '',
                          } as Conversation);
                        }
                      }}
                    >
                      <View style={[styles.convAvatar, { backgroundColor: '#2e7d32' }]}>
                        <Text style={styles.convAvatarText}>
                          {maskCoachName(c.name).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.convInfo}>
                        <Text style={styles.convName}>{maskCoachName(c.name)}</Text>
                        {c.specialization ? (
                          <Text style={styles.convSub}>{c.specialization}</Text>
                        ) : (
                          <Text style={styles.convSub}>Tennis Coach</Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, color: '#2e7d32', fontWeight: '600' }}>Message →</Text>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              )
            ) : (
              /* Coach: search existing conversations */
              loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
              ) : filteredConvs.length === 0 ? (
                <Text style={styles.emptyHint}>No matching conversations found.</Text>
              ) : (
                <FlatList
                  data={filteredConvs}
                  keyExtractor={item => String(item.other_user_id)}
                  renderItem={({ item: c }) => (
                    <TouchableOpacity
                      style={styles.convRow}
                      onPress={() => { setShowNewMsg(false); setConvSearch(''); openConversation(c); }}
                    >
                      <View style={styles.convAvatar}>
                        <Text style={styles.convAvatarText}>
                          {c.other_user_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.convInfo}>
                        <Text style={styles.convName}>{c.other_user_name}</Text>
                        <Text style={styles.convSub}>Tap to message</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              )
            )}
          </View>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
        ) : conversations.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyHint}>
              {role === 'student'
                ? 'Tap ✏️ to message a coach and start booking lessons.'
                : 'Students will appear here once they message you.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={item => String(item.other_user_id)}
            renderItem={({ item: c }) => {
              const displayName = role === 'student'
                ? maskCoachName(c.other_user_name)
                : c.other_user_name;
              return (
              <TouchableOpacity
                style={styles.convRow}
                onPress={() => openConversation(c)}
              >
                <View style={styles.convAvatar}>
                  <Text style={styles.convAvatarText}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.convInfo}>
                  <Text style={styles.convName}>{c.other_user_name}</Text>
                  <Text style={styles.convDate}>
                    {c.last_message_date
                      ? new Date(c.last_message_date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })
                      : ''}
                  </Text>
                </View>
                {c.unread_count > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{c.unread_count}</Text>
                  </View>
                )}
              </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Thread View ──────────────────────────────────────────────────────────
  const threadDisplayName = role === 'student'
    ? maskCoachName(selected.other_user_name)
    : selected.other_user_name;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.threadHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { setSelected(null); setBookingNudge(false); }}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.threadName} numberOfLines={1}>{threadDisplayName}</Text>
        {role === 'student' && (
          <TouchableOpacity style={styles.profileMenuBtn} onPress={() => setShowCoachProfile(true)}>
            <Text style={styles.profileMenuBtnText}>•••</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Value banner — role-specific (mirrors web mv-value-banner) */}
      {role === 'coach' ? (
        <View style={styles.valueBanner}>
          <Text style={styles.valueBannerText}>
            Confirm bookings to earn positive reviews, increase your total lessons on your profile, and get promoted to more students. You&apos;re also protected from no-shows—tokens refunded and students flagged.
          </Text>
        </View>
      ) : (
        <View style={[styles.valueBanner, styles.valueBannerStudent]}>
          <Text style={[styles.valueBannerText, styles.valueBannerStudentText]}>
            Book a session with this coach to start improving your game. Use the booking button or mention a time in chat.
          </Text>
        </View>
      )}

      {threadLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          <FlatList
            ref={listRef}
            data={thread}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.threadList}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item: m }) => {
              const isMe = m.sender_id === Number(userId);
              const senderDisplay = role === 'student' && !isMe
                ? maskCoachName(m.sender_name || '')
                : (m.sender_name || '');
              const proposal = parseProposal(m.body || '');
              if (proposal) {
                return (
                  <View style={[styles.proposalBubble, isMe ? styles.proposalBubbleMe : styles.proposalBubbleThem]}>
                    {!isMe && senderDisplay ? (
                      <Text style={styles.bubbleSender}>{senderDisplay}</Text>
                    ) : null}
                    <Text style={[styles.proposalHeading, !isMe && { color: '#14532d' }]}>📅 Proposed Session</Text>
                    <View style={styles.proposalRow}>
                      <Text style={styles.proposalIcon}>📆</Text>
                      <Text style={[styles.proposalText, !isMe && { color: '#166534' }]}>{proposal.date}</Text>
                    </View>
                    <View style={styles.proposalRow}>
                      <Text style={styles.proposalIcon}>⏰</Text>
                      <Text style={[styles.proposalText, !isMe && { color: '#166534' }]}>{proposal.time}</Text>
                    </View>
                    {proposal.note ? (
                      <View style={styles.proposalRow}>
                        <Text style={styles.proposalIcon}>📝</Text>
                        <Text style={[styles.proposalText, !isMe && { color: '#166534' }]}>{proposal.note}</Text>
                      </View>
                    ) : null}
                    {m.created_at && (
                      <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : { color: '#6b9e6b' }]}>
                        {new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                );
              }
              return (
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  {!isMe && senderDisplay ? (
                    <Text style={styles.bubbleSender}>{senderDisplay}</Text>
                  ) : null}
                  <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                    {m.body}
                  </Text>
                  {m.created_at && (
                    <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
                      {new Date(m.created_at).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  )}
                </View>
              );
            }}
          />

          {/* Booking nudge — mirrors web booking-nudge */}
          {bookingNudge && (
            <View style={styles.bookingNudge}>
              <Text style={styles.nudgeText}>
                {role === 'coach' ? (
                  <>
                    📅 <Text style={{ fontWeight: '700' }}>Schedule your lesson before switching contacts!</Text>
                    {'\n'}
                    Scheduling protects your time and earnings - if a student no-shows, you can flag it and your tokens will be refunded automatically. It also helps other coaches know what to expect, keeping the whole community accountable.
                  </>
                ) : (
                  <>
                    📅 <Text style={{ fontWeight: '700' }}>Schedule your lesson before switching contacts!</Text>
                    {'\n'}
                    Scheduling your lesson lets you review your coach after the session - helping other students find the best coaches. Don't miss your chance to share your experience!
                  </>
                )}
              </Text>
              <TouchableOpacity
                style={styles.nudgeDismissBtn}
                onPress={() => { setBookingNudge(false); setNudgeDismissed(true); }}
              >
                <Text style={styles.nudgeDismissText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.replyRow, { paddingBottom: insets.bottom || 12 }]}>
            <TouchableOpacity
              style={styles.proposeBtn}
              onPress={() => {
                setProposeDate(new Date().toISOString().split('T')[0]);
                setProposeStart('09:00');
                setProposeEnd('10:00');
                setProposeNote('');
                setShowPropose(true);
              }}
            >
              <Text style={styles.proposeBtnText}>📅</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.replyInput}
              placeholder="Message…"
              value={reply}
              onChangeText={text => {
                setReply(text);
                if (!nudgeDismissed && BOOKING_INTENT_RE.some(re => re.test(text)))
                  setBookingNudge(true);
              }}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!reply.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendReply}
              disabled={!reply.trim() || sending}
            >
              <Text style={styles.sendBtnText}>{sending ? '…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>

          {/* Propose a Time Modal */}
          <Modal visible={showPropose} transparent animationType="slide" onRequestClose={() => setShowPropose(false)}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.proposeOverlay}>
                <View style={styles.proposeCard}>
                  <View style={styles.proposeHeader}>
                    <Text style={styles.proposeTitle}>📅 Propose a Time</Text>
                    <TouchableOpacity onPress={() => setShowPropose(false)}>
                      <Text style={styles.proposeClose}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.proposeLabel}>Date</Text>
                  <TextInput
                    style={styles.proposeDateInput}
                    value={proposeDate}
                    onChangeText={setProposeDate}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />

                  <Text style={styles.proposeLabel}>Start Time</Text>
                  <AmPmTimePicker value={proposeStart} onChange={setProposeStart} />

                  <Text style={styles.proposeLabel}>End Time</Text>
                  <AmPmTimePicker value={proposeEnd} onChange={setProposeEnd} />

                  <Text style={styles.proposeLabel}>Note (optional)</Text>
                  <TextInput
                    style={[styles.proposeDateInput, { height: 64 }]}
                    value={proposeNote}
                    onChangeText={setProposeNote}
                    placeholder="e.g. Court 3, bring racket…"
                    multiline
                    maxLength={200}
                  />

                  <TouchableOpacity
                    style={styles.proposeSendBtn}
                    onPress={() => {
                      if (!proposeDate.match(/^\d{4}-\d{2}-\d{2}$/)) return;
                      const msg = buildProposalMessage(proposeDate, proposeStart, proposeEnd, proposeNote);
                      setShowPropose(false);
                      setReply(msg);
                      // auto-send immediately
                      setTimeout(async () => {
                        if (!selected) return;
                        setSending(true);
                        try {
                          const sent = await messagesAPI.send(
                            Number(userId),
                            selected.other_user_id,
                            'Re: Conversation',
                            msg,
                          );
                          if (!sent?.error) {
                            setThread(prev => [...prev, {
                              ...sent,
                              sender_id: Number(userId),
                              receiver_id: selected.other_user_id,
                              body: msg,
                              is_read: false,
                            }]);
                            setReply('');
                            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
                          }
                        } catch {} finally {
                          setSending(false);
                        }
                      }, 50);
                    }}
                  >
                    <Text style={styles.proposeSendBtnText}>Send Proposal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </KeyboardAvoidingView>
      )}

      {/* Coach profile sheet — student only */}
      {role === 'student' && selected && (
        <CoachProfileSheet
          coachUserId={selected.other_user_id}
          coachName={selected.other_user_name}
          currentUserId={student?.user_id != null ? Number(student.user_id) : undefined}
          visible={showCoachProfile}
          onClose={() => setShowCoachProfile(false)}
          onBlocked={() => {
            setConversations(prev => prev.filter(c => c.other_user_id !== selected.other_user_id));
            setSelected(null);
            setBookingNudge(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f5' },

  // ── Conversation list header ───────────────────────────────────
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8f2',
  },
  listTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  composeBtn: {
    borderWidth: 1.5, borderColor: '#d0d0e0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  composeBtnActive: { backgroundColor: '#f0faf0', borderColor: '#2e7d32' },
  composeBtnText: { fontSize: 16, lineHeight: 20 },

  // ── Community card ───────────────────────────────────────────
  communityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#f0fdf4',
    borderBottomWidth: 1.5, borderBottomColor: '#c8e6c9',
  },
  communityCardTitle: { fontSize: 14, fontWeight: '700', color: '#1a3a1a' },
  communityCardSub:   { fontSize: 12, color: '#2e7d32', marginTop: 2 },

  // ── Search bar ────────────────────────────────────────────────
  searchWrap: {
    padding: 10, borderBottomWidth: 1, borderBottomColor: '#e8e8f2', backgroundColor: '#fff',
  },
  searchInput: {
    borderWidth: 1.5, borderColor: '#d0d0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#222',
    backgroundColor: '#fff',
  },

  // ── Empty state ───────────────────────────────────────────────
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyIcon: { fontSize: 40, opacity: 0.3 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#bbb' },
  emptyHint: { fontSize: 13, color: '#bbb', textAlign: 'center', padding: 20 },

  // ── Conversation rows ─────────────────────────────────────────
  convRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff',
  },
  convAvatar: {
    width: 44, height: 44, borderRadius: 22,
    // gradient approximation: purple-tinted green
    backgroundColor: '#2e7d32',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  convAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  convInfo: { flex: 1, minWidth: 0 },
  convName: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  convDate: { fontSize: 12, color: '#999', marginTop: 2 },
  convSub: { fontSize: 12, color: '#2e7d32', marginTop: 2 },
  unreadBadge: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#2e7d32',
    alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#f0f0f8', marginLeft: 72 },

  // ── Thread ────────────────────────────────────────────────────
  threadHeader: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { marginRight: 12 },
  backText: { color: '#2e7d32', fontSize: 17, fontWeight: '600' },
  threadName: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', flex: 1 },
  profileMenuBtn: { marginLeft: 8, padding: 6 },
  profileMenuBtnText: { fontSize: 18, color: '#555', letterSpacing: 2 },

  // Value banner (coach variant — mirrors web mv-value-banner--coach)
  valueBanner: {
    backgroundColor: '#f0fdf4', borderBottomWidth: 1, borderBottomColor: '#bbf7d0',
    paddingHorizontal: 16, paddingVertical: 9,
  },
  valueBannerText: { fontSize: 12, color: '#166534', fontWeight: '500', lineHeight: 17 },
  valueBannerStudent: {
    backgroundColor: '#eff6ff', borderBottomColor: '#bfdbfe',
  },
  valueBannerStudentText: { color: '#1e40af' },

  threadList: { padding: 16, gap: 8 },

  // Bubbles
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12 },
  bubbleMe: {
    alignSelf: 'flex-end', borderBottomRightRadius: 4,
    backgroundColor: '#2e7d32',  // matches app green
  },
  bubbleThem: {
    alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#e8e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
    elevation: 1,
  },
  bubbleSender: { fontSize: 11, fontWeight: '600', color: '#999', marginBottom: 3 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: '#222' },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)' },
  bubbleTimeThem: { color: '#bbb' },

  // Booking nudge (mirrors web booking-nudge)
  bookingNudge: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5, borderColor: '#bfdbfe',
    borderRadius: 12, gap: 10,
  },
  nudgeText: { flex: 1, fontSize: 13, color: '#1e40af', fontWeight: '500' },
  nudgeDismissBtn: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#dbeafe',
  },
  nudgeDismissText: { fontSize: 12, color: '#3b82f6' },

  // Reply row
  replyRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', gap: 8,
  },
  proposeBtn: {
    borderWidth: 1.5, borderColor: '#d0d0e0', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 9, backgroundColor: '#f0fdf4',
  },
  proposeBtnText: { fontSize: 17, lineHeight: 20 },
  replyInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#d0d0e0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, color: '#222',
  },
  sendBtn: {
    backgroundColor: '#2e7d32', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Proposal bubble
  proposalBubble: {
    maxWidth: '85%', borderRadius: 14, padding: 14, gap: 6,
  },
  proposalBubbleMe: {
    alignSelf: 'flex-end', borderBottomRightRadius: 4,
    backgroundColor: '#1b5e20',
    borderWidth: 1, borderColor: '#2e7d32',
  },
  proposalBubbleThem: {
    alignSelf: 'flex-start', borderBottomLeftRadius: 4,
    backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#bbf7d0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  proposalHeading: { fontSize: 13, fontWeight: '800', color: '#fff', marginBottom: 4 },
  proposalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  proposalIcon: { fontSize: 13 },
  proposalText: { fontSize: 13, fontWeight: '600', color: '#fff', flex: 1, lineHeight: 18 },

  // Propose-a-time modal
  proposeOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  proposeCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36, gap: 6,
  },
  proposeHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  proposeTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a2e' },
  proposeClose: { fontSize: 18, color: '#999', paddingHorizontal: 4 },
  proposeLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  proposeDateInput: {
    borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1f2937',
    backgroundColor: '#fafafa',
  },
  proposeSendBtn: {
    backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 18,
  },
  proposeSendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
