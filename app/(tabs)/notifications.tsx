import { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { notificationsAPI } from '../../src/api';
import type { Notification } from '../../src/types';

function notifIcon(type?: string): string {
  if (!type) return '🔔';
  if (type.includes('confirmed') || type.includes('accepted')) return '✅';
  if (type.includes('rejected') || type.includes('declined') || type.includes('cancelled')) return '❌';
  if (type.includes('reschedule') || type.includes('proposed')) return '🔄';
  if (type.includes('reminder')) return '⏰';
  if (type.includes('cancel_request')) return '🚫';
  if (type.includes('booking_request')) return '📅';
  if (type.includes('group')) return '👥';
  return '🔔';
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsScreen() {
  const { student, coach } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = student?.user_id ?? coach?.user_id ?? coach?.coach_id;

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await notificationsAPI.getForUser(userId);
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      setNotifications([]);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    loadNotifications().finally(() => setLoading(false));
  }, [loadNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const markRead = async (n: Notification) => {
    if (n.is_read) return;
    try {
      await notificationsAPI.markRead(n.notification_id);
      setNotifications(prev =>
        prev.map(x => x.notification_id === n.notification_id ? { ...x, is_read: 1 } : x),
      );
    } catch {}
  };

  const markAllRead = async () => {
    if (!userId) return;
    try {
      await notificationsAPI.markAllRead(userId);
      setNotifications(prev => prev.map(x => ({ ...x, is_read: 1 })));
    } catch {
      Alert.alert('Error', 'Failed to mark all as read.');
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {unreadCount > 0 && (
        <View style={styles.markAllBar}>
          <Text style={styles.markAllCount}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllBtn}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2e7d32" />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => String(item.notification_id)}
          ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item: n }) => (
            <TouchableOpacity
              style={[styles.card, !n.is_read && styles.cardUnread]}
              onPress={() => markRead(n)}
              activeOpacity={0.8}
            >
              <Text style={styles.cardIcon}>{notifIcon(n.type)}</Text>
              <View style={styles.cardBody}>
                <Text style={styles.cardText}>{n.message}</Text>
                <Text style={styles.cardTime}>{timeAgo(n.created_at)}</Text>
              </View>
              {!n.is_read && <View style={styles.dot} />}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f5' },
  markAllBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  markAllCount: { fontSize: 13, color: '#555' },
  markAllBtn: { fontSize: 13, color: '#2e7d32', fontWeight: '600' },
  list: { padding: 12, gap: 8 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 50, fontSize: 15 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: '#2e7d32' },
  cardIcon: { fontSize: 22, marginRight: 10, marginTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2e7d32', alignSelf: 'center', marginLeft: 8 },
  cardBody: { flex: 1, gap: 3 },
  cardText: { fontSize: 14, color: '#333', lineHeight: 20 },
  cardTime: { fontSize: 11, color: '#aaa', marginTop: 2 },
});
