import { useState, type FormEvent } from 'react';
import { ArrowRight, CalendarCheck2, ClipboardList, FileHeart, HeartHandshake, Menu, UserRound, X } from 'lucide-react';
import { supabase } from '../supabase';

type AuthMode = 'login' | 'signup';
type AuthMethod = 'choose' | 'email' | 'phone';

const heroImage = '/gurudev-portrait.jpg';

function getPostAuthPath() {
  const requestedPath = new URLSearchParams(window.location.search).get('next');
  const allowedPaths = ['/sevak-registration', '/sevak/create-profile', '/sevak/my-profile', '/admin', '/group-leader', '/sevak/panel'];
  return requestedPath && allowedPaths.includes(requestedPath) ? requestedPath : '/role-redirect';
}

interface UnifiedAuthProps {
  initialMode: AuthMode;
}

export default function UnifiedAuth({ initialMode }: UnifiedAuthProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [method, setMethod] = useState<AuthMethod>(initialMode === 'login' ? 'email' : 'choose');
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const postAuthPath = getPostAuthPath();
  const postAuthUrl = new URL(postAuthPath, window.location.origin).toString();

  const showError = (text: string) => {
    setIsError(true);
    setMessage(text);
  };

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: postAuthUrl },
      });
      if (error) {
        const providerName = provider === 'facebook' ? 'Facebook' : 'Google';
        showError(`${error.message} Enable ${providerName} in Supabase Dashboard → Authentication → Providers → ${providerName}.`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Please try again.';
      const providerName = provider === 'facebook' ? 'Facebook' : 'Google';
      showError(`${detail} Check Supabase Dashboard → Authentication → Providers → ${providerName}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubOAuth = async () => {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: postAuthUrl },
      });
      if (error) {
        showError(`${error.message} Enable GitHub in Supabase Dashboard → Authentication → Providers → GitHub.`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Please try again.';
      showError(`${detail} Check Supabase Dashboard → Authentication → Providers → GitHub.`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          showError('Passwords do not match.');
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: postAuthUrl },
        });
        if (error) throw error;
        if (data.session) {
          window.location.assign(postAuthPath);
          return;
        }
        setMessage('Account created. Check your email to confirm your account before logging in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        window.location.assign(postAuthPath);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
      if (error) {
        const detail = error.message;
        if (/phone|sms|provider|not enabled|not configured/i.test(detail)) {
          showError(`${detail} Enable Phone authentication and configure an SMS provider in Supabase Dashboard → Authentication → Providers.`);
        } else {
          showError(detail);
        }
        return;
      }
      setOtpSent(true);
      setMessage('OTP sent. Check your phone.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Please try again.';
      showError(`${detail} Check Phone authentication and SMS provider settings in Supabase Dashboard → Authentication → Providers.`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: 'sms',
      });
      if (error) throw error;
      window.location.assign(postAuthPath);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to verify this OTP.');
    } finally {
      setLoading(false);
    }
  };

  const resetMessage = () => {
    setMessage('');
    setIsError(false);
  };

  return (
    <div className="min-h-screen bg-[#f8f7f3] font-sans text-[#263238]">
      {mode === 'signup' && (
        <>
          <div className="border-b border-[#e8e1d1] bg-[#f8f7f3] px-4 py-3 sm:px-8 lg:px-12">
            <nav aria-label="Central HR tools" className="mx-auto grid max-w-7xl grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              {[
                { title: 'Attendance', href: '/sevak-attendance', icon: CalendarCheck2 },
                { title: 'Leave Management', href: '/sevak-dashboard/leave', icon: ClipboardList },
                { title: 'Medical Reports', href: '/sevak-dashboard/medical', icon: FileHeart },
                { title: 'Sevak Profile', href: '/sevak/my-profile', icon: UserRound },
              ].map(({ title, href, icon: Icon }) => (
                <a key={href} href={href} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#e7e2d8] bg-white/70 px-2 py-2.5 text-center text-xs font-semibold text-[#485a61] transition hover:border-[#cbb782] hover:bg-white hover:text-[#78591d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd8d36] sm:px-3 sm:text-sm">
                  <Icon size={16} className="shrink-0" aria-hidden="true" /><span>{title}</span>
                </a>
              ))}
            </nav>
          </div>
          <header className="relative z-20 border-b border-[#e8e8e8] bg-white">
            <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
              <a href="/" className="flex items-center gap-3" aria-label="Central Human Resources home">
                <span className="grid h-11 w-11 place-items-center rounded-full border border-[#dfb252] text-[#bf8c25]"><HeartHandshake size={22} strokeWidth={1.7} /></span>
                <span className="leading-tight"><span className="block text-[11px] font-medium uppercase tracking-[0.21em] text-[#768187]">Art of Living</span><span className="mt-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[#273943] sm:text-base sm:tracking-[0.11em]">Central Human Resources</span></span>
              </a>
              <button type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="rounded-md p-2 text-[#34454d] md:hidden">{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
              <nav aria-label="Main navigation" className={`${menuOpen ? 'absolute inset-x-0 top-full flex border-t border-[#eee] bg-white px-5 py-4 shadow-lg' : 'hidden'} flex-col gap-4 text-sm font-medium text-[#485a61] md:static md:flex md:flex-row md:items-center md:gap-5 md:border-0 md:bg-transparent md:p-0 md:shadow-none lg:gap-7`}>
                <a href="/" className="transition hover:text-[#ba8427]">Home</a>
                <a href="/#sevak-tools" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Sevak Tools</a>
                <a href="/#pillars" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Our Seva</a>
                <a href="/#programs" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Programs</a>
                <a href="/#contact" onClick={() => setMenuOpen(false)} className="transition hover:text-[#ba8427]">Contact</a>
                <a href="/sevak/register" className="hidden text-[#34454d] transition hover:text-[#ba8427] lg:block">Apply as Sevak</a>
                <a href="/login" aria-current="page" className="self-start rounded-full bg-[#bd8d36] px-5 py-2.5 text-xs font-semibold tracking-wide text-white transition hover:bg-[#a77825] md:self-auto">Sign in</a>
              </nav>
            </div>
            {menuOpen && <a href="/sevak/register" onClick={() => setMenuOpen(false)} className="block border-t border-[#eee] px-5 py-3 text-sm font-medium text-[#485a61] md:hidden">Apply as Sevak</a>}
          </header>
        </>
      )}
      <main>
        <section className={`relative isolate overflow-hidden ${mode === 'login' ? 'bg-[#f8f7f3]' : 'bg-[#243b43]'}`}>
          <div className="mx-auto grid min-h-[700px] max-w-7xl items-center gap-9 px-5 py-9 sm:px-8 sm:py-12 lg:min-h-[660px] lg:grid-cols-[1.05fr_0.8fr] lg:gap-16 lg:px-12 lg:py-14">
            <section className="relative isolate mx-auto flex min-h-[320px] w-full max-w-2xl flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#243b43] px-6 py-10 text-center sm:min-h-[360px] sm:px-10 lg:mx-0 lg:min-h-[500px] lg:px-12">
              {mode === 'signup' && (
                <>
                  <img src={heroImage} alt="Gurudev" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
                  <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-[#182c35]/75 via-[#182c35]/55 to-[#182c35]/85" />
                </>
              )}
              {mode === 'signup' && <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f0d391] sm:text-xs">Central Human Resources · Seva</p>}
              <h1 className="font-serif text-3xl leading-[1.12] text-white sm:text-4xl md:text-5xl xl:text-[3.35rem]">
                ⭐ ROOPANTARAN (Central HR)
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/85 sm:text-base sm:leading-8">
                {mode === 'login'
                  ? 'Welcome back. Sign in to continue your seva and connect with the Central HR workspace.'
                  : 'Create an account to begin your seva and connect with the Central HR workspace.'}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.17em] text-[#f0d391] sm:text-sm">
                <span>MIND IN THE PRESENT MOMENT</span><span aria-hidden="true" className="h-px w-9 bg-[#c59a4a]" />
              </div>
              <a href="/sevak-dashboard" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white/85 transition hover:text-white">
                Explore the seva home <ArrowRight size={16} aria-hidden="true" />
              </a>
            </section>

        <section aria-label={mode === 'login' ? 'Sign in' : 'Sign up'} className="mx-auto w-full max-w-[29rem] rounded-2xl border border-white/60 bg-white p-5 text-[#263238] shadow-[0_24px_80px_rgba(10,27,32,0.32)] sm:p-7 lg:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a57d31]">Art of Living · Central HR</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[#2b4149] sm:text-[1.75rem]">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-[#68787c]">
            {mode === 'login' ? 'Sign in to continue to your workspace.' : 'Create an account to get started.'}
          </p>


          {method === 'choose' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setMethod('email'); resetMessage(); }} className="min-h-11 w-full rounded-xl bg-[#bd8d36] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a77825]">Continue with Email</button>
              <button type="button" onClick={() => { setMethod('phone'); resetMessage(); }} className="min-h-11 w-full rounded-xl border border-[#d8d0bd] bg-white px-4 py-3 text-sm font-semibold text-[#485a61] transition hover:border-[#bd8d36] hover:text-[#78591d]">Continue with Phone</button>
            </div>
          )}

          {method === 'email' && (
            <>
              <div className="mb-4 mt-5 flex rounded-xl border border-[#e8e1d1] bg-[#f8f7f3] p-1 text-xs">
                <button type="button" onClick={() => { setMode('login'); resetMessage(); }} className={`flex-1 rounded-lg px-3 py-2.5 font-semibold transition ${mode === 'login' ? 'bg-white text-[#2b4149] shadow-sm' : 'text-[#768187] hover:text-[#485a61]'}`}>Login</button>
                <button type="button" onClick={() => { setMode('signup'); resetMessage(); }} className={`flex-1 rounded-lg px-3 py-2.5 font-semibold transition ${mode === 'signup' ? 'bg-white text-[#2b4149] shadow-sm' : 'text-[#768187] hover:text-[#485a61]'}`}>Sign Up</button>
              </div>
              <form onSubmit={handleEmail} className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium text-[#485a61]"><span>Email address</span><input required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[#d9e0dc] bg-[#fbfcfa] px-3.5 py-3 text-[#263238] outline-none transition placeholder:text-[#9aa5a4] focus:border-[#bd8d36] focus:ring-4 focus:ring-[#bd8d36]/10" /></label>
                <label className="block space-y-1.5 text-sm font-medium text-[#485a61]"><span>Password</span><input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-[#d9e0dc] bg-[#fbfcfa] px-3.5 py-3 text-[#263238] outline-none transition placeholder:text-[#9aa5a4] focus:border-[#bd8d36] focus:ring-4 focus:ring-[#bd8d36]/10" /></label>
                {mode === 'signup' && <label className="block space-y-1.5 text-sm font-medium text-[#485a61]"><span>Confirm password</span><input required type="password" autoComplete="new-password" placeholder="Enter your password again" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-[#d9e0dc] bg-[#fbfcfa] px-3.5 py-3 text-[#263238] outline-none transition placeholder:text-[#9aa5a4] focus:border-[#bd8d36] focus:ring-4 focus:ring-[#bd8d36]/10" /></label>}
                <button type="submit" disabled={loading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#bd8d36] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(189,141,54,0.22)] transition hover:bg-[#a77825] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78591d] disabled:cursor-wait disabled:opacity-60">{loading ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create Account'}{!loading && <ArrowRight size={16} aria-hidden="true" />}</button>
              </form>
              <button type="button" onClick={() => { setMethod('phone'); resetMessage(); }} className="mt-3 w-full py-1 text-center text-xs font-semibold text-[#9b742c] transition hover:text-[#78591d]">Sign in with phone instead</button>
            </>
          )}

          {method === 'phone' && (
            <div className="mt-5 space-y-4">
              <form onSubmit={handleSendOtp} className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium text-[#485a61]"><span>Phone number</span><input required type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-xl border border-[#d9e0dc] bg-[#fbfcfa] px-3.5 py-3 text-[#263238] outline-none transition placeholder:text-[#9aa5a4] focus:border-[#bd8d36] focus:ring-4 focus:ring-[#bd8d36]/10" /></label>
                <button type="submit" disabled={loading} className="min-h-12 w-full rounded-xl bg-[#bd8d36] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#a77825] disabled:cursor-wait disabled:opacity-60">{loading ? 'Sending…' : 'Send OTP'}</button>
              </form>
              {otpSent && <form onSubmit={handleVerifyOtp} className="space-y-3">
                <label className="block space-y-1.5 text-sm font-medium text-[#485a61]"><span>Verification code</span><input required inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} className="w-full rounded-xl border border-[#d9e0dc] bg-[#fbfcfa] px-3.5 py-3 text-[#263238] outline-none transition focus:border-[#bd8d36] focus:ring-4 focus:ring-[#bd8d36]/10" /></label>
                <button type="submit" disabled={loading} className="min-h-12 w-full rounded-xl border border-[#d8d0bd] bg-white px-4 py-3 text-sm font-semibold text-[#485a61] transition hover:border-[#bd8d36] disabled:cursor-wait disabled:opacity-60">{loading ? 'Verifying…' : 'Verify OTP'}</button>
              </form>}
              <button type="button" onClick={() => { setMethod('email'); resetMessage(); }} className="w-full py-1 text-center text-xs font-semibold text-[#9b742c] transition hover:text-[#78591d]">Sign in with email instead</button>
            </div>
          )}

          {message && <p role={isError ? 'alert' : 'status'} className={`mt-4 rounded-xl border p-3 text-sm leading-5 ${isError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message}</p>}
          <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9aa3a0]">
            <span className="h-px flex-1 bg-[#e8e1d1]" />Or continue with<span className="h-px flex-1 bg-[#e8e1d1]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={loading} onClick={() => handleOAuth('google')} className="min-h-10 rounded-xl border border-[#dce2de] bg-white px-2 py-2.5 text-xs font-semibold text-[#485a61] transition hover:border-[#bd8d36] hover:bg-[#fcfbf7] disabled:cursor-wait disabled:opacity-60">Google</button>
            <button type="button" disabled={loading} onClick={() => handleOAuth('facebook')} className="min-h-10 rounded-xl border border-[#dce2de] bg-white px-2 py-2.5 text-xs font-semibold text-[#485a61] transition hover:border-[#bd8d36] hover:bg-[#fcfbf7] disabled:cursor-wait disabled:opacity-60">Facebook</button>
            <button type="button" disabled={loading} onClick={handleGitHubOAuth} className="min-h-10 rounded-xl border border-[#dce2de] bg-white px-2 py-2.5 text-xs font-semibold text-[#485a61] transition hover:border-[#bd8d36] hover:bg-[#fcfbf7] disabled:cursor-wait disabled:opacity-60">GitHub</button>
          </div>
          <p className="mt-5 border-t border-[#ece9e2] pt-4 text-center text-sm text-[#68787c]">
            {mode === 'login' ? <>New to Central HR? <button type="button" onClick={() => { setMode('signup'); setMethod('email'); resetMessage(); }} className="font-semibold text-[#9b742c] transition hover:text-[#78591d]">Create an account</button></> : <>Already have an account? <button type="button" onClick={() => { setMode('login'); setMethod('email'); resetMessage(); }} className="font-semibold text-[#9b742c] transition hover:text-[#78591d]">Sign in</button></>}
          </p>
          <p className="mt-3 text-center text-xs text-[#768187]">Register as a Sevak? <a href="/sevak/register" className="font-semibold text-[#9b742c] transition hover:text-[#78591d]">Open the Sevak portal</a></p>
        </section>
      </div>
      </section>
      </main>
    </div>
  );
}
