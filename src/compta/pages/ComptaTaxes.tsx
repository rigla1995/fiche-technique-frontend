import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { ChoixCompte } from '../ChoixCompte';
import { Modale } from '../DossierFormulaires';
import { libelleTva, messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import type { CompteCourt } from '../journaux';
import { controlerCodeTaxe, controlerMontant, controlerTaux, fmtMontant, fmtTaux, lireTaxes, valeurTaxe, type Assiette, type CodePaquet, type Taxe, type TaxesReponse, type TypeTaxe } from '../taxes';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Taxes » (LabFlow Compta, étape S5b ; labflow-reprise/achats-compta/PLAN-S5.md §2, §5 ; réponses du client des 07/10 et
// 08/10) : les codes de taxe d'un dossier, copiés du paquet selon son régime (TVA par taux, retenues à la source, retenue
// de TVA, droit de timbre, FODEC, avances) puis adaptés — ajouter depuis le paquet (les codes non encore copiés), ajouter
// un code personnalisé, modifier (libellé et comptes de tout code ; type, taux, montant et assiette d'un code
// personnalisé seulement), désactiver / réactiver ; jamais de suppression. Un code dont un compte a des sous-comptes
// actifs ou est désactivé porte « Compte à préciser » (point 2 du 08/10 : les sous-comptes proposés sont créés par
// défaut ET remplaçables). Les droits viennent du serveur ; un dossier archivé ou une comptabilité non active se
// consultent sans rien changer. Chaque écriture rend la liste entière, que la page remplace ; un refus sur un état
// périmé (404, 409) ferme la fenêtre et relit (convention de S3c), sauf les refus que la personne corrige dans la fenêtre.
type Fenetre = { type: 'paquet' } | { type: 'creer' } | { type: 'modifier'; taxe: Taxe } | null;
type Role = 'titulaire' | 'gerant';
type Refus = (err: unknown) => boolean;
// Refus que la personne corrige dans la fenêtre ; un code déjà copié entre-temps (DEJA_PRESENT) est un état périmé :
// fenêtre fermée, liste relue (relecture).
const CORRIGEABLES = ['CODE_EXISTANT', 'CODE_PAQUET', 'COMPTE_DESACTIVE'];
const codeDe = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
const aPreciser = (c: CompteCourt | null) => !!c && !c.imputable;

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaTaxesPage() {
  const { dossierId } = useParams();
  return <ComptaTaxes key={dossierId} dossierId={dossierId} />;
}

function ComptaTaxes({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [etatTx, setEtatTx] = useState<TaxesReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [desactives, setDesactives] = useState(false);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);

  // Lectures numérotées : une lecture partie avant la dernière réponse reçue ne l'écrase jamais.
  const tour = useRef(0);
  const charger = useCallback(() => {
    const moi = ++tour.current;
    lireTaxes(dossierId || '')
      .then((p) => { if (moi === tour.current) { setEtatTx(p); setEtat('pret'); } })
      .catch((err) => { if (moi === tour.current) setEtat(statutDe(err) === 404 ? 'introuvable' : 'erreur'); });
  }, [dossierId]);
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);

  const role: Role = etatTx?.dossier.espace.role || 'titulaire';
  const ouvert = !!etatTx && etatTx.etatAbonnement === 'actif';
  const modifiable = !!etatTx && etatTx.droits.configurer && etatTx.dossier.etat === 'actif' && ouvert;
  // Groupes dans l'ordre des types du serveur (un type ajouté côté serveur apparaît sans retouche d'écran).
  const groupes = useMemo(() => {
    const liste = (etatTx?.taxes || []).filter((t) => desactives || t.actif);
    return (etatTx?.types || []).map((x) => ({ type: x.valeur, libelle: x.libelle, taxes: liste.filter((t) => t.type === x.valeur) })).filter((g) => g.taxes.length);
  }, [etatTx, desactives]);
  const nbAPreciser = useMemo(() => (etatTx?.taxes || []).filter((t) => t.actif && (aPreciser(t.compteAchat) || aPreciser(t.compteVente) || aPreciser(t.compteImmo))).length, [etatTx]);
  const sansTva = etatTx ? etatTx.regime.tva !== 'reel' : false;

  const appliquer = (p: TaxesReponse, message: string, garderFenetre = false) => {
    tour.current += 1;
    setEtatTx(p);
    setErreur('');
    setInfo(message);
    if (!garderFenetre) setFenetre(null);
  };
  // Refus sur un état périmé (code disparu, dossier archivé entre-temps) : fenêtre fermée, liste relue.
  const refus: Refus = (err) => {
    const s = statutDe(err);
    if (s !== 404 && s !== 409) return false;
    setFenetre(null);
    setInfo('');
    setErreur(messageDossier(err, 'Action impossible : la liste a été relue.', role));
    charger();
    return true;
  };

  const agir = async (t: Taxe, type: 'desactiver' | 'reactiver') => {
    if (!etatTx || occupeRef.current) return;
    const ok = await confirm(type === 'desactiver'
      ? { title: `Désactiver le code ${t.code} ?`, message: `« ${t.libelle} » sortira de la saisie. Rien n'est effacé : vous pourrez le réactiver.`, tone: 'primary', confirmLabel: 'Désactiver', icon: '⏸️' }
      : { title: `Réactiver le code ${t.code} ?`, message: `« ${t.libelle} » redevient disponible pour la saisie.`, tone: 'primary', confirmLabel: 'Réactiver', icon: '▶️' });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const { data } = await api.post(`/api/compta/dossiers/${etatTx.dossier.id}/taxes/${t.id}/${type}`);
      appliquer(data as TaxesReponse, type === 'desactiver' ? `Code ${t.code} désactivé.` : `Code ${t.code} réactivé.`);
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Action impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };

  const retour = etatTx ? { lien: `/dossiers/${etatTx.dossier.id}`, libelle: etatTx.dossier.nom } : null;
  const sousTitre = etatTx
    ? `${libelleTva(etatTx.regime.tva)}${etatTx.regime.exportateurTotal ? ' · exportateur total' : ''} · ${etatTx.nb.actifs} code${etatTx.nb.actifs > 1 ? 's' : ''} actif${etatTx.nb.actifs > 1 ? 's' : ''}${etatTx.nb.total > etatTx.nb.actifs ? ` · ${etatTx.nb.total - etatTx.nb.actifs} désactivé${etatTx.nb.total - etatTx.nb.actifs > 1 ? 's' : ''}` : ''}`
    : 'TVA par taux, retenues à la source, droit de timbre : chaque code connaît son taux, son assiette et ses comptes';
  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          {retour && <Link to={retour.lien} style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>← {retour.libelle}</Link>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Taxes</h1>
            {etatTx?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{sousTitre}</p>
        </div>
        <BoutonAide section="compta-taxes" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger les codes de taxe.</span>
          <button type="button" onClick={() => { setEtat('chargement'); charger(); }} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}
      {etat === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}

      {etat === 'pret' && etatTx && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etatTx.etatAbonnement, role)} : les codes de taxe restent consultables mais ne se modifient plus.
            </div>
          )}
          {etatTx.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : ses codes de taxe ne se modifient pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && etatTx.dossier.etat === 'actif' && !etatTx.droits.configurer && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter les codes de taxe ; le titulaire et les gérants de niveau Complet les modifient.
            </div>
          )}
          {sansTva && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier « {libelleTva(etatTx.regime.tva).toLowerCase()} » : aucun code de TVA n'a été copié (la TVA reste dans le coût) ; retenues, timbre, FODEC et avances sont là. Si le régime change, <strong>Ajouter depuis le paquet</strong> propose les codes de TVA.
            </div>
          )}
          {nbAPreciser > 0 && (
            <div role="status" style={{ ...alerte, background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', marginBottom: 16 }}>
              ⚠️ {nbAPreciser > 1 ? `${nbAPreciser} codes ont un compte à préciser` : 'Un code a un compte à préciser'} : le compte a des sous-comptes actifs ou est désactivé. Choisissez un autre compte avec <strong>Modifier</strong>{modifiable ? '' : ' (titulaire ou niveau Complet)'}, ou rendez-le imputable dans le <Link to={`/dossiers/${etatTx.dossier.id}/plan`} style={{ color: '#92400e' }}>plan de comptes</Link>.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            {(etatTx.nb.total > etatTx.nb.actifs || desactives) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={desactives} onChange={(e) => setDesactives(e.target.checked)} /> Afficher les désactivés ({etatTx.nb.total - etatTx.nb.actifs})
              </label>
            )}
            <span style={{ flex: 1 }} />
            {modifiable && etatTx.paquet && etatTx.paquet.codes.length > 0 && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'paquet' }); }} disabled={occupe} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>📦 Ajouter depuis le paquet ({etatTx.paquet.codes.length})</button>}
            {modifiable && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'creer' }); }} disabled={occupe} style={bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent')}>+ Code personnalisé</button>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groupes.map((g) => (
              <div key={g.type} style={cadre}>
                <div style={enTeteCadre}>
                  <span style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>{g.libelle}</span>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>{g.taxes.length} code{g.taxes.length > 1 ? 's' : ''}</span>
                </div>
                {g.taxes.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderTop: '1px solid #f1f5f9', fontSize: '0.84rem', flexWrap: 'wrap', opacity: t.actif ? 1 : 0.6 }}>
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: '1 1 300px' }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b', minWidth: 84 }}>{t.code}</span>
                      <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <span style={{ color: '#0f172a', fontWeight: 600, overflowWrap: 'anywhere' }}>{t.libelle}</span>
                        <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b' }}>
                          <strong style={{ color: '#1e1b4b' }}>{valeurTaxe(t)}</strong> · {t.assietteLibelle}{t.codeTej ? ` · TEJ ${t.codeTej}` : ''}
                        </span>
                        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.76rem', color: '#64748b' }}>
                          <Compte libelle="Achat" c={t.compteAchat} />
                          <Compte libelle="Vente" c={t.compteVente} />
                          {t.compteImmo && <Compte libelle="Immobilisations" c={t.compteImmo} />}
                        </span>
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {t.origine === 'ajout' && <span style={pastille('#eef2ff', '#3730a3')}>Ajouté</span>}
                      {!t.actif && <span style={pastille('#e2e8f0', '#475569')}>Désactivé</span>}
                    </span>
                    {modifiable && (
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
                        <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'modifier', taxe: t }); }} disabled={occupe} style={lien}>Modifier</button>
                        {t.actif && <button type="button" onClick={() => agir(t, 'desactiver')} disabled={occupe} style={lien}>Désactiver</button>}
                        {!t.actif && [t.compteAchat, t.compteVente, t.compteImmo].every((c) => !c || c.actif) && <button type="button" onClick={() => agir(t, 'reactiver')} disabled={occupe} style={lien}>Réactiver</button>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {groupes.length === 0 && <div style={{ ...cadre, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucun code actif : ajoutez-en depuis le paquet ou créez un code personnalisé.</div>}
          </div>

          {fenetre?.type === 'paquet' && etatTx.paquet && <FenetrePaquet etatTx={etatTx} role={role} onClose={() => setFenetre(null)} onAjoute={(p, code) => appliquer(p, `Code ${code} ajouté depuis le paquet.`, (p.paquet?.codes.length || 0) > 0)} onRefus={refus} />}
          {fenetre?.type === 'creer' && <FenetreTaxe etatTx={etatTx} role={role} onClose={() => setFenetre(null)} onEnregistre={(p, code) => appliquer(p, `Code ${code} ajouté.`)} onRefus={refus} />}
          {fenetre?.type === 'modifier' && <FenetreTaxe etatTx={etatTx} taxe={fenetre.taxe} role={role} onClose={() => setFenetre(null)} onEnregistre={(p, code) => appliquer(p, `Code ${code} enregistré.`)} onRefus={refus} />}
        </>
      )}
    </div>
  );
}

// Un compte d'un code : « Achat 43666 » ; « à préciser » quand il a des sous-comptes actifs ou qu'il est désactivé.
function Compte({ libelle, c }: { libelle: string; c: CompteCourt | null }) {
  return (
    <span title={c ? `${c.numero} — ${c.libelle}` : undefined}>
      {libelle} <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: c ? '#1e1b4b' : '#94a3b8' }}>{c ? c.numero : '—'}</span>
      {aPreciser(c) && <span style={{ ...pastille('#fef3c7', '#92400e'), marginLeft: 4 }} title={c && !c.actif ? 'Compte désactivé' : 'Ce compte a des sous-comptes actifs'}>à préciser</span>}
    </span>
  );
}

// « Ajouter depuis le paquet » : les codes du paquet que le dossier n'a pas encore, avec taux, assiette et comptes ; un
// clic copie le code (ses sous-comptes proposés sont créés s'il le faut). La fenêtre reste ouverte tant qu'il en reste.
function FenetrePaquet({ etatTx, role, onClose, onAjoute, onRefus }: { etatTx: TaxesReponse; role: Role; onClose: () => void; onAjoute: (p: TaxesReponse, code: string) => void; onRefus: Refus }) {
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const codes = etatTx.paquet?.codes || [];
  const ajouter = async (c: CodePaquet) => {
    if (envoi) return;
    setEnvoi(c.code);
    setErreur(null);
    try {
      const { data } = await api.post(`/api/compta/dossiers/${etatTx.dossier.id}/taxes/paquet`, { code: c.code });
      onAjoute(data as TaxesReponse, c.code);
    } catch (err) {
      if (!CORRIGEABLES.includes(codeDe(err) || '') && onRefus(err)) return;
      setErreur(messageDossier(err, 'Le code n\'a pas pu être ajouté — réessayez.', role));
    } finally {
      setEnvoi(null);
    }
  };
  return (
    <Modale titre="Ajouter depuis le paquet" sousTitre={`${etatTx.paquet?.libelle || 'Paquet'} ${etatTx.paquet?.version || ''} : ${codes.length} code${codes.length > 1 ? 's' : ''} que ce dossier n'a pas encore`} onClose={onClose} onSubmit={onClose} envoi={!!envoi} erreur={erreur} libelleEnvoi="Fermer" large>
      {codes.length === 0 && <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>Tous les codes du paquet sont dans le dossier.</p>}
      {codes.map((c) => (
        <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.84rem', flexWrap: 'wrap' }}>
          <span style={{ minWidth: 0, flex: '1 1 260px' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b', marginRight: 8 }}>{c.code}</span>
            <span style={{ color: '#0f172a', fontWeight: 600, overflowWrap: 'anywhere' }}>{c.libelle}</span>
            <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b' }}>
              {c.typeLibelle} · <strong style={{ color: '#1e1b4b' }}>{valeurTaxe(c)}</strong> · {c.assietteLibelle}
              {(c.comptes.achat || c.comptes.vente) ? ` · achat ${c.comptes.achat || '—'} · vente ${c.comptes.vente || '—'}${c.comptes.immobilisations ? ` · immobilisations ${c.comptes.immobilisations}` : ''}` : ''}
              {c.copie !== 'jamais' ? ` · copié d'office : ${c.copieLibelle.toLowerCase()}` : ''}
            </span>
            {c.note && <span style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8' }}>{c.note}</span>}
          </span>
          <button type="button" onClick={() => ajouter(c)} disabled={!!envoi} style={{ ...petit('#eef2ff', '#4338ca', '#c7d2fe'), marginLeft: 'auto' }}>{envoi === c.code ? 'Ajout…' : '+ Ajouter'}</button>
        </div>
      ))}
    </Modale>
  );
}

// Ajouter un code personnalisé (code, libellé, type, assiette, taux ou montant fixe, comptes) ou modifier un code : le
// libellé et les comptes de tout code ; le type, l'assiette, le taux et le montant d'un code personnalisé seulement (un
// code du paquet garde les siens : champs figés à l'écran, et le serveur refuse un changement réel).
function FenetreTaxe({ etatTx, taxe, role, onClose, onEnregistre, onRefus }: {
  etatTx: TaxesReponse; taxe?: Taxe; role: Role; onClose: () => void; onEnregistre: (p: TaxesReponse, code: string) => void; onRefus: Refus;
}) {
  const creation = !taxe;
  const figes = !!taxe && taxe.origine === 'paquet';
  const [code, setCode] = useState(taxe?.code || '');
  const [libelle, setLibelle] = useState(taxe?.libelle || '');
  const [type, setType] = useState<TypeTaxe>(taxe?.type || 'autre');
  const [assiette, setAssiette] = useState<Assiette>(taxe?.assiette || 'ht');
  const [taux, setTaux] = useState(taxe?.taux != null ? String(Number(taxe.taux)).replace('.', ',') : '');
  const [montant, setMontant] = useState(taxe?.montant != null ? Number(taxe.montant).toFixed(3).replace('.', ',') : '');
  const [achat, setAchat] = useState<number | null>(taxe?.compteAchat?.id ?? null);
  const [vente, setVente] = useState<number | null>(taxe?.compteVente?.id ?? null);
  const [immo, setImmo] = useState<number | null>(taxe?.compteImmo?.id ?? null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fixe = assiette === 'fixe';
  const enregistrer = async () => {
    if (envoi) return;
    const c = code.trim().toUpperCase();
    if (creation) {
      const e = controlerCodeTaxe(c, etatTx.code.max);
      if (e) { setErreur(e); return; }
      if (etatTx.taxes.some((t) => t.code === c)) { setErreur(`Le code ${c} existe déjà : choisissez un autre code.`); return; }
      if (etatTx.paquet?.codes.some((t) => t.code === c)) { setErreur(`${c} est un code du paquet : ajoutez-le depuis le paquet.`); return; }
    }
    if (!libelle.trim()) { setErreur('Indiquez le libellé.'); return; }
    if (!figes) {
      const e = fixe ? controlerMontant(montant) : controlerTaux(taux);
      if (e) { setErreur(e); return; }
    }
    const corps: Record<string, string | number | null> = {};
    const valeurTaux = taux.trim().replace(',', '.');
    const valeurMontant = montant.trim().replace(',', '.');
    if (creation) {
      Object.assign(corps, { code: c, libelle: libelle.trim(), type, assiette, compteAchatId: achat, compteVenteId: vente, compteImmoId: immo });
      if (fixe) corps.montant = valeurMontant; else corps.taux = valeurTaux;
    } else {
      if (libelle.trim() !== taxe.libelle) corps.libelle = libelle.trim();
      if (achat !== (taxe.compteAchat?.id ?? null)) corps.compteAchatId = achat;
      if (vente !== (taxe.compteVente?.id ?? null)) corps.compteVenteId = vente;
      if (immo !== (taxe.compteImmo?.id ?? null)) corps.compteImmoId = immo;
      if (!figes) {
        // Assiette et taux (ou montant) toujours renvoyés en texte : le serveur ne retient que les changements réels
        // (jamais de comparaison numérique à l'écran, relecture).
        if (type !== taxe.type) corps.type = type;
        corps.assiette = assiette;
        if (fixe) corps.montant = valeurMontant; else corps.taux = valeurTaux;
      }
      if (!Object.keys(corps).length) { onClose(); return; }
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const url = `/api/compta/dossiers/${etatTx.dossier.id}/taxes`;
      const { data } = creation ? await api.post(url, corps) : await api.put(`${url}/${taxe.id}`, corps);
      onEnregistre(data as TaxesReponse, creation ? c : taxe.code);
    } catch (err) {
      if (!CORRIGEABLES.includes(codeDe(err) || '') && onRefus(err)) return;
      setErreur(messageDossier(err, 'Le code n\'a pas pu être enregistré — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={creation ? 'Ajouter un code personnalisé' : `Modifier le code ${taxe.code}`} sousTitre={creation ? 'Une taxe que le paquet ne connaît pas (droit de consommation, taxe locale…)' : figes ? `Code du paquet : ${taxe.typeLibelle} · ${valeurTaxe(taxe)} · ${taxe.assietteLibelle} (figés) ; le libellé et les comptes se modifient` : 'Code personnalisé'} onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur} libelleEnvoi={creation ? '✓ Ajouter le code' : '✓ Enregistrer'} large>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 3fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label htmlFor="ft-code" style={lbl}>Code</label>
          <input id="ft-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErreur(null); }} disabled={envoi || !creation} maxLength={etatTx.code.max} placeholder="DC_ALC" style={{ ...inp, fontFamily: 'ui-monospace, monospace', fontWeight: 700, textTransform: 'uppercase' }} autoFocus={creation} />
        </div>
        <div>
          <label htmlFor="ft-libelle" style={lbl}>Libellé</label>
          <input id="ft-libelle" value={libelle} onChange={(e) => { setLibelle(e.target.value); setErreur(null); }} disabled={envoi} maxLength={255} placeholder="ex. Droit de consommation 25 %" style={inp} autoFocus={!creation} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div>
          <label htmlFor="ft-type" style={lbl}>Type</label>
          <select id="ft-type" value={type} onChange={(e) => setType(e.target.value as TypeTaxe)} disabled={envoi || figes} style={inp}>
            {etatTx.types.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ft-assiette" style={lbl}>Assiette</label>
          <select id="ft-assiette" value={assiette} onChange={(e) => { setAssiette(e.target.value as Assiette); setErreur(null); }} disabled={envoi || figes} style={inp}>
            {etatTx.assiettes.map((a) => <option key={a.valeur} value={a.valeur}>{a.libelle}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ft-valeur" style={lbl}>{fixe ? 'Montant par facture (D)' : 'Taux (%)'}</label>
          {fixe
            ? <input id="ft-valeur" value={montant} onChange={(e) => { setMontant(e.target.value); setErreur(null); }} disabled={envoi || figes} inputMode="decimal" placeholder="ex. 1 ou 0,600" style={inp} />
            : <input id="ft-valeur" value={taux} onChange={(e) => { setTaux(e.target.value); setErreur(null); }} disabled={envoi || figes} inputMode="decimal" placeholder="ex. 19 ou 1,5" style={inp} />}
        </div>
      </div>
      <ChoixCompte id="ft-achat" libelle="Compte à l'achat" comptes={etatTx.comptes} valeur={achat} onChange={(id) => { setAchat(id); setErreur(null); }} disabled={envoi} facultatif aide="TVA déductible, retenue opérée, charge (timbre payé)…" />
      <ChoixCompte id="ft-vente" libelle="Compte à la vente" comptes={etatTx.comptes} valeur={vente} onChange={(id) => { setVente(id); setErreur(null); }} disabled={envoi} facultatif aide="TVA collectée, retenue subie, taxe collectée à reverser…" />
      <ChoixCompte id="ft-immo" libelle="Compte sur immobilisations" comptes={etatTx.comptes} valeur={immo} onChange={(id) => { setImmo(id); setErreur(null); }} disabled={envoi} facultatif aide="Facultatif : la TVA déductible sur immobilisations (43662), par exemple." />
      {!creation && figes && <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>Un taux qui change (loi de finances) est un nouveau code, apporté par une nouvelle version du paquet ; en attendant, ajoutez un code personnalisé.</p>}
      {fixe && !figes && <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>Montant fixe par facture : {montant.trim() ? fmtMontant(montant.trim().replace(',', '.')) : '—'}.</p>}
      {!fixe && !figes && taux.trim() && !controlerTaux(taux) && <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>Taux : {fmtTaux(taux.trim().replace(',', '.'))}.</p>}
    </Modale>
  );
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
