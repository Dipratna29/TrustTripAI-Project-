import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOctagon, BellRing, CheckCheck, ChevronLeft, ChevronRight, CreditCard, Compass, ExternalLink,
  Mail, MailOpen, MessageSquareWarning, Package, RefreshCw, ServerCrash, ShoppingBag, Tag, UserPlus, Wifi, WifiOff,
} from 'lucide-react';
import api from '../../lib/api';
import { Badge, BadgeVariant } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { useAdminEvents } from '../../context/AdminEventsContext';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

type Category = 'ALL' | 'ORDER' | 'USER' | 'INVENTORY' | 'SOS' | 'COMPLAINT' | 'PAYMENT' | 'GUIDE' | 'OFFER' | 'SYSTEM';

interface AdminEvent {
  id: number;
  event_type: string;
  category: Exclude<Category, 'ALL'>;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata: Record<string, any>;
  is_read: boolean;
  read_by?: string | null;
  created_at: string;
}

const TABS: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: 'ALL', label: 'All', icon: <BellRing className="w-3.5 h-3.5" /> },
  { key: 'ORDER', label: 'Orders', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  { key: 'USER', label: 'Registrations', icon: <UserPlus className="w-3.5 h-3.5" /> },
  { key: 'INVENTORY', label: 'Inventory', icon: <Package className="w-3.5 h-3.5" /> },
  { key: 'SOS', label: 'SOS', icon: <AlertOctagon className="w-3.5 h-3.5" /> },
  { key: 'COMPLAINT', label: 'Complaints', icon: <MessageSquareWarning className="w-3.5 h-3.5" /> },
  { key: 'PAYMENT', label: 'Payments', icon: <CreditCard className="w-3.5 h-3.5" /> },
  { key: 'GUIDE', label: 'Guides', icon: <Compass className="w-3.5 h-3.5" /> },
  { key: 'OFFER', label: 'Offers', icon: <Tag className="w-3.5 h-3.5" /> },
  { key: 'SYSTEM', label: 'System', icon: <ServerCrash className="w-3.5 h-3.5" /> },
];

const SEVERITY_BADGE: Record<AdminEvent['severity'], BadgeVariant> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

/** Where the "Open" action leads for each entity type (only pages that exist in this admin). */
const entityLink = (e: AdminEvent): { to: string; label: string } | null => {
  switch (e.entity_type) {
    case 'order':
      return { to: `/orders/${e.entity_id}`, label: 'Open order' };
    case 'user':
      return { to: `/users/${e.entity_id}`, label: 'Open user' };
    case 'inventory_item':
      return { to: '/inventory', label: 'Open inventory' };
    case 'sos':
      return { to: '/sos', label: 'Open SOS' };
    case 'complaint':
      return { to: '/complaints', label: 'Open complaints' };
    case 'payment':
      return { to: '/payments', label: 'Open payments' };
    case 'guide':
      return { to: '/guides', label: 'Open guides' };
    case 'offer':
      return { to: '/offers', label: 'Open offers' };
    default:
      return null;
  }
};

const PAGE_SIZE = 20;

export const NotificationCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { unread, criticalUnread, version, live, refresh } = useAdminEvents();

  const [category, setCategory] = useState<Category>('ALL');
  const [status, setStatus] = useState<'all' | 'unread' | 'read'>('all');
  const [severity, setSeverity] = useState<'ALL' | 'INFO' | 'WARNING' | 'CRITICAL'>('ALL');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [page, setPage] = useState(1);

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/events', {
        category,
        status,
        severity,
        since: since ? new Date(`${since}T00:00:00`).toISOString() : undefined,
        until: until ? new Date(`${until}T23:59:59`).toISOString() : undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setEvents(res.events || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    } catch (err: any) {
      setError(err.message || 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, [category, status, severity, since, until, page]);

  useEffect(() => {
    load();
  }, [load]);

  // New events (Realtime or polling) -> refresh the visible page without a spinner
  useEffect(() => {
    if (version > 0) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const toggleRead = async (e: AdminEvent) => {
    setBusyId(e.id);
    try {
      const res = await api.patch(`/api/admin/events/${e.id}/read`, { read: !e.is_read });
      setEvents((list) => list.map((x) => (x.id === e.id ? { ...x, ...res.event } : x)));
      refresh();
    } catch (err: any) {
      setError(err.message || 'Could not update notification');
    } finally {
      setBusyId(null);
    }
  };

  const open = async (e: AdminEvent) => {
    const link = entityLink(e);
    if (!link) return;
    if (!e.is_read) {
      try {
        await api.patch(`/api/admin/events/${e.id}/read`, { read: true });
        refresh();
      } catch {
        // navigation still proceeds
      }
    }
    navigate(link.to);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await api.post('/api/admin/events/read-all', { category });
      await Promise.all([load(true), refresh()]);
    } catch (err: any) {
      setError(err.message || 'Could not mark notifications as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const summary = (e: AdminEvent) => {
    const m = e.metadata || {};
    const parts: string[] = [];
    if (m.order_id) parts.push(`Order #${m.order_id}`);
    if (m.total !== undefined && m.total !== null) parts.push(formatCurrency(Number(m.total), m.currency || 'INR'));
    if (m.amount !== undefined && m.amount !== null) parts.push(formatCurrency(Number(m.amount), m.currency || 'INR'));
    if (m.status) parts.push(`Status: ${m.status}`);
    if (m.current_stock !== undefined) parts.push(`Stock: ${m.current_stock}${m.minimum_stock !== undefined ? ` / min ${m.minimum_stock}` : ''}`);
    if (m.username && e.category !== 'USER') parts.push(`@${m.username}`);
    return parts.join(' · ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <BellRing className="w-6 h-6 text-brand-600" /> Notification Center
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Orders, registrations, stock, SOS, complaints and system alerts from live TrustTrip activity.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={live ? 'success' : 'neutral'} dot>
            {live ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {live ? 'Live' : 'Auto-refresh 20s'}
          </Badge>
          <Badge variant={unread ? 'warning' : 'neutral'}>{unread} unread</Badge>
          {criticalUnread > 0 && <Badge variant="danger" dot>{criticalUnread} critical</Badge>}
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { load(); refresh(); }}>
            Refresh
          </Button>
          <Button size="sm" leftIcon={<CheckCheck className="w-3.5 h-3.5" />} onClick={markAll} isLoading={markingAll} disabled={!unread}>
            Mark all read
          </Button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => resetPage(setCategory)(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
              category === t.key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <label className="text-xs font-semibold text-slate-500">
          Status
          <select
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value as any)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Severity
          <select
            value={severity}
            onChange={(e) => resetPage(setSeverity)(e.target.value as any)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100"
          >
            <option value="ALL">All</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          From
          <input type="date" value={since} onChange={(e) => resetPage(setSince)(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100" />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          To
          <input type="date" value={until} onChange={(e) => resetPage(setUntil)(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100" />
        </label>
      </div>

      {/* List */}
      {error ? (
        <EmptyState icon={<ServerCrash className="w-10 h-10 text-rose-500" />} title="Couldn't load notifications"
          description={error} actionText="Retry" onAction={() => load()} />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={<BellRing className="w-10 h-10" />} title="No notifications"
          description={status === 'unread' ? "You're all caught up." : 'New orders, registrations, SOS alerts and stock changes will appear here.'} />
      ) : (
        <ul className="space-y-2.5">
          {events.map((e) => {
            const link = entityLink(e);
            return (
              <li
                key={e.id}
                className={`flex gap-4 p-4 rounded-2xl border transition-colors ${
                  e.is_read
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    : 'bg-brand-50/60 dark:bg-brand-950/20 border-brand-200 dark:border-brand-800/60'
                }`}
              >
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${e.is_read ? 'bg-transparent' : e.severity === 'CRITICAL' ? 'bg-rose-500' : 'bg-brand-500'}`}
                  aria-label={e.is_read ? 'Read' : 'Unread'} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm text-slate-900 dark:text-slate-100 ${e.is_read ? 'font-medium' : 'font-bold'}`}>{e.title}</p>
                    <Badge variant={SEVERITY_BADGE[e.severity]} size="sm">{e.severity}</Badge>
                    <Badge variant="neutral" size="sm">{e.category}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{e.message}</p>
                  {summary(e) && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{summary(e)}</p>}
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {formatDateTime(e.created_at)}
                    {e.entity_id ? ` · ${e.entity_type} #${e.entity_id}` : ''}
                    {e.is_read && e.read_by ? ` · read by ${e.read_by}` : ''}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-start gap-2 shrink-0">
                  {link && (
                    <Button size="sm" variant="outline" rightIcon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => open(e)}>
                      {link.label}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" isLoading={busyId === e.id} onClick={() => toggleRead(e)}
                    leftIcon={e.is_read ? <Mail className="w-3.5 h-3.5" /> : <MailOpen className="w-3.5 h-3.5" />}>
                    {e.is_read ? 'Mark unread' : 'Mark read'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages} · {total} notifications
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};
