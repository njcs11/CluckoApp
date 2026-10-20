import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { setOnAccountSuspended, apiSubmitAppeal } from '../../lib/api';

export default function AccountSuspendedModal() {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState('Terms of Service: Community guidelines conflict');
  const [email, setEmail] = useState('');
  const [appealMessage, setAppealMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setOnAccountSuspended(async (suspensionReason: string, userEmail?: string) => {
      setReason(suspensionReason || 'Terms of Service: Community guidelines conflict');
      let targetEmail = userEmail || '';
      if (!targetEmail) {
        try {
          const storedEmail = await AsyncStorage.getItem('userEmail');
          const userDataStr = await AsyncStorage.getItem('userData');
          if (storedEmail) targetEmail = storedEmail;
          else if (userDataStr) targetEmail = JSON.parse(userDataStr).email || '';
        } catch {}
      }
      setEmail(targetEmail);
      setAppealMessage('');
      setAppealSubmitted(false);
      setErrorMessage('');
      setVisible(true);
    });
  }, []);

  const handleSubmitAppeal = async () => {
    const finalEmail = (email || '').trim();
    if (!finalEmail) {
      setErrorMessage('Please enter your account email address.');
      return;
    }

    const messageToSend = appealMessage.trim() || 'Requesting account review and reactivation.';
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await apiSubmitAppeal(finalEmail, reason, messageToSend);
      setAppealSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit appeal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseAndGoToLogin = () => {
    setVisible(false);
    setAppealSubmitted(false);
    router.replace('/login');
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCloseAndGoToLogin}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Header Warning Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="shield-outline" size={32} color="#DC2626" />
          </View>

          <Text style={styles.title}>Account Access Suspended</Text>
          <Text style={styles.subtitle}>
            Your account has been temporarily restricted by Clucko Platform Administration due to a guideline conflict.
          </Text>

          {/* Reason Box */}
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>VIOLATION / SUSPENSION REASON:</Text>
            <Text style={styles.reasonText}>"{reason}"</Text>
          </View>

          {appealSubmitted ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={36} color="#16A34A" style={{ marginBottom: 8 }} />
              <Text style={styles.successTitle}>Appeal Transmitted to Customer Service</Text>
              <Text style={styles.successBody}>
                Your statement has been logged in the Trust & Safety audit queue. A support moderator will review your account history.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleCloseAndGoToLogin}>
                <Text style={styles.primaryBtnText}>Return to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.formSectionTitle}>Contact Customer Service & Submit Appeal</Text>
              
              <Text style={styles.inputLabel}>Account Email</Text>
              <TextInput
                style={styles.textInput}
                placeholder="your.email@example.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.inputLabel}>Appeal Statement / Explanation</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Explain the context or reason why this suspension should be reviewed..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={appealMessage}
                onChangeText={setAppealMessage}
              />

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryBtn, isSubmitting && { opacity: 0.7 }]}
                onPress={handleSubmitAppeal}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.primaryBtnText}>Submit Appeal to Support</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={handleCloseAndGoToLogin}>
                <Text style={styles.secondaryBtnText}>Dismiss & Log Out</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  reasonBox: {
    width: '100%',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FCA5A5',
    lineHeight: 18,
  },
  formSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
    marginTop: 6,
  },
  textInput: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
    width: '100%',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 6,
    width: '100%',
  },
  secondaryBtnText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22C55E',
    textAlign: 'center',
    marginBottom: 6,
  },
  successBody: {
    fontSize: 12,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
});
