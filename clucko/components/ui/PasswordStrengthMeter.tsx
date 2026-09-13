import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface PasswordStrengthMeterProps {
  password: string;
}

const hasLetter = (s: string) => /[A-Za-z]/.test(s);
const hasNumber = (s: string) => /\d/.test(s);
const hasMinLength = (s: string) => s.length >= 8;
const hasGoodLength = (s: string) => s.length >= 10;

// Shared validator — used for the actual submit-time check, not just display
export function isPasswordStrongEnough(password: string) {
  return hasMinLength(password) && hasLetter(password) && hasNumber(password);
}

export function passwordRequirementMessage() {
  return 'Password must be at least 8 characters and include both letters and numbers.';
}

export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const checks = [
    { label: 'At least 8 characters', met: hasMinLength(password) },
    { label: 'Contains a letter', met: hasLetter(password) },
    { label: 'Contains a number', met: hasNumber(password) },
  ];
  const metCount = checks.filter((c) => c.met).length;

  let strength: 'weak' | 'fair' | 'strong' = 'weak';
  if (metCount === 3 && hasGoodLength(password)) strength = 'strong';
  else if (metCount === 3) strength = 'fair';

  const strengthColor = strength === 'strong' ? '#4CAF50' : strength === 'fair' ? '#FF9800' : '#e53935';
  const strengthLabel =
    strength === 'strong' ? 'Strong password' : strength === 'fair' ? 'Good — 10+ characters for Strong' : 'Weak password';
  const barFill = strength === 'strong' ? 1 : strength === 'fair' ? 0.66 : password.length ? 0.33 : 0;

  if (!password) return null;

  return (
    <View style={styles.container}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${barFill * 100}%`, backgroundColor: strengthColor }]} />
      </View>
      <Text style={[styles.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
      <View style={styles.checklist}>
        {checks.map((c) => (
          <View key={c.label} style={styles.checkRow}>
            <Ionicons
              name={c.met ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={c.met ? '#4CAF50' : '#bbb'}
            />
            <Text style={[styles.checkText, c.met && styles.checkTextMet]}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 4 },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: '#eee', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  strengthLabel: { fontSize: 11, fontWeight: '700', marginTop: 5 },
  checklist: { marginTop: 6, gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkText: { fontSize: 11, color: '#999' },
  checkTextMet: { color: '#4CAF50', fontWeight: '600' },
});