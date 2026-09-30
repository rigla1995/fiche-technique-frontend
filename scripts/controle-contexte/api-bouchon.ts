// Bouchon de src/api/client pour le contrôle du contexte : aucune requête réseau.
// `window.__mock.me` = le user que rend /auth/me ; son `domaine.lexique` peut être le NOM d'un lexique
// d'essai (« hotellerie », « ceramique », « defaut »), résolu à chaque appel en un nouvel objet.
const w = window as any;
w.__calls = w.__calls || [];
const copie = (o: unknown) => {
  const c = JSON.parse(JSON.stringify(o));
  if (c && c.domaine && typeof c.domaine.lexique === 'string') c.domaine.lexique = JSON.parse(JSON.stringify(w.__lexiques[c.domaine.lexique]));
  return c;
};
w.__copie = copie;
const api = {
  defaults: { baseURL: 'http://mock.test' },
  get: async (url: string) => {
    w.__calls.push(['axios.get', url]);
    if (!w.__mock?.me) throw new Error('401');
    return { data: copie(w.__mock.me) };
  },
  post: async (url: string) => {
    w.__calls.push(['axios.post', url]);
    if (url === '/auth/login') return { data: { token: w.__mock.token, user: copie(w.__mock.me) } };
    return { data: {} };
  },
};
export default api;
