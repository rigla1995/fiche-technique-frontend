// Choix de l'article d'une ligne de facture (fenêtre « Vérifier la facture », page Correspondances) : un champ de
// recherche plutôt qu'une liste déroulante, pour les comptes de centaines ou de milliers d'articles. Fermé, il montre le
// choix ; ouvert, les suggestions (les premiers de la liste donnée : déjà achetés, puis les plus proches de la
// désignation), puis, dès qu'on tape, les articles dont le nom contient tous les mots tapés (30 au plus), et les natures
// « hors stock ». Clavier : flèches, Entrée pour choisir, Échap pour refermer la liste seulement.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { chercherArticles } from './lecture/correspondre';

export interface ArticleChoisissable { id: number; nom: string; unite: string; code?: string | null }

interface Props<T extends ArticleChoisissable> {
  /** '' (rien), 'a:<id>' (un article) ou 'h:<nature>' (hors stock). */
  valeur: string;
  /** Tous les articles, dans l'ordre proposé (les plus probables d'abord). */
  articles: readonly T[];
  natures: readonly { valeur: string; libelle: string }[];
  onChoix: (valeur: string) => void;
  /** Libellés déjà rendus dans le vocabulaire du compte. */
  libelles: { unArticle: string; aucunArticle: string; horsStock: string; groupeHorsStock: string; aChoisir: string };
  /** Titre de groupe d'un article (« Déjà achetés chez ce fournisseur »…) et mention à droite (« hors de ce labo »). */
  groupeDe?: (a: T) => string | undefined;
  noteDe?: (a: T) => string | undefined;
  manquant?: boolean;
  style?: React.CSSProperties;
}

const MAX = 30;
const petit: React.CSSProperties = { padding: '3px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', background: '#fff', minWidth: 0 };

export default function ChoixArticle<T extends ArticleChoisissable>({ valeur, articles, natures, onChoix, libelles, groupeDe, noteDe, manquant, style }: Props<T>) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [actif, setActif] = useState(0);
  const boite = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const id = useId();

  const { trouves, total } = useMemo(
    () => (ouvert ? chercherArticles(articles, recherche, MAX) : { trouves: [] as T[], total: articles.length }),
    [ouvert, articles, recherche],
  );
  const naturesVues = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return t ? natures.filter((n) => n.libelle.toLowerCase().includes(t)) : natures;
  }, [natures, recherche]);
  // Options dans l'ordre, chacune avec le titre de groupe qui la précède s'il change (sans recherche seulement pour les
  // articles : une fois qu'on tape, la liste est une seule suite de résultats).
  const options = useMemo(() => {
    const res: { valeur: string; article: T | null; libelle: string; titre: string | null }[] = [];
    let avant: string | undefined;
    const pousser = (valeur: string, article: T | null, libelle: string, groupe: string | undefined) => {
      res.push({ valeur, article, libelle, titre: groupe && groupe !== avant ? groupe : null });
      if (groupe) avant = groupe;
    };
    for (const a of trouves) pousser(`a:${a.id}`, a, a.nom, recherche.trim() ? undefined : groupeDe?.(a));
    for (const n of naturesVues) pousser(`h:${n.valeur}`, null, n.libelle, libelles.groupeHorsStock);
    return res;
  }, [trouves, naturesVues, recherche, groupeDe, libelles.groupeHorsStock]);

  // Un clic hors du champ referme la liste.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (ev: MouseEvent) => { if (boite.current && !boite.current.contains(ev.target as Node)) setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);
  // L'option active reste visible quand on la déplace au clavier.
  useEffect(() => {
    if (ouvert) liste.current?.querySelector(`[data-rang="${actif}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [actif, ouvert]);

  const ouvrir = () => { setRecherche(''); setActif(0); setOuvert(true); };
  const fermer = (rendreFocus: boolean) => { setOuvert(false); if (rendreFocus) bouton.current?.focus(); };
  const choisir = (v: string) => { onChoix(v); fermer(true); };

  const choisi = valeur.startsWith('a:') ? articles.find((a) => `a:${a.id}` === valeur) : undefined;
  const nature = valeur.startsWith('h:') ? natures.find((n) => `h:${n.valeur}` === valeur) : undefined;
  const affiche = choisi ? `${choisi.code ? `${choisi.code} · ` : ''}${choisi.nom} (${choisi.unite})` : nature ? `${libelles.horsStock} : ${nature.libelle}` : libelles.aChoisir;

  const clavier = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); fermer(true); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActif((k) => Math.min(k + 1, options.length - 1)); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setActif((k) => Math.max(k - 1, 0)); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); if (options[actif]) choisir(options[actif].valeur); return; }
    if (ev.key === 'Tab') setOuvert(false);
  };

  return (
    <div ref={boite} style={{ position: 'relative', ...style }}>
      <button ref={bouton} type="button" aria-haspopup="listbox" aria-expanded={ouvert}
        onClick={() => (ouvert ? fermer(false) : ouvrir())}
        onKeyDown={(ev) => { if (!ouvert && (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ouvrir(); } }}
        style={{ ...petit, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderColor: manquant ? '#f87171' : '#cbd5e1', color: choisi || nature ? '#0f172a' : '#64748b' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{affiche}</span>
        <span aria-hidden="true" style={{ color: '#64748b' }}>▾</span>
      </button>
      {ouvert && (
        <div style={{ marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', boxShadow: '0 6px 18px rgba(15,23,42,0.12)', padding: 6 }}>
          <input autoFocus value={recherche} onKeyDown={clavier}
            onChange={(ev) => { setRecherche(ev.target.value); setActif(0); }}
            role="combobox" aria-expanded="true" aria-controls={`${id}-liste`} aria-activedescendant={options[actif] ? `${id}-${actif}` : undefined}
            aria-label={`Rechercher ${libelles.unArticle}`}
            placeholder={`🔍 Rechercher ${libelles.unArticle} parmi ${total}…`}
            style={{ ...petit, width: '100%', padding: '5px 8px', marginBottom: 6 }} />
          <div ref={liste} id={`${id}-liste`} role="listbox" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {!recherche.trim() && trouves.length > 0 && (
              <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', padding: '2px 6px' }}>Suggestions — tapez pour chercher</div>
            )}
            {options.map((o, k) => {
              const note = o.article ? noteDe?.(o.article) : undefined;
              return (
                <div key={o.valeur}>
                  {o.titre && <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748b', padding: '6px 6px 2px' }}>{o.titre}</div>}
                  <div id={`${id}-${k}`} data-rang={k} role="option" aria-selected={o.valeur === valeur}
                    onMouseDown={(ev) => ev.preventDefault()} onClick={() => choisir(o.valeur)} onMouseEnter={() => setActif(k)}
                    style={{ padding: '4px 8px', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'baseline', background: k === actif ? '#e0e7ff' : o.valeur === valeur ? '#f1f5f9' : 'transparent' }}>
                    <span style={{ flex: 1 }}>
                      {o.article?.code && <span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem', color: '#64748b', marginRight: 6 }}>{o.article.code}</span>}
                      {o.libelle}
                    </span>
                    {o.article && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{o.article.unite}</span>}
                    {note && <span style={{ fontSize: '0.68rem', color: '#b45309' }}>{note}</span>}
                  </div>
                </div>
              );
            })}
            {recherche.trim() && total === 0 && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', padding: '6px 8px' }}>{libelles.aucunArticle}</div>
            )}
            {total > trouves.length && recherche.trim() && (
              <div style={{ fontSize: '0.72rem', color: '#64748b', padding: '6px 8px' }}>… et {total - trouves.length} autres : précisez la recherche.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
