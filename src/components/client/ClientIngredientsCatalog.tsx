import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useSelection } from '../../context/SelectionContext';
import { useAuth } from '../../context/AuthContext';
import type { Ingredient, ProduitTransformeStockEntry } from '../../types';

interface Props {
  embedded?: boolean;
  onSelectionDone?: () => void;
}

export default function ClientIngredientsCatalog({ embedded, onSelectionDone }: Props = {}) {
  const { t } = useTranslation();
  const { refreshSelections } = useSelection();
  const { user, advanceOnboarding } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deselectModal, setDeselectModal] = useState<{ ing: Ingredient; approCount: number; inventaireCount: number } | null>(null);
  const [ptProducts, setPtProducts] = useState<ProduitTransformeStockEntry[]>([]);

  const fetchIngredients = () => {
    setLoading(true);
    api.get('/ingredients').then(({ data }) => setIngredients(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchIngredients(); }, []);

  useEffect(() => {
    api.get('/api/stock/pt').then(({ data }) => setPtProducts(data)).catch(() => {});
  }, []);

  const doToggle = async (ing: Ingredient, deleteHistory = false) => {
    setTogglingId(ing.id);
    try {
      const { data } = await api.post(`/ingredients/${ing.id}/select`);
      setIngredients((list) => list.map((i) => (i.id === ing.id ? { ...i, selected: data.selected } : i)));
      refreshSelections();
      if (data.selected && user?.onboardingStep === 3) await advanceOnboarding(0);
      if (deleteHistory) await api.delete(`/api/stock/client/${ing.id}/all-history`);
    } finally {
      setTogglingId(null);
    }
  };

  const toggleSelection = async (ing: Ingredient) => {
    if (ing.selected) {
      setTogglingId(ing.id);
      try {
        const { data } = await api.get(`/api/stock/client/${ing.id}/cascade-info`);
        setTogglingId(null);
        // Always show confirm modal when deselecting (with or without data)
        setDeselectModal({ ing, approCount: data.approCount ?? 0, inventaireCount: data.inventaireCount ?? 0 });
        return;
      } catch {
        setTogglingId(null);
        // Fallback: show simple confirm with zeros
        setDeselectModal({ ing, approCount: 0, inventaireCount: 0 });
        return;
      }
    }
    await doToggle(ing);
  };

  const selectedCount = ingredients.filter((i) => i.selected).length;

  // Only show selected ingredients — modifications must go through Catalogue Global
  const selectedOnly = ingredients.filter((i) => i.selected);
  const filtered = selectedOnly.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.categorieName || '').toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const groups: Record<string, Ingredient[]> = {};
  for (const ing of filtered) {
    const cat = ing.categorieName || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ing);
  }

  const CAT_PAGE_SIZE = 10;
  const [catPage, setCatPage] = useState(1);
  const sortedCatEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  const catTotalPages = Math.max(1, Math.ceil(sortedCatEntries.length / CAT_PAGE_SIZE));
  const pagedCatEntries = sortedCatEntries.slice((catPage - 1) * CAT_PAGE_SIZE, catPage * CAT_PAGE_SIZE);

  return (
    <div className={embedded ? '' : 'page'}>
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #22c55e 100%)',
        borderRadius: 18,
        padding: '24px 28px',
        marginBottom: 24,
        boxShadow: '0 8px 32px rgba(22,163,74,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧺</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catalogue Ingrédients</h1>
          </div>
          {selectedCount > 0 && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255,255,255,0.18)',
              borderRadius: 20,
              padding: '4px 12px',
              marginTop: 4,
            }}>
              <span style={{ fontSize: '0.82rem', color: '#d1fae5', fontWeight: 700 }}>
                ✓ {t('client.ingredients_catalog.selection_count', { count: selectedCount })}
              </span>
            </div>
          )}
        </div>
        {embedded && onSelectionDone && selectedCount > 0 && (
          <button
            className="btn"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '2px solid rgba(255,255,255,0.5)',
              color: '#fff',
              fontWeight: 700,
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: '0.95rem',
              backdropFilter: 'blur(4px)',
            }}
            onClick={onSelectionDone}
          >
            Continuer → ({selectedCount} ingrédient{selectedCount > 1 ? 's' : ''})
          </button>
        )}
      </div>

      {/* Banner pointing to Catalogue Global for modifications */}
      {!embedded && (
        <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#3730a3' }}>
          🌐 {t('client.ingredients_catalog.readonly_hint', 'Ce catalogue affiche uniquement les ingrédients sélectionnés dans le')} {' '}
          <Link to="/client/catalogue-global" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
            {t('nav.catalogue_global', 'Catalogue Global')}
          </Link>.
          {' '}{t('client.ingredients_catalog.modify_hint', 'Pour ajouter ou retirer des ingrédients, rendez-vous dans le Catalogue Global.')}
        </div>
      )}

      {selectedCount === 0 && !loading && (
        <div className="alert alert-error" style={{ background: '#fff7ed', color: '#c05621', borderColor: '#fbd38d', marginBottom: 16 }}>
          ⚠️ {t('client.ingredients_catalog.no_selection_hint', 'Aucun ingrédient sélectionné. Rendez-vous dans le')}{' '}
          <Link to="/client/catalogue-global" style={{ color: '#c05621', fontWeight: 600, textDecoration: 'underline' }}>
            {t('nav.catalogue_global', 'Catalogue Global')}
          </Link>{' '}
          {t('client.ingredients_catalog.to_select', 'pour sélectionner vos ingrédients.')}
        </div>
      )}

      {/* Search / Filter panel */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 14,
        padding: '14px 18px',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder={t('common.search') + '...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: '100%' }}
          />
        </div>
        {search && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
            onClick={() => setSearch('')}
          >
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          color: 'var(--text-muted)',
        }}>
          <span style={{ fontSize: '2.8rem', marginBottom: 14 }}>🧂</span>
          <p style={{ fontSize: '0.95rem', margin: 0, fontWeight: 500 }}>{t('client.ingredients_catalog.no_results')}</p>
        </div>
      ) : (
        <>
          {pagedCatEntries.map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              {/* Category group header */}
              <div style={{
                background: 'var(--surface)',
                borderLeft: '4px solid #16a34a',
                borderRadius: '0 10px 10px 0',
                padding: '10px 16px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#15803d' }}>🏷️ {cat}</span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#fff',
                  background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                  borderRadius: 20,
                  padding: '2px 9px',
                }}>
                  {items.length}
                </span>
              </div>
              <div className="table-responsive card">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>{t('common.name')}</th>
                      <th>{t('common.unit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ing) => (
                      <tr
                        key={ing.id}
                        style={ing.selected ? {
                          borderLeft: '3px solid #16a34a',
                          background: '#f0fdf4',
                        } : undefined}
                      >
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn btn-sm"
                            style={ing.selected ? {
                              background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                              border: 'none',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '0.95rem',
                              padding: '3px 10px',
                              borderRadius: 8,
                            } : {
                              background: 'transparent',
                              border: '2px solid #ef4444',
                              color: '#ef4444',
                              fontWeight: 700,
                              fontSize: '0.95rem',
                              padding: '3px 10px',
                              borderRadius: 8,
                            }}
                            disabled={togglingId === ing.id}
                            onClick={() => toggleSelection(ing)}
                            title={ing.selected ? t('client.ingredients_catalog.deselect') : t('client.ingredients_catalog.select')}
                          >
                            {togglingId === ing.id ? '…' : ing.selected ? '✓' : '○'}
                          </button>
                        </td>
                        <td>
                          <span style={{ fontWeight: ing.selected ? 600 : undefined }}>{ing.name}</span>
                        </td>
                        <td>{ing.unit?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {catTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <button className="btn btn-ghost btn-sm" disabled={catPage === 1} onClick={() => setCatPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{catPage} / {catTotalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={catPage === catTotalPages} onClick={() => setCatPage((p) => Math.min(catTotalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
            </div>
          )}
        </>
      )}

      {ptProducts.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#7c3aed', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            📦 Produits Transformés
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)' }}>({ptProducts.length})</span>
          </h2>
          <div className="table-responsive card">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th style={{ textAlign: 'right' }}>Stock mois</th>
                  <th style={{ textAlign: 'right' }}>Prix calculé</th>
                </tr>
              </thead>
              <tbody>
                {ptProducts.map((p) => (
                  <tr key={p.produitId} style={{ background: 'var(--primary-light)' }}>
                    <td style={{ fontWeight: 600 }}>
                      {p.nom}
                      {p.prixPartiel && <span style={{ fontSize: '0.72rem', color: '#d97706', marginLeft: 8 }}>⚠️ Prix partiel</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {p.totalQuantite !== null ? p.totalQuantite.toFixed(3) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>
                      {p.lastPrixCalcule !== null ? `${p.lastPrixCalcule.toFixed(3)} DT` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deselectModal && (() => {
        const hasCascade = deselectModal.approCount > 0 || deselectModal.inventaireCount > 0;
        return (
          <div className="modal-overlay" onClick={() => setDeselectModal(null)}>
            <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ background: hasCascade ? 'linear-gradient(135deg, #7c2d12, #dc2626)' : 'linear-gradient(135deg, #b91c1c, #dc2626)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                  {hasCascade ? '⚠️ Désassignation avec cascade' : '⚠️ Désassigner l\'ingrédient'}
                </h2>
                <button onClick={() => setDeselectModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: '#f8faff', borderRadius: 8, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{deselectModal.ing.name}</div>
                  {deselectModal.ing.categorieName && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{deselectModal.ing.categorieName}</div>
                  )}
                </div>
                {hasCascade ? (
                  <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: '0.88rem', marginBottom: 6 }}>
                      ⚠️ Cette désassignation entraîne des effets en cascade :
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.83rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                      {deselectModal.approCount > 0 && (
                        <li><strong>{deselectModal.approCount}</strong> approvisionnement{deselectModal.approCount > 1 ? 's' : ''} supprimé{deselectModal.approCount > 1 ? 's' : ''}</li>
                      )}
                      {deselectModal.inventaireCount > 0 && (
                        <li><strong>{deselectModal.inventaireCount}</strong> inventaire{deselectModal.inventaireCount > 1 ? 's' : ''} supprimé{deselectModal.inventaireCount > 1 ? 's' : ''}</li>
                      )}
                      <li>Recalcul du stock de l'activité</li>
                    </ul>
                  </div>
                ) : null}
                <div style={{ background: '#fff7ed', border: '1px solid #fbd38d', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                  🔒 Action irréversible — cette suppression ne peut pas être annulée.
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost" onClick={() => setDeselectModal(null)}>Annuler</button>
                <button
                  style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, padding: '10px 22px', cursor: 'pointer' }}
                  onClick={async () => {
                    const m = deselectModal;
                    setDeselectModal(null);
                    await doToggle(m.ing, m.approCount > 0 || m.inventaireCount > 0);
                  }}
                >
                  {hasCascade ? 'Désassigner et supprimer' : 'Désassigner'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
