import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
  Image, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../src/context/AuthContext';
import { authAPI } from '../src/api';

// @react-native-google-signin/google-signin requires a native build and is not
// available in Expo Go. Lazy-load it so the app doesn't crash when the native
// module is missing (falls back to disabling the Google button).
let GoogleSignin: any = null;
let statusCodes: any = {};
let isErrorWithCode: (_e: unknown) => boolean = () => false;

const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
  '742515360220-vq0s9t127gdum3oaiai52pb15ange5n6.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ||
  '742515360220-c35j8farslgr3ntthb7pnh5kk54nbh1s.apps.googleusercontent.com';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const gs = require('@react-native-google-signin/google-signin');
  GoogleSignin = gs.GoogleSignin;
  statusCodes = gs.statusCodes;
  isErrorWithCode = gs.isErrorWithCode;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['profile', 'email'],
  });
} catch {
  // Native module unavailable (Expo Go / web) — Google Sign-In disabled
}

type Role = 'coach' | 'student';
// Screens: welcome → roleSelect (register path) → eula → register
//          welcome → login → forgot
type Screen = 'welcome' | 'roleSelect' | 'eula' | 'register' | 'login' | 'forgot';

export default function LoginScreen() {
  const { login, register, googleLogin, appleLogin } = useAuth();

  const [screen, setScreen] = useState<Screen>('welcome');
  const [selectedRole, setSelectedRole] = useState<Role>('student');

  // Loading states
  const [loading, setLoading]           = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading]   = useState(false);

  // Feedback
  const [error, setError]               = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail]     = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName]           = useState('');
  const [regEmail, setRegEmail]         = useState('');
  const [regZip, setRegZip]             = useState('');
  const [regGender, setRegGender]       = useState<'male' | 'female' | 'prefer_not_to_say'>('prefer_not_to_say');
  const [regPassword, setRegPassword]   = useState('');
  const [regConfirm, setRegConfirm]     = useState('');

  // EULA
  const [eulaAccepted, setEulaAccepted] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg]       = useState<string | null>(null);

  const clearFeedback = () => { setError(null); setSuccessMsg(null); };

  const go = (s: Screen) => { setScreen(s); clearFeedback(); };

  // ── SSO ──────────────────────────────────────────────────────────────────
  const handleApplePress = async () => {
    clearFeedback();
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token returned from Apple.');
      const result = await appleLogin(
        credential.identityToken,
        selectedRole,
        credential.fullName,
        credential.email,
      );
      if (result.error) setError(result.error);
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple sign-in failed', e?.message || 'Please try again.');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleGooglePress = async () => {
    if (!GoogleSignin) {
      Alert.alert(
        'Not available in Expo Go',
        'Google Sign-In requires a development build. Please use email & password.',
      );
      return;
    }
    clearFeedback();
    setGoogleLoading(true);
    try {
      await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();
      if (!idToken) throw new Error('No ID token returned from Google.');
      const result = await googleLogin(idToken, selectedRole);
      if (result.error) setError(result.error);
    } catch (e: any) {
      if (isErrorWithCode(e)) {
        if (e.code !== statusCodes.SIGN_IN_CANCELLED && e.code !== statusCodes.IN_PROGRESS) {
          Alert.alert('Google sign-in failed', e.message || 'Please try again.');
        }
      } else {
        Alert.alert('Google sign-in failed', e?.message || 'Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    clearFeedback();
    const trimEmail = loginEmail.trim().toLowerCase();
    if (!trimEmail || !loginPassword) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    const result = await login(trimEmail, loginPassword);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  const handleRegister = async () => {
    clearFeedback();
    const name  = regName.trim();
    const email = regEmail.trim().toLowerCase();
    if (!name || !email) { setError('Name and email are required.'); return; }
    if (selectedRole === 'student') {
      if (!regZip) { setError('ZIP code is required.'); return; }
      if (!/^\d{5}(-\d{4})?$/.test(regZip.trim())) {
        setError('Please enter a valid US ZIP code (e.g. 90210).');
        return;
      }
    }
    if (!regPassword || regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const extra = selectedRole === 'student'
      ? { zipCode: regZip.trim(), gender: regGender }
      : undefined;
    const result = await register(name, email, regPassword, selectedRole, extra);
    setLoading(false);
    if (result.error) setError(result.error);
    else setSuccessMsg(`Welcome, ${name}! Your account has been created.`);
  };

  const handleForgotPassword = async () => {
    const email = forgotEmail.trim();
    if (!email) return;
    setForgotLoading(true);
    setForgotMsg(null);
    try {
      await authAPI.forgotPassword(email, 'coach'); // auto-tries both internally
    } finally {
      setForgotLoading(false);
      setForgotMsg('If an account with that email exists, a new password has been sent. Check your inbox.');
      setForgotEmail('');
    }
  };

  const anyLoading = loading || googleLoading || appleLoading;

  // ── SCREEN: Welcome ──────────────────────────────────────────────────────
  if (screen === 'welcome') {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="light-content" />
        {/* Hero — green top half */}
        <View style={styles.hero}>
          <View style={styles.heroBall}>
            <Text style={styles.heroBallText}>🎾</Text>
          </View>
          <Text style={styles.heroTitle}>TennCoach</Text>
          <Text style={styles.heroSub}>Your tennis journey starts here</Text>
          <View style={styles.heroFeatureRow}>
            <FeaturePill icon="📅" label="Book Lessons" />
            <FeaturePill icon="📈" label="Track Progress" />
            <FeaturePill icon="🏆" label="Find Coaches" />
          </View>
        </View>

        {/* Action — white bottom section */}
        <View style={styles.heroBottom}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => go('roleSelect')}
          >
            <Text style={styles.primaryBtnText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => go('login')}
          >
            <Text style={styles.secondaryBtnText}>Sign In</Text>
          </TouchableOpacity>

          <Text style={styles.welcomeNote}>
            Join thousands of players and coaches across the US
          </Text>
        </View>
      </View>
    );
  }

  // ── SCREEN: Role Selection (register path only) ──────────────────────────
  if (screen === 'roleSelect') {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backBtn} onPress={() => go('welcome')}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.screenTitle}>Who are you?</Text>
            <Text style={styles.screenSub}>Select your role to get started</Text>

            <TouchableOpacity
              style={[styles.bigRoleCard, selectedRole === 'coach' && styles.bigRoleCardActive]}
              onPress={() => setSelectedRole('coach')}
              activeOpacity={0.85}
            >
              <View style={[styles.bigRoleIcon, selectedRole === 'coach' && styles.bigRoleIconActive]}>
                <Text style={styles.bigRoleEmoji}>🎾</Text>
              </View>
              <View style={styles.bigRoleText}>
                <Text style={[styles.bigRoleTitle, selectedRole === 'coach' && styles.bigRoleTitleActive]}>
                  I'm a Coach
                </Text>
                <Text style={styles.bigRoleDesc}>
                  Create your profile, set your availability, and manage student bookings
                </Text>
              </View>
              <View style={[styles.bigRoleCheck, selectedRole === 'coach' && styles.bigRoleCheckActive]}>
                {selectedRole === 'coach' && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bigRoleCard, selectedRole === 'student' && styles.bigRoleCardActive]}
              onPress={() => setSelectedRole('student')}
              activeOpacity={0.85}
            >
              <View style={[styles.bigRoleIcon, selectedRole === 'student' && styles.bigRoleIconActive]}>
                <Text style={styles.bigRoleEmoji}>🎓</Text>
              </View>
              <View style={styles.bigRoleText}>
                <Text style={[styles.bigRoleTitle, selectedRole === 'student' && styles.bigRoleTitleActive]}>
                  I'm a Student
                </Text>
                <Text style={styles.bigRoleDesc}>
                  Browse coaches near you, book sessions, and track your progress
                </Text>
              </View>
              <View style={[styles.bigRoleCheck, selectedRole === 'student' && styles.bigRoleCheckActive]}>
                {selectedRole === 'student' && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => { setEulaAccepted(false); go('eula'); }}
            >
              <Text style={styles.primaryBtnText}>
                Continue as {selectedRole === 'coach' ? 'Coach' : 'Student'} →
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.switchLink} onPress={() => go('login')}>
              <Text style={styles.switchLinkText}>
                Already have an account? <Text style={styles.switchLinkBold}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── SCREEN: EULA ─────────────────────────────────────────────────────────
  if (screen === 'eula') {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backBtn} onPress={() => go('roleSelect')}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.screenTitle}>Terms of Use</Text>
            <Text style={styles.screenSub}>
              Please read and accept our Terms of Use before creating an account.
            </Text>

            <View style={styles.eulaBox}>
              <ScrollView style={styles.eulaScroll} nestedScrollEnabled>
                <Text style={styles.eulaHeading}>TennCoach Terms of Use &amp; Community Guidelines</Text>
                <Text style={styles.eulaDate}>Effective: January 1, 2025</Text>

                <Text style={styles.eulaSection}>1. Acceptance of Terms</Text>
                <Text style={styles.eulaBody}>
                  By creating an account on TennCoach, you agree to be bound by these Terms of Use. If you do not agree, do not register or use the app.
                </Text>

                <Text style={styles.eulaSection}>2. User-Generated Content</Text>
                <Text style={styles.eulaBody}>
                  TennCoach is a platform for connecting tennis coaches and students. Users may post questions, comments, messages, and other content. You are solely responsible for any content you post.
                </Text>

                <Text style={styles.eulaSection}>3. Zero Tolerance for Objectionable Content</Text>
                <Text style={styles.eulaBody}>
                  TennCoach has a strict zero-tolerance policy for objectionable content. The following are strictly prohibited:{'\n\n'}
                  • Harassment, bullying, or threats directed at any user{'\n'}
                  • Hate speech, discrimination, or content targeting any group{'\n'}
                  • Sexually explicit, violent, or otherwise offensive material{'\n'}
                  • Spam, scams, or misleading information{'\n'}
                  • Impersonation of other users, coaches, or public figures{'\n'}
                  • Any content that violates applicable laws
                </Text>

                <Text style={styles.eulaSection}>4. Zero Tolerance for Abusive Behavior</Text>
                <Text style={styles.eulaBody}>
                  Abusive behavior toward other users — including but not limited to harassment, intimidation, repeated unwanted contact, or discriminatory remarks — will result in immediate account suspension or permanent ban.
                </Text>

                <Text style={styles.eulaSection}>5. Reporting &amp; Blocking</Text>
                <Text style={styles.eulaBody}>
                  Users may report objectionable content or block abusive users at any time using the in-app tools. All reports are reviewed by our moderation team. Blocking a user immediately removes their content from your feed and notifies our team.
                </Text>

                <Text style={styles.eulaSection}>6. Enforcement</Text>
                <Text style={styles.eulaBody}>
                  TennCoach reserves the right to remove any content and suspend or permanently ban any account that violates these terms, at our sole discretion and without prior notice.
                </Text>

                <Text style={styles.eulaSection}>7. Privacy</Text>
                <Text style={styles.eulaBody}>
                  Your personal data is handled in accordance with our Privacy Policy available at tenncoach.com/privacy. We do not sell your personal information.
                </Text>

                <Text style={styles.eulaSection}>8. Disclaimer</Text>
                <Text style={styles.eulaBody}>
                  TennCoach is provided "as is" without warranty of any kind. We are not responsible for the actions of any coach, student, or third party on the platform.
                </Text>

                <Text style={styles.eulaSection}>9. Contact</Text>
                <Text style={styles.eulaBody}>
                  If you have questions about these terms, contact us at support@tenncoach.com.
                </Text>
              </ScrollView>
            </View>

            <TouchableOpacity
              style={styles.eulaCheckRow}
              onPress={() => setEulaAccepted(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.eulaCheckbox, eulaAccepted && styles.eulaCheckboxActive]}>
                {eulaAccepted && <Text style={styles.eulaCheckMark}>✓</Text>}
              </View>
              <Text style={styles.eulaCheckLabel}>
                I have read and agree to the{' '}
                <Text style={styles.eulaLink}>Terms of Use</Text>
                {' '}and confirm there is zero tolerance for objectionable content or abusive users.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, !eulaAccepted && styles.btnDisabled]}
              onPress={() => eulaAccepted && go('register')}
              disabled={!eulaAccepted}
            >
              <Text style={styles.primaryBtnText}>Accept &amp; Continue →</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── SCREEN: Register ─────────────────────────────────────────────────────
  if (screen === 'register') {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backBtn} onPress={() => go('eula')}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            {/* Role badge */}
            <View style={styles.roleBadgeRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {selectedRole === 'coach' ? '🎾 Registering as Coach' : '🎓 Registering as Student'}
                </Text>
              </View>
            </View>

            <Text style={styles.screenTitle}>Create Account</Text>

            {/* SSO */}
            <SSOButtons
              googleLoading={googleLoading}
              appleLoading={appleLoading}
              anyLoading={anyLoading}
              onGoogle={handleGooglePress}
              onApple={handleApplePress}
            />

            <Divider />

            {/* Feedback */}
            {error     && <FeedbackBanner type="error"   msg={error} />}
            {successMsg && <FeedbackBanner type="success" msg={successMsg} />}

            <Text style={styles.fieldLabel}>Full Name <Text style={styles.req}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="Jane Smith"
              value={regName}
              onChangeText={setRegName}
              autoCapitalize="words"
              editable={!anyLoading}
            />

            <Text style={styles.fieldLabel}>Email <Text style={styles.req}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="jane@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={regEmail}
              onChangeText={setRegEmail}
              editable={!anyLoading}
            />

            {selectedRole === 'student' && (
              <>
                <Text style={styles.fieldLabel}>ZIP Code <Text style={styles.req}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 90210"
                  keyboardType="numeric"
                  maxLength={10}
                  value={regZip}
                  onChangeText={setRegZip}
                  editable={!anyLoading}
                />
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.genderRow}>
                  {(['male', 'female', 'prefer_not_to_say'] as const).map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.genderChip, regGender === g && styles.genderChipActive]}
                      onPress={() => setRegGender(g)}
                    >
                      <Text style={[styles.genderChipText, regGender === g && styles.genderChipTextActive]}>
                        {g === 'prefer_not_to_say' ? 'Prefer not to say' : g.charAt(0).toUpperCase() + g.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Password <Text style={styles.req}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="At least 6 characters"
              secureTextEntry
              value={regPassword}
              onChangeText={setRegPassword}
              editable={!anyLoading}
            />

            <Text style={styles.fieldLabel}>Confirm Password <Text style={styles.req}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="Repeat your password"
              secureTextEntry
              value={regConfirm}
              onChangeText={setRegConfirm}
              editable={!anyLoading}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, anyLoading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={anyLoading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Create Account</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.switchLink} onPress={() => go('login')}>
              <Text style={styles.switchLinkText}>
                Already have an account? <Text style={styles.switchLinkBold}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── SCREEN: Login ─────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backBtn} onPress={() => go('welcome')}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.loginLogoRow}>
              <Text style={styles.loginLogo}>🎾</Text>
              <Text style={styles.loginLogoTitle}>TennCoach</Text>
            </View>
            <Text style={styles.screenTitle}>Welcome back</Text>

            {/* SSO — backend returns the existing account role and AuthContext persists it */}
            <SSOButtons
              googleLoading={googleLoading}
              appleLoading={appleLoading}
              anyLoading={anyLoading}
              onGoogle={handleGooglePress}
              onApple={handleApplePress}
            />

            <Divider />

            {/* Feedback */}
            {error     && <FeedbackBanner type="error"   msg={error} />}
            {successMsg && <FeedbackBanner type="success" msg={successMsg} />}

            <Text style={styles.fieldLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="jane@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={loginEmail}
              onChangeText={setLoginEmail}
              editable={!anyLoading}
            />

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Your password"
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              value={loginPassword}
              onChangeText={setLoginPassword}
              editable={!anyLoading}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, anyLoading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={anyLoading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Sign In</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => go('forgot')}
            >
              <Text style={styles.switchLinkText}>Forgot your password?</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.switchLink} onPress={() => go('roleSelect')}>
              <Text style={styles.switchLinkText}>
                New here? <Text style={styles.switchLinkBold}>Create an Account</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── SCREEN: Forgot Password ───────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => go('login')}>
            <Text style={styles.backBtnText}>← Back to Sign In</Text>
          </TouchableOpacity>

          <Text style={styles.screenTitle}>Reset Password</Text>
          <Text style={styles.screenSub}>
            Enter your email and we'll send you a new temporary password.
          </Text>

          {forgotMsg ? (
            <FeedbackBanner type="success" msg={forgotMsg} />
          ) : (
            <>
              <Text style={styles.fieldLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="jane@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                editable={!forgotLoading}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, forgotLoading && styles.btnDisabled]}
                onPress={handleForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>📧 Send Reset Email</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeaturePill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.featurePill}>
      <Text style={styles.featurePillIcon}>{icon}</Text>
      <Text style={styles.featurePillLabel}>{label}</Text>
    </View>
  );
}

function Divider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or use email & password</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function FeedbackBanner({ type, msg }: { type: 'error' | 'success'; msg: string }) {
  return (
    <View style={type === 'error' ? styles.errorBanner : styles.successBanner}>
      <Text style={type === 'error' ? styles.errorBannerText : styles.successBannerText}>{msg}</Text>
    </View>
  );
}

function SSOButtons({
  googleLoading, appleLoading, anyLoading, onGoogle, onApple,
}: {
  googleLoading: boolean; appleLoading: boolean; anyLoading: boolean;
  onGoogle: () => void; onApple: () => void;
}) {
  return (
    <View style={styles.ssoBlock}>
      <TouchableOpacity
        style={[styles.ssoBtn, anyLoading && styles.btnDisabled]}
        onPress={onGoogle}
        disabled={anyLoading}
      >
        {googleLoading
          ? <ActivityIndicator color="#222" />
          : (
            <>
              <Text style={styles.ssoBtnIcon}>G</Text>
              <Text style={styles.ssoBtnText}>Continue with Google</Text>
            </>
          )}
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={[styles.appleBtn, anyLoading && styles.btnDisabled]}
          onPress={onApple}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const GREEN = '#2e7d32';
const GREEN_DARK = '#1b5e20';
const GREEN_LIGHT = '#f0faf0';

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },

  // ── Welcome screen ──────────────────────────────────────────────────────
  hero: {
    flex: 1,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
  },
  heroBall: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  heroBallText: { fontSize: 52 },
  heroTitle: {
    fontSize: 38, fontWeight: '800', color: '#fff',
    letterSpacing: -0.5, marginBottom: 8,
  },
  heroSub: {
    fontSize: 16, color: 'rgba(255,255,255,0.85)',
    textAlign: 'center', lineHeight: 22, marginBottom: 28,
  },
  heroFeatureRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  featurePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  featurePillIcon: { fontSize: 13 },
  featurePillLabel: { fontSize: 12, color: '#fff', fontWeight: '600' },

  heroBottom: {
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    gap: 12,
  },
  welcomeNote: {
    fontSize: 12, color: '#aaa', textAlign: 'center',
    marginTop: 4,
  },

  // ── Shared form layout ────────────────────────────────────────────────────
  formScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    backgroundColor: '#fff',
  },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start', marginBottom: 4 },
  backBtnText: { color: GREEN, fontSize: 15, fontWeight: '600' },

  screenTitle: {
    fontSize: 28, fontWeight: '800', color: '#111',
    marginBottom: 4, marginTop: 8,
    letterSpacing: -0.3,
  },
  screenSub: {
    fontSize: 14, color: '#777', lineHeight: 20, marginBottom: 24,
  },

  // ── Role selection ────────────────────────────────────────────────────────
  bigRoleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 2, borderColor: '#e5e7eb',
    borderRadius: 16, padding: 18,
    marginBottom: 14, backgroundColor: '#fafafa',
  },
  bigRoleCardActive: {
    borderColor: GREEN, backgroundColor: GREEN_LIGHT,
  },
  bigRoleIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center',
  },
  bigRoleIconActive: { backgroundColor: '#c8e6c9' },
  bigRoleEmoji: { fontSize: 28 },
  bigRoleText: { flex: 1 },
  bigRoleTitle: {
    fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 3,
  },
  bigRoleTitleActive: { color: GREEN_DARK },
  bigRoleDesc: { fontSize: 13, color: '#888', lineHeight: 18 },
  bigRoleCheck: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center',
  },
  bigRoleCheckActive: { borderColor: GREEN, backgroundColor: GREEN },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '800' },

  roleBadgeRow: { alignItems: 'flex-start', marginBottom: 6 },
  roleBadge: {
    backgroundColor: GREEN_LIGHT, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: '#c8e6c9',
    marginBottom: 4,
  },
  roleBadgeText: { fontSize: 13, color: GREEN_DARK, fontWeight: '600' },

  // ── Login logo ───────────────────────────────────────────────────────────
  loginLogoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  loginLogo: { fontSize: 26 },
  loginLogoTitle: { fontSize: 22, fontWeight: '800', color: GREEN },

  // ── SSO ──────────────────────────────────────────────────────────────────
  ssoBlock: { gap: 10, marginTop: 8 },
  ssoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12,
    paddingVertical: 14, backgroundColor: '#fff',
  },
  ssoBtnIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#4285f4',
    textAlign: 'center', lineHeight: 22,
    color: '#fff', fontSize: 13, fontWeight: '800',
    overflow: 'hidden',
  },
  ssoBtnText: { color: '#222', fontSize: 15, fontWeight: '600' },
  appleBtn: { height: 52, width: '100%' },

  // ── Divider ───────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { color: '#aaa', fontSize: 12, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 16 },

  // ── Form inputs ───────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: '#444',
    marginBottom: 6, marginTop: 14,
  },
  req: { color: '#dc2626' },
  input: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#111', backgroundColor: '#fafafa',
  },

  // Gender chips
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  genderChip: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fafafa',
  },
  genderChipActive: { borderColor: GREEN, backgroundColor: GREEN_LIGHT },
  genderChipText: { fontSize: 13, color: '#555' },
  genderChipTextActive: { color: GREEN_DARK, fontWeight: '600' },

  // ── Buttons ───────────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 2, borderColor: GREEN, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  secondaryBtnText: { color: GREEN, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },

  switchLink: { alignItems: 'center', marginTop: 16, paddingVertical: 4 },
  switchLinkText: { fontSize: 14, color: '#888', textAlign: 'center' },
  switchLinkBold: { color: GREEN, fontWeight: '700' },

  // ── Feedback banners ─────────────────────────────────────────────────────
  errorBanner: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 10, padding: 12, marginBottom: 4,
  },
  errorBannerText: { color: '#b91c1c', fontSize: 13, lineHeight: 18 },
  successBanner: {
    backgroundColor: GREEN_LIGHT, borderWidth: 1, borderColor: '#86efac',
    borderRadius: 10, padding: 12, marginBottom: 4,
  },
  successBannerText: { color: '#166534', fontSize: 13, lineHeight: 18 },

  // ── EULA screen ──────────────────────────────────────────────────────────
  eulaBox: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    backgroundColor: '#fafafa', marginBottom: 16,
    maxHeight: 320,
  },
  eulaScroll: { padding: 14 },
  eulaHeading: {
    fontSize: 15, fontWeight: '700', color: '#111',
    marginBottom: 2,
  },
  eulaDate: { fontSize: 11, color: '#aaa', marginBottom: 12 },
  eulaSection: {
    fontSize: 13, fontWeight: '700', color: '#333',
    marginTop: 12, marginBottom: 3,
  },
  eulaBody: { fontSize: 12, color: '#555', lineHeight: 18 },
  eulaCheckRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4,
  },
  eulaCheckbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  eulaCheckboxActive: { borderColor: GREEN, backgroundColor: GREEN },
  eulaCheckMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  eulaCheckLabel: { flex: 1, fontSize: 13, color: '#444', lineHeight: 19 },
  eulaLink: { color: GREEN, fontWeight: '600' },
});
