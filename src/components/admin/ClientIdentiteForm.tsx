// Formulaire d'identité légale d'un client (lot 3, spec backend docs/lot-3-spec.md §2).
// Contrôlé ({ value, onChange }) : utilisé par la fenêtre « Identité » de la page Clients (étape 1),
// puis par la 1re étape de l'assistant de création (étape 2). Espace admin : vocabulaire LabFlow (I4).
import { useState } from 'react';
import { FORMES_JURIDIQUES, formeIndividuelle, type IdentiteLegale } from '../../utils/identiteLegale';
import { controlerMatriculeFiscal } from './matriculeFiscal';

interface Props {
  value: IdentiteLegale;
  onChange: (v: IdentiteLegale) => void;
  disabled?: boolean;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff',
};
const aide: React.CSSProperties = { fontSize: 11, marginTop: 4, lineHeight: 1.4 };
const grille: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };

export default function ClientIdentiteForm({ value, onChange, disabled }: Props) {
  const [enseigne, setEnseigne] = useState(!!value.nomCommercial);
  const set = (k: keyof IdentiteLegale, v: string) => onChange({ ...value, [k]: v });
  const mf = controlerMatriculeFiscal(value.matriculeFiscal);

  const changerForme = (forme: string) => {
    const proposee = FORMES_JURIDIQUES.find((f) => f.value === forme)?.qualite ?? '';
    const anciennes = FORMES_JURIDIQUES.map((f) => f.qualite);
    // La qualité suit la forme tant qu'elle est vide ou qu'elle est encore une valeur proposée.
    const qualite = !value.representantQualite || anciennes.includes(value.representantQualite)
      ? proposee : value.representantQualite;
    onChange({ ...value, formeJuridique: forme, representantQualite: qualite });
  };

  const input = (k: keyof IdentiteLegale, placeholder = '', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      value={value[k] ?? ''}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={inputStyle}
      {...extra}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={grille}>
        <div>
          <label style={labelStyle}>{formeIndividuelle(value.formeJuridique) ? 'Nom du titulaire' : 'Raison sociale'}</label>
          {input('raisonSociale', "Telle qu'écrite sur la patente", { maxLength: 255 })}
        </div>
        <div>
          <label style={labelStyle}>Forme juridique</label>
          <select
            value={value.formeJuridique ?? ''}
            onChange={(e) => changerForme(e.target.value)}
            disabled={disabled}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">— Choisir —</option>
            {FORMES_JURIDIQUES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475569', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enseigne}
          disabled={disabled}
          onChange={(e) => { setEnseigne(e.target.checked); if (!e.target.checked) set('nomCommercial', ''); }}
        />
        {"L'enseigne (nom commercial) diffère de la raison sociale"}
      </label>
      {enseigne && (
        <div>
          <label style={labelStyle}>Nom commercial</label>
          {input('nomCommercial', "Nom de l'enseigne", { maxLength: 255 })}
        </div>
      )}

      <div style={grille}>
        <div>
          <label style={labelStyle}>Matricule fiscal</label>
          {input('matriculeFiscal', '1234567A/A/M/000', {
            maxLength: 50,
            onBlur: () => { if (mf.valeur !== (value.matriculeFiscal ?? '')) set('matriculeFiscal', mf.valeur); },
            style: { ...inputStyle, fontFamily: 'ui-monospace, monospace', borderColor: mf.ok ? '#e2e8f0' : '#fca5a5', background: mf.ok ? '#fff' : '#fff5f5' },
          })}
          {!mf.ok && <div style={{ ...aide, color: '#dc2626', fontWeight: 600 }}>{mf.erreur}</div>}
          {mf.ok && mf.avertissement && <div style={{ ...aide, color: '#b45309' }}>{mf.avertissement}</div>}
        </div>
        <div>
          <label style={labelStyle}>Identifiant RNE</label>
          {input('rne', 'Registre national des entreprises', { maxLength: 50 })}
        </div>
      </div>

      <div style={grille}>
        <div>
          <label style={labelStyle}>Adresse</label>
          {input('adresse', 'Rue, numéro', { maxLength: 300 })}
        </div>
        <div>
          <label style={labelStyle}>Ville</label>
          {input('ville', 'Code postal et ville', { maxLength: 120 })}
        </div>
      </div>

      <div style={grille}>
        <div>
          <label style={labelStyle}>Représentant légal</label>
          {input('representantNom', 'Prénom et nom', { maxLength: 150 })}
        </div>
        <div>
          <label style={labelStyle}>Qualité</label>
          {input('representantQualite', 'Gérant, Titulaire…', { maxLength: 80 })}
        </div>
      </div>
    </div>
  );
}
