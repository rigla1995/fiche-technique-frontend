import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface RecentInv { id: string; qty: number; date: string }
interface InventaireRow {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  seuilMin: number | null;
  recentInventaires: RecentInv[];
  inventaireDates: string[];
}
interface Activite { id: number; nom: string; type: string; franchiseGroup: string | null }

export default function InventairePage() {
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');
  const activiteId = searchParams.get('activiteId');
  const section = searchParams.get('section');

  const [rows, setRows] = useState<InventaireRow[]>([]);
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [contextNom, setContextNom] = useState('');

  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const effectiveActiviteId = activiteId ? Number(activiteId) : selectedActiviteId;

  // UI state
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [openHistory, setOpenHistory] = useState<Set<number>>(new Set());
  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Confirmation popup
  interface ConfirmEntry { ingredientId: number; nom: string; qty: number; isReplacement: boolean; oldQty: number | null }
  const [confirmPopup, setConfirmPopup] = useState<{ entries: ConfirmEntry[] } | null>(null);

  useEffect(() => {
    if (!section) return;
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const filtered = (data as Activite[]).filter((a) =>
          section === 'franchise'
            ? (a.type === 'franchise_avec_labo' || a.type === 'franchise_gestion_separee' || a.franchiseGroup)
            : a.type === 'distinct'
        );
        setActivites(filtered);
        if (filtered.length === 1) setSelectedActiviteId(filtered[0].id);
      })
      .catch(() => {});
  }, [section]);

  const loadStock = useCallback(async () => {
    if (!laboId && !effectiveActiviteId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      let url = '';
      if (laboId) {
        url = `/api/labo/${laboId}/inventaire`;
        const laboRes = await api.get(`/api/labo/${laboId}`);
        setContextNom(laboRes.data?.nom || 'Labo');
      } else {
        url = `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
        const act = activites.find((a) => a.id === effectiveActiviteId);
        if (act) setContextNom(act.nom);
      }
      const { data } = await api.get(url);
      setRows(data);
      const initQtys: Record<number, string> = {};
      const initNotes: Record<number, string> = {};
      for (const r of data as InventaireRow[]) {
        initQtys[r.ingredientId] = '';
        initNotes[r.ingredientId] = '';
      }
      setQtys(initQtys);
      setNotes(initNotes);
    } catch { setErrorMsg('Erreur lors du chargement.'); }
    setLoading(false);
  }, [laboId, effectiveActiviteId, activites]);

  useEffect(() => { loadStock(); }, [loadStock]);

  const isAlarm = (r: InventaireRow) => r.inventaireDates.includes(date);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.categorie))], [rows]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (filterCategory && r.categorie !== filterCategory) return false;
    if (searchName && !r.nom.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  }), [rows, filterCategory, searchName]);

  const filteredCategories = useMemo(() =>
    [...new Set(filteredRows.map((r) => r.categorie))],
    [filteredRows]
  );

  const toggleCategory = (cat: string) => setOpenCategories((prev) => {
    const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
  });
  const toggleHistory = (id: number) => setOpenHistory((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const handleSave = () => {
    const entries = rows
      .filter((r) => qtys[r.ingredientId] !== '' && parseFloat(qtys[r.ingredientId] || '0') >= 0)
      .map((r) => {
        const isReplacement = r.inventaireDates.includes(date);
        const oldQty = isReplacement
          ? (r.recentInventaires.find((inv) => inv.date === date)?.qty ?? null)
          : null;
        return { ingredientId: r.ingredientId, nom: r.nom, qty: parseFloat(qtys[r.ingredientId]), isReplacement, oldQty };
      });
    if (entries.length === 0) { setErrorMsg('Aucune quantité saisie.'); return; }
    setErrorMsg('');
    setConfirmPopup({ entries });
  };

  const handleConfirmSave = async () => {
    if (!confirmPopup) return;
    setSaving(true);
    setConfirmPopup(null);
    try {
      const entries = confirmPopup.entries.map((e) => ({
        ingredientId: e.ingredientId,
        quantiteReelle: e.qty,
        note: notes[e.ingredientId]?.trim() || null,
      }));
      const url = laboId
        ? `/api/labo/${laboId}/inventaire`
        : `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
      await api.post(url, { dateInventaire: date, entries });
      setSuccessMsg('Inventaire sauvegardé.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadStock();
    } catch { setErrorMsg('Erreur lors de la sauvegarde.'); }
    setSaving(false);
  };

  const hasAnyQty = rows.some((r) => qtys[r.ingredientId] !== '');
  const needsActiviteSelector = !!section && !activiteId && activites.length > 1 && !selectedActiviteId;

  const contextTitle = laboId
    ? `Stock Labo — ${contextNom}`
    : section
    ? `Stock ${section === 'franchise' ? 'Franchise' : 'Distinct'}${contextNom ? ` — ${contextNom}` : ''}`
    : contextNom || 'Inventaire';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 2, letterSpacing: '-0.01em' }}>
          🔢 Inventaire
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{contextTitle}</p>
      </div>

      {/* Activite selector */}
      {section && !activiteId && activites.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Sélectionner une activité</label>
          <select value={selectedActiviteId ?? ''} onChange={(e) => setSelectedActiviteId(Number(e.target.value) || null)}
            style={{ padding: '9px 13px', borderRadius: 9, border: '1px solid var(--border)', fontSize: '0.9rem', minWidth: 220 }}>
            <option value="">— Choisir —</option>
            {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </div>
      )}

      {!needsActiviteSelector && (
        <>
          {/* Top bar: date + filters */}
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date inventaire</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem', fontWeight: 600 }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Rechercher</label>
              <input type="text" value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Nom ingrédient..."
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem', minWidth: 180 }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Catégorie</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem', minWidth: 150 }}>
                <option value="">Toutes</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={handleSave} disabled={saving || !hasAnyQty}
                style={{ padding: '9px 26px', borderRadius: 9, border: 'none', background: hasAnyQty ? 'var(--primary)' : '#d1d5db', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: hasAnyQty ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}>
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
              </button>
            </div>
          </div>

          {/* Messages */}
          {errorMsg && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem', color: '#991b1b' }}>{errorMsg}</div>}
          {successMsg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem', color: '#166534' }}>✅ {successMsg}</div>}

          {loading ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Chargement...</p>
          ) : filteredRows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Aucun ingrédient trouvé.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredCategories.map((cat) => {
                const catRows = filteredRows.filter((r) => r.categorie === cat);
                const isOpen = openCategories.has(cat);
                const alarmCount = catRows.filter((r) => isAlarm(r)).length;
                return (
                  <div key={cat} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {/* Category header */}
                    <button onClick={() => toggleCategory(cat)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 16px', background: isOpen ? 'var(--primary)' : 'var(--surface)',
                      border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                    }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: isOpen ? '#fff' : 'var(--text)', flex: 1 }}>
                        {cat}
                        <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 400, opacity: 0.7 }}>
                          {catRows.length} ingrédient{catRows.length > 1 ? 's' : ''}
                        </span>
                      </span>
                      {alarmCount > 0 && !isOpen && (
                        <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>
                          ⚠ {alarmCount}
                        </span>
                      )}
                      <span style={{ color: isOpen ? '#fff' : 'var(--text-muted)', fontSize: '0.75rem' }}>{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {/* Ingredient rows */}
                    {isOpen && (
                      <div>
                        {catRows.map((r, idx) => {
                          const alarm = isAlarm(r);
                          const histOpen = openHistory.has(r.ingredientId);
                          const inputStyle: React.CSSProperties = {
                            width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: '0.9rem',
                            border: alarm ? '2px solid #f59e0b' : '1px solid var(--border)',
                            background: alarm ? '#fffbeb' : undefined,
                            boxShadow: alarm ? '0 0 0 3px #fef3c7' : undefined,
                            outline: 'none', transition: 'border 0.15s, box-shadow 0.15s',
                          };
                          return (
                            <div key={r.ingredientId} style={{
                              borderTop: idx > 0 ? '1px solid var(--border)' : undefined,
                              padding: '12px 16px',
                              background: alarm ? 'linear-gradient(90deg, #fffbeb 0%, #fff 60%)' : (idx % 2 === 0 ? 'var(--background)' : 'var(--surface)'),
                            }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr auto', gap: 10, alignItems: 'center' }}>
                                {/* Name */}
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.93rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {alarm && <span style={{ color: '#f59e0b', fontSize: '0.85rem' }}>⚠</span>}
                                    {r.nom}
                                  </div>
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 1 }}>{r.unite}</div>
                                </div>
                                {/* Qty input */}
                                <div>
                                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: alarm ? '#d97706' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>
                                    Qté réelle {alarm ? '⚠' : ''}
                                  </div>
                                  <input
                                    type="number" min="0" step="0.001"
                                    value={qtys[r.ingredientId] ?? ''}
                                    onChange={(e) => setQtys((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="0.000"
                                    style={inputStyle}
                                  />
                                </div>
                                {/* Note */}
                                <div>
                                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Note</div>
                                  <input type="text" value={notes[r.ingredientId] ?? ''} onChange={(e) => setNotes((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="Observation..." style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.85rem' }} />
                                </div>
                                {/* History toggle */}
                                <button onClick={() => toggleHistory(r.ingredientId)} style={{
                                  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                                  background: histOpen ? '#f1f5f9' : 'none', cursor: 'pointer',
                                  fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                                }}>
                                  📋 {histOpen ? '▲' : '▼'}
                                </button>
                              </div>

                              {/* Collapsible last 5 inventaires */}
                              {histOpen && (
                                <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                  {r.recentInventaires.length === 0 ? (
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Aucun inventaire enregistré</p>
                                  ) : (
                                    <div>
                                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.06em' }}>
                                        5 derniers inventaires
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {r.recentInventaires.map((inv) => (
                                          <div key={inv.id} style={{
                                            padding: '5px 12px', borderRadius: 20,
                                            background: inv.date === date ? '#fef3c7' : '#fff',
                                            border: inv.date === date ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                                            fontSize: '0.8rem', fontWeight: 600,
                                            color: inv.date === date ? '#92400e' : 'var(--text)',
                                          }}>
                                            {fmtDate(inv.date)} — <strong>{inv.qty.toFixed(3)}</strong> {r.unite}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Confirmation popup */}
      {confirmPopup && (() => {
        const replacements = confirmPopup.entries.filter((e) => e.isReplacement);
        const newEntries = confirmPopup.entries.filter((e) => !e.isReplacement);
        const hasReplacements = replacements.length > 0;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 18, padding: 0, maxWidth: 520, width: '92%', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
              {/* Header */}
              <div style={{ background: hasReplacements ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '20px 26px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                  {hasReplacements ? '🚨 Remplacement détecté' : '⚠️ Confirmer l\'inventaire'}
                </div>
                <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.88)', marginTop: 4 }}>
                  Date : <strong>{fmtDate(date)}</strong> · {confirmPopup.entries.length} ingrédient(s)
                  {hasReplacements && <> · <strong>{replacements.length} remplacement(s)</strong></>}
                </div>
              </div>
              <div style={{ padding: '22px 26px' }}>
                {/* Warning notice */}
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '11px 15px', marginBottom: 16, fontSize: '0.83rem', color: '#92400e', lineHeight: 1.5 }}>
                  ⚠️ <strong>Important :</strong> Cet inventaire <strong>ne peut pas être supprimé</strong>, seulement modifié. Il recalcule le stock à partir du <strong>{fmtDate(date)}</strong>.
                </div>

                {/* Replacement rows (alarming) */}
                {hasReplacements && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                      🔄 Valeurs remplacées
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {replacements.map((e) => (
                        <div key={e.ingredientId} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 12px', borderRadius: 8,
                          background: 'linear-gradient(90deg, #fef2f2 0%, #fff5f5 100%)',
                          border: '1.5px solid #fca5a5', fontSize: '0.87rem',
                        }}>
                          <span style={{ fontWeight: 600, color: '#991b1b' }}>{e.nom}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                            <span style={{ color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem' }}>
                              {e.oldQty !== null ? e.oldQty.toFixed(3) : '—'}
                            </span>
                            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>→</span>
                            <span style={{ color: '#dc2626', fontSize: '0.93rem' }}>{e.qty.toFixed(3)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New entries */}
                {newEntries.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    {hasReplacements && (
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                        ✨ Nouveaux inventaires
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {newEntries.map((e) => (
                        <div key={e.ingredientId} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '7px 10px', borderRadius: 7,
                          background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.87rem',
                        }}>
                          <span style={{ fontWeight: 500 }}>{e.nom}</span>
                          <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{e.qty.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setConfirmPopup(null)} style={{ padding: '9px 22px', borderRadius: 9, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                    Annuler
                  </button>
                  <button onClick={handleConfirmSave} style={{
                    padding: '9px 26px', borderRadius: 9, border: 'none',
                    background: hasReplacements ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem',
                  }}>
                    {hasReplacements ? '🔄 Remplacer' : '✓ Confirmer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
