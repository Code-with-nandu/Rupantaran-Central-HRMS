import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarCheck2, ClipboardList, FileHeart, HeartHandshake, Menu, UserRound, X } from 'lucide-react';
import { supabase } from '../supabase';

interface SevakLayoutProps { session?: Session; pathname: string; children: ReactNode }

const features = [
  { title: 'Attendance', href: '/sevak-attendance', icon: CalendarCheck2 },
  { title: 'Leave Management', href: '/sevak-dashboard/leave', icon: ClipboardList },
  { title: 'Medical Reports', href: '/sevak-dashboard/medical', icon: FileHeart },
  { title: 'Sevak Profile', href: '/sevak/my-profile', icon: UserRound },
];

export default function SevakLayout({ session, pathname, children }: SevakLayoutProps) {
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

  return (
    <div className="min-h-screen bg-white font-sans text-[#263238]">
      <div className="border-b border-[#e8e1d1] bg-[#f8f7f3] px-4 py-3 sm:px-8 lg:px-12">
        <nav aria-label="Sevak dashboard tools" className="mx-auto grid max-w-7xl grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          {features.map(({ title, href, icon: Icon }) => {
            const active = pathname === href;
            return <a key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-center text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd8d36] sm:px-3 sm:text-sm ${active ? 'border-[#bd8d36] bg-white text-[#78591d] shadow-sm' : 'border-[#e7e2d8] bg-white/70 text-[#485a61] hover:border-[#cbb782] hover:bg-white hover:text-[#78591d]'}`}>
              <Icon size={16} className="shrink-0" aria-hidden="true" /><span>{title}</span>
            </a>;
          })}
        </nav>
      </div>
      <header className="relative z-20 border-b border-[#e8e8e8] bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="/sevak-dashboard" className="flex items-center gap-3" aria-label="Central Human Resources home"><span className="grid h-11 w-11 place-items-center rounded-full border border-[#dfb252] text-[#bf8c25]"><HeartHandshake size={22} strokeWidth={1.7} /></span><span className="leading-tight"><span className="block text-[11px] font-medium uppercase tracking-[0.21em] text-[#768187]">Art of Living</span><span className="mt-1 block text-sm font-semibold uppercase tracking-[0.11em] text-[#273943] sm:text-base">Central Human Resources</span></span></a>
          <button type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="rounded-md p-2 text-[#34454d] md:hidden">{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
          <nav aria-label="Main navigation" className={`${menuOpen ? 'absolute inset-x-0 top-full flex border-t border-[#eee] bg-white px-5 py-4 shadow-lg' : 'hidden'} flex-col gap-4 text-sm font-medium text-[#485a61] md:static md:flex md:flex-row md:items-center md:gap-7 md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
            <a href="/sevak-dashboard" className="transition hover:text-[#ba8427]">Home</a><a href="#sevak-tools" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Sevak Tools</a><a href="#pillars" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Our Seva</a><a href="#programs" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Programs</a><a href="#contact" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Contact</a><span className="hidden h-6 w-px bg-[#e2e5e5] md:block" />{session ? <><a href="/sevak/my-profile" className="text-[#34454d] transition hover:text-[#ba8427]">{name || 'My Profile'}</a><button type="button" onClick={() => void signOut()} disabled={signingOut} className="self-start rounded-full bg-[#bd8d36] px-5 py-2.5 text-xs font-semibold tracking-wide text-white transition hover:bg-[#a77825] disabled:opacity-60 md:self-auto">{signingOut ? 'Signing out…' : 'Sign out'}</button></> : <><a href="/sevak/register" className="text-[#34454d] transition hover:text-[#ba8427]">Apply as Sevak</a><a href="/login?next=%2Fsevak%2Fmy-profile" className="rounded-full bg-[#bd8d36] px-5 py-2.5 text-xs font-semibold tracking-wide text-white transition hover:bg-[#a77825]">Sign in</a></>}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

