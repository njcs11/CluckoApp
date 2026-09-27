import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TimePickerModalProps {
  visible: boolean;
  currentTime?: string;
  onClose: () => void;
  onSelectTime: (time: string) => void;
  colors: any;
  isDarkMode: boolean;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES_5 = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const PERIODS = ['AM', 'PM'];

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5;
const PADDING_COUNT = 2; // (5 - 1) / 2

interface WheelColumnProps<T> {
  items: T[];
  selectedValue: T;
  onValueChange: (value: T) => void;
  formatLabel?: (item: T) => string;
  itemWidth?: number;
  isDarkMode: boolean;
}

function WheelColumn<T extends string | number>({
  items,
  selectedValue,
  onValueChange,
  formatLabel,
  itemWidth = 76,
  isDarkMode,
}: WheelColumnProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const isUserScrolling = useRef(false);

  const selectedIndex = Math.max(0, items.indexOf(selectedValue));

  useEffect(() => {
    // Scroll to active index
    const timer = setTimeout(() => {
      if (!isUserScrolling.current) {
        scrollRef.current?.scrollTo({
          y: selectedIndex * ITEM_HEIGHT,
          animated: false,
        });
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [selectedIndex]);

  const handleScrollEnd = (event: any) => {
    isUserScrolling.current = false;
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
    if (items[clampedIndex] !== selectedValue) {
      try {
        Haptics.selectionAsync();
      } catch (_) {}
      onValueChange(items[clampedIndex]);
    }
  };

  const handleScrollBegin = () => {
    isUserScrolling.current = true;
  };

  return (
    <View style={{ height: ITEM_HEIGHT * VISIBLE_COUNT, width: itemWidth }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT * PADDING_COUNT,
        }}
      >
        {items.map((item, index) => {
          const isSelected = item === selectedValue;
          const label = formatLabel ? formatLabel(item) : String(item);
          return (
            <TouchableOpacity
              key={`${item}-${index}`}
              style={{
                height: ITEM_HEIGHT,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={() => {
                try {
                  Haptics.selectionAsync();
                } catch (_) {}
                onValueChange(item);
                scrollRef.current?.scrollTo({
                  y: index * ITEM_HEIGHT,
                  animated: true,
                });
              }}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: isSelected ? 24 : 17,
                  fontWeight: isSelected ? '700' : '400',
                  color: isSelected
                    ? (isDarkMode ? '#FFFFFF' : '#111827')
                    : (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)'),
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TimePickerModal({
  visible,
  currentTime,
  onClose,
  onSelectTime,
  colors,
  isDarkMode,
}: TimePickerModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedHour, setSelectedHour] = useState<number>(12);
  const [selectedMinute, setSelectedMinute] = useState<string>('00');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('PM');

  useEffect(() => {
    if (visible) {
      if (currentTime && currentTime.trim()) {
        const match = currentTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (match) {
          const h = parseInt(match[1], 10);
          const m = match[2];
          const p = match[3] ? match[3].toUpperCase() : 'AM';
          if (h >= 1 && h <= 12) setSelectedHour(h);
          if (m) setSelectedMinute(m);
          if (p === 'AM' || p === 'PM') setSelectedPeriod(p);
        }
      } else {
        // Default to current local time rounded to 5 min
        const now = new Date();
        let h = now.getHours();
        const p = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        const rawM = now.getMinutes();
        const roundedM = Math.round(rawM / 5) * 5;
        const mStr = String(roundedM >= 60 ? 55 : roundedM).padStart(2, '0');
        setSelectedHour(h);
        setSelectedMinute(mStr);
        setSelectedPeriod(p);
      }
    }
  }, [visible, currentTime]);

  const handleConfirm = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}
    const formatted = `${selectedHour}:${selectedMinute} ${selectedPeriod}`;
    onSelectTime(formatted);
    onClose();
  };

  const handleClear = () => {
    onSelectTime('');
    onClose();
  };

  // Ensure minute list includes selectedMinute if it's an odd minute
  const minuteList = MINUTES_5.includes(selectedMinute)
    ? MINUTES_5
    : [...MINUTES_5, selectedMinute].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: isDarkMode ? '#17221C' : '#FFFFFF',
                  paddingBottom: Math.max(insets.bottom, 20),
                },
              ]}
            >
              {/* Sheet Drag Handle */}
              <View style={styles.handleWrap}>
                <View
                  style={[
                    styles.handle,
                    { backgroundColor: isDarkMode ? '#2D3E35' : '#E2E8F0' },
                  ]}
                />
              </View>

              {/* Header Bar */}
              <View style={[styles.headerBar, { borderBottomColor: isDarkMode ? '#23332A' : '#F1F5F9' }]}>
                <TouchableOpacity onPress={handleClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[styles.headerActionText, { color: isDarkMode ? '#9CA3AF' : '#64748B' }]}>
                    Clear
                  </Text>
                </TouchableOpacity>

                <View style={styles.titleWrap}>
                  <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>
                    Pick Time
                  </Text>
                  <Text style={[styles.headerSub, { color: colors.primary }]}>
                    {selectedHour}:{selectedMinute} {selectedPeriod}
                  </Text>
                </View>

                <TouchableOpacity onPress={handleConfirm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[styles.headerActionText, { color: colors.primary, fontWeight: '700' }]}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Roller Wheel Container matching Pic 5 */}
              <View style={styles.wheelWrapper}>
                {/* Horizontal divider lines highlighting active row */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.selectionHighlight,
                    {
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                />

                <View style={styles.columnsRow}>
                  {/* Hour Column */}
                  <WheelColumn
                    items={HOURS}
                    selectedValue={selectedHour}
                    onValueChange={(h) => setSelectedHour(h as number)}
                    itemWidth={78}
                    isDarkMode={isDarkMode}
                  />

                  {/* Colon Separator */}
                  <View style={styles.colonContainer}>
                    <Text
                      style={[
                        styles.colonText,
                        { color: isDarkMode ? '#FFFFFF' : '#111827' },
                      ]}
                    >
                      :
                    </Text>
                  </View>

                  {/* Minute Column */}
                  <WheelColumn
                    items={minuteList}
                    selectedValue={selectedMinute}
                    onValueChange={(m) => setSelectedMinute(String(m))}
                    itemWidth={78}
                    isDarkMode={isDarkMode}
                  />

                  {/* Period Column */}
                  <WheelColumn
                    items={PERIODS}
                    selectedValue={selectedPeriod}
                    onValueChange={(p) => setSelectedPeriod(String(p))}
                    itemWidth={78}
                    isDarkMode={isDarkMode}
                  />
                </View>
              </View>

              {/* Set Time CTA button */}
              <View style={styles.footerWrap}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                  onPress={handleConfirm}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>Set Time</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  headerActionText: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  titleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  wheelWrapper: {
    height: ITEM_HEIGHT * VISIBLE_COUNT,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginVertical: 12,
  },
  selectionHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * PADDING_COUNT,
    left: 12,
    right: 12,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  columnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colonContainer: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    width: 14,
  },
  colonText: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  footerWrap: {
    marginTop: 8,
  },
  confirmBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 13,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
