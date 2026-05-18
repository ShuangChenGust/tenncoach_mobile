import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { coach, student, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  if (coach) return <Redirect href="/(tabs)/schedule" />;
  if (student) return <Redirect href="/(tabs)/view-resources" />;
  return <Redirect href="/login" />;
}
