import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { supabase } from '../lib/supabase';

/**
 * Shared unread state for the admin notification center.
 * - Supabase Realtime (INSERT/UPDATE on admin_events) triggers an immediate refresh when available.
 * - Polling every 20s (and on tab focus / reconnect) is the fallback, so the badge stays correct
 *   even if Realtime is unavailable or the socket drops.
 * Subscribers (e.g. the notification list) can listen for `version` changes to reload.
 */
interface AdminEventsState {
  unread: number;
  criticalUnread: number;
  version: number;
  live: boolean;
  refresh: () => Promise<void>;
}

const AdminEventsContext = createContext<AdminEventsState>({
  unread: 0,
  criticalUnread: 0,
  version: 0,
  live: false,
  refresh: async () => {},
});

const POLL_MS = 20000;

export const AdminEventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unread, setUnread] = useState(0);
  const [criticalUnread, setCriticalUnread] = useState(0);
  const [version, setVersion] = useState(0);
  const [live, setLive] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await api.get('/api/admin/events/unread-count');
      if (res?.success) {
        setUnread((prev) => {
          if (prev !== res.unread) setVersion((v) => v + 1);
          return res.unread;
        });
        setCriticalUnread(res.critical_unread || 0);
      }
    } catch {
      // keep the last known count; polling retries
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [refresh]);

  // Optional Realtime: needs the admin's Supabase JWT so RLS lets admins (only) receive rows
  useEffect(() => {
    const token = localStorage.getItem('trusttrip_admin_token');
    if (!token) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      supabase.realtime.setAuth(token);
      channel = supabase
        .channel('admin-events')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_events' }, () => {
          setVersion((v) => v + 1);
          refresh();
        })
        .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    } catch {
      setLive(false);
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh]);

  return (
    <AdminEventsContext.Provider value={{ unread, criticalUnread, version, live, refresh }}>
      {children}
    </AdminEventsContext.Provider>
  );
};

export const useAdminEvents = () => useContext(AdminEventsContext);
