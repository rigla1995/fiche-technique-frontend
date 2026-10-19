// Module Livreurs (L2) — ce que le livreur voit de ses livraisons (GET /api/livreur/commandes et /:id).
// Pas de prix par ligne : le total TTC de la facture suffit au terrain.
export interface Livraison {
  id: string;
  statut: 'expediee' | 'livree';
  dateCommande: string;
  dateExpedition: string | null;
  dateLivraison: string | null;
  affecteeLe: string | null;
  acheteurNom: string;
  acheteurEntreprise: string | null;
  acheteurTelephone: string | null;
  acheteurAdresse: string | null;
  depart: string | null;
  departAdresse: string | null;
  nbLignes: number;
  factureNumero: string | null;
  montantTtc: number | null;
  notes: string | null;
}
export interface LivraisonDetail extends Livraison {
  lignes: { designation: string; quantite: number }[];
}

export const C = '#059669';
export const CD = '#064e3b';

export const fmtMontant = (n: number | null | undefined) => (n != null ? `${Number(n).toFixed(3)} DT` : '—');
export const fmtDate = (d: string | null | undefined) => { if (!d) return '—'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };
/** Lien d'appel direct (le téléphone compose le numéro). */
export const lienTel = (tel: string) => `tel:${tel.replace(/\s+/g, '')}`;
/** Itinéraire vers l'adresse dans l'application de cartes du téléphone. */
export const lienItineraire = (adresse: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
