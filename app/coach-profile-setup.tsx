import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Image, ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { coachesAPI, uploadAPI } from '../src/api';
import AmPmTimePicker from '../components/AmPmTimePicker';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CourtLocation {
  label: string;
  address: string;
  zipCode: string;
  lat: number;
  lng: number;
}

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: { postcode?: string };
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];
const DAY_LABELS: Record<Day, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
type TimeWindow = { start: string; end: string };
type AvailTemplate = Record<Day, { available: boolean; windows: TimeWindow[] }>;
const DEFAULT_AVAIL: AvailTemplate = DAYS.reduce((acc, d) => {
  acc[d] = { available: false, windows: [{ start: '09:00', end: '17:00' }] };
  return acc;
}, {} as AvailTemplate);

const COACH_TYPES = [
  { id: 'hitting-partner', label: 'Hitting Partner', icon: '🎾' },
  { id: 'private-coach',   label: 'Private Coach',   icon: '🏆' },
  { id: 'group-lesson',    label: 'Group Lesson Provider', icon: '👥' },
];

type PromoType = 'none' | 'free_trial' | 'percent_off' | 'first_lesson_discount';

// ── Geocode via Nominatim ─────────────────────────────────────────────────────
async function geocodeQuery(query: string): Promise<LocationSuggestion[]> {
  const params = new URLSearchParams({
    format: 'json', q: query, countrycodes: 'us',
    limit: '6', addressdetails: '1', 'accept-language': 'en',
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { headers: { 'User-Agent': 'TennCoachMobileApp/1.0' } },
  );
  if (!res.ok) return [];
  return res.json();
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function CoachProfileSetup() {
  const { coach, refreshCoach } = useAuth();
  const router = useRouter();

  // ── Step ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);

  // ── Step 1 fields ─────────────────────────────────────────────────────────
  const [profilePicUri, setProfilePicUri]     = useState<string | null>(null);
  const [marketingUris, setMarketingUris]     = useState<string[]>([]);
  const [specialization, setSpecialization]   = useState('');
  const [experience, setExperience]           = useState('');
  const [hourlyRate, setHourlyRate]           = useState('50');
  const [hidePrice, setHidePrice]             = useState(false);
  const [bio, setBio]                         = useState('');
  const [certifications, setCertifications]   = useState('');
  const [promoType, setPromoType]             = useState<PromoType>('none');
  const [promoPercent, setPromoPercent]       = useState('');
  const [coachTypes, setCoachTypes]           = useState<string[]>([]);

  // ── Step 2 fields ─────────────────────────────────────────────────────────
  const [courts, setCourts]                   = useState<CourtLocation[]>([]);
  const [courtQuery, setCourtQuery]           = useState('');
  const [suggestions, setSuggestions]         = useState<LocationSuggestion[]>([]);
  const [searching, setSearching]             = useState(false);
  const [showAddCourt, setShowAddCourt]       = useState(false);
  const [zipCode, setZipCode]                 = useState('');
  const [travelRadius, setTravelRadius]       = useState('');
  const [avail, setAvail]                     = useState<AvailTemplate>(DEFAULT_AVAIL);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // ── Image picker ──────────────────────────────────────────────────────────
  const pickProfilePic = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setProfilePicUri(result.assets[0].uri);
    }
  };

  const pickMarketingPhoto = async () => {
    if (marketingUris.length >= 5) {
      Alert.alert('Limit reached', 'You can upload up to 5 marketing photos.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setMarketingUris(prev => [...prev, result.assets[0].uri]);
    }
  };

  // ── Coach type toggle ─────────────────────────────────────────────────────
  const toggleCoachType = (id: string) => {
    setCoachTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id],
    );
    if (errors.coachTypes) setErrors(e => { const n = { ...e }; delete n.coachTypes; return n; });
  };

  // ── Step 1 validation ─────────────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    const exp = parseFloat(experience);
    if (experience === '' || isNaN(exp)) e.experience = 'Years of experience is required';
    else if (exp < 0 || exp > 70) e.experience = 'Experience must be between 0 and 70';
    if (!hidePrice) {
      const rate = parseFloat(hourlyRate);
      if (!hourlyRate || isNaN(rate) || rate <= 0) e.hourlyRate = 'Hourly rate is required';
      else if (rate > 500) e.hourlyRate = 'Hourly rate cannot exceed $500';
    }
    if (coachTypes.length === 0) e.coachTypes = 'Please select at least one coach type';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Court geocode search ──────────────────────────────────────────────────
  const searchCourt = useCallback(async () => {
    if (courtQuery.trim().length < 3) return;
    setSearching(true);
    setSuggestions([]);
    try {
      const results = await geocodeQuery(courtQuery.trim());
      setSuggestions(results);
      if (results.length === 0) {
        setErrors(e => ({ ...e, courts: 'No locations found. Try a more specific address.' }));
      } else {
        setErrors(e => { const n = { ...e }; delete n.courts; return n; });
      }
    } catch {
      setErrors(e => ({ ...e, courts: 'Search failed. Please try again.' }));
    } finally {
      setSearching(false);
    }
  }, [courtQuery]);

  const selectCourt = (s: LocationSuggestion) => {
    const newCourt: CourtLocation = {
      label: `Court ${courts.length + 1}`,
      address: s.display_name,
      zipCode: s.address?.postcode ?? '',
      lat: parseFloat(s.lat),
      lng: parseFloat(s.lon),
    };
    setCourts(prev => [...prev, newCourt]);
    setCourtQuery('');
    setSuggestions([]);
    setShowAddCourt(false);
    setErrors(e => { const n = { ...e }; delete n.courts; return n; });
  };

  const removeCourt = (i: number) => setCourts(prev => prev.filter((_, idx) => idx !== i));

  const updateCourtLabel = (i: number, label: string) =>
    setCourts(prev => prev.map((c, idx) => idx === i ? { ...c, label } : c));

  // ── Availability helpers ──────────────────────────────────────────────────
  const updateWindow = (day: Day, wi: number, field: 'start' | 'end', value: string) => {
    setAvail(a => {
      const wins = [...a[day].windows];
      wins[wi] = { ...wins[wi], [field]: value };
      return { ...a, [day]: { ...a[day], windows: wins } };
    });
  };

  const addWindow = (day: Day) =>
    setAvail(a => ({
      ...a,
      [day]: { ...a[day], windows: [...a[day].windows, { start: '09:00', end: '17:00' }] },
    }));

  const removeWindow = (day: Day, wi: number) =>
    setAvail(a => ({
      ...a,
      [day]: { ...a[day], windows: a[day].windows.filter((_, i) => i !== wi) },
    }));

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (courts.length === 0) {
      setErrors(e => ({ ...e, courts: 'Please add at least one home court location' }));
      return;
    }
    const hasAvailability = DAYS.some(d => avail[d].available);
    if (!hasAvailability) {
      setErrors(e => ({ ...e, avail: 'Please set your availability for at least one day' }));
      return;
    }
    if (!coach?.user_id) return;

    setSubmitting(true);
    try {
      // Upload profile picture
      let profilePictureUrl: string | undefined;
      if (profilePicUri) {
        const { url } = await uploadAPI.profilePicture(profilePicUri);
        profilePictureUrl = url;
      }

      // Upload marketing photos
      let photosJson: string | undefined;
      if (marketingUris.length > 0) {
        const { urls } = await uploadAPI.marketingPhotos(marketingUris);
        photosJson = JSON.stringify(urls);
      }

      // Build promotion string
      const promoParts: string[] = [];
      if (promoType === 'free_trial') promoParts.push('first_lesson_free');
      else if (promoType === 'percent_off' && promoPercent) promoParts.push(`${promoPercent}% off`);
      else if (promoType === 'first_lesson_discount' && promoPercent) promoParts.push(`${promoPercent}% off first lesson`);

      // Build availability JSON
      const availObj: Record<string, { available: boolean; windows: TimeWindow[] }> = {};
      for (const day of DAYS) {
        availObj[day] = { available: avail[day].available, windows: avail[day].windows };
      }
      const availabilityStr = JSON.stringify({ ...availObj, adhoc_slots: [] });

      const firstCourt = courts[0];
      const payload: Record<string, unknown> = {
        specialization: specialization.trim() || undefined,
        experience: experience !== '' ? parseFloat(experience) : 0,
        hourlyRate: hidePrice ? undefined : (hourlyRate !== '' ? parseFloat(hourlyRate) : undefined),
        hide_price: hidePrice,
        bio: bio.trim() || undefined,
        certifications: certifications.trim() || undefined,
        promotion: promoParts.join(' + ') || undefined,
        coachType: coachTypes.join(','),
        court_locations: JSON.stringify(courts),
        courtLocation: firstCourt.address,
        courtZipCode: firstCourt.zipCode,
        courtAddress: firstCourt.address,
        courtLatitude: firstCourt.lat,
        courtLongitude: firstCourt.lng,
        availability: availabilityStr,
      };
      if (profilePictureUrl) payload.profilePicture = profilePictureUrl;
      if (photosJson) payload.photos = photosJson;
      if (zipCode.trim()) payload.zip_code = zipCode.trim();
      if (travelRadius.trim()) payload.travel_radius_miles = parseFloat(travelRadius);

      const saved = await coachesAPI.update(String(coach.user_id), payload);
      if (saved?.error) {
        Alert.alert('Error', saved.error);
        return;
      }

      // Refresh coach in AuthContext so RouteGuard sees courtLatitude is now set
      await refreshCoach();
      setShowSuccessModal(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to save profile. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Step indicator */}
          <View style={styles.stepRow}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, step >= 1 && styles.stepCircleActive]}>
                <Text style={[styles.stepNum, step >= 1 && styles.stepNumActive]}>
                  {step > 1 ? '✓' : '1'}
                </Text>
              </View>
              <Text style={styles.stepLabel}>Basic Info</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, step >= 2 && styles.stepCircleActive]}>
                <Text style={[styles.stepNum, step >= 2 && styles.stepNumActive]}>2</Text>
              </View>
              <Text style={styles.stepLabel}>Location & Hours</Text>
            </View>
          </View>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <Text style={styles.heading}>Complete Your Coach Profile</Text>
              <Text style={styles.subheading}>Tell students about your expertise and coaching style</Text>

              {/* Profile Picture */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Profile Picture</Text>
                <View style={styles.picRow}>
                  {profilePicUri
                    ? <Image source={{ uri: profilePicUri }} style={styles.picPreview} />
                    : <View style={styles.picPlaceholder}><Text style={styles.picPlaceholderText}>📸</Text></View>
                  }
                  <TouchableOpacity style={styles.uploadBtn} onPress={pickProfilePic}>
                    <Text style={styles.uploadBtnText}>
                      {profilePicUri ? '📷 Change Photo' : '📷 Upload Photo'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Professional Details */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Professional Details</Text>

                <Text style={styles.label}>Specialization <Text style={styles.optional}>(Optional)</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Junior Training, Adult Beginner"
                  value={specialization}
                  onChangeText={setSpecialization}
                />

                <Text style={styles.label}>Years of Coaching Experience <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, errors.experience && styles.inputError]}
                  placeholder="e.g. 5"
                  keyboardType="numeric"
                  value={experience}
                  onChangeText={v => { setExperience(v); if (errors.experience) setErrors(e => { const n = { ...e }; delete n.experience; return n; }); }}
                />
                {errors.experience && <Text style={styles.errorText}>{errors.experience}</Text>}

                <Text style={styles.label}>Hourly Rate ($) <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, (errors.hourlyRate || hidePrice) && styles.inputDisabled]}
                  placeholder="e.g. 80"
                  keyboardType="numeric"
                  value={hourlyRate}
                  onChangeText={v => { setHourlyRate(v); if (errors.hourlyRate) setErrors(e => { const n = { ...e }; delete n.hourlyRate; return n; }); }}
                  editable={!hidePrice}
                />
                {errors.hourlyRate && <Text style={styles.errorText}>{errors.hourlyRate}</Text>}
                <View style={styles.switchRow}>
                  <Switch
                    value={hidePrice}
                    onValueChange={setHidePrice}
                    trackColor={{ true: '#2e7d32', false: '#ccc' }}
                    thumbColor="#fff"
                  />
                  <Text style={styles.switchLabel}>Hide price — show "Ask Price" instead</Text>
                </View>

                <Text style={styles.label}>About You <Text style={styles.optional}>(Optional)</Text></Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Tell students about your coaching style, background…"
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={5}
                />

                <Text style={styles.label}>Certifications <Text style={styles.optional}>(Optional)</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., PTR L1, USPTA Certified"
                  value={certifications}
                  onChangeText={setCertifications}
                />
              </View>

              {/* Promotion */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Promotion <Text style={styles.optional}>(Optional)</Text></Text>
                {([
                  { v: 'none', label: 'No promotion' },
                  { v: 'free_trial', label: '🎁 First lesson free trial' },
                  { v: 'percent_off', label: '🏷️ Percentage off (all lessons)' },
                  { v: 'first_lesson_discount', label: '🎟️ First lesson discount' },
                ] as { v: PromoType; label: string }[]).map(opt => (
                  <TouchableOpacity
                    key={opt.v}
                    style={styles.radioRow}
                    onPress={() => setPromoType(opt.v)}
                  >
                    <View style={[styles.radioCircle, promoType === opt.v && styles.radioCircleActive]}>
                      {promoType === opt.v && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.radioLabel}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
                {(promoType === 'percent_off' || promoType === 'first_lesson_discount') && (
                  <View style={styles.promoPercentRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="e.g. 20"
                      keyboardType="numeric"
                      value={promoPercent}
                      onChangeText={setPromoPercent}
                    />
                    <Text style={styles.promoPercentSuffix}>% off</Text>
                  </View>
                )}
              </View>

              {/* Marketing Photos */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Marketing Photos <Text style={styles.optional}>(Optional)</Text></Text>
                <Text style={styles.hint}>Add up to 5 photos to showcase your coaching style.</Text>
                <View style={styles.photosGrid}>
                  {marketingUris.map((uri, i) => (
                    <View key={i} style={styles.photoThumb}>
                      <Image source={{ uri }} style={styles.photoThumbImg} />
                      <TouchableOpacity
                        style={styles.photoRemove}
                        onPress={() => setMarketingUris(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <Text style={styles.photoRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {marketingUris.length < 5 && (
                    <TouchableOpacity style={styles.photoAdd} onPress={pickMarketingPhoto}>
                      <Text style={styles.photoAddText}>+</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Coach Type */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Coach Type <Text style={styles.required}>*</Text></Text>
                <Text style={styles.hint}>Select all service types you offer.</Text>
                {COACH_TYPES.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.checkCard, coachTypes.includes(opt.id) && styles.checkCardActive]}
                    onPress={() => toggleCoachType(opt.id)}
                  >
                    <Text style={styles.checkCardIcon}>{opt.icon}</Text>
                    <Text style={[styles.checkCardLabel, coachTypes.includes(opt.id) && styles.checkCardLabelActive]}>
                      {opt.label}
                    </Text>
                    {coachTypes.includes(opt.id) && <Text style={styles.checkMark}>✓</Text>}
                  </TouchableOpacity>
                ))}
                {errors.coachTypes && <Text style={styles.errorText}>{errors.coachTypes}</Text>}
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => { if (validateStep1()) { setErrors({}); setStep(2); } }}
              >
                <Text style={styles.primaryBtnText}>Next: Location & Availability →</Text>
              </TouchableOpacity>
              <Text style={styles.requiredNote}>* Required fields</Text>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <Text style={styles.heading}>📍 Set Your Location & Availability</Text>
              <Text style={styles.subheading}>Help students find you and know when you're free</Text>

              {/* Court Location */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Home Court Location <Text style={styles.required}>*</Text></Text>

                {courts.map((court, i) => (
                  <View key={i} style={styles.courtCard}>
                    <Text style={styles.courtIcon}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={styles.courtLabelInput}
                        value={court.label}
                        onChangeText={v => updateCourtLabel(i, v)}
                        placeholder="e.g. Riverside Tennis Club"
                      />
                      <Text style={styles.courtAddr} numberOfLines={2}>{court.address}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeCourt(i)} style={styles.courtRemove}>
                      <Text style={styles.courtRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {courts.length < 3 && (
                  showAddCourt ? (
                    <View style={styles.courtSearchBox}>
                      <View style={styles.courtSearchRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          placeholder="Search by address, ZIP, or court name…"
                          value={courtQuery}
                          onChangeText={setCourtQuery}
                          onSubmitEditing={searchCourt}
                          returnKeyType="search"
                          autoFocus
                        />
                        <TouchableOpacity style={styles.searchBtn} onPress={searchCourt} disabled={searching}>
                          {searching
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={styles.searchBtnText}>Search</Text>}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity style={styles.cancelSearchBtn} onPress={() => { setShowAddCourt(false); setCourtQuery(''); setSuggestions([]); }}>
                        <Text style={styles.cancelSearchText}>Cancel</Text>
                      </TouchableOpacity>

                      {suggestions.map((s, idx) => (
                        <TouchableOpacity key={idx} style={styles.suggestionItem} onPress={() => selectCourt(s)}>
                          <Text style={styles.suggestionIcon}>📍</Text>
                          <Text style={styles.suggestionText} numberOfLines={2}>{s.display_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.addCourtBtn, courts.length === 0 && styles.addCourtBtnHighlight]}
                      onPress={() => setShowAddCourt(true)}
                    >
                      <Text style={[styles.addCourtBtnText, courts.length === 0 && styles.addCourtBtnTextHighlight]}>
                        + {courts.length === 0 ? 'Add Home Court' : 'Add Another Court'}
                      </Text>
                    </TouchableOpacity>
                  )
                )}

                {errors.courts && <Text style={styles.errorText}>{errors.courts}</Text>}
              </View>

              {/* Travel Info */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Travel Info <Text style={styles.optional}>(Optional)</Text></Text>
                <Text style={styles.hint}>Help students know how far you'll travel to teach.</Text>

                <Text style={styles.label}>Your Home ZIP Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 90210"
                  keyboardType="numeric"
                  maxLength={10}
                  value={zipCode}
                  onChangeText={setZipCode}
                />

                <Text style={styles.label}>Travel Radius (miles)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 15"
                  keyboardType="numeric"
                  value={travelRadius}
                  onChangeText={setTravelRadius}
                />
              </View>

              {/* Weekly Availability */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Weekly Availability <Text style={styles.required}>*</Text></Text>
                <Text style={styles.hint}>Set your regular schedule. Students will see when you're available.</Text>

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
                            <AmPmTimePicker
                              value={win.start}
                              onChange={v => updateWindow(day, wi, 'start', v)}
                            />
                            <Text style={styles.timeSep}>–</Text>
                            <AmPmTimePicker
                              value={win.end}
                              onChange={v => updateWindow(day, wi, 'end', v)}
                            />
                            {avail[day].windows.length > 1 && (
                              <TouchableOpacity style={styles.removeWindowBtn} onPress={() => removeWindow(day, wi)}>
                                <Text style={styles.removeWindowText}>×</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                        <TouchableOpacity style={styles.addWindowBtn} onPress={() => addWindow(day)}>
                          <Text style={styles.addWindowText}>+ Add window</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {errors.avail && <Text style={[styles.errorText, { marginTop: 8 }]}>{errors.avail}</Text>}

              {/* Action buttons */}
              <View style={styles.step2Actions}>
                <TouchableOpacity
                  style={[styles.backBtn, { flex: 1 }]}
                  onPress={() => { setStep(1); setErrors({}); }}
                >
                  <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1 }, submitting && styles.primaryBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryBtnText}>Complete Setup →</Text>}
                </TouchableOpacity>
              </View>
              <Text style={styles.requiredNote}>* Location required</Text>
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── All Set Modal ── */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.successTitle}>You're All Set!</Text>
            <Text style={styles.successMsg}>
              Your coach profile is live. Students can now find and book you!
            </Text>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => {
                setShowSuccessModal(false);
                router.replace('/(tabs)/account');
              }}
            >
              <Text style={styles.successBtnText}>Go to My Profile →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#f0f4f0' },
  scroll:      { padding: 20, paddingBottom: 48 },

  // Step indicator
  stepRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  stepItem:    { alignItems: 'center', flex: 1 },
  stepCircle:  { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepCircleActive: { borderColor: '#2e7d32', backgroundColor: '#2e7d32' },
  stepNum:     { fontSize: 14, fontWeight: '700', color: '#aaa' },
  stepNumActive: { color: '#fff' },
  stepLabel:   { fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' },
  stepLine:    { height: 2, flex: 0.5, backgroundColor: '#ddd', marginBottom: 18 },

  // Headers
  heading:     { fontSize: 22, fontWeight: '800', color: '#1f2937', marginBottom: 4 },
  subheading:  { fontSize: 14, color: '#666', marginBottom: 20 },

  // Sections
  section:     { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 14 },

  // Form fields
  label:       { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  required:    { color: '#e53e3e' },
  optional:    { fontWeight: '400', color: '#9ca3af', fontSize: 12 },
  input:       { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1f2937', backgroundColor: '#fafafa', marginBottom: 4 },
  inputError:  { borderColor: '#e53e3e' },
  inputDisabled: { backgroundColor: '#f3f4f6', color: '#9ca3af' },
  textArea:    { height: 110, textAlignVertical: 'top' },
  errorText:   { color: '#e53e3e', fontSize: 12, marginBottom: 6 },
  hint:        { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  requiredNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, marginBottom: 16 },

  // Switch
  switchRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  switchLabel: { fontSize: 13, color: '#4b5563', marginLeft: 10 },

  // Profile pic
  picRow:      { flexDirection: 'row', alignItems: 'center', gap: 16 },
  picPreview:  { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#2e7d32' },
  picPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  picPlaceholderText: { fontSize: 30 },
  uploadBtn:   { borderWidth: 1.5, borderColor: '#2e7d32', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  uploadBtnText: { color: '#2e7d32', fontWeight: '600', fontSize: 14 },

  // Marketing photos
  photosGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  photoThumb:  { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoThumbImg: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  photoAdd:    { width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderColor: '#d1d5db', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoAddText: { fontSize: 28, color: '#9ca3af' },

  // Promo
  radioRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  radioCircleActive: { borderColor: '#2e7d32' },
  radioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2e7d32' },
  radioLabel:  { fontSize: 14, color: '#374151' },
  promoPercentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  promoPercentSuffix: { fontSize: 15, color: '#4b5563', fontWeight: '600' },

  // Coach type cards
  checkCard:   { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: '#fafafa' },
  checkCardActive: { borderColor: '#2e7d32', backgroundColor: '#f0faf0' },
  checkCardIcon: { fontSize: 22, marginRight: 12 },
  checkCardLabel: { fontSize: 15, fontWeight: '600', color: '#374151', flex: 1 },
  checkCardLabelActive: { color: '#2e7d32' },
  checkMark:   { color: '#2e7d32', fontSize: 18, fontWeight: '700' },

  // Primary button
  primaryBtn:  { backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Court location
  courtCard:   { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  courtIcon:   { fontSize: 18, marginRight: 8, marginTop: 2 },
  courtLabelInput: { fontSize: 14, fontWeight: '700', color: '#1f2937', borderBottomWidth: 1, borderColor: '#d1d5db', paddingBottom: 2, marginBottom: 4 },
  courtAddr:   { fontSize: 12, color: '#6b7280', lineHeight: 16 },
  courtRemove: { padding: 4 },
  courtRemoveText: { color: '#9ca3af', fontSize: 18, fontWeight: '700' },
  courtSearchBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 6 },
  courtSearchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchBtn:   { backgroundColor: '#2e7d32', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelSearchBtn: { marginBottom: 8 },
  cancelSearchText: { color: '#6b7280', fontSize: 13, textAlign: 'right' },
  suggestionItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  suggestionIcon: { fontSize: 16, marginRight: 8, marginTop: 1 },
  suggestionText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 18 },
  addCourtBtn: { borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, borderStyle: 'dashed', paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  addCourtBtnHighlight: { borderColor: '#2e7d32', borderStyle: 'solid', backgroundColor: '#f0faf0' },
  addCourtBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  addCourtBtnTextHighlight: { color: '#2e7d32' },

  // Travel
  // (reuses label/input)

  // Availability
  dayRow:      { borderBottomWidth: 1, borderColor: '#f0f0f0', paddingVertical: 10 },
  dayHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel:    { fontSize: 14, fontWeight: '700', color: '#374151', width: 48 },
  windowList:  { marginTop: 8, paddingLeft: 12 },
  windowRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  timeInput:   { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, width: 72, textAlign: 'center', color: '#1f2937', backgroundColor: '#fafafa' },
  timeSep:     { fontSize: 16, color: '#6b7280' },
  removeWindowBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#fee2e2', borderRadius: 6 },
  removeWindowText: { color: '#e53e3e', fontSize: 16, fontWeight: '700' },
  addWindowBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14, alignSelf: 'flex-start', marginTop: 4 },
  addWindowText: { color: '#6b7280', fontSize: 13 },

  // Step 2 actions
  step2Actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  backBtn:     { borderWidth: 2, borderColor: '#d1d5db', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: '#6b7280', fontWeight: '700', fontSize: 16 },

  // Success modal
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  successCard:    { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, width: '100%' },
  successEmoji:   { fontSize: 56, marginBottom: 12 },
  successTitle:   { fontSize: 26, fontWeight: '800', color: '#1f2937', marginBottom: 8, textAlign: 'center' },
  successMsg:     { fontSize: 15, color: '#6b7280', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  successBtn:     { backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', shadowColor: '#1b5e20', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4, width: '100%' },
  successBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
