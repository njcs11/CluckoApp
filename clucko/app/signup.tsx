import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Platform, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiSignup } from '../lib/api';

export default function SignupScreen() {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    password: '', confirmPassword: '', phone_number: '', farm_name: '',
  });
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSignup = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      Alert.alert('Error', 'Please fill in all required fields'); return;
    }
    if (form.password !== form.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match'); return;
    }
    if (form.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters'); return;
    }
    setLoading(true);
    try {
      await apiSignup({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone_number: form.phone_number,
        farm_name: form.farm_name || `${form.first_name}'s Farm`,
      });
      router.replace('/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Signup Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#2e7d32" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Image source={require('../assets/images/logo.png')} style={styles.logoImage} />
            </View>
            <Text style={styles.logoText}>Create Account</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, marginBottom: 16 }}>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} placeholder="First Name *" placeholderTextColor="#999"
                  value={form.first_name} onChangeText={v => set('first_name', v)} />
              </View>
            </View>
            <View style={{ flex: 1, marginBottom: 16 }}>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} placeholder="Last Name *" placeholderTextColor="#999"
                  value={form.last_name} onChangeText={v => set('last_name', v)} />
              </View>
            </View>
          </View>

          {[
            { label: 'Email *', field: 'email', keyboard: 'email-address' as any },
            { label: 'Phone Number', field: 'phone_number', keyboard: 'phone-pad' as any },
            { label: 'Farm Name (optional)', field: 'farm_name' },
            { label: 'Password *', field: 'password', secure: true },
            { label: 'Confirm Password *', field: 'confirmPassword', secure: true },
          ].map(({ label, field, keyboard, secure }) => (
            <View key={field} style={{ marginBottom: 16 }}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input} placeholder={label} placeholderTextColor="#999"
                  value={(form as any)[field]} onChangeText={v => set(field, v)}
                  keyboardType={keyboard} secureTextEntry={secure} autoCapitalize="none"
                />
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.signupButton} onPress={handleSignup} disabled={loading}>
            <View style={styles.signupGradient}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signupButtonText}>Create Account</Text>}
            </View>
          </TouchableOpacity>

          <View style={styles.loginContainer}>
            <Text style={{ color: '#666', fontSize: 14 }}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={{ color: '#2e7d32', fontSize: 14, fontWeight: '600' }}>Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#fff' },
  content:          { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 30 },
  backBtn:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  backText:         { color: '#2e7d32', fontSize: 16, fontWeight: '500' },
  logoContainer:    { alignItems: 'center', marginBottom: 28 },
  logoCircle:       { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#2e7d32', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  logoImage:        { width: 65, height: 65, borderRadius: 32 },
  logoText:         { fontSize: 26, fontWeight: 'bold', color: '#2e7d32' },
  inputWrapper:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 16 },
  input:            { flex: 1, paddingVertical: 14, fontSize: 15, color: '#333' },
  signupButton:     { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 20 },
  signupGradient:   { backgroundColor: '#2e7d32', paddingVertical: 16, alignItems: 'center' },
  signupButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  loginContainer:   { flexDirection: 'row', justifyContent: 'center' },
});