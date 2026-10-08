import api from '../api/client';
import { telechargerClasseur } from './classeurs';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { Ecriture, NbEcritures, TiersCourt } from './ecritures';
import type { CompteCourt, TypeJournal } from './journaux';

// LabFlow Compta, étape S6c « Les livres et les imports » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6c, §2
// « S6c », §4 « Livres » ; réponse 7 du client du 08/10 : livres calculés en SQL à la demande) : types et appels de la
// page « Livres » (grand livre, balance, livre-journal, exports Excel). Le serveur (src/compta/livres.js) calcule et
// décide ; l'écran choisit (exercice, période, brouillard compris, compte ou tiers, journal) et montre. Montants en TEXTE
// à 3 décimales (SPEC-SOCLE §0) ; les soldes arrivent déjà posés de leur côté (soldeDebit / soldeCredit). Vocabulaire
// comptable fixe.

export type Vue = 'grand-livre' | 'balance' | 'journaux';
export type TypeBalance = 'generale' | 'fournisseurs' | 'clients';
export interface PeriodeLivres { id: number; debut: string; fin: string; etat: 'ouverte' | 'close' }
export interface ExerciceLivres { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; periodes: PeriodeLivres[] }
export interface JournalLivres { id: number; code: string; libelle: string; type: TypeJournal; typeLibelle: string; actif: boolean }
export interface LivresReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  exercices: ExerciceLivres[];
  exerciceParDefaut: number | null;
  journaux: JournalLivres[];
  // Les comptes et les tiers qui ont des lignes dans le dossier (choix du grand livre).
  comptes: CompteCourt[];
  tiers: TiersCourt[];
  nb: NbEcritures;
  bornes: { grandLivre: number; journal: number; exportMax: number };
  etatAbonnement: EtatAbonnement;
}
export interface Selection { exercice: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos' }; periode: PeriodeLivres | null; de: string; a: string; brouillard: boolean }
// Un solde signé posé de son côté.
export interface Cotes { solde: string; soldeDebit: string; soldeCredit: string }
// `nbBrouillard` de l'ouverture : grand livre seulement (lignes d'à-nouveaux ou antérieures en brouillard).
export interface Ouverture extends Cotes { debit: string; credit: string; nbBrouillard?: number }
export interface Mouvements { debit: string; credit: string; nbLignes: number; nbBrouillard: number }
export interface RangeeBalance extends Cotes {
  compte?: { id: number; numero: string; libelle: string; nature: string };
  tiers?: { id: number; type: 'fournisseur' | 'client'; typeLibelle: string; code: string; nom: string; actif: boolean };
  ouverture: Ouverture; mouvements: Mouvements; nbBrouillard: number;
}
export interface TotauxBalance {
  ouverture: { debit: string; credit: string; soldeDebit: string; soldeCredit: string };
  mouvements: Mouvements; soldeDebit: string; soldeCredit: string; lignes: { debit: string; credit: string }; nbBrouillard: number;
}
export interface ControlesGenerale {
  journaux: { id: number; code: string; libelle: string; type: TypeJournal; typeLibelle: string; nbEcritures: number; debit: string; credit: string }[];
  totalJournaux: { debit: string; credit: string };
  totalEcritures: { nb: number; total: string; nbBrouillard: number };
  totalLignes: { debit: string; credit: string };
  coherent: boolean;
}
export interface ControlesAuxiliaire { collectifs: RangeeBalance; nature: string; coherent: boolean }
export interface BalanceReponse { type: TypeBalance; selection: Selection; rangees: RangeeBalance[]; totaux: TotauxBalance; controles: ControlesGenerale | ControlesAuxiliaire }
export const estControleGenerale = (c: BalanceReponse['controles']): c is ControlesGenerale => 'journaux' in c;
export interface LigneLivre extends Cotes {
  id: number; date: string; rang: number; libelle: string; debit: string; credit: string; echeance: string | null; taxe: string | null;
  ecriture: { id: number; numero: string | null; numeroProvisoire: string; etat: 'brouillard' | 'validee'; reference: string; libelle: string; dateReelle: string | null; origine: Ecriture['origine']; journal: { id: number; code: string } };
  compte: { id: number; numero: string; libelle: string };
  tiers: { id: number; type: 'fournisseur' | 'client'; code: string; nom: string } | null;
}
export interface GrandLivreReponse {
  compte: CompteCourt | null; tiers: (TiersCourt & { actif: boolean }) | null; selection: Selection;
  ouverture: Ouverture; lignes: LigneLivre[]; total: number; page: number; limite: number;
  totaux: Cotes & { debit: string; credit: string; nbLignes: number; nbBrouillard: number };
}
export interface JournalReponse {
  journal: JournalLivres; selection: Selection; ecritures: Ecriture[]; total: number; page: number; limite: number;
  totaux: { nbEcritures: number; debit: string; credit: string; nbBrouillard: number };
}
// Les paramètres communs des livres ; `brouillard` faux = écritures validées seulement.
export interface ParametresLivres { exerciceId?: number | null; periodeId?: number | null; brouillard?: boolean }
const chemin = (dossierId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/livres${suite}`;
const communs = (p: ParametresLivres) => {
  const params: Record<string, string> = {};
  if (p.exerciceId) params.exercice = String(p.exerciceId);
  if (p.periodeId) params.periode = String(p.periodeId);
  if (p.brouillard === false) params.brouillard = '0';
  return params;
};
const adresse = (base: string, params: Record<string, string>) => { const q = new URLSearchParams(params).toString(); return q ? `${base}?${q}` : base; };
export const lireLivres = async (dossierId: number | string): Promise<LivresReponse> => {
  const { data } = await api.get(chemin(dossierId));
  return data as LivresReponse;
};
export const lireBalance = async (dossierId: number, p: ParametresLivres, type: TypeBalance): Promise<BalanceReponse> => {
  const { data } = await api.get(chemin(dossierId, '/balance'), { params: { ...communs(p), type } });
  return data as BalanceReponse;
};
export const lireGrandLivre = async (dossierId: number, p: ParametresLivres, cible: { compteId: number | null; tiersId: number | null }, page = 1, limite?: number): Promise<GrandLivreReponse> => {
  const params = { ...communs(p), ...(cible.compteId ? { compte: String(cible.compteId) } : {}), ...(cible.tiersId ? { tiers: String(cible.tiersId) } : {}), page: String(page), ...(limite ? { limite: String(limite) } : {}) };
  const { data } = await api.get(chemin(dossierId, '/grand-livre'), { params });
  return data as GrandLivreReponse;
};
export const lireJournal = async (dossierId: number, p: ParametresLivres, journalId: number, page = 1, limite?: number): Promise<JournalReponse> => {
  const params = { ...communs(p), journal: String(journalId), page: String(page), ...(limite ? { limite: String(limite) } : {}) };
  const { data } = await api.get(chemin(dossierId, '/journal'), { params });
  return data as JournalReponse;
};
// Les exports Excel (charte LabFlow), avec la sélection en cours ; nom de repli si le navigateur ne lit pas l'en-tête.
export const telechargerBalance = (dossierId: number, p: ParametresLivres, type: TypeBalance) =>
  telechargerClasseur(adresse(chemin(dossierId, '/balance/export'), { ...communs(p), type }), `balance-${type}-${dossierId}.xlsx`);
export const telechargerGrandLivre = (dossierId: number, p: ParametresLivres, cible: { compteId: number | null; tiersId: number | null }) =>
  telechargerClasseur(adresse(chemin(dossierId, '/grand-livre/export'), { ...communs(p), ...(cible.compteId ? { compte: String(cible.compteId) } : {}), ...(cible.tiersId ? { tiers: String(cible.tiersId) } : {}) }), `grand-livre-${dossierId}.xlsx`);
export const telechargerJournal = (dossierId: number, p: ParametresLivres, journalId: number) =>
  telechargerClasseur(adresse(chemin(dossierId, '/journal/export'), { ...communs(p), journal: String(journalId) }), `journal-${dossierId}.xlsx`);

export const VUES: { valeur: Vue; libelle: string; article: string; icone: string }[] = [
  { valeur: 'grand-livre', libelle: 'Grand livre', article: 'le grand livre', icone: '📖' },
  { valeur: 'balance', libelle: 'Balance', article: 'la balance', icone: '⚖️' },
  { valeur: 'journaux', libelle: 'Journaux', article: 'le livre-journal', icone: '📒' },
];
export const estVue = (v: string | null): v is Vue => v === 'grand-livre' || v === 'balance' || v === 'journaux';
export const LIBELLES_TYPE_BALANCE: Record<TypeBalance, string> = { generale: 'Générale (par compte)', fournisseurs: 'Auxiliaire fournisseurs', clients: 'Auxiliaire clients' };
// Un solde posé de son côté, pour l'affichage : « 1 173,150 C », « 8 810,000 D », « 0,000 ».
export const texteSolde = (c: Cotes, fmt: (v: string) => string) => (c.soldeDebit !== '0.000' ? `${fmt(c.soldeDebit)} D` : c.soldeCredit !== '0.000' ? `${fmt(c.soldeCredit)} C` : fmt('0.000'));
