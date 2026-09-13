import { useNotifications } from '@/context/NotificationContext';
import { exitGuestMode } from '@/utils/guestMode';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { pickOrCaptureChickenPhoto, photoUriToBase64, resizeAndCompress } from '@/utils/photoStorage';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from "expo-router/react-navigation";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import AddChickenModal, { ChickenFormData } from '../../components/ui/AddChickenModal';
import ChickenIcon from '../../components/ui/ChickenIcon';
import ImageQualityGuide from '../../components/ui/ImageQualityGuide';
import { apiCreateChicken, apiGetChickens, apiGetFarms, apiSaveScan, getApiUrl } from '../../lib/api';

// This screen doesn't use DarkModeContext (the camera viewfinder is always
// dark), but the Add Chicken sheet itself is a plain light form — this is
// the fixed light palette AddChickenModal renders with here.
const CAPTURE_FORM_COLORS = {
  text: '#1a1a1a',
  textSecondary: '#555',
  textLight: '#999',
  background: '#fafafa',
  card: '#fff',
  border: '#ddd',
  divider: '#eee',
  primary: '#2E7D32',
};

// WORKAROUND: see photoStorage.ts / other screens for the full explanation
// — expo-file-system's `File` type doesn't resolve its inherited members
// in this project's TS setup, so this alias casts to `any` at the
// construction point only. Purely a types-visibility workaround.
const ExpoFileAny = ExpoFile as any;

// ---------------------------------------------------------------------------
// Backend data shapes
// ---------------------------------------------------------------------------
interface Farm {
  id: number;
  farm_name: string;
  farm_location: string;
}

interface Chicken {
  id: number;
  chicken_name: string;
  farm_id: number | null;
  qr_code: string;
  photo_url?: string;
  status?: string;
  status_color?: string;
}

const getFarmName = (farms: Farm[], farmId?: number | string | null): string => {
  if (!farmId) return 'Unassigned';
  const farm = farms.find((f) => String(f.id) === String(farmId));
  return farm ? farm.farm_name : 'Unassigned';
};

// A chicken newly filled out in the Add Chicken sheet, not yet created on
// the backend — holds the QR preview and lets the user Share/Save the tag
// before the "Confirm & Save" step actually creates it + attaches the scan.
type PendingChicken = {
  chickenId: string; // becomes qr_code
  name: string;
  farmId: string | null;
  photo: string | null;
};

// API base URL is resolved dynamically via lib/api.ts (Auto-detects WiFi IP)

// ---------------------------------------------------------------------------
// Layout constants — the viewfinder is capped like a real phone screen and
// centered with a "letterbox" on tablets / desktop web, so the camera never
// looks stretched or foreign to what a phone camera actually looks like.
// ---------------------------------------------------------------------------
const MAX_PHONE_WIDTH = 460;

// ---------------------------------------------------------------------------
// Simulated "AI analysis" pacing — cycles through a few different status
// lines while the (simulated) health check runs, alternating blue/yellow
// so it visibly reads as active work rather than an instant fake result.
// ---------------------------------------------------------------------------
const ANALYZING_MESSAGES = [
  'Pre-processing photo & normalizing resolution…',
  'Scanning eye & head regions for Coryza / Fowl Pox…',
  'Analyzing wing & plumage for Newcastle Disease…',
  'Evaluating symptom patterns & cross-referencing health markers…',
  'Finalizing diagnostic report & confidence metrics…',
];
const ANALYZING_COLORS = ['#4DA3FF', '#FFD54F', '#4CAF50'];

// Maps a detection result into the DB's severity_level enum. The backend
// doesn't compute this for us — /api/detect only returns a disease name +
// confidence, so this screen is the single place that decides how
// confidence maps to severity for every saved scan.
const mapSeverity = (
  disease: string | null,
  confidence: number
): 'none' | 'moderate' | 'high' | 'critical' => {
  if (!disease) return 'none';
  if (confidence < 70) return 'moderate';
  if (confidence <= 90) return 'high';
  return 'critical';
};

export default function CaptureScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const frameWidth = Math.min(screenWidth, MAX_PHONE_WIDTH);
  const isWideScreen = screenWidth > MAX_PHONE_WIDTH;

  // Global notification popup — notify() persists the notification AND
  // pops the banner immediately, no matter which tab is currently open.
  const { notify } = useNotifications();

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [checkingGuest, setCheckingGuest] = useState(true);
  const { chickenId: chickenIdParam } = useLocalSearchParams<{ chickenId?: string }>();

  // --- Real device camera state -------------------------------------------------
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const [scanning, setScanning] = useState(false);
  const [checkingCapture, setCheckingCapture] = useState(false);
  const [selectedMode, setSelectedMode] = useState('photo');
  const [gridOn, setGridOn] = useState(true);

  // --- Farms / chickens (backend-backed) ------------------------------------
  const [farms, setFarms] = useState<Farm[]>([]);
  const [chickens, setChickens] = useState<Chicken[]>([]);

  // The chicken the user picked BEFORE capturing (optional). If set, a
  // saved scan attaches to it directly with no extra prompt.
  const [selectedChicken, setSelectedChicken] = useState<Chicken | null>(null);

  // Chicken picker modal — shared by the "Select Chicken" pill (pre-capture)
  // and the "No, pick an existing chicken" post-capture branch.
  const [showChickenPicker, setShowChickenPicker] = useState(false);
  const [pickerPurpose, setPickerPurpose] = useState<'preselect' | 'postcapture'>('preselect');

  // Post-capture "is this a new chicken?" prompt — only shown when the
  // user captured WITHOUT preselecting an existing chicken.
  const [showNewOrExistingModal, setShowNewOrExistingModal] = useState(false);

  // --- Add-chicken flow (only reachable via the post-capture prompt now) ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newChicken, setNewChicken] = useState<ChickenFormData>({
    name: '',
    photo: null,
    farmId: null,
  });
  const [showQRModal, setShowQRModal] = useState(false);
  const [pendingChicken, setPendingChicken] = useState<PendingChicken | null>(null);

  const [showQualityGuide, setShowQualityGuide] = useState(false);
  const [scanResult, setScanResult] = useState<{
    disease: string | null;
    diseaseId?: string | null;
    confidence: number;
    confidenceLevel?: string;
    severity?: string;
    module?: string;
    modulesChecked?: any;
    symptoms: string[];
    highConfidenceAlert?: boolean;
    base64Image?: string | null;
  } | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [lastPhotoBase64, setLastPhotoBase64] = useState<string | null>(null);

  // Red "wrong subject" error modal — used for an invalid QR code.
  const [showDetectionAlert, setShowDetectionAlert] = useState(false);
  const [detectionAlertMessage, setDetectionAlertMessage] = useState('');
  const barcodeLockRef = useRef(false);

  // Scanned QR chicken tag modal state
  const [scannedTagInfo, setScannedTagInfo] = useState<{
    chickenId: string;
    name: string;
    farmName: string;
    status: string;
    photoUrl?: string;
    chickenObj: any | null;
  } | null>(null);
  const [showScannedTagModal, setShowScannedTagModal] = useState(false);

  const [analyzingStep, setAnalyzingStep] = useState(0);
  const analyzingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isSavingScan, setIsSavingScan] = useState(false);
  const [isCreatingChicken, setIsCreatingChicken] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const shutterAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const qrRef = useRef<any>(null);

  const cameraModes = [
    { id: 'photo', label: 'PHOTO' },
    { id: 'scan', label: 'SCAN' },
  ];

  const PART_MODULES = [
    { id: 'auto' as const, label: 'Auto', iconFamily: 'Ionicons' as const, iconName: 'sparkles' },
    { id: 'eye' as const, label: 'Eye & Head', iconFamily: 'Ionicons' as const, iconName: 'eye-outline' },
    { id: 'wing' as const, label: 'Wing & Body', iconFamily: 'MaterialCommunityIcons' as const, iconName: 'feather' },
  ];
  type PartModuleId = 'auto' | 'eye' | 'wing';
  const [selectedPart, setSelectedPart] = useState<PartModuleId>('auto');

  useEffect(() => {
    checkGuestAccess();
    loadInitialData();
  }, []);

  // Continuously animate the blue laser scan line up and down while in SCAN mode
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (selectedMode === 'scan') {
      scanLineAnim.setValue(0);
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 1700,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1700,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    } else {
      scanLineAnim.setValue(0);
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [selectedMode]);

  // Turn the torch off automatically whenever this screen loses focus
  // (navigating away, switching tabs) so it never stays on in the
  // background after leaving Capture.
  useFocusEffect(
    useCallback(() => {
      return () => setTorchOn(false);
    }, [])
  );

  const clearPendingCapture = async () => {
    setLastPhotoUri(null);
    setLastPhotoBase64(null);
    setScanResult(null);
    setShowResultModal(false);
    try {
      await AsyncStorage.multiRemove(['pending_capture_uri', 'pending_capture_b64', 'pending_scan_result']);
    } catch (e) {
      console.warn('Error clearing pending capture:', e);
    }
  };

  const loadInitialData = async () => {
    try {
      // Restore any previous captured photo and scan result if user navigated away
      try {
        const savedUri = await AsyncStorage.getItem('pending_capture_uri');
        const savedB64 = await AsyncStorage.getItem('pending_capture_b64');
        const savedScan = await AsyncStorage.getItem('pending_scan_result');
        if (savedUri && savedScan) {
          setLastPhotoUri(savedUri);
          setLastPhotoBase64(savedB64 || null);
          setScanResult(JSON.parse(savedScan));
        }
      } catch (e) {
        console.warn('Error restoring pending capture:', e);
      }

      const isGuest = await AsyncStorage.getItem('isGuestMode');
      const token = await AsyncStorage.getItem('token');
      if (isGuest === 'true' || !token || token === 'null') {
        return;
      }

      const [farmList, chickenList] = await Promise.all([apiGetFarms(), apiGetChickens()]);
      setFarms(farmList || []);
      setChickens(chickenList || []);

      // If we were navigated here from a chicken profile ("New Capture" /
      // "Capture Again"), auto-select that chicken so the person doesn't
      // have to re-pick it from the dropdown.
      if (chickenIdParam) {
        const match = (chickenList || []).find(
          (c: Chicken) => String(c.id) === String(chickenIdParam) || c.qr_code === chickenIdParam
        );
        if (match) setSelectedChicken(match);
      }
    } catch (error) {
      console.error('Error loading farms/chickens:', error);
    }
  };

  useEffect(() => {
    const isAnalyzing = scanning || checkingCapture;

    if (isAnalyzing) {
      setAnalyzingStep(0);
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 0.88,
        duration: 4200,
        useNativeDriver: false,
      }).start();

      let step = 0;
      analyzingIntervalRef.current = setInterval(() => {
        step = Math.min(step + 1, 3);
        setAnalyzingStep(step);
      }, 950);
    } else {
      if (analyzingIntervalRef.current) {
        clearInterval(analyzingIntervalRef.current);
        analyzingIntervalRef.current = null;
      }
      progressAnim.setValue(0);
    }

    return () => {
      if (analyzingIntervalRef.current) {
        clearInterval(analyzingIntervalRef.current);
        analyzingIntervalRef.current = null;
      }
    };
  }, [scanning, checkingCapture]);

  const checkGuestAccess = async () => {
    try {
      const guestFlag = await AsyncStorage.getItem('isGuestMode');
      setIsGuestMode(guestFlag === 'true');
    } catch (error) {
      console.error('Error checking guest mode:', error);
    } finally {
      setCheckingGuest(false);
    }
  };

  const handleScanPress = () => {
    setSelectedMode('scan');
  };

  const triggerFlash = () => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  };

  const showWrongSubjectAlert = (message: string) => {
    setDetectionAlertMessage(message);
    setShowDetectionAlert(true);
  };

  // Sends the captured photo's base64 data to the real backend for disease
  // detection using the selected anatomical module ('auto', 'eye', or 'wing').
  const analyzeWithBackend = async (base64Image: string) => {
    const API_URL = await getApiUrl();
    const response = await fetch(`${API_URL}/api/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, module: selectedPart }),
    });
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    return response.json();
  };

  // Maps a successful backend prediction into the UI's scanResult shape and
  // shows the result modal. Note: Notification is saved strictly when the user
  // actually saves the scan, not during preview/retake.
  const applyDetectionResult = (result: any, base64Image?: string) => {
    const top = result.top_prediction;
    const isHealthy = !top || String(top.disease_id).startsWith('healthy');
    const symptomLabels = (result.detected_symptoms || []).map((s: any) => s.label);

    const scan = {
      disease: isHealthy ? null : top.disease_name,
      diseaseId: top ? top.disease_id : null,
      confidence: top ? top.confidence : 0,
      confidenceLevel: result.confidence_level || (top?.confidence >= 70 ? 'High' : 'Moderate'),
      severity: top?.severity || 'none',
      module: result.module || 'eye',
      modulesChecked: result.modules_checked || {},
      symptoms: symptomLabels.length > 0 ? symptomLabels : ['No abnormalities detected'],
      highConfidenceAlert: Boolean(result.high_confidence_alert),
      base64Image: base64Image || lastPhotoBase64,
    };

    setScanResult(scan);
    setShowResultModal(true);

    if (lastPhotoUri) {
      AsyncStorage.setItem('pending_capture_uri', lastPhotoUri).catch(() => {});
    }
    if (base64Image || lastPhotoBase64) {
      AsyncStorage.setItem('pending_capture_b64', base64Image || lastPhotoBase64 || '').catch(() => {});
    }
    AsyncStorage.setItem('pending_scan_result', JSON.stringify(scan)).catch(() => {});
  };

  // Runs a captured photo through the real backend model and routes the
  // response to either the "wrong subject / unclear" alert or the result
  // modal. Shared by both Scan mode and Photo-mode capture.
  const runScanResult = async (base64Image: string | undefined) => {
    if (!base64Image) {
      await notify({
        title: 'Image Error',
        message: 'Could not read the captured photo. Please try again.',
        type: 'alert',
      });
      return;
    }
    try {
      const result = await analyzeWithBackend(base64Image);

      if (analyzingIntervalRef.current) {
        clearInterval(analyzingIntervalRef.current);
        analyzingIntervalRef.current = null;
      }
      setAnalyzingStep(4);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: false,
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 400));

      if (result.rejected) {
        showWrongSubjectAlert(result.message || "Couldn't analyze that photo. Please try again.");
        await clearPendingCapture();
      } else {
        applyDetectionResult(result, base64Image);
      }
    } catch (error) {
      console.error('Error analyzing photo via backend:', error);
      await clearPendingCapture();
      await notify({
        title: 'Connection Error',
        message: "Couldn't reach the analysis server. Check that the backend is running.",
        type: 'alert',
      });
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (barcodeLockRef.current || selectedMode !== 'scan') return;
    barcodeLockRef.current = true;

    const trimmed = (data || '').trim();
    if (!trimmed) {
      barcodeLockRef.current = false;
      return;
    }

    let tagId = '';
    let tagName = '';

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        tagId = String(parsed.chickenId || parsed.id || parsed.qr_code || parsed.code || '').trim();
        tagName = String(parsed.name || parsed.chicken_name || '').trim();
      } else {
        tagId = String(parsed).trim();
      }
    } catch {
      // Raw string tag (e.g. "chicken001", "CK-001")
      tagId = trimmed;
    }

    if (!tagId) {
      showWrongSubjectAlert("That QR code isn't a recognized chicken tag — please scan a valid chicken QR code.");
      setTimeout(() => { barcodeLockRef.current = false; }, 1800);
      return;
    }

    // Lookup matching chicken in user's flock
    const matched = chickens.find(
      (c) =>
        String(c.id) === tagId ||
        (c.qr_code && c.qr_code.toLowerCase() === tagId.toLowerCase()) ||
        (c.chicken_name && c.chicken_name.toLowerCase() === (tagName || tagId).toLowerCase())
    );

    if (matched) {
      setScannedTagInfo({
        chickenId: matched.qr_code || String(matched.id),
        name: matched.chicken_name,
        farmName: getFarmName(farms, matched.farm_id),
        status: matched.status || 'Healthy',
        photoUrl: matched.photo_url,
        chickenObj: matched,
      });
      setShowScannedTagModal(true);
    } else {
      // Unregistered / new tag
      setScannedTagInfo({
        chickenId: tagId,
        name: tagName || tagId,
        farmName: 'Unassigned',
        status: 'Unregistered Tag',
        photoUrl: undefined,
        chickenObj: null,
      });
      setShowScannedTagModal(true);
    }
  };

  const pressShutter = (onDone: () => void) => {
    Animated.sequence([
      Animated.timing(shutterAnim, { toValue: 0.82, duration: 90, useNativeDriver: true }),
      Animated.timing(shutterAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
    onDone();
  };

  const handleCapture = () => {
    if (checkingCapture || scanning) return;
    setSelectedMode('photo');
    pressShutter(async () => {
      if (!cameraRef.current || !cameraReady) return;

      let photo;
      try {
        photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: true });
      } catch (error) {
        console.error('Error capturing photo:', error);
        await notify({
          title: 'Capture Error',
          message: 'Could not capture photo. Please try again.',
          type: 'alert',
        });
        return;
      }

      triggerFlash();
      setLastPhotoUri(photo.uri);
      setLastPhotoBase64(photo.base64 || null);

      // Save-to-gallery is best-effort and isolated from the analysis flow —
      // Expo Go on Android rejects requestPermissionsAsync entirely (a known
      // Expo Go limitation, not fixable via config), so this must never block
      // or fail the actual capture/analysis pipeline.
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        if (status === 'granted') {
          MediaLibrary.saveToLibraryAsync(photo.uri).catch((err) =>
            console.error('Error saving captured photo:', err)
          );
        }
      } catch (error) {
        console.log('Media library permission unavailable (expected in Expo Go):', String(error));
      }

      setCheckingCapture(true);
      await runScanResult(photo.base64);
      setCheckingCapture(false);
    });
  };

  const handleFlipCamera = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  // Gate the actual capture behind the Image Quality Guide, unless the
  // person already dismissed it permanently ("Don't show this again").
  // Scan mode does nothing here — it's QR-only now, driven entirely by
  // the live onBarcodeScanned callback.
  const handleShutterPress = () => {
    if (checkingCapture || scanning) return;
    if (selectedMode === 'scan') return;

    handleCapture();
  };

  // --- Chicken selection (pre-capture pill + post-capture "existing" branch) ---
  const openChickenPickerForPreselect = () => {
    setPickerPurpose('preselect');
    setShowChickenPicker(true);
  };

  const handlePickChickenPhoto = async () => {
    const uri = await pickOrCaptureChickenPhoto();
    if (uri) {
      setNewChicken((prev) => ({ ...prev, photo: uri }));
    }
  };

  const handleChickenPicked = (chicken: Chicken) => {
    if (pickerPurpose === 'preselect') {
      setSelectedChicken(chicken);
      setShowChickenPicker(false);
    } else {
      setShowChickenPicker(false);
      persistScanToChicken(chicken.id);
    }
  };

  // --- Post-capture "Save Result" routing ---
  const handleSaveScanResult = () => {
    if (isSavingScan || !scanResult) return;

    if (selectedChicken) {
      persistScanToChicken(selectedChicken.id);
      return;
    }

    // No chicken was preselected — ask whether this is a new or existing bird.
    setShowResultModal(false);
    setShowNewOrExistingModal(true);
  };

  const handleChooseNewChicken = () => {
    setShowNewOrExistingModal(false);
    // Deliberately NOT pre-filling with the just-captured photo — the user
    // picks a separate profile photo manually via the Add Chicken sheet's
    // own photo picker (see handlePickChickenPhoto below). The captured
    // photo stays purely as the scan/analysis subject.
    setNewChicken({
      name: '',
      photo: null,
      farmId: null,
    });
    setShowAddForm(true);
  };

  const handleChooseExistingChicken = () => {
    if (chickens.length === 0) {
      notify({
        title: 'No Chickens Yet',
        message: "You don't have any chickens yet. Add this one as a new chicken instead.",
        type: 'warning',
      });
      return;
    }
    setShowNewOrExistingModal(false);
    setPickerPurpose('postcapture');
    setShowChickenPicker(true);
  };

  // Actually saves the scan against a real chicken_id. Shared by: a
  // preselected chicken, an existing chicken picked post-capture, and a
  // brand-new chicken right after it's created.
  const persistScanToChicken = async (chickenId: number) => {
    if (isSavingScan || !scanResult) return;
    setIsSavingScan(true);
    try {
      let imageUrl: string | undefined = undefined;
      if (lastPhotoUri) {
        try {
          const compressed = await resizeAndCompress(lastPhotoUri);
          imageUrl = await photoUriToBase64(compressed);
        } catch (e) {
          console.warn('Could not compress photo for scan record:', e);
          if (lastPhotoBase64) imageUrl = `data:image/jpeg;base64,${lastPhotoBase64}`;
        }
      } else if (lastPhotoBase64) {
        imageUrl = `data:image/jpeg;base64,${lastPhotoBase64}`;
      }

      await apiSaveScan({
        chicken_id: chickenId,
        image_type: selectedPart === 'eye' ? 'head' : selectedPart === 'wing' ? 'wing' : 'full',
        predicted_condition: scanResult.disease || 'Healthy',
        confidence_score: scanResult.confidence,
        severity_level: mapSeverity(scanResult.disease, scanResult.confidence),
        symptoms: scanResult.symptoms,
        image_url: imageUrl,
      });

      setShowResultModal(false);
      setShowNewOrExistingModal(false);
      setShowChickenPicker(false);
      setSelectedChicken(null);
      await clearPendingCapture();

      // Trigger disease warning or success notification ONLY when successfully saved!
      if (scanResult.disease) {
        await notify({
          title: scanResult.highConfidenceAlert ? 'Critical Health Warning' : 'Health Concern Detected',
          message: `${scanResult.disease} detected with ${scanResult.confidence}% confidence (${scanResult.module === 'wing' ? 'Wing' : 'Eye'}).`,
          type: scanResult.highConfidenceAlert ? 'alert' : 'warning',
        });
      } else {
        await notify({
          title: 'Capture Saved',
          message: "The capture result has been saved to the chicken's health record.",
          type: 'success',
        });
      }

      router.replace('/(tabs)/chickens');
    } catch (error: any) {
      console.error('Error saving scan:', error);
      notify({
        title: 'Save Failed',
        message: error.message || 'Could not save the capture result.',
        type: 'alert',
      });
    } finally {
      setIsSavingScan(false);
    }
  };

  // --- New chicken creation (Add Chicken sheet → QR preview → confirm) ---
  const handleGenerateChickenPreview = async () => {
    if (!newChicken.name.trim()) {
      await notify({
        title: 'Missing Info',
        message: 'Please enter a name for your chicken.',
        type: 'warning',
      });
      return;
    }

    const chickenNumber = chickens.length + 1;
    const chickenCode = `CK-${String(chickenNumber).padStart(3, '0')}`;

    setPendingChicken({
      chickenId: chickenCode,
      name: newChicken.name.trim(),
      farmId: newChicken.farmId,
      photo: newChicken.photo,
    });

    setShowAddForm(false);
    setShowQRModal(true);
  };

  // Creates the chicken on the backend, then immediately attaches the scan
  // that triggered this whole flow to the brand-new chicken_id.
  const handleConfirmSave = async () => {
    if (isCreatingChicken || !pendingChicken) return;
    setIsCreatingChicken(true);

    try {
      let photoBase64: string | undefined;
      if (pendingChicken.photo) {
        photoBase64 = await photoUriToBase64(pendingChicken.photo);
      }

      const created: Chicken = await apiCreateChicken({
        qr_code: pendingChicken.chickenId,
        chicken_name: pendingChicken.name,
        farm_id: pendingChicken.farmId ? Number(pendingChicken.farmId) : undefined,
        photo_url: photoBase64,
      });

      setChickens((prev) => [created, ...prev]);
      setShowQRModal(false);
      setPendingChicken(null);
      setNewChicken({ name: '', photo: null, farmId: null });

      await persistScanToChicken(created.id);
    } catch (error: any) {
      console.error('Error creating chicken:', error);
      await notify({
        title: 'Save Failed',
        message: error.message || 'Failed to save chicken.',
        type: 'alert',
      });
    } finally {
      setIsCreatingChicken(false);
    }
  };

  const captureQrToFile = async (): Promise<string | null> => {
    if (!qrRef.current || !pendingChicken) return null;

    return new Promise((resolve) => {
      qrRef.current.toDataURL(async (base64Data: string) => {
        try {
          const file = new ExpoFileAny(Paths.cache, `chicken-qr-${pendingChicken.chickenId}.png`);
          await file.write(base64Data, { encoding: 'base64' });
          resolve(file.uri);
        } catch (error) {
          console.error('Error writing QR file:', error);
          resolve(null);
        }
      });
    });
  };

  const handleShareQR = async () => {
    try {
      const fileUri = await captureQrToFile();
      if (!fileUri) {
        await notify({
          title: 'Share Failed',
          message: 'Could not prepare the QR code for sharing.',
          type: 'alert',
        });
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: `Share ${pendingChicken?.name}'s QR Code`,
        });
      } else {
        await Share.share({
          message: `Chicken QR Code for ${pendingChicken?.name}\nID: ${pendingChicken?.chickenId}`,
          title: 'Share Chicken QR Code',
        });
      }
    } catch (error) {
      console.error('Error sharing QR code:', error);
      await notify({
        title: 'Share Failed',
        message: 'Could not share QR code.',
        type: 'alert',
      });
    }
  };

  const handleDownloadQR = async () => {
    if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
      await notify({
        title: 'Notice',
        message: "Saving to gallery is limited in Expo Go. Use the Share button instead.",
        type: 'info',
      });
      return;
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (status !== 'granted') {
        await notify({
          title: 'Permission Needed',
          message: 'Please allow photo library access to save the QR code.',
          type: 'warning',
        });
        return;
      }

      const fileUri = await captureQrToFile();
      if (!fileUri) {
        await notify({
          title: 'Save Failed',
          message: 'Could not prepare the QR code to save.',
          type: 'alert',
        });
        return;
      }

      await MediaLibrary.saveToLibraryAsync(fileUri);
      await notify({
        title: 'QR Code Saved',
        message: 'QR code image saved to your device gallery.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error saving QR code:', error);
      await notify({
        title: 'Save Limited',
        message: "Saving to gallery isn't supported in Expo Go. Use Share instead.",
        type: 'info',
      });
    }
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  };

  React.useEffect(() => {
    startPulseAnimation();
  }, []);

  const isAnalyzing = scanning || checkingCapture;
  const analyzingColor = ANALYZING_COLORS[analyzingStep % ANALYZING_COLORS.length];

  if (checkingGuest) {
    return <SafeAreaView style={styles.container} />;
  }

  if (isGuestMode) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.guestBlockContainer}>
          <View style={styles.guestBlockIconCircle}>
            <Ionicons name="lock-closed-outline" size={40} color="#fff" />
          </View>
          <Text style={styles.guestBlockTitle}>Sign Up Required</Text>
          <Text style={styles.guestBlockText}>
            Please sign up or login first to access Scan &amp; Detect.
          </Text>
          <TouchableOpacity style={styles.guestBlockButton} onPress={() => router.push('/signup')}>
            <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.guestBlockButtonGradient}>
              <Text style={styles.guestBlockButtonText}>Sign Up</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.guestBlockSecondaryButton} onPress={() => router.replace('/login')}>
            <Text style={styles.guestBlockSecondaryText}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.guestBlockBackButton} onPress={exitGuestMode}>
            <Ionicons name="exit-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.guestBlockBackText}>Exit Guest Mode</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.guestBlockContainer}>
          <View style={styles.guestBlockIconCircle}>
            <Ionicons name="camera-outline" size={40} color="#fff" />
          </View>
          <Text style={styles.guestBlockTitle}>Camera Access Needed</Text>
          <Text style={styles.guestBlockText}>
            {permission.canAskAgain
              ? 'Clucko needs access to your camera to scan and photograph your chickens.'
              : 'Camera access was previously denied. Please enable it for Clucko in your device settings.'}
          </Text>
          {permission.canAskAgain ? (
            <TouchableOpacity style={styles.guestBlockButton} onPress={requestPermission}>
              <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.guestBlockButtonGradient}>
                <Text style={styles.guestBlockButtonText}>Allow Camera Access</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.guestBlockSecondaryButton} onPress={() => router.back()}>
            <Text style={styles.guestBlockSecondaryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.letterbox}>
        <View style={[styles.phoneFrame, { width: frameWidth }, isWideScreen && styles.phoneFrameElevated]}>
          <View style={styles.viewfinder}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              enableTorch={torchOn}
              onCameraReady={() => setCameraReady(true)}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={selectedMode === 'scan' ? handleBarcodeScanned : undefined}
            />

            {/* All overlay UI lives here, as a sibling of CameraView —
                see the note on styles.cameraOverlay above. box-none lets
                touches pass through to CameraView except where a real
                button/touchable underneath explicitly wants them. */}
            <View style={styles.cameraOverlay} pointerEvents="box-none">
              {/* Captured photo preview — Photo mode only. Covers the live
                  camera feed with the shot and stays visible after capture
                  so the user can review their photo, view results, and save
                  or retake without losing the shot. */}
              {selectedMode === 'photo' && !!lastPhotoUri && (
                <>
                  <Image
                    source={{ uri: lastPhotoUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                  {checkingCapture && <View style={styles.frozenPhotoScrim} pointerEvents="none" />}
                </>
              )}

              <LinearGradient
                colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.6)']}
                locations={[0, 0.22, 0.72, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <Animated.View
                pointerEvents="none"
                style={[styles.flashOverlay, { opacity: flashAnim }]}
              />

              {gridOn && (
                <View style={styles.gridOverlay} pointerEvents="none">
                  <View style={[styles.gridLineV, { left: '33.3%' }]} />
                  <View style={[styles.gridLineV, { left: '66.6%' }]} />
                  <View style={[styles.gridLineH, { top: '33.3%' }]} />
                  <View style={[styles.gridLineH, { top: '66.6%' }]} />
                </View>
              )}

              <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.topIconButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-down" size={22} color="#fff" />
                </TouchableOpacity>

                <View style={styles.topCenterPill}>
                  <View style={[styles.recDot, selectedMode === 'scan' && { backgroundColor: '#4DA3FF' }]} />
                  <Text style={styles.topCenterText}>{selectedMode === 'scan' ? 'AI SCAN' : 'PHOTO'}</Text>
                </View>

                <View style={styles.topRightCluster}>
                  <TouchableOpacity
                    onPress={() => setShowQualityGuide(true)}
                    style={styles.topIconButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="help-circle-outline" size={20} color="#fff" />
                  </TouchableOpacity>

                  {facing === 'back' && (
                    <TouchableOpacity
                      onPress={() => setTorchOn((v) => !v)}
                      style={[styles.topIconButton, torchOn && styles.topIconButtonActive]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={torchOn ? 'flash' : 'flash-off'} size={18} color={torchOn ? '#FFD54F' : '#fff'} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Chicken selection pill — only shown during PHOTO mode (capture).
                  In SCAN mode (QR scanner), chicken selection is hidden so
                  users scan the bird's QR tag directly. */}
              {selectedMode === 'photo' && (
                <View style={styles.chickenSelectRow} pointerEvents="box-none">
                  <TouchableOpacity
                    style={styles.chickenSelectPill}
                    onPress={openChickenPickerForPreselect}
                    activeOpacity={0.8}
                  >
                    <ChickenIcon size={16} color="#fff" />
                    <Text style={styles.chickenSelectText} numberOfLines={1}>
                      {selectedChicken ? selectedChicken.chicken_name : 'No chicken selected — tap to choose'}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color="#fff" />
                  </TouchableOpacity>
                  {selectedChicken && (
                    <TouchableOpacity
                      onPress={() => setSelectedChicken(null)}
                      style={styles.chickenSelectClear}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.focusArea} pointerEvents={lastPhotoUri && !isAnalyzing ? 'box-none' : 'none'}>
                {lastPhotoUri && !isAnalyzing ? (
                  <View style={styles.capturedPreviewNotice}>
                    <TouchableOpacity
                      style={styles.capturedBadgePill}
                      onPress={() => setShowResultModal(true)}
                      activeOpacity={0.85}
                    >
                      <View
                        style={[
                          styles.capturedStatusDot,
                          {
                            backgroundColor:
                              scanResult?.severity === 'critical'
                                ? '#f44336'
                                : scanResult?.severity === 'moderate' || scanResult?.severity === 'high'
                                ? '#FF9800'
                                : '#4CAF50',
                          },
                        ]}
                      />
                      <Text style={styles.capturedBadgeText} numberOfLines={1}>
                        {scanResult
                          ? `${scanResult.disease || 'Healthy'} (${scanResult.confidence}%)`
                          : 'Photo Captured'}
                      </Text>
                      <View style={styles.capturedBadgeAction}>
                        <Text style={styles.capturedBadgeActionText}>View Details</Text>
                        <Ionicons name="chevron-forward" size={12} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Animated.View
                    style={[
                      styles.focusFrame,
                      { transform: [{ scale: isAnalyzing ? 1 : scaleAnim }] },
                    ]}
                  >
                    {!isAnalyzing && (
                      <>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                      </>
                    )}

                    {selectedMode === 'scan' && !isAnalyzing && (
                      <View style={styles.scanLineTrack}>
                        <Animated.View
                          style={[
                            styles.scanLine,
                            {
                              transform: [
                                {
                                  translateY: scanLineAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-110, 110],
                                  }),
                                },
                              ],
                            },
                          ]}
                        />
                      </View>
                    )}

                    {isAnalyzing && (
                      <View style={styles.analyzingWrap} pointerEvents="none">
                        <Text style={[styles.scanningText, { color: analyzingColor }]}>
                          {ANALYZING_MESSAGES[analyzingStep]}
                        </Text>
                        <View style={styles.analyzingProgressTrack}>
                          <Animated.View
                            style={[
                              styles.analyzingProgressFill,
                              {
                                backgroundColor: analyzingColor,
                                width: progressAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['0%', '100%'],
                                }),
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </Animated.View>
                )}

                {!isAnalyzing && !lastPhotoUri && (
                  <Text style={styles.focusHintText}>
                    {selectedMode === 'scan'
                      ? 'Center your chicken inside the frame'
                      : 'Point the camera at your chicken and fill the frame'}
                  </Text>
                )}
              </View>

              <View style={styles.controlDeck}>
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

                {/* Part selector: placed cleanly above PHOTO | SCAN strip, disappears only during active shutter / analyzing */}
                {selectedMode === 'photo' && !isAnalyzing && !checkingCapture && (
                  <View style={styles.partSelectorContainer}>
                    <View style={styles.partSelectorPill}>
                      {PART_MODULES.map((part) => {
                        const active = selectedPart === part.id;
                        return (
                          <TouchableOpacity
                            key={part.id}
                            style={[styles.partOption, active && styles.partOptionActive]}
                            onPress={() => setSelectedPart(part.id)}
                            activeOpacity={0.75}
                          >
                            {part.iconFamily === 'Ionicons' ? (
                              <Ionicons
                                name={part.iconName as any}
                                size={13}
                                color={active ? '#FFD54F' : 'rgba(255,255,255,0.65)'}
                              />
                            ) : (
                              <MaterialCommunityIcons
                                name={part.iconName as any}
                                size={14}
                                color={active ? '#FFD54F' : 'rgba(255,255,255,0.65)'}
                              />
                            )}
                            <Text style={[styles.partOptionText, active && styles.partOptionTextActive]}>
                              {part.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={styles.modeStrip}>
                  {cameraModes.map((mode) => {
                    const active = selectedMode === mode.id;
                    return (
                      <TouchableOpacity
                        key={mode.id}
                        onPress={() => {
                          if (mode.id === 'scan') handleScanPress();
                          else setSelectedMode('photo');
                        }}
                        activeOpacity={0.8}
                        style={styles.modeStripItem}
                      >
                        <Text style={[styles.modeStripText, active && styles.modeStripTextActive]}>{mode.label}</Text>
                        {active && <View style={styles.modeStripUnderline} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedMode === 'photo' && (
                  <View style={styles.shutterRow}>
                    {lastPhotoUri && !checkingCapture ? (
                      <View style={styles.reviewBar}>
                        <TouchableOpacity
                          style={styles.reviewRetakeBtn}
                          onPress={clearPendingCapture}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="refresh" size={18} color="#fff" />
                          <Text style={styles.reviewRetakeText}>Retake</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.reviewViewBtn}
                          onPress={() => setShowResultModal(true)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="eye" size={18} color="#1A1A1A" />
                          <Text style={styles.reviewViewText}>View Result</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.reviewSaveBtn, isSavingScan && { opacity: 0.6 }]}
                          onPress={handleSaveScanResult}
                          disabled={isSavingScan}
                          activeOpacity={0.85}
                        >
                          {isSavingScan ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={18} color="#fff" />
                              <Text style={styles.reviewSaveText}>Save</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={handleShutterPress}
                        activeOpacity={0.9}
                        disabled={checkingCapture || scanning}
                      >
                        <Animated.View style={[styles.shutterOuterRing, { transform: [{ scale: shutterAnim }] }]}>
                          <View style={[styles.shutterInner, { backgroundColor: '#fff' }]}>
                            {isAnalyzing ? (
                              <ActivityIndicator color="#1a1a1a" size="small" />
                            ) : (
                              <Ionicons name="camera" size={30} color="#1a1a1a" />
                            )}
                          </View>
                        </Animated.View>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Scan mode is QR-only — no shutter, just a hint while
                    the live barcode scanner (onBarcodeScanned) does its
                    work in the background. */}

                {/* Scan mode is QR-only now — no shutter, just a hint
                      while the live barcode scanner (onBarcodeScanned)
                      does its work in the background. */}
                {selectedMode === 'scan' && (
                  <View style={styles.shutterRow}>
                    <Text style={styles.scanHintText}>Point the camera at a chicken's QR tag</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>

      <Modal animationType="fade" transparent visible={showDetectionAlert} onRequestClose={() => setShowDetectionAlert(false)}>
        <View style={styles.detectionOverlay}>
          <View style={[styles.detectionAlertCard, { maxWidth: MAX_PHONE_WIDTH - 60 }]}>
            <View style={styles.detectionAlertIconCircle}>
              <Ionicons name="alert-circle" size={38} color="#fff" />
            </View>
            <Text style={styles.detectionAlertTitle}>Chicken Not Detected</Text>
            <Text style={styles.detectionAlertMessage}>{detectionAlertMessage}</Text>
            <TouchableOpacity style={styles.detectionAlertButton} onPress={() => setShowDetectionAlert(false)} activeOpacity={0.85}>
              <Text style={styles.detectionAlertButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ImageQualityGuide
        visible={showQualityGuide}
        onClose={() => setShowQualityGuide(false)}
        scanType={selectedPart === 'eye' ? 'head' : selectedPart === 'wing' ? 'wing' : 'full'}
      />

      {/* Scanned Chicken Tag Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={showScannedTagModal}
        onRequestClose={() => {
          setShowScannedTagModal(false);
          barcodeLockRef.current = false;
        }}
      >
        <View style={styles.detectionOverlay}>
          <View style={[styles.scannedTagCard, { maxWidth: MAX_PHONE_WIDTH - 40 }]}>
            <View style={styles.scannedTagHeaderRow}>
              <View style={styles.scannedTagIconCircle}>
                <Ionicons name="qr-code" size={24} color="#2E7D32" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.scannedTagTitle}>Chicken Tag Detected</Text>
                <Text style={styles.scannedTagSubtitle}>
                  {scannedTagInfo?.chickenObj ? 'Verified in your flock' : 'Unregistered QR Tag'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowScannedTagModal(false);
                  barcodeLockRef.current = false;
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Chicken Details Card */}
            <View style={styles.scannedTagDetailsBox}>
              <View style={styles.scannedTagAvatarWrap}>
                {scannedTagInfo?.photoUrl ? (
                  <Image source={{ uri: scannedTagInfo.photoUrl }} style={styles.scannedTagAvatar} />
                ) : (
                  <View style={styles.scannedTagAvatarPlaceholder}>
                    <ChickenIcon size={26} color="#2E7D32" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.scannedTagName} numberOfLines={1}>
                  {scannedTagInfo?.name || 'Unknown Chicken'}
                </Text>
                <View style={styles.scannedTagMetaRow}>
                  <View style={styles.scannedTagPill}>
                    <Text style={styles.scannedTagPillText}>Tag: {scannedTagInfo?.chickenId}</Text>
                  </View>
                  <View style={styles.scannedFarmPill}>
                    <Ionicons name="location-outline" size={11} color="#666" />
                    <Text style={styles.scannedFarmPillText} numberOfLines={1}>
                      {scannedTagInfo?.farmName || 'Unassigned'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.scannedTagActionCol}>
              {scannedTagInfo?.chickenObj ? (
                <>
                  <TouchableOpacity
                    style={styles.scannedTagPrimaryBtn}
                    onPress={() => {
                      if (scannedTagInfo.chickenObj) {
                        setSelectedChicken(scannedTagInfo.chickenObj);
                      }
                      setShowScannedTagModal(false);
                      setSelectedMode('photo');
                      setTimeout(() => {
                        barcodeLockRef.current = false;
                      }, 400);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="camera" size={18} color="#fff" />
                    <Text style={styles.scannedTagPrimaryText}>Take Health Scan</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.scannedTagSecondaryBtn}
                    onPress={() => {
                      setShowScannedTagModal(false);
                      barcodeLockRef.current = false;
                      router.push(`/chicken/${scannedTagInfo.chickenObj.id}`);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="document-text-outline" size={18} color="#2E7D32" />
                    <Text style={styles.scannedTagSecondaryText}>View Profile & History</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.scannedTagPrimaryBtn}
                  onPress={() => {
                    setShowScannedTagModal(false);
                    barcodeLockRef.current = false;
                    setNewChicken({
                      name: scannedTagInfo?.name || '',
                      photo: null,
                      farmId: null,
                    });
                    setPendingChicken({
                      chickenId: scannedTagInfo?.chickenId || '',
                      name: scannedTagInfo?.name || '',
                      farmId: null,
                      photo: null,
                    });
                    setShowAddForm(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={styles.scannedTagPrimaryText}>Register Chicken with this Tag</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.scannedTagDismissBtn}
                onPress={() => {
                  setShowScannedTagModal(false);
                  setTimeout(() => {
                    barcodeLockRef.current = false;
                  }, 800);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.scannedTagDismissText}>Scan Another Tag</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Scan result modal */}
      <Modal animationType="slide" transparent visible={showResultModal} onRequestClose={() => setShowResultModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.verifySheet, { backgroundColor: CAPTURE_FORM_COLORS.card, maxWidth: MAX_PHONE_WIDTH, width: '100%', alignSelf: 'center' }]}>
            <View style={[styles.verifyHeader, { borderBottomColor: CAPTURE_FORM_COLORS.divider }]}>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.verifyTitle, { color: CAPTURE_FORM_COLORS.text }]}>Scan Result</Text>
                <Text style={[styles.verifySubtitle, { color: CAPTURE_FORM_COLORS.textLight }]}>
                  {selectedChicken ? `For ${selectedChicken.chicken_name}` : 'AI health check summary'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowResultModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={CAPTURE_FORM_COLORS.textLight} />
              </TouchableOpacity>
            </View>

            {scanResult && (
              <ScrollViewResultContent
                scanResult={scanResult}
                onSave={handleSaveScanResult}
                onClose={() => setShowResultModal(false)}
                isSaving={isSavingScan}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* "Is this a new chicken?" prompt — only reached when no chicken was
          preselected before capturing. */}
      <Modal animationType="fade" transparent visible={showNewOrExistingModal} onRequestClose={() => setShowNewOrExistingModal(false)}>
        <View style={styles.detectionOverlay}>
          <View style={[styles.newOrExistingCard, { maxWidth: MAX_PHONE_WIDTH - 60 }]}>
            <View style={styles.newOrExistingIconCircle}>
              <Ionicons name="help-circle" size={32} color="#fff" />
            </View>
            <Text style={styles.newOrExistingTitle}>Is this a new chicken?</Text>
            <Text style={styles.newOrExistingMessage}>
              You didn't pick a chicken before capturing. Let us know so this scan is saved to the right profile.
            </Text>
            <TouchableOpacity style={styles.newOrExistingPrimaryBtn} onPress={handleChooseNewChicken} activeOpacity={0.85}>
              <Text style={styles.newOrExistingPrimaryText}>Yes, it's a new chicken</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newOrExistingSecondaryBtn} onPress={handleChooseExistingChicken} activeOpacity={0.85}>
              <Text style={styles.newOrExistingSecondaryText}>No, pick an existing chicken</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Chicken picker — shared by the pre-capture pill and the post-capture
          "existing chicken" branch. */}
      <Modal animationType="slide" transparent visible={showChickenPicker} onRequestClose={() => setShowChickenPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: CAPTURE_FORM_COLORS.card, maxWidth: MAX_PHONE_WIDTH, width: '100%', alignSelf: 'center' }]}>
            <View style={[styles.verifyHeader, { borderBottomColor: CAPTURE_FORM_COLORS.divider }]}>
              <Text style={[styles.verifyTitle, { color: CAPTURE_FORM_COLORS.text }]}>Select a Chicken</Text>
              <TouchableOpacity onPress={() => setShowChickenPicker(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={CAPTURE_FORM_COLORS.textLight} />
              </TouchableOpacity>
            </View>

            {chickens.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: CAPTURE_FORM_COLORS.textSecondary, textAlign: 'center' }}>
                  You don't have any chickens yet.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 12 }}>
                {chickens.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chickenPickRow, { borderBottomColor: CAPTURE_FORM_COLORS.divider }]}
                    onPress={() => handleChickenPicked(c)}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: CAPTURE_FORM_COLORS.text, fontWeight: '700', fontSize: 14 }}>
                        {c.chicken_name}
                      </Text>
                      <Text style={{ color: CAPTURE_FORM_COLORS.textLight, fontSize: 11, marginTop: 2 }}>
                        {c.qr_code} · {getFarmName(farms, c.farm_id)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={CAPTURE_FORM_COLORS.textLight} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <AddChickenModal
        visible={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSubmit={handleGenerateChickenPreview}
        form={newChicken}
        onChange={setNewChicken}
        onPickPhoto={handlePickChickenPhoto}
        colors={CAPTURE_FORM_COLORS}
        submitLabel="Save & Generate QR"
        maxWidth={MAX_PHONE_WIDTH}
      />

      <Modal animationType="slide" transparent visible={showQRModal} onRequestClose={() => setShowQRModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.verifySheet, { backgroundColor: CAPTURE_FORM_COLORS.card, maxWidth: MAX_PHONE_WIDTH, width: '100%', alignSelf: 'center' }]}>
            <View style={[styles.verifyHeader, { borderBottomColor: CAPTURE_FORM_COLORS.divider }]}>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.verifyTitle, { color: CAPTURE_FORM_COLORS.text }]}>Verify & Save</Text>
                <Text style={[styles.verifySubtitle, { color: CAPTURE_FORM_COLORS.textLight }]}>Confirm details before adding to your flock</Text>
              </View>
              <TouchableOpacity onPress={() => setShowQRModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={CAPTURE_FORM_COLORS.textLight} />
              </TouchableOpacity>
            </View>

            {pendingChicken && (
              <ScrollViewVerifyBody
                pendingChicken={pendingChicken}
                colors={CAPTURE_FORM_COLORS}
                qrRef={qrRef}
                onShare={handleShareQR}
                onDownload={handleDownloadQR}
                farms={farms}
              />
            )}

            <View style={[styles.verifyFooter, { borderTopColor: CAPTURE_FORM_COLORS.divider }]}>
              <TouchableOpacity style={[styles.verifyCancelButton, { borderColor: CAPTURE_FORM_COLORS.border }]} onPress={() => setShowQRModal(false)} activeOpacity={0.75}>
                <Text style={[styles.verifyCancelText, { color: CAPTURE_FORM_COLORS.textSecondary }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.verifyConfirmButton, { backgroundColor: CAPTURE_FORM_COLORS.primary, opacity: isCreatingChicken ? 0.6 : 1 }]}
                onPress={handleConfirmSave}
                disabled={isCreatingChicken}
                activeOpacity={0.85}
              >
                {isCreatingChicken ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.verifyConfirmText}>Confirm & Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ScrollViewResultContent({ scanResult, onSave, onClose, isSaving }: any) {
  const isHealthy = !scanResult.disease;

  const recommendations = isHealthy
    ? ['Continue regular monitoring', 'Optimal health markers observed', 'Next scan recommended in 7 days']
    : ['Isolate affected chicken immediately', 'Disinfect coop & waterers', 'Consult a licensed poultry veterinarian'];

  const getSeverityBadge = (severity: string) => {
    const s = (severity || '').toLowerCase();
    if (s === 'critical') return { bg: '#FFEBEE', text: '#D32F2F', label: 'CRITICAL' };
    if (s === 'high') return { bg: '#FFF3E0', text: '#E65100', label: 'HIGH' };
    if (s === 'moderate') return { bg: '#FFF8E1', text: '#F57F17', label: 'MODERATE' };
    return { bg: '#E8F5E9', text: '#2E7D32', label: 'NONE (HEALTHY)' };
  };

  const badge = getSeverityBadge(scanResult.severity || 'none');
  const moduleLabel = scanResult.module === 'wing' ? '🪶 Wing & Body Region' : '👁️ Head & Eye Region';

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.verifyBody} contentContainerStyle={{ paddingBottom: 16 }}>
      <View style={styles.resultStatusRow}>
        <View style={[styles.resultStatusDot, { backgroundColor: isHealthy ? '#4CAF50' : '#D32F2F' }]} />
        <Text style={[styles.resultStatusText, { color: isHealthy ? '#4CAF50' : '#D32F2F' }]}>
          {isHealthy ? 'Healthy Gamefowl' : 'Condition Detected'}
        </Text>
      </View>

      {/* Auto-focused region indicator */}
      <View style={styles.autoFocusPill}>
        <Ionicons name="scan-circle-outline" size={15} color="#1565C0" />
        <Text style={styles.autoFocusText}>AI Auto-Focused: {moduleLabel}</Text>
      </View>

      {/* Critical alert banner */}
      {scanResult.highConfidenceAlert && (
        <View style={styles.highAlertBanner}>
          <Ionicons name="warning" size={18} color="#D32F2F" />
          <Text style={styles.highAlertText}>
            High-Confidence Alert ({scanResult.confidence}%). Immediate attention recommended.
          </Text>
        </View>
      )}

      <Text style={styles.verifySectionLabel}>DETECTION SUMMARY</Text>
      <View style={styles.recordList}>
        <View style={styles.recordRow}>
          <Text style={styles.recordLabel}>Analyzed Region</Text>
          <Text style={[styles.recordValue, { fontWeight: '700' }]}>{moduleLabel}</Text>
        </View>
        <View style={styles.recordRow}>
          <Text style={styles.recordLabel}>Confidence</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.recordValue, { fontWeight: '700' }]}>{scanResult.confidence}%</Text>
            {scanResult.confidenceLevel && (
              <View style={styles.confBadge}>
                <Text style={styles.confBadgeText}>{scanResult.confidenceLevel}</Text>
              </View>
            )}
          </View>
        </View>
        {scanResult.disease && (
          <View style={styles.recordRow}>
            <Text style={styles.recordLabel}>Detected Disease</Text>
            <Text style={[styles.recordValue, { color: '#D32F2F', fontWeight: '700' }]}>{scanResult.disease}</Text>
          </View>
        )}
        <View style={styles.recordRow}>
          <Text style={styles.recordLabel}>Severity Level</Text>
          <View style={[styles.severityBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.severityBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
        <View style={[styles.recordRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.recordLabel}>Observed Indicators</Text>
          <Text style={[styles.recordValue, { flex: 1, textAlign: 'right', marginLeft: 10 }]}>
            {scanResult.symptoms.join(', ')}
          </Text>
        </View>
      </View>

      <Text style={styles.verifySectionLabel}>RECOMMENDED ACTIONS</Text>
      <View style={styles.recordList}>
        {recommendations.map((line, i) => (
          <View
            key={line}
            style={[styles.recordRow, i === recommendations.length - 1 && { borderBottomWidth: 0 }]}
          >
            <Ionicons name="checkmark-circle" size={16} color={isHealthy ? "#2E7D32" : "#D32F2F"} />
            <Text style={[styles.recordValue, { marginLeft: 8, flex: 1 }]}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={styles.resultFooterRow}>
        <TouchableOpacity style={styles.verifyCancelButton} onPress={onClose} activeOpacity={0.75}>
          <Text style={styles.verifyCancelText}>Close</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.verifyConfirmButton, isSaving && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.verifyConfirmText}>Save Result</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function ScrollViewVerifyBody({ pendingChicken, colors, qrRef, onShare, onDownload, farms }: any) {
  const qrValue = JSON.stringify({
    chickenId: pendingChicken.chickenId,
    name: pendingChicken.name,
  });

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.verifyBody} contentContainerStyle={{ paddingBottom: 8 }}>
      <View style={[styles.idCard, { borderColor: colors.divider, backgroundColor: colors.background }]}>
        <View style={[styles.qrSquare, { borderColor: colors.border }]}>
          <QRCode value={qrValue} size={64} getRef={(c: any) => (qrRef.current = c)} />
        </View>
        <View style={styles.idCardInfo}>
          <Text style={[styles.idCardTag, { color: colors.textLight }]}>CHICKEN ID</Text>
          <Text style={[styles.idCardId, { color: colors.text }]}>{pendingChicken.chickenId}</Text>
          <View style={styles.idCardActions}>
            <TouchableOpacity style={[styles.idCardActionBtn, { borderColor: colors.border }]} onPress={onShare}>
              <Ionicons name="share-social-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.idCardActionText, { color: colors.textSecondary }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.idCardActionBtn, { borderColor: colors.border }]} onPress={onDownload}>
              <Ionicons name="download-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.idCardActionText, { color: colors.textSecondary }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={[styles.verifySectionLabel, { color: colors.textLight, borderTopColor: colors.divider }]}>
        CHICKEN DETAILS
      </Text>
      <View style={[styles.recordList, { borderColor: colors.divider }]}>
        {[
          { label: 'Name', value: pendingChicken.name },
          { label: 'Farm', value: getFarmName(farms, pendingChicken.farmId) },
        ].map((row, index, arr) => (
          <View
            key={row.label}
            style={[
              styles.recordRow,
              { borderBottomColor: colors.divider },
              index === arr.length - 1 && { borderBottomWidth: 0 },
            ]}
          >
            <Text style={[styles.recordLabel, { color: colors.textLight }]}>{row.label}</Text>
            <Text style={[styles.recordValue, { color: colors.text }]}>{row.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  letterbox: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    flex: 1,
    width: '100%',
  },
  phoneFrameElevated: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 8,
    borderColor: '#111',
    marginVertical: 24,
  },

  guestBlockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  guestBlockIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  guestBlockTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  guestBlockText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  guestBlockButton: { width: '100%', maxWidth: 400, borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  guestBlockButtonGradient: { paddingVertical: 15, alignItems: 'center' },
  guestBlockButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  guestBlockSecondaryButton: {
    width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#2E7D32', borderRadius: 30,
    paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  guestBlockSecondaryText: { color: '#4CAF50', fontSize: 15, fontWeight: '600' },
  guestBlockBackButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  guestBlockBackText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },

  viewfinder: {
    flex: 1,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  // Everything drawn on top of the camera now lives here, as a SIBLING of
  // CameraView rather than a child — expo-camera's CameraView does not
  // reliably support overlay children (see the "does not support
  // children" warning), which was causing the top bar and other overlays
  // to intermittently vanish, especially right after a capture.
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#fff',
    zIndex: 4,
  },

  scanHintText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Darkens the frozen photo just enough that the top bar and analyzing
  // UI stay readable regardless of how bright the captured shot is.
  frozenPhotoScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  gridOverlay: { ...StyleSheet.absoluteFill },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.14)' },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.14)' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 14 : 32,
    paddingBottom: 6,
    zIndex: 5,
  },
  topIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topIconButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  topRightCluster: { flexDirection: 'row', gap: 8 },
  topCenterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  recDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FF5252' },
  topCenterText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  // --- Chicken selection pill (below the top bar) ---
  chickenSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 5,
  },
  chickenSelectPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  chickenSelectText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
  chickenSelectClear: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },

  focusArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  focusFrame: {
    width: '76%',
    aspectRatio: 1,
    maxWidth: 300,
    maxHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#FFD54F',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 6 },
  scanLineTrack: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  scanLine: {
    width: '82%',
    height: 2,
    backgroundColor: '#4DA3FF',
    shadowColor: '#4DA3FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  analyzingWrap: {
    position: 'absolute',
    bottom: -52,
    alignItems: 'center',
    width: 220,
  },
  scanningText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
    marginBottom: 8,
  },
  analyzingProgressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  analyzingProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  focusHintText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  controlDeck: {
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 30 : 22,
    zIndex: 5,
  },
  partSelectorContainer: {
    alignItems: 'center',
    marginBottom: 14,
  },
  partSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  partOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
  },
  partOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  partOptionText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
  },
  partOptionTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  modeStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
    marginBottom: 18,
  },
  modeStripItem: { alignItems: 'center', paddingBottom: 6 },
  modeStripText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  modeStripTextActive: { color: '#fff' },
  modeStripUnderline: {
    marginTop: 6,
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFD54F',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  reviewRetakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  reviewRetakeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  reviewViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFD54F',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  reviewViewText: {
    color: '#1A1A1A',
    fontSize: 13,
    fontWeight: '800',
  },
  reviewSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  reviewSaveText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  capturedPreviewNotice: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  capturedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.68)',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  capturedStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  capturedBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  capturedBadgeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  capturedBadgeActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  shutterOuterRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },

  detectionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  detectionAlertCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderTopWidth: 5,
    borderTopColor: '#D32F2F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  detectionAlertIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D32F2F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  detectionAlertTitle: { fontSize: 18, fontWeight: '800', color: '#D32F2F', marginBottom: 8, textAlign: 'center' },
  detectionAlertMessage: {
    fontSize: 14,
    color: '#D32F2F',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  detectionAlertButton: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  detectionAlertButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // --- "Is this a new chicken?" prompt ---
  newOrExistingCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  newOrExistingIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  newOrExistingTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  newOrExistingMessage: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  newOrExistingPrimaryBtn: {
    width: '100%',
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 10,
  },
  newOrExistingPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  newOrExistingSecondaryBtn: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#2E7D32',
    paddingVertical: 13,
    borderRadius: 30,
    alignItems: 'center',
  },
  newOrExistingSecondaryText: { color: '#2E7D32', fontSize: 14, fontWeight: '700' },

  // --- Chicken picker sheet ---
  pickerSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' },
  chickenPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  verifySheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' },
  verifyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  verifyTitle: { fontSize: 17, fontWeight: '700' },
  verifySubtitle: { fontSize: 12, marginTop: 3 },
  verifyBody: { paddingHorizontal: 20 },

  idCard: {
    flexDirection: 'row', gap: 14, alignItems: 'center', borderWidth: 1, borderRadius: 12,
    padding: 14, marginTop: 16,
  },
  qrSquare: {
    width: 76, height: 76, borderRadius: 8, borderWidth: 1.5, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  idCardInfo: { flex: 1 },
  idCardTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  idCardId: { fontSize: 18, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  idCardActions: { flexDirection: 'row', gap: 8 },
  idCardActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  idCardActionText: { fontSize: 11, fontWeight: '600' },

  verifySectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: '#999', marginTop: 20, marginBottom: 10,
    paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee',
  },
  recordList: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, paddingHorizontal: 14 },
  recordRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  recordLabel: { fontSize: 13, fontWeight: '600', color: '#666' },
  recordValue: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },

  verifyFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 18, borderTopWidth: 1 },
  verifyCancelButton: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  verifyCancelText: { fontSize: 14, fontWeight: '600', color: '#555' },
  verifyConfirmButton: { flex: 2, flexDirection: 'row', gap: 8, backgroundColor: '#2E7D32', borderRadius: 8, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  verifyConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  resultStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 18 },
  resultStatusDot: { width: 10, height: 10, borderRadius: 5 },
  resultStatusText: { fontSize: 19, fontWeight: '700' },
  resultFooterRow: { flexDirection: 'row', gap: 10, marginTop: 22, marginBottom: 20 },

  // --- Auto-Focus & Diagnostic Parity Badges ---
  autoFocusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BBDEFB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  autoFocusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1565C0',
  },
  highAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  highAlertText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
    flex: 1,
  },
  confBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // --- Scanned Tag Modal Styles ---
  scannedTagCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  scannedTagHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scannedTagIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedTagTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1B5E20',
  },
  scannedTagSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  scannedTagDetailsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FBF9',
    borderWidth: 1,
    borderColor: '#E8EFE8',
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  scannedTagAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8F5E9',
  },
  scannedTagAvatar: {
    width: '100%',
    height: '100%',
  },
  scannedTagAvatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedTagName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  scannedTagMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  scannedTagPill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scannedTagPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  scannedFarmPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  scannedFarmPillText: {
    fontSize: 11,
    color: '#666',
  },
  scannedTagActionCol: {
    gap: 10,
  },
  scannedTagPrimaryBtn: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  scannedTagPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  scannedTagSecondaryBtn: {
    backgroundColor: '#F1F8F1',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  scannedTagSecondaryText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '700',
  },
  scannedTagDismissBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  scannedTagDismissText: {
    color: '#777',
    fontSize: 13,
    fontWeight: '600',
  },
});