import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlarmClock,
  ArrowLeft,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';

const STORAGE_KEY = 'rupantaran-ai-tasks';
const categories = ['Personal Task', 'Department Task', 'Meeting', 'Sadhana & Satsang'] as const;
const statuses = ['Pending', 'In Progress', 'Completed'] as const;

type TaskCategory = (typeof categories)[number];
type TaskStatus = (typeof statuses)[number];

interface SecretarySubtask {
  id: string;
  title: string;
  dueDate: string;
  dueTime: string;
  alarm: boolean;
  status: TaskStatus;
  snoozeUntil?: string;
}

interface SecretaryTask {
  id: string;
  title: string;
  category: TaskCategory;
  dueDate: string;
  dueTime: string;
  alarm: boolean;
  status: TaskStatus;
  snoozeUntil?: string;
  subtasks: SecretarySubtask[];
}

interface TaskForm {
  title: string;
  category: TaskCategory;
  dueDate: string;
  dueTime: string;
  alarm: boolean;
}

interface SubtaskForm {
  taskId: string;
  subtaskId: string | null;
  title: string;
  dueDate: string;
  dueTime: string;
  alarm: boolean;
}

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const newTaskForm = (): TaskForm => ({
  title: '',
  category: categories[0],
  dueDate: today(),
  dueTime: '',
  alarm: false,
});

const newId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

function readSavedTasks(): { tasks: SecretaryTask[]; error: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { tasks: [], error: '' };
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return { tasks: [], error: 'Saved task data could not be read. A new task list has been started.' };
    }
    const tasks = parsed.map((entry): SecretaryTask => {
      const task = entry as Partial<SecretaryTask> & { due?: string; status?: string };
      const category = categories.find((item) => item === task.category) ?? categories[0];
      const status = statuses.find((item) => item === task.status) ?? 'Pending';
      const subtasks = Array.isArray(task.subtasks) ? task.subtasks.map((child) => ({
        id: typeof child.id === 'string' ? child.id : newId(),
        title: typeof child.title === 'string' ? child.title : '',
        dueDate: typeof child.dueDate === 'string' ? child.dueDate : '',
        dueTime: typeof child.dueTime === 'string' ? child.dueTime : '',
        alarm: child.alarm === true,
        status: statuses.find((item) => item === child.status) ?? 'Pending',
        snoozeUntil: typeof child.snoozeUntil === 'string' ? child.snoozeUntil : undefined,
      })) : [];
      return {
        id: typeof task.id === 'string' ? task.id : newId(),
        title: typeof task.title === 'string' ? task.title : '',
        category,
        dueDate: typeof task.dueDate === 'string' ? task.dueDate : (task.due ?? ''),
        dueTime: typeof task.dueTime === 'string' ? task.dueTime : '',
        alarm: task.alarm === true,
        status,
        snoozeUntil: typeof task.snoozeUntil === 'string' ? task.snoozeUntil : undefined,
        subtasks,
      };
    });
    return { tasks, error: '' };
  } catch {
    return { tasks: [], error: 'Saved task data is unavailable in this browser. Your changes may not persist.' };
  }
}

function deadline(task: Pick<SecretaryTask, 'dueDate' | 'dueTime'>): Date | null {
  if (!task.dueDate) return null;
  return new Date(`${task.dueDate}T${task.dueTime || '23:59'}`);
}

function isOverdue(item: Pick<SecretaryTask, 'dueDate' | 'dueTime' | 'status'>, now = Date.now()): boolean {
  const due = deadline(item);
  return item.status !== 'Completed' && due !== null && due.getTime() < now;
}

function formatDue(item: Pick<SecretaryTask, 'dueDate' | 'dueTime'>): string {
  if (!item.dueDate) return 'No due date';
  const date = new Date(`${item.dueDate}T${item.dueTime || '12:00'}`);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(item.dueTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

function playAlarmSound(): void {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [0, 0.22, 0.44].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = index === 1 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.19);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch (error) {
    console.warn('Could not play the task alarm sound.', error);
  }
}

function dueReminder(item: Pick<SecretaryTask, 'id' | 'title' | 'dueDate' | 'dueTime' | 'alarm' | 'status' | 'snoozeUntil'>) {
  if (!item.alarm || item.status === 'Completed') return null;
  const due = item.snoozeUntil ? new Date(item.snoozeUntil) : deadline(item);
  if (!due || Number.isNaN(due.getTime())) return null;
  return {
    key: `${item.id}:${item.snoozeUntil ?? `${item.dueDate}T${item.dueTime}`}`,
    due,
    title: item.title,
  };
}

function statusClasses(status: TaskStatus): string {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'In Progress') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function AiSecretaryPage() {
  const [initialData] = useState(readSavedTasks);
  const [tasks, setTasks] = useState<SecretaryTask[]>(initialData.tasks);
  const [storageMessage, setStorageMessage] = useState(initialData.error);
  const [taskForm, setTaskForm] = useState<TaskForm>(newTaskForm);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [search, setSearch] = useState('');
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [notice, setNotice] = useState('');
  const firedReminders = useRef(new Set<string>());
  const lastSavedTasks = useRef(JSON.stringify(initialData.tasks));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const serializedTasks = JSON.stringify(tasks);
    if (serializedTasks === lastSavedTasks.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, serializedTasks);
      lastSavedTasks.current = serializedTasks;
      setStorageMessage('');
    } catch (error) {
      console.error('Could not save AI Secretary tasks to local storage.', error);
      setStorageMessage('Your changes could not be saved to this browser. Check available storage and privacy settings.');
    }
  }, [tasks]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkReminders = () => {
      const reminders = tasks.flatMap((task) => [
        dueReminder(task),
        ...task.subtasks.map((subtask) => dueReminder(subtask)),
      ]).filter((reminder): reminder is NonNullable<typeof reminder> => reminder !== null);
      const dueReminders = reminders.filter((reminder) =>
        reminder.due.getTime() <= Date.now() && !firedReminders.current.has(reminder.key),
      );
      if (dueReminders.length === 0) return;
      dueReminders.forEach((reminder) => {
        firedReminders.current.add(reminder.key);
        if (notificationPermission === 'granted' && typeof Notification !== 'undefined') {
          new Notification('AI Secretary reminder', {
            body: reminder.title,
            tag: reminder.key,
          });
        }
      });
      playAlarmSound();
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, 15000);
    return () => window.clearInterval(interval);
  }, [notificationPermission, tasks]);

  const allItems = useMemo(
    () => tasks.flatMap((task) => [task, ...task.subtasks]),
    [tasks],
  );
  const counts = useMemo(() => ({
    pending: allItems.filter((item) => item.status === 'Pending').length,
    inProgress: allItems.filter((item) => item.status === 'In Progress').length,
    completed: allItems.filter((item) => item.status === 'Completed').length,
    overdue: allItems.filter(isOverdue).length,
  }), [allItems, now]);
  const visibleTasks = tasks.filter((task) => {
    const categoryMatches = categoryFilter === 'All categories' || task.category === categoryFilter;
    const statusMatches = statusFilter === 'All statuses'
      || task.status === statusFilter
      || task.subtasks.some((subtask) => subtask.status === statusFilter);
    const searchMatches = !search.trim()
      || task.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      || task.subtasks.some((subtask) => subtask.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return categoryMatches && statusMatches && searchMatches;
  });

  const saveTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = taskForm.title.trim();
    if (!title) return;
    if (taskForm.alarm && (!taskForm.dueDate || !taskForm.dueTime)) {
      setNotice('Choose both a due date and time to set an alarm.');
      return;
    }
    if (editingTaskId) {
      setTasks((current) => current.map((task) => task.id === editingTaskId
        ? { ...task, ...taskForm, title, snoozeUntil: undefined }
        : task));
      setNotice('Task updated.');
    } else {
      setTasks((current) => [{
        id: newId(),
        ...taskForm,
        title,
        status: 'Pending',
        subtasks: [],
      }, ...current]);
      setNotice('Task added.');
    }
    setTaskForm(newTaskForm());
    setEditingTaskId(null);
  };

  const editTask = (task: SecretaryTask) => {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      category: task.category,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      alarm: task.alarm,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, status, snoozeUntil: undefined }
      : task));
  };

  const saveSubtask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subtaskForm || !subtaskForm.title.trim()) return;
    if (subtaskForm.alarm && (!subtaskForm.dueDate || !subtaskForm.dueTime)) {
      setNotice('Choose both a due date and time to set an alarm.');
      return;
    }
    setTasks((current) => current.map((task) => {
      if (task.id !== subtaskForm.taskId) return task;
      const nextSubtask: SecretarySubtask = {
        id: subtaskForm.subtaskId ?? newId(),
        title: subtaskForm.title.trim(),
        dueDate: subtaskForm.dueDate,
        dueTime: subtaskForm.dueTime,
        alarm: subtaskForm.alarm,
        status: subtaskForm.subtaskId
          ? task.subtasks.find((subtask) => subtask.id === subtaskForm.subtaskId)?.status ?? 'Pending'
          : 'Pending',
      };
      const subtasks = subtaskForm.subtaskId
        ? task.subtasks.map((subtask) => subtask.id === nextSubtask.id ? nextSubtask : subtask)
        : [...task.subtasks, nextSubtask];
      return { ...task, subtasks };
    }));
    setNotice(subtaskForm.subtaskId ? 'Sub-task updated.' : 'Sub-task added.');
    setSubtaskForm(null);
  };

  const updateSubtask = (taskId: string, subtaskId: string, update: Partial<SecretarySubtask>) => {
    setTasks((current) => current.map((task) => task.id !== taskId ? task : {
      ...task,
      subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId
        ? { ...subtask, ...update }
        : subtask),
    }));
  };

  const snooze = (taskId: string, subtaskId?: string) => {
    const snoozeUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      if (!subtaskId) return { ...task, snoozeUntil };
      return {
        ...task,
        subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId
          ? { ...subtask, snoozeUntil }
          : subtask),
      };
    }));
    setNotice('Alarm snoozed for 10 minutes.');
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotice('This browser does not support notifications. Alarms can still sound while this page is open.');
      return;
    }
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    setNotificationPermission(permission);
    if (permission === 'granted') {
      setNotice('Notifications and in-page alarm sounds are enabled.');
      playAlarmSound();
    } else {
      setNotice('Notification permission was not granted. In-page alarm sounds remain available while this page is open.');
    }
  };

  const cancelTaskEdit = () => {
    setTaskForm(newTaskForm());
    setEditingTaskId(null);
  };

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#263238]">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-5 sm:px-7 sm:pt-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <a href="/sevak-dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-[#617278] transition hover:text-[#263c45]">
            <ArrowLeft size={16} /> Sevak home
          </a>
          <button
            type="button"
            onClick={enableNotifications}
            className="inline-flex items-center gap-2 rounded-full border border-[#d7dfdc] bg-white px-4 py-2 text-sm font-semibold text-[#36534c] shadow-sm transition hover:bg-[#f0f6f3]"
          >
            {notificationPermission === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
            {notificationPermission === 'granted' ? 'Alerts enabled' : 'Enable alerts'}
          </button>
        </header>

        <section className="mb-8 overflow-hidden rounded-3xl bg-[#263e43] px-6 py-8 text-white shadow-[0_18px_60px_-32px_rgba(31,54,59,0.65)] sm:px-9 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#e0c785]">
                <Sparkles size={14} /> Rupantaran · Central HRMS
              </p>
              <h1 className="mt-3 font-serif text-3xl sm:text-4xl">AI Personal Secretary</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
                Keep your seva, meetings and daily practice moving with one calm, focused task list.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
              <CalendarDays size={17} className="text-[#e0c785]" />
              <span>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</span>
            </div>
          </div>
        </section>

        {notice && (
          <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#d7e4dc] bg-white px-4 py-3 text-sm text-[#36534c]">
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setNotice('')} className="rounded-md p-1 hover:bg-[#eff4f0]"><X size={16} /></button>
          </div>
        )}
        {storageMessage && (
          <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{storageMessage}</div>
        )}

        <section aria-label="Task overview" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Pending', count: counts.pending, color: 'text-amber-700', icon: Circle },
            { label: 'In progress', count: counts.inProgress, color: 'text-sky-700', icon: Clock3 },
            { label: 'Completed', count: counts.completed, color: 'text-emerald-700', icon: Check },
            { label: 'Overdue', count: counts.overdue, color: 'text-rose-700', icon: AlarmClock },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-[#e5e8e3] bg-white p-4 shadow-[0_4px_20px_-16px_rgba(35,50,55,0.25)] sm:p-5">
              <div className={`flex items-center gap-2 text-sm font-medium ${item.color}`}>
                <item.icon size={17} /> {item.label}
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-[#263238]">{item.count}</p>
              <p className="mt-1 text-xs text-[#879397]">tasks and sub-tasks</p>
            </div>
          ))}
        </section>

        <section className="mb-8 rounded-2xl border border-[#e5e8e3] bg-white p-5 shadow-[0_4px_24px_-18px_rgba(35,50,55,0.3)] sm:p-7">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-[#edf3ef] p-2.5 text-[#56765f]"><Plus size={19} /></div>
            <div>
              <h2 className="text-lg font-semibold">{editingTaskId ? 'Edit task' : 'Plan a task'}</h2>
              <p className="mt-1 text-sm text-[#7b898c]">Add a task and set a reminder if you need one.</p>
            </div>
          </div>
          <form onSubmit={saveTask} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-[#536267] sm:col-span-2 lg:col-span-2">
              Task name
              <input
                aria-label="Task title"
                value={taskForm.title}
                onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                placeholder="What needs to be done?"
                required
                className="mt-1.5 w-full rounded-xl border border-[#dce2dd] bg-[#fcfcfa] px-3.5 py-3 text-[#263238] outline-none transition placeholder:text-[#a6afb0] focus:border-[#779781] focus:ring-2 focus:ring-[#779781]/15"
              />
            </label>
            <label className="text-sm font-medium text-[#536267]">
              Category
              <select value={taskForm.category} onChange={(event) => setTaskForm({ ...taskForm, category: event.target.value as TaskCategory })} className="mt-1.5 w-full rounded-xl border border-[#dce2dd] bg-[#fcfcfa] px-3.5 py-3 outline-none focus:border-[#779781]">
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-[#536267]">
              Due date
              <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#dce2dd] bg-[#fcfcfa] px-3.5 py-3 outline-none focus:border-[#779781]" />
            </label>
            <label className="text-sm font-medium text-[#536267]">
              Due time
              <input type="time" value={taskForm.dueTime} onChange={(event) => setTaskForm({ ...taskForm, dueTime: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#dce2dd] bg-[#fcfcfa] px-3.5 py-3 outline-none focus:border-[#779781]" />
            </label>
            <label className="flex items-center gap-2 self-end rounded-xl border border-[#e5e8e3] bg-[#fcfcfa] px-3.5 py-3 text-sm text-[#536267]">
              <input type="checkbox" checked={taskForm.alarm} onChange={(event) => setTaskForm({ ...taskForm, alarm: event.target.checked })} className="size-4 accent-[#56765f]" />
              <AlarmClock size={16} /> Set task alarm
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#35564e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#29463f]">
                {editingTaskId ? <Check size={16} /> : <Plus size={17} />}
                {editingTaskId ? 'Save changes' : 'Add task'}
              </button>
              {editingTaskId && <button type="button" onClick={cancelTaskEdit} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-[#69777a] hover:bg-[#f2f4f1]"><X size={16} /> Cancel</button>}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-[#e5e8e3] bg-white p-5 shadow-[0_4px_24px_-18px_rgba(35,50,55,0.3)] sm:p-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Your schedule</h2>
              <p className="mt-1 text-sm text-[#7b898c]">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} · sub-tasks included in your overview</p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
              <label className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b9999]" />
                <input aria-label="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" className="w-full rounded-xl border border-[#dce2dd] bg-[#fcfcfa] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#779781]" />
              </label>
              <label className="relative">
                <span className="sr-only">Filter by category</span>
                <select aria-label="Filter tasks by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full appearance-none rounded-xl border border-[#dce2dd] bg-[#fcfcfa] py-2.5 pl-3 pr-8 text-sm outline-none focus:border-[#779781]">
                  <option>All categories</option>
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#83908f]" />
              </label>
              <label className="relative">
                <span className="sr-only">Filter by status</span>
                <select aria-label="Filter tasks by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full appearance-none rounded-xl border border-[#dce2dd] bg-[#fcfcfa] py-2.5 pl-3 pr-8 text-sm outline-none focus:border-[#779781]">
                  <option>All statuses</option>
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#83908f]" />
              </label>
            </div>
          </div>

          {visibleTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dce2dd] bg-[#fcfcfa] px-6 py-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#edf3ef] text-[#668271]"><CalendarDays size={21} /></div>
              <p className="mt-4 font-semibold text-[#4a5a5e]">{tasks.length ? 'No matching tasks' : 'A little space to begin'}</p>
              <p className="mt-1 text-sm text-[#879397]">{tasks.length ? 'Try changing your search or filters.' : 'Add a task above to start shaping your day.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleTasks.map((task) => (
                <article key={task.id} className="rounded-2xl border border-[#e5e8e3] bg-[#fff] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`break-words font-semibold ${task.status === 'Completed' ? 'text-[#8c9695] line-through' : 'text-[#2b3a3e]'}`}>{task.title}</h3>
                        <span className="rounded-full bg-[#f0f3f0] px-2.5 py-1 text-[11px] font-medium text-[#667670]">{task.category}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(task.status)}`}>{task.status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#829092]">
                        <span className={`inline-flex items-center gap-1.5 ${isOverdue(task, now) ? 'font-semibold text-rose-600' : ''}`}><CalendarDays size={14} /> {isOverdue(task, now) ? `Overdue · ${formatDue(task)}` : formatDue(task)}</span>
                        {task.alarm && <span className="inline-flex items-center gap-1"><Bell size={13} /> Reminder on</span>}
                        <span>{task.subtasks.length} {task.subtasks.length === 1 ? 'sub-task' : 'sub-tasks'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <label className="sr-only" htmlFor={`task-status-${task.id}`}>Status for {task.title}</label>
                      <select id={`task-status-${task.id}`} value={task.status} onChange={(event) => updateTaskStatus(task.id, event.target.value as TaskStatus)} className="rounded-lg border border-[#dce2dd] bg-white px-2.5 py-2 text-xs font-medium text-[#546469] outline-none focus:border-[#779781]">
                        {statuses.map((status) => <option key={status}>{status}</option>)}
                      </select>
                      <button type="button" onClick={() => editTask(task)} aria-label={`Edit ${task.title}`} className="rounded-lg p-2 text-[#748184] transition hover:bg-[#f1f4f1] hover:text-[#35564e]"><Pencil size={16} /></button>
                      <button type="button" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} aria-label={`Delete ${task.title}`} className="rounded-lg p-2 text-[#9a7270] transition hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></button>
                      {task.alarm && <button type="button" onClick={() => snooze(task.id)} className="rounded-lg px-2.5 py-2 text-xs font-medium text-[#657c71] hover:bg-[#eff4f0]">Snooze 10m</button>}
                    </div>
                  </div>

                  {task.subtasks.length > 0 && (
                    <ul className="mt-4 space-y-2 border-l-2 border-[#e8ede8] pl-3 sm:ml-2 sm:pl-4">
                      {task.subtasks.map((subtask) => (
                        <li key={subtask.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#fafbf9] px-3 py-2.5">
                          <label className="sr-only" htmlFor={`subtask-status-${subtask.id}`}>Status for {subtask.title}</label>
                          <select id={`subtask-status-${subtask.id}`} value={subtask.status} onChange={(event) => updateSubtask(task.id, subtask.id, { status: event.target.value as TaskStatus, snoozeUntil: undefined })} className="max-w-32 rounded-lg border border-[#e0e5e0] bg-white px-2 py-1.5 text-xs text-[#58686b]">
                            {statuses.map((status) => <option key={status}>{status}</option>)}
                          </select>
                          <span className={`min-w-0 flex-1 break-words text-sm ${subtask.status === 'Completed' ? 'text-[#8c9695] line-through' : 'text-[#526166]'}`}>{subtask.title}</span>
                          <span className={`inline-flex items-center gap-1 text-xs ${isOverdue(subtask, now) ? 'font-semibold text-rose-600' : 'text-[#879397]'}`}><Clock3 size={13} />{isOverdue(subtask, now) ? `Overdue · ${formatDue(subtask)}` : formatDue(subtask)}</span>
                          {subtask.alarm && <span title="Alarm enabled" className="text-[#819580]"><Bell size={14} /></span>}
                          {subtask.alarm && <button type="button" onClick={() => snooze(task.id, subtask.id)} className="rounded-md px-2 py-1 text-[11px] font-medium text-[#657c71] hover:bg-[#eaf0ea]">Snooze</button>}
                          <button type="button" aria-label={`Edit ${subtask.title}`} onClick={() => setSubtaskForm({ taskId: task.id, subtaskId: subtask.id, title: subtask.title, dueDate: subtask.dueDate, dueTime: subtask.dueTime, alarm: subtask.alarm })} className="rounded-md p-1.5 text-[#7d898a] hover:bg-[#edf2ed]"><Pencil size={14} /></button>
                          <button type="button" aria-label={`Delete ${subtask.title}`} onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, subtasks: item.subtasks.filter((child) => child.id !== subtask.id) } : item))} className="rounded-md p-1.5 text-[#9a7270] hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14} /></button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {subtaskForm?.taskId === task.id ? (
                    <form onSubmit={saveSubtask} className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-[#f5f7f4] p-3 sm:grid-cols-2 lg:grid-cols-5">
                      <label className="text-xs font-medium text-[#59686b] sm:col-span-2 lg:col-span-2">
                        Sub-task
                        <input autoFocus required value={subtaskForm.title} onChange={(event) => setSubtaskForm({ ...subtaskForm, title: event.target.value })} placeholder="What is the next step?" className="mt-1 w-full rounded-lg border border-[#dce2dd] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#779781]" />
                      </label>
                      <label className="text-xs font-medium text-[#59686b]">
                        Due date
                        <input type="date" value={subtaskForm.dueDate} onChange={(event) => setSubtaskForm({ ...subtaskForm, dueDate: event.target.value })} className="mt-1 w-full rounded-lg border border-[#dce2dd] bg-white px-2 py-2.5 text-sm outline-none focus:border-[#779781]" />
                      </label>
                      <label className="text-xs font-medium text-[#59686b]">
                        Due time
                        <input type="time" value={subtaskForm.dueTime} onChange={(event) => setSubtaskForm({ ...subtaskForm, dueTime: event.target.value })} className="mt-1 w-full rounded-lg border border-[#dce2dd] bg-white px-2 py-2.5 text-sm outline-none focus:border-[#779781]" />
                      </label>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex items-center gap-1.5 pb-2 text-xs text-[#59686b]"><input type="checkbox" checked={subtaskForm.alarm} onChange={(event) => setSubtaskForm({ ...subtaskForm, alarm: event.target.checked })} className="size-4 accent-[#56765f]" /> Alarm</label>
                        <button type="submit" className="rounded-lg bg-[#35564e] px-3 py-2 text-xs font-semibold text-white hover:bg-[#29463f]">Save</button>
                        <button type="button" onClick={() => setSubtaskForm(null)} aria-label="Cancel sub-task edit" className="rounded-lg p-2 text-[#778486] hover:bg-white"><X size={15} /></button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setSubtaskForm({ taskId: task.id, subtaskId: null, title: '', dueDate: '', dueTime: '', alarm: false })} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#557361] transition hover:bg-[#eff4f0]">
                      <Plus size={14} /> Add sub-task
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-6 space-y-2 text-center text-xs leading-5 text-[#849092]">
          <p>Tasks are saved in this browser only. They are not synced to Supabase or shared with other devices.</p>
          <p>Browser reminders and alarm sounds work only while this page is open. Notification permission is optional.</p>
          {notificationPermission === 'granted' && <p className="inline-flex items-center justify-center gap-1.5"><Volume2 size={13} /> Browser notifications enabled</p>}
        </footer>
      </div>
    </main>
  );
}
