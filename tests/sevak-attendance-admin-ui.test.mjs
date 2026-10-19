import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/components/SevakAttendancePage.tsx', import.meta.url), 'utf8');
const layout = await readFile(new URL('../src/components/AttendanceWorkspaceLayout.tsx', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/components/SevakLayout.tsx', import.meta.url), 'utf8');
const previewStart = page.indexOf('function AttendanceAdminPreview');
const previewEnd = page.indexOf('export default function SevakAttendancePage');
const preview = page.slice(previewStart, previewEnd);

test('Admin attendance management preview exposes the three requested panels without writes', () => {
  assert.notEqual(previewStart, -1);
  assert.ok(previewEnd > previewStart);
  for (const label of ['Manage Sevaks', 'Manage Group Leaders', 'Manage Common Attendance Team']) {
    assert.ok(preview.includes(label));
  }
  assert.match(preview, /Assign department · Preview only/);
  assert.match(preview, /Preview Group Leader change/);
  assert.match(preview, /Save team · Preview only/);
  assert.match(preview, /from\('sevak_profiles'\)\.select\('id, auth_user_id'\)/);
  assert.doesNotMatch(preview, /\.\s*(?:insert|update|delete|upsert)\s*\(|supabase\.rpc\s*\(/);
});

test('common attendance preview offers five distinct member slots and one selectable manager', () => {
  assert.match(preview, /\['', '', '', '', ''\]/);
  assert.match(preview, /Common Attendance Manager/);
  assert.match(preview, /Common Attendance Member/);
  assert.match(preview, /Morning Group Sadhana/);
  assert.match(preview, /Common Meeting/);
  assert.match(preview, /Satsang/);
});

test('admin preview remains hidden from non-admin attendance users', () => {
  assert.match(page, /view === 'administration' && isAdmin && <AttendanceAdminPreview/);
  assert.match(page, /view === 'administration' && isAdmin && \([\s\S]*department-management-heading/);
  assert.match(page, /view === 'profiles' && isAdmin && \([\s\S]*sevak-approval-heading/);
});

test('all attendance pages share one responsive navy sidebar with route-aware navigation', () => {
  assert.match(layout, /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/);
  assert.match(layout, /bg-\[#101c32\]/);
  for (const [label, path] of [['Dashboard', '/admin'], ['Attendance workspace', '/sevak-attendance'], ['Sevak Profiles', '/sevak-attendance/profiles'], ['Attendance', '/sevak-attendance/manual'], ['Department & Team Management', '/sevak-attendance/administration'], ['Reports', '/sevak-attendance/reports']]) {
    assert.match(layout, new RegExp(`label: '${label}', href: '${path.replaceAll('/', '\\/')}'`));
  }
  assert.match(layout, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(layout, /aria-label=\{menuOpen \? 'Close attendance menu' : 'Open attendance menu'\}/);
  assert.match(shell, /pathname\.startsWith\('\/sevak-attendance'\)[\s\S]*?<AttendanceWorkspaceLayout session=\{session\} pathname=\{pathname\}/);
  for (const route of ['/sevak-attendance', '/sevak-attendance/reports', '/sevak-attendance/manual', '/sevak-attendance/profiles', '/sevak-attendance/administration']) assert.ok(layout.includes(route));
});
