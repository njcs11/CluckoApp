import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  Alert, Dimensions, FlatList, Image, Modal,
  SafeAreaView, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useDarkMode } from '../../context/DarkModeContext';
import { apiCreateChicken, apiDeleteChicken, apiGetChickens } from '../../lib/api';

const { height } = Dimensions.get('window');

export default function ChickensScreen() {
  const { colors, isDarkMode } = useDarkMode();
  const [chickens, setChickens]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddForm, setShowAddForm]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [newChicken, setNewChicken]     = useState({
    chicken_name: '', breed: '', age: '', weight: '',
    location: '', color: '', photo_url: '',
  });

  const loadChickens = async () => {
    setLoading(true);
    try {
      const data = await apiGetChickens();
      setChickens(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadChickens(); }, []));

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (!result.canceled) {
      setNewChicken(f => ({ ...f, photo_url: result.assets[0].uri }));
    }
  };

  const handleAdd = async () => {
    if (!newChicken.chicken_name.trim()) {
      Alert.alert('Error', 'Chicken name is required'); return;
    }
    setSaving(true);
    try {
      const count = chickens.length + 1;
      const qr_code = `CK-${String(count).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
      await apiCreateChicken({ ...newChicken, qr_code });
      setShowAddForm(false);
      setNewChicken({ chicken_name:'',breed:'',age:'',weight:'',location:'',color:'',photo_url:'' });
      await loadChickens();
      Alert.alert('Success', `${newChicken.chicken_name} added to your flock!`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Chicken', `Remove ${name} from your flock?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiDeleteChicken(id);
          await loadChickens();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const getStatusColor = (s: string) =>
    s === 'HEALTHY' ? '#4CAF50' : s === 'WARNING' ? '#FF9800' : '#f44336';

  const filtered = chickens.filter(c => {
    const matchStatus = statusFilter === 'all' || c.status === statusFilter.toUpperCase();
    const matchSearch = !searchQuery || c.chicken_name.toLowerCase().includes(searchQuery.toLowerCase()) || c.qr_code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const stats = {
    all: chickens.length,
    healthy: chickens.filter(c => c.status === 'HEALTHY').length,
    warning: chickens.filter(c => c.status === 'WARNING').length,
    critical: chickens.filter(c => c.status === 'CRITICAL').length,
  };

  const renderBird = ({ item }: any) => (
    <TouchableOpacity
      style={[styles.birdCard, { backgroundColor: colors.card }]}
      onPress={() => router.push(`/chicken/${item.id}`)}
      onLongPress={() => handleDelete(item.id, item.chicken_name)}
      activeOpacity={0.8}
    >
      <View style={styles.birdContent}>
        {item.photo_url
          ? <Image source={{ uri: item.photo_url }} style={styles.birdImg} />
          : <View style={[styles.birdImgPlaceholder, { backgroundColor: colors.surface }]}>
              <Ionicons name="image-outline" size={26} color={colors.textLight} />
            </View>
        }
        <View style={styles.birdInfo}>
          <View style={styles.birdHeader}>
            <Text style={[styles.birdName, { color: colors.text }]}>{item.chicken_name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
            </View>
          </View>
          <Text style={[styles.birdBreed, { color: colors.textSecondary }]}>{item.breed || 'Unknown breed'}</Text>
          <View style={styles.birdMeta}>
            <Ionicons name="location-outline" size={11} color={colors.textLight} />
            <Text style={[styles.birdMetaText, { color: colors.textLight }]}>{item.location || 'No location'}</Text>
            <Ionicons name="qr-code-outline" size={11} color={colors.textLight} style={{ marginLeft: 8 }} />
            <Text style={[styles.birdMetaText, { color: colors.textLight }]}>{item.qr_code}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <Text style={styles.headerTitle}>Flock Management</Text>
        <Text style={styles.headerSub}>{chickens.length} birds registered</Text>
      </LinearGradient>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface }]}>
        <Feather name="search" size={16} color={colors.textLight} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name or QR code..."
          placeholderTextColor={colors.textLight}
          value={searchQuery} onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter */}
      <View style={[styles.filterRow, { backgroundColor: colors.surface }]}>
        {(['all','healthy','warning','critical'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, statusFilter === f && { backgroundColor: colors.primary + '20' }]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[styles.filterCount, { color: f === 'all' ? colors.text : f === 'healthy' ? '#4CAF50' : f === 'warning' ? '#FF9800' : '#f44336' }]}>
              {(stats as any)[f]}
            </Text>
            <Text style={[styles.filterLabel, { color: statusFilter === f ? colors.primary : colors.textSecondary }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        renderItem={renderBird}
        keyExtractor={i => i.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80 }}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="egg-outline" size={48} color={colors.textLight} />
            <Text style={[{ color: colors.textSecondary, marginTop: 8 }]}>
              {chickens.length === 0 ? 'No chickens yet. Tap + to add!' : 'No chickens match your filter'}
            </Text>
          </View>
        )}
        onRefresh={loadChickens}
        refreshing={loading}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAddForm(true)}>
        <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.fabGradient}>
          <Ionicons name="add" size={32} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Add Chicken Modal */}
      <Modal animationType="slide" transparent visible={showAddForm} onRequestClose={() => setShowAddForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add New Chicken</Text>
              <TouchableOpacity onPress={() => setShowAddForm(false)}>
                <Ionicons name="close-circle" size={30} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Photo picker */}
              <TouchableOpacity style={styles.photoPicker} onPress={pickImage}>
                {newChicken.photo_url
                  ? <Image source={{ uri: newChicken.photo_url }} style={styles.photoPreview} />
                  : <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface }]}>
                      <Ionicons name="camera-outline" size={40} color={colors.textLight} />
                      <Text style={[{ fontSize: 12, color: colors.textLight, marginTop: 6 }]}>Add Photo</Text>
                    </View>
                }
              </TouchableOpacity>

              {[
                { label: 'Chicken Name *', field: 'chicken_name' },
                { label: 'Breed (e.g. Sweater, Kelso)', field: 'breed' },
                { label: 'Age (e.g. 6 months)', field: 'age' },
                { label: 'Weight (e.g. 2.3 kg)', field: 'weight' },
                { label: 'Location / Pen', field: 'location' },
                { label: 'Color', field: 'color' },
              ].map(({ label, field }) => (
                <View key={field} style={{ marginBottom: 12 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder={label} placeholderTextColor={colors.textLight}
                    value={(newChicken as any)[field]}
                    onChangeText={v => setNewChicken(f => ({ ...f, [field]: v }))}
                  />
                </View>
              ))}

              <TouchableOpacity
                style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}
                onPress={handleAdd} disabled={saving}
              >
                <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.saveBtnGradient}>
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Chicken'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1 },
  header:             { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle:        { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  headerSub:          { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  searchBar:          { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, borderRadius: 30, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInput:        { flex: 1, fontSize: 14 },
  filterRow:          { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, marginTop: 12, borderRadius: 20, padding: 12 },
  filterBtn:          { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20 },
  filterCount:        { fontSize: 20, fontWeight: 'bold' },
  filterLabel:        { fontSize: 11, marginTop: 2 },
  birdCard:           { borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  birdContent:        { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  birdImg:            { width: 60, height: 60, borderRadius: 30 },
  birdImgPlaceholder: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  birdInfo:           { flex: 1 },
  birdHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  birdName:           { fontSize: 15, fontWeight: 'bold' },
  statusBadge:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText:         { fontSize: 10, fontWeight: '600' },
  birdBreed:          { fontSize: 12, marginBottom: 5 },
  birdMeta:           { flexDirection: 'row', alignItems: 'center', gap: 3 },
  birdMetaText:       { fontSize: 10 },
  emptyState:         { alignItems: 'center', paddingVertical: 60, gap: 8 },
  fab:                { position: 'absolute', bottom: 24, right: 20, borderRadius: 30, overflow: 'hidden', elevation: 5 },
  fabGradient:        { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:              { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: height * 0.9 },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:         { fontSize: 20, fontWeight: 'bold' },
  photoPicker:        { alignItems: 'center', marginBottom: 16 },
  photoPreview:       { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder:   { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  fieldLabel:         { fontSize: 12, marginBottom: 4, fontWeight: '500' },
  fieldInput:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  saveBtn:            { borderRadius: 30, overflow: 'hidden', marginTop: 8, marginBottom: 20 },
  saveBtnGradient:    { paddingVertical: 14, alignItems: 'center' },
  saveBtnText:        { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});