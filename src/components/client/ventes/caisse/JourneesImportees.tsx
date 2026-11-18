// Import d'un fichier de caisse (étape V1b — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §5 bis) : les journées
// déjà importées d'une activité. On y retrouve le document d'origine (conservé avec l'import) et on peut ANNULER un
// import : ses ventes sont effacées, leur stock rendu, la journée redevient importable. Ce que LabFlow a appris est gardé.
// Un gérant n'annule que ses propres imports (le serveur le revérifie).
import { useEffect, useState } from 'react';
import api from '../../../../api/client';
import { useConfirm } from '../../../common/ConfirmDialog';
import { useVocabulaire } from '../../../../hooks/useVocabulaire';

const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';
const ROUGE = '#b91c1c';

const apiMsg = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
const dt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
const jourFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export interface ImportJournee {
  id: number; date_vente: string; source: string; fichier_nom: string | null; total_enregistre: number; nb_lignes: number;
  created_by: number | null; auteur: string | null; document: boolean; ventes: number;
}
interface Props {
  activiteId: number;
  /** Change quand un import vient d'être enregistré : la liste se recharge. */
  version: number;
  /** Compte connecté : un gérant ne voit le bouton d'annulation que sur ses imports. */
  utilisateur: { id?: number; role?: string } | null;
  /** Une journée vient d'être annulée (la page des ventes et le contexte de l'import sont à recharger). */
  onAnnule: () => void;
}

export default function JourneesImportees({ activiteId, version, utilisateur, onAnnule }: Props) {
  const voc = useVocabulaire();
  const { confirm } = useConfirm();
  const [imports, setImports] = useState<ImportJournee[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState<number | null>(null);
  const [rechargement, setRechargement] = useState(0);

  useEffect(() => {
    let vivant = true;
    api.get(`/api/ventes/imports?activiteId=${activiteId}`)
      .then(({ data }) => { if (vivant) setImports((data as { imports: ImportJournee[] }).imports); })
      .catch((e: unknown) => { if (vivant) setErreur(apiMsg(e, 'Chargement des journées importées impossible.')); });
    return () => { vivant = false; };
  }, [activiteId, version, rechargement]);

  const telecharger = async (imp: ImportJournee) => {
    setErreur('');
    setOccupe(imp.id);
    try {
      const res = await api.get(`/api/ventes/imports/${imp.id}/document`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data as Blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.setAttribute('download', imp.fichier_nom || `import-caisse-${imp.date_vente}`);
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setErreur(`Le document du ${jourFr(imp.date_vente)} n'a pas pu être téléchargé.`);
    } finally {
      setOccupe(null);
    }
  };

  const annuler = async (imp: ImportJournee) => {
    const oui = await confirm({
      title: `Annuler l'import du ${jourFr(imp.date_vente)} ?`,
      message: `${voc.Le('vente', true)} de cet import (${voc.n('vente', imp.ventes)}, ${dt(imp.total_enregistre)}) seront ${voc.acc('vente', 'effacé', 'effacée', true)} et leur ${voc.nom('stock')} rendu. La journée pourra être importée à nouveau.`,
      details: [`${voc.Le('vente', true)} ${voc.acc('vente', 'saisi', 'saisie', true)} à la main ce jour-là ne sont pas ${voc.acc('vente', 'touché', 'touchée', true)}.`, 'Ce que LabFlow a appris (lignes reconnues, modèle du fichier) est gardé.'],
      confirmLabel: 'Annuler l\'import', cancelLabel: 'Garder', tone: 'danger',
    });
    if (!oui) return;
    setErreur('');
    setOccupe(imp.id);
    try {
      await api.delete(`/api/ventes/imports/${imp.id}`);
      setRechargement((n) => n + 1);
      onAnnule();
    } catch (e: unknown) {
      setErreur(apiMsg(e, 'Annulation impossible.'));
    } finally {
      setOccupe(null);
    }
  };

  if (!imports && !erreur) return null;
  const cellule = { padding: '6px 10px', borderBottom: `1px solid ${CB}`, fontSize: '0.8rem', verticalAlign: 'middle' as const };
  const titre = { ...cellule, fontSize: '0.68rem', fontWeight: 800, color: CD, textTransform: 'uppercase' as const, background: CL, textAlign: 'left' as const, position: 'sticky' as const, top: 0 };
  const bouton = { padding: '4px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: '#fff', color: CD, fontWeight: 700, cursor: 'pointer', fontSize: '0.76rem' };

  return (
    <section aria-label="Journées importées" style={{ marginTop: 18 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '0.92rem', fontWeight: 800, color: CD }}>Journées importées</h3>
      {erreur && <div role="alert" style={{ color: ROUGE, fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>{erreur}</div>}
      {imports && imports.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Aucune journée importée pour {voc.ce('activite')}.</p>}
      {imports && imports.length > 0 && (
        <div style={{ border: `1px solid ${CB}`, borderRadius: 12, overflow: 'auto', maxHeight: 240 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={titre}>Journée</th>
                <th style={titre}>Fichier</th>
                <th style={{ ...titre, textAlign: 'right' }}>Chiffre</th>
                <th style={titre}>Par</th>
                <th style={{ ...titre, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const aMoi = utilisateur?.role !== 'gerant' || imp.created_by === utilisateur?.id;
                return (
                  <tr key={imp.id}>
                    <td style={{ ...cellule, fontWeight: 800, color: CD, whiteSpace: 'nowrap' }}>{jourFr(imp.date_vente)}</td>
                    <td style={{ ...cellule, color: '#475569', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={imp.fichier_nom ?? ''}>{imp.fichier_nom ?? '—'}</td>
                    <td style={{ ...cellule, textAlign: 'right', whiteSpace: 'nowrap' }}>{dt(imp.total_enregistre)}</td>
                    <td style={{ ...cellule, color: '#64748b' }}>{imp.auteur ?? '—'}</td>
                    <td style={{ ...cellule, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {imp.document && (
                        <button type="button" disabled={occupe === imp.id} onClick={() => telecharger(imp)} aria-label={`Télécharger le document du ${jourFr(imp.date_vente)}`} style={{ ...bouton, marginRight: 6 }}>
                          📄 Document
                        </button>
                      )}
                      {aMoi && (
                        <button type="button" disabled={occupe === imp.id} onClick={() => annuler(imp)} aria-label={`Annuler l'import du ${jourFr(imp.date_vente)}`} style={{ ...bouton, borderColor: '#fecaca', color: ROUGE }}>
                          Annuler l'import
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
