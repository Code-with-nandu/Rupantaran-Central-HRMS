import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const management = await readFile(new URL('../supabase/migrations/20261010_sevak_management.sql', import.meta.url), 'utf8');
const registration = await readFile(new URL('../supabase/migrations/20261012_sevak_self_registration_approval.sql', import.meta.url), 'utf8');
const timestamp = await readFile(new URL('../supabase/migrations/20261017000200_sevak_attendance_server_check_in_time.sql', import.meta.url), 'utf8');
const security = await readFile(new URL('../supabase/migrations/20261017000300_department_scoped_attendance_security.sql', import.meta.url), 'utf8');
const manualPage = await readFile(new URL('../src/components/SevakManualAttendancePage.tsx', import.meta.url), 'utf8');

test('authorization functions use trusted role rows and the signed-in Auth UUID', () => {
  assert.match(management, /CREATE OR REPLACE FUNCTION public\.has_sevak_admin_role\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?user_id = auth\.uid\(\) AND role = 'admin'/);
  assert.match(management, /CREATE OR REPLACE FUNCTION public\.can_manage_sevak_department\(target_department_id UUID\)[\s\S]*?assignment\.user_id = auth\.uid\(\)[\s\S]*?assignment\.role = 'group_leader'[\s\S]*?assignment\.department_id = target_department_id/);
  assert.match(registration, /CREATE POLICY "Sevaks read their own profile"[\s\S]*?auth_user_id = auth\.uid\(\)/);
});

test('Group Leader attendance updates must remain in an assigned department and match an active approved profile', () => {
  assert.match(security, /CREATE POLICY "Sevak roles update scoped attendance"[\s\S]*?USING \(public\.can_manage_sevak_department\(department_id\)\)[\s\S]*?WITH CHECK \([\s\S]*?public\.has_sevak_admin_role\(\)[\s\S]*?public\.can_manage_sevak_department\(department_id\)[\s\S]*?profile\.id = sevak_attendance\.sevak_id[\s\S]*?profile\.department_id = sevak_attendance\.department_id[\s\S]*?lower\(profile\.status\) = 'active'[\s\S]*?profile\.approval_status = 'approved'/);
  assert.match(management, /CREATE POLICY "Sevak administrators delete attendance"[\s\S]*?FOR DELETE TO authenticated[\s\S]*?USING \(public\.has_sevak_admin_role\(\)\)/);
});

test('Regular Sevaks receive own-history SELECT only; role writes remain admin-only', () => {
  assert.match(security, /CREATE POLICY "Sevaks read their own attendance"[\s\S]*?FOR SELECT TO authenticated[\s\S]*?profile\.id = sevak_attendance\.sevak_id[\s\S]*?profile\.auth_user_id = auth\.uid\(\)/);
  assert.match(security, /REVOKE INSERT, UPDATE, DELETE ON public\.sevak_role_assignments FROM authenticated/);
  assert.match(security, /CREATE POLICY "Sevak administrators assign Group Leaders"[\s\S]*?has_sevak_admin_role\(\)[\s\S]*?role = 'group_leader'/);
  assert.match(security, /CREATE POLICY "Sevak administrators revoke Group Leaders"[\s\S]*?FOR DELETE TO authenticated[\s\S]*?has_sevak_admin_role\(\)[\s\S]*?role = 'group_leader'/);
  assert.doesNotMatch(security, /CREATE POLICY[^;]+ON public\.sevak_role_assignments FOR UPDATE/i);
});

test('present check-in timestamps are assigned by the database and cannot be client-overwritten', () => {
  assert.match(timestamp, /BEFORE INSERT OR UPDATE ON public\.sevak_attendance/);
  assert.match(timestamp, /NEW\.check_in_time := clock_timestamp\(\)/);
  assert.match(timestamp, /NEW\.check_in_time := OLD\.check_in_time/);
  assert.match(timestamp, /NEW\.check_in_time := NULL/);
  const manualInsert = manualPage.match(/supabase\.from\('sevak_attendance'\)\.insert\(\{([\s\S]*?)\}\)/);
  assert.ok(manualInsert, 'manual page must use the Supabase attendance table');
  assert.doesNotMatch(manualInsert[1], /check_in_time\s*:/);
});

test('manual attendance reuses existing RLS, profile photo resolver, and database duplicate handling', () => {
  assert.match(manualPage, /resolveSevakProfilePhotoUrl\(supabase\.storage/);
  assert.match(manualPage, /attendance_type: attendanceType/);
  assert.match(manualPage, /department: attendanceType === 'SEVA' \? selected\.department : null/);
  assert.match(manualPage, /error\.code === '23505'/);
  assert.match(manualPage, /supabase\.from\('sevak_attendance'\)\.insert/);
});
