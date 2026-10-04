import { useDarkMode } from '@/context/DarkModeContext';
import { scaleFont } from '@/utils/responsive';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';

// In React Native New Architecture (Fabric), setLayoutAnimationEnabledExperimental is a no-op
if (Platform.OS === 'android' && !(globalThis as any).nativeFabricUIManager && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FarmOnboardingModalProps {
  visible: boolean;
  onStartCreateFarm: () => void;
}

export default function FarmOnboardingModal({
  visible,
  onStartCreateFarm,
}: FarmOnboardingModalProps) {
  const { colors, isDarkMode } = useDarkMode();
  const { width: windowWidth } = useWindowDimensions();
  const modalWidth = Math.min(windowWidth - 32, 400);
  const [containerWidth, setContainerWidth] = useState(0);
  const pageWidth = containerWidth > 0 ? containerWidth : (modalWidth - 40);

  const [currentPage, setCurrentPage] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(3);
  const [buttonReady, setButtonReady] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // Animations
  const buttonFadeAnim = useRef(new Animated.Value(0)).current;
  const buttonSlideAnim = useRef(new Animated.Value(20)).current;
  const scalePulseAnim = useRef(new Animated.Value(1)).current;

  // Auto-expand button after user views page 2
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (visible && currentPage === 1) {
      if (!buttonReady) {
        setSecondsRemaining(3);
        let count = 3;
        timer = setInterval(() => {
          count -= 1;
          setSecondsRemaining(count);
          if (count <= 0) {
            if (timer) clearInterval(timer);
            if (Platform.OS === 'android' && !(globalThis as any).nativeFabricUIManager && UIManager.setLayoutAnimationEnabledExperimental) {
              UIManager.setLayoutAnimationEnabledExperimental(true);
            }
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setButtonReady(true);
            Animated.parallel([
              Animated.timing(buttonFadeAnim, {
                toValue: 1,
                duration: 350,
                useNativeDriver: true,
              }),
              Animated.spring(buttonSlideAnim, {
                toValue: 0,
                friction: 6,
                tension: 80,
                useNativeDriver: true,
              }),
            ]).start();
          }
        }, 1000);
      }
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [visible, currentPage, buttonReady]);

  // Pulse animation for header icon
  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scalePulseAnim, {
            toValue: 1.05,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(scalePulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [visible]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / (pageWidth || 1));
    if (pageIndex !== currentPage && (pageIndex === 0 || pageIndex === 1)) {
      setCurrentPage(pageIndex);
    }
  };

  const goToNextPage = () => {
    scrollRef.current?.scrollTo({ x: pageWidth, animated: true });
    setCurrentPage(1);
  };

  const goToPrevPage = () => {
    scrollRef.current?.scrollTo({ x: 0, animated: true });
    setCurrentPage(0);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      // Non-dismissible: cannot be closed via Android back button
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              width: modalWidth,
              backgroundColor: isDarkMode ? '#131A16' : '#FFFFFF',
              borderColor: isDarkMode ? '#24332B' : '#E2EBE5',
              shadowColor: colors.primary,
            },
          ]}
        >
          {/* Top Decorative Header */}
          <View style={styles.topHeader}>
            <Animated.View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: isDarkMode ? '#1D2A23' : '#EBF7EE',
                  borderColor: colors.primary + '35',
                  transform: [{ scale: scalePulseAnim }],
                },
              ]}
            >
              <MaterialCommunityIcons
                name={currentPage === 0 ? 'home-alert' : 'warehouse'}
                size={34}
                color={colors.primary}
              />
            </Animated.View>

            <View style={styles.headerTextWrap}>
              <View
                style={[
                  styles.stepBadge,
                  { backgroundColor: colors.primary + '18' },
                ]}
              >
                <Text style={[styles.stepBadgeText, { color: colors.primary }]}>
                  {currentPage === 0 ? 'Step 1 of 2 • Required' : 'Step 2 of 2 • Ready'}
                </Text>
              </View>
              <Text
                style={[
                  styles.modalTitle,
                  { color: isDarkMode ? '#F0FDF4' : '#1A2E22', fontSize: scaleFont(19) },
                ]}
              >
                {currentPage === 0 ? 'Create Your First Farm' : 'What You Can Do'}
              </Text>
            </View>
          </View>

          {/* Horizontal Paging Carousel */}
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
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
            >
              {/* PAGE 1: Instruction that user must create a farm first */}
              <View style={[styles.page, { width: pageWidth }]}>
              <Text
                style={[
                  styles.pageNotice,
                  { color: colors.textSecondary, fontSize: scaleFont(13.5) },
                ]}
              >
                Welcome to <Text style={{ color: colors.primary, fontWeight: '700' }}>Clucko</Text>!
                Before you can add chickens, record scans, or monitor disease history, you need to set up your primary farm workspace.
              </Text>

              <View style={styles.featureList}>
                <View style={styles.featureRow}>
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="checkmark-sharp" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={[styles.featureTitle, { color: colors.text }]}>
                      Farm Workspace Required
                    </Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                      All gamefowl, health logs, and pens are securely grouped under your farm.
                    </Text>
                  </View>
                </View>

                <View style={styles.featureRow}>
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="checkmark-sharp" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={[styles.featureTitle, { color: colors.text }]}>
                      Custom Pens & Capacity
                    </Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                      Define your farm location and monitor flock capacity easily.
                    </Text>
                  </View>
                </View>

                <View style={styles.featureRow}>
                  <View style={[styles.checkCircle, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="checkmark-sharp" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={[styles.featureTitle, { color: colors.text }]}>
                      Caretaker Collaboration
                    </Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                      Share your farm code with assistants to log daily checkups and feeds.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Swipe / Next Prompt */}
              <TouchableOpacity
                style={[
                  styles.swipeAffordance,
                  {
                    backgroundColor: isDarkMode ? '#1B2520' : '#F1F7F3',
                    borderColor: colors.primary + '30',
                  },
                ]}
                onPress={goToNextPage}
                activeOpacity={0.8}
              >
                <Text style={[styles.swipeText, { color: colors.primary }]}>
                  Swipe or tap to see how it works
                </Text>
                <Feather name="arrow-right" size={17} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* PAGE 2: Instructions how to create farm & what user can do */}
            <View style={[styles.page, { width: pageWidth }]}>
              <Text
                style={[
                  styles.pageNotice,
                  { color: colors.textSecondary, fontSize: scaleFont(13.5) },
                ]}
              >
                Setting up takes less than 30 seconds! Here is what you will do:
              </Text>

              <View style={styles.stepsCardContainer}>
                <View
                  style={[
                    styles.stepCard,
                    {
                      backgroundColor: isDarkMode ? '#1A231E' : '#F7FAF8',
                      borderColor: isDarkMode ? '#27362E' : '#E5EFE8',
                    },
                  ]}
                >
                  <View style={[styles.stepNumCircle, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumText}>1</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={[styles.stepCardTitle, { color: colors.text }]}>
                      Name & Location
                    </Text>
                    <Text style={[styles.stepCardDesc, { color: colors.textSecondary }]}>
                      Enter your farm name (e.g. "Sunrise Gamefarm") and optional location.
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.stepCard,
                    {
                      backgroundColor: isDarkMode ? '#1A231E' : '#F7FAF8',
                      borderColor: isDarkMode ? '#27362E' : '#E5EFE8',
                    },
                  ]}
                >
                  <View style={[styles.stepNumCircle, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumText}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={[styles.stepCardTitle, { color: colors.text }]}>
                      Generate Rooster QR Codes
                    </Text>
                    <Text style={[styles.stepCardDesc, { color: colors.textSecondary }]}>
                      Each gamefowl gets a unique QR tag for rapid health verification.
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.stepCard,
                    {
                      backgroundColor: isDarkMode ? '#1A231E' : '#F7FAF8',
                      borderColor: isDarkMode ? '#27362E' : '#E5EFE8',
                    },
                  ]}
                >
                  <View style={[styles.stepNumCircle, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumText}>3</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={[styles.stepCardTitle, { color: colors.text }]}>
                      Instant AI Disease Scanning
                    </Text>
                    <Text style={[styles.stepCardDesc, { color: colors.textSecondary }]}>
                      Detect Coryza, Fowl Pox & Newcastle with live camera models.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Back to Page 1 link */}
              <TouchableOpacity
                onPress={goToPrevPage}
                style={styles.backStepBtn}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={14} color={colors.textSecondary} />
                <Text style={[styles.backStepText, { color: colors.textSecondary }]}>
                  Review instructions
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

          {/* Dots Indicator */}
          <View style={styles.dotsRow}>
            <View
              style={[
                styles.dot,
                currentPage === 0
                  ? [styles.activeDot, { backgroundColor: colors.primary }]
                  : { backgroundColor: isDarkMode ? '#33443B' : '#CFDCD3' },
              ]}
            />
            <View
              style={[
                styles.dot,
                currentPage === 1
                  ? [styles.activeDot, { backgroundColor: colors.primary }]
                  : { backgroundColor: isDarkMode ? '#33443B' : '#CFDCD3' },
              ]}
            />
          </View>

          {/* Action Area: Either countdown pill or Create Farm button after 3s on page 2 */}
          <View style={styles.bottomActionArea}>
            {currentPage === 0 ? (
              <TouchableOpacity
                style={[styles.primaryNextBtn, { backgroundColor: colors.primary }]}
                onPress={goToNextPage}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.primaryNextBtnText,
                    { color: isDarkMode ? '#0E1210' : '#FFFFFF' },
                  ]}
                >
                  Next: How to Create Farm
                </Text>
                <Feather
                  name="arrow-right"
                  size={18}
                  color={isDarkMode ? '#0E1210' : '#FFFFFF'}
                />
              </TouchableOpacity>
            ) : buttonReady ? (
              <Animated.View
                style={[
                  styles.animatedBtnContainer,
                  {
                    opacity: buttonFadeAnim,
                    transform: [{ translateY: buttonSlideAnim }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={[styles.createFarmBtn, { backgroundColor: colors.primary }]}
                  onPress={onStartCreateFarm}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={22}
                    color={isDarkMode ? '#0E1210' : '#FFFFFF'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.createFarmBtnText,
                      { color: isDarkMode ? '#0E1210' : '#FFFFFF', fontSize: scaleFont(15.5) },
                    ]}
                  >
                    Create Farm Now
                  </Text>
                  <Feather
                    name="check"
                    size={19}
                    color={isDarkMode ? '#0E1210' : '#FFFFFF'}
                    style={{ marginLeft: 6 }}
                  />
                </TouchableOpacity>
              </Animated.View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 16,
    overflow: 'hidden',
  },
  carouselWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerTextWrap: {
    flex: 1,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  scrollView: {
    maxHeight: 320,
  },
  scrollContent: {
    alignItems: 'flex-start',
  },
  page: {
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  pageNotice: {
    lineHeight: 20,
    marginBottom: 14,
  },
  featureList: {
    gap: 10,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
  swipeAffordance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    marginTop: 4,
  },
  swipeText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  stepsCardContainer: {
    gap: 8,
    marginBottom: 10,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  stepNumCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepNumText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
  },
  stepCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 1,
  },
  stepCardDesc: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  backStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  backStepText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginVertical: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 22,
    borderRadius: 4,
  },
  bottomActionArea: {
    justifyContent: 'center',
  },
  primaryNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    elevation: 4,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  primaryNextBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  animatedBtnContainer: {
    width: '100%',
  },
  createFarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  createFarmBtnText: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  timerCountdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  timerCountdownText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
