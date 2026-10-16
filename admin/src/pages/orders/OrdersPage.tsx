import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, ServerCrash, ShoppingBag } from 'lucide-react';
import api from '../../lib/api';
import { Badge, BadgeVariant } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

interface Order {
  id: number;
  user_id: number;
  equipment_id: number;
  item_name?: string;
  item_sku?: string;
  quantity: number;
  total_price: number;
  status: string;
  payment_method?: string | null;
  payment_status?: string | null;
  delivery_address?: string | null;
  contact_phone?: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  updated_at?: string | null;
  customer?: { user_id: number; username: string; name?: string } | null;
}

// Must match ORDER_TRANSITIONS in backend/services/admin_event_service.py
const NEXT_STATUSES: Record<string, string[]> = {
  pending: ['Confirmed', 'Cancelled'],
  confirmed: ['Processing', 'Shipped', 'Cancelled'],
  processing: ['Shipped', 'Cancelled'],
  shipped: ['Delivered'],
  delivered: [],
  cancelled: [],
};

const statusKey = (s?: string) => (s || 'pending').toLowerCase().split(' ')[0];

const statusVariant = (s?: string): BadgeVariant => {
  const k = statusKey(s);
  if (k === 'delivered') return 'success';
  if (k === 'cancelled') return 'danger';
  if (k === 'shipped' || k === 'processing') return 'purple';
  if (k === 'confirmed') return 'info';
  return 'warning';
};

const methodLabel = (o: Order) =>
  (o.payment_method || '').toUpperCase() === 'COD' || (o.status || '').includes('COD') ? 'Cash on Delivery' : 'Online (Razorpay)';

export const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState('ALL');
  const [method, setMethod] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/orders', { status, payment_method: method, page, page_size: 20 });
      setOrders(res.orders || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    } catch (err: any) {
      setError(err.message || 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [status, method, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-brand-600" /> Orders
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Safety gear orders, prepaid and Cash on Delivery.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100">
            {['ALL', 'Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map((s) => (
              <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s}</option>
            ))}
          </select>
          <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100">
            <option value="ALL">All payments</option>
            <option value="COD">Cash on Delivery</option>
            <option value="RAZORPAY">Online</option>
          </select>
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>Refresh</Button>
        </div>
      </div>

      {error ? (
        <EmptyState icon={<ServerCrash className="w-10 h-10 text-rose-500" />} title="Couldn't load orders" description={error} actionText="Retry" onAction={load} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="w-10 h-10" />} title="No orders" description="Orders placed in the TrustTrip app will appear here." />
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Order</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                  className="border-b last:border-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">#{o.id}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{o.quantity} × {o.item_name}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(Number(o.total_price || 0))}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{methodLabel(o)}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant(o.status)}>{o.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {totalPages} · {total} orders</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const OrderDetailPage: React.FC = () => {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('inventory:write');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/admin/orders/${id}`);
      setOrder(res.order);
    } catch (err: any) {
      setError(err.message || 'Could not load order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (next: string) => {
    if (!order) return;
    if (next === 'Cancelled' && !window.confirm(`Cancel order #${order.id}? Its ${order.quantity} unit(s) will be returned to stock.`)) return;
    setSaving(next);
    setNotice(null);
    try {
      const res = await api.patch(`/api/admin/orders/${order.id}/status`, { status: next });
      setOrder(res.order);
      setNotice(`Order marked ${next}.`);
    } catch (err: any) {
      setNotice(err.message || 'Could not update order');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="h-64 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />;
  if (error || !order) {
    return <EmptyState icon={<ServerCrash className="w-10 h-10 text-rose-500" />} title="Order unavailable" description={error || 'Not found'} actionText="Retry" onAction={load} />;
  }

  const next = NEXT_STATUSES[statusKey(order.status)] || [];
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-2.5 border-b last:border-0 border-slate-100 dark:border-slate-800 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900 dark:text-slate-100 break-all">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="w-4 h-4" /> All orders
      </Link>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Order #{order.id}</h1>
        <Badge variant={statusVariant(order.status)} size="md">{order.status}</Badge>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <Row label="Item" value={`${order.quantity} × ${order.item_name}${order.item_sku ? ` (${order.item_sku})` : ''}`} />
        <Row label="Total" value={formatCurrency(Number(order.total_price || 0))} />
        <Row label="Payment" value={`${methodLabel(order)}${order.payment_status ? ` · ${order.payment_status}` : ''}`} />
        {order.razorpay_payment_id && <Row label="Razorpay payment" value={order.razorpay_payment_id} />}
        <Row label="Customer" value={order.customer ? <Link className="text-brand-600 hover:underline" to={`/users/${order.customer.user_id}`}>@{order.customer.username}</Link> : `User #${order.user_id}`} />
        {order.contact_phone && <Row label="Contact" value={order.contact_phone} />}
        {order.delivery_address && <Row label="Delivery address" value={order.delivery_address} />}
        {order.latitude != null && order.longitude != null && (
          <Row label="Delivery point" value={<a className="text-brand-600 hover:underline" target="_blank" rel="noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${order.latitude}&mlon=${order.longitude}#map=17/${order.latitude}/${order.longitude}`}>View on map</a>} />
        )}
        <Row label="Placed" value={formatDateTime(order.created_at)} />
        {order.updated_at && <Row label="Last updated" value={formatDateTime(order.updated_at)} />}
      </div>

      {canEdit && next.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Update status</h2>
          <div className="flex gap-2 flex-wrap">
            {next.map((s) => (
              <Button key={s} size="sm" variant={s === 'Cancelled' ? 'danger' : 'primary'} isLoading={saving === s}
                disabled={!!saving} onClick={() => changeStatus(s)}>
                Mark {s}
              </Button>
            ))}
          </div>
        </div>
      )}
      {notice && <p className="text-sm text-slate-600 dark:text-slate-300">{notice}</p>}
    </div>
  );
};
