import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, HistoriqueApproEntry } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;

interface Ingredient {
  id: number;
  nom: string;
  unite: string;
  categorie: string | null;
}

interface Category {
  id: number;
  nom: string;
}

export default function HistoriqueApproPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isEntreprise = user?.compteType === 'entreprise';

  // Pre-selected from URL (coming from history popup "voir tout")
  const initIngredientId = searchParams.get('ingredientId') || '';
  const initActiviteId = searchParams.get('activiteId') || '';

  // Entreprise type filter
  const [entType, setEntType] = useState<'franchise' | 'distinct'>('franchise');
  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

  // Franchise group + activity selectors
  const [franchiseGroups, setFranchiseGroups] = useState<string[]>([]);
  const [selectedFranchiseGroup, setSelectedFranchiseGroup] = useState('');
  const [selectedActiviteId, setSelectedActiviteId] = useState(initActiviteId);

  // Ingredient selectors
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState(initIngredientId);

  // Date range (current year only)
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);

  // Results
  const [results, setResults] = useState<HistoriqueApproEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Load categories
  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data as Category[])).catch(() => {});
  }, []);

  // Load activities for enterprise
  useEffect(() => {
    if (!isEntreprise) return;
    setActivitesLoading(true);
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const all = data as Activite[];
        const franchise = all.filter((a) => a.type === 'franchise');
        const distinct = all.filter((a) => a.type === 'distincte' || a.type == null);
        setFranchiseActivities(franchise);
        setDistinctActivities(distinct);
        const groups = Array.from(new Set(franchise.map((a) => a.franchiseGroup || a.nom))).sort();
        setFranchiseGroups(groups);
        if (groups.length > 0 && !selectedFranchiseGroup) setSelectedFranchiseGroup(groups[0]);
        // If pre-selected activiteId, find its type
        if (initActiviteId) {
          const act = all.find((a) => String(a.id) === initActiviteId);
          if (act?.type === 'distincte' || act?.type == null) setEntType('distinct');
        }
      })
      .finally(() => setActivitesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise]);

  // Update selectedActiviteId when group changes
  useEffect(() => {
    if (!isEntreprise || entType !== 'franchise') return;
    const grouped = franchiseActivities.filter((a) => (a.franchiseGroup || a.nom) === selectedFranchiseGroup);
    if (grouped.length > 0 && !initActiviteId) setSelectedActiviteId(String(grouped[0].id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFranchiseGroup, entType, franchiseActivities]);

  // Activities shown in the activity dropdown
  const activitiesForDropdown = isEntreprise
    ? entType === 'franchise'
      ? franchiseActivities.filter((a) => !selectedFranchiseGroup || (a.franchiseGroup || a.nom) === selectedFranchiseGroup)
      : distinctActivities
    : [];

  // Load ingredients by category (and optional activite for enterprise)
  useEffect(() => {
    setIngredients([]);
    setSelectedIngredientId(initIngredientId);
    if (!selectedCategoryId) return;
    setIngredientsLoading(true);
    const params = new URLSearchParams({ categorieId: selectedCategoryId });
    api.get(`/ingredients?${params}`)
      .then(({ data }) => setIngredients(data as Ingredient[]))
      .catch(() => {})
      .finally(() => setIngredientsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId]);

  // Auto-search when all criteria are ready (and ingredient is pre-selected via URL)
  useEffect(() => {
    if (initIngredientId && (selectedActiviteId || !isEntreprise)) {
      fetchResults();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (isEntreprise && selectedActiviteId) params.set('activiteId', selectedActiviteId);
      if (selectedIngredientId) params.set('ingredientId', selectedIngredientId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const { data } = await api.get(`/api/stock/historique?${params}`);
      setResults(data as HistoriqueApproEntry[]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [isEntreprise, selectedActiviteId, selectedIngredientId, startDate, endDate]);

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('client.historique_appro.title')} — {currentYear}</h1>
      </div>

      {/* Filter panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>

        {/* Entreprise: type selector */}
        {isEntreprise && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['franchise', 'distinct'] as const).map((tp) => (
              <button
                key={tp}
                className={`btn btn-sm ${entType === tp ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setEntType(tp); setSelectedActiviteId(''); setResults([]); setSearched(false); }}
              >
                {tp === 'franchise' ? t('client.historique_appro.franchise') : t('client.historique_appro.distinct')}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Franchise group */}
          {isEntreprise && entType === 'franchise' && franchiseGroups.length > 1 && (
            <div>
              <label style={labelStyle}>{t('client.historique_appro.franchise_group')}</label>
              <select
                className="input" style={{ maxWidth: 200 }}
                value={selectedFranchiseGroup}
                onChange={(e) => setSelectedFranchiseGroup(e.target.value)}
              >
                {franchiseGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}

          {/* Activité (enterprise only) */}
          {isEntreprise && activitesLoading ? (
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{t('common.loading')}</span>
          ) : isEntreprise && activitiesForDropdown.length > 0 && (
            <div>
              <label style={labelStyle}>{t('client.historique_appro.activity')}</label>
              <select
                className="input" style={{ maxWidth: 240 }}
                value={selectedActiviteId}
                onChange={(e) => setSelectedActiviteId(e.target.value)}
              >
                {activitiesForDropdown.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
          )}

          {/* Category */}
          <div>
            <label style={labelStyle}>{t('client.historique_appro.category')}</label>
            <select
              className="input" style={{ maxWidth: 220 }}
              value={selectedCategoryId}
              onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedIngredientId(''); }}
            >
              <option value="">{t('client.historique_appro.all_categories')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>

          {/* Ingredient */}
          <div>
            <label style={labelStyle}>{t('client.historique_appro.ingredient')}</label>
            <select
              className="input" style={{ maxWidth: 240 }}
              value={selectedIngredientId}
              onChange={(e) => setSelectedIngredientId(e.target.value)}
              disabled={ingredientsLoading}
            >
              <option value="">{t('client.historique_appro.all_ingredients')}</option>
              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
            </select>
          </div>

          {/* Start date */}
          <div>
            <label style={labelStyle}>{t('client.historique_appro.start_date')}</label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd}
              value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          {/* End date */}
          <div>
            <label style={labelStyle}>{t('client.historique_appro.end_date')}</label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd}
              value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={fetchResults} disabled={loading}>
            {loading ? t('common.loading') : '🔍 Rechercher'}
          </button>
        </div>
      </div>

      {/* Results */}
      {!searched ? null : loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📦</span>
          <p>{t('client.historique_appro.no_results')}</p>
        </div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('client.historique_appro.col_date')}</th>
                <th>{t('client.historique_appro.col_ingredient')}</th>
                <th>{t('client.historique_appro.col_category')}</th>
                <th style={{ textAlign: 'right' }}>{t('client.historique_appro.col_qty')}</th>
                <th style={{ textAlign: 'right' }}>{t('client.historique_appro.col_price')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{r.dateAppro}</td>
                  <td>{r.ingredientNom}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.categorieNom}</td>
                  <td style={{ textAlign: 'right' }}>{r.quantite ?? '—'} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.uniteNom}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.prixUnitaire !== null ? r.prixUnitaire.toFixed(3) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            {results.length} enregistrement{results.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
