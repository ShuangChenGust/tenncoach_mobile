import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView,
  Platform, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { questionsAPI, moderationAPI } from '../../src/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const TOPICS = [
  'General',
  'Technique & Drills',
  'Equipment',
  'Finding Partners',
  'Tournaments & Events',
  'Coaching',
  'Junior Tennis',
  'Fitness & Training',
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Post {
  question_id: number;
  author_id: number;
  author_name: string;   // used by comments; Questions table stores studentName
  studentName: string;  // actual DB column for Questions
  question: string;
  state: string | null;
  topic: string | null;
  comment_count: number;
  created_at: string;
}

interface Comment {
  comment_id: number;
  question_id: number;
  author_id: number;
  author_name: string;
  body: string;
  state: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string): string {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

function postAuthor(post: Post): string {
  return post.studentName || post.author_name || 'Anonymous';
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parsePost(post: Post): { title: string; body: string } {
  const lines = (post.question || '').split('\n');
  const hasTitle = lines.length > 1 && lines[0].trim().length > 0 && lines[0].trim().length <= 100;
  if (hasTitle) {
    return { title: lines[0].trim(), body: lines.slice(1).join('\n').trim() };
  }
  return { title: '', body: post.question };
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const { student, coach } = useAuth();
  const userId = student?.user_id ?? coach?.user_id ?? coach?.coach_id;
  const userName = student?.name ?? coach?.name ?? 'Anonymous';

  // Post list
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTopic, setFilterTopic] = useState('');

  // Blocked users — set of user_ids blocked by current user
  const [blockedUsers, setBlockedUsers] = useState<Set<number>>(new Set());

  // Thread view
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // Reply compose
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // New post form
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [posting, setPosting] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────
  const loadPosts = useCallback(async (topic?: string) => {
    try {
      const data = await questionsAPI.getAll(topic ? { topic } : undefined);
      const all: Post[] = Array.isArray(data) ? data : [];
      setPosts(all.filter(p => !blockedUsers.has(p.author_id)));
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [blockedUsers]);

  useEffect(() => { loadPosts(filterTopic || undefined); }, [loadPosts, filterTopic]);

  // Load blocked users once on mount
  useEffect(() => {
    if (!userId) return;
    moderationAPI.getBlockedUsers(Number(userId))
      .then((ids: number[]) => {
        if (Array.isArray(ids)) setBlockedUsers(new Set(ids));
      })
      .catch(() => {});
  }, [userId]);

  const loadComments = useCallback(async (postId: number) => {
    setLoadingComments(true);
    try {
      const data = await questionsAPI.getComments(postId);
      const all: Comment[] = Array.isArray(data) ? data : [];
      setComments(all.filter(c => !blockedUsers.has(c.author_id)));
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [blockedUsers]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openThread(post: Post) {
    setOpenPost(post);
    setComments([]);
    setReplyText('');
    loadComments(post.question_id);
  }

  function backToList() {
    setOpenPost(null);
    setComments([]);
    setReplyText('');
  }

  function handleReportPost(post: Post) {
    if (!userId) return;
    Alert.alert(
      'Report Post',
      'Why are you reporting this post?',
      [
        { text: 'Spam', onPress: () => submitReport('post', post.question_id, post.author_id, 'Spam') },
        { text: 'Offensive / Abusive', onPress: () => submitReport('post', post.question_id, post.author_id, 'Offensive / Abusive') },
        { text: 'Misinformation', onPress: () => submitReport('post', post.question_id, post.author_id, 'Misinformation') },
        { text: 'Other', onPress: () => submitReport('post', post.question_id, post.author_id, 'Other') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  function handleReportComment(comment: Comment) {
    if (!userId) return;
    Alert.alert(
      'Report Reply',
      'Why are you reporting this reply?',
      [
        { text: 'Spam', onPress: () => submitReport('comment', comment.comment_id, comment.author_id, 'Spam') },
        { text: 'Offensive / Abusive', onPress: () => submitReport('comment', comment.comment_id, comment.author_id, 'Offensive / Abusive') },
        { text: 'Other', onPress: () => submitReport('comment', comment.comment_id, comment.author_id, 'Other') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function submitReport(contentType: 'post' | 'comment', contentId: number, reportedUserId: number | undefined, reason: string) {
    if (!userId) return;
    try {
      await moderationAPI.reportContent({
        reporter_user_id: Number(userId),
        reported_user_id: reportedUserId,
        content_type: contentType,
        content_id: contentId,
        reason,
      });
      Alert.alert('Report Submitted', 'Thank you. Our moderation team will review this content.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  }

  function handleBlockUser(targetUserId: number, targetName: string) {
    if (!userId) return;
    Alert.alert(
      'Block User',
      `Block ${targetName}? Their content will be removed from your feed immediately and our team will be notified.`,
      [
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await moderationAPI.blockUser(Number(userId), targetUserId);
              // Immediately remove blocked user's content from local state
              setBlockedUsers(prev => new Set([...prev, targetUserId]));
              setPosts(prev => prev.filter(p => p.author_id !== targetUserId));
              if (openPost && openPost.author_id === targetUserId) {
                backToList();
              } else {
                setComments(prev => prev.filter(c => c.author_id !== targetUserId));
              }
              Alert.alert('User Blocked', `${targetName} has been blocked and our team has been notified.`);
            } catch {
              Alert.alert('Error', 'Could not block user. Please try again.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function handleDeletePost(postId: number) {
    if (!userId) return;
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await questionsAPI.delete(postId, Number(userId));
            backToList();
            await loadPosts(filterTopic || undefined);
          } catch {
            Alert.alert('Error', 'Could not delete post.');
          }
        },
      },
    ]);
  }

  async function handleDeleteComment(questionId: number, commentId: number) {
    if (!userId) return;
    Alert.alert('Delete Reply', 'Remove this reply?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await questionsAPI.deleteComment(questionId, commentId, Number(userId));
            setComments(prev => prev.filter(c => c.comment_id !== commentId));
            setPosts(prev => prev.map(p =>
              p.question_id === questionId ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p,
            ));
          } catch {
            Alert.alert('Error', 'Could not delete reply.');
          }
        },
      },
    ]);
  }

  async function handlePostReply() {
    if (!userId || !replyText.trim() || !openPost) return;
    setReplying(true);
    try {
      const res = await questionsAPI.addComment(openPost.question_id, {
        author_id: Number(userId),
        author_name: userName,
        body: replyText.trim(),
        state: '',
      });
      if (res?.comment_id) {
        setComments(prev => [...prev, res as Comment]);
        setPosts(prev => prev.map(p =>
          p.question_id === openPost.question_id ? { ...p, comment_count: p.comment_count + 1 } : p,
        ));
        setReplyText('');
      }
    } catch {
      Alert.alert('Error', 'Could not post reply.');
    } finally {
      setReplying(false);
    }
  }

  async function handleNewPost() {
    if (!userId || !newBody.trim()) return;
    setPosting(true);
    try {
      const question = newTitle.trim()
        ? `${newTitle.trim()}\n\n${newBody.trim()}`
        : newBody.trim();
      const res = await questionsAPI.create({
        author_id: Number(userId),
        author_name: userName,
        question,
        state: '',
        topic: newTopic || 'General',
      });
      if (res?.question_id) {
        setShowNewPost(false);
        setNewTitle('');
        setNewBody('');
        setNewTopic('');
        await loadPosts(filterTopic || undefined);
      } else {
        Alert.alert('Error', 'Could not create post.');
      }
    } catch {
      Alert.alert('Error', 'Could not create post.');
    } finally {
      setPosting(false);
    }
  }

  // ── Thread Detail ─────────────────────────────────────────────────────────
  if (openPost) {
    const { title, body } = parsePost(openPost);
    const isOwnPost = openPost.author_id === Number(userId);
    const opAuthorName = postAuthor(openPost);
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={backToList}>
            <Text style={styles.backText}>← Board</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>Thread</Text>
          {isOwnPost ? (
            <TouchableOpacity onPress={() => handleDeletePost(openPost.question_id)}>
              <Text style={styles.deleteTopBtn}>🗑</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => Alert.alert(
                'Post Options',
                undefined,
                [
                  { text: 'Report Post', onPress: () => handleReportPost(openPost) },
                  { text: `Block ${opAuthorName}`, style: 'destructive', onPress: () => handleBlockUser(openPost.author_id, opAuthorName) },
                  { text: 'Cancel', style: 'cancel' },
                ],
              )}
            >
              <Text style={styles.deleteTopBtn}>•••</Text>
            </TouchableOpacity>
          )}
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <FlatList
            data={comments}
            keyExtractor={c => String(c.comment_id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            ListHeaderComponent={
              <>
                {/* Original post */}
                <View style={styles.opCard}>
                  <View style={styles.opHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(opAuthorName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.opAuthor}>{opAuthorName}</Text>
                      <Text style={styles.opTime}>{timeAgo(openPost.created_at)}</Text>
                    </View>
                    <View style={styles.opBadge}><Text style={styles.opBadgeText}>OP</Text></View>
                  </View>
                  {title ? <Text style={styles.opTitle}>{title}</Text> : null}
                  <View style={styles.tagRow}>
                    {openPost.topic ? <View style={styles.tagTopic}><Text style={styles.tagText}>{openPost.topic}</Text></View> : null}
                    {openPost.state ? <View style={styles.tagState}><Text style={styles.tagText}>📍 {openPost.state}</Text></View> : null}
                  </View>
                  <Text style={styles.opBody}>{body}</Text>
                  <Text style={styles.opStats}>💬 {openPost.comment_count} {openPost.comment_count === 1 ? 'reply' : 'replies'}</Text>
                </View>

                <Text style={styles.repliesHeader}>
                  {loadingComments ? 'Loading…' : comments.length === 0 ? 'No replies yet — be the first!' : `Replies (${comments.length})`}
                </Text>
                {loadingComments && <ActivityIndicator color="#2e7d32" style={{ marginVertical: 16 }} />}
              </>
            }
            renderItem={({ item: c, index }) => (
              <View style={styles.replyRow}>
                <View style={styles.replyNum}><Text style={styles.replyNumText}>#{index + 1}</Text></View>
                <View style={styles.replyContent}>
                  <View style={styles.replyHeader}>
                    <View style={styles.avatarSm}>
                      <Text style={styles.avatarSmText}>{initials(c.author_name)}</Text>
                    </View>
                    <Text style={styles.replyAuthor}>{c.author_name}</Text>
                    <Text style={styles.replyTime}>{timeAgo(c.created_at)}</Text>
                    {c.author_id === Number(userId) ? (
                      <TouchableOpacity onPress={() => handleDeleteComment(openPost.question_id, c.comment_id)}>
                        <Text style={styles.deleteSm}>✕</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => Alert.alert(
                          'Reply Options',
                          undefined,
                          [
                            { text: 'Report Reply', onPress: () => handleReportComment(c) },
                            { text: `Block ${c.author_name}`, style: 'destructive', onPress: () => handleBlockUser(c.author_id, c.author_name) },
                            { text: 'Cancel', style: 'cancel' },
                          ],
                        )}
                      >
                        <Text style={styles.deleteSm}>•••</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.replyBody}>{c.body}</Text>
                </View>
              </View>
            )}
            ListFooterComponent={<View style={{ height: 8 }} />}
          />

          {/* Reply composer */}
          {userId ? (
            <View style={styles.replyComposer}>
              <TextInput
                style={styles.replyInput}
                placeholder="Write a reply…"
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={1000}
                editable={!replying}
              />
              <TouchableOpacity
                style={[styles.replyBtn, (!replyText.trim() || replying) && { opacity: 0.4 }]}
                onPress={handlePostReply}
                disabled={!replyText.trim() || replying}
              >
                <Text style={styles.replyBtnText}>{replying ? '…' : '→'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Post list ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>📋 Community Board</Text>
          <Text style={styles.headerSub}>Ask questions · Share tips · Connect</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewPost(true)}>
          <Text style={styles.newBtnText}>+ Post</Text>
        </TouchableOpacity>
      </View>

      {/* Topic filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.chip, !filterTopic && styles.chipActive]}
          onPress={() => setFilterTopic('')}
        >
          <Text style={[styles.chipText, !filterTopic && styles.chipTextActive]} numberOfLines={1}>All</Text>
        </TouchableOpacity>
        {TOPICS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, filterTopic === t && styles.chipActive]}
            onPress={() => setFilterTopic(filterTopic === t ? '' : t)}
          >
            <Text style={[styles.chipText, filterTopic === t && styles.chipTextActive]} numberOfLines={1}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Posts list */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={p => String(p.question_id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadPosts(filterTopic || undefined); }}
              tintColor="#2e7d32"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No posts yet</Text>
              <Text style={styles.emptySub}>Be the first to start a discussion!</Text>
            </View>
          }
          renderItem={({ item: post }) => {
            const { title, body } = parsePost(post);
            const authorName = postAuthor(post);
            return (
              <TouchableOpacity style={styles.postCard} onPress={() => openThread(post)} activeOpacity={0.8}>
                <View style={styles.postHeader}>
                  <View style={styles.avatarSm}>
                    <Text style={styles.avatarSmText}>{initials(authorName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postAuthor}>{authorName}</Text>
                    <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                  </View>
                  {post.topic ? (
                    <View style={styles.postTopicBadge}>
                      <Text style={styles.postTopicText}>{post.topic}</Text>
                    </View>
                  ) : null}
                  {post.author_id !== Number(userId) && (
                    <TouchableOpacity
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      onPress={(e) => {
                        e.stopPropagation();
                        Alert.alert(
                          'Post Options',
                          undefined,
                          [
                            { text: 'Report Post', onPress: () => handleReportPost(post) },
                            { text: `Block ${authorName}`, style: 'destructive', onPress: () => handleBlockUser(post.author_id, authorName) },
                            { text: 'Cancel', style: 'cancel' },
                          ],
                        );
                      }}
                    >
                      <Text style={styles.postMenuBtn}>•••</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {title ? <Text style={styles.postTitle}>{title}</Text> : null}
                <Text style={styles.postBody} numberOfLines={3}>{body}</Text>
                <View style={styles.postFooter}>
                  <Text style={styles.postReplies}>💬 {post.comment_count} {post.comment_count === 1 ? 'reply' : 'replies'}</Text>
                  {post.state ? <Text style={styles.postState}>📍 {post.state}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* New Post Modal */}
      <Modal visible={showNewPost} transparent animationType="slide" onRequestClose={() => setShowNewPost(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Post</Text>
                <TouchableOpacity onPress={() => { setShowNewPost(false); setNewTitle(''); setNewBody(''); setNewTopic(''); }}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.postingAs}>Posting as <Text style={{ fontWeight: '700' }}>{userName}</Text></Text>

              <TextInput
                style={styles.formInput}
                placeholder="Subject / Title (optional)"
                value={newTitle}
                onChangeText={setNewTitle}
                editable={!posting}
                maxLength={100}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
                {TOPICS.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, newTopic === t && styles.chipActive, { marginVertical: 2 }]}
                    onPress={() => setNewTopic(newTopic === t ? '' : t)}
                  >
                    <Text style={[styles.chipText, newTopic === t && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={[styles.formInput, styles.formTextarea]}
                placeholder="What's your question or thought?"
                value={newBody}
                onChangeText={setNewBody}
                multiline
                numberOfLines={5}
                editable={!posting}
                maxLength={2000}
                autoFocus
              />

              <TouchableOpacity
                style={[styles.submitBtn, (!newBody.trim() || posting) && { opacity: 0.5 }]}
                onPress={handleNewPost}
                disabled={!newBody.trim() || posting}
              >
                <Text style={styles.submitBtnText}>{posting ? 'Posting…' : 'Post Topic'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  newBtn: { backgroundColor: '#2e7d32', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Top bar (thread view)
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { paddingRight: 12, paddingVertical: 4 },
  backText: { color: '#2e7d32', fontSize: 15, fontWeight: '600' },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  deleteTopBtn: { fontSize: 20, paddingLeft: 12, paddingVertical: 4 },

  // Filter
  filterScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', height: 52 },
  filterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexShrink: 0,
    flexGrow: 0,
    height: 36,
    justifyContent: 'center' as const,
  },
  chipActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },

  // Post card
  postCard: {
    backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  postAuthor: { fontSize: 13, fontWeight: '600', color: '#222' },
  postTime: { fontSize: 11, color: '#999', marginTop: 1 },
  postTopicBadge: { backgroundColor: '#ede9fe', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  postTopicText: { fontSize: 11, color: '#6d28d9', fontWeight: '600' },
  postTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  postBody: { fontSize: 14, color: '#555', lineHeight: 20 },
  postFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  postReplies: { fontSize: 12, color: '#888' },
  postState: { fontSize: 12, color: '#888' },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#555' },
  emptySub: { fontSize: 14, color: '#999', marginTop: 4 },

  // Thread: OP card
  opCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  opHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  opAuthor: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  opTime: { fontSize: 12, color: '#999' },
  opBadge: { backgroundColor: '#2e7d32', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  opBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  opTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tagTopic: { backgroundColor: '#ede9fe', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagState: { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: '#374151', fontWeight: '500' },
  opBody: { fontSize: 15, color: '#333', lineHeight: 22 },
  opStats: { marginTop: 10, fontSize: 13, color: '#888' },

  repliesHeader: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Reply row
  replyRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  replyNum: { width: 28, alignItems: 'center', paddingTop: 2 },
  replyNumText: { fontSize: 11, color: '#bbb', fontWeight: '600' },
  replyContent: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  replyAuthor: { fontSize: 13, fontWeight: '600', color: '#222', flex: 1 },
  replyTime: { fontSize: 11, color: '#bbb' },
  deleteSm: { fontSize: 14, color: '#ef4444', paddingHorizontal: 4 },
  replyBody: { fontSize: 14, color: '#444', lineHeight: 20 },

  // Reply composer
  replyComposer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  replyInput: {
    flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    maxHeight: 100, color: '#222',
  },
  replyBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2e7d32', alignItems: 'center', justifyContent: 'center',
  },
  replyBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Avatar
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2e7d32', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  avatarSm: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center',
  },
  avatarSmText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  modalClose: { fontSize: 20, color: '#999', padding: 4 },
  postingAs: { fontSize: 13, color: '#777', marginBottom: 12 },
  formInput: {
    backgroundColor: '#f3f4f6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
    marginBottom: 10, color: '#222',
  },
  formTextarea: { height: 120, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: '#2e7d32', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Moderation
  postMenuBtn: { fontSize: 14, color: '#aaa', paddingHorizontal: 4, marginLeft: 4 },
});
