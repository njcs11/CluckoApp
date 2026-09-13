import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkIsGuestMode } from './guestMode';
import {
  apiCreateTask,
  apiDeleteTask,
  apiGetTasks,
  apiToggleCompleteTask,
  apiUpdateTask,
  getToken,
} from '../lib/api';

// A Task is a note/reminder pinned to a specific calendar date and farm.
// Shared in real-time across Owner and assigned Caretakers.
export type Task = {
  id: string;
  farm_id?: number;
  farm_name?: string;
  date: string; // 'YYYY-MM-DD'
  title: string;
  note?: string;
  time?: string; // free-text, e.g. '9:00 AM' — optional
  color?: string;
  icon?: string; // Ionicons name
  completed?: boolean;
  created_by_user_id?: number;
  creator_name?: string;
  creator_role?: string;
  assigned_to_user_id?: number | null;
  assignee_name?: string;
  assignee_role?: string;
  completed_by_user_id?: number | null;
  completer_name?: string;
  completer_role?: string;
  completed_at?: string | null;
  createdAt?: string;
};

const STORAGE_KEY = 'tasks';

// Preset palette + icon choices offered in the add/edit task form
export const TASK_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#f44336', '#00897B'];

export const TASK_ICONS = [
  'checkbox-outline',
  'medkit-outline',
  'fitness-outline',
  'brush-outline',
  'calendar-outline',
  'alert-circle-outline',
  'water-outline',
  'restaurant-outline',
] as const;

// Static-content sample tasks for guest mode
const getGuestSampleTasks = (): Task[] => {
  const today = formatDateKey(new Date());
  return [
    {
      id: 'guest-task-1',
      date: today,
      title: 'Add new farm',
      time: '10:00 AM',
      icon: 'home-outline',
      color: '#4CAF50',
      completed: false,
      farm_name: 'Sample Farm',
    },
    {
      id: 'guest-task-2',
      date: today,
      title: 'Check water supply',
      time: '2:00 PM',
      icon: 'water-outline',
      color: '#2196F3',
      completed: false,
      farm_name: 'Sample Farm',
    },
  ];
};

export const loadTasks = async (farmId?: number): Promise<Task[]> => {
  try {
    const guest = await checkIsGuestMode();
    if (guest) {
      return getGuestSampleTasks();
    }

    const token = await getToken();
    if (token) {
      try {
        const remoteTasks = await apiGetTasks(farmId);
        if (Array.isArray(remoteTasks)) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remoteTasks));
          return remoteTasks;
        }
      } catch (netErr) {
        console.warn('Could not fetch remote tasks, reading cache:', netErr);
      }
    }

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
};

const saveTasksToLocal = async (tasks: Task[]): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error('Error saving tasks locally:', error);
    return false;
  }
};

export const addTask = async (
  task: Omit<Task, 'id' | 'createdAt'>
): Promise<Task | null> => {
  if (await checkIsGuestMode()) return null;

  const token = await getToken();
  if (token) {
    try {
      const created = await apiCreateTask({
        farm_id: task.farm_id,
        title: task.title,
        description: task.note,
        note: task.note,
        date: task.date,
        time: task.time,
        color: task.color,
        icon: task.icon,
        assigned_to_user_id: task.assigned_to_user_id,
      });

      const current = await loadTasks();
      const mapped: Task = {
        id: String(created.id),
        farm_id: created.farm_id,
        farm_name: created.farm_name,
        date: created.date,
        title: created.title,
        note: created.note || created.description,
        time: created.time,
        color: created.color,
        icon: created.icon,
        completed: Boolean(created.completed),
        created_by_user_id: created.created_by_user_id,
        creator_name: created.creator_name,
        creator_role: created.creator_role,
        assigned_to_user_id: created.assigned_to_user_id,
        assignee_name: created.assignee_name,
        assignee_role: created.assignee_role,
      };
      await saveTasksToLocal([mapped, ...current]);
      return mapped;
    } catch (err) {
      console.warn('Backend task create failed, falling back to local:', err);
    }
  }

  // Fallback to local
  const tasks = await loadTasks();
  const newTask: Task = {
    ...task,
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const ok = await saveTasksToLocal([...tasks, newTask]);
  return ok ? newTask : null;
};

export const updateTask = async (id: string, updates: Partial<Task>): Promise<boolean> => {
  if (await checkIsGuestMode()) return false;

  const token = await getToken();
  if (token && !id.startsWith('guest-')) {
    try {
      await apiUpdateTask(id, {
        title: updates.title,
        description: updates.note,
        note: updates.note,
        date: updates.date,
        time: updates.time,
        color: updates.color,
        icon: updates.icon,
        assigned_to_user_id: updates.assigned_to_user_id,
      });
    } catch (err) {
      console.warn('Backend task update failed, applying locally:', err);
    }
  }

  const tasks = await loadTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  tasks[index] = { ...tasks[index], ...updates };
  return saveTasksToLocal(tasks);
};

export const deleteTask = async (id: string): Promise<boolean> => {
  if (await checkIsGuestMode()) return false;

  const token = await getToken();
  if (token && !id.startsWith('guest-')) {
    try {
      await apiDeleteTask(id);
    } catch (err) {
      console.warn('Backend task delete failed, deleting locally:', err);
    }
  }

  const tasks = await loadTasks();
  return saveTasksToLocal(tasks.filter((t) => t.id !== id));
};

export const toggleTaskComplete = async (id: string): Promise<boolean> => {
  if (await checkIsGuestMode()) return false;

  const token = await getToken();
  if (token && !id.startsWith('guest-')) {
    try {
      await apiToggleCompleteTask(id);
      await loadTasks(); // refresh from remote
      return true;
    } catch (err) {
      console.warn('Backend toggle complete failed, applying locally:', err);
    }
  }

  const tasks = await loadTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  tasks[index] = { ...tasks[index], completed: !tasks[index].completed };
  return saveTasksToLocal(tasks);
};

// --- Date helpers ---

export const formatDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const getTasksForDate = (tasks: Task[], dateKey: string): Task[] =>
  tasks
    .filter((t) => t.date === dateKey)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

// Not-yet-completed tasks from today onward, soonest first — used by
// Home's "Upcoming Tasks" preview.
export const getUpcomingTasks = (tasks: Task[], limit: number = 4): Task[] => {
  const todayKey = formatDateKey(new Date());
  return tasks
    .filter((t) => !t.completed && t.date >= todayKey)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, limit);
};

export const getRelativeDateLabel = (dateKey: string): string => {
  const todayKey = formatDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrowDate);

  if (dateKey === todayKey) return 'Today';
  if (dateKey === tomorrowKey) return 'Tomorrow';

  const target = parseDateKey(dateKey);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - startOfToday.getTime()) / 86400000);

  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString(undefined, { weekday: 'long' });
  }

  return target.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};