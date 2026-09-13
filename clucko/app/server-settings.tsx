import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ConfirmModal from '../components/ui/ConfirmModal';
import {
  getApiUrl,
  setApiUrl,
  testConnection,
  getAutoDetectedHost,
  resetToAutoApiUrl,
  clearStaleSession
} from '../lib/api';

export default function ServerSettingsScreen() {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('5000');
  const [currentUrl, setCurrentUrl] = useState('');
  const [autoDetected, setAutoDetected] = useState<string | null>(null);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const url = await getApiUrl();
    setCurrentUrl(url);
    const savedMode = (await AsyncStorage.getItem('api_url_mode')) as 'auto' | 'manual' || 'auto';
    setMode(savedMode);

    const detected = getAutoDetectedHost();
    setAutoDetected(detected);

    const match = url.match(/http:\/\/([\d.]+):(\d+)/);
    if (match) {
      setIp(match[1]);
      setPort(match[2]);
    } else if (detected) {
      const detMatch = detected.match(/http:\/\/([\d.]+):(\d+)/);
      if (detMatch) {
        setIp(detMatch[1]);
        setPort(detMatch[2]);
      }
    }
  };

  const handleTest = async () => {
    if (!ip.trim()) {
      Alert.alert('Error', 'Enter the IP address first');
      return;
    }
    setTesting(true);
    setStatus('idle');
    const url = `http://${ip.trim()}:${port.trim()}`;
    const ok = await testConnection(url);
    setStatus(ok ? 'ok' : 'fail');
    setTesting(false);
    if (ok) {
      await setApiUrl(url, 'manual');
      setMode('manual');
      setCurrentUrl(url);
      Alert.alert('Success', `Connected to ${url}! Manual IP saved.`);
    } else {
      Alert.alert(
        'Failed to Connect',
        `Could not reach ${url}.\n\nChecklist:\n1. Laptop & phone are on the exact same WiFi / Hotspot\n2. Backend is running (python app.py)\n3. Windows Firewall allows port ${port}`
      );
    }
  };

  const handleUseAuto = async () => {
    const detected = getAutoDetectedHost();
    if (!detected) {
      Alert.alert('Not Detected', 'Could not detect Expo host IP automatically. Please enter your IP manually.');
      return;
    }
    setTesting(true);
    const ok = await testConnection(detected);
    setTesting(false);
    await resetToAutoApiUrl();
    setMode('auto');
    setCurrentUrl(detected);
    const match = detected.match(/http:\/\/([\d.]+):(\d+)/);
    if (match) {
      setIp(match[1]);
      setPort(match[2]);
    }
    setStatus(ok ? 'ok' : 'fail');
    Alert.alert(
      ok ? 'Connected (Auto)' : 'Auto-Detected IP Set',
      `Server URL is now synchronized with your WiFi (${detected}).\nWhenever your laptop WiFi changes, Clucko will auto-adapt.`
    );
  };

  const handleResetAuthSession = () => {
    setShowResetConfirm(true);
  };

  const confirmResetSession = async () => {
    setResetting(true);
    try {
      await clearStaleSession();
      setShowResetConfirm(false);
      Alert.alert('Session Cleared', 'Stale tokens removed. You can now log in fresh or continue as guest.');
      router.replace('/login');
    } finally {
      setResetting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#2E7D32" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Network & Server Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Active URL Status Card */}
        <View style={styles.activeCard}>
          <Text style={styles.activeLabel}>CURRENT ACTIVE BACKEND</Text>
          <Text style={styles.activeUrl}>{currentUrl || 'Not configured'}</Text>
          <View style={styles.modeBadge}>
            <Ionicons
              name={mode === 'auto' ? 'flash-outline' : 'settings-outline'}
              size={13}
              color={mode === 'auto' ? '#2E7D32' : '#E65100'}
            />
            <Text style={[styles.modeText, { color: mode === 'auto' ? '#2E7D32' : '#E65100' }]}>
              {mode === 'auto' ? 'Auto-Detect Mode (WiFi Adaptive)' : 'Manual Override Mode'}
            </Text>
          </View>
        </View>

        {/* Auto Detect Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="wifi-outline" size={20} color="#2E7D32" />
            <Text style={styles.sectionTitle}>Auto-Detect WiFi IP</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Clucko automatically detects your PC's IP via Expo connection. If you switch WiFis, it automatically points to your new network IP!
          </Text>

          {autoDetected ? (
            <View style={styles.detectedBox}>
              <Text style={styles.detectedLabel}>Detected from Expo Host:</Text>
              <Text style={styles.detectedValue}>{autoDetected}</Text>
            </View>
          ) : (
            <Text style={styles.noDetectText}>Expo host not detected yet (using fallback IP).</Text>
          )}

          <TouchableOpacity style={styles.autoBtn} onPress={handleUseAuto} disabled={testing}>
            <Ionicons name="sync" size={16} color="#fff" />
            <Text style={styles.autoBtnText}>Use Auto-Detected WiFi IP</Text>
          </TouchableOpacity>
        </View>

        {/* Manual Configuration */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="create-outline" size={20} color="#333" />
            <Text style={styles.sectionTitle}>Manual IP Override</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Specify a custom static IP if you are using an emulator, tunnel (ngrok), or static IP.
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 2 }}>
              <Text style={styles.fieldLabel}>IP Address</Text>
              <TextInput
                style={styles.input}
                placeholder="192.168.1.5"
                placeholderTextColor="#999"
                value={ip}
                onChangeText={setIp}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.fieldLabel}>Port</Text>
              <TextInput
                style={styles.input}
                placeholder="5000"
                placeholderTextColor="#999"
                value={port}
                onChangeText={setPort}
                keyboardType="numeric"
              />
            </View>
          </View>

          {status === 'ok' && (
            <View style={[styles.statusBox, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
              <Text style={[styles.statusText, { color: '#4CAF50' }]}>Connected successfully to {ip}:{port}!</Text>
            </View>
          )}
          {status === 'fail' && (
            <View style={[styles.statusBox, { backgroundColor: '#FFEBEE' }]}>
              <Ionicons name="close-circle" size={18} color="#f44336" />
              <Text style={[styles.statusText, { color: '#f44336' }]}>Could not reach backend</Text>
            </View>
          )}

          <TouchableOpacity style={styles.testBtn} onPress={handleTest} disabled={testing}>
            {testing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.testBtnText}>Test &amp; Set Manual IP</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Fix Invalid Token / Session */}
        <View style={[styles.sectionCard, { borderColor: '#FFE0B2' }]}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="key-outline" size={20} color="#E65100" />
            <Text style={[styles.sectionTitle, { color: '#E65100' }]}>Token &amp; Session Recovery</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            If you see "Invalid token" or "Token expired" after changing WiFi or restarting the database, reset the session here to log in cleanly.
          </Text>

          <TouchableOpacity style={styles.resetSessionBtn} onPress={handleResetAuthSession}>
            <Ionicons name="log-out-outline" size={16} color="#D84315" />
            <Text style={styles.resetSessionText}>Clear Stale Token / Reset Login</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#2196F3" />
          <Text style={styles.infoText}>
            Tip: Keep on <Text style={{ fontWeight: 'bold' }}>Auto-Detect</Text>. Whenever your laptop connects to a different WiFi, the app will automatically synchronize without having to edit code.
          </Text>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={showResetConfirm}
        title="Reset Login & Session"
        message="This will clear any expired/stale tokens on this device and let you log in cleanly."
        confirmText="Reset Session"
        cancelText="Cancel"
        icon="refresh-circle-outline"
        iconColor="#D84315"
        isDestructive={true}
        loading={resetting}
        onConfirm={confirmResetSession}
        onCancel={() => setShowResetConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  content: { padding: 16, paddingBottom: 40 },
  activeCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.5, marginBottom: 4 },
  activeUrl: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  modeText: { fontSize: 12, fontWeight: '600' },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  sectionSubtitle: { fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 17 },
  detectedBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  detectedLabel: { fontSize: 11, color: '#166534', fontWeight: '600' },
  detectedValue: { fontSize: 15, color: '#14532D', fontWeight: '700', marginTop: 2 },
  noDetectText: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginBottom: 12 },
  autoBtn: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
  },
  autoBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: '#475569', marginBottom: 6, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  testBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  testBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resetSessionBtn: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFCC80',
    borderRadius: 10,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resetSessionText: { color: '#D84315', fontSize: 13, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#EBF5FF',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },
  infoText: { fontSize: 12, color: '#1E40AF', flex: 1, lineHeight: 18 },
});