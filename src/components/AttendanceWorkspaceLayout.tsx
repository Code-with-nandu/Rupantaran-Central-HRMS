import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Activity, CalendarCheck2, ClipboardList, LayoutDashboard, Menu, Settings2, UserRoundCheck, X } from 'lucide-react';
import { supabase } from '../supabase';

interface Props {
  session?: Session;
  pathname: string;
  children: ReactNode;
}

const links = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, group: 'Main' },
  { label: 'Attendance workspace', href: '/sevak-attendance', icon: ClipboardList, group: 'Workspace' },
  { label: 'Sevak Profiles', href: '/sevak-attendance/profiles', icon: UserRoundCheck, group: 'Manage' },
  { label: 'Attendance', href: '/sevak-attendance/manual', icon: CalendarCheck2, group: 'Manage' },
  { label: 'Department & Team Management', href: '/sevak-attendance/administration', icon: Settings2, group: 'Manage' },
  { label: 'Reports', href: '/sevak-attendance/reports', icon: Activity, group: 'Manage' },
];

export default function AttendanceWorkspaceLayout({ session, pathname, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const metadata = session?.user.user_metadata ?? {};
  const name = metadata.full_name || metadata.name || [metadata.first_name, metadata.last_name].filter(Boolean).join(' ');
  const signOut = async () => {
    if (!session) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);
    if (error) console.error('Unable to log out:', error.message);
  };
  const activePath = pathname === '/sevak-attendance' && window.location.hash === '#monthly-attendance-heading'
    ? '/sevak-attendance/reports'
    : pathname === '/sevak-attendance' && window.location.hash === '#attendance-heading'
      ? '/sevak-attendance/manual'
      : pathname;
  const navItems = (mobile = false) => {
    let currentGroup = '';
    return links.map(({ label, href, icon: Icon, group }) => {
      const showGroup = currentGroup !== group;
      currentGroup = group;
      const active = activePath === href;
      return <div key={href}>
        {showGroup && <p className={`px-3 ${mobile ? 'pt-4' : 'pt-6'} pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400`}>{group}</p>}
        <a href={href} onClick={() => setMenuOpen(false)} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${active ? 'bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-100' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
          <Icon size={18} className="shrink-0" aria-hidden="true" /><span className="min-w-0 whitespace-normal">{label}</span>
        </a>
      </div>;
    });
  };

  return <div className="min-h-screen bg-slate-50 pt-10 font-sans text-slate-800 lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
    <aside className="sticky top-10 hidden h-[calc(100vh-2.5rem)] flex-col bg-[#101c32] px-4 pb-5 text-white lg:flex">
      <a href="/sevak-attendance" className="flex min-h-[76px] items-center gap-3 border-b border-white/10 px-2" aria-label="Rupantaran Central HRMS attendance workspace">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-extrabold text-emerald-300">R</span>
        <span className="min-w-0 leading-tight"><span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">ROOPANTARAN</span><span className="mt-1 block text-sm font-semibold">Central HRMS</span></span>
      </a>
      <nav aria-label="Attendance workspace navigation" className="mt-2 flex-1 space-y-1 overflow-y-auto py-2">{navItems()}</nav>
      {session && <button type="button" onClick={() => void signOut()} disabled={signingOut} className="mt-4 rounded-lg border border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50">{signingOut ? 'Signing out…' : `Sign out${name ? ` · ${name}` : ''}`}</button>}
    </aside>

    <div className="min-w-0">
      <header className="sticky top-10 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" aria-label={menuOpen ? 'Close attendance menu' : 'Open attendance menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-[#101c32] hover:bg-slate-50 lg:hidden">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          <span className="min-w-0"><span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">ROOPANTARAN</span><span className="block truncate text-sm font-semibold text-[#101c32] sm:text-base">Central HRMS · Attendance</span></span>
        </div>
        <div className="ml-3 flex items-center gap-3">{name && <span className="hidden max-w-48 truncate text-sm font-medium text-slate-600 sm:block">{name}</span>}{session && <button type="button" onClick={() => void signOut()} disabled={signingOut} className="rounded-lg bg-[#101c32] px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 sm:hidden">{signingOut ? '…' : 'Sign out'}</button>}</div>
      </header>
      {menuOpen && <div className="fixed inset-x-0 bottom-0 top-10 z-50 bg-slate-950/40 lg:hidden" onClick={() => setMenuOpen(false)}>
        <aside className="h-full w-[min(86vw,320px)] overflow-y-auto bg-[#101c32] px-4 pb-6 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex min-h-[76px] items-center justify-between border-b border-white/10 px-2"><a href="/sevak-attendance" className="text-sm font-semibold">ROOPANTARAN <span className="text-emerald-300">· Central HRMS</span></a><button type="button" onClick={() => setMenuOpen(false)} aria-label="Close attendance menu" className="rounded-lg p-2 hover:bg-white/10"><X size={19} /></button></div>
          <nav aria-label="Attendance workspace navigation" className="mt-2 space-y-1">{navItems(true)}</nav>
        </aside>
      </div>}
      <div className="min-w-0">{children}</div>
    </div>
  </div>;
}
