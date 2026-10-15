import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTour } from '@/context/TourContext';

const { width: screenWidth } = Dimensions.get('window');

// Clucko signature color palette
const CLUCKO_FOREST_GREEN = '#1E3D2D';
const CLUCKO_EMERALD = '#2D5541';
const CLUCKO_ACCENT_GREEN = '#4CAF50';
const CLUCKO_LIGHT_GREEN = '#E8F5E9';
const CLUCKO_CARD_DARK = '#14221A';

/**
 * Builds an SVG path with an outer screen rectangle and an inner cutout hole.
 * Used with fillRule="evenodd" so the inner hole is completely hollow / transparent.
 */
function getCutoutPath(
  screenW: number,
  screenH: number,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  cr: number
) {
  const outer = `M 0 0 H ${screenW} V ${screenH} H 0 Z`;
  const r = Math.min(cr, Math.floor(cw / 2), Math.floor(ch / 2));
  const inner =
    `M ${cx + r} ${cy} ` +
    `H ${cx + cw - r} ` +
    `A ${r} ${r} 0 0 1 ${cx + cw} ${cy + r} ` +
    `V ${cy + ch - r} ` +
    `A ${r} ${r} 0 0 1 ${cx + cw - r} ${cy + ch} ` +
    `H ${cx + r} ` +
    `A ${r} ${r} 0 0 1 ${cx} ${cy + ch - r} ` +
    `V ${cy + r} ` +
    `A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`;

  return `${outer} ${inner}`;
}

export default function InteractiveProductTour() {
  const {
    showWelcomeModal,
    isTourActive,
    currentStepIndex,
    totalSteps,
    currentStep,
    beginSteps,
    nextStep,
    prevStep,
    skipTour,
  } = useTour();

  const [layoutHeight, setLayoutHeight] = React.useState(
    Dimensions.get(Platform.OS === 'android' ? 'screen' : 'window').height
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1 / (totalSteps || 1))).current;

  // Fade-in animation on step change
  useEffect(() => {
    if (isTourActive) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();

      Animated.timing(progressAnim, {
        toValue: (currentStepIndex + 1) / totalSteps,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  }, [currentStepIndex, isTourActive]);

  if (!showWelcomeModal && !isTourActive) {
    return null;
  }

  // ==========================================
  // Frame 1: Initial Welcome Modal (Pic 3 in Clucko Palette)
  // ==========================================
  if (showWelcomeModal) {
    return (
      <Modal
        visible={true}
        transparent={true}
        statusBarTranslucent={true}
        navigationBarTranslucent={true}
        animationType="fade"
        onRequestClose={skipTour}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.welcomeCard}>
            {/* Minimalist Top Icon in Clucko Green Badge */}
            <View style={styles.welcomeIconCircle}>
              <Feather name="compass" size={32} color={CLUCKO_FOREST_GREEN} />
            </View>

            <Text style={styles.welcomeTitle}>Let's take a quick tour</Text>
            <Text style={styles.welcomeSubtitle}>It's going to take just a few seconds</Text>

            {/* Clucko Forest Green Pill CTA */}
            <TouchableOpacity
              style={styles.welcomeTakeTourBtn}
              onPress={beginSteps}
              activeOpacity={0.85}
            >
              <Text style={styles.welcomeTakeTourText}>Take a tour</Text>
            </TouchableOpacity>

            {/* Subtle Skip Link */}
            <TouchableOpacity
              style={styles.welcomeSkipLink}
              onPress={skipTour}
              activeOpacity={0.7}
            >
              <Text style={styles.welcomeSkipText}>Skip this short & sweet tour</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ==========================================
  // Frames 2, 3, 4: Guided Highlights (Pic 3 Reference)
  // ==========================================
  const { spotlight, caretPosition, tooltipTop, tooltipBottom } = currentStep;

  const isCaretTop = caretPosition === 'top';
  const caretCenterX =
    spotlight.left !== undefined && spotlight.width !== undefined
      ? Math.min(Math.max(spotlight.left + spotlight.width / 2, 40), screenWidth - 40)
      : screenWidth / 2;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const cutoutW = spotlight?.width ?? 60;
  const cutoutH = spotlight?.height ?? 60;
  const cutoutRx = spotlight?.borderRadius ?? 16;
  const cutoutX = spotlight?.left !== undefined ? spotlight.left : (screenWidth - cutoutW) / 2;
  const cutoutY = spotlight?.top !== undefined
    ? spotlight.top
    : layoutHeight - (spotlight?.bottom ?? 0) - cutoutH;

  return (
    <Modal
      visible={isTourActive}
      transparent={true}
      statusBarTranslucent={true}
      navigationBarTranslucent={true}
      animationType="fade"
      onRequestClose={skipTour}
    >
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h && h > 0) setLayoutHeight(h);
        }}
      >
        {/* 
          Hollow Spotlight Cutout via SVG evenodd path:
          - Screen is 100% covered by dark overlay, blocking touches to background.
          - Inside the spotlight cutout shape, it is 100% HOLLOW / CLEAR (no overlay),
            so the target button is brightly visible, emphasized, and crystal clear!
        */}
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={() => {}}
        >
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            {spotlight ? (
              <Path
                d={getCutoutPath(
                  screenWidth,
                  layoutHeight,
                  cutoutX,
                  cutoutY,
                  cutoutW,
                  cutoutH,
                  cutoutRx
                )}
                fill="rgba(5, 12, 8, 0.88)"
                fillRule="evenodd"
              />
            ) : (
              <Rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="rgba(5, 12, 8, 0.88)"
              />
            )}

            {/* Glowing illuminated border around the transparent hole */}
            {spotlight && (
              <Rect
                x={cutoutX}
                y={cutoutY}
                width={cutoutW}
                height={cutoutH}
                rx={cutoutRx}
                ry={cutoutRx}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={2.5}
              />
            )}
          </Svg>
        </TouchableOpacity>

        {/* Tooltip Card with Caret, Progress Bar, and Action Buttons */}
        <Animated.View
          style={[
            styles.tooltipCardContainer,
            tooltipTop !== undefined ? { top: tooltipTop } : { bottom: tooltipBottom },
            { opacity: fadeAnim },
          ]}
        >
          {/* Caret pointing UP towards top target */}
          {isCaretTop && (
            <View
              style={[
                styles.caretUp,
                { left: caretCenterX - 30 },
              ]}
            />
          )}

          {/* Clucko Forest Dark Tooltip Card */}
          <View style={styles.tooltipCard}>
            {/* Card Header Row with Title and Close (X) */}
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>{currentStep.title}</Text>
              <TouchableOpacity
                onPress={skipTour}
                style={styles.closeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={19} color="#A3B5AA" />
              </TouchableOpacity>
            </View>

            {/* Card Description */}
            <Text style={styles.cardInstruction}>{currentStep.instruction}</Text>

            {/* Visual Progress Bar inside the card */}
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>

            {/* In-Card Action Buttons: perfectly contained, never covers spotlight target! */}
            <View style={styles.cardActionsRow}>
              {!isFirstStep && (
                <TouchableOpacity
                  style={[styles.cardNavBtn, styles.cardBackBtn]}
                  onPress={prevStep}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cardBackBtnText}>Back</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.cardNavBtn, styles.cardNextBtn, isFirstStep && { flex: 1 }]}
                onPress={nextStep}
                activeOpacity={0.85}
              >
                <Text style={styles.cardNextBtnText}>{isLastStep ? 'Finish' : 'Next'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Caret pointing DOWN towards bottom target */}
          {!isCaretTop && (
            <View
              style={[
                styles.caretDown,
                { left: caretCenterX - 30 },
              ]}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Welcome Modal (Pic 3 Frame 1 in Clucko Palette)
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 12, 8, 0.90)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  welcomeCard: {
    width: Math.min(340, screenWidth - 44),
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  welcomeIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: CLUCKO_LIGHT_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  welcomeTakeTourBtn: {
    width: '100%',
    backgroundColor: CLUCKO_FOREST_GREEN,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: CLUCKO_FOREST_GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  welcomeTakeTourText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  welcomeSkipLink: {
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  welcomeSkipText: {
    fontSize: 13,
    color: CLUCKO_EMERALD,
    fontWeight: '600',
  },

  // Tour Overlay (Covers entire screen with zero white gap)
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0, // Covers entire screen, zero white gap!
    backgroundColor: 'rgba(5, 12, 8, 0.88)', // Rich translucent forest dark overlay
  },
  spotlightCutout: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },

  // Tooltip Card Container
  tooltipCardContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  tooltipCard: {
    backgroundColor: CLUCKO_CARD_DARK,
    borderWidth: 1,
    borderColor: 'rgba(143, 224, 176, 0.22)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    letterSpacing: -0.2,
  },
  closeBtn: {
    padding: 2,
    marginLeft: 8,
  },
  cardInstruction: {
    fontSize: 13,
    color: '#C8E6C9',
    lineHeight: 18.5,
    marginTop: 6,
  },

  // Visual Progress Bar
  progressTrack: {
    height: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: CLUCKO_ACCENT_GREEN,
    borderRadius: 2,
  },

  // Carets / Arrows
  caretUp: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: CLUCKO_CARD_DARK,
    alignSelf: 'flex-start',
    marginBottom: -1,
    zIndex: 10000,
  },
  caretDown: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: CLUCKO_CARD_DARK,
    alignSelf: 'flex-start',
    marginTop: -1,
    zIndex: 10000,
  },

  // Action buttons inside the tooltip card
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  cardNavBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBackBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  cardBackBtnText: {
    color: '#E0E7E2',
    fontSize: 13.5,
    fontWeight: '700',
  },
  cardNextBtn: {
    backgroundColor: CLUCKO_ACCENT_GREEN,
    shadowColor: CLUCKO_ACCENT_GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  cardNextBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
