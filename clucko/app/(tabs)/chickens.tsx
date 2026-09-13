import { useDarkMode } from '@/context/DarkModeContext';
import { useNotifications } from '@/context/NotificationContext';
import { getHealthStatus, getStatusColor } from '@/utils/birdStatus';
import { addChickenForCurrentUser, loadChickensForCurrentUser } from '@/utils/chickenStorage';
import { getUserRole, apiGetFarms } from '../../lib/api';
import { apiGetReports } from '../../lib/api';
import { checkIsGuestMode, GUEST_SAMPLE_CHICKENS } from '@/utils/guestMode';
import { persistChickenPhoto } from '@/utils/photoStorage';
import { Feather, FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from "expo-router/react-navigation";
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library/legacy';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import AddChickenModal, { ChickenFormData } from '../../components/ui/AddChickenModal';
import ChickenAvatar from '../../components/ui/ChickenAvatar';
import ChickenIcon from '../../components/ui/ChickenIcon';
import GuestBlockModal from '../../components/ui/GuestBlockModal';

// Accent color used only for the active "Overview" toggle tab and the
// add-chicken FAB, matching the mockup's amber/gold accent. Every other
// color on this screen (header green, per-status greens/oranges/reds)
// is unchanged.
const ACCENT = '#FFC107';
const ACCENT_ICON = '#3A2E00';

const MAX_CONTENT_WIDTH = 520;

// WORKAROUND: in this project's TS setup, `File` from expo-file-system
// doesn't resolve its inherited members (`write`, `uri`, etc.) — those are
// declared on a base class that `File` extends via a dynamic property-
// based extends clause (`class File extends ExpoFileSystem.FileSystemFile`)
// inside expo-file-system's own .d.ts files. That pattern isn't resolving
// correctly here even with the correct workspace TypeScript version
// selected, so `new ExpoFile(...)` reports missing members that verifiably
// exist and work at runtime (confirmed directly against expo-file-system's
// ExpoFileSystem.types.d.ts). This alias casts to `any` at the point of
// construction so captureQrToFile below can use the real, documented API
// without fighting the type checker. Purely a types-visibility
// workaround — runtime behavior is unchanged.
const ExpoFileAny = ExpoFile as any;

// Shape of a saved chicken record. Breed/age/weight/location/color are gone
// — a chicken now belongs to a farm (farmId) instead, managed via
// AddChickenModal and kept in sync with Manage Farms through utils/farms.
type Bird = {
  id: string;
  name: string;
  chickenId: string;
  status: string;
  statusColor: string;
  farmId?: string | null;
  lastScan: string;
  healthStatus: string;
  imageKey?: string;
  photo?: string | null;
  dateAdded?: string;
};

type HealthAlert = {
  id: string;
  name: string;
  status: string;
  condition: string;
  date: string;
  statusColor: string;
  // Carries the real uploaded photo (if any) through from the source
  // Bird record, so alert cards show the actual chicken instead of
  // ever falling back to bundled placeholder art.
  photo?: string | null;
  chickenId?: string;
};

type ScanHistoryItem = {
  id: string;
  chickenId: string;
  chickenName: string;
  scanType: string;
  result: string;
  status: string;
  statusColor: string;
  confidence: string;
  date: string;
  time: string;
  condition: string;
};

// Options for the "Sort by" control on the All Birds list. Purely a
// display-order preference — it never changes which birds are shown,
// only the order filteredBirds render in.
type SortOption = 'recent' | 'name' | 'status';

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'recent', label: 'Recently Scanned' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'status', label: 'Status' },
];

// Order used when sorting by status: worst-first, so Critical birds
// surface at the top of the list.
const STATUS_SORT_WEIGHT: Record<string, number> = {
  Critical: 0,
  Warning: 1,
  Healthy: 2,
  Unknown: 3,
};

// NOTE: the bundled CK-00X sample images have been removed. A chicken's
// image now comes exclusively from its own uploaded `photo` field. Nothing
// in this screen falls back to the app logo or bundled sample art anymore
// — ChickenAvatar renders a neutral kiwi-bird placeholder instead when a
// bird has no photo yet.

// Derives the "Active Health Alerts" list from a set of Bird records.
// Shared by both the real-account load path and the guest sample path so
// the two never drift out of sync with each other.
const buildHealthAlerts = (chickensData: Bird[]): HealthAlert[] =>
  chickensData
    .filter((chicken) => {
      const normalized = getHealthStatus(chicken);
      return normalized === 'Warning' || normalized === 'Critical';
    })
    .map((chicken) => {
      const normalized = getHealthStatus(chicken);
      return {
        id: chicken.id,
        name: chicken.name,
        status: chicken.status || normalized.toUpperCase(),
        condition: normalized === 'Critical' ? 'Critical condition detected' : 'Warning signs observed',
        date: chicken.lastScan || new Date().toLocaleDateString(),
        statusColor: getStatusColor(chicken),
        photo: chicken.photo,
        chickenId: chicken.chickenId,
      };
    });

  interface Farm {
  id: number;
  farm_name: string;
  farm_location: string;
}

const getFarmName = (farms: Farm[], farmId?: number | string | null): string => {
  if (!farmId) return 'Unassigned';
  const farm = farms.find((f) => String(f.id) === String(farmId));
  return farm ? farm.farm_name : 'Unassigned';
};

export default function ChickensScreen() {
  const { colors, isDarkMode } = useDarkMode();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH);

  // Global notification popup — notify() persists the notification AND
  // pops the banner immediately, no matter which tab is currently open.
  // Same pattern already used in farm/[id].tsx and farm/index.tsx.
  const { notify } = useNotifications();

  const [activeTab, setActiveTab] = useState('all');
  const [userRole, setUserRole] = useState<string>('owner');
  const [showFarmLocation, setShowFarmLocation] = useState(false);
  const [selectedBird, setSelectedBird] = useState<ScanHistoryItem | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedFarmFilter, setSelectedFarmFilter] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScanDetailModal, setShowScanDetailModal] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<Bird | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allBirds, setAllBirds] = useState<Bird[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [healthAlerts, setHealthAlerts] = useState<HealthAlert[]>([]);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [newChicken, setNewChicken] = useState<ChickenFormData>({
    name: '',
    photo: null,
    farmId: null,
  });
  const [isSavingChicken, setIsSavingChicken] = useState(false);

  // Filter icon next to the search bar — same underlying filter as the
  // stat cards below (handleStatusFilter), just a second way to reach it,
  // matching the search+filter affordance in the new design.
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  // "Sort by" control above the All Birds list — display order only.
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const qrRef = useRef<any>(null);

  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestFeature, setGuestFeature] = useState('this feature');

  const guestAlert = (featureLabel: string = 'this feature') => {
    setGuestFeature(featureLabel);
    setGuestModalVisible(true);
  };

const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);

const loadScanHistory = async () => {
  try {
    const data = await apiGetReports();
    const mapped: ScanHistoryItem[] = (data.scans || []).map((s: any) => {
      const isHealthy = !s.predicted_condition || s.predicted_condition.toLowerCase() === 'healthy';
      const severity = (s.severity_level || 'none').toLowerCase();
      const status = severity === 'critical' ? 'CRITICAL' : severity === 'none' ? 'HEALTHY' : 'WARNING';
      const statusColor = status === 'CRITICAL' ? '#f44336' : status === 'WARNING' ? '#FF9800' : '#4CAF50';
      const dt = s.capture_datetime ? new Date(s.capture_datetime) : null;

      return {
        id: String(s.id),
        chickenId: s.qr_code,
        chickenName: s.chicken_name,
        scanType: s.image_type === 'wing' ? 'Wing Capture' : s.image_type === 'eye' ? 'Eye Capture' : 'Full Body Capture',
        result: isHealthy ? 'Normal' : 'Detected',
        status,
        statusColor,
        confidence: s.confidence_score != null ? `${Math.round(s.confidence_score)}%` : '—',
        date: dt ? dt.toISOString().split('T')[0] : '',
        time: dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        condition: isHealthy ? 'No issues detected' : s.predicted_condition,
      };
    });
    setScanHistory(mapped);
  } catch (error) {
    console.error('Error loading scan history:', error);
  }
};

  useFocusEffect(
  useCallback(() => {
    loadChickens();
    checkGuestMode();
    refreshFarms();
    loadScanHistory();
  }, [])
);

useEffect(() => {
  loadChickens();
  requestPermissions();
  checkGuestMode();
  refreshFarms();
  loadScanHistory();
}, []);

  const refreshFarms = async () => {
  try {
    const list = await apiGetFarms();
    setFarms(list || []);
  } catch (error) {
    console.error('Error loading farms:', error);
    setFarms([]);
  }
  const role = await getUserRole();
  setUserRole(role);
};

  // Drives the isGuestMode state used for gating actions (add chicken,
  // manage farms, etc.) in this screen's buttons.
  const checkGuestMode = async () => {
    const guest = await checkIsGuestMode();
    setIsGuestMode(guest);
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        notify({
          title: 'Permission Needed',
          message: 'Please grant camera roll permissions to add photos.',
          type: 'warning',
        });
      }
    }
  };

  // Picks a photo from the device, then immediately copies it into this
  // app's own permanent storage (see utils/photoStorage) before saving
  // the resulting stable uri into form state. Without this, the raw
  // picker uri can go stale by the time the app reloads it from
  // AsyncStorage, leaving the chicken's photo blank everywhere it's used.
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      const permanentUri = await persistChickenPhoto(result.assets[0].uri);
      setNewChicken({ ...newChicken, photo: permanentUri });
    }
  };

  // Looks up the real saved Bird record for a given chickenId and returns
  // its uploaded photo uri, or null if there isn't one. Never falls back
  // to bundled sample art or the app logo — ChickenAvatar (used by every
  // caller of this helper) handles the "no photo yet" placeholder itself.
  const getBirdImageForChickenId = (chickenId?: string): string | null => {
    if (chickenId) {
      const match = allBirds.find((b) => b.chickenId === chickenId);
      if (match?.photo) {
        return match.photo;
      }
    }
    return null;
  };

  // Health alerts are now derived through getHealthStatus() rather than a
  // raw `chicken.status === 'WARNING'` check, so a saved record that only
  // has `healthStatus` set (and not `status`) still surfaces here.
  //
  // Guest mode NEVER reads the real chicken storage — it always renders
  // the static GUEST_SAMPLE_CHICKENS instead, so a real account's flock
  // can never leak into a guest session on the same device (and a guest
  // session's lack of data never wipes out a real account's flock either,
  // since guest mode never writes here at all).
  //
  // Real accounts now go through loadChickensForCurrentUser(), which
  // scopes storage per logged-in email (with automatic migration off the
  // old shared 'chickens' key) — so one account's flock can never be
  // wiped out or overwritten by another account's signup/login on the
  // same device.
  const loadChickens = async () => {
    try {
      const guest = await checkIsGuestMode();
      if (guest) {
        const guestBirds = GUEST_SAMPLE_CHICKENS as Bird[];
        setAllBirds(guestBirds);
        setHealthAlerts(buildHealthAlerts(guestBirds));
        return;
      }

      const chickensData = await loadChickensForCurrentUser();
      if (chickensData) {
        setAllBirds(chickensData as Bird[]);
        setHealthAlerts(buildHealthAlerts(chickensData as Bird[]));
      } else {
        loadDefaultData();
      }
    } catch (error) {
      console.error('Error loading chickens:', error);
      loadDefaultData();
    }
  };

  const loadDefaultData = () => {
    const defaultBirds: Bird[] = [
      { id: '1', name: 'Rocky', chickenId: 'CK-001', status: 'WARNING', statusColor: '#FF9800', farmId: null, lastScan: '2026-03-20', healthStatus: 'Warning', photo: null },
      { id: '2', name: 'Thunder', chickenId: 'CK-002', status: 'HEALTHY', statusColor: '#4CAF50', farmId: null, lastScan: '2026-03-19', healthStatus: 'Healthy', photo: null },
      { id: '3', name: 'Lightning', chickenId: 'CK-003', status: 'CRITICAL', statusColor: '#f44336', farmId: null, lastScan: '2026-03-18', healthStatus: 'Critical', photo: null },
      { id: '4', name: 'Eagle', chickenId: 'CK-004', status: 'HEALTHY', statusColor: '#4CAF50', farmId: null, lastScan: '2026-03-20', healthStatus: 'Healthy', photo: null },
      { id: '5', name: 'Falcon', chickenId: 'CK-005', status: 'HEALTHY', statusColor: '#4CAF50', farmId: null, lastScan: '2026-03-19', healthStatus: 'Healthy', photo: null },
      { id: '6', name: 'Hawk', chickenId: 'CK-006', status: 'WARNING', statusColor: '#FF9800', farmId: null, lastScan: '2026-03-18', healthStatus: 'Warning', photo: null },
    ];
    setAllBirds(defaultBirds);
  };

  // Now routes through addChickenForCurrentUser(), which reads/writes the
  // per-account key (see utils/chickenStorage.ts) instead of a single
  // shared 'chickens' key. This is what previously let a new signup (or
  // another account) wipe out or collide with this account's flock.
  const saveChickenToStorage = async (chickenData: Bird) => {
  try {
    await addChickenForCurrentUser({
      name: chickenData.name,
      photo: chickenData.photo,
      farmId: chickenData.farmId,
    });
    return true;
  } catch (error) {
    console.error('Error saving chicken:', error);
    return false;
  }
};

  const handleGenerateQR = () => {
    if (isGuestMode) {
      guestAlert('adding a chicken');
      return;
    }
    if (!newChicken.name) {
      notify({
        title: 'Missing Info',
        message: 'Please enter a name for your chicken.',
        type: 'warning',
      });
      return;
    }

    const newId = (allBirds.length + 1).toString();
    const chickenId = `CK-${String(newId).padStart(3, '0')}`;

    // Set BOTH `status` and `healthStatus` together on creation — the two
    // fields have historically drifted out of sync (one screen writing
    // only one of them), which is what caused Home/Reports to undercount
    // birds that chickens.tsx still counted correctly. Keeping both in
    // sync here (and anywhere else a chicken record is created or edited)
    // prevents that gap from reopening.
    const qrData: Bird = {
      id: newId,
      chickenId: chickenId,
      name: newChicken.name,
      photo: newChicken.photo,
      farmId: newChicken.farmId,
      status: 'HEALTHY',
      statusColor: '#4CAF50',
      lastScan: new Date().toLocaleDateString(),
      dateAdded: new Date().toLocaleDateString(),
      healthStatus: 'Healthy',
    };

    setGeneratedQR(qrData);
    setShowAddForm(false);
    setShowQRModal(true);
  };

  // This is the actual save point — fires once the user confirms the
  // details sheet. Uses the same notify() banner pattern already used
  // for farm add/edit/delete, so "Chicken Added" shows up consistently
  // with the rest of the app's notifications (and lands in the
  // notification center, not just a one-off popup).
  const handleConfirmSave = async () => {
    if (isSavingChicken || !generatedQR) return;
    setIsSavingChicken(true);
    try {
      const saved = await saveChickenToStorage(generatedQR);
      if (saved) {
        setShowQRModal(false);
        await loadChickens();
        await notify({
          title: 'Chicken Added',
          message: `${generatedQR.name} has been added to your flock.`,
          type: 'success',
        });
        setNewChicken({ name: '', photo: null, farmId: null });
      } else {
        notify({
          title: 'Save Failed',
          message: 'Failed to save chicken.',
          type: 'alert',
        });
      }
    } finally {
      setIsSavingChicken(false);
    }
  };

  // NOTE: expo-file-system's exported `File` class shares its name with the
  // browser/DOM `File` type. To keep TypeScript from resolving to the wrong
  // one, it's imported above as `ExpoFile`. It's constructed here via
  // `ExpoFileAny` — see the comment near that alias's declaration above for
  // why.
  const captureQrToFile = async (): Promise<string | null> => {
    if (!qrRef.current || !generatedQR) return null;

    return new Promise((resolve) => {
      qrRef.current.toDataURL(async (base64Data: string) => {
        try {
          const file = new ExpoFileAny(Paths.cache, `chicken-qr-${generatedQR.chickenId}.png`);
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
        notify({
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
          dialogTitle: `Share ${generatedQR?.name}'s QR Code`,
        });
      } else {
        await Share.share({
          message: `Chicken QR Code for ${generatedQR?.name}\nID: ${generatedQR?.chickenId}\nStatus: ${generatedQR?.status}`,
          title: 'Share Chicken QR Code',
        });
      }
    } catch (error) {
      console.error('Error sharing QR code:', error);
      notify({
        title: 'Share Failed',
        message: 'Could not share QR code.',
        type: 'alert',
      });
    }
  };

  const handleDownloadQR = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        notify({
          title: 'Permission Needed',
          message: 'Please allow photo library access to save the QR code.',
          type: 'warning',
        });
        return;
      }

      const fileUri = await captureQrToFile();
      if (!fileUri) {
        notify({
          title: 'Download Failed',
          message: 'Could not prepare the QR code to save.',
          type: 'alert',
        });
        return;
      }

      await MediaLibrary.saveToLibraryAsync(fileUri);
      notify({
        title: 'QR Code Saved',
        message: 'QR code image saved to your device gallery.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error saving QR code:', error);
      notify({
        title: 'Save Failed',
        message: 'Could not save QR code to your device.',
        type: 'alert',
      });
    }
  };

  // Status filtering now goes through getHealthStatus() so the filter
  // works no matter which field ('status' or 'healthStatus') is set, and
  // no matter its casing.
  const getFilteredBirds = () => {
    let filtered = allBirds;

    if (selectedFarmFilter !== 'all') {
      filtered = filtered.filter(
        (bird) => String(bird.farmId) === String(selectedFarmFilter)
      );
    }

    if (selectedStatusFilter !== 'all') {
      filtered = filtered.filter(
        (bird) => getHealthStatus(bird).toLowerCase() === selectedStatusFilter.toLowerCase()
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (bird) =>
          bird.name?.toLowerCase().includes(query) ||
          bird.chickenId?.toLowerCase().includes(query) ||
          bird.id?.toString().includes(query) ||
          getFarmName(farms, bird.farmId).toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  // Counts now go through the same getHealthStatus() helper used by Home
  // and Reports, so all three screens always agree on Total/Healthy/
  // Warning/Critical for the exact same saved flock.
  const getStats = () => {
    const healthy = allBirds.filter((b) => getHealthStatus(b) === 'Healthy').length;
    const warning = allBirds.filter((b) => getHealthStatus(b) === 'Warning').length;
    const critical = allBirds.filter((b) => getHealthStatus(b) === 'Critical').length;

    return [
      { label: 'All Birds', count: allBirds.length.toString(), color: '#4CAF50', icon: 'kiwi-bird', filter: 'all' },
      { label: 'Healthy', count: healthy.toString(), color: '#4CAF50', icon: 'heart-pulse', filter: 'healthy' },
      { label: 'Warning', count: warning.toString(), color: '#FF9800', icon: 'alert-circle-outline', filter: 'warning' },
      { label: 'Critical', count: critical.toString(), color: '#f44336', icon: 'warning-outline', filter: 'critical' },
    ];
  };

  const stats = getStats();
  const filteredBirds = getFilteredBirds();

  // Sorting is purely a display-order preference layered on top of
  // filteredBirds — it never changes which birds match the current
  // search/status filter, only the order they render in.
  const sortedBirds = useMemo(() => {
    const list = [...filteredBirds];
    if (sortBy === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'status') {
      list.sort((a, b) => {
        const wa = STATUS_SORT_WEIGHT[getHealthStatus(a)] ?? 3;
        const wb = STATUS_SORT_WEIGHT[getHealthStatus(b)] ?? 3;
        return wa - wb;
      });
    } else {
      // 'recent' — newest lastScan first, falling back to original order
      // when dates are missing/equal.
      list.sort((a, b) => {
        const da = a.lastScan ? new Date(a.lastScan).getTime() : 0;
        const db = b.lastScan ? new Date(b.lastScan).getTime() : 0;
        return db - da;
      });
    }
    return list;
  }, [filteredBirds, sortBy]);

  const handleBirdPress = (item: any) => {
    router.push(`/chicken/${item.id}`);
  };

  const renderBirdItem = ({ item }: any) => {
    const statusColor = getStatusColor(item);
    return (
      <TouchableOpacity
        style={[styles.birdCard, { backgroundColor: colors.card, borderColor: colors.divider }]}
        onPress={() => handleBirdPress(item)}
        activeOpacity={0.85}
      >
        <View style={styles.birdCardTopRow}>
          <ChickenAvatar photo={item.photo} size={54} />

          <View style={styles.birdCardIdentity}>
            <Text style={[styles.birdName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <View style={styles.birdMetaRow}>
              <Text style={[styles.birdIdTag, { color: colors.textLight }]}>{item.chickenId || `CK-00${item.id}`}</Text>
              {(item.farmName || item.farmId) && (
                <View style={[styles.farmBadgePill, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="home-outline" size={10} color={colors.primary} />
                  <Text style={[styles.farmBadgePillText, { color: colors.primary }]} numberOfLines={1}>
                    {item.farmName || getFarmName(farms, item.farmId)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getHealthStatus(item).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={[styles.birdMetricsRow, { borderTopColor: colors.divider }]}>
          <View style={styles.birdMetric}>
            <Text style={[styles.birdMetricLabel, { color: colors.textLight }]}>Farm</Text>
            <Text style={[styles.birdMetricValue, { color: colors.text }]} numberOfLines={1}>
              {getFarmName(farms, item.farmId)}
            </Text>
          </View>
          <View style={[styles.birdMetricDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.birdMetric}>
            <Text style={[styles.birdMetricLabel, { color: colors.textLight }]}>Last Scan</Text>
            <Text style={[styles.birdMetricValue, { color: colors.text }]}>{item.lastScan || '—'}</Text>
          </View>
          <View style={styles.birdMetricArrow}>
            <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
          </View>
        </View>

        <View style={styles.birdCardFooter}>
          <Feather name="calendar" size={12} color={colors.textLight} />
          <Text style={[styles.birdDate, { color: colors.textLight }]}>Last scanned {item.lastScan}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAlertItem = ({ item }: any) => (
    <TouchableOpacity style={[styles.alertItemCard, { backgroundColor: colors.card }]} activeOpacity={0.85}>
      <View style={[styles.alertAccent, { backgroundColor: item.statusColor }]} />
      <View style={styles.alertItemBody}>
        <View style={styles.alertItemHeader}>
          <View style={styles.alertItemLeft}>
            <ChickenAvatar photo={item.photo} size={40} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.alertItemName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.alertItemCondition, { color: colors.textSecondary }]}>{item.condition}</Text>
            </View>
          </View>
          <View style={[styles.alertItemBadge, { backgroundColor: item.statusColor + '20' }]}>
            <Text style={[styles.alertItemStatus, { color: item.statusColor }]}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.alertItemFooter}>
          <Feather name="calendar" size={11} color={colors.textLight} />
          <Text style={[styles.alertItemDate, { color: colors.textLight }]}>{item.date}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderScanHistoryItem = ({ item }: any) => (
    <TouchableOpacity
      style={[styles.scanHistoryCard, { backgroundColor: colors.card, borderColor: colors.divider }]}
      activeOpacity={0.85}
      onPress={() => {
        setSelectedBird(item);
        setShowScanDetailModal(true);
      }}
    >
      <ChickenAvatar photo={getBirdImageForChickenId(item.chickenId)} size={54} />
      <View style={styles.scanHistoryInfo}>
        <View style={styles.scanHistoryTopRow}>
          <Text style={[styles.scanHistoryName, { color: colors.text }]}>{item.chickenId} · {item.chickenName}</Text>
          <View style={[styles.scanHistoryBadge, { backgroundColor: item.statusColor + '20' }]}>
            <Text style={[styles.scanHistoryStatus, { color: item.statusColor }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={[styles.scanHistoryType, { color: colors.textSecondary }]}>{item.scanType} · {item.condition}</Text>
        <View style={styles.scanHistoryFooter}>
          <View style={styles.scanHistoryMeta}>
            <Ionicons name="calendar-outline" size={12} color={colors.textLight} />
            <Text style={[styles.scanHistoryDate, { color: colors.textLight }]}>{item.date} · {item.time}</Text>
          </View>
          <Text style={[styles.scanHistoryConfidence, { color: colors.primary }]}>{item.confidence} confidence</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
    </TouchableOpacity>
  );

  const handleStatusFilter = (filter: string) => {
    setSelectedStatusFilter(filter);
  };

  const openAddForm = () => {
    if (isGuestMode) {
      guestAlert('adding a chicken');
      return;
    }
    setShowAddForm(true);
  };

  const openManageFarms = () => {
    if (isGuestMode) {
      guestAlert('managing farms');
      return;
    }
    router.push('/farm');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.pageColumn, { width: contentWidth, alignSelf: 'center' }]}>
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
            <View pointerEvents="none" style={styles.headerDecoRing} />
            <View pointerEvents="none" style={styles.headerDecoRingSmall} />

            <View style={styles.headerTopRow}>
              <View style={styles.headerIconBadge}>
                <ChickenIcon size={18} color="#fff" />
              </View>
              <View style={styles.headerTitleBlock}>
                <Text style={styles.headerTitle}>Flock Management</Text>
                <Text style={styles.headerSubtitle}>{allBirds.length} birds  ·  {healthAlerts.length} active alerts</Text>
              </View>
            </View>

            {userRole === 'owner' ? (
              <TouchableOpacity style={styles.farmsLinkButton} onPress={openManageFarms} activeOpacity={0.75}>
                <Ionicons name="home-outline" size={14} color="#fff" />
                <Text style={styles.farmsLinkText}>Manage Farms</Text>
                <Ionicons name="chevron-forward" size={12} color="#fff" />
              </TouchableOpacity>
            ) : farms.length > 0 ? (
              <TouchableOpacity
                style={styles.farmsLinkButton}
                onPress={() => setShowFarmLocation((v) => !v)}
                activeOpacity={0.75}
              >
                <Ionicons name="home-outline" size={14} color="#fff" />
                <Text style={styles.farmsLinkText} numberOfLines={1}>
                  {showFarmLocation && farms[0].farm_location ? farms[0].farm_location : farms[0].farm_name}
                </Text>
                <Ionicons name={showFarmLocation ? 'chevron-up' : 'chevron-down'} size={12} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </LinearGradient>

          <View style={[styles.floatingPanel, { backgroundColor: colors.surface, shadowColor: isDarkMode ? '#000' : '#1B5E20' }]}>
            <View style={[styles.toggleTabs, { backgroundColor: colors.background }]}>
              <TouchableOpacity
                style={[styles.toggleTab, activeTab === 'all' && { backgroundColor: ACCENT }]}
                onPress={() => setActiveTab('all')}
                activeOpacity={0.8}
              >
                <Ionicons name="grid-outline" size={15} color={activeTab === 'all' ? ACCENT_ICON : colors.textSecondary} />
                <Text style={[styles.toggleTabText, { color: activeTab === 'all' ? ACCENT_ICON : colors.textSecondary }]}>Overview</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleTab, activeTab === 'history' && { backgroundColor: ACCENT }]}
                onPress={() => setActiveTab('history')}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={15} color={activeTab === 'history' ? ACCENT_ICON : colors.textSecondary} />
                <Text style={[styles.toggleTabText, { color: activeTab === 'history' ? ACCENT_ICON : colors.textSecondary }]}>Capture History</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'all' && (
              <>
                <View style={styles.searchRow}>
                  <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
                    <Feather name="search" size={18} color={colors.textLight} />
                    <TextInput
                      style={[styles.searchInput, { color: colors.text }]}
                      placeholder="Search by ID, name, or farm…"
                      placeholderTextColor={colors.textLight}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color={colors.textLight} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.filterIconButton,
                      { backgroundColor: colors.background, borderColor: selectedStatusFilter !== 'all' ? colors.primary : 'transparent' },
                    ]}
                    onPress={() => setShowFilterMenu(true)}
                    activeOpacity={0.8}
                  >
                    <Feather name="filter" size={17} color={selectedStatusFilter !== 'all' ? colors.primary : colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {farms.length > 0 && (
                  <View style={styles.farmFilterSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.farmFilterScroll}>
                      <TouchableOpacity
                        style={[
                          styles.farmFilterPill,
                          { backgroundColor: colors.card, borderColor: selectedFarmFilter === 'all' ? colors.primary : colors.divider },
                          selectedFarmFilter === 'all' && { backgroundColor: colors.primary + '18', borderWidth: 1.5, borderColor: colors.primary },
                        ]}
                        onPress={() => setSelectedFarmFilter('all')}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="layers-outline"
                          size={13}
                          color={selectedFarmFilter === 'all' ? colors.primary : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.farmFilterPillText,
                            { color: selectedFarmFilter === 'all' ? colors.primary : colors.textSecondary },
                            selectedFarmFilter === 'all' && { fontWeight: '700' },
                          ]}
                        >
                          All Farms ({allBirds.length})
                        </Text>
                      </TouchableOpacity>

                      {farms.map((f) => {
                        const isSel = String(selectedFarmFilter) === String(f.id);
                        const count = allBirds.filter((b) => String(b.farmId) === String(f.id)).length;
                        return (
                          <TouchableOpacity
                            key={f.id}
                            style={[
                              styles.farmFilterPill,
                              { backgroundColor: colors.card, borderColor: isSel ? colors.primary : colors.divider },
                              isSel && { backgroundColor: colors.primary + '18', borderWidth: 1.5, borderColor: colors.primary },
                            ]}
                            onPress={() => setSelectedFarmFilter(isSel ? 'all' : String(f.id))}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name="home-outline"
                              size={13}
                              color={isSel ? colors.primary : colors.textSecondary}
                            />
                            <Text
                              style={[
                                styles.farmFilterPillText,
                                { color: isSel ? colors.primary : colors.textSecondary },
                                isSel && { fontWeight: '700' },
                              ]}
                            >
                              {f.farm_name} ({count})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.statsGrid}>
                  {stats.map((stat, index) => {
                    const active = selectedStatusFilter === stat.filter;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.statCard,
                          { backgroundColor: colors.card, borderColor: active ? stat.color : colors.divider },
                          active && { borderWidth: 1.5 },
                        ]}
                        onPress={() => handleStatusFilter(stat.filter)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.statIconCircle, { backgroundColor: stat.color + '18' }]}>
                          {stat.icon === 'kiwi-bird' ? (
                            <ChickenIcon size={16} color={stat.color} />
                          ) : stat.icon === 'heart-pulse' ? (
                            <MaterialCommunityIcons name="heart-pulse" size={19} color={stat.color} />
                          ) : (
                            <Ionicons name={stat.icon as any} size={18} color={stat.color} />
                          )}
                        </View>
                        <Text style={[styles.statCount, { color: colors.text }]}>{stat.count}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          {activeTab === 'all' ? (
            <>
              {(selectedStatusFilter !== 'all' || searchQuery.length > 0) && (
                <View style={styles.filterInfo}>
                  <Text style={[styles.filterInfoText, { color: colors.textSecondary }]}>
                    Showing {filteredBirds.length} result{filteredBirds.length === 1 ? '' : 's'}
                  </Text>
                  <TouchableOpacity onPress={() => { handleStatusFilter('all'); setSearchQuery(''); }}>
                    <Text style={[styles.clearFilter, { color: colors.primary }]}>Clear Filters</Text>
                  </TouchableOpacity>
                </View>
              )}

              {healthAlerts.length > 0 && (
                <View style={styles.alertsContainer}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="alert-circle" size={16} color="#FF9800" />
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Health Alerts ({healthAlerts.length})</Text>
                  </View>
                  <FlatList data={healthAlerts} renderItem={renderAlertItem} keyExtractor={(item) => item.id} scrollEnabled={false} />
                </View>
              )}

              <View style={styles.allBirdsContainer}>
                <View style={styles.allBirdsHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                    All Birds · {sortedBirds.length} result{sortedBirds.length === 1 ? '' : 's'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.sortByPill, { borderColor: colors.divider, backgroundColor: colors.card }]}
                    onPress={() => setShowSortMenu(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="swap-vertical-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.sortByText, { color: colors.textSecondary }]}>Sort by</Text>
                    <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {sortedBirds.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={44} color={colors.textLight} />
                    <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>No birds match your search</Text>
                    <TouchableOpacity style={[styles.resetButton, { backgroundColor: colors.primary + '15' }]} onPress={() => { handleStatusFilter('all'); setSearchQuery(''); }}>
                      <Text style={[styles.resetButtonText, { color: colors.primary }]}>Clear Filters</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <FlatList data={sortedBirds} renderItem={renderBirdItem} keyExtractor={(item) => item.id} scrollEnabled={false} />
                )}
              </View>
            </>
          ) : (
            <View style={styles.scanHistoryTab}>
              <View style={styles.scanHistorySectionHeader}>
                <Text style={[styles.scanHistoryTitle, { color: colors.text }]}>Recent Captures</Text>
                <Text style={[styles.scanHistorySubtitle, { color: colors.textLight }]}>Last {scanHistory.length} capture records</Text>
              </View>

              <FlatList
                data={scanHistory}
                renderItem={renderScanHistoryItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={styles.scanHistoryList}
              />
            </View>
          )}

          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { right: Math.max((screenWidth - contentWidth) / 2, 0) + 20 }]} onPress={openAddForm} activeOpacity={0.85}>
        <LinearGradient colors={['#FFCA28', '#FFA000']} style={styles.fabGradient}>
          <Ionicons name="add" size={32} color={ACCENT_ICON} />
        </LinearGradient>
      </TouchableOpacity>

      <AddChickenModal
        visible={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSubmit={handleGenerateQR}
        form={newChicken}
        onChange={setNewChicken}
        onPickPhoto={pickImage}
        colors={colors}
        submitLabel="Save & Generate QR"
        maxWidth={MAX_CONTENT_WIDTH}
        isSubmitting={isSavingChicken}
      />

      {/* Filter menu — same handleStatusFilter used by the stat cards, just
          reached from the search bar's filter icon too. */}
      <Modal animationType="fade" transparent visible={showFilterMenu} onRequestClose={() => setShowFilterMenu(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowFilterMenu(false)}>
          <View style={[styles.dropdownSheet, { backgroundColor: colors.card, maxWidth: MAX_CONTENT_WIDTH, width: '90%' }]}>
            <Text style={[styles.dropdownTitle, { color: colors.textLight }]}>FILTER BY STATUS</Text>
            {stats.map((stat) => (
              <TouchableOpacity
                key={stat.filter}
                style={[styles.dropdownOptionRow, { borderBottomColor: colors.divider }]}
                onPress={() => {
                  handleStatusFilter(stat.filter);
                  setShowFilterMenu(false);
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.dropdownOptionDot, { backgroundColor: stat.color }]} />
                <Text style={[styles.dropdownOptionText, { color: colors.text }]}>{stat.label}</Text>
                {selectedStatusFilter === stat.filter && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sort menu — display-order only, doesn't affect which birds match
          the current search/status filter. */}
      <Modal animationType="fade" transparent visible={showSortMenu} onRequestClose={() => setShowSortMenu(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowSortMenu(false)}>
          <View style={[styles.dropdownSheet, { backgroundColor: colors.card, maxWidth: MAX_CONTENT_WIDTH, width: '90%' }]}>
            <Text style={[styles.dropdownTitle, { color: colors.textLight }]}>SORT BY</Text>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.dropdownOptionRow, { borderBottomColor: colors.divider }]}
                onPress={() => {
                  setSortBy(opt.key);
                  setShowSortMenu(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.dropdownOptionText, { color: colors.text }]}>{opt.label}</Text>
                {sortBy === opt.key && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal animationType="slide" transparent visible={showQRModal} onRequestClose={() => setShowQRModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.verifySheet, { backgroundColor: colors.card, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }]}>
            <View style={[styles.verifyHeader, { borderBottomColor: colors.divider }]}>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.verifyTitle, { color: colors.text }]}>Chicken Added</Text>
                <Text style={[styles.verifySubtitle, { color: colors.textLight }]}>Confirm details before saving to your flock</Text>
              </View>
              <TouchableOpacity onPress={() => setShowQRModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            {generatedQR && (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.verifyBody} contentContainerStyle={{ paddingBottom: 8 }}>
                <View style={[styles.idCard, { borderColor: colors.divider, backgroundColor: colors.background }]}>
                  <View style={[styles.qrSquare, { borderColor: colors.border }]}>
                    <QRCode
                      value={JSON.stringify({
                        chickenId: generatedQR.chickenId,
                        name: generatedQR.name,
                      })}
                      size={64}
                      getRef={(c: any) => (qrRef.current = c)}
                    />
                  </View>
                  <View style={styles.idCardInfo}>
                    <Text style={[styles.idCardTag, { color: colors.textLight }]}>CHICKEN ID</Text>
                    <Text style={[styles.idCardId, { color: colors.text }]}>{generatedQR.chickenId}</Text>
                    <View style={styles.idCardActions}>
                      <TouchableOpacity style={[styles.idCardActionBtn, { borderColor: colors.border }]} onPress={handleShareQR}>
                        <Ionicons name="share-social-outline" size={13} color={colors.textSecondary} />
                        <Text style={[styles.idCardActionText, { color: colors.textSecondary }]}>Share</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.idCardActionBtn, { borderColor: colors.border }]} onPress={handleDownloadQR}>
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
                    { label: 'Name', value: generatedQR.name },
                    { label: 'Farm', value: getFarmName(farms, generatedQR.farmId) },
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
            )}

            <View style={[styles.verifyFooter, { borderTopColor: colors.divider }]}>
              <TouchableOpacity style={[styles.verifyCancelButton, { borderColor: colors.border }]} onPress={() => setShowQRModal(false)} activeOpacity={0.75}>
                <Text style={[styles.verifyCancelText, { color: colors.textSecondary }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.verifyConfirmButton, { backgroundColor: colors.primary }, isSavingChicken && { opacity: 0.7 }]}
                onPress={handleConfirmSave}
                disabled={isSavingChicken}
                activeOpacity={0.85}
              >
                {isSavingChicken ? (
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

      <Modal animationType="slide" transparent visible={showScanDetailModal} onRequestClose={() => setShowScanDetailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.scanDetailModal, { backgroundColor: colors.card, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Capture Details</Text>
              <TouchableOpacity onPress={() => setShowScanDetailModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={30} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            {selectedBird && (
              <ScrollView>
                <View style={styles.scanDetailContent}>
                  <View style={styles.scanDetailImageContainer}>
                    <ChickenAvatar photo={getBirdImageForChickenId(selectedBird.chickenId)} size={120} />
                    <View style={[styles.scanDetailStatusBadge, { backgroundColor: selectedBird.statusColor + '20' }]}>
                      <Text style={[styles.scanDetailStatus, { color: selectedBird.statusColor }]}>{selectedBird.status}</Text>
                    </View>
                  </View>

                  <View style={styles.scanDetailInfo}>
                    <Text style={[styles.scanDetailChickenId, { color: colors.text }]}>{selectedBird.chickenId}</Text>
                    <Text style={[styles.scanDetailChickenName, { color: colors.textSecondary }]}>{selectedBird.chickenName}</Text>
                    <View style={[styles.scanDetailRow, { borderBottomColor: colors.divider }]}>
                      <Ionicons name="camera-outline" size={20} color={colors.primary} />
                      <Text style={[styles.scanDetailLabel, { color: colors.textLight }]}>Capture Type:</Text>
                      <Text style={[styles.scanDetailValue, { color: colors.text }]}>{selectedBird.scanType}</Text>
                    </View>
                    <View style={[styles.scanDetailRow, { borderBottomColor: colors.divider }]}>
                      <Ionicons name="medkit-outline" size={20} color={colors.primary} />
                      <Text style={[styles.scanDetailLabel, { color: colors.textLight }]}>Condition:</Text>
                      <Text style={[styles.scanDetailValue, { color: colors.text }]}>{selectedBird.condition}</Text>
                    </View>
                    <View style={[styles.scanDetailRow, { borderBottomColor: colors.divider }]}>
                      <Ionicons name="stats-chart-outline" size={20} color={colors.primary} />
                      <Text style={[styles.scanDetailLabel, { color: colors.textLight }]}>Confidence:</Text>
                      <Text style={[styles.scanDetailValue, { color: colors.success }]}>{selectedBird.confidence}</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity style={styles.scanDetailButton} onPress={() => setShowScanDetailModal(false)}>
                  <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.scanDetailGradient}>
                    <Text style={styles.scanDetailButtonText}>Close</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <GuestBlockModal visible={guestModalVisible} onClose={() => setGuestModalVisible(false)} featureLabel={guestFeature} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageColumn: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 44,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    position: 'relative',
  },
  headerDecoRing: {
    position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75,
    borderWidth: 26, borderColor: 'rgba(255,255,255,0.06)',
  },
  headerDecoRingSmall: {
    position: 'absolute', bottom: -20, left: -30, width: 90, height: 90, borderRadius: 45,
    borderWidth: 16, borderColor: 'rgba(255,255,255,0.05)',
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headerIconBadge: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitleBlock: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  farmsLinkButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  farmsLinkText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  floatingPanel: {
    marginTop: -34,
    marginHorizontal: 20,
    borderRadius: 22,
    padding: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },

  toggleTabs: { flexDirection: 'row', borderRadius: 26, padding: 4, marginBottom: 14 },
  toggleTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 22 },
  toggleTabText: { fontSize: 14, fontWeight: '600' },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  searchContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 11, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterIconButton: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flexBasis: '47%', flexGrow: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16,
    borderWidth: 1, gap: 6,
  },
  statIconCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  statCount: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 11, fontWeight: '600' },

  filterInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 16, marginBottom: 4 },
  filterInfoText: { fontSize: 12 },
  clearFilter: { fontSize: 12, fontWeight: '700' },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  alertsContainer: { paddingHorizontal: 20, marginTop: 22 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 12 },

  alertItemCard: { flexDirection: 'row', borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  alertAccent: { width: 5 },
  alertItemBody: { flex: 1, padding: 14 },
  alertItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  alertItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  alertItemImage: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0' },
  alertItemName: { fontSize: 15, fontWeight: 'bold' },
  alertItemBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  alertItemStatus: { fontSize: 11, fontWeight: 'bold' },
  alertItemCondition: { fontSize: 13, marginTop: 2 },
  alertItemFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  alertItemDate: { fontSize: 11 },

  allBirdsContainer: { paddingHorizontal: 20, marginTop: 24, marginBottom: 24 },
  allBirdsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 },
  sortByPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
  },
  sortByText: { fontSize: 12, fontWeight: '600' },

  birdCard: {
    borderRadius: 18, marginBottom: 14, padding: 14, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  birdCardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  birdCardImage: { width: '100%', height: '100%', borderRadius: 25, backgroundColor: '#f0f0f0' },
  birdCardIdentity: { flex: 1, minWidth: 0 },
  birdName: { fontSize: 17, fontWeight: 'bold' },
  birdMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  birdIdTag: { fontSize: 12, fontWeight: '600' },
  farmBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    maxWidth: 150,
  },
  farmBadgePillText: { fontSize: 10, fontWeight: '700' },
  farmFilterSection: { marginBottom: 14 },
  farmFilterScroll: { gap: 8, paddingRight: 4 },
  farmFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  farmFilterPillText: { fontSize: 12, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  birdMetricsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  birdMetric: { flex: 1 },
  birdMetricLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  birdMetricValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  birdMetricDivider: { width: 1, height: 28, marginHorizontal: 8 },
  birdMetricArrow: { paddingLeft: 4 },
  birdCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  birdDate: { fontSize: 11 },

  emptyState: { alignItems: 'center', paddingVertical: 44, gap: 12 },
  emptyStateText: { fontSize: 14, textAlign: 'center' },
  resetButton: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 20 },
  resetButtonText: { fontSize: 13, fontWeight: '700' },

  bottomPadding: { height: 40 },

  scanHistoryTab: { paddingHorizontal: 20, paddingTop: 16 },
  scanHistorySectionHeader: { marginBottom: 16 },
  scanHistoryTitle: { fontSize: 20, fontWeight: 'bold' },
  scanHistorySubtitle: { fontSize: 13, marginTop: 4 },
  scanHistoryList: { paddingBottom: 20 },
  scanHistoryCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, gap: 12 },
  scanHistoryImage: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#f0f0f0' },
  scanHistoryInfo: { flex: 1 },
  scanHistoryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  scanHistoryName: { fontSize: 14, fontWeight: 'bold', flexShrink: 1 },
  scanHistoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  scanHistoryStatus: { fontSize: 10, fontWeight: 'bold' },
  scanHistoryType: { fontSize: 12, marginBottom: 6 },
  scanHistoryFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanHistoryMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scanHistoryDate: { fontSize: 11 },
  scanHistoryConfidence: { fontSize: 11, fontWeight: '700' },

  fab: {
    position: 'absolute', bottom: 30, borderRadius: 30, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  fabGradient: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },

  dropdownOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  dropdownSheet: { borderRadius: 18, padding: 8, paddingTop: 14 },
  dropdownTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 12, marginBottom: 6 },
  dropdownOptionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12,
    paddingVertical: 13, borderBottomWidth: 1,
  },
  dropdownOptionDot: { width: 8, height: 8, borderRadius: 4 },
  dropdownOptionText: { flex: 1, fontSize: 14, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, paddingHorizontal: 24, paddingTop: 24 },
  modalTitle: { fontSize: 19, fontWeight: 'bold' },

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
    fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 22, marginBottom: 10,
    paddingTop: 16, borderTopWidth: 1,
  },
  recordList: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  recordRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1,
  },
  recordLabel: { fontSize: 13, fontWeight: '600' },
  recordValue: { fontSize: 14, fontWeight: '500' },

  verifyFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 18, borderTopWidth: 1 },
  verifyCancelButton: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  verifyCancelText: { fontSize: 14, fontWeight: '600' },
  verifyConfirmButton: { flex: 2, flexDirection: 'row', gap: 8, borderRadius: 8, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  verifyConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  scanDetailModal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  scanDetailContent: { alignItems: 'center' },
  scanDetailImageContainer: { position: 'relative', marginBottom: 20 },
  scanDetailImage: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#f0f0f0' },
  scanDetailStatusBadge: { position: 'absolute', bottom: 0, right: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  scanDetailStatus: { fontSize: 12, fontWeight: 'bold' },
  scanDetailInfo: { width: '100%', gap: 16 },
  scanDetailChickenId: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  scanDetailChickenName: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
  scanDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  scanDetailLabel: { fontSize: 14, width: 80 },
  scanDetailValue: { fontSize: 14, fontWeight: '500', flex: 1 },
  scanDetailButton: { borderRadius: 30, overflow: 'hidden', marginTop: 24, marginBottom: 10 },
  scanDetailGradient: { paddingVertical: 14, alignItems: 'center' },
  scanDetailButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});