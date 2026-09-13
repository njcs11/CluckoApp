import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import ChickenIcon from './ChickenIcon';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiGetFarms } from '../../lib/api';

interface Farm {
  id: number;
  farm_name: string;
  farm_location: string;
}

export type ChickenFormData = {
  name: string;
  photo: string | null;
  farmId: string | null;
};

interface AddChickenModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  form: ChickenFormData;
  onChange: (form: ChickenFormData) => void;
  onPickPhoto?: () => void;
  colors: any;
  submitLabel?: string;
  maxWidth?: number;
  title?: string;
  isSubmitting?: boolean;
}

export default function AddChickenModal({
  visible,
  onClose,
  onSubmit,
  form,
  onChange,
  onPickPhoto,
  colors,
  submitLabel = 'Save',
  maxWidth,
  title = 'Add New Chicken',
  isSubmitting = false,
}: AddChickenModalProps) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loadingFarms, setLoadingFarms] = useState(false);
  const [showFarmPicker, setShowFarmPicker] = useState(false);

  // Reload the farm list every time the sheet opens, so a farm created on
  // another screen (Manage Farms) always shows up here too.
  useEffect(() => {
    if (visible) {
      refreshFarms();
      setShowFarmPicker(false);
    }
  }, [visible]);

  const refreshFarms = async () => {
    setLoadingFarms(true);
    try {
      const list = await apiGetFarms();
      setFarms(list || []);
    } catch (error) {
      console.error('Error loading farms:', error);
      setFarms([]);
    } finally {
      setLoadingFarms(false);
    }
  };

  const selectedFarm = farms.find((f) => String(f.id) === form.farmId) || null;

  const handleSelectFarm = (farmId: number) => {
    onChange({ ...form, farmId: String(farmId) });
    setShowFarmPicker(false);
  };

  // "Add New Farm" is a shortcut: close this sheet and jump to Manage Farm,
  // where the user can add a farm properly (including pinning it on the map).
  const handleGoAddFarm = () => {
    setShowFarmPicker(false);
    onClose();
    router.push('/farm');
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card, maxWidth: maxWidth || 480, width: '100%', alignSelf: 'center' }]}>
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textLight} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={{ paddingBottom: 12 }}>
            {onPickPhoto && (
              // Circular avatar + camera badge, same pattern as the chicken
              // profile screen — tapping works both to pick an initial photo
              // and to re-open the picker and adjust/replace it afterward.
              <View style={styles.photoSection}>
                <TouchableOpacity
                  style={[
                    styles.photoCircleWrap,
                    { borderColor: form.photo ? colors.primary : colors.border },
                  ]}
                  onPress={onPickPhoto}
                  activeOpacity={0.8}
                >
                  {form.photo ? (
                    <Image source={{ uri: form.photo }} style={styles.photoCircleImage} />
                  ) : (
                    <View style={[styles.photoCirclePlaceholder, { backgroundColor: colors.background }]}>
                      <Ionicons name="camera-outline" size={26} color={colors.textLight} />
                    </View>
                  )}
                  <View style={[styles.editPhotoBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                    <Ionicons name={form.photo ? 'pencil' : 'add'} size={12} color="#fff" />
                  </View>
                </TouchableOpacity>
                <Text style={[styles.photoHelperText, { color: colors.textLight }]}>
                  {form.photo ? 'Tap to change photo' : 'Add a photo'}
                </Text>
              </View>
            )}

            {/* Photo preview even without onPickPhoto (e.g. capture flow,
                where the photo is pre-filled from the just-taken shot and
                isn't meant to be re-picked here). */}
            {!onPickPhoto && form.photo && (
              <View style={styles.photoSection}>
                <View style={[styles.photoCircleWrap, { borderColor: colors.primary }]}>
                  <Image source={{ uri: form.photo }} style={styles.photoCircleImage} />
                </View>
                <Text style={[styles.photoHelperText, { color: colors.textLight }]}>
                  Using your just-captured photo
                </Text>
              </View>
            )}

            <Text style={[styles.label, { color: colors.textLight }]}>Chicken Name</Text>
            <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <ChickenIcon size={18} color={colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="e.g. Rocky"
                placeholderTextColor={colors.textLight}
                value={form.name}
                onChangeText={(text) => onChange({ ...form, name: text })}
              />
            </View>

            <Text style={[styles.label, { color: colors.textLight, marginTop: 18 }]}>Farm</Text>

            <TouchableOpacity
              style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={() => setShowFarmPicker((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons name="home-outline" size={18} color={colors.textLight} style={styles.inputIcon} />
              <Text style={[styles.input, { color: selectedFarm ? colors.text : colors.textLight }]} numberOfLines={1}>
                {selectedFarm ? selectedFarm.farm_name : 'Select a farm'}
              </Text>
              <Ionicons name={showFarmPicker ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textLight} />
            </TouchableOpacity>

            {showFarmPicker && (
              <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {loadingFarms ? (
                  <View style={styles.dropdownLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : (
                  <>
                    {farms.length === 0 && (
                      <View style={styles.dropdownEmpty}>
                        <Text style={[styles.dropdownEmptyText, { color: colors.textLight }]}>
                          No farms yet — add one below
                        </Text>
                      </View>
                    )}
                    {farms.map((farm) => (
                      <TouchableOpacity
                        key={farm.id}
                        style={[styles.dropdownRow, { borderBottomColor: colors.divider }]}
                        onPress={() => handleSelectFarm(farm.id)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="home" size={15} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.dropdownRowName, { color: colors.text }]}>{farm.farm_name}</Text>
                          {!!farm.farm_location && (
                            <Text style={[styles.dropdownRowMeta, { color: colors.textLight }]}>{farm.farm_location}</Text>
                          )}
                        </View>
                        {form.farmId === String(farm.id) && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    ))}

                    <TouchableOpacity
                      style={styles.dropdownAddRow}
                      onPress={handleGoAddFarm}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                      <Text style={[styles.dropdownAddText, { color: colors.primary }]}>Add New Farm</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.divider }]}>
            <TouchableOpacity style={[styles.cancelButton, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.75}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.6 : 1 }]}
              onPress={onSubmit}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 16 },

  photoSection: { alignItems: 'center', marginBottom: 20, gap: 8 },
  photoCircleWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    padding: 3,
  },
  photoCircleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
  },
  photoCirclePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPhotoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  photoHelperText: { fontSize: 12, fontWeight: '500' },

  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 4, gap: 10,
  },
  inputIcon: {},
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },

  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  dropdownLoading: { paddingVertical: 20, alignItems: 'center' },
  dropdownEmpty: { paddingVertical: 16, paddingHorizontal: 14 },
  dropdownEmptyText: { fontSize: 13, textAlign: 'center' },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    paddingVertical: 12, borderBottomWidth: 1,
  },
  dropdownRowName: { fontSize: 14, fontWeight: '600' },
  dropdownRowMeta: { fontSize: 11, marginTop: 1 },
  dropdownAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 13 },
  dropdownAddText: { fontSize: 14, fontWeight: '700' },

  footer: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18, borderTopWidth: 1,
  },
  cancelButton: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600' },
  submitButton: { flex: 2, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});