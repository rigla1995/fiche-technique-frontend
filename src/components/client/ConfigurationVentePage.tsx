import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import { useConfirm } from '../common/ConfirmDialog';
import type { Activite } from '../../types';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import { useAuth } from '../../context/AuthContext';
// C1 : canaux de vente — chaque canal (vente directe, prestataires) a sa case « en vente » et son prix.
import {
  CANAL_DIRECT, PAS_ARRONDI, MAJORATION_MIN, MAJORATION_MAX, cleCellule, lireCle, etatEnregistre, etatAffiche, surPrix,
  surCase, celluleAEnvoyer, apercuCopie,
} from './ventes/canaux';
import type { Edition, EtatCellule, CelluleEnvoyee } from './ventes/canaux';
// C2 : recette propre à un canal — une variante du produit, rangée sous lui, le remplace sur les canaux choisis.
import { LIBELLE_DEFAUT, LIBELLE_MAX, comparerAvecVariantes, lireLibelle, canauxParDefaut, peutAvoirVariante } from './produits/variantes';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

// ── Interfaces ───────────────────────────────────────────────────────────────

interface ActivitePrestataire {
  id: string;
  taux_commission: number;
  prestataire_nom: string;
  actif: boolean;
}

interface Produit {
  id: number;
  name: string;
  isSupplement: boolean;
  type: string;
  categorieProduitName?: string | null;
  /** C2 : variante (recette propre à un canal) — son produit d'origine et son libellé. */
  varianteDeId?: number | null;
  varianteDeNom?: string | null;
  varianteLibelle?: string | null;
}

interface ArticleVendable {
  id: string;
  article_type: 'produit' | 'ingredient';
  article_id: number;
  prix_vente: number;
  portion: number | null;
  actif: boolean;
  /** C1 : en vente directe (absent d'un serveur d'avant les canaux = oui). */
  directe?: boolean;
  categorie_produit_id?: number | null;
}

interface ArticleValorise {
  id: number;
  nom: string;
  unite_nom: string | null;
  categorie_nom: string | null;
  famille_nom: string | null;
  categorie_produit_id: number | null;
  categorie_produit_nom: string | null;
  article_type?: 'produit' | 'ingredient';
  compose?: boolean;
  vendable: ArticleVendable | null;
}

interface ArticlePrixPrestataire {
  article_vendable_id: string;
  activite_prestataire_id: string;
  prix_vente: number | null;
  /** C1 : en vente chez ce prestataire (absent d'un serveur d'avant les canaux = oui dès qu'il y a un prix). */
  en_vente?: boolean;
}

interface ProduitRow {
  produit: Produit;
  vendable?: ArticleVendable;
  saving?: boolean;
  error?: string;
  categorieProduitId?: number | null;
  categorieProduitName?: string | null;
}

interface HistConfigEntry {
  id: number;
  article_vendable_id: string;
  prix_vente: number;
  saved_at: string;
  article_type: 'produit' | 'ingredient';
  produit_nom: string | null;
  is_supplement: boolean;
  created_by_nom?: string | null;
}

const PAGE_SIZE = 10;

type Tab = 'produits' | 'supplements' | 'valorises' | 'historique';

// ── Context ──────────────────────────────────────────────────────────────────

interface CVCtxType {
  activePrests: ActivitePrestataire[];
  prixPrestataires: ArticlePrixPrestataire[];
  /** C1 : modifications en attente, par cellule (produit × canal). */
  edits: Record<string, Edition>;
  modifierPrix: (cle: string, enr: EtatCellule, texte: string) => void;
  modifierCase: (cle: string, coche: boolean) => void;
  cocherColonne: (lignes: ProduitRow[], canal: string, coche: boolean) => void;
  /** C2 : ouvre la fenêtre « recette propre à un canal » pour cette ligne (réservé au titulaire du compte). */
  ouvrirVariante: (row: ProduitRow) => void;
  peutVarier: boolean;
  saveError: string;
  dirtyCount: number;
  handleSaveAll: () => void;
  saving: boolean;
  histEntries: HistConfigEntry[];
  histLoading: boolean;
  histFilterNom: string;
  histFilterType: 'all' | 'produit' | 'supplement' | 'valorise';
  histFilterDu: string;
  histFilterAu: string;
  setHistFilterNom: React.Dispatch<React.SetStateAction<string>>;
  setHistFilterType: React.Dispatch<React.SetStateAction<'all' | 'produit' | 'supplement' | 'valorise'>>;
  setHistFilterDu: React.Dispatch<React.SetStateAction<string>>;
  setHistFilterAu: React.Dispatch<React.SetStateAction<string>>;
  loadHistorique: () => void;
  filteredHist: HistConfigEntry[];
  handleDeleteHistEntry: (id: number) => void;
  handleExportHistXls: () => void;
  exportingHistXls: boolean;
  selectedActiviteId: number | null;
  selectedHistIds: Set<number>;
  toggleSelectHist: (id: number) => void;
}

const CVCtx = createContext<CVCtxType>(null!);

const ExcelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <rect width="24" height="24" rx="3" fill="#1D6F42"/>
    <path d="M7 7l3.5 5L7 17h2.5l2.5-3.5L14.5 17H17l-3.5-5L17 7h-2.5L12 10.5 9.5 7H7z" fill="white"/>
  </svg>
);

// ── Module-level sub-components ───────────────────────────────────────────────

/** Référence d'une ligne de la grille pour les canaux : le type et l'identifiant de ce qui est vendu. */
const typeDe = (row: ProduitRow): string => (row.produit.type === 'ingredient' ? 'ingredient' : 'produit');
const cleDe = (row: ProduitRow, canal: string): string => cleCellule(typeDe(row), row.produit.id, canal);

/** C1 — une cellule de la grille : la case « en vente » et le prix d'une ligne sur un canal. */
function CelluleCanal({ row, canal }: { row: ProduitRow; canal: string }) {
  const { edits, prixPrestataires, modifierPrix, modifierCase } = useContext(CVCtx);
  const voc = useVocabulaire();
  const cle = cleDe(row, canal);
  const enr = etatEnregistre(row.vendable, prixPrestataires, canal);
  const a = etatAffiche(enr, edits[cle]);
  const infobulle = a.cochable ? `En ${voc.nom('vente')} sur ce canal` : 'Saisissez d\'abord un prix';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <input type="checkbox" checked={a.enVente} disabled={!a.cochable} aria-label={infobulle} title={infobulle}
        onChange={e => modifierCase(cle, e.target.checked)}
        style={{ accentColor: C, width: 17, height: 17, cursor: a.cochable ? 'pointer' : 'not-allowed' }} />
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <input type="number" min="0" step="0.01" value={a.texte} placeholder="—"
          onChange={e => modifierPrix(cle, enr, e.target.value)}
          style={{ width: 92, padding: '6px 28px 6px 8px', borderRadius: 8, border: `1.5px solid ${a.modifie ? C : CB}`, background: a.modifie ? CL : '#fafafa', fontSize: '0.86rem', fontWeight: 700, color: a.enVente ? CD : 'var(--text-muted)', outline: 'none' }} />
        <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
      </div>
    </div>
  );
}

function ProduitTableRow({ row, idx, showPortion, avecVariantes }: { row: ProduitRow; idx: number; showPortion: boolean; avecVariantes: boolean }) {
  const { activePrests, edits, prixPrestataires, ouvrirVariante, peutVarier, dirtyCount } = useContext(CVCtx);
  const voc = useVocabulaire();
  // Une ligne est « en vente » dès qu'un canal la vend (modifications en attente comprises).
  const isActive = [CANAL_DIRECT, ...activePrests.map(ap => ap.id)]
    .some(canal => etatAffiche(etatEnregistre(row.vendable, prixPrestataires, canal), edits[cleDe(row, canal)]).enVente);
  // C2 : une variante est rangée sous son produit d'origine, en retrait, avec son libellé.
  const variante = row.produit.varianteDeId != null;
  const proposer = avecVariantes && peutVarier && peutAvoirVariante(row.produit);

  return (
    <tr style={{ borderBottom: `1px solid ${CB}`, background: idx % 2 === 0 ? '#fff' : '#fffdf7' }}>
      <td style={{ padding: variante ? '10px 16px 10px 34px' : '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: isActive ? 700 : 500, fontSize: '0.9rem', color: isActive ? CD : 'var(--text)', opacity: isActive ? 1 : 0.6 }}>
            {variante && <span aria-hidden="true" style={{ color: C, marginRight: 5 }}>↳</span>}{row.produit.name}
          </span>
          {variante && (
            <span title={`Variante ${voc.de('produit')}${row.produit.varianteDeNom ? ` « ${row.produit.varianteDeNom} »` : ''} : ${voc.son('recette')} et son coût lui sont propres`}
              style={{ fontSize: '0.62rem', fontWeight: 700, background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74', borderRadius: 20, padding: '1px 8px', whiteSpace: 'nowrap' }}>
              Variante{row.produit.varianteLibelle ? ` · ${row.produit.varianteLibelle}` : ''}
            </span>
          )}
          {proposer && (
            <button type="button" onClick={() => ouvrirVariante(row)} disabled={dirtyCount > 0}
              title={dirtyCount > 0 ? 'Enregistrez d\'abord vos modifications' : `Préparer ${voc.ce('produit')} autrement pour un canal (quantités, emballage…) : une variante, avec ${voc.son('recette')}`}
              style={{ padding: '2px 9px', borderRadius: 7, border: `1px solid ${CB}`, background: '#fff', color: dirtyCount > 0 ? '#9ca3af' : C, fontSize: '0.68rem', fontWeight: 700, cursor: dirtyCount > 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
              ＋ {voc.Nom('recette')} par canal
            </button>
          )}
        </div>
      </td>
      {showPortion && (
        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: isActive ? 600 : 400, color: isActive ? CD : 'var(--text-muted)' }}>
            {row.vendable?.portion != null ? row.vendable.portion : '—'}
          </span>
        </td>
      )}
      <td style={{ padding: '8px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <CelluleCanal row={row} canal={CANAL_DIRECT} />
      </td>
      {activePrests.map(ap => (
        <td key={ap.id} style={{ padding: '8px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <CelluleCanal row={row} canal={ap.id} />
        </td>
      ))}
    </tr>
  );
}

/** C1 — sous le titre d'une colonne : cocher ou décocher tout le canal (lignes filtrées ; rien n'est enregistré avant « Enregistrer »). */
function ToutLeCanal({ lignes, canal }: { lignes: ProduitRow[]; canal: string }) {
  const { cocherColonne } = useContext(CVCtx);
  const bouton = { padding: '1px 7px', borderRadius: 6, border: `1px solid ${CB}`, background: '#fff', color: C, fontSize: '0.64rem', fontWeight: 700, cursor: 'pointer', textTransform: 'none' as const, letterSpacing: 0 };
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 5 }}>
      <button type="button" onClick={() => cocherColonne(lignes, canal, true)} title="Cocher toutes les lignes qui ont un prix sur ce canal" style={bouton}>✓ Tout</button>
      <button type="button" onClick={() => cocherColonne(lignes, canal, false)} title="Décocher toutes les lignes de ce canal (les prix sont gardés)" style={bouton}>✕ Aucun</button>
    </div>
  );
}

function ProduitTable({ tableRows, showPortion, isSupplement, avecVariantes = false }: { tableRows: ProduitRow[]; showPortion: boolean; isSupplement?: boolean; avecVariantes?: boolean }) {
  const { activePrests, prixPrestataires, edits, saveError, dirtyCount, handleSaveAll, saving } = useContext(CVCtx);
  const voc = useVocabulaire();
  const [filterNom, setFilterNom] = useState('');
  // C1 : filtre « en vente sur ce canal » ('directe' ou le lien d'un prestataire).
  const [filterPresta, setFilterPresta] = useState('');
  const [page, setPage] = useState(1);

  const articleLabel = `Nom ${voc.court(isSupplement ? 'supplement' : 'produit')}…`;

  if (tableRows.length === 0) {
    const emptyIcon = isSupplement ? '🧂' : '🛍️';
    const emptyMsg = isSupplement
      ? `Tu n'as pas ${voc.de('supplement', true)} pour ${voc.ce('activite')}`
      : `${voc.Aucun('produit_vendable')} ${voc.acc('produit_vendable', 'assigné', 'assignée')} à ${voc.ce('activite')}`;
    const emptyHint = isSupplement ? `${voc.pl('supplement')} vendables` : voc.pl('produit_vendable');
    return (
      <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>{emptyIcon}</div>
        {emptyMsg}
        <div style={{ fontSize: '0.8rem', marginTop: 6 }}>Créez {voc.det(isSupplement ? 'supplement' : 'produit_vendable', 'un', true)}{emptyHint} dans <strong>{voc.Nom('espace_produits')}</strong></div>
      </div>
    );
  }

  const filtered = tableRows.filter(r => {
    if (filterNom && !r.produit.name.toLowerCase().includes(filterNom.toLowerCase())) return false;
    if (filterPresta && !etatAffiche(etatEnregistre(r.vendable, prixPrestataires, filterPresta), edits[cleDe(r, filterPresta)]).enVente) return false;
    return true;
  }).sort((a, b) => {
    // Regrouper par catégorie de produit, puis par nom — une variante juste sous son produit d'origine (C2).
    const ca = a.categorieProduitName ?? '￿';
    const cb = b.categorieProduitName ?? '￿';
    if (ca !== cb) return ca.localeCompare(cb, 'fr');
    return comparerAvecVariantes(a.produit, b.produit);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const colCount = 1 + (showPortion ? 1 : 0) + 1 + activePrests.length;
  const directe = `${voc.Nom('vente')} ${voc.acc('vente', 'direct', 'directe')}`;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${CB}`, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder={articleLabel} value={filterNom}
            onChange={e => setFilterNom(e.target.value)}
            style={{ width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${filterNom ? C : CB}`, background: filterNom ? CL : '#fafafa', fontSize: '0.83rem', color: CD, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {activePrests.length > 0 && (
          <select value={filterPresta} onChange={e => setFilterPresta(e.target.value)}
            style={{ flex: '1 1 160px', minWidth: 130, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${filterPresta ? C : CB}`, background: filterPresta ? CL : '#fafafa', fontSize: '0.83rem', color: CD, outline: 'none', cursor: 'pointer' }}>
            <option value="">Tous les canaux</option>
            <option value={CANAL_DIRECT}>🏪 En {voc.nom('vente')} {voc.acc('vente', 'direct', 'directe')}</option>
            {activePrests.map(ap => (
              <option key={ap.id} value={ap.id}>🛵 En {voc.nom('vente')} : {ap.prestataire_nom}</option>
            ))}
          </select>
        )}
        {(filterNom || filterPresta) && (
          <button onClick={() => { setFilterNom(''); setFilterPresta(''); setPage(1); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${CB}`, background: '#fff', color: C, fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ✕ Réinitialiser
          </button>
        )}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length}/{tableRows.length} article{tableRows.length > 1 ? 's' : ''}
        </div>
        <button onClick={handleSaveAll} disabled={saving || dirtyCount === 0}
          style={{
            marginLeft: 'auto', padding: '7px 18px', borderRadius: 8, border: 'none',
            background: dirtyCount > 0 ? C : '#e5e7eb', color: dirtyCount > 0 ? '#fff' : '#9ca3af',
            fontSize: '0.83rem', fontWeight: 700, cursor: dirtyCount > 0 ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            transition: 'all 0.15s', boxShadow: dirtyCount > 0 ? `0 2px 8px ${C}55` : 'none',
          }}>
          💾 Enregistrer
          {dirtyCount > 0 && (
            <span style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 20, padding: '0 7px', fontSize: '0.75rem', fontWeight: 800 }}>{dirtyCount}</span>
          )}
        </button>
      </div>
      {saveError && (
        <div role="alert" style={{ margin: '10px 16px 0', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '9px 14px', fontSize: '0.82rem', fontWeight: 600 }}>
          ⚠️ {saveError}
        </div>
      )}
      <div style={{ padding: '8px 16px 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        Pour chaque canal : cochez la case pour y vendre la ligne, au prix saisi à côté. Une case ne se coche qu'avec un prix ; décochée, son prix est gardé.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: colCount * 150 }}>
          <thead>
            <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
              <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{voc.Nom('produit')}</th>
              {showPortion && (
                <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{voc.Nom('portion')}</th>
              )}
              <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                🏪 {directe}
                <ToutLeCanal lignes={filtered} canal={CANAL_DIRECT} />
              </th>
              {activePrests.map(ap => (
                <th key={ap.id} style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  🛵 {ap.prestataire_nom}
                  <ToutLeCanal lignes={filtered} canal={ap.id} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Aucun résultat pour ces filtres
                </td>
              </tr>
            ) : (
              (() => {
                let prevCat: string | null | undefined = '__init__';
                const out: React.ReactNode[] = [];
                paginated.forEach((row, idx) => {
                  const cat = row.categorieProduitName ?? null;
                  if (cat !== prevCat) {
                    prevCat = cat;
                    out.push(
                      <tr key={`cat-${cat ?? 'none'}`} style={{ background: CL }}>
                        <td colSpan={colCount} style={{ padding: '7px 16px', fontWeight: 800, fontSize: '0.74rem', color: CD, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          🏷️ {cat ?? 'Sans catégorie'}
                        </td>
                      </tr>
                    );
                  }
                  out.push(<ProduitTableRow key={row.produit.id} row={row} idx={idx} showPortion={showPortion} avecVariantes={avecVariantes} />);
                });
                return out;
              })()
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: `1px solid ${CB}`, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} sur {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${CB}`, background: '#fff', color: C, cursor: safePage <= 1 ? 'default' : 'pointer', fontWeight: 700, opacity: safePage <= 1 ? 0.4 : 1 }}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{ padding: '4px 9px', borderRadius: 7, border: `1.5px solid ${p === safePage ? C : CB}`, background: p === safePage ? C : '#fff', color: p === safePage ? '#fff' : CD, fontWeight: p === safePage ? 800 : 500, cursor: 'pointer', minWidth: 30 }}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${CB}`, background: '#fff', color: C, cursor: safePage >= totalPages ? 'default' : 'pointer', fontWeight: 700, opacity: safePage >= totalPages ? 0.4 : 1 }}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoriqueTab() {
  const {
    filteredHist, histLoading, histEntries,
    histFilterNom, histFilterType, histFilterDu, histFilterAu,
    setHistFilterNom, setHistFilterType, setHistFilterDu, setHistFilterAu,
    loadHistorique, handleDeleteHistEntry, handleExportHistXls, exportingHistXls,
    selectedHistIds, toggleSelectHist,
  } = useContext(CVCtx);
  const voc = useVocabulaire();
  const [page, setPage] = useState(1);

  const histTotalPages = Math.max(1, Math.ceil(filteredHist.length / PAGE_SIZE));
  const histSafePage = Math.min(page, histTotalPages);
  const histPaginated = filteredHist.slice((histSafePage - 1) * PAGE_SIZE, histSafePage * PAGE_SIZE);

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
      <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>📋</div>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: CD }}>Historique des prix</div>
          <div style={{ fontSize: '0.72rem', color: C }}>Toutes les modifications de prix enregistrées pour {voc.ce('activite')}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={handleExportHistXls} disabled={exportingHistXls}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1.5px solid #1D6F42', background: exportingHistXls ? '#f3f4f6' : '#f0fdf4', color: '#1D6F42', fontSize: '0.78rem', fontWeight: 700, cursor: exportingHistXls ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            <ExcelIcon /> {exportingHistXls ? 'Export…' : 'Exporter XLS'}
          </button>
          <button onClick={loadHistorique} disabled={histLoading}
            style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${CB}`, background: CL, color: C, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            🔄 Actualiser
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${CB}`, flexWrap: 'wrap', alignItems: 'center', background: '#fafafa' }}>
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder={`Nom ${voc.court('produit')}…`} value={histFilterNom}
            onChange={e => setHistFilterNom(e.target.value)}
            style={{ width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${histFilterNom ? C : CB}`, background: histFilterNom ? CL : '#fff', fontSize: '0.83rem', color: CD, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <select value={histFilterType} onChange={e => setHistFilterType(e.target.value as 'all' | 'produit' | 'supplement' | 'valorise')}
          style={{ flex: '0 0 180px', padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${histFilterType !== 'all' ? C : CB}`, background: histFilterType !== 'all' ? CL : '#fff', fontSize: '0.83rem', color: CD, outline: 'none', cursor: 'pointer' }}>
          <option value="all">Tous types</option>
          <option value="produit">{voc.Pl('produit')}</option>
          <option value="supplement">{voc.Pl('supplement')}</option>
          <option value="valorise">{voc.Titre('produit_valorise', true)}</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Du</span>
          <input type="date" value={histFilterDu} onChange={e => setHistFilterDu(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 8, border: `1.5px solid ${histFilterDu ? C : CB}`, background: histFilterDu ? CL : '#fff', fontSize: '0.8rem', color: CD, outline: 'none' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Au</span>
          <input type="date" value={histFilterAu} onChange={e => setHistFilterAu(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 8, border: `1.5px solid ${histFilterAu ? C : CB}`, background: histFilterAu ? CL : '#fff', fontSize: '0.8rem', color: CD, outline: 'none' }} />
        </div>
        {(histFilterNom || histFilterType !== 'all' || histFilterDu || histFilterAu) && (
          <button onClick={() => { setHistFilterNom(''); setHistFilterType('all'); setHistFilterDu(''); setHistFilterAu(''); setPage(1); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${CB}`, background: '#fff', color: C, fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ✕ Réinitialiser
          </button>
        )}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          {filteredHist.length} entrée{filteredHist.length > 1 ? 's' : ''}
        </div>
      </div>

      {histLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chargement…</div>
      ) : filteredHist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>📋</div>
          {histEntries.length === 0 ? 'Aucun historique enregistré' : 'Aucun résultat pour ces filtres'}
        </div>
      ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: '33%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '13%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                    <th style={{ padding: '8px 12px', width: 36 }}></th>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{voc.Nom('produit')}</th>
                    <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                    <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prix enregistré</th>
                    <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                    <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Créé par</th>
                    <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {histPaginated.map((e, idx) => {
                    const isSel = selectedHistIds.has(e.id);
                    const rowBg = isSel ? '#FF6B00' : (idx % 2 === 0 ? '#fff' : '#fffdf7');
                    return (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${CB}`, background: rowBg, cursor: 'pointer' }} onClick={() => toggleSelectHist(e.id)}>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }} onClick={ev => ev.stopPropagation()}>
                          <input type="checkbox" checked={isSel} onChange={() => toggleSelectHist(e.id)}
                            style={{ accentColor: '#FF6B00', width: 15, height: 15, cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.88rem', color: isSel ? '#fff' : CD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.produit_nom ?? '—'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                            background: isSel ? 'rgba(255,255,255,0.25)' : (e.article_type === 'ingredient' ? '#f0fdf4' : (e.is_supplement ? '#fef3c7' : CL)),
                            color: isSel ? '#fff' : (e.article_type === 'ingredient' ? '#166534' : (e.is_supplement ? '#92400e' : CD)),
                            border: `1px solid ${isSel ? 'rgba(255,255,255,0.4)' : (e.article_type === 'ingredient' ? '#86efac' : (e.is_supplement ? '#fcd34d' : CB))}`,
                          }}>
                            {e.article_type === 'ingredient' ? `${voc.icon('produit_valorise')} ${voc.Titre('produit_valorise')}` : (e.is_supplement ? `🧂 ${voc.Nom('supplement')}` : `🛍️ ${voc.Nom('produit')}`)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', color: isSel ? '#fff' : C }}>
                          {fmtMoney(e.prix_vente)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '0.8rem', color: isSel ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
                          {fmtDate(e.saved_at)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '0.8rem', color: isSel ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
                          {e.created_by_nom || '—'}
                        </td>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }} onClick={ev => ev.stopPropagation()}>
                          <button onClick={() => handleDeleteHistEntry(e.id)}
                            style={{ border: `1.5px solid ${isSel ? '#fff' : '#dc2626'}`, color: isSel ? '#fff' : '#dc2626', background: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {histTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: `1px solid ${CB}`, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {(histSafePage - 1) * PAGE_SIZE + 1}–{Math.min(histSafePage * PAGE_SIZE, filteredHist.length)} sur {filteredHist.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={histSafePage <= 1} style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${CB}`, background: '#fff', color: C, cursor: histSafePage <= 1 ? 'default' : 'pointer', fontWeight: 700, opacity: histSafePage <= 1 ? 0.4 : 1 }}>‹</button>
                  {Array.from({ length: histTotalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)} style={{ padding: '4px 9px', borderRadius: 7, border: `1.5px solid ${p === histSafePage ? C : CB}`, background: p === histSafePage ? C : '#fff', color: p === histSafePage ? '#fff' : CD, fontWeight: p === histSafePage ? 800 : 500, cursor: 'pointer', minWidth: 30 }}>{p}</button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(histTotalPages, p + 1))} disabled={histSafePage >= histTotalPages} style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${CB}`, background: '#fff', color: C, cursor: histSafePage >= histTotalPages ? 'default' : 'pointer', fontWeight: 700, opacity: histSafePage >= histTotalPages ? 0.4 : 1 }}>›</button>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigurationVentePage() {
  const { user } = useAuth();
  // D1 : prestataires de livraison proposés au compte (règle du domaine × interrupteur de l'admin ; absent = oui).
  const prestatairesOk = user?.domaine?.prestataires !== false;
  const { confirm, alerte } = useConfirm();
  const voc = useVocabulaire();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('produits');

  const [prestataires, setPrestataires] = useState<ActivitePrestataire[]>([]);
  const [prixPrestataires, setPrixPrestataires] = useState<ArticlePrixPrestataire[]>([]);
  const [rows, setRows] = useState<ProduitRow[]>([]);
  const [valorises, setValorises] = useState<ArticleValorise[]>([]);

  // C1 : modifications en attente de la grille, par cellule (ligne × canal), envoyées d'un bloc par « Enregistrer ».
  const [edits, setEdits] = useState<Record<string, Edition>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  // C1 : copie d'un canal vers un autre (fenêtre).
  const [copie, setCopie] = useState<{ source: string; cible: string; pct: string; pas: number; retirer: boolean } | null>(null);
  const [copieErr, setCopieErr] = useState('');
  const [copieSaving, setCopieSaving] = useState(false);
  // C2 : recette propre à un canal (fenêtre de création d'une variante).
  const [variante, setVariante] = useState<{ row: ProduitRow; libelle: string; canaux: string[] } | null>(null);
  const [varianteErr, setVarianteErr] = useState('');
  const [varianteSaving, setVarianteSaving] = useState(false);

  const [histEntries, setHistEntries] = useState<HistConfigEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFilterNom, setHistFilterNom] = useState('');
  const [histFilterType, setHistFilterType] = useState<'all' | 'produit' | 'supplement' | 'valorise'>('all');
  const [histFilterDu, setHistFilterDu] = useState('');
  const [histFilterAu, setHistFilterAu] = useState('');
  const [exportingHistXls, setExportingHistXls] = useState(false);
  const [selectedHistIds, setSelectedHistIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      // Règle vente V1 (lot 1b) : seules les activités vendeuses (vente_active) ont des puces ici.
      const acts = (data as (Activite & { venteActive?: boolean })[]).filter((a) => a.venteActive !== false);
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadAll = useCallback(() => {
    if (!selectedActiviteId) return;
    Promise.all([
      api.get(`/api/activite-prestataires?activiteId=${selectedActiviteId}`),
      api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`),
      api.get(`/api/article-prix-prestataire?activiteId=${selectedActiviteId}`),
      api.get(`/api/produits?activiteId=${selectedActiviteId}&type=vendable`),
      api.get(`/api/articles-valorises?activiteId=${selectedActiviteId}`),
    ]).then(([ap, av, pp, pr, val]) => {
      setPrestataires(ap.data as ActivitePrestataire[]);
      setPrixPrestataires(pp.data as ArticlePrixPrestataire[]);
      const avData = av.data as ArticleVendable[];
      const avMap = new Map(avData.filter(a => a.article_type === 'produit').map(a => [a.article_id, a]));
      const prodData = pr.data as Produit[];
      setRows(prodData.map(p => ({ produit: p, vendable: avMap.get(p.id), categorieProduitName: p.categorieProduitName ?? null })));
      setValorises(val.data as ArticleValorise[]);
      // C1 : arrivée depuis l'activation d'un prestataire (« Copier la vente directe vers lui ») — la fenêtre s'ouvre.
      const vers = new URLSearchParams(window.location.search).get('copierVers');
      if (vers && (ap.data as ActivitePrestataire[]).some(p => p.id === vers && p.actif)) {
        setCopie({ source: CANAL_DIRECT, cible: vers, pct: '', pas: 0.01, retirer: false });
        setCopieErr('');
        setSearchParams({ activiteId: String(selectedActiviteId) }, { replace: true });
      }
    }).catch(() => {});
  }, [selectedActiviteId, setSearchParams]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Le témoin « Chargement… » est allumé par les gestes (onglet, Actualiser), pas par l'effet : pas d'état posé
  // de façon synchrone dans un effet.
  const loadHistorique = useCallback(() => {
    if (!selectedActiviteId) return;
    api.get(`/api/articles-vendables/historique-config?activiteId=${selectedActiviteId}`)
      .then(({ data }) => setHistEntries(data as HistConfigEntry[]))
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { if (activeTab === 'historique') loadHistorique(); }, [activeTab, loadHistorique]);

  const activePrests = prestatairesOk ? prestataires.filter(p => p.actif) : [];
  const produitRows = rows.filter(r => !r.produit.isSupplement);
  const supplementRows = rows.filter(r => r.produit.isSupplement);
  const valoriseRows: ProduitRow[] = valorises.map(v => ({
    // Les composés labo sont des produits (article_type='produit') → type 'produit' pour un enregistrement correct.
    produit: { id: v.id, name: v.nom, isSupplement: false, type: v.article_type === 'produit' ? 'produit' : 'ingredient' },
    vendable: v.vendable ?? undefined,
    categorieProduitId: v.categorie_produit_id,
    categorieProduitName: v.categorie_produit_nom,
  }));
  // C1 — toutes les lignes de la grille (les trois onglets), et ce que le serveur a enregistré pour chaque cellule.
  const toutesLesLignes = [...produitRows, ...supplementRows, ...valoriseRows];
  const vendableDe = new Map(toutesLesLignes.map(r => [`${typeDe(r)}:${r.produit.id}`, r.vendable]));
  const enregistreDe = (cle: string): EtatCellule => {
    const { article_type, article_id, canal } = lireCle(cle);
    return etatEnregistre(vendableDe.get(`${article_type}:${article_id}`), prixPrestataires, canal);
  };
  // Seules les cellules réellement changées partent au serveur (une saisie ramenée à l'enregistré ne compte pas).
  const cellules = Object.entries(edits)
    .map(([cle, ed]) => celluleAEnvoyer(cle, enregistreDe(cle), ed))
    .filter((c): c is CelluleEnvoyee => c !== null);
  const dirtyCount = cellules.length;

  const modifierPrix = (cle: string, enr: EtatCellule, texte: string) => {
    setSaveError('');
    setEdits(prev => ({ ...prev, [cle]: surPrix(enr, prev[cle], texte) }));
  };
  const modifierCase = (cle: string, coche: boolean) => {
    setSaveError('');
    setEdits(prev => ({ ...prev, [cle]: surCase(prev[cle], coche) }));
  };
  // « ✓ Tout » ne coche que les lignes qui ont un prix sur ce canal ; « ✕ Aucun » garde les prix.
  const cocherColonne = (lignes: ProduitRow[], canal: string, coche: boolean) => {
    setSaveError('');
    setEdits(prev => {
      const suite = { ...prev };
      for (const row of lignes) {
        const cle = cleDe(row, canal);
        const a = etatAffiche(etatEnregistre(row.vendable, prixPrestataires, canal), suite[cle]);
        if (coche ? (a.cochable && !a.enVente) : a.enVente) suite[cle] = surCase(suite[cle], coche);
      }
      return suite;
    });
  };

  // Un seul envoi, tout ou rien : le serveur refuse l'ensemble si une cellule est fausse, et dit laquelle.
  const handleSaveAll = async () => {
    if (dirtyCount === 0 || !selectedActiviteId) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.put('/api/canaux-vente', { activite_id: selectedActiviteId, cellules });
      setEdits({});
      loadAll();
    } catch (e: unknown) {
      setSaveError(apiMsg(e, 'Enregistrement impossible'));
    } finally { setSaving(false); }
  };

  // C1 — copie d'un canal vers un autre.
  const nomCanal = (canal: string) => canal === CANAL_DIRECT
    ? `🏪 ${voc.Nom('vente')} ${voc.acc('vente', 'direct', 'directe')}`
    : `🛵 ${activePrests.find(ap => ap.id === canal)?.prestataire_nom ?? voc.Nom('prestataire')}`;
  const pctCopie = copie ? (copie.pct.trim() === '' ? 0 : Number(copie.pct.replace(',', '.'))) : 0;
  const pctValide = Number.isFinite(pctCopie) && pctCopie >= MAJORATION_MIN && pctCopie <= MAJORATION_MAX;
  const apercu = copie && pctValide && copie.source !== copie.cible
    ? apercuCopie(toutesLesLignes.map(r => ({
        source: etatEnregistre(r.vendable, prixPrestataires, copie.source),
        cible: etatEnregistre(r.vendable, prixPrestataires, copie.cible),
      })), pctCopie, copie.pas, copie.retirer)
    : null;
  const ouvrirCopie = () => {
    setCopieErr('');
    setCopie({ source: CANAL_DIRECT, cible: activePrests[0]?.id ?? CANAL_DIRECT, pct: '', pas: 0.01, retirer: false });
  };
  const lancerCopie = async () => {
    if (!copie || !selectedActiviteId) return;
    if (copie.source === copie.cible) { setCopieErr('Choisissez deux canaux différents.'); return; }
    if (!pctValide) { setCopieErr(`Majoration entre ${MAJORATION_MIN} % et ${MAJORATION_MAX} %.`); return; }
    setCopieSaving(true);
    setCopieErr('');
    try {
      const { data } = await api.post('/api/canaux-vente/copier', {
        activite_id: selectedActiviteId, source: copie.source, cible: copie.cible,
        majoration_pct: pctCopie, arrondi: copie.pas, retirer_absents: copie.retirer,
      });
      const bilan = data as { copies: number; prix_remplaces: number; retires: number };
      const cible = nomCanal(copie.cible);
      setCopie(null);
      loadAll();
      alerte({
        title: 'Canal copié',
        message: `${bilan.copies} ligne${bilan.copies > 1 ? 's' : ''} sur ${cible}`
          + (bilan.prix_remplaces ? ` · ${bilan.prix_remplaces} prix remplacé${bilan.prix_remplaces > 1 ? 's' : ''}` : '')
          + (bilan.retires ? ` · ${bilan.retires} retirée${bilan.retires > 1 ? 's' : ''}` : '') + '.',
        tone: 'info',
      });
    } catch (e: unknown) {
      setCopieErr(apiMsg(e, 'Copie impossible'));
    } finally { setCopieSaving(false); }
  };

  // C2 — recette propre à un canal : une variante du produit (copie à ajuster) le remplace sur les canaux cochés, au
  // même prix. Réservé au titulaire du compte, comme la création d'un produit.
  const peutVarier = user?.role === 'client';
  const tousLesCanaux = [CANAL_DIRECT, ...activePrests.map(ap => ap.id)];
  const ouvrirVariante = (row: ProduitRow) => {
    setVarianteErr('');
    const proposes = canauxParDefaut(tousLesCanaux);
    setVariante({ row, libelle: LIBELLE_DEFAUT, canaux: proposes.length ? proposes : [CANAL_DIRECT] });
  };
  const creerVariante = async () => {
    if (!variante || !selectedActiviteId) return;
    const libelle = lireLibelle(variante.libelle);
    if (!libelle) { setVarianteErr(`Donnez un nom à la variante (${LIBELLE_MAX} caractères au plus).`); return; }
    if (variante.canaux.length === 0) { setVarianteErr('Cochez au moins un canal.'); return; }
    setVarianteSaving(true);
    setVarianteErr('');
    try {
      const { data } = await api.post(`/api/produits/${variante.row.produit.id}/variantes`, {
        activite_id: selectedActiviteId, libelle, canaux: variante.canaux,
      });
      const cree = data as { produit: { id: number; name: string }; canaux: { canal: string; prix: number | null }[] };
      const aRegler = cree.canaux.filter(c => c.prix == null).length;
      setVariante(null);
      loadAll();
      const ouvrir = await confirm({
        title: `Variante créée : ${cree.produit.name}`,
        message: `${voc.Son('recette')} est pour l'instant ${voc.acc('recette', 'identique à celui', 'identique à celle')} ${voc.du('produit')} d'origine : ouvrez la variante pour l'ajuster (quantités, emballage…).`
          + (aRegler ? ` Sur ${aRegler} ${aRegler > 1 ? 'canaux' : 'canal'}, ${voc.le('produit')} d'origine n'avait pas de prix : saisissez le prix de la variante dans la grille.` : ''),
        confirmLabel: `Ajuster ${voc.le('recette')}`,
        cancelLabel: 'Plus tard',
        tone: 'primary',
      });
      if (ouvrir) navigate(`/client/products?tab=vendable&modifier=${cree.produit.id}`);
    } catch (e: unknown) {
      setVarianteErr(apiMsg(e, 'Création impossible'));
    } finally { setVarianteSaving(false); }
  };

  const toggleSelectHist = (id: number) => {
    setSelectedHistIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDeleteHistEntry = async (id: number) => {
    const ok = await confirm({
      title: 'Supprimer cette entrée de l\'historique ?',
      message: 'Cette entrée sera définitivement retirée de l\'historique des prix.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/articles-vendables/historique/${id}`);
      loadHistorique();
    } catch (e: unknown) { alerte({ title: 'Suppression impossible', message: apiMsg(e), tone: 'danger' }); }
  };

  const handleExportHistXls = async () => {
    if (!selectedActiviteId) return;
    setExportingHistXls(true);
    try {
      const params = new URLSearchParams({ activiteId: String(selectedActiviteId) });
      if (histFilterDu) params.set('from', histFilterDu);
      if (histFilterAu) params.set('to', histFilterAu);
      if (histFilterType !== 'all') params.set('filterType', histFilterType);
      if (histFilterNom) params.set('filterNom', histFilterNom);
      if (selectedHistIds.size > 0) params.set('selectedIds', [...selectedHistIds].join(','));
      const resp = await api.get(`/api/articles-vendables/historique-config/export-excel?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'historique-config-prix.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) { alerte({ title: 'Export impossible', message: apiMsg(e), tone: 'danger' }); }
    finally { setExportingHistXls(false); }
  };

  const filteredHist = histEntries.filter(e => {
    if (histFilterNom && !(e.produit_nom ?? '').toLowerCase().includes(histFilterNom.toLowerCase())) return false;
    if (histFilterType === 'produit' && (e.is_supplement || e.article_type === 'ingredient')) return false;
    if (histFilterType === 'supplement' && !e.is_supplement) return false;
    if (histFilterType === 'valorise' && e.article_type !== 'ingredient') return false;
    if (histFilterDu && new Date(e.saved_at) < new Date(histFilterDu)) return false;
    if (histFilterAu && new Date(e.saved_at) > new Date(histFilterAu + 'T23:59:59')) return false;
    return true;
  });

  const ctxValue: CVCtxType = {
    activePrests, prixPrestataires,
    edits, modifierPrix, modifierCase, cocherColonne, ouvrirVariante, peutVarier, saveError,
    dirtyCount, handleSaveAll, saving,
    histEntries, histLoading,
    histFilterNom, histFilterType, histFilterDu, histFilterAu,
    setHistFilterNom, setHistFilterType, setHistFilterDu, setHistFilterAu,
    loadHistorique: () => { setHistLoading(true); loadHistorique(); }, filteredHist,
    handleDeleteHistEntry, handleExportHistXls, exportingHistXls,
    selectedActiviteId,
    selectedHistIds, toggleSelectHist,
  };

  // Fonction de rendu (appelée, pas montée comme un composant : un composant créé pendant le rendu perd son état).
  const tabBtn = (tab: Tab, label: string, count?: number) => (
    <button onClick={() => { setActiveTab(tab); if (tab === 'historique') setHistLoading(true); }}
      style={{
        padding: '10px 22px', background: activeTab === tab ? C : '#fff',
        color: activeTab === tab ? '#fff' : CD,
        border: activeTab === tab ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
        borderRadius: 10, cursor: 'pointer', fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.9rem',
        boxShadow: activeTab === tab ? `0 2px 10px ${C}44` : 'none', transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
      {label}
      {count != null && (
        <span style={{ background: activeTab === tab ? 'rgba(255,255,255,0.25)' : CB, color: activeTab === tab ? '#fff' : CD, borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>{count}</span>
      )}
    </button>
  );

  return (
    <CVCtx.Provider value={ctxValue}>
      <div className="page-content">
        <div style={{
          background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
          borderRadius: 18, padding: '24px 28px', marginBottom: 24,
          boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💲</div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Configuration {voc.Court('vente')} <HelpButton section="configuration-vente" variant="solid" size={18} tip="Aide" /></h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
              Choisissez ce qui se vend sur chaque canal, et à quel prix
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {prestatairesOk && <Link to="/client/ventes/prestataires" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>{voc.icon('prestataire')} {voc.Pl('prestataire')}</Link>}
            <Link to="/client/ventes/charges" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>🏗️ Charges</Link>
          </div>
        </div>

        {activites.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
            {activites.map(a => (
              <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); setEdits({}); setSaveError(''); }}
                style={{
                  padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                  border: selectedActiviteId === a.id ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
                  background: selectedActiviteId === a.id ? C : CL,
                  color: selectedActiviteId === a.id ? '#fff' : CD,
                  fontWeight: selectedActiviteId === a.id ? 700 : 400,
                }}>
                {a.nom}
              </button>
            ))}
          </div>
        )}

        {!selectedActiviteId ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>{voc.Aucun('activite')} disponible</div>
        ) : (
          <>
            {prestatairesOk && activePrests.length === 0 && activeTab !== 'historique' && (
              <div style={{ background: '#fef9c3', border: `1px solid ${CB}`, borderRadius: 10, padding: '10px 16px', fontSize: '0.83rem', color: '#854d0e', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                💡 {voc.Aucun('prestataire')} {voc.acc('prestataire', 'actif', 'active')} — les colonnes {voc.nom('prestataire')} n'apparaîtront pas.
                <Link to="/client/ventes/prestataires" style={{ color: C, fontWeight: 700, marginLeft: 4 }}>Configurer {voc.le('prestataire', true)} →</Link>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
              {tabBtn('produits', `🛍️ ${voc.Nom('vente')} ${voc.Court('produit', true)}`, produitRows.length)}
              {tabBtn('supplements', `🧂 ${voc.Pl('vente')} ${voc.Court('supplement', true)}`, supplementRows.length)}
              {tabBtn('valorises', `💎 ${voc.Pl('vente')} ${voc.acc('vente', 'Valorisés', 'Valorisées')}`, valoriseRows.length)}
              {tabBtn('historique', '📋 Historique config')}
              {/* C1 : copier un canal vers un autre (au moins deux canaux : la vente directe et un prestataire) */}
              {activePrests.length > 0 && activeTab !== 'historique' && (
                <button onClick={ouvrirCopie} disabled={dirtyCount > 0}
                  title={dirtyCount > 0 ? 'Enregistrez d\'abord vos modifications' : 'Reprendre sur un canal ce qui se vend sur un autre, avec une majoration'}
                  style={{ marginLeft: 'auto', padding: '10px 18px', borderRadius: 10, border: `1.5px solid ${CB}`, background: '#fff', color: dirtyCount > 0 ? '#9ca3af' : CD, fontWeight: 700, fontSize: '0.86rem', cursor: dirtyCount > 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  📋 Copier un canal
                </button>
              )}
            </div>

            {activeTab === 'produits' && (
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>🛍️</div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: CD }}>{voc.Pl('produit_vendable')}</div>
                    <div style={{ fontSize: '0.72rem', color: C }}>{voc.Pl('produit')} de type "Vendable" {voc.acc('produit', 'assignés', 'assignées')} à {voc.ce('activite')} — activez-les et définissez leur prix</div>
                  </div>
                </div>
                <ProduitTable tableRows={produitRows} showPortion={false} avecVariantes />
              </div>
            )}

            {activeTab === 'supplements' && (
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>🧂</div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: CD }}>{voc.Pl('supplement')} vendables</div>
                    <div style={{ fontSize: '0.72rem', color: C }}>{voc.Pl('produit')} {voc.pl('supplement')} {voc.acc('produit', 'assignés', 'assignées')} à {voc.ce('activite')} — activez-les et définissez leur prix</div>
                  </div>
                </div>
                <ProduitTable tableRows={supplementRows} showPortion={false} isSupplement avecVariantes />
              </div>
            )}

            {activeTab === 'valorises' && (
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>💎</div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: CD }}>{voc.Pl('vente')} {voc.acc('vente', 'Valorisés', 'Valorisées')}</div>
                    <div style={{ fontSize: '0.72rem', color: C }}>{voc.Pl('article')} {voc.acc('article', 'valorisés', 'valorisées')} (familles non consommables et vendables) — activez-les et définissez leur prix</div>
                  </div>
                </div>
                <ProduitTable tableRows={valoriseRows} showPortion={false} />
              </div>
            )}

            {activeTab === 'historique' && <HistoriqueTab />}
          </>
        )}

        {/* C2 — fenêtre « Recette par canal » : création d'une variante du produit */}
        {variante && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div role="dialog" aria-label="Variante par canal" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: CD }}>＋ {voc.Nom('recette')} par canal</h2>
                <button onClick={() => setVariante(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#475569', marginBottom: 14, lineHeight: 1.5 }}>
                <strong>{variante.row.produit.name}</strong> garde {voc.son('recette')}. LabFlow en crée une <strong>variante</strong> : une copie
                à ajuster (quantités, emballage…), qui le remplace sur les canaux cochés, au même prix. Son coût et sa sortie{' '}
                {voc.de('stock')} se calculent sur {voc.son('recette')} propre.
              </div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 12 }}>
                Nom de la variante
                <input type="text" value={variante.libelle} maxLength={LIBELLE_MAX} placeholder={LIBELLE_DEFAUT}
                  onChange={e => setVariante({ ...variante, libelle: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, fontSize: '0.88rem', color: CD, boxSizing: 'border-box' }} />
                <span style={{ display: 'block', marginTop: 4, fontWeight: 500, color: 'var(--text-muted)' }}>
                  Elle s'appellera « {variante.row.produit.name} — {lireLibelle(variante.libelle) ?? '…'} ».
                </span>
              </label>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 6 }}>Canaux où la variante remplace l'original</div>
              <div style={{ border: `1px solid ${CB}`, borderRadius: 10, marginBottom: 14 }}>
                {tousLesCanaux.map((canal, i) => {
                  const etat = etatEnregistre(variante.row.vendable, prixPrestataires, canal);
                  const coche = variante.canaux.includes(canal);
                  return (
                    <label key={canal} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? `1px solid ${CB}` : 'none', cursor: 'pointer', fontSize: '0.85rem', color: CD }}>
                      <input type="checkbox" checked={coche}
                        onChange={e => setVariante({ ...variante, canaux: e.target.checked ? [...variante.canaux, canal] : variante.canaux.filter(c => c !== canal) })}
                        style={{ accentColor: C, width: 16, height: 16 }} />
                      <span style={{ fontWeight: 700 }}>{nomCanal(canal)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: etat.prix != null ? C : 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {etat.prix != null ? fmtMoney(etat.prix) : 'sans prix : à saisir ensuite'}
                      </span>
                    </label>
                  );
                })}
              </div>
              {varianteErr && <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', fontWeight: 600 }}>⚠️ {varianteErr}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setVariante(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Fermer</button>
                <button onClick={creerVariante} disabled={varianteSaving}
                  style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', cursor: varianteSaving ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  {varianteSaving ? '…' : 'Créer la variante'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* C1 — fenêtre « Copier un canal » */}
        {copie && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div role="dialog" aria-label="Copier un canal" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: CD }}>📋 Copier un canal</h2>
                <button onClick={() => setCopie(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#475569', marginBottom: 14, lineHeight: 1.5 }}>
                Tout ce qui se vend sur le canal d'origine se vendra aussi sur le canal d'arrivée, au prix majoré.
                Les prix déjà saisis sur le canal d'arrivée sont remplacés. Les trois onglets sont concernés.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: CD }}>
                  Depuis
                  <select value={copie.source} onChange={e => setCopie({ ...copie, source: e.target.value })}
                    style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, fontSize: '0.85rem', color: CD, boxSizing: 'border-box' }}>
                    {[CANAL_DIRECT, ...activePrests.map(ap => ap.id)].map(c => <option key={c} value={c}>{nomCanal(c)}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: CD }}>
                  Vers
                  <select value={copie.cible} onChange={e => setCopie({ ...copie, cible: e.target.value })}
                    style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, fontSize: '0.85rem', color: CD, boxSizing: 'border-box' }}>
                    {[CANAL_DIRECT, ...activePrests.map(ap => ap.id)].map(c => <option key={c} value={c}>{nomCanal(c)}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: CD }}>
                  Majoration (%)
                  <input type="number" step="1" min={MAJORATION_MIN} max={MAJORATION_MAX} value={copie.pct} placeholder="0"
                    onChange={e => setCopie({ ...copie, pct: e.target.value })}
                    style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, fontSize: '0.85rem', color: CD, boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: CD }}>
                  Arrondi du prix
                  <select value={copie.pas} onChange={e => setCopie({ ...copie, pas: Number(e.target.value) })}
                    style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, fontSize: '0.85rem', color: CD, boxSizing: 'border-box' }}>
                    {PAS_ARRONDI.map(p => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.82rem', color: '#475569', marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={copie.retirer} onChange={e => setCopie({ ...copie, retirer: e.target.checked })}
                  style={{ accentColor: C, width: 16, height: 16, marginTop: 2 }} />
                <span>Retirer du canal d'arrivée ce que le canal d'origine ne vend pas (les prix sont gardés)</span>
              </label>
              <div style={{ background: CL, border: `1px solid ${CB}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.83rem', color: CD, fontWeight: 600 }}>
                {copie.source === copie.cible
                  ? 'Choisissez deux canaux différents.'
                  : !apercu
                    ? `Majoration entre ${MAJORATION_MIN} % et ${MAJORATION_MAX} %.`
                    : apercu.copies === 0
                      ? `Rien ne se vend encore sur ${nomCanal(copie.source)} : rien à copier.`
                      : `${apercu.copies} ligne${apercu.copies > 1 ? 's' : ''} à copier`
                        + (apercu.remplaces ? ` · ${apercu.remplaces} prix remplacé${apercu.remplaces > 1 ? 's' : ''}` : '')
                        + (apercu.retires ? ` · ${apercu.retires} retirée${apercu.retires > 1 ? 's' : ''}` : '')}
              </div>
              {copieErr && <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', fontWeight: 600 }}>⚠️ {copieErr}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setCopie(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Fermer</button>
                <button onClick={lancerCopie} disabled={copieSaving || !apercu || apercu.copies === 0}
                  style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: !apercu || apercu.copies === 0 ? '#e5e7eb' : `linear-gradient(135deg, ${CD}, ${C})`, color: !apercu || apercu.copies === 0 ? '#9ca3af' : '#fff', cursor: copieSaving || !apercu || apercu.copies === 0 ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  {copieSaving ? '…' : '📋 Copier'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CVCtx.Provider>
  );
}
