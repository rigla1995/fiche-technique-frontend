import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import type { DomaineProfil, Composant, LexiqueEntree, ComposantTypeTechnique, TarifsConfig as TarifsConfigData } from '../../types';
import { useConfirm } from '../common/ConfirmDialog';
import { PERTE_CODE_RE, normaliseCodesPerte } from '../../utils/perteTypes';
import { TarifField, TarifSectionHeader } from './TarifsConfig';
import { TARIF_SECTIONS, tarifCardStyle, DEFAULTS as TARIF_DEFAULTS } from './tarifsDefs';
import type { TarifKey } from './tarifsDefs';

// ── Page admin « Profil de domaine » : 4 onglets Composants / Lexique / Règles / Grille tarifaire.
//    Route lazy `/admin/domaines/:id` (App.tsx). Pas de GuideButton (page admin).

const ACCENT = '#b45309';
const ACCENT_DARK = '#78350f';

type Tab = 'composants' | 'lexique' | 'regles' | 'grille';
type ApiErr = { response?: { status?: number; data?: { message?: string; code?: string; composants?: unknown[]; clientsImpactes?: number } } };

// ── Lexique : clés, libellés et valeurs par défaut (= termes actuels de l'app) ──
// Le serveur renvoie le lexique RÉSOLU (défauts + écarts) ; cette table permet
// d'afficher le défaut en placeholder et de n'envoyer que les écarts au PUT.
const LEXIQUE_DEFS: { cle: string; label: string; def: LexiqueEntree }[] = [
  { cle: 'activite', label: 'Unité de vente (activité)', def: { sg: 'Activité', pl: 'Activités', g: 'f', el: true, icon: '🏪' } },
  { cle: 'labo', label: 'Unité de production (labo)', def: { sg: 'Labo', pl: 'Labos', g: 'm', el: false, icon: '🏭' } },
  { cle: 'produit_vendable', label: 'Produit vendable', def: { sg: 'Produit vendable', pl: 'Produits vendables', g: 'm', el: false, icon: '🛒' } },
  { cle: 'produit_utilisable', label: 'Produit utilisable', def: { sg: 'Produit utilisable', pl: 'Produits utilisables', g: 'm', el: false, icon: '🧂' } },
  { cle: 'produit_valorise', label: 'Produit valorisé', def: { sg: 'Produit valorisé', pl: 'Produits valorisés', g: 'm', el: false, icon: '💎' } },
  { cle: 'article', label: 'Article (référentiel)', def: { sg: 'Article', pl: 'Articles', g: 'm', el: true, icon: '📦' } },
  { cle: 'ingredient', label: 'Ingrédient (composant de recette)', def: { sg: 'Ingrédient', pl: 'Ingrédients', g: 'm', el: true, icon: '🥕' } },
  { cle: 'recette', label: 'Recette', def: { sg: 'Recette', pl: 'Recettes', g: 'f', el: false, icon: '📖' } },
  { cle: 'fiche_technique', label: 'Fiche technique', def: { sg: 'Fiche technique', pl: 'Fiches techniques', g: 'f', el: false, icon: '📋' } },
  { cle: 'portion', label: 'Portion', def: { sg: 'Portion', pl: 'Portions', g: 'f', el: false, icon: '🍽️' } },
  { cle: 'food_cost', label: 'Food cost', def: { sg: 'Food cost', pl: 'Food costs', g: 'm', el: false, icon: '📊' } },
  { cle: 'cout_matiere', label: 'Coût matière', def: { sg: 'Coût matière', pl: 'Coûts matière', g: 'm', el: false, icon: '💰' } },
  { cle: 'marge', label: 'Marge', def: { sg: 'Marge', pl: 'Marges', g: 'f', el: false, icon: '📈' } },
  { cle: 'transfert', label: 'Transfert (labo → activité)', def: { sg: 'Transfert', pl: 'Transferts', g: 'm', el: false, icon: '🚚' } },
  { cle: 'appro', label: 'Approvisionnement', def: { sg: 'Approvisionnement', pl: 'Approvisionnements', g: 'm', el: true, icon: '📥' } },
  { cle: 'perte', label: 'Perte', def: { sg: 'Perte', pl: 'Pertes', g: 'f', el: false, icon: '🗑️' } },
  { cle: 'inventaire', label: 'Inventaire', def: { sg: 'Inventaire', pl: 'Inventaires', g: 'm', el: true, icon: '📝' } },
  { cle: 'vente', label: 'Vente', def: { sg: 'Vente', pl: 'Ventes', g: 'f', el: false, icon: '💵' } },
  { cle: 'acheteur', label: 'Acheteur (B2B)', def: { sg: 'Acheteur', pl: 'Acheteurs', g: 'm', el: true, icon: '🤝' } },
  { cle: 'gerant', label: 'Gérant', def: { sg: 'Gérant', pl: 'Gérants', g: 'm', el: false, icon: '👤' } },
  { cle: 'fournisseur', label: 'Fournisseur', def: { sg: 'Fournisseur', pl: 'Fournisseurs', g: 'm', el: false, icon: '🏬' } },
  { cle: 'depot', label: 'Dépôt (compte sans activité)', def: { sg: 'Dépôt', pl: 'Dépôts', g: 'm', el: false, icon: '🏗️' } },
  { cle: 'pt', label: 'Produit transformé (PT)', def: { sg: 'Produit transformé', pl: 'Produits transformés', g: 'm', el: false, icon: '🍲' } },
  { cle: 'stock', label: 'Stock', def: { sg: 'Stock', pl: 'Stocks', g: 'm', el: false, icon: '📦' } },
  { cle: 'prestataire', label: 'Prestataire (livraison / commission)', def: { sg: 'Prestataire', pl: 'Prestataires', g: 'm', el: false, icon: '🛵' } },
  { cle: 'supplement', label: 'Supplément', def: { sg: 'Supplément', pl: 'Suppléments', g: 'm', el: false, icon: '➕' } },
  { cle: 'espace_activites', label: 'Espace Activités (menu)', def: { sg: 'Espace Activités', pl: 'Espaces Activités', g: 'm', el: true, icon: '🏪' } },
  { cle: 'espace_labo', label: 'Espace Labo (menu)', def: { sg: 'Espace Labo', pl: 'Espaces Labo', g: 'm', el: true, icon: '🏭' } },
  { cle: 'espace_vente', label: 'Espace Vente (menu)', def: { sg: 'Espace Vente', pl: 'Espaces Vente', g: 'm', el: true, icon: '💵' } },
  { cle: 'espace_acheteurs', label: 'Espace Acheteurs (menu)', def: { sg: 'Espace Acheteurs', pl: 'Espaces Acheteurs', g: 'm', el: true, icon: '🤝' } },
  { cle: 'espace_produits', label: 'Espace Produit (menu)', def: { sg: 'Espace Produit', pl: 'Espaces Produit', g: 'm', el: true, icon: '💎' } },
  { cle: 'referentiel', label: 'Référentiel', def: { sg: 'Référentiel', pl: 'Référentiels', g: 'm', el: false, icon: '📚' } },
];

/** Ligne de lexique éditée : sg/pl/icon = écart saisi ('' = défaut) ; g/el = valeur effective. */
interface LexiqueRow { sg: string; pl: string; icon: string; g: 'm' | 'f'; el: boolean }
type LexiqueState = Record<string, LexiqueRow>;

// ── Règles : 8 clés, défaut = comportement actuel ───────────────────────────
const REGLES_DEFAUT = {
  acheteurs_requiert_labo: true,
  depot_exige_acheteurs: true,
  espace_produit_verrou_basique_sans_labo: true,
  formules: ['basique', 'premium'] as string[],
  seuil_cout_matiere_pct: 40,
  types_perte: ['avarie', 'dechet'] as string[],
  supplement_max_composants: 1,
  b2b_depuis_activite: false,
};
interface ReglesState {
  acheteurs_requiert_labo: boolean;
  depot_exige_acheteurs: boolean;
  espace_produit_verrou_basique_sans_labo: boolean;
  formules: string[];
  seuil_cout_matiere_pct: string;
  types_perte: string;
  supplement_max_composants: string;
  b2b_depuis_activite: boolean;
}
const REGLES_BOOL: { cle: 'acheteurs_requiert_labo' | 'depot_exige_acheteurs' | 'espace_produit_verrou_basique_sans_labo' | 'b2b_depuis_activite'; label: string; aide: string }[] = [
  { cle: 'acheteurs_requiert_labo', label: 'Option Acheteurs ⇒ au moins 1 labo', aide: 'La base acheteurs (B2B) ne peut être activée que si le compte a au moins une unité de production.' },
  { cle: 'depot_exige_acheteurs', label: 'Compte dépôt ⇒ labo + acheteurs', aide: 'Un compte sans activité (dépôt) doit avoir au moins 1 labo ET l\'option Acheteurs.' },
  { cle: 'espace_produit_verrou_basique_sans_labo', label: 'Espace Produit verrouillé en Basique sans labo', aide: 'Formule Basique et 0 labo ⇒ Espace Produit inaccessible (la base Labo l\'inclut).' },
  { cle: 'b2b_depuis_activite', label: 'Ventes B2B depuis une activité', aide: 'Autoriser les ventes aux acheteurs depuis une unité de vente (sinon depuis un labo uniquement).' },
];

const TYPES_TECH: { value: ComposantTypeTechnique; label: string; hint: string }[] = [
  { value: 'activite', label: 'Activité', hint: 'unité de vente' },
  { value: 'labo', label: 'Labo', hint: 'unité de production' },
  { value: 'gerant', label: 'Gérant', hint: 'compte gérant' },
  { value: 'acheteurs', label: 'Base acheteurs', hint: 'option B2B (paliers)' },
];

interface ComposantRow extends Composant { _key: string; _new?: boolean; _codeTouche?: boolean }

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

/** Code généré depuis le libellé : `^[a-z0-9_]{2,30}$`. */
function codeFromLibelle(libelle: string): string {
  return libelle
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}

function toRows(composants: Composant[]): ComposantRow[] {
  return [...composants]
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || (a.id ?? 0) - (b.id ?? 0))
    .map((c) => ({
      ...c,
      libellePluriel: c.libellePluriel ?? '',
      icone: c.icone ?? '',
      aide: c.aide ?? '',
      nbMin: Number(c.nbMin) || 0,
      nbMax: c.nbMax == null ? null : Number(c.nbMax),
      ordre: Number(c.ordre) || 0,
      venteActive: c.venteActive !== false,
      productionActive: c.productionActive !== false,
      actif: c.actif !== false,
      _key: nextKey(),
    }));
}

function rowsToPayload(rows: ComposantRow[]): Composant[] {
  return rows.map((r) => ({
    ...(r.id != null ? { id: r.id } : {}),
    code: r.code.trim(),
    libelle: r.libelle.trim(),
    libellePluriel: (r.libellePluriel || '').trim() || null,
    icone: (r.icone || '').trim() || null,
    aide: (r.aide || '').trim() || null,
    typeTechnique: r.typeTechnique,
    venteActive: !!r.venteActive,
    productionActive: !!r.productionActive,
    nbMin: Math.max(0, Number(r.nbMin) || 0),
    nbMax: r.nbMax == null ? null : Math.max(0, Number(r.nbMax) || 0),
    ordre: Number(r.ordre) || 0,
    actif: !!r.actif,
  }));
}

function toLexiqueState(resolu: Record<string, LexiqueEntree> | undefined): LexiqueState {
  const state: LexiqueState = {};
  const src = resolu || {};
  const defOf = (cle: string): LexiqueEntree => LEXIQUE_DEFS.find((d) => d.cle === cle)?.def || { sg: '', pl: '', g: 'm', el: false, icon: '' };
  const cles = [...LEXIQUE_DEFS.map((d) => d.cle), ...Object.keys(src).filter((k) => !LEXIQUE_DEFS.some((d) => d.cle === k))];
  for (const cle of cles) {
    const def = defOf(cle);
    const r = src[cle] || def;
    state[cle] = {
      sg: r.sg && r.sg !== def.sg ? r.sg : '',
      pl: r.pl && r.pl !== def.pl ? r.pl : '',
      icon: r.icon && r.icon !== (def.icon || '') ? r.icon : '',
      g: r.g === 'f' ? 'f' : 'm',
      el: !!r.el,
    };
  }
  return state;
}

/** Écarts par rapport aux défauts : seuls les champs modifiés sont envoyés. */
function lexiqueEcarts(state: LexiqueState): Record<string, Partial<LexiqueEntree>> {
  const out: Record<string, Partial<LexiqueEntree>> = {};
  for (const [cle, row] of Object.entries(state)) {
    const def = LEXIQUE_DEFS.find((d) => d.cle === cle)?.def || { sg: '', pl: '', g: 'm', el: false, icon: '' };
    const e: Partial<LexiqueEntree> = {};
    if (row.sg.trim()) e.sg = row.sg.trim();
    if (row.pl.trim()) e.pl = row.pl.trim();
    if (row.icon.trim()) e.icon = row.icon.trim();
    if (row.g !== def.g) e.g = row.g;
    if (row.el !== def.el) e.el = row.el;
    if (Object.keys(e).length) out[cle] = e;
  }
  return out;
}

function toReglesState(regles: Record<string, unknown> | undefined): ReglesState {
  const r = regles || {};
  const bool = (k: keyof typeof REGLES_DEFAUT, d: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d);
  const num = (k: keyof typeof REGLES_DEFAUT, d: number) => (Number.isFinite(Number(r[k])) && r[k] !== null && r[k] !== '' ? String(Number(r[k])) : String(d));
  const list = (k: keyof typeof REGLES_DEFAUT, d: string[]) => (Array.isArray(r[k]) ? (r[k] as unknown[]).map(String) : d);
  return {
    acheteurs_requiert_labo: bool('acheteurs_requiert_labo', REGLES_DEFAUT.acheteurs_requiert_labo),
    depot_exige_acheteurs: bool('depot_exige_acheteurs', REGLES_DEFAUT.depot_exige_acheteurs),
    espace_produit_verrou_basique_sans_labo: bool('espace_produit_verrou_basique_sans_labo', REGLES_DEFAUT.espace_produit_verrou_basique_sans_labo),
    formules: list('formules', REGLES_DEFAUT.formules),
    seuil_cout_matiere_pct: num('seuil_cout_matiere_pct', REGLES_DEFAUT.seuil_cout_matiere_pct),
    types_perte: list('types_perte', REGLES_DEFAUT.types_perte).join(', '),
    supplement_max_composants: num('supplement_max_composants', REGLES_DEFAUT.supplement_max_composants),
    b2b_depuis_activite: bool('b2b_depuis_activite', REGLES_DEFAUT.b2b_depuis_activite),
  };
}

/** Règles complètes (valeurs effectives de l'état) — sert à la validation locale. */
function reglesEffectives(s: ReglesState): Record<string, unknown> {
  return {
    acheteurs_requiert_labo: s.acheteurs_requiert_labo,
    depot_exige_acheteurs: s.depot_exige_acheteurs,
    espace_produit_verrou_basique_sans_labo: s.espace_produit_verrou_basique_sans_labo,
    formules: s.formules,
    seuil_cout_matiere_pct: Number(s.seuil_cout_matiere_pct),
    types_perte: normaliseCodesPerte(s.types_perte),
    supplement_max_composants: Number(s.supplement_max_composants),
    b2b_depuis_activite: s.b2b_depuis_activite,
  };
}

/** Payload `regles` = seulement les ÉCARTS aux défauts (symétrique au lexique) : le JSONB
 *  ne fige pas les défauts actuels, une évolution future de REGLES_DEFAUT s'appliquera. */
function reglesPayload(s: ReglesState): Record<string, unknown> {
  const eff = reglesEffectives(s);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(eff)) {
    const d = (REGLES_DEFAUT as Record<string, unknown>)[k];
    if (JSON.stringify(v) !== JSON.stringify(d)) out[k] = v;
  }
  return out;
}

const surchargeStr = (t: TarifsConfigData, cle: string) => (t[cle]?.surcharge != null ? String(t[cle].surcharge) : '');

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDomaineEditPage() {
  const { id } = useParams<{ id: string }>();
  const domaineId = Number(id);
  const navigate = useNavigate();
  const { confirm, alerte } = useConfirm();

  const [profil, setProfil] = useState<DomaineProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('composants');

  // Identité
  const [nom, setNom] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  // Composants / lexique / règles
  const [rows, setRows] = useState<ComposantRow[]>([]);
  const [lexique, setLexique] = useState<LexiqueState>({});
  const [regles, setRegles] = useState<ReglesState>(toReglesState(undefined));
  // Instantanés serveur (détection des sections modifiées)
  const [snap, setSnap] = useState({ identite: '', composants: '', lexique: '', regles: '' });
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Grille tarifaire
  const [tarifs, setTarifs] = useState<TarifsConfigData>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [tSaving, setTSaving] = useState<Record<string, boolean>>({});
  const [tSaved, setTSaved] = useState<Record<string, boolean>>({});

  const applyProfil = useCallback((p: DomaineProfil) => {
    setProfil(p);
    setNom(p.nom || '');
    setSlug(p.slug || '');
    setDescription(p.description || '');
    const r = toRows(p.composants || []);
    const l = toLexiqueState(p.lexique);
    const g = toReglesState(p.regles);
    setRows(r); setLexique(l); setRegles(g);
    setSnap({
      identite: JSON.stringify({ nom: p.nom || '', slug: p.slug || '', description: p.description || '' }),
      composants: JSON.stringify(rowsToPayload(r)),
      lexique: JSON.stringify(lexiqueEcarts(l)),
      regles: JSON.stringify(reglesPayload(g)),
    });
  }, []);

  const applyTarifs = useCallback((t: TarifsConfigData) => {
    setTarifs(t);
    const init: Record<string, string> = {};
    Object.keys(t).forEach((k) => { init[k] = surchargeStr(t, k); });
    setEditing(init);
  }, []);

  const load = useCallback(async () => {
    if (!Number.isFinite(domaineId)) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/api/domaines/${domaineId}`);
      const p = data as DomaineProfil & { tarifs?: TarifsConfigData };
      // nbClients : porté par le détail, sinon par la liste
      if (p.nbClients == null) {
        try {
          const { data: liste } = await api.get('/api/domaines');
          const found = (Array.isArray(liste) ? liste : []).find((d: { id: number }) => d.id === domaineId) as DomaineProfil | undefined;
          if (found?.nbClients != null) p.nbClients = found.nbClients;
        } catch { /* nbClients inconnu → 0 */ }
      }
      applyProfil(p);
      if (p.tarifs && typeof p.tarifs === 'object') applyTarifs(p.tarifs);
      else {
        const { data: t } = await api.get('/api/abonnements/tarifs', { params: { domaineId } });
        applyTarifs(t as TarifsConfigData);
      }
    } catch {
      // 404 (domaine inconnu) comme toute autre erreur 4xx : page « introuvable » avec retour à la liste
      setNotFound(true);
    } finally { setLoading(false); }
  }, [domaineId, applyProfil, applyTarifs]);

  useEffect(() => { load(); }, [load]);

  // ── Dirty par section ──
  const dirty = useMemo(() => ({
    identite: JSON.stringify({ nom, slug, description }) !== snap.identite,
    composants: JSON.stringify(rowsToPayload(rows)) !== snap.composants,
    lexique: JSON.stringify(lexiqueEcarts(lexique)) !== snap.lexique,
    regles: JSON.stringify(reglesPayload(regles)) !== snap.regles,
  }), [nom, slug, description, rows, lexique, regles, snap]);
  const anyDirty = dirty.identite || dirty.composants || dirty.lexique || dirty.regles;

  const nbClients = profil?.nbClients ?? 0;

  // ── Validation locale avant PUT ──
  const validerProfil = (): string | null => {
    if (!nom.trim()) return 'Le nom du domaine est requis.';
    if (slug.trim() && !/^[a-z0-9-]{2,45}$/.test(slug.trim())) return 'Slug invalide : lettres minuscules, chiffres et tirets (2 à 45 caractères, comme le serveur).';
    const codes = new Set<string>();
    for (const r of rows) {
      const code = r.code.trim();
      if (!r.libelle.trim()) return 'Chaque composant doit avoir un libellé.';
      if (!/^[a-z0-9_]{2,30}$/.test(code)) return `Code de composant invalide « ${code || '(vide)'} » : lettres minuscules, chiffres et _ (2 à 30 caractères).`;
      if (codes.has(code)) return `Code de composant en double : « ${code} ».`;
      codes.add(code);
      if (r.nbMax != null && Number(r.nbMax) < Number(r.nbMin)) return `Composant « ${r.libelle} » : le maximum doit être ≥ au minimum.`;
    }
    const seuil = Number(regles.seuil_cout_matiere_pct);
    if (!Number.isFinite(seuil) || seuil < 0 || seuil > 100) return 'Le seuil coût matière doit être un pourcentage entre 0 et 100.';
    const smc = Number(regles.supplement_max_composants);
    if (!Number.isInteger(smc) || smc < 1) return 'Le nombre maximum de composants par supplément doit être un entier ≥ 1.';
    if (regles.formules.length === 0) return 'Au moins une formule doit être proposée.';
    const typesPerte = reglesEffectives(regles).types_perte as string[];
    if (typesPerte.length === 0) return 'Indiquez au moins un type de perte.';
    const perteInvalide = typesPerte.find((c) => !PERTE_CODE_RE.test(c));
    if (perteInvalide) return `Type de perte invalide « ${perteInvalide} » : lettres minuscules sans accent, chiffres et _ (2 à 20 caractères), séparés par des virgules.`;
    return null;
  };

  const save = async () => {
    const err = validerProfil();
    if (err) { alerte({ title: 'Profil incomplet', message: err, tone: 'danger' }); return; }
    const payload: Record<string, unknown> = {};
    if (dirty.identite) { payload.nom = nom.trim(); payload.slug = slug.trim() || undefined; payload.description = description.trim() || null; }
    if (dirty.composants) payload.composants = rowsToPayload(rows);
    if (dirty.lexique) payload.lexique = lexiqueEcarts(lexique);
    if (dirty.regles) payload.regles = reglesPayload(regles);
    setSaving(true);
    try {
      await api.put(`/api/domaines/${domaineId}`, payload);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await load();
    } catch (e: unknown) {
      const r = (e as ApiErr)?.response;
      if (r?.status === 409 && r.data?.code === 'COMPOSANT_UTILISE') {
        const utilises = (r.data.composants || []).map((c) => (typeof c === 'string' ? c : ((c as { libelle?: string; code?: string }).libelle || (c as { code?: string }).code || ''))).filter(Boolean);
        const codesUtilises = (r.data.composants || []).map((c) => (typeof c === 'string' ? c : ((c as { code?: string }).code || ''))).filter(Boolean);
        // Restaurer les composants utilisés (depuis l'état serveur) pour ne pas perdre les autres modifications.
        const serveur = toRows(profil?.composants || []);
        setRows((prev) => {
          const presents = new Set(prev.map((x) => x.code));
          const restaures = serveur.filter((s) => (codesUtilises.includes(s.code) || utilises.includes(s.libelle)) && !presents.has(s.code));
          return [...prev, ...restaures].sort((a, b) => a.ordre - b.ordre);
        });
        alerte({
          title: 'Composant utilisé par des comptes',
          message: `Impossible de supprimer : ${utilises.length ? utilises.join(', ') : 'un ou plusieurs composants'} — au moins un compte y est rattaché. Désactivez-le (case « Actif ») au lieu de le supprimer. Les composants concernés ont été restaurés dans la liste.`,
          tone: 'danger',
        });
        return;
      }
      if (r?.status === 409) { alerte({ title: 'Conflit', message: r.data?.message || 'Un domaine porte déjà ce nom ou ce slug.', tone: 'danger' }); return; }
      alerte({ title: 'Enregistrement impossible', message: r?.data?.message || "Erreur lors de l'enregistrement du profil.", tone: 'danger' });
    } finally { setSaving(false); }
  };

  const annuler = async () => {
    if (!anyDirty) return;
    const ok = await confirm({ title: 'Abandonner les modifications non enregistrées ?', tone: 'danger', confirmLabel: 'Abandonner' });
    if (ok && profil) applyProfil(profil);
  };

  // Retour à la liste : garde sur les modifications non enregistrées (useConfirm, jamais window.confirm)
  const retour = async () => {
    if (anyDirty) {
      const ok = await confirm({ title: 'Quitter sans enregistrer ?', message: 'Les modifications non enregistrées du profil seront perdues.', tone: 'danger', confirmLabel: 'Quitter' });
      if (!ok) return;
    }
    navigate('/admin/domaines');
  };

  // ── Composants ──
  const updateRow = (key: string, patch: Partial<ComposantRow>) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const addRow = () => {
    const ordre = rows.reduce((m, r) => Math.max(m, r.ordre), 0) + 1;
    setRows((prev) => [...prev, {
      _key: nextKey(), _new: true, code: '', libelle: '', libellePluriel: '', icone: '', aide: '',
      typeTechnique: 'activite', venteActive: true, productionActive: true, nbMin: 0, nbMax: null, ordre, actif: true,
    }]);
  };

  const removeRow = async (r: ComposantRow) => {
    if (!r._new) {
      const ok = await confirm({
        title: `Supprimer le composant « ${r.libelle || r.code} » ?`,
        message: 'La suppression est appliquée à l\'enregistrement du profil. Elle sera refusée si un compte utilise ce composant (préférez alors le désactiver).',
        tone: 'danger', confirmLabel: 'Supprimer',
      });
      if (!ok) return;
    }
    setRows((prev) => prev.filter((x) => x._key !== r._key));
  };

  // ── Grille tarifaire ──
  const isTarifDirty = (cle: string) => (editing[cle] ?? '') !== surchargeStr(tarifs, cle);
  const onTarifChange = (cle: string, val: string) => setEditing((ed) => ({ ...ed, [cle]: val }));

  const confirmImpact = async (titre: string, message: string) => {
    if (nbClients <= 0) return true;
    return confirm({
      title: titre,
      message: `${message}\n\n${nbClients} compte${nbClients > 1 ? 's' : ''} rattaché${nbClients > 1 ? 's' : ''} à ce domaine ${nbClients > 1 ? 'seront' : 'sera'} re-tarifé${nbClients > 1 ? 's' : ''} dès le prochain paiement.`,
      tone: 'primary', confirmLabel: 'Appliquer',
    });
  };

  const flashSaved = (cle: string) => {
    setTSaved((s) => ({ ...s, [cle]: true }));
    setTimeout(() => setTSaved((s) => ({ ...s, [cle]: false })), 2500);
  };

  const resetTarif = async (cle: string) => {
    if (tarifs[cle]?.surcharge == null) { setEditing((ed) => ({ ...ed, [cle]: '' })); return; }
    const ok = await confirmImpact('Revenir à la valeur héritée ?', `La surcharge « ${cle} » sera supprimée : la valeur de la grille générale (${tarifs[cle]?.valeurGenerale ?? '—'} DT) s'appliquera.`);
    if (!ok) return;
    setTSaving((s) => ({ ...s, [cle]: true }));
    try {
      await api.delete(`/api/abonnements/tarifs/${cle}`, { params: { domaineId } });
      setTarifs((t) => ({ ...t, [cle]: { ...t[cle], surcharge: null, valeur: t[cle]?.valeurGenerale ?? t[cle]?.valeur } }));
      setEditing((ed) => ({ ...ed, [cle]: '' }));
      flashSaved(cle);
    } catch (e: unknown) {
      alerte({ title: 'Suppression impossible', message: (e as ApiErr)?.response?.data?.message || 'Impossible de supprimer la surcharge.', tone: 'danger' });
    } finally { setTSaving((s) => ({ ...s, [cle]: false })); }
  };

  const saveTarif = async (cle: string) => {
    const raw = (editing[cle] ?? '').trim();
    if (raw === '') { await resetTarif(cle); return; }
    const valeur = Number(raw);
    if (!Number.isFinite(valeur) || valeur < 0) { alerte({ title: 'Valeur invalide', message: 'Saisissez un nombre positif ou nul.', tone: 'danger' }); return; }
    const ok = await confirmImpact('Appliquer la surcharge ?', `« ${cle} » vaudra ${valeur} pour ce domaine (grille générale : ${tarifs[cle]?.valeurGenerale ?? '—'}).`);
    if (!ok) return;
    setTSaving((s) => ({ ...s, [cle]: true }));
    try {
      await api.put(`/api/abonnements/tarifs/${cle}`, { valeur, domaineId });
      setTarifs((t) => ({ ...t, [cle]: { ...t[cle], surcharge: valeur, valeur } }));
      setEditing((ed) => ({ ...ed, [cle]: String(valeur) }));
      flashSaved(cle);
    } catch (e: unknown) {
      alerte({ title: 'Enregistrement impossible', message: (e as ApiErr)?.response?.data?.message || 'Impossible d\'enregistrer la surcharge.', tone: 'danger' });
    } finally { setTSaving((s) => ({ ...s, [cle]: false })); }
  };

  const nbSurcharges = Object.values(tarifs).filter((t) => t.surcharge != null).length;

  // ── Rendu ──
  if (loading) return <div className="page"><div className="loading-text">Chargement…</div></div>;
  if (notFound || !profil) {
    return (
      <div className="page">
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 24, color: '#991b1b' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Domaine introuvable</div>
          <Link to="/admin/domaines" style={{ color: ACCENT, fontWeight: 700 }}>← Retour aux domaines</Link>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; badge?: number; dirty?: boolean }[] = [
    { key: 'composants', label: '🧩 Composants', badge: rows.length, dirty: dirty.composants },
    { key: 'lexique', label: '📝 Lexique', badge: Object.keys(lexiqueEcarts(lexique)).length, dirty: dirty.lexique },
    { key: 'regles', label: '⚖️ Règles', dirty: dirty.regles },
    { key: 'grille', label: '💰 Grille tarifaire', badge: nbSurcharges },
  ];

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #451a03 0%, #b45309 55%, #f59e0b 100%)', borderRadius: 18, padding: '18px 24px', marginBottom: 18, boxShadow: '0 8px 28px rgba(180,83,9,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button onClick={retour} title="Retour aux domaines" style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>←</button>
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 11, padding: '8px 10px', fontSize: '1.3rem', lineHeight: 1 }}>🗂️</div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profil.nom}</h1>
            <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem', margin: '3px 0 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{profil.slug}</span>
              <span>· 👥 {nbClients} compte{nbClients !== 1 ? 's' : ''} rattaché{nbClients !== 1 ? 's' : ''}</span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {anyDirty && (
            <button onClick={annuler} style={{ height: 38, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 9, color: '#fff', fontWeight: 700, padding: '0 14px', cursor: 'pointer', fontSize: '0.84rem' }}>Annuler</button>
          )}
          <button onClick={save} disabled={saving || !anyDirty} style={{ height: 38, background: savedFlash ? '#16a34a' : anyDirty ? '#fff' : 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 9, color: savedFlash ? '#fff' : anyDirty ? ACCENT_DARK : 'rgba(255,255,255,0.7)', fontWeight: 800, padding: '0 18px', cursor: anyDirty && !saving ? 'pointer' : 'default', fontSize: '0.86rem', whiteSpace: 'nowrap' }}>
            {saving ? 'Enregistrement…' : savedFlash ? '✓ Enregistré' : 'Enregistrer le profil'}
          </button>
        </div>
      </div>

      {/* Identité */}
      <div style={{ background: 'var(--surface)', border: `1px solid ${dirty.identite ? ACCENT : 'var(--border)'}`, borderRadius: 14, padding: '14px 16px', marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div>
          <label style={lbl}>Nom *</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} style={{ ...inp, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} placeholder="ex : hotellerie" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Description (affichée au choix du domaine)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={inp} placeholder="Courte description du domaine" />
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e2e8f0', marginBottom: 18, flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '9px 16px', fontSize: '0.86rem', cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: on ? `3px solid ${ACCENT}` : '3px solid transparent', color: on ? ACCENT_DARK : 'var(--text-muted)',
              fontWeight: on ? 800 : 500, marginBottom: -2, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {t.badge != null && <span style={{ fontSize: '0.68rem', fontWeight: 800, borderRadius: 10, padding: '1px 7px', background: on ? '#fef3c7' : '#f1f5f9', color: on ? ACCENT_DARK : '#64748b' }}>{t.badge}</span>}
              {t.dirty && <span title="Modifications non enregistrées" style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />}
            </button>
          );
        })}
      </div>

      {/* ── Onglet Composants ── */}
      {tab === 'composants' && (
        <div style={card}>
          <div style={cardHead}>
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text)' }}>Menu de configuration du domaine</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Chaque composant est proposé au wizard client avec son libellé ; le type technique détermine le prix et les écrans (activité = vente, labo = production, gérant, base acheteurs).</div>
            </div>
            <button onClick={addRow} style={btnPrimary}>+ Ajouter un composant</button>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Aucun composant. Ajoutez au moins un composant de type Activité ou Labo.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 980 }}>
                <thead>
                  <tr style={{ background: '#fffbeb' }}>
                    {['Ordre', 'Icône', 'Libellé', 'Pluriel', 'Code', 'Type technique', 'Vend', 'Produit', 'Min', 'Max', 'Actif', ''].map((h, i) => (
                      <th key={i} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const unitaire = r.typeTechnique === 'activite' || r.typeTechnique === 'labo';
                    return (
                      <tr key={r._key} style={{ borderBottom: '1px solid var(--border)', opacity: r.actif ? 1 : 0.6, background: r._new ? '#fefce8' : undefined }}>
                        <td style={td}><input type="number" min={0} value={r.ordre} onChange={(e) => updateRow(r._key, { ordre: Number(e.target.value) || 0 })} style={{ ...cell, width: 58 }} /></td>
                        <td style={td}><input value={r.icone || ''} onChange={(e) => updateRow(r._key, { icone: e.target.value })} placeholder="🏪" style={{ ...cell, width: 52, textAlign: 'center' }} /></td>
                        <td style={td}>
                          <input value={r.libelle} onChange={(e) => updateRow(r._key, { libelle: e.target.value, ...(r._new && !r._codeTouche ? { code: codeFromLibelle(e.target.value) } : {}) })} placeholder="Restaurant" style={{ ...cell, width: 150 }} />
                          <input value={r.aide || ''} onChange={(e) => updateRow(r._key, { aide: e.target.value })} placeholder="Aide courte (wizard)" style={{ ...cell, width: 150, marginTop: 4, fontSize: '0.74rem', color: '#64748b' }} />
                        </td>
                        <td style={td}><input value={r.libellePluriel || ''} onChange={(e) => updateRow(r._key, { libellePluriel: e.target.value })} placeholder="Restaurants" style={{ ...cell, width: 130 }} /></td>
                        <td style={td}>
                          {r._new ? (
                            <input value={r.code} onChange={(e) => updateRow(r._key, { code: e.target.value.toLowerCase(), _codeTouche: true })} placeholder="restaurant" style={{ ...cell, width: 120, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                          ) : (
                            <code style={{ fontSize: '0.76rem', background: '#f1f5f9', padding: '3px 7px', borderRadius: 6, color: '#334155' }}>{r.code}</code>
                          )}
                        </td>
                        <td style={td}>
                          <select value={r.typeTechnique} disabled={!r._new}
                            title={r._new ? undefined : 'Type figé après création (les compteurs et la mensualité des comptes en dépendent) : créez un autre composant'}
                            onChange={(e) => updateRow(r._key, { typeTechnique: e.target.value as ComposantTypeTechnique })}
                            style={{ ...cell, width: 150, cursor: r._new ? 'pointer' : 'not-allowed', opacity: r._new ? 1 : 0.7 }}>
                            {TYPES_TECH.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.hint}</option>)}
                          </select>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!r.venteActive} disabled={!unitaire} title={unitaire ? 'Unité avec Espace Vente' : 'Sans objet pour ce type'} onChange={(e) => updateRow(r._key, { venteActive: e.target.checked })} /></td>
                        <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!r.productionActive} disabled={!unitaire} title={unitaire ? 'Unité avec production (PT)' : 'Sans objet pour ce type'} onChange={(e) => updateRow(r._key, { productionActive: e.target.checked })} /></td>
                        <td style={td}><input type="number" min={0} value={r.nbMin} onChange={(e) => updateRow(r._key, { nbMin: Math.max(0, Number(e.target.value) || 0) })} style={{ ...cell, width: 58 }} /></td>
                        <td style={td}><input type="number" min={0} value={r.nbMax ?? ''} placeholder="∞" onChange={(e) => updateRow(r._key, { nbMax: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })} style={{ ...cell, width: 58 }} /></td>
                        <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!r.actif} onChange={(e) => updateRow(r._key, { actif: e.target.checked })} /></td>
                        <td style={{ ...td, textAlign: 'right' }}><button onClick={() => removeRow(r)} title="Supprimer" style={iconBtn}>🗑</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '10px 16px', fontSize: '0.74rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Un composant désactivé n'est plus proposé au wizard mais reste valide pour les comptes qui l'utilisent. La suppression d'un composant utilisé par un compte est refusée à l'enregistrement. Le type technique est figé après création (créez un autre composant pour changer de type).
          </div>
        </div>
      )}

      {/* ── Onglet Lexique ── */}
      {tab === 'lexique' && (
        <div style={card}>
          <div style={cardHead}>
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text)' }}>Vocabulaire du domaine</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Champ vide = terme par défaut (affiché en gris). Seuls les écarts sont enregistrés. Élision = le mot commence par une voyelle (l'activité, d'activité).</div>
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{Object.keys(lexiqueEcarts(lexique)).length} écart{Object.keys(lexiqueEcarts(lexique)).length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#fffbeb' }}>
                  {['Clé', 'Singulier', 'Pluriel', 'Genre', 'Élision', 'Icône', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.keys(lexique).map((cle) => {
                  const def = LEXIQUE_DEFS.find((d) => d.cle === cle);
                  const row = lexique[cle];
                  const d = def?.def || { sg: '', pl: '', g: 'm' as const, el: false, icon: '' };
                  const modifie = !!(row.sg || row.pl || row.icon || row.g !== d.g || row.el !== d.el);
                  const set = (patch: Partial<LexiqueRow>) => setLexique((prev) => ({ ...prev, [cle]: { ...prev[cle], ...patch } }));
                  return (
                    <tr key={cle} style={{ borderBottom: '1px solid var(--border)', background: modifie ? '#fffbeb55' : undefined }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{def?.label || cle}</div>
                        <code style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{cle}</code>
                      </td>
                      <td style={td}><input value={row.sg} placeholder={d.sg || '—'} onChange={(e) => set({ sg: e.target.value })} style={{ ...cell, width: 190, borderColor: row.sg ? ACCENT : undefined }} /></td>
                      <td style={td}><input value={row.pl} placeholder={d.pl || '—'} onChange={(e) => set({ pl: e.target.value })} style={{ ...cell, width: 190, borderColor: row.pl ? ACCENT : undefined }} /></td>
                      <td style={td}>
                        <select value={row.g} onChange={(e) => set({ g: e.target.value === 'f' ? 'f' : 'm' })} style={{ ...cell, width: 110, cursor: 'pointer', borderColor: row.g !== d.g ? ACCENT : undefined }}>
                          <option value="m">masculin</option>
                          <option value="f">féminin</option>
                        </select>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={row.el} onChange={(e) => set({ el: e.target.checked })} /></td>
                      <td style={td}><input value={row.icon} placeholder={d.icon || '—'} onChange={(e) => set({ icon: e.target.value })} style={{ ...cell, width: 60, textAlign: 'center', borderColor: row.icon ? ACCENT : undefined }} /></td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => set({ sg: '', pl: '', icon: '', g: d.g, el: d.el })} disabled={!modifie} title="Réinitialiser (valeurs par défaut)" style={{ ...iconBtn, opacity: modifie ? 1 : 0.35, cursor: modifie ? 'pointer' : 'default' }}>↺</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Onglet Règles ── */}
      {tab === 'regles' && (
        <div style={card}>
          <div style={cardHead}>
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text)' }}>Règles métier du domaine</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Défaut = comportement actuel de LabFlow (restauration). Ces règles pilotent la validation de la composition d'un compte et certains écrans.</div>
            </div>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {REGLES_BOOL.map((r) => (
              <label key={r.cle} style={{ ...regleCard, cursor: 'pointer', borderColor: regles[r.cle] !== REGLES_DEFAUT[r.cle] ? ACCENT : 'var(--border)' }}>
                <input type="checkbox" checked={regles[r.cle]} onChange={(e) => setRegles((p) => ({ ...p, [r.cle]: e.target.checked }))} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text)' }}>{r.label}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>{r.aide}</div>
                </div>
              </label>
            ))}

            <div style={{ ...regleCard, borderColor: JSON.stringify(regles.formules) !== JSON.stringify(REGLES_DEFAUT.formules) ? ACCENT : 'var(--border)' }}>
              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>Formules proposées</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>Formules d'activités proposées à la configuration d'un compte de ce domaine.</div>
                <div style={{ display: 'flex', gap: 14 }}>
                  {(['basique', 'premium'] as const).map((f) => (
                    <label key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={regles.formules.includes(f)} onChange={(e) => setRegles((p) => ({ ...p, formules: e.target.checked ? [...p.formules.filter((x) => x !== f), f] : p.formules.filter((x) => x !== f) }))} />
                      {f === 'basique' ? 'Basique' : 'Premium'}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ ...regleCard, borderColor: Number(regles.seuil_cout_matiere_pct) !== REGLES_DEFAUT.seuil_cout_matiere_pct ? ACCENT : 'var(--border)' }}>
              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>Seuil coût matière (%)</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>Au-delà de ce pourcentage, le coût matière (food cost) est signalé en alerte.</div>
                <input type="number" min={0} max={100} step={1} value={regles.seuil_cout_matiere_pct} onChange={(e) => setRegles((p) => ({ ...p, seuil_cout_matiere_pct: e.target.value }))} style={{ ...cell, width: 110 }} />
              </div>
            </div>

            <div style={{ ...regleCard, borderColor: JSON.stringify(reglesEffectives(regles).types_perte) !== JSON.stringify(REGLES_DEFAUT.types_perte) ? ACCENT : 'var(--border)' }}>
              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>Types de perte</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>Types proposés à la saisie des pertes, séparés par des virgules (défaut : avarie, dechet).</div>
                <input value={regles.types_perte} onChange={(e) => setRegles((p) => ({ ...p, types_perte: e.target.value }))} onBlur={() => setRegles((p) => ({ ...p, types_perte: normaliseCodesPerte(p.types_perte).join(', ') }))} placeholder="avarie, dechet" style={{ ...cell, width: '100%' }} />
              </div>
            </div>

            <div style={{ ...regleCard, borderColor: Number(regles.supplement_max_composants) !== REGLES_DEFAUT.supplement_max_composants ? ACCENT : 'var(--border)' }}>
              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>Composants max par supplément</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>Nombre maximum de composants (ingrédients) d'un supplément. 1 = comportement actuel.</div>
                <input type="number" min={1} step={1} value={regles.supplement_max_composants} onChange={(e) => setRegles((p) => ({ ...p, supplement_max_composants: e.target.value }))} style={{ ...cell, width: 110 }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Onglet Grille tarifaire ── */}
      {tab === 'grille' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 16px', fontSize: '0.84rem', color: '#78350f', lineHeight: 1.5 }}>
            <strong>Surcharges du domaine « {profil.nom} »</strong> : chaque ligne hérite de la <Link to="/admin/tarifs" style={{ color: ACCENT, fontWeight: 700 }}>grille générale</Link> tant qu'aucune valeur n'est saisie. Une surcharge enregistrée s'applique à tous les comptes du domaine
            {nbClients > 0 ? <> — <strong>{nbClients} compte{nbClients > 1 ? 's' : ''}</strong> {nbClients > 1 ? 'seront' : 'sera'} re-tarifé{nbClients > 1 ? 's' : ''} dès le prochain paiement.</> : ' (aucun compte rattaché pour l\'instant).'}
            {' '}Surcharges actives : <strong>{nbSurcharges}</strong>.
          </div>
          {TARIF_SECTIONS.map((s) => (
            <div key={s.key} style={tarifCardStyle}>
              <TarifSectionHeader icon={s.icon} title={s.title} subtitle={s.subtitle} gradient={s.gradient} textColor={s.textColor} />
              {s.fields.map((f) => {
                const t = tarifs[f.cle];
                const inherited = t?.valeurGenerale ?? (t?.surcharge == null ? t?.valeur : undefined) ?? TARIF_DEFAULTS[f.cle as TarifKey];
                return (
                  <TarifField
                    key={f.cle} {...f}
                    editing={editing} onChange={onTarifChange} onSave={saveTarif}
                    saving={tSaving} saved={tSaved} isDirty={isTarifDirty}
                    inherited={inherited} surcharge={t?.surcharge != null} onReset={resetTarif}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ──
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' };
const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' };
const th: React.CSSProperties = { textAlign: 'left', padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };
const cell: React.CSSProperties = { padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.82rem', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' };
const regleCard: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--surface)' };
const btnPrimary: React.CSSProperties = { height: 36, background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, padding: '0 16px', cursor: 'pointer', fontSize: '0.84rem', whiteSpace: 'nowrap' };
const iconBtn: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: '0.9rem' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)' };
