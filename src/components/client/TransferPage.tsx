import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import TransferConfirmModal, { type TransferActiviteGroup, type TransferLine } from './TransferConfirmModal';
import ApproPreviewPanel, { type PreviewLine } from './ApproPreviewPanel';
import GuideButton from './GuideButton';

type TransferBatch = {
  ingredientId: number;
  nom: string;
  transfers: Array<{ activiteId: number; ingredientId: number; quantite: number; prixUnitaire: number }>;
  dateTransfert: string;
  quantite: number | null;
  tauxTva: number | null;
};

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
  prixUnitaire: number | null;
  tauxTva: number | null;
  prixUnitaireTva: number | null;
  refFacture: string | null;
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
  tauxTva?: number | null;
  pmpUnitHT?: number | null;
  prixCalcule?: number | null;
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
  const navigate = useNavigate();
  const laboId = searchParams.get('laboId') || '';
  const [allLabos, setAllLabos] = useState<{ id: number; nom: string }[]>([]);

  const [labo, setLabo] = useState<{ nom: string; activites: Activite[] } | null>(null);
  const [stock, setStock] = useState<LaboStockRow[]>([]);
  const [assignedSet, setAssignedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasTransfers, setHasTransfers] = useState(false);

  const [note] = useState('');
  const [refFacture, setRefFacture] = useState('');
  const [qtys, setQtys] = useState<TransferQtys>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorDetail, setErrorDetail] = useState<{ msg: string; disponible?: number; demande?: number } | null>(null);
  const [transferDate, setTransferDate] = useState(todayStr());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [transferConfirm, setTransferConfirm] = useState<{
    ingredientId: number; nom: string; unite: string; date: string;
    perActivite: Array<{ activiteId: number; activiteNom: string; existing: number; newQty: number }>;
  } | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{ groups: TransferActiviteGroup[]; batches: TransferBatch[] } | null>(null);

  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [filterIngredientId, setFilterIngredientId] = useState<number | ''>('');
  const [filterActiviteId, setFilterActiviteId] = useState<number | ''>('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  const [openTransfers, setOpenTransfers] = useState<Set<number>>(new Set());
  const [transferHistory, setTransferHistory] = useState<Record<number, TransferRecord[]>>({});
  const [historyLoaded, setHistoryLoaded] = useState<Set<number>>(new Set());
  const [transferLoading, setTransferLoading] = useState<Set<number>>(new Set());
  const [prixUnitaireMap, setPrixUnitaireMap] = useState<Record<number, string>>({});
  const [tauxTvaMap, setTauxTvaMap] = useState<Record<number, string>>({});

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
      initPrixFromStock(stockRes.data as LaboStockRow[]);
      setHasTransfers(Array.isArray(transfersRes.data) && transfersRes.data.length > 0);
      const assigned = new Set<string>();
      for (const ing of (assignRes.data.ingredients || []) as { ingredientId: number; activities: { activiteId: number; assigned: boolean }[] }[]) {
        for (const act of ing.activities) {
          if (act.assigned) assigned.add(`${ing.ingredientId}-${act.activiteId}`);
        }
      }
      for (const pt of (assignRes.data.produits || []) as { ingredientId: number; activities: { activiteId: number; assigned: boolean }[] }[]) {
        for (const act of pt.activities) {
          if (act.assigned) assigned.add(`${pt.ingredientId}-${act.activiteId}`);
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
  useEffect(() => { api.get('/api/labo').then(({ data }) => setAllLabos(data)).catch(() => {}); }, []);

  // La colonne prix affiche/édite le TTC. Pour les PT, prixCalcule est déjà TTC (PMP TTC).
  // Pour les articles, le PMP est HT → on pré-remplit le TTC = HT × (1 + TVA). La TVA est
  // conservée (tauxTvaMap, non affichée) pour reconvertir en HT à l'envoi.
  const initPrixFromStock = (rows: LaboStockRow[]) => {
    const prix: Record<number, string> = {};
    const tva: Record<number, string> = {};
    for (const r of rows) {
      const taux = r.tauxTva != null ? r.tauxTva : 0;
      let suggestedTtc: number | null;
      if (r.isPT) {
        suggestedTtc = r.prixCalcule ?? r.prixUnitaire;
      } else {
        const ht = r.pmpUnitHT ?? r.prixUnitaire;
        suggestedTtc = ht != null ? ht * (1 + taux / 100) : null;
      }
      prix[r.ingredientId] = suggestedTtc != null ? String(Math.round(suggestedTtc * 1000) / 1000) : '';
      tva[r.ingredientId] = r.tauxTva != null ? String(r.tauxTva) : '';
    }
    setPrixUnitaireMap(prix);
    setTauxTvaMap(tva);
  };

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

  const doTransfer = async (batches: TransferBatch[]) => {
    setBulkSaving(true);
    try {
      for (const batch of batches) {
        await api.post(`/api/labo/${laboId}/transfer`, {
          dateTransfert: batch.dateTransfert,
          note: note || undefined,
          refFacture: refFacture.trim(),
          tauxTva: batch.tauxTva,
          transfers: batch.transfers,
        });
        setQtys((prev) => ({
          ...prev,
          [batch.ingredientId]: Object.fromEntries(Object.keys(prev[batch.ingredientId] || {}).map((a) => [a, ''])),
        }));
        // prix/tva will be re-initialized from refreshed stock below
      }
      setHasTransfers(true);
      try {
        const histUpdates = await Promise.allSettled(
          batches.map(async (b) => {
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
      const { data } = await api.get(`/api/labo/${laboId}/stock?assignedOnly=true`);
      setStock(data);
      initPrixFromStock(data as LaboStockRow[]);
      setSuccessMsg(t('client.labo.transfer_success'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { message?: string; disponible?: number; demande?: number } } })?.response?.data;
      if (d?.disponible !== undefined) {
        setErrorDetail({ msg: d.message || t('common.error'), disponible: d.disponible, demande: d.demande });
      } else {
        setErrorMsg(d?.message || t('common.error'));
      }
    }
    setBulkSaving(false);
  };

  const handleBulkTransfer = async (confirmed = false) => {
    setErrorMsg('');
    setErrorDetail(null);
    if (!refFacture.trim()) { setErrorMsg('Le N° de BL (Réf. Facture) est obligatoire.'); return; }

    const ingredientBatches: TransferBatch[] = [];

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
      // La saisie est en TTC → on reconvertit en HT (TTC / (1 + TVA)) pour le backend,
      // qui recompose le TTC = HT × (1 + TVA). Pour les PT (TVA absente), HT = TTC.
      const prixTtc = parseFloat(prixStr);
      const taux = tauxTvaMap[row.ingredientId]?.trim() ? parseFloat(tauxTvaMap[row.ingredientId]) : 0;
      const prixUnit = taux > 0 ? prixTtc / (1 + taux / 100) : prixTtc;
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
        tauxTva: tauxTvaMap[row.ingredientId]?.trim() ? parseFloat(tauxTvaMap[row.ingredientId]) : null,
      });
    }

    if (ingredientBatches.length === 0) {
      setErrorMsg('Veuillez saisir au moins une quantité à transférer.');
      return;
    }

    if (!confirmed) {
      for (const batch of ingredientBatches) {
        const batchActIds = new Set(batch.transfers.map((t) => t.activiteId));
        let history = transferHistory[batch.ingredientId];
        if (!historyLoaded.has(batch.ingredientId)) {
          try {
            const { data } = await api.get(`/api/labo/${laboId}/transfers?ingredientId=${batch.ingredientId}&limit=50`);
            setTransferHistory((prev) => ({ ...prev, [batch.ingredientId]: data }));
            setHistoryLoaded((prev) => new Set([...prev, batch.ingredientId]));
            history = data;
          } catch { history = []; }
        }
        const sameDateSameAct = (history || []).filter(
          (h) => h.dateTransfert === batch.dateTransfert && batchActIds.has(h.activiteId)
        );
        if (sameDateSameAct.length > 0) {
          const row = stock.find((r) => r.ingredientId === batch.ingredientId);
          const perActivite = batch.transfers.map((tr) => {
            const existing = sameDateSameAct
              .filter((h) => h.activiteId === tr.activiteId)
              .reduce((s, h) => s + h.quantite, 0);
            const actNom = activites.find((a) => a.id === tr.activiteId)?.nom ?? String(tr.activiteId);
            return { activiteId: tr.activiteId, activiteNom: actNom, existing, newQty: tr.quantite };
          });
          setTransferConfirm({ ingredientId: batch.ingredientId, nom: batch.nom, unite: row?.unite ?? '', date: batch.dateTransfert, perActivite });
          return;
        }
      }
    }

    // Build invoice preview modal
    const modalGroups: TransferActiviteGroup[] = [];
    for (const act of activites) {
      const lines: TransferLine[] = [];
      for (const batch of ingredientBatches) {
        for (const tr of batch.transfers) {
          if (tr.activiteId === act.id) {
            const row = stock.find((r) => r.ingredientId === batch.ingredientId);
            lines.push({
              ingredientId: batch.ingredientId,
              nom: batch.nom,
              unite: row?.unite ?? '',
              quantite: tr.quantite,
              prixUnitaire: tr.prixUnitaire,
              tauxTva: batch.tauxTva,
            });
          }
        }
      }
      if (lines.length > 0) {
        modalGroups.push({ activiteId: act.id, activiteNom: act.nom, lines });
      }
    }
    setInvoiceModal({ groups: modalGroups, batches: ingredientBatches });
  };

  const handleReset = () => {
    setRefFacture('');
    setTransferDate(todayStr());
    setQtys((prev) => {
      const next: TransferQtys = {};
      for (const id of Object.keys(prev)) {
        next[Number(id)] = Object.fromEntries(Object.keys(prev[Number(id)]).map((a) => [a, '']));
      }
      return next;
    });
    setPrixUnitaireMap({});
    setTauxTvaMap({});
    setErrorMsg('');
    setErrorDetail(null);
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
    const actOk = !filterActiviteId || assignedSet.has(`${r.ingredientId}-${filterActiviteId}`);
    return catOk && ingOk && nomOk && actOk;
  });
  const groups: Record<string, LaboStockRow[]> = {};
  for (const r of filtered) {
    if (!groups[r.categorie]) groups[r.categorie] = [];
    groups[r.categorie].push(r);
  }

  const previewLines: PreviewLine[] = stock.flatMap((r) => {
    const totalQty = Object.values(qtys[r.ingredientId] || {}).reduce((s, q) => s + (parseFloat(q) || 0), 0);
    if (totalQty <= 0) return [];
    if (r.isPT) {
      const prix = r.prixCalcule ?? r.prixUnitaire;
      if (!prix || prix <= 0) return [];
      return [{
        nom: r.nom,
        unite: r.unite,
        quantite: totalQty,
        prixHT: prix,
        tva: null,
        prixTTCPerUnit: prix,
        totalHT: totalQty * prix,
        totalTTC: totalQty * prix,
      }];
    }
    const prixHT = parseFloat(prixUnitaireMap[r.ingredientId] || '') || 0;
    if (prixHT <= 0) return [];
    const tva = tauxTvaMap[r.ingredientId]?.trim() ? parseFloat(tauxTvaMap[r.ingredientId]) : null;
    const prixTTCPerUnit = tva != null ? prixHT * (1 + tva / 100) : prixHT;
    return [{
      nom: r.nom,
      unite: r.unite,
      quantite: totalQty,
      prixHT,
      tva,
      prixTTCPerUnit,
      totalHT: totalQty * prixHT,
      totalTTC: totalQty * prixTTCPerUnit,
    }];
  });

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page">
      <ApproPreviewPanel lines={previewLines} />
      {/* Confirmation popup — date conflict warning, per-activité breakdown */}
      {transferConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,15,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setTransferConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 0, maxWidth: 520, width: '95%', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>⚠️</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Transfert déjà existant pour cette date</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>
                  <span style={{ fontWeight: 700 }}>{transferConfirm.nom}</span>
                  <span style={{ margin: '0 6px', opacity: 0.7 }}>·</span>
                  <span>{fmtDate(transferConfirm.date)}</span>
                </div>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: 14, marginTop: 0 }}>
                Un ou plusieurs transferts existent déjà vers ces activités à cette date. Voici le détail par activité :
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {transferConfirm.perActivite.map((a) => (
                  <div key={a.activiteId} style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ background: '#f8f7ff', borderBottom: '1px solid #e5e7eb', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em' }}>↗ {a.activiteNom}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
                      <div style={{ padding: '10px 14px', textAlign: 'center', borderRight: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Déjà envoyé</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: a.existing > 0 ? '#d97706' : '#9ca3af' }}>
                          {parseFloat(a.existing.toFixed(3))} <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#9ca3af' }}>{transferConfirm.unite}</span>
                        </div>
                      </div>
                      <div style={{ padding: '10px 14px', textAlign: 'center', background: '#f0fdf4', borderRight: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Nouveau transfert</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>
                          +{parseFloat(a.newQty.toFixed(3))} <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#6b7280' }}>{transferConfirm.unite}</span>
                        </div>
                      </div>
                      <div style={{ padding: '10px 14px', textAlign: 'center', background: '#f5f3ff' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4c1d95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Total après</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed' }}>
                          {parseFloat((a.existing + a.newQty).toFixed(3))} <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#a78bfa' }}>{transferConfirm.unite}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" style={{ fontWeight: 600 }} onClick={() => setTransferConfirm(null)}>Annuler</button>
                <button style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.92rem' }}
                  onClick={() => { setTransferConfirm(null); void handleBulkTransfer(true); }}>
                  ✓ Confirmer le transfert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice confirmation modal */}
      {invoiceModal && (
        <TransferConfirmModal
          groups={invoiceModal.groups}
          date={transferDate}
          refFacture={refFacture}
          onConfirm={() => { const b = invoiceModal.batches; setInvoiceModal(null); doTransfer(b); }}
          onCancel={() => setInvoiceModal(null)}
        />
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
            <HelpButton section="transferts" variant="solid" size={18} tip="Aide" /></h1>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
            Transférez les articles du labo vers vos activités
          </span>
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
          <GuideButton section="transferts" />
        </div>
      </div>

      {/* Labo selector row */}
      {allLabos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {allLabos.map((l) => (
            <button
              key={l.id}
              onClick={() => navigate(`/client/labo/transfer?laboId=${l.id}`)}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: laboId === String(l.id) ? '1.5px solid #7e22ce' : '1.5px solid var(--border)',
                background: laboId === String(l.id) ? '#7e22ce' : 'var(--bg)',
                color: laboId === String(l.id) ? '#fff' : 'var(--text)',
                fontWeight: laboId === String(l.id) ? 700 : 400,
              }}
            >
              🏭 {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner le labo</span>
        </div>
      )}

      {successMsg && <div style={{ background: 'var(--success, #10b981)', color: '#fff', borderRadius: 10, padding: '10px 18px', marginBottom: 16, fontWeight: 600 }}>✓ {successMsg}</div>}
      {errorMsg && <div style={{ background: 'var(--danger, #ef4444)', color: '#fff', borderRadius: 10, padding: '10px 18px', marginBottom: 16, fontWeight: 600 }}>⚠ {errorMsg}</div>}
      {errorDetail && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '0.92rem' }}>{errorDetail.msg}</span>
            <button onClick={() => setErrorDetail(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', opacity: 0.7 }}>✕</button>
          </div>
          {errorDetail.disponible !== undefined && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 16px', flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Disponible</div>
                <div style={{ fontWeight: 900, color: '#15803d', fontSize: '1.15rem' }}>{errorDetail.disponible}</div>
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 16px', flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Demandé</div>
                <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '1.15rem' }}>{errorDetail.demande}</div>
              </div>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 16px', flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Excédent</div>
                <div style={{ fontWeight: 900, color: '#ea580c', fontSize: '1.15rem' }}>+{((errorDetail.demande ?? 0) - (errorDetail.disponible ?? 0)).toFixed(3)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && stock.length > 0 && activites.length > 0 && (
        <HistoryFilterBar
          accent="#7e22ce" accentDark="#6d28d9"
          onReset={() => { setFilterCategorie(''); setFilterIngredientId(''); setFilterNom(''); setFilterActiviteId(''); }}
          showReset={!!(filterCategorie || filterIngredientId !== '' || filterNom || filterActiviteId !== '')}
        >
          <FilterField label="🏪 Activité">
            <FilterSelect value={filterActiviteId} onChange={(e) => setFilterActiviteId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— Toutes —</option>
              {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="🏷️ Catégorie">
            <FilterSelect value={filterCategorie} onChange={(e) => { setFilterCategorie(e.target.value); setFilterIngredientId(''); }}>
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="🧂 Article">
            <FilterSelect value={filterIngredientId} disabled={!filterCategorie} onChange={(e) => setFilterIngredientId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— Tous —</option>
              {ingredientsInCategory.map((r) => <option key={r.ingredientId} value={r.ingredientId}>{r.nom}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="🔍 Nom">
            <FilterInput type="text" placeholder="Rechercher…" value={filterNom} onChange={(e) => setFilterNom(e.target.value)} />
          </FilterField>
        </HistoryFilterBar>
      )}

      {/* Confirmation block — Date, Réf + Transférer / Réinitialiser buttons */}
      {!loading && stock.length > 0 && activites.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', borderRadius: 14, padding: '18px 20px', border: '1.5px solid #d8b4fe', boxShadow: '0 4px 20px rgba(126,34,206,0.12)', marginBottom: 24 }}>
          <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #d8b4fe' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7e22ce' }}>Transfert</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce', display: 'block', marginBottom: 3 }}>
                Date Transfert <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="date" className="input"
                style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #7e22ce', background: '#fff', fontWeight: 600 }}
                min={yearStart} max={yearEnd}
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce', display: 'block', marginBottom: 3 }}>
                Réf. Facture / BL <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="text" className="input" value={refFacture}
                style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #7e22ce', background: '#fff', fontWeight: 600 }}
                onChange={(e) => { setRefFacture(e.target.value); if (errorMsg) setErrorMsg(''); }}
                placeholder="N° bon de livraison…" />
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button
                onClick={() => handleBulkTransfer()}
                disabled={bulkCount === 0 || bulkSaving}
                style={{
                  background: bulkCount > 0 && !bulkSaving ? 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)' : 'var(--border)',
                  boxShadow: bulkCount > 0 && !bulkSaving ? '0 4px 14px rgba(126,34,206,0.38)' : 'none',
                  borderRadius: 9, border: 'none', color: '#fff', fontWeight: 800,
                  padding: '7px 16px', cursor: bulkCount > 0 && !bulkSaving ? 'pointer' : 'not-allowed',
                  fontSize: '0.88rem', opacity: bulkCount === 0 || bulkSaving ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {bulkSaving ? '…' : '↗ Transférer'}
                {bulkCount > 0 && !bulkSaving && (
                  <span style={{ background: 'rgba(255,255,255,0.22)', borderRadius: 6, padding: '1px 6px', fontSize: '0.78rem', fontWeight: 700 }}>
                    {bulkCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleReset}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.8rem', padding: '7px 12px', borderRadius: 9 }}>
                ↺ Réinitialiser
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
            Aucun article disponible pour le transfert
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Les activités assignées à ce labo ne sont pas encore configurées.
            Pour pouvoir effectuer des transferts, assignez des articles aux activités
            liées à ce labo depuis votre <strong>référentiel</strong> (fiche de l'article).
          </div>
          <Link to="/client/referentiel/articles"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #7e22ce, #a855f7)',
              color: '#fff', borderRadius: 10, padding: '11px 24px',
              fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(126,34,206,0.35)',
            }}>
            🧂 Aller aux Articles →
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
                        <tr style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                          <th style={{ minWidth: 140, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#fff', background: 'transparent', borderBottom: 'none', textAlign: 'center' }}>Article</th>
                          <th style={{ textAlign: 'center', minWidth: 100, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{t('client.labo.labo_stock')}</th>
                          <th style={{ textAlign: 'center', minWidth: 110, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>Prix unitaire</th>
                          {activites.map((act) => (
                            <th key={act.id} style={{ textAlign: 'center', minWidth: 120, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#e9d5ff', background: 'transparent', borderBottom: 'none' }}>{act.nom}</th>
                          ))}
                        </tr>
                        <tr style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)', borderBottom: '2px solid rgba(255,255,255,0.35)' }}>
                          {[
                            { sub: 'Hist.Transfert · Unité' },
                            { sub: 'Disponible' },
                            { sub: 'TTC' },
                          ].map(({ sub }, i) => (
                            <th key={i} style={{ fontWeight: 400, fontSize: '0.62rem', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em', padding: '2px 14px 8px', textAlign: 'center', background: 'transparent', borderBottom: 'none' }}>
                              {sub}
                            </th>
                          ))}
                          {activites.map((act) => (
                            <th key={act.id} style={{ fontWeight: 400, fontSize: '0.62rem', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em', padding: '2px 14px 8px', textAlign: 'center', background: 'transparent', borderBottom: 'none' }}>
                              Quantité
                            </th>
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
                          const totalQtyForRow = Object.values(qtys[r.ingredientId] || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                          const qtyExceedsStock = r.quantite !== null && totalQtyForRow > r.quantite;
                          return (
                            <React.Fragment key={r.ingredientId}>
                              <tr style={{ borderBottom: '1px solid #f1f5f9', ...(qtyExceedsStock ? { borderLeft: '3px solid #ef4444', background: '#fff5f5' } : dateConflict ? { borderLeft: '3px solid #f59e0b' } : {}) }}>
                                <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{r.nom}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, justifyContent: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', background: '#f5f3ff', color: '#7e22ce', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>{r.unite}</span>
                                    <button className="btn btn-ghost btn-sm" onClick={() => toggleTransfers(r.ingredientId)}
                                      style={{ fontSize: '0.7rem', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                                      {isTransferOpen ? '📋 ▲' : '📋 Historique'}
                                    </button>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                  <span style={{ fontWeight: 800, color: qtyExceedsStock ? '#ef4444' : qtyColor(r.quantite), fontSize: '1rem' }}>
                                    {r.quantite !== null ? parseFloat(r.quantite.toFixed(3)) : '—'}
                                  </span>
                                  {qtyExceedsStock && (
                                    <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 700, marginTop: 2 }}>
                                      ⚠ -{(totalQtyForRow - r.quantite!).toFixed(3)}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                  <input
                                    type="number" min="0" step="0.001" className="input"
                                    style={{ width: 90, textAlign: 'right', padding: '5px 8px', borderRadius: 7, fontSize: '0.85rem', borderColor: (!prixUnitaireMap[r.ingredientId]?.trim() && Object.values(qtys[r.ingredientId] || {}).some((v) => parseFloat(v) > 0)) ? '#ef4444' : undefined }}
                                    value={prixUnitaireMap[r.ingredientId] ?? ''}
                                    onChange={(e) => setPrixUnitaireMap((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="—"
                                  />
                                </td>
                                {activites.map((act) => {
                                  const isAssigned = assignedSet.has(`${r.ingredientId}-${act.id}`);
                                  return (
                                    <td key={act.id} style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                      {!stockEmpty && isAssigned ? (
                                        <input type="number" min="0" step="0.001" className="input"
                                          style={{ width: 100, textAlign: 'right', borderColor: qtyExceedsStock ? '#ef4444' : undefined, background: qtyExceedsStock ? '#fef2f2' : undefined }}
                                          value={qtys[r.ingredientId]?.[act.id] ?? ''}
                                          onChange={(e) => { setQty(r.ingredientId, act.id, e.target.value); setErrorDetail(null); setErrorMsg(''); }}
                                          onFocus={(e) => e.target.select()}
                                          placeholder="—" />
                                      ) : (
                                        <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700, fontSize: '1.1rem' }}>—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                              {isTransferOpen && (
                                <tr>
                                  <td colSpan={4 + activites.length} style={{ background: '#faf5ff', padding: '8px 16px', borderTop: '1px solid #e9d5ff' }}>
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
                                          <table style={{ fontSize: '0.8rem', width: '100%', minWidth: 500 }}>
                                            <thead>
                                              <tr style={{ background: '#ede9fe' }}>
                                                <th style={{ textAlign: 'left', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>Date</th>
                                                {actNames.map((an) => (
                                                  <th key={an} style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>↗ {an}</th>
                                                ))}
                                                <th style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>Prix U. TTC</th>
                                                <th style={{ textAlign: 'left', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>Réf.</th>
                                              </tr>
                                            </thead>
                                            <tbody>
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
                                                  {/* Prix de cession TTC (les PT partent en TVA 0 → TTC = prix saisi ; repli HT si ligne ancienne) */}
                                                  <td style={{ textAlign: 'right', padding: '2px 8px', color: '#059669', fontWeight: 700 }}>
                                                    {tr.prixUnitaireTva != null ? `${tr.prixUnitaireTva.toFixed(3)} DT`
                                                      : tr.prixUnitaire != null ? `${tr.prixUnitaire.toFixed(3)} DT` : '—'}
                                                  </td>
                                                  <td style={{ padding: '2px 8px', color: 'var(--text-muted)' }}>{tr.refFacture ?? '—'}</td>
                                                </tr>
                                              ))}
                                              {/* Total en pied de tableau */}
                                              <tr style={{ fontWeight: 700, background: '#f5f3ff', borderTop: '2px solid #d8b4fe' }}>
                                                <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Total</td>
                                                {actNames.map((an) => (
                                                  <td key={an} style={{ textAlign: 'right', padding: '4px 8px', color: '#7c3aed' }}>
                                                    {actTotals[an]?.toFixed(3) ?? '0.000'}
                                                  </td>
                                                ))}
                                                <td colSpan={2} />
                                              </tr>
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
      <ApproPreviewPanel lines={previewLines} />
    </div>
  );
}
