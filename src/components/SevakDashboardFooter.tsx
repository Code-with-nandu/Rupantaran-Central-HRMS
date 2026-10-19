import { Check } from 'lucide-react';

export default function SevakDashboardFooter() {
  return (
    <footer className="bg-[#1e3036] px-5 py-5 text-white/55 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>Central Human Resources · Art of Living International Center</span>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
          <a href="/sevak-dashboard" className="hover:text-white">Home</a>
          <a href="/sevak-attendance" className="hover:text-white">Attendance</a>
          <a href="/sevak/my-profile" className="hover:text-white">Sevak Profile</a>
          <a href="#contact" className="hover:text-white">Contact</a>
        </nav>
        <span className="inline-flex items-center gap-1.5"><Check size={13} /> In service</span>
      </div>
    </footer>
  );
}
