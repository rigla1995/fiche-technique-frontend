import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';

export interface AppNotification {
  id: string;
  eventType: 'new_inventaire';
  type: string;
  clientNom?: string;
  readAt: null | number;
  createdAt: number;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  clear: () => void;
  clearAllFromDB: () => Promise<void>;
  clearByEventType: (eventType: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  clear: () => {},
  clearAllFromDB: async () => {},
  clearByEventType: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  // Load persisted notifications from DB on login
  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    api.get('/api/notifications').then(({ data }) => {
      const mapped: AppNotification[] = data
        .filter((r: { eventType: string }) => r.eventType === 'new_inventaire')
        .map((r: { id: number; eventType: string; type: string; clientNom?: string; createdAt: string }) => ({
          id: String(r.id),
          eventType: r.eventType as AppNotification['eventType'],
          type: r.type,
          clientNom: r.clientNom,
          readAt: null,
          createdAt: new Date(r.createdAt).getTime(),
        }));
      setNotifications(mapped);
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback((eventType: AppNotification['eventType'], data: Record<string, unknown>) => {
    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random()}`,
      eventType,
      type: data.type as string,
      clientNom: data.clientNom as string | undefined,
      readAt: null,
      createdAt: Date.now(),
    };
    setNotifications((prev) => [notif, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000';
    const url = `${baseUrl}/api/notifications/stream`;

    const connect = () => {
      if (esRef.current) esRef.current.close();
      const es = new EventSource(`${url}?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.addEventListener('new_inventaire', (e) => {
        try { push('new_inventaire', JSON.parse(e.data)); } catch { /* ignore */ }
      });

      es.onerror = () => {
        es.close();
        setTimeout(connect, 5000);
      };
    };

    connect();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [user?.id, push]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const clearAllFromDB = useCallback(async () => {
    await api.delete('/api/notifications').catch(() => {});
    setNotifications([]);
  }, []);

  const clearByEventType = useCallback(async (eventType: string) => {
    await api.delete(`/api/notifications?eventType=${encodeURIComponent(eventType)}`).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.eventType !== eventType));
  }, []);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clear, clearAllFromDB, clearByEventType }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
