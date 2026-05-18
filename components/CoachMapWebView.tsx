/**
 * CoachMapWebView — Interactive Leaflet map of coaches.
 *
 * Requires: npx expo install react-native-webview
 *
 * Coaches with courtLatitude + courtLongitude are shown as 🎾 markers.
 * Tapping a marker's "View Profile" button sends a postMessage back to RN,
 * which the parent handles via onCoachPress(coachId).
 */

import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';

// react-native-webview must be installed: npx expo install react-native-webview
let WebViewComponent: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewComponent = require('react-native-webview').WebView;
} catch {
  WebViewComponent = null;
}

export interface MappedCoach {
  coach_id: number;
  user_id: number;
  name: string;
  specialization?: string;
  courtLocation?: string;
  hourlyRate?: number;
  Hourly_pay?: number;
  hide_price?: boolean | number;
  courtLatitude?: number;
  courtLongitude?: number;
  avg_rating?: number | null;
  review_count?: number;
}

interface Props {
  coaches: MappedCoach[];
  onCoachPress: (coachId: number) => void;
}

const PIN_COLORS = [
  '#2e7d32', '#667eea', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#10b981',
];

function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function CoachMapWebView({ coaches, onCoachPress }: Props) {
  const mappedCoaches = coaches.filter(c => c.courtLatitude && c.courtLongitude);

  if (mappedCoaches.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📍</Text>
        <Text style={styles.emptyTitle}>No map locations yet</Text>
        <Text style={styles.emptyHint}>Coaches with court locations will appear here.</Text>
      </View>
    );
  }

  if (!WebViewComponent) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyTitle}>Map unavailable</Text>
        <Text style={styles.emptyHint}>
          Run: npx expo install react-native-webview{'\n'}then rebuild the app.
        </Text>
      </View>
    );
  }

  const markers = mappedCoaches.map((c, idx) => ({
    id: c.coach_id,
    userId: c.user_id,
    lat: c.courtLatitude,
    lng: c.courtLongitude,
    name: maskName(c.name),
    spec: c.specialization || '',
    rate: c.hide_price ? null : (c.Hourly_pay ?? c.hourlyRate ?? null),
    location: c.courtLocation || '',
    rating: c.avg_rating ?? null,
    reviews: c.review_count ?? 0,
    color: PIN_COLORS[idx % PIN_COLORS.length],
  }));

  // Center on mean coords
  const centerLat = markers.reduce((s, m) => s + (m.lat ?? 0), 0) / markers.length;
  const centerLng = markers.reduce((s, m) => s + (m.lng ?? 0), 0) / markers.length;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; }
    .coach-popup { min-width: 160px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .coach-popup h3 { font-size: 14px; font-weight: 700; margin-bottom: 4px; color: #1a1a2e; }
    .coach-popup p { font-size: 12px; color: #555; margin: 2px 0; }
    .coach-popup .view-btn {
      margin-top: 10px; width: 100%; background: #2e7d32; color: #fff;
      border: none; padding: 8px; border-radius: 8px; font-size: 13px;
      font-weight: 600; cursor: pointer; display: block; text-align: center;
    }
    .coach-popup .view-btn:active { background: #1b5e20; }
    .pin-icon {
      background: #fff; border-radius: 50%; width: 34px; height: 34px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; border: 2.5px solid currentColor;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
<div id="map"></div>
<script>
var markers = ${JSON.stringify(markers)};
var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

markers.forEach(function(m) {
  var icon = L.divIcon({
    html: '<div class="pin-icon" style="color:' + m.color + '; border-color:' + m.color + '">🎾</div>',
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -22]
  });

  var ratingStr = m.rating ? '&#9733; ' + m.rating.toFixed(1) + ' (' + m.reviews + ' reviews)' : '';
  var rateStr = m.rate != null ? '$' + m.rate + '/hr' : '';
  var popup = '<div class="coach-popup">' +
    '<h3>&#127934; ' + m.name + '</h3>' +
    (m.spec ? '<p><strong>' + m.spec + '</strong></p>' : '') +
    (rateStr ? '<p>' + rateStr + '</p>' : '') +
    (ratingStr ? '<p>' + ratingStr + '</p>' : '') +
    (m.location ? '<p>&#128205; ' + m.location + '</p>' : '') +
    '<button class="view-btn" onclick="viewCoach(' + m.id + ')">View Profile &rarr;</button>' +
    '</div>';

  L.marker([m.lat, m.lng], { icon: icon }).addTo(map).bindPopup(popup);
});

if (markers.length > 1) {
  var bounds = markers.map(function(m) { return [m.lat, m.lng]; });
  map.fitBounds(bounds, { padding: [40, 40] });
}

function viewCoach(id) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'coachSelect', id: id }));
  }
}
</script>
</body>
</html>`;

  const WV = WebViewComponent;
  return (
    <View style={styles.container}>
      <WV
        source={{ html }}
        style={styles.map}
        onMessage={(event: any) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'coachSelect' && typeof data.id === 'number') {
              onCoachPress(data.id);
            }
          } catch {}
        }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2e7d32" />
          </View>
        )}
        onError={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, backgroundColor: '#e8f5e9' },
  loading: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f7f5',
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 8,
  },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#555' },
  emptyHint: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },
});

// ── Single-coach profile map ─────────────────────────────────────────────────
interface SingleMapProps {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
}

export function CoachSingleMapWebView({ lat, lng, label, address }: SingleMapProps) {
  if (!WebViewComponent) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyTitle}>Map unavailable</Text>
      </View>
    );
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; }
    .popup { min-width: 140px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .popup h3 { font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
    .popup p  { font-size: 12px; color: #555; margin: 2px 0; }
    .pin-icon {
      background: #fff; border-radius: 50%; width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      font-size: 17px; border: 3px solid #2e7d32;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
}).addTo(map);
var icon = L.divIcon({
  html: '<div class="pin-icon">🎾</div>',
  className: '', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22]
});
var popup = '<div class="popup">' +
  ${label ? `'<h3>&#128205; ' + ${JSON.stringify(label)} + '</h3>' +` : `''  +`}
  ${address ? `'<p>' + ${JSON.stringify(address)} + '</p>'` : `''`} +
  '</div>';
L.marker([${lat}, ${lng}], { icon: icon }).addTo(map).bindPopup(popup).openPopup();
</script>
</body>
</html>`;

  const WV = WebViewComponent;
  return (
    <View style={styles.container}>
      <WV
        source={{ html }}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2e7d32" />
          </View>
        )}
        onError={() => {}}
      />
    </View>
  );
}
