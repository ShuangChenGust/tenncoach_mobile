import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';

interface WeatherData {
  temp: number;
  description: string;
  icon: string;
  precipProb: number;
  windspeed: number;
}

interface WeatherWidgetProps {
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  address?: string;
}

// Module-level caches — survive re-renders within the session
const geocodeCache: Record<string, [number, number] | null> = {};
const weatherCache: Record<string, WeatherData | null> = {};

function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

function getWeatherDesc(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 57) return 'Freezing drizzle';
  if (code <= 65) return 'Rain';
  if (code <= 67) return 'Freezing rain';
  if (code <= 75) return 'Snow';
  if (code === 77) return 'Snow grains';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  return 'Thunderstorm + hail';
}

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  if (address in geocodeCache) return geocodeCache[address];

  const nominatim = async (q: string): Promise<[number, number] | null> => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'TennCoach-Mobile/1.0' },
      });
      const data: { lat: string; lon: string }[] = await res.json();
      return data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
    } catch {
      return null;
    }
  };

  const zipMatch = address.match(/\b(\d{5})\b/);
  const zip = zipMatch ? zipMatch[1] : null;
  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  const cityStateHint = parts.length >= 2
    ? parts.slice(-2).join(' ').replace(/\d{5}(-\d{4})?$/, '').trim()
    : '';

  let result: [number, number] | null = null;
  result = await nominatim(address);
  if (!result && zip) result = await nominatim(`${zip} ${cityStateHint}`.trim());
  if (!result && cityStateHint) result = await nominatim(cityStateHint);

  geocodeCache[address] = result;
  return result;
}

async function fetchWeather(
  lat: number,
  lng: number,
  date: string,
  hour: number,
): Promise<WeatherData | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${date},${hour}`;
  if (key in weatherCache) return weatherCache[key];

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayMs = new Date(todayStr + 'T12:00:00').getTime();
  const targetMs = new Date(date + 'T12:00:00').getTime();
  const diffDays = Math.round((targetMs - todayMs) / 86_400_000);

  if (diffDays < -90 || diffDays > 16) {
    weatherCache[key] = null;
    return null;
  }

  const useArchive = diffDays < 0;

  try {
    const baseUrl = useArchive
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';

    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      hourly: useArchive
        ? 'temperature_2m,weathercode,precipitation,windspeed_10m'
        : 'temperature_2m,weathercode,precipitation_probability,windspeed_10m',
      timezone: 'auto',
      start_date: date,
      end_date: date,
      temperature_unit: 'fahrenheit',
      windspeed_unit: 'mph',
    });

    const res = await fetch(`${baseUrl}?${params}`);
    const data: {
      hourly?: {
        time: string[];
        temperature_2m: number[];
        weathercode: number[];
        precipitation_probability?: number[];
        precipitation?: number[];
        windspeed_10m: number[];
      };
    } = await res.json();

    if (!data.hourly?.time) { weatherCache[key] = null; return null; }

    const times = data.hourly.time;
    const targetTime = `${date}T${String(hour).padStart(2, '0')}:00`;
    let idx = times.indexOf(targetTime);
    if (idx === -1) {
      const baseIdx = times.findIndex(t => t.startsWith(date));
      idx = baseIdx === -1 ? 0 : baseIdx + Math.min(hour, times.length - baseIdx - 1);
    }

    const temp = data.hourly.temperature_2m[idx];
    const code = data.hourly.weathercode[idx];
    const precipProb = useArchive
      ? (data.hourly.precipitation?.[idx] ?? 0) > 0 ? 100 : 0
      : (data.hourly.precipitation_probability?.[idx] ?? 0);
    const wind = data.hourly.windspeed_10m[idx];

    if (temp == null || code == null) { weatherCache[key] = null; return null; }

    const result: WeatherData = {
      temp: Math.round(temp),
      description: getWeatherDesc(code),
      icon: getWeatherIcon(code),
      precipProb: Math.round(precipProb),
      windspeed: Math.round(wind),
    };
    weatherCache[key] = result;
    return result;
  } catch {
    weatherCache[key] = null;
    return null;
  }
}

type WeatherState = WeatherData | 'loading' | 'na';

export default function WeatherWidget({ date, startTime, address }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherState>('na');
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!address || !date) { setWeather('na'); return; }
    setWeather('loading');
    const hour = parseInt(startTime.split(':')[0], 10);

    geocodeAddress(address)
      .then(coords => {
        if (!coords) { setWeather('na'); return Promise.resolve(null); }
        return fetchWeather(coords[0], coords[1], date, hour);
      })
      .then(data => setWeather(data ?? 'na'))
      .catch(() => setWeather('na'));
  }, [date, startTime, address]);

  if (weather === 'na') return null;

  const hasData = weather !== 'loading';

  return (
    <>
      <TouchableOpacity
        style={styles.badge}
        onPress={() => { if (hasData) setShowDetail(true); }}
        activeOpacity={hasData ? 0.7 : 1}
      >
        {weather === 'loading' ? (
          <ActivityIndicator size="small" color="#2e7d32" />
        ) : (
          <Text style={styles.badgeIcon}>{(weather as WeatherData).icon}</Text>
        )}
        {hasData && (
          <Text style={styles.badgeTemp}>{(weather as WeatherData).temp}°F</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={showDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDetail(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowDetail(false)}
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🌤 TennCoach Weather</Text>
            {hasData && (
              <>
                <Text style={styles.cardMain}>
                  {(weather as WeatherData).icon} {(weather as WeatherData).description}
                </Text>
                <Text style={styles.cardRow}>🌡️ {(weather as WeatherData).temp}°F</Text>
                <Text style={styles.cardRow}>🌧️ {(weather as WeatherData).precipProb}% chance of rain</Text>
                <Text style={styles.cardRow}>💨 {(weather as WeatherData).windspeed} mph wind</Text>
              </>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowDetail(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  badgeIcon: { fontSize: 18 },
  badgeTemp: { fontSize: 13, fontWeight: '600', color: '#166534' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1a3a1a', marginBottom: 12 },
  cardMain: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 10 },
  cardRow: { fontSize: 14, color: '#555', marginBottom: 6 },
  closeBtn: {
    marginTop: 16, backgroundColor: '#2e7d32', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
