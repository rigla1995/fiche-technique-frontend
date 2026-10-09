import api from '../api/client';
import { telechargerClasseur, televerserClasseur } from './classeurs';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { CompteCourt } from './journaux';

// LabFlow Compta, étape S5c « Les tiers et les imports » (labflow-reprise/achats-compta/PLAN-S5.md §1, §2, §4 ; réponses du
// client du 07/10 — questions 4, 5 et 6 — et du 08/10 — « ok pour les 4 ») : types et aides de la page « Tiers ». Le
// serveur (src/compta/tiers.js) contrôle et décide ; l'écran saisit, propose et affiche. Vocabulaire comptable fixe.

export type TypeTiers = 'fournisseur' | 'client';
export type RegimeTvaTiers = 'assujetti' | 'non_assujetti' | 'exonere' | 'suspension';
// S7b : identifiant de secours d'un bénéficiaire sans matricule fiscal (plateforme TEJ : CIN, passeport, carte de séjour,
// autre identifiant), régime fiscal d'un fournisseur (liste du paquet du pays) et la retenue qu'il propose.
export type TypeIdentifiant = 'cin' | 'passeport' | 'carte_sejour' | 'autre';
export interface IdentifiantSecours { type: TypeIdentifiant; typeLibelle: string; numero: string; naissance: string | null; pays: string | null }
export interface RegimeFiscalChoix {
  valeur: string; libelle: string; personne: 'morale' | 'physique'; note: string | null;
  retenues: { achats: { id: number; code: string; taux: string | null } | null; honoraires: { id: number; code: string; taux: string | null } | null };
}
export interface RetenueCourte { id: number; code: string; libelle: string; taux: string | null; actif: boolean }
export interface Tiers {
  id: number; type: TypeTiers; typeLibelle: string; code: string; nom: string; matriculeFiscal: string | null;
  adresse: string | null; ville: string | null; telephone: string | null; email: string | null;
  compte: CompteCourt | null; regimeTva: RegimeTvaTiers; regimeTvaLibelle: string; retenue: RetenueCourte | null;
  delaiPaiement: number; origine: 'saisi' | 'import'; actif: boolean; creeLe: string; modifieLe: string;
  regimeFiscal: string | null; regimeFiscalLibelle: string | null; personne: 'morale' | 'physique' | null; resident: boolean; identifiant: IdentifiantSecours | null;
}
// Le modèle des codes du dossier (préfixe par type + nombre de chiffres) et le prochain code libre de chaque type
// (null : série pleine).
export interface ModeleCodes { prefixes: Record<TypeTiers, string>; chiffres: number; prochain: Record<TypeTiers, string | null> }
export interface NbTiers { actifs: number; total: number }
export interface TypeTiersChoix { valeur: TypeTiers; libelle: string; nature: string; natureLibelle: string; collectifDefaut: string | null }
// Une PAGE de la liste : `tiers` = la page, `total` = résultats de la recherche (désactivés compris si demandés),
// `nb` = tous les tiers du dossier par type (en-tête) ; les listes de choix des fenêtres voyagent avec.
export interface TiersReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  modele: ModeleCodes;
  nb: Record<TypeTiers, NbTiers>;
  type: TypeTiers; q: string; inactifs: boolean;
  tiers: Tiers[]; total: number; page: number; limite: number;
  types: TypeTiersChoix[];
  regimes: { valeur: RegimeTvaTiers; libelle: string }[];
  code: { min: number; max: number; prefixeMax: number; chiffresMin: number; chiffresMax: number };
  delaiMax: number;
  collectifs: CompteCourt[];
  retenues: RetenueCourte[];
  regimesFiscaux: RegimeFiscalChoix[];
  familles: { achats: string[]; honoraires: string[] };
  typesIdentifiant: { valeur: TypeIdentifiant; libelle: string }[];
  importMax: number;
  etatAbonnement: EtatAbonnement;
}
// Ce qu'une écriture rend : le tiers touché (ou le supprimé), les avertissements (matricule), les comptes rendus et le modèle.
export interface EcritureTiers { tiers?: Tiers; supprime?: { id: number; type: TypeTiers; code: string }; avertissements?: string[]; nb: Record<TypeTiers, NbTiers>; modele: ModeleCodes }
export interface ImportationTiers { importes: number; codesGeneres: number; avertissements: string[]; nb: Record<TypeTiers, NbTiers>; modele: ModeleCodes }

// 25 par page (comme les dossiers), « Afficher plus » pour les suivants.
export const PAGE_TIERS = 25;
export interface ParametresTiers { type: TypeTiers; q?: string; inactifs?: boolean; page?: number; limite?: number }
const chemin = (dossierId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/tiers${suite}`;
export const lireTiers = async (dossierId: number | string, p: ParametresTiers): Promise<TiersReponse> => {
  const params: Record<string, string> = { type: p.type };
  if (p.q) params.q = p.q;
  if (p.inactifs) params.inactifs = '1';
  if (p.page) params.page = String(p.page);
  if (p.limite) params.limite = String(p.limite);
  const { data } = await api.get(chemin(dossierId), { params });
  return data as TiersReponse;
};
export const telechargerModeleTiers = (dossierId: number, type: TypeTiers) => telechargerClasseur(chemin(dossierId, `/modele-import?type=${type}`), `modele-${type}s-${dossierId}.xlsx`);
export const telechargerTiers = (dossierId: number, type: TypeTiers) => telechargerClasseur(chemin(dossierId, `/export?type=${type}`), `${type}s-${dossierId}.xlsx`);
export const importerTiers = (dossierId: number, type: TypeTiers, fichier: File) => televerserClasseur<ImportationTiers>(chemin(dossierId, '/import'), fichier, { type });

export const LIBELLES_TYPE: Record<TypeTiers, { un: string; pluriel: string; bouton: string }> = {
  fournisseur: { un: 'fournisseur', pluriel: 'fournisseurs', bouton: '+ Fournisseur' },
  client: { un: 'client', pluriel: 'clients', bouton: '+ Client' },
};
// Message d'erreur du code d'un tiers, ou null (vide = généré par le serveur ; le serveur revérifie : unicité).
export const controlerCodeTiers = (code: string, bornes: { min: number; max: number }): string | null => {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  if (!/^[A-Z0-9]+$/.test(c)) return 'Le code ne contient que des lettres et des chiffres.';
  if (c.length < bornes.min || c.length > bornes.max) return `Le code a de ${bornes.min} à ${bornes.max} caractères.`;
  return null;
};
// Un préfixe du modèle (0 à 3 lettres ou chiffres) : message ou null.
export const controlerPrefixe = (p: string, max: number): string | null => {
  const s = p.trim().toUpperCase();
  if (!/^[A-Z0-9]*$/.test(s)) return 'Un préfixe ne contient que des lettres et des chiffres.';
  if (s.length > max) return `Un préfixe a ${max} caractères au plus.`;
  return null;
};
// Exemple de code d'après un modèle : « F0001 ».
export const exempleCode = (prefixe: string, chiffres: number) => `${prefixe.trim().toUpperCase()}${'0'.repeat(Math.max(0, chiffres - 1))}1`;
// Affichage : « RS_MAR15 (1,5 %) », « 30 jours » / « comptant ».
export const texteRetenue = (x: RetenueCourte | null) => (x ? `${x.code}${x.taux != null ? ` (${Number(x.taux).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} %)` : ''}` : 'Aucune');
// S7b : la retenue par défaut proposée d'après un régime fiscal : le code de la même famille que la retenue en place
// (honoraires : 3 % ou 10 %), sinon celui des achats (1,5 %, 1 %, 0,5 %) ; null si le régime n'en propose pas d'actif.
export const retenueProposee = (regime: RegimeFiscalChoix | undefined, codeActuel: string | null, familles: { achats: string[]; honoraires: string[] }) => {
  if (!regime) return null;
  if (codeActuel && familles.honoraires.includes(codeActuel)) return regime.retenues.honoraires;
  if (codeActuel && !familles.achats.includes(codeActuel)) return null;
  return regime.retenues.achats;
};
// « CIN 01234567 », « Passeport K1234567 (FR) ».
export const texteIdentifiant = (x: IdentifiantSecours) => `${x.type === 'cin' ? 'CIN' : x.typeLibelle} ${x.numero}${x.pays ? ` (${x.pays})` : ''}`;
export const texteDelai = (jours: number) => (jours > 0 ? `${jours} jour${jours > 1 ? 's' : ''}` : 'Comptant');
