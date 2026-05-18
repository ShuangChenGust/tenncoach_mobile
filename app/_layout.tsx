import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator } from 'react-native';

function RouteGuard() {
  const { coach, student, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup    = segments[0] === 'login';
    const inSetupGroup   = segments[0] === 'coach-profile-setup';
    const isLoggedIn     = !!coach || !!student;

    // A coach who just registered has no court location yet
    const needsSetup = !!coach && !coach.courtLatitude && !coach.courtLongitude;

    if (!isLoggedIn && !inAuthGroup) {
      router.replace('/login');
    } else if (isLoggedIn && inAuthGroup) {
      if (needsSetup) {
        router.replace('/coach-profile-setup');
      } else {
        router.replace(coach ? '/(tabs)/schedule' : '/(tabs)/view-resources');
      }
    } else if (isLoggedIn && !inSetupGroup && !inAuthGroup && needsSetup) {
      // Prevent navigating anywhere else until setup is done
      router.replace('/coach-profile-setup');
    }
  }, [coach, student, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RouteGuard />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
