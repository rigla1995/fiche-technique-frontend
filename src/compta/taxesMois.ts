import api from '../api/client';
import { telechargerClasseur } from './classeurs';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { EtatEcriture } from './ecritures';

// LabFlow Compta, étape S7b « TVA, retenues et certificats » (labflow-reprise/achats-compta/PLAN-S7.md §2 « S7b », §4
// « TVA », « Retenues » ; réponses du client du 09/10 — « ok pour les 9 » : date de paiement = règlement lettré, sinon
// facture, modifiable avant de produire ; fichier XML au cahier des charges TEJ v2.0, « à essayer sur TEJ ») : types et
// appels de la page « Taxes du mois ». Le serveur (src/compta/taxesMois.js, certificats.js) calcule, contrôle et produit ;
// l'écran choisit et montre. Montants en TEXTE à 3 décimales (SPEC-SOCLE §0), signés.

export interface PeriodeTaxes { id: number; debut: string; fin: string; etat: 'ouverte' | 'close' }
export interface CodeTva {
  id: number; code: string; libelle: string; type: 'tva' | 'retenue_tva'; taux: string | null;
  collectee: string; deductible: string; deductibleImmo: string; retenueSubie: string; nonRecuperable: string; baseVente: string; baseAchat: string; nbBrouillard: number;
}
export interface EtatTva {
  periodeId: number; debut: string; fin: string; codes: CodeTva[];
  collectee: string; deductibleBs: string; deductibleImmo: string; deductible: string; retenuesSubies: string; nonRecuperable: string;
  creditReporte: string; resultat: string; aPayer: string; creditAReporter: string; nbBrouillard: number;
  sansCode: { nb: number; collectee: string; deductible: string };
  compteCredit: string | null; creditOuverture: string;
}
export interface Probleme { code: string; message: string }
export interface Operation {
  ecritureId: number; etat: EtatEcriture; numero: string | null; numeroProvisoire: string; reference: string; libelle: string; journal: string;
  dateFacture: string; tiersId: number | null; code: string | null; libelleCode: string | null; codeTej: string | null; tauxRs: string | null; tauxTva: string | null; plusieursTaux: boolean;
  ht: string; tva: string; ttc: string; rs: string; rsTva: { code: string; taux: string | null; montant: string } | null; net: string;
  dateProposee: string; sourceDate: 'reglement' | 'facture'; probleme: Probleme | null;
}
export interface Totaux { ht: string; tva: string; ttc: string; rs: string; taxes: string; net: string }
export interface TiersBeneficiaire { id: number; code: string; nom: string; matriculeFiscal: string | null; regimeFiscal: string | null; regimeFiscalLibelle: string | null; actif: boolean }
export interface Paiement {
  cle: string; tiers: TiersBeneficiaire | null; date: string; sourceDate: 'reglement' | 'facture'; operations: Operation[]; totaux: Totaux;
  // Ce qui empêche de produire son certificat (fiche du fournisseur incomplète pour la plateforme), ou null.
  bloque: string | null; avertissements: Probleme[];
}
export interface OperationFigee {
  ecritureId: number; numero: string; reference: string; journal: string; dateFacture: string; anneeFacturation: number; code: string; libelleCode: string | null; codeTej: string;
  tauxRs: string; tauxTva: string | null; ht: string; tva: string; ttc: string; rs: string; rsTva: { code: string; taux: string | null; montant: string } | null; net: string;
}
export interface Certificat {
  id: number; reference: string; numero: number; annee: number; datePaiement: string; sourceDate: 'reglement' | 'facture' | 'saisie';
  tiers: { id: number; code: string; nom: string };
  beneficiaire: { nom: string; identifiant: { type: string; valeur: string; categorie: string | null } | null; resident: boolean; adresse: string };
  operations: OperationFigee[]; totaux: Totaux; etat: 'produit' | 'annule'; produitPar: string | null; produitLe: string;
  fichier: { id: number; nom: string; acte: number; le: string } | null;
  annulation: { le: string; par: string | null; motif: string | null; fichier: { id: number; nom: string } | null } | null;
}
export interface FichierTej { id: number; annee: number; mois: number; acte: number; nom: string; empreinte: string; nbAjouts: number; nbAnnulations: number; produitLe: string; produitPar: string | null }
export interface RetenueSubie {
  id: number; ecritureId: number; date: string; numero: string | null; numeroProvisoire: string; reference: string; etat: EtatEcriture; libelle: string; montant: string; compte: string;
  code: string | null; codeLibelle: string | null; tiers: { code: string; nom: string; type: 'fournisseur' | 'client' } | null;
}
export interface Signalement { code: string; gravite: 'bloquant' | 'attention' | 'info'; message: string; tiersId?: number; ecritureId?: number; certificatId?: number }
export interface TaxesMoisReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  exercices: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; periodes: PeriodeTaxes[] }[];
  exercice: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos' };
  periode: PeriodeTaxes; brouillard: boolean; aujourdhui: string;
  tva: EtatTva;
  retenues: {
    paiements: Paiement[]; brouillard: Operation[]; problemes: Operation[]; borne: boolean;
    autresMois: { mois: string; nb: number }[];
    parNature: { codeTej: string | null; code: string | null; libelle: string | null; nb: number; rs: string; aProduire: string; certifie: string }[];
  };
  certificats: Certificat[];
  fichiers: FichierTej[];
  prochainFichier: { annee: number; mois: number; acte: 0 | 1; nbAjouts: number; nbAnnulations: number; nom: string | null };
  subies: { lignes: RetenueSubie[]; nb: number; total: string; borne: number };
  signalements: Signalement[];
  declarant: { complet: boolean; manque: string[]; identifiant: string | null; categorie: 'PM' | 'PP' };
  tej: { aEssayer: boolean; versionSchema: string | null; source: string | null };
  seuilAchats: string | null;
  etatAbonnement: EtatAbonnement;
}
export interface ProductionReponse { produits: { id: number; reference: string; tiers: string; tiersId: number; date: string; rs: string; operations: number }[] }
export interface AnnulationReponse { annule: { id: number; reference: string; depose: boolean } }

const chemin = (dossierId: number | string, suite: string) => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}${suite}`;
const parametres = (periodeId: number | null, brouillard: boolean) => ({ ...(periodeId ? { periode: String(periodeId) } : {}), ...(brouillard ? {} : { brouillard: '0' }) });
const adresse = (base: string, params: Record<string, string>) => { const q = new URLSearchParams(params).toString(); return q ? `${base}?${q}` : base; };
export const lireTaxesMois = async (dossierId: number | string, periodeId: number | null, brouillard: boolean): Promise<TaxesMoisReponse> => {
  const { data } = await api.get(chemin(dossierId, '/taxes-mois'), { params: parametres(periodeId, brouillard) });
  return data as TaxesMoisReponse;
};
// Produire des certificats : un par paiement (bénéficiaire, date choisie, pièces).
export const produireCertificats = async (dossierId: number, paiements: { tiersId: number; date: string; ecritures: number[] }[]): Promise<ProductionReponse> => {
  const { data } = await api.post(chemin(dossierId, '/certificats'), { paiements });
  return data as ProductionReponse;
};
export const annulerCertificat = async (dossierId: number, certificatId: number, motif: string): Promise<AnnulationReponse> => {
  const { data } = await api.post(chemin(dossierId, `/certificats/${certificatId}/annuler`), { motif });
  return data as AnnulationReponse;
};
// Les documents : un certificat et le lot du mois (PDF), le fichier TEJ du mois (POST : il s'enregistre), un fichier déjà
// produit (à l'identique), l'export Excel. Nom de repli si le navigateur ne lit pas l'en-tête de la réponse.
export const telechargerCertificat = (dossierId: number, c: { id: number; reference: string }) =>
  telechargerClasseur(chemin(dossierId, `/certificats/${c.id}/pdf`), `certificat-${c.reference}.pdf`, 'application/pdf');
export const telechargerLot = (dossierId: number, periodeId: number) =>
  telechargerClasseur(adresse(chemin(dossierId, '/taxes-mois/certificats.pdf'), { periode: String(periodeId) }), `certificats-${dossierId}.pdf`, 'application/pdf');
export const produireFichierTej = (dossierId: number, annee: number, mois: number, nom: string) =>
  telechargerClasseur(chemin(dossierId, '/fichiers-tej'), nom, 'application/xml', { annee, mois });
export const telechargerFichierTej = (dossierId: number, f: { id: number; nom: string }) =>
  telechargerClasseur(chemin(dossierId, `/fichiers-tej/${f.id}`), f.nom, 'application/xml');
export const telechargerTaxesMois = (dossierId: number, periodeId: number, brouillard: boolean) =>
  telechargerClasseur(adresse(chemin(dossierId, '/taxes-mois/export'), parametres(periodeId, brouillard)), `taxes-${dossierId}.xlsx`);

export const LIBELLES_SOURCE: Record<string, string> = { reglement: 'règlement lettré', facture: 'date de la facture', saisie: 'date saisie' };
// « 1,5 % », « 19 % » (le texte du serveur n'est lu que pour l'affichage).
export const fmtTaux = (t: string | null) => (t == null ? '—' : `${Number(t).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} %`);
// Le libellé d'une période : « septembre 2026 ».
export const libelleMois = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
// « 2026-09 » → « septembre 2026 ».
export const libelleMoisCourt = (aaaamm: string) => libelleMois(`${aaaamm}-01`);
