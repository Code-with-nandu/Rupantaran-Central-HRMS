/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import ScrollProgressBar from './components/ScrollProgressBar';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import WhyWeExist from './components/WhyWeExist';
import ProblemsAndPillars from './components/ProblemsAndPillars';
import OurFirst13 from './components/OurFirst13';
import JourneySection from './components/JourneySection';
import FundSection from './components/FundSection';
import UpiPaymentSection from './components/UpiPaymentSection';
import BecomeBigBrother from './components/BecomeBigBrother';
import Footer from './components/Footer';
import StudentDetailModal from './components/StudentDetailModal';
import JoinModal from './components/JoinModal';
import AdminDashboard from './components/AdminDashboard';
import DevelopmentHistoryPage from './components/DevelopmentHistoryPage';
import CodersDiaryPage from './components/CodersDiaryPage';
import UnifiedAuth from './components/UnifiedAuth';
import Dashboard from './components/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import UserPages from './components/UserPages';
import AuthUtilityBar from './components/AuthUtilityBar';
import HealthcareKnowledge from './components/HealthcareKnowledge';
import SevakAttendancePage from './components/SevakAttendancePage';
import SevakAttendanceDashboardPage from './components/SevakAttendanceDashboardPage';
import SevakManualAttendancePage from './components/SevakManualAttendancePage';
import SevakRegistrationPortalPage from './components/SevakRegistrationPortalPage';
import SevakSelfRegistrationPage from './components/SevakSelfRegistrationPage';
import SevakDashboard from './components/SevakDashboard';
import AiSecretaryPage from './components/AiSecretaryPage';
import RoleDashboardGate, { AdminDashboardNavigation, GroupLeaderDashboard } from './components/RoleDashboardGate';
import RoleSelectionPage from './components/RoleSelectionPage';
import { STUDENTS_DATA } from './data/mockData';
import { Student } from './types';

export default function App() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/sevak-dashboard';
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinRole, setJoinRole] = useState<string>('mentor');
  const [joinAmount, setJoinAmount] = useState<number | undefined>(undefined);

  const handleOpenJoinModal = (role = 'mentor', prefillAmount?: number) => {
    setJoinRole(role);
    setJoinAmount(prefillAmount);
    setJoinModalOpen(true);
  };

  const handleSelectStudentById = (id: number) => {
    const student = STUDENTS_DATA.find((s) => s.id === id);
    if (student) {
      setSelectedStudent(student);
    }
  };

  if (pathname === '/login') {
    return <UnifiedAuth initialMode="login" />;
  }

  if (pathname === '/signup') {
    return <UnifiedAuth initialMode="signup" />;
  }

  // Public, data-free entry point; destination routes enforce their own roles.
  if (pathname === '/role-dashboard') {
    return <RoleSelectionPage />;
  }

  // The Sevak inspiration page is public. Profile, attendance, and management
  // destinations linked from it remain protected by their own routes.
  if (pathname === '/ai-secretary') {
    return <AiSecretaryPage />;
  }

  if (pathname === '/sevak-dashboard') {
    return <SevakDashboard pathname={pathname} />;
  }

  const protectedPaths = ['/dashboard', '/role-redirect', '/sevak/panel', '/group-leader', '/admin', '/register-problem', '/my-problems', '/profile', '/notifications', '/sevak-dashboard/leave', '/sevak-dashboard/medical', '/sevak-dashboard/attendance', '/sevak-attendance', '/sevak-attendance/manual'];
  if (protectedPaths.includes(pathname)) {
    return (
      <>
        {!pathname.startsWith('/sevak-dashboard') && <AuthUtilityBar />}
        <ProtectedRoute>
          {(session) => pathname === '/role-redirect'
            ? <RoleDashboardGate session={session} requestedRole="landing" />
            : pathname === '/admin'
              ? <RoleDashboardGate session={session} requestedRole="admin"><><AdminDashboardNavigation /><AdminDashboard /></></RoleDashboardGate>
              : pathname === '/sevak/panel'
                ? <RoleDashboardGate session={session} requestedRole="sevak"><SevakSelfRegistrationPage page="my-profile" /></RoleDashboardGate>
              : pathname === '/group-leader'
                ? <RoleDashboardGate session={session} requestedRole="group_leader"><GroupLeaderDashboard session={session} /></RoleDashboardGate>
              : pathname === '/sevak-dashboard/attendance'
                ? <RoleDashboardGate session={session} requestedRole="sevak"><SevakAttendanceDashboardPage session={session} /></RoleDashboardGate>
              : pathname === '/sevak-attendance'
                ? <RoleDashboardGate session={session} requestedRole="attendance"><SevakAttendancePage shellSession={session} /></RoleDashboardGate>
                : pathname.startsWith('/sevak-dashboard')
                  ? <RoleDashboardGate session={session} requestedRole="sevak"><SevakDashboard session={session} pathname={pathname} /></RoleDashboardGate>
              : pathname === '/dashboard'
                ? <Dashboard session={session} />
              : pathname === '/sevak-attendance/manual'
                ? <SevakManualAttendancePage shellSession={session} />
                : <UserPages pathname={pathname} session={session} />}
        </ProtectedRoute>
      </>
    );
  }

  if (pathname === '/development-history') {
    return (
      <div className="min-h-screen bg-[#050508] text-white selection:bg-amber-500/30 selection:text-amber-200 font-sans antialiased overflow-x-hidden">
        <AuthUtilityBar />
        <Navbar onOpenJoinModal={handleOpenJoinModal} />
        <DevelopmentHistoryPage />
        <Footer />
        <JoinModal
          isOpen={joinModalOpen}
          onClose={() => setJoinModalOpen(false)}
          defaultRole={joinRole}
          defaultAmount={joinAmount}
        />
      </div>
    );
  }

  if (pathname === '/coders-diary') {
    return (
      <div className="min-h-screen bg-[#050508] text-white selection:bg-amber-500/30 selection:text-amber-200 font-sans antialiased overflow-x-hidden">
        <AuthUtilityBar />
        <Navbar onOpenJoinModal={handleOpenJoinModal} />
        <CodersDiaryPage />
        <Footer />
        <JoinModal
          isOpen={joinModalOpen}
          onClose={() => setJoinModalOpen(false)}
          defaultRole={joinRole}
          defaultAmount={joinAmount}
        />
      </div>
    );
  }

  if (pathname === '/healthcare') {
    return (
      <div className="min-h-screen bg-[#050508] text-white selection:bg-amber-500/30 selection:text-amber-200 font-sans antialiased overflow-x-hidden">
        <AuthUtilityBar />
        <Navbar onOpenJoinModal={handleOpenJoinModal} />
        <HealthcareKnowledge />
        <Footer />
        <JoinModal
          isOpen={joinModalOpen}
          onClose={() => setJoinModalOpen(false)}
          defaultRole={joinRole}
          defaultAmount={joinAmount}
        />
      </div>
    );
  }

  if (pathname === '/sevak/register' || pathname === '/sevak-registration') {
    return <SevakRegistrationPortalPage />;
  }

  if (pathname === '/sevak/create-profile') {
    return <SevakSelfRegistrationPage page="create-profile" />;
  }

  if (pathname === '/sevak/my-profile') {
    return <SevakSelfRegistrationPage page="my-profile" />;
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-amber-500/30 selection:text-amber-200 font-sans antialiased overflow-x-hidden">
      {/* Subtle Viewport Journey Scroll Progress Bar */}
      <ScrollProgressBar />

      {/* Precision Top Bar Navigation */}
      <AuthUtilityBar />
      <Navbar onOpenJoinModal={handleOpenJoinModal} />

      {/* Hero with 3D Depth Interactive Constellation */}
      <Hero
        onOpenJoinModal={handleOpenJoinModal}
        onSelectStudent={handleSelectStudentById}
      />

      {/* 01. Why We Exist */}
      <WhyWeExist />

      {/* 02 & 03. Five Problems & Five Pillars */}
      <ProblemsAndPillars />

      {/* 04. Our First 15 (Pilot Cohort) */}
      <OurFirst13 onSelectStudent={(student) => setSelectedStudent(student)} />

      {/* 05. Big Bro Journey */}
      <JourneySection />

      {/* 06. Big Bro Common Fund (â‚¹10,000/mo for all 15 students - May 13 / Mai Tera) */}
      <FundSection onOpenJoinModal={handleOpenJoinModal} />

      {/* 07. Direct UPI Payment / Contribution Section */}
      <UpiPaymentSection />

      {/* 08. Become a Big Bro (Mai Tera) */}
      <BecomeBigBrother onOpenJoinModal={handleOpenJoinModal} />

      {/* Footer */}
      <Footer />

      {/* Trainee Detail Modal */}
      <StudentDetailModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />

      {/* Interactive Join / Pledge Modal */}
      <JoinModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        defaultRole={joinRole}
        defaultAmount={joinAmount}
      />
    </div>
  );
}

