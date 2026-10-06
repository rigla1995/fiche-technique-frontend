import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/client';
import MarkdownView from '../../components/common/MarkdownView';
import EnteteCompta from '../EnteteCompta';

// Manuel de LabFlow Compta (étape S2a, SPEC-SOCLE D15) : les seules fiches du produit « compta » (GET
// /api/manuel?produit=compta), en vocabulaire comptable fixe. Lien profond /manuel#<slug> (bouton « ? » de chaque
// page). Pas de PDF à cette étape.
type Fiche = { id: number; slug: string; titre: string; icone: string | null; partie: string; contenu: string; motsCles: string | null };

export default function ComptaManuel() {
  const location = useLocation();
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  // Fiche demandée par le lien profond /manuel#<slug> (le « ? » ouvre un nouvel onglet : l'ancre est lue au chargement).
  const [slugActif, setSlugActif] = useState(() => location.hash.replace('#', ''));
  const [recherche, setRecherche] = useState('');
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    api.get('/api/manuel', { params: { produit: 'compta' } })
      .then(({ data }) => setFiches(data as Fiche[]))
      .catch(() => setErreur(true))
      .finally(() => setChargement(false));
  }, []);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return fiches;
    return fiches.filter((f) => `${f.titre} ${f.partie} ${f.motsCles || ''} ${f.contenu}`.toLowerCase().includes(q));
  }, [fiches, recherche]);

  const active = visibles.find((f) => f.slug === slugActif) ?? visibles[0];

  // Fiche changée (liste, lien interne, « ? » sur téléphone où la liste passe au-dessus) : son début est ramené à l'écran.
  useEffect(() => {
    const article = articleRef.current;
    if (!active || !article) return;
    const haut = article.getBoundingClientRect().top;
    if (haut < 0 || haut > window.innerHeight * 0.4) article.scrollIntoView({ block: 'start' });
  }, [active?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lien interne vers une autre fiche : la recherche est effacée pour que la fiche visée s'affiche.
  const ouvrir = (slug: string) => { setRecherche(''); setSlugActif(slug); };

  const groupes = useMemo(() => {
    const parPartie = new Map<string, Fiche[]>();
    for (const f of visibles) {
      if (!parPartie.has(f.partie)) parPartie.set(f.partie, []);
      parPartie.get(f.partie)!.push(f);
    }
    return [...parPartie.entries()];
  }, [visibles]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <EnteteCompta />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 48px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.45rem', fontWeight: 900, color: '#0f172a' }}>Manuel de LabFlow Compta</h1>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '0.9rem' }}>Le mode d'emploi de LabFlow Compta, page par page.</p>

        {chargement && <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Chargement du manuel…</p>}
        {!chargement && erreur && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontSize: '0.88rem', fontWeight: 600 }}>
            Le manuel est momentanément indisponible. Réessayez plus tard.
          </div>
        )}

        {!chargement && !erreur && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
            <nav style={{ flex: '1 1 220px', maxWidth: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 0' }}>
              <div style={{ padding: '0 14px 10px' }}>
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher dans le manuel…" aria-label="Rechercher dans le manuel"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '16px', fontFamily: 'inherit' }} />
              </div>
              {groupes.length === 0 && (
                <div style={{ padding: '6px 18px', fontSize: '0.82rem', color: '#94a3b8' }}>
                  {recherche ? 'Aucune fiche ne correspond.' : 'Aucune fiche disponible.'}
                </div>
              )}
              {groupes.map(([partie, items]) => (
                <div key={partie}>
                  <div style={{ padding: '8px 18px 4px', fontSize: '0.64rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{partie}</div>
                  {items.map((f) => {
                    const estActive = active?.slug === f.slug;
                    return (
                      <button key={f.slug} type="button" onClick={() => setSlugActif(f.slug)} aria-current={estActive ? 'page' : undefined}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: estActive ? '#eef2ff' : 'transparent', border: 'none', borderLeft: `3px solid ${estActive ? '#4f46e5' : 'transparent'}`, cursor: 'pointer', textAlign: 'left' }}>
                        <span aria-hidden="true" style={{ fontSize: 13 }}>{f.icone || '📄'}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: estActive ? 700 : 500, color: estActive ? '#3730a3' : '#475569' }}>{f.titre}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <article ref={articleRef} style={{ flex: '999 1 420px', minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', scrollMarginTop: 12 }}>
              {active ? (
                <>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{active.partie}</div>
                  <MarkdownView content={active.contenu} onNavigate={ouvrir} />
                </>
              ) : (
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Aucune fiche à afficher.</p>
              )}
            </article>
          </div>
        )}
      </main>
    </div>
  );
}
