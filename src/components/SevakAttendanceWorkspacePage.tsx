import type { Session } from '@supabase/supabase-js';
import { Activity, ClipboardList, Settings2, UserRoundCheck } from 'lucide-react';
import SevakLayout from './SevakLayout';

const destinations = [
  { title: 'Attendance reports', description: 'Review reporting periods, attendance trends, department totals, and exportable records.', href: '/sevak-attendance/reports', icon: Activity, tone: 'bg-emerald-50 text-emerald-700' },
  { title: 'Manual attendance', description: 'Record attendance and correct saved entries with the workflows available to your role.', href: '/sevak-attendance/manual', icon: ClipboardList, tone: 'bg-sky-50 text-sky-700' },
  { title: 'Sevak profiles', description: 'Search authorized profiles, review profile details, and manage approvals when permitted.', href: '/sevak-attendance/profiles', icon: UserRoundCheck, tone: 'bg-violet-50 text-violet-700' },
  { title: 'Administration', description: 'Manage departments, Group Leader assignments, and attendance teams.', href: '/sevak-attendance/administration', icon: Settings2, tone: 'bg-amber-50 text-amber-700', admin: true },
];

export default function SevakAttendanceWorkspacePage({ session }: { session: Session }) {
  return <SevakLayout session={session} pathname="/sevak-attendance">
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Central HRMS · Attendance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Attendance workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Choose a focused workspace. Each page keeps the actions and information relevant to that task together.</p>
        </header>
        <nav aria-label="Attendance workspace pages" className="grid gap-4 sm:grid-cols-2">
          {destinations.map(({ title, description, href, icon: Icon, tone, admin }) => <a key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md sm:p-6">
            <div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={21} aria-hidden="true" /></span><span><span className="block text-lg font-semibold text-slate-900">{title}</span><span className="mt-2 block text-sm leading-6 text-slate-600">{description}</span>{admin && <span className="mt-3 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Administrator access</span>}</span></div>
          </a>)}
        </nav>
      </div>
    </main>
  </SevakLayout>;
}
