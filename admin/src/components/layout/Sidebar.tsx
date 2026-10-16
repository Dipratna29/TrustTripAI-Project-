import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  AlertOctagon,
  MessageSquareWarning,
  Package,
  AlertTriangle,
  History,
  Compass,
  Building2,
  Tag,
  BadgePercent,
  CreditCard,
  Bell,
  ShieldCheck,
  FileText,
  Settings,
  LogOut,
  ChevronDown,
  X,
  ShieldAlert,
  BellRing,
  ShoppingBag
} from 'lucide-react';
import { useAdminEvents } from '../../context/AdminEventsContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout, hasRole } = useAuth();
  const { unread, criticalUnread } = useAdminEvents();
  const [inventoryOpen, setInventoryOpen] = React.useState(true);
  const [adminOpen, setAdminOpen] = React.useState(true);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-600 text-white shadow-sm font-semibold'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
    }`;

  const subNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 pl-9 rounded-lg text-xs font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 font-bold'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
    }`;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header Branding */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
          <NavLink to="/" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-700 to-brand-500 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-lg tracking-tight text-slate-900 dark:text-white">
                Trust<span className="text-brand-600 dark:text-brand-400">Trip</span>
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-widest text-slate-400 -mt-1">
                Admin Console
              </span>
            </div>
          </NavLink>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 lg:hidden rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          {/* Main Navigation */}
          <NavLink to="/" end className={navLinkClass} onClick={onClose}>
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/notification-center" className={navLinkClass} onClick={onClose}>
            <BellRing className="w-4 h-4 text-brand-500" />
            <span className="flex-1">Notification Center</span>
            {unread > 0 && (
              <span
                className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  criticalUnread > 0 ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                }`}
                aria-label={`${unread} unread notifications`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>

          <NavLink to="/orders" className={navLinkClass} onClick={onClose}>
            <ShoppingBag className="w-4 h-4 text-emerald-500" />
            <span>Orders</span>
          </NavLink>

          <NavLink to="/users" className={navLinkClass} onClick={onClose}>
            <Users className="w-4 h-4" />
            <span>Users</span>
          </NavLink>

          <NavLink to="/sos" className={navLinkClass} onClick={onClose}>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
            <span>SOS Incidents</span>
          </NavLink>

          <NavLink to="/complaints" className={navLinkClass} onClick={onClose}>
            <MessageSquareWarning className="w-4 h-4 text-amber-500" />
            <span>Complaints</span>
          </NavLink>

          {/* Inventory Group */}
          <div>
            <button
              onClick={() => setInventoryOpen(!inventoryOpen)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-brand-500" />
                <span>Inventory</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-150 ${inventoryOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {inventoryOpen && (
              <div className="mt-1 space-y-0.5">
                <NavLink to="/inventory" end className={subNavLinkClass} onClick={onClose}>
                  <span>All Items</span>
                </NavLink>
                <NavLink to="/inventory/low-stock" className={subNavLinkClass} onClick={onClose}>
                  <span className="flex items-center justify-between w-full">
                    <span>Low Stock</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  </span>
                </NavLink>
                <NavLink to="/inventory/history" className={subNavLinkClass} onClick={onClose}>
                  <span>Transactions</span>
                </NavLink>
              </div>
            )}
          </div>

          <div className="pt-2 pb-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Operations
            </p>
          </div>

          <NavLink to="/guides" className={navLinkClass} onClick={onClose}>
            <Compass className="w-4 h-4 text-teal-500" />
            <span>Guides</span>
          </NavLink>

          <NavLink to="/facilities" className={navLinkClass} onClick={onClose}>
            <Building2 className="w-4 h-4 text-blue-500" />
            <span>Facilities</span>
          </NavLink>

          <NavLink to="/offers" className={navLinkClass} onClick={onClose}>
            <Tag className="w-4 h-4 text-purple-500" />
            <span>Offers & Deals</span>
          </NavLink>

          <NavLink to="/pricing" className={navLinkClass} onClick={onClose}>
            <BadgePercent className="w-4 h-4 text-indigo-500" />
            <span>Fair Pricing</span>
          </NavLink>

          <NavLink to="/payments" className={navLinkClass} onClick={onClose}>
            <CreditCard className="w-4 h-4 text-emerald-500" />
            <span>Payments</span>
          </NavLink>

          <NavLink to="/notifications" className={navLinkClass} onClick={onClose}>
            <Bell className="w-4 h-4 text-sky-500" />
            <span>Notifications</span>
          </NavLink>

          {/* Administration Group */}
          <div className="pt-2 pb-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              System
            </p>
          </div>

          <div>
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>Administration</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-150 ${adminOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {adminOpen && (
              <div className="mt-1 space-y-0.5">
                {hasRole(['SUPER_ADMIN']) && (
                  <NavLink to="/admins" className={subNavLinkClass} onClick={onClose}>
                    <span>Admin Accounts</span>
                  </NavLink>
                )}
                <NavLink to="/audit-logs" className={subNavLinkClass} onClick={onClose}>
                  <span>Audit Logs</span>
                </NavLink>
              </div>
            )}
          </div>

          <NavLink to="/settings" className={navLinkClass} onClick={onClose}>
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Settings</span>
          </NavLink>
        </div>

        {/* Footer User Info & Logout */}
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {user?.name ? user.name[0].toUpperCase() : 'A'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {user?.name || 'Administrator'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {user?.role || 'ADMIN'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
