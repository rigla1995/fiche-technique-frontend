import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import LivreurShell from './LivreurShell';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import { type LivraisonDetail, fmtDate, fmtMontant, lienTel, lienItineraire, C, CD } from './livraisons';

// Module Livreurs, étape L2 : fiche d'une livraison sur téléphone — client, itinéraire, appel direct, lignes à livrer,
// montant de la facture. Lecture seule : les boutons « Livrée » / « Non livrée » arrivent à l'étape L3.
export default function LivreurCommandePage() {
  const { id } = useParams<{ id: string }>();
  const voc = useVocabulaire();
  const [livraison, setLivraison] = useState<LivraisonDetail | null>(null);
  const [etatCharge, setEtatCharge] = useState<'chargement' | 'ok' | 'introuvable' | 'erreur'>('chargement');
  useEffect(() => {
    if (!id) return;
    api.get(`/api/livreur/commandes/${id}`)
      .then(({ data }) => { setLivraison(data as LivraisonDetail); setEtatCharge('ok'); })
      .catch((e: unknown) => setEtatCharge((e as { response?: { status?: number } })?.response?.status === 404 ? 'introuvable' : 'erreur'));
  }, [id]);
  const etat = id ? etatCharge : 'introuvable';

  const gros: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 12px', borderRadius: 12, fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', flex: 1 };
  const bloc: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px', marginBottom: 12 };
  const titre: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 };

  return (
    <LivreurShell>
      <Link to="/livreur" style={{ display: 'inline-block', color: CD, fontWeight: 700, textDecoration: 'none', fontSize: '0.88rem', marginBottom: 12 }}>‹ Mes livraisons</Link>
      {etat === 'chargement' && <div style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Chargement…</div>}
      {etat === 'introuvable' && (
        <div style={{ ...bloc, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 800, color: '#111827', marginBottom: 4 }}>Cette livraison n'est pas (ou plus) à votre nom</div>
          <div style={{ fontSize: '0.84rem', color: '#6b7280' }}>Votre responsable a pu la confier à quelqu'un d'autre ou l'annuler.</div>
        </div>
      )}
      {etat === 'erreur' && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#991b1b', fontSize: '0.85rem' }}>La livraison est indisponible pour le moment.</div>}
      {etat === 'ok' && livraison && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 800, background: livraison.statut === 'livree' ? '#dcfce7' : '#d1fae5', color: livraison.statut === 'livree' ? '#166534' : CD }}>
              {livraison.statut === 'livree' ? `✅ Livrée le ${fmtDate(livraison.dateLivraison)}` : `🚚 À livrer · expédiée le ${fmtDate(livraison.dateExpedition)}`}
            </span>
            {livraison.factureNumero && <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{livraison.factureNumero}</span>}
          </div>

          <div style={bloc}>
            <div style={titre}>Client</div>
            <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#0f172a' }}>{livraison.acheteurNom}</div>
            {livraison.acheteurEntreprise && <div style={{ fontSize: '0.86rem', color: '#6b7280' }}>{livraison.acheteurEntreprise}</div>}
            <div style={{ marginTop: 8, fontSize: '0.9rem', color: '#374151', lineHeight: 1.5 }}>
              {livraison.acheteurAdresse ? <div>📍 {livraison.acheteurAdresse}</div> : <div style={{ color: '#9ca3af' }}>📍 Adresse non renseignée — demandez-la à votre responsable</div>}
              {livraison.acheteurTelephone ? <div>📞 {livraison.acheteurTelephone}</div> : <div style={{ color: '#9ca3af' }}>📞 Téléphone non renseigné</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {livraison.acheteurTelephone && (
                <a href={lienTel(livraison.acheteurTelephone)} style={{ ...gros, background: '#fff', border: `2px solid ${C}`, color: CD }}>📞 Appeler</a>
              )}
              {livraison.acheteurAdresse && (
                <a href={lienItineraire(livraison.acheteurAdresse)} target="_blank" rel="noopener noreferrer" style={{ ...gros, background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff' }}>🗺️ Itinéraire</a>
              )}
            </div>
          </div>

          {livraison.notes && (
            <div style={{ ...bloc, background: '#fffbeb', borderColor: '#fde68a' }}>
              <div style={{ ...titre, color: '#92400e' }}>Consigne du client</div>
              <div style={{ fontSize: '0.9rem', color: '#78350f', whiteSpace: 'pre-wrap' }}>{livraison.notes}</div>
            </div>
          )}

          <div style={bloc}>
            <div style={titre}>À livrer — {livraison.nbLignes} {voc.n('article', livraison.nbLignes).replace(/^\d+\s*/, '')}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
              <tbody>
                {livraison.lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: i < livraison.lignes.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600, color: '#0f172a' }}>{l.designation}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 900, color: CD, whiteSpace: 'nowrap' }}>× {l.quantite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #d1fae5', paddingTop: 10, marginTop: 6, fontWeight: 900, color: CD }}>
              <span>Total TTC de la facture</span><span>{fmtMontant(livraison.montantTtc)}</span>
            </div>
          </div>

          {(livraison.depart || livraison.departAdresse) && (
            <div style={bloc}>
              <div style={titre}>Départ</div>
              <div style={{ fontSize: '0.9rem', color: '#374151' }}>{livraison.depart}{livraison.departAdresse ? ` — ${livraison.departAdresse}` : ''}</div>
            </div>
          )}

          {livraison.statut === 'expediee' && (
            <div style={{ background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: 12, padding: '12px 14px', fontSize: '0.84rem', color: '#166534', lineHeight: 1.5 }}>
              Pour l'instant, c'est votre responsable qui marque la commande livrée. Vous pourrez bientôt la valider ici, avec la facture signée par le client.
            </div>
          )}
        </>
      )}
    </LivreurShell>
  );
}
