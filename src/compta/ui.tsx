import { useMemo, useState } from 'react';
import { NIVEAUX, type DossierChoix, type DossiersAcces, type Niveau } from './comptables';
import { inp, lbl, pastille } from './styles';

// LabFlow Compta : éléments d'écran partagés par ses pages (étape S3c ; repris à l'identique des pages des étapes S2b et
// S3b) — carte à en-tête, ligne « libellé : valeur », choix du niveau d'un accès, choix des dossiers d'un accès (S4c).
// Styles : styles.ts.

export function Carte({ titre, sousTitre, children }: { titre: string; sousTitre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef2ff', background: 'linear-gradient(135deg,#f8faff,#eef2ff)' }}>
        <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.95rem' }}>{titre}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{sousTitre}</div>
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  );
}

export function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ color: '#64748b' }}>{libelle}</span>
      <span style={{ color: '#0f172a', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{valeur}</span>
    </div>
  );
}

// Niveau d'un accès (Consultation / Saisie / Complet, validés par le client le 07/10), en boutons radio. `id` : identifiant
// du libellé du groupe (un par formulaire).
export function ChoixNiveau({ id, valeur, onChange }: { id: string; valeur: Niveau; onChange: (n: Niveau) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div id={id} style={lbl}>Niveau</div>
      <div role="radiogroup" aria-labelledby={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {NIVEAUX.map((n) => (
          <button key={n.valeur} type="button" role="radio" aria-checked={valeur === n.valeur} aria-label={n.libelle} onClick={() => onChange(n.valeur)}
            style={{ flex: '1 1 180px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${valeur === n.valeur ? '#4338ca' : '#e2e8f0'}`, background: valeur === n.valeur ? '#eef2ff' : '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: valeur === n.valeur ? '#3730a3' : '#374151' }}>{valeur === n.valeur ? '✓ ' : ''}{n.libelle}</div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{n.aide}</div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>Sur les dossiers : Complet crée et modifie, Saisie et Consultation consultent ; la saisie des écritures viendra.</div>
    </div>
  );
}

// S4c (réponses 2 et 4 du client du 07/10) : les dossiers d'un accès — « Tous les dossiers » (ceux d'aujourd'hui et ceux
// à venir) ou « Choisir » (liste à cocher parmi les dossiers de la comptabilité, archivés compris). `id` : identifiant du
// libellé du groupe (un par formulaire) ; l'appelant donne une `key` par ouverture pour repartir d'un état neuf. Dans un
// <form>, Entrée dans le filtre ou sur une case ne soumet rien (relecture : sinon l'accès partait avec la liste du moment).
const OPTIONS_DOSSIERS: { valeur: 'tous' | 'choisir'; libelle: string; aide: string }[] = [
  { valeur: 'tous', libelle: 'Tous les dossiers', aide: 'ceux d\'aujourd\'hui et ceux à venir' },
  { valeur: 'choisir', libelle: 'Choisir', aide: 'seulement les dossiers cochés' },
];
const sansEntree = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); };
export function ChoixDossiers({ id, valeur, onChange, dossiers, libelle = 'Dossiers' }: { id: string; valeur: DossiersAcces; onChange: (v: DossiersAcces) => void; dossiers: DossierChoix[]; libelle?: string }) {
  // Dernière liste cochée : gardée quand on passe à « Tous » puis qu'on revient à « Choisir ».
  const [derniereListe, setDerniereListe] = useState<number[]>(valeur === 'tous' ? [] : valeur);
  const [filtre, setFiltre] = useState('');
  const choisir = valeur !== 'tous';
  const coches = valeur === 'tous' ? [] : valeur;
  const poser = (liste: number[]) => { setDerniereListe(liste); onChange(liste); };
  const basculer = (idDossier: number) => poser(coches.includes(idDossier) ? coches.filter((x) => x !== idDossier) : [...coches, idDossier].sort((a, b) => a - b));
  const q = filtre.trim().toLowerCase();
  const visibles = useMemo(() => dossiers.filter((d) => !q || d.nom.toLowerCase().includes(q) || (d.matriculeFiscal || '').toLowerCase().includes(q)), [dossiers, q]);
  // « Tout cocher / décocher » : sur les dossiers affichés quand un filtre est saisi, sinon sur tous.
  const idsVisibles = visibles.map((d) => d.id);
  const cocherVisibles = () => poser([...new Set([...coches, ...idsVisibles])].sort((a, b) => a - b));
  const decocherVisibles = () => poser(coches.filter((x) => !idsVisibles.includes(x)));
  const portee = q ? ` les ${visibles.length} affiché${visibles.length > 1 ? 's' : ''}` : '';
  return (
    <div style={{ marginBottom: 12 }} onKeyDown={sansEntree}>
      <div id={id} style={lbl}>{libelle}</div>
      <div role="radiogroup" aria-labelledby={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {OPTIONS_DOSSIERS.map((o) => {
          const actif = (o.valeur === 'choisir') === choisir;
          return (
            <button key={o.valeur} type="button" role="radio" aria-checked={actif} aria-label={o.libelle} onClick={() => (o.valeur === 'tous' ? onChange('tous') : poser(derniereListe))}
              style={{ flex: '1 1 180px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${actif ? '#4338ca' : '#e2e8f0'}`, background: actif ? '#eef2ff' : '#fff' }}>
              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: actif ? '#3730a3' : '#374151' }}>{actif ? '✓ ' : ''}{o.libelle}</div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{o.aide}</div>
            </button>
          );
        })}
      </div>
      {choisir && (
        <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', background: '#fafafa' }}>
          {dossiers.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>Aucun dossier dans cette comptabilité pour l'instant : la personne ne verra rien tant que vous n'en aurez pas créé, puis coché.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <span aria-live="polite" style={{ fontSize: '0.78rem', fontWeight: 700, color: coches.length ? '#3730a3' : '#92400e' }}>
                  {coches.length ? `${coches.length} dossier${coches.length > 1 ? 's' : ''} coché${coches.length > 1 ? 's' : ''}` : 'Aucun dossier coché : la personne ne verra rien'}
                </span>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={cocherVisibles} disabled={!visibles.length} style={lien}>{q ? `Cocher${portee}` : 'Tout cocher'}</button>
                <button type="button" onClick={decocherVisibles} disabled={!visibles.length} style={lien}>{q ? `Décocher${portee}` : 'Tout décocher'}</button>
              </div>
              {dossiers.length > 6 && (
                <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Filtrer (nom, matricule)" aria-label="Filtrer les dossiers" style={{ ...inp, marginBottom: 8 }} />
              )}
              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibles.map((d) => (
                  <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.82rem', color: d.etat === 'archive' ? '#64748b' : '#0f172a', cursor: 'pointer', padding: '4px 2px' }}>
                    <input type="checkbox" checked={coches.includes(d.id)} onChange={() => basculer(d.id)} aria-label={d.nom} />
                    <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{d.nom}</span>
                    {d.matriculeFiscal && <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.74rem', color: '#64748b' }}>{d.matriculeFiscal}</span>}
                    {d.source === 'labflow' && <span style={pastille('#dcfce7', '#166534')} title="Dossier créé d'après l'identité du compte LabFlow">Mon entreprise · LabFlow</span>}
                    {d.etat === 'archive' && <span style={pastille('#e2e8f0', '#475569')}>Archivé</span>}
                  </label>
                ))}
                {visibles.length === 0 && <div style={{ fontSize: '0.78rem', color: '#64748b', padding: '4px 2px' }}>Aucun dossier ne correspond.</div>}
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>La personne ne voit et ne modifie que ses dossiers ; un dossier qu'elle crée elle-même lui est ouvert aussitôt.</div>
    </div>
  );
}
const lien: React.CSSProperties = { background: 'none', border: 'none', color: '#4338ca', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: 0 };

