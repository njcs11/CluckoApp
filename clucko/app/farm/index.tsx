import { useDarkMode } from '@/context/DarkModeContext';
import { useNotifications } from '@/context/NotificationContext';
import { isTablet, scaleFont } from '@/utils/responsive';
import { Feather, FontAwesome5, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FarmMap from '../../components/ui/FarmMap';
import ChickenIcon from '../../components/ui/ChickenIcon';
import GuestBlockModal from '../../components/ui/GuestBlockModal';
import LocationPickerModal from '../../components/ui/LocationPickerModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { apiCreateFarm, apiDeleteFarm, apiGetFarms, apiGetProfile, apiUpdateFarm } from '../../lib/api';

interface Farm {
  id: number;
  farm_name: string;
  farm_location: string;
  farm_code: string;
  description: string;
  latitude?: number;
  longitude?: number;
  chicken_count?: number;
  caretaker_count?: number;
}

export default function FarmListScreen() {
  const { colors, isDarkMode } = useDarkMode();
  const { width } = useWindowDimensions();
  const tablet = isTablet();
  const numColumns = tablet ? 2 : 1;

  const { from } = useLocalSearchParams<{ from?: string }>();
  const cameFromAddChicken = from === 'add-chicken';

  const { notify } = useNotifications();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [userRole, setUserRole] = useState<'owner' | 'caretaker'>('owner');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
  const [farmToDelete, setFarmToDelete] = useState<Farm | null>(null);
  const [deletingFarm, setDeletingFarm] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [formData, setFormData] = useState({
    farm_name: '',
    farm_location: '',
    description: '',
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
  });

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestFeature, setGuestFeature] = useState('this feature');

  const guestAlert = (featureLabel: string = 'this feature') => {
    setGuestFeature(featureLabel);
    setGuestModalVisible(true);
  };

  const handleBack = () => {
    if (cameFromAddChicken) {
      router.replace({ pathname: '/(tabs)/chickens', params: { reopenAddChicken: '1' } });
    } else {
      router.replace('/(tabs)/chickens');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadFarms();
      checkGuestMode();
    }, [])
  );

  const checkGuestMode = async () => {
    try {
      const guestFlag = await AsyncStorage.getItem('isGuestMode');
      setIsGuestMode(guestFlag === 'true');
    } catch (error) {
      console.error('Error checking guest mode:', error);
    }
  };

  const loadFarms = async () => {
    setLoading(true);
    try {
      const [data, profileData] = await Promise.all([
        apiGetFarms(),
        apiGetProfile().catch(() => null),
      ]);
      setFarms(data || []);
      if (profileData?.role) {
        setUserRole(profileData.role.toLowerCase() === 'caretaker' ? 'caretaker' : 'owner');
      }
    } catch (error: any) {
      console.error('Error loading farms:', error);
      await notify({
        title: 'Error',
        message: error.message || 'Failed to load farms.',
        type: 'alert',
      });
    } finally {
      setLoading(false);
    }
  };

  const openAddForm = () => {
    if (isGuestMode) {
      guestAlert('adding a farm');
      return;
    }
    setEditingFarm(null);
    setFormData({ farm_name: '', farm_location: '', description: '', latitude: undefined, longitude: undefined });
    setShowFormModal(true);
  };

  const openEditForm = (farm: Farm) => {
    if (isGuestMode) {
      guestAlert('editing a farm');
      return;
    }
    setEditingFarm(farm);
    setFormData({
      farm_name: farm.farm_name,
      farm_location: farm.farm_location,
      description: farm.description || '',
      latitude: farm.latitude,
      longitude: farm.longitude,
    });
    setShowFormModal(true);
  };

  const handleSaveFarm = async () => {
    if (!formData.farm_name.trim() || !formData.farm_location.trim()) {
      await notify({
        title: 'Missing Info',
        message: 'Please enter at least a farm name and location.',
        type: 'warning',
      });
      return;
    }

    setSaving(true);
    try {
      const wasEditing = !!editingFarm;
      const payload = {
        farm_name: formData.farm_name.trim(),
        farm_location: formData.farm_location.trim(),
        description: formData.description,
        latitude: formData.latitude,
        longitude: formData.longitude,
      };

      if (editingFarm) {
        await apiUpdateFarm(editingFarm.id, payload);
      } else {
        await apiCreateFarm(payload);
      }

      setShowFormModal(false);
      await loadFarms();

      await notify({
        title: wasEditing ? 'Farm Updated' : 'Farm Added',
        message: wasEditing
          ? `"${payload.farm_name}" has been updated.`
          : `"${payload.farm_name}" has been added to your farms.`,
        type: 'success',
      });
    } catch (error: any) {
      await notify({
        title: 'Save Failed',
        message: error.message || 'Failed to save farm. Please try again.',
        type: 'alert',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFarm = (farm: Farm) => {
    if (isGuestMode) {
      guestAlert('deleting a farm');
      return;
    }
    setFarmToDelete(farm);
  };

  const confirmDeleteFarm = async () => {
    if (!farmToDelete) return;
    setDeletingFarm(true);
    try {
      await apiDeleteFarm(farmToDelete.id);
      await loadFarms();
      await notify({
        title: 'Farm Deleted',
        message: `"${farmToDelete.farm_name}" has been removed. Assigned chickens are now unassigned.`,
        type: 'info',
      });
    } catch (error: any) {
      await notify({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete farm.',
        type: 'alert',
      });
    } finally {
      setDeletingFarm(false);
      setFarmToDelete(null);
    }
  };

  const renderFarmCard = ({ item }: { item: Farm }) => (
    <TouchableOpacity
      style={[
        styles.farmCard,
        { backgroundColor: colors.card, width: tablet ? '48%' : '100%' },
      ]}
      onPress={() => router.push(`/farm/${item.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.farmCardHeader}>
        <View style={[styles.farmIcon, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="home" size={22} color={colors.primary} />
        </View>
        {userRole === 'owner' && (
          <View style={styles.farmCardActions}>
            <TouchableOpacity onPress={() => openEditForm(item)} style={styles.iconButton}>
              <Feather name="edit-2" size={16} color={colors.textLight} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteFarm(item)} style={styles.iconButton}>
              <Feather name="trash-2" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={[styles.farmName, { color: colors.text, fontSize: scaleFont(16) }]} numberOfLines={1}>
        {item.farm_name}
      </Text>
      <View style={styles.farmLocationRow}>
        <Ionicons name="location-outline" size={13} color={colors.textLight} />
        <Text style={[styles.farmLocation, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.farm_location}
        </Text>
        {item.latitude != null && (
          <View style={[styles.pinnedBadge, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="pin" size={10} color={colors.primary} />
          </View>
        )}
      </View>

      <View style={[styles.farmFooter, { borderTopColor: colors.divider }]}>
        <View style={styles.farmStat}>
          <ChickenIcon size={14} color={colors.primary} />
          <Text style={[styles.farmStatText, { color: colors.text }]}>
            {item.chicken_count || 0} chickens
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: scaleFont(18) }]}>My Farms</Text>
        <View style={{ width: 40 }} />
      </View>

      {farms.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="home-outline" size={56} color={colors.textLight} />
          <Text style={[styles.emptyStateTitle, { color: colors.text }]}>No farms yet</Text>
          <Text style={[styles.emptyStateSubtitle, { color: colors.textSecondary }]}>
            Add a farm to start organizing your flock by location.
          </Text>
          <TouchableOpacity style={styles.emptyStateButton} onPress={openAddForm}>
            <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.emptyStateButtonGradient}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.emptyStateButtonText}>Add Your First Farm</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={farms}
          renderItem={renderFarmCard}
          keyExtractor={(item) => String(item.id)}
          key={numColumns}
          numColumns={numColumns}
          columnWrapperStyle={tablet ? { justifyContent: 'space-between' } : undefined}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={styles.mapSection}>
                <Text style={[styles.mapSectionTitle, { color: colors.text }]}>Farm Locations — Davao City</Text>
                <FarmMap
                  farms={farms.map((f) => ({
                    id: String(f.id),
                    name: f.farm_name,
                    latitude: f.latitude,
                    longitude: f.longitude,
                  }))}
                  onMarkerPress={(farmId) => router.push(`/farm/${farmId}`)}
                  height={200}
                  primaryColor={colors.primary}
                />
              </View>

              <View style={styles.yourFarmsHeader}>
                <Text style={[styles.yourFarmsTitle, { color: colors.text }]}>Your Farms</Text>
                <Text style={[styles.yourFarmsSubtitle, { color: colors.textSecondary }]}>
                  Manage and monitor all your farm locations.
                </Text>
              </View>
            </>
          }
        />
      )}

      {userRole === 'owner' && farms.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAddForm} activeOpacity={0.85}>
          <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.fabGradient}>
            <Ionicons name="add" size={30} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Add/Edit Farm Modal */}
      <Modal animationType="slide" transparent visible={showFormModal} onRequestClose={() => setShowFormModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.formModal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingFarm ? 'Edit Farm' : 'Add New Farm'}
              </Text>
              <TouchableOpacity onPress={() => setShowFormModal(false)}>
                <Ionicons name="close-circle" size={30} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>
                  Farm Name <Text style={{ color: colors.error }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.formInput, { borderColor: colors.border, color: colors.text }]}
                  placeholder="e.g., Dela Cruz Gamefowl Farm"
                  placeholderTextColor={colors.textLight}
                  value={formData.farm_name}
                  onChangeText={(text) => setFormData({ ...formData, farm_name: text })}
                />
              </View>

              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>
                  Location <Text style={{ color: colors.error }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.formInput, { borderColor: colors.border, color: colors.text }]}
                  placeholder="e.g., San Jose, Davao City"
                  placeholderTextColor={colors.textLight}
                  value={formData.farm_location}
                  onChangeText={(text) => setFormData({ ...formData, farm_location: text })}
                />
              </View>

              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Farm Location on Map</Text>
                <TouchableOpacity
                  style={[styles.mapPickButton, { borderColor: colors.border }]}
                  onPress={() => setShowLocationPicker(true)}
                >
                  <Ionicons name="map-outline" size={18} color={colors.primary} />
                  <Text style={[styles.mapPickButtonText, { color: colors.text }]}>
                    {formData.latitude ? 'Location pinned ✓ (tap to change)' : 'Tap to pin on Davao City map'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Description (optional)</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea, { borderColor: colors.border, color: colors.text }]}
                  placeholder="Notes about this farm..."
                  placeholderTextColor={colors.textLight}
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { opacity: saving ? 0.7 : 1 }]}
                onPress={handleSaveFarm}
                disabled={saving}
              >
                <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.submitGradient}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>{editingFarm ? 'Save Changes' : 'Add Farm'}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <LocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        initialCoords={formData.latitude != null ? { latitude: formData.latitude, longitude: formData.longitude! } : undefined}
        onConfirm={(coords) => setFormData({ ...formData, latitude: coords.latitude, longitude: coords.longitude })}
      />

      <GuestBlockModal
        visible={guestModalVisible}
        onClose={() => setGuestModalVisible(false)}
        featureLabel={guestFeature}
      />

      <ConfirmModal
        visible={!!farmToDelete}
        title="Delete Farm"
        message={`Delete "${farmToDelete?.farm_name}"? Chickens assigned to this farm will become unassigned.`}
        confirmText="Delete"
        cancelText="Cancel"
        icon="trash-outline"
        iconColor="#E53935"
        isDestructive={true}
        loading={deletingFarm}
        onConfirm={confirmDeleteFarm}
        onCancel={() => setFarmToDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 16,
    paddingBottom: 12,
  },
  backButton: { padding: 8, width: 40 },
  headerTitle: { fontWeight: '600' },
  mapSection: { marginBottom: 20, gap: 8 },
  mapSectionTitle: { fontSize: 14, fontWeight: '600' },
  yourFarmsHeader: { marginBottom: 14 },
  yourFarmsTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  yourFarmsSubtitle: { fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 110, gap: 12 },
  farmCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  farmCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  farmIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  farmCardActions: { flexDirection: 'row', gap: 4 },
  iconButton: { padding: 8 },
  farmName: { fontWeight: 'bold', marginBottom: 4 },
  farmLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  farmLocation: { fontSize: 13, flex: 1 },
  pinnedBadge: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  farmFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  farmStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  farmStatText: { fontSize: 13, fontWeight: '500' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyStateSubtitle: { fontSize: 13, textAlign: 'center', marginBottom: 12 },
  emptyStateButton: { borderRadius: 30, overflow: 'hidden' },
  emptyStateButtonGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 24 },
  emptyStateButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fabGradient: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  formModal: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  formField: { marginBottom: 16 },
  formLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  formInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  formTextArea: { height: 90, textAlignVertical: 'top' },
  mapPickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  mapPickButtonText: { fontSize: 13, fontWeight: '500' },
  submitButton: { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 20 },
  submitGradient: { paddingVertical: 16, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});