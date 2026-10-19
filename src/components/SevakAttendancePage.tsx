import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import SevakLayout from './SevakLayout';
import { isLegacySamplePhotoPath, resolveSevakProfilePhotoUrl } from '../utils/sevakProfilePhoto.mjs';

// Temporary local portraits for the five test rows only. These do not update
// `profile_picture` or replace profile data stored in Supabase.
const SAMPLE_PROFILE_IMAGES: Record<string, string> = {
  'TEST-SEVAK-001': '/sample-sevak/rahul.jpg',
  'TEST-SEVAK-002': '/sample-sevak/amit.png',
  'TEST-SEVAK-003': '/sample-sevak/priya.jpg',
  'TEST-SEVAK-004': '/sample-sevak/suman.jpg',
  'TEST-SEVAK-005': '/sample-sevak/anil.png',
};

const sessions = [
  {
    type: 'MORNING_SADHANA',
    title: '🌅 Morning Sadhana',
    description: 'Record attendance for the morning sadhana session.',
    accent: 'from-orange-400/15 to-amber-400/5',
  },
  {
    type: 'SEVA',
    title: '🛠️ Seva — Department-wise',
    description: 'Department-wise attendance for seva activities.',
    accent: 'from-cyan-400/15 to-blue-400/5',
  },
  {
    type: 'SATSANG',
    title: '🎶 Night Satsang',
    description: 'Record attendance for satsang.',
    accent: 'from-violet-400/15 to-fuchsia-400/5',
  },
] as const;

type AttendanceType = typeof sessions[number]['type'];
const PROFILE_PAGE_SIZE = 500;
const PROFILE_COLUMNS = 'id, sevak_id, name, mobile, profile_picture, department, department_id, status, approval_status, rejection_reason';

async function loadAllSevakProfiles() {
  const firstPage = await supabase.from('sevak_profiles')
    .select(PROFILE_COLUMNS, { count: 'exact' })
    .order('sevak_id')
    .range(0, PROFILE_PAGE_SIZE - 1);
  if (firstPage.error) return { data: null, error: firstPage.error };
  const total = firstPage.count ?? firstPage.data.length;
  if (total <= PROFILE_PAGE_SIZE) return { data: firstPage.data, error: null };

  const remainingPages = await Promise.all(Array.from(
    { length: Math.ceil((total - PROFILE_PAGE_SIZE) / PROFILE_PAGE_SIZE) },
    (_, index) => {
      const start = (index + 1) * PROFILE_PAGE_SIZE;
      return supabase.from('sevak_profiles')
        .select(PROFILE_COLUMNS)
        .order('sevak_id')
        .range(start, start + PROFILE_PAGE_SIZE - 1);
    },
  ));
  const failedPage = remainingPages.find((page) => page.error);
  if (failedPage?.error) return { data: null, error: failedPage.error };
  return { data: [...firstPage.data, ...remainingPages.flatMap((page) => page.data ?? [])], error: null };
}

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
  rejection_reason: string | null;
}

interface SevakDepartment {
  id: string;
  name: string;
  is_active: boolean;
}

interface GroupLeaderAssignment {
  id: string;
  user_id: string;
  department_id: string;
  created_at: string;
}

interface AttendanceRecord {
  id: string;
  sevak_id: string;
  attendance_date: string;
  attendance_type: AttendanceType;
  department: string | null;
  department_id: string;
  status: string;
  check_in_time: string | null;
  remarks: string | null;
  profiles?: { name: string; sevak_id: string } | null;
}

function todayInIndia() {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => values.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

type ReportPeriod = 'daily' | 'last3days' | 'weekly' | 'monthly' | 'last3months' | 'custom';

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function reportRange(period: ReportPeriod, today: string, customStart: string, customEnd: string) {
  if (period === 'custom') {
    const end = customEnd && customEnd < today ? customEnd : today;
    const requestedStart = customStart && customStart <= today ? customStart : today;
    return { start: requestedStart > end ? end : requestedStart, end };
  }
  if (period === 'daily') return { start: today, end: today };
  if (period === 'last3days') return { start: shiftDate(today, -2), end: today };
  if (period === 'weekly') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { start: shiftDate(today, -((weekday + 6) % 7)), end: today };
  }
  if (period === 'last3months') {
    const date = new Date(`${today}T00:00:00Z`);
    const dayOfMonth = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 3);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(dayOfMonth, lastDay));
    return { start: date.toISOString().slice(0, 10), end: today };
  }
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function rangeLabel(start: string, end: string) {
  const format = (value: string) => new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(`${value}T00:00:00Z`));
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#768187]">{label}</p>
      <p className="mt-2 break-words text-sm text-[#344b51]">{value || '—'}</p>
    </div>
  );
}

function errorMessage(error: { message: string; code?: string }) {
  if (error.code === '23505') return 'Attendance is already recorded for this Sevak, date, session, and department.';
  if (error.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(error.message)) return 'Apply the Sevak self-registration and approval migration, then retry.';
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) {
    return `Supabase denied this operation under Row Level Security: ${error.message}`;
  }
  return error.message;
}

type AdminManagementTab = 'sevaks' | 'leaders' | 'common';

function AttendanceAdminPreview({ profiles, departments, groupLeaderAssignments }: {
  profiles: SevakProfile[];
  departments: SevakDepartment[];
  groupLeaderAssignments: GroupLeaderAssignment[];
}) {
  const [activeTab, setActiveTab] = useState<AdminManagementTab>('sevaks');
  const [search, setSearch] = useState('');
  const [selectedSevakId, setSelectedSevakId] = useState('');
  const [departmentDraft, setDepartmentDraft] = useState('');
  const [leaderDepartmentId, setLeaderDepartmentId] = useState('');
  const [leaderDraft, setLeaderDraft] = useState('');
  const [commonMembers, setCommonMembers] = useState<string[]>(['', '', '', '', '']);
  const [managerSlot, setManagerSlot] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [linkedAuthUsers, setLinkedAuthUsers] = useState<Record<string, string>>({});

  const matchingProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => !query || [profile.name, profile.sevak_id, profile.mobile, profile.department]
      .some((value) => value.toLowerCase().includes(query))).slice(0, 12);
  }, [profiles, search]);
  const selectedSevak = profiles.find((profile) => profile.id === selectedSevakId) ?? matchingProfiles[0];
  const activeDepartments = departments.filter((department) => department.is_active);
  const leaderAssignmentsForDepartment = groupLeaderAssignments.filter((assignment) => assignment.department_id === leaderDepartmentId);
  const linkedUsers = profiles.filter((profile) => linkedAuthUsers[profile.id]);

  useEffect(() => {
    let active = true;
    void supabase.from('sevak_profiles').select('id, auth_user_id').not('auth_user_id', 'is', null)
      .then(({ data }) => {
        if (!active || !data) return;
        setLinkedAuthUsers(Object.fromEntries(data.filter((row) => row.auth_user_id).map((row) => [row.id, row.auth_user_id as string])));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedSevakId && matchingProfiles[0]) setSelectedSevakId(matchingProfiles[0].id);
  }, [selectedSevakId, matchingProfiles]);

  useEffect(() => {
    let active = true;
    const profilesWithPhotos = matchingProfiles.filter((profile) => profile.profile_picture);
    void Promise.all(profilesWithPhotos.map(async (profile) => {
      try {
        return [profile.id, await resolveSevakProfilePhotoUrl(supabase.storage, profile.profile_picture as string)] as const;
      } catch {
        // A missing or inaccessible private photo falls back to the initials tile.
        return null;
      }
    })).then((results) => {
      if (!active) return;
      setPhotoUrls((current) => ({ ...current, ...Object.fromEntries(results.filter((entry) => entry !== null)) }));
    });
    return () => { active = false; };
  }, [matchingProfiles]);

  const chooseCommonMember = (slot: number, profileId: string) => {
    setCommonMembers((current) => current.map((id, index) => index === slot ? profileId : id));
  };

  const previewOnly = <p className="mt-4 rounded-lg border border-dashed border-[#cbb782] bg-slate-50 px-3 py-2 text-xs leading-5 text-[#78591d]">UI preview only — changes are not saved.</p>;

  return (
    <section aria-labelledby="attendance-admin-tools-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a57d31]">Administrator tools</p>
        <h2 id="attendance-admin-tools-heading" className="mt-2 text-xl font-semibold text-[#263238]">Attendance team management</h2>
      </div>
      <div role="tablist" aria-label="Attendance team management sections" className="grid gap-2 sm:grid-cols-3">
        {([
          ['sevaks', 'Manage Sevaks'],
          ['leaders', 'Manage Group Leaders'],
          ['common', 'Manage Common Attendance Team'],
        ] as const).map(([tab, label]) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${activeTab === tab ? 'border-[#bd8d36] bg-[#f4efe3] text-[#78591d]' : 'border-slate-200 bg-white text-[#485a61] hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-5">
        {activeTab === 'sevaks' && (
          <div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
              <div>
                <label className="block text-xs font-medium text-[#66777d]">Search Sevaks
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, Sevak ID, mobile, or department" className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-[#263238] placeholder:text-[#9aa2a3]" />
                </label>
                <ul aria-label="Sevak list" className="mt-3 space-y-2">
                  {matchingProfiles.map((profile) => (
                    <li key={profile.id}>
                      <button type="button" onClick={() => { setSelectedSevakId(profile.id); setDepartmentDraft(profile.department_id); }} className={`flex min-h-[68px] w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selectedSevak?.id === profile.id ? 'border-[#bd8d36] bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                        {photoUrls[profile.id] ? <img src={photoUrls[profile.id]} alt={`${profile.name} profile`} className="h-11 w-11 rounded-full object-cover" /> : <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f4efe3] text-sm font-semibold text-[#78591d]">{profile.name.trim().charAt(0).toUpperCase() || 'S'}</span>}
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#344b51]">{profile.name}</span><span className="mt-1 block truncate text-xs text-[#768187]">{profile.sevak_id} · {profile.department || 'No department'}</span></span>
                      </button>
                    </li>
                  ))}
                  {matchingProfiles.length === 0 && <li className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-[#768187]">No Sevaks match this search.</li>}
                </ul>
              </div>
              <div className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-semibold text-[#344b51]">Department assignment</h3>
                <p className="mt-1 text-sm text-[#66777d]">{selectedSevak ? `${selectedSevak.name} · Current: ${selectedSevak.department || 'Unassigned'}` : 'Select a Sevak from the list.'}</p>
                <label className="mt-4 block text-xs font-medium text-[#66777d]">Department
                  <select disabled={!selectedSevak} value={departmentDraft || selectedSevak?.department_id || ''} onChange={(event) => setDepartmentDraft(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238] disabled:opacity-60">
                    <option value="">Choose department</option>
                    {activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </label>
                <button type="button" disabled className="mt-3 min-h-10 w-full rounded-lg bg-[#bd8d36] px-4 py-2 text-sm font-semibold text-white opacity-50">Assign department · Preview only</button>
                {previewOnly}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaders' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-[#344b51]">Department Group Leader</h3>
              <label className="mt-3 block text-xs font-medium text-[#66777d]">Department
                <select value={leaderDepartmentId} onChange={(event) => { setLeaderDepartmentId(event.target.value); setLeaderDraft(''); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]">
                  <option value="">Choose department</option>
                  {activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-[#485a61]">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[#768187]">Currently assigned</span>
                {leaderAssignmentsForDepartment.length ? leaderAssignmentsForDepartment.map((assignment) => {
                  const linkedProfile = profiles.find((profile) => linkedAuthUsers[profile.id] === assignment.user_id);
                  return <span key={assignment.id} className="mt-1 block">{linkedProfile?.name ?? `Registered user · ${assignment.user_id.slice(0, 8)}`}</span>;
                }) : <span className="mt-1 block">{leaderDepartmentId ? 'No current Group Leader shown for this department.' : 'Choose a department to preview its assignment.'}</span>}
              </div>
              <label className="mt-3 block text-xs font-medium text-[#66777d]">Select Group Leader
                <select value={leaderDraft} onChange={(event) => setLeaderDraft(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]">
                  <option value="">Choose a linked user</option>
                  {linkedUsers.map((profile) => <option key={profile.id} value={linkedAuthUsers[profile.id]}>{profile.name} · {profile.sevak_id}</option>)}
                </select>
              </label>
              <button type="button" disabled className="mt-3 min-h-10 rounded-lg bg-[#bd8d36] px-4 py-2 text-sm font-semibold text-white opacity-50">Preview Group Leader change</button>
              {previewOnly}
            </div>
            <aside className="h-fit rounded-xl border border-[#d8e6e2] bg-[#f1f6f4] p-4 text-sm leading-6 text-[#42665f]">
              <h3 className="font-semibold">Department attendance scope</h3>
              <p className="mt-2">A Group Leader records and reviews attendance only for Sevaks in their authorized department. This preview does not change role assignments or department permissions.</p>
            </aside>
          </div>
        )}

        {activeTab === 'common' && (
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {commonMembers.map((memberId, slot) => {
                const selectedMember = profiles.find((profile) => profile.id === memberId);
                const roleLabel = slot === managerSlot ? 'Common Attendance Manager' : 'Common Attendance Member';
                return <div key={slot} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#768187]">{roleLabel}</p>
                  <select aria-label={`Common attendance member ${slot + 1}`} value={memberId} onChange={(event) => chooseCommonMember(slot, event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-[#263238]">
                    <option value="">Select member {slot + 1}</option>
                    {profiles.filter((profile) => profile.id === memberId || !commonMembers.includes(profile.id)).map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.sevak_id}</option>)}
                  </select>
                  <p className="mt-2 min-h-5 truncate text-xs text-[#66777d]">{selectedMember?.name ?? 'No member selected'}</p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-[#78591d]"><input type="radio" name="common-attendance-manager" checked={managerSlot === slot} onChange={() => setManagerSlot(slot)} />Set as manager</label>
                </div>;
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Common attendance types">
              {['Morning Group Sadhana', 'Common Meeting', 'Satsang'].map((type) => <span key={type} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-[#485a61]">{type}</span>)}
            </div>
            <p className="mt-3 text-xs text-[#66777d]">Select five different members. Exactly one selected slot is marked Manager; the remaining four are Members.</p>
            <button type="button" disabled className="mt-4 min-h-10 rounded-lg bg-[#bd8d36] px-4 py-2 text-sm font-semibold text-white opacity-50">Save team · Preview only</button>
            {previewOnly}
          </div>
        )}
      </div>
    </section>
  );
}

export default function SevakAttendancePage({ shellSession, view = 'profiles' }: { shellSession: Session; view?: 'profiles' | 'administration' }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profiles, setProfiles] = useState<SevakProfile[]>([]);
  const [departments, setDepartments] = useState<SevakDepartment[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leaderDepartmentIds, setLeaderDepartmentIds] = useState<string[]>([]);
  const [groupLeaderAssignments, setGroupLeaderAssignments] = useState<GroupLeaderAssignment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<AttendanceRecord[]>([]);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('monthly');
  const [customRangeStart, setCustomRangeStart] = useState(() => `${todayInIndia().slice(0, 7)}-01`);
  const [customRangeEnd, setCustomRangeEnd] = useState(todayInIndia);
  const [reportDepartmentFilter, setReportDepartmentFilter] = useState('ALL');
  const [reportSearch, setReportSearch] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryPage, setDirectoryPage] = useState(0);
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendancePage, setAttendancePage] = useState(0);
  const [attendanceDate, setAttendanceDate] = useState(todayInIndia);
  const [attendanceDepartmentFilter, setAttendanceDepartmentFilter] = useState('ALL');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState('ALL');
  const reportToday = todayInIndia();
  const { start: reportStart, end: reportEnd } = reportRange(reportPeriod, reportToday, customRangeStart, customRangeEnd);
  const reportDateLabel = rangeLabel(reportStart, reportEnd);
  const [attendanceStatus, setAttendanceStatus] = useState('PRESENT');
  const [manualAttendanceType, setManualAttendanceType] = useState<AttendanceType>('MORNING_SADHANA');
  const [sevaDepartment, setSevaDepartment] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newGroupLeaderUserId, setNewGroupLeaderUserId] = useState('');
  const [newGroupLeaderDepartmentId, setNewGroupLeaderDepartmentId] = useState('');
  const [newProfile, setNewProfile] = useState({ sevak_id: '', name: '', mobile: '', department_id: '', status: 'active' });
  const [approvalSearch, setApprovalSearch] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [approvalPage, setApprovalPage] = useState(0);
  const [rejectingProfileId, setRejectingProfileId] = useState('');
  const [rejectionReasonDraft, setRejectionReasonDraft] = useState('');
  const [transferDepartmentId, setTransferDepartmentId] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraPhotoPreview, setCameraPhotoPreview] = useState('');
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraComponentMountedRef = useRef(false);
  const [savingManagement, setSavingManagement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingType, setSavingType] = useState<AttendanceType | null>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileImageError, setProfileImageError] = useState('');
  const [profileImageLoading, setProfileImageLoading] = useState(false);
  const [profileImageRetryKey, setProfileImageRetryKey] = useState(0);
  const [updatingProfilePhoto, setUpdatingProfilePhoto] = useState(false);
  const changePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const profileImageIdentityRef = useRef('');
  const profileImageAutoRetriesRef = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
    ?? profiles.find((profile) => profile.approval_status === 'approved' && profile.status.toLowerCase() === 'active');
  const DIRECTORY_PAGE_SIZE = 25;
  const directoryMatches = profiles.filter((profile) => {
    if (profile.approval_status !== 'approved' || profile.status.toLowerCase() !== 'active') return false;
    const query = directorySearch.trim().toLowerCase();
    return !query || [profile.name, profile.mobile, profile.sevak_id, profile.department].some((value) => value.toLowerCase().includes(query));
  });
  const directoryProfiles = directoryMatches.slice(directoryPage * DIRECTORY_PAGE_SIZE, (directoryPage + 1) * DIRECTORY_PAGE_SIZE);
  const activeAttendanceMatches = profiles.filter((profile) => {
    if (profile.approval_status !== 'approved' || profile.status.toLowerCase() !== 'active') return false;
    const query = attendanceSearch.trim().toLowerCase();
    return !query || [profile.name, profile.mobile, profile.sevak_id].some((value) => value.toLowerCase().includes(query));
  });
  const attendanceProfiles = activeAttendanceMatches.slice(attendancePage * DIRECTORY_PAGE_SIZE, (attendancePage + 1) * DIRECTORY_PAGE_SIZE);
  const attendanceSelectableProfiles = selectedProfile?.approval_status === 'approved'
    && selectedProfile.status.toLowerCase() === 'active'
    && !attendanceProfiles.some((profile) => profile.id === selectedProfile.id)
    ? [selectedProfile, ...attendanceProfiles]
    : attendanceProfiles;
  const approvalMatches = profiles.filter((profile) => {
    const matchesStatus = approvalFilter === 'all' || profile.approval_status === approvalFilter;
    const query = approvalSearch.trim().toLowerCase();
    const matchesSearch = !query || [profile.name, profile.mobile, profile.department].some((value) => value.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });
  const filteredApprovalProfiles = approvalMatches.slice(approvalPage * DIRECTORY_PAGE_SIZE, (approvalPage + 1) * DIRECTORY_PAGE_SIZE);
  const selectedSampleImage = selectedProfile && !selectedProfile.profile_picture
    ? SAMPLE_PROFILE_IMAGES[selectedProfile.sevak_id]
    : undefined;

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    cameraComponentMountedRef.current = true;
    return () => {
      cameraComponentMountedRef.current = false;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !cameraVideoRef.current || !cameraStreamRef.current) return;
    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    void cameraVideoRef.current.play().catch(() => {
      setCameraError('Camera preview could not start. Check browser camera permissions and try again.');
    });
  }, [cameraOpen]);

  const openCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser or page context. Use HTTPS or choose an existing photo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!cameraComponentMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (cameraPhotoPreview) setProfilePhoto(null);
      setCameraPhotoPreview('');
      setCameraOpen(true);
    } catch (error) {
      const cameraException = error as DOMException;
      if (cameraException.name === 'NotAllowedError' || cameraException.name === 'SecurityError') {
        setCameraError('Camera access was denied. Allow camera access in your browser settings, or choose an existing photo.');
      } else if (cameraException.name === 'NotFoundError' || cameraException.name === 'DevicesNotFoundError') {
        setCameraError('No camera is available on this device. Choose an existing photo instead.');
      } else {
        setCameraError(`Unable to open the camera${cameraException.message ? `: ${cameraException.message}` : '. Choose an existing photo instead.'}`);
      }
    }
  };

  const capturePhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera preview is not ready yet. Wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Unable to capture the camera image. Please try again or choose an existing photo.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('Unable to create a JPEG from the camera image. Please try again.');
        return;
      }
      setProfilePhoto(new File([blob], `sevak-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setCameraPhotoPreview(canvas.toDataURL('image/jpeg', 0.85));
      setCameraError('');
      stopCamera();
    }, 'image/jpeg', 0.85);
  };

  const cancelCamera = () => {
    stopCamera();
    if (cameraPhotoPreview) setProfilePhoto(null);
    setCameraPhotoPreview('');
    setCameraError('');
  };

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(error ? null : data.session);
      setAuthReady(true);
      if (error) setLoadError(error.message);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!session) {
      setProfiles([]);
      setAttendance([]);
      setTodayAttendance([]);
      setMonthlyAttendance([]);
      setLoading(false);
      setLoadError('Sign in with an authenticated Supabase account to load test Sevak data. Row Level Security blocks anonymous access.');
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([
      supabase.rpc('has_sevak_admin_role'),
      supabase.from('sevak_role_assignments').select('id, user_id, department_id, created_at').eq('role', 'group_leader'),
      supabase.from('sevak_departments').select('id, name, is_active').order('name'),
      loadAllSevakProfiles(),
    ]).then(([adminResult, rolesResult, departmentResult, profileResult]) => {
      if (!active) return;
      if (adminResult.error) {
        setLoadError(`Unable to check trusted Sevak role. Apply the Sevak management migration first: ${adminResult.error.message}`);
        setProfiles([]);
        setLoading(false);
        return;
      }
      const admin = Boolean(adminResult.data);
      setIsAdmin(admin);
      const assignments = (rolesResult.data ?? []) as GroupLeaderAssignment[];
      setGroupLeaderAssignments(assignments);
      const leaderIds = assignments.map((row) => row.department_id).filter(Boolean);
      setLeaderDepartmentIds(leaderIds);
      if (rolesResult.error) {
        setLoadError(`Unable to load Group Leader scope: ${rolesResult.error.message}`);
        setProfiles([]);
        setLoading(false);
        return;
      }
      if (departmentResult.error) {
        setLoadError(errorMessage(departmentResult.error));
        setProfiles([]);
        setLoading(false);
        return;
      }
      const loadedDepartments = (departmentResult.data ?? []) as SevakDepartment[];
      setDepartments(loadedDepartments);
      setNewProfile((current) => ({ ...current, department_id: current.department_id || loadedDepartments.find((item) => item.is_active)?.id || '' }));
      setNewGroupLeaderDepartmentId((current) => current || loadedDepartments.find((item) => item.is_active)?.id || '');
      if (profileResult.error) {
        setLoadError(errorMessage(profileResult.error));
        setProfiles([]);
        setAttendance([]);
        setMonthlyAttendance([]);
        setLoading(false);
        return;
      }
      const loadedProfiles = (profileResult.data ?? []) as SevakProfile[];
      setProfiles(loadedProfiles);
      setSelectedProfileId((current) => loadedProfiles.some((profile) => profile.id === current && profile.status.toLowerCase() === 'active' && profile.approval_status === 'approved')
        ? current
        : loadedProfiles.find((profile) => profile.status.toLowerCase() === 'active' && profile.approval_status === 'approved')?.id ?? '');
      setSevaDepartment((current) => current || loadedDepartments.find((item) => item.id === loadedProfiles[0]?.department_id)?.id || '');
      if (loadedProfiles.length === 0) {
        setLoadError('No Sevak profiles are visible for this account under the current trusted roles and Row Level Security policies.');
      }
      setAttendance([]);
      setTodayAttendance([]);
      setMonthlyAttendance([]);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : 'Unable to load Sevak data from Supabase.');
      setLoading(false);
    });

    return () => { active = false; };
  }, [authReady, session, view, refreshKey]);

  useEffect(() => {
    if (!authReady || loading || window.location.hash !== '#monthly-attendance-heading') return;
    const target = document.getElementById('monthly-attendance-heading');
    if (!target) return;
    const timer = window.setTimeout(() => target.scrollIntoView({ block: 'start' }), 500);
    return () => window.clearTimeout(timer);
  }, [authReady, loading, isAdmin, profiles.length, departments.length]);

  useEffect(() => {
    let active = true;
    let refreshTimer: number | undefined;
    setProfileImageUrl('');
    setProfileImageError('');
    const photoPath = selectedProfile?.profile_picture;
    if (!selectedProfile || !photoPath) {
      setProfileImageLoading(false);
      return;
    }
    if (!session) {
      setProfileImageLoading(false);
      setProfileImageError('Sign in to view this private profile picture.');
      return;
    }
    const profileImageIdentity = `${selectedProfile.id}:${photoPath}`;
    if (profileImageIdentityRef.current !== profileImageIdentity) {
      profileImageIdentityRef.current = profileImageIdentity;
      profileImageAutoRetriesRef.current = 0;
    }
    setProfileImageLoading(true);
    resolveSevakProfilePhotoUrl(supabase.storage, photoPath)
      .then((photoUrl) => {
        if (!active) return;
        setProfileImageLoading(false);
        setProfileImageError('');
        setProfileImageUrl(photoUrl);
        if (!isLegacySamplePhotoPath(photoPath)) {
          refreshTimer = window.setTimeout(() => setProfileImageRetryKey((key) => key + 1), 55 * 60 * 1000);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProfileImageLoading(false);
        setProfileImageError(`Could not load the profile photo: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [session, selectedProfile?.id, selectedProfile?.profile_picture, profileImageRetryKey]);

  const attendanceByType = useMemo(() => {
    return sessions.map((item) => ({
      ...item,
      records: attendance.filter((record) => (
        record.attendance_type === item.type
        && (attendanceDepartmentFilter === 'ALL' || record.department_id === attendanceDepartmentFilter)
        && (attendanceStatusFilter === 'ALL' || record.status.toUpperCase() === attendanceStatusFilter)
      )),
    }));
  }, [attendance, attendanceDepartmentFilter, attendanceStatusFilter]);

  const filteredReportAttendance = useMemo(() => monthlyAttendance.filter((record) => {
    if (reportDepartmentFilter !== 'ALL' && record.department_id !== reportDepartmentFilter) return false;
    if (!reportSearch.trim()) return true;
    const profile = profiles.find((item) => item.id === record.sevak_id);
    return profile?.name.toLowerCase().includes(reportSearch.trim().toLowerCase()) ?? false;
  }), [monthlyAttendance, reportDepartmentFilter, reportSearch, profiles]);

  const todayMetrics = useMemo(() => {
    const visibleToday = todayAttendance.filter((record) => {
      if (reportDepartmentFilter !== 'ALL' && record.department_id !== reportDepartmentFilter) return false;
      if (!reportSearch.trim()) return true;
      return profiles.find((profile) => profile.id === record.sevak_id)?.name.toLowerCase().includes(reportSearch.trim().toLowerCase()) ?? false;
    });
    const distinct = (status: string) => new Set(visibleToday.filter((record) => record.status.toUpperCase() === status).map((record) => record.sevak_id)).size;
    return { present: distinct('PRESENT'), absent: distinct('ABSENT') };
  }, [todayAttendance, reportDepartmentFilter, reportSearch, profiles]);

  const filteredProfilesCount = profiles.filter((profile) => profile.approval_status === 'approved'
    && profile.status.toLowerCase() === 'active'
    && (reportDepartmentFilter === 'ALL' || profile.department_id === reportDepartmentFilter)
    && (!reportSearch.trim() || profile.name.toLowerCase().includes(reportSearch.trim().toLowerCase()))).length;

  const monthlySummary = useMemo(() => sessions.map((item) => ({
    ...item,
    count: filteredReportAttendance.filter((record) => record.attendance_type === item.type).length,
    present: filteredReportAttendance.filter((record) => record.attendance_type === item.type && record.status.toUpperCase() === 'PRESENT').length,
    absent: filteredReportAttendance.filter((record) => record.attendance_type === item.type && record.status.toUpperCase() === 'ABSENT').length,
  })), [filteredReportAttendance]);

  const monthlyDepartmentSummary = useMemo(() => departments.map((department) => {
    const rows = filteredReportAttendance.filter((record) => record.department_id === department.id);
    return {
      ...department,
      count: rows.length,
      present: rows.filter((record) => record.status.toUpperCase() === 'PRESENT').length,
      absent: rows.filter((record) => record.status.toUpperCase() === 'ABSENT').length,
    };
  }).filter((department) => department.count > 0 || department.is_active), [departments, filteredReportAttendance]);

  const reportDailyTrend = useMemo(() => {
    const grouped = new Map<string, { records: number; present: number; absent: number }>();
    filteredReportAttendance.forEach((record) => {
      const current = grouped.get(record.attendance_date) ?? { records: 0, present: 0, absent: 0 };
      current.records += 1;
      if (record.status.toUpperCase() === 'PRESENT') current.present += 1;
      if (record.status.toUpperCase() === 'ABSENT') current.absent += 1;
      grouped.set(record.attendance_date, current);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values }));
  }, [filteredReportAttendance]);

  const reportLeaderboard = useMemo(() => {
    const grouped = new Map<string, { present: number; absent: number }>();
    filteredReportAttendance.forEach((record) => {
      const current = grouped.get(record.sevak_id) ?? { present: 0, absent: 0 };
      if (record.status.toUpperCase() === 'PRESENT') current.present += 1;
      if (record.status.toUpperCase() === 'ABSENT') current.absent += 1;
      grouped.set(record.sevak_id, current);
    });
    return [...grouped.entries()].map(([id, values]) => ({
      id, name: profiles.find((profile) => profile.id === id)?.name ?? id,
      department: profiles.find((profile) => profile.id === id)?.department ?? 'Department unavailable',
      ...values, total: values.present + values.absent,
      rate: values.present + values.absent ? values.present / (values.present + values.absent) : 0,
    })).filter((person) => person.total > 0)
      .sort((a, b) => b.rate - a.rate || b.present - a.present || a.name.localeCompare(b.name)).slice(0, 6);
  }, [filteredReportAttendance, profiles]);

  const weekdayAbsences = useMemo(() => {
    const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return labels.map((label, index) => ({
      label,
      count: filteredReportAttendance.filter((record) => record.status.toUpperCase() === 'ABSENT'
        && ((new Date(`${record.attendance_date}T00:00:00Z`).getUTCDay() + 6) % 7) === index).length,
    }));
  }, [filteredReportAttendance]);

  const maxDepartmentRecords = Math.max(1, ...monthlyDepartmentSummary.map((department) => department.count));
  const maxWeekdayAbsences = Math.max(1, ...weekdayAbsences.map((day) => day.count));
  const trendScale = Math.max(1, ...reportDailyTrend.flatMap((day) => [day.present, day.absent]));
  const trendPoint = (index: number, count: number) => {
    const x = reportDailyTrend.length <= 1 ? 360 : 38 + (index * 644) / (reportDailyTrend.length - 1);
    const y = 166 - (count / trendScale) * 135;
    return `${x},${y}`;
  };

  const refreshAttendance = useCallback(() => setRefreshKey((key) => key + 1), []);

  const refreshAll = () => setRefreshKey((key) => key + 1);

  const exportReport = () => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      ['Date', 'Sevak', 'Sevak ID', 'Attendance type', 'Department', 'Status'],
      ...filteredReportAttendance.map((record) => {
        const profile = profiles.find((item) => item.id === record.sevak_id);
        return [record.attendance_date, profile?.name ?? record.sevak_id, profile?.sevak_id ?? '', record.attendance_type, record.department ?? '', record.status];
      }),
    ];
    const csv = rows.map((row) => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sevak-attendance-${reportStart}-to-${reportEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const showAbsencesToday = () => {
    setAttendanceDate(todayInIndia());
    setAttendanceDepartmentFilter(reportDepartmentFilter);
    setAttendanceStatusFilter('ABSENT');
    document.getElementById('attendance-heading')?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateSelectedProfilePhoto = async (photo: File) => {
    if (!selectedProfile || !session) {
      setActionError('Sign in and select a Sevak profile before changing its photo.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
      setActionError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (photo.size > 2 * 1024 * 1024) {
      setActionError('The photo must be 2 MB or smaller.');
      return;
    }

    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    const objectPath = `${selectedProfile.sevak_id}/profile-${crypto.randomUUID()}.${extension}`;
    setUpdatingProfilePhoto(true);
    setActionError('');
    setMessage('');

    try {
      const upload = await supabase.storage.from('sevak-profiles').upload(objectPath, photo, {
        upsert: false,
        contentType: photo.type,
      });
      if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);

      const update = await supabase.from('sevak_profiles')
        .update({ profile_picture: objectPath })
        .eq('id', selectedProfile.id)
        .select('id, profile_picture')
        .single();
      if (update.error) throw new Error(`Photo uploaded, but the profile photo path could not be saved: ${update.error.message}`);

      setProfiles((current) => current.map((profile) => profile.id === selectedProfile.id
        ? { ...profile, profile_picture: update.data.profile_picture }
        : profile));
      setProfileImageUrl('');
      setMessage(`Photo updated for ${selectedProfile.name}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const permissionIssue = /row.level security|permission denied|not allowed|policy/i.test(detail);
      setActionError(permissionIssue
        ? `Your account is not permitted to change this profile photo under the current Supabase policies: ${detail}`
        : `Could not update the profile photo: ${detail}`);
    } finally {
      setUpdatingProfilePhoto(false);
      if (changePhotoInputRef.current) changePhotoInputRef.current.value = '';
    }
  };

  const createProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || !session) return;
    stopCamera();
    setSavingManagement(true);
    setActionError('');
    setMessage('');
    const { data, error } = await supabase.from('sevak_profiles').insert({
      sevak_id: newProfile.sevak_id.trim(),
      name: newProfile.name.trim(),
      mobile: newProfile.mobile.trim(),
      department_id: newProfile.department_id,
      status: newProfile.status,
      approval_status: 'approved',
      approved_by: session.user.id,
      approved_at: new Date().toISOString(),
    }).select('id, sevak_id').single();
    if (error) {
      setActionError(errorMessage(error));
      setSavingManagement(false);
      return;
    }
    setSelectedProfileId(data.id);
    setProfileImageUrl('');
    let savedProfilePicture: string | null = null;
    if (profilePhoto) {
      const extension = profilePhoto.type === 'image/png' ? 'png' : profilePhoto.type === 'image/webp' ? 'webp' : 'jpg';
      const objectPath = `${data.sevak_id}/profile-${crypto.randomUUID()}.${extension}`;
      try {
        const upload = await supabase.storage.from('sevak-profiles').upload(objectPath, profilePhoto, {
          upsert: false,
          contentType: profilePhoto.type,
        });
        if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);
        const pictureUpdate = await supabase.from('sevak_profiles').update({ profile_picture: objectPath }).eq('id', data.id).select('id, profile_picture').single();
        if (pictureUpdate.error) throw new Error(`Photo uploaded, but the sevak_profiles path update failed: ${pictureUpdate.error.message}`);
        savedProfilePicture = pictureUpdate.data.profile_picture;
      } catch (error) {
        setActionError(`Profile created, but the private photo could not be saved: ${error instanceof Error ? error.message : String(error)}`);
        setSavingManagement(false);
        refreshAll();
        return;
      }
    }
    const createdProfile: SevakProfile = {
      id: data.id,
      sevak_id: data.sevak_id,
      name: newProfile.name.trim(),
      mobile: newProfile.mobile.trim(),
      profile_picture: savedProfilePicture,
      department: departments.find((item) => item.id === newProfile.department_id)?.name ?? '',
      department_id: newProfile.department_id,
      status: newProfile.status,
      approval_status: 'approved',
      rejection_reason: null,
    };
    setProfiles((current) => [...current.filter((profile) => profile.id !== createdProfile.id), createdProfile]
      .sort((left, right) => left.sevak_id.localeCompare(right.sevak_id)));
    setSelectedProfileId(createdProfile.id);
    if (savedProfilePicture && isLegacySamplePhotoPath(savedProfilePicture)) setProfileImageUrl(savedProfilePicture);
    setMessage(`Sevak profile ${data.sevak_id} created.`);
    setNewProfile({ sevak_id: '', name: '', mobile: '', department_id: departments.find((item) => item.is_active)?.id ?? '', status: 'active' });
    setProfilePhoto(null);
    setCameraPhotoPreview('');
    setSavingManagement(false);
    refreshAll();
  };

  const setProfileApproval = async (profile: SevakProfile, approvalStatus: 'approved' | 'rejected') => {
    if (!isAdmin || !session) return;
    const reason = rejectionReasonDraft.trim();
    if (approvalStatus === 'rejected' && !reason) {
      setActionError('Enter a rejection reason so the Sevak can correct and resubmit the profile.');
      return;
    }
    setSavingManagement(true);
    setActionError('');
    setMessage('');
    const changes = approvalStatus === 'approved'
      ? { approval_status: 'approved', status: 'active', rejection_reason: null, approved_by: session.user.id, approved_at: new Date().toISOString() }
      : { approval_status: 'rejected', status: 'inactive', rejection_reason: reason, approved_by: null, approved_at: null };
    let result;
    try {
      result = await supabase.from('sevak_profiles').update(changes)
        .eq('id', profile.id)
        .eq('approval_status', 'pending')
        .select('id')
        .maybeSingle();
    } catch (error) {
      setSavingManagement(false);
      setActionError(`Could not save the approval decision: ${error instanceof Error ? error.message : 'Check your connection and retry.'}`);
      return;
    }
    const { data, error } = result;
    setSavingManagement(false);
    if (error || !data) {
      setActionError(error ? errorMessage(error) : 'This profile may already have been reviewed. Refresh the dashboard and try again.');
      return;
    }
    setMessage(approvalStatus === 'approved' ? `${profile.name} approved and activated.` : `${profile.name} rejected. The reason is available to the profile owner.`);
    setRejectingProfileId('');
    setRejectionReasonDraft('');
    setApprovalPage(0);
    refreshAll();
  };

  const createDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || !session) return;
    setSavingManagement(true);
    setActionError('');
    const { error } = await supabase.from('sevak_departments').insert({ name: newDepartmentName.trim(), is_active: true });
    setSavingManagement(false);
    if (error) setActionError(errorMessage(error));
    else {
      setMessage(`Department “${newDepartmentName.trim()}” added.`);
      setNewDepartmentName('');
      refreshAll();
    }
  };

  const updateDepartment = async (department: SevakDepartment, changes: Partial<Pick<SevakDepartment, 'name' | 'is_active'>>) => {
    if (!isAdmin || !session) return;
    setSavingManagement(true);
    setActionError('');
    const { error } = await supabase.from('sevak_departments').update(changes).eq('id', department.id);
    setSavingManagement(false);
    if (error) setActionError(errorMessage(error));
    else {
      setMessage(`Department ${changes.name ? 'renamed' : (changes.is_active ? 'activated' : 'deactivated')}. Historical Seva department values remain unchanged.`);
      refreshAll();
    }
  };

  const assignGroupLeader = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || !session) {
      setActionError('Only a trusted Sevak administrator can assign Group Leaders.');
      return;
    }
    const userId = newGroupLeaderUserId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      setActionError('Enter a valid Supabase Auth user UUID for the Group Leader.');
      return;
    }
    if (!departments.some((department) => department.id === newGroupLeaderDepartmentId && department.is_active)) {
      setActionError('Choose an active department for this Group Leader.');
      return;
    }

    setSavingManagement(true);
    setActionError('');
    setMessage('');
    const { data, error } = await supabase.from('sevak_role_assignments')
      .insert({ user_id: userId, role: 'group_leader', department_id: newGroupLeaderDepartmentId })
      .select('id, user_id, department_id, created_at')
      .single();
    setSavingManagement(false);
    if (error) {
      setActionError(error.code === '23505'
        ? 'That user is already assigned as a Group Leader for this department.'
        : `Group Leader assignment was denied or could not be saved: ${errorMessage(error)}`);
      return;
    }
    const assignment = data as GroupLeaderAssignment;
    setGroupLeaderAssignments((current) => [...current, assignment]);
    setNewGroupLeaderUserId('');
    setMessage(`Group Leader access assigned for ${departments.find((department) => department.id === assignment.department_id)?.name ?? 'the selected department'}.`);
  };

  const revokeGroupLeader = async (assignment: GroupLeaderAssignment) => {
    if (!isAdmin || !session) {
      setActionError('Only a trusted Sevak administrator can revoke Group Leader access.');
      return;
    }
    const departmentName = departments.find((department) => department.id === assignment.department_id)?.name ?? 'this department';
    if (!window.confirm(`Revoke Group Leader access for ${assignment.user_id} in ${departmentName}?`)) return;

    setSavingManagement(true);
    setActionError('');
    setMessage('');
    const { data, error } = await supabase.from('sevak_role_assignments')
      .delete().eq('id', assignment.id).eq('role', 'group_leader')
      .select('id').maybeSingle();
    setSavingManagement(false);
    if (error || !data) {
      setActionError(error ? `Group Leader access could not be revoked: ${errorMessage(error)}` : 'The assignment was not found or could not be revoked under the current authorization.');
      return;
    }
    setGroupLeaderAssignments((current) => current.filter((item) => item.id !== assignment.id));
    setMessage(`Group Leader access revoked for ${assignment.user_id} in ${departmentName}.`);
  };

  const transferSelectedProfile = async () => {
    if (!isAdmin || !session || !selectedProfile || !transferDepartmentId || transferDepartmentId === selectedProfile.department_id) return;
    const nextDepartment = departments.find((department) => department.id === transferDepartmentId);
    if (!nextDepartment) return;
    const confirmed = window.confirm(`Transfer ${selectedProfile.name} from ${selectedProfile.department} to ${nextDepartment.name}? Past Seva attendance will keep its recorded department.`);
    if (!confirmed) return;
    setSavingManagement(true);
    setActionError('');
    const { error } = await supabase.from('sevak_profiles').update({ department_id: nextDepartment.id }).eq('id', selectedProfile.id);
    setSavingManagement(false);
    if (error) setActionError(errorMessage(error));
    else {
      setMessage(`${selectedProfile.name} transferred to ${nextDepartment.name}. Historical Seva records were preserved.`);
      setTransferDepartmentId('');
      refreshAll();
    }
  };

  const saveAttendance = async (type: AttendanceType) => {
    if (!session) {
      setActionError('Sign in with an authenticated Supabase account before saving attendance.');
      return;
    }
    const attendanceProfile = profiles.find((profile) => profile.id === selectedProfileId && profile.status.toLowerCase() === 'active' && profile.approval_status === 'approved');
    if (!attendanceProfile) {
      setActionError('Select an active Sevak profile before saving attendance.');
      return;
    }
    if (type === 'SEVA' && !sevaDepartment.trim()) {
      setActionError('Choose a department for Seva attendance.');
      return;
    }
    const selectedSevaDepartment = departments.find((department) => department.id === sevaDepartment);
    if (type === 'SEVA' && !selectedSevaDepartment) {
      setActionError('Choose an active department loaded from Supabase.');
      return;
    }

    setSavingType(type);
    setMessage('');
    setActionError('');
    const { error } = await supabase.from('sevak_attendance').insert({
      sevak_id: attendanceProfile.id,
      attendance_date: attendanceDate,
      attendance_type: type,
      department: type === 'SEVA' ? selectedSevaDepartment?.name : null,
      status: attendanceStatus,
    });
    setSavingType(null);
    if (error) {
      setActionError(errorMessage(error));
      return;
    }
    setMessage(`${type.replaceAll('_', ' ')} attendance saved for ${attendanceProfile.name}.`);
    refreshAttendance();
  };

  const correctAttendanceRecord = async (record: AttendanceRecord, nextStatus: 'PRESENT' | 'ABSENT') => {
    if (!isAdmin || !session) {
      setActionError('Only a trusted Sevak administrator can correct attendance records.');
      return;
    }
    const reason = window.prompt(`Reason for correcting ${record.status} to ${nextStatus}?`);
    if (reason === null) return;
    if (!reason.trim()) {
      setActionError('A correction reason is required.');
      return;
    }
    if (!window.confirm(`Save this attendance correction to ${nextStatus}? The database will preserve or assign the server check-in time.`)) return;

    setSavingManagement(true);
    setActionError('');
    setMessage('');
    const correctionNote = `Admin correction ${new Date().toISOString()}: ${reason.trim()}`;
    const remarks = [record.remarks?.trim(), correctionNote].filter(Boolean).join('\n');
    const { data, error } = await supabase.from('sevak_attendance')
      .update({ status: nextStatus, remarks })
      .eq('id', record.id)
      .select('id').maybeSingle();
    setSavingManagement(false);
    if (error || !data) {
      setActionError(error ? `Attendance correction failed: ${errorMessage(error)}` : 'The attendance record could not be found or corrected under the current authorization.');
      return;
    }
    setMessage(`Attendance corrected to ${nextStatus}.`);
    refreshAll();
  };

  return (
    <SevakLayout session={shellSession} pathname={view === 'profiles' ? '/sevak-attendance/profiles' : '/sevak-attendance/administration'}>
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
      <header className="mb-8 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a57d31]">Sevak Attendance System</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#263238] sm:text-3xl">{view === 'profiles' ? 'Sevak Profiles' : 'Attendance Administration'}</h1>
        <p className="mt-3 text-sm leading-6 text-[#66777d] sm:text-base">
          {view === 'profiles' ? 'Search authorized Sevak profiles, review details, and manage approval or photo workflows when permitted.' : 'Manage departments, Group Leader assignments, and attendance teams.'}
        </p>
        <nav aria-label="Breadcrumb" className="mt-3 text-xs text-slate-500"><a href="/sevak-attendance" className="hover:text-emerald-700">Attendance workspace</a><span className="mx-2">›</span><span className="text-slate-800">{view === 'profiles' ? 'Sevak Profiles' : 'Administration'}</span></nav>
        {session && !loading && <p className="mt-3 text-xs text-[#768187]">{isAdmin ? 'Trusted role: Administrator' : leaderDepartmentIds.length ? `Trusted role: Group Leader (${leaderDepartmentIds.length} department scope${leaderDepartmentIds.length === 1 ? '' : 's'})` : 'No Sevak management role assigned to this account.'}</p>}
      </header>

      {loadError && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border border-emerald-700/20 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {actionError && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}



      {view === 'administration' && isAdmin && <AttendanceAdminPreview profiles={profiles} departments={departments} groupLeaderAssignments={groupLeaderAssignments} />}

      {view === 'profiles' && isAdmin && (
        <section aria-labelledby="sevak-approval-heading" className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a57d31]">Trusted administrator review</p>
              <h2 id="sevak-approval-heading" className="mt-2 text-lg font-semibold">Sevak profile approvals</h2>
              <p className="mt-1 text-xs text-[#768187]">Select a profile to inspect its photo and details in the panel below.</p>
            </div>
            <span className="text-xs text-[#8d6b28]">{profiles.filter((profile) => profile.approval_status === 'pending').length} pending</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input value={approvalSearch} onChange={(event) => { setApprovalSearch(event.target.value); setApprovalPage(0); }} placeholder="Search name, mobile, or department" aria-label="Search Sevak profiles" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-[#263238] placeholder:text-[#9aa2a3]" />
            <select value={approvalFilter} onChange={(event) => { setApprovalFilter(event.target.value as typeof approvalFilter); setApprovalPage(0); }} aria-label="Filter Sevak profiles by approval status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]">
              <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option>
            </select>
          </div>
          <div className="mt-3 space-y-2">
            {filteredApprovalProfiles.map((profile) => (
              <div key={profile.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={() => { setSelectedProfileId(profile.id); setTransferDepartmentId(''); setActionError(''); }} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-[#263238]">{profile.name} <span className="font-normal text-[#768187]">· {profile.sevak_id}</span></span>
                    <span className="mt-1 block text-xs text-[#66777d]">{profile.mobile} · {profile.department}</span>
                  </button>
                  <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${profile.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : profile.approval_status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-[#bd8d36]/10 text-[#8d6b28]'}`}>{profile.approval_status}</span>
                  {profile.approval_status === 'pending' && <div className="flex gap-2">
                    <button type="button" disabled={savingManagement} onClick={() => void setProfileApproval(profile, 'approved')} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#263238] disabled:opacity-50">Approve</button>
                    <button type="button" disabled={savingManagement} onClick={() => { setRejectingProfileId(rejectingProfileId === profile.id ? '' : profile.id); setRejectionReasonDraft(''); setActionError(''); }} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Reject</button>
                  </div>}
                </div>
                {profile.approval_status === 'rejected' && <p className="mt-2 text-xs text-rose-700">Reason: {profile.rejection_reason}</p>}
                {rejectingProfileId === profile.id && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <textarea required maxLength={1000} value={rejectionReasonDraft} onChange={(event) => setRejectionReasonDraft(event.target.value)} placeholder="Explain what needs correction" className="min-h-20 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-[#263238] placeholder:text-[#9aa2a3]" />
                  <button type="button" disabled={savingManagement || !rejectionReasonDraft.trim()} onClick={() => void setProfileApproval(profile, 'rejected')} className="self-end rounded-lg bg-rose-300 px-3 py-2 text-xs font-semibold text-[#263238] disabled:opacity-50">Confirm rejection</button>
                </div>}
              </div>
            ))}
            {filteredApprovalProfiles.length === 0 && <p className="rounded-lg border border-slate-200 p-3 text-sm text-[#768187]">No profiles match this search and approval filter.</p>}
          </div>
          {approvalMatches.length > DIRECTORY_PAGE_SIZE && <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[#66777d]">
            <button type="button" disabled={approvalPage === 0} onClick={() => setApprovalPage((page) => page - 1)} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button>
            <span>Page {approvalPage + 1} of {Math.ceil(approvalMatches.length / DIRECTORY_PAGE_SIZE)}</span>
            <button type="button" disabled={(approvalPage + 1) * DIRECTORY_PAGE_SIZE >= approvalMatches.length} onClick={() => setApprovalPage((page) => page + 1)} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button>
          </div>}
        </section>
      )}

      {view === 'profiles' && <section aria-labelledby="profile-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-black/20 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="profile-heading" className="text-lg font-semibold text-[#263238]">Sevak Profile</h2>
          <span className="text-xs text-[#768187]">{loading ? 'Loading profiles…' : `${directoryMatches.length} approved Sevak profiles`}</span>
        </div>
        <input value={directorySearch} onChange={(event) => { setDirectorySearch(event.target.value); setDirectoryPage(0); }} placeholder="Search approved profiles by name, mobile, ID, or department" aria-label="Search approved Sevak profiles" className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-[#263238] placeholder:text-[#9aa2a3]" />
        {directoryProfiles.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Approved active Sevak profiles">
            {directoryProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => { setSelectedProfileId(profile.id); setTransferDepartmentId(''); setActionError(''); }}
                aria-pressed={selectedProfile?.id === profile.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${selectedProfile?.id === profile.id ? 'border-[#bd8d36]/50 bg-[#bd8d36]/10 text-[#78591d]' : 'border-slate-200 bg-white text-[#485a61] hover:border-[#cbb782]'}`}
              >
                {profile.id === selectedProfile?.id && profileImageUrl ? (
                  <img src={profileImageUrl} alt={`${profile.name} private Supabase profile`} className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />
                ) : !profile.profile_picture && SAMPLE_PROFILE_IMAGES[profile.sevak_id] ? (
                  <img src={SAMPLE_PROFILE_IMAGES[profile.sevak_id]} alt={`${profile.name} temporary sample portrait`} className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />
                ) : null}
                <span>
                  <span className="block font-semibold">{profile.name}</span>
                  <span className="mt-1 block text-[#768187]">{profile.sevak_id}</span>
                  {!profile.profile_picture && SAMPLE_PROFILE_IMAGES[profile.sevak_id] && <span className="mt-1 block text-[10px] text-[#a57d31]/80">Temporary sample image</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        {directoryMatches.length > DIRECTORY_PAGE_SIZE && <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[#66777d]">
          <button type="button" disabled={directoryPage === 0} onClick={() => setDirectoryPage((page) => page - 1)} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button>
          <span>Page {directoryPage + 1} of {Math.ceil(directoryMatches.length / DIRECTORY_PAGE_SIZE)}</span>
          <button type="button" disabled={(directoryPage + 1) * DIRECTORY_PAGE_SIZE >= directoryMatches.length} onClick={() => setDirectoryPage((page) => page + 1)} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button>
        </div>}
        {isAdmin && (
          <details onToggle={(event) => { if (!event.currentTarget.open) cancelCamera(); }} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#8d6b28]">Add Sevak profile</summary>
            <form onSubmit={(event) => void createProfile(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[#66777d]">Unique Sevak ID<input required value={newProfile.sevak_id} onChange={(event) => setNewProfile({ ...newProfile, sevak_id: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]" /></label>
              <label className="text-xs text-[#66777d]">Name<input required value={newProfile.name} onChange={(event) => setNewProfile({ ...newProfile, name: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]" /></label>
              <label className="text-xs text-[#66777d]">Mobile number<input required type="tel" value={newProfile.mobile} onChange={(event) => setNewProfile({ ...newProfile, mobile: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]" /></label>
              <label className="text-xs text-[#66777d]">Department<select required value={newProfile.department_id} onChange={(event) => setNewProfile({ ...newProfile, department_id: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]"><option value="">Choose department</option>{departments.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="text-xs text-[#66777d]">Status<select value={newProfile.status} onChange={(event) => setNewProfile({ ...newProfile, status: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              <div className="text-xs text-[#66777d] sm:col-span-2">
                <label htmlFor="sevak-profile-photo" className="block">Profile photo</label>
                <p className="mt-1 text-[11px] text-[#768187]">Camera captures are saved with this app; selected files remain in private Supabase Storage.</p>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input id="sevak-profile-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { stopCamera(); setCameraPhotoPreview(''); setProfilePhoto(event.target.files?.[0] ?? null); }} className="min-w-0 flex-1 text-xs text-[#485a61] file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-[#263238]" />
                  <button type="button" onClick={() => void openCamera()} disabled={cameraOpen} className="rounded-lg border border-[#ddd6c7] px-3 py-2 text-xs font-semibold text-[#263238] hover:bg-white/5 disabled:opacity-50">Take Photo</button>
                </div>
                {profilePhoto && <p className="mt-1 text-[11px] text-[#768187]">Selected: {profilePhoto.name}</p>}
                {cameraError && <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{cameraError}</p>}
                {(cameraOpen || cameraPhotoPreview) && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:max-w-xl">
                  {cameraOpen ? <video ref={cameraVideoRef} autoPlay muted playsInline aria-label="Live camera preview" className="aspect-video w-full rounded-lg bg-black object-cover" /> : <img src={cameraPhotoPreview} alt="Captured Sevak profile photo preview" className="aspect-video w-full rounded-lg bg-black object-contain sm:max-h-80" />}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cameraOpen && <button type="button" onClick={capturePhoto} className="rounded-lg bg-[#bd8d36] px-3 py-2 text-xs font-semibold text-[#263238]">Capture Photo</button>}
                    {cameraPhotoPreview && <button type="button" onClick={() => void openCamera()} className="rounded-lg border border-[#ddd6c7] px-3 py-2 text-xs font-semibold text-[#263238] hover:bg-white/5">Retake</button>}
                    <button type="button" onClick={cancelCamera} className="rounded-lg border border-[#ddd6c7] px-3 py-2 text-xs font-semibold text-[#263238] hover:bg-white/5">Cancel Camera</button>
                  </div>
                </div>}
              </div>
              <button disabled={savingManagement || !departments.some((item) => item.is_active)} className="rounded-lg bg-[#bd8d36] px-4 py-2 text-sm font-semibold text-[#263238] disabled:opacity-50 sm:col-span-2">{savingManagement ? 'Saving…' : 'Create profile'}</button>
            </form>
          </details>
        )}
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
          {profileImageUrl ? (
            <div className="shrink-0">
              <img src={profileImageUrl} alt={`${selectedProfile?.name ?? 'Sevak'} Supabase profile`} onError={() => {
                setProfileImageUrl('');
                setProfileImageLoading(false);
                if (profileImageAutoRetriesRef.current < 1) {
                  profileImageAutoRetriesRef.current += 1;
                  setProfileImageError('Private photo link failed; refreshing it…');
                  setProfileImageRetryKey((key) => key + 1);
                } else {
                  setProfileImageError('Profile picture not available: the saved Storage object could not be loaded. Check the saved path and private bucket access.');
                }
              }} className="h-24 w-24 rounded-2xl border border-slate-200 object-cover" />
              <p className="mt-1 text-center text-[10px] text-emerald-700">Supabase profile picture</p>
            </div>
          ) : selectedProfile?.profile_picture ? (
            <div role={profileImageError ? 'alert' : undefined} className="flex min-h-24 w-40 shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed border-[#ddd6c7] bg-white px-3 py-2 text-center text-xs text-[#66777d]">
              {profileImageLoading ? 'Loading private profile picture…' : profileImageError || 'Loading private profile picture…'}
              {!profileImageLoading && <button type="button" onClick={() => { profileImageAutoRetriesRef.current = 0; setProfileImageRetryKey((key) => key + 1); }} className="mt-2 rounded-md border border-[#ddd6c7] px-2 py-1 text-[10px] text-[#263238] hover:bg-white/5">Refresh photo</button>}
            </div>
          ) : selectedSampleImage ? (
            <div className="shrink-0">
              <img src={selectedSampleImage} alt={`${selectedProfile?.name ?? 'Sevak'} temporary sample portrait`} className="h-24 w-24 rounded-2xl border border-[#bd8d36]/20 object-cover" />
              <p className="mt-1 text-center text-[10px] text-[#a57d31]">Temporary sample image</p>
            </div>
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-[#ddd6c7] bg-white px-2 text-center text-xs text-[#768187]">
              Profile picture not available
            </div>
          )}
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <ProfileField label="Sevak Name" value={selectedProfile?.name ?? (loading ? 'Loading…' : '')} />
            <ProfileField label="Mobile Number" value={selectedProfile?.mobile ?? (loading ? 'Loading…' : '')} />
            <ProfileField label="Department" value={selectedProfile?.department ?? (loading ? 'Loading…' : '')} />
            <ProfileField label="Status" value={selectedProfile?.status ?? (loading ? 'Loading…' : '')} />
          </div>
        </div>
        {selectedProfile && <div className="mt-4">
          <input
            ref={changePhotoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            aria-label={`Choose or take a new photo for ${selectedProfile.name}`}
            className="sr-only"
            onChange={(event) => {
              const photo = event.target.files?.[0];
              if (photo) void updateSelectedProfilePhoto(photo);
            }}
          />
          <button
            type="button"
            disabled={updatingProfilePhoto}
            onClick={() => changePhotoInputRef.current?.click()}
            className="rounded-lg border border-[#bd8d36]/40 px-3 py-2 text-xs font-semibold text-[#78591d] disabled:opacity-50"
          >{updatingProfilePhoto ? 'Uploading photo…' : 'Change Photo'}</button>
        </div>}
        {isAdmin && selectedProfile && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-xs text-[#66777d]">Transfer department
              <select value={transferDepartmentId || selectedProfile.department_id} onChange={(event) => setTransferDepartmentId(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]">
                {departments.filter((item) => item.is_active || item.id === selectedProfile.department_id).map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? '' : ' (inactive)'}</option>)}
              </select>
            </label>
            <button type="button" disabled={savingManagement || !(transferDepartmentId || selectedProfile.department_id) || (transferDepartmentId || selectedProfile.department_id) === selectedProfile.department_id} onClick={() => void transferSelectedProfile()} className="rounded-lg border border-[#bd8d36]/40 px-3 py-2 text-xs font-semibold text-[#78591d] disabled:opacity-40">Confirm department transfer</button>
          </div>
        )}
      </section>}

      {view === 'administration' && isAdmin && (
        <section aria-labelledby="department-management-heading" className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 id="department-management-heading" className="text-lg font-semibold text-[#263238]">Departments</h2>
          <form onSubmit={(event) => void createDepartment(event)} className="mt-4 flex flex-wrap gap-2">
            <input required value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} placeholder="New department name" className="min-w-56 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238] placeholder:text-[#9aa2a3]" />
            <button disabled={savingManagement} className="rounded-lg bg-[#bd8d36] px-4 py-2 text-xs font-semibold text-[#263238] disabled:opacity-50">Add department</button>
          </form>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {departments.map((department) => (
              <div key={department.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <input aria-label={`Department name ${department.name}`} value={department.name} onChange={(event) => setDepartments((current) => current.map((item) => item.id === department.id ? { ...item, name: event.target.value } : item))} className="min-w-32 flex-1 bg-transparent text-sm text-[#344b51] outline-none" />
                <span className={`text-[10px] uppercase ${department.is_active ? 'text-emerald-700' : 'text-[#768187]'}`}>{department.is_active ? 'Active' : 'Inactive'}</span>
                <button type="button" disabled={savingManagement} onClick={() => void updateDepartment(department, { name: department.name.trim() })} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-[#485a61] disabled:opacity-40">Rename</button>
                <button type="button" disabled={savingManagement} onClick={() => void updateDepartment(department, { is_active: !department.is_active })} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-[#485a61] disabled:opacity-40">{department.is_active ? 'Deactivate' : 'Activate'}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === 'administration' && isAdmin && (
        <section aria-labelledby="group-leader-management-heading" className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 id="group-leader-management-heading" className="text-lg font-semibold text-[#263238]">Group Leader assignments</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[#66777d]">Assign access to one active department using the user&apos;s Supabase Auth UUID. Database RLS permits these assignment writes only for trusted Sevak Administrators.</p>
          <form onSubmit={(event) => void assignGroupLeader(event)} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-xs text-[#66777d]">Supabase Auth user UUID
              <input required value={newGroupLeaderUserId} onChange={(event) => setNewGroupLeaderUserId(event.target.value)} autoComplete="off" placeholder="00000000-0000-0000-0000-000000000000" className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-[#263238]" />
            </label>
            <label className="min-w-52 text-xs text-[#66777d]">Department
              <select required value={newGroupLeaderDepartmentId} onChange={(event) => setNewGroupLeaderDepartmentId(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#263238]">
                <option value="">Choose active department</option>
                {departments.filter((department) => department.is_active).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={savingManagement || !newGroupLeaderUserId.trim() || !newGroupLeaderDepartmentId} className="min-h-10 rounded-lg bg-[#bd8d36] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Assign Group Leader</button>
          </form>
          <div className="mt-5 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#768187]">Current assignments ({groupLeaderAssignments.length})</h3>
            {groupLeaderAssignments.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-xs text-[#768187]">No Group Leader assignments are visible.</p> : groupLeaderAssignments.map((assignment) => (
              <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0"><p className="break-all font-mono text-xs text-[#344b51]">{assignment.user_id}</p><p className="mt-1 text-xs text-[#768187]">{departments.find((department) => department.id === assignment.department_id)?.name ?? 'Inactive or unavailable department'}</p></div>
                <button type="button" disabled={savingManagement} onClick={() => void revokeGroupLeader(assignment)} className="rounded border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Revoke</button>
              </div>
            ))}
          </div>
        </section>
      )}


      </div>
    </main>
    </SevakLayout>
  );
}
