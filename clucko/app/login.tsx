import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useDarkMode();
  const { notify } = useNotifications();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);

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
    setLoginError('');
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
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setLoginError('Please enter your email address.');
      triggerShake();
      emailInputRef.current?.focus();
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setLoginError('Please enter a valid email address.');
      triggerShake();
      return;
    }
    if (!password) {
      setLoginError('Please enter your password.');
      triggerShake();
      return;
    }

    setLoading(true);
    setLoginError('');
    try {
      await apiLogin(cleanEmail, password);
      // Remember email for subsequent logins
      await AsyncStorage.setItem('last_login_email', cleanEmail);
      
      notify({
        title: 'Welcome Back!',
        message: 'Successfully logged in to your account.',
        type: 'success',
      });
      router.replace('/(tabs)/home');
    } catch (err: any) {
      triggerShake();
      const rawMsg = err?.message || '';
      if (rawMsg.toLowerCase().includes('invalid') || rawMsg.toLowerCase().includes('credentials') || rawMsg.toLowerCase().includes('password')) {
        setLoginError('Incorrect email or password. Please verify your credentials or reset your password.');
      } else if (rawMsg.toLowerCase().includes('network') || rawMsg.toLowerCase().includes('connection') || rawMsg.toLowerCase().includes('fetch')) {
        setLoginError('Unable to reach server. Please check your internet connection or server settings.');
      } else {
        setLoginError(rawMsg || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    try {
      const res = await performGoogleSignIn();
      if (res.success) {
        notify({
          title: 'Welcome!',
          message: `Signed in successfully as ${res.user?.first_name || 'Google User'}.`,
          type: 'success',
        });
        router.replace('/(tabs)/home');
      } else if (res.isNotConfigured) {
        notify({
          title: 'Google Client ID Required',
          message: res.error || 'Please configure your Google Web Client ID in config/googleAuth.ts to connect real Google accounts.',
          type: 'warning',
        });
      } else if (res.error && res.error !== 'Sign in was cancelled.') {
        notify({
          title: 'Google Sign-In Failed',
          message: res.error,
          type: 'alert',
        });
      }
    } catch (err: any) {
      notify({
        title: 'Sign-In Error',
        message: err.message || 'Could not complete Google Sign-In.',
        type: 'alert',
      });
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
            <View style={[styles.logoCircle, { backgroundColor: isDarkMode ? '#1E3821' : '#E8F5E9' }]}>
              <Image source={require('../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={[styles.welcomeTitle, { color: isDarkMode ? '#FFFFFF' : '#1B5E20' }]}>Welcome Back</Text>
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
                { backgroundColor: isDarkMode ? '#242424' : '#FFFFFF', borderColor: isDarkMode ? '#404040' : '#E0E0E0' },
              ]}
              onPress={handleGoogleAuth}
              activeOpacity={0.8}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#2E7D32" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color="#EA4335" style={styles.socialIcon} />
                  <Text style={[styles.socialButtonText, { color: isDarkMode ? '#FFFFFF' : '#333333' }]}>
                    Continue with Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? '#333333' : '#E5E7EB' }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or continue with email</Text>
            <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? '#333333' : '#E5E7EB' }]} />
          </View>

          {/* Failure Alert / Error Card */}
          {loginError ? (
            <Animated.View
              style={[
                styles.errorCard,
                { transform: [{ translateX: shakeAnim }] },
                { backgroundColor: isDarkMode ? '#3E1C1C' : '#FFEBEE', borderColor: '#EF5350' },
              ]}
            >
              <Ionicons name="alert-circle" size={22} color="#D32F2F" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorCardTitle}>Sign In Failed</Text>
                <Text style={styles.errorCardBody}>{loginError}</Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/forgot-password',
                      params: { email: email.trim().toLowerCase() },
                    })
                  }
                  style={styles.errorCardAction}
                >
                  <Text style={styles.errorCardActionText}>Forgot your password? Reset it here →</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : null}

          {/* Form Fields */}
          <View style={styles.formContainer}>
            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                Email Address <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
                    borderColor: emailTouched && !isEmailValid && email.length > 0 ? '#E53935' : isEmailValid ? '#2E7D32' : isDarkMode ? '#333' : '#E0E0E0',
                  },
                ]}
              >
                <Ionicons name="mail-outline" size={20} color={isEmailValid ? '#2E7D32' : '#9CA3AF'} style={styles.inputLeadingIcon} />
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
                  <Ionicons name="checkmark-circle" size={20} color="#2E7D32" style={styles.inputTrailingIcon} />
                ) : null}
              </View>

              {/* Email Typo Suggestion Chip */}
              {suggestedEmail ? (
                <TouchableOpacity style={styles.suggestionChip} onPress={applyEmailSuggestion} activeOpacity={0.7}>
                  <Feather name="help-circle" size={14} color="#2E7D32" />
                  <Text style={styles.suggestionText}>
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
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
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
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
                    borderColor: isDarkMode ? '#333' : '#E0E0E0',
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputLeadingIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Enter your password"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    setLoginError('');
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
                  <Ionicons name={showPw ? 'eye-outline' : 'eye-off-outline'} size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Caps Lock Warning */}
              {capsLockOn ? (
                <View style={styles.capsLockBadge}>
                  <Ionicons name="warning-outline" size={14} color="#D97706" />
                  <Text style={styles.capsLockText}>Caps Lock is ON</Text>
                </View>
              ) : null}
            </View>

            {/* Primary Sign In CTA */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { opacity: loading ? 0.8 : 1 },
              ]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryButtonText}>Signing In...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Continue as Guest */}
            <TouchableOpacity
              style={[
                styles.guestButton,
                { borderColor: isDarkMode ? '#405B43' : '#A5D6A7', backgroundColor: isDarkMode ? '#172719' : '#F1F8E9' },
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
              <Ionicons name="person-outline" size={18} color="#2E7D32" />
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
            </TouchableOpacity>
          </View>

          {/* Footer - Switch to Signup */}
          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signup')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.signupLinkText}>Create an Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  logoCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#4CAF50',
    elevation: 3,
    shadowColor: '#2E7D32',
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
    color: '#2E7D32',
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
    color: '#2E7D32',
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
    backgroundColor: '#E8F5E9',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
    gap: 6,
  },
  suggestionText: {
    fontSize: 12,
    color: '#2E7D32',
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
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#2E7D32',
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
    color: '#FFFFFF',
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
    color: '#2E7D32',
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
    color: '#2E7D32',
  },
});