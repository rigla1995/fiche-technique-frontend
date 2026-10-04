// Matricule fiscal tunisien : normalisation et contrôle de forme (lot 3, spec backend docs/lot-3-spec.md §1.3).
// Copie de fiche-technique-backend/src/utils/matriculeFiscal.js — le SERVEUR décide (400 si invalide) ;
// cette copie sert seulement à normaliser le champ à la sortie et à prévenir l'admin avant l'envoi.
// Fichier de l'espace admin (seul utilisateur à l'étape 1). Mêmes vecteurs : scripts/matricule-fiscal-vecteurs.json (test : scripts/matricule-fiscal.test.mjs).

const MODELE = /^\d{7}[A-Z]?(\/[A-Z]\/[A-Z]\/\d{3})?$/;
// Libellé parfois collé devant la valeur (« MF : », « M.F. », « Matricule fiscal : ») : retiré (cf. stripMfLabel de generate.js).
const LIBELLE = /^\s*(matricule\s+fiscal|m\.?\s?f\.?)\s*:?\s*/i;
// Six chiffres seulement : zéro de tête perdu (copie depuis un tableur) — message dédié.
const SIX_CHIFFRES = /^\d{6}[A-Z]?(\/[A-Z]\/[A-Z]\/\d{3})?$/;

export function normaliserMatriculeFiscal(brut: string | null | undefined): string {
  if (brut == null) return '';
  const s = String(brut).replace(LIBELLE, '').toUpperCase().replace(/[\s.\-_]/g, '');
  if (!s) return '';
  const compact = s.replace(/\//g, '');
  let m = compact.match(/^(\d{7})([A-Z])([A-Z])([A-Z])(\d{3})$/);
  if (m) return `${m[1]}${m[2]}/${m[3]}/${m[4]}/${m[5]}`;
  m = compact.match(/^(\d{7})([A-Z])([A-Z])(\d{3})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  m = compact.match(/^(\d{7})([A-Z]?)$/);
  if (m) return `${m[1]}${m[2]}`;
  return s;
}

export interface ControleMatricule {
  ok: boolean;
  valeur: string;
  erreur?: string;
  avertissement?: string;
}

export function controlerMatriculeFiscal(brut: string | null | undefined): ControleMatricule {
  const valeur = normaliserMatriculeFiscal(brut);
  if (!valeur) return { ok: true, valeur: '' };
  if (SIX_CHIFFRES.test(valeur)) {
    return { ok: false, valeur, erreur: 'Matricule fiscal invalide : 7 chiffres attendus avant la lettre de clé (un zéro de tête manque-t-il ?)' };
  }
  if (!MODELE.test(valeur)) {
    return { ok: false, valeur, erreur: 'Matricule fiscal invalide (exemples : 1234567A/A/M/000 ou 1234567A)' };
  }
  if (!/^\d{7}[A-Z]/.test(valeur)) {
    return { ok: true, valeur, avertissement: 'Matricule fiscal sans lettre de clé (1234567A…) : à vérifier sur la patente' };
  }
  return { ok: true, valeur };
}
