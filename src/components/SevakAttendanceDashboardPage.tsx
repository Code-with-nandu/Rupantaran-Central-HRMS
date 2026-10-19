import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Activity, ArrowLeft, UserCheck, UserX, Users } from 'lucide-react';
import { supabase } from '../supabase';
import SevakLayout from './SevakLayout';

type Period = 'daily' | 'last3days' | 'weekly' | 'monthly' | 'last3months' | 'custom';

interface Profile {
  id: string;
  sevak_id: string;
  name: string;
  department_id: string | null;
  department: string | null;
  status: string;
  approval_status: string;
}

interface AttendanceRecord {
  id: string;
  sevak_id: string;
  attendance_date: string;
  attendance_type: string;
  department_id: string | null;
  department: string | null;
  status: string;
}

function todayIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayOffset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateRange(period: Period, today: string, from: string, to: string) {
  if (period === 'daily') return { start: today, end: today };
  if (period === 'last3days') return { start: dayOffset(today, -2), end: today };
  if (period === 'weekly') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { start: dayOffset(today, -((weekday + 6) % 7)), end: today };
  }
  if (period === 'last3months') {
    const date = new Date(`${today}T00:00:00Z`);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 3);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    return { start: date.toISOString().slice(0, 10), end: today };
  }
  if (period === 'custom') {
    const end = to && to < today ? to : today;
    const requestedStart = from && from <= today ? from : today;
    return { start: requestedStart > end ? end : requestedStart, end };
  }
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function dateLabel(start: string, end: string) {
  const format = (date: string) => new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
}

export default function SevakAttendanceDashboardPage({ session, workspace = false }: { session: Session; workspace?: boolean }) {
  const today = todayIndia();
  const [period, setPeriod] = useState<Period>('monthly');
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [error, setError] = useState('');
  const { start, end } = dateRange(period, today, customFrom, customTo);
  const rangeText = dateLabel(start, end);

  useEffect(() => {
    let active = true;
    void supabase.from('sevak_profiles')
      .select('id, sevak_id, name, department_id, department, status, approval_status')
      .order('name')
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else setProfiles((data ?? []) as Profile[]);
        setLoadingProfiles(false);
      });
    return () => { active = false; };
  }, [session.user.id]);

  useEffect(() => {
    let active = true;
    setLoadingAttendance(true);
    const rangeQuery = supabase.from('sevak_attendance')
      .select('id, sevak_id, attendance_date, attendance_type, department_id, department, status')
      .gte('attendance_date', start).lte('attendance_date', end).order('attendance_date');
    void Promise.resolve(rangeQuery).then((rangeResult) => {
      if (!active) return;
      if (rangeResult.error) {
        setRecords([]);
        setError(rangeResult.error.message);
      } else {
        setRecords((rangeResult.data ?? []) as AttendanceRecord[]);
      }
      setLoadingAttendance(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Attendance report could not be loaded.');
      setRecords([]);
      setLoadingAttendance(false);
    });
    return () => { active = false; };
  }, [session.user.id, start, end, today]);

  const departments = useMemo(() => [...new Map(profiles
    .filter((profile) => profile.department_id)
    .map((profile) => [profile.department_id as string, { id: profile.department_id as string, name: profile.department || 'Department' }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name)), [profiles]);
  const activeProfiles = profiles.filter((profile) => profile.approval_status === 'approved' && profile.status.toLowerCase() === 'active');
  const matchesProfile = (id: string) => {
    const profile = profiles.find((entry) => entry.id === id);
    return (!search.trim() || (profile?.name.toLowerCase().includes(search.trim().toLowerCase()) ?? false))
      && (departmentFilter === 'ALL' || profile?.department_id === departmentFilter);
  };
  const reportRecords = records.filter((record) => matchesProfile(record.sevak_id)
    && (departmentFilter === 'ALL' || record.department_id === departmentFilter));
  const visibleProfiles = activeProfiles.filter((profile) => matchesProfile(profile.id));
  const distinctCount = (rows: AttendanceRecord[], status: string) => new Set(rows
    .filter((record) => record.status.toUpperCase() === status).map((record) => record.sevak_id)).size;
  const presentCount = distinctCount(reportRecords, 'PRESENT');
  const absentCount = distinctCount(reportRecords, 'ABSENT');
  const recordedStatuses = reportRecords.filter((record) => ['PRESENT', 'ABSENT'].includes(record.status.toUpperCase()));
  const attendancePercentage = recordedStatuses.length
    ? Math.round(recordedStatuses.filter((record) => record.status.toUpperCase() === 'PRESENT').length / recordedStatuses.length * 100)
    : 0;
  const typeTotals = ['MORNING_SADHANA', 'SEVA', 'SATSANG'].map((type) => ({
    type,
    total: reportRecords.filter((record) => record.attendance_type.toUpperCase() === type).length,
    present: reportRecords.filter((record) => record.attendance_type.toUpperCase() === type && record.status.toUpperCase() === 'PRESENT').length,
    absent: reportRecords.filter((record) => record.attendance_type.toUpperCase() === type && record.status.toUpperCase() === 'ABSENT').length,
  }));
  const exportReport = () => {
    const rows = [['Date', 'Sevak', 'Department', 'Attendance Type', 'Status'], ...reportRecords.map((record) => [record.attendance_date, profiles.find((profile) => profile.id === record.sevak_id)?.name ?? record.sevak_id, record.department ?? '', record.attendance_type, record.status])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `attendance-${start}-to-${end}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const dailyTrend = useMemo(() => {
    const grouped = new Map<string, { present: number; absent: number }>();
    reportRecords.forEach((record) => {
      const values = grouped.get(record.attendance_date) ?? { present: 0, absent: 0 };
      if (record.status.toUpperCase() === 'PRESENT') values.present += 1;
      if (record.status.toUpperCase() === 'ABSENT') values.absent += 1;
      grouped.set(record.attendance_date, values);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values }));
  }, [records, search, departmentFilter, profiles]);
  const maxTrend = Math.max(1, ...dailyTrend.flatMap((day) => [day.present, day.absent]));
  const trendPoint = (index: number, value: number) => `${dailyTrend.length < 2 ? 360 : 38 + (index * 644) / (dailyTrend.length - 1)},${166 - (value / maxTrend) * 135}`;

  const departmentTotals = departments.filter((department) => departmentFilter === 'ALL' || department.id === departmentFilter).map((department) => {
    const rows = reportRecords.filter((record) => record.department_id === department.id);
    return { ...department, present: rows.filter((record) => record.status.toUpperCase() === 'PRESENT').length, absent: rows.filter((record) => record.status.toUpperCase() === 'ABSENT').length, total: rows.length };
  });
  const maxDepartment = Math.max(1, ...departmentTotals.map((department) => department.total));
  const leaderboard = [...new Set(reportRecords.map((record) => record.sevak_id))].map((id) => {
    const profile = profiles.find((entry) => entry.id === id);
    const rows = reportRecords.filter((record) => record.sevak_id === id);
    const present = rows.filter((record) => record.status.toUpperCase() === 'PRESENT').length;
    const absent = rows.filter((record) => record.status.toUpperCase() === 'ABSENT').length;
    return { id, name: profile?.name ?? id, department: profile?.department ?? 'Department unavailable', present, absent, rate: present + absent ? present / (present + absent) : -1 };
  }).filter((person) => person.rate >= 0).sort((a, b) => b.rate - a.rate || b.present - a.present || a.name.localeCompare(b.name)).slice(0, 6);
  const weekdayAbsences = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => ({
    day,
    count: reportRecords.filter((record) => record.status.toUpperCase() === 'ABSENT'
      && ((new Date(`${record.attendance_date}T00:00:00Z`).getUTCDay() + 6) % 7) === index).length,
  }));
  const maxAbsences = Math.max(1, ...weekdayAbsences.map((day) => day.count));

  return (
    <SevakLayout session={session} pathname={workspace ? '/sevak-attendance/reports' : '/sevak-dashboard/attendance'}>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <a href={workspace ? '/sevak-attendance' : '/sevak-dashboard'} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-800"><ArrowLeft size={14} /> {workspace ? 'Attendance workspace' : 'Sevak home'}</a>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Attendance reports</p>
              <h1 id="monthly-attendance-heading" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Attendance Dashboard</h1>
              <p className="mt-2 text-sm text-slate-500">Authorized attendance summary and trends.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600">Reporting period<select aria-label="Reporting period" value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="mt-1 block min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="daily">Daily</option><option value="last3days">Last 3 Days</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="last3months">Last 3 Months</option><option value="custom">Custom Range</option></select></label>
              {period === 'custom' && <><label className="text-xs text-slate-600">From<input aria-label="Custom range start" type="date" max={today} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm" /></label><label className="text-xs text-slate-600">To<input aria-label="Custom range end" type="date" max={today} value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm" /></label></>}
              <label className="text-xs text-slate-600">Department<select aria-label="Department filter" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="ALL">All in my scope</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label className="text-xs text-slate-600">Search Sevak<input aria-label="Search by Sevak name" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name" className="mt-1 block min-h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><span className="font-semibold text-emerald-800">{rangeText}</span><span className="text-xs text-slate-500">Records follow your signed-in account's Supabase permissions.</span><div className="flex gap-2"><a href="/sevak-attendance/manual" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Manual attendance</a><button type="button" onClick={exportReport} disabled={loadingAttendance} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Export report</button></div></div>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <section aria-label="Attendance summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<Users size={18}/>} label="Total Sevaks" value={loadingProfiles ? '…' : visibleProfiles.length.toLocaleString('en-IN')} note="Approved active profiles in your scope" />
            <Metric icon={<UserCheck size={18}/>} label="Present" value={loadingAttendance ? '…' : presentCount.toLocaleString('en-IN')} note="Distinct Sevaks with present records" tone="green" />
            <Metric icon={<UserX size={18}/>} label="Absent" value={loadingAttendance ? '…' : absentCount.toLocaleString('en-IN')} note="Recorded absences only" tone="red" />
            <Metric icon={<Activity size={18}/>} label="Attendance Percentage" value={loadingAttendance ? '…' : `${attendancePercentage}%`} note="Present of recorded present or absent sessions" tone="green" />
          </section>

          <section className="grid min-w-0 gap-4 [&>*]:min-w-0 lg:grid-cols-2" aria-label="Attendance analytics">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Attendance trend</h2><p className="mt-1 text-xs text-slate-500">Daily records · {rangeText}</p></div><Activity size={18} className="text-emerald-700" /></div>{loadingAttendance ? <p className="mt-5 text-sm text-slate-500">Loading attendance…</p> : dailyTrend.length ? <div className="mt-4 overflow-x-auto"><svg role="img" aria-label="Daily recorded present and absent attendance" viewBox="0 0 720 205" className="h-48 min-w-[480px] w-full"><title>Attendance trend</title><line x1="38" y1="166" x2="682" y2="166" stroke="#cbd5e1"/><line x1="38" y1="98" x2="682" y2="98" stroke="#e2e8f0"/><line x1="38" y1="31" x2="682" y2="31" stroke="#e2e8f0"/><polyline fill="none" stroke="#10b981" strokeWidth="3" points={dailyTrend.map((day,index)=>trendPoint(index,day.present)).join(' ')}/><polyline fill="none" stroke="#f87171" strokeWidth="3" points={dailyTrend.map((day,index)=>trendPoint(index,day.absent)).join(' ')}/>{dailyTrend.map((day,index)=><g key={day.date}><circle cx={trendPoint(index,day.present).split(',')[0]} cy={trendPoint(index,day.present).split(',')[1]} r="3" fill="#10b981"><title>{day.date}: {day.present} present</title></circle><circle cx={trendPoint(index,day.absent).split(',')[0]} cy={trendPoint(index,day.absent).split(',')[1]} r="3" fill="#f87171"><title>{day.date}: {day.absent} absent</title></circle>{(index===0||index===dailyTrend.length-1||index%Math.max(1,Math.ceil(dailyTrend.length/7))===0)&&<text x={trendPoint(index,0).split(',')[0]} y="192" textAnchor="middle" fontSize="10" fill="#64748b">{day.date.slice(5)}</text>}</g>)}</svg></div> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No attendance records in this period. Missing records are not shown as absences.</p>}<div className="mt-3 flex gap-4 text-xs text-slate-500"><span className="text-emerald-700">● Present records</span><span className="text-rose-600">● Absent records</span></div></article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Attendance by department</h2><p className="mt-1 text-xs text-slate-500">Recorded present and absent sessions · {rangeText}</p>{departmentTotals.length ? <div className="mt-5 space-y-3">{departmentTotals.map((department)=><div key={department.id} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs"><span className="truncate text-slate-600">{department.name}</span><div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label={`${department.name}: ${department.present} present and ${department.absent} absent`}><span className="bg-emerald-500" style={{width:`${department.present/maxDepartment*100}%`}}/><span className="bg-rose-400" style={{width:`${department.absent/maxDepartment*100}%`}}/></div><span className="text-right text-slate-500">P {department.present} · A {department.absent}</span></div>)}</div> : <p className="mt-5 text-sm text-slate-500">No department totals are available for this period.</p>}</article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Attendance type summary</h2><p className="mt-1 text-xs text-slate-500">Recorded sessions within {rangeText}</p><div className="mt-4 space-y-3">{typeTotals.map((item)=><div key={item.type} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="font-medium text-slate-700">{item.type.replaceAll('_', ' ')}</span><span className="text-right text-slate-500">{item.total} total · {item.present} present · {item.absent} absent</span></div>)}</div></article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Top 6 attendance performers</h2><p className="mt-1 text-xs text-slate-500">Rate among recorded present or absent sessions. Missing records are excluded.</p>{leaderboard.length ? <ol className="mt-4 space-y-2">{leaderboard.map((person,index)=><li key={person.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">{person.name.trim().split(/\s+/).map((part)=>part[0]).join('').slice(0,2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{index+1}. {person.name}</span><span className="block truncate text-xs text-slate-500">{person.department} · {person.present} present</span></span><span className="text-sm font-semibold text-emerald-800">{Math.round(person.rate*100)}%</span></li>)}</ol> : <p className="mt-4 text-sm text-slate-500">Not enough recorded attendance to rank performers.</p>}</article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"><h2 className="font-semibold">Weekly absence trend</h2><p className="mt-1 text-xs text-slate-500">Total absent records by weekday within the selected period</p><div className="mt-5 grid grid-cols-7 items-end gap-2 sm:gap-4">{weekdayAbsences.map((item)=><div key={item.day} className="flex flex-col items-center gap-2"><span className="text-[10px] text-slate-600">{item.count}</span><div className="flex h-24 w-full items-end rounded bg-slate-50"><span className="w-full rounded-t bg-rose-400" style={{height:`${item.count/maxAbsences*100}%`,minHeight:item.count?'4px':0}}/></div><span className="text-[10px] text-slate-500">{item.day.slice(0,3)}</span></div>)}</div></article>
          </section>
        </div>
      </main>
    </SevakLayout>
  );
}

function Metric({ icon, label, value, note, tone = 'slate' }: { icon: React.ReactNode; label: string; value: string; note: string; tone?: 'slate' | 'green' | 'red' | 'amber' }) {
  const colors = { slate: 'text-slate-700', green: 'text-emerald-700', red: 'text-rose-700', amber: 'text-amber-700' };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">{label}</span><span className={colors[tone]} aria-hidden="true">{icon}</span></div><p className={`mt-3 text-2xl font-semibold ${colors[tone]}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></article>;
}
