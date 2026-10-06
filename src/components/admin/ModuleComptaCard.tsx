import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useConfirm } from '../common/ConfirmDialog';

// LabFlow Compta, étape S2c : carte « Module Comptabilité » de l'onglet Activation (page Abonnements). Le serveur
// refuse l'activation tant que le tarif du module vaut 0, crée la comptabilité du client à la première activation et
// la ferme à la désactivation (rien n'est effacé). Le module est facturé à plein tarif, hors promotion, à partir du
// mois qui suit son activation.
interface EtatModule {
  disponible: boolean;
  actif: boolean;
  activeLe: string | null;
  factureAPartirDe: string | null;
  nbGerants: number;
  nbGerantsMax: number;
  prixModule: number;
  prixGerant: number;
  postes: { code: string; libelle: string; montant: number }[];
  totalMensuel: number;
  espace: { id: number; etat: 'actif' | 'ferme' } | null;
  demandeEnCours: boolean;
}

const messageDe = (err: unknown, defaut: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || defaut;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtMois = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—');
const dt = (n: number) => `${Math.round(n * 100) / 100} DT`;

// Monter avec key={clientId} : un autre client = une carte neuve.
export default function ModuleComptaCard({ clientId, onChange }: { clientId: number; onChange?: () => void }) {
  const [etat, setEtat] = useState<EtatModule | null>(null);
  const [erreurChargement, setErreurChargement] = useState(false);
  const [nb, setNb] = useState('0');
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    let annule = false;
    api.get(`/api/abonnements/client/${clientId}/module-compta`)
      .then(({ data }) => { if (!annule) { setEtat(data as EtatModule); setNb(String((data as EtatModule).nbGerants || 0)); } })
      .catch(() => { if (!annule) setErreurChargement(true); });
    return () => { annule = true; };
  }, [clientId]);

  const nbNum = Number(nb);
  const nbValide = !!etat && nb.trim() !== '' && Number.isInteger(nbNum) && nbNum >= 0 && nbNum <= etat.nbGerantsMax;
  const apercu = etat ? etat.prixModule + (nbValide ? nbNum : 0) * etat.prixGerant : 0;

  const enregistrer = async (actif: boolean) => {
    if (!etat || saving) return;
    if (actif && !nbValide) { setErreur(`Gérants comptables : entier de 0 à ${etat.nbGerantsMax}`); return; }
    if (!actif) {
      const ok = await confirm({
        title: 'Désactiver le module Comptabilité ?',
        message: 'La comptabilité du client est fermée : elle n\'apparaît plus dans LabFlow Compta, mais rien n\'est effacé.',
        details: ['Le module n\'est plus facturé sur les mensualités suivantes.', 'Une réactivation la rouvre à l\'identique.'],
        confirmLabel: 'Désactiver',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setSaving(true);
    setErreur(null);
    try {
      const { data } = await api.put(`/api/abonnements/client/${clientId}/module-compta`, { actif, nbGerantsCompta: actif ? nbNum : 0 });
      setEtat(data as EtatModule);
      setNb(String((data as EtatModule).nbGerants || 0));
      onChange?.();
    } catch (err) {
      setErreur(messageDe(err, 'Erreur lors de l\'enregistrement'));
    } finally {
      setSaving(false);
    }
  };

  const bouton = (couleur: string, plein: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '7px 16px', borderRadius: 8, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
    border: plein ? 'none' : `1.5px solid ${couleur}`, background: plein ? 'linear-gradient(135deg,#312e81,#4338ca)' : '#fff', color: plein ? '#fff' : couleur,
  });

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #a5b4fc', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%)', borderBottom: '1px solid #a5b4fc' }}>
        <span style={{ fontSize: 20 }}>📒</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#312e81' }}>Module Comptabilité</div>
          <div style={{ fontSize: 11, color: '#4338ca', marginTop: 1 }}>LabFlow Compta pour le client : sa comptabilité, l'accès de son comptable compris · à plein tarif, hors promotion</div>
        </div>
        {etat && (
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: etat.actif ? '#dcfce7' : '#fee2e2', color: etat.actif ? '#166534' : '#991b1b' }}>
            {etat.actif ? '✅ Actif' : '🔒 Inactif'}
          </span>
        )}
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {erreurChargement && <div style={{ fontSize: 12, color: '#dc2626' }}>Impossible de charger le module de ce client.</div>}
        {!erreurChargement && !etat && <div style={{ fontSize: 12, color: '#94a3b8' }}>Chargement…</div>}
        {etat && (
          <>
            {!etat.disponible && !etat.actif && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                Le tarif « Module Comptabilité » vaut 0 DT : saisissez-le d'abord (Tarifs → LabFlow Compta).
              </div>
            )}
            {etat.demandeEnCours && !etat.actif && (
              <div style={{ fontSize: 12, color: '#3730a3', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px' }}>
                📨 Le client a demandé l'activation : sa demande attend dans « Demandes d'activation ».
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#312e81' }}>
                Gérants comptables supplémentaires
                <input type="number" min={0} max={etat.nbGerantsMax} value={nb} onChange={(e) => setNb(e.target.value)}
                  aria-label="Gérants comptables supplémentaires"
                  style={{ width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid #a5b4fc', fontSize: 12, fontFamily: 'inherit' }} />
              </label>
              <span style={{ fontSize: 12, color: '#475569' }}>
                {dt(etat.prixModule)} + {nbValide ? nbNum : 0} × {dt(etat.prixGerant)} = <strong style={{ color: '#312e81' }}>{dt(apercu)}/mois</strong>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {etat.actif ? (
                <>
                  <button type="button" onClick={() => enregistrer(true)} disabled={saving} style={bouton('#4338ca', false)}>
                    {saving ? '…' : '💾 Enregistrer les gérants'}
                  </button>
                  <button type="button" onClick={() => enregistrer(false)} disabled={saving} style={bouton('#dc2626', false)}>
                    {saving ? '…' : '🔒 Désactiver'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => enregistrer(true)} disabled={saving || !etat.disponible} style={{ ...bouton('#4338ca', true), ...(etat.disponible ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}>
                  {saving ? '…' : '🚀 Activer'}
                </button>
              )}
              {etat.actif && (
                <span style={{ fontSize: 11, color: '#4338ca' }}>
                  Activé le {fmtDate(etat.activeLe)} · facturé à partir de {fmtMois(etat.factureAPartirDe)}
                </span>
              )}
              {erreur && <span style={{ fontSize: 11, color: '#dc2626' }}>{erreur}</span>}
            </div>
            {etat.espace?.etat === 'ferme' && !etat.actif && (
              <div style={{ fontSize: 11, color: '#64748b' }}>Sa comptabilité est fermée (rien n'est effacé) : une réactivation la rouvre à l'identique.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
