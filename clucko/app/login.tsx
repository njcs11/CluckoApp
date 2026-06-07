import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image,
  KeyboardAvoidingView, Platform, SafeAreaView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiLogin } from '../lib/api';

const { height } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await apiLogin(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Image source={require('../assets/images/logo.png')} style={styles.logoImage} />
            </View>
            <Text style={styles.logoText}>Clucko</Text>
            <Text style={styles.subtitle}>AI-Based Gamefowl Health Monitoring</Text>
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#999" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999"
                value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#999" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999"
                value={password} onChangeText={setPassword} secureTextEntry={!showPw} />
              <TouchableOpacity onPress={() => setShowPw(!showPw)}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading}>
            <View style={styles.loginGradient}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Login</Text>}
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.guestButton} onPress={() => router.replace('/(tabs)/home?mode=guest')}>
            <Ionicons name="person-outline" size={20} color="#2e7d32" />
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
          </TouchableOpacity>

          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={styles.signupLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#fff' },
  content:         { flex: 1, paddingHorizontal: 24, paddingTop: height * 0.08, paddingBottom: 30 },
  logoContainer:   { alignItems: 'center', marginBottom: 48 },
  logoCircle:      { width: 100, height: 100, borderRadius: 50, marginBottom: 16, borderWidth: 3, borderColor: '#2e7d32', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logoImage:       { width: 80, height: 80, borderRadius: 40 },
  logoText:        { fontSize: 36, fontWeight: 'bold', color: '#2e7d32', marginBottom: 8 },
  subtitle:        { fontSize: 14, color: '#666', textAlign: 'center' },
  inputContainer:  { marginBottom: 20 },
  inputWrapper:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 16 },
  inputIcon:       { marginRight: 12 },
  input:           { flex: 1, paddingVertical: 14, fontSize: 16, color: '#333' },
  loginButton:     { borderRadius: 30, overflow: 'hidden', marginBottom: 16, marginTop: 8 },
  loginGradient:   { backgroundColor: '#2e7d32', paddingVertical: 16, alignItems: 'center' },
  loginButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  guestButton:     { flexDirection: 'row', borderWidth: 1, borderColor: '#2e7d32', borderRadius: 30, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 },
  guestButtonText: { color: '#2e7d32', fontSize: 16, fontWeight: '600' },
  signupContainer: { flexDirection: 'row', justifyContent: 'center' },
  signupText:      { color: '#666', fontSize: 14 },
  signupLink:      { color: '#2e7d32', fontSize: 14, fontWeight: '600' },
});