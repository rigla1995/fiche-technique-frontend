import { useMemo, useState } from 'react';
import type { CompteCourt } from './journaux';
import { normaliser } from './plan';
import { inp, lbl, pastille, petit } from './styles';

// LabFlow Compta, étape S5b : choix d'un compte du plan dans un formulaire (compte de contrepartie d'un journal, comptes
// d'un code de taxe). Le plan compte 600 à 1 000 comptes : une recherche (début du numéro ou mot du libellé) remplace la
// liste déroulante — les 30 premiers résultats, le compte choisi affiché au-dessus. Un compte non imputable (sous-comptes
// actifs) reste proposé mais marqué « sous-comptes actifs » : le serveur ne bloque rien en S5, la page prévient.
// `comptes` : les comptes proposés (actifs, déjà filtrés par nature par le serveur s'il le faut) ; `valeur` : identifiant
// choisi ou null ; `facultatif` : « Aucun » possible.
export function ChoixCompte({ id, libelle, comptes, valeur, onChange, disabled = false, facultatif = false, aide }: {
  id: string; libelle: string; comptes: CompteCourt[]; valeur: number | null; onChange: (id: number | null) => void; disabled?: boolean; facultatif?: boolean; aide?: string;
}) {
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const choisi = useMemo(() => comptes.find((c) => c.id === valeur) || null, [comptes, valeur]);
  const normalises = useMemo(() => new Map(comptes.map((c) => [c.id, normaliser(c.libelle)])), [comptes]);
  const t = q.trim();
  const resultats = useMemo(() => {
    if (!ouvert) return [];
    const liste = !t ? comptes : /^\d+$/.test(t) ? comptes.filter((c) => c.numero.startsWith(t)) : comptes.filter((c) => (normalises.get(c.id) || '').includes(normaliser(t)));
    return liste.slice(0, 30);
  }, [comptes, t, ouvert, normalises]);
  const choisir = (c: CompteCourt | null) => { onChange(c ? c.id : null); setQ(''); setOuvert(false); };
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={lbl}>{libelle}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, fontSize: '0.84rem' }}>
        {choisi ? (
          <>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b' }}>{choisi.numero}</span>
            <span style={{ color: '#0f172a', fontWeight: 600, overflowWrap: 'anywhere' }}>{choisi.libelle}</span>
            {!choisi.imputable && <span style={pastille('#fef3c7', '#92400e')} title="Ce compte a des sous-comptes actifs : les écritures iront sur un sous-compte">sous-comptes actifs</span>}
          </>
        ) : <span style={{ color: '#64748b' }}>{facultatif ? 'Aucun compte' : 'Aucun compte choisi'}</span>}
        {facultatif && choisi && !disabled && <button type="button" onClick={() => choisir(null)} style={petit('#fff', '#475569', '#cbd5e1')}>Aucun</button>}
      </div>
      <input id={id} type="search" value={q} onChange={(e) => { setQ(e.target.value); setOuvert(true); }} onFocus={() => setOuvert(true)} disabled={disabled} autoComplete="off"
        placeholder={choisi ? 'Changer : numéro ou libellé' : 'Rechercher : numéro ou libellé'} aria-label={`${libelle} : rechercher un compte`} style={inp}
        role="combobox" aria-expanded={ouvert} aria-controls={`${id}-liste`} aria-autocomplete="list"
        // Entrée choisit le seul résultat restant ; Échap ferme la liste SANS fermer la fenêtre qui contient le champ (relecture).
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (resultats.length === 1) choisir(resultats[0]); } if (e.key === 'Escape' && ouvert) { e.stopPropagation(); setOuvert(false); } }} />
      {ouvert && !disabled && (
        <div id={`${id}-liste`} role="listbox" aria-label={`Comptes proposés pour ${libelle}`} style={{ marginTop: 4, border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 200, overflowY: 'auto', background: '#fff' }}>
          {resultats.length === 0 && <div style={{ padding: '8px 10px', fontSize: '0.8rem', color: '#64748b' }}>Aucun compte ne correspond.</div>}
          {resultats.map((c) => (
            <button key={c.id} type="button" role="option" aria-selected={c.id === valeur} onClick={() => choisir(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', background: c.id === valeur ? '#eef2ff' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b', minWidth: 64 }}>{c.numero}</span>
              <span style={{ color: '#0f172a', flex: 1, overflowWrap: 'anywhere' }}>{c.libelle}</span>
              {!c.imputable && <span style={pastille('#fef3c7', '#92400e')}>sous-comptes actifs</span>}
            </button>
          ))}
          {comptes.length > resultats.length && resultats.length === 30 && <div style={{ padding: '6px 10px', fontSize: '0.74rem', color: '#64748b' }}>Les 30 premiers sont affichés : précisez la recherche (Entrée choisit le seul résultat restant).</div>}
          <div style={{ padding: '4px 10px', textAlign: 'right' }}><button type="button" onClick={() => setOuvert(false)} style={{ border: 'none', background: 'none', color: '#4338ca', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>Fermer</button></div>
        </div>
      )}
      {aide && <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>{aide}</div>}
    </div>
  );
}
