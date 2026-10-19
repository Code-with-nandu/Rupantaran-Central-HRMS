import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, HeartHandshake, ShieldCheck, UsersRound } from 'lucide-react';
import { supabase } from '../supabase';

const roleCards = [
  {
    title: 'Admin Dashboard',
    description: 'Administration, attendance oversight, department management, and trusted role assignments.',
    destination: '/admin',
    icon: ShieldCheck,
    tone: 'bg-[#f7efe0] text-[#9b742c]',
    action: 'Continue as Admin',
  },
  {
    title: 'Group Leader Dashboard',
    description: 'Department responsibilities, approved Sevak teams, and scoped attendance workflows.',
    destination: '/group-leader',
    icon: UsersRound,
    tone: 'bg-[#eaf2f0] text-[#42665f]',
    action: 'Continue as Group Leader',
  },
  {
    title: 'Sevak Dashboard',
    description: 'Your own Sevak profile, saved photo, attendance history, and seva resources.',
    destination: '/sevak/panel',
    icon: HeartHandshake,
    tone: 'bg-[#f1edf6] text-[#725c86]',
    action: 'Continue as Sevak',
  },
];

export default function RoleSelectionPage() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active) setSession(error ? null : data.session);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#f8f7f3] px-4 py-8 text-[#263238] sm:px-6 sm:py-12 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center gap-3" aria-label="BigBro public home">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-[#dfb252] text-[#bf8c25]"><HeartHandshake size={22} strokeWidth={1.7} /></span>
            <span><span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-[#768187]">BigBro</span><span className="mt-1 block text-sm font-semibold uppercase tracking-[0.11em] text-[#273943]">Central Human Resources</span></span>
          </a>
          <a href={session ? '/' : '/login'} className="rounded-full border border-[#d8d0bd] bg-white px-4 py-2.5 text-xs font-semibold text-[#485a61] transition hover:border-[#bd8d36] hover:text-[#78591d]">{session ? 'Public home' : 'Sign in'}</a>
        </header>

        <section className="mt-12 rounded-[1.75rem] bg-[#243b43] px-6 py-10 text-center text-white shadow-sm sm:mt-16 sm:px-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f0d391]">Your BigBro workspace</p>
          <h1 className="mx-auto mt-4 max-w-3xl font-serif text-3xl leading-tight sm:text-4xl lg:text-5xl">Choose the dashboard you need</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/75 sm:text-base sm:leading-7">Continue to the right workspace. Your account permissions are checked before any protected dashboard or information is shown.</p>
        </section>

        <section aria-label="Choose a dashboard" className="mt-7 grid gap-4 md:mt-8 md:grid-cols-3 md:gap-5">
          {roleCards.map(({ title, description, destination, icon: Icon, tone, action }) => {
            const href = session ? destination : `/login?next=${encodeURIComponent(destination)}`;
            return (
              <article key={title} className="flex min-h-[290px] flex-col rounded-2xl border border-[#e8e1d1] bg-white p-6 shadow-[0_12px_35px_rgba(44,56,54,0.06)] transition hover:-translate-y-0.5 hover:border-[#cbb782] hover:shadow-[0_16px_40px_rgba(44,56,54,0.1)] sm:p-7">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone}`}><Icon size={23} strokeWidth={1.8} aria-hidden="true" /></span>
                <h2 className="mt-5 font-serif text-xl font-semibold text-[#2b4149] sm:text-2xl">{title}</h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-[#68787c]">{description}</p>
                <a href={href} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#bd8d36] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a77825] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78591d]">{action}<ArrowRight size={16} aria-hidden="true" /></a>
              </article>
            );
          })}
        </section>

        <p className="mx-auto mt-7 max-w-3xl text-center text-xs leading-5 text-[#768187]">Choosing a card does not grant access. Each destination verifies your signed-in account and its existing Supabase permissions.</p>
      </div>
    </main>
  );
}
