import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';

export interface AppNotification {
  id: string;
  eventType: 'new_demande' | 'demande_traitee';
  demandeId: number;
  type: string;
  clientNom?: string;
  statut?: string;
  notesAdmin?: string | null;
  readAt: null | number;
  createdAt: number;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  clear: () => void;
  clearAllFromDB: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  clear: () => {},
  clearAllFromDB: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  // Load persisted notifications from DB on login
  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    api.get('/api/notifications').then(({ data }) => {
      const mapped: AppNotification[] = data.map((r: {
        id: number; eventType: string; demandeId: number; type: string;
        clientNom?: string; statut?: string; notesAdmin?: string | null; createdAt: string;
      }) => ({
        id: String(r.id),
        eventType: r.eventType as AppNotification['eventType'],
        demandeId: r.demandeId,
        type: r.type,
        clientNom: r.clientNom,
        statut: r.statut,
        notesAdmin: r.notesAdmin,
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
      demandeId: data.demandeId as number,
      type: data.type as string,
      clientNom: data.clientNom as string | undefined,
      statut: data.statut as string | undefined,
      notesAdmin: data.notesAdmin as string | null | undefined,
      readAt: null,
      createdAt: Date.now(),
    };
    setNotifications((prev) => [notif, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const url = `/api/notifications/stream`;

    const connect = () => {
      if (esRef.current) esRef.current.close();
      const es = new EventSource(`${url}?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.addEventListener('new_demande', (e) => {
        try { push('new_demande', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      es.addEventListener('demande_traitee', (e) => {
        try { push('demande_traitee', JSON.parse(e.data)); } catch { /* ignore */ }
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

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clear, clearAllFromDB }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
