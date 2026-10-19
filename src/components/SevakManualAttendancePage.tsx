import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, CalendarDays, Check, CircleCheck, CircleX, Search, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '../supabase';
import { resolveSevakProfilePhotoUrl } from '../utils/sevakProfilePhoto.mjs';
import SevakLayout from './SevakLayout';

const PROFILE_COLUMNS = 'id, sevak_id, name, mobile, profile_picture, department, department_id, status, approval_status';
const PAGE_SIZE = 500;

const ATTENDANCE_SESSIONS = [
  { type: 'MORNING_SADHANA', label: 'Morning Sadhana', short: 'Morning' },
  { type: 'SEVA', label: 'Seva', short: 'Seva' },
  { type: 'SATSANG', label: 'Night Satsang', short: 'Satsang' },
] as const;

type AttendanceType = typeof ATTENDANCE_SESSIONS[number]['type'];
type AttendanceStatus = 'PRESENT' | 'ABSENT';

interface SevakProfile {
  id: string;
  sevak_id: string;
  name: string;
  mobile: string;
  profile_picture: string | null;
  department: string;
  department_id: string;
  status: string;
  approval_status: 'pending' | 'approved' | 'rejected';
}

interface AttendanceRecord {
  id: string;
  sevak_id: string;
  attendance_date: string;
  attendance_type: AttendanceType;
  department: string | null;
  status: string;
  check_in_time: string | null;
}

function todayInIndia() {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => values.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function loadProfiles() {
  const firstPage = await supabase.from('sevak_profiles')
    .select(PROFILE_COLUMNS, { count: 'exact' })
    .order('sevak_id')
    .range(0, PAGE_SIZE - 1);
  if (firstPage.error) return { data: null, error: firstPage.error };

  const total = firstPage.count ?? firstPage.data.length;
  if (total <= PAGE_SIZE) return { data: firstPage.data as SevakProfile[], error: null };

  const otherPages = await Promise.all(Array.from(
    { length: Math.ceil((total - PAGE_SIZE) / PAGE_SIZE) },
    (_, index) => {
      const start = (index + 1) * PAGE_SIZE;
      return supabase.from('sevak_profiles')
        .select(PROFILE_COLUMNS)
        .order('sevak_id')
        .range(start, start + PAGE_SIZE - 1);
    },
  ));
  const failedPage = otherPages.find((page) => page.error);
  if (failedPage?.error) return { data: null, error: failedPage.error };
  return { data: [...firstPage.data, ...otherPages.flatMap((page) => page.data ?? [])] as SevakProfile[], error: null };
}

function safeErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === '23505') return 'Attendance already exists for this Sevak, date, and session.';
  return error.message || 'Supabase could not complete the attendance request.';
}

export default function SevakManualAttendancePage({ shellSession }: { shellSession: Session }) {
  const [session, setSession] = useState<Session | null>(shellSession);
  const [profiles, setProfiles] = useState<SevakProfile[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leaderDepartmentIds, setLeaderDepartmentIds] = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [search, setSearch] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(todayInIndia);
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('MORNING_SADHANA');
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>('PRESENT');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | AttendanceStatus>('ALL');
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const activeProfiles = useMemo(() => profiles.filter((profile) => (
    profile.approval_status === 'approved' && profile.status.toLowerCase() === 'active'
  )), [profiles]);
  const matchingProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeProfiles;
    return activeProfiles.filter((profile) => (
      [profile.name, profile.mobile, profile.sevak_id].some((value) => value.toLowerCase().includes(query))
    ));
  }, [activeProfiles, search]);

  const existingRecord = useMemo(() => {
    if (!selectedProfile) return null;
    return records.find((record) => (
      record.sevak_id === selectedProfile.id
      && record.attendance_type === attendanceType
      && (attendanceType !== 'SEVA' || record.department === selectedProfile.department)
    )) ?? null;
  }, [attendanceType, records, selectedProfile]);

  const sessionRecords = records.filter((record) => record.attendance_type === attendanceType);
  const filteredSessionRecords = sessionRecords.filter((record) => (
    historyStatusFilter === 'ALL' || record.status.toUpperCase() === historyStatusFilter
  ));
  const presentCount = sessionRecords.filter((record) => record.status.toUpperCase() === 'PRESENT').length;
  const absentCount = sessionRecords.filter((record) => record.status.toUpperCase() === 'ABSENT').length;

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(error ? null : data.session);
      if (error) setLoadError(error.message);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session) {
      setProfiles([]);
      setLoadingProfiles(false);
      setLoadError('Sign in with an authenticated Sevak management account to record attendance.');
      return () => { active = false; };
    }

    setLoadingProfiles(true);
    setLoadError('');
    Promise.all([
      supabase.rpc('has_sevak_admin_role'),
      supabase.from('sevak_role_assignments').select('department_id')
        .eq('user_id', session.user.id).eq('role', 'group_leader'),
      loadProfiles(),
    ]).then(([adminResult, rolesResult, profileResult]) => {
      if (!active) return;
      if (adminResult.error) {
        setLoadError(`Unable to verify the trusted Sevak role: ${safeErrorMessage(adminResult.error)}. Apply the existing Sevak management migration if the role function is missing.`);
        setProfiles([]);
        setLoadingProfiles(false);
        return;
      }
      if (rolesResult.error) {
        setLoadError(`Unable to load Group Leader scope: ${safeErrorMessage(rolesResult.error)}`);
        setProfiles([]);
        setLoadingProfiles(false);
        return;
      }
      if (profileResult.error) {
        setLoadError(`Unable to load Sevak profiles under the current Row Level Security scope: ${safeErrorMessage(profileResult.error)}`);
        setProfiles([]);
        setLoadingProfiles(false);
        return;
      }

      const admin = Boolean(adminResult.data);
      const leaderIds = (rolesResult.data ?? []).map((row) => row.department_id).filter(Boolean) as string[];
      setIsAdmin(admin);
      setLeaderDepartmentIds(leaderIds);
      setProfiles(profileResult.data ?? []);
      setLoadingProfiles(false);
      if (!admin && leaderIds.length === 0) {
        setLoadError('This account has no Sevak Administrator or Group Leader role. Profile visibility and attendance access are enforced by Supabase Row Level Security.');
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : 'Unable to load Sevak profiles.');
      setProfiles([]);
      setLoadingProfiles(false);
    });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    let active = true;
    if (!session) {
      setRecords([]);
      setLoadingRecords(false);
      return () => { active = false; };
    }

    setLoadingRecords(true);
    supabase.from('sevak_attendance')
      .select('id, sevak_id, attendance_date, attendance_type, department, status, check_in_time')
      .eq('attendance_date', attendanceDate)
      .eq('attendance_type', attendanceType)
      .order('created_at', { ascending: false })
      .range(0, 999)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setRecords([]);
          setLoadError((current) => current || `Unable to check for existing attendance: ${safeErrorMessage(error)}`);
        } else {
          setRecords((data ?? []) as AttendanceRecord[]);
        }
        setLoadingRecords(false);
      });
    return () => { active = false; };
  }, [attendanceDate, attendanceType, refreshKey, session]);

  useEffect(() => {
    let active = true;
    setPhotoUrl('');
    setPhotoError('');
    if (!selectedProfile?.profile_picture || !session) {
      setPhotoLoading(false);
      return () => { active = false; };
    }

    setPhotoLoading(true);
    resolveSevakProfilePhotoUrl(supabase.storage, selectedProfile.profile_picture)
      .then((url) => {
        if (!active) return;
        setPhotoUrl(url);
        setPhotoLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPhotoError(error instanceof Error ? error.message : 'Could not load the private profile photo.');
        setPhotoLoading(false);
      });
    return () => { active = false; };
  }, [selectedProfile?.id, selectedProfile?.profile_picture, session]);

  const clearSelectionForNext = () => {
    setSelectedProfileId('');
    setSearch('');
    setActionError('');
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const saveAndNext = async () => {
    if (!session) {
      setActionError('Sign in with an authenticated Sevak management account before saving attendance.');
      return;
    }
    if (!selectedProfile || selectedProfile.approval_status !== 'approved' || selectedProfile.status.toLowerCase() !== 'active') {
      setActionError('Select an approved, active Sevak profile before saving attendance.');
      return;
    }
    if (existingRecord) {
      setActionError('Attendance already exists for this Sevak, date, and session. The existing record was left unchanged.');
      return;
    }

    setSaving(true);
    setActionError('');
    setMessage('');
    const selected = selectedProfile;
    const { error } = await supabase.from('sevak_attendance').insert({
      sevak_id: selected.id,
      attendance_date: attendanceDate,
      attendance_type: attendanceType,
      department: attendanceType === 'SEVA' ? selected.department : null,
      status: attendanceStatus,
    });
    setSaving(false);
    if (error) {
      setActionError(error.code === '23505'
        ? 'Attendance was already recorded by another request. The existing record was left unchanged.'
        : `Attendance could not be saved: ${safeErrorMessage(error)}`);
      if (error.code === '23505') setRefreshKey((key) => key + 1);
      return;
    }

    setMessage(`${attendanceStatus} recorded for ${selected.name}. The database assigned the check-in time; select the next Sevak to continue.`);
    setRefreshKey((key) => key + 1);
    clearSelectionForNext();
  };

  return (
    <SevakLayout session={shellSession} pathname="/sevak-attendance/manual">
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <a href="/sevak-attendance" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#485a61] hover:border-[#cbb782] hover:text-[#78591d]">
            <ArrowLeft size={16} aria-hidden="true" /> Attendance dashboard
          </a>

          <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a57d31]">Sevak Attendance System</p>
              <h1 id="attendance-heading" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Manual Attendance</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66777d]">Verify the Sevak profile, choose the session, and record one attendance entry. Your trusted role and Supabase Row Level Security determine which profiles and records are available.</p>
            </div>
            {!loadingProfiles && session && <p className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#66777d]">
              {isAdmin ? 'Administrator access' : leaderDepartmentIds.length ? `Group Leader · ${leaderDepartmentIds.length} department scope${leaderDepartmentIds.length === 1 ? '' : 's'}` : 'No management role'}
            </p>}
          </header>

          {loadError && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError}</p>}
          {message && <p role="status" className="mt-5 rounded-xl border border-emerald-700/20 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
          {actionError && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}

          <section className="mt-7 grid min-w-0 gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]" aria-label="Manual attendance entry">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f8f2e4] text-[#a57d31]"><Search size={19} aria-hidden="true" /></span>
                <div>
                  <h2 className="text-lg font-semibold">Find a Sevak</h2>
                  <p className="mt-1 text-xs text-[#768187]">Search by name, mobile number, or Sevak ID.</p>
                </div>
              </div>

              <label className="mt-5 block text-xs font-medium text-[#66777d]" htmlFor="manual-attendance-search">Search Sevaks</label>
              <input
                id="manual-attendance-search"
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. name, 98765…, SELF-…"
                autoComplete="off"
                className="mt-1 block min-h-11 w-full rounded-lg border border-[#d8d0bd] bg-white px-3 py-2 text-sm text-[#263238] outline-none focus:border-[#bd8d36] focus:ring-2 focus:ring-[#bd8d36]/20"
              />

              <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto" aria-live="polite">
                {loadingProfiles ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-[#66777d]">Loading profiles allowed for this account…</p>
                  : matchingProfiles.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-[#66777d]">{search.trim() ? 'No approved active Sevaks match that search.' : 'No approved active Sevaks are visible for this account.'}</p>
                    : matchingProfiles.slice(0, 12).map((profile) => {
                      const selected = profile.id === selectedProfileId;
                      const alreadyRecorded = records.some((record) => record.sevak_id === profile.id
                        && (attendanceType !== 'SEVA' || record.department === profile.department));
                      return <button
                        key={profile.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => { setSelectedProfileId(profile.id); setActionError(''); setMessage(''); }}
                        className={`flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd8d36] ${selected ? 'border-[#bd8d36] bg-[#fbf7ec]' : 'border-slate-200 bg-white hover:border-[#cbb782] hover:bg-slate-50'}`}
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-[#8d6b28]">
                          {profile.profile_picture ? <UserRound size={20} aria-hidden="true" /> : <UserRound size={20} aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#344b51]">{profile.name}</span>
                          <span className="mt-1 block truncate text-xs text-[#768187]">{profile.mobile} · {profile.sevak_id}</span>
                        </span>
                        {alreadyRecorded && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Recorded</span>}
                        {selected && <Check size={17} className="shrink-0 text-[#a57d31]" aria-hidden="true" />}
                      </button>;
                    })}
                {matchingProfiles.length > 12 && <p className="px-2 py-1 text-xs text-[#768187]">Showing 12 of {matchingProfiles.length} matches. Refine your search to find another Sevak.</p>}
              </div>
            </div>

            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="attendance-details-heading">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f8f2e4] text-[#a57d31]"><CalendarDays size={19} aria-hidden="true" /></span>
                  <div>
                    <h2 id="attendance-details-heading" className="text-lg font-semibold">Attendance details</h2>
                    <p className="mt-1 text-xs text-[#768187]">Choose the date and session before recording.</p>
                  </div>
                </div>

                <label className="mt-5 block text-xs font-medium text-[#66777d]" htmlFor="manual-attendance-date">Attendance date</label>
                <input id="manual-attendance-date" type="date" value={attendanceDate} onChange={(event) => { setAttendanceDate(event.target.value); setSelectedProfileId(''); }} className="mt-1 min-h-11 w-full rounded-lg border border-[#d8d0bd] bg-white px-3 py-2 text-sm text-[#263238] focus:border-[#bd8d36] focus:outline-none focus:ring-2 focus:ring-[#bd8d36]/20" />

                <p className="mt-4 text-xs font-medium text-[#66777d]">Session</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {ATTENDANCE_SESSIONS.map((item) => <button key={item.type} type="button" aria-pressed={attendanceType === item.type} onClick={() => { setAttendanceType(item.type); setSelectedProfileId(''); }} className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd8d36] ${attendanceType === item.type ? 'border-[#bd8d36] bg-[#fbf7ec] text-[#78591d]' : 'border-slate-200 bg-white text-[#485a61] hover:border-[#cbb782]'}`}>{item.label}</button>)}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-800">Present</p><p className="mt-1 text-2xl font-semibold text-emerald-900">{loadingRecords ? '…' : presentCount}</p></div>
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-3"><p className="text-xs text-orange-800">Absent</p><p className="mt-1 text-2xl font-semibold text-orange-900">{loadingRecords ? '…' : absentCount}</p></div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="verify-profile-heading">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a57d31]">Identity check</p>
                    <h2 id="verify-profile-heading" className="mt-1 text-lg font-semibold">Verify profile</h2>
                  </div>
                  <ShieldCheck size={21} className="text-[#a57d31]" aria-hidden="true" />
                </div>

                {!selectedProfile ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-[#768187]">Select a Sevak to review their profile photo and details.</p> : <>
                  <div className="mt-4 flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-[#8d6b28]">
                      {photoUrl ? <img src={photoUrl} alt={`${selectedProfile.name} profile photo`} className="h-full w-full object-cover" /> : <UserRound size={28} aria-hidden="true" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#344b51]">{selectedProfile.name}</p>
                      <p className="mt-1 text-xs text-[#66777d]">{selectedProfile.sevak_id}</p>
                      <p className="mt-1 text-xs text-[#66777d]">{selectedProfile.mobile}</p>
                      <p className="mt-1 text-xs text-[#66777d]">{selectedProfile.department}</p>
                    </div>
                  </div>
                  <p role={photoError ? 'alert' : 'status'} className="mt-2 text-xs text-[#768187]">
                    {photoLoading ? 'Loading private profile photo…' : photoError ? `Photo could not be loaded: ${photoError}` : photoUrl ? 'Confirm the photo matches the Sevak before recording.' : 'No profile photo is saved for this Sevak.'}
                  </p>
                </>}

                <p className="mt-5 text-xs font-medium text-[#66777d]">Attendance status</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={attendanceStatus === 'PRESENT'} onClick={() => setAttendanceStatus('PRESENT')} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd8d36] ${attendanceStatus === 'PRESENT' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400'}`}><CircleCheck size={17} aria-hidden="true" /> PRESENT</button>
                  <button type="button" aria-pressed={attendanceStatus === 'ABSENT'} onClick={() => setAttendanceStatus('ABSENT')} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd8d36] ${attendanceStatus === 'ABSENT' ? 'border-orange-600 bg-orange-600 text-white' : 'border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-400'}`}><CircleX size={17} aria-hidden="true" /> ABSENT</button>
                </div>

                {attendanceType === 'SEVA' && selectedProfile && <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-[#66777d]">Seva department: <strong className="text-[#344b51]">{selectedProfile.department}</strong></p>}
                {existingRecord && <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Already recorded as <strong>{existingRecord.status}</strong>{existingRecord.check_in_time ? ` · Check-in ${new Date(existingRecord.check_in_time).toLocaleString()}` : ''}. This record cannot be overwritten here.
                </div>}
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#768187]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#a57d31]" aria-hidden="true" /> Present check-in time is set by the database when the record is inserted. An absent record has no check-in time.</p>
                <button type="button" onClick={() => void saveAndNext()} disabled={!selectedProfile || saving || loadingProfiles || loadingRecords || Boolean(existingRecord) || Boolean(loadError) || !session} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#bd8d36] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a77825] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78591d] disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? 'Saving attendance…' : 'Record attendance & next Sevak'} <ArrowLeft size={16} className="rotate-180" aria-hidden="true" />
                </button>
              </section>
            </div>
          </section>

          <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="recorded-attendance-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <h2 id="recorded-attendance-heading" className="font-semibold">Recorded {ATTENDANCE_SESSIONS.find((item) => item.type === attendanceType)?.short} attendance</h2>
                <p className="mt-1 text-xs text-[#768187]">{attendanceDate} · {loadingRecords ? 'Loading…' : `${filteredSessionRecords.length} record${filteredSessionRecords.length === 1 ? '' : 's'}`}</p>
              </div>
              <label className="text-xs text-[#66777d]">Filter status
                <select value={historyStatusFilter} onChange={(event) => setHistoryStatusFilter(event.target.value as 'ALL' | AttendanceStatus)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]">
                  <option value="ALL">All</option><option value="PRESENT">PRESENT</option><option value="ABSENT">ABSENT</option>
                </select>
              </label>
              {loadingRecords && <span className="text-xs text-[#768187]">Loading records…</span>}
            </div>
            {!loadingRecords && filteredSessionRecords.length === 0 ? <p className="px-5 py-6 text-sm text-[#768187]">No attendance records match this session, date, and status filter.</p> : <div className="divide-y divide-[#f0ece3]">
              {filteredSessionRecords.map((record) => {
                const profile = profiles.find((item) => item.id === record.sevak_id);
                return <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-[#344b51]">{profile?.name ?? 'Sevak profile hidden by current RLS scope'}</p><p className="mt-1 text-xs text-[#768187]">{profile?.sevak_id ?? record.sevak_id}{record.department ? ` · ${record.department}` : ''}</p></div>
                  <div className="text-right"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${record.status.toUpperCase() === 'PRESENT' ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800'}`}>{record.status.toUpperCase()}</span><p className="mt-1 text-[10px] text-[#768187]">{record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : 'No check-in time'}</p></div>
                </div>;
              })}
            </div>}
          </section>
        </div>
      </main>
    </SevakLayout>
  );
}
