// Factures fournisseur, étape F3 (labflow-reprise/achats-compta/PLAN-FACTURES.md §2) : le détail d'une facture LUE
// puis VALIDÉE, dans les pages Factures (activités et labos) — ses lignes telles que validées (article et conversion,
// ou hors stock), et « Supprimer la facture » : elle ne se modifie plus, elle se supprime en entier (lignes de stock,
// lignes, pièce), puis peut être déposée de nouveau (question 14 du client).
import { useEffect, useState } from 'react';
import api from '../../../api/client';
import { useVocabulaire } from '../../../hooks/useVocabulaire';
import { useConfirm } from '../../common/ConfirmDialog';
import { messageErreur } from './pieces';
import { NATURES } from './lecture/correspondre';

interface LigneValideeVue {
  rang: number; designation: string; reference: string | null; quantite: number; unite: string | null;
  prixUnitaire: number | null; remise: number; tauxTva: number; montant: number;
  articleId: number | null; articleNom: string | null; uniteStock: string | null; horsStock: string | null;
  conversion: number | null; quantiteStock: number | null; prixStock: number | null;
}

interface Props {
  factureId: number;
  refFacture: string | null;
  montantTTC: number;
  accent: string;
  /** Le compte peut écrire et la personne agit sur ce lieu (sinon : pas de bouton). */
  peutSupprimer: boolean;
  onSupprimee: () => void;
}

const f3 = (n: number | null) => (n == null ? '—' : n.toFixed(3));
// Points décimaux, comme les montants de la page Factures.
const fNb = (n: number | null) => (n == null ? '—' : String(Math.round(n * 1e6) / 1e6));
const cellule: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' };

export default function DetailFactureValidee({ factureId, refFacture, montantTTC, accent, peutSupprimer, onSupprimee }: Props) {
  const voc = useVocabulaire();
  const { confirm, alerte } = useConfirm();
  const [lignes, setLignes] = useState<LigneValideeVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    api.get(`/api/factures/${factureId}/lignes-validees`)
      .then(({ data }) => { if (vivant) setLignes(data as LigneValideeVue[]); })
      .catch((e) => { if (vivant) { setLignes([]); setErreur(messageErreur(e, 'Lignes indisponibles : réessayez.')); } });
    return () => { vivant = false; };
  }, [factureId]);

  const supprimer = async () => {
    const ok = await confirm({
      title: `Supprimer la facture ${refFacture ?? ''} ?`,
      message: `Toute la facture part, définitivement : ses lignes, ce qu'elle a fait entrer en ${voc.nom('stock')}, et sa pièce jointe (${montantTTC.toFixed(3)} DT TTC). Ce que LabFlow a appris de ses lignes est gardé. Vous pourrez la déposer de nouveau.`,
      confirmLabel: 'Supprimer la facture',
      tone: 'danger',
    });
    if (!ok) return;
    setEnvoi(true);
    try {
      await api.delete(`/api/factures/${factureId}`);
      onSupprimee();
    } catch (e) {
      setEnvoi(false);
      await alerte({ title: 'Suppression impossible', message: messageErreur(e, 'La facture n\'a pas pu être supprimée.'), tone: 'danger' });
    }
  };

  const libelleHors = (n: string | null) => NATURES.find((x) => x.valeur === n)?.libelle ?? `Hors ${voc.nom('stock')}`;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap', background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '0.76rem', color: '#334155' }}>
          🔒 Facture lue puis validée : ses lignes ne se modifient plus. Pour la corriger, supprimez-la en entier puis déposez-la de nouveau.
        </span>
        <div style={{ flex: 1 }} />
        {peutSupprimer && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={envoi} onClick={() => void supprimer()} style={{ color: '#b91c1c', borderColor: '#fecaca' }}>
            {envoi ? '…' : '🗑️ Supprimer la facture'}
          </button>
        )}
      </div>
      {erreur && <p style={{ padding: '8px 12px', color: '#b91c1c', fontSize: '0.8rem' }}>{erreur}</p>}
      {lignes === null ? (
        <p style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>Chargement des lignes…</p>
      ) : lignes.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: `${accent}10` }}>
              {['Ligne de la facture', 'Qté', 'Prix HT', 'TVA', 'Montant HT', `${voc.Nom('article')} LabFlow`, `En ${voc.nom('stock')}`].map((h, i) => (
                <th key={h} style={{ ...cellule, fontWeight: 700, textAlign: i === 0 || i === 5 ? 'left' : 'right', color: accent, textTransform: 'uppercase', fontSize: '0.64rem', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.rang}>
                <td style={cellule}>
                  <div style={{ fontWeight: 600 }}>{l.designation}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{[l.reference && `code ${voc.nom('fournisseur')} ${l.reference}`, l.unite].filter(Boolean).join(' · ')}</div>
                </td>
                <td style={{ ...cellule, textAlign: 'right' }}>{fNb(l.quantite)}</td>
                <td style={{ ...cellule, textAlign: 'right' }}>{f3(l.prixUnitaire)}{l.remise > 0 ? <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>remise {fNb(l.remise)} %</div> : null}</td>
                <td style={{ ...cellule, textAlign: 'right' }}>{fNb(l.tauxTva)} %</td>
                <td style={{ ...cellule, textAlign: 'right', fontWeight: 700 }}>{f3(l.montant)}</td>
                <td style={cellule}>
                  {l.horsStock ? <span style={{ color: '#3730a3' }}>{libelleHors(l.horsStock)} <span style={{ color: 'var(--text-muted)' }}>(hors {voc.nom('stock')})</span></span>
                    : l.articleNom ? <>{l.articleNom}{l.conversion != null && l.conversion !== 1 ? <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>1 {l.unite || 'unité'} = {fNb(l.conversion)} {l.uniteStock}</div> : null}</>
                      : <span style={{ color: 'var(--text-muted)' }}>{voc.Nom('article')} {voc.acc('article', 'supprimé', 'supprimée')}</span>}
                </td>
                <td style={{ ...cellule, textAlign: 'right' }}>
                  {l.quantiteStock != null ? <>{fNb(l.quantiteStock)} {l.uniteStock}<div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>à {f3(l.prixStock)}</div></> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
