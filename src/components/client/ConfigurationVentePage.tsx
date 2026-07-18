import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import { useConfirm } from '../common/ConfirmDialog';
import type { Activite } from '../../types';

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
}

interface ArticleVendable {
  id: string;
  article_type: 'produit' | 'ingredient';
  article_id: number;
  prix_vente: number;
  portion: number | null;
  actif: boolean;
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
  editingPrixVente: Record<string, string>;
  editingPrixPrest: Record<string, string>;
  setEditingPrixVente: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setEditingPrixPrest: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  toggleVendable: (row: ProduitRow) => void;
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

function PrixInput({ avId, savedPrix }: { avId: string; savedPrix: number }) {
  const { editingPrixVente, setEditingPrixVente } = useContext(CVCtx);
  const isDirty = avId in editingPrixVente;
  const val = isDirty ? editingPrixVente[avId] : String(savedPrix);

  const handleChange = (v: string) => {
    setEditingPrixVente(prev => ({ ...prev, [avId]: v }));
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <input type="number" min="0" step="0.01" value={val}
        onChange={e => handleChange(e.target.value)}
        style={{ width: 95, padding: '7px 30px 7px 8px', borderRadius: 8, border: `1.5px solid ${isDirty ? C : CB}`, background: isDirty ? CL : '#fafafa', fontSize: '0.88rem', fontWeight: 700, color: CD, outline: 'none' }} />
      <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
    </div>
  );
}

function PrestInput({ avId, ap }: { avId: string; ap: ActivitePrestataire }) {
  const { editingPrixPrest, setEditingPrixPrest, prixPrestataires } = useContext(CVCtx);
  const key = `${avId}__${ap.id}`;
  const existing = prixPrestataires.find(p => p.article_vendable_id === avId && p.activite_prestataire_id === ap.id);
  const isDirty = key in editingPrixPrest;
  const val = isDirty ? editingPrixPrest[key] : (existing?.prix_vente != null ? String(existing.prix_vente) : '');

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <input type="number" min="0" step="0.01" value={val} placeholder="—"
        onChange={e => setEditingPrixPrest(prev => ({ ...prev, [key]: e.target.value }))}
        style={{ width: 90, padding: '5px 26px 5px 6px', borderRadius: 7, border: `1.5px solid ${isDirty ? C : CB}`, background: isDirty ? CL : '#fafafa', fontSize: '0.82rem', fontWeight: 700, color: CD, outline: 'none' }} />
      <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
    </div>
  );
}

function ProduitTableRow({ row, idx, showPortion }: { row: ProduitRow; idx: number; showPortion: boolean }) {
  const { activePrests, editingPrixVente, toggleVendable } = useContext(CVCtx);
  const isActive = row.vendable?.actif === true;

  const hasPrixDirect = () => {
    if (!row.vendable) return false;
    if (row.vendable.id in editingPrixVente) return parseFloat(editingPrixVente[row.vendable.id] || '0') > 0;
    return (row.vendable.prix_vente ?? 0) > 0;
  };
  const hasPrix = hasPrixDirect();
  // Activation : on se base sur le prix ENREGISTRÉ (le backend refuse l'activation sans prix > 0).
  const hasSavedPrix = (row.vendable?.prix_vente ?? 0) > 0;

  return (
    <tr style={{ borderBottom: `1px solid ${CB}`, background: idx % 2 === 0 ? '#fff' : '#fffdf7', opacity: row.vendable && !isActive ? 0.6 : 1 }}>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: isActive ? 700 : 500, fontSize: '0.9rem', color: isActive ? CD : 'var(--text)' }}>{row.produit.name}</div>
        {row.error && <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 2 }}>{row.error}</div>}
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'center' }}>
        <input type="checkbox" checked={isActive}
          disabled={row.saving || (!!row.vendable && !isActive && !hasSavedPrix)}
          title={(!!row.vendable && !isActive && !hasSavedPrix) ? 'Saisissez et enregistrez un prix de vente > 0 pour activer' : undefined}
          onChange={() => toggleVendable(row)}
          style={{ accentColor: C, width: 17, height: 17, cursor: (!!row.vendable && !isActive && !hasSavedPrix) ? 'not-allowed' : 'pointer' }} />
      </td>
      {showPortion && (
        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: isActive ? 600 : 400, color: isActive ? CD : 'var(--text-muted)' }}>
            {row.vendable?.portion != null ? row.vendable.portion : '—'}
          </span>
        </td>
      )}
      <td style={{ padding: '8px 16px', textAlign: 'center' }}>
        {row.vendable
          ? <PrixInput avId={row.vendable.id} savedPrix={row.vendable.prix_vente} />
          : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>}
      </td>
      {activePrests.map(ap => (
        <td key={ap.id} style={{ padding: '8px 16px', textAlign: 'center' }}>
          {isActive && row.vendable && hasPrix
            ? <PrestInput avId={row.vendable.id} ap={ap} />
            : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>}
        </td>
      ))}
    </tr>
  );
}

function ProduitTable({ tableRows, showPortion, isSupplement }: { tableRows: ProduitRow[]; showPortion: boolean; isSupplement?: boolean }) {
  const { activePrests, prixPrestataires, dirtyCount, handleSaveAll, saving } = useContext(CVCtx);
  const [filterNom, setFilterNom] = useState('');
  const [filterPresta, setFilterPresta] = useState('');
  const [page, setPage] = useState(1);

  const articleLabel = isSupplement ? 'Nom supplément…' : 'Nom produit…';

  if (tableRows.length === 0) {
    const emptyIcon = isSupplement ? '🧂' : '🛍️';
    const emptyMsg = isSupplement
      ? "Tu n'as pas de suppléments pour cette activité"
      : 'Aucun produit vendable assigné à cette activité';
    const emptyHint = isSupplement ? 'suppléments vendables' : 'produits vendables';
    return (
      <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>{emptyIcon}</div>
        {emptyMsg}
        <div style={{ fontSize: '0.8rem', marginTop: 6 }}>Créez des {emptyHint} dans <strong>Espace Produit</strong></div>
      </div>
    );
  }

  const filtered = tableRows.filter(r => {
    if (filterNom && !r.produit.name.toLowerCase().includes(filterNom.toLowerCase())) return false;
    if (filterPresta) {
      const hasPrix = prixPrestataires.some(p => p.article_vendable_id === r.vendable?.id && p.activite_prestataire_id === filterPresta && p.prix_vente != null);
      if (!hasPrix) return false;
    }
    return true;
  }).sort((a, b) => {
    // Regrouper par catégorie de produit (puis par nom)
    const ca = a.categorieProduitName ?? '￿';
    const cb = b.categorieProduitName ?? '￿';
    if (ca !== cb) return ca.localeCompare(cb, 'fr');
    return a.produit.name.localeCompare(b.produit.name, 'fr');
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const colCount = 2 + (showPortion ? 1 : 0) + 1 + activePrests.length;
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
            <option value="">Tous prestataires</option>
            {activePrests.map(ap => (
              <option key={ap.id} value={ap.id}>{ap.prestataire_nom}</option>
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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: colCount * 110 }}>
          <thead>
            <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
              <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Produit</th>
              <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vendable</th>
              {showPortion && (
                <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portion</th>
              )}
              <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>🏪 Prix direct</th>
              {activePrests.map(ap => (
                <th key={ap.id} style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  🛵 {ap.prestataire_nom}
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
                  out.push(<ProduitTableRow key={row.produit.id} row={row} idx={idx} showPortion={showPortion} />);
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
          <div style={{ fontSize: '0.72rem', color: C }}>Toutes les modifications de prix enregistrées pour cette activité</div>
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
          <input type="text" placeholder="Nom produit…" value={histFilterNom}
            onChange={e => setHistFilterNom(e.target.value)}
            style={{ width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${histFilterNom ? C : CB}`, background: histFilterNom ? CL : '#fff', fontSize: '0.83rem', color: CD, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <select value={histFilterType} onChange={e => setHistFilterType(e.target.value as 'all' | 'produit' | 'supplement' | 'valorise')}
          style={{ flex: '0 0 180px', padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${histFilterType !== 'all' ? C : CB}`, background: histFilterType !== 'all' ? CL : '#fff', fontSize: '0.83rem', color: CD, outline: 'none', cursor: 'pointer' }}>
          <option value="all">Tous types</option>
          <option value="produit">Produits</option>
          <option value="supplement">Suppléments</option>
          <option value="valorise">Produits Valorisés</option>
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
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Produit</th>
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
                            {e.article_type === 'ingredient' ? '💎 Produit Valorisé' : (e.is_supplement ? '🧂 Supplément' : '🛍️ Produit')}
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
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('produits');

  const [prestataires, setPrestataires] = useState<ActivitePrestataire[]>([]);
  const [prixPrestataires, setPrixPrestataires] = useState<ArticlePrixPrestataire[]>([]);
  const [rows, setRows] = useState<ProduitRow[]>([]);
  const [valorises, setValorises] = useState<ArticleValorise[]>([]);

  const [editingPrixVente, setEditingPrixVente] = useState<Record<string, string>>({});
  const [editingPrixPrest, setEditingPrixPrest] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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
      const acts = data as Activite[];
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
    }).catch(() => {});
  }, [selectedActiviteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadHistorique = useCallback(() => {
    if (!selectedActiviteId) return;
    setHistLoading(true);
    api.get(`/api/articles-vendables/historique-config?activiteId=${selectedActiviteId}`)
      .then(({ data }) => setHistEntries(data as HistConfigEntry[]))
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { if (activeTab === 'historique') loadHistorique(); }, [activeTab, loadHistorique]);

  const activePrests = prestataires.filter(p => p.actif);
  const produitRows = rows.filter(r => !r.produit.isSupplement);
  const supplementRows = rows.filter(r => r.produit.isSupplement);
  const valoriseRows: ProduitRow[] = valorises.map(v => ({
    // Les composés labo sont des produits (article_type='produit') → type 'produit' pour un enregistrement correct.
    produit: { id: v.id, name: v.nom, isSupplement: false, type: v.article_type === 'produit' ? 'produit' : 'ingredient' },
    vendable: v.vendable ?? undefined,
    categorieProduitId: v.categorie_produit_id,
    categorieProduitName: v.categorie_produit_nom,
  }));
  const dirtyCount = Object.keys(editingPrixVente).length + Object.keys(editingPrixPrest).length;

  const toggleVendable = async (row: ProduitRow) => {
    const isIngredient = row.produit.type === 'ingredient';
    if (isIngredient) {
      setValorises(prev => prev.map(v => v.id === row.produit.id ? { ...v, vendable: v.vendable ? { ...v.vendable } : v.vendable } : v));
    } else {
      setRows(prev => prev.map(r => r.produit.id === row.produit.id ? { ...r, saving: true, error: undefined } : r));
    }
    try {
      if (row.vendable) {
        // Le backend refuse l'activation sans prix > 0 (erreur affichée si besoin).
        await api.put(`/api/articles-vendables/${row.vendable.id}`, { actif: !row.vendable.actif });
      } else {
        // 1ʳᵉ étape : ajoute au catalogue en INACTIF (prix à saisir avant d'activer).
        await api.post('/api/articles-vendables', {
          activite_id: selectedActiviteId,
          article_type: isIngredient ? 'ingredient' : 'produit',
          article_id: row.produit.id, prix_vente: 0, portion: null, actif: false,
        });
      }
      loadAll();
    } catch (e: unknown) {
      if (!isIngredient) {
        setRows(prev => prev.map(r => r.produit.id === row.produit.id ? { ...r, saving: false, error: apiMsg(e) } : r));
      }
    }
  };

  const handleSaveAll = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const proms: Promise<unknown>[] = [];
      for (const [avId, val] of Object.entries(editingPrixVente)) {
        proms.push(api.put(`/api/articles-vendables/${avId}`, { prix_vente: parseFloat(val) || 0 }));
      }
      for (const [key, val] of Object.entries(editingPrixPrest)) {
        const [avId, apId] = key.split('__');
        proms.push(api.post('/api/article-prix-prestataire', {
          article_vendable_id: avId, activite_prestataire_id: apId, prix_vente: parseFloat(val),
        }));
      }
      await Promise.all(proms);
      setEditingPrixVente({});
      setEditingPrixPrest({});
      loadAll();
    } catch {} finally { setSaving(false); }
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
    } catch (e: unknown) { alert(apiMsg(e)); }
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
    } catch (e: unknown) { alert(apiMsg(e)); }
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
    editingPrixVente, editingPrixPrest, setEditingPrixVente, setEditingPrixPrest,
    toggleVendable, dirtyCount, handleSaveAll, saving,
    histEntries, histLoading,
    histFilterNom, histFilterType, histFilterDu, histFilterAu,
    setHistFilterNom, setHistFilterType, setHistFilterDu, setHistFilterAu,
    loadHistorique, filteredHist,
    handleDeleteHistEntry, handleExportHistXls, exportingHistXls,
    selectedActiviteId,
    selectedHistIds, toggleSelectHist,
  };

  const TabBtn = ({ tab, label, count }: { tab: Tab; label: string; count?: number }) => (
    <button onClick={() => setActiveTab(tab)}
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
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Configuration Vente <HelpButton section="configuration-vente" variant="solid" size={18} tip="Aide" /></h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
              Activez les produits vendables et configurez leurs prix de vente
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/client/ventes/prestataires" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>🛵 Prestataires</Link>
            <Link to="/client/ventes/charges" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>🏗️ Charges</Link>
          </div>
        </div>

        {activites.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
            {activites.map(a => (
              <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
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
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
        ) : (
          <>
            {activePrests.length === 0 && activeTab !== 'historique' && (
              <div style={{ background: '#fef9c3', border: `1px solid ${CB}`, borderRadius: 10, padding: '10px 16px', fontSize: '0.83rem', color: '#854d0e', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                💡 Aucun prestataire actif — les colonnes prestataire n'apparaîtront pas.
                <Link to="/client/ventes/prestataires" style={{ color: C, fontWeight: 700, marginLeft: 4 }}>Configurer les prestataires →</Link>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
              <TabBtn tab="produits" label="🛍️ Vente Produits" count={produitRows.length} />
              <TabBtn tab="supplements" label="🧂 Ventes Suppléments" count={supplementRows.length} />
              <TabBtn tab="valorises" label="💎 Ventes Valorisées" count={valoriseRows.length} />
              <TabBtn tab="historique" label="📋 Historique config" />
            </div>

            {activeTab === 'produits' && (
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>🛍️</div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: CD }}>Produits vendables</div>
                    <div style={{ fontSize: '0.72rem', color: C }}>Produits de type "Vendable" assignés à cette activité — activez-les et définissez leur prix</div>
                  </div>
                </div>
                <ProduitTable tableRows={produitRows} showPortion={false} />
              </div>
            )}

            {activeTab === 'supplements' && (
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>🧂</div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: CD }}>Suppléments vendables</div>
                    <div style={{ fontSize: '0.72rem', color: C }}>Produits suppléments assignés à cette activité — activez-les et définissez leur prix</div>
                  </div>
                </div>
                <ProduitTable tableRows={supplementRows} showPortion={false} isSupplement />
              </div>
            )}

            {activeTab === 'valorises' && (
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>💎</div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: CD }}>Ventes Valorisées</div>
                    <div style={{ fontSize: '0.72rem', color: C }}>Articles valorisés (familles non consommables et vendables) — activez-les et définissez leur prix</div>
                  </div>
                </div>
                <ProduitTable tableRows={valoriseRows} showPortion={false} />
              </div>
            )}

            {activeTab === 'historique' && <HistoriqueTab />}
          </>
        )}
      </div>
    </CVCtx.Provider>
  );
}
