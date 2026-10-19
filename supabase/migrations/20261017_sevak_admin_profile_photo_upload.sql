-- Ensure trusted Sevak administrators can upload profile photos for profiles
-- they manage. The bucket remains private and uploads stay scoped to an
-- existing Sevak profile folder.
DO $preflight$
BEGIN
    IF to_regprocedure('public.has_sevak_admin_role()') IS NULL
       OR to_regclass('public.sevak_profiles') IS NULL
       OR to_regclass('storage.objects') IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM storage.buckets
           WHERE id = 'sevak-profiles' AND public = false
       ) THEN
        RAISE EXCEPTION 'The trusted Sevak role, profile table, storage objects table, and private sevak-profiles bucket must exist first.';
    END IF;
END;
$preflight$;

-- Reassert the existing admin upload scope: authenticated Sevak admins only,
-- and only within the folder of an existing profile. Other storage policies
-- and administrator permissions are unchanged.
DROP POLICY IF EXISTS "Sevak administrators upload profile images" ON storage.objects;
CREATE POLICY "Sevak administrators upload profile images"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'sevak-profiles'
        AND public.has_sevak_admin_role()
        AND EXISTS (
            SELECT 1 FROM public.sevak_profiles AS profile
            WHERE profile.sevak_id = (storage.foldername(name))[1]
        )
    );
