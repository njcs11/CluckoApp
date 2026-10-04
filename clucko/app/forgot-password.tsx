import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
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
import PasswordStrengthMeter, {
    isPasswordStrongEnough,
    passwordRequirementMessage,
} from '../components/ui/PasswordStrengthMeter';
import { useDarkMode } from '../context/DarkModeContext';
import { apiCheckEmailExists, apiResetPassword } from '../lib/api';
import { sendResetCodeEmail } from '../utils/email';

const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEMO_EMAIL = 'demo@clucko.com';

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useDarkMode();
  const params = useLocalSearchParams<{ email?: string }>();

  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Step 1 — email
  const [email, setEmail] = useState(params.email || '');
  const [emailError, setEmailError] = useState('');
  const [targetEmail, setTargetEmail] = useState('');

  // Step 2 — code + new password
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (emailError) setEmailError('');
  };

  const handleBack = useCallback(() => {
    if (step === 'reset') {
      setStep('email');
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/login');
    }
  }, [step]);

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [handleBack]);

  // Generates a code, stores it locally (so we can verify it later), and
  // emails it via EmailJS / backend directly to the user's Gmail inbox.
  const issueAndSendCode = async (normalizedEmail: string): Promise<boolean> => {
    const newCode = generateCode();
    await AsyncStorage.setItem(
      'passwordResetCode',
      JSON.stringify({ code: newCode, email: normalizedEmail, expiresAt: Date.now() + RESET_CODE_TTL_MS })
    );
    const sent = await sendResetCodeEmail(normalizedEmail, newCode);
    if (!sent) {
      Alert.alert(
        'Email Sending Failed',
        'Could not send the verification code to your email. Please check your internet connection or email address and try again.'
      );
      return false;
    }
    return true;
  };

  // Step 1: confirm this email actually belongs to an account in the database
  // or local demo account, then issue the verification code.
  const handleSendCode = async () => {
    setEmailError('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setEmailError('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      let matches = false;

      // Check backend database first
      const checkRes = await apiCheckEmailExists(normalizedEmail);
      if (checkRes && checkRes.exists) {
        matches = true;
      } else {
        // Fallback to local storage or demo email
        const userDataString = await AsyncStorage.getItem('userData');
        if (userDataString) {
          try {
            const userData = JSON.parse(userDataString);
            matches = userData.email?.toLowerCase() === normalizedEmail;
          } catch (_) {}
        }
        if (!matches) {
          matches = normalizedEmail === DEMO_EMAIL;
        }
      }

      if (!matches) {
        setLoading(false);
        setEmailError('No account found with this email. Please check and try again.');
        return;
      }

      const sentOk = await issueAndSendCode(normalizedEmail);
      setLoading(false);

      if (!sentOk) {
        return;
      }

      setTargetEmail(normalizedEmail);
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      setConfirmError('');
      setCodeError('');
      setStep('reset');
    } catch (error) {
      console.error('Error sending reset code:', error);
      setLoading(false);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      const sentOk = await issueAndSendCode(targetEmail);
      setLoading(false);
      if (sentOk) {
        setCode('');
        setCodeError('');
        Alert.alert('Code Sent', `A new verification code was sent to ${targetEmail}. Please check your inbox.`);
      }
    } catch (error) {
      console.error('Error resending reset code:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to resend verification code. Please try again.');
    }
  };

  // Step 2: verify the code, enforce a strong password, then persist it in PostgreSQL and local storage.
  const handleResetPassword = async () => {
    setCodeError('');
    setPasswordError('');
    setConfirmError('');

    let hasError = false;

    if (!code.trim()) {
      setCodeError('Please enter the code');
      hasError = true;
    }
    if (!newPassword) {
      setPasswordError('Please enter a new password');
      hasError = true;
    } else if (!isPasswordStrongEnough(newPassword)) {
      setPasswordError(passwordRequirementMessage());
      hasError = true;
    }
    if (!confirmPassword) {
      setConfirmError('Please confirm your new password');
      hasError = true;
    } else if (newPassword && confirmPassword !== newPassword) {
      setConfirmError('Passwords do not match');
      hasError = true;
    }
    if (hasError) return;

    setLoading(true);
    try {
      const storedCodeString = await AsyncStorage.getItem('passwordResetCode');
      if (!storedCodeString) {
        setLoading(false);
        setCodeError('This code has expired. Please request a new one.');
        return;
      }

      const stored = JSON.parse(storedCodeString);
      if (Date.now() > stored.expiresAt) {
        await AsyncStorage.removeItem('passwordResetCode');
        setLoading(false);
        setCodeError('This code has expired. Please request a new one.');
        return;
      }
      if (stored.email !== targetEmail || stored.code !== code.trim()) {
        setLoading(false);
        setCodeError('Incorrect code. Please check and try again.');
        return;
      }

      // Update password in PostgreSQL backend
      try {
        await apiResetPassword(targetEmail, newPassword, code.trim());
      } catch (apiErr: any) {
        console.warn('Backend reset password error (fallback to local if demo):', apiErr);
        if (targetEmail !== DEMO_EMAIL) {
          setLoading(false);
          Alert.alert('Reset Failed', apiErr?.message || 'Could not update password on server. Please try again.');
          return;
        }
      }

      // Sync local storage if present
      const userDataString = await AsyncStorage.getItem('userData');
      if (userDataString) {
        try {
          const userData = JSON.parse(userDataString);
          userData.password = newPassword;
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
        } catch (_) {}
      } else {
        await AsyncStorage.setItem(
          'userData',
          JSON.stringify({ fullName: 'User', email: targetEmail, password: newPassword, phone: '' })
        );
      }

      await AsyncStorage.removeItem('passwordResetCode');
      setLoading(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error resetting password:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    }
  };

  const handleProceedToLogin = () => {
    setShowSuccessModal(false);
    router.replace('/login');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
            <Text style={[styles.backButtonText, { color: colors.primary }]}>Back</Text>
          </TouchableOpacity>

          <View style={styles.headerContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBackground }]}>
              <Ionicons name={step === 'email' ? 'key-outline' : 'shield-checkmark-outline'} size={36} color={colors.primary} />
            </View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{step === 'email' ? 'Forgot Password' : 'Reset Password'}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {step === 'email'
                ? "Enter the email on your account and we'll send a reset code."
                : `Enter the code sent to ${targetEmail} and choose a new password.`}
            </Text>
          </View>

          {step === 'email' ? (
            <>
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }, emailError ? styles.inputWrapperError : null]}>
                  <Ionicons name="mail-outline" size={20} color={emailError ? '#e53935' : colors.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Email"
                    placeholderTextColor={colors.textLight}
                    value={email}
                    onChangeText={handleEmailChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={handleSendCode} disabled={loading} activeOpacity={0.85}>
                <View style={[styles.primaryGradient, { backgroundColor: colors.primary }]}>
                  {loading ? <ActivityIndicator color={isDarkMode ? '#0E1210' : '#fff'} /> : <Text style={[styles.primaryButtonText, { color: isDarkMode ? '#0E1210' : '#fff' }]}>Send Reset Code</Text>}
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.sentNoticeCard, { backgroundColor: colors.badgeBackground, borderColor: colors.border }]}>
                <Ionicons name="mail-open-outline" size={18} color={colors.primary} />
                <Text style={[styles.sentNoticeText, { color: colors.text }]}>
                  We emailed a 6-digit code to <Text style={{ fontWeight: '700', color: colors.primary }}>{targetEmail}</Text>. Check your inbox
                  (and spam folder) — it expires in 15 minutes.
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }, codeError ? styles.inputWrapperError : null]}>
                  <Ionicons name="keypad-outline" size={20} color={codeError ? '#e53935' : colors.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="6-digit code"
                    placeholderTextColor={colors.textLight}
                    value={code}
                    onChangeText={(t) => {
                      setCode(t);
                      if (codeError) setCodeError('');
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}
                <TouchableOpacity onPress={handleResendCode} disabled={loading} style={styles.resendButton}>
                  <Text style={[styles.resendText, { color: colors.primary }]}>Didn't get it? Resend code</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }, passwordError ? styles.inputWrapperError : null]}>
                  <Ionicons name="lock-closed-outline" size={20} color={passwordError ? '#e53935' : colors.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="New password"
                    placeholderTextColor={colors.textLight}
                    value={newPassword}
                    onChangeText={(t) => {
                      setNewPassword(t);
                      if (passwordError) setPasswordError('');
                    }}
                    secureTextEntry
                  />
                </View>
                <PasswordStrengthMeter password={newPassword} />
                {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
              </View>

              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }, confirmError ? styles.inputWrapperError : null]}>
                  <Ionicons name="lock-closed-outline" size={20} color={confirmError ? '#e53935' : colors.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.textLight}
                    value={confirmPassword}
                    onChangeText={(t) => {
                      setConfirmPassword(t);
                      if (confirmError) setConfirmError('');
                    }}
                    secureTextEntry
                  />
                </View>
                {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={handleResetPassword} disabled={loading} activeOpacity={0.85}>
                <View style={[styles.primaryGradient, { backgroundColor: colors.primary }]}>
                  {loading ? <ActivityIndicator color={isDarkMode ? '#0E1210' : '#fff'} /> : <Text style={[styles.primaryButtonText, { color: isDarkMode ? '#0E1210' : '#fff' }]}>Reset Password</Text>}
                </View>
              </TouchableOpacity>
            </>
          )}

          <Text style={[styles.footer, { color: colors.textLight }]}>© 2026 Clucko. All rights reserved.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleProceedToLogin}>
        <View style={styles.successOverlay}>
          <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Password Reset!</Text>
            <Text style={[styles.successMessage, { color: colors.textSecondary }]}>Your password has been updated. Please login with your new password.</Text>
            <TouchableOpacity style={[styles.successButton, { backgroundColor: colors.primary }]} onPress={handleProceedToLogin} activeOpacity={0.85}>
              <Text style={[styles.successButtonText, { color: isDarkMode ? '#0E1210' : '#fff' }]}>Proceed to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E1210' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 30 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, alignSelf: 'flex-start', gap: 8, minHeight: 48, minWidth: 48, justifyContent: 'center' },
  backButtonText: { fontSize: 16, color: '#8FE0B0', fontWeight: '500' },

  headerContainer: { alignItems: 'center', marginBottom: 28 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(143, 224, 176, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#8FE0B0', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#A3B5AA', textAlign: 'center', lineHeight: 19, paddingHorizontal: 10 },

  sentNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(143, 224, 176, 0.1)',
    borderWidth: 1,
    borderColor: '#26322B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  sentNoticeText: { flex: 1, fontSize: 12.5, color: '#EBF2EE', lineHeight: 18 },

  inputContainer: { marginBottom: 18 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#26322B',
    borderRadius: 12,
    backgroundColor: '#202824',
    paddingHorizontal: 16,
  },
  inputWrapperError: { borderColor: '#e53935' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#EBF2EE' },
  errorText: { color: '#e53935', fontSize: 12, marginTop: 6, marginLeft: 4 },
  resendButton: { alignSelf: 'flex-end', marginTop: 8 },
  resendText: { fontSize: 12, color: '#8FE0B0', fontWeight: '600' },

  primaryButton: { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 20 },
  primaryGradient: { backgroundColor: '#8FE0B0', paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#0E1210', fontSize: 17, fontWeight: 'bold' },

  footer: { textAlign: 'center', color: '#6C8074', fontSize: 12, marginTop: 10 },

  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successCard: { width: '100%', maxWidth: 360, backgroundColor: '#181E1B', borderRadius: 20, padding: 24, alignItems: 'center' },
  successIconCircle: { marginBottom: 12 },
  successTitle: { fontSize: 20, fontWeight: 'bold', color: '#8FE0B0', marginBottom: 8, textAlign: 'center' },
  successMessage: { fontSize: 14, color: '#A3B5AA', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  successButton: { backgroundColor: '#8FE0B0', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  successButtonText: { color: '#0E1210', fontSize: 16, fontWeight: 'bold' },
});