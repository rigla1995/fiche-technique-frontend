// Fenêtre « Identité légale » d'un client existant (lot 3, étape 1 — spec backend docs/lot-3-spec.md §2).
// PUT /admin/clients/:id/identite ; erreurs du serveur en bandeau dans la fenêtre ; avertissements (matricule
// sans clé, matricule déjà porté par un autre compte) affichés après l'enregistrement.
// .modal-overlay (z 200) : sous ConfirmDialog (700).
import { useState } from 'react';
import api from '../../api/client';
import ClientIdentiteForm from './ClientIdentiteForm';
import { champsModifies, identiteDe, type IdentiteLegale } from '../../utils/identiteLegale';

export interface ClientIdentiteSource {
  id: number;
  name: string;
  nomAffiche?: string;
  entreprise?: Partial<IdentiteLegale> | null;
}

interface Props<T> {
  client: ClientIdentiteSource;
  onClose: () => void;
  /** Client renvoyé par le serveur après l'enregistrement (liste à mettre à jour). */
  onSaved: (client: T) => void;
  /** Cabinet LabFlow Compta (étape S2b) : PUT /admin/comptables/:id/identite ; seules ses factures d'abonnement l'impriment. */
  cabinet?: boolean;
}

export default function IdentiteClientModal<T>({ client, onClose, onSaved, cabinet = false }: Props<T>) {
  const initiale = identiteDe(client.entreprise);
  const [valeur, setValeur] = useState<IdentiteLegale>(initiale);
  const [saving, setSaving] = useState(false);
  const [lectureEnCours, setLectureEnCours] = useState(false); // lecture de la patente : pas d'enregistrement avant sa fin
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissements, setAvertissements] = useState<string[] | null>(null);
  // Adresse modifiée : les factures de vente d'avant la copie figée (étape 8) et les factures d'approvisionnement
  // la lisent encore sur la fiche.
  const adresseDejaImprimee = !cabinet && (valeur.adresse ?? '').trim() !== (initiale.adresse ?? '').trim();

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || lectureEnCours) return;
    const corps = champsModifies(valeur, initiale);
    if (Object.keys(corps).length === 0) { onClose(); return; }
    setSaving(true);
    setErreur(null);
    try {
      const { data } = await api.put(`/admin/${cabinet ? 'comptables' : 'clients'}/${client.id}/identite`, corps);
      onSaved(data as T);
      const av: string[] = Array.isArray(data?.avertissements) ? data.avertissements : [];
      if (av.length) setAvertissements(av);
      else onClose();
    } catch (err: unknown) {
      setErreur((err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || "L'identité n'a pas pu être enregistrée — réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, borderRadius: 16 }}>
        <div style={{ background: 'linear-gradient(135deg,#78350f 0%,#b45309 55%,#f59e0b 100%)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Identité légale</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🪪 {client.nomAffiche || client.name}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '5px 9px', lineHeight: 1 }}>✕</button>
        </div>

        {avertissements ? (
          <>
            <div className="modal-body">
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '9px 12px', fontSize: '0.84rem', fontWeight: 600, marginBottom: 10 }}>
                ✓ Identité enregistrée.
              </div>
              {avertissements.map((a) => (
                <div key={a} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '9px 12px', fontSize: '0.82rem', marginTop: 6, lineHeight: 1.5 }}>
                  ⚠️ {a}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: '#0d9488', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>Fermer</button>
            </div>
          </>
        ) : (
          <form onSubmit={enregistrer} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div className="modal-body">
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 14px', lineHeight: 1.55 }}>
                Telle qu'elle figure sur la patente. Elle figurera sur les prochaines factures
                {cabinet ? ' d\'abonnement à LabFlow Compta' : ' de vente et d\'abonnement'} ; celles déjà émises ne changent pas.
                Un champ peut rester vide : la fiche reste marquée « Identité à compléter ».
              </p>
              <ClientIdentiteForm value={valeur} onChange={(v) => { setValeur(v); setErreur(null); }} disabled={saving} onLecture={setLectureEnCours} />
              {adresseDejaImprimee && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', marginTop: 14, lineHeight: 1.5 }}>
                  ⚠️ Les factures de vente d'avant la mise à jour d'octobre 2026 et les factures
                  d'approvisionnement lisent encore l'adresse de la fiche : téléchargées de nouveau, elles suivront
                  ce changement.
                </div>
              )}
              {erreur && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginTop: 14 }}>
                  {erreur}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button type="submit" disabled={saving || lectureEnCours}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#fcd34d' : 'linear-gradient(135deg,#b45309,#f59e0b)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Enregistrement…' : '✓ Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
