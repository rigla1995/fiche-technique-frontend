// Lot 2c (§6) — petits éléments partagés par AdminManuelPage et AdminKnowledgeBasePage : domaines de l'aperçu,
// sélecteur « Aperçu dans le domaine », légende des balises, liste des balises fautives, badge « sans balises ».
// L'admin reste en vocabulaire LabFlow (I4) : seuls l'aperçu et la colonne « domaine » de la légende changent de mots.
import { useEffect, useState } from 'react';
import api from '../../api/client';
import { vocabDefaut, vocabDuLexique } from '../../vocab/vocab.ts';
import type { Vocab } from '../../vocab/vocab.ts';
import { LEGENDE_BALISES, CLES_LEXIQUE, rendreTexte } from './manuelBalises.ts';
import type { BaliseFautiveChamp } from './manuelBalises.ts';

export interface DomaineApercu {
  slug: string;
  nom: string;
  voc: Vocab;
  /** Le lexique résolu s'écarte-t-il du défaut ? (sinon aucune variante n'est servie ni créable, I12) */
  avecEcart: boolean;
}

const SLUG_DEFAUT = 'restauration';

/** Domaines de `GET /api/domaines` (l'admin reçoit chaque domaine avec son lexique résolu), hors restauration,
 * qui est l'aperçu par défaut. Erreur de lecture → liste vide (l'aperçu reste possible en restauration). */
// eslint-disable-next-line react-refresh/only-export-components
export function useDomainesApercu(): DomaineApercu[] {
  const [domaines, setDomaines] = useState<DomaineApercu[]>([]);
  useEffect(() => {
    let vivant = true;
    api.get('/api/domaines')
      .then(({ data }) => {
        if (!vivant || !Array.isArray(data)) return;
        setDomaines(data
          .filter((d: { slug?: unknown }) => typeof d?.slug === 'string' && d.slug !== SLUG_DEFAUT)
          .map((d: { slug: string; nom?: string; lexique?: unknown }) => {
            const voc = vocabDuLexique(d.lexique);
            return { slug: d.slug, nom: d.nom || d.slug, voc, avecEcart: !voc.estDefaut };
          }));
      })
      .catch(() => { if (vivant) setDomaines([]); });
    return () => { vivant = false; };
  }, []);
  return domaines;
}

export function SelecteurDomaine({ domaines, value, onChange, disabled }: {
  domaines: DomaineApercu[]; value: string; onChange: (slug: string) => void; disabled?: boolean;
}) {
  const absent = !!value && !domaines.some((d) => d.slug === value);
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
      Aperçu dans le domaine :
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: '0.78rem', background: disabled ? '#f8fafc' : '#fff' }}>
        <option value="">Restauration (défaut)</option>
        {domaines.map((d) => <option key={d.slug} value={d.slug}>{d.nom}</option>)}
        {absent && <option value={value}>{value} (domaine absent)</option>}
      </select>
    </label>
  );
}

export function LegendeBalises({ voc, nomDomaine }: { voc: Vocab | null; nomDomaine: string }) {
  const autre = voc && voc !== vocabDefaut ? voc : null;
  const cell: React.CSSProperties = { padding: '3px 8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
  return (
    <details style={{ marginTop: 6, fontSize: '0.72rem', color: '#64748b' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Balises de vocabulaire (les mots changent selon le domaine du compte)</summary>
      <table style={{ borderCollapse: 'collapse', marginTop: 6, width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#475569' }}>
            <th style={cell}>Balise</th><th style={cell}>Rôle</th><th style={cell}>Restauration</th>
            {autre && <th style={cell}>{nomDomaine}</th>}
          </tr>
        </thead>
        <tbody>
          {LEGENDE_BALISES.map(({ balise, role }) => (
            <tr key={balise}>
              <td style={{ ...cell, fontFamily: 'ui-monospace, Consolas, monospace', color: '#1e3a8a' }}>{balise}</td>
              <td style={cell}>{role}</td>
              <td style={cell}>« {rendreTexte(vocabDefaut, balise)} »</td>
              {autre && <td style={cell}>« {rendreTexte(autre, balise)} »</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '6px 0 0', lineHeight: 1.6 }}>
        Début de phrase : méthode à majuscule (<code>[[Le:labo]]</code>, <code>[[Du:stock]]</code>). Clés : {CLES_LEXIQUE.join(', ')}.
      </p>
    </details>
  );
}

const MAX_FAUTES = 5;

export function FautesBalises({ fautes }: { fautes: BaliseFautiveChamp[] }) {
  if (!fautes.length) return null;
  return (
    <div style={{ marginTop: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', lineHeight: 1.6 }}>
      <strong>Balise{fautes.length > 1 ? 's' : ''} à corriger avant d'enregistrer :</strong>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {fautes.slice(0, MAX_FAUTES).map((f, i) => (
          <li key={i}>{f.champ} : <code>{f.balise}</code> ({f.raison})</li>
        ))}
        {fautes.length > MAX_FAUTES && <li>… et {fautes.length - MAX_FAUTES} autre(s)</li>}
      </ul>
    </div>
  );
}

export function BadgeSansBalises() {
  return (
    <span title="Ce texte porte des mots du lexique écrits en clair : il ne changera pas selon le domaine du compte. À rebaliser."
      style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9a3412', background: '#ffedd5', borderRadius: 20, padding: '2px 9px' }}>
      sans balises
    </span>
  );
}
