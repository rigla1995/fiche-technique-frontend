import api from '../api/client';
import type { IdentiteLegale } from '../utils/identiteLegale';

// LabFlow Compta, étape S4a « Les dossiers du cabinet » (labflow-reprise/achats-compta/PLAN-S4.md) : types et
// constantes partagés par la liste, l'assistant et la fiche d'un dossier. Le serveur (src/compta/dossiers.js) contrôle
// et décide ; l'écran saisit, propose et affiche. Vocabulaire comptable fixe.

export type Personne = 'morale' | 'physique';
export type Impot = 'IS' | 'IRPP';
export type Tva = 'reel' | 'forfaitaire' | 'non_assujetti';
export interface Regime {
  personne: Personne;
  impot: Impot;
  tva: Tva;
  exportateurTotal: boolean;
  teledeclaration: boolean;
  debutActivite: string | null;
}
export interface Exercice { debut: string; fin: string }
export interface Periode { debut: string; fin: string; etat: 'ouverte' | 'close' }
export type EtatDossier = 'actif' | 'archive';
export type EtatAbonnement = 'actif' | 'lecture_seule' | 'bloque' | 'suspendu';
// S5a : `configurer` (plan de comptes) = titulaire ou gérant de niveau Complet (réponse 6 du client du 07/10) ; S5c :
// `tiers` (créer et modifier des tiers) = Complet ou Saisie (réponse 4 du 08/10) ; S6a : `saisir` (écritures en brouillard)
// = Complet ou Saisie aussi.
export interface Droits { creer: boolean; modifier: boolean; configurer: boolean; tiers: boolean; saisir: boolean; archiver: boolean; supprimer: boolean }
export interface EspaceDossiers { id: number; nom: string; type: 'cabinet' | 'client_labflow'; role: 'titulaire' | 'gerant'; niveau: string }

export interface LigneDossier {
  id: number; nom: string; raisonSociale: string; nomCommercial: string | null; formeJuridique: string | null;
  matriculeFiscal: string | null; ville: string | null; etat: EtatDossier; source: 'saisi' | 'labflow';
  identiteComplete: boolean; exercice: Exercice | null; creeLe: string;
}
// S4d « grands cabinets » : une PAGE de la liste — `dossiers` = la page, `total` = résultats de la recherche (archivés
// compris si demandés), `nbActifs` / `nbArchives` = tous les dossiers ouverts à la personne (en-tête).
export interface ListeDossiersReponse {
  espace: EspaceDossiers; droits: Droits; dossiers: LigneDossier[];
  total: number; page: number; limite: number; nbActifs: number; nbArchives: number;
  etatAbonnement: EtatAbonnement;
}
// 25 par page (réponse du client du 07/10), « Afficher plus » pour les suivants.
export const PAGE_DOSSIERS = 25;
export interface ParametresListe { q?: string; archives?: boolean; page?: number; limite?: number; ids?: number[]; matricule?: string }
// GET /api/compta/espaces/:espaceId/dossiers — recherche (nom, raison sociale, nom commercial, matricule), archivés,
// page / limite, relecture par identifiants (liste à cocher), identifiant du matricule à 7 chiffres (assistant).
export const lirePageDossiers = async (espaceId: number, p: ParametresListe = {}): Promise<ListeDossiersReponse> => {
  const params: Record<string, string> = {};
  if (p.q) params.q = p.q;
  if (p.archives) params.archives = '1';
  if (p.page) params.page = String(p.page);
  if (p.limite) params.limite = String(p.limite);
  if (p.ids) params.ids = p.ids.join(',');
  if (p.matricule) params.matricule = p.matricule;
  const { data } = await api.get(`/api/compta/espaces/${espaceId}/dossiers`, { params });
  return data as ListeDossiersReponse;
};

export interface ResumeTenue { aLettrer: number; du: string; echu: string }
export interface FicheDossier {
  id: number; espace: EspaceDossiers; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow';
  identite: IdentiteLegale; identiteComplete: boolean; regime: Regime; pays: string; devise: string; decimales: number;
  exercice: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; periodes: Periode[] } | null;
  exercices: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos' }[];
  acces: { role: 'titulaire' | 'gerant'; niveau: string; nom: string | null; email: string | null }[];
  droits: Droits; mouvemente: boolean; creeLe: string; modifieLe: string; etatAbonnement: EtatAbonnement;
  // S5a : résumé de la configuration (carte « Configuration ») — plan de comptes copié du paquet pays.
  plan: { nbActifs: number; nbAjoutes: number; nbDesactives: number; paquet: { pays: string; version: string; libelle: string } | null };
  // S5b : journaux et codes de taxe actifs ; S5c : tiers (fournisseurs, clients).
  journaux: { nbActifs: number; nbTotal: number };
  taxes: { nbActifs: number; nbTotal: number };
  tiers: { fournisseurs: { nbActifs: number; nbTotal: number }; clients: { nbActifs: number; nbTotal: number } };
  // S6a : la tenue (carte « Tenue ») — écritures en brouillard et validées ; `mouvemente` devient vrai dès la première.
  ecritures: { nbBrouillard: number; nbValidees: number };
  // S7a : lettrage et échéancier (carte « Tenue ») — par type de tiers : lignes validées à lettrer, dû non lettré
  // (brouillard compris) et sa part échue au jour de la lecture (montants en texte, signés).
  tenue: { fournisseurs: ResumeTenue; clients: ResumeTenue };
  avertissements?: string[];
  // S4b : « Reprendre l'identité de LabFlow » — nombre de champs repris (0 = identique).
  reprise?: number;
}

// Libellés des listes fermées du régime fiscal (SPEC-SOCLE §3.2).
export const PERSONNES: { valeur: Personne; libelle: string; aide: string }[] = [
  { valeur: 'morale', libelle: 'Personne morale', aide: 'société, association' },
  { valeur: 'physique', libelle: 'Personne physique', aide: 'entreprise individuelle, auto-entrepreneur' },
];
export const IMPOTS: { valeur: Impot; libelle: string; aide: string }[] = [
  { valeur: 'IS', libelle: 'IS', aide: 'impôt sur les sociétés' },
  { valeur: 'IRPP', libelle: 'IRPP', aide: 'impôt sur le revenu des personnes physiques' },
];
export const TVAS: { valeur: Tva; libelle: string; aide: string }[] = [
  { valeur: 'reel', libelle: 'Régime réel', aide: 'TVA collectée et déductible déclarées chaque mois' },
  { valeur: 'forfaitaire', libelle: 'Régime forfaitaire', aide: 'petite entreprise au forfait' },
  { valeur: 'non_assujetti', libelle: 'Non assujetti', aide: 'activité hors du champ de la TVA' },
];
export const libellePersonne = (v: string) => PERSONNES.find((x) => x.valeur === v)?.libelle || v;
export const libelleImpot = (v: string) => IMPOTS.find((x) => x.valeur === v)?.libelle || v;
export const libelleTva = (v: string) => TVAS.find((x) => x.valeur === v)?.libelle || v;
export const ouiNon = (v: boolean) => (v ? 'Oui' : 'Non');

// Proposition de l'assistant d'après la forme juridique (même règle que le serveur), modifiable.
export const regimeParForme = (forme: string | null | undefined): Pick<Regime, 'personne' | 'impot'> =>
  (forme === 'EI' || forme === 'AUTO_ENTREPRENEUR' ? { personne: 'physique', impot: 'IRPP' } : { personne: 'morale', impot: 'IS' });
export const REGIME_DEFAUT: Regime = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: false, debutActivite: null };

// ── Exercice : mêmes règles que le serveur (dates réelles, fin le dernier jour d'un mois, 12 mois au plus) ──────────
export const MOIS_MAX = 12;
const pad = (n: number) => String(n).padStart(2, '0');
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const dateValide = (s: string | null | undefined): s is string =>
  !!s && RE_DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const dernierJourDuMois = (annee: number, mois: number) => new Date(Date.UTC(annee, mois, 0)).getUTCDate();
export const finDeMois = (s: string) => {
  const [a, m] = s.split('-').map(Number);
  return `${a}-${pad(m)}-${pad(dernierJourDuMois(a, m))}`;
};
export const nbMois = (debut: string, fin: string) => {
  const [a0, m0] = debut.split('-').map(Number);
  const [a1, m1] = fin.split('-').map(Number);
  return (a1 * 12 + m1) - (a0 * 12 + m0) + 1;
};
// Année civile en cours, proposée par l'assistant.
export const anneeCivile = (): Exercice => {
  const a = new Date().getFullYear();
  return { debut: `${a}-01-01`, fin: `${a}-12-31` };
};
// Message d'erreur, ou null si l'exercice est acceptable (le serveur revérifie).
export const controlerExercice = (ex: Exercice): string | null => {
  if (!dateValide(ex.debut)) return 'Indiquez la date de début.';
  if (!dateValide(ex.fin)) return 'Indiquez la date de fin.';
  if (ex.fin < ex.debut) return 'La fin doit suivre le début.';
  if (ex.fin !== finDeMois(ex.fin)) return `La fin doit être le dernier jour d'un mois (le ${finDeMois(ex.fin).slice(8)} pour ce mois).`;
  if (nbMois(ex.debut, ex.fin) > MOIS_MAX) return `Un exercice couvre ${MOIS_MAX} mois au plus.`;
  return null;
};
export const nbPeriodes = (ex: Exercice) => (controlerExercice(ex) ? 0 : nbMois(ex.debut, ex.fin));

// Dates du serveur : un jour ('YYYY-MM-DD', colonnes DATE) affiché sans décalage de fuseau ; un horodatage (ISO complet)
// converti normalement.
export const fmtDate = (d: string | null | undefined) =>
  (d ? (d.length > 10 ? new Date(d) : new Date(`${d}T12:00:00`)).toLocaleDateString('fr-FR') : '—');
export const fmtMoisAnnee = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

// État de l'abonnement tel que la personne le voit (règle de S3b / S3c) : l'état de facturation d'une comptabilité ne
// regarde pas un gérant — pour lui, « bloqué » se dit « suspendu ».
export const etatVu = (etat: EtatAbonnement, role: 'titulaire' | 'gerant'): EtatAbonnement => (etat === 'bloque' && role === 'gerant' ? 'suspendu' : etat);
// Bandeau d'une comptabilité non modifiable, selon la personne.
export const texteEtatAbonnement = (etat: EtatAbonnement, role: 'titulaire' | 'gerant') => {
  const vu = etatVu(etat, role);
  const sujet = role === 'titulaire' ? 'Votre abonnement' : 'L\'abonnement de cette comptabilité';
  return vu === 'lecture_seule' ? `${sujet} attend un paiement` : vu === 'bloque' ? `${sujet} est bloqué` : `${sujet} est suspendu`;
};

// Messages des refus du serveur (garde par comptabilité, D4 ; droits), selon la personne.
const FERME = 'les dossiers restent consultables mais ne se modifient plus';
export const messageDossier = (err: unknown, defaut: string, role: 'titulaire' | 'gerant' = 'titulaire') => {
  const r = (err as { response?: { data?: { message?: string; code?: string } } })?.response?.data;
  const code = r?.code;
  if (code === 'READ_ONLY' || code === 'BLOCKED' || code === 'SUSPENDED') {
    const etat: EtatAbonnement = code === 'READ_ONLY' ? 'lecture_seule' : code === 'BLOCKED' ? 'bloque' : 'suspendu';
    return `${texteEtatAbonnement(etat, role)} : ${FERME} pour le moment.`;
  }
  return r?.message || defaut;
};
export const statutDe = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

// Identifiant d'un matricule : ses 7 premiers chiffres (même règle que le serveur, avertissementsMatriculeDossier) ;
// l'avertissement « déjà porté » se donne dès l'assistant, parmi les dossiers que la personne voit (jamais un refus) —
// S4d : lu au serveur (`matricule=`), plus dans une liste chargée d'avance.
export const identifiantMatricule = (mf: string | null | undefined) => (mf || '').replace(/[\s.\-_/]/g, '').toUpperCase().slice(0, 7);
