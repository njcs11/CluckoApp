import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDarkMode } from '../context/DarkModeContext';
import { useNotifications } from '../context/NotificationContext';
import { apiLogin } from '../lib/api';
import { isValidEmail, suggestEmailTypo } from '../utils/authValidation';
import { performGoogleSignIn } from '../utils/googleAuth';

const { width } = Dimensions.get('window');

const simplifyAuthError = (raw: string): string => {
  if (!raw) return 'Sign in failed. Please try again.';
  const lower = raw.toLowerCase();

  if (
    lower.includes('access token') ||
    lower.includes('google response') ||
    lower.includes('google sign-in') ||
    lower.includes('google')
  ) {
    return 'Google sign-in failed. Please try again.';
  }
  if (lower.includes('cancel') || lower.includes('dismiss')) {
    return 'Sign in was cancelled.';
  }
  if (
    lower.includes('invalid') ||
    lower.includes('credential') ||
    lower.includes('password') ||
    lower.includes('not found') ||
    lower.includes('incorrect')
  ) {
    return 'Incorrect email or password.';
  }
  if (lower.includes('deactivat') || lower.includes('no longer assigned')) {
    return 'Account has been deactivated.';
  }
  if (
    lower.includes('network') ||
    lower.includes('connection') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('reach server')
  ) {
    return 'Unable to reach server. Check connection.';
  }
  if (lower.includes('valid email')) {
    return 'Please enter a valid email address.';
  }
  if (lower.includes('enter your password')) {
    return 'Please enter your password.';
  }
  if (lower.includes('config') || lower.includes('client id')) {
    return 'Google Sign-In is not configured.';
  }

  if (raw.length <= 40 && !raw.includes('{') && !raw.includes('Error:')) {
    return raw;
  }
  return 'Sign in failed. Please try again.';
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ toast?: string }>();
  const { colors, isDarkMode, loadDarkModePreference } = useDarkMode();
  const { notify } = useNotifications();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const onShow = (e: any) => {
      const h = e?.endCoordinates?.height || 0;
      setKeyboardHeight(h);
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub1 = Keyboard.addListener('keyboardWillShow', onShow);
    const showSub2 = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub1 = Keyboard.addListener('keyboardWillHide', onHide);
    const hideSub2 = Keyboard.addListener('keyboardDidHide', onHide);

    return () => {
      showSub1.remove();
      showSub2.remove();
      hideSub1.remove();
      hideSub2.remove();
    };
  }, []);

  // Bottom Toast state for Logout Success
  const [showLogoutToast, setShowLogoutToast] = useState(false);
  const toastFadeAnim = useRef(new Animated.Value(0)).current;
  const toastSlideAnim = useRef(new Animated.Value(25)).current;

  // Bottom Toast state for Sign In Errors
  const [errorMessage, setErrorMessage] = useState('');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const errorFadeAnim = useRef(new Animated.Value(0)).current;
  const errorSlideAnim = useRef(new Animated.Value(25)).current;
  const errorToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayErrorToast = (rawMsg: string) => {
    const msg = simplifyAuthError(rawMsg);
    setErrorMessage(msg);
    setShowLogoutToast(false);
    setShowErrorToast(true);

    if (errorToastTimerRef.current) {
      clearTimeout(errorToastTimerRef.current);
    }

    errorFadeAnim.setValue(0);
    errorSlideAnim.setValue(25);

    Animated.parallel([
      Animated.timing(errorFadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(errorSlideAnim, { toValue: 0, friction: 7, tension: 70, useNativeDriver: true }),
    ]).start();

    errorToastTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(errorFadeAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(errorSlideAnim, { toValue: 20, duration: 350, useNativeDriver: true }),
      ]).start(() => setShowErrorToast(false));
    }, 4000);
  };

  useEffect(() => {
    if (params.toast === 'logout_success') {
      setShowLogoutToast(true);
      Animated.parallel([
        Animated.timing(toastFadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(toastSlideAnim, { toValue: 0, friction: 7, tension: 70, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastFadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(toastSlideAnim, { toValue: 20, duration: 400, useNativeDriver: true }),
        ]).start(() => setShowLogoutToast(false));
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [params.toast]);

  const emailInputRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Load last remembered email on mount
  useEffect(() => {
    (async () => {
      try {
        const lastEmail = await AsyncStorage.getItem('last_login_email');
        if (lastEmail) {
          setEmail(lastEmail);
          setEmailTouched(true);
        }
      } catch {
        // Ignore storage errors
      }
    })();
  }, []);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (emailError) setEmailError(false);
    if (showErrorToast) setShowErrorToast(false);
    if (val.trim()) {
      const suggestion = suggestEmailTypo(val);
      setSuggestedEmail(suggestion);
    } else {
      setSuggestedEmail(null);
    }
  };

  const applyEmailSuggestion = () => {
    if (suggestedEmail) {
      setEmail(suggestedEmail);
      if (emailError) setEmailError(false);
      setSuggestedEmail(null);
      setEmailTouched(true);
    }
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent) {
      if (typeof e.nativeEvent.getModifierState === 'function') {
        setCapsLockOn(e.nativeEvent.getModifierState('CapsLock'));
      }
    }
  };

  const handleLogin = async () => {
    setEmailError(false);
    setPasswordError(false);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setEmailError(true);
      displayErrorToast('Please enter your email address.');
      triggerShake();
      emailInputRef.current?.focus();
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setEmailError(true);
      displayErrorToast('Please enter a valid email address.');
      triggerShake();
      return;
    }
    if (!password) {
      setPasswordError(true);
      displayErrorToast('Please enter your password.');
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      const loginRes = await apiLogin(cleanEmail, password);
      // Remember email for subsequent logins
      await AsyncStorage.setItem('last_login_email', cleanEmail);
      if (loginRes?.user?.id) {
        await loadDarkModePreference(String(loginRes.user.id));
      }

      const notif = loginRes?.notification;
      const user = loginRes?.user;
      const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.first_name || 'User';
      const role = (user?.role || 'member').charAt(0).toUpperCase() + (user?.role || 'member').slice(1).toLowerCase();

      notify({
        title: notif?.title || `Welcome Back, ${fullName}!`,
        message: notif?.message || `${fullName} (${role}) logged in.`,
        type: 'info',
        skipBackendSync: true,
      });
      router.replace('/(tabs)/home');
    } catch (err: any) {
      triggerShake();
      const rawMsg = err?.message || '';
      const lower = rawMsg.toLowerCase();
      if (lower.includes('email') && !lower.includes('password')) {
        setEmailError(true);
      } else if (lower.includes('password') && !lower.includes('email')) {
        setPasswordError(true);
      } else {
        // Highlight both fields on general auth error so user clearly sees where the error is
        setEmailError(true);
        setPasswordError(true);
      }
      displayErrorToast(rawMsg || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    try {
      const res = await performGoogleSignIn();
      if (res.success) {
        if (res?.user?.id) {
          await loadDarkModePreference(String(res.user.id));
        }

        const notif = (res as any)?.notification;
        const user = res?.user;
        const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.first_name || 'Google User';
        const role = (user?.role || 'owner').charAt(0).toUpperCase() + (user?.role || 'owner').slice(1).toLowerCase();

        notify({
          title: notif?.title || `Welcome Back, ${fullName}!`,
          message: notif?.message || `${fullName} (${role}) logged in.`,
          type: 'info',
          skipBackendSync: true,
        });
        router.replace('/(tabs)/home');
      } else if (res.error && res.error !== 'Sign in was cancelled.') {
        triggerShake();
        displayErrorToast(res.error);
      }
    } catch (err: any) {
      triggerShake();
      displayErrorToast(err?.message || 'Could not complete Google Sign-In.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const isEmailValid = isValidEmail(email);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? colors.background : '#FAFAFA', paddingTop: insets.top }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header & Logo */}
          <View style={styles.header}>
            {/* Back to Walkthrough */}
            <TouchableOpacity
              style={styles.backToWalkthroughBtn}
              onPress={() => router.replace('/')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={[styles.logoCircle, { backgroundColor: colors.badgeBackground, borderColor: colors.primary, shadowColor: colors.primary }]}>
              <Image source={require('../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={[styles.welcomeTitle, { color: isDarkMode ? '#EBF2EE' : '#131A16' }]}>Welcome Back</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Sign in to manage your flock, scans, and farms
            </Text>
          </View>

          {/* Social Sign-In (Google) */}
          <View style={styles.socialContainer}>
            <TouchableOpacity
              style={[
                styles.socialButton,
                styles.googleButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={handleGoogleAuth}
              activeOpacity={0.8}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color="#EA4335" style={styles.socialIcon} />
                  <Text style={[styles.socialButtonText, { color: colors.text }]}>
                    Continue with Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or continue with email</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Form Fields */}
          <View style={styles.formContainer}>
            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Email Address <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.surface,
                    borderColor:
                      emailError
                        ? '#EF4444'
                        : emailTouched && !isEmailValid && email.length > 0
                        ? '#EF4444'
                        : isEmailValid
                        ? colors.primary
                        : colors.border,
                    borderWidth: (emailError || (emailTouched && !isEmailValid && email.length > 0)) ? 1.5 : 1,
                  },
                ]}
              >
                <Ionicons name="mail-outline" size={20} color={isEmailValid ? colors.primary : colors.textLight} style={styles.inputLeadingIcon} />
                <TextInput
                  ref={emailInputRef}
                  style={[styles.input, { color: colors.text }]}
                  placeholder="name@example.com"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={handleEmailChange}
                  onBlur={() => setEmailTouched(true)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  autoFocus={true}
                />
                {isEmailValid ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.inputTrailingIcon} />
                ) : null}
              </View>

              {/* Email Typo Suggestion Chip */}
              {suggestedEmail ? (
                <TouchableOpacity style={[styles.suggestionChip, { backgroundColor: colors.badgeBackground }]} onPress={applyEmailSuggestion} activeOpacity={0.7}>
                  <Feather name="help-circle" size={14} color={colors.primary} />
                  <Text style={[styles.suggestionText, { color: colors.primary }]}>
                    Did you mean <Text style={styles.suggestionBold}>{suggestedEmail}</Text>? Tap to fix
                  </Text>
                </TouchableOpacity>
              ) : null}

              {emailTouched && !isEmailValid && email.length > 0 ? (
                <Text style={styles.inlineErrorText}>Please enter a valid email address (e.g. user@gmail.com)</Text>
              ) : null}
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <View style={styles.passwordLabelRow}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Password <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/forgot-password',
                      params: { email: email.trim().toLowerCase() },
                    })
                  }
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.surface,
                    borderColor: passwordError ? '#EF4444' : colors.border,
                    borderWidth: passwordError ? 1.5 : 1,
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color={colors.textLight} style={styles.inputLeadingIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textLight}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (passwordError) setPasswordError(false);
                    if (showErrorToast) setShowErrorToast(false);
                  }}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  onKeyPress={handleKeyPress}
                />
                <TouchableOpacity
                  onPress={() => setShowPw(!showPw)}
                  style={styles.eyeButton}
                  accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPw ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textLight} />
                </TouchableOpacity>
              </View>

              {/* Caps Lock Warning */}
              {capsLockOn ? (
                <View style={[styles.capsLockBadge, { backgroundColor: isDarkMode ? '#2D2415' : '#FEF3C7' }]}>
                  <Ionicons name="warning-outline" size={14} color="#FBBF24" />
                  <Text style={[styles.capsLockText, { color: isDarkMode ? '#FBBF24' : '#92400E' }]}>Caps Lock is ON</Text>
                </View>
              ) : null}
            </View>

            {/* Primary Sign In CTA */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                  opacity: loading ? 0.8 : 1,
                },
              ]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator color={isDarkMode ? '#0E1210' : '#FFFFFF'} size="small" />
                  <Text style={[styles.primaryButtonText, { color: isDarkMode ? '#0E1210' : '#FFFFFF' }]}>Signing In...</Text>
                </View>
              ) : (
                <Text style={[styles.primaryButtonText, { color: isDarkMode ? '#0E1210' : '#FFFFFF' }]}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Continue as Guest */}
            <TouchableOpacity
              style={[
                styles.guestButton,
                {
                  borderColor: colors.border,
                  backgroundColor: isDarkMode ? 'rgba(143, 224, 176, 0.08)' : '#E8EFEA',
                },
              ]}
              onPress={async () => {
                await AsyncStorage.setItem('isGuestMode', 'true');
                await AsyncStorage.setItem('isLoggedIn', 'false');
                await AsyncStorage.removeItem('token');
                await AsyncStorage.setItem('pending_welcome_login', 'true');
                router.replace('/(tabs)/home');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={18} color={colors.primary} />
              <Text style={[styles.guestButtonText, { color: colors.primary }]}>Continue as Guest</Text>
            </TouchableOpacity>
          </View>

          {/* Footer - Switch to Signup */}
          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signup')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.signupLinkText, { color: colors.primary }]}>Create an Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Bottom Toast for Logout Success */}
      {showLogoutToast && (
        <Animated.View
          style={[
            styles.bottomToastContainer,
            {
              bottom: keyboardHeight > 0 ? keyboardHeight + 16 : Math.max(insets.bottom, 16) + 12,
              opacity: toastFadeAnim,
              transform: [{ translateY: toastSlideAnim }],
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.bottomToastCard,
              {
                backgroundColor: isDarkMode ? '#1E2922' : '#FFFFFF',
                borderColor: '#10B98135',
              },
            ]}
          >
            <View style={styles.bottomToastIconCircle}>
              <Ionicons name="checkmark" size={16} color="#10B981" />
            </View>
            <Text style={[styles.bottomToastText, { color: isDarkMode ? '#F0FDF4' : '#111827' }]}>
              Logout successful
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Floating Bottom Error Toast */}
      {showErrorToast && (
        <Animated.View
          style={[
            styles.bottomToastContainer,
            {
              bottom: keyboardHeight > 0 ? keyboardHeight + 16 : Math.max(insets.bottom, 16) + 12,
              opacity: errorFadeAnim,
              transform: [{ translateY: errorSlideAnim }],
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.bottomToastCard,
              {
                backgroundColor: isDarkMode ? '#2A1515' : '#FFFFFF',
                borderColor: '#EF535040',
              },
            ]}
          >
            <View style={[styles.bottomToastIconCircle, { backgroundColor: '#EF535018' }]}>
              <Ionicons name="alert-circle" size={16} color="#EF5350" />
            </View>
            <Text style={[styles.bottomToastText, { color: isDarkMode ? '#FFCDD2' : '#B71C1C' }]}>
              {errorMessage}
            </Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
    width: '100%',
  },
  backToWalkthroughBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: 4,
    zIndex: 10,
  },
  logoCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#8FE0B0',
    elevation: 3,
    shadowColor: '#131A16',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  logoImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  socialContainer: {
    gap: 10,
    marginBottom: 20,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  googleButton: {},
  appleButton: {},
  socialIcon: {
    marginRight: 10,
  },
  socialButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  errorCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D32F2F',
    marginBottom: 2,
  },
  errorCardBody: {
    fontSize: 13,
    color: '#B71C1C',
    lineHeight: 18,
    marginBottom: 6,
  },
  errorCardAction: {
    marginTop: 2,
  },
  errorCardActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8FE0B0',
    textDecorationLine: 'underline',
  },
  formContainer: {
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#E53935',
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8FE0B0',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputLeadingIcon: {
    marginRight: 10,
  },
  inputTrailingIcon: {
    marginLeft: 6,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
  },
  eyeButton: {
    padding: 6,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEEAE2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
    gap: 6,
  },
  suggestionText: {
    fontSize: 12,
    color: '#2D5541',
  },
  suggestionBold: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  inlineErrorText: {
    fontSize: 12,
    color: '#E53935',
    marginTop: 4,
  },
  capsLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 6,
    gap: 4,
  },
  capsLockText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#8FE0B0',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#8FE0B0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButtonText: {
    color: '#0E1210',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  guestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  guestButtonText: {
    color: '#8FE0B0',
    fontSize: 14,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 14,
  },
  signupLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8FE0B0',
  },
  bottomToastContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  bottomToastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  bottomToastIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#10B98118',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomToastText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});