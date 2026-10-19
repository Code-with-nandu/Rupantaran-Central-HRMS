import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarCheck2, ClipboardCheck, Users, UserRound, CircleAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabase';

type VerifiedRole = 'admin' | 'group_leader' | 'sevak' | 'missing' | 'error';
type RequestedRole = VerifiedRole | 'landing' | 'attendance';

interface RoleDashboardGateProps {
  session: Session;
  requestedRole: RequestedRole;
  children?: ReactNode;
}

const homeForRole: Record<'admin' | 'group_leader' | 'sevak', string> = {
  admin: '/admin',
  group_leader: '/group-leader',
  sevak: '/sevak/panel',
};

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function RoleDashboardGate({ session, requestedRole, children }: RoleDashboardGateProps) {
  const [role, setRole] = useState<VerifiedRole | null>(null);
  const [error, setError] = useState('');
  const localLoadingPreview = import.meta.env.DEV
    && requestedRole === 'landing'
    && new URLSearchParams(window.location.search).get('preview') === 'loading';

  useEffect(() => {
    let active = true;
    setRole(null);
    setError('');
    if (localLoadingPreview) return () => { active = false; };
    void (async () => {
      try {
        const adminResult = await supabase.rpc('has_sevak_admin_role');
        if (!active) return;
        if (adminResult.error) throw adminResult.error;
        if (adminResult.data === true) {
          setRole('admin');
          return;
        }
        const assignmentsResult = await supabase.from('sevak_role_assignments').select('department_id')
          .eq('user_id', session.user.id).eq('role', 'group_leader');
        if (!active) return;
        if (assignmentsResult.error) throw assignmentsResult.error;
        const assignments = assignmentsResult.data ?? [];
        if (assignments.length > 0) {
          setRole('group_leader');
          return;
        }
        const profileResult = await supabase.rpc('get_my_sevak_profile');
        if (!active) return;
        if (profileResult.error) throw profileResult.error;
        const profileRows = profileResult.data as Array<{ id: string }> | { id: string } | null;
        const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
        setRole(profile?.id ? 'sevak' : 'missing');
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Your account role could not be verified.');
        setRole('error');
      }
    })();
    return () => { active = false; };
  }, [session.user.id, localLoadingPreview]);

  useEffect(() => {
    if (!localLoadingPreview && requestedRole === 'landing' && role && ['admin', 'group_leader', 'sevak'].includes(role)) {
      window.location.replace(homeForRole[role as 'admin' | 'group_leader' | 'sevak']);
    }
  }, [localLoadingPreview, requestedRole, role]);

  if (localLoadingPreview) return <RoleMessage title="Checking access" message="Verifying your role with the signed-in account…" />;
  if (!role) return <RoleMessage title="Checking access" message="Verifying your role with the signed-in account…" />;
  if (role === 'error') return <RoleMessage title="Access could not be verified" message={error} />;
  if (role === 'missing') {
    return <RoleMessage title="No Sevak dashboard is available" message="This account has no administrator or Group Leader assignment and no Sevak profile." link={{ href: '/sevak/create-profile', label: 'Create Sevak profile' }} />;
  }
  if (requestedRole === 'landing') return <RoleMessage title="Opening your dashboard" message="Your verified role is ready. Redirecting…" />;
  if (requestedRole === 'attendance') return <>{children}</>;
  if (role !== requestedRole) {
    const destination = homeForRole[role];
    return <RoleMessage title="This dashboard is not available to your role" message="Your signed-in account does not have access to this dashboard." link={{ href: destination, label: 'Open your dashboard' }} />;
  }
  return <>{children}</>;
}

export function GroupLeaderDashboard({ session }: { session: Session }) {
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [activeSevakCount, setActiveSevakCount] = useState<number | null>(null);
  const [attendanceCount, setAttendanceCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data: assignments, error: assignmentError } = await supabase.from('sevak_role_assignments')
          .select('department_id').eq('user_id', session.user.id).eq('role', 'group_leader');
        if (assignmentError) throw assignmentError;
        const ids = [...new Set((assignments ?? []).map((item) => item.department_id).filter(Boolean))];
        if (!active) return;
        if (ids.length === 0) {
          setDepartments([]);
          setActiveSevakCount(0);
          setAttendanceCount(0);
          setLoading(false);
          return;
        }
        const today = todayInIndia();
        const monthStart = `${today.slice(0, 7)}-01`;
        const [departmentResult, profileResult, attendanceResult] = await Promise.all([
          supabase.from('sevak_departments').select('id, name').in('id', ids).order('name'),
          supabase.from('sevak_profiles').select('id', { count: 'exact', head: true })
            .in('department_id', ids).ilike('status', 'active').eq('approval_status', 'approved'),
          supabase.from('sevak_attendance').select('id', { count: 'exact', head: true })
            .in('department_id', ids).gte('attendance_date', monthStart).lte('attendance_date', today),
        ]);
        if (departmentResult.error || profileResult.error || attendanceResult.error) {
          throw departmentResult.error ?? profileResult.error ?? attendanceResult.error;
        }
        if (!active) return;
        setDepartments(departmentResult.data ?? []);
        setActiveSevakCount(profileResult.count ?? 0);
        setAttendanceCount(attendanceResult.count ?? 0);
        setLoading(false);
      } catch (cause) {
        if (!active) return;
        setLoadError(cause instanceof Error ? cause.message : 'Department summary could not be loaded.');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session.user.id]);

  return (
    <main className="min-h-screen bg-[#f8f7f3] px-5 py-10 text-[#263238] sm:px-8 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl bg-[#243b43] p-6 text-white sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f0d391]">BigBro · Group Leader</p>
          <h1 className="mt-3 text-3xl font-semibold">Department workspace</h1>
          <p className="mt-2 text-sm text-white/75">Signed in as {session.user.email ?? 'authenticated user'}. Department visibility is also enforced by Supabase RLS.</p>
        </header>
        {loadError && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Department data could not be loaded: {loadError}</p>}
        <section aria-label="Assigned departments" className="mt-6 grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Assigned departments" value={loading ? '…' : String(departments.length)} icon={<Users size={19} />} />
          <SummaryCard label="Active approved Sevaks" value={loading ? '…' : String(activeSevakCount ?? '—')} icon={<UserRound size={19} />} />
          <SummaryCard label="Attendance records this month" value={loading ? '…' : String(attendanceCount ?? '—')} icon={<CalendarCheck2 size={19} />} />
        </section>
        {!loading && departments.length === 0 && !loadError && <p className="mt-6 rounded-xl border border-[#e8e1d1] bg-white p-5 text-sm text-[#66777d]">No active department is assigned to this account. Ask an administrator to assign a department.</p>}
        {departments.length > 0 && <section className="mt-6 rounded-2xl border border-[#e8e1d1] bg-white p-5 sm:p-7"><h2 className="font-semibold">Your departments</h2><ul className="mt-3 flex flex-wrap gap-2">{departments.map((department) => <li key={department.id} className="rounded-full bg-[#f4efe3] px-4 py-2 text-sm font-medium text-[#78591d]">{department.name}</li>)}</ul></section>}
        <nav aria-label="Group Leader tools" className="mt-6 grid gap-4 sm:grid-cols-2">
          <DashboardLink href="/sevak-attendance" icon={<ClipboardCheck size={20} />} title="Attendance overview" description="Review scoped attendance records and department history." />
          <DashboardLink href="/sevak-attendance/manual" icon={<CalendarCheck2 size={20} />} title="Record attendance" description="Find an approved Sevak and record attendance for your department." />
        </nav>
      </div>
    </main>
  );
}

export function AdminDashboardNavigation() {
  return (
    <nav aria-label="Admin navigation" className="flex flex-wrap gap-2 border-b border-white/10 bg-[#050508] px-4 py-3 text-white sm:px-6 lg:px-8">
      <a href="/admin" aria-current="page" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold"><ShieldCheck size={16} aria-hidden="true" />Admin Dashboard</a>
      <a href="/sevak-attendance" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"><CalendarCheck2 size={16} aria-hidden="true" />Sevak Attendance</a>
    </nav>
  );
}

export function DashboardLink({ href, icon, title, description }: { href: string; icon: ReactNode; title: string; description: string }) {
  return <a href={href} className="rounded-2xl border border-[#e8e1d1] bg-white p-5 transition hover:border-[#cbb782] hover:shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4efe3] text-[#9b742c]">{icon}</span><span className="mt-4 block font-semibold text-[#334950]">{title}</span><span className="mt-1 block text-sm leading-6 text-[#66777d]">{description}</span></a>;
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="rounded-2xl border border-[#e8e1d1] bg-white p-5"><span className="flex items-center justify-between text-[#9b742c]"><span className="text-sm font-medium text-[#66777d]">{label}</span>{icon}</span><strong className="mt-3 block text-3xl font-semibold text-[#263c45]">{value}</strong></div>;
}

function RoleMessage({ title, message, link }: { title: string; message: string; link?: { href: string; label: string } }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f8f7f3] px-5 py-12 text-[#263238]"><section className="w-full max-w-xl rounded-2xl border border-[#e8e1d1] bg-white p-7 shadow-sm sm:p-9"><CircleAlert className="text-[#a47c30]" size={25} /><h1 className="mt-4 text-2xl font-semibold">{title}</h1><p role="status" className="mt-3 text-sm leading-6 text-[#66777d]">{message}</p>{link && <a href={link.href} className="mt-6 inline-flex rounded-lg bg-[#bd8d36] px-4 py-2.5 text-sm font-semibold text-white">{link.label}</a>}</section></main>;
}
