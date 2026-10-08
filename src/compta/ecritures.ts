import api from '../api/client';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { CompteCourt, TypeJournal } from './journaux';
import type { Assiette, TypeTaxe } from './taxes';
import type { TypeTiers } from './tiers';

// LabFlow Compta, étape S6a « Les écritures en brouillard » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6a, §2,
// §4 ; réponses du client du 08/10 — « ok pour les 8 ») : types et aides de la page « Écritures ». Le serveur
// (src/compta/ecritures.js) contrôle et décide ; l'écran saisit, propose et affiche. Montants en TEXTE à 3 décimales
// (SPEC-SOCLE §0) : les totaux et l'écart du pied se calculent en millimes entiers (bigint), jamais en flottant ; la
// conversion en nombre ne sert qu'à l'affichage. Vocabulaire comptable fixe.

export type EtatEcriture = 'brouillard' | 'validee';
export interface JournalCourt { id: number; code: string; libelle: string; type: TypeJournal; actif: boolean }
export interface TaxeCourte { id: number; code: string; libelle: string; type: TypeTaxe; typeLibelle: string; taux: string | null; montant: string | null; assiette: Assiette; assietteLibelle: string; actif: boolean }
export interface TiersCourt { id: number; type: TypeTiers; typeLibelle: string; code: string; nom: string; compteId: number; delaiPaiement: number; retenue: { id: number; code: string; taux: string | null; actif: boolean } | null }
export interface PeriodeExercice { id: number; debut: string; fin: string; etat: 'ouverte' | 'close' }
export interface ExerciceOuvert { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; periodes: PeriodeExercice[] }
export interface LigneEcriture {
  id: number; rang: number; compte: { id: number; numero: string; libelle: string; nature: string }; tiers: { id: number; type: TypeTiers; code: string; nom: string } | null;
  libelle: string | null; debit: string; credit: string; taxe: { id: number; code: string; libelle: string; type: TypeTaxe } | null; echeance: string | null;
}
export interface Ecriture {
  id: number; numeroProvisoire: string; numero: string | null; date: string; dateReelle: string | null; journal: { id: number; code: string; libelle: string; type: TypeJournal };
  reference: string; libelle: string; etat: EtatEcriture; etatLibelle: string; total: string; origine: 'saisie' | 'import' | 'contrepassation'; origineId: number | null;
  nbLignes: number; creePar: string | null; creeLe: string; modifieLe: string; valideLe: string | null; lignes?: LigneEcriture[];
}
export interface NbEcritures { brouillard: number; validees: number }
// Une PAGE de la liste : `ecritures` = la page (sans leurs lignes), `total` = résultats des filtres, `nb` = toutes les
// écritures du dossier (bandeau) ; les choix de la saisie voyagent avec (journaux, comptes imputables, codes, tiers).
export interface EcrituresReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  exercice: ExerciceOuvert | null;
  nb: NbEcritures;
  filtres: { journalId: number | null; periodeId: number | null; etat: EtatEcriture | ''; q: string };
  ecritures: Ecriture[]; total: number; page: number; limite: number;
  journaux: JournalCourt[];
  comptes: CompteCourt[];
  taxes: TaxeCourte[];
  tiers: TiersCourt[];
  etats: { valeur: EtatEcriture; libelle: string }[];
  bornes: { referenceMax: number; libelleMax: number; lignesMin: number; lignesMax: number };
  etatAbonnement: EtatAbonnement;
}
export interface EcritureReponse { ecriture: Ecriture; nb: NbEcritures }
export interface SuppressionReponse { supprime: { id: number; numeroProvisoire: string }; nb: NbEcritures }
// Une ligne telle que la fenêtre la saisit (montants en texte, tels que tapés) et telle qu'elle part au serveur.
export interface LigneSaisie { cle: number; compteId: number | null; tiersId: number | null; libelle: string; debit: string; credit: string; taxeId: number | null; echeance: string }
export interface LigneEnvoyee { compteId: number | null; tiersId: number | null; libelle: string | null; debit: string; credit: string; taxeId: number | null; echeance: string | null }
export interface AideReponse { ligne: LigneEnvoyee; compte: CompteCourt; taxe: TaxeCourte; base: string }

// 25 par page (comme les tiers), « Afficher plus » pour les suivantes.
export const PAGE_ECRITURES = 25;
export interface ParametresEcritures { journalId?: number | null; periodeId?: number | null; etat?: EtatEcriture | ''; q?: string; page?: number; limite?: number }
const chemin = (dossierId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/ecritures${suite}`;
export const lireEcritures = async (dossierId: number | string, p: ParametresEcritures = {}): Promise<EcrituresReponse> => {
  const params: Record<string, string> = {};
  if (p.journalId) params.journal = String(p.journalId);
  if (p.periodeId) params.periode = String(p.periodeId);
  if (p.etat) params.etat = p.etat;
  if (p.q) params.q = p.q;
  if (p.page) params.page = String(p.page);
  if (p.limite) params.limite = String(p.limite);
  const { data } = await api.get(chemin(dossierId), { params });
  return data as EcrituresReponse;
};
export const lireEcriture = async (dossierId: number | string, ecritureId: number): Promise<Ecriture> => {
  const { data } = await api.get(chemin(dossierId, `/${ecritureId}`));
  return (data as { ecriture: Ecriture }).ecriture;
};
export const aideTaxe = async (dossierId: number, corps: { journalId: number; ligne: LigneEnvoyee }): Promise<AideReponse> => {
  const { data } = await api.post(chemin(dossierId, '/aide/taxe'), corps);
  return data as AideReponse;
};
export const aideRetenue = async (dossierId: number, corps: { journalId: number; tiersId: number | null; taxeId: number | null; lignes: LigneEnvoyee[] }): Promise<AideReponse> => {
  const { data } = await api.post(chemin(dossierId, '/aide/retenue'), corps);
  return data as AideReponse;
};

// ── Millimes (mêmes règles que le serveur : 15 entiers, 3 décimales au plus, virgule acceptée) ─────────────────────
const RE_MONTANT = /^\d{1,15}(\.\d{1,3})?$/;
// « 1 190,5 » → 1190500n ; vide → 0n ; null si le texte n'est pas un montant.
export const versMillimes = (s: string | null | undefined): bigint | null => {
  const t = (s ?? '').replace(/\s/g, '').replace(',', '.');
  if (!t) return 0n;
  if (!RE_MONTANT.test(t)) return null;
  const [entiers, decimales = ''] = t.split('.');
  return BigInt(entiers) * 1000n + BigInt(decimales.padEnd(3, '0'));
};
// 1190500n → « 1190.500 » (le texte qui part au serveur).
export const texteMillimes = (n: bigint): string => {
  const a = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${a / 1000n}.${String(a % 1000n).padStart(3, '0')}`;
};
// Affichage français : « 1 190,500 » ; accepte un texte du serveur ou des millimes. Un texte qui n'est pas un montant
// (saisie en cours) s'affiche tel quel.
export const fmtMontant = (v: string | bigint | null | undefined): string => {
  const n = typeof v === 'bigint' ? v : versMillimes(v);
  if (n == null) return v ? String(v) : '—';
  const a = n < 0n ? -n : n;
  const entiers = String(a / 1000n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0n ? '-' : ''}${entiers},${String(a % 1000n).padStart(3, '0')}`;
};
// Un montant saisi est-il acceptable (vide compris) ? Message ou null.
export const controlerMontant = (s: string): string | null => (versMillimes(s) == null ? 'Montant en dinars, 3 décimales au plus (ex. 1 190,500).' : null);
// Totaux du pied : débits, crédits, écart (débits − crédits) ; une ligne au montant illisible compte pour zéro.
export const totaux = (lignes: { debit: string; credit: string }[]) => {
  let debit = 0n;
  let credit = 0n;
  for (const l of lignes) {
    debit += versMillimes(l.debit) ?? 0n;
    credit += versMillimes(l.credit) ?? 0n;
  }
  return { debit, credit, ecart: debit - credit };
};
// La ligne telle qu'elle part au serveur (montants normalisés, vides = « 0.000 », libellé et échéance vides = null).
export const ligneEnvoyee = (l: LigneSaisie): LigneEnvoyee => ({
  compteId: l.compteId, tiersId: l.tiersId, libelle: l.libelle.trim() || null,
  debit: texteMillimes(versMillimes(l.debit) ?? 0n), credit: texteMillimes(versMillimes(l.credit) ?? 0n), taxeId: l.taxeId, echeance: l.echeance || null,
});

// ── Dates et périodes ───────────────────────────────────────────────────────────────────────────────────────────────
// Le jour à Tunis (AAAA-MM-JJ).
export const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Date + n jours (AAAA-MM-JJ), sans décalage de fuseau.
export const ajouterJours = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// La période (mois) qui contient une date, ou null.
export const periodeDe = (periodes: PeriodeExercice[], date: string) => periodes.find((p) => date >= p.debut && date <= p.fin) || null;
// Libellé d'une période : « mars 2026 » (une période partielle garde son mois).
export const libellePeriode = (p: PeriodeExercice) => new Date(`${p.debut}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
// Message d'erreur d'une date d'écriture, ou null : dans une période ouverte de l'exercice ouvert (le serveur revérifie).
export const controlerDate = (date: string, exercice: ExerciceOuvert | null): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Indiquez la date de l\'écriture.';
  if (!exercice) return 'Aucun exercice ouvert dans ce dossier.';
  const p = periodeDe(exercice.periodes, date);
  if (!p) return `La date doit être dans l'exercice ouvert (du ${fmtJour(exercice.debut)} au ${fmtJour(exercice.fin)}).`;
  if (p.etat !== 'ouverte') return `La période ${libellePeriode(p)} est close.`;
  return null;
};
export const fmtJour = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

// ── Comptes collectifs et tiers ─────────────────────────────────────────────────────────────────────────────────────
// Un compte collectif attend un tiers du type de sa nature (PLAN-S5 §4) ; les autres n'en portent pas.
export const typeTiersDe = (nature: string | null | undefined): TypeTiers | null => (nature === 'fournisseurs' ? 'fournisseur' : nature === 'clients' ? 'client' : null);
// Texte court d'un tiers : « F0001 — Société Tunisienne de Boissons ».
export const texteTiers = (t: { code: string; nom: string } | null) => (t ? `${t.code} — ${t.nom}` : '—');
// Texte court d'un code de taxe : « TVA19 (19 %) », « TIMBRE (1,000 D) ».
export const texteTaxe = (x: TaxeCourte | null) => {
  if (!x) return 'Aucun';
  const v = x.assiette === 'fixe' ? (x.montant != null ? `${fmtMontant(x.montant)} D` : '') : (x.taux != null ? `${Number(x.taux).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} %` : '');
  return v ? `${x.code} (${v})` : x.code;
};
// Un code de taxe dont la ligne se calcule depuis une ligne de base (assiette HT, montant fixe, sur la TVA) ; les codes
// sur le TTC passent par « Ajouter la retenue ».
export const aideTaxePossible = (x: TaxeCourte | null) => !!x && x.assiette !== 'ttc';
export const LIBELLES_ETAT: Record<EtatEcriture, string> = { brouillard: 'Brouillard', validee: 'Validée' };
