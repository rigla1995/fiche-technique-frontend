import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { CategorieProduit, TypeProduitCategorie } from '../../types';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import { useConfirm } from '../common/ConfirmDialog';
import GuideButton from './GuideButton';
import { PRODUCT_THEME } from '../../theme/productTheme';

const COLOR = PRODUCT_THEME.accent;
const HERO = PRODUCT_THEME.heroGradient;
const BTN = PRODUCT_THEME.btnGradient;

const TYPE_OPTIONS: { value: TypeProduitCategorie; label: string; icon: string }[] = [
  { value: 'vendable', label: 'Produit vendable', icon: '🍽️' },
  { value: 'supplement', label: 'Supplément vendable', icon: '➕' },
  { value: 'valorise', label: 'Article valorisé', icon: '💎' },
];
const typeLabel = (t?: TypeProduitCategorie) => TYPE_OPTIONS.find(o => o.value === t)?.label ?? '—';
const typeIcon = (t?: TypeProduitCategorie) => TYPE_OPTIONS.find(o => o.value === t)?.icon ?? '🏷️';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

interface CatRow { nom: string; }
const emptyRow = (): CatRow => ({ nom: '' });

export default function ProductCategoriesPage() {
  const { alerte } = useConfirm();
  const [categories, setCategories] = useState<CategorieProduit[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState<CatRow[]>([emptyRow()]);
  const [createType, setCreateType] = useState<TypeProduitCategorie>('vendable');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [editItem, setEditItem] = useState<CategorieProduit | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editType, setEditType] = useState<TypeProduitCategorie>('vendable');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'' | TypeProduitCategorie>('');

  const load = () => {
    setLoading(true);
    api.get('/api/categories-produit')
      .then(r => { setCategories(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setRows([emptyRow()]); setCreateType('vendable'); setCreateError(''); setShowCreate(true); };
  const closeCreate = () => setShowCreate(false);
  const updateRow = (i: number, val: string) => setRows(prev => prev.map((r, idx) => idx === i ? { nom: val } : r));
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    const valid = rows.filter(r => r.nom.trim());
    if (!valid.length) { setCreateError('Au moins un nom requis'); return; }
    setCreating(true); setCreateError('');
    try {
      await Promise.all(valid.map(r => api.post('/api/categories-produit', { nom: r.nom.trim(), typeProduit: createType })));
      closeCreate(); load();
    } catch (e: unknown) {
      setCreateError(apiMsg(e, "Erreur lors de l'enregistrement"));
    } finally { setCreating(false); }
  };

  const openEdit = (c: CategorieProduit) => { setEditItem(c); setEditNom(c.name); setEditType(c.typeProduit ?? 'vendable'); setEditError(''); setSaving(false); };
  const closeEdit = () => setEditItem(null);

  const handleSave = async () => {
    if (!editNom.trim()) { setEditError('Nom requis'); return; }
    setSaving(true);
    try {
      await api.put(`/api/categories-produit/${editItem!.id}`, { nom: editNom.trim(), typeProduit: editType });
      closeEdit(); load();
    } catch (e: unknown) {
      setEditError(apiMsg(e, "Erreur lors de l'enregistrement"));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/api/categories-produit/${id}`); setDeleteId(null); load(); }
    catch (e: unknown) { alerte({ title: 'Suppression impossible', message: apiMsg(e, 'Impossible de supprimer cette catégorie'), tone: 'danger' }); }
  };

  const filtered = categories.filter(c =>
    (!search || c.name.toLowerCase().includes(search.toLowerCase())) &&
    (!filterType || c.typeProduit === filterType)
  );

  return (
    <div className="page">
      {/* Hero — même thème que l'Espace Produit */}
      <div style={{ background: HERO, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(30,27,75,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>🏷️</div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Catégories de produit</h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.83rem', margin: 0, letterSpacing: '0.01em' }}>
              Classez vos produits vendables, suppléments et articles valorisés par catégorie
            </p>
          </div>
          <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#818cf8', lineHeight: 1 }}>{categories.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>catégorie{categories.length !== 1 ? 's' : ''}</div>
          </div>
          <GuideButton section="categories-produits" />
        </div>
      </div>

      {/* Barre de filtres (composant partagé, mode direct) */}
      <HistoryFilterBar
        accent={COLOR} accentDark="#4338ca"
        subtitle={`${filtered.length} catégorie${filtered.length !== 1 ? 's' : ''}`}
        onReset={() => { setSearch(''); setFilterType(''); }}
        showReset={!!(search || filterType)}
        actions={<button className="btn" onClick={openCreate} style={{ background: BTN, color: '#fff', border: 'none' }}>+ Nouvelle catégorie</button>}
      >
        <FilterField label="🔍 Recherche"><FilterInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer les catégories…" /></FilterField>
        <FilterField label="🏷️ Type">
          <FilterSelect value={filterType} onChange={e => setFilterType(e.target.value as '' | TypeProduitCategorie)}>
            <option value="">Tous les types</option>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {/* List */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : categories.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #c7d2fe', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🏷️</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucune catégorie de produit</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: '0 0 20px', maxWidth: 440, marginInline: 'auto' }}>Les catégories servent à classer vos produits vendables et suppléments (obligatoire à la création) ainsi que vos articles valorisés.</p>
          <button onClick={openCreate} style={{ background: BTN, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>+ Créer la première catégorie</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Type</th>
                <th>Produits</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</td>
                  <td><span style={{ fontSize: '0.74rem', fontWeight: 700, background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{typeIcon(c.typeProduit)} {typeLabel(c.typeProduit)}</span></td>
                  <td><span style={{ fontSize: '0.82rem', color: COLOR, fontWeight: 600 }}>{c.produitsCount ?? 0} produit{(c.produitsCount ?? 0) !== 1 ? 's' : ''}</span></td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ Modifier</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(c.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: BTN }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Nouvelles catégories</h2>
              <button className="modal-close" onClick={closeCreate}>×</button>
            </div>
            <div className="modal-body">
              {createError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{createError}</div>}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#3730a3', marginBottom: 6 }}>Type <span style={{ color: '#ef4444' }}>*</span></label>
                <select className="input" value={createType} onChange={e => setCreateType(e.target.value as TypeProduitCategorie)} style={{ width: '100%' }}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Ces catégories ne seront proposées que pour ce type.</div>
              </div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#3730a3', marginBottom: 6 }}>Nom(s)</label>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    className="input" style={{ flex: 1 }}
                    autoFocus={i === 0}
                    placeholder="Ex: Boissons"
                    value={row.nom}
                    onChange={e => updateRow(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) addRow(); } }}
                  />
                  <button onClick={() => removeRow(i)} disabled={rows.length === 1} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: rows.length === 1 ? '#f1f5f9' : '#fee2e2', color: rows.length === 1 ? '#94a3b8' : '#dc2626', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button onClick={addRow} style={{ background: 'none', border: '1.5px dashed #c7d2fe', borderRadius: 8, padding: '7px 16px', color: COLOR, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', width: '100%', marginTop: 4 }}>+ Ajouter une ligne</button>
              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={closeCreate}>Annuler</button>
                <button className="btn" disabled={creating} onClick={handleCreate} style={{ background: BTN, color: '#fff' }}>
                  {creating ? 'Enregistrement…' : `Enregistrer ${rows.filter(r => r.nom.trim()).length > 1 ? `(${rows.filter(r => r.nom.trim()).length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: BTN }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Modifier la catégorie</h2>
              <button className="modal-close" onClick={closeEdit}>×</button>
            </div>
            <div className="modal-body">
              {editError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{editError}</div>}
              <div className="form-group">
                <label>Type *</label>
                <select className="input" value={editType} onChange={e => setEditType(e.target.value as TypeProduitCategorie)}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Nom *</label>
                <input className="input" autoFocus value={editNom} placeholder="Ex: Boissons" onChange={e => setEditNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeEdit}>Annuler</button>
                <button className="btn" disabled={saving || !editNom.trim()} onClick={handleSave} style={{ background: BTN, color: '#fff' }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId !== null && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div className="modal-body" style={{ padding: '28px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ margin: '0 0 10px' }}>Supprimer cette catégorie ?</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: '0.9rem' }}>Les produits et articles valorisés liés perdront leur catégorie.</p>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Annuler</button>
                <button className="btn btn-danger" onClick={() => handleDelete(deleteId!)}>Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
