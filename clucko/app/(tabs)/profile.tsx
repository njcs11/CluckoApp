import { useDarkMode } from '@/context/DarkModeContext';
import { NotificationItem, useNotifications } from '@/context/NotificationContext';
import { getHealthStatus } from '@/utils/birdStatus';
import { loadChickensForCurrentUser } from '@/utils/chickenStorage';
import { loadFarms } from '@/utils/farms';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AboutUsModal from '../../components/ui/AboutUsModal';
import LogoutConfirmModal from '../../components/ui/LogoutConfirmModal';
import NotificationsListModal from '../../components/ui/NotificationsListModal';
import { apiGetFarms, apiGetProfile, apiUpdateProfile } from '../../lib/api';

const GENERIC_PROFILE_KEY = 'userProfile';
const GENERIC_LAST_NOTIF_CHECK_KEY = 'lastNotifCheck';

const PROFILE_IMAGES_DIR = `${FileSystem.documentDirectory}profile-images/`;

const ensureProfileImagesDir = async () => {
  if (Platform.OS === 'web') return;
  try {
    const dirInfo = await FileSystem.getInfoAsync(PROFILE_IMAGES_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(PROFILE_IMAGES_DIR, { intermediates: true });
    }
  } catch (error) {
    console.error('Error ensuring profile images directory:', error);
  }
};

const resolveCurrentEmail = async (): Promise<string | null> => {
  try {
    const sessionEmail = await AsyncStorage.getItem('userEmail');
    if (sessionEmail) return sessionEmail;
    const userDataString = await AsyncStorage.getItem('userData');
    if (userDataString) {
      const userData = JSON.parse(userDataString);
      return userData.email || null;
    }
    return null;
  } catch (error) {
    console.error('Error resolving current email:', error);
    return null;
  }
};

const getProfileStorageKey = async (): Promise<string> => {
  const email = await resolveCurrentEmail();
  return email ? `userProfile_${email}` : GENERIC_PROFILE_KEY;
};

// Singular when the count is exactly 1, plural otherwise (covers 0 and
// anything above 1) — e.g. pluralize(0, 'Farm') -> 'Farms', pluralize(1,
// 'Alert') -> 'Alert', pluralize(2, 'Alert') -> 'Alerts'.
const pluralize = (count: number, singular: string, plural: string = `${singular}s`) =>
  count === 1 ? singular : plural;

export default function ProfileScreen() {
  const { colors, isDarkMode, toggleDarkMode } = useDarkMode();
  const {
    notifications,
    unreadCount,
    notify,
    showDetail,
    markAllAsRead,
    clearAllNotifications,
    deleteNotification,
    refresh: refreshNotifications,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<'details' | 'preferences'>('details');
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [profile, setProfile] = useState({
    fullName: 'User',
    email: '',
    phone: '',
    role: 'Owner',
    farmName: '',
    farmLocation: '',
    memberSince: new Date().toISOString().split('T')[0],
    profileImage: null as string | null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);

  const CROP_FRAME_SIZE = 240;
  const CROP_ZOOM = 1.35;
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingImageSize, setPendingImageSize] = useState<{ width: number; height: number } | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lastOffset = useRef({ x: 0, y: 0 });

  const displaySize = useMemo(() => {
    if (!pendingImageSize) return { width: CROP_FRAME_SIZE, height: CROP_FRAME_SIZE, scale: 1 };
    const coverScale = CROP_FRAME_SIZE / Math.min(pendingImageSize.width, pendingImageSize.height);
    const scale = coverScale * CROP_ZOOM;
    return {
      width: pendingImageSize.width * scale,
      height: pendingImageSize.height * scale,
      scale,
    };
  }, [pendingImageSize]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const panBounds = useRef({ maxX: 0, maxY: 0 });
  panBounds.current = {
    maxX: Math.max((displaySize.width - CROP_FRAME_SIZE) / 2, 0),
    maxY: Math.max((displaySize.height - CROP_FRAME_SIZE) / 2, 0),
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset(lastOffset.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, gestureState) => {
        pan.flattenOffset();
        const { maxX, maxY } = panBounds.current;
        const newX = clamp(lastOffset.current.x + gestureState.dx, -maxX, maxX);
        const newY = clamp(lastOffset.current.y + gestureState.dy, -maxY, maxY);
        lastOffset.current = { x: newX, y: newY };
        Animated.spring(pan, { toValue: { x: newX, y: newY }, useNativeDriver: false }).start();
      },
    })
  ).current;

  const [stats, setStats] = useState({ totalFarms: 0, users: 1, alerts: 0 });
  const [farmsList, setFarmsList] = useState<any[]>([]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Farms count and connected users read through apiGetFarms(), and alerts read through
  // loadChickensForCurrentUser() — dynamic and accurate for both Owner and Caretaker roles.
  const loadStats = async (roleOverride?: string) => {
    try {
      const [chickensData, rawFarms] = await Promise.all([
        loadChickensForCurrentUser(),
        apiGetFarms(),
      ]);
      const chickens = chickensData || [];
      const alerts = chickens.filter((c: any) => {
        const normalized = getHealthStatus(c);
        return normalized === 'Warning' || normalized === 'Critical';
      }).length;

      const farms = Array.isArray(rawFarms) ? rawFarms : [];
      setFarmsList(farms);

      const effectiveRole = roleOverride || profile.role;
      let calculatedUsers = 0;
      if (farms.length > 0) {
        if (effectiveRole === 'Caretaker') {
          const farmCaretakers = Number(farms[0]?.caretaker_count) || 0;
          calculatedUsers = farmCaretakers;
        } else {
          const totalCaretakers = farms.reduce(
            (sum: number, f: any) => sum + (Number(f.caretaker_count) || 0),
            0
          );
          calculatedUsers = totalCaretakers;
        }
      }

      setStats({
        totalFarms: farms.length,
        users: calculatedUsers,
        alerts,
      });

      if (farms.length > 0) {
        const primaryFarm = farms[0];
        setProfile((prev) => ({
          ...prev,
          farmName: prev.farmName || primaryFarm.farm_name || '',
          farmLocation: prev.farmLocation || primaryFarm.farm_location || '',
        }));
        setEditedProfile((prev) => ({
          ...prev,
          farmName: prev.farmName || primaryFarm.farm_name || '',
          farmLocation: prev.farmLocation || primaryFarm.farm_location || '',
        }));
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      refreshNotifications();
      loadStats();
    }, [])
  );

  const handleNotificationPress = (notification: NotificationItem) => {
    showDetail(notification);
  };

  const handleViewChickenFromNotification = (chickenId: string) => {
    setShowNotifications(false);
    router.push(`/chicken/${chickenId}`);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    await refreshNotifications();
    await loadStats();
    setRefreshing(false);
  };

  useEffect(() => {
    loadProfile();
    requestPermissions();
    loadStats();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        await notify({
          title: 'Permission Needed',
          message: 'Please grant camera roll permissions to change profile picture.',
          type: 'warning',
        });
      }
    }
  };

  const loadProfile = async () => {
    try {
      const data = await apiGetProfile();
      const roleDisplay = data?.role
        ? data.role.charAt(0).toUpperCase() + data.role.slice(1)
        : 'Owner';

      const profileKey = await getProfileStorageKey();
      let localImage: string | null = null;
      try {
        const savedLocal = await AsyncStorage.getItem(profileKey);
        if (savedLocal) {
          const parsedLocal = JSON.parse(savedLocal);
          localImage = parsedLocal.profileImage || null;
          if (localImage && Platform.OS !== 'web') {
            const fileInfo = await FileSystem.getInfoAsync(localImage);
            if (!fileInfo.exists) localImage = null;
          }
        }
      } catch {
        // ignore malformed/missing local cache — photo just stays null
      }

      const freshProfile = {
        fullName: `${data?.first_name || ''} ${data?.last_name || ''}`.trim() || 'User',
        email: data?.email || '',
        phone: data?.phone_number || '',
        role: roleDisplay,
        farmName: data?.farm_name || '',
        farmLocation: data?.farm_location || '',
        memberSince: data?.created_at
          ? String(data.created_at).split('T')[0]
          : new Date().toISOString().split('T')[0],
        profileImage: localImage,
      };

      setProfile(freshProfile);
      setEditedProfile(freshProfile);
      await loadStats(roleDisplay);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditedProfile(profile);
    setIsEditing(false);
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const [firstName, ...rest] = editedProfile.fullName.trim().split(' ');
      const lastName = rest.join(' ');

      await apiUpdateProfile({
        first_name: firstName || editedProfile.fullName,
        last_name: lastName,
        phone_number: editedProfile.phone,
        farm_name: editedProfile.farmName,
        farm_location: editedProfile.farmLocation,
      });

      setProfile(editedProfile);
      setIsEditing(false);

      await notify({
        title: 'Profile Updated',
        message: 'Your profile information has been successfully updated.',
        type: 'success',
      });

      await loadStats();
    } catch (error: any) {
      await notify({
        title: 'Update Failed',
        message: error.message || 'Failed to save profile changes.',
        type: 'alert',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const pickProfileImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;

    Image.getSize(
      uri,
      (width, height) => {
        lastOffset.current = { x: 0, y: 0 };
        pan.setValue({ x: 0, y: 0 });
        setPendingImage(uri);
        setPendingImageSize({ width, height });
        setShowImagePreview(true);
      },
      (error) => {
        console.error('Error reading image size:', error);
        notify({
          title: 'Photo Error',
          message: 'Could not open that photo. Please try another one.',
          type: 'alert',
        });
      }
    );
  };

  const confirmProfileImage = async () => {
    if (!pendingImage || !pendingImageSize || displaySize.scale === 0) return;

    setIsSavingImage(true);
    try {
      const cropLeftInDisplay = (displaySize.width - CROP_FRAME_SIZE) / 2 - lastOffset.current.x;
      const cropTopInDisplay = (displaySize.height - CROP_FRAME_SIZE) / 2 - lastOffset.current.y;
      const cropSizeOriginal = CROP_FRAME_SIZE / displaySize.scale;

      const originX = clamp(
        cropLeftInDisplay / displaySize.scale,
        0,
        Math.max(pendingImageSize.width - cropSizeOriginal, 0)
      );
      const originY = clamp(
        cropTopInDisplay / displaySize.scale,
        0,
        Math.max(pendingImageSize.height - cropSizeOriginal, 0)
      );

      const manipulated = await ImageManipulator.manipulateAsync(
        pendingImage,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(cropSizeOriginal),
              height: Math.round(cropSizeOriginal),
            },
          },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

      let persistentUri = manipulated.uri;
      if (Platform.OS === 'web') {
        // manipulated.uri on web is a blob: URL — only valid for the
        // current page session. Convert it to a base64 data: URI so it
        // survives a page refresh (same fix as chicken photos, see
        // utils/photoStorage.ts).
        try {
          const response = await fetch(manipulated.uri);
          const blob = await response.blob();
          persistentUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Error converting profile photo to a persistent data URI on web:', error);
        }
      } else {
        await ensureProfileImagesDir();
        persistentUri = `${PROFILE_IMAGES_DIR}profile-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: manipulated.uri, to: persistentUri });

        if (profile.profileImage && profile.profileImage.startsWith(PROFILE_IMAGES_DIR)) {
          FileSystem.deleteAsync(profile.profileImage, { idempotent: true }).catch(() => {});
        }
      }

      const updatedProfile = { ...profile, profileImage: persistentUri };
      const profileKey = await getProfileStorageKey();
      await AsyncStorage.setItem(profileKey, JSON.stringify(updatedProfile));

      setProfile(updatedProfile);
      setEditedProfile(updatedProfile);
      setPendingImage(null);
      setPendingImageSize(null);
      setShowImagePreview(false);

      await notify({
        title: 'Profile Picture Updated',
        message: 'Your profile picture has been changed.',
        type: 'info',
      });
    } catch (error) {
      console.error('Error cropping/saving profile image:', error);
      await notify({
        title: 'Photo Error',
        message: 'Failed to save profile picture. Please try again.',
        type: 'alert',
      });
    } finally {
      setIsSavingImage(false);
    }
  };

  const cancelImagePreview = () => {
    setPendingImage(null);
    setPendingImageSize(null);
    setShowImagePreview(false);
  };

  const handleLogoutConfirm = async () => {
    try {
      await AsyncStorage.setItem('isLoggedIn', 'false');
      await AsyncStorage.removeItem('userName');
      await AsyncStorage.removeItem('userEmail');
      await AsyncStorage.removeItem('userPhone');
      setShowLogoutModal(false);
      router.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
      setShowLogoutModal(false);
      await notify({
        title: 'Logout Error',
        message: 'Failed to logout. Please try again.',
        type: 'alert',
      });
    }
  };

  const FieldIcon = ({ icon, tint }: { icon: any; tint?: string }) => (
    <View style={[styles.fieldIconChip, { backgroundColor: (tint || colors.primary) + '18' }]}>
      <Ionicons name={icon} size={15} color={tint || colors.primary} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        <LinearGradient
          colors={isDarkMode ? ['#123A16', '#1B5E20'] : ['#1B5E20', '#2E7D32']}
          style={styles.cover}
        >
          <View pointerEvents="none" style={styles.coverDecoRing} />

          {/* Faint farm silhouette (hills, barn, windmill) — purely
              decorative, sits behind the avatar which is absolutely
              positioned on top via avatarWrap. */}
          <View pointerEvents="none" style={styles.farmSilhouette}>
            <MaterialCommunityIcons name="image-filter-hdr" size={44} color="rgba(255,255,255,0.14)" style={styles.farmHills} />
            <MaterialCommunityIcons name="barn" size={34} color="rgba(255,255,255,0.20)" style={styles.farmBarn} />
            <MaterialCommunityIcons name="wind-turbine" size={26} color="rgba(255,255,255,0.20)" style={styles.farmWindmill} />
          </View>

          {/* Top bar now lives inside the gradient itself, so the green
              spans edge-to-edge from the very top of the screen down
              through the avatar — no separate white strip above it. */}
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>Profile</Text>
            <TouchableOpacity style={styles.topBarBell} onPress={() => setShowNotifications(true)} activeOpacity={0.75}>
              <Ionicons name="notifications-outline" size={22} color="#fff" />
              {unreadCount > 0 && (
                <View style={styles.topBarBellBadge}>
                  <Text style={styles.topBarBellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatarRing, { borderColor: colors.card, backgroundColor: colors.card }]}>
              <Image
                source={profile.profileImage ? { uri: profile.profileImage } : require('../../assets/images/logo.png')}
                style={styles.avatarImage}
              />
            </View>
            <TouchableOpacity style={styles.cameraIcon} onPress={pickProfileImage}>
              <View style={[styles.cameraIconCircle, { borderColor: colors.card }]}>
                <Ionicons name="camera" size={13} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          {isEditing ? (
            <TextInput
              style={[styles.editNameInput, { color: colors.text, borderColor: colors.border }]}
              value={editedProfile.fullName}
              onChangeText={(text) => setEditedProfile({ ...editedProfile, fullName: text })}
              placeholderTextColor={colors.textLight}
            />
          ) : (
            <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>{profile.fullName}</Text>
          )}
          <View style={[styles.roleBadge, { backgroundColor: colors.primary + '18' }]}>
            <View style={[styles.roleBadgeDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.roleBadgeText, { color: colors.primary }]} numberOfLines={1}>
              {profile.role}
            </Text>
          </View>

          {isEditing ? (
            <View style={[styles.editingBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
              <Ionicons name="create-outline" size={13} color={colors.primary} />
              <Text style={[styles.editingBadgeText, { color: colors.primary }]}>Editing Profile Mode</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.editProfileButton, { borderColor: colors.primary }]}
              onPress={() => { setActiveTab('details'); setIsEditing(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={14} color={colors.primary} />
              <Text style={[styles.editProfileButtonText, { color: colors.primary }]}>Edit Profile</Text>
            </TouchableOpacity>
          )}

          <View style={[styles.statsRow, { borderTopColor: colors.divider }]}>
            <View style={styles.statItem}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="home-outline" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalFarms}</Text>
              <Text style={[styles.statLabel, { color: colors.textLight }]}>{pluralize(stats.totalFarms, 'Farm')} </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="people-outline" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.users}</Text>
              <Text style={[styles.statLabel, { color: colors.textLight }]}>{pluralize(stats.users, 'User')} </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="notifications-outline" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.alerts}</Text>
              <Text style={[styles.statLabel, { color: colors.textLight }]}>{pluralize(stats.alerts, 'Alert')} </Text>
            </View>
          </View>

          <View style={[styles.tabsRow, { backgroundColor: colors.background }]}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'details' && { backgroundColor: colors.card }]}
              onPress={() => setActiveTab('details')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabItemText, { color: activeTab === 'details' ? colors.primary : colors.textLight }, activeTab === 'details' && styles.tabItemTextActive]}>
                Details
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'preferences' && { backgroundColor: colors.card }]}
              onPress={() => setActiveTab('preferences')}
              activeOpacity={0.8}
            >
              <View style={styles.tabItemRow}>
                <Ionicons name="settings-outline" size={14} color={activeTab === 'preferences' ? colors.primary : colors.textLight} />
                <Text style={[styles.tabItemText, { color: activeTab === 'preferences' ? colors.primary : colors.textLight }, activeTab === 'preferences' && styles.tabItemTextActive]}>
                  Preferences
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {activeTab === 'details' && (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Personal Information</Text>
              </View>

              <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
                <View style={styles.infoLeft}>
                  <FieldIcon icon="person-outline" />
                  <Text style={[styles.infoLabel, { color: colors.textLight }]}>Full Name </Text>
                </View>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.fullName} onChangeText={(text) => setEditedProfile({ ...editedProfile, fullName: text })} />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.fullName}</Text>
                )}
              </View>

              <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
                <View style={styles.infoLeft}>
                  <FieldIcon icon="mail-outline" tint="#2196F3" />
                  <Text style={[styles.infoLabel, { color: colors.textLight }]}>Email </Text>
                </View>
                <Text style={[styles.infoValue, { color: colors.text }]}>{profile.email}</Text>
              </View>

              <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
                <View style={styles.infoLeft}>
                  <FieldIcon icon="call-outline" tint="#FF9800" />
                  <Text style={[styles.infoLabel, { color: colors.textLight }]}>Phone Number </Text>
                </View>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.phone} onChangeText={(text) => setEditedProfile({ ...editedProfile, phone: text })} keyboardType="phone-pad" />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.phone}</Text>
                )}
              </View>

              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <View style={styles.infoLeft}>
                  <FieldIcon icon="ribbon-outline" tint="#9C27B0" />
                  <Text style={[styles.infoLabel, { color: colors.textLight }]}>User Role </Text>
                </View>
                <Text style={[styles.infoValue, { color: colors.text }]}>{profile.role}</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {profile.role === 'Caretaker' ? 'Assigned Farm' : 'My Farm'}
                  </Text>
                  {profile.role === 'Caretaker' && (
                    <View style={[styles.assignedTag, { backgroundColor: colors.primary + '18' }]}>
                      <Text style={[styles.assignedTagText, { color: colors.primary }]}>Assigned</Text>
                    </View>
                  )}
                </View>
                {!isEditing && profile.role === 'Owner' && (
                  <TouchableOpacity onPress={() => router.push('/farm')}>
                    <Text style={[styles.manageAllFarmsText, { color: colors.primary }]}>
                      All Farms ({stats.totalFarms}) →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {profile.role === 'Owner' ? (
                <>
                  {/* Owner Role: NO farm name row. Location shows owner account location */}
                  <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
                    <View style={styles.infoLeft}>
                      <FieldIcon icon="location-outline" tint="#FF9800" />
                      <Text style={[styles.infoLabel, { color: colors.textLight }]}>Owner Location </Text>
                    </View>
                    {isEditing ? (
                      <TextInput
                        style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]}
                        value={editedProfile.farmLocation}
                        onChangeText={(text) => setEditedProfile({ ...editedProfile, farmLocation: text })}
                        placeholder="Enter your location (e.g. Davao City)"
                        placeholderTextColor={colors.textLight}
                      />
                    ) : (
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        {profile.farmLocation || 'Davao City'}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    disabled={isEditing}
                    activeOpacity={0.7}
                    onPress={() => router.push('/farm')}
                    style={[styles.infoRow, { borderBottomWidth: 0 }]}
                  >
                    <View style={styles.infoLeft}>
                      <FieldIcon icon="people-outline" tint="#2196F3" />
                      <Text style={[styles.infoLabel, { color: colors.textLight }]} numberOfLines={1}>
                        Connected Users{' '}
                      </Text>
                    </View>
                    <View style={styles.infoValueRow}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>{stats.users}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                    </View>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Caretaker Role: Tapping navigates directly to /farm/[id] */}
                  <TouchableOpacity
                    disabled={isEditing || !farmsList[0]?.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (farmsList[0]?.id) {
                        router.push(`/farm/${farmsList[0].id}`);
                      }
                    }}
                    style={[styles.infoRow, { borderBottomColor: colors.divider }]}
                  >
                    <View style={styles.infoLeft}>
                      <FieldIcon icon="business-outline" />
                      <Text style={[styles.infoLabel, { color: colors.textLight }]}>Farm Name </Text>
                    </View>
                    <View style={styles.infoValueRow}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        {profile.farmName || (farmsList[0]?.farm_name) || 'No farm assigned'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={isEditing || !farmsList[0]?.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (farmsList[0]?.id) {
                        router.push(`/farm/${farmsList[0].id}`);
                      }
                    }}
                    style={[styles.infoRow, { borderBottomColor: colors.divider }]}
                  >
                    <View style={styles.infoLeft}>
                      <FieldIcon icon="location-outline" tint="#FF9800" />
                      <Text style={[styles.infoLabel, { color: colors.textLight }]}>Farm Location </Text>
                    </View>
                    <View style={styles.infoValueRow}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        {profile.farmLocation || (farmsList[0]?.farm_location) || 'Not set'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={isEditing || !farmsList[0]?.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (farmsList[0]?.id) {
                        router.push(`/farm/${farmsList[0].id}`);
                      }
                    }}
                    style={[styles.infoRow, { borderBottomWidth: 0 }]}
                  >
                    <View style={styles.infoLeft}>
                      <FieldIcon icon="people-outline" tint="#2196F3" />
                      <Text style={[styles.infoLabel, { color: colors.textLight }]} numberOfLines={1}>
                        Team Members{' '}
                      </Text>
                    </View>
                    <View style={styles.infoValueRow}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>{stats.users}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                    </View>
                  </TouchableOpacity>

                  <Text style={[styles.caretakerNotice, { color: colors.textLight }]}>
                    * Farm details are managed by your Farm Owner. Tap to view details.
                  </Text>
                </>
              )}
            </View>

            {isEditing && (
              <View style={styles.editActionRow}>
                <TouchableOpacity
                  style={[styles.cancelActionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={handleCancelEdit}
                  activeOpacity={0.75}
                >
                  <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.cancelActionBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveActionBtn, { backgroundColor: colors.primary }]}
                  onPress={saveProfile}
                  activeOpacity={0.85}
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.saveActionBtnText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab === 'preferences' && (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Appearance</Text>
              <View style={[styles.preferenceRow, { borderBottomWidth: 0 }]}>
                <View style={styles.preferenceLeft}>
                  <FieldIcon icon="moon-outline" />
                  <Text style={[styles.preferenceLabel, { color: colors.text }]}>Dark Mode</Text>
                </View>
                <Switch value={isDarkMode} onValueChange={toggleDarkMode} trackColor={{ false: '#767577', true: '#4CAF50' }} thumbColor="#fff" />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, marginTop: 14 }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>About & Legal</Text>
              <TouchableOpacity
                style={[styles.preferenceRow, { borderBottomWidth: 0 }]}
                onPress={() => setShowAboutModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.preferenceLeft}>
                  <FieldIcon icon="information-circle-outline" tint="#2E7D32" />
                  <View>
                    <Text style={[styles.preferenceLabel, { color: colors.text }]}>About Clucko</Text>
                    <Text style={{ fontSize: 11, color: colors.textLight, marginTop: 2 }}>App overview, mission, features & disclaimer</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: colors.error }]}
            onPress={() => setShowLogoutModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={[styles.logoutButtonText, { color: colors.error }]}>Logout</Text>
          </TouchableOpacity>
          <Text style={[styles.versionText, { color: colors.textLight }]}>Clucko v1.0.0</Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <NotificationsListModal
        visible={showNotifications}
        notifications={notifications}
        onClose={() => setShowNotifications(false)}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAllNotifications}
        onDismissOne={deleteNotification}
        onPressNotification={(notification) => {
          setShowNotifications(false);
          handleNotificationPress(notification);
        }}
      />

      <Modal
        animationType="fade"
        transparent={true}
        visible={showImagePreview}
        onRequestClose={cancelImagePreview}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.previewModal, { backgroundColor: colors.background }]}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Update Profile Picture</Text>
            <Text style={[styles.previewSubtitle, { color: colors.textSecondary }]}>
              Touch and drag the photo to recenter it, then confirm.
            </Text>

            <View
              style={[styles.cropFrame, { width: CROP_FRAME_SIZE, height: CROP_FRAME_SIZE, borderRadius: CROP_FRAME_SIZE / 2 }]}
              {...panResponder.panHandlers}
            >
              {pendingImage && (
                <Animated.Image
                  source={{ uri: pendingImage }}
                  style={{
                    width: displaySize.width,
                    height: displaySize.height,
                    transform: [{ translateX: pan.x }, { translateY: pan.y }],
                  }}
                />
              )}
            </View>

            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.previewCancelButton} onPress={cancelImagePreview} disabled={isSavingImage}>
                <Text style={[styles.previewCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.previewConfirmButton} onPress={confirmProfileImage} disabled={isSavingImage}>
                <View style={[styles.previewConfirmSolid, { backgroundColor: colors.primary }]}>
                  {isSavingImage ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.previewConfirmText}>Use Photo</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <LogoutConfirmModal
        visible={showLogoutModal}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={handleLogoutConfirm}
      />

      <AboutUsModal
        visible={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        isDarkMode={isDarkMode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 8,
  },
  topBarTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  topBarBell: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  topBarBellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#FF9800',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  topBarBellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  cover: {
    height: 180,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  coverDecoRing: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 20,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  farmSilhouette: {
    position: 'absolute',
    right: 14,
    bottom: 10,
    width: 100,
    height: 70,
  },
  farmHills: { position: 'absolute', right: 0, bottom: -6 },
  farmBarn: { position: 'absolute', right: 40, bottom: 4 },
  farmWindmill: { position: 'absolute', right: 8, bottom: 30 },
  profileCard: {
    marginHorizontal: 16,
    marginTop: -50,
    borderRadius: 20,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 4,
    alignItems: 'center',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarWrap: {
    position: 'absolute',
    top: -44,
    alignSelf: 'center',
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 40 },
  cameraIcon: { position: 'absolute', bottom: 2, right: 2 },
  cameraIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },

  profileName: { fontSize: 19, fontWeight: '700', marginTop: 4 },
  editNameInput: {
    fontSize: 17,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
    textAlign: 'center',
    minWidth: 160,
  },
    roleLine: { fontSize: 13, marginTop: 3, marginBottom: 14 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 6,
    marginBottom: 14,
  },
  roleBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  roleBadgeText: { fontSize: 13, fontWeight: '600' },

  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 16,
  },
  editProfileButtonText: { fontSize: 13, fontWeight: '700' },
  editingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: 16,
  },
  editingBadgeText: { fontSize: 13, fontWeight: '700' },
  assignedTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  assignedTagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  manageAllFarmsText: {
    fontSize: 13,
    fontWeight: '700',
  },
  caretakerNotice: {
    fontSize: 12,
    marginTop: 10,
    fontStyle: 'italic',
  },
  editActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  cancelActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
  },
  cancelActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  saveActionBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  statsRow: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
    paddingTop: 14,
    paddingBottom: 4,
  },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  statIconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statDivider: { width: 1, marginVertical: 2 },
  statValue: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  statLabel: { fontSize: 11, marginTop: 2, textAlign: 'center', includeFontPadding: false, paddingHorizontal: 2 },

  tabsRow: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 26,
    padding: 4,
    marginTop: 16,
    marginBottom: 4,
    overflow: 'hidden',
  },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 22 },
  tabItemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabItemText: { fontSize: 14, fontWeight: '600' },
  tabItemTextActive: { fontWeight: '700' },

  section: { paddingHorizontal: 16, paddingTop: 16, width: '100%' },
  card: { borderRadius: 16, padding: 16, marginBottom: 16, width: '100%', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  editButton: { fontSize: 14, fontWeight: '600' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    width: '100%',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    maxWidth: '52%',
  },
  fieldIconChip: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 14, includeFontPadding: false, paddingRight: 4 },
  infoValue: { fontSize: 15, fontWeight: '500', textAlign: 'right', flexShrink: 1, includeFontPadding: false },
  infoValueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginLeft: 8,
    minWidth: 0,
  },
  infoInput: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },

  saveButton: { marginTop: 16, borderRadius: 12, overflow: 'hidden' },
  saveSolid: { paddingVertical: 13, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  preferenceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, marginTop: 8 },
  preferenceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preferenceLabel: { fontSize: 15 },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
  },
  logoutButtonText: { fontSize: 15, fontWeight: '700' },
  versionText: { textAlign: 'center', fontSize: 12, marginTop: 14 },

  bottomPadding: { height: 30 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },

  previewModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  previewTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  previewSubtitle: { fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 10 },
  cropFrame: {
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 3,
    borderColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  previewActions: { width: '100%', gap: 10 },
  previewCancelButton: { paddingVertical: 12, alignItems: 'center' },
  previewCancelText: { fontSize: 14, fontWeight: '500' },
  previewConfirmButton: { borderRadius: 12, overflow: 'hidden' },
  previewConfirmSolid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, minHeight: 48 },
  previewConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});