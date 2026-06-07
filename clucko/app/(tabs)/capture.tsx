/* eslint-disable */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions,
  FlatList, Modal, Platform, SafeAreaView, ScrollView,
  Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import BatchScanModal from '../../components/ui/BatchScanModal';
import ConfidenceBadge from '../../components/ui/ConfidenceBadge';
import ImageQualityGuide from '../../components/ui/ImageQualityGuide';
import { apiGetChickens, apiSaveScan } from '../../lib/api';

const API_URL = 'http://192.168.1.11:5000';
const { width, height } = Dimensions.get('window');

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return '#f44336';
    case 'high':     return '#FF5722';
    case 'moderate': return '#FF9800';
    case 'none':     return '#4CAF50';
    default:         return '#FF9800';
  }
};

const getSeverityAction = (severity: string, disease: string) => {
  switch (severity) {
    case 'critical': return `🚨 EMERGENCY: Isolate this bird immediately. ${disease} is highly contagious. Contact a veterinarian NOW.`;
    case 'high':     return `⚠️ SERIOUS: Isolate and consult a vet today. ${disease} can spread to other birds.`;
    case 'moderate': return `⚠️ ATTENTION: Monitor closely and consult a vet within 1–2 days.`;
    case 'none':     return '✅ Your chicken appears healthy. Continue regular monitoring.';
    default:         return 'Consult a veterinarian for proper diagnosis.';
  }
};

export default function CaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef  = useRef<CameraView>(null);
  const scaleAnim  = useRef(new Animated.Value(1)).current;

  // ─── All state inside component ──────────────────────────────────────────
  const [scanning, setScanning]               = useState(false);
  const [showAddForm, setShowAddForm]         = useState(false);
  const [showQRModal, setShowQRModal]         = useState(false);
  const [selectedMode, setSelectedMode]       = useState('photo');
  const [showQualityGuide, setShowQualityGuide] = useState(false);
  const [showBatchModal, setShowBatchModal]   = useState(false);
  const [scanType, setScanType]               = useState<'head' | 'wing' | 'full'>('full');
  const [showResultModal, setShowResultModal] = useState(false);
  const [generatedQR, setGeneratedQR]         = useState<any>(null);
  const [scanResult, setScanResult]           = useState<any>(null);
  const [newChicken, setNewChicken]           = useState({
    name: '', breed: '', age: '', weight: '', location: '', color: '', photo: null as string | null,
  });
  // Chicken picker for scan
  const [selectedChickenId, setSelectedChickenId] = useState<number | null>(null);
  const [chickenList, setChickenList]             = useState<any[]>([]);
  const [showChickenPicker, setShowChickenPicker] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  const cameraModes = [
    { id: 'photo', icon: 'camera-outline', label: 'PHOTO', activeColor: '#fff'    },
    { id: 'scan',  icon: 'scan-outline',   label: 'SCAN',  activeColor: '#007AFF' },
  ];

  const scanTypeOptions = [
    { id: 'head', icon: 'eye-outline',  label: 'HEAD/EYES', activeColor: '#2196F3' },
    { id: 'wing', icon: 'paw-outline',  label: 'WINGS',     activeColor: '#4CAF50' },
    { id: 'full', icon: 'body-outline', label: 'FULL BODY', activeColor: '#FF9800' },
  ];

  React.useEffect(() => {
  Animated.loop(
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.1, duration: 1000,
        useNativeDriver: Platform.OS !== 'web',  // ← changed
      }),
      Animated.timing(scaleAnim, {
        toValue: 1, duration: 1000,
        useNativeDriver: Platform.OS !== 'web',  // ← changed
      }),
    ])
  ).start();
  loadChickens();
}, []);

  const loadChickens = async () => {
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    console.warn('Not logged in — skipping chicken load');
    return;
  }
  try {
    const data = await apiGetChickens();
    setChickenList(data);
  } catch (e) {
    console.warn('Could not load chickens for picker');
  }
};

  // ─── SCAN HANDLER ─────────────────────────────────────────────────────────
  const handleScanPress = () => { setSelectedMode('scan'); setShowQualityGuide(true); };
  const handleCapture   = () => { setSelectedMode('photo'); setShowQualityGuide(true); };

  const handleProceedToScan = async () => {
    setShowQualityGuide(false);

    // If no chicken selected yet, show picker first
    if (!selectedChickenId) {
      if (chickenList.length === 0) {
        Alert.alert('No Chickens', 'Add a chicken first before scanning.', [
          { text: 'Add Chicken', onPress: () => setShowAddForm(true) },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      setShowChickenPicker(true);
      return;
    }

    setScanning(true);
    try {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) { setScanning(false); return; }
      }
      if (!cameraRef.current) {
        Alert.alert('Camera Error', 'Camera not ready. Please try again.');
        setScanning(false);
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8, exif: false });
      if (!photo?.base64) throw new Error('Failed to capture image');

      const response = await fetch(`${API_URL}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photo.base64 }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Detection failed');
      }
      const data = await response.json();

      if (data.rejected) {
        setScanResult({
          rejected: true,
          disease: null, confidence: 0,
          symptoms: [data.message || 'Unable to detect disease.'],
          rejectionReason: data.rejection_reason,
        });
        setShowResultModal(true);
        return;
      }

      const result = {
        rejected: false,
        disease: data.flagged_disease === 'Healthy' ? null : data.flagged_disease,
        confidence: Math.round(data.top_prediction?.confidence ?? 0),
        symptoms: data.detected_symptoms?.map((s: any) => s.label) ?? [],
        severity: data.top_prediction?.severity ?? 'moderate',
        allPredictions: data.all_predictions ?? [],
      };
      setScanResult(result);
      setShowResultModal(true);

      // Save to DB
      try {
        await apiSaveScan({
          chicken_id: selectedChickenId,
          image_type: scanType,
          predicted_condition: data.flagged_disease || 'Healthy',
          confidence_score: data.top_prediction?.confidence ?? 0,
          severity_level: data.top_prediction?.severity ?? 'none',
          symptoms: data.detected_symptoms?.map((s: any) => s.label) ?? [],
          all_predictions: data.all_predictions ?? [],
        });
      } catch (dbErr) {
        console.warn('Failed to save scan to DB:', dbErr);
      }

    } catch (error: any) {
      if (error.message?.includes('Network request failed') || error.message?.includes('fetch')) {
        Alert.alert('Connection Error', `Cannot reach backend.\nMake sure:\n1. Backend is running\n2. Same WiFi\n3. IP: ${API_URL}`);
      } else if (error.message?.includes('Model not trained')) {
        Alert.alert('Model Not Trained', 'Open admin panel, upload datasets, then train the model.');
      } else {
        Alert.alert('Scan Failed', error.message || 'Unexpected error.');
      }
    } finally {
      setScanning(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleGenerateAndSave = async () => {
    if (!newChicken.name || !newChicken.breed) {
      Alert.alert('Missing Info', 'Please enter at least name and breed'); return;
    }
    const existing  = await AsyncStorage.getItem('chickens');
    const chickens  = existing ? JSON.parse(existing) : [];
    const nextId    = chickens.length + 1;
    const chickenId = `CK-${String(nextId).padStart(3, '0')}`;
    const qrData    = {
      id: nextId.toString(), chickenId,
      name: newChicken.name, breed: newChicken.breed,
      age: newChicken.age || 'Not specified', weight: newChicken.weight || 'Not specified',
      location: newChicken.location || 'Not specified', color: newChicken.color || 'Not specified',
      photo: null, status: 'HEALTHY', statusColor: '#4CAF50',
      lastScan: new Date().toLocaleDateString(),
      dateAdded: new Date().toLocaleDateString(),
      healthStatus: 'Pending First Scan',
    };
    setGeneratedQR(qrData);
    setShowAddForm(false);
    setShowQRModal(true);
  };

  const handleConfirmSave = async () => {
    if (!generatedQR) return;
    const existing = await AsyncStorage.getItem('chickens');
    const chickens = existing ? JSON.parse(existing) : [];
    chickens.push(generatedQR);
    await AsyncStorage.setItem('chickens', JSON.stringify(chickens));
    Alert.alert('Success!', `${generatedQR.name} added!`, [
      { text: 'View Chickens', onPress: () => { setShowQRModal(false); router.push('/(tabs)/chickens'); } },
      { text: 'Add Another', onPress: () => { setShowQRModal(false); setNewChicken({ name:'',breed:'',age:'',weight:'',location:'',color:'',photo:null }); setShowAddForm(true); } },
    ]);
  };

  // ─── Permission screens ───────────────────────────────────────────────────
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent:'center', alignItems:'center', padding:30 }]}>
        <Ionicons name="camera-outline" size={64} color="#2E7D32" />
        <Text style={{ fontSize:18, fontWeight:'bold', color:'#333', textAlign:'center', marginTop:16, marginBottom:8 }}>Camera Access Required</Text>
        <Text style={{ fontSize:14, color:'#666', textAlign:'center', marginBottom:24 }}>Clucko needs camera access to scan your gamefowl.</Text>
        <TouchableOpacity onPress={requestPermission} style={{ backgroundColor:'#2E7D32', paddingVertical:14, paddingHorizontal:32, borderRadius:30 }}>
          <Text style={{ color:'#fff', fontSize:16, fontWeight:'bold' }}>Grant Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        <LinearGradient colors={['rgba(0,0,0,0.6)','transparent','rgba(0,0,0,0.5)']} style={styles.cameraOverlay}>

          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.topBarButton}>
              <Ionicons name="chevron-down" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Scan & Capture</Text>
            <View style={styles.topBarRight}>
              <TouchableOpacity onPress={() => setShowBatchModal(true)} style={[styles.topBarButton, styles.batchButton]}>
                <Ionicons name="layers-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddForm(true)} style={[styles.topBarButton, styles.addButton]}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Selected chicken display */}
          {selectedChickenId && (
            <TouchableOpacity
              style={styles.selectedChicken}
              onPress={() => setShowChickenPicker(true)}
            >
              <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
              <Text style={styles.selectedChickenText}>
                {chickenList.find(c => c.id === selectedChickenId)?.chicken_name || 'Selected'}
              </Text>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>
          )}

          {/* Scan Type Selector */}
          <View style={styles.scanTypeSelector}>
            {scanTypeOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.scanTypeItem, scanType === option.id && styles.scanTypeItemActive]}
                onPress={() => setScanType(option.id as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.scanTypeIconContainer, scanType === option.id && { backgroundColor: option.activeColor + '40' }]}>
                  <Ionicons name={option.icon as any} size={22} color={scanType === option.id ? option.activeColor : 'rgba(255,255,255,0.7)'} />
                </View>
                <Text style={[styles.scanTypeText, scanType === option.id && { color: option.activeColor, fontWeight:'bold' }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.cameraInfo}>
            <Text style={styles.cameraInfoText}>AI Detection Ready</Text>
            <Text style={styles.cameraInfoText}>{API_URL}</Text>
          </View>

          {/* Frame */}
          <View style={styles.cameraFrame}>
            <Animated.View style={[styles.scannerFrame, { transform:[{ scale: scaleAnim }] }]}>
              <View style={styles.cornerTL}/><View style={styles.cornerTR}/>
              <View style={styles.cornerBL}/><View style={styles.cornerBR}/>
              <View style={styles.targetCircle}>
                <View style={styles.targetInner}>
                  {scanning
                    ? <ActivityIndicator size="large" color="#FFD700" />
                    : <Ionicons name="camera" size={50} color="rgba(255,255,255,0.3)" />
                  }
                </View>
              </View>
            </Animated.View>
          </View>

          {scanning && (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={styles.scanningText}>Analyzing with AI...</Text>
              <Text style={styles.scanningSubText}>Running CNN disease detection</Text>
            </View>
          )}

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <View style={styles.modeSelector}>
              {cameraModes.map((mode) => (
                <TouchableOpacity
                  key={mode.id}
                  style={styles.modeItem}
                  onPress={() => { if (mode.id === 'scan') handleScanPress(); else handleCapture(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={mode.icon as any} size={24} color={selectedMode === mode.id ? mode.activeColor : 'rgba(255,255,255,0.7)'} />
                  <Text style={[styles.modeText, selectedMode === mode.id && { color: mode.activeColor, fontWeight:'bold' }]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.indicatorContainer}>
              <View style={[styles.indicator, { backgroundColor: selectedMode === 'photo' ? '#fff' : '#007AFF' }]} />
            </View>

            <View style={styles.captureRow}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={() => { if (selectedMode === 'scan') handleScanPress(); else handleCapture(); }}
                activeOpacity={0.8}
                disabled={scanning}
              >
                <View style={[styles.captureButtonOuter, { backgroundColor: 'rgba(0,122,255,0.3)', opacity: scanning ? 0.5 : 1 }]}>
                  <LinearGradient colors={['#007AFF','#0055CC']} style={styles.captureButtonInner}>
                    {scanning
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="scan-outline" size={36} color="#fff" />
                    }
                  </LinearGradient>
                </View>
              </TouchableOpacity>
            </View>

            <Text style={styles.instructionText}>
              {scanning ? 'AI is analyzing...' : selectedChickenId ? 'Tap to scan selected chicken' : 'Tap to select chicken then scan'}
            </Text>
          </View>
        </LinearGradient>
      </View>

      {/* Quality Guide & Batch */}
      <ImageQualityGuide visible={showQualityGuide} onClose={() => setShowQualityGuide(false)} onProceed={handleProceedToScan} scanType={scanType} />
      <BatchScanModal visible={showBatchModal} onClose={() => setShowBatchModal(false)} onComplete={(ids: string[]) => Alert.alert('Batch Scan Complete', `Scanned ${ids.length} chickens`)} />

      {/* ─── Chicken Picker Modal ─────────────────────────────────────────── */}
      <Modal animationType="slide" transparent visible={showChickenPicker} onRequestClose={() => setShowChickenPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModal, { backgroundColor: '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Chicken to Scan</Text>
              <TouchableOpacity onPress={() => setShowChickenPicker(false)}>
                <Ionicons name="close-circle" size={30} color="#2E7D32" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={chickenList}
              keyExtractor={i => i.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedChickenId === item.id && { backgroundColor: '#E8F5E9' }]}
                  onPress={() => {
                    setSelectedChickenId(item.id);
                    setShowChickenPicker(false);
                    // Proceed to scan after selecting
                    setTimeout(() => handleProceedToScan(), 100);
                  }}
                >
                  <View>
                    <Text style={styles.pickerName}>{item.chicken_name}</Text>
                    <Text style={styles.pickerBreed}>{item.breed || 'Unknown'} • {item.qr_code}</Text>
                  </View>
                  <View style={[styles.statusDot, {
                    backgroundColor: item.status === 'HEALTHY' ? '#4CAF50' : item.status === 'WARNING' ? '#FF9800' : '#f44336'
                  }]} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <Ionicons name="egg-outline" size={40} color="#ccc" />
                  <Text style={{ color: '#999', marginTop: 8 }}>No chickens found. Add one first!</Text>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ─── Result Modal ─────────────────────────────────────────────────── */}
      <Modal animationType="slide" transparent visible={showResultModal} onRequestClose={() => setShowResultModal(false)}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['#fff','#f5f5f5']} style={styles.resultModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Scan Result</Text>
              <TouchableOpacity onPress={() => setShowResultModal(false)}>
                <Ionicons name="close-circle" size={32} color="#2E7D32" />
              </TouchableOpacity>
            </View>

            {scanResult && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {scanResult.rejected ? (
                  <View style={styles.rejectedContainer}>
                    <Text style={styles.rejectedIcon}>🚫</Text>
                    <Text style={styles.rejectedTitle}>Not a Chicken</Text>
                    <Text style={styles.rejectedMessage}>{scanResult.symptoms?.[0]}</Text>
                    <View style={styles.rejectedReasonBox}>
                      <Text style={styles.rejectedReason}>{scanResult.rejectionReason}</Text>
                    </View>
                    <TouchableOpacity style={styles.retryButton} onPress={() => { setShowResultModal(false); setShowQualityGuide(true); }}>
                      <Text style={styles.retryButtonText}>Try Again</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.resultIconContainer}>
                      <LinearGradient
                        colors={scanResult.disease ? [getSeverityColor(scanResult.severity||'moderate'), getSeverityColor(scanResult.severity||'moderate')+'cc'] : ['#4CAF50','#2E7D32']}
                        style={styles.resultIconGradient}
                      >
                        <Ionicons name={scanResult.disease ? 'alert-circle' : 'checkmark-circle'} size={60} color="#fff" />
                      </LinearGradient>
                    </View>

                    <Text style={[styles.resultTitle, { color: scanResult.disease ? getSeverityColor(scanResult.severity||'moderate') : '#4CAF50' }]}>
                      {scanResult.disease ? `Detected: ${scanResult.disease}` : 'Healthy'}
                    </Text>

                    <View style={styles.confidenceRow}>
                      <ConfidenceBadge score={scanResult.confidence} size="large" showLabel />
                      <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(scanResult.severity||'none')+'20' }]}>
                        <Text style={[styles.severityText, { color: getSeverityColor(scanResult.severity||'none') }]}>
                          {(scanResult.severity||'none').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {scanResult.disease && scanResult.symptoms?.length > 0 && (
                      <View style={styles.symptomsBox}>
                        <Text style={styles.symptomsLabel}>Detected Symptoms:</Text>
                        {scanResult.symptoms.map((s: string, i: number) => (
                          <View key={i} style={styles.symptomItem}>
                            <Ionicons name="warning" size={16} color={getSeverityColor(scanResult.severity||'moderate')} />
                            <Text style={styles.symptomText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {scanResult.allPredictions?.length > 0 && (
                      <View style={styles.predictionsBox}>
                        <Text style={styles.predictionsTitle}>All Disease Probabilities:</Text>
                        {scanResult.allPredictions.map((p: any, i: number) => (
                          <View key={i} style={styles.predRow}>
                            <Text style={styles.predName} numberOfLines={1}>{p.disease_name}</Text>
                            <View style={styles.predBarWrap}>
                              <View style={[styles.predBar, { width:`${p.confidence}%` as any, backgroundColor: p.color||'#4CAF50' }]} />
                            </View>
                            <Text style={styles.predPct}>{p.confidence}%</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={[styles.actionBox, { backgroundColor: scanResult.disease ? '#FFF3E0' : '#E8F5E9' }]}>
                      <Text style={styles.actionTitle}>Recommended Action:</Text>
                      <Text style={[styles.actionMsg, { color: getSeverityColor(scanResult.severity||'none') }]}>
                        {getSeverityAction(scanResult.severity||'none', scanResult.disease||'')}
                      </Text>
                      {scanResult.disease ? (
                        <>
                          <View style={styles.recItem}><Ionicons name="medkit-outline" size={18} color="#2E7D32" /><Text style={styles.recText}>Isolate the affected chicken immediately</Text></View>
                          <View style={styles.recItem}><Ionicons name="call-outline" size={18} color="#2E7D32" /><Text style={styles.recText}>Consult a licensed veterinarian</Text></View>
                          <View style={styles.recItem}><Ionicons name="information-circle-outline" size={18} color="#2E7D32" /><Text style={styles.recText}>AI-assisted detection only — not a medical diagnosis</Text></View>
                        </>
                      ) : (
                        <>
                          <View style={styles.recItem}><Ionicons name="checkmark-circle-outline" size={18} color="#4CAF50" /><Text style={styles.recText}>Continue regular monitoring</Text></View>
                          <View style={styles.recItem}><Ionicons name="calendar-outline" size={18} color="#4CAF50" /><Text style={styles.recText}>Next scan recommended in 7 days</Text></View>
                        </>
                      )}
                    </View>

                    <View style={styles.resultActions}>
                      <TouchableOpacity style={styles.saveBtn} onPress={() => { setShowResultModal(false); Alert.alert('Saved', 'Scan result saved.'); }}>
                        <LinearGradient colors={['#4CAF50','#2E7D32']} style={styles.btnGradient}>
                          <Ionicons name="save-outline" size={20} color="#fff" />
                          <Text style={styles.btnText}>Save</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.closeBtn} onPress={() => setShowResultModal(false)}>
                        <LinearGradient colors={['#757575','#616161']} style={styles.btnGradient}>
                          <Text style={styles.btnText}>Close</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </LinearGradient>
        </View>
      </Modal>

      {/* Add Chicken Modal */}
      <Modal animationType="slide" transparent visible={showAddForm} onRequestClose={() => setShowAddForm(false)}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['#fff','#f5f5f5']} style={styles.formModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Chicken</Text>
              <TouchableOpacity onPress={() => setShowAddForm(false)}>
                <Ionicons name="close-circle" size={32} color="#2E7D32" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ gap:16, paddingBottom:30 }}>
                {(['name','breed','age','weight','location','color'] as const).map((field) => (
                  <View key={field}>
                    <Text style={styles.formLabel}>{field.charAt(0).toUpperCase()+field.slice(1)}{field==='name'||field==='breed'?' *':''}</Text>
                    <TextInput
                      style={styles.formInput} placeholder={`Enter ${field}`} placeholderTextColor="#999"
                      value={newChicken[field] as string}
                      onChangeText={(t) => setNewChicken({...newChicken,[field]:t})}
                    />
                  </View>
                ))}
                <TouchableOpacity style={{ borderRadius:30, overflow:'hidden', marginTop:8 }} onPress={handleGenerateAndSave}>
                  <LinearGradient colors={['#2E7D32','#1B5E20']} style={{ paddingVertical:16, alignItems:'center' }}>
                    <Text style={{ color:'#fff', fontSize:18, fontWeight:'bold' }}>Generate QR & Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </LinearGradient>
        </View>
      </Modal>

      {/* QR Modal */}
      <Modal animationType="slide" transparent visible={showQRModal} onRequestClose={() => setShowQRModal(false)}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['#fff','#f5f5f5']} style={styles.formModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verify & Save</Text>
              <TouchableOpacity onPress={() => setShowQRModal(false)}>
                <Ionicons name="close-circle" size={32} color="#2E7D32" />
              </TouchableOpacity>
            </View>
            {generatedQR && (
              <ScrollView>
                <View style={{ alignItems:'center', marginVertical:20 }}>
                  <View style={{ width:220, height:220, borderRadius:20, overflow:'hidden' }}>
                    <LinearGradient colors={['#4CAF50','#2E7D32']} style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
                      <Ionicons name="qr-code" size={160} color="#fff" />
                    </LinearGradient>
                  </View>
                  <Text style={{ marginTop:12, fontSize:16, fontWeight:'bold', color:'#2E7D32' }}>{generatedQR.chickenId}</Text>
                </View>
                <TouchableOpacity style={{ borderRadius:30, overflow:'hidden', marginBottom:20 }} onPress={handleConfirmSave}>
                  <LinearGradient colors={['#4CAF50','#2E7D32']} style={{ flexDirection:'row', justifyContent:'center', alignItems:'center', paddingVertical:14, gap:8 }}>
                    <Ionicons name="checkmark-circle-outline" size={24} color="#fff" />
                    <Text style={{ color:'#fff', fontSize:16, fontWeight:'bold' }}>Confirm & Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            )}
          </LinearGradient>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:             { flex:1, backgroundColor:'#000' },
  cameraContainer:       { flex:1 },
  cameraOverlay:         { flex:1, justifyContent:'space-between' },
  topBar:                { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingTop:Platform.OS==='ios'?20:40, paddingBottom:10 },
  topBarButton:          { width:44, height:44, borderRadius:22, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center' },
  topBarRight:           { flexDirection:'row', gap:12 },
  batchButton:           { backgroundColor:'#FF9800' },
  addButton:             { backgroundColor:'#FF3B30' },
  topBarTitle:           { fontSize:18, fontWeight:'600', color:'#fff' },
  selectedChicken:       { flexDirection:'row', alignItems:'center', gap:6, alignSelf:'center', backgroundColor:'rgba(0,0,0,0.4)', paddingHorizontal:12, paddingVertical:6, borderRadius:20 },
  selectedChickenText:   { color:'#fff', fontSize:12, fontWeight:'600' },
  changeText:            { color:'#4ade80', fontSize:11, marginLeft:4 },
  scanTypeSelector:      { flexDirection:'row', justifyContent:'center', gap:20, paddingHorizontal:20, paddingVertical:12, backgroundColor:'rgba(0,0,0,0.3)', marginHorizontal:20, marginTop:8, borderRadius:30 },
  scanTypeItem:          { alignItems:'center', paddingHorizontal:12, paddingVertical:8, borderRadius:25, minWidth:80 },
  scanTypeItemActive:    { backgroundColor:'rgba(255,255,255,0.15)' },
  scanTypeIconContainer: { width:40, height:40, borderRadius:20, justifyContent:'center', alignItems:'center', marginBottom:4 },
  scanTypeText:          { fontSize:10, color:'rgba(255,255,255,0.7)', fontWeight:'500', textAlign:'center' },
  cameraInfo:            { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:20, paddingTop:8 },
  cameraInfoText:        { fontSize:11, color:'rgba(255,255,255,0.6)' },
  cameraFrame:           { alignItems:'center', justifyContent:'center', flex:1 },
  scannerFrame:          { width:width*0.75, height:width*0.75, justifyContent:'center', alignItems:'center' },
  cornerTL:              { position:'absolute', top:0, left:0,    width:50, height:50, borderTopWidth:4,    borderLeftWidth:4,   borderColor:'#FFD700' },
  cornerTR:              { position:'absolute', top:0, right:0,   width:50, height:50, borderTopWidth:4,    borderRightWidth:4,  borderColor:'#FFD700' },
  cornerBL:              { position:'absolute', bottom:0, left:0, width:50, height:50, borderBottomWidth:4, borderLeftWidth:4,   borderColor:'#FFD700' },
  cornerBR:              { position:'absolute', bottom:0, right:0,width:50, height:50, borderBottomWidth:4, borderRightWidth:4,  borderColor:'#FFD700' },
  targetCircle:          { width:120, height:120, borderRadius:60, borderWidth:2, borderColor:'rgba(255,255,255,0.4)', justifyContent:'center', alignItems:'center' },
  targetInner:           { width:100, height:100, borderRadius:50, backgroundColor:'rgba(255,255,255,0.1)', justifyContent:'center', alignItems:'center' },
  scanningOverlay:       { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center' },
  scanningText:          { color:'#FFD700', fontSize:18, fontWeight:'bold', marginTop:16 },
  scanningSubText:       { color:'rgba(255,255,255,0.7)', fontSize:13, marginTop:6 },
  bottomControls:        { paddingBottom:Platform.OS==='ios'?30:20 },
  modeSelector:          { flexDirection:'row', justifyContent:'center', gap:50, paddingHorizontal:20, marginBottom:8 },
  modeItem:              { alignItems:'center', gap:6, paddingHorizontal:20, paddingVertical:8 },
  modeText:              { fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:'500' },
  indicatorContainer:    { height:2, marginHorizontal:20, marginBottom:20, alignItems:'center' },
  indicator:             { width:70, height:2, borderRadius:1 },
  captureRow:            { flexDirection:'row', justifyContent:'center', marginBottom:15 },
  captureButton:         { alignItems:'center', justifyContent:'center' },
  captureButtonOuter:    { width:80, height:80, borderRadius:40, justifyContent:'center', alignItems:'center' },
  captureButtonInner:    { width:72, height:72, borderRadius:36, justifyContent:'center', alignItems:'center', elevation:5 },
  instructionText:       { textAlign:'center', color:'rgba(255,255,255,0.6)', fontSize:12, paddingHorizontal:20 },
  modalOverlay:          { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  resultModalContent:    { borderTopLeftRadius:30, borderTopRightRadius:30, padding:24, maxHeight:height*0.92 },
  formModal:             { borderTopLeftRadius:30, borderTopRightRadius:30, padding:24, maxHeight:height*0.9 },
  pickerModal:           { borderTopLeftRadius:30, borderTopRightRadius:30, padding:24, maxHeight:height*0.6 },
  modalHeader:           { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  modalTitle:            { fontSize:22, fontWeight:'bold', color:'#2E7D32' },
  formLabel:             { fontSize:14, fontWeight:'600', color:'#333', marginBottom:6 },
  formInput:             { borderWidth:1, borderColor:'#ddd', borderRadius:12, paddingHorizontal:16, paddingVertical:12, fontSize:16, backgroundColor:'#fff', color:'#333' },
  pickerItem:            { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderRadius:12, marginBottom:8, backgroundColor:'#f9f9f9' },
  pickerName:            { fontSize:15, fontWeight:'600', color:'#333' },
  pickerBreed:           { fontSize:12, color:'#999', marginTop:2 },
  statusDot:             { width:12, height:12, borderRadius:6 },
  rejectedContainer:     { alignItems:'center', paddingVertical:20 },
  rejectedIcon:          { fontSize:56, marginBottom:12 },
  rejectedTitle:         { fontSize:22, fontWeight:'bold', color:'#f44336', marginBottom:8 },
  rejectedMessage:       { fontSize:14, color:'#555', textAlign:'center', lineHeight:20, marginBottom:12, paddingHorizontal:16 },
  rejectedReasonBox:     { backgroundColor:'#F5F5F5', borderRadius:10, padding:10, marginBottom:16 },
  rejectedReason:        { fontSize:11, color:'#999' },
  retryButton:           { backgroundColor:'#2E7D32', paddingVertical:12, paddingHorizontal:32, borderRadius:30 },
  retryButtonText:       { color:'#fff', fontSize:15, fontWeight:'bold' },
  resultIconContainer:   { alignItems:'center', marginBottom:16 },
  resultIconGradient:    { width:100, height:100, borderRadius:50, justifyContent:'center', alignItems:'center' },
  resultTitle:           { fontSize:24, fontWeight:'bold', textAlign:'center', marginBottom:12 },
  confidenceRow:         { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, marginBottom:16 },
  severityBadge:         { paddingHorizontal:12, paddingVertical:6, borderRadius:20 },
  severityText:          { fontSize:12, fontWeight:'bold' },
  symptomsBox:           { backgroundColor:'#FFF3E0', borderRadius:16, padding:16, marginBottom:16 },
  symptomsLabel:         { fontSize:14, fontWeight:'600', color:'#666', marginBottom:8 },
  symptomItem:           { flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 },
  symptomText:           { fontSize:14, color:'#333' },
  predictionsBox:        { backgroundColor:'#F5F5F5', borderRadius:16, padding:16, marginBottom:16 },
  predictionsTitle:      { fontSize:14, fontWeight:'600', color:'#333', marginBottom:12 },
  predRow:               { flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  predName:              { width:130, fontSize:12, color:'#555' },
  predBarWrap:           { flex:1, height:8, backgroundColor:'#E0E0E0', borderRadius:4, overflow:'hidden' },
  predBar:               { height:'100%', borderRadius:4 },
  predPct:               { width:40, fontSize:12, color:'#666', textAlign:'right', fontWeight:'600' },
  actionBox:             { borderRadius:16, padding:16, marginBottom:16 },
  actionTitle:           { fontSize:16, fontWeight:'bold', color:'#2E7D32', marginBottom:8 },
  actionMsg:             { fontSize:13, lineHeight:20, marginBottom:12 },
  recItem:               { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:8 },
  recText:               { fontSize:13, color:'#333', flex:1, lineHeight:18 },
  resultActions:         { flexDirection:'row', gap:12, marginTop:8, marginBottom:20 },
  saveBtn:               { flex:2, borderRadius:30, overflow:'hidden' },
  closeBtn:              { flex:1, borderRadius:30, overflow:'hidden' },
  btnGradient:           { flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:12, gap:8 },
  btnText:               { color:'#fff', fontSize:14, fontWeight:'bold' },
});