import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Category, DomaineActivite, Ingredient, Unit } from '../../types';
import Pagination from '../common/Pagination';

const PER_PAGE = 10;

interface IngredientForm {
  name: string;
  unitId: string;
  categorieId: string;
  domaineIds: number[];
}

const emptyForm: IngredientForm = { name: '', unitId: '', categorieId: '', domaineIds: [] };

export default function IngredientsManagement() {
  const { t } = useTranslation();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [domaines, setDomaines] = useState<DomaineActivite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<IngredientForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterDom, setFilterDom] = useState('');
  const [page, setPage] = useState(1);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const toggleCat = (cat: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });

  const fetchData = () => {
    setLoading(true);
    Promise.all([api.get('/ingredients'), api.get('/units'), api.get('/categories'), api.get('/api/domaines')])
      .then(([ing, u, cat, dom]) => { setIngredients(ing.data); setUnits(u.data); setCategories(cat.data); setDomaines(dom.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (i: Ingredient) => {
    setForm({
      name: i.name,
      unitId: String(i.unitId),
      categorieId: i.categorieId ? String(i.categorieId) : '',
      domaineIds: (i as { domaineIds?: number[] }).domaineIds || [],
    });
    setEditId(i.id);
    setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        unitId: parseInt(form.unitId),
        categorieId: form.categorieId ? parseInt(form.categorieId) : null,
        domaineIds: form.domaineIds,
      };
      if (editId) {
        await api.put(`/ingredients/${editId}`, payload);
      } else {
        await api.post('/ingredients', payload);
      }
      closeModal();
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.ingredients.delete_confirm'))) return;
    await api.delete(`/ingredients/${id}`);
    fetchData();
  };

  const filtered = ingredients.filter((i) => {
    const q = search.toLowerCase();
    const ingDomaines = (i as { domaineIds?: number[] }).domaineIds || [];
    const matchSearch =
      i.name.toLowerCase().includes(q) ||
      (i.categorieName || '').toLowerCase().includes(q) ||
      (i.unit?.name || '').toLowerCase().includes(q);
    const matchCat =
      filterCat === '' ||
      (filterCat === '__none__' && !i.categorieId) ||
      String(i.categorieId) === filterCat;
    const matchDom =
      filterDom === '' ||
      ingDomaines.length === 0 || // "tous" ingredients always match
      ingDomaines.includes(parseInt(filterDom));
    return matchSearch && matchCat && matchDom;
  });

  // Group ALL filtered ingredients by category first, then paginate groups (10 groups/page)
  const noCategory = t('client.ingredients_catalog.no_category');
  const allGroups: Record<string, Ingredient[]> = {};
  for (const ing of filtered) {
    const cat = ing.categorieName || noCategory;
    if (!allGroups[cat]) allGroups[cat] = [];
    allGroups[cat].push(ing);
  }
  const sortedGroups = Object.entries(allGroups).sort(([a], [b]) => {
    if (a === noCategory) return 1;
    if (b === noCategory) return -1;
    return a.localeCompare(b);
  });
  // Paginate on category count (10 groups per page)
  const totalGroups = sortedGroups.length;
  const pagedGroups = sortedGroups.slice((page - 1) * PER_PAGE, page * PER_PAGE);


  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('admin.ingredients.title')}</h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {ingredients.length} ingrédient{ingredients.length !== 1 ? 's' : ''} · {totalGroups} catégorie{totalGroups !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('admin.ingredients.add')}</button>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recherche</span>
          <input
            type="text"
            placeholder="Nom, catégorie, unité…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Catégorie</span>
          <select
            className="input"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">Toutes ({ingredients.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({ingredients.filter((i) => i.categorieId === c.id).length})
              </option>
            ))}
            <option value="__none__">Sans catégorie ({ingredients.filter((i) => !i.categorieId).length})</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Domaine</span>
          <select
            className="input"
            value={filterDom}
            onChange={(e) => setFilterDom(e.target.value)}
          >
            <option value="">Tous les domaines</option>
            {domaines.map((d) => (
              <option key={d.id} value={String(d.id)}>{d.nom}</option>
            ))}
          </select>
        </div>
        {(search || filterCat || filterDom) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterDom(''); setPage(1); }} style={{ marginBottom: 1 }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🧂</span>
          <p>{t('common.no_result')}</p>
        </div>
      ) : (
        <>
        {pagedGroups.map(([cat, items]) => {
          // Auto-open when a filter is active; otherwise respect user toggle
          const isOpen = search || filterCat || filterDom ? true : openCats.has(cat);
          return (
          <div key={cat} style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => toggleCat(cat)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8, marginBottom: isOpen ? 8 : 0,
                background: isOpen ? 'var(--primary-light, #eef2ff)' : '#f1f5f9',
                border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '0.85rem', transition: 'transform 0.15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--primary)' }}>▶</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', flex: 1 }}>🏷️ {cat}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)' }}>{items.length} ingrédient{items.length > 1 ? 's' : ''}</span>
            </button>
            {isOpen && <div className="table-responsive card">
              <table className="table">
                <thead style={{ background: '#f0fdf4' }}>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('common.unit')}</th>
                    <th>Domaines</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const ingDomaines = (i as { domaineIds?: number[] }).domaineIds || [];
                    return (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td><span className="unit-badge">{i.unit?.name}</span></td>
                      <td>
                        {ingDomaines.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tous</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {ingDomaines.map((did) => {
                              const d = domaines.find((dom) => dom.id === did);
                              return (
                                <span key={did} style={{ background: '#f0fdf4', color: '#15803d', fontSize: '0.72rem', fontWeight: 600, padding: '1px 7px', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                                  {d ? d.nom : `#${did}`}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="actions-cell">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(i)}>{t('common.edit')}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i.id)}>{t('common.delete')}</button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
          </div>
          );
        })}
        <Pagination total={totalGroups} page={page} perPage={PER_PAGE} onChange={setPage} />
        </>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{editId ? t('admin.ingredients.edit') : t('admin.ingredients.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>{t('admin.ingredients.name')}</label>
                <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('admin.ingredients.unit')}</label>
                <select className="input" required value={form.unitId} onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}>
                  <option value="">— {t('common.unit')} —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('admin.ingredients.category')}</label>
                <select className="input" value={form.categorieId} onChange={(e) => setForm((f) => ({ ...f, categorieId: e.target.value }))}>
                  <option value="">— {t('admin.ingredients.category')} —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>
                  Domaines d'activité
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>
                    (laisser vide = visible pour tous)
                  </span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {domaines.map((d) => {
                    const checked = form.domaineIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          padding: '5px 12px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600,
                          border: `1.5px solid ${checked ? '#15803d' : 'var(--border)'}`,
                          background: checked ? '#dcfce7' : '#f8fafc',
                          color: checked ? '#15803d' : 'var(--text-muted)',
                          userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{ display: 'none' }}
                          checked={checked}
                          onChange={() => setForm((f) => ({
                            ...f,
                            domaineIds: checked
                              ? f.domaineIds.filter((id) => id !== d.id)
                              : [...f.domaineIds, d.id],
                          }))}
                        />
                        {checked ? '✓ ' : ''}{d.nom}
                      </label>
                    );
                  })}
                  {domaines.length === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucun domaine configuré</span>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
