import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

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
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  clear: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

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
      // SSE doesn't support custom headers; use cookie-based or query-param token
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

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clear }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
