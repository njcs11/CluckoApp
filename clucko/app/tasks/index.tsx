import { useDarkMode } from '@/context/DarkModeContext';
import { useNotifications } from '@/context/NotificationContext';
import {
  addTask,
  deleteTask,
  formatDateKey,
  getRelativeDateLabel,
  getTasksForDate,
  loadTasks,
  Task,
  TASK_COLORS,
  TASK_ICONS,
  toggleTaskComplete,
  updateTask,
} from '@/utils/tasks';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import GuestBlockModal from '../../components/ui/GuestBlockModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { apiGetFarms, apiGetFarmMembers, getUserRole } from '../../lib/api';

const MAX_CONTENT_WIDTH = 520;
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const buildMonthMatrix = (year: number, month: number): (number | null)[][] => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matrix: (number | null)[][] = [];
  let day = 1 - firstWeekday;

  while (day <= daysInMonth) {
    const week: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day >= 1 && day <= daysInMonth ? day : null);
      day++;
    }
    matrix.push(week);
  }
  return matrix;
};

const emptyForm = {
  title: '',
  note: '',
  time: '',
  color: TASK_COLORS[0],
  icon: TASK_ICONS[0] as string,
  farm_id: undefined as number | undefined,
  assigned_to_user_id: null as number | null,
};

export default function TasksScreen() {
  const { colors, isDarkMode } = useDarkMode();
  const { notify } = useNotifications();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH);
  const params = useLocalSearchParams<{ date?: string }>();

  const initialDate = params.date && typeof params.date === 'string' ? params.date : formatDateKey(new Date());
  const initialDateObj = (() => {
    const [y, m] = initialDate.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1);
  })();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [visibleMonth, setVisibleMonth] = useState(initialDateObj);
  const [selectedDateKey, setSelectedDateKey] = useState(initialDate);

  const [farms, setFarms] = useState<any[]>([]);
  const [farmMembers, setFarmMembers] = useState<any[]>([]);
  const [selectedFarmFilter, setSelectedFarmFilter] = useState<string>('all');
  const [userRole, setUserRole] = useState<string>('owner');

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestFeature, setGuestFeature] = useState('this feature');

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const guestAlert = (featureLabel: string = 'this feature') => {
    setGuestFeature(featureLabel);
    setGuestModalVisible(true);
  };

  const refresh = useCallback(async () => {
    const [all, guestFlag, userFarms, role] = await Promise.all([
      loadTasks(),
      AsyncStorage.getItem('isGuestMode'),
      apiGetFarms().catch(() => []),
      getUserRole().catch(() => 'owner'),
    ]);
    setTasks(all || []);
    setIsGuestMode(guestFlag === 'true');
    setFarms(userFarms || []);
    setUserRole(role || 'owner');
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const todayKey = formatDateKey(new Date());
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const matrix = useMemo(() => buildMonthMatrix(year, month), [year, month]);
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Filter tasks by selected farm filter if set
  const displayedTasks = useMemo(() => {
    if (selectedFarmFilter === 'all') return tasks;
    return tasks.filter((t) => String(t.farm_id) === String(selectedFarmFilter));
  }, [tasks, selectedFarmFilter]);

  // Map of dateKey -> { total, pending }
  const taskCountsByDate = useMemo(() => {
    const map: Record<string, { total: number; pending: number }> = {};
    displayedTasks.forEach((t) => {
      if (!map[t.date]) map[t.date] = { total: 0, pending: 0 };
      map[t.date].total += 1;
      if (!t.completed) map[t.date].pending += 1;
    });
    return map;
  }, [displayedTasks]);

  const selectedTasks = useMemo(() => getTasksForDate(displayedTasks, selectedDateKey), [displayedTasks, selectedDateKey]);

  const goPrevMonth = () => setVisibleMonth(new Date(year, month - 1, 1));
  const goNextMonth = () => setVisibleMonth(new Date(year, month + 1, 1));
  const jumpToToday = () => {
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDateKey(todayKey);
  };

  const handleSelectDay = (day: number) => {
    setSelectedDateKey(formatDateKey(new Date(year, month, day)));
  };

  const openAddModal = () => {
    if (isGuestMode) {
      guestAlert('adding tasks');
      return;
    }
    setEditingId(null);
    const defaultFarmId = farms.length > 0 ? farms[0].id : undefined;
    setForm({
      ...emptyForm,
      farm_id: defaultFarmId,
      assigned_to_user_id: null,
    });
    if (defaultFarmId) {
      apiGetFarmMembers(defaultFarmId)
        .then((m) => setFarmMembers(m || []))
        .catch(() => setFarmMembers([]));
    }
    setShowFormModal(true);
  };

  const openEditModal = (task: Task) => {
    if (isGuestMode) {
      guestAlert('editing tasks');
      return;
    }
    setEditingId(task.id);
    setForm({
      title: task.title,
      note: task.note || '',
      time: task.time || '',
      color: task.color || TASK_COLORS[0],
      icon: task.icon || TASK_ICONS[0],
      farm_id: task.farm_id,
      assigned_to_user_id: task.assigned_to_user_id || null,
    });
    if (task.farm_id) {
      apiGetFarmMembers(task.farm_id)
        .then((m) => setFarmMembers(m || []))
        .catch(() => setFarmMembers([]));
    }
    setShowFormModal(true);
  };

  const handleFarmSelectInModal = (farmId: number) => {
    setForm({ ...form, farm_id: farmId, assigned_to_user_id: null });
    apiGetFarmMembers(farmId)
      .then((m) => setFarmMembers(m || []))
      .catch(() => setFarmMembers([]));
  };

  const handleSaveTask = async () => {
    if (!form.title.trim()) {
      notify({
        title: 'Missing Title',
        message: 'Please give this task or note a title.',
        type: 'warning',
      });
      return;
    }

    if (editingId) {
      await updateTask(editingId, {
        title: form.title.trim(),
        note: form.note.trim() || undefined,
        time: form.time.trim() || undefined,
        color: form.color,
        icon: form.icon,
        assigned_to_user_id: form.assigned_to_user_id,
      });
      await notify({ title: 'Task Updated', message: `"${form.title.trim()}" was updated.`, type: 'success' });
    } else {
      await addTask({
        farm_id: form.farm_id,
        date: selectedDateKey,
        title: form.title.trim(),
        note: form.note.trim() || undefined,
        time: form.time.trim() || undefined,
        color: form.color,
        icon: form.icon,
        completed: false,
        assigned_to_user_id: form.assigned_to_user_id,
      });
      await notify({ title: 'Task Scheduled', message: `"${form.title.trim()}" was created and assigned.`, type: 'success' });
    }

    setShowFormModal(false);
    setForm(emptyForm);
    setEditingId(null);
    refresh();
  };

  const handleDeleteTask = (task: Task) => {
    if (isGuestMode) {
      guestAlert('deleting tasks');
      return;
    }
    setTaskToDelete(task);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    setDeletingTask(true);
    try {
      await deleteTask(taskToDelete.id);
      setShowFormModal(false);
      await notify({ title: 'Task Deleted', message: `"${taskToDelete.title}" was removed.`, type: 'info' });
      refresh();
    } finally {
      setDeletingTask(false);
      setTaskToDelete(null);
    }
  };

  const handleToggleComplete = async (task: Task) => {
    if (isGuestMode) {
      guestAlert('completing tasks');
      return;
    }
    await toggleTaskComplete(task.id);
    await notify({
      title: task.completed ? 'Task Reopened' : 'Task Completed',
      message: `"${task.title}" was updated.`,
      type: task.completed ? 'info' : 'success',
    });
    refresh();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.pageColumn, { width: contentWidth, alignSelf: 'center' }]}>
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
            <View pointerEvents="none" style={styles.headerDecoRing} />
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.headerBackBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Tasks & Notes</Text>
                <Text style={styles.headerSubtitle}>
                  {displayedTasks.filter((t) => !t.completed).length} open task{displayedTasks.filter((t) => !t.completed).length === 1 ? '' : 's'}
                </Text>
              </View>
              <TouchableOpacity style={styles.headerTodayBtn} onPress={jumpToToday} activeOpacity={0.75}>
                <Text style={styles.headerTodayText}>Today</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* ===================== Farm Filter Pills (Owner) ===================== */}
          {farms.length > 1 && (
            <View style={styles.farmFilterBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.farmFilterScroll}>
                <TouchableOpacity
                  style={[
                    styles.farmFilterChip,
                    { backgroundColor: colors.card, borderColor: selectedFarmFilter === 'all' ? colors.primary : colors.divider },
                    selectedFarmFilter === 'all' && { backgroundColor: colors.primary + '18', borderWidth: 1.5 },
                  ]}
                  onPress={() => setSelectedFarmFilter('all')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="layers-outline" size={13} color={selectedFarmFilter === 'all' ? colors.primary : colors.textSecondary} />
                  <Text
                    style={[
                      styles.farmFilterChipText,
                      { color: selectedFarmFilter === 'all' ? colors.primary : colors.textSecondary },
                      selectedFarmFilter === 'all' && { fontWeight: '700' },
                    ]}
                  >
                    All Farms ({tasks.length})
                  </Text>
                </TouchableOpacity>

                {farms.map((f) => {
                  const isSel = String(selectedFarmFilter) === String(f.id);
                  const count = tasks.filter((t) => String(t.farm_id) === String(f.id)).length;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        styles.farmFilterChip,
                        { backgroundColor: colors.card, borderColor: isSel ? colors.primary : colors.divider },
                        isSel && { backgroundColor: colors.primary + '18', borderWidth: 1.5 },
                      ]}
                      onPress={() => setSelectedFarmFilter(isSel ? 'all' : String(f.id))}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="home-outline" size={13} color={isSel ? colors.primary : colors.textSecondary} />
                      <Text
                        style={[
                          styles.farmFilterChipText,
                          { color: isSel ? colors.primary : colors.textSecondary },
                          isSel && { fontWeight: '700' },
                        ]}
                      >
                        {f.farm_name} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ===================== Calendar ===================== */}
          <View style={[styles.floatingPanel, { backgroundColor: colors.surface, shadowColor: isDarkMode ? '#000' : '#1B5E20' }]}>
            <View style={styles.monthNavRow}>
              <TouchableOpacity onPress={goPrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back-circle-outline" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
              <TouchableOpacity onPress={goNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-forward-circle-outline" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label, i) => (
                <View key={i} style={styles.weekdayCell}>
                  <Text style={[styles.weekdayText, { color: colors.textLight }]}>{label}</Text>
                </View>
              ))}
            </View>

            {matrix.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (day === null) return <View key={di} style={styles.dayCell} />;
                  const dateKey = formatDateKey(new Date(year, month, day));
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDateKey;
                  const counts = taskCountsByDate[dateKey];

                  return (
                    <TouchableOpacity
                      key={di}
                      style={styles.dayCell}
                      onPress={() => handleSelectDay(day)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isSelected && { backgroundColor: colors.primary },
                          !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            { color: isSelected ? '#fff' : isToday ? colors.primary : colors.text },
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                      {counts && (
                        <View
                          style={[
                            styles.dayDot,
                            { backgroundColor: counts.pending > 0 ? '#FF9800' : '#4CAF50' },
                          ]}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* ===================== Selected day's tasks ===================== */}
          <View style={styles.tasksSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {getRelativeDateLabel(selectedDateKey)} · {selectedTasks.length} task{selectedTasks.length === 1 ? '' : 's'}
              </Text>
              <TouchableOpacity style={[styles.addInlineBtn, { backgroundColor: colors.primary }]} onPress={openAddModal} activeOpacity={0.85}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addInlineText}>Add</Text>
              </TouchableOpacity>
            </View>

            {selectedTasks.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="document-text-outline" size={36} color={colors.textLight} />
                <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>Nothing recorded for this day yet</Text>
                <TouchableOpacity style={[styles.resetButton, { backgroundColor: colors.primary + '15' }]} onPress={openAddModal}>
                  <Text style={[styles.resetButtonText, { color: colors.primary }]}>Add a Task or Note</Text>
                </TouchableOpacity>
              </View>
            ) : (
              selectedTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.divider }]}
                  activeOpacity={0.8}
                  onPress={() => openEditModal(task)}
                >
                  <TouchableOpacity
                    style={[
                      styles.taskCheck,
                      { borderColor: task.color || colors.primary },
                      task.completed && { backgroundColor: task.color || colors.primary },
                    ]}
                    onPress={() => handleToggleComplete(task)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {task.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>

                  <View style={[styles.taskIconCircle, { backgroundColor: (task.color || colors.primary) + '18' }]}>
                    <Ionicons name={(task.icon as any) || 'checkbox-outline'} size={16} color={task.color || colors.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text
                        style={[
                          styles.taskTitle,
                          { color: colors.text },
                          task.completed && { textDecorationLine: 'line-through', color: colors.textLight },
                        ]}
                        numberOfLines={1}
                      >
                        {task.title}
                      </Text>
                      {task.farm_name && (
                        <View style={[styles.taskFarmTag, { backgroundColor: colors.primary + '18' }]}>
                          <Ionicons name="home-outline" size={10} color={colors.primary} />
                          <Text style={[styles.taskFarmTagText, { color: colors.primary }]} numberOfLines={1}>
                            {task.farm_name}
                          </Text>
                        </View>
                      )}
                    </View>

                    {!!(task.time || task.note) && (
                      <Text style={[styles.taskMeta, { color: colors.textLight }]} numberOfLines={1}>
                        {[task.time, task.note].filter(Boolean).join(' · ')}
                      </Text>
                    )}

                    {/* Attribution lines: Set by & Assigned to */}
                    <View style={styles.taskAttributionRow}>
                      <View style={styles.taskAttrItem}>
                        <Ionicons name="person-outline" size={10} color={colors.textLight} />
                        <Text style={[styles.taskAttrText, { color: colors.textLight }]} numberOfLines={1}>
                          Set by: {task.creator_name || 'Owner'}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textLight, fontSize: 10 }}>•</Text>
                      <View style={styles.taskAttrItem}>
                        <Ionicons name="people-outline" size={10} color={colors.textLight} />
                        <Text style={[styles.taskAttrText, { color: colors.textLight }]} numberOfLines={1}>
                          {task.assignee_name ? `Assigned: ${task.assignee_name}` : 'All Caretakers'}
                        </Text>
                      </View>
                    </View>

                    {/* Completion Info */}
                    {task.completed && task.completer_name && (
                      <View style={[styles.completedNoticeRow, { backgroundColor: '#4CAF5015' }]}>
                        <Ionicons name="checkmark-done-circle" size={12} color="#4CAF50" />
                        <Text style={[styles.completedNoticeText, { color: '#4CAF50' }]} numberOfLines={1}>
                          Done by {task.completer_name} ({task.completer_role || 'Member'})
                        </Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity onPress={() => handleDeleteTask(task)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.textLight} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      {/* ===================== Add / Edit modal ===================== */}
      <Modal animationType="slide" transparent visible={showFormModal} onRequestClose={() => setShowFormModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.formSheet, { backgroundColor: colors.card, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }]}>
            <View style={[styles.formHeader, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>
                {editingId ? 'Edit Task' : 'New Task or Note'}
              </Text>
              <TouchableOpacity onPress={() => setShowFormModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formBody} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.formDateBadge, { color: colors.primary, backgroundColor: colors.primary + '15' }]}>
                {getRelativeDateLabel(selectedDateKey)}
              </Text>

              {/* Farm Selector */}
              {farms.length > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Farm</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 8 }}>
                    {farms.map((f) => {
                      const isSel = form.farm_id === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={[
                            styles.formPillOption,
                            { borderColor: colors.border, backgroundColor: colors.background },
                            isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                          onPress={() => handleFarmSelectInModal(f.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="home-outline" size={13} color={isSel ? '#fff' : colors.textSecondary} />
                          <Text style={[styles.formPillOptionText, { color: isSel ? '#fff' : colors.text }]}>{f.farm_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Assign To Caretaker */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Assign To</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.formPillOption,
                    { borderColor: colors.border, backgroundColor: colors.background },
                    form.assigned_to_user_id === null && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setForm({ ...form, assigned_to_user_id: null })}
                  activeOpacity={0.8}
                >
                  <Ionicons name="people-outline" size={13} color={form.assigned_to_user_id === null ? '#fff' : colors.textSecondary} />
                  <Text style={[styles.formPillOptionText, { color: form.assigned_to_user_id === null ? '#fff' : colors.text }]}>All Caretakers</Text>
                </TouchableOpacity>

                {farmMembers
                  .filter((m) => m.role === 'caretaker')
                  .map((m) => {
                    const isSel = form.assigned_to_user_id === m.id;
                    const name = `${m.first_name} ${m.last_name || ''}`.trim();
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[
                          styles.formPillOption,
                          { borderColor: colors.border, backgroundColor: colors.background },
                          isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => setForm({ ...form, assigned_to_user_id: m.id })}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="person-outline" size={13} color={isSel ? '#fff' : colors.textSecondary} />
                        <Text style={[styles.formPillOptionText, { color: isSel ? '#fff' : colors.text }]}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Title</Text>
              <TextInput
                style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. Vaccinate flock, clean coop…"
                placeholderTextColor={colors.textLight}
                value={form.title}
                onChangeText={(text) => setForm({ ...form, title: text })}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Time (optional)</Text>
              <TextInput
                style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. 9:00 AM"
                placeholderTextColor={colors.textLight}
                value={form.time}
                onChangeText={(text) => setForm({ ...form, time: text })}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Note (optional)</Text>
              <TextInput
                style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="Any details worth remembering…"
                placeholderTextColor={colors.textLight}
                value={form.note}
                onChangeText={(text) => setForm({ ...form, note: text })}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Color</Text>
              <View style={styles.swatchRow}>
                {TASK_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.swatch, { backgroundColor: c }, form.color === c && styles.swatchActive]}
                    onPress={() => setForm({ ...form, color: c })}
                  >
                    {form.color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Icon</Text>
              <View style={styles.iconRow}>
                {TASK_ICONS.map((iconName) => (
                  <TouchableOpacity
                    key={iconName}
                    style={[
                      styles.iconChoice,
                      { borderColor: colors.border },
                      form.icon === iconName && { backgroundColor: form.color, borderColor: form.color },
                    ]}
                    onPress={() => setForm({ ...form, icon: iconName })}
                  >
                    <Ionicons name={iconName as any} size={18} color={form.icon === iconName ? '#fff' : colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>

              {editingId && (
                <TouchableOpacity
                  style={[styles.deleteInlineBtn, { borderColor: '#f44336' }]}
                  onPress={() => {
                    const task = tasks.find((t) => t.id === editingId);
                    if (task) handleDeleteTask(task);
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color="#f44336" />
                  <Text style={styles.deleteInlineText}>Delete this task</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={[styles.formFooter, { borderTopColor: colors.divider }]}>
              <TouchableOpacity style={[styles.formCancelBtn, { borderColor: colors.border }]} onPress={() => setShowFormModal(false)} activeOpacity={0.75}>
                <Text style={[styles.formCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.formSaveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveTask} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.formSaveText}>{editingId ? 'Save Changes' : 'Schedule Task'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <TouchableOpacity
        style={[styles.fab, { right: Math.max((screenWidth - contentWidth) / 2, 0) + 20 }]}
        onPress={openAddModal}
        activeOpacity={0.85}
      >
        <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.fabGradient}>
          <Ionicons name="add" size={32} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      <GuestBlockModal
        visible={guestModalVisible}
        onClose={() => setGuestModalVisible(false)}
        featureLabel={guestFeature}
      />

      <ConfirmModal
        visible={!!taskToDelete}
        title="Delete Task"
        message={`Are you sure you want to delete "${taskToDelete?.title}"?`}
        confirmText="Delete"
        isDestructive={true}
        loading={deletingTask}
        icon="trash-outline"
        onConfirm={confirmDeleteTask}
        onCancel={() => setTaskToDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageColumn: { width: '100%' },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 44,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    position: 'relative',
  },
  headerDecoRing: {
    position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75,
    borderWidth: 26, borderColor: 'rgba(255,255,255,0.06)',
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBackBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  headerTodayBtn: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  headerTodayText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  farmFilterBar: { paddingHorizontal: 20, marginTop: 14, marginBottom: -16, zIndex: 10 },
  farmFilterScroll: { gap: 8, paddingRight: 8 },
  farmFilterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1,
  },
  farmFilterChipText: { fontSize: 12, fontWeight: '600' },

  floatingPanel: {
    marginTop: 24,
    marginHorizontal: 20,
    borderRadius: 22,
    padding: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },

  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthLabel: { fontSize: 16, fontWeight: '700' },

  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  weekdayText: { fontSize: 11, fontWeight: '700' },

  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 13, fontWeight: '600' },
  dayDot: { width: 5, height: 5, borderRadius: 2.5 },

  tasksSection: { paddingHorizontal: 20, marginTop: 22 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', flexShrink: 1 },
  addInlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  addInlineText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 34, borderRadius: 18, gap: 10 },
  emptyStateText: { fontSize: 13, textAlign: 'center' },
  resetButton: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 20 },
  resetButtonText: { fontSize: 13, fontWeight: '700' },

  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16,
    padding: 12, marginBottom: 10, borderWidth: 1,
  },
  taskCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  taskIconCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  taskTitle: { fontSize: 14, fontWeight: '600' },
  taskMeta: { fontSize: 11, marginTop: 2 },

  taskFarmTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  taskFarmTagText: { fontSize: 10, fontWeight: '700' },

  taskAttributionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap',
  },
  taskAttrItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  taskAttrText: { fontSize: 10, fontWeight: '500' },

  completedNoticeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    marginTop: 4, alignSelf: 'flex-start',
  },
  completedNoticeText: { fontSize: 10, fontWeight: '700' },

  bottomPadding: { height: 100 },

  // --- Add/Edit modal ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  formSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  formHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  formTitle: { fontSize: 17, fontWeight: '700' },
  formBody: { paddingHorizontal: 20, paddingTop: 14 },
  formDateBadge: {
    alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 12, marginBottom: 10, overflow: 'hidden',
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  formPillOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
  },
  formPillOptionText: { fontSize: 12, fontWeight: '600' },

  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  textArea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },

  swatchRow: { flexDirection: 'row', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  swatchActive: { borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 3 },

  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconChoice: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  deleteInlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderRadius: 12, paddingVertical: 11, marginTop: 22,
  },
  deleteInlineText: { color: '#f44336', fontSize: 13, fontWeight: '700' },

  formFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 18, borderTopWidth: 1 },
  formCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  formCancelText: { fontSize: 14, fontWeight: '600' },
  formSaveBtn: { flex: 2, flexDirection: 'row', gap: 8, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  formSaveText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  fab: {
    position: 'absolute', bottom: 30, borderRadius: 30, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  fabGradient: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
});