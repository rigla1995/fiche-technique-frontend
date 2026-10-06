import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { User } from '../types';
import api from '../api/client';
import { vocabDefaut, vocabDuLexique } from '../vocab/vocab';
import type { Vocab } from '../vocab/vocab';
import { VocabContext } from '../vocab/contexte';
import { appliquerVocabulaireI18n } from '../i18n';

interface AuthContextType {
  user: User | null;
  token: string | null;
  canWrite: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** LabFlow Compta (S3a) : session reçue d'un passage entre les deux adresses (même réponse qu'une connexion). */
  ouvrirSession: (data: { token: string; user: User }) => User;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  advanceOnboarding: (step: number) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// /auth/me est relu au retour de visibilité de l'onglet, au plus une fois par 5 minutes
// (un changement de lexique fait par l'admin arrive ainsi à l'écran sans reconnexion).
const DELAI_RAFRAICHISSEMENT_VISIBILITE_MS = 5 * 60 * 1000;

// Lexique du compte : admin, boss et non connecté gardent le vocabulaire par défaut (LabFlow).
const lexiqueDuCompte = (u: User | null) =>
  !u || u.role === 'super_admin' || u.role === 'boss' ? null : u.domaine?.lexique ?? null;

// Le user reçu de /auth/me rend-il, pour CHAQUE champ que le user en place porte déjà, la même valeur ?
// /auth/login et /auth/me ne rendent pas le même objet : le login a moins de champs (ni phone, ni
// entrepriseName, ni modeCompte, ni prolongationJours) et un autre ordre. Comparer les deux JSON entiers
// remplaçait le user au premier retour sur l'onglet après CHAQUE connexion, et une saisie en cours dans
// « Mon profil » était écrasée. Un champ que le user en place ne porte pas ne compte donc pas (champ absent
// du login, champ ajouté par un serveur plus récent pendant qu'un onglet reste ouvert) : il arrive avec le
// prochain user posé (rechargement, 'activites-changed', ou vrai changement d'un champ déjà porté).
const memeUserEnPlace = (enPlace: User | null, recu: User | null): boolean => {
  if (!enPlace || !recu) return enPlace === recu;
  const a = enPlace as unknown as Record<string, unknown>;
  const b = recu as unknown as Record<string, unknown>;
  return Object.keys(a).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Vocabulaire du compte (lot 2) : construit ici, lu par useVocabulaire(). L'objet n'est
  // recréé que si JSON.stringify(lexique) change — sa référence survit aux rafraîchissements
  // de /auth/me, pour ne pas relancer les effets ni les calculs mémoïsés des écrans.
  const [voc, setVoc] = useState<Vocab>(vocabDefaut);
  const userRef = useRef<User | null>(null);
  const signatureLexiqueRef = useRef('');
  const dernierAuthMeRef = useRef(0);

  // Point d'entrée UNIQUE de tout changement de user : pose le vocabulaire (et le paquet
  // i18n rendu avec lui) de façon synchrone, PUIS le user — les deux dans le même rendu.
  // `siChange` (retour sur l'onglet) : quand /auth/me rend, pour chaque champ du user déjà en
  // place, la même valeur (memeUserEnPlace), rien n'est posé et la fonction rend false — la
  // référence de `user` survit, comme celle de `voc`. Sans cela, un effet dépendant de [user]
  // serait relancé à chaque retour sur l'onglet et écraserait une saisie en cours.
  const appliquerUser = useCallback((data: User | null, siChange = false): boolean => {
    if (siChange && memeUserEnPlace(userRef.current, data)) return false;
    const lexique = lexiqueDuCompte(data);
    const signature = lexique ? JSON.stringify(lexique) : '';
    if (signature !== signatureLexiqueRef.current) {
      signatureLexiqueRef.current = signature;
      const suivant = vocabDuLexique(lexique);
      appliquerVocabulaireI18n(suivant);
      setVoc(suivant);
    }
    userRef.current = data;
    setUser(data);
    return true;
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      dernierAuthMeRef.current = Date.now();
      // Always refresh from server so onboardingStep is never stale
      // LabFlow Compta (S3a) : une réponse qui arrive après qu'une autre session a été ouverte (page d'arrivée d'un
      // passage) est ignorée — elle ne doit ni effacer ni écraser la nouvelle session.
      const toujoursLaMeme = () => localStorage.getItem('token') === storedToken;
      api.get('/auth/me')
        .then(({ data }) => {
          if (!toujoursLaMeme()) return;
          appliquerUser(data);
          localStorage.setItem('user', JSON.stringify(data));
        })
        .catch(() => {
          if (!toujoursLaMeme()) return;
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [appliquerUser]);

  // Rafraîchit le user (dont activitesCount) quand les activités/labos changent —
  // pour que les redirections (logo, home) restent dynamiques sans recharger la page.
  useEffect(() => {
    if (!token) return;
    const refresh = () => {
      dernierAuthMeRef.current = Date.now();
      return api.get('/auth/me')
        .then(({ data }) => { appliquerUser(data); localStorage.setItem('user', JSON.stringify(data)); })
        .catch(() => {});
    };
    // Retour sur l'onglet : relit /auth/me (au plus une fois par 5 min). Lecture SILENCIEUSE,
    // hors intercepteurs axios : un serveur en cours de redéploiement ou un jeton expiré ne
    // doit pas arracher l'utilisateur de sa page parce qu'il a changé d'onglet.
    const refreshOnVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - dernierAuthMeRef.current < DELAI_RAFRAICHISSEMENT_VISIBILITE_MS) return;
      dernierAuthMeRef.current = Date.now();
      fetch(`${api.defaults.baseURL ?? ''}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: User | null) => {
          // Ignoré si la session a changé entre-temps (déconnexion, autre compte).
          if (!data || localStorage.getItem('token') !== token) return;
          // Réponse identique au user en place : rien ne change, rien ne se re-rend.
          if (appliquerUser(data, true)) localStorage.setItem('user', JSON.stringify(data));
        })
        .catch(() => {});
    };
    window.addEventListener('activites-changed', refresh);
    window.addEventListener('labos-changed', refresh);
    // 'auth-refresh' : émis par l'intercepteur axios quand le backend signale un
    // droit révoqué (ex. accès acheteurs d'un gérant) — resynchronise le user.
    window.addEventListener('auth-refresh', refresh);
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => {
      window.removeEventListener('activites-changed', refresh);
      window.removeEventListener('labos-changed', refresh);
      window.removeEventListener('auth-refresh', refresh);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [token, appliquerUser]);

  const ouvrirSession = useCallback((data: { token: string; user: User }): User => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    dernierAuthMeRef.current = Date.now();
    flushSync(() => {
      setToken(data.token);
      appliquerUser(data.user);
    });
    return data.user;
  }, [appliquerUser]);

  const login = async (email: string, password: string): Promise<User> => {
    const { data } = await api.post('/auth/login', { email, password });
    return ouvrirSession(data as { token: string; user: User });
  };

  const logout = () => {
    setToken(null);
    appliquerUser(null); // déconnexion → vocabulaire par défaut
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const updateUser = (patch: Partial<User>) => {
    const u = userRef.current;
    if (!u) return;
    const updated = { ...u, ...patch };
    localStorage.setItem('user', JSON.stringify(updated));
    appliquerUser(updated);
  };

  const advanceOnboarding = async (step: number) => {
    await api.post('/auth/onboarding-step', { step });
    updateUser({ onboardingStep: step });
  };

  const canWrite = user !== null && (user.role === 'super_admin' || user.role === 'boss' || (user.modeCompte ?? 'actif') === 'actif');

  return (
    <AuthContext.Provider value={{ user, token, canWrite, login, ouvrirSession, logout, updateUser, advanceOnboarding, isLoading }}>
      <VocabContext.Provider value={voc}>
        {children}
      </VocabContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
