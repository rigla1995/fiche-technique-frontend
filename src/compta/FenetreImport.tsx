import { useRef, useState, type ReactNode } from 'react';
import { Modale } from './DossierFormulaires';
import { estClasseur, rapportDe, type RapportImport } from './classeurs';
import { messageDossier } from './dossiers';
import { lbl, petit } from './styles';

// LabFlow Compta, étape S5c : la fenêtre d'un import Excel en TOUT-OU-RIEN (SPEC-SOCLE D18), partagée par la page Tiers
// (fournisseurs, clients) et la page Plan de comptes. Deux gestes : télécharger le modèle à la charte (colonnes en texte,
// ligne d'exemple), puis choisir le classeur rempli et l'importer. Le serveur contrôle toutes les lignes : à la moindre
// erreur, rien n'est importé et son rapport (une entrée par ligne fausse, numéros de lignes Excel) s'affiche ici pour
// corriger le fichier ; sinon la page ferme la fenêtre et relit sa liste (`importer` s'en charge). Un refus sur un état
// périmé (dossier archivé, accès retiré : 404, 409) passe par `onRefus` (convention de S3c : fenêtre fermée, liste relue).
export function FenetreImport({ titre, sousTitre, aide, role, onClose, telechargerModele, importer, onRefus }: {
  titre: string; sousTitre?: string; aide: ReactNode; role: 'titulaire' | 'gerant'; onClose: () => void;
  telechargerModele: () => Promise<void>; importer: (fichier: File) => Promise<void>; onRefus?: (err: unknown) => boolean;
}) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [modele, setModele] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const choisir = (f: File | null) => {
    setRapport(null);
    setErreur(null);
    if (f && !estClasseur(f)) { setFichier(null); setErreur('Choisissez un classeur Excel (.xlsx) : partez du modèle téléchargeable.'); return; }
    setFichier(f);
  };
  const modeleClic = async () => {
    if (modele) return;
    setModele(true);
    setErreur(null);
    try { await telechargerModele(); } catch (err) { setErreur(messageDossier(err, 'Modèle impossible à télécharger, réessayez.', role)); } finally { setModele(false); }
  };
  const envoyer = async () => {
    if (envoi || !fichier) return;
    setEnvoi(true);
    setErreur(null);
    setRapport(null);
    try {
      await importer(fichier);
    } catch (err) {
      const r = rapportDe(err);
      if (!r && onRefus?.(err)) return;
      if (r) setRapport(r); else setErreur(messageDossier(err, 'Import impossible, réessayez.', role));
      setEnvoi(false);
      // Le même fichier, corrigé, se rechoisit : le champ est vidé.
      setFichier(null);
      if (champ.current) champ.current.value = '';
    }
  };
  return (
    <Modale titre={titre} sousTitre={sousTitre} onClose={onClose} onSubmit={envoyer} envoi={envoi} erreur={erreur} libelleEnvoi="📥 Importer le fichier" inactif={!fichier} large>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={etape}>
          <div style={numero}>1</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.86rem' }}>Téléchargez le modèle et remplissez-le</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.55, marginTop: 4 }}>{aide}</div>
            <button type="button" onClick={modeleClic} disabled={envoi || modele} style={{ ...petit('#f0fdf4', '#166534', '#bbf7d0'), marginTop: 8 }}>{modele ? 'Téléchargement…' : '📄 Télécharger le modèle (Excel)'}</button>
          </div>
        </div>
        <div style={etape}>
          <div style={numero}>2</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <label htmlFor="import-fichier" style={lbl}>Choisissez le classeur rempli</label>
            <input id="import-fichier" ref={champ} type="file" accept=".xlsx" disabled={envoi} onChange={(e) => choisir(e.target.files?.[0] || null)} style={{ fontSize: '0.84rem', maxWidth: '100%' }} />
            {fichier && <div style={{ fontSize: '0.78rem', color: '#0f172a', marginTop: 6 }}>Prêt à importer : <strong>{fichier.name}</strong> ({Math.max(1, Math.round(fichier.size / 1024))} Ko)</div>}
            <div style={{ fontSize: '0.76rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginTop: 8, lineHeight: 1.5 }}>
              Toutes les lignes sont contrôlées avant d'écrire : <strong>à la moindre erreur, rien n'est importé</strong> et le rapport vous dit, ligne par ligne, ce qu'il faut corriger.
            </div>
          </div>
        </div>
        {rapport && (
          <div role="alert" style={{ border: '1px solid #fecaca', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: '0.84rem', padding: '10px 14px' }}>
              {rapport.message}
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                    <th style={cellule}>Ligne</th><th style={cellule}>Repère</th><th style={cellule}>À corriger</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.lignes.map((l) => (
                    <tr key={l.ligne} style={{ borderTop: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                      <td style={{ ...cellule, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#1e1b4b', whiteSpace: 'nowrap' }}>{l.ligne}</td>
                      <td style={{ ...cellule, color: '#0f172a', overflowWrap: 'anywhere' }}>{l.repere || '—'}</td>
                      <td style={{ ...cellule, color: '#b91c1c' }}>{l.erreurs.map((e, i) => <div key={i}>{e}</div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', padding: '8px 14px', borderTop: '1px solid #f1f5f9' }}>Les numéros sont ceux des lignes du classeur Excel. Corrigez le fichier, puis choisissez-le de nouveau.</div>
          </div>
        )}
      </div>
    </Modale>
  );
}

const etape: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' };
const numero: React.CSSProperties = { width: 26, height: 26, borderRadius: '50%', background: '#4338ca', color: '#fff', fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const cellule: React.CSSProperties = { padding: '6px 10px' };
