import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Toute MUTATION réussie (hors chat IA) signale que les données du compte ont
    // pu changer — le guide de mise en route s'en sert pour recalculer son état
    // en direct (saisie d'appro sans navigation, création de produit, etc.).
    const method = (response.config?.method || '').toLowerCase();
    const url = response.config?.url || '';
    if (method !== 'get' && !url.includes('/api/ai-assistant/')) {
      window.dispatchEvent(new CustomEvent('api-mutation', { detail: { url } }));
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      // LabFlow Compta (S3a) : un 401 reçu par un ANCIEN jeton (réponse tardive, alors qu'une autre session vient d'être
      // ouverte par un passage) ne touche pas à la session en place.
      const jetonRefuse = String(error.config?.headers?.Authorization || '').replace(/^Bearer /, '');
      const jetonActuel = localStorage.getItem('token') || '';
      if (jetonRefuse && jetonActuel && jetonRefuse !== jetonActuel) return Promise.reject(error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Sur les pages auth publiques (reset, invitation…), un vieux JWT expiré en
      // localStorage provoque un 401 de /auth/me : purger sans arracher l'utilisateur
      // de la page (sinon le 1er clic sur un lien email atterrit sur /login).
      // S3a : la page d'arrivée d'un passage aussi (elle ouvre elle-même la nouvelle session).
      const path = window.location.pathname;
      const publicAuthPrefixes = ['/login', '/forgot-password', '/reset-password', '/invite', '/passage'];
      const onPublicAuthPage = publicAuthPrefixes.some((p) => path === p || path.startsWith(p + '/'));
      if (!onPublicAuthPage) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    if (status === 403) {
      // READ_ONLY/SUSPENDED get inline errors, not a redirect
      // LabFlow Compta (S3b) : BLOCKED aussi, pour les seules routes Compta — une comptabilité bloquée (garde par
      // comptabilité) se dit sur place ; un cabinet bloqué se connecte encore. Ailleurs, rien ne change.
      const code = error.response?.data?.code;
      const compta = String(error.config?.url || '').startsWith('/api/compta/');
      if (code === 'READ_ONLY' || code === 'SUSPENDED' || (code === 'BLOCKED' && compta)) {
        return Promise.reject(error);
      }
      // Accès acheteurs révoqué pendant la session du gérant : resynchroniser le
      // user (/auth/me via AuthContext) pour que la sidebar et AcheteursGuard
      // reflètent la révocation, sans page d'erreur plein écran.
      if (code === 'ACHETEURS_GERANT_NON_AUTORISE') {
        window.dispatchEvent(new Event('auth-refresh'));
        return Promise.reject(error);
      }
      window.location.href = '/error/403';
      return Promise.reject(error);
    }
    // Factures fournisseur (F1) : un stockage des pièces absent ou indisponible, ou trop d'envois simultanés, se disent
    // sur place (503 codé) — la saisie en cours n'est jamais perdue ; les pièces lues en Blob n'ont pas de code lisible.
    if (status === 503) {
      const code = error.response?.data?.code;
      const url = String(error.config?.url || '');
      if (['STOCKAGE_ABSENT', 'STOCKAGE_INDISPONIBLE', 'ENVOIS_SIMULTANES'].includes(code)
        || url.startsWith('/api/appros/') || /^\/api\/factures\/\d+\/pieces/.test(url)) {
        return Promise.reject(error);
      }
    }
    if (status === 500 || status === 503) {
      window.location.href = `/error/${status}`;
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

export default api;
