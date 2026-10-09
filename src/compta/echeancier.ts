import api from '../api/client';
import { telechargerClasseur } from './classeurs';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { EtatEcriture } from './ecritures';
import { versMillimes } from './ecritures';

// LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §2 « S7a », §4
// « Échéance », « Relevé et relance » ; réponses du client du 09/10 — « ok pour les 9 » : relevé et relance en PDF, envoyés
// par le comptable lui-même) : types et appels de la page « Échéancier ». Le serveur (src/compta/echeancier.js) calcule
// l'échéance, le retard, les tranches et les totaux au jour de la lecture (à Tunis) ; l'écran choisit et montre. Montants
// en TEXTE à 3 décimales, signés (un règlement non lettré vient en moins).

export type TypeTiers = 'fournisseur' | 'client';
export type CleTranche = 'nonEchu' | 'j30' | 'j60' | 'j90' | 'plus90';
export type Tranches = Record<CleTranche, string>;
export interface RangeeAgee {
  tiers: { id: number; code: string; nom: string; actif: boolean; delaiPaiement: number };
  total: string; tranches: Tranches; echu: string; credits: string; nbLignes: number; nbBrouillard: number; retardMax: number | null;
}
export interface EcheancierReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  type: TypeTiers; typeLibelle: string; au: string; brouillard: boolean;
  tranches: { cle: CleTranche; libelle: string }[];
  rangees: RangeeAgee[];
  totaux: { total: string; tranches: Tranches; echu: string; nbLignes: number; nbBrouillard: number; nbTiers: number };
  texteRelance: string;
  bornes: { lignesTiers: number; exportMax: number; texteRelanceMax: number };
  etatAbonnement: EtatAbonnement;
}
export interface LigneEcheance {
  id: number; date: string; dateReelle: string | null; libelle: string; debit: string; credit: string; du: string; echeance: string; echeanceSaisie: boolean;
  // null : un règlement ou un avoir, imputé sur les échéances les plus anciennes (relecture de S7a).
  retard: number; tranche: CleTranche | null; compte: string;
  ecriture: { numero: string | null; numeroProvisoire: string; etat: EtatEcriture; reference: string; journal: string };
}
export interface TiersEcheancierReponse {
  tiers: { id: number; type: TypeTiers; typeLibelle: string; code: string; nom: string; matriculeFiscal: string | null; adresse: string | null; ville: string | null; actif: boolean; delaiPaiement: number };
  au: string; brouillard: boolean; lignes: LigneEcheance[]; total: number; limite: number;
  totaux: { du: string; echu: string; tranches: Tranches; credits: string; debit: string; credit: string; nbBrouillard: number; retardMax: number | null };
}

const chemin = (dossierId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/echeancier${suite}`;
const parametres = (brouillard: boolean, autres: Record<string, string> = {}) => ({ ...(brouillard ? {} : { brouillard: '0' }), ...autres });
const adresse = (base: string, params: Record<string, string>) => { const q = new URLSearchParams(params).toString(); return q ? `${base}?${q}` : base; };
export const lireEcheancier = async (dossierId: number | string, type: TypeTiers, brouillard: boolean): Promise<EcheancierReponse> => {
  const { data } = await api.get(chemin(dossierId), { params: parametres(brouillard, { type }) });
  return data as EcheancierReponse;
};
export const lireTiersEcheancier = async (dossierId: number, tiersId: number, brouillard: boolean): Promise<TiersEcheancierReponse> => {
  const { data } = await api.get(chemin(dossierId, `/tiers/${tiersId}`), { params: parametres(brouillard) });
  return data as TiersEcheancierReponse;
};
// Les documents : relevé de compte et lettre de relance (PDF), export Excel (balance âgée et détail). Nom de repli si le
// navigateur ne lit pas l'en-tête de la réponse.
export const telechargerReleve = (dossierId: number, tiers: { id: number; code: string }, brouillard: boolean) =>
  telechargerClasseur(adresse(chemin(dossierId, `/tiers/${tiers.id}/releve.pdf`), parametres(brouillard)), `releve-${tiers.code}.pdf`, 'application/pdf');
// La relance part en POST (relecture de S7a) : son texte (2 000 caractères au plus) ne voyage pas dans l'adresse.
export const telechargerRelance = (dossierId: number, tiers: { id: number; code: string }, brouillard: boolean, texte: string) =>
  telechargerClasseur(chemin(dossierId, `/tiers/${tiers.id}/relance.pdf`), `relance-${tiers.code}.pdf`, 'application/pdf', { brouillard, ...(texte ? { texte } : {}) });
export const telechargerEcheancier = (dossierId: number, type: TypeTiers, brouillard: boolean) =>
  telechargerClasseur(adresse(chemin(dossierId, '/export'), parametres(brouillard, { type })), `echeancier-${type === 'client' ? 'clients' : 'fournisseurs'}-${dossierId}.xlsx`);

export const ONGLETS: { valeur: TypeTiers; libelle: string; icone: string; sens: string }[] = [
  { valeur: 'fournisseur', libelle: 'Fournisseurs', icone: '🏭', sens: 'ce que vous devez' },
  { valeur: 'client', libelle: 'Clients', icone: '🤝', sens: 'ce qu\'on vous doit' },
];
// Un montant signé en millimes (« -200.000 » → -200000n).
export const signe = (t: string) => (t.startsWith('-') ? -(versMillimes(t.slice(1)) ?? 0n) : (versMillimes(t) ?? 0n));
// Un retard ne se dit que d'une ligne qui augmente le dû (une facture) ; un règlement ou un avoir non lettré vient en moins.
export const enRetard = (l: LigneEcheance) => l.retard > 0 && signe(l.du) > 0n;
// Texte d'un montant non nul, vide sinon (cellules des tranches).
export const nonNul = (t: string) => signe(t) !== 0n;
// Les lignes du texte de la relance (bornes du serveur : 2 000 caractères, 40 lignes).
export const RELANCE_LIGNES_MAX = 40;
// Les polices du PDF n'écrivent que Windows-1252 (même table que le serveur, HORS_W1252) : un texte avec des lettres arabes
// ou des émojis est refusé avant l'envoi. Table bâtie sans séquence d'échappement : espace à ÿ, puis les 27 signes ajoutés.
const HORS_LATIN = new RegExp(`[^${String.fromCharCode(0x20)}-${String.fromCharCode(0xff)}€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]`, 'u');
export const texteIllisible = (t: string) => t.split('\n').some((l) => HORS_LATIN.test(l));
