import { NIVEAUX, type Niveau } from './comptables';
import { lbl } from './styles';

// LabFlow Compta : éléments d'écran partagés par ses pages (étape S3c ; repris à l'identique des pages des étapes S2b et
// S3b) — carte à en-tête, ligne « libellé : valeur », choix du niveau d'un accès. Styles : styles.ts.

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
          <button key={n.valeur} type="button" role="radio" aria-checked={valeur === n.valeur} onClick={() => onChange(n.valeur)}
            style={{ flex: '1 1 180px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${valeur === n.valeur ? '#4338ca' : '#e2e8f0'}`, background: valeur === n.valeur ? '#eef2ff' : '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: valeur === n.valeur ? '#3730a3' : '#374151' }}>{valeur === n.valeur ? '✓ ' : ''}{n.libelle}</div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{n.aide}</div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>Les niveaux prendront effet avec les dossiers et la saisie.</div>
    </div>
  );
}

