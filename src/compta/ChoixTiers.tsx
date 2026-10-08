import { useMemo, useState } from 'react';
import type { TiersCourt } from './ecritures';
import { normaliser } from './plan';
import { inp, lbl, pastille, petit } from './styles';

// LabFlow Compta, étape S6a : choix d'un tiers sur une ligne d'écriture passée sur un compte collectif (fournisseurs ou
// clients). Un dossier peut compter des centaines de tiers : une recherche (début du code ou mot du nom) remplace la
// liste déroulante — les 30 premiers résultats, le tiers choisi affiché au-dessus (même modèle que ChoixCompte).
// `tiers` : les tiers proposés (actifs, du type attendu par le compte) ; `valeur` : identifiant choisi ou null ; S6c :
// `facultatif` (grand livre : « Aucun tiers » plutôt que « Tiers à choisir », bouton « Aucun » pour retirer) et `vide` (texte
// d'une liste vide, à la place du conseil de la saisie).
export function ChoixTiers({ id, libelle, tiers, valeur, onChange, disabled = false, aide, facultatif = false, vide }: {
  id: string; libelle: string; tiers: TiersCourt[]; valeur: number | null; onChange: (t: TiersCourt | null) => void; disabled?: boolean; aide?: string; facultatif?: boolean; vide?: string;
}) {
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const choisi = useMemo(() => tiers.find((t) => t.id === valeur) || null, [tiers, valeur]);
  const normalises = useMemo(() => new Map(tiers.map((t) => [t.id, normaliser(t.nom)])), [tiers]);
  const t = q.trim();
  const resultats = useMemo(() => {
    if (!ouvert) return [];
    const n = normaliser(t);
    const liste = !t ? tiers : tiers.filter((x) => x.code.toLowerCase().startsWith(t.toLowerCase()) || (normalises.get(x.id) || '').includes(n));
    return liste.slice(0, 30);
  }, [tiers, t, ouvert, normalises]);
  const choisir = (x: TiersCourt | null) => { onChange(x); setQ(''); setOuvert(false); };
  const champVisible = !choisi || ouvert;
  return (
    <div>
      {/* Le libellé ne vise le champ de recherche que lorsqu'il est rendu ; sinon il titre le tiers choisi. */}
      {champVisible ? <label htmlFor={id} style={lbl}>{libelle}</label> : <div style={lbl}>{libelle}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, fontSize: '0.84rem' }}>
        {choisi ? (
          <>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b' }}>{choisi.code}</span>
            <span style={{ color: '#0f172a', fontWeight: 600, overflowWrap: 'anywhere' }}>{choisi.nom}</span>
            {choisi.retenue && <span style={pastille('#eef2ff', '#3730a3')} title="Retenue par défaut de ce tiers">{choisi.retenue.code}</span>}
          </>
        ) : facultatif ? <span style={{ color: '#64748b' }}>Aucun tiers</span> : <span style={{ color: '#b45309', fontWeight: 600 }}>Tiers à choisir (compte collectif)</span>}
        {choisi && !disabled && <button type="button" onClick={() => choisir(null)} aria-label={facultatif ? `${libelle} : aucun tiers` : `${libelle} : changer de tiers`} style={petit('#fff', '#475569', '#cbd5e1')}>{facultatif ? 'Aucun' : 'Changer'}</button>}
      </div>
      {champVisible && (
        <input id={id} type="search" value={q} onChange={(e) => { setQ(e.target.value); setOuvert(true); }} onFocus={() => setOuvert(true)} disabled={disabled} autoComplete="off"
          placeholder="Rechercher : code ou nom" aria-label={`${libelle} : rechercher un tiers`} style={inp}
          role="combobox" aria-expanded={ouvert} aria-controls={`${id}-liste`} aria-autocomplete="list"
          // Entrée choisit le seul résultat restant ; Échap ferme la liste SANS fermer la fenêtre qui contient le champ.
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (resultats.length === 1) choisir(resultats[0]); } if (e.key === 'Escape' && ouvert) { e.stopPropagation(); setOuvert(false); } }} />
      )}
      {ouvert && !disabled && (
        <div id={`${id}-liste`} role="listbox" aria-label={`Tiers proposés pour ${libelle}`} style={{ marginTop: 4, border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 200, overflowY: 'auto', background: '#fff' }}>
          {resultats.length === 0 && <div style={{ padding: '8px 10px', fontSize: '0.8rem', color: '#64748b' }}>{tiers.length ? 'Aucun tiers ne correspond.' : (vide || 'Aucun tiers actif de ce type : créez-le sur la page Tiers.')}</div>}
          {resultats.map((x) => (
            <button key={x.id} type="button" role="option" aria-selected={x.id === valeur} onClick={() => choisir(x)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', background: x.id === valeur ? '#eef2ff' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b', minWidth: 64 }}>{x.code}</span>
              <span style={{ color: '#0f172a', flex: 1, overflowWrap: 'anywhere' }}>{x.nom}</span>
              {x.delaiPaiement > 0 && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{x.delaiPaiement} j</span>}
            </button>
          ))}
          {tiers.length > resultats.length && resultats.length === 30 && <div style={{ padding: '6px 10px', fontSize: '0.74rem', color: '#64748b' }}>Les 30 premiers sont affichés : précisez la recherche.</div>}
          <div style={{ padding: '4px 10px', textAlign: 'right' }}><button type="button" onClick={() => setOuvert(false)} style={{ border: 'none', background: 'none', color: '#4338ca', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>Fermer</button></div>
        </div>
      )}
      {aide && <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>{aide}</div>}
    </div>
  );
}
