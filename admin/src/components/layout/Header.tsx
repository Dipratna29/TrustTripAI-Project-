import React from 'react';
import { Menu, Sun, Moon, LogOut, Activity, BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdminEvents } from '../../context/AdminEventsContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Badge } from '../common/Badge';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { unread, criticalUnread } = useAdminEvents();

  return (
    <header className="h-16 px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 z-30">
      {/* Left side: Hamburger & Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 lg:hidden rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2">
          <Badge variant="success" size="sm" dot>
            <Activity className="w-3 h-3 inline mr-1" />
            Supabase Live
          </Badge>
        </div>
      </div>

      {/* Right side: Actions & User Menu */}
      <div className="flex items-center gap-3">
        {/* Notification center bell */}
        <Link
          to="/notification-center"
          title={`${unread} unread notifications`}
          className="relative p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <BellRing className="w-4 h-4" />
          {unread > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${criticalUnread > 0 ? 'bg-rose-600' : 'bg-amber-500'}`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* User Card */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
          <div className="hidden md:block text-right">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
              {user?.name || 'Administrator'}
            </p>
            <p className="text-[10px] text-slate-400 font-semibold uppercase">
              {user?.role || 'ADMIN'}
            </p>
          </div>

          <Badge variant={user?.role === 'SUPER_ADMIN' ? 'purple' : 'info'} size="sm">
            {user?.role || 'ADMIN'}
          </Badge>

          <button
            onClick={logout}
            title="Logout"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
