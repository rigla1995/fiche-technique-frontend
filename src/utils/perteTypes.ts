// Types de perte par domaine (lot 1b-2, §5) — lus dans `user.domaine.regles.types_perte`
// exposé par /auth/me (lot 1a). Défaut = comportement actuel : avarie + dechet.
//
//   usePerteTypes()            → [{ code, label }] du compte (hook, dépend de useAuth)
//   perteTypesFromRegles(r)    → même liste depuis un objet `regles` (pure)
//   perteLabel(code, pluriel?) → « Avarie » / « Déchet » / code capitalisé
//   normaliseCodesPerte(list)  → minuscules, trim, dédoublonnés (invalides conservés :
//                                 l'appelant décide s'il filtre ou refuse)
//   PERTE_CODE_RE              → ^[a-z0-9_]{2,20}$ (colonne VARCHAR(20))
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

export interface PerteType { code: string; label: string }

export const PERTE_CODE_RE = /^[a-z0-9_]{2,20}$/;
export const TYPES_PERTE_DEFAUT: readonly string[] = Object.freeze(['avarie', 'dechet']);

const LABELS: Record<string, { sg: string; pl: string }> = {
  avarie: { sg: 'Avarie', pl: 'Avaries' },
  dechet: { sg: 'Déchet', pl: 'Déchets' },
};

/** Minuscules + trim + dédoublonnage, dans l'ordre de saisie. Les codes vides disparaissent,
 *  les codes invalides (accents, trop longs…) sont CONSERVÉS pour que l'admin puisse être averti. */
export function normaliseCodesPerte(list: unknown): string[] {
  const src: unknown[] = Array.isArray(list) ? list : typeof list === 'string' ? list.split(',') : [];
  const out: string[] = [];
  for (const v of src) {
    const code = String(v ?? '').trim().toLowerCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Libellé d'un code : avarie → Avarie, dechet → Déchet, sinon code capitalisé (« casse » → « Casse »). */
export function perteLabel(code: string | null | undefined, pluriel = false): string {
  const c = String(code ?? '').trim().toLowerCase();
  if (!c) return '—';
  const known = LABELS[c];
  if (known) return pluriel ? known.pl : known.sg;
  const base = c.replace(/_/g, ' ');
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  return pluriel && !cap.endsWith('s') ? `${cap}s` : cap;
}

/** Liste des types depuis un objet `regles` (repli sur le défaut si absent ou vide). */
export function perteTypesFromRegles(regles: Record<string, unknown> | null | undefined): PerteType[] {
  const codes = normaliseCodesPerte(regles?.types_perte).filter((c) => PERTE_CODE_RE.test(c));
  const list = codes.length ? codes : [...TYPES_PERTE_DEFAUT];
  return list.map((code) => ({ code, label: perteLabel(code) }));
}

/** Types de perte du compte connecté (client : son domaine ; gérant : celui du parent). */
export function usePerteTypes(): PerteType[] {
  const { user } = useAuth();
  const regles = user?.domaine?.regles;
  return useMemo(() => perteTypesFromRegles(regles), [regles]);
}

/** Options d'un select en incluant, si besoin, un code déjà enregistré mais retiré du domaine
 *  (une ancienne perte « casse » reste modifiable sans perdre son type). */
export function perteTypesAvec(types: PerteType[], code: string | null | undefined): PerteType[] {
  const c = String(code ?? '').trim().toLowerCase();
  if (!c || types.some((t) => t.code === c)) return types;
  return [...types, { code: c, label: perteLabel(c) }];
}
