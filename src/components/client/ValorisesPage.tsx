import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { CategorieProduit, Product, Activite } from '../../types';
import ComposedValoriseModal from './ComposedValoriseModal';
import FicheTechniqueModal from './FicheTechniqueModal';
import RecipeTree from './RecipeTree';
import ProductCard from './ProductCard';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import GuideButton from './GuideButton';
import { useConfirm } from '../common/ConfirmDialog';
import { PRODUCT_THEME } from '../../theme/productTheme';

const HERO = PRODUCT_THEME.heroGradient;
const CATS_PER_PAGE = 10;
const COMPOSES_PER_PAGE = 12;

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

interface ArticleValorisable {
  id: number;
  nom: string;
  unite_nom: string | null;
  categorie_nom: string | null;
  famille_nom: string | null;
  categorie_produit_id: number | null;
  categorie_produit_nom: string | null;
}

type StatutFilter = 'all' | 'assigned' | 'unassigned';

export default function ValorisesPage() {
  const { confirm, alerte } = useConfirm();
  const [articles, setArticles] = useState<ArticleValorisable[]>([]);
  const [categories, setCategories] = useState<CategorieProduit[]>([]);
  const [composes, setComposes] = useState<Product[]>([]);
  const [showComposed, setShowComposed] = useState(false);
  const [editComposeId, setEditComposeId] = useState<number | null>(null);
  const [ftProduct, setFtProduct] = useState<Product | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [tab, setTab] = useState<'composes' | 'referentiel'>('composes');
  const [hasLabos, setHasLabos] = useState(false);
  // Formule d'activités du compte : les actions « produits composés » (endpoints
  // produits) sont verrouillées côté serveur si formule 'basique' ET aucun labo.
  const [formuleBasique, setFormuleBasique] = useState(false);
  const [composePage, setComposePage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [allLabos, setAllLabos] = useState<{ id: number; nom: string }[]>([]);
  const [togglingActivite, setTogglingActivite] = useState<string | null>(null);
  const [togglingLabo, setTogglingLabo] = useState<string | null>(null);

  const toggleActiviteAssignment = async (p: Product, activiteId: number) => {
    setTogglingActivite(`${p.id}-${activiteId}`);
    try {
      // Composés valorisés (origine=labo) : cocher une activité les ajoute au STOCK de
      // l'activité (produit_activite_stock) en mode « transfert uniquement » — et non une
      // simple affectation d'affichage. Le badge/blocage d'appro découle de origine='labo'.
      await api.post(`/api/produits/${p.id}/toggle-stock-ingredient`, { activiteId });
      const assigned = p.activites?.some((a) => a.id === activiteId) ?? false;
      setComposes((prev) => prev.map((prod) => prod.id !== p.id ? prod : {
        ...prod,
        activites: assigned ? (prod.activites || []).filter((a) => a.id !== activiteId) : [...(prod.activites || []), allActivities.find((a) => a.id === activiteId)!].filter(Boolean),
      }));
    } catch (e: unknown) { alerte({ title: 'Assignation impossible', message: apiMsg(e, "Erreur lors de l'assignation à l'activité"), tone: 'danger' }); }
    setTogglingActivite(null);
  };
  const toggleLaboAssignment = async (p: Product, laboId: number) => {
    setTogglingLabo(`${p.id}-${laboId}`);
    try {
      await api.post(`/api/produits/${p.id}/toggle-labo`, { laboId });
      const assigned = p.labos?.some((l) => l.id === laboId) ?? false;
      setComposes((prev) => prev.map((prod) => prod.id !== p.id ? prod : {
        ...prod,
        labos: assigned ? (prod.labos || []).filter((l) => l.id !== laboId) : [...(prod.labos || []), allLabos.find((l) => l.id === laboId)!].filter(Boolean),
      }));
    } catch (e: unknown) { alerte({ title: 'Assignation impossible', message: apiMsg(e, "Erreur lors de l'assignation au labo"), tone: 'danger' }); }
    setTogglingLabo(null);
  };

  const [search, setSearch] = useState('');
  const [filterFamille, setFilterFamille] = useState('');
  const [filterStatut, setFilterStatut] = useState<StatutFilter>('all');
  const [page, setPage] = useState(1);

  // Filtres de l'onglet « Composés »
  const [composeSearch, setComposeSearch] = useState('');
  const [composeCat, setComposeCat] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/articles-valorisables'),
      api.get('/api/categories-produit?type=valorise'),
      api.get('/api/products?type=vendable&origine=labo'),
      api.get('/api/labo'),
      api.get('/api/entreprise/activites'),
      api.get('/api/entreprise'),
    ])
      .then(([a, c, p, l, act, ent]) => {
        setArticles(a.data); setCategories(c.data); setComposes(p.data as Product[]);
        setAllLabos((l.data as { id: number; nom: string }[] || []).map((x) => ({ id: x.id, nom: x.nom })));
        setAllActivities((act.data as Activite[]) || []);
        setFormuleBasique(ent.data?.formule_activites === 'basique');
        // Les produits composés sont fabriqués au labo : sans labo, pas d'onglet « Composés »
        // ni de bouton d'ajout. On bascule alors sur l'onglet « Référentiel ».
        const labosExist = Array.isArray(l.data) && l.data.length > 0;
        setHasLabos(labosExist);
        if (!labosExist) { setTab('referentiel'); setShowComposed(false); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openView = (p: Product) => { setViewProduct(p); };

  // FT d'un composé : le modal charge lui-même les contextes assignés (activités + labos)
  // via GET /api/products/:id/ft-contextes — plus de sélection préalable du labo ici.
  const openFt = (p: Product) => setFtProduct(p);
  const closeFt = () => setFtProduct(null);

  const deleteCompose = async (p: Product) => {
    if (!(await confirm({
      title: `Supprimer « ${p.name} » ?`,
      message: 'Ce produit valorisé composé sera définitivement supprimé.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    }))) return;
    setDeletingId(p.id);
    try {
      await api.delete(`/api/products/${p.id}`);
      setComposes(prev => prev.filter(x => x.id !== p.id));
    } catch (e: unknown) { alerte({ title: 'Suppression impossible', message: apiMsg(e, 'Erreur lors de la suppression'), tone: 'danger' }); }
    finally { setDeletingId(null); }
  };

  const assign = async (article: ArticleValorisable, categorieId: string) => {
    setSavingId(article.id);
    const catId = categorieId ? parseInt(categorieId) : null;
    try {
      await api.put(`/api/articles-valorisables/${article.id}/categorie`, { categorie_produit_id: catId });
      setArticles(prev => prev.map(a => a.id === article.id
        ? { ...a, categorie_produit_id: catId, categorie_produit_nom: categories.find(c => c.id === catId)?.name ?? null }
        : a));
    } catch (e: unknown) { alerte({ title: 'Enregistrement impossible', message: apiMsg(e, "Erreur lors de l'enregistrement"), tone: 'danger' }); }
    finally { setSavingId(null); }
  };

  const familles = useMemo(
    () => Array.from(new Set(articles.map(a => a.famille_nom).filter(Boolean))).sort() as string[],
    [articles]
  );

  const assignedCount = articles.filter(a => a.categorie_produit_id).length;

  // Composés — catégories présentes + filtrage (recherche nom/réf + catégorie produit)
  const composeCats = useMemo(
    () => Array.from(new Set(composes.map(c => c.categorieProduitName).filter(Boolean))).sort() as string[],
    [composes]
  );
  const hasComposeFilters = !!composeSearch || !!composeCat;
  const filteredComposes = useMemo(() => composes.filter(p => {
    if (composeSearch && !`${p.name} ${p.refProduit ?? ''}`.toLowerCase().includes(composeSearch.toLowerCase())) return false;
    if (composeCat && (p.categorieProduitName ?? '') !== composeCat) return false;
    return true;
  }), [composes, composeSearch, composeCat]);
  const composeTotalPages = Math.max(1, Math.ceil(filteredComposes.length / COMPOSES_PER_PAGE));
  const safeComposePage = Math.min(composePage, composeTotalPages);
  const resetComposeFilters = () => { setComposeSearch(''); setComposeCat(''); setComposePage(1); };
  // Re-borne la page dans l'état quand le nombre de pages diminue (suppression, reload, filtre élargi) :
  // sans ça, composePage peut rester sur une page disparue et faire atterrir sur la mauvaise page au prochain agrandissement de la liste.
  useEffect(() => { if (composePage > composeTotalPages) setComposePage(composeTotalPages); }, [composeTotalPages, composePage]);

  const filtered = articles.filter(a => {
    if (search && !a.nom.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterFamille && a.famille_nom !== filterFamille) return false;
    if (filterStatut === 'assigned' && !a.categorie_produit_id) return false;
    if (filterStatut === 'unassigned' && a.categorie_produit_id) return false;
    return true;
  });

  // Grouper par catégorie d'article (référentiel)
  const groups = useMemo(() => {
    const map = new Map<string, ArticleValorisable[]>();
    for (const a of filtered) {
      const key = a.categorie_nom ?? 'Sans catégorie';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries())
      .sort((x, y) => x[0].localeCompare(y[0], 'fr'))
      .map(([cat, items]) => ({
        cat,
        famille: items[0].famille_nom ?? null,
        items: items.slice().sort((m, n) => m.nom.localeCompare(n.nom, 'fr')),
      }));
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(groups.length / CATS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  // Idem onglet Référentiel : re-borne la page si le nombre de pages diminue (filtres).
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageGroups = groups.slice((safePage - 1) * CATS_PER_PAGE, safePage * CATS_PER_PAGE);

  const resetFilters = () => { setSearch(''); setFilterFamille(''); setFilterStatut('all'); setPage(1); };
  const hasFilters = !!search || !!filterFamille || filterStatut !== 'all';

  // Règle serveur : les actions produits composés (création/édition/suppression,
  // assignations) renvoient 403 FORMULE_BASIQUE si formule 'basique' ET aucun labo.
  // On masque donc ces actions et on affiche une note discrète à la place.
  const composedLocked = formuleBasique && !hasLabos;
  const composedLockedNote = (
    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
      Produits composés : formule Premium requise
    </span>
  );


  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: HERO, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(30,27,75,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>💎</div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Produits valorisés</h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.83rem', margin: 0 }}>
              Vendus tels quels : articles du référentiel (catégorie à assigner) + produits composés fabriqués au labo
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#818cf8', lineHeight: 1 }}>{assignedCount}/{articles.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>articles catégorisés</div>
            </div>
            <GuideButton section="articles-valorises" />
          </div>
        </div>
      </div>

      {/* Onglets — l'onglet « Composés » n'apparaît que si le client a au moins un labo */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 18 }}>
        {(([
          ...(hasLabos ? [['composes', `🏭 Composés (${composes.length})`]] : []),
          ['referentiel', `💎 Référentiel (${articles.length})`],
        ]) as ['composes' | 'referentiel', string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '9px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: tab === key ? 700 : 400, color: tab === key ? '#6366f1' : 'var(--text)', borderBottom: tab === key ? '3px solid #6366f1' : '3px solid transparent' }}>
            {label}
          </button>
        ))}
        {/* Formule basique sans labo : les produits composés ne sont pas disponibles */}
        {!loading && composedLocked && (
          <span style={{ marginLeft: 'auto', alignSelf: 'center', padding: '0 4px' }}>{composedLockedNote}</span>
        )}
      </div>

      {hasLabos && tab === 'composes' && (<>
        {/* Barre de filtres (composant partagé, mode direct) — bouton d'ajout dans actions */}
        <HistoryFilterBar
          accent="#6366f1" accentDark="#4338ca"
          subtitle={composes.length > 0 ? `${filteredComposes.length} produit${filteredComposes.length !== 1 ? 's' : ''}` : undefined}
          onReset={resetComposeFilters}
          showReset={hasComposeFilters}
          actions={composedLocked ? composedLockedNote : <button onClick={() => setShowComposed(true)} style={{ height: 36, background: 'linear-gradient(135deg, #4338ca, #818cf8)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, padding: '0 18px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>+ Produit valorisé composé</button>}
        >
          {composes.length > 0 && (<>
            <FilterField label="🔍 Produit"><FilterInput value={composeSearch} onChange={e => { setComposeSearch(e.target.value); setComposePage(1); }} placeholder="Nom ou réf…" /></FilterField>
            {composeCats.length > 0 && (
              <FilterField label="🏷️ Catégorie">
                <FilterSelect value={composeCat} onChange={e => { setComposeCat(e.target.value); setComposePage(1); }}>
                  <option value="">Toutes les catégories</option>
                  {composeCats.map(c => <option key={c} value={c}>{c}</option>)}
                </FilterSelect>
              </FilterField>
            )}
          </>)}
        </HistoryFilterBar>

        {composes.length === 0 ? (
          <div style={{ background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', border: '2px dashed #c7d2fe', borderRadius: 18, padding: '40px 32px', textAlign: 'center', color: '#3730a3' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🏭</div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Aucun produit composé</div>
            <div style={{ fontSize: '0.88rem' }}>Cliquez sur « + Produit valorisé composé » ci-dessus pour en créer un.</div>
          </div>
        ) : filteredComposes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun produit composé pour ces filtres.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {filteredComposes.slice((safeComposePage - 1) * COMPOSES_PER_PAGE, safeComposePage * COMPOSES_PER_PAGE).map((p) => {
                const nbArt = p.ingredientsCount ?? 0;
                const nbSub = p.subProductsCount ?? 0;
                const summaryParts: string[] = [];
                if (nbArt) summaryParts.push(`${nbArt} article${nbArt > 1 ? 's' : ''}`);
                if (nbSub) summaryParts.push(`${nbSub} PU`);
                const togId = (key: string | null) => (key && key.startsWith(`${p.id}-`)) ? Number(key.slice(`${p.id}-`.length)) : null;
                return (
                  <ProductCard
                    key={p.id}
                    product={p}
                    icon="💎"
                    iconGradient="linear-gradient(135deg,#6366f1,#4338ca)"
                    badges={<span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: 20, padding: '2px 8px' }}>🏷️ {p.categorieProduitName ?? 'Sans catégorie'}</span>}
                    onVoir={() => openView(p)}
                    voirSummary={summaryParts.join('  ·  ') || undefined}
                    actions={(
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                        {/* Rangée d'actions alignée sur renderActions de ProductList : icône + label empilés */}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                          <button
                            onClick={() => openFt(p)}
                            disabled={(p.ingredientsCount ?? 0) === 0}
                            title="Générer la Fiche Technique"
                            style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 8px', borderRadius: 7, fontSize: '0.6rem', fontWeight: 600, minWidth: 54, background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', cursor: (p.ingredientsCount ?? 0) === 0 ? 'not-allowed' : 'pointer', opacity: (p.ingredientsCount ?? 0) === 0 ? 0.5 : 1 }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#217346"/><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/><path d="M14 2V8H20L14 2Z" fill="#107C41"/><text x="7" y="18" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">XLS</text></svg>
                            Fiche tech.
                          </button>
                          {!composedLocked && (
                            <>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Modifier"
                                onClick={() => setEditComposeId(p.id)}
                                style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 8px', borderRadius: 7, fontSize: '0.6rem', fontWeight: 600, color: '#374151', minWidth: 54 }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                                Modifier
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                title="Supprimer"
                                onClick={() => deleteCompose(p)}
                                disabled={deletingId === p.id}
                                style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 8px', borderRadius: 7, fontSize: '0.6rem', fontWeight: 600, minWidth: 54 }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                  <path d="M10 11v6M14 11v6"/>
                                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                </svg>
                                Supprimer
                              </button>
                            </>
                          )}
                        </div>
                        {composedLocked && <div style={{ textAlign: 'center' }}>{composedLockedNote}</div>}
                      </div>
                    )}
                    activities={allActivities.map((a) => ({ id: a.id, nom: a.nom }))}
                    assignedActiviteIds={new Set((p.activites ?? []).map((a) => a.id))}
                    togglingActiviteId={togId(togglingActivite)}
                    onToggleActivite={(id) => toggleActiviteAssignment(p, id)}
                    labos={allLabos}
                    assignedLaboIds={new Set((p.labos ?? []).map((l) => l.id))}
                    togglingLaboId={togId(togglingLabo)}
                    onToggleLabo={(id) => toggleLaboAssignment(p, id)}
                    canWrite={!composedLocked}
                  />
                );
              })}
            </div>
            {filteredComposes.length > COMPOSES_PER_PAGE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 }}>
                <button disabled={safeComposePage <= 1} onClick={() => setComposePage(safeComposePage - 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: safeComposePage <= 1 ? 'default' : 'pointer', fontWeight: 700, opacity: safeComposePage <= 1 ? 0.4 : 1 }}>‹</button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{safeComposePage} / {composeTotalPages}</span>
                <button disabled={safeComposePage >= composeTotalPages} onClick={() => setComposePage(safeComposePage + 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer', fontWeight: 700, opacity: safeComposePage >= composeTotalPages ? 0.4 : 1 }}>›</button>
              </div>
            )}
          </>
        )}
      </>)}

      {tab === 'referentiel' && (<>
      {/* Barre de filtres (composant partagé, mode direct) */}
      <HistoryFilterBar
        accent="#6366f1" accentDark="#4338ca"
        subtitle={`${filtered.length} article${filtered.length !== 1 ? 's' : ''} · ${groups.length} catégorie${groups.length !== 1 ? 's' : ''}`}
        onReset={resetFilters}
        showReset={hasFilters}
      >
        <FilterField label="🔍 Article"><FilterInput value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Nom de l'article…" /></FilterField>
        {familles.length > 0 && (
          <FilterField label="🗂️ Famille">
            <FilterSelect value={filterFamille} onChange={e => { setFilterFamille(e.target.value); setPage(1); }}>
              <option value="">Toutes les familles</option>
              {familles.map(f => <option key={f} value={f}>{f}</option>)}
            </FilterSelect>
          </FilterField>
        )}
        <FilterField label="🏷️ Statut">
          <FilterSelect value={filterStatut} onChange={e => { setFilterStatut(e.target.value as StatutFilter); setPage(1); }}>
            <option value="all">Tous</option>
            <option value="assigned">Catégorisés</option>
            <option value="unassigned">Non catégorisés</option>
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {categories.length === 0 && !loading && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#92400e' }}>
          ⚠️ Aucune catégorie de type « Article valorisé ». Créez-en d'abord dans <strong>Catégories Produits</strong>.
        </div>
      )}

      {/* Liste groupée */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : articles.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', border: '2px dashed #c7d2fe', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>💎</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#3730a3', margin: '0 0 8px' }}>Aucun article valorisable</h3>
          <p style={{ color: '#4338ca', fontSize: '0.88rem', margin: 0, maxWidth: 440, marginInline: 'auto' }}>Les articles valorisables proviennent des familles marquées « vendable » et « non consommable » dans votre référentiel.</p>
        </div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour ces filtres.</div>
      ) : (
        <>
          {pageGroups.map(group => (
            <div key={group.cat} className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', borderBottom: '1px solid #c7d2fe' }}>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#3730a3' }}>🗂️ {group.cat}</span>
                {group.famille && <span style={{ fontSize: '0.72rem', color: '#4338ca', fontWeight: 600 }}>· {group.famille}</span>}
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#4338ca', fontWeight: 700, background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '2px 9px' }}>{group.items.length}</span>
              </div>
              <div className="table-responsive">
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th style={{ width: 220 }}>Catégorie produit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>
                          {a.nom}
                          {a.unite_nom && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>({a.unite_nom})</span>}
                        </td>
                        <td>
                          <select
                            value={a.categorie_produit_id ? String(a.categorie_produit_id) : ''}
                            disabled={savingId === a.id || categories.length === 0}
                            onChange={e => assign(a, e.target.value)}
                            style={{ minWidth: 180, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${a.categorie_produit_id ? '#c7d2fe' : '#fca5a5'}`, background: a.categorie_produit_id ? '#eef2ff' : '#fef2f2', fontSize: '0.85rem', color: '#0f172a', cursor: 'pointer' }}
                          >
                            <option value="">— Aucune —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Catégories {(safePage - 1) * CATS_PER_PAGE + 1}–{Math.min(safePage * CATS_PER_PAGE, groups.length)} sur {groups.length}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#fff', color: '#6366f1', cursor: safePage <= 1 ? 'default' : 'pointer', fontWeight: 700, opacity: safePage <= 1 ? 0.4 : 1 }}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} style={{ minWidth: 32, padding: '4px 9px', borderRadius: 7, border: `1.5px solid ${p === safePage ? '#6366f1' : '#c7d2fe'}`, background: p === safePage ? '#6366f1' : '#fff', color: p === safePage ? '#fff' : '#3730a3', fontWeight: p === safePage ? 800 : 500, cursor: 'pointer' }}>{p}</button>
                ))}
                <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#fff', color: '#6366f1', cursor: safePage >= totalPages ? 'default' : 'pointer', fontWeight: 700, opacity: safePage >= totalPages ? 0.4 : 1 }}>›</button>
              </div>
            </div>
          )}
        </>
      )}
      </>)}

      {(showComposed || editComposeId !== null) && (
        <ComposedValoriseModal
          categories={categories}
          editProductId={editComposeId ?? undefined}
          onClose={() => { setShowComposed(false); setEditComposeId(null); }}
          onCreated={() => { setShowComposed(false); setEditComposeId(null); load(); }}
        />
      )}

      {viewProduct && (
        <div className="modal-overlay" onClick={() => setViewProduct(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>💎 {viewProduct.name}</h2>
              <button className="modal-close" onClick={() => setViewProduct(null)}>×</button>
            </div>
            <div className="modal-body">
              <RecipeTree productId={viewProduct.id} />
            </div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setViewProduct(null)}>Fermer</button></div>
          </div>
        </div>
      )}

      {/* FT : le modal charge lui-même les contextes assignés (activités + labos).
          Repli FT Manuel (produit sans aucun contexte) : première activité, comme
          l'ancienne branche « composé sans labo » — continuité des prix manuels. */}
      {ftProduct && (
        <FicheTechniqueModal
          productId={ftProduct.id}
          productName={ftProduct.name}
          hasIngredients={(ftProduct.ingredientsCount ?? 0) > 0}
          fallbackActId={ftProduct.activites?.[0]?.id ?? 0}
          onClose={closeFt}
        />
      )}
    </div>
  );
}
