-- Close the remaining scoped-role gaps without replacing the existing
-- authorization model or changing attendance/profile data.

DO $preflight$
BEGIN
    IF to_regclass('public.sevak_profiles') IS NULL
       OR to_regclass('public.sevak_attendance') IS NULL
       OR to_regclass('public.sevak_departments') IS NULL
       OR to_regclass('public.sevak_role_assignments') IS NULL
       OR to_regprocedure('public.has_sevak_admin_role()') IS NULL
       OR to_regprocedure('public.can_manage_sevak_department(uuid)') IS NULL THEN
        RAISE EXCEPTION 'Apply the existing Sevak attendance and management migrations before this security migration.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_profiles'
          AND column_name = 'auth_user_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_profiles'
          AND column_name = 'approval_status' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sevak_attendance'
          AND column_name = 'department_id' AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'The expected Sevak ownership, approval, or department-scope columns are missing.';
    END IF;
END;
$preflight$;

-- Regular Sevaks may read their own history. This is SELECT-only; the
-- existing administrator/department policies remain responsible for writes.
DROP POLICY IF EXISTS "Sevaks read their own attendance" ON public.sevak_attendance;
CREATE POLICY "Sevaks read their own attendance"
    ON public.sevak_attendance FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.sevak_profiles AS profile
            WHERE profile.id = sevak_attendance.sevak_id
              AND profile.auth_user_id = auth.uid()
        )
    );

-- Require the destination profile and stored department scope to agree on
-- writes. Admins retain their correction
-- access across departments; scoped leaders cannot retarget a row at another
-- department's profile.
DROP POLICY IF EXISTS "Sevak roles update scoped attendance" ON public.sevak_attendance;
CREATE POLICY "Sevak roles update scoped attendance"
    ON public.sevak_attendance FOR UPDATE TO authenticated
    USING (public.can_manage_sevak_department(department_id))
    WITH CHECK (
        public.has_sevak_admin_role()
        OR (
            public.can_manage_sevak_department(department_id)
            AND EXISTS (
                SELECT 1 FROM public.sevak_profiles AS profile
                WHERE profile.id = sevak_attendance.sevak_id
                  AND profile.department_id = sevak_attendance.department_id
                  AND lower(profile.status) = 'active'
                  AND profile.approval_status = 'approved'
            )
        )
    );

DROP POLICY IF EXISTS "Sevak roles insert scoped attendance" ON public.sevak_attendance;
CREATE POLICY "Sevak roles insert scoped attendance"
    ON public.sevak_attendance FOR INSERT TO authenticated
    WITH CHECK (
        public.has_sevak_admin_role()
        OR (
            public.can_manage_sevak_department(department_id)
            AND EXISTS (
                SELECT 1 FROM public.sevak_profiles AS profile
                WHERE profile.id = sevak_attendance.sevak_id
                  AND profile.department_id = sevak_attendance.department_id
                  AND lower(profile.status) = 'active'
                  AND profile.approval_status = 'approved'
            )
        )
    );

-- Only trusted Sevak administrators can assign or revoke Group Leader rows.
-- No UPDATE grant or policy is added, so role rows cannot be edited in place.
REVOKE INSERT, UPDATE, DELETE ON public.sevak_role_assignments FROM authenticated;
GRANT INSERT, DELETE ON public.sevak_role_assignments TO authenticated;

DROP POLICY IF EXISTS "Sevak administrators assign Group Leaders" ON public.sevak_role_assignments;
CREATE POLICY "Sevak administrators assign Group Leaders"
    ON public.sevak_role_assignments FOR INSERT TO authenticated
    WITH CHECK (
        public.has_sevak_admin_role()
        AND role = 'group_leader'
        AND EXISTS (
            SELECT 1 FROM public.sevak_departments AS department
            WHERE department.id = sevak_role_assignments.department_id AND department.is_active
        )
    );

DROP POLICY IF EXISTS "Sevak administrators revoke Group Leaders" ON public.sevak_role_assignments;
CREATE POLICY "Sevak administrators revoke Group Leaders"
    ON public.sevak_role_assignments FOR DELETE TO authenticated
    USING (public.has_sevak_admin_role() AND role = 'group_leader');
