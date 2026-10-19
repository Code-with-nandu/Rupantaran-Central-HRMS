-- Allow a Sevak to add or replace only the photo on their own profile while
-- pending or approved. The private bucket and administrator policies remain
-- unchanged. Do not apply until the deployed ownership schema is verified.
DO $preflight$
BEGIN
    IF to_regclass('public.sevak_profiles') IS NULL
       OR to_regclass('storage.objects') IS NULL
       OR to_regclass('storage.buckets') IS NULL
       OR to_regprocedure('public.prepare_sevak_self_registration()') IS NULL THEN
        RAISE EXCEPTION 'Required Sevak profile and Supabase Storage objects are missing.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_profiles'
          AND column_name = 'auth_user_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_profiles'
          AND column_name = 'profile_picture' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_profiles'
          AND column_name = 'approval_status' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'The expected auth_user_id ownership mapping or profile photo columns are missing.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets
        WHERE id = 'sevak-profiles' AND public = false
          AND allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    ) THEN
        RAISE EXCEPTION 'The existing private sevak-profiles bucket or its image MIME configuration is missing.';
    END IF;
END;
$preflight$;

-- A fresh UUID object path means each photo write is an INSERT into
-- storage.objects; replacements do not require a Storage UPDATE permission.
-- Keep owner read/upload rules limited to the auth_user_id-owned Sevak folder.
DROP POLICY IF EXISTS "Sevaks read their own profile photos" ON storage.objects;
CREATE POLICY "Sevaks read their own profile photos"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'sevak-profiles'
        AND EXISTS (
            SELECT 1 FROM public.sevak_profiles AS profile
            WHERE profile.auth_user_id = auth.uid()
              AND profile.sevak_id = (storage.foldername(name))[1]
        )
    );

DROP POLICY IF EXISTS "Sevaks upload their own profile photos" ON storage.objects;
CREATE POLICY "Sevaks upload their own profile photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'sevak-profiles'
        AND EXISTS (
            SELECT 1 FROM public.sevak_profiles AS profile
            WHERE profile.auth_user_id = auth.uid()
              AND profile.sevak_id = (storage.foldername(name))[1]
        )
        AND name ~ '^[^/]+/profile-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
        AND metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/webp')
        AND metadata->>'size' ~ '^[1-9][0-9]*$'
        AND (metadata->>'size')::bigint <= 2097152
        AND (
            (name ~ '[.]jpg$' AND metadata->>'mimetype' = 'image/jpeg')
            OR (name ~ '[.]png$' AND metadata->>'mimetype' = 'image/png')
            OR (name ~ '[.]webp$' AND metadata->>'mimetype' = 'image/webp')
        )
    );

-- Existing self-update policy allows pending rows only. This additive policy
-- admits the owner's own approved row too; the trigger below preserves the
-- approval only when the photo is the sole profile change. Ordinary owner
-- edits continue through the existing re-review trigger behavior.
GRANT UPDATE (profile_picture) ON TABLE public.sevak_profiles TO authenticated;
DROP POLICY IF EXISTS "Sevaks update their own profile photo" ON public.sevak_profiles;
CREATE POLICY "Sevaks update their own profile photo"
    ON public.sevak_profiles FOR UPDATE TO authenticated
    USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid() AND approval_status IN ('pending', 'approved'));

CREATE OR REPLACE FUNCTION public.preserve_approved_sevak_photo_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
BEGIN
    IF OLD.auth_user_id = auth.uid()
       AND OLD.approval_status = 'approved'
       AND NEW.profile_picture IS DISTINCT FROM OLD.profile_picture
       AND (to_jsonb(NEW) - ARRAY[
            'profile_picture', 'approval_status', 'status', 'rejection_reason',
            'approved_by', 'approved_at', 'updated_at'
       ]::text[]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
            'profile_picture', 'approval_status', 'status', 'rejection_reason',
            'approved_by', 'approved_at', 'updated_at'
       ]::text[])
    THEN
        NEW.approval_status := OLD.approval_status;
        NEW.status := OLD.status;
        NEW.rejection_reason := OLD.rejection_reason;
        NEW.approved_by := OLD.approved_by;
        NEW.approved_at := OLD.approved_at;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.preserve_approved_sevak_photo_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_preserve_approved_sevak_photo_status ON public.sevak_profiles;
CREATE TRIGGER zz_preserve_approved_sevak_photo_status
    BEFORE UPDATE ON public.sevak_profiles
    FOR EACH ROW EXECUTE FUNCTION public.preserve_approved_sevak_photo_status();
