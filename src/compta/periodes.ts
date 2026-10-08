import api from '../api/client';
import { telechargerClasseur } from './classeurs';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { NbEcritures } from './ecritures';
import type { TypeJournal } from './journaux';

// LabFlow Compta, étape S6b « La validation et les périodes » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6b, §2,
// §4 ; réponse 5 du client du 08/10 : clôture par le titulaire ou Complet quand tout est validé, réouverture par le
// titulaire seul) : types et appels de la page « Périodes ». Le serveur (src/compta/periodes.js) contrôle et décide ;
// l'écran montre et demande. Montants en TEXTE à 3 décimales (SPEC-SOCLE §0). Vocabulaire comptable fixe.

export interface Periode {
  id: number; debut: string; fin: string; etat: 'ouverte' | 'close'; nbBrouillard: number; nbValidees: number; totalValidees: string;
  closPar: string | null; closLe: string | null; rouvertPar: string | null; rouvertLe: string | null;
}
export interface PeriodesReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  exercice: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; periodes: Periode[] } | null;
  exercices: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos' }[];
  nb: NbEcritures;
  etatAbonnement: EtatAbonnement;
}
// La centralisation d'une période (NC 01 §45) : par journal, les écritures validées et leurs totaux.
export interface CentralisationReponse {
  periode: Periode;
  journaux: { id: number; code: string; libelle: string; type: TypeJournal; nbEcritures: number; debit: string; credit: string }[];
  totaux: { debit: string; credit: string; nbEcritures: number };
  nbBrouillard: number;
}

const chemin = (dossierId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/periodes${suite}`;
export const lirePeriodes = async (dossierId: number | string): Promise<PeriodesReponse> => {
  const { data } = await api.get(chemin(dossierId));
  return data as PeriodesReponse;
};
export const lireCentralisation = async (dossierId: number, periodeId: number): Promise<CentralisationReponse> => {
  const { data } = await api.get(chemin(dossierId, `/${periodeId}`));
  return data as CentralisationReponse;
};
export const clorePeriode = async (dossierId: number, periodeId: number): Promise<PeriodesReponse> => {
  const { data } = await api.post(chemin(dossierId, `/${periodeId}/clore`));
  return data as PeriodesReponse;
};
export const rouvrirPeriode = async (dossierId: number, periodeId: number): Promise<PeriodesReponse> => {
  const { data } = await api.post(chemin(dossierId, `/${periodeId}/rouvrir`));
  return data as PeriodesReponse;
};
// Le journal général d'une période (PDF coté et paraphé : pages numérotées), téléchargé.
export const telechargerJournalGeneral = (dossierId: number, p: Periode) => telechargerClasseur(chemin(dossierId, `/${p.id}/journal-general.pdf`), `journal-general-${p.debut.slice(0, 7)}.pdf`, 'application/pdf');

export const LIBELLES_ETAT_PERIODE: Record<Periode['etat'], string> = { ouverte: 'Ouverte', close: 'Close' };
