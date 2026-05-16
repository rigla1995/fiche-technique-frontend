import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface TransferRecord {
  id: number;
  quantite: number;
  dateTransfert: string;
  activiteId: number;
  activiteNom: string;
  note: string | null;
}

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const todayStr = () => new Date().toISOString().split('T')[0];

const qtyColor = (q: number | null) => {
  if (q === null || q === 0) return 'var(--danger, #ef4444)';
  if (q < 5) return 'var(--warning, #f59e0b)';
  return 'var(--success, #10b981)';
};

interface LaboStockRow {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  quantite: number | null;
  prixUnitaire: number | null;
  isPT?: boolean;
  activiteId?: number | null;
  recentTransferDates?: string[];
}

interface Activite {
  id: number;
  nom: string;
}

type TransferQtys = Record<number, Record<number, string>>;

export default function TransferPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [labo, setLabo] = useState<{ nom: string; activites: Activite[] } | null>(null);
  const [stock, setStock] = useState<LaboStockRow[]>([]);
  const [assignedSet, setAssignedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasTransfers, setHasTransfers] = useState(false);

  const [note, setNote] = useState('');
  const [refFacture, setRefFacture] = useState('');
  const [qtys, setQtys] = useState<TransferQtys>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [transferDate, setTransferDate] = useState(todayStr());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [transferConfirm, setTransferConfirm] = useState<{
    ingredientId: number; nom: string; date: string; existingTotal: number; newQty: number;
  } | null>(null);

  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [filterIngredientId, setFilterIngredientId] = useState<number | ''>('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  const [openTransfers, setOpenTransfers] = useState<Set<number>>(new Set());
  const [transferHistory, setTransferHistory] = useState<Record<number, TransferRecord[]>>({});
  const [historyLoaded, setHistoryLoaded] = useState<Set<number>>(new Set());
  const [transferLoading, setTransferLoading] = useState<Set<number>>(new Set());
  const [prixUnitaireMap, setPrixUnitaireMap] = useState<Record<number, string>>({});
  const [tauxTva, setTauxTva] = useState('');

  const toggleTransfers = async (ingredientId: number) => {
    if (openTransfers.has(ingredientId)) {
      setOpenTransfers((prev) => { const n = new Set(prev); n.delete(ingredientId); return n; });
      return;
    }
    setOpenTransfers((prev) => new Set([...prev, ingredientId]));
    if (historyLoaded.has(ingredientId)) return;
    setTransferLoading((prev) => new Set([...prev, ingredientId]));
    try {
      const { data } = await api.get(`/api/labo/${laboId}/transfers?ingredientId=${ingredientId}&limit=5`);
      setTransferHistory((prev) => ({ ...prev, [ingredientId]: data }));
      setHistoryLoaded((prev) => new Set([...prev, ingredientId]));
    } catch { /* ignore */ }
    setTransferLoading((prev) => { const n = new Set(prev); n.delete(ingredientId); return n; });
  };

  const load = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    try {
      const [laboRes, stockRes, assignRes, transfersRes] = await Promise.all([
        api.get(`/api/labo/${laboId}`),
        api.get(`/api/labo/${laboId}/stock?assignedOnly=true`),
        api.get(`/api/labo/${laboId}/activity-assignments`),
        api.get(`/api/labo/${laboId}/transfers`),
      ]);
      setLabo(laboRes.data);
      setStock(stockRes.data);
      setHasTransfers(Array.isArray(transfersRes.data) && transfersRes.data.length > 0);
      const assigned = new Set<string>();
      for (const ing of (assignRes.data.ingredients || []) as { ingredientId: number; activities: { activiteId: number; assigned: boolean }[] }[]) {
        for (const act of ing.activities) {
          if (act.assigned) assigned.add(`${ing.ingredientId}-${act.activiteId}`);
        }
      }
      setAssignedSet(assigned);
      const init: TransferQtys = {};
      for (const r of stockRes.data as LaboStockRow[]) {
        init[r.ingredientId] = {};
        for (const act of (laboRes.data.activites || []) as Activite[]) {
          init[r.ingredientId][act.id] = '';
        }
      }
      setQtys(init);

      // Pre-load all transfer histories in parallel so alarm works on first render
      const histResults = await Promise.allSettled(
        (stockRes.data as LaboStockRow[]).map(async (r) => {
          const { data } = await api.get(`/api/labo/${laboId}/transfers?ingredientId=${r.ingredientId}&limit=5`);
          return [r.ingredientId, data] as [number, TransferRecord[]];
        })
      );
      const fullHistory: Record<number, TransferRecord[]> = {};
      const loadedIds = new Set<number>();
      for (const result of histResults) {
        if (result.status === 'fulfilled') {
          const [id, data] = result.value;
          fullHistory[id] = Array.isArray(data) ? data : [];
          loadedIds.add(id);
        }
      }
      setTransferHistory(fullHistory);
      setHistoryLoaded(loadedIds);
    } catch { /* ignore */ }
    setLoading(false);
  }, [laboId]);

  useEffect(() => { load(); }, [load]);

  const setQty = (ingredientId: number, activiteId: number, value: string) => {
    setQtys((prev) => ({
      ...prev,
      [ingredientId]: { ...prev[ingredientId], [activiteId]: value },
    }));
  };

  const getTransferDates = (ingredientId: number): Set<string> => {
    const histDates = (transferHistory[ingredientId] || []).map((h) => h.dateTransfert);
    const row = stock.find((r) => r.ingredientId === ingredientId);
    const recentDates = row?.recentTransferDates || [];
    return new Set([...histDates, ...recentDates]);
  };

  const handleBulkTransfer = async (confirmed = false) => {
    setErrorMsg('');
    if (!refFacture.trim()) { setErrorMsg('Le N° de BL (Réf. Facture) est obligatoire.'); return; }

    // Gather all non-zero transfers per ingredient
    const ingredientBatches: Array<{
      ingredientId: number;
      nom: string;
      transfers: Array<{ activiteId: number; ingredientId: number; quantite: number; prixUnitaire: number }>;
      dateTransfert: string;
      quantite: number | null;
    }> = [];

    for (const row of stock) {
      const activiteMap = qtys[row.ingredientId] || {};
      const transfers = Object.entries(activiteMap)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([actId, v]) => ({ activiteId: Number(actId), ingredientId: row.ingredientId, quantite: parseFloat(v), prixUnitaire: 0 }));
      if (transfers.length === 0) continue;

      const prixStr = prixUnitaireMap[row.ingredientId]?.trim();
      if (!prixStr || parseFloat(prixStr) <= 0) {
        setErrorMsg(`Prix unitaire obligatoire pour "${row.nom}".`);
        return;
      }
      const prixUnit = parseFloat(prixStr);
      for (const tr of transfers) tr.prixUnitaire = prixUnit;

      if (row.quantite !== null) {
        const total = transfers.reduce((s, tr) => s + tr.quantite, 0);
        if (total > row.quantite) {
          setErrorMsg(t('client.labo.transfer_overstock', { nom: row.nom, disponible: row.quantite }));
          return;
        }
      }

      ingredientBatches.push({
        ingredientId: row.ingredientId,
        nom: row.nom,
        transfers,
        dateTransfert: transferDate,
        quantite: row.quantite,
      });
    }

    if (ingredientBatches.length === 0) {
      setErrorMsg('Veuillez saisir au moins une quantité à transférer.');
      return;
    }

    if (!confirmed) {
      for (const batch of ingredientBatches) {
        const tDates = getTransferDates(batch.ingredientId);
        if (tDates.has(batch.dateTransfert)) {
          let history = transferHistory[batch.ingredientId];
          if (!historyLoaded.has(batch.ingredientId)) {
            try {
              const { data } = await api.get(`/api/labo/${laboId}/transfers?ingredientId=${batch.ingredientId}&limit=50`);
              setTransferHistory((prev) => ({ ...prev, [batch.ingredientId]: data }));
              setHistoryLoaded((prev) => new Set([...prev, batch.ingredientId]));
              history = data;
            } catch { history = []; }
          }
          const existingTotal = (history || [])
            .filter((h) => h.dateTransfert === batch.dateTransfert)
            .reduce((s, h) => s + h.quantite, 0);
          const newQty = batch.transfers.reduce((s, tr) => s + tr.quantite, 0);
          setTransferConfirm({ ingredientId: batch.ingredientId, nom: batch.nom, date: batch.dateTransfert, existingTotal, newQty });
          return;
        }
      }
    }

    setBulkSaving(true);
    try {
      for (const batch of ingredientBatches) {
        await api.post(`/api/labo/${laboId}/transfer`, {
          dateTransfert: batch.dateTransfert,
          note: note || undefined,
          refFacture: refFacture.trim(),
          tauxTva: tauxTva.trim() ? parseFloat(tauxTva) : null,
          transfers: batch.transfers,
        });
        setQtys((prev) => ({
          ...prev,
          [batch.ingredientId]: Object.fromEntries(Object.keys(prev[batch.ingredientId] || {}).map((a) => [a, ''])),
        }));
        setPrixUnitaireMap((prev) => ({ ...prev, [batch.ingredientId]: '' }));
      }
      setHasTransfers(true);
      // Refresh transfer histories
      try {
        const histUpdates = await Promise.allSettled(
          ingredientBatches.map(async (b) => {
            const { data } = await api.get(`/api/labo/${laboId}/transfers?ingredientId=${b.ingredientId}&limit=5`);
            return [b.ingredientId, data] as [number, TransferRecord[]];
          })
        );
        setTransferHistory((prev) => {
          const next = { ...prev };
          for (const r of histUpdates) {
            if (r.status === 'fulfilled') next[r.value[0]] = r.value[1];
          }
          return next;
        });
        setHistoryLoaded((prev) => {
          const n = new Set(prev);
          for (const r of histUpdates) if (r.status === 'fulfilled') n.add(r.value[0]);
          return n;
        });
      } catch { /* ignore */ }
      // Reload stock
      const { data } = await api.get(`/api/labo/${laboId}/stock?assignedOnly=true`);
      setStock(data);
      setSuccessMsg(t('client.labo.transfer_success'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg || t('common.error'));
    }
    setBulkSaving(false);
  };

  const activites: Activite[] = labo?.activites || [];

  const bulkCount = stock.filter((r) => {
    const map = qtys[r.ingredientId] || {};
    return Object.values(map).some((v) => parseFloat(v) > 0);
  }).length;

  const allCategories = Array.from(new Set(stock.map((r) => r.categorie))).sort();
  const ingredientsInCategory = filterCategorie ? stock.filter((r) => r.categorie === filterCategorie) : stock;
  const filtered = stock.filter((r) => {
    const catOk = !filterCategorie || r.categorie === filterCategorie;
    const ingOk = !filterIngredientId || r.ingredientId === filterIngredientId;
    const nomOk = !filterNom || r.nom.toLowerCase().includes(filterNom.toLowerCase());
    return catOk && ingOk && nomOk;
  });
  const groups: Record<string, LaboStockRow[]> = {};
  for (const r of filtered) {
    if (!groups[r.categorie]) groups[r.categorie] = [];
    groups[r.categorie].push(r);
  }

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page">
      {/* Confirmation popup — date conflict warning */}
      {transferConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,15,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setTransferConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 0, maxWidth: 440, width: '92%', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}>
            {/* Header band */}
            <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 12, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>⚠️</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Transfert déjà existant</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)' }}>{transferConfirm.nom} · {fmtDate(transferConfirm.date)}</div>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: '#fef9ec', border: '1.5px solid #fde68a', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Existant</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>{transferConfirm.existingTotal.toFixed(3)}</div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>À ajouter</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>+{transferConfirm.newQty.toFixed(3)}</div>
                </div>
                <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#4c1d95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>{(transferConfirm.existingTotal + transferConfirm.newQty).toFixed(3)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" style={{ fontWeight: 600 }} onClick={() => setTransferConfirm(null)}>Annuler</button>
                <button style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.92rem' }}
                  onClick={() => { setTransferConfirm(null); handleBulkTransfer(true); }}>
                  ✓ Confirmer le transfert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(126,34,206,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🔄</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              {labo ? labo.nom : t('common.loading')} — {t('client.labo.transfer_title')}
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/client/labo/stock?laboId=${laboId}`} className="btn btn-ghost btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(4px)' }}>
            ← {t('client.labo.stock_title')}
          </Link>
          {hasTransfers ? (
            <Link to={`/client/labo/historique-transferts?laboId=${laboId}`}
              style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              📋 {t('client.labo.transfers_history')}
            </Link>
          ) : (
            <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: '0.85rem', cursor: 'not-allowed', pointerEvents: 'none' }}>
              📋 {t('client.labo.transfers_history')}
            </span>
          )}
        </div>
      </div>

      {successMsg && <div style={{ background: 'var(--success, #10b981)', color: '#fff', borderRadius: 10, padding: '10px 18px', marginBottom: 16, fontWeight: 600 }}>✓ {successMsg}</div>}
      {errorMsg && <div style={{ background: 'var(--danger, #ef4444)', color: '#fff', borderRadius: 10, padding: '10px 18px', marginBottom: 16, fontWeight: 600 }}>{errorMsg}</div>}

      {!loading && stock.length > 0 && activites.length > 0 && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 20,
          border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
          display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
        }}>
          <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce' }}>Filtres</span>
            {(filterCategorie || filterIngredientId !== '' || filterNom) && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setFilterCategorie(''); setFilterIngredientId(''); setFilterNom(''); }}>✕ Réinitialiser</button>
            )}
          </div>
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ Catégorie</label>
            <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #7e22ce', fontSize: '0.88rem', background: '#faf5ff', minWidth: 160 }} value={filterCategorie} onChange={(e) => { setFilterCategorie(e.target.value); setFilterIngredientId(''); }}>
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧂 Ingrédient</label>
            <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={filterIngredientId} disabled={!filterCategorie}
              onChange={(e) => setFilterIngredientId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— Tous —</option>
              {ingredientsInCategory.map((r) => <option key={r.ingredientId} value={r.ingredientId}>{r.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Nom</label>
            <input type="text" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} placeholder="Rechercher…"
              value={filterNom} onChange={(e) => setFilterNom(e.target.value)} />
          </div>
        </div>
      )}

      {/* Confirmation block — Réf, Remarque + global Transférer button */}
      {!loading && stock.length > 0 && activites.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', borderRadius: 14, padding: '20px 24px', border: '1.5px solid #d8b4fe', boxShadow: '0 4px 20px rgba(126,34,206,0.12)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7e22ce' }}>Transfert (TVA)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 20px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce', display: 'block', marginBottom: 4 }}>
                Réf. Facture / BL <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>
              </label>
              <input type="text" className="input" value={refFacture}
                style={{ border: '1.5px solid #7e22ce', background: '#fff', fontWeight: 600 }}
                onChange={(e) => { setRefFacture(e.target.value); if (errorMsg) setErrorMsg(''); }}
                placeholder="N° bon de livraison…" />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Date de transfert <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>
              </label>
              <input type="date" className="input"
                style={{ border: '1.5px solid #a855f7', background: '#fff', fontWeight: 600 }}
                min={yearStart} max={yearEnd}
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Taux TVA %
              </label>
              <input type="number" min="0" step="0.01" className="input" value={tauxTva} onChange={(e) => setTauxTva(e.target.value)} placeholder="ex: 19" />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {t('client.labo.transfer_note')}
              </label>
              <input type="text" className="input" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={t('client.labo.transfer_note_placeholder')} />
            </div>
            <div>
              <button
                onClick={() => handleBulkTransfer()}
                disabled={bulkCount === 0 || bulkSaving}
                style={{
                  width: '100%',
                  background: bulkCount > 0 && !bulkSaving
                    ? 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)'
                    : 'var(--border)',
                  boxShadow: bulkCount > 0 && !bulkSaving ? '0 6px 20px rgba(126,34,206,0.4)' : 'none',
                  borderRadius: 12, border: 'none', color: '#fff', fontWeight: 800,
                  padding: '13px 20px', cursor: bulkCount > 0 && !bulkSaving ? 'pointer' : 'not-allowed',
                  fontSize: '0.95rem', transition: 'all 0.2s',
                  opacity: bulkCount === 0 || bulkSaving ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {bulkSaving ? '…' : '↗ Transférer'}
                {bulkCount > 0 && !bulkSaving && (
                  <span style={{ background: 'rgba(255,255,255,0.22)', borderRadius: 7, padding: '2px 8px', fontSize: '0.82rem', fontWeight: 700 }}>
                    {bulkCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : stock.length === 0 ? (
        <div style={{
          background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)',
          border: '1.5px solid #d8b4fe', borderRadius: 18, padding: '48px 32px',
          textAlign: 'center', boxShadow: '0 4px 24px rgba(126,34,206,0.08)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏭</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7e22ce', marginBottom: 8 }}>
            Aucun ingrédient disponible pour le transfert
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Les activités assignées à ce labo ne sont pas encore configurées.
            Pour pouvoir effectuer des transferts, accédez au <strong>Catalogue Global</strong> et
            assignez des ingrédients aux activités liées à ce labo.
          </div>
          <Link to="/client/catalogue-global"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #7e22ce, #a855f7)',
              color: '#fff', borderRadius: 10, padding: '11px 24px',
              fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(126,34,206,0.35)',
            }}>
            🌐 Aller au Catalogue Global →
          </Link>
        </div>
      ) : activites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏪</div>
          <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>{t('client.labo.no_activites')}</p>
        </div>
      ) : (
        <>
          {Object.keys(groups).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
              <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>{t('common.no_result')}</p>
            </div>
          ) : Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, rows]) => {
            const isOpen = openCats.has(cat);
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <button onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid var(--border)', marginBottom: isOpen ? 10 : 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({rows.length})</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                </button>
                {isOpen && (
                  <div className="table-responsive card" style={{ marginBottom: 0 }}>
                    <table className="table">
                      <thead>
                        <tr style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)' }}>
                          <th style={{ minWidth: 140, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{t('client.stock.ingredient')}</th>
                          <th style={{ textAlign: 'right', minWidth: 100, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{t('client.labo.labo_stock')}</th>
                          <th style={{ textAlign: 'right', minWidth: 110, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', color: '#fde68a', background: 'transparent', borderBottom: 'none' }}>Prix U. <span style={{ color: '#ef4444' }}>*</span></th>
                          {activites.map((act) => (
                            <th key={act.id} style={{ textAlign: 'center', minWidth: 120, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', color: '#e9d5ff', background: 'transparent', borderBottom: 'none' }}>↗ {act.nom}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const isTransferOpen = openTransfers.has(r.ingredientId);
                          const isTransferLoading = transferLoading.has(r.ingredientId);
                          const rowTransfers = transferHistory[r.ingredientId] ?? [];
                          const stockEmpty = r.quantite === null || r.quantite === 0;
                          const dateConflict = getTransferDates(r.ingredientId).has(transferDate);
                          return (
                            <React.Fragment key={r.ingredientId}>
                              <tr style={dateConflict ? { borderLeft: '3px solid #f59e0b' } : {}}>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ fontWeight: 600 }}>{r.nom}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.unite}</div>
                                  <button className="btn btn-ghost btn-sm" onClick={() => toggleTransfers(r.ingredientId)}
                                    style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 4, padding: '2px 6px' }}>
                                    {isTransferOpen ? '↗▲' : '↗ historique'}
                                  </button>
                                </td>
                                <td style={{ textAlign: 'right', padding: '12px 14px' }}>
                                  <span style={{ fontWeight: 800, color: qtyColor(r.quantite), fontSize: '1rem' }}>
                                    {r.quantite !== null ? r.quantite : '—'}
                                  </span>
                                  {r.prixUnitaire !== null && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.prixUnitaire.toFixed(3)} DT</div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', padding: '12px 14px' }}>
                                  <input
                                    type="number" min="0" step="0.001" className="input"
                                    style={{ width: 90, textAlign: 'right', borderColor: (!prixUnitaireMap[r.ingredientId]?.trim() && Object.values(qtys[r.ingredientId] || {}).some((v) => parseFloat(v) > 0)) ? '#ef4444' : undefined }}
                                    value={prixUnitaireMap[r.ingredientId] ?? ''}
                                    onChange={(e) => setPrixUnitaireMap((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="0.000"
                                  />
                                </td>
                                {activites.map((act) => {
                                  const isAssigned = r.isPT
                                    ? act.id === r.activiteId
                                    : assignedSet.has(`${r.ingredientId}-${act.id}`);
                                  return (
                                    <td key={act.id} style={{ textAlign: 'center', padding: '12px 14px' }}>
                                      {!stockEmpty && isAssigned ? (
                                        <input type="number" min="0" step="0.001" className="input"
                                          style={{ width: 100, textAlign: 'right' }}
                                          value={qtys[r.ingredientId]?.[act.id] ?? ''}
                                          onChange={(e) => setQty(r.ingredientId, act.id, e.target.value)}
                                          placeholder="0" />
                                      ) : (
                                        <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700, fontSize: '1.1rem' }}>—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                              {isTransferOpen && (
                                <tr>
                                  <td colSpan={3 + activites.length} style={{ background: '#faf5ff', padding: '8px 16px', borderTop: '1px solid #e9d5ff' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                      ↗ 5 derniers transferts — {r.nom}
                                    </div>
                                    {isTransferLoading ? (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chargement…</span>
                                    ) : rowTransfers.filter(tr => tr.activiteNom).length === 0 ? (
                                      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                        <span style={{ display: 'block', fontSize: '1.4rem', marginBottom: 4 }}>📭</span>
                                        Aucun transfert enregistré
                                      </div>
                                    ) : (() => {
                                      const realTransfers = rowTransfers.filter(tr => tr.activiteNom);
                                      const actNames = Array.from(new Set(realTransfers.map((tr) => tr.activiteNom))).sort();
                                      const actTotals: Record<string, number> = {};
                                      for (const tr of realTransfers) actTotals[tr.activiteNom] = (actTotals[tr.activiteNom] ?? 0) + tr.quantite;
                                      return (
                                        <div style={{ overflowX: 'auto' }}>
                                          <table style={{ fontSize: '0.8rem', width: '100%', minWidth: 400 }}>
                                            <thead>
                                              <tr style={{ background: '#ede9fe' }}>
                                                <th style={{ textAlign: 'left', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>Date</th>
                                                {actNames.map((an) => (
                                                  <th key={an} style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>↗ {an}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              <tr style={{ fontWeight: 700, background: '#f5f3ff' }}>
                                                <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Total</td>
                                                {actNames.map((an) => (
                                                  <td key={an} style={{ textAlign: 'right', padding: '4px 8px', color: '#7c3aed' }}>
                                                    {actTotals[an]?.toFixed(3) ?? '0.000'}
                                                  </td>
                                                ))}
                                              </tr>
                                              {realTransfers.map((tr, i) => (
                                                <tr key={i} style={{ borderTop: '1px solid #f3e8ff', fontSize: '0.75rem' }}>
                                                  <td style={{ padding: '2px 8px' }}>
                                                    <span style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 7, padding: '3px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#7e22ce' }}>
                                                      {fmtDate(tr.dateTransfert)}
                                                    </span>
                                                  </td>
                                                  {actNames.map((an) => (
                                                    <td key={an} style={{ textAlign: 'right', padding: '2px 8px', color: tr.activiteNom === an ? '#7c3aed' : 'var(--text-muted)' }}>
                                                      {tr.activiteNom === an ? tr.quantite.toFixed(3) : '—'}
                                                    </td>
                                                  ))}
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
