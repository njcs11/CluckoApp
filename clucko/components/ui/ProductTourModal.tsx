import { useDarkMode } from '@/context/DarkModeContext';
import { scaleFont } from '@/utils/responsive';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import ChickenIcon from './ChickenIcon';

interface ProductTourModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProductTourModal({ visible, onClose }: ProductTourModalProps) {
  const { colors, isDarkMode } = useDarkMode();
  const { width: windowWidth } = useWindowDimensions();
  const modalWidth = Math.min(windowWidth - 32, 420);
  const [containerWidth, setContainerWidth] = useState(0);
  const pageWidth = containerWidth > 0 ? containerWidth : modalWidth - 40;

  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const tourSteps = [
    {
      step: 1,
      badge: 'Step 1 of 4 • Overview',
      title: 'Welcome to Clucko!',
      subtitle: 'Your Complete Smart Gamefowl Companion',
      icon: (
        <ChickenIcon size={36} color={colors.primary} />
      ),
      items: [
        {
          icon: 'scan-circle-outline',
          iconFamily: 'Ionicons',
          title: 'AI Disease Detection',
          desc: 'Instant screening for Coryza, Fowl Pox, and Newcastle Disease with visual Grad-CAM heatmap attention.',
          color: colors.primary,
        },
        {
          icon: 'qr-code-outline',
          iconFamily: 'Ionicons',
          title: 'Flock Profiles & QR Codes',
          desc: 'Generate unique digital identity tags for each chicken to track medical records and vaccines.',
          color: '#2196F3',
        },
        {
          icon: 'shield-checkmark-outline',
          iconFamily: 'Ionicons',
          title: 'Biosecurity & Quarantine',
          desc: 'Monitor health logs, severity alerts, and treatment schedules all in one place.',
          color: '#4CAF50',
        },
      ],
    },
    {
      step: 2,
      badge: 'Step 2 of 4 • Module Selector',
      title: 'Choose the Right Part',
      subtitle: 'Higher Accuracy & Smart Auto-Switching',
      icon: (
        <MaterialCommunityIcons name="cube-scan" size={36} color="#FF9800" />
      ),
      items: [
        {
          icon: 'eye-outline',
          iconFamily: 'Ionicons',
          title: 'Specify Anatomical Module',
          desc: 'Select 👁️ Eye or 🪶 Wing before scanning to target symptoms specifically for that body part.',
          color: '#FF9800',
        },
        {
          icon: 'swap-horizontal',
          iconFamily: 'Ionicons',
          title: 'Smart Auto-Detection',
          desc: 'Selected the wrong module? Clucko auto-analyzes the image and switches modules automatically to keep diagnosis accurate!',
          color: '#2196F3',
        },
        {
          icon: 'bulb-outline',
          iconFamily: 'Ionicons',
          title: 'Pro Tip: Module Notice',
          desc: 'Look out for the Module Notice in your scan results whenever an auto-switch or part correction occurs.',
          color: '#9C27B0',
        },
      ],
    },
    {
      step: 3,
      badge: 'Step 3 of 4 • Offline Workflows',
      title: 'No Signal at the Farm?',
      subtitle: 'Capture Offline, Upload Later',
      icon: (
        <Ionicons name="cloud-upload-outline" size={36} color="#00897B" />
      ),
      items: [
        {
          icon: 'camera-outline',
          iconFamily: 'Ionicons',
          title: '1. Snap Photos with Phone Camera',
          desc: 'When in a farm area without Wi-Fi or cellular signal, take clear pictures of your gamefowl using your standard phone camera.',
          color: '#00897B',
        },
        {
          icon: 'images-outline',
          iconFamily: 'Ionicons',
          title: '2. Upload 1-by-1 in Capture Screen',
          desc: 'Once you are back online, tap the Gallery Upload button next to the camera shutter to analyze each photo.',
          color: '#26A69A',
        },
        {
          icon: 'checkmark-circle-outline',
          iconFamily: 'Ionicons',
          title: '3. Assign to Any Chicken',
          desc: 'Link the scan to an existing chicken profile or create a new chicken record with that picture attached.',
          color: '#4CAF50',
        },
      ],
    },
    {
      step: 4,
      badge: 'Step 4 of 4 • Team & Farm',
      title: 'Farms & Caretaker Team',
      subtitle: 'Seamless Collaboration for Your Farm',
      icon: (
        <MaterialCommunityIcons name="warehouse" size={36} color="#5C6BC0" />
      ),
      items: [
        {
          icon: 'mail-outline',
          iconFamily: 'Ionicons',
          title: 'Automated Welcome Emails',
          desc: 'When you add caretakers, Clucko sends them an email with login credentials and assigned farm details.',
          color: '#5C6BC0',
        },
        {
          icon: 'radio-button-on',
          iconFamily: 'Ionicons',
          title: 'Live Online Status',
          desc: 'See active caretakers at a glance with real-time green Online / Offline indicators in your farm member list.',
          color: '#4CAF50',
        },
        {
          icon: 'lock-closed-outline',
          iconFamily: 'Ionicons',
          title: 'Owner-Protected Permissions',
          desc: 'Caretakers log health scans and view farm records, while deletion and flock ownership remain safely protected.',
          color: '#E53935',
        },
      ],
    },
  ];

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / (pageWidth || 1));
    if (pageIndex !== currentPage && pageIndex >= 0 && pageIndex < tourSteps.length) {
      setCurrentPage(pageIndex);
    }
  };

  const goToNextPage = () => {
    if (currentPage < tourSteps.length - 1) {
      const next = currentPage + 1;
      scrollRef.current?.scrollTo({ x: next * pageWidth, animated: true });
      setCurrentPage(next);
    } else {
      handleCompleteTour();
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      const prev = currentPage - 1;
      scrollRef.current?.scrollTo({ x: prev * pageWidth, animated: true });
      setCurrentPage(prev);
    }
  };

  const handleCompleteTour = async () => {
    try {
      await AsyncStorage.setItem('has_seen_product_tour', 'true');
    } catch (e) {
      console.warn('Error saving product tour preference:', e);
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={handleCompleteTour}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              width: modalWidth,
              backgroundColor: isDarkMode ? '#131A16' : '#FFFFFF',
              borderColor: isDarkMode ? '#24332B' : '#E2EBE5',
            },
          ]}
        >
          {/* Top Bar with Close 'X' */}
          <View style={styles.topBar}>
            <View style={[styles.stepBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.stepBadgeText, { color: colors.primary }]}>
                {tourSteps[currentPage].badge}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleCompleteTour}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={colors.textLight} />
            </TouchableOpacity>
          </View>

          {/* Icon and Titles Header */}
          <View style={styles.header}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: isDarkMode ? '#1D2A23' : '#EBF7EE',
                  borderColor: colors.primary + '30',
                },
              ]}
            >
              {tourSteps[currentPage].icon}
            </View>
            <Text
              style={[
                styles.modalTitle,
                { color: isDarkMode ? '#F0FDF4' : '#1A2E22', fontSize: scaleFont(19) },
              ]}
            >
              {tourSteps[currentPage].title}
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                { color: colors.textSecondary, fontSize: scaleFont(13) },
              ]}
            >
              {tourSteps[currentPage].subtitle}
            </Text>
          </View>

          {/* Carousel */}
          <View
            style={styles.carouselWrapper}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
          >
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={styles.scrollContent}
            >
              {tourSteps.map((step, idx) => (
                <View key={step.step} style={[styles.page, { width: pageWidth }]}>
                  <View style={styles.featureList}>
                    {step.items.map((item, itemIdx) => (
                      <View key={itemIdx} style={styles.featureRow}>
                        <View style={[styles.featureIconWrap, { backgroundColor: item.color + '18' }]}>
                          <Ionicons name={item.icon as any} size={18} color={item.color} />
                        </View>
                        <View style={styles.featureTextWrap}>
                          <Text style={[styles.featureTitle, { color: colors.text }]}>
                            {item.title}
                          </Text>
                          <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                            {item.desc}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Pagination Indicators */}
          <View style={styles.paginationRow}>
            {tourSteps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentPage
                    ? [styles.activeDot, { backgroundColor: colors.primary }]
                    : [styles.inactiveDot, { backgroundColor: isDarkMode ? '#2B3B32' : '#D1DFD6' }],
                ]}
              />
            ))}
          </View>

          {/* Footer Actions */}
          <View style={styles.footer}>
            {currentPage > 0 ? (
              <TouchableOpacity
                style={[styles.prevBtn, { borderColor: colors.border }]}
                onPress={goToPrevPage}
                activeOpacity={0.7}
              >
                <Text style={[styles.prevBtnText, { color: colors.textSecondary }]}>Previous</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleCompleteTour}
                activeOpacity={0.7}
              >
                <Text style={[styles.skipBtnText, { color: colors.textLight }]}>Skip Tour</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
              onPress={goToNextPage}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>
                {currentPage === tourSteps.length - 1 ? 'Get Started' : 'Next →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  closeBtn: {
    padding: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 14,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  carouselWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  scrollContent: {
    alignItems: 'center',
  },
  page: {
    paddingVertical: 6,
  },
  featureList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 16,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 22,
  },
  inactiveDot: {
    width: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  prevBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  prevBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
