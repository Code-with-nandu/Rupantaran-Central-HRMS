import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/components/SevakAttendancePage.tsx', import.meta.url), 'utf8');
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
  assert.match(page, /\{isAdmin && <AttendanceAdminPreview/);
});

test('Admin attendance layout has a responsive dark sidebar with working dashboard navigation', () => {
  assert.match(page, /function AttendanceAdminSidebar/);
  assert.match(page, /bg-\[#0b0b0e\]/);
  assert.match(page, /md:grid-cols-\[228px_minmax\(0,1fr\)\]/);
  assert.match(page, /label: 'Dashboard', href: '\/admin'/);
  assert.match(page, /label: 'Attendance', href: '#attendance-heading', icon: CalendarCheck2, active: true/);
  assert.match(page, /aria-label=\{menuOpen \? 'Close attendance navigation' : 'Open attendance navigation'\}/);
  assert.match(page, /\{isAdmin && <AttendanceAdminSidebar \/>\}/);
});
