// Formulaire d'identité légale d'un client (lot 3, spec backend docs/lot-3-spec.md §2).
// Contrôlé ({ value, onChange }) : utilisé par la fenêtre « Identité » de la page Clients (étape 1),
// puis par la 1re étape de l'assistant de création (étape 2). Espace admin : vocabulaire LabFlow (I4).
// Étape 7 : « Lire la patente » (patente/LecturePatente) pré-remplit les champs VIDES ; pastille « lu » par champ.
import { useState } from 'react';
import { FORMES_JURIDIQUES, formeIndividuelle, type IdentiteLegale } from '../../utils/identiteLegale';
import { controlerMatriculeFiscal } from './matriculeFiscal';
import LecturePatente, { NoteLu, PastilleLu } from './patente/LecturePatente';
import { valeurRecopiee } from './patente/fusion';
import type { ChampIdentite, ChampLu } from './patente/types';

interface Props {
  value: IdentiteLegale;
  onChange: (v: IdentiteLegale) => void;
  disabled?: boolean;
  /** Lecture de la patente en cours (début true, fin false). */
  onLecture?: (enCours: boolean) => void;
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

export default function ClientIdentiteForm({ value, onChange, disabled, onLecture }: Props) {
  const [enseigne, setEnseigne] = useState(!!value.nomCommercial);
  // Lecture de la patente : d'où vient chaque valeur lue (pastille), et dernier champ où le curseur s'est posé.
  const [lus, setLus] = useState<Partial<Record<ChampIdentite, ChampLu>>>({});
  const [champActif, setChampActif] = useState<ChampIdentite | null>(null);
  const set = (k: keyof IdentiteLegale, v: string) => {
    onChange({ ...value, [k]: v });
    if (lus[k] && lus[k].valeur !== v) setLus((l) => { const reste = { ...l }; delete reste[k]; return reste; }); // valeur retouchée : plus « lue »
  };
  const mf = controlerMatriculeFiscal(value.matriculeFiscal);

  const changerForme = (forme: string) => {
    const proposee = FORMES_JURIDIQUES.find((f) => f.value === forme)?.qualite ?? '';
    const anciennes = FORMES_JURIDIQUES.map((f) => f.qualite);
    // La qualité suit la forme tant qu'elle est vide ou qu'elle est encore une valeur proposée.
    const qualite = !value.representantQualite || anciennes.includes(value.representantQualite)
      ? proposee : value.representantQualite;
    onChange({ ...value, formeJuridique: forme, representantQualite: qualite });
    // La forme n'est plus « lue » ; la qualité non plus si elle vient d'être réécrite.
    setLus((l) => {
      const reste = { ...l };
      delete reste.formeJuridique;
      if (reste.representantQualite && reste.representantQualite.valeur !== qualite) delete reste.representantQualite;
      return reste;
    });
  };

  // Champs lus sur la patente : écrits dans la fiche (le panneau n'envoie que des champs vides, ou un remplacement
  // demandé). Une forme lue propose la qualité comme un choix à la main (sauf qualité lue dans le même geste, qui
  // gagne) ; un nom commercial lu ouvre son champ.
  const remplir = (champs: Partial<IdentiteLegale>, nouveaux: Partial<Record<ChampIdentite, ChampLu>>) => {
    const suivant = { ...value, ...champs };
    const lusSuivants = { ...lus, ...nouveaux };
    if (champs.matriculeFiscal) suivant.matriculeFiscal = controlerMatriculeFiscal(champs.matriculeFiscal).valeur;
    const proposees = FORMES_JURIDIQUES.map((x) => x.qualite);
    if (champs.formeJuridique && !champs.representantQualite && (!value.representantQualite || proposees.includes(value.representantQualite))) {
      suivant.representantQualite = FORMES_JURIDIQUES.find((x) => x.value === champs.formeJuridique)?.qualite ?? '';
      delete lusSuivants.representantQualite; // qualité proposée d'après la forme, pas lue
    }
    if (champs.nomCommercial) setEnseigne(true);
    onChange(suivant);
    setLus(lusSuivants);
  };

  // Recopie d'une ligne du texte lu dans le champ actif : libellé retiré, matricule remis dans l'ordre de saisie.
  const recopier = (ligne: string) => {
    if (!champActif) return;
    const valeur = valeurRecopiee(champActif, ligne);
    set(champActif, champActif === 'matriculeFiscal' ? controlerMatriculeFiscal(valeur).valeur : valeur);
  };

  const input = (k: keyof IdentiteLegale, placeholder = '', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <>
      <input
        value={value[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        onFocus={() => setChampActif(k)}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
        {...extra}
      />
      <NoteLu lu={lus[k]} />
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <LecturePatente valeur={value} disabled={disabled} champActif={champActif} onRemplir={remplir} onRecopier={recopier} onLecture={onLecture} />
      <div style={grille}>
        <div>
          <label style={labelStyle}>{formeIndividuelle(value.formeJuridique) ? 'Nom du titulaire' : 'Raison sociale'}<PastilleLu lu={lus.raisonSociale} /></label>
          {input('raisonSociale', "Telle qu'écrite sur la patente", { maxLength: 255 })}
        </div>
        <div>
          <label style={labelStyle}>Forme juridique<PastilleLu lu={lus.formeJuridique} /></label>
          <select
            value={value.formeJuridique ?? ''}
            onChange={(e) => changerForme(e.target.value)}
            disabled={disabled}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">— Choisir —</option>
            {FORMES_JURIDIQUES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <NoteLu lu={lus.formeJuridique} />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475569', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enseigne}
          disabled={disabled}
          onChange={(e) => {
            setEnseigne(e.target.checked);
            if (!e.target.checked) {
              set('nomCommercial', '');
              if (champActif === 'nomCommercial') setChampActif(null); // champ masqué : plus de recopie vers lui
            }
          }}
        />
        {"L'enseigne (nom commercial) diffère de la raison sociale"}
      </label>
      {enseigne && (
        <div>
          <label style={labelStyle}>Nom commercial<PastilleLu lu={lus.nomCommercial} /></label>
          {input('nomCommercial', "Nom de l'enseigne", { maxLength: 255 })}
        </div>
      )}

      <div style={grille}>
        <div>
          <label style={labelStyle}>Matricule fiscal<PastilleLu lu={lus.matriculeFiscal} /></label>
          {input('matriculeFiscal', '1234567A/A/M/000', {
            maxLength: 50,
            onBlur: () => { if (mf.valeur !== (value.matriculeFiscal ?? '')) set('matriculeFiscal', mf.valeur); },
            style: { ...inputStyle, fontFamily: 'ui-monospace, monospace', borderColor: mf.ok ? '#e2e8f0' : '#fca5a5', background: mf.ok ? '#fff' : '#fff5f5' },
          })}
          {!mf.ok && <div style={{ ...aide, color: '#dc2626', fontWeight: 600 }}>{mf.erreur}</div>}
          {mf.ok && mf.avertissement && <div style={{ ...aide, color: '#b45309' }}>{mf.avertissement}</div>}
        </div>
        <div>
          <label style={labelStyle}>Identifiant RNE<PastilleLu lu={lus.rne} /></label>
          {input('rne', 'Registre national des entreprises', { maxLength: 50 })}
        </div>
      </div>

      <div style={grille}>
        <div>
          <label style={labelStyle}>Adresse<PastilleLu lu={lus.adresse} /></label>
          {input('adresse', 'Rue, numéro', { maxLength: 300 })}
        </div>
        <div>
          <label style={labelStyle}>Ville<PastilleLu lu={lus.ville} /></label>
          {input('ville', 'Code postal et ville', { maxLength: 120 })}
        </div>
      </div>

      <div style={grille}>
        <div>
          <label style={labelStyle}>Représentant légal<PastilleLu lu={lus.representantNom} /></label>
          {input('representantNom', 'Prénom et nom', { maxLength: 150 })}
        </div>
        <div>
          <label style={labelStyle}>Qualité<PastilleLu lu={lus.representantQualite} /></label>
          {input('representantQualite', 'Gérant, Titulaire…', { maxLength: 80 })}
        </div>
      </div>
    </div>
  );
}
