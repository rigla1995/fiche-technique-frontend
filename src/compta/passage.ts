import api from '../api/client';
import { adresseApp, adresseCompta } from './produit';

// LabFlow Compta, étape S3a (SPEC-SOCLE D11bis, D12) : passer d'une adresse à l'autre (app. ↔ compta.) sans ressaisir
// son mot de passe. La session est gardée par adresse : le serveur émet un code à usage unique (60 s) que l'adresse de
// destination échange contre une session (page /passage). Le code voyage dans la partie « # » de l'adresse, jamais
// envoyée aux serveurs.
export type Destination = 'app' | 'compta';

// La personne connectée a-t-elle au moins une comptabilité ouverte (cabinet, la sienne, ou confiée) ?
export const aDesComptabilites = async (): Promise<boolean> => {
  try {
    const { data } = await api.get('/api/compta/acces');
    return ['cabinets', 'maComptabilite', 'confiees'].some((g) => ((data as Record<string, unknown[]>)?.[g] || []).length > 0);
  } catch {
    return false;
  }
};

// Écran de choix juste après la connexion (D11bis) : pour qui a les deux espaces — Stock / Vente (client ou gérant) et
// au moins une comptabilité —, quelle que soit l'adresse où il s'est connecté.
export const destinationApresConnexion = async (role?: string): Promise<string | null> =>
  (role === 'client' || role === 'gerant') && await aDesComptabilites() ? '/choix' : null;

// Pages où un passage peut arriver directement (S3b : « Gérer sur LabFlow » de « Ma comptabilité »), liste fermée lue
// par la page d'arrivée ; ailleurs, l'accueil de l'espace.
// La partie « Gérants Comptabilité » de la page Gérants (ancre de src/compta/GerantsComptables.tsx).
export const PAGES_D_ARRIVEE = ['/client/gerants#gerants-comptabilite'];

// Part vers l'autre adresse. `avantDeQuitter` : appelé une fois le code obtenu, juste avant de quitter la page.
// `page` : page d'arrivée (une de PAGES_D_ARRIVEE), transmise dans la partie « # » avec le code.
export const allerVers = async (destination: Destination, avantDeQuitter?: () => void, page?: string): Promise<void> => {
  const { data } = await api.post('/api/compta/passage', { destination });
  const base = destination === 'compta' ? adresseCompta() : adresseApp();
  const suite = page && PAGES_D_ARRIVEE.includes(page) ? `&vers=${encodeURIComponent(page)}` : '';
  avantDeQuitter?.();
  window.location.assign(`${base}/passage#${(data as { code: string }).code}${suite}`);
};

// Partie « # » d'un passage : le code, puis la page d'arrivée éventuelle (gardée seulement si elle est permise).
export const lirePassage = (hash: string): { code: string; page: string } => {
  const [code, ...reste] = hash.replace(/^#/, '').split('&');
  const vers = new URLSearchParams(reste.join('&')).get('vers') || '';
  return { code, page: PAGES_D_ARRIVEE.includes(vers) ? vers : '/' };
};
