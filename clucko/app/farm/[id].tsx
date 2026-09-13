import { useDarkMode } from '@/context/DarkModeContext';
import { useNotifications } from '@/context/NotificationContext';
import { scaleFont } from '@/utils/responsive';
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
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FarmMap from '../../components/ui/FarmMap';
import ChickenAvatar from '../../components/ui/ChickenAvatar';
import ChickenIcon from '../../components/ui/ChickenIcon';
import ConfirmModal from '../../components/ui/ConfirmModal';
import {
  apiGetFarm,
  apiGetProfile,
  apiRemoveMember,
  apiCreateCaretaker,
  apiDeleteFarm,
} from '../../lib/api';

export default function FarmDetailScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDarkMode } = useDarkMode();
  const { notify } = useNotifications();

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [checkingGuest, setCheckingGuest] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'chickens' | 'caretakers'>('info');

  const [userRole, setUserRole] = useState<'owner' | 'caretaker'>('owner');
  const [farm, setFarm] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [chickens, setChickens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Confirmation modals
  const [showDeleteFarmConfirm, setShowDeleteFarmConfirm] = useState(false);
  const [deletingFarm, setDeletingFarm] = useState(false);
  const [caretakerToRemove, setCaretakerToRemove] = useState<any>(null);
  const [removingCaretaker, setRemovingCaretaker] = useState(false);

  // Add caretaker modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '',
    email: '', password: '', phone_number: '',
  });

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useFocusEffect(
    useCallback(() => {
      checkGuestAccess();
      loadData();
    }, [id])
  );

  const checkGuestAccess = async () => {
    try {
      const guestFlag = await AsyncStorage.getItem('isGuestMode');
      setIsGuestMode(guestFlag === 'true');
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingGuest(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, profileData] = await Promise.all([
        apiGetFarm(Number(id)),
        apiGetProfile().catch(() => null),
      ]);
      setFarm(data.farm);
      setMembers(data.members || []);
      setChickens(data.chickens || []);
      if (profileData?.role) {
        setUserRole(profileData.role.toLowerCase() === 'caretaker' ? 'caretaker' : 'owner');
      }
    } catch (e: any) {
      console.error('Farm load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFarm = () => {
    setShowDeleteFarmConfirm(true);
  };

  const confirmDeleteFarm = async () => {
    setDeletingFarm(true);
    try {
      await apiDeleteFarm(Number(id));
      await notify({
        title: 'Farm Deleted',
        message: `"${farm?.farm_name}" has been removed.`,
        type: 'info',
      });
      router.replace('/farm');
    } catch (e: any) {
      await notify({
        title: 'Delete Failed',
        message: e.message || 'Failed to delete farm.',
        type: 'alert',
      });
    } finally {
      setDeletingFarm(false);
      setShowDeleteFarmConfirm(false);
    }
  };

  const handleAddCaretaker = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      await notify({
        title: 'Missing Information',
        message: 'Please fill in first name, last name, email, and password.',
        type: 'warning',
      });
      return;
    }
    if (form.password.length < 6) {
      await notify({
        title: 'Invalid Password',
        message: 'Password must be at least 6 characters.',
        type: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      await apiCreateCaretaker({
        ...form,
        farm_id: Number(id),
      });
      setShowAddModal(false);
      setForm({ first_name: '', last_name: '', email: '', password: '', phone_number: '' });
      await loadData();
      await notify({
        title: 'Caretaker Added',
        message: `${form.first_name} ${form.last_name} has been assigned to this farm.`,
        type: 'success',
      });
    } catch (e: any) {
      await notify({
        title: 'Failed to Add',
        message: e.message || 'Could not create caretaker.',
        type: 'alert',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCaretaker = (member: any) => {
    setCaretakerToRemove(member);
  };

  const confirmRemoveCaretaker = async () => {
    if (!caretakerToRemove) return;
    setRemovingCaretaker(true);
    try {
      await apiRemoveMember(Number(id), caretakerToRemove.id);
      await loadData();
      await notify({
        title: 'Member Removed',
        message: `${caretakerToRemove.first_name} ${caretakerToRemove.last_name} has been removed from this farm.`,
        type: 'info',
      });
    } catch (e: any) {
      await notify({
        title: 'Failed to Remove',
        message: e.message || 'Could not remove member.',
        type: 'alert',
      });
    } finally {
      setRemovingCaretaker(false);
      setCaretakerToRemove(null);
    }
  };

  const caretakers = members.filter(m => m.role === 'caretaker');

  // ─── Guards ──────────────────────────────────────────────────────────────
  if (checkingGuest) {
    return <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} />;
  }

  if (isGuestMode) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.guestBlockContainer}>
          <View style={[styles.guestBlockIconCircle, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.guestBlockTitle, { color: colors.text }]}>Sign Up Required</Text>
          <Text style={[styles.guestBlockText, { color: colors.textSecondary }]}>
            Please sign up or login to manage your farms.
          </Text>
          <TouchableOpacity style={styles.guestBlockButton} onPress={() => router.push('/signup')}>
            <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.guestBlockButtonGradient}>
              <Text style={styles.guestBlockButtonText}>Sign Up</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.guestBlockSecondaryButton, { borderColor: colors.primary }]}
            onPress={() => router.push('/login')}
          >
            <Text style={[styles.guestBlockSecondaryText, { color: colors.primary }]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.guestBlockBackButton} onPress={() => router.replace('/farm')}>
            <Ionicons name="arrow-back-outline" size={14} color={colors.textLight} />
            <Text style={[styles.guestBlockBackText, { color: colors.textLight }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!farm) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={56} color={colors.error} />
        <Text style={[styles.notFoundText, { color: colors.text }]}>Farm not found</Text>
        <TouchableOpacity
          onPress={() => router.replace('/farm')}
          style={[styles.notFoundButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.notFoundButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#2E7D32', '#388E3C']} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          {userRole === 'owner' && (
            <TouchableOpacity onPress={handleDeleteFarm} style={styles.headerButton}>
              <Feather name="trash-2" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.farmIconLarge}>
          <Ionicons name="home" size={30} color="#fff" />
        </View>
        <Text style={[styles.farmTitle, { fontSize: scaleFont(22) }]}>{farm.farm_name}</Text>
        {userRole === 'owner' && (
          <View style={styles.locationRow}>
            <Ionicons name="location" size={14} color="#C8E6C9" />
            <Text style={styles.farmSubtitle}>
              {(farm.farm_location === 'Panaca' ? 'Panacan' : farm.farm_location) || 'No location set'}
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: 'info' as const, label: 'Info' },
          { key: 'chickens' as const, label: `Chickens (${chickens.length})` },
          ...(userRole === 'owner' ? [{ key: 'caretakers' as const, label: `Caretakers (${caretakers.length})` }] : []),
        ]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === tab.key ? colors.primary : colors.textLight }
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ── INFO TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'info' && (
          <>
            {farm.latitude != null && farm.longitude != null && (
              <View style={{ marginBottom: 16 }}>
                <FarmMap
                  farms={[{
                    id: String(farm.id),
                    name: farm.farm_name,
                    latitude: farm.latitude,
                    longitude: farm.longitude,
                  }]}
                  initialCenter={[farm.latitude, farm.longitude]}
                  initialZoom={15}
                  height={180}
                  primaryColor={colors.primary}
                />
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Farm Details</Text>
              {(userRole === 'owner'
                ? [
                    { label: 'Farm', value: farm.farm_name },
                    { label: 'Location', value: (farm.farm_location === 'Panaca' ? 'Panacan' : farm.farm_location) || 'Not set' },
                    { label: 'Chickens', value: String(chickens.length) },
                    { label: 'Caretakers', value: String(caretakers.length) },
                  ]
                : [
                    { label: 'Farm', value: farm.farm_name },
                    { label: 'Farm Owner', value: farm.owner_name || 'Farm Owner' },
                    { label: 'Chickens', value: String(chickens.length) },
                  ]
              ).map(item => (
                <View key={item.label} style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.infoLabel, { color: colors.textLight }]} numberOfLines={1}>{item.label}</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{item.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── CHICKENS TAB ───────────────────────────────────────────────── */}
        {activeTab === 'chickens' && (
          <>
            {chickens.length === 0 ? (
              <View style={styles.emptyState}>
                <ChickenIcon size={48} color={colors.textLight} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No chickens in this farm yet.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/(tabs)/chickens')}
                >
                  <Text style={styles.emptyBtnText}>Go to Chickens</Text>
                </TouchableOpacity>
              </View>
            ) : (
              chickens.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.card, { backgroundColor: colors.card }]}
                  onPress={() => router.push(`/chicken/${c.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.chickenRow}>
                    <ChickenAvatar photo={c.photo_url} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.chickenName, { color: colors.text }]}>{c.chicken_name}</Text>
                      <Text style={[styles.chickenSub, { color: colors.textLight }]}>{c.qr_code}</Text>
                    </View>
                    <View style={[styles.statusBadge, {
                      backgroundColor: c.status === 'HEALTHY' ? '#4CAF5020'
                        : c.status === 'WARNING' ? '#FF980020' : '#f4433620'
                    }]}>
                      <Text style={{
                        fontSize: 11, fontWeight: '700',
                        color: c.status === 'HEALTHY' ? '#4CAF50'
                          : c.status === 'WARNING' ? '#FF9800' : '#f44336'
                      }}>
                        {c.status || 'HEALTHY'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* ── CARETAKERS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'caretakers' && (
          <>
            {/* Add Caretaker Button */}
            <TouchableOpacity
              style={[styles.addCaretakerBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="person-add-outline" size={20} color="#fff" />
              <Text style={styles.addCaretakerBtnText}>Add Caretaker</Text>
            </TouchableOpacity>

            {caretakers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textLight} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No caretakers assigned yet.
                </Text>
                <Text style={[styles.emptySubText, { color: colors.textLight }]}>
                  Tap "Add Caretaker" to create their login account.
                </Text>
              </View>
            ) : (
              caretakers.map((member: any) => (
                <View key={member.id} style={[styles.card, { backgroundColor: colors.card }]}>
                  <View style={styles.memberRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.memberInitial, { color: colors.primary }]}>
                        {member.first_name?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text }]}>
                        {member.first_name} {member.last_name}
                      </Text>
                      <Text style={[styles.memberEmail, { color: colors.textLight }]}>
                        {member.email}
                      </Text>
                      {member.phone_number ? (
                        <Text style={[styles.memberEmail, { color: colors.textLight }]}>
                          {member.phone_number}
                        </Text>
                      ) : null}
                      <Text style={[styles.memberJoined, { color: colors.textLight }]}>
                        Joined {new Date(member.joined_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => handleRemoveCaretaker(member)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#f44336" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* ── Add Caretaker Modal ───────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={showAddModal}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Caretaker</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close-circle" size={30} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalHint, { color: colors.textLight }]}>
              Create a login account for your caretaker. You'll see their credentials after — share them personally.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Name row */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>First Name *</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="First Name"
                    placeholderTextColor={colors.textLight}
                    value={form.first_name}
                    onChangeText={v => setField('first_name', v)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Last Name *</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Last Name"
                    placeholderTextColor={colors.textLight}
                    value={form.last_name}
                    onChangeText={v => setField('last_name', v)}
                  />
                </View>
              </View>

              {[
                { label: 'Email *', field: 'email', keyboard: 'email-address' as any, placeholder: 'caretaker@email.com', secure: false },
                { label: 'Phone Number', field: 'phone_number', keyboard: 'phone-pad' as any, placeholder: '09XXXXXXXXX', secure: false },
                { label: 'Password *', field: 'password', keyboard: 'default' as any, placeholder: 'Min. 6 characters', secure: true },
              ].map(({ label, field, keyboard, placeholder, secure }) => (
                <View key={field} style={{ marginBottom: 12 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textLight}
                    value={(form as any)[field]}
                    onChangeText={v => setField(field, v)}
                    keyboardType={keyboard}
                    secureTextEntry={secure}
                    autoCapitalize="none"
                  />
                </View>
              ))}

              {/* Farm assignment display */}
              <View style={[styles.farmAssignBox, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                <Ionicons name="home-outline" size={16} color={colors.primary} />
                <Text style={[styles.farmAssignText, { color: colors.primary }]}>
                  Will be assigned to: {farm?.farm_name}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
                onPress={handleAddCaretaker}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>Create Caretaker Account</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Delete Farm Confirmation Modal */}
      <ConfirmModal
        visible={showDeleteFarmConfirm}
        title="Delete Farm"
        message={`Delete "${farm?.farm_name}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        icon="trash-outline"
        iconColor="#E53935"
        isDestructive={true}
        loading={deletingFarm}
        onConfirm={confirmDeleteFarm}
        onCancel={() => setShowDeleteFarmConfirm(false)}
      />

      {/* Remove Caretaker Confirmation Modal */}
      <ConfirmModal
        visible={!!caretakerToRemove}
        title="Remove Caretaker"
        message={`Remove ${caretakerToRemove?.first_name} ${caretakerToRemove?.last_name} from ${farm?.farm_name}?`}
        confirmText="Remove"
        cancelText="Cancel"
        icon="person-remove-outline"
        iconColor="#E53935"
        isDestructive={true}
        loading={removingCaretaker}
        onConfirm={confirmRemoveCaretaker}
        onCancel={() => setCaretakerToRemove(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1 },
  loadingContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 20 },
  notFoundText:      { fontSize: 16, fontWeight: '600' },
  notFoundButton:    { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25, marginTop: 8 },
  notFoundButtonText:{ color: '#fff', fontWeight: '600' },

  // Header
  header:            { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 10 : 20, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow:         { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 16, marginBottom: 8 },
  headerButton:      { padding: 8 },
  farmIconLarge:     { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  farmTitle:         { color: '#fff', fontWeight: 'bold', marginBottom: 4 },
  locationRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  farmSubtitle:      { color: '#C8E6C9', fontSize: 13, includeFontPadding: false, paddingRight: 6 },
  codeBadge:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  codeBadgeText:     { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1 },

  // Tabs
  tabBar:            { flexDirection: 'row', borderBottomWidth: 1 },
  tab:               { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabText:           { fontSize: 12, fontWeight: '600' },

  // Cards
  card:              { borderRadius: 16, padding: 16, marginBottom: 12, elevation: 1 },
  sectionTitle:      { fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  infoRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  infoLabel:         { width: 115, fontSize: 13.5, includeFontPadding: false },
  infoValue:         { flex: 1, fontSize: 13.5, fontWeight: '600', textAlign: 'right', marginLeft: 12, includeFontPadding: false },

  // Farm code
  codeIconBadge:     { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  codeTitle:         { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  codeValue:         { fontSize: 22, fontWeight: 'bold', letterSpacing: 3 },
  codeHint:          { fontSize: 12, lineHeight: 17, marginTop: 10 },

  // Chickens
  chickenRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chickenName:       { fontSize: 14, fontWeight: '600' },
  chickenSub:        { fontSize: 12, marginTop: 2 },
  statusBadge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },

  // Caretakers
  addCaretakerBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 30, marginBottom: 16 },
  addCaretakerBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  memberRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar:      { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  memberInitial:     { fontSize: 20, fontWeight: 'bold' },
  memberName:        { fontSize: 14, fontWeight: '600' },
  memberEmail:       { fontSize: 12, marginTop: 2 },
  memberJoined:      { fontSize: 11, marginTop: 3 },
  removeBtn:         { padding: 8 },

  // Empty state
  emptyState:        { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText:         { fontSize: 15, fontWeight: '500' },
  emptySubText:      { fontSize: 13, textAlign: 'center' },
  emptyBtn:          { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 25 },
  emptyBtnText:      { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Modal
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:             { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' },
  modalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle:        { fontSize: 20, fontWeight: 'bold' },
  modalHint:         { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  fieldLabel:        { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  input:             { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  farmAssignBox:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16, marginTop: 4 },
  farmAssignText:    { fontSize: 13, fontWeight: '600' },
  saveBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 30 },
  saveBtnText:       { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  // Guest block
  guestBlockContainer:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  guestBlockIconCircle:      { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  guestBlockTitle:           { fontSize: 22, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  guestBlockText:            { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  guestBlockButton:          { width: '100%', maxWidth: 400, borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  guestBlockButtonGradient:  { paddingVertical: 15, alignItems: 'center' },
  guestBlockButtonText:      { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  guestBlockSecondaryButton: { width: '100%', maxWidth: 400, borderWidth: 1, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  guestBlockSecondaryText:   { fontSize: 15, fontWeight: '600' },
  guestBlockBackButton:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  guestBlockBackText:        { fontSize: 13, fontWeight: '500' },
});