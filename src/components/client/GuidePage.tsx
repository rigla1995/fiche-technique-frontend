import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/client';
import MarkdownView from '../common/MarkdownView';

/**
 * Centre d'aide — le contenu du manuel vient de la base (table manuel_sections,
 * éditable depuis l'admin). Deep-links conservés : /client/guide#<slug>
 * (utilisés par HelpButton / GuideButton).
 */
export interface ManuelSection {
  id: number;
  slug: string;
  titre: string;
  icone: string | null;
  partie: string;
  ordre: number;
  contenu: string;
  motsCles: string | null;
}

export default function GuidePage() {
  const location = useLocation();
  const [sections, setSections] = useState<ManuelSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSlug, setActiveSlug] = useState('');
  const [search, setSearch] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/manuel')
      .then(({ data }) => setSections(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Deep-link #slug (HelpButton, GuideButton, liens internes)
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) setActiveSlug(hash);
  }, [location.hash]);

  const active = sections.find((s) => s.slug === activeSlug) ?? sections[0];

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [active?.slug]);

  // Sections visibles dans la navigation (filtrées par la recherche)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) =>
      `${s.titre} ${s.partie} ${s.motsCles || ''} ${s.contenu}`.toLowerCase().includes(q));
  }, [sections, search]);

  // Pendant une recherche, si la section affichée sort des résultats, basculer sur le premier résultat.
  useEffect(() => {
    if (!search.trim() || visible.length === 0 || sections.length === 0) return;
    const currentSlug = (sections.find((s) => s.slug === activeSlug) ?? sections[0]).slug;
    if (!visible.some((s) => s.slug === currentSlug)) setActiveSlug(visible[0].slug);
  }, [search, visible, activeSlug, sections]);

  // Groupes de navigation par partie, dans l'ordre global
  const groups = useMemo(() => {
    const map = new Map<string, ManuelSection[]>();
    for (const s of visible) {
      if (!map.has(s.partie)) map.set(s.partie, []);
      map.get(s.partie)!.push(s);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <div className="page" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af 0%,#3b82f6 100%)', padding: '20px 28px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            📖
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>Manuel d'utilisation</h1>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Guide complet de l'application LabFlow</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar : recherche + groupes */}
        <nav style={{ width: 240, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0 14px 10px' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Rechercher dans le manuel…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontFamily: 'inherit', background: '#fff' }}
            />
          </div>
          {loading && <div style={{ padding: '10px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>Chargement…</div>}
          {!loading && groups.length === 0 && (
            <div style={{ padding: '10px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>
              {search ? 'Aucune section ne correspond.' : 'Aucune section disponible.'}
            </div>
          )}
          {groups.map(([partie, items]) => (
            <div key={partie}>
              <div style={{ padding: '8px 18px 4px', fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {partie}
              </div>
              {items.map((s) => {
                const isActive = active && s.slug === active.slug;
                return (
                  <button
                    key={s.slug}
                    onClick={() => setActiveSlug(s.slug)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 18px',
                      background: isActive ? '#eff6ff' : 'transparent',
                      border: 'none',
                      borderLeft: `3px solid ${isActive ? '#2563eb' : 'transparent'}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{s.icone || '📄'}</span>
                    <span style={{ fontSize: '0.80rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#1d4ed8' : '#475569' }}>
                      {s.titre}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Contenu */}
        <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', overscrollBehavior: 'contain' }}>
          <div style={{ maxWidth: 700 }}>
            {loading && <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Chargement du manuel…</div>}
            {!loading && error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '14px 18px', fontSize: '0.88rem' }}>
                Le manuel est momentanément indisponible. Réessayez plus tard ou contactez le support.
              </div>
            )}
            {!loading && !error && active && (
              <>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  {active.partie}
                </div>
                <MarkdownView content={active.contenu} onNavigate={(slug) => setActiveSlug(slug)} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
