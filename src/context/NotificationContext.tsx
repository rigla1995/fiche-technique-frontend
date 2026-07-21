import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';

export interface AppNotification {
  id: string;
  eventType:
    | 'new_demande'
    | 'demande_traitee'
    | 'new_inventaire'
    | 'demande_capacite_validee'
    | 'demande_gerant_validee'
    | 'nouvelle_commande_acheteur'
    | 'demande_acces_recue'
    | 'avenant_signe';
  demandeId?: number;
  refId?: number;
  refKind?: string;
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
  /** Ouverture du panneau : marque tout comme lu localement + purge serveur des notifs informatives. */
  markSeen: () => void;
  clear: () => void;
  clearAllFromDB: () => Promise<void>;
  clearByEventType: (eventType: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  markSeen: () => {},
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
      const mapped: AppNotification[] = data.map((r: {
        id: number; eventType: string; demandeId?: number; refId?: number; refKind?: string;
        type: string; clientNom?: string; statut?: string; notesAdmin?: string | null;
        readAt?: string | null; createdAt: string;
      }) => ({
        id: String(r.id),
        eventType: r.eventType as AppNotification['eventType'],
        demandeId: r.demandeId,
        refId: r.refId,
        refKind: r.refKind,
        type: r.type,
        clientNom: r.clientNom,
        statut: r.statut,
        notesAdmin: r.notesAdmin,
        readAt: r.readAt ? new Date(r.readAt).getTime() : null,
        createdAt: new Date(r.createdAt).getTime(),
      }));
      setNotifications(mapped);
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback((eventType: AppNotification['eventType'], data: Record<string, unknown>) => {
    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random()}`,
      eventType,
      demandeId: data.demandeId as number | undefined,
      refId: data.refId as number | undefined,
      refKind: data.refKind as string | undefined,
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
    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000';
    const url = `${baseUrl}/api/notifications/stream`;

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
      es.addEventListener('new_inventaire', (e) => {
        try { push('new_inventaire', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      es.addEventListener('demande_capacite_validee', (e) => {
        try { push('demande_capacite_validee', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      es.addEventListener('demande_gerant_validee', (e) => {
        try { push('demande_gerant_validee', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      es.addEventListener('nouvelle_commande_acheteur', (e) => {
        try { push('nouvelle_commande_acheteur', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      // Demande d'accès reçue via le site vitrine (admins) — était NON écouté :
      // c'est la cause du « pas instantané » (la notif n'apparaissait qu'au reload).
      es.addEventListener('demande_acces_recue', (e) => {
        try { push('demande_acces_recue', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      es.addEventListener('avenant_signe', (e) => {
        try { push('avenant_signe', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      // Retrait instantané d'une notif « file d'attente » quand l'entité source est
      // traitée côté serveur (ex. demande d'accès passée en contactée/refusée/convertie).
      es.addEventListener('notif_removed', (e) => {
        try {
          const d = JSON.parse(e.data);
          setNotifications((prev) => prev.filter(
            (n) => !(n.refKind === d.refKind && n.refId === d.refId)
          ));
        } catch { /* ignore */ }
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

  // À l'ouverture du panneau : on marque tout comme lu localement, et on demande au
  // serveur de PURGER les notifs informatives (règle « ouvertes = supprimées »). Les
  // notifs « file d'attente » restent (le serveur les marque seulement lues). On garde
  // l'affichage local pour la session en cours pour que les clics fonctionnent encore.
  const markSeen = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
    api.post('/api/notifications/seen').catch(() => {});
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
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, markSeen, clear, clearAllFromDB, clearByEventType }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
