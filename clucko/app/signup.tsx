import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { apiSignup } from '../lib/api';
import {
  evaluatePasswordStrength,
  formatPhoneNumber,
  isValidEmail,
  PASSWORD_RULES,
  suggestEmailTypo,
} from '../utils/authValidation';
import { performGoogleSignIn } from '../utils/googleAuth';

const { width } = Dimensions.get('window');

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useDarkMode();
  const { notify } = useNotifications();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    farm_name: '',
    password: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Field touch tracking
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  // Suggestions & Error states
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [conflictModalVisible, setConflictModalVisible] = useState(false);

  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const setField = (key: string, val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
    setFormError('');
  };

  const handleEmailChange = (val: string) => {
    setField('email', val);
    if (val.trim()) {
      const suggestion = suggestEmailTypo(val);
      setSuggestedEmail(suggestion);
    } else {
      setSuggestedEmail(null);
    }
  };

  const applyEmailSuggestion = () => {
    if (suggestedEmail) {
      setField('email', suggestedEmail);
      setSuggestedEmail(null);
      setEmailTouched(true);
    }
  };

  const handlePhoneChange = (val: string) => {
    const formatted = formatPhoneNumber(val);
    setField('phone_number', formatted);
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent) {
      if (typeof e.nativeEvent.getModifierState === 'function') {
        setCapsLockOn(e.nativeEvent.getModifierState('CapsLock'));
      }
    }
  };

  // Password calculations
  const pwStrength = evaluatePasswordStrength(form.password);
  const isEmailValid = isValidEmail(form.email);
  const isPasswordMatch =
    form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const isPasswordMismatch =
    confirmTouched && form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  const handleSignup = async () => {
    // 1. Validation checks
    if (!form.first_name.trim()) {
      setFormError('Please enter your first name.');
      triggerShake();
      firstNameRef.current?.focus();
      return;
    }
    if (!form.last_name.trim()) {
      setFormError('Please enter your last name.');
      triggerShake();
      lastNameRef.current?.focus();
      return;
    }
    const cleanEmail = form.email.trim().toLowerCase();
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setFormError('Please enter a valid email address.');
      triggerShake();
      emailRef.current?.focus();
      return;
    }
    if (!form.password) {
      setFormError('Please create a secure password.');
      triggerShake();
      passwordRef.current?.focus();
      return;
    }
    if (pwStrength.passedCount < 3) {
      setFormError('Password is too weak. Please meet at least 3 of the security criteria below.');
      triggerShake();
      passwordRef.current?.focus();
      return;
    }
    if (form.password !== form.confirmPassword) {
      setFormError('Passwords do not match. Please verify and re-type.');
      triggerShake();
      confirmRef.current?.focus();
      return;
    }

    setLoading(true);
    setFormError('');
    try {
      await apiSignup({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: cleanEmail,
        password: form.password,
        phone_number: form.phone_number.trim(),
        farm_name: form.farm_name.trim() || `${form.first_name.trim()}'s Farm`,
      });

      notify({
        title: 'Account Created!',
        message: `Welcome to Clucko, ${form.first_name.trim()}! Your farm dashboard is ready.`,
        type: 'success',
      });

      router.replace('/(tabs)/home');
    } catch (err: any) {
      triggerShake();
      const rawMsg = err?.message || '';
      if (
        rawMsg.toLowerCase().includes('already registered') ||
        rawMsg.toLowerCase().includes('already exists') ||
        rawMsg.toLowerCase().includes('taken')
      ) {
        // Smart Account Conflict Handling
        setConflictModalVisible(true);
      } else {
        setFormError(rawMsg || 'Signup failed. Please try again.');
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
          title: 'Account Ready!',
          message: `Welcome to Clucko, ${res.user?.first_name || 'Google User'}! Your farm is created.`,
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
          title: 'Google Sign-Up Failed',
          message: res.error,
          type: 'alert',
        });
      }
    } catch (err: any) {
      notify({
        title: 'Sign-Up Error',
        message: err.message || 'Could not complete Google Sign-Up.',
        type: 'alert',
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? colors.background : '#FAFAFA', paddingTop: insets.top },
      ]}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar Navigation */}
          <View style={styles.topNavRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
              <Text style={[styles.backText, { color: colors.primary }]}>Back to Login</Text>
            </TouchableOpacity>
            <View style={[styles.badgePill, { backgroundColor: isDarkMode ? '#1E3821' : '#E8F5E9' }]}>
              <Ionicons name="flash-outline" size={13} color="#2E7D32" />
              <Text style={styles.badgePillText}>30s Fast Setup</Text>
            </View>
          </View>

          {/* Header Title */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : '#1B5E20' }]}>Create Your Account</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Join Clucko to protect your flock with AI disease detection
            </Text>
          </View>

          {/* Social Sign-Up Quick Action (Google) */}
          <View style={styles.socialContainer}>
            <TouchableOpacity
              style={[
                styles.socialButton,
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
                    Sign up with Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? '#333333' : '#E5E7EB' }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or register with details</Text>
            <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? '#333333' : '#E5E7EB' }]} />
          </View>

          {/* Form Error Banner */}
          {formError ? (
            <Animated.View
              style={[
                styles.errorBanner,
                { transform: [{ translateX: shakeAnim }] },
                { backgroundColor: isDarkMode ? '#3E1C1C' : '#FFEBEE', borderColor: '#EF5350' },
              ]}
            >
              <Ionicons name="alert-circle" size={20} color="#D32F2F" style={{ marginRight: 8 }} />
              <Text style={styles.errorBannerText}>{formError}</Text>
            </Animated.View>
          ) : null}

          {/* Section 1: Name Information */}
          <View style={styles.sectionContainer}>
            <View style={styles.sideBySideRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                  First Name <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', borderColor: isDarkMode ? '#333' : '#E0E0E0' },
                  ]}
                >
                  <TextInput
                    ref={firstNameRef}
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Juan"
                    placeholderTextColor="#9CA3AF"
                    value={form.first_name}
                    onChangeText={(v) => setField('first_name', v)}
                    autoCapitalize="words"
                    autoFocus={true}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                  Last Name <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', borderColor: isDarkMode ? '#333' : '#E0E0E0' },
                  ]}
                >
                  <TextInput
                    ref={lastNameRef}
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Dela Cruz"
                    placeholderTextColor="#9CA3AF"
                    value={form.last_name}
                    onChangeText={(v) => setField('last_name', v)}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </View>

            {/* Email Address */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                Email Address <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
                    borderColor:
                      emailTouched && !isEmailValid && form.email.length > 0
                        ? '#E53935'
                        : isEmailValid
                        ? '#2E7D32'
                        : isDarkMode
                        ? '#333'
                        : '#E0E0E0',
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={isEmailValid ? '#2E7D32' : '#9CA3AF'}
                  style={styles.inputLeadingIcon}
                />
                <TextInput
                  ref={emailRef}
                  style={[styles.input, { color: colors.text }]}
                  placeholder="juan@example.com"
                  placeholderTextColor="#9CA3AF"
                  value={form.email}
                  onChangeText={handleEmailChange}
                  onBlur={() => setEmailTouched(true)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                />
                {isEmailValid ? (
                  <Ionicons name="checkmark-circle" size={20} color="#2E7D32" style={styles.inputTrailingIcon} />
                ) : null}
              </View>

              {/* Typo Suggestion */}
              {suggestedEmail ? (
                <TouchableOpacity style={styles.suggestionChip} onPress={applyEmailSuggestion} activeOpacity={0.7}>
                  <Feather name="help-circle" size={14} color="#2E7D32" />
                  <Text style={styles.suggestionText}>
                    Did you mean <Text style={styles.suggestionBold}>{suggestedEmail}</Text>? Tap to fix
                  </Text>
                </TouchableOpacity>
              ) : null}

              {emailTouched && !isEmailValid && form.email.length > 0 ? (
                <Text style={styles.inlineErrorText}>Please enter a valid email address.</Text>
              ) : null}
            </View>

            {/* Phone Number */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                Mobile Number <Text style={styles.optionalText}>(Optional)</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', borderColor: isDarkMode ? '#333' : '#E0E0E0' },
                ]}
              >
                <Ionicons name="call-outline" size={19} color="#9CA3AF" style={styles.inputLeadingIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="+63 917 123 4567 or 0917..."
                  placeholderTextColor="#9CA3AF"
                  value={form.phone_number}
                  onChangeText={handlePhoneChange}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            {/* Farm Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                Farm Name <Text style={styles.optionalText}>(Optional)</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', borderColor: isDarkMode ? '#333' : '#E0E0E0' },
                ]}
              >
                <Ionicons name="home-outline" size={19} color="#9CA3AF" style={styles.inputLeadingIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder={
                    form.first_name.trim()
                      ? `${form.first_name.trim()}'s Gamefowl Farm`
                      : 'e.g. Davao Champion Farm'
                  }
                  placeholderTextColor="#9CA3AF"
                  value={form.farm_name}
                  onChangeText={(v) => setField('farm_name', v)}
                />
              </View>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Leave blank to automatically name it &quot;{form.first_name.trim() ? `${form.first_name.trim()}'s Farm` : "User's Farm"}&quot;
              </Text>
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                Password <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
                    borderColor:
                      passwordTouched && pwStrength.score === 1
                        ? '#E53935'
                        : pwStrength.score === 3
                        ? '#2E7D32'
                        : isDarkMode
                        ? '#333'
                        : '#E0E0E0',
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputLeadingIcon} />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Create a strong password"
                  placeholderTextColor="#9CA3AF"
                  value={form.password}
                  onChangeText={(v) => setField('password', v)}
                  onBlur={() => setPasswordTouched(true)}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
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

              {/* Dynamic Password Strength Bar */}
              {form.password.length > 0 ? (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthHeader}>
                    <Text style={[styles.strengthLabel, { color: colors.textSecondary }]}>Password Strength:</Text>
                    <Text style={[styles.strengthValue, { color: pwStrength.color }]}>{pwStrength.label}</Text>
                  </View>
                  <View style={styles.strengthBarBackground}>
                    <View
                      style={[
                        styles.strengthBarFill,
                        {
                          width: `${(pwStrength.passedCount / pwStrength.totalCount) * 100}%`,
                          backgroundColor: pwStrength.color,
                        },
                      ]}
                    />
                  </View>

                  {/* 5-Rule Interactive Checklist */}
                  <View style={styles.rulesList}>
                    {PASSWORD_RULES.map((rule) => {
                      const isPassed = pwStrength.passedIds.includes(rule.id);
                      return (
                        <View key={rule.id} style={styles.ruleItem}>
                          <Ionicons
                            name={isPassed ? 'checkmark-circle' : 'ellipse-outline'}
                            size={16}
                            color={isPassed ? '#2E7D32' : '#9CA3AF'}
                          />
                          <Text
                            style={[
                              styles.ruleText,
                              {
                                color: isPassed ? (isDarkMode ? '#A5D6A7' : '#1B5E20') : colors.textSecondary,
                                fontWeight: isPassed ? '600' : '400',
                              },
                            ]}
                          >
                            {rule.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Confirm Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#E0E0E0' : '#374151' }]}>
                Confirm Password <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
                    borderColor: isPasswordMismatch
                      ? '#E53935'
                      : isPasswordMatch
                      ? '#2E7D32'
                      : isDarkMode
                      ? '#333'
                      : '#E0E0E0',
                  },
                ]}
              >
                <Ionicons name="shield-checkmark-outline" size={20} color="#9CA3AF" style={styles.inputLeadingIcon} />
                <TextInput
                  ref={confirmRef}
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#9CA3AF"
                  value={form.confirmPassword}
                  onChangeText={(v) => setField('confirmPassword', v)}
                  onBlur={() => setConfirmTouched(true)}
                  secureTextEntry={!showConfirmPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
                {isPasswordMatch ? (
                  <Ionicons name="checkmark-circle" size={20} color="#2E7D32" style={styles.inputTrailingIcon} />
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowConfirmPw(!showConfirmPw)}
                    style={styles.eyeButton}
                    accessibilityLabel={showConfirmPw ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons name={showConfirmPw ? 'eye-outline' : 'eye-off-outline'} size={20} color="#6B7280" />
                  </TouchableOpacity>
                )}
              </View>

              {isPasswordMismatch ? (
                <Text style={styles.inlineErrorText}>Passwords do not match.</Text>
              ) : null}
            </View>

            {/* Terms and Conditions Note */}
            <Text style={[styles.termsNote, { color: colors.textSecondary }]}>
              By tapping Create Account, you agree to Clucko&apos;s{' '}
              <Text
                style={{ color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' }}
                onPress={() => setShowTermsModal(true)}
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                style={{ color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' }}
                onPress={() => setShowPrivacyModal(true)}
              >
                Privacy Policy
              </Text>.
            </Text>

            {/* Primary Submit CTA */}
            <TouchableOpacity
              style={[styles.primaryButton, { opacity: loading ? 0.8 : 1 }]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryButtonText}>Creating Account...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer - Switch to Login */}
          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.loginLinkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Smart Account Conflict Modal (If Email Already Registered) */}
      <Modal visible={conflictModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', borderColor: isDarkMode ? '#333' : '#E0E0E0' },
            ]}
          >
            <View style={styles.modalIconCircle}>
              <Ionicons name="person-circle-outline" size={38} color="#2E7D32" />
            </View>

            <Text style={[styles.modalTitle, { color: isDarkMode ? '#FFFFFF' : '#1B5E20' }]}>
              Account Already Exists
            </Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              An account with <Text style={{ fontWeight: '700', color: colors.text }}>{form.email}</Text> is
              already registered on Clucko. Would you like to sign in instead?
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={() => {
                  setConflictModalVisible(false);
                  router.push('/login');
                }}
              >
                <Text style={styles.modalPrimaryBtnText}>Sign In to Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSecondaryBtn,
                  { borderColor: isDarkMode ? '#444' : '#E0E0E0' },
                ]}
                onPress={() => {
                  setConflictModalVisible(false);
                  router.push({
                    pathname: '/forgot-password',
                    params: { email: form.email.trim().toLowerCase() },
                  });
                }}
              >
                <Text style={[styles.modalSecondaryBtnText, { color: colors.primary }]}>Reset Password</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setConflictModalVisible(false)}
              >
                <Text style={[styles.modalCancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Terms of Service Popup Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={showTermsModal}
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.legalModalCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
            <View style={[styles.legalModalHeader, { borderBottomColor: colors.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="document-text" size={22} color={colors.primary} />
                <Text style={[styles.legalModalTitle, { color: colors.text }]}>Terms of Service</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTermsModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.legalModalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.legalEffectiveDate, { color: colors.textLight }]}>Last Updated: September 2026</Text>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>1. Acceptance of Terms</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  By creating an account or accessing the Clucko Gamefowl Disease Detector application, you agree to comply with and be bound by these Terms of Service. If you do not agree with any portion of these terms, do not register or use the application.
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>2. AI Disease Screening & Veterinary Disclaimer</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  Clucko provides artificial intelligence-powered computer vision tools designed to assist in the early screening and identification of potential symptoms for infectious Coryza, Fowl Pox, and Newcastle Disease.{'\n\n'}
                  <Text style={{ fontWeight: '700', color: colors.text }}>IMPORTANT:</Text> Clucko is an auxiliary early-warning tool and does NOT provide definitive veterinary or medical diagnoses. Diagnostic suggestions must never replace formal examination, laboratory testing, or prescribed therapies from a licensed avian veterinarian.
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>3. Flock Management & Biosecurity Responsibility</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  Users (Farm Owners and Caretakers) are solely responsible for all physical biosecurity measures implemented within their facilities, including prompt quarantine of symptomatic birds, coop sanitization, and compliance with local agricultural and livestock regulations.
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>4. User Accounts & Shared Farm Access</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  You are responsible for safeguarding your login credentials. Farm owners may assign caretakers to specific farms. Caretakers agree to accurately log captures, chicken profiles, and daily health observations. Clucko is not responsible for unauthorized actions performed via shared credentials.
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>5. Limitation of Liability</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  Under no circumstances will Clucko, its developers, or affiliates be liable for any bird mortality, flock infection spread, financial losses, or operational damages resulting from the use or inability to use this detection software.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.legalPrimaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowTermsModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.legalPrimaryBtnText}>I Understand & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Popup Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={showPrivacyModal}
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.legalModalCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
            <View style={[styles.legalModalHeader, { borderBottomColor: colors.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
                <Text style={[styles.legalModalTitle, { color: colors.text }]}>Privacy Policy</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.legalModalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.legalEffectiveDate, { color: colors.textLight }]}>Last Updated: September 2026</Text>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>1. Information We Collect</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  We collect account data (your name, email address, phone number, and account role), farm information (farm name and designated geographic municipality/location), and flock data (chicken identifiers, tags, and capture history).
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>2. Camera & Image Data Processing</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  Images captured through the camera or selected from your gallery are transmitted securely to our neural network service strictly for real-time symptom detection and health timeline logging. We do not sell or publicize your poultry photos.
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>3. Farm Scoping & Access Controls</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  Flock health data, activity logs, and disease alerts are scoped exclusively to authorized members of your specific farm. Caretakers assigned to Farm A cannot view notifications or bird records from other farms.
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>4. Data Security & Storage</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  Passwords are cryptographic one-way salted hashes, and API requests utilize industry-standard token authentication. Farm records and health history are safely stored in secure relational databases.
                </Text>
              </View>

              <View style={styles.legalSection}>
                <Text style={[styles.legalSectionHeading, { color: colors.text }]}>5. User Rights & Data Deletion</Text>
                <Text style={[styles.legalSectionText, { color: colors.textSecondary }]}>
                  You may update or delete chicken profiles, manage farm memberships, or request complete account erasure at any time by contacting our administrator support.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.legalPrimaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowPrivacyModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.legalPrimaryBtnText}>I Understand & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingTop: 14,
  },
  topNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 5,
  },
  badgePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2E7D32',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#D32F2F',
    fontWeight: '600',
    flex: 1,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sideBySideRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
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
  optionalText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9CA3AF',
  },
  helperText: {
    fontSize: 11,
    marginTop: 4,
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
  strengthContainer: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  strengthValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  strengthBarBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 10,
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  rulesList: {
    gap: 6,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleText: {
    fontSize: 12,
  },
  termsNote: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 14,
  },
  loginLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 8,
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalActions: {
    width: '100%',
    gap: 10,
  },
  modalPrimaryBtn: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalCancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  legalModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  legalModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  legalModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  legalModalBody: {
    paddingVertical: 12,
    maxHeight: 380,
  },
  legalEffectiveDate: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legalSection: {
    marginBottom: 14,
  },
  legalSectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  legalSectionText: {
    fontSize: 12,
    lineHeight: 18,
  },
  legalPrimaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  legalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});