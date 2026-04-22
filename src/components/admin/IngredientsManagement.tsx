import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Category, Ingredient, Unit } from '../../types';

interface IngredientForm {
  name: string;
  price: string;
  unitId: string;
  categorieId: string;
}

const emptyForm: IngredientForm = { name: '', price: '', unitId: '', categorieId: '' };

export default function IngredientsManagement() {
  const { t } = useTranslation();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<IngredientForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = () => {
    setLoading(true);
    Promise.all([api.get('/ingredients'), api.get('/units'), api.get('/categories')])
      .then(([ing, u, cat]) => { setIngredients(ing.data); setUnits(u.data); setCategories(cat.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (i: Ingredient) => {
    setForm({ name: i.name, price: String(i.price), unitId: String(i.unitId), categorieId: i.categorieId ? String(i.categorieId) : '' });
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
        price: parseFloat(form.price),
        unitId: parseInt(form.unitId),
        categorieId: form.categorieId ? parseInt(form.categorieId) : null,
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
    return (
      i.name.toLowerCase().includes(q) ||
      String(i.price).includes(q) ||
      (i.unit?.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('admin.ingredients.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('admin.ingredients.add')}</button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder={t('common.search') + '...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.price')}</th>
                <th>{t('common.unit')}</th>
                <th>{t('admin.ingredients.category')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td><span className="price-badge">{i.price.toFixed(3)} {t('currency')}</span></td>
                  <td><span className="unit-badge">{i.unit?.name}</span></td>
                  <td>{i.categorieName ? <span className="unit-badge">{i.categorieName}</span> : <span className="text-muted">—</span>}</td>
                  <td className="actions-cell">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(i)}>{t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="empty-cell">Aucun résultat</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? t('admin.ingredients.edit') : t('admin.ingredients.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>{t('admin.ingredients.name')}</label>
                <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('admin.ingredients.price')}</label>
                  <input className="input" type="number" step="0.001" min="0" required value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>{t('admin.ingredients.unit')}</label>
                  <select className="input" required value={form.unitId} onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}>
                    <option value="">— {t('common.unit')} —</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>{t('admin.ingredients.category')}</label>
                <select className="input" value={form.categorieId} onChange={(e) => setForm((f) => ({ ...f, categorieId: e.target.value }))}>
                  <option value="">— {t('admin.ingredients.category')} —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
