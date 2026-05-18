import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

function Icon({ label }: { label: string }) {
  return <Text style={{ fontSize: 20 }}>{label}</Text>;
}

function TennCoachHeader() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 20 }}>🎾</Text>
      <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: 0.4 }}>
        TennCoach
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const { role, coach, loading } = useAuth();
  const isCoach = role === 'coach';
  const isStudent = role === 'student';
  const router = useRouter();
  const alertShown = useRef(false);

  useEffect(() => {
    if (loading || alertShown.current) return;
    if (isCoach && coach?.token_balance != null && Number(coach.token_balance) < 5) {
      alertShown.current = true;
      Alert.alert(
        '⚠️ Low Token Balance',
        `You only have ${coach.token_balance} token${Number(coach.token_balance) !== 1 ? 's' : ''} remaining.\n\nNew session confirmations will be paused when your balance reaches 0. Please top up soon.`,
        [
          { text: 'Go to Account', onPress: () => router.push('/(tabs)/account') },
          { text: 'Later', style: 'cancel' },
        ],
      );
    }
  }, [loading, isCoach, coach?.token_balance]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#667eea',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#eee' },
        tabBarItemStyle: { flex: 1 },
        headerStyle: { backgroundColor: '#667eea' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerTitle: () => <TennCoachHeader />,
      }}
    >
      {/* Student only */}
      <Tabs.Screen
        name="view-resources"
        options={{
          title: 'Resources',
          tabBarIcon: () => <Icon label="🔍" />,
          href: isStudent ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="student-schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: () => <Icon label="📅" />,
          href: isStudent ? undefined : null,
        }}
      />

      {/* Coach only */}
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: () => <Icon label="📅" />,
          href: isCoach ? undefined : null,
        }}
      />

      {/* Shared */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: () => <Icon label="💬" />,
          href: role ? undefined : null,
        }}
      />

      {/* Coach only */}
      <Tabs.Screen
        name="group-lessons"
        options={{
          title: 'Group Class',
          tabBarIcon: () => <Icon label="👥" />,
          href: isCoach ? undefined : null,
        }}
      />

      {/* Shared */}
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: () => <Icon label="👤" />,
          href: role ? undefined : null,
        }}
      />

      {/* Community (BBS) — hidden from tab bar, accessible via Messages */}
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: () => <Icon label="📋" />,
          href: null,
        }}
      />

      {/* Notifications — all logged-in users */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: () => <Icon label="🔔" />,
          href: role ? undefined : null,
        }}
      />

      {/* Hidden (content moved to account tab) */}
      <Tabs.Screen name="availability" options={{ href: null }} />
    </Tabs>
  );
}
