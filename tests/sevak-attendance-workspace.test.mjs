import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const reports = await readFile(new URL('../src/components/SevakAttendanceDashboardPage.tsx', import.meta.url), 'utf8');
const workspace = await readFile(new URL('../src/components/SevakAttendanceWorkspacePage.tsx', import.meta.url), 'utf8');
const attendanceLayout = await readFile(new URL('../src/components/AttendanceWorkspaceLayout.tsx', import.meta.url), 'utf8');

test('attendance dashboard is a separate protected page linked from the shared sidebar', () => {
  assert.match(app, /pathname === '\/sevak-attendance\/dashboard'[\s\S]*?requestedRole="attendance"[\s\S]*?overview/);
  assert.match(attendanceLayout, /label: 'Dashboard', href: '\/sevak-attendance\/dashboard'/);
  assert.match(attendanceLayout, /const active = activePath === href/);
  assert.match(reports, /if \(overview\)[\s\S]*?Attendance Dashboard[\s\S]*?Monthly attendance trend/);
  assert.match(workspace, /Attendance workspace/);
});

test('attendance workspace routes separate reports, manual entry, profiles, and administration', () => {
  for (const route of ['/sevak-attendance', '/sevak-attendance/dashboard', '/sevak-attendance/reports', '/sevak-attendance/manual', '/sevak-attendance/profiles', '/sevak-attendance/administration']) {
    assert.ok(app.includes(`'${route}'`), `expected protected route ${route}`);
  }
  assert.match(app, /pathname === '\/sevak-attendance\/manual'[\s\S]*?SevakManualAttendancePage/);
  assert.match(app, /pathname === '\/sevak-attendance\/administration'[\s\S]*?requestedRole="admin"/);
  assert.match(app, /pathname === '\/sevak-attendance\/reports'[\s\S]*?requestedRole="attendance"/);
  for (const href of ['/sevak-attendance/reports', '/sevak-attendance/manual', '/sevak-attendance/profiles', '/sevak-attendance/administration']) assert.ok(workspace.includes(href));
});

test('reports offer all required periods, custom range, shared filters, summaries, and export', () => {
  for (const [value, label] of [['daily', 'Daily'], ['last3days', 'Last 3 Days'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['last3months', 'Last 3 Months']]) {
    assert.match(reports, new RegExp(`<option value="${value}">${label}<\\/option>`));
  }
  assert.match(reports, /<option value="custom">Custom Range<\/option>/);
  assert.match(reports, /Attendance Percentage/);
  assert.match(reports, /Attendance type summary/);
  assert.match(reports, /Weekly absence trend/);
  assert.match(reports, /Top 6 attendance performers/);
  assert.match(reports, /Export report/);
  assert.match(reports, /id="monthly-attendance-heading"/);
  assert.match(reports, /No attendance records in this period\. Missing records are not shown as absences\./);
});
