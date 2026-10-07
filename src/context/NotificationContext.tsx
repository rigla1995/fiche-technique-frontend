import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';

export interface AppNotification {
  id: string;
  eventType:
    | 'new_demande'
    | 'demande_traitee'
    | 'new_inventaire'
    | 'nouvelle_commande_acheteur'
    | 'demande_acces_recue'
    // LabFlow Compta (S3b) : un comptable a quitté l'accès à la comptabilité du client
    | 'comptable_parti';
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

// LabFlow Compta (étape S3c) : `produit="compta"` donne la cloche de LabFlow Compta. Le serveur ne sert alors que ses
// notifications (`?produit=compta` sur la liste, « vues » et l'effacement : celles de LabFlow ne sont jamais touchées) ;
// le flux instantané, commun, est filtré de même (notificationAcceptee). Sans `produit` : la cloche de LabFlow, inchangée.
type Produit = 'labflow' | 'compta';
// Types de notification de LabFlow Compta pour une personne qui n'est pas « comptable » : aucun encore (ils seront
// choisis avec le client, le module fini) — même liste que le serveur (notificationController.TYPES_COMPTA).
const TYPES_COMPTA: string[] = [];
const notificationAcceptee = (produit: Produit, role: string | undefined, eventType: string) =>
  produit !== 'compta' || role === 'comptable' || TYPES_COMPTA.includes(eventType);

export function NotificationProvider({ children, produit = 'labflow' }: { children: React.ReactNode; produit?: Produit }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const suffixe = produit === 'compta' ? '?produit=compta' : '';

  // Load persisted notifications from DB on login
  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    api.get(`/api/notifications${suffixe}`).then(({ data }) => {
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

  const role = user?.role;
  const push = useCallback((eventType: AppNotification['eventType'], data: Record<string, unknown>) => {
    if (!notificationAcceptee(produit, role, eventType)) return;
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
  }, [produit, role]);

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
      es.addEventListener('nouvelle_commande_acheteur', (e) => {
        try { push('nouvelle_commande_acheteur', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      // Demande d'accès reçue via le site vitrine (admins) — était NON écouté :
      // c'est la cause du « pas instantané » (la notif n'apparaissait qu'au reload).
      es.addEventListener('demande_acces_recue', (e) => {
        try { push('demande_acces_recue', JSON.parse(e.data)); } catch { /* ignore */ }
      });
      es.addEventListener('comptable_parti', (e) => {
        try { push('comptable_parti', JSON.parse(e.data)); } catch { /* ignore */ }
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
    api.post(`/api/notifications/seen${suffixe}`).catch(() => {});
  }, [suffixe]);

  const clear = useCallback(() => setNotifications([]), []);

  const clearAllFromDB = useCallback(async () => {
    await api.delete(`/api/notifications${suffixe}`).catch(() => {});
    setNotifications([]);
  }, [suffixe]);

  const clearByEventType = useCallback(async (eventType: string) => {
    await api.delete(`/api/notifications?eventType=${encodeURIComponent(eventType)}${suffixe ? `&${suffixe.slice(1)}` : ''}`).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.eventType !== eventType));
  }, [suffixe]);

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
