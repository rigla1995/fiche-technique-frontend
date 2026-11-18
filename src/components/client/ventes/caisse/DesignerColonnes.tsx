// Import d'un fichier de caisse (étape V1b — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §5 bis) : DÉSIGNER les
// colonnes d'un fichier dont les titres ne se reconnaissent pas seuls. Décision du client (18/11/2026) : « accepter tous
// mes fichiers, les détecter et demander la correspondance ». L'utilisateur voit les premières lignes du tableau et dit
// quelle colonne est la désignation, la quantité, le montant (ou le prix unitaire) et, s'il y en a une, la catégorie.
// Le choix est retenu avec la ligne de titres du fichier : le fichier suivant de la même caisse se lit sans question.
// Lecture : lireCaisse.ts (pures, testées).
import { useMemo, useState } from 'react';
import {
  ROLES_DESIGNES, apercuFeuille, colonnesCompletes, devinerColonnes, lireFeuilleDesignee, signatureFeuille, texteCellule,
} from './lireCaisse';
import type { ColonnesDesignees, LectureCaisse, ModeleAppris, RoleDesigne } from './lireCaisse';
import type { FeuilleCaisse } from './ouvrirFichier';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';
const ROUGE = '#b91c1c';

const dt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
const lettre = (col: number) => (col <= 26 ? String.fromCharCode(64 + col) : `${String.fromCharCode(64 + Math.floor((col - 1) / 26))}${String.fromCharCode(65 + ((col - 1) % 26))}`);

interface Props {
  nomFichier: string;
  feuilles: readonly FeuilleCaisse[];
  /** Colonnes proposées pour la première feuille (modèle retenu d'un fichier sans titres) ; sinon devinées des titres. */
  initial: ColonnesDesignees | null;
  libelleAnnuler: string;
  onAnnuler: () => void;
  onValider: (lecture: LectureCaisse, modele: ModeleAppris) => void;
}

export default function DesignerColonnes({ nomFichier, feuilles, initial, libelleAnnuler, onAnnuler, onValider }: Props) {
  const [rang, setRang] = useState(0);
  const [colonnes, setColonnes] = useState<ColonnesDesignees>(() => initial ?? devinerColonnes(feuilles[0].lignes));
  const feuille = feuilles[rang];
  const apercu = useMemo(() => apercuFeuille(feuille.lignes), [feuille]);
  const lecture = useMemo(() => (colonnesCompletes(colonnes) ? lireFeuilleDesignee(feuille.lignes, colonnes) : null), [feuille, colonnes]);

  const LIBELLES: Record<RoleDesigne, string> = {
    designation: 'Désignation', quantite: 'Quantité', montant: 'Montant de la ligne', prixUnitaire: 'Prix unitaire', categorie: 'Catégorie',
  };
  const roleDe = (col: number): RoleDesigne | '' => ROLES_DESIGNES.find((r) => colonnes[r] === col) ?? '';
  // Un rôle va à une seule colonne, une colonne n'a qu'un rôle.
  const designer = (col: number, role: RoleDesigne | '') => setColonnes((avant) => {
    const suite: ColonnesDesignees = {};
    for (const r of ROLES_DESIGNES) if (avant[r] !== undefined && avant[r] !== col && r !== role) suite[r] = avant[r];
    if (role) suite[role] = col;
    return suite;
  });
  const changerFeuille = (n: number) => { setRang(n); setColonnes(devinerColonnes(feuilles[n].lignes)); };

  const manque: string[] = [];
  if (!colonnes.designation) manque.push('la désignation');
  if (!colonnes.quantite) manque.push('la quantité');
  if (!colonnes.montant && !colonnes.prixUnitaire) manque.push('le montant de la ligne (ou le prix unitaire)');
  const total = lecture ? lecture.lignes.reduce((s, l) => s + l.montant, 0) : 0;
  const cellule = { padding: '6px 10px', borderBottom: `1px solid ${CB}`, fontSize: '0.8rem', whiteSpace: 'nowrap' as const, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' };

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: '0.86rem', color: '#334155' }}>
        LabFlow n'a pas reconnu seul les colonnes de <strong>{nomFichier}</strong>. Indiquez au-dessus de chaque colonne utile ce qu'elle contient :
        il s'en souviendra pour les prochains fichiers de cette caisse.
      </p>
      {feuilles.length > 1 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700, color: CD, marginBottom: 10 }}>
          Feuille du fichier
          <select value={rang} onChange={(e) => changerFeuille(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${CB}`, fontSize: '0.82rem', color: CD }}>
            {feuilles.map((f, i) => <option key={f.nom + i} value={i}>{f.nom}</option>)}
          </select>
        </label>
      )}

      <div style={{ border: `1px solid ${CB}`, borderRadius: 12, overflow: 'auto', maxHeight: '50vh' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...cellule, background: CL, color: '#94a3b8', fontWeight: 700, textAlign: 'right' }}>Ligne</th>
              {apercu.colonnes.map((col) => {
                const role = roleDe(col);
                return (
                  <th key={col} style={{ ...cellule, background: role ? '#fef3c7' : CL, textAlign: 'left', overflow: 'visible' }}>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>Colonne {lettre(col)}</div>
                    <select value={role} aria-label={`Contenu de la colonne ${lettre(col)}`} onChange={(e) => designer(col, e.target.value as RoleDesigne | '')}
                      style={{ padding: '5px 6px', borderRadius: 8, border: `1.5px solid ${role ? C : CB}`, fontSize: '0.8rem', fontWeight: 700, color: CD, background: '#fff', maxWidth: 190 }}>
                      <option value="">— Ne pas lire —</option>
                      {ROLES_DESIGNES.map((r) => <option key={r} value={r}>{LIBELLES[r]}</option>)}
                    </select>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {apercu.lignes.map((l) => (
              <tr key={l.n}>
                <td style={{ ...cellule, color: '#94a3b8', textAlign: 'right' }}>{l.n}</td>
                {apercu.colonnes.map((col) => (
                  <td key={col} title={texteCellule(l.cellules[col])} style={{ ...cellule, color: roleDe(col) ? CD : '#64748b', fontWeight: roleDe(col) ? 700 : 400, background: roleDe(col) ? '#fffdf7' : '#fff' }}>
                    {texteCellule(l.cellules[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 2px 0', fontSize: '0.76rem', color: '#64748b' }}>
        Aperçu des premières lignes ({feuille.lignes.length} dans le fichier). « Montant de la ligne » : ce que le client a payé, remises déduites.
        Une ligne se lit quand elle porte une désignation et une quantité ; les lignes de même désignation sont additionnées.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <div role="status" style={{ fontSize: '0.84rem', fontWeight: 700, color: lecture ? '#166534' : ROUGE }}>
          {manque.length > 0
            ? `À désigner : ${manque.join(', ')}.`
            : lecture
              ? `✓ ${lecture.lignes.length} ligne${lecture.lignes.length > 1 ? 's' : ''} lue${lecture.lignes.length > 1 ? 's' : ''}, ${dt(total)}`
              : 'Aucune ligne ne se lit avec ces colonnes : vérifiez la quantité et la désignation.'}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onAnnuler}
            style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${CB}`, background: '#fff', color: CD, fontWeight: 700, cursor: 'pointer', fontSize: '0.86rem' }}>
            {libelleAnnuler}
          </button>
          <button type="button" disabled={!lecture} onClick={() => lecture && onValider(lecture, { signature: signatureFeuille(feuille.lignes, colonnes), colonnes })}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: lecture ? C : '#e5e7eb', color: lecture ? '#fff' : '#9ca3af', fontWeight: 800, cursor: lecture ? 'pointer' : 'not-allowed', fontSize: '0.86rem' }}>
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
}
