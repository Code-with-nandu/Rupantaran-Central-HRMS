import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { isLegacySamplePhotoPath, resolveSevakProfilePhotoUrl } from '../utils/sevakProfilePhoto.mjs';
import SevakDashboardFooter from './SevakDashboardFooter';
import SevakLayout from './SevakLayout';

interface SevakDepartment {
  id: string;
  name: string;
  is_active: boolean;
}

interface OwnedSevakProfile {
  id: string;
  sevak_id: string;
  name: string;
  mobile: string;
  department: string;
  department_id: string;
  profile_picture: string | null;
  status: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
}

interface OwnAttendanceRecord {
  id: string;
  attendance_date: string;
  attendance_type: string;
  status: string;
  check_in_time: string | null;
}

const inputClass = 'mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-amber-400/60';
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const PROFILE_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function normalizeMobile(value: string) {
  return value.trim().replace(/[\s().-]/g, '');
}

async function removeOwnProfilePhoto(path: string) {
  try {
    const { error } = await supabase.storage.from('sevak-profiles').remove([path]);
    if (error) logSupabaseError('profile photo cleanup', error);
    return Boolean(error);
  } catch (error) {
    if (error instanceof Error) logSupabaseError('profile photo cleanup', error);
    return true;
  }
}

function logSupabaseError(stage: string, error: {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
}) {
  if (import.meta.env.DEV) {
    // Keep diagnostics useful without logging Auth sessions, profile values, or
    // the full Supabase error object (which may contain row details).
    console.error(`[Sevak Registration] ${stage}`, {
      code: error.code ?? 'NO_ERROR_CODE',
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
  }
}

function friendlyProfileError(message: string, code?: string) {
  if (code === '23505' && /auth_user_id_uidx/i.test(message)) return 'This signed-in account is already linked to a Sevak profile. Open My Profile or contact an administrator if it is not yours.';
  if (code === '23505') return 'A duplicate profile value already exists. If you already submitted a profile, open My Profile; otherwise contact an administrator.';
  if (code === '23502') return 'A required profile field was not accepted by the database. Check your name and department, then retry; if this continues, contact an administrator.';
  if (code === '23503') return 'The selected department is no longer available. Reload the page and choose an active department.';
  if (code === '23514' || code === '22023') return 'The database rejected one of the profile values. Check your name, mobile number, and active department, then retry.';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return 'Supabase did not allow this profile change. Confirm the self-registration migration is applied and try again.';
  if (code === 'PGRST202' || code === 'PGRST204' || /could not find the function|column .* does not exist|schema cache/i.test(message)) return 'The self-registration database migration is not applied yet. Ask an administrator to apply the new migration.';
  return 'The profile could not be saved. Check the required fields and try again.';
}

interface SevakSelfRegistrationPageProps {
  page: 'create-profile' | 'my-profile';
}

export default function SevakSelfRegistrationPage({ page }: SevakSelfRegistrationPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [departments, setDepartments] = useState<SevakDepartment[]>([]);
  const [profile, setProfile] = useState<OwnedSevakProfile | null>(null);
  const [ownAttendance, setOwnAttendance] = useState<OwnAttendanceRecord[]>([]);
  const [ownAttendanceLoading, setOwnAttendanceLoading] = useState(false);
  const [ownAttendanceError, setOwnAttendanceError] = useState('');
  const [form, setForm] = useState({ name: '', mobile: '', department_id: '' });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [savedPhotoUrl, setSavedPhotoUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoSavedNotice, setPhotoSavedNotice] = useState('');
  const [removeSavedPhoto, setRemoveSavedPhoto] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraVideo = useRef<HTMLVideoElement>(null);
  const cameraMounted = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoRefreshAttempted = useRef(false);

  const stopCamera = () => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraOpen(false);
  };

  useEffect(() => {
    cameraMounted.current = true;
    return () => {
      cameraMounted.current = false;
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !cameraVideo.current || !cameraStream.current) return;
    cameraVideo.current.srcObject = cameraStream.current;
    void cameraVideo.current.play().catch(() => {
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
      if (!cameraMounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream.current = stream;
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
    const video = cameraVideo.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
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
      if (!blob.size || blob.size > MAX_PROFILE_PHOTO_BYTES) {
        setCameraError('The captured image is larger than 2 MB. Try again or choose a smaller photo.');
        return;
      }
      setSelectedPhoto(new File([blob], `sevak-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setRemoveSavedPhoto(false);
      setCameraError('');
      stopCamera();
    }, 'image/jpeg', 0.85);
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [photoNotice, setPhotoNotice] = useState('');
  const [mobileDuplicateNotice, setMobileDuplicateNotice] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!selectedPhoto) {
      setPhotoPreviewUrl('');
      return;
    }
    const preview = URL.createObjectURL(selectedPhoto);
    setPhotoPreviewUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [selectedPhoto]);

  useEffect(() => {
    let active = true;
    setSavedPhotoUrl('');
    setPhotoError('');
    photoRefreshAttempted.current = false;
    const photoPath = profile?.profile_picture;
    if (!photoPath || !session) return;
    void resolveSevakProfilePhotoUrl(supabase.storage, photoPath).then((photoUrl) => {
      if (!active) return;
      setSavedPhotoUrl(photoUrl);
    }).catch(() => {
      if (active) setPhotoError('Your saved profile photo could not be loaded. You can still submit profile details.');
    });
    return () => { active = false; };
  }, [profile?.profile_picture, session]);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(error ? null : data.session);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!session) {
      setLoading(false);
      setProfile(null);
      return;
    }
    let active = true;
    setLoading(true);
    setErrorMessage('');
    void Promise.all([
      supabase.from('sevak_departments').select('id, name, is_active').eq('is_active', true).order('name'),
      supabase.rpc('get_my_sevak_profile'),
    ]).then(([departmentResult, profileResult]) => {
      if (!active) return;
      if (departmentResult.error || profileResult.error) {
        const err = departmentResult.error ?? profileResult.error!;
        setErrorMessage(friendlyProfileError(err.message, err.code));
        setLoading(false);
        return;
      }
      const loadedDepartments = (departmentResult.data ?? []) as SevakDepartment[];
      const ownedProfile = ((profileResult.data as OwnedSevakProfile[] | null) ?? [])[0] ?? null;
      setDepartments(loadedDepartments);
      setProfile(ownedProfile);
      if (page === 'create-profile' && ownedProfile && ownedProfile.approval_status !== 'rejected') {
        window.location.replace('/sevak/my-profile');
        return;
      }
      if (ownedProfile) {
        setForm({
          name: ownedProfile.name,
          mobile: ownedProfile.mobile,
          department_id: ownedProfile.department_id,
        });
      } else {
        setForm((current) => ({ ...current, department_id: current.department_id || loadedDepartments[0]?.id || '' }));
      }
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setErrorMessage('Could not load registration data. Check your connection and retry.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [authReady, session, retryKey, page]);

  useEffect(() => {
    let active = true;
    if (page !== 'my-profile' || !session || !profile) {
      setOwnAttendance([]);
      setOwnAttendanceLoading(false);
      setOwnAttendanceError('');
      return () => { active = false; };
    }

    setOwnAttendanceLoading(true);
    setOwnAttendanceError('');
    void (async () => {
      try {
        const { data, error } = await supabase.from('sevak_attendance')
          .select('id, attendance_date, attendance_type, status, check_in_time')
          .eq('sevak_id', profile.id)
          .order('attendance_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(0, 199);
        if (!active) return;
        if (error) {
          setOwnAttendance([]);
          setOwnAttendanceError(error.code === '42501' || /row-level security|permission denied/i.test(error.message)
            ? 'Attendance history is not available under the current account permissions. Ask an administrator to apply the Sevak attendance access migration.'
            : error.message);
        } else {
          setOwnAttendance((data ?? []) as OwnAttendanceRecord[]);
        }
        setOwnAttendanceLoading(false);
      } catch (error: unknown) {
        if (!active) return;
        setOwnAttendanceError(error instanceof Error ? error.message : 'Could not load your attendance history.');
        setOwnAttendanceLoading(false);
      }
    })();
    return () => { active = false; };
  }, [page, profile?.id, session]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    const mobile = normalizeMobile(form.mobile);
    if (!/^\+?[1-9][0-9]{6,14}$/.test(mobile)) {
      setErrorMessage('Enter a valid mobile number with 7 to 15 digits, optionally starting with + and a country code.');
      return;
    }
    if (!departments.some((department) => department.id === form.department_id)) {
      setErrorMessage('Choose an active department from the list.');
      return;
    }
    if (selectedPhoto && (!PROFILE_PHOTO_TYPES[selectedPhoto.type] || selectedPhoto.size > MAX_PROFILE_PHOTO_BYTES || selectedPhoto.size === 0)) {
      setErrorMessage('Choose a JPEG, PNG, or WebP image no larger than 2 MB.');
      return;
    }

    let mobileQuery = supabase.from('sevak_profiles').select('id', { count: 'exact', head: true }).eq('mobile', mobile);
    if (profile) mobileQuery = mobileQuery.neq('id', profile.id);
    const { count: matchingMobiles, error: mobileCheckError } = await mobileQuery;
    setMobileDuplicateNotice(mobileCheckError
      ? 'A duplicate mobile check was unavailable. Shared numbers are permitted, so you may continue.'
      : (matchingMobiles ?? 0) > 0
      ? 'Another visible profile uses this mobile number. Shared numbers are allowed; confirm this is correct.'
      : '');

    setSaving(true);
    setErrorMessage('');
    setPhotoNotice('');
    const fields = {
      name: form.name.trim(),
      mobile,
      status: 'inactive',
    };
    const operation = profile ? 'profile update' : 'profile insert';
    const result = profile
      ? await supabase.from('sevak_profiles').update(fields).eq('id', profile.id)
        .select('id, sevak_id, name, mobile, department, department_id, profile_picture, status, approval_status, rejection_reason').single()
      : await supabase.from('sevak_profiles').insert({ ...fields, department_id: form.department_id, auth_user_id: session.user.id })
        .select('id, sevak_id, name, mobile, department, department_id, profile_picture, status, approval_status, rejection_reason').single();
    if (result.error) {
      logSupabaseError(operation, result.error);
      setSaving(false);
      setErrorMessage(friendlyProfileError(result.error.message, result.error.code));
      return;
    }
    const savedProfile = result.data as OwnedSevakProfile;
    let nextPhotoPath = savedProfile.profile_picture;
    let photoWarning = '';
    if (selectedPhoto) {
      const extension = PROFILE_PHOTO_TYPES[selectedPhoto.type];
      const photoPath = `${savedProfile.sevak_id}/profile-${crypto.randomUUID()}.${extension}`;
      try {
        const upload = await supabase.storage.from('sevak-profiles').upload(photoPath, selectedPhoto, {
          cacheControl: '3600',
          contentType: selectedPhoto.type,
          upsert: false,
        });
        if (upload.error) {
          logSupabaseError('profile photo upload', upload.error);
          photoWarning = 'Your profile was submitted, but the optional photo upload failed. You can continue without a photo and retry with an administrator later.';
        } else {
          const photoUpdate = await supabase.from('sevak_profiles').update({ profile_picture: photoPath })
            .eq('id', savedProfile.id).select('profile_picture').single();
          if (photoUpdate.error) {
            logSupabaseError('profile photo path update', photoUpdate.error);
            const cleanupError = await removeOwnProfilePhoto(photoPath);
            photoWarning = `Your profile was submitted, but the optional photo could not be attached.${cleanupError ? ' The temporary upload could not be removed; contact an administrator.' : ''}`;
          } else {
            nextPhotoPath = photoUpdate.data.profile_picture;
            if (savedProfile.profile_picture && savedProfile.profile_picture !== nextPhotoPath) {
              const cleanupError = await removeOwnProfilePhoto(savedProfile.profile_picture);
              if (cleanupError) photoWarning = 'Your new photo was saved, but the previous private photo could not be removed.';
            }
          }
        }
      } catch (error) {
        const cleanupError = await removeOwnProfilePhoto(photoPath);
        photoWarning = `Your profile was submitted, but the photo could not be saved: ${error instanceof Error ? error.message : 'Storage request failed.'}${cleanupError ? ' A partial upload may remain in private Storage; contact an administrator if it appears later.' : ''}`;
      }
    } else if (removeSavedPhoto && savedProfile.profile_picture) {
      const oldPhotoPath = savedProfile.profile_picture;
      const photoUpdate = await supabase.from('sevak_profiles').update({ profile_picture: null })
        .eq('id', savedProfile.id).select('profile_picture').single();
      if (photoUpdate.error) {
        logSupabaseError('profile photo removal update', photoUpdate.error);
        photoWarning = 'Your profile was submitted, but the saved photo could not be unlinked.';
      } else {
        nextPhotoPath = null;
        if (await removeOwnProfilePhoto(oldPhotoPath)) photoWarning = 'Your profile photo was unlinked, but its private Storage file could not be removed.';
      }
    }
    setSaving(false);
    setProfile({ ...savedProfile, profile_picture: nextPhotoPath });
    if (photoWarning) {
      setPhotoNotice(photoWarning);
      return;
    }
    window.location.assign('/sevak/my-profile');
  };

  const handlePhotoSelected = (file?: File) => {
    stopCamera();
    setCameraError('');
    setPhotoError('');
    setErrorMessage('');
    if (!file) return;
    if (!PROFILE_PHOTO_TYPES[file.type]) {
      setSelectedPhoto(null);
      setPhotoError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size === 0 || file.size > MAX_PROFILE_PHOTO_BYTES) {
      setSelectedPhoto(null);
      setPhotoError('The image must be no larger than 2 MB.');
      return;
    }
    setSelectedPhoto(file);
    setRemoveSavedPhoto(false);
  };

  const saveProfilePhoto = async () => {
    if (!session || !profile || !selectedPhoto || !['pending', 'approved'].includes(profile.approval_status)) return;
    const extension = PROFILE_PHOTO_TYPES[selectedPhoto.type];
    if (!extension || !selectedPhoto.size || selectedPhoto.size > MAX_PROFILE_PHOTO_BYTES) {
      setPhotoError('Choose a JPEG, PNG, or WebP image no larger than 2 MB.');
      return;
    }

    setSaving(true);
    setPhotoError('');
    setPhotoSavedNotice('');
    const photoPath = `${profile.sevak_id}/profile-${crypto.randomUUID()}.${extension}`;
    let photoUploaded = false;
    let uploadStage: 'storage' | 'profile' = 'storage';
    try {
      const upload = await supabase.storage.from('sevak-profiles').upload(photoPath, selectedPhoto, {
        cacheControl: '3600',
        contentType: selectedPhoto.type,
        upsert: false,
      });
      if (upload.error) throw upload.error;
      photoUploaded = true;

      uploadStage = 'profile';
      const update = await supabase.from('sevak_profiles').update({ profile_picture: photoPath })
        .eq('id', profile.id).select('profile_picture').single();
      if (update.error) throw update.error;
      if (!update.data.profile_picture) throw new Error('Supabase did not return the saved profile photo path.');

      setProfile({ ...profile, profile_picture: update.data.profile_picture });
      setSelectedPhoto(null);
      const oldPhotoPath = profile.profile_picture;
      const oldPhotoCleanupFailed = oldPhotoPath && oldPhotoPath !== update.data.profile_picture
        ? await removeOwnProfilePhoto(oldPhotoPath)
        : false;
      setPhotoSavedNotice(oldPhotoCleanupFailed
        ? 'Your new photo was saved, but the previous private photo could not be removed.'
        : `Profile photo saved. Your profile remains ${profile.approval_status === 'pending' ? 'pending admin review' : 'approved'}.`);
      try {
        setSavedPhotoUrl(await resolveSevakProfilePhotoUrl(supabase.storage, update.data.profile_picture));
      } catch {
        setPhotoError('The photo was saved, but its private preview could not be loaded. Reload My Profile to retry.');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        logSupabaseError(photoUploaded ? 'profile photo path update' : 'profile photo upload', error as { code?: string; message: string; details?: string; hint?: string });
      }
      const cleanupError = photoUploaded ? await removeOwnProfilePhoto(photoPath) : false;
      const message = error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Supabase rejected the photo request.';
      const isRlsError = /42501|row.level security|permission denied|not allowed/i.test(message);
      const stageMessage = uploadStage === 'storage'
        ? isRlsError
          ? 'Supabase Storage denied the upload. Confirm this signed-in account owns the selected Sevak profile and that its private-bucket INSERT policy is applied.'
          : 'The image could not be uploaded to private Supabase Storage.'
        : isRlsError
          ? 'The image uploaded, but Supabase denied saving its path on this profile. Confirm the own-profile photo UPDATE policy is applied.'
          : 'The image uploaded, but its path could not be saved on the profile.';
      setPhotoError(`${stageMessage} Details: ${message}${cleanupError ? ' The unattached private upload could not be removed.' : ''}`);
    } finally {
      setSaving(false);
    }
  };

  const refreshSavedPhoto = async () => {
    if (!profile?.profile_picture || photoRefreshAttempted.current) {
      setPhotoError('The saved profile photo is unavailable.');
      return;
    }
    photoRefreshAttempted.current = true;
    if (isLegacySamplePhotoPath(profile.profile_picture)) {
      setSavedPhotoUrl('');
      setPhotoError('The saved profile photo file could not be loaded.');
      return;
    }
    try {
      const photoUrl = await resolveSevakProfilePhotoUrl(supabase.storage, profile.profile_picture);
      setPhotoError('');
      setSavedPhotoUrl(photoUrl);
    } catch {
      setSavedPhotoUrl('');
      setPhotoError('The profile photo link expired and could not be refreshed.');
    }
  };

  const authNext = encodeURIComponent(page === 'my-profile' ? '/sevak/my-profile' : '/sevak/create-profile');
  const isMyProfilePage = page === 'my-profile';

  if (isMyProfilePage && authReady && !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f7f3] px-5 py-12 text-[#263238] sm:px-8">
        <section className="w-full max-w-3xl rounded-3xl border border-[#e8e1d1] bg-white px-6 py-10 text-center shadow-[0_24px_80px_rgba(30,48,48,0.1)] sm:px-12 sm:py-14">
          <h1 className="mt-4 font-serif text-3xl leading-tight text-[#2b4149] sm:text-4xl md:text-5xl">
            ⭐ ROOPANTARAN (Central HR)
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#68787c] sm:text-base sm:leading-8">
            Welcome back. Sign in to continue your seva and connect with the Central HR workspace.
          </p>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#9b742c] sm:text-sm">
            MIND IN THE PRESENT MOMENT
          </p>
          <a href="/sevak-dashboard" className="mt-5 inline-flex text-sm font-semibold text-[#485a61] transition hover:text-[#9b742c]">
            Explore the seva home
          </a>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={`/login?next=${authNext}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#bd8d36] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#a77825]">
              Sign in
            </a>
            <a href={`/signup?next=${authNext}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d8d0bd] bg-white px-6 py-3 text-sm font-semibold text-[#485a61] transition hover:border-[#bd8d36] hover:text-[#78591d]">
              Create account
            </a>
          </div>
        </section>
      </main>
    );
  }

  const pageContent = (
    <main className={isMyProfilePage ? 'min-h-screen bg-[#f8f7f3] px-5 py-10 text-[#263238] sm:px-8 sm:py-16' : 'relative min-h-screen overflow-hidden bg-[#050508] px-4 pb-16 pt-10 font-sans text-white selection:bg-amber-500/30 selection:text-amber-200 sm:px-8 sm:pt-14'}>
      {!isMyProfilePage && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.09),transparent_48%)]" />}
      <div className={`relative mx-auto ${isMyProfilePage ? 'max-w-4xl' : 'max-w-3xl'}`}>
        {!isMyProfilePage && <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <a href="/sevak/register" className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">BigBro · Sevak Portal</a>
          <nav className="flex gap-4 text-xs text-neutral-400">
            <a href="/sevak/create-profile" className="transition hover:text-white">Create profile</a>
            <a href="/sevak/my-profile" className="transition hover:text-white">My profile</a>
          </nav>
        </header>}
        <section className={isMyProfilePage ? 'border-l-4 border-[#c39a4b] bg-white px-6 py-7 shadow-sm sm:px-10 sm:py-10' : 'rounded-2xl border border-white/10 bg-[#0d0e14]/95 p-5 shadow-xl shadow-black/20 sm:p-8'}>
        <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${isMyProfilePage ? 'text-[#a57d31]' : 'text-amber-300'}`}>{page === 'my-profile' ? 'My Sevak Profile' : 'Profile Application'}</p>
        <h1 className={`mt-3 text-3xl font-semibold tracking-tight ${isMyProfilePage ? 'text-[#263c45]' : ''}`}>{page === 'my-profile' ? 'Profile status' : 'Create my Sevak profile'}</h1>
        <p className={`mt-3 text-sm leading-6 ${isMyProfilePage ? 'text-[#66777d]' : 'text-neutral-400'}`}>{page === 'my-profile' ? 'Review your submitted profile and its administrator approval status.' : 'Submit your details for review. Only an authorized Sevak administrator can approve a profile.'}</p>

        {!authReady || loading ? <p role="status" className="mt-6 text-sm text-neutral-300">Loading your registration…</p> : !session ? (
          <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4">
            <p className="text-sm text-neutral-200">Sign in or create a BigBro account to register. Your profile will be linked to that signed-in account.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950" href={`/signup?next=${authNext}`}>Create account</a>
              <a className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white" href={`/login?next=${authNext}`}>Sign in</a>
            </div>
          </div>
        ) : photoNotice ? (
          <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4" role="status">
            <p className="text-sm font-semibold text-emerald-200">Your profile was saved successfully.</p>
            <p className="mt-2 text-sm text-amber-100">{photoNotice}</p>
            <a href="/sevak/my-profile" className="mt-4 inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white">Open My Profile</a>
          </div>
        ) : errorMessage ? (
          <div className="mt-6">
            <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{errorMessage}</p>
            <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs text-white">Retry</button>
          </div>
        ) : page === 'my-profile' && profile ? (
          <div className="mt-6 rounded-2xl border border-[#e8e1d1] bg-[#fbfaf7] p-5 sm:p-6" role="status">
            <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${profile.approval_status === 'approved' ? 'border-emerald-300/50 bg-emerald-50 text-emerald-700' : profile.approval_status === 'rejected' ? 'border-rose-300/50 bg-rose-50 text-rose-700' : 'border-amber-300/50 bg-amber-50 text-amber-800'}`}>
              {profile.approval_status === 'approved' ? 'Approved' : profile.approval_status === 'rejected' ? 'Rejected' : 'Pending'}
            </div>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#768187]">Name</dt><dd className="mt-1 text-[#344b51]">{profile.name}</dd></div>
              <div><dt className="text-[#768187]">Sevak ID</dt><dd className="mt-1 text-[#344b51]">{profile.sevak_id}</dd></div>
              <div><dt className="text-[#768187]">Mobile</dt><dd className="mt-1 text-[#344b51]">{profile.mobile}</dd></div>
              <div><dt className="text-[#768187]">Department</dt><dd className="mt-1 text-[#344b51]">{profile.department}</dd></div>
            </dl>
            <div className="mt-5">
              {savedPhotoUrl ? <img src={savedPhotoUrl} alt={`${profile.name}'s profile`} onError={() => void refreshSavedPhoto()} className="h-28 w-28 rounded-xl border border-[#e8e1d1] object-cover" /> : profile.profile_picture ? <p className="text-xs text-[#8d6b28]">Loading saved profile photo…</p> : <p className="text-xs text-[#768187]">No profile photo has been added.</p>}
              {['pending', 'approved'].includes(profile.approval_status) && <div className="mt-3 flex flex-wrap items-center gap-3">
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { handlePhotoSelected(event.target.files?.[0]); event.currentTarget.value = ''; }} className="sr-only" />
                {photoPreviewUrl && <img src={photoPreviewUrl} alt="Selected profile photo preview" className="h-24 w-24 rounded-xl border border-[#e8e1d1] object-cover" />}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => photoInput.current?.click()} className="rounded-lg border border-[#d8d0bd] px-3 py-2 text-xs font-semibold text-[#344b51] disabled:opacity-50">{selectedPhoto ? 'Choose another photo' : profile.profile_picture ? 'Change photo' : 'Add profile photo'}</button>
                  <button type="button" disabled={saving || cameraOpen} onClick={() => void openCamera()} className="rounded-lg border border-[#d8d0bd] px-3 py-2 text-xs font-semibold text-[#344b51] disabled:opacity-50">Take photo</button>
                  {selectedPhoto && <button type="button" disabled={saving} onClick={() => void saveProfilePhoto()} className="rounded-lg bg-[#bd8d36] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving photo…' : 'Save photo'}</button>}
                  {selectedPhoto && <button type="button" disabled={saving} onClick={() => setSelectedPhoto(null)} className="rounded-lg border border-[#d8d0bd] px-3 py-2 text-xs text-[#344b51] disabled:opacity-50">Cancel</button>}
                </div>
              </div>}
              {cameraError && <p role="alert" className="mt-2 text-xs text-rose-700">{cameraError}</p>}
              {cameraOpen && <div className="mt-3 rounded-xl border border-[#e8e1d1] bg-white p-3 sm:max-w-xl"><video ref={cameraVideo} autoPlay muted playsInline aria-label="Live camera preview" className="aspect-video w-full rounded-lg bg-black object-cover" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={capturePhoto} className="rounded-lg bg-[#bd8d36] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Capture photo</button><button type="button" onClick={stopCamera} className="rounded-lg border border-[#d8d0bd] px-3 py-2 text-xs font-semibold text-[#344b51]">Close camera</button></div></div>}
              {photoSavedNotice && <p role="status" className="mt-2 text-xs text-emerald-700">{photoSavedNotice}</p>}
              {photoError && <p role="alert" className="mt-2 text-xs text-[#8d6b28]">{photoError}</p>}
            </div>
            {profile.approval_status === 'pending' && <p className="mt-5 text-sm leading-6 text-[#485a61]">Your profile is awaiting review by an authorized Sevak administrator.</p>}
            {profile.approval_status === 'approved' && <p className="mt-5 text-sm leading-6 text-[#485a61]">Your profile is approved. Attendance and management access still follows the project&apos;s existing role policies.</p>}
            {profile.approval_status === 'rejected' && <div className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/5 p-4">
              <p className="text-sm font-semibold text-rose-700">Admin feedback</p>
              <p className="mt-2 text-sm text-[#485a61]">{profile.rejection_reason || 'Please contact an administrator for details.'}</p>
              <a href="/sevak/create-profile" className="mt-4 inline-flex rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950">Correct and resubmit</a>
            </div>}
            <section aria-labelledby="my-attendance-history-heading" className="mt-7 rounded-xl border border-[#e8e1d1] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div><h2 id="my-attendance-history-heading" className="font-semibold text-[#344b51]">My attendance history</h2><p className="mt-1 text-xs text-[#768187]">Only attendance linked to your own Sevak profile is shown.</p></div>
                {!ownAttendanceLoading && <span className="text-xs text-[#768187]">{ownAttendance.length} record{ownAttendance.length === 1 ? '' : 's'}</span>}
              </div>
              {ownAttendanceLoading ? <p role="status" className="mt-4 text-sm text-[#768187]">Loading your attendance history…</p>
                : ownAttendanceError ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{ownAttendanceError}</p>
                  : ownAttendance.length === 0 ? <p className="mt-4 text-sm text-[#768187]">No attendance records are available for this profile.</p>
                    : <div className="mt-4 divide-y divide-[#f0ece3]">{ownAttendance.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium text-[#344b51]">{record.attendance_type.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-[#768187]">{record.attendance_date}</p></div><div className="text-right"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${record.status.toUpperCase() === 'PRESENT' ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800'}`}>{record.status.toUpperCase()}</span><p className="mt-1 text-[10px] text-[#768187]">{record.check_in_time ? `Check-in ${new Date(record.check_in_time).toLocaleString()}` : 'No check-in time'}</p></div></div>)}</div>}
            </section>
          </div>
        ) : page === 'my-profile' ? (
          <div className="mt-6 rounded-xl border border-[#e8e1d1] bg-[#fbfaf7] p-5" role="status">
            <h2 className="font-semibold text-[#344b51]">No Sevak profile found for this account</h2>
            <p className="mt-2 text-sm leading-6 text-[#485a61]">Create a profile while signed in to this BigBro account. Your application will be linked to your account and appear here after submission.</p>
            <a href="/sevak/create-profile" className="mt-4 inline-flex rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950">Create a profile</a>
          </div>
        ) : page === 'create-profile' && profile && profile.approval_status !== 'rejected' ? (
          <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4" role="status">
            <h2 className="font-semibold text-amber-200">You already have a profile</h2>
            <p className="mt-2 text-sm text-neutral-300">Open My Profile to review its current status.</p>
            <a href="/sevak/my-profile" className="mt-4 inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white">View My Profile</a>
          </div>
        ) : (
          <>
            {profile?.approval_status === 'rejected' && <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4">
              <h2 className="font-semibold text-rose-200">Profile needs correction</h2>
              <p className="mt-2 text-sm text-rose-100">Admin reason: {profile.rejection_reason || 'No reason was provided. Contact an administrator.'}</p>
              <p className="mt-2 text-xs text-neutral-300">Correct the details below to resubmit for approval.</p>
            </div>}
            <form onSubmit={(event) => void saveProfile(event)} className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-neutral-300 sm:col-span-2">Full name
                <input required maxLength={120} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
              </label>
              <label className="text-sm text-neutral-300">Mobile number
                <input required type="tel" autoComplete="tel" maxLength={24} placeholder="+91 98765 43210" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} className={inputClass} />
                <span className="mt-1 block text-xs text-neutral-500">Shared household numbers are allowed; the duplicate warning only covers profiles visible under your existing RLS scope.</span>
              </label>
              {mobileDuplicateNotice && <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100 sm:col-span-2">{mobileDuplicateNotice}</p>}
              <label className="text-sm text-neutral-300 sm:col-span-2">{profile ? 'Department (contact an administrator to change it)' : 'Department'}
                <select required disabled={Boolean(profile)} value={form.department_id} onChange={(event) => setForm({ ...form, department_id: event.target.value })} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}>
                  <option value="">Choose an active department</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2">
                <span className="text-sm text-neutral-300">Profile photo (optional)</span>
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { handlePhotoSelected(event.target.files?.[0]); event.currentTarget.value = ''; }} className="sr-only" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={saving || cameraOpen} onClick={() => photoInput.current?.click()} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50">{selectedPhoto || profile?.profile_picture ? 'Choose a different photo' : 'Choose photo'}</button>
                  <button type="button" disabled={saving || cameraOpen} onClick={() => void openCamera()} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50">Take Photo</button>
                </div>
                <p className="mt-1 text-xs text-neutral-500">JPEG, PNG, or WebP; maximum 2 MB. Photos remain private.</p>
                {cameraError && <p role="status" className="mt-2 text-xs text-amber-200">{cameraError}</p>}
                {cameraOpen && <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 sm:max-w-xl"><video ref={cameraVideo} autoPlay muted playsInline aria-label="Live camera preview" className="aspect-video w-full rounded-lg bg-black object-cover" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={capturePhoto} className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-neutral-950">Capture Photo</button><button type="button" onClick={stopCamera} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white">Close Camera</button></div></div>}
                {photoPreviewUrl && <div className="mt-3 flex flex-wrap items-center gap-3"><img src={photoPreviewUrl} alt="Selected profile preview" className="h-24 w-24 rounded-xl border border-white/10 object-cover" /><button type="button" disabled={saving} onClick={() => void openCamera()} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white disabled:opacity-50">Retake</button><button type="button" disabled={saving} onClick={() => photoInput.current?.click()} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white disabled:opacity-50">Replace photo</button><button type="button" disabled={saving} onClick={() => setSelectedPhoto(null)} className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-200 disabled:opacity-50">Remove selected photo</button></div>}
                {!photoPreviewUrl && profile?.profile_picture && !removeSavedPhoto && <div className="mt-3 flex flex-wrap items-center gap-3">{savedPhotoUrl ? <img src={savedPhotoUrl} alt="Current saved profile" onError={() => void refreshSavedPhoto()} className="h-24 w-24 rounded-xl border border-white/10 object-cover" /> : <p className="text-xs text-amber-200">{photoError || 'Saved photo preview unavailable.'}</p>}<button type="button" onClick={() => { setSelectedPhoto(null); setRemoveSavedPhoto(true); }} className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-200">Remove saved photo</button></div>}
                {!photoPreviewUrl && savedPhotoUrl && removeSavedPhoto && <div className="mt-3 flex items-center gap-3"><p className="text-xs text-neutral-400">The saved photo will be removed when you submit.</p><button type="button" onClick={() => setRemoveSavedPhoto(false)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white">Undo</button></div>}
                {photoError && <p role="status" className="mt-2 text-xs text-amber-200">{photoError}</p>}
              </div>
              {errorMessage && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200 sm:col-span-2">{errorMessage}</p>}
              <button type="submit" disabled={saving || departments.length === 0} className="rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-50 sm:col-span-2">
                {saving ? 'Submitting…' : profile?.approval_status === 'rejected' ? 'Correct and resubmit' : 'Submit for Admin approval'}
              </button>
              {departments.length === 0 && <p className="text-xs text-rose-200 sm:col-span-2">No active departments are available. Contact an administrator.</p>}
            </form>
          </>
        )}
        </section>
        <a href="/sevak/register" className={`mt-6 block text-center text-xs transition ${isMyProfilePage ? 'text-[#768187] hover:text-[#78591d]' : 'text-neutral-500 hover:text-white'}`}>Back to Sevak Portal</a>
      </div>
    </main>
  );

  return isMyProfilePage && session
    ? <SevakLayout session={session} pathname="/sevak/my-profile">{pageContent}<SevakDashboardFooter /></SevakLayout>
    : pageContent;
}
