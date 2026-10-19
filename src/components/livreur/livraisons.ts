// Module Livreurs (L2) — ce que le livreur voit de ses livraisons (GET /api/livreur/commandes et /:id).
// Pas de prix par ligne : le total TTC de la facture suffit au terrain.
/** Un passage du livreur (L3) : livrée avec la facture signée, ou échec (motif + note). */
export interface Tentative {
  id: number;
  resultat: 'livree' | 'echec';
  motif: string | null;
  motifLibelle: string | null;
  note: string | null;
  rapporteeDepot: boolean;
  receptionnaire: string | null;
  montantPercu: number | null;
  modePaiement: string | null;
  livreurNom: string;
  le: string;
  factureSignee: { nom: string; type: string; taille: number; avecApercu: boolean } | null;
}

export interface Livraison {
  id: string;
  statut: 'expediee' | 'livree' | 'livraison_echouee';
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
  /** Dernier passage du livreur (L3) ; null tant qu'il n'est pas passé. */
  livraison: Tentative | null;
}

/** Fiche du livreur connecté (GET /api/livreur/moi). */
export interface Moi {
  id: number;
  nom: string;
  telephone: string;
  email: string | null;
  entreprise: string | null;
  doitChangerMdp: boolean;
  /** L3 : le compte fait encaisser ses livreurs → montant perçu + mode de paiement à la livraison. */
  encaissement: boolean;
  modesPaiement: { id: number; code: string; libelle: string }[];
  motifsEchec: Record<string, string>;
}

export const C = '#059669';
export const CD = '#064e3b';

export const fmtMontant = (n: number | null | undefined) => (n != null ? `${Number(n).toFixed(3)} DT` : '—');
export const fmtDate = (d: string | null | undefined) => { if (!d) return '—'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };
/** Lien d'appel direct (le téléphone compose le numéro). */
export const lienTel = (tel: string) => `tel:${tel.replace(/\s+/g, '')}`;
/** Itinéraire vers l'adresse dans l'application de cartes du téléphone. */
export const lienItineraire = (adresse: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
