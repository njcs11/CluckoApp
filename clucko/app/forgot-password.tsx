import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import { sendResetCodeEmail } from '../utils/email';

const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEMO_EMAIL = 'demo@clucko.com';

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
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

  // Generates a code, stores it locally (so we can verify it later), and
  // emails it via EmailJS to the real inbox.
  const issueAndSendCode = async (normalizedEmail: string): Promise<boolean> => {
    const newCode = generateCode();
    await AsyncStorage.setItem(
      'passwordResetCode',
      JSON.stringify({ code: newCode, email: normalizedEmail, expiresAt: Date.now() + RESET_CODE_TTL_MS })
    );
    return sendResetCodeEmail(normalizedEmail, newCode);
  };

  // Step 1: confirm this email actually belongs to an account, then email
  // the code — mirrors the same lookup login.tsx uses (saved userData,
  // falling back to the built-in demo account).
  const handleSendCode = async () => {
    setEmailError('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setEmailError('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      const userDataString = await AsyncStorage.getItem('userData');
      let matches = false;

      if (userDataString) {
        const userData = JSON.parse(userDataString);
        matches = userData.email === normalizedEmail;
      } else {
        matches = normalizedEmail === DEMO_EMAIL;
      }

      if (!matches) {
        setLoading(false);
        setEmailError('No account found with this email.');
        return;
      }

      const sent = await issueAndSendCode(normalizedEmail);
      setLoading(false);

      if (!sent) {
        setEmailError('Could not send the reset email. Please try again.');
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
      const sent = await issueAndSendCode(targetEmail);
      setLoading(false);
      setCode('');
      setCodeError('');
      if (!sent) {
        Alert.alert('Error', 'Could not resend the email. Please try again.');
      } else {
        Alert.alert('Code Sent', `A new code was sent to ${targetEmail}.`);
      }
    } catch (error) {
      console.error('Error resending reset code:', error);
      setLoading(false);
    }
  };

  // Step 2: verify the code, enforce a strong password, then persist it.
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

      // Persist the new password — update the existing account, or create
      // one (for the built-in demo account, which has no stored record).
      const userDataString = await AsyncStorage.getItem('userData');
      if (userDataString) {
        const userData = JSON.parse(userDataString);
        userData.password = newPassword;
        await AsyncStorage.setItem('userData', JSON.stringify(userData));
      } else {
        await AsyncStorage.setItem(
          'userData',
          JSON.stringify({ fullName: 'Demo User', email: targetEmail, password: newPassword, phone: '' })
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
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={() => (step === 'reset' ? setStep('email') : router.back())} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#2e7d32" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.headerContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name={step === 'email' ? 'key-outline' : 'shield-checkmark-outline'} size={36} color="#2e7d32" />
            </View>
            <Text style={styles.headerTitle}>{step === 'email' ? 'Forgot Password' : 'Reset Password'}</Text>
            <Text style={styles.subtitle}>
              {step === 'email'
                ? "Enter the email on your account and we'll send a reset code."
                : `Enter the code sent to ${targetEmail} and choose a new password.`}
            </Text>
          </View>

          {step === 'email' ? (
            <>
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, emailError ? styles.inputWrapperError : null]}>
                  <Ionicons name="mail-outline" size={20} color={emailError ? '#e53935' : '#999'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={handleEmailChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={handleSendCode} disabled={loading} activeOpacity={0.85}>
                <View style={styles.primaryGradient}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send Reset Code</Text>}
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.sentNoticeCard}>
                <Ionicons name="mail-open-outline" size={18} color="#2e7d32" />
                <Text style={styles.sentNoticeText}>
                  We emailed a 6-digit code to <Text style={{ fontWeight: '700' }}>{targetEmail}</Text>. Check your inbox
                  (and spam folder) — it expires in 15 minutes.
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, codeError ? styles.inputWrapperError : null]}>
                  <Ionicons name="keypad-outline" size={20} color={codeError ? '#e53935' : '#999'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit code"
                    placeholderTextColor="#999"
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
                  <Text style={styles.resendText}>Didn't get it? Resend code</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, passwordError ? styles.inputWrapperError : null]}>
                  <Ionicons name="lock-closed-outline" size={20} color={passwordError ? '#e53935' : '#999'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor="#999"
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
                <View style={[styles.inputWrapper, confirmError ? styles.inputWrapperError : null]}>
                  <Ionicons name="lock-closed-outline" size={20} color={confirmError ? '#e53935' : '#999'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor="#999"
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
                <View style={styles.primaryGradient}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Reset Password</Text>}
                </View>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.footer}>© 2026 Clucko. All rights reserved.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleProceedToLogin}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-circle" size={48} color="#2e7d32" />
            </View>
            <Text style={styles.successTitle}>Password Reset!</Text>
            <Text style={styles.successMessage}>Your password has been updated. Please login with your new password.</Text>
            <TouchableOpacity style={styles.successButton} onPress={handleProceedToLogin} activeOpacity={0.85}>
              <Text style={styles.successButtonText}>Proceed to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 30 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, alignSelf: 'flex-start', gap: 8 },
  backButtonText: { fontSize: 16, color: '#2e7d32', fontWeight: '500' },

  headerContainer: { alignItems: 'center', marginBottom: 28 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#2e7d32', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 19, paddingHorizontal: 10 },

  sentNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F5FAF5',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  sentNoticeText: { flex: 1, fontSize: 12.5, color: '#3a5a3a', lineHeight: 18 },

  inputContainer: { marginBottom: 18 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  inputWrapperError: { borderColor: '#e53935' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#333' },
  errorText: { color: '#e53935', fontSize: 12, marginTop: 6, marginLeft: 4 },
  resendButton: { alignSelf: 'flex-end', marginTop: 8 },
  resendText: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },

  primaryButton: { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 20 },
  primaryGradient: { backgroundColor: '#2e7d32', paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  footer: { textAlign: 'center', color: '#999', fontSize: 12, marginTop: 10 },

  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successCard: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center' },
  successIconCircle: { marginBottom: 12 },
  successTitle: { fontSize: 20, fontWeight: 'bold', color: '#2e7d32', marginBottom: 8, textAlign: 'center' },
  successMessage: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  successButton: { backgroundColor: '#2e7d32', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  successButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});