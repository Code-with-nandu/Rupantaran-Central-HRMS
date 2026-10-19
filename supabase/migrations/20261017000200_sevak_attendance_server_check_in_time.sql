-- Keep manual PRESENT check-in times server-assigned and immutable to clients.
-- ABSENT records have no check-in time; changing status to PRESENT creates a
-- fresh database timestamp. Existing attendance rows are left untouched.

DO $preflight$
BEGIN
    IF to_regclass('public.sevak_attendance') IS NULL THEN
        RAISE EXCEPTION 'Apply the Sevak attendance migration before setting server check-in times.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_attendance'
          AND column_name = 'status' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_attendance'
          AND column_name = 'check_in_time' AND data_type = 'timestamp with time zone'
    ) THEN
        RAISE EXCEPTION 'The expected Sevak attendance status or check-in timestamp column is missing.';
    END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.set_sevak_attendance_check_in_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF upper(btrim(NEW.status)) = 'PRESENT' THEN
            NEW.check_in_time := clock_timestamp();
        ELSE
            NEW.check_in_time := NULL;
        END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        IF upper(btrim(NEW.status)) = 'PRESENT' THEN
            NEW.check_in_time := clock_timestamp();
        ELSE
            NEW.check_in_time := NULL;
        END IF;
    ELSE
        NEW.check_in_time := OLD.check_in_time;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_sevak_attendance_check_in_time() FROM PUBLIC;

DROP TRIGGER IF EXISTS set_sevak_attendance_check_in_time_trigger ON public.sevak_attendance;
CREATE TRIGGER set_sevak_attendance_check_in_time_trigger
    BEFORE INSERT OR UPDATE ON public.sevak_attendance
    FOR EACH ROW EXECUTE FUNCTION public.set_sevak_attendance_check_in_time();
