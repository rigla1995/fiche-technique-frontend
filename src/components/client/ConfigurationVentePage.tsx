import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

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
}

interface ArticleVendable {
  id: string;
  article_type: 'produit' | 'ingredient';
  article_id: number;
  prix_vente: number;
  portion: number | null;
  actif: boolean;
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
}

interface HistEntry {
  prix_vente: number;
  saved_at: string;
}

type Tab = 'produits' | 'supplements';

export default function ConfigurationVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('produits');

  const [prestataires, setPrestataires] = useState<ActivitePrestataire[]>([]);
  const [prixPrestataires, setPrixPrestataires] = useState<ArticlePrixPrestataire[]>([]);
  const [rows, setRows] = useState<ProduitRow[]>([]);

  const [editingPrixVente, setEditingPrixVente] = useState<Record<string, string>>({});
  const [editingPrixPrest, setEditingPrixPrest] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<string, HistEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);

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
    ]).then(([ap, av, pp, pr]) => {
      setPrestataires(ap.data as ActivitePrestataire[]);
      setPrixPrestataires(pp.data as ArticlePrixPrestataire[]);

      const avData = av.data as ArticleVendable[];
      const avMap = new Map(
        avData.filter(a => a.article_type === 'produit').map(a => [a.article_id, a])
      );
      const prodData = pr.data as Produit[];
      setRows(prodData.map(p => ({ produit: p, vendable: avMap.get(p.id) })));
    }).catch(() => {});
  }, [selectedActiviteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const activePrests = prestataires.filter(p => p.actif);
  const produitRows = rows.filter(r => !r.produit.isSupplement);
  const supplementRows = rows.filter(r => r.produit.isSupplement);
  const dirtyCount = Object.keys(editingPrixVente).length + Object.keys(editingPrixPrest).length;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const hasPrixDirect = (row: ProduitRow) => {
    if (!row.vendable) return false;
    if (row.vendable.id in editingPrixVente) {
      return parseFloat(editingPrixVente[row.vendable.id] || '0') > 0;
    }
    return (row.vendable.prix_vente ?? 0) > 0;
  };

  // ── Toggle vendable ──────────────────────────────────────────────────────────

  const toggleVendable = async (row: ProduitRow) => {
    setRows(prev => prev.map(r => r.produit.id === row.produit.id ? { ...r, saving: true, error: undefined } : r));
    try {
      if (row.vendable) {
        await api.put(`/api/articles-vendables/${row.vendable.id}`, { actif: !row.vendable.actif });
      } else {
        await api.post('/api/articles-vendables', {
          activite_id: selectedActiviteId,
          article_type: 'produit',
          article_id: row.produit.id,
          prix_vente: 0,
          portion: null,
          actif: true,
        });
      }
      loadAll();
    } catch (e: unknown) {
      setRows(prev => prev.map(r => r.produit.id === row.produit.id ? { ...r, saving: false, error: apiMsg(e) } : r));
    }
  };

  // ── Save all dirty prices ────────────────────────────────────────────────────

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
          article_vendable_id: avId,
          activite_prestataire_id: apId,
          prix_vente: parseFloat(val),
        }));
      }
      await Promise.all(proms);
      setEditingPrixVente({});
      setEditingPrixPrest({});
      setHistoryCache({});
      loadAll();
    } catch {} finally { setSaving(false); }
  };

  // ── Prix history ─────────────────────────────────────────────────────────────

  const fetchHistory = async (avId: string) => {
    if (historyOpen === avId) { setHistoryOpen(null); return; }
    setHistoryOpen(avId);
    if (historyCache[avId]) return;
    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/api/articles-vendables/${avId}/historique`);
      setHistoryCache(prev => ({ ...prev, [avId]: data as HistEntry[] }));
    } catch {} finally { setHistoryLoading(false); }
  };

  // ── Prix prestataire key ─────────────────────────────────────────────────────

  const getPrixKey = (avId: string, apId: string) => `${avId}__${apId}`;

  // ── Sub-components ───────────────────────────────────────────────────────────

  const TabBtn = ({ tab, label, count }: { tab: Tab; label: string; count: number }) => (
    <button onClick={() => setActiveTab(tab)}
      style={{
        padding: '10px 22px', background: activeTab === tab ? C : '#fff',
        color: activeTab === tab ? '#fff' : CD,
        border: activeTab === tab ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
        borderRadius: 10, cursor: 'pointer', fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.9rem',
        boxShadow: activeTab === tab ? `0 2px 10px ${C}44` : 'none',
        transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
      {label}
      <span style={{ background: activeTab === tab ? 'rgba(255,255,255,0.25)' : CB, color: activeTab === tab ? '#fff' : CD, borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>{count}</span>
    </button>
  );

  const PrixInput = ({ avId, prix }: { avId: string; prix: number }) => {
    const isDirty = avId in editingPrixVente;
    const val = isDirty ? editingPrixVente[avId] : String(prix);
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <input type="number" min="0" step="0.01" value={val}
          onChange={e => setEditingPrixVente(prev => ({ ...prev, [avId]: e.target.value }))}
          style={{ width: 95, padding: '7px 30px 7px 8px', borderRadius: 8, border: `1.5px solid ${isDirty ? C : CB}`, background: isDirty ? CL : '#fafafa', fontSize: '0.88rem', fontWeight: 700, color: CD, outline: 'none' }} />
        <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
      </div>
    );
  };

  const PrestInput = ({ avId, prix, ap }: { avId: string; prix: number; ap: ActivitePrestataire }) => {
    const key = getPrixKey(avId, ap.id);
    const existing = prixPrestataires.find(p => p.article_vendable_id === avId && p.activite_prestataire_id === ap.id);
    const autoCalc = prix * (1 - ap.taux_commission / 100);
    const isDirty = key in editingPrixPrest;
    const val = isDirty ? editingPrixPrest[key] : (existing?.prix_vente != null ? String(existing.prix_vente) : '');
    return (
      <div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input type="number" min="0" step="0.01" value={val} placeholder={autoCalc.toFixed(2)}
            onChange={e => setEditingPrixPrest(prev => ({ ...prev, [key]: e.target.value }))}
            style={{ width: 90, padding: '5px 26px 5px 6px', borderRadius: 7, border: `1.5px solid ${isDirty ? C : CB}`, background: isDirty ? CL : '#fafafa', fontSize: '0.82rem', fontWeight: 700, color: CD, outline: 'none' }} />
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
        </div>
        {!isDirty && (
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 1 }}>auto : {fmtMoney(autoCalc)}</div>
        )}
      </div>
    );
  };

  const ProduitTableRow = ({ row, idx, showPortion }: { row: ProduitRow; idx: number; showPortion: boolean }) => {
    const isActive = row.vendable?.actif === true;
    const avId = row.vendable?.id;
    const histEntries = avId ? (historyCache[avId] ?? null) : null;
    const isHistOpen = avId ? historyOpen === avId : false;
    const hasPrix = hasPrixDirect(row);
    const colCount = 2 + (showPortion ? 1 : 0) + 1 + activePrests.length;
    return (
      <tr style={{ borderBottom: `1px solid ${CB}`, background: idx % 2 === 0 ? '#fff' : '#fffdf7', opacity: row.vendable && !isActive ? 0.6 : 1 }}>
        <td style={{ padding: '12px 16px', position: 'relative' }}>
          <div style={{ fontWeight: isActive ? 700 : 500, fontSize: '0.9rem', color: isActive ? CD : 'var(--text)' }}>{row.produit.name}</div>
          {avId && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={() => fetchHistory(avId)}
                style={{ fontSize: '0.62rem', color: C, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline', fontWeight: 600 }}>
                📋 historique
              </button>
              {isHistOpen && (
                <div style={{ position: 'absolute', left: 0, top: '100%', zIndex: 200, background: '#fff', border: `1.5px solid ${CB}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.14)', minWidth: 230, padding: 8 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: CD, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${CB}` }}>5 derniers prix enregistrés</div>
                  {historyLoading && !histEntries ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '4px 0' }}>Chargement…</div>
                  ) : histEntries && histEntries.length > 0 ? (
                    histEntries.map((h, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px', fontSize: '0.72rem', borderBottom: i < histEntries.length - 1 ? `1px solid ${CB}55` : 'none' }}>
                        <span style={{ color: CD, fontWeight: 700 }}>{fmtMoney(h.prix_vente)}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{new Date(h.saved_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '4px 0' }}>Aucun historique disponible</div>
                  )}
                </div>
              )}
            </div>
          )}
          {row.error && <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 2 }}>{row.error}</div>}
          {/* close overlay */}
          {isHistOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setHistoryOpen(null)} />
          )}
        </td>
        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
          <input type="checkbox" checked={isActive} disabled={row.saving}
            onChange={() => toggleVendable(row)}
            style={{ accentColor: C, width: 17, height: 17, cursor: 'pointer' }} />
        </td>
        {showPortion && (
          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: isActive ? 600 : 400, color: isActive ? CD : 'var(--text-muted)' }}>
              {row.vendable?.portion != null ? row.vendable.portion : '—'}
            </span>
          </td>
        )}
        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
          {isActive && row.vendable
            ? <PrixInput avId={row.vendable.id} prix={row.vendable.prix_vente} />
            : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>}
        </td>
        {activePrests.map(ap => (
          <td key={ap.id} style={{ padding: '8px 16px', textAlign: 'center' }}>
            {isActive && row.vendable && hasPrix
              ? <PrestInput avId={row.vendable.id} prix={row.vendable.prix_vente} ap={ap} />
              : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>}
          </td>
        ))}
      </tr>
    );
  };

  const ProduitTable = ({ tableRows, showPortion, isSupplement }: { tableRows: ProduitRow[]; showPortion: boolean; isSupplement?: boolean }) => {
    const [filterNom, setFilterNom] = useState('');
    const [filterPresta, setFilterPresta] = useState('');

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
    });

    const colCount = 2 + (showPortion ? 1 : 0) + 1 + activePrests.length;
    return (
      <div>
        {/* Filters + global save */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${CB}`, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder={articleLabel}
              value={filterNom}
              onChange={e => setFilterNom(e.target.value)}
              style={{ width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `1.5px solid ${filterNom ? C : CB}`, background: filterNom ? CL : '#fafafa', fontSize: '0.83rem', color: CD, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {activePrests.length > 0 && (
            <select
              value={filterPresta}
              onChange={e => setFilterPresta(e.target.value)}
              style={{ flex: '1 1 160px', minWidth: 130, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${filterPresta ? C : CB}`, background: filterPresta ? CL : '#fafafa', fontSize: '0.83rem', color: CD, outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Tous prestataires</option>
              {activePrests.map(ap => (
                <option key={ap.id} value={ap.id}>{ap.prestataire_nom}</option>
              ))}
            </select>
          )}
          {(filterNom || filterPresta) && (
            <button onClick={() => { setFilterNom(''); setFilterPresta(''); }}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${CB}`, background: '#fff', color: C, fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
              ✕ Réinitialiser
            </button>
          )}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {filtered.length}/{tableRows.length} article{tableRows.length > 1 ? 's' : ''}
          </div>
          <button
            onClick={handleSaveAll}
            disabled={saving || dirtyCount === 0}
            style={{
              marginLeft: 'auto', padding: '7px 18px', borderRadius: 8, border: 'none',
              background: dirtyCount > 0 ? C : '#e5e7eb', color: dirtyCount > 0 ? '#fff' : '#9ca3af',
              fontSize: '0.83rem', fontWeight: 700, cursor: dirtyCount > 0 ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              boxShadow: dirtyCount > 0 ? `0 2px 8px ${C}55` : 'none',
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
                    <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'none' }}>−{ap.taux_commission}%</div>
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
                filtered.map((row, idx) => (
                  <ProduitTableRow key={row.produit.id} row={row} idx={idx} showPortion={showPortion} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💲</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Configuration Vente</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Activez les produits vendables et configurez leurs prix de vente
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/client/ventes/prestataires" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            🛵 Prestataires
          </Link>
          <Link to="/client/ventes/charges" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            🏗️ Charges
          </Link>
        </div>
      </div>

      {/* Activité selector */}
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
          {activePrests.length === 0 && (
            <div style={{ background: '#fef9c3', border: `1px solid ${CB}`, borderRadius: 10, padding: '10px 16px', fontSize: '0.83rem', color: '#854d0e', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              💡 Aucun prestataire actif — les colonnes prestataire n'apparaîtront pas.
              <Link to="/client/ventes/prestataires" style={{ color: C, fontWeight: 700, marginLeft: 4 }}>Configurer les prestataires →</Link>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            <TabBtn tab="produits" label="🛍️ Vente Produits" count={produitRows.length} />
            <TabBtn tab="supplements" label="🧂 Ventes Suppléments" count={supplementRows.length} />
          </div>

          {/* ── Vente Produits ── */}
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

          {/* ── Ventes Suppléments ── */}
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
        </>
      )}
    </div>
  );
}
