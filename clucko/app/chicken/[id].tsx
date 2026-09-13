import { useDarkMode } from '@/context/DarkModeContext';
import { useNotifications } from '@/context/NotificationContext';
import { deleteChickenForCurrentUser, loadChickensForCurrentUser, updateChickenForCurrentUser } from '@/utils/chickenStorage';
import { Farm, getFarmName, loadFarms } from '@/utils/farms';
import { persistChickenPhoto } from '@/utils/photoStorage';
import { apiGetChickenHistory } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddChickenModal, { ChickenFormData } from '../../components/ui/AddChickenModal';
import ConfidenceBadge from '../../components/ui/ConfidenceBadge';
import ChickenIcon from '../../components/ui/ChickenIcon';
import GuestBlockModal from '../../components/ui/GuestBlockModal';

const { width } = Dimensions.get('window');


export default function ChickenDetailScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDarkMode } = useDarkMode();
  const { notify } = useNotifications();
  const [chicken, setChicken] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [chickenScans, setChickenScans] = useState<any[]>([]);
  const [selectedScanHistory, setSelectedScanHistory] = useState<any | null>(null);

  // --- 3-dot dropdown menu (Edit / Delete) ---
  const [showMenu, setShowMenu] = useState(false);
  const [menuStep, setMenuStep] = useState<'menu' | 'confirmDelete'>('menu');
  const [deleting, setDeleting] = useState(false);

  // --- Edit chicken state ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<ChickenFormData>({ name: '', photo: null, farmId: null });
  const [savingEdit, setSavingEdit] = useState(false);

  // Guest block modal (replaces native Alert for guest-blocked actions)
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestFeature, setGuestFeature] = useState('this feature');

  const guestAlert = (featureLabel: string = 'this feature') => {
    setGuestFeature(featureLabel);
    setGuestModalVisible(true);
  };

  // Fetches this chicken's real scan/detection history from the backend
  // (health_history table). recorded_at is the actual scan timestamp —
  // used both for the Capture History tab and to compute "Last Check"
  // below, instead of relying on the chicken record's own created_at.
  const loadScanHistory = async () => {
    try {
      const history = await apiGetChickenHistory(String(id));
      const mapped = (history || []).map((h: any) => {
        const severity = (h.severity || 'none').toLowerCase();
        const status = severity === 'critical' ? 'critical' : severity === 'none' ? 'healthy' : 'warning';
        return {
          id: String(h.id),
          date: h.recorded_at ? new Date(h.recorded_at) : new Date(),
          disease: h.disease_name || null,
          confidence: h.confidence_score != null ? Math.round(h.confidence_score) : 0,
          status,
          observation: h.observation,
          scan_type: h.scan_type,
          image_url: h.image_url,
          captured_by_name: h.captured_by_name || 'Farm Member',
          captured_by_role: (h.captured_by_role || 'member').charAt(0).toUpperCase() + (h.captured_by_role || 'member').slice(1),
        };
      });
      setChickenScans(mapped);
    } catch (error) {
      console.error('Error loading chicken scan history:', error);
    }
  };

  useEffect(() => {
    loadChickenDetails();
    loadScanHistory();
  }, [id]);

  useEffect(() => {
    loadFarms().then(setFarms);
  }, []);

  // Refresh guest status every time this screen regains focus
  // (e.g. after logging in from a guest-triggered login prompt)
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('isGuestMode').then((v) => setIsGuestMode(v === 'true'));
    }, [])
  );

  // Loads this chicken straight from the backend (via
  // loadChickensForCurrentUser, which already scopes to whatever the
  // logged-in account has access to — every chicken for an owner, only
  // assigned-farm chickens for a caretaker) and finds the one matching
  // this route's id/chickenId. No local/sample fallback data anymore —
  // if it's not in the backend response, it's not found or not
  // accessible to this account.
  const loadChickenDetails = async () => {
    setLoading(true);
    try {
      const chickens = await loadChickensForCurrentUser();
      const found = (chickens || []).find((c: any) => c.id === id || c.chickenId === id);
      setChicken(found || null);
    } catch (error) {
      console.error('Error loading chicken:', error);
      setChicken(null);
    } finally {
      setLoading(false);
    }
  };

  // Opens the device image picker, copies the chosen photo into this
  // app's permanent storage (see utils/photoStorage — the raw picker uri
  // is not guaranteed to still exist after the app reloads), then saves
  // the resulting stable uri straight to the backend via
  // updateChickenForCurrentUser so it persists and shows up everywhere
  // else this chicken's photo is used — the Chickens list, Home cards, etc.
  const handleChangePhoto = async () => {
    if (isGuestMode) {
      guestAlert('editing this profile');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          await notify({
            title: 'Permission Needed',
            message: 'Please grant photo library access to update the profile photo.',
            type: 'warning',
          });
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const newPhotoUri = await persistChickenPhoto(result.assets[0].uri);
      setUpdatingPhoto(true);

      setChicken((prev: any) => ({ ...prev, photo: newPhotoUri }));
      await updateChickenForCurrentUser(String(id), { photo: newPhotoUri });
      await notify({
        title: 'Photo Updated',
        message: 'Profile photo has been successfully updated.',
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error updating profile photo:', error);
      await notify({
        title: 'Update Failed',
        message: error.message || 'Could not update the profile photo. Please try again.',
        type: 'alert',
      });
    } finally {
      setUpdatingPhoto(false);
    }
  };

  // --- 3-dot dropdown ---
  const handleMenuButtonPress = () => {
    if (isGuestMode) {
      guestAlert('this feature');
      return;
    }
    setMenuStep('menu');
    setShowMenu(true);
  };

  const closeMenu = () => {
    setShowMenu(false);
    setMenuStep('menu');
  };

  const handleMenuEditPress = () => {
    setShowMenu(false);
    setMenuStep('menu');
    setTimeout(openEditModal, Platform.OS === 'ios' ? 250 : 0);
  };

  const handleMenuDeletePress = () => {
    setMenuStep('confirmDelete');
  };

  // --- Edit chicken ---
  const openEditModal = () => {
    if (!chicken) return;
    setEditForm({
      name: chicken.name || '',
      photo: chicken.photo || null,
      farmId: chicken.farmId ?? null,
    });
    setShowEditModal(true);
  };

  const handleEditPickPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          await notify({
            title: 'Permission Needed',
            message: 'Please grant photo library access to update the profile photo.',
            type: 'warning',
          });
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;
      const permanentUri = await persistChickenPhoto(result.assets[0].uri);
      setEditForm((prev) => ({ ...prev, photo: permanentUri }));
    } catch (error) {
      console.error('Error picking photo:', error);
      await notify({
        title: 'Photo Error',
        message: 'Could not open the photo picker. Please try again.',
        type: 'alert',
      });
    }
  };

  // Saves the edited name/photo/farm straight to the backend via
  // updateChickenForCurrentUser — a single PUT to this chicken's own
  // record, not a read-modify-write of the whole flock.
  const handleEditSubmit = async () => {
    if (!editForm.name.trim()) {
      await notify({
        title: 'Missing Info',
        message: 'Please enter a name for your chicken.',
        type: 'warning',
      });
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await updateChickenForCurrentUser(String(id), {
        name: editForm.name.trim(),
        photo: editForm.photo,
        farmId: editForm.farmId,
      });

      setChicken((prev: any) => ({ ...prev, ...updated }));
      setShowEditModal(false);
      await notify({
        title: 'Chicken Updated',
        message: `${updated.name}'s profile has been updated.`,
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error saving chicken edits:', error);
      await notify({
        title: 'Save Failed',
        message: error.message || 'Could not save changes. Please try again.',
        type: 'alert',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // --- Delete chicken ---
  const handleDeleteChicken = async () => {
    setDeleting(true);
    try {
      await deleteChickenForCurrentUser(String(id));
      setShowMenu(false);
      setMenuStep('menu');
      await notify({
        title: 'Chicken Removed',
        message: 'Chicken has been removed from flock.',
        type: 'info',
      });
      router.back();
    } catch (error: any) {
      console.error('Error deleting chicken:', error);
      await notify({
        title: 'Delete Failed',
        message: error.message || 'Could not delete this chicken. Please try again.',
        type: 'alert',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!chicken) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.text }]}>Chicken not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.errorButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const lastScan = chickenScans.length > 0 ? chickenScans[0] : null;
  // "Last Check" now comes from the real most-recent scan (health_history),
  // not the chicken record's own created_at — a chicken can exist without
  // ever being scanned, and its status can change well after creation.
  const lastCheckLabel = lastScan ? lastScan.date.toLocaleDateString() : 'Never';
  const addedLabel = chicken.dateAdded || 'N/A';

  const statusColor = chicken.statusColor || (chicken.status === 'HEALTHY' ? '#4CAF50' : chicken.status === 'WARNING' ? '#FF9800' : '#f44336');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header - Compact */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <TouchableOpacity style={styles.menuButton} onPress={handleMenuButtonPress}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Dropdown menu — anchored under the 3-dot button. Shows the 2-choice
          menu (Edit / Delete) or, after tapping Delete, swaps in place to a
          confirmation view — all inside the same panel, no native Alert. */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.dropdownOverlay} onPress={closeMenu}>
          {menuStep === 'menu' ? (
            <View style={[styles.dropdownMenu, { backgroundColor: colors.card, shadowColor: isDarkMode ? '#000' : '#333' }]}>
              <TouchableOpacity
                style={[styles.dropdownItem, { borderBottomColor: colors.divider }]}
                onPress={handleMenuEditPress}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={18} color={colors.text} />
                <Text style={[styles.dropdownItemText, { color: colors.text }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={handleMenuDeletePress}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color="#f44336" />
                <Text style={[styles.dropdownItemText, { color: '#f44336' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Pressable
              style={[styles.confirmDeleteCard, { backgroundColor: colors.card, shadowColor: isDarkMode ? '#000' : '#333' }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.confirmDeleteIconWrap}>
                <Ionicons name="warning" size={22} color="#f44336" />
              </View>
              <Text style={[styles.confirmDeleteTitle, { color: colors.text }]}>Delete Chicken?</Text>
              <Text style={[styles.confirmDeleteBody, { color: colors.textSecondary }]}>
                {chicken?.name || 'This chicken'}'s entire profile will be permanently removed. This cannot be undone.
              </Text>
              <View style={styles.confirmDeleteActions}>
                <TouchableOpacity
                  style={[styles.confirmDeleteCancelBtn, { borderColor: colors.border }]}
                  onPress={closeMenu}
                  activeOpacity={0.75}
                  disabled={deleting}
                >
                  <Text style={[styles.confirmDeleteCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmDeleteConfirmBtn, { backgroundColor: '#f44336' }]}
                  onPress={handleDeleteChicken}
                  activeOpacity={0.85}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmDeleteConfirmText}>Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Compact Profile Card - Small image, horizontal layout */}
        <LinearGradient
          colors={[statusColor + '15', colors.card]}
          style={[styles.profileCard, { backgroundColor: colors.card }]}
        >
          <View style={styles.profileRow}>
            <TouchableOpacity
              style={[styles.avatarContainer, { borderColor: statusColor }]}
              onPress={handleChangePhoto}
              activeOpacity={0.8}
              disabled={updatingPhoto}
            >
              {chicken.photo ? (
                <Image
                  source={{ uri: chicken.photo }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }]}>
                  <ChickenIcon size={38} color="#4CAF50" />
                </View>
              )}
              {updatingPhoto ? (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <View style={[styles.editPhotoBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                  <Ionicons name="camera" size={12} color="#fff" />
                </View>
              )}
              <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={[styles.chickenName, { color: colors.text }]} numberOfLines={2}>{chicken.name}</Text>
              <Text style={[styles.chickenBreed, { color: colors.textSecondary }]} numberOfLines={2}>
                {getFarmName(farms, chicken.farmId)}
              </Text>
              <View style={[styles.statusChip, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusChipText, { color: statusColor }]}>{chicken.status || chicken.healthStatus?.toUpperCase() || 'HEALTHY'}</Text>
              </View>
            </View>
            <View style={styles.idBadge}>
              <Text style={styles.idBadgeText}>{chicken.chickenId || `CK-00${chicken.id}`}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Quick Stats Row - Compact */}
        <View style={styles.statsContainer}>
          <View style={[styles.statItem, { backgroundColor: colors.card }]}>
            <Ionicons name="home-outline" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text, fontSize: 12, textAlign: 'center' }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
              {getFarmName(farms, chicken.farmId)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textLight }]} numberOfLines={1}>Farm </Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: colors.card }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text, fontSize: 12, textAlign: 'center' }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {lastCheckLabel}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textLight }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Last Check </Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: colors.card }]}>
            <Ionicons name="scan-outline" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text, textAlign: 'center' }]}>{chickenScans.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textLight }]} numberOfLines={1}>Capture </Text>
          </View>
        </View>

        {/* Tab Navigation - Compact */}
        <View style={styles.tabsContainer}>
          {['info', 'scans', 'health'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && { color: colors.primary, fontWeight: 'bold' },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {tab === 'info' ? 'Information' : tab === 'scans' ? 'Capture History' : 'Health'}
              </Text>
              {activeTab === tab && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Info Tab Content - Compact Grid (now 3 cards: Farm/Added/Last Check) */}
        {activeTab === 'info' && (
          <View style={styles.infoGrid}>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="home-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Farm</Text>
              <Text style={[styles.infoCardValue, { color: colors.text, textAlign: 'center' }]} numberOfLines={3}>
                {getFarmName(farms, chicken.farmId)}
              </Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Added</Text>
              <Text style={[styles.infoCardValue, { color: colors.text, textAlign: 'center' }]} numberOfLines={2}>{addedLabel}</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="medkit-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Last Check</Text>
              <Text style={[styles.infoCardValue, { color: colors.text, textAlign: 'center' }]} numberOfLines={2}>{lastCheckLabel}</Text>
            </View>
          </View>
        )}

        {/* Scans Tab Content - Shows AI Detection Confidence, colored by
            actual severity (red=critical, orange=warning, green=healthy) */}
        {activeTab === 'scans' && (
          <View style={styles.scansContainer}>
            {chickenScans.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                <Ionicons name="scan-outline" size={48} color={colors.textLight} />
                <Text style={[styles.emptyText, { color: colors.text }]}>No scans yet</Text>
                <TouchableOpacity style={[styles.emptyButton, { backgroundColor: colors.primary }]} onPress={() => {
                  if (isGuestMode) {
                    guestAlert('Scan & Detect');
                    return;
                  }
                  router.push({
                    pathname: '/(tabs)/capture',
                    params: { chickenId: chicken.chickenId || String(chicken.id) },
                  });
                }}>
                  <Text style={styles.emptyButtonText}>New Capture</Text>
                </TouchableOpacity>
              </View>
            ) : (
              chickenScans.map((scan) => {
                const scanColor = scan.status === 'critical' ? '#f44336' : scan.status === 'warning' ? '#FF9800' : '#4CAF50';
                return (
                  <TouchableOpacity
                    key={scan.id}
                    style={[styles.scanItem, { backgroundColor: colors.card }]}
                    onPress={() => setSelectedScanHistory(scan)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.scanItemLeft}>
                      <View style={[styles.scanDot, { backgroundColor: scanColor }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.scanDate, { color: colors.text }]}>
                          {scan.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </Text>
                        <Text style={[styles.scanCondition, { color: scanColor }]}>
                          {scan.disease || 'Healthy (Normal)'}
                        </Text>
                        {scan.captured_by_name && (
                          <View style={styles.capturedByRow}>
                            <Ionicons name="person-outline" size={11} color={colors.textLight} />
                            <Text style={[styles.capturedByText, { color: colors.textSecondary }]} numberOfLines={1}>
                              Captured by {scan.captured_by_name} ({scan.captured_by_role})
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.scanItemRight}>
                      <Text style={[styles.scanConfidenceLabel, { color: colors.textLight }]}>AI Accuracy</Text>
                      <Text style={[styles.scanConfidence, { color: scanColor }]}>{scan.confidence}%</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textLight} style={{ marginTop: 2 }} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Health Tab Content - Confidence bar/text now colored by the
            actual severity of the latest scan (status), not just the
            raw confidence number — a 100%-confidence Critical detection
            shows red, not green. */}
        {activeTab === 'health' && (
          <View style={styles.healthContainer}>
            {lastScan && (
              <View style={[styles.healthCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.healthCardTitle, { color: colors.text }]}>Latest AI Detection</Text>
                <ConfidenceBadge score={lastScan.confidence} size="medium" showLabel={true} status={lastScan.status} />
                <View style={styles.healthFooter}>
                  <Text style={[styles.healthDate, { color: colors.textLight }]}>{lastScan.date.toLocaleDateString()}</Text>
                  <Text style={[styles.healthStatus, { color: lastScan.status === 'healthy' ? '#4CAF50' : lastScan.status === 'warning' ? '#FF9800' : '#f44336' }]}>
                    {lastScan.status === 'healthy' ? '✓ Normal' : lastScan.status === 'warning' ? '⚠ Alert' : '🚨 Critical'}
                  </Text>
                </View>
                <Text style={[styles.aiNote, { color: colors.textLight }]}>
                  Confidence score indicates AI detection accuracy
                </Text>
              </View>
            )}

            <View style={[styles.healthCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.healthCardTitle, { color: colors.text }]}>Recommendations</Text>
              <View style={styles.recommendationItem}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>Weekly health checks</Text>
              </View>
              <View style={styles.recommendationItem}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>Keep vaccination records updated</Text>
              </View>
              <View style={styles.recommendationItem}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>Monitor behavior daily</Text>
              </View>
            </View>

            {/* Uses the real latest scan's severity, not the chicken
                record's own status field — those can drift out of sync
                (e.g. chicken.status stays CRITICAL from an old scan even
                after a newer healthy scan came in). */}
            {lastScan?.status === 'warning' && (
              <View style={[styles.warningCard, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="alert-circle" size={20} color="#FF9800" />
                <Text style={styles.warningText}>AI detected possible symptoms. Consult a veterinarian for confirmation.</Text>
              </View>
            )}

            {lastScan?.status === 'critical' && (
              <View style={[styles.criticalCard, { backgroundColor: '#FFEBEE' }]}>
                <Ionicons name="warning" size={20} color="#f44336" />
                <Text style={styles.criticalText}>AI indicates critical signs. Seek immediate veterinary attention!</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons - Compact */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.primary }]} onPress={() => {
            if (isGuestMode) {
              guestAlert('Scan & Detect');
              return;
            }
            router.push({
              pathname: '/(tabs)/capture',
              params: { chickenId: chicken.chickenId || String(chicken.id) },
            });
          }}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>{chickenScans.length > 0 ? 'Capture Again' : 'New Capture'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Edit Chicken Modal — reuses the same sheet used to add a chicken */}
      <AddChickenModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleEditSubmit}
        form={editForm}
        onChange={setEditForm}
        onPickPhoto={handleEditPickPhoto}
        colors={colors}
        title="Edit Chicken"
        submitLabel={savingEdit ? 'Saving…' : 'Save Changes'}
      />

      {/* Guest Block Modal — responsive, works across web/desktop/phone/tablet */}
      <GuestBlockModal
        visible={guestModalVisible}
        onClose={() => setGuestModalVisible(false)}
        featureLabel={guestFeature}
      />

      {/* Clickable Scan History Detail Modal */}
      <Modal
        visible={!!selectedScanHistory}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedScanHistory(null)}
      >
        <View style={styles.scanModalOverlay}>
          <View style={[styles.scanModalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.scanModalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.scanModalTitle, { color: colors.text }]}>Capture Details</Text>
                <Text style={[styles.scanModalSubtitle, { color: colors.textSecondary }]}>
                  {selectedScanHistory?.date?.toLocaleDateString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedScanHistory(null)}
                style={[styles.scanModalCloseBtn, { backgroundColor: isDarkMode ? '#2A2A2A' : '#F0F0F0' }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scanModalBody} showsVerticalScrollIndicator={false}>
              {/* Scan Image */}
              <View style={styles.scanModalImageWrap}>
                {selectedScanHistory?.image_url || chicken?.photo ? (
                  <Image
                    source={{ uri: selectedScanHistory?.image_url || chicken?.photo }}
                    style={styles.scanModalImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.scanModalImage, { backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }]}>
                    <ChickenIcon size={72} color="#4CAF50" />
                  </View>
                )}
                <View
                  style={[
                    styles.scanModalSeverityBadge,
                    {
                      backgroundColor:
                        selectedScanHistory?.status === 'critical'
                          ? '#f44336'
                          : selectedScanHistory?.status === 'warning'
                          ? '#FF9800'
                          : '#4CAF50',
                    },
                  ]}
                >
                  <Text style={styles.scanModalSeverityText}>
                    {(selectedScanHistory?.status || 'HEALTHY').toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Condition & Confidence Section */}
              <View style={[styles.scanModalSection, { backgroundColor: isDarkMode ? '#1E1E1E' : '#F9FBF9', borderColor: colors.border }]}>
                <Text style={[styles.scanModalSectionTitle, { color: colors.textLight }]}>Diagnosis Result</Text>
                <Text
                  style={[
                    styles.scanModalDiseaseName,
                    {
                      color:
                        selectedScanHistory?.status === 'critical'
                          ? '#f44336'
                          : selectedScanHistory?.status === 'warning'
                          ? '#FF9800'
                          : '#4CAF50',
                    },
                  ]}
                >
                  {selectedScanHistory?.disease || 'Healthy (No Disease Detected)'}
                </Text>

                <View style={styles.scanModalConfidenceRow}>
                  <Text style={[styles.scanModalConfLabel, { color: colors.textSecondary }]}>Detection Confidence:</Text>
                  <Text style={[styles.scanModalConfValue, { color: colors.text }]}>{selectedScanHistory?.confidence}%</Text>
                </View>

                {/* Progress bar */}
                <View style={[styles.scanModalConfTrack, { backgroundColor: isDarkMode ? '#333' : '#E0E0E0' }]}>
                  <View
                    style={[
                      styles.scanModalConfFill,
                      {
                        width: `${Math.min(100, Math.max(10, selectedScanHistory?.confidence || 0))}%`,
                        backgroundColor:
                          selectedScanHistory?.status === 'critical'
                            ? '#f44336'
                            : selectedScanHistory?.status === 'warning'
                            ? '#FF9800'
                            : '#4CAF50',
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Symptoms & Observations */}
              <View style={[styles.scanModalSection, { backgroundColor: isDarkMode ? '#1E1E1E' : '#F9FBF9', borderColor: colors.border }]}>
                <Text style={[styles.scanModalSectionTitle, { color: colors.textLight }]}>Observations & Symptoms</Text>
                <Text style={[styles.scanModalObservationText, { color: colors.text }]}>
                  {selectedScanHistory?.observation || (selectedScanHistory?.status === 'healthy' ? 'Clear eyes, normal upright posture, and symmetrical wing alignment.' : 'Anatomical abnormalities detected during scan.')}
                </Text>
              </View>

              {/* Captured By Attribution */}
              <View style={[styles.scanModalSection, { backgroundColor: isDarkMode ? '#1E1E1E' : '#F9FBF9', borderColor: colors.border }]}>
                <Text style={[styles.scanModalSectionTitle, { color: colors.textLight }]}>Captured By</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={16} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                        {selectedScanHistory?.captured_by_name || 'Farm Member'}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {selectedScanHistory?.captured_by_role || 'Member'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: selectedScanHistory?.captured_by_role?.toLowerCase() === 'owner' ? '#2E7D3220' : '#2196F320', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: selectedScanHistory?.captured_by_role?.toLowerCase() === 'owner' ? '#2E7D32' : '#1976D2' }}>
                      {selectedScanHistory?.captured_by_role || 'Member'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Recommendations / Guide */}
              <View style={[styles.scanModalSection, { backgroundColor: isDarkMode ? '#1E1E1E' : '#F9FBF9', borderColor: colors.border }]}>
                <Text style={[styles.scanModalSectionTitle, { color: colors.textLight }]}>Care Recommendation</Text>
                {selectedScanHistory?.status === 'critical' ? (
                  <Text style={{ color: '#f44336', fontSize: 13, lineHeight: 18 }}>
                    🚨 Immediately isolate this gamefowl in a quarantined coop. Disinfect feeders and water sources, restrict contact with other birds, and consult an avian veterinarian immediately.
                  </Text>
                ) : selectedScanHistory?.status === 'warning' ? (
                  <Text style={{ color: '#FF9800', fontSize: 13, lineHeight: 18 }}>
                    ⚠️ Early symptoms detected. Isolate bird for close observation over the next 24-48 hours. Ensure clean, warm shelter and electrolytes in water.
                  </Text>
                ) : (
                  <Text style={{ color: '#4CAF50', fontSize: 13, lineHeight: 18 }}>
                    ✓ Bird appears in healthy condition. Maintain regular vaccination schedules, clean water, and standard biosecurity measures.
                  </Text>
                )}
              </View>
            </ScrollView>

            <View style={[styles.scanModalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.scanModalDoneBtn, { backgroundColor: colors.primary }]}
                onPress={() => setSelectedScanHistory(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.scanModalDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '500',
  },
  errorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  menuButton: {
    padding: 8,
  },
  // --- Dropdown menu (Edit / Delete), anchored top-right below the header ---
  dropdownOverlay: {
    flex: 1,
  },
  dropdownMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 96 : 84,
    right: 16,
    width: 160,
    borderRadius: 12,
    paddingVertical: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // --- Delete confirmation panel (same dropdown, swapped content) ---
  confirmDeleteCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 96 : 84,
    right: 16,
    left: 16,
    maxWidth: 340,
    alignSelf: 'flex-end',
    borderRadius: 16,
    padding: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
  },
  confirmDeleteIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(244,67,54,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmDeleteTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  confirmDeleteBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  confirmDeleteActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmDeleteCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmDeleteConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  profileCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 20,
    padding: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    borderWidth: 2,
    borderRadius: 36,
    padding: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPhotoBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 14,
  },
  chickenName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  chickenBreed: {
    fontSize: 13,
    marginBottom: 6,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  idBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  idBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 20,
    gap: 10,
  },
  statItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 16,
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    textAlign: 'center',
    includeFontPadding: false,
    paddingHorizontal: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    alignItems: 'center',
    position: 'relative',
  },
  activeTab: {
    backgroundColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    color: '#999',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 40,
    height: 2,
    borderRadius: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    gap: 12,
  },
  infoCard: {
    width: (width - 44) / 2,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    gap: 6,
  },
  infoCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(46,125,50,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoCardLabel: {
    fontSize: 11,
    textAlign: 'center',
    includeFontPadding: false,
    paddingHorizontal: 2,
  },
  infoCardValue: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  scansContainer: {
    marginHorizontal: 16,
    gap: 10,
  },
  scanItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  scanItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 10,
  },
  scanDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scanDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  scanCondition: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  capturedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  capturedByText: {
    fontSize: 11,
    fontWeight: '500',
  },
  scanItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  scanConfidenceLabel: {
    fontSize: 9,
    marginBottom: 2,
  },
  scanConfidence: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  healthContainer: {
    marginHorizontal: 16,
    gap: 12,
  },
  healthCard: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  healthCardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  healthFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  healthDate: {
    fontSize: 11,
  },
  healthStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiNote: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  recommendationText: {
    fontSize: 12,
    flex: 1,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FF9800',
  },
  criticalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  criticalText: {
    flex: 1,
    fontSize: 12,
    color: '#f44336',
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 20,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 30,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
  },
  actionButtonOutlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 30,
  },

  // --- Scan History Detail Modal Styles ---
  scanModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  scanModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '65%',
    width: '100%',
    overflow: 'hidden',
  },
  scanModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scanModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scanModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scanModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanModalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  scanModalImageWrap: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
    marginBottom: 16,
  },
  scanModalImage: {
    width: '100%',
    height: '100%',
  },
  scanModalSeverityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  scanModalSeverityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scanModalSection: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  scanModalSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  scanModalDiseaseName: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  scanModalConfidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  scanModalConfLabel: {
    fontSize: 13,
  },
  scanModalConfValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  scanModalConfTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  scanModalConfFill: {
    height: '100%',
    borderRadius: 3,
  },
  scanModalObservationText: {
    fontSize: 13,
    lineHeight: 19,
  },
  scanModalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scanModalDoneBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanModalDoneBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});