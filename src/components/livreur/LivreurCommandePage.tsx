import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/client';
import LivreurShell from './LivreurShell';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import { type LivraisonDetail, type Moi, fmtDate, fmtMontant, lienTel, lienItineraire, C, CD } from './livraisons';
import { ACCEPT, preparerFichier, libererFichiers, taille, type FichierChoisi } from '../client/factures/pieces';

// Module Livreurs, étape L3 : fiche d'une livraison sur téléphone — client, itinéraire, appel direct, lignes à livrer,
// montant de la facture, puis la décision sur place : « Livrée » (photo ou PDF de la facture signée / cachetée
// OBLIGATOIRE, réceptionnaire, montant perçu + mode si le compte encaisse) ou « Non livrée » (motif, note obligatoire,
// marchandise rapportée au dépôt ou non). Lecture seule une fois tranché : c'est le responsable qui relance ou annule.
type Vue = 'fiche' | 'livree' | 'echec' | 'fait';

export default function LivreurCommandePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const voc = useVocabulaire();
  const [livraison, setLivraison] = useState<LivraisonDetail | null>(null);
  const [moi, setMoi] = useState<Moi | null>(null);
  const [etatCharge, setEtatCharge] = useState<'chargement' | 'ok' | 'introuvable' | 'erreur'>('chargement');
  const [vue, setVue] = useState<Vue>('fiche');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState('');
  // Formulaire « Livrée »
  const [fichier, setFichier] = useState<FichierChoisi | null>(null);
  const [receptionnaire, setReceptionnaire] = useState('');
  const [montant, setMontant] = useState('');
  const [modeId, setModeId] = useState('');
  // Formulaire « Non livrée »
  const [motif, setMotif] = useState('');
  const [note, setNote] = useState('');
  const [rapportee, setRapportee] = useState<'oui' | 'non' | ''>('');

  const charger = () => api.get(`/api/livreur/commandes/${id}`)
    .then(({ data }) => { setLivraison(data as LivraisonDetail); setEtatCharge('ok'); })
    .catch((e: unknown) => setEtatCharge((e as { response?: { status?: number } })?.response?.status === 404 ? 'introuvable' : 'erreur'));
  useEffect(() => {
    if (!id) return;
    charger();
    api.get('/api/livreur/moi').then(({ data }) => setMoi(data as Moi)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => () => { if (fichier) libererFichiers([fichier]); }, [fichier]);
  const etat = id ? etatCharge : 'introuvable';

  const choisirFichier = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErreur('');
    const prepare = await preparerFichier(f);
    if ('erreur' in prepare) { setErreur(prepare.erreur); return; }
    if (fichier) libererFichiers([fichier]);
    setFichier(prepare);
  };

  const montantNombre = () => (montant.trim() === '' ? NaN : Number(montant.replace(',', '.')));

  const envoyerLivree = async () => {
    if (!livraison) return;
    setErreur('');
    if (!fichier) { setErreur('Photographiez la facture signée ou cachetée par le client : c\'est elle qui valide la livraison.'); return; }
    if (moi?.encaissement) {
      const m = montantNombre();
      if (!Number.isFinite(m) || m < 0) { setErreur('Indiquez le montant perçu (0 si rien n\'a été encaissé).'); return; }
      if (m > 0 && !modeId) { setErreur('Choisissez le mode de paiement.'); return; }
    }
    const fd = new FormData();
    fd.append('facture', fichier.fichier, fichier.fichier.name);
    if (fichier.apercu) fd.append('apercu', fichier.apercu, `${fichier.fichier.name.replace(/\.[^.]*$/, '')}.jpg`);
    if (receptionnaire.trim()) fd.append('receptionnaire', receptionnaire.trim());
    if (moi?.encaissement) {
      fd.append('montantPercu', String(montantNombre()));
      if (modeId) fd.append('modePaiementId', modeId);
    }
    setEnvoi(true);
    try {
      await api.post(`/api/livreur/commandes/${livraison.id}/livree`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFait('✅ Livraison validée — merci ! Votre responsable est prévenu.');
      setVue('fait');
      charger();
    } catch (e: unknown) {
      setErreur((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Envoi impossible : vérifiez le réseau et réessayez.');
    } finally { setEnvoi(false); }
  };

  const envoyerEchec = async () => {
    if (!livraison) return;
    setErreur('');
    if (!motif) { setErreur('Choisissez le motif.'); return; }
    if (note.trim().length < 3) { setErreur('Écrivez une note : elle explique à votre responsable ce qui s\'est passé.'); return; }
    if (!rapportee) { setErreur(`Précisez si la marchandise est rapportée ${voc.au('depot')}.`); return; }
    setEnvoi(true);
    try {
      await api.post(`/api/livreur/commandes/${livraison.id}/echec`, { motif, note: note.trim(), rapporteeDepot: rapportee === 'oui' });
      setFait('⚠️ Livraison déclarée non aboutie. Votre responsable est prévenu et décidera de la suite.');
      setVue('fait');
      charger();
    } catch (e: unknown) {
      setErreur((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Envoi impossible : vérifiez le réseau et réessayez.');
    } finally { setEnvoi(false); }
  };

  const gros: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 12px', borderRadius: 12, fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', flex: 1, border: 'none', cursor: 'pointer' };
  const bloc: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px', marginBottom: 12 };
  const titre: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 };
  const champ: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: '1rem', fontFamily: 'inherit' };
  const etiquette: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#374151', margin: '10px 0 5px' };
  const erreurBloc = erreur && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#991b1b', fontSize: '0.86rem', marginBottom: 12 }}>⚠️ {erreur}</div>;

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
          {vue === 'fait' && (
            <div style={{ background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 14, padding: '16px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontWeight: 800, color: '#065f46', fontSize: '1rem', marginBottom: 10 }}>{fait}</div>
              <button onClick={() => navigate('/livreur')} style={{ ...gros, background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', width: '100%' }}>‹ Retour à mes livraisons</button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 800,
              background: livraison.statut === 'livree' ? '#dcfce7' : livraison.statut === 'livraison_echouee' ? '#ffedd5' : '#d1fae5',
              color: livraison.statut === 'livree' ? '#166534' : livraison.statut === 'livraison_echouee' ? '#9a3412' : CD }}>
              {livraison.statut === 'livree' ? `✅ Livrée le ${fmtDate(livraison.dateLivraison)}`
                : livraison.statut === 'livraison_echouee' ? '⚠️ Non livrée — en attente de votre responsable'
                  : `🚚 À livrer · expédiée le ${fmtDate(livraison.dateExpedition)}`}
            </span>
            {livraison.factureNumero && <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{livraison.factureNumero}</span>}
          </div>

          {livraison.livraison && livraison.statut !== 'expediee' && (
            <div style={{ ...bloc, background: livraison.livraison.resultat === 'livree' ? '#f0fdf4' : '#fff7ed', borderColor: livraison.livraison.resultat === 'livree' ? '#bbf7d0' : '#fed7aa' }}>
              <div style={{ ...titre, color: livraison.livraison.resultat === 'livree' ? '#166534' : '#9a3412' }}>Votre passage</div>
              {livraison.livraison.resultat === 'livree' ? (
                <div style={{ fontSize: '0.9rem', color: '#166534' }}>
                  Facture signée envoyée{livraison.livraison.factureSignee ? ` (${livraison.livraison.factureSignee.nom})` : ''}{livraison.livraison.receptionnaire ? ` · réceptionnée par ${livraison.livraison.receptionnaire}` : ''}
                  {livraison.livraison.montantPercu != null && livraison.livraison.montantPercu > 0 ? ` · encaissé ${fmtMontant(livraison.livraison.montantPercu)}${livraison.livraison.modePaiement ? ` (${livraison.livraison.modePaiement})` : ''}` : ''}
                </div>
              ) : (
                <div style={{ fontSize: '0.9rem', color: '#9a3412' }}>
                  {livraison.livraison.motifLibelle} · {livraison.livraison.rapporteeDepot ? `marchandise rapportée ${voc.au('depot')}` : 'marchandise non rapportée'}
                  {livraison.livraison.note && <div style={{ fontStyle: 'italic', marginTop: 4 }}>« {livraison.livraison.note} »</div>}
                </div>
              )}
            </div>
          )}

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

          {/* Décision sur place (commande encore à livrer) */}
          {livraison.statut === 'expediee' && vue === 'fiche' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={() => { setErreur(''); setVue('livree'); }} style={{ ...gros, background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', padding: '18px 12px', fontSize: '1.05rem' }}>✅ Livrée</button>
              <button onClick={() => { setErreur(''); setVue('echec'); }} style={{ ...gros, background: '#fff', border: '2px solid #ea580c', color: '#9a3412', padding: '18px 12px', fontSize: '1.05rem' }}>❌ Non livrée</button>
            </div>
          )}

          {livraison.statut === 'expediee' && vue === 'livree' && (
            <div style={{ ...bloc, borderColor: '#6ee7b7' }}>
              <div style={{ ...titre, color: '#065f46' }}>✅ Valider la livraison</div>
              <p style={{ fontSize: '0.86rem', color: '#374151', margin: '0 0 8px', lineHeight: 1.5 }}>
                Faites <strong>signer ou cacheter la facture</strong> par le client, puis photographiez-la : c'est cette photo qui valide la livraison.
              </p>
              {erreurBloc}
              <label style={{ ...gros, background: fichier ? '#ecfdf5' : `linear-gradient(135deg, ${CD}, ${C})`, color: fichier ? '#065f46' : '#fff', border: fichier ? '2px solid #6ee7b7' : 'none', width: '100%', boxSizing: 'border-box' }}>
                {fichier ? '📷 Reprendre la photo' : '📷 Photographier la facture signée'}
                <input type="file" accept={ACCEPT} capture="environment" onChange={choisirFichier} style={{ display: 'none' }} />
              </label>
              {fichier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, background: '#f8fafc', borderRadius: 10, padding: 8 }}>
                  {fichier.vignette ? <img src={fichier.vignette} alt="Facture signée" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    : <div style={{ width: 72, height: 72, borderRadius: 8, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>📄</div>}
                  <div style={{ minWidth: 0, fontSize: '0.82rem', color: '#374151' }}>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fichier.fichier.name}</div>
                    <div style={{ color: '#6b7280' }}>{taille(fichier.fichier.size)}</div>
                  </div>
                </div>
              )}
              <label style={etiquette}>Réceptionné par (facultatif)</label>
              <input value={receptionnaire} onChange={(e) => setReceptionnaire(e.target.value)} placeholder="Nom de la personne qui a signé" style={champ} maxLength={150} />
              {moi?.encaissement && (
                <>
                  <label style={etiquette}>Montant perçu (DT) *</label>
                  <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" placeholder={livraison.montantTtc != null ? `Facture : ${fmtMontant(livraison.montantTtc)}` : '0'} style={champ} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setMontant(livraison.montantTtc != null ? String(livraison.montantTtc) : '')} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#065f46', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Le total de la facture</button>
                    <button type="button" onClick={() => { setMontant('0'); setModeId(''); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Rien encaissé</button>
                  </div>
                  {Number.isFinite(montantNombre()) && montantNombre() > 0 && (
                    <>
                      <label style={etiquette}>Mode de paiement *</label>
                      <select value={modeId} onChange={(e) => setModeId(e.target.value)} style={champ}>
                        <option value="">— Choisir —</option>
                        {moi.modesPaiement.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
                      </select>
                    </>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button onClick={() => { setVue('fiche'); setErreur(''); }} disabled={envoi} style={{ ...gros, background: '#fff', border: '1px solid #d1d5db', color: '#374151', flex: '0 0 auto', padding: '14px 16px' }}>Retour</button>
                <button onClick={envoyerLivree} disabled={envoi} style={{ ...gros, background: envoi ? '#9ca3af' : 'linear-gradient(135deg,#065f46,#059669)', color: '#fff' }}>{envoi ? 'Envoi…' : '✅ Confirmer la livraison'}</button>
              </div>
            </div>
          )}

          {livraison.statut === 'expediee' && vue === 'echec' && (
            <div style={{ ...bloc, borderColor: '#fdba74' }}>
              <div style={{ ...titre, color: '#9a3412' }}>❌ Livraison impossible</div>
              {erreurBloc}
              <label style={etiquette}>Motif *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {Object.entries(moi?.motifsEchec || { absent: 'Client absent', adresse_introuvable: 'Adresse introuvable', refus: 'Refus du client', marchandise_abimee: 'Marchandise abîmée', autre: 'Autre' }).map(([code, libelle]) => (
                  <button type="button" key={code} onClick={() => setMotif(code)}
                    style={{ padding: '12px 8px', borderRadius: 10, border: motif === code ? '2px solid #ea580c' : '1px solid #d1d5db', background: motif === code ? '#fff7ed' : '#fff', color: motif === code ? '#9a3412' : '#374151', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}>
                    {libelle}
                  </button>
                ))}
              </div>
              <label style={etiquette}>Note pour votre responsable *</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ce qui s'est passé, ce que le client a dit…" style={{ ...champ, resize: 'vertical' }} maxLength={2000} />
              <label style={etiquette}>La marchandise *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => setRapportee('oui')} style={{ padding: '12px 8px', borderRadius: 10, border: rapportee === 'oui' ? '2px solid #059669' : '1px solid #d1d5db', background: rapportee === 'oui' ? '#ecfdf5' : '#fff', color: rapportee === 'oui' ? '#065f46' : '#374151', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}>↩️ Rapportée {voc.au('depot')}</button>
                <button type="button" onClick={() => setRapportee('non')} style={{ padding: '12px 8px', borderRadius: 10, border: rapportee === 'non' ? '2px solid #ea580c' : '1px solid #d1d5db', background: rapportee === 'non' ? '#fff7ed' : '#fff', color: rapportee === 'non' ? '#9a3412' : '#374151', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}>Non rapportée</button>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button onClick={() => { setVue('fiche'); setErreur(''); }} disabled={envoi} style={{ ...gros, background: '#fff', border: '1px solid #d1d5db', color: '#374151', flex: '0 0 auto', padding: '14px 16px' }}>Retour</button>
                <button onClick={envoyerEchec} disabled={envoi} style={{ ...gros, background: envoi ? '#9ca3af' : 'linear-gradient(135deg,#9a3412,#ea580c)', color: '#fff' }}>{envoi ? 'Envoi…' : '❌ Déclarer non livrée'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </LivreurShell>
  );
}
