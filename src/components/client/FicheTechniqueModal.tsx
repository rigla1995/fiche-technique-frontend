import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

interface ManualPriceEntry {
  ingredientId: number;
  nom: string;
  unite: string;
  prixUnitaire: string;
}

interface ManualPriceGroup {
  label: string;
  depth: number;
  ingredients: { ingredientId: number; nom: string; unite: string }[];
}

interface RecetteIngredient {
  nom: string;
  portion: number;
  unite: string;
  categorie: string | null;
}

interface RecetteSousProduit {
  nom: string;
  portion: number;
  ingredients: RecetteIngredient[];
  sousProduits: RecetteSousProduit[];
}

interface FtContextesResponse {
  origine: string;
  limiteTransferts: boolean;
  activites: { id: number; nom: string }[];
  labos: { id: number; nom: string }[];
  recette: { ingredients: RecetteIngredient[]; sousProduits: RecetteSousProduit[] } | null;
}

interface FtContext {
  type: 'activite' | 'labo';
  id: number;
  nom: string;
}

interface CostLine {
  loading: boolean;
  cost: number | null;
}

interface CtxCheck {
  loading: boolean;
  incomplete: boolean;
  missingCount: number;
}

interface Props {
  productId: number;
  productName: string;
  hasIngredients: boolean;
  /** Repli du FT Manuel quand le produit n'a aucun contexte assigné (0 = aucun repli, contexte global). */
  fallbackActId: number;
  onClose: () => void;
}

const ctxKey = (c: FtContext) => `${c.type}:${c.id}`;
const ctxIcon = (c: FtContext) => (c.type === 'labo' ? '🏭' : '🏪');

export default function FicheTechniqueModal({ productId, productName, hasIngredients, fallbackActId, onClose }: Props) {
  const { t } = useTranslation();

  // Contextes + recette du produit
  const [ftCtx, setFtCtx] = useState<FtContextesResponse | null>(null);
  const [ftCtxLoading, setFtCtxLoading] = useState(true);

  const [mode, setMode] = useState<'stock' | 'manual' | null>(null);

  // FT Stock
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [stockPricingDp, setStockPricingDp] = useState(true);
  const [stockPricingMp, setStockPricingMp] = useState(false);
  const [costLines, setCostLines] = useState<Record<string, CostLine>>({});
  const [stockChecks, setStockChecks] = useState<Record<string, CtxCheck>>({});
  const costSeqRef = useRef(0);
  const checkSeqRef = useRef(0);

  // FT Manuel
  const [manualKey, setManualKey] = useState<string | null>(null);
  const manualSeqRef = useRef(0);
  const [manualPrices, setManualPrices] = useState<ManualPriceEntry[]>([]);
  const [manualPriceGroups, setManualPriceGroups] = useState<ManualPriceGroup[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualUpdatedAt, setManualUpdatedAt] = useState<string | null>(null);
  const [showManualPopup, setShowManualPopup] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [showZeroWarning, setShowZeroWarning] = useState(false);
  const [zeroWarningPrices, setZeroWarningPrices] = useState<ManualPriceEntry[]>([]);
  const [manualCost, setManualCost] = useState<number | null>(null);
  const [manualCostLoading, setManualCostLoading] = useState(false);
  const [costRefreshKey, setCostRefreshKey] = useState(0);

  const [generating, setGenerating] = useState(false);

  // Liste unifiée des contextes : activités (🏪) puis labos (🏭)
  const contexts = useMemo<FtContext[]>(() => {
    if (!ftCtx) return [];
    return [
      ...ftCtx.activites.map((a) => ({ type: 'activite' as const, id: a.id, nom: a.nom })),
      ...ftCtx.labos.map((l) => ({ type: 'labo' as const, id: l.id, nom: l.nom })),
    ];
  }, [ftCtx]);

  const selectedContexts = useMemo(() => contexts.filter((c) => selectedKeys.has(ctxKey(c))), [contexts, selectedKeys]);
  const methods = useMemo<('dp' | 'mp')[]>(
    () => [...(stockPricingDp ? ['dp' as const] : []), ...(stockPricingMp ? ['mp' as const] : [])],
    [stockPricingDp, stockPricingMp],
  );
  const manualCtx = useMemo(() => contexts.find((c) => ctxKey(c) === manualKey) ?? null, [contexts, manualKey]);
  // Le repli fallbackActId ne vaut QUE pour un produit sans aucun contexte
  // assigné : si des contextes existent, l'utilisateur DOIT en choisir un
  // (sinon les prix manuels partiraient dans un contexte invisible).
  const manualReady = manualCtx !== null || contexts.length === 0;

  const applyManualCtxParams = useCallback((params: URLSearchParams) => {
    if (manualCtx) params.set(manualCtx.type === 'labo' ? 'laboId' : 'activiteId', String(manualCtx.id));
    else if (contexts.length === 0 && fallbackActId > 0) params.set('activiteId', String(fallbackActId));
  }, [manualCtx, contexts.length, fallbackActId]);

  // Chargement des contextes + recette au montage
  useEffect(() => {
    let cancelled = false;
    setFtCtxLoading(true);
    api.get(`/api/products/${productId}/ft-contextes`)
      .then(({ data }) => { if (!cancelled) setFtCtx(data as FtContextesResponse); })
      .catch(() => { if (!cancelled) setFtCtx(null); })
      .finally(() => { if (!cancelled) setFtCtxLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  // Auto-sélection si un seul contexte (stock + manuel)
  useEffect(() => {
    if (contexts.length === 1) {
      const key = ctxKey(contexts[0]);
      setSelectedKeys(new Set([key]));
      setManualKey(key);
    }
  }, [contexts]);

  // FT Stock — coûts temps réel : chaque contexte sélectionné × chaque méthode cochée
  useEffect(() => {
    if (mode !== 'stock') { setCostLines({}); return; }
    const seq = ++costSeqRef.current;
    if (selectedContexts.length === 0 || methods.length === 0) { setCostLines({}); return; }
    const init: Record<string, CostLine> = {};
    for (const c of selectedContexts) for (const m of methods) init[`${ctxKey(c)}|${m}`] = { loading: true, cost: null };
    setCostLines(init);
    for (const c of selectedContexts) {
      for (const m of methods) {
        const lineKey = `${ctxKey(c)}|${m}`;
        const params = new URLSearchParams({ mode: 'stock', pricingMethod: m });
        params.set(c.type === 'labo' ? 'laboId' : 'activiteId', String(c.id));
        api.get(`/api/products/${productId}/cout?${params}`)
          .then(({ data }) => {
            if (costSeqRef.current !== seq) return;
            setCostLines((prev) => ({ ...prev, [lineKey]: { loading: false, cost: (data as { totalCost: number }).totalCost ?? null } }));
          })
          .catch(() => {
            if (costSeqRef.current !== seq) return;
            setCostLines((prev) => ({ ...prev, [lineKey]: { loading: false, cost: null } }));
          });
      }
    }
  }, [mode, selectedContexts, methods, productId]);

  // FT Stock — stock-check par contexte sélectionné (informatif, ne bloque pas la génération)
  useEffect(() => {
    if (mode !== 'stock') { setStockChecks({}); return; }
    const seq = ++checkSeqRef.current;
    if (selectedContexts.length === 0) { setStockChecks({}); return; }
    const init: Record<string, CtxCheck> = {};
    for (const c of selectedContexts) init[ctxKey(c)] = { loading: true, incomplete: false, missingCount: 0 };
    setStockChecks(init);
    for (const c of selectedContexts) {
      const key = ctxKey(c);
      const params = new URLSearchParams();
      params.set(c.type === 'labo' ? 'laboId' : 'activiteId', String(c.id));
      api.get(`/api/products/${productId}/stock-check?${params}`)
        .then(({ data }) => {
          if (checkSeqRef.current !== seq) return;
          const result = data as { complete: boolean; missing: { ingredientId: number }[] };
          setStockChecks((prev) => ({ ...prev, [key]: { loading: false, incomplete: !result.complete, missingCount: result.missing?.length ?? 0 } }));
        })
        .catch(() => {
          if (checkSeqRef.current !== seq) return;
          setStockChecks((prev) => ({ ...prev, [key]: { loading: false, incomplete: false, missingCount: 0 } }));
        });
    }
  }, [mode, selectedContexts, productId]);

  // FT Manuel — chargement des prix (au choix du mode et à chaque changement de contexte)
  useEffect(() => {
    if (mode !== 'manual' || !manualReady) return;
    loadManualPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, manualKey, manualReady]);

  // FT Manuel — coût temps réel
  useEffect(() => {
    if (mode !== 'manual' || !manualReady) { setManualCost(null); return; }
    let cancelled = false;
    setManualCostLoading(true);
    const params = new URLSearchParams({ mode: 'manual' });
    applyManualCtxParams(params);
    api.get(`/api/products/${productId}/cout?${params}`)
      .then(({ data }) => { if (!cancelled) setManualCost((data as { totalCost: number }).totalCost ?? null); })
      .catch(() => { if (!cancelled) setManualCost(null); })
      .finally(() => { if (!cancelled) setManualCostLoading(false); });
    return () => { cancelled = true; };
  }, [mode, costRefreshKey, applyManualCtxParams, productId, manualReady]);

  const loadManualPrices = async () => {
    // Anti-course : un changement de contexte pendant le chargement invalide la réponse
    const seq = ++manualSeqRef.current;
    setManualLoading(true);
    try {
      const params = new URLSearchParams();
      applyManualCtxParams(params);
      const qs = params.toString() ? `?${params}` : '';
      const { data } = await api.get(`/api/products/${productId}/manual-prices${qs}`);
      if (manualSeqRef.current !== seq) return;
      const { prices, groups, updatedAt } = data as {
        prices: { ingredientId: number; nom: string; unite: string; prixUnitaire: number | null }[];
        groups: ManualPriceGroup[];
        updatedAt: string | null;
      };
      setManualPrices(prices.map((r) => ({
        ingredientId: r.ingredientId,
        nom: r.nom,
        unite: r.unite,
        prixUnitaire: r.prixUnitaire !== null ? String(r.prixUnitaire) : '',
      })));
      setManualPriceGroups(groups || []);
      setManualUpdatedAt(updatedAt ? updatedAt.slice(0, 10) : null);
    } finally {
      if (manualSeqRef.current === seq) setManualLoading(false);
    }
  };

  const doSaveManualPrices = async () => {
    setSavingManual(true);
    try {
      const payload: { activiteId?: number; laboId?: number; prices: { ingredientId: number; prixUnitaire: number }[] } = {
        prices: manualPrices
          .filter((p) => p.prixUnitaire !== '' && !isNaN(parseFloat(p.prixUnitaire)))
          .map((p) => ({ ingredientId: p.ingredientId, prixUnitaire: parseFloat(p.prixUnitaire) })),
      };
      if (manualCtx) payload[manualCtx.type === 'labo' ? 'laboId' : 'activiteId'] = manualCtx.id;
      else if (contexts.length === 0 && fallbackActId > 0) payload.activiteId = fallbackActId;
      await api.post(`/api/products/${productId}/manual-prices`, payload);
      setShowManualPopup(false);
      setShowZeroWarning(false);
      setManualUpdatedAt(new Date().toISOString().slice(0, 10));
      setCostRefreshKey((k) => k + 1);
      await loadManualPrices();
    } finally {
      setSavingManual(false);
    }
  };

  const saveManualPrices = async () => {
    const zeros = manualPrices.filter((p) => { const v = parseFloat(p.prixUnitaire); return isNaN(v) || v <= 0; });
    if (zeros.length > 0) {
      setZeroWarningPrices(zeros.map((p) => ({ ...p })));
      setShowZeroWarning(true);
      return;
    }
    await doSaveManualPrices();
  };

  const downloadBlob = (data: BlobPart, filename: string) => {
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const generateExcel = async () => {
    if (!mode) return;
    setGenerating(true);
    try {
      if (mode === 'stock') {
        // Boucle séquentielle : 1 fichier Excel par contexte sélectionné
        const pm = stockPricingDp && stockPricingMp ? 'both' : stockPricingMp ? 'mp' : 'dp';
        for (const c of selectedContexts) {
          const params = new URLSearchParams({ mode: 'stock', pricingMethod: pm });
          params.set(c.type === 'labo' ? 'laboId' : 'activiteId', String(c.id));
          const response = await api.get(`/api/products/${productId}/export?${params}`, { responseType: 'blob' });
          downloadBlob(response.data, `FT-${c.nom}-${productName}.xlsx`);
        }
      } else {
        const params = new URLSearchParams({ mode: 'manual' });
        applyManualCtxParams(params);
        const response = await api.get(`/api/products/${productId}/export?${params}`, { responseType: 'blob' });
        downloadBlob(response.data, manualCtx ? `FT-${manualCtx.nom}-${productName}.xlsx` : `FT-${productName}.xlsx`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const allManualPricesFilled = manualPrices.length > 0 && manualPrices.every((p) => { const v = parseFloat(p.prixUnitaire); return !isNaN(v) && v > 0; });
  const canGenerateStock = mode === 'stock' && selectedContexts.length > 0 && methods.length > 0;
  const canGenerateManual = mode === 'manual' && manualReady && allManualPricesFilled;
  const canGenerate = canGenerateStock || canGenerateManual;

  const chipBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    flex: 1, minWidth: 200, padding: 16, borderRadius: 10,
    border: '2px solid', borderColor: active ? 'var(--primary)' : 'var(--border)',
    background: active ? '#eef2ff' : 'var(--bg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'all 0.15s',
    textAlign: 'left' as const,
  });

  const ctxChip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 20,
    border: '2px solid', borderColor: active ? '#4338ca' : 'var(--border)',
    background: active ? '#eef2ff' : 'var(--bg)',
    color: active ? '#4338ca' : 'var(--text)',
    fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.12s',
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
  };

  // Rendu récursif de la recette (indentation par profondeur)
  const renderRecetteLines = (ings: RecetteIngredient[], sps: RecetteSousProduit[], depth: number, path: string): React.ReactNode[] => {
    const lines: React.ReactNode[] = [];
    ings.forEach((ing, i) => {
      lines.push(
        <div key={`${path}i${i}`} style={{ padding: `2px 0 2px ${depth * 16}px`, fontSize: '0.82rem', color: '#334155' }}>
          <span style={{ fontWeight: 500 }}>{ing.nom}</span>
          <span style={{ color: '#64748b' }}> — {ing.portion} {ing.unite}</span>
        </div>
      );
    });
    sps.forEach((sp, i) => {
      lines.push(
        <div key={`${path}s${i}`} style={{ padding: `4px 0 2px ${depth * 16}px`, fontSize: '0.82rem', fontWeight: 700, color: '#4338ca' }}>
          ↳ {sp.nom} — {sp.portion}
        </div>
      );
      lines.push(...renderRecetteLines(sp.ingredients || [], sp.sousProduits || [], depth + 1, `${path}s${i}-`));
    });
    return lines;
  };

  return (
    <>
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '18px 22px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', marginBottom: 2 }}>📄 Fiche Technique</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', fontWeight: 600 }}>{productName}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>

          <div className="modal-body" style={{ padding: '20px 24px' }}>
            {/* Composition */}
            <div style={{ marginBottom: 18 }}>
              <div style={sectionLabel}>Composition</div>
              {!hasIngredients ? (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {t('client.fiche_technique.no_ingredients')}
                </div>
              ) : ftCtxLoading ? (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  ⏳ {t('common.loading')}
                </div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto', padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)' }}>
                  {renderRecetteLines(ftCtx?.recette?.ingredients || [], ftCtx?.recette?.sousProduits || [], 0, 'r-')}
                </div>
              )}
            </div>

            {/* Mode selection */}
            <div style={sectionLabel}>{t('client.fiche_technique.choose_mode')}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <div style={chipBtn(mode === 'stock', !hasIngredients)} onClick={() => { if (hasIngredients) setMode('stock'); }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: mode === 'stock' ? 'var(--primary)' : 'var(--text)' }}>
                  📦 FT Stock
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {!hasIngredients ? 'Aucun article' : 'Prix issus de vos approvisionnements'}
                </div>
              </div>
              <div style={chipBtn(mode === 'manual', !hasIngredients)} onClick={() => { if (hasIngredients) setMode('manual'); }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: mode === 'manual' ? 'var(--primary)' : 'var(--text)' }}>
                  ✏️ FT Manuel
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {!hasIngredients ? 'Aucun article' : 'Prix saisis manuellement'}
                </div>
              </div>
            </div>

            {/* FT Stock — base de prix + méthode */}
            {mode === 'stock' && (
              <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={sectionLabel}>Base de prix</div>
                {!ftCtxLoading && contexts.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '8px 12px' }}>
                    Assignez ce produit à une activité ou un labo pour générer une FT Stock
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {contexts.map((c) => {
                        const key = ctxKey(c);
                        const active = selectedKeys.has(key);
                        return (
                          <button
                            key={key}
                            style={ctxChip(active)}
                            onClick={() => setSelectedKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            })}
                          >
                            {ctxIcon(c)} {c.nom}
                          </button>
                        );
                      })}
                    </div>
                    {ftCtx?.limiteTransferts && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
                        Produit fabriqué au labo — bases labo uniquement (côté activité, approvisionnement par transfert)
                      </div>
                    )}
                    <div style={{ ...sectionLabel, marginTop: 14 }}>Méthode</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        title="DP — Dernier Prix : prix du dernier approvisionnement"
                        onClick={() => { if (!stockPricingDp || stockPricingMp) setStockPricingDp((v) => !v); }}
                        style={{ padding: '5px 12px', borderRadius: 6, border: '2px solid', borderColor: stockPricingDp ? '#2563eb' : '#d1d5db', background: stockPricingDp ? '#dbeafe' : 'transparent', color: stockPricingDp ? '#1d4ed8' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.12s' }}
                      >Dernier Prix (DP)</button>
                      <button
                        title="PMP — Prix Moyen Pondéré : moyenne pondérée de vos prix d'approvisionnement"
                        onClick={() => { if (!stockPricingMp || stockPricingDp) setStockPricingMp((v) => !v); }}
                        style={{ padding: '5px 12px', borderRadius: 6, border: '2px solid', borderColor: stockPricingMp ? '#7c3aed' : '#d1d5db', background: stockPricingMp ? '#ede9fe' : 'transparent', color: stockPricingMp ? '#6d28d9' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.12s' }}
                      >PMP — Prix Moyen Pondéré</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* FT Manuel — contexte + saisie */}
            {mode === 'manual' && (
              <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                {contexts.length > 0 && (
                  <>
                    <div style={sectionLabel}>Base de prix</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {contexts.map((c) => {
                        const key = ctxKey(c);
                        return (
                          <button key={key} style={ctxChip(manualKey === key)} onClick={() => setManualKey(key)}>
                            {ctxIcon(c)} {c.nom}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {!manualReady && (
                  <div style={{ fontSize: '0.78rem', color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>
                    Choisissez d'abord une base de prix ci-dessus.
                  </div>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.8rem', opacity: manualReady ? 1 : 0.45, cursor: manualReady ? 'pointer' : 'not-allowed' }}
                  disabled={!manualReady}
                  onClick={() => setShowManualPopup(true)}
                >
                  ✏️ {t('client.fiche_technique.edit_manual_prices')}
                </button>
                {manualUpdatedAt && (
                  <div style={{ fontSize: '0.75rem', marginTop: 6, color: 'var(--text-muted)' }}>
                    {t('client.fiche_technique.last_updated')} :{' '}
                    <span style={{ fontWeight: 700, color: '#d97706', background: '#fef3c7', borderRadius: 4, padding: '1px 6px' }}>{manualUpdatedAt}</span>
                  </div>
                )}
                {!allManualPricesFilled && manualPrices.length > 0 && !manualLoading && (
                  <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 6 }}>
                    ⚠ Saisissez tous les prix pour générer la Fiche technique
                  </div>
                )}
              </div>
            )}

            {/* Cost + Generate */}
            {mode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>💰</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                      {t('client.products.real_time_cost')}
                    </div>
                    {mode === 'stock' ? (
                      selectedContexts.length === 0 || methods.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {contexts.length === 0 ? '—' : 'Sélectionnez au moins une base de prix'}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {selectedContexts.flatMap((c) => {
                            const key = ctxKey(c);
                            const check = stockChecks[key];
                            const incomplete = !!check && !check.loading && check.incomplete;
                            return methods.map((m) => {
                              const line = costLines[`${key}|${m}`];
                              return (
                                <div key={`${key}|${m}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{ctxIcon(c)} {c.nom}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                                  <span style={{ fontWeight: 700, color: m === 'dp' ? '#1d4ed8' : '#6d28d9' }}>{m === 'dp' ? 'Dernier Prix' : 'PMP'}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>=</span>
                                  {!line || line.loading ? (
                                    <span style={{ color: 'var(--text-muted)' }}>…</span>
                                  ) : line.cost !== null ? (
                                    <span style={{ fontWeight: 800, color: m === 'dp' ? '#2563eb' : '#7c3aed' }}>
                                      {line.cost.toFixed(3)}{' '}
                                      <span style={{ fontWeight: 600, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('currency')}</span>
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                  )}
                                  {incomplete && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#b45309', background: '#fef3c7', borderRadius: 10, padding: '1px 7px' }}>
                                      ⚠ {check.missingCount} article(s) sans appro — coût partiel
                                    </span>
                                  )}
                                </div>
                              );
                            });
                          })}
                        </div>
                      )
                    ) : manualCostLoading ? (
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>…</div>
                    ) : manualCost !== null ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {manualCost.toFixed(3)}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('currency')}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>—</div>
                    )}
                  </div>
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
                <div style={{ padding: '14px 20px', flexShrink: 0 }}>
                  <button
                    className="btn btn-primary"
                    style={{ paddingLeft: 22, paddingRight: 22, height: 40, fontSize: '0.9rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}
                    disabled={!canGenerate || generating}
                    onClick={generateExcel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><rect width="24" height="24" rx="3" fill="#217346"/><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/><path d="M14 2V8H20L14 2Z" fill="#107C41"/><text x="7" y="18" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">XLS</text></svg>
                    {generating
                      ? t('common.loading')
                      : mode === 'stock'
                        ? `Générer ${selectedContexts.length} fichier(s) Excel`
                        : t('client.fiche_technique.generate')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
      </div>

      {/* Manual prices popup */}
      {showManualPopup && (() => {
        // Build a flat ordered list of items with optional group labels
        type ManualItem = { type: 'group'; label: string; depth: number } | { type: 'item'; idx: number; groupDepth: number; groupLabel: string };
        const items: ManualItem[] = [];
        const groups = manualPriceGroups.length > 0
          ? manualPriceGroups
          : [{ label: '', depth: 0, ingredients: manualPrices.map((p) => ({ ingredientId: p.ingredientId, nom: p.nom, unite: p.unite })) }];
        const hasMultiGroups = manualPriceGroups.length > 1;
        for (const group of groups) {
          if (hasMultiGroups && group.depth > 0) items.push({ type: 'group', label: group.label, depth: group.depth });
          for (const ing of group.ingredients) {
            const idx = manualPrices.findIndex((p) => p.ingredientId === ing.ingredientId);
            if (idx !== -1) items.push({ type: 'item', idx, groupDepth: group.depth, groupLabel: group.label });
          }
        }
        const searchLow = manualSearch.toLowerCase();
        const filteredItems = manualSearch
          ? items.filter((it) => it.type === 'item' && manualPrices[it.idx].nom.toLowerCase().includes(searchLow))
          : items;
        const visibleCount = filteredItems.filter((it) => it.type === 'item').length;

        return (
          <div className="modal-overlay" style={{ zIndex: 1050 }}>
            <div className="modal" style={{ maxWidth: 520, borderRadius: 14, overflow: 'hidden', padding: 0 }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', marginBottom: 2 }}>✏️ Prix Articles</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 600 }}>
                    {productName}
                    {manualCtx ? ` — ${ctxIcon(manualCtx)} ${manualCtx.nom}` : ''}
                  </div>
                </div>
                <button onClick={() => { setShowManualPopup(false); setManualSearch(''); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Search */}
                <input
                  className="input"
                  placeholder="🔍 Rechercher un article…"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  style={{ fontSize: '0.82rem' }}
                  autoFocus
                />

                {/* Article count */}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {visibleCount} article{visibleCount !== 1 ? 's' : ''}
                  {manualSearch && ` — filtrés sur "${manualSearch}"`}
                </div>

                {/* Scrollable list */}
                <div style={{ height: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 10, padding: '6px' }}>
                  {manualLoading && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>⏳ {t('common.loading')}</div>
                  )}
                  {!manualLoading && visibleCount === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>Aucun article trouvé</div>
                  )}
                  {!manualLoading && filteredItems.map((it, i) => {
                    if (it.type === 'group') {
                      return (
                        <div key={`g-${i}`} style={{ paddingLeft: 8 + it.depth * 12, paddingTop: i === 0 ? 2 : 8, paddingBottom: 2, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', borderTop: i === 0 ? undefined : '1px solid var(--border)', marginTop: i === 0 ? 0 : 4 }}>
                          ↳ {it.label}
                        </div>
                      );
                    }
                    const p = manualPrices[it.idx];
                    const priceVal = parseFloat(p.prixUnitaire);
                    const priceValid = !isNaN(priceVal) && priceVal > 0;
                    return (
                      <div key={p.ingredientId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', paddingLeft: 10 + it.groupDepth * 12, borderRadius: 8, background: priceValid ? '#f0fdf4' : 'transparent', transition: 'background 0.12s' }}>
                        <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: 500, color: '#374151' }}>{p.nom}</span>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{p.unite}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <input
                            type="number"
                            step="0.001" min="0" placeholder="0.000"
                            value={p.prixUnitaire}
                            onChange={(e) => {
                              const updated = [...manualPrices];
                              updated[it.idx] = { ...updated[it.idx], prixUnitaire: e.target.value };
                              setManualPrices(updated);
                            }}
                            style={{ width: 90, padding: '3px 7px', borderRadius: 6, border: `1.5px solid ${priceValid ? '#86efac' : '#e2e8f0'}`, fontSize: '0.82rem', textAlign: 'right', outline: 'none' }}
                          />
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>DT</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                <button className="btn btn-ghost" onClick={() => { setShowManualPopup(false); setManualSearch(''); }}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={saveManualPrices} disabled={savingManual || manualLoading}>
                  {savingManual ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Zero-price warning popup */}
      {showZeroWarning && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 500, borderRadius: 16, overflow: 'hidden', padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Prix incomplets</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Ces articles ont un prix à 0 — corrigez-les avant d'enregistrer.</div>
                </div>
              </div>
              <button onClick={() => setShowZeroWarning(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '2px 8px', cursor: 'pointer', lineHeight: 1.4 }}>×</button>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.products.popup_col_ingredient')}</th>
                    <th style={{ width: 80 }}>{t('client.products.popup_col_unit')}</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap', width: 130 }}>{t('client.products.popup_col_unit_price')} (DT)</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroWarningPrices.map((p, wi) => (
                    <tr key={p.ingredientId}>
                      <td style={{ fontWeight: 500 }}>{p.nom}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.unite}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number" className="input"
                          style={{ textAlign: 'right', width: 110, display: 'block', marginLeft: 'auto', borderColor: '#f59e0b' }}
                          step="0.001" min="0.001" placeholder="0.000" autoFocus={wi === 0}
                          value={p.prixUnitaire}
                          onChange={(e) => {
                            const val = e.target.value;
                            setZeroWarningPrices((prev) => prev.map((x, j) => j === wi ? { ...x, prixUnitaire: val } : x));
                            setManualPrices((prev) => prev.map((x) => x.ingredientId === p.ingredientId ? { ...x, prixUnitaire: val } : x));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setShowZeroWarning(false)}>{t('common.cancel')}</button>
              <button
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderColor: 'transparent' }}
                disabled={savingManual || zeroWarningPrices.some((p) => { const v = parseFloat(p.prixUnitaire); return isNaN(v) || v <= 0; })}
                onClick={doSaveManualPrices}
              >
                {savingManual ? t('common.loading') : 'Confirmer et enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
