import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const gate = await readFile(new URL('../src/components/RoleDashboardGate.tsx', import.meta.url), 'utf8');
const auth = await readFile(new URL('../src/components/UnifiedAuth.tsx', import.meta.url), 'utf8');
const selection = await readFile(new URL('../src/components/RoleSelectionPage.tsx', import.meta.url), 'utf8');
const attendance = await readFile(new URL('../src/components/SevakAttendancePage.tsx', import.meta.url), 'utf8');
const sevakDashboard = await readFile(new URL('../src/components/SevakDashboard.tsx', import.meta.url), 'utf8');
const sevakLayout = await readFile(new URL('../src/components/SevakLayout.tsx', import.meta.url), 'utf8');

test('Sevak public landing renders before the protected-route list and has no session requirement', () => {
  const publicRouteIndex = app.indexOf("if (pathname === '/sevak-dashboard')");
  const protectedRouteIndex = app.indexOf('const protectedPaths =');
  assert.notEqual(publicRouteIndex, -1);
  assert.ok(publicRouteIndex < protectedRouteIndex);
  assert.match(app, /return <SevakDashboard pathname=\{pathname\} \/>;/);
  const protectedPaths = app.match(/const protectedPaths = \[([^\]]+)\]/)?.[1] ?? '';
  assert.doesNotMatch(protectedPaths, /['"]\/sevak-dashboard['"]/);
  assert.match(protectedPaths, /\/sevak-dashboard\/leave/);
  assert.match(protectedPaths, /\/sevak-dashboard\/medical/);
  assert.match(sevakDashboard, /session\?: Session/);
  assert.match(sevakLayout, /session\?: Session/);
});

test('public role selection renders before the protected routes; internal resolver and destinations stay protected', () => {
  const publicRouteIndex = app.indexOf("if (pathname === '/role-dashboard')");
  const protectedRouteIndex = app.indexOf('const protectedPaths =');
  assert.notEqual(publicRouteIndex, -1);
  assert.ok(publicRouteIndex < protectedRouteIndex);
  assert.match(app, /return <RoleSelectionPage \/>;/);
  const protectedPaths = app.match(/const protectedPaths = \[([^\]]+)\]/)?.[1] ?? '';
  assert.match(protectedPaths, /'\/role-redirect'.*'\/sevak\/panel'.*'\/group-leader'.*'\/admin'/);
  assert.doesNotMatch(protectedPaths, /'\/role-dashboard'/);
  assert.match(app, /requestedRole="admin"/);
  assert.match(app, /requestedRole="group_leader"/);
  assert.match(app, /requestedRole="sevak"/);
  assert.match(app, /pathname === '\/role-redirect'[\s\S]*?requestedRole="landing"/);
  assert.match(app, /pathname === '\/sevak-attendance\/manual'[\s\S]*?SevakManualAttendancePage/);
});

test('public selector lists all roles without loading private role or profile data', () => {
  for (const title of ['Admin Dashboard', 'Group Leader Dashboard', 'Sevak Dashboard']) {
    assert.ok(selection.includes(title));
  }
  for (const destination of ['/admin', '/group-leader', '/sevak/panel']) assert.ok(selection.includes(destination));
  assert.match(selection, /supabase\.auth\.getSession\(\)/);
  assert.doesNotMatch(selection, /sevak_profiles|sevak_attendance|has_sevak_admin_role|get_my_sevak_profile/);
  assert.match(selection, /`\/login\?next=\$\{encodeURIComponent\(destination\)\}`/);
  assert.match(selection, /Choosing a card does not grant access/);
});

test('local role-check preview is development-only and does not replace authentication or production role resolution', () => {
  assert.match(app, /'\/role-redirect'/);
  assert.match(gate, /import\.meta\.env\.DEV[\s\S]*requestedRole === 'landing'[\s\S]*get\('preview'\) === 'loading'/);
  assert.match(gate, /if \(localLoadingPreview\) return <RoleMessage title="Checking access"/);
  assert.match(gate, /if \(!localLoadingPreview && requestedRole === 'landing' && role/);
  assert.match(gate, /rpc\('has_sevak_admin_role'\)/);
});

test('role decisions use Supabase role checks, assignments, and own profile rather than editable metadata', () => {
  assert.match(gate, /rpc\('has_sevak_admin_role'\)/);
  assert.match(gate, /from\('sevak_role_assignments'\)[\s\S]*?eq\('user_id', session\.user\.id\)[\s\S]*?eq\('role', 'group_leader'\)/);
  assert.match(gate, /rpc\('get_my_sevak_profile'\)/);
  assert.doesNotMatch(gate, /user_metadata|localStorage/);
  assert.match(gate, /role !== requestedRole/);
  assert.match(gate, /homeForRole\[role/);
});

test('post-login destinations are exact allowlisted protected routes; default opens the verified resolver', () => {
  assert.match(auth, /: '\/role-redirect'/);
  assert.match(auth, /allowedPaths = \['\/sevak-registration', '\/sevak\/create-profile', '\/sevak\/my-profile', '\/admin', '\/group-leader', '\/sevak\/panel'\]/);
  assert.match(gate, /sevak: '\/sevak\/panel'/);
});

test('regular Sevak dashboard links to private profile and personal attendance history', () => {
  assert.match(sevakDashboard, /Attendance history[\s\S]*?Review your own attendance dates, sessions, statuses, and check-in times[\s\S]*?href: '\/sevak-attendance'/);
  assert.match(sevakDashboard, /My Sevak Profile[\s\S]*?saved photo[\s\S]*?href: '\/sevak\/my-profile'/);
});

test('only a verified Sevak role opens the dedicated Sevak attendance dashboard', () => {
  assert.match(sevakDashboard, /title: 'Attendance dashboard'[\s\S]*?href: '\/sevak-dashboard\/attendance'/);
  assert.match(app, /'\/sevak-dashboard\/attendance'[\s\S]*?pathname === '\/sevak-dashboard\/attendance'[\s\S]*?requestedRole="sevak"[\s\S]*?<SevakAttendanceDashboardPage session=\{session\} \/>/);
  assert.match(app, /'\/sevak-dashboard\/attendance'/);
  assert.match(sevakDashboard, /authorized attendance summary, reporting periods, and trends/);
  assert.match(gate, /if \(adminResult\.data === true\)[\s\S]*?setRole\('admin'\)[\s\S]*?assignmentsResult[\s\S]*?setRole\('group_leader'\)[\s\S]*?get_my_sevak_profile[\s\S]*?setRole\(profile\?\.id \? 'sevak' : 'missing'\)/);
  assert.match(gate, /if \(role !== requestedRole\)/);
  assert.doesNotMatch(gate, /requestedRole === 'sevak'[\s\S]*?return <>{children}<\/>/);
  assert.match(app, /pathname === '\/sevak-attendance'[\s\S]*?requestedRole="attendance"[\s\S]*?<SevakAttendancePage shellSession=\{session\} \/>/);
  assert.match(gate, /requestedRole === 'attendance'[\s\S]*?return <>{children}<\/>/);
  assert.match(gate, /if \(!localLoadingPreview && requestedRole === 'landing' && role/);
  assert.doesNotMatch(gate, /requestedRole === 'attendance'[\s\S]*?window\.location\.replace/);
});

test('verified Admin can access /admin but remains denied the Sevak-only attendance dashboard', () => {
  assert.match(app, /pathname === '\/admin'[\s\S]*?requestedRole="admin"[\s\S]*?<AdminDashboardNavigation \/><AdminDashboard \/>/);
  assert.match(app, /const protectedPaths = \[[^\]]*'\/admin'[^\]]*'\/sevak-dashboard\/attendance'/);
  assert.match(gate, /adminResult\.data === true[\s\S]*?setRole\('admin'\)/);
  assert.match(gate, /admin: '\/admin'/);
  assert.match(gate, /link=\{\{ href: destination, label: 'Open your dashboard' \}\}/);
  assert.match(app, /pathname === '\/sevak-dashboard\/attendance'[\s\S]*?requestedRole="sevak"[\s\S]*?<SevakAttendanceDashboardPage session=\{session\} \/>/);
  assert.match(gate, /if \(role !== requestedRole\)/);
  assert.match(gate, /group_leader: '\/group-leader'/);
});

test('Admin navigation links to attendance and back while attendance remains protected', () => {
  assert.match(gate, /href="\/admin"[\s\S]*?Admin Dashboard/);
  assert.match(gate, /href="\/sevak-attendance"[\s\S]*?CalendarCheck2[\s\S]*?Sevak Attendance/);
  assert.match(attendance, /isAdmin && <AttendanceAdminSidebar \/>/);
  assert.match(attendance, /function AttendanceAdminSidebar[\s\S]*href: '\/admin'/);
  assert.match(app, /'\/sevak-attendance'/);
  assert.match(app, /const protectedPaths = \[[^\]]*'\/sevak-attendance'/);
});
