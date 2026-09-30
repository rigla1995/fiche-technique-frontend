import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import TransferConfirmModal, { type TransferDestGroup, type TransferLine } from './TransferConfirmModal';
import ApproPreviewPanel, { type PreviewLine } from './ApproPreviewPanel';
import GuideButton from './GuideButton';
import type { Destination, Transfert } from '../../types';
import { useVocabulaire } from '../../hooks/useVocabulaire';

// Une ligne de transfert = exactement UNE destination : activité (flux historique) OU labo rattaché (lot 1b).
type TransferLineBody = { activiteId?: number; laboDestId?: number; ingredientId: number; quantite: number; prixUnitaire: number };

type TransferBatch = {
  ingredientId: number;
  nom: string;
  transfers: Array<TransferLineBody & { destKey: string }>;
  dateTransfert: string;
  quantite: number | null;
  tauxTva: number | null;
};

// Clé de destination : 'a-<activiteId>' | 'l-<laboId>' (un labo enfant et une activité peuvent partager un id).
const destKeyOf = (t: Pick<Transfert, 'activiteId' | 'laboDestId'>): string | null =>
  t.activiteId != null ? `a-${t.activiteId}` : t.laboDestId != null ? `l-${t.laboDestId}` : null;
const destNomOf = (t: Pick<Transfert, 'activiteNom' | 'destNom'>): string | null => t.destNom ?? t.activiteNom ?? null;
// Corps POST d'une ligne : la clé de destination n'est pas envoyée (le serveur attend activiteId OU laboDestId).
const toBodyLine = (tr: TransferBatch['transfers'][number]): TransferLineBody => ({
  ...(tr.activiteId != null ? { activiteId: tr.activiteId } : { laboDestId: tr.laboDestId }),
  ingredientId: tr.ingredientId, quantite: tr.quantite, prixUnitaire: tr.prixUnitaire,
});

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

type TransferRecord = Transfert;

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

// qtys[ingredientId][destKey] — la colonne est identifiée par destKey, jamais par un id numérique.
type TransferQtys = Record<number, Record<string, string>>;

// Destinations = GET /api/labo/:id.destinations ; repli sur `activites` (même rendu qu'avant le lot 1b).
const destinationsOf = (labo: { activites?: Activite[]; destinations?: Destination[] } | null): Destination[] => {
  if (!labo) return [];
  if (Array.isArray(labo.destinations)) return labo.destinations;
  return (labo.activites ?? []).map((a) => ({ destKey: `a-${a.id}`, type: 'activite' as const, id: a.id, nom: a.nom }));
};

export default function TransferPage() {
  const { t } = useTranslation();
  const voc = useVocabulaire();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const laboId = searchParams.get('laboId') || '';
  const [allLabos, setAllLabos] = useState<{ id: number; nom: string }[]>([]);

  const [labo, setLabo] = useState<{ nom: string; activites: Activite[]; destinations?: Destination[] } | null>(null);
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
    perDest: Array<{ destKey: string; destNom: string; destType: Destination['type']; existing: number; newQty: number }>;
  } | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{ groups: TransferDestGroup[]; batches: TransferBatch[] } | null>(null);

  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [filterIngredientId, setFilterIngredientId] = useState<number | ''>('');
  const [filterDestKey, setFilterDestKey] = useState('');
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
      // assignedSet : `${ingredientId}-${destKey}` — articles/PT affectés à chaque destination.
      const assigned = new Set<string>();
      type ActAssign = { ingredientId: number; activities: { activiteId: number; assigned: boolean }[] };
      for (const ing of (assignRes.data.ingredients || []) as ActAssign[]) {
        for (const act of ing.activities) {
          if (act.assigned) assigned.add(`${ing.ingredientId}-a-${act.activiteId}`);
        }
      }
      for (const pt of (assignRes.data.produits || []) as ActAssign[]) {
        for (const act of pt.activities) {
          if (act.assigned) assigned.add(`${pt.ingredientId}-a-${act.activiteId}`);
        }
      }
      // Labos rattachés (lot 1b) : articles = labo_ingredient_selections, PT = labo_pt_selections du labo enfant.
      type LaboAssign = { laboId: number; ingredients?: { ingredientId: number; assigned: boolean }[]; produits?: { ingredientId: number; assigned: boolean }[] };
      for (const lb of (assignRes.data.labos || []) as LaboAssign[]) {
        for (const ing of lb.ingredients ?? []) if (ing.assigned) assigned.add(`${ing.ingredientId}-l-${lb.laboId}`);
        for (const pt of lb.produits ?? []) if (pt.assigned) assigned.add(`${pt.ingredientId}-l-${lb.laboId}`);
      }
      setAssignedSet(assigned);
      const init: TransferQtys = {};
      for (const r of stockRes.data as LaboStockRow[]) {
        init[r.ingredientId] = {};
        for (const d of destinationsOf(laboRes.data)) {
          init[r.ingredientId][d.destKey] = '';
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

  const setQty = (ingredientId: number, destKey: string, value: string) => {
    setQtys((prev) => ({
      ...prev,
      [ingredientId]: { ...prev[ingredientId], [destKey]: value },
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
          transfers: batch.transfers.map(toBodyLine),
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
      const destMap = qtys[row.ingredientId] || {};
      const transfers: TransferBatch['transfers'] = Object.entries(destMap)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([destKey, v]) => {
          const id = Number(destKey.slice(2));
          return {
            destKey,
            ...(destKey.startsWith('l-') ? { laboDestId: id } : { activiteId: id }),
            ingredientId: row.ingredientId, quantite: parseFloat(v), prixUnitaire: 0,
          };
        });
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
        const batchDestKeys = new Set(batch.transfers.map((t) => t.destKey));
        let history = transferHistory[batch.ingredientId];
        if (!historyLoaded.has(batch.ingredientId)) {
          try {
            const { data } = await api.get(`/api/labo/${laboId}/transfers?ingredientId=${batch.ingredientId}&limit=50`);
            setTransferHistory((prev) => ({ ...prev, [batch.ingredientId]: data }));
            setHistoryLoaded((prev) => new Set([...prev, batch.ingredientId]));
            history = data;
          } catch { history = []; }
        }
        const sameDateSameDest = (history || []).filter(
          (h) => h.dateTransfert === batch.dateTransfert && batchDestKeys.has(destKeyOf(h) ?? '')
        );
        if (sameDateSameDest.length > 0) {
          const row = stock.find((r) => r.ingredientId === batch.ingredientId);
          const perDest = batch.transfers.map((tr) => {
            const existing = sameDateSameDest
              .filter((h) => destKeyOf(h) === tr.destKey)
              .reduce((s, h) => s + h.quantite, 0);
            const dest = destinations.find((d) => d.destKey === tr.destKey);
            return { destKey: tr.destKey, destNom: dest?.nom ?? tr.destKey, destType: dest?.type ?? 'activite', existing, newQty: tr.quantite };
          });
          setTransferConfirm({ ingredientId: batch.ingredientId, nom: batch.nom, unite: row?.unite ?? '', date: batch.dateTransfert, perDest });
          return;
        }
      }
    }

    // Build invoice preview modal
    const modalGroups: TransferDestGroup[] = [];
    for (const dest of destinations) {
      const lines: TransferLine[] = [];
      for (const batch of ingredientBatches) {
        for (const tr of batch.transfers) {
          if (tr.destKey === dest.destKey) {
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
        modalGroups.push({ destKey: dest.destKey, destNom: dest.nom, destType: dest.type, lines });
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

  const destinations: Destination[] = destinationsOf(labo);
  // Libellés : identiques à l'existant tant que toutes les destinations sont des activités.
  const hasLaboDest = destinations.some((d) => d.type === 'labo');
  const destLabel = (d: Destination) => (d.type === 'labo' ? `${voc.icon('labo')} ${d.nom}` : d.nom);

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
    const destOk = !filterDestKey || assignedSet.has(`${r.ingredientId}-${filterDestKey}`);
    return catOk && ingOk && nomOk && destOk;
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

  if (!laboId) return <div className="page"><p className="text-muted">{voc.Nom('labo')} introuvable.</p></div>;

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
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{voc.Nom('transfert')} déjà {voc.acc('transfert', 'existant', 'existante')} pour cette date</div>
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
                {voc.acc('transfert', 'Un', 'Une')} ou plusieurs {voc.pl('transfert')} existent déjà vers {hasLaboDest ? 'ces destinations' : voc.ce('activite', true)} à cette date. Voici le détail par {hasLaboDest ? 'destination' : voc.nom('activite')} :
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {transferConfirm.perDest.map((a) => (
                  <div key={a.destKey} style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ background: '#f8f7ff', borderBottom: '1px solid #e5e7eb', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em' }}>↗ {a.destType === 'labo' ? `${voc.icon('labo')} ` : ''}{a.destNom}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
                      <div style={{ padding: '10px 14px', textAlign: 'center', borderRight: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Déjà envoyé</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: a.existing > 0 ? '#d97706' : '#9ca3af' }}>
                          {parseFloat(a.existing.toFixed(3))} <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#9ca3af' }}>{transferConfirm.unite}</span>
                        </div>
                      </div>
                      <div style={{ padding: '10px 14px', textAlign: 'center', background: '#f0fdf4', borderRight: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{voc.Nouveau('transfert')}</div>
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
                  ✓ Confirmer {voc.le('transfert')}
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
              {labo ? labo.nom : t('common.loading')} — {t('client.labo.transfer_title')}</h1>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
            {hasLaboDest ? `Transférez ${voc.le('article', true)} ${voc.du('labo')} vers ${voc.votre('activite', true)} et ${voc.pl('labo')} ${voc.accN(['activite', 'labo'], 'rattachés', 'rattachées')}` : `Transférez ${voc.le('article', true)} ${voc.du('labo')} vers ${voc.votre('activite', true)}`}
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
              {voc.icon('labo')} {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner {voc.le('labo')}</span>
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

      {!loading && stock.length > 0 && destinations.length > 0 && (
        <HistoryFilterBar
          accent="#7e22ce" accentDark="#6d28d9"
          onReset={() => { setFilterCategorie(''); setFilterIngredientId(''); setFilterNom(''); setFilterDestKey(''); }}
          showReset={!!(filterCategorie || filterIngredientId !== '' || filterNom || filterDestKey)}
        >
          <FilterField label={hasLaboDest ? '🎯 Destination' : `${voc.icon('activite')} ${voc.Nom('activite')}`}>
            <FilterSelect value={filterDestKey} onChange={(e) => setFilterDestKey(e.target.value)}>
              <option value="">— {hasLaboDest ? 'Toutes' : voc.acc('activite', 'Tous', 'Toutes')} —</option>
              {destinations.map((d) => <option key={d.destKey} value={d.destKey}>{destLabel(d)}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="🏷️ Catégorie">
            <FilterSelect value={filterCategorie} onChange={(e) => { setFilterCategorie(e.target.value); setFilterIngredientId(''); }}>
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label={`🧂 ${voc.Nom('article')}`}>
            <FilterSelect value={filterIngredientId} disabled={!filterCategorie} onChange={(e) => setFilterIngredientId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— {voc.acc('article', 'Tous', 'Toutes')} —</option>
              {ingredientsInCategory.map((r) => <option key={r.ingredientId} value={r.ingredientId}>{r.nom}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="🔍 Nom">
            <FilterInput type="text" placeholder="Rechercher…" value={filterNom} onChange={(e) => setFilterNom(e.target.value)} />
          </FilterField>
        </HistoryFilterBar>
      )}

      {/* Confirmation block — Date, Réf + Transférer / Réinitialiser buttons */}
      {!loading && stock.length > 0 && destinations.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', borderRadius: 14, padding: '18px 20px', border: '1.5px solid #d8b4fe', boxShadow: '0 4px 20px rgba(126,34,206,0.12)', marginBottom: 24 }}>
          <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #d8b4fe' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7e22ce' }}>{voc.Nom('transfert')}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce', display: 'block', marginBottom: 3 }}>
                Date {voc.Court('transfert')} <span style={{ color: '#ef4444' }}>*</span>
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
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>{voc.icon('labo')}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7e22ce', marginBottom: 8 }}>
            {voc.Aucun('article')} disponible pour {voc.le('transfert')}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.6 }}>
            {voc.Le('activite', true)} {voc.acc('activite', 'assignés', 'assignées')} à {voc.ce('labo')} ne sont pas encore {voc.acc('activite', 'configurés', 'configurées')}.
            Pour pouvoir effectuer {voc.un('transfert', true)}, assignez {voc.un('article', true)} {voc.au('activite', true)}{' '}
            {voc.acc('activite', 'liés', 'liées')} à {voc.ce('labo')} depuis {voc.det('referentiel', 'votre')}<strong>{voc.nom('referentiel')}</strong> (fiche {voc.du('article')}).
          </div>
          <Link to="/client/referentiel/articles"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #7e22ce, #a855f7)',
              color: '#fff', borderRadius: 10, padding: '11px 24px',
              fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(126,34,206,0.35)',
            }}>
            🧂 Aller {voc.au('article', true, 'Nom')} →
          </Link>
        </div>
      ) : destinations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>{voc.icon('activite')}</div>
          <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>Aucune destination rattachée</p>
          <p style={{ fontSize: '0.82rem', margin: 0 }}>Rattachez {voc.un('activite')} ou {voc.un('labo')} à {voc.ce('labo')} (« {voc.acc('labo', 'Alimenté', 'Alimentée')} par ») depuis la page {voc.Pl('activite')}.</p>
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
                          <th style={{ minWidth: 140, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#fff', background: 'transparent', borderBottom: 'none', textAlign: 'center' }}>{voc.Nom('article')}</th>
                          <th style={{ textAlign: 'center', minWidth: 100, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{t('client.labo.labo_stock')}</th>
                          <th style={{ textAlign: 'center', minWidth: 110, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>Prix unitaire</th>
                          {destinations.map((d) => (
                            <th key={d.destKey} style={{ textAlign: 'center', minWidth: 120, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '10px 14px 4px', color: '#e9d5ff', background: 'transparent', borderBottom: 'none' }}>{destLabel(d)}</th>
                          ))}
                        </tr>
                        <tr style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)', borderBottom: '2px solid rgba(255,255,255,0.35)' }}>
                          {[
                            { sub: `Hist.${voc.Court('transfert')} · Unité` },
                            { sub: 'Disponible' },
                            { sub: 'TTC' },
                          ].map(({ sub }, i) => (
                            <th key={i} style={{ fontWeight: 400, fontSize: '0.62rem', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em', padding: '2px 14px 8px', textAlign: 'center', background: 'transparent', borderBottom: 'none' }}>
                              {sub}
                            </th>
                          ))}
                          {destinations.map((d) => (
                            <th key={d.destKey} style={{ fontWeight: 400, fontSize: '0.62rem', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em', padding: '2px 14px 8px', textAlign: 'center', background: 'transparent', borderBottom: 'none' }}>
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
                                {destinations.map((d) => {
                                  // Cellule active seulement si l'article/PT est affecté à la destination (labo enfant : sélections du labo).
                                  const isAssigned = assignedSet.has(`${r.ingredientId}-${d.destKey}`);
                                  return (
                                    <td key={d.destKey} style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                      {!stockEmpty && isAssigned ? (
                                        <input type="number" min="0" step="0.001" className="input"
                                          style={{ width: 100, textAlign: 'right', borderColor: qtyExceedsStock ? '#ef4444' : undefined, background: qtyExceedsStock ? '#fef2f2' : undefined }}
                                          value={qtys[r.ingredientId]?.[d.destKey] ?? ''}
                                          onChange={(e) => { setQty(r.ingredientId, d.destKey, e.target.value); setErrorDetail(null); setErrorMsg(''); }}
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
                                  <td colSpan={4 + destinations.length} style={{ background: '#faf5ff', padding: '8px 16px', borderTop: '1px solid #e9d5ff' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                      ↗ 5 {voc.acc('transfert', 'derniers', 'dernières')} {voc.pl('transfert')} — {r.nom}
                                    </div>
                                    {isTransferLoading ? (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chargement…</span>
                                    ) : rowTransfers.filter(tr => destNomOf(tr)).length === 0 ? (
                                      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                        <span style={{ display: 'block', fontSize: '1.4rem', marginBottom: 4 }}>📭</span>
                                        {voc.Aucun('transfert')} {voc.acc('transfert', 'enregistré', 'enregistrée')}
                                      </div>
                                    ) : (() => {
                                      // Une colonne par destination (activité ou labo enfant) — libellé = destNom (repli activiteNom).
                                      const realTransfers = rowTransfers.filter(tr => destNomOf(tr));
                                      const nomOf = (tr: TransferRecord) => (tr.destType === 'labo' ? `${voc.icon('labo')} ${destNomOf(tr)}` : (destNomOf(tr) as string));
                                      const actNames = Array.from(new Set(realTransfers.map(nomOf))).sort();
                                      const actTotals: Record<string, number> = {};
                                      for (const tr of realTransfers) actTotals[nomOf(tr)] = (actTotals[nomOf(tr)] ?? 0) + tr.quantite;
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
                                                    <td key={an} style={{ textAlign: 'right', padding: '2px 8px', color: nomOf(tr) === an ? '#7c3aed' : 'var(--text-muted)' }}>
                                                      {nomOf(tr) === an ? tr.quantite.toFixed(3) : '—'}
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
