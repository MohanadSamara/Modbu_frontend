import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';

const STAT_CARDS = [
  {
    label: 'Projects',
    value: '—',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    color: 'from-blue-500 to-indigo-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    desc: 'Active projects',
  },
  {
    label: 'Devices',
    value: '—',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    color: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    desc: 'Connected devices',
  },
  {
    label: 'Events',
    value: '—',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    desc: 'Recent log entries',
  },
  {
    label: 'Uptime',
    value: '—',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    color: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    desc: 'System uptime',
  },
];

const QUICK_LINKS = [
  {
    to: '/projects',
    label: 'Manage Projects',
    desc: 'Create locations, add and connect Modbus devices.',
    permission: 'project.read',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    accent: 'group-hover:text-blue-400',
    border: 'hover:border-blue-500/40',
  },
  {
    to: '/events',
    label: 'View Events',
    desc: 'Browse device action logs and Modbus events.',
    permission: 'alarm.read',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    accent: 'group-hover:text-amber-400',
    border: 'hover:border-amber-500/40',
  },
  {
    to: '/settings',
    label: 'Configure Settings',
    desc: 'Adjust alarms, connection timeouts and display options.',
    permission: 'settings.read',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    accent: 'group-hover:text-purple-400',
    border: 'hover:border-purple-500/40',
  },
];

export default function Dashboard() {
  const { hasPermission } = useAuth();
  // Only surface shortcuts the user can actually open.
  const quickLinks = QUICK_LINKS.filter((l) => !l.permission || hasPermission(l.permission));

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 shadow-2xl">
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold tracking-wide">
              Modbus TCP
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-200 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
            Modbus Hub
          </h1>
          <p className="text-blue-100 text-base max-w-lg leading-relaxed">
            Industrial device monitoring and control. Manage projects, connect Modbus TCP devices, monitor fuel levels, and review event logs.
          </p>
          {hasPermission('project.read') && (
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors shadow-lg"
            >
              Open Projects
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl bg-[#1a1d27] border border-white/5 p-5 flex flex-col gap-3 hover:border-white/10 transition-colors"
          >
            <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center ${card.text}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
              <p className="text-sm font-medium text-gray-400">{card.label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links — hidden entirely if the user can't open any of them */}
      {quickLinks.length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
          Quick Access
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickLinks.map(({ to, label, desc, icon, accent, border }) => (
            <Link
              key={to}
              to={to}
              className={`group rounded-2xl bg-[#1a1d27] border border-white/5 p-6 flex items-start gap-4 transition-all duration-200 hover:bg-[#1e2130] ${border}`}
            >
              <span className={`mt-0.5 text-gray-500 transition-colors ${accent}`}>
                {icon}
              </span>
              <div>
                <p className={`font-semibold text-gray-200 transition-colors ${accent}`}>
                  {label}
                </p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{desc}</p>
              </div>
              <svg
                className="w-4 h-4 text-gray-600 ml-auto self-center flex-shrink-0 group-hover:text-gray-400 transition-colors"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
      )}

      {/* Status footer */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Backend API reachable
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {new Date().toLocaleString()}
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Modbus TCP / Oracle DB
        </div>
      </div>
    </div>
  );
}
