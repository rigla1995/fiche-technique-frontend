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
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Sur les pages auth publiques (reset, invitation…), un vieux JWT expiré en
      // localStorage provoque un 401 de /auth/me : purger sans arracher l'utilisateur
      // de la page (sinon le 1er clic sur un lien email atterrit sur /login).
      const path = window.location.pathname;
      const publicAuthPrefixes = ['/login', '/forgot-password', '/reset-password', '/invite'];
      const onPublicAuthPage = publicAuthPrefixes.some((p) => path === p || path.startsWith(p + '/'));
      if (!onPublicAuthPage) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    if (status === 403) {
      // READ_ONLY/SUSPENDED get inline errors, not a redirect
      const code = error.response?.data?.code;
      if (code === 'READ_ONLY' || code === 'SUSPENDED') {
        return Promise.reject(error);
      }
      window.location.href = '/error/403';
      return Promise.reject(error);
    }
    if (status === 500 || status === 503) {
      window.location.href = `/error/${status}`;
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

export default api;
