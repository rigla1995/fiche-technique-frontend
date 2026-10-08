import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { ChoixCompte } from '../ChoixCompte';
import { Modale } from '../DossierFormulaires';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { codePropose, controlerCodeJournal, lireJournaux, texteCompte, type Journal, type JournauxReponse, type TypeJournal } from '../journaux';
import { bouton, inp, lbl, pastille } from '../styles';

// « Journaux » (LabFlow Compta, étape S5b ; labflow-reprise/achats-compta/PLAN-S5.md §2 ; réponse 8 du client du 07/10 :
// un journal par compte bancaire, le compte 532x subdivisé dans le plan puis choisi ici ; réponse 4 du 08/10 : tout type
// de journal s'ajoute, sauf un seul à-nouveaux) : la liste des journaux d'un dossier, copiés du paquet (AC, VT, BQ, CA,
// OD, AN) puis adaptés — ajouter, modifier (libellé, compte de contrepartie), désactiver / réactiver ; jamais de
// suppression. Les droits viennent du serveur (Complet configure ; Saisie et Consultation lisent) ; un dossier archivé
// ou une comptabilité non active se consultent sans rien changer. Chaque écriture rend la liste entière, que la page
// remplace ; un refus sur un état périmé (404, 409) ferme la fenêtre et relit (convention de S3c), sauf les refus que la
// personne corrige dans la fenêtre (code déjà pris, à-nouveaux en double).
type Fenetre = { type: 'creer' } | { type: 'modifier'; journal: Journal } | null;
type Role = 'titulaire' | 'gerant';
type Refus = (err: unknown) => boolean;
const CORRIGEABLES = ['CODE_EXISTANT', 'UN_SEUL_AN', 'COMPTE_DESACTIVE'];
const codeDe = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaJournauxPage() {
  const { dossierId } = useParams();
  return <ComptaJournaux key={dossierId} dossierId={dossierId} />;
}

function ComptaJournaux({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [etatJx, setEtatJx] = useState<JournauxReponse | null>(null);
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
    lireJournaux(dossierId || '')
      .then((p) => { if (moi === tour.current) { setEtatJx(p); setEtat('pret'); } })
      .catch((err) => { if (moi === tour.current) setEtat(statutDe(err) === 404 ? 'introuvable' : 'erreur'); });
  }, [dossierId]);
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);

  const role: Role = etatJx?.dossier.espace.role || 'titulaire';
  const ouvert = !!etatJx && etatJx.etatAbonnement === 'actif';
  const modifiable = !!etatJx && etatJx.droits.configurer && etatJx.dossier.etat === 'actif' && ouvert;
  const journaux = useMemo(() => (etatJx?.journaux || []).filter((j) => desactives || j.actif), [etatJx, desactives]);
  const aPreciser = useMemo(() => (etatJx?.journaux || []).filter((j) => j.actif && j.compte && !j.compte.imputable).length, [etatJx]);

  const appliquer = (p: JournauxReponse, message: string) => {
    tour.current += 1;
    setEtatJx(p);
    setErreur('');
    setInfo(message);
    setFenetre(null);
  };
  // Refus sur un état périmé (journal disparu, dossier archivé entre-temps) : fenêtre fermée, liste relue.
  const refus: Refus = (err) => {
    const s = statutDe(err);
    if (s !== 404 && s !== 409) return false;
    setFenetre(null);
    setInfo('');
    setErreur(messageDossier(err, 'Action impossible : la liste a été relue.', role));
    charger();
    return true;
  };

  const agir = async (j: Journal, type: 'desactiver' | 'reactiver') => {
    if (!etatJx || occupeRef.current) return;
    const ok = await confirm(type === 'desactiver'
      ? { title: `Désactiver le journal ${j.code} ?`, message: `« ${j.libelle} » sortira de la saisie. Rien n'est effacé : vous pourrez le réactiver.`, tone: 'primary', confirmLabel: 'Désactiver', icon: '⏸️' }
      : { title: `Réactiver le journal ${j.code} ?`, message: `« ${j.libelle} » redevient disponible pour la saisie.`, tone: 'primary', confirmLabel: 'Réactiver', icon: '▶️' });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const { data } = await api.post(`/api/compta/dossiers/${etatJx.dossier.id}/journaux/${j.id}/${type}`);
      appliquer(data as JournauxReponse, type === 'desactiver' ? `Journal ${j.code} désactivé.` : `Journal ${j.code} réactivé.`);
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Action impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };

  const retour = etatJx ? { lien: `/dossiers/${etatJx.dossier.id}`, libelle: etatJx.dossier.nom } : null;
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📒</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Journaux</h1>
            {etatJx?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {etatJx ? `${etatJx.nb.actifs} journa${etatJx.nb.actifs > 1 ? 'ux' : 'l'} actif${etatJx.nb.actifs > 1 ? 's' : ''}${etatJx.nb.total > etatJx.nb.actifs ? ` · ${etatJx.nb.total - etatJx.nb.actifs} désactivé${etatJx.nb.total - etatJx.nb.actifs > 1 ? 's' : ''}` : ''}` : 'Les registres où les écritures du dossier s\'enregistrent, par nature d\'opération'}
          </p>
        </div>
        <BoutonAide section="compta-journaux" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger les journaux.</span>
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

      {etat === 'pret' && etatJx && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etatJx.etatAbonnement, role)} : les journaux restent consultables mais ne se modifient plus.
            </div>
          )}
          {etatJx.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : ses journaux ne se modifient pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && etatJx.dossier.etat === 'actif' && !etatJx.droits.configurer && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter les journaux ; le titulaire et les gérants de niveau Complet les modifient.
            </div>
          )}
          {aPreciser > 0 && (
            <div role="status" style={{ ...alerte, background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', marginBottom: 16 }}>
              ⚠️ {aPreciser > 1 ? `${aPreciser} journaux ont un compte à préciser` : 'Un journal a un compte à préciser'} : le compte de contrepartie a des sous-comptes actifs (par exemple 5321 subdivisé par banque) ; choisissez le sous-compte avec <strong>Modifier</strong>{modifiable ? '' : ' (titulaire ou niveau Complet)'}.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            {(etatJx.nb.total > etatJx.nb.actifs || desactives) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={desactives} onChange={(e) => setDesactives(e.target.checked)} /> Afficher les désactivés ({etatJx.nb.total - etatJx.nb.actifs})
              </label>
            )}
            <span style={{ flex: 1 }} />
            {modifiable && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'creer' }); }} disabled={occupe} style={bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent')}>+ Journal</button>}
          </div>

          <div style={cadre}>
            <div style={enTeteCadre}>
              <span style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>{journaux.length} journa{journaux.length > 1 ? 'ux' : 'l'}</span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Un journal par compte bancaire : subdivisez 5321 dans le plan, puis créez le journal sur le sous-compte.</span>
            </div>
            {journaux.map((j) => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderTop: '1px solid #f1f5f9', fontSize: '0.84rem', flexWrap: 'wrap', opacity: j.actif ? 1 : 0.6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 260px' }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b', minWidth: 44 }}>{j.code}</span>
                  <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <span style={{ color: '#0f172a', fontWeight: 600, overflowWrap: 'anywhere' }}>{j.libelle}</span>
                    {j.avecCompte && (
                      <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b' }}>
                        Compte {j.compte ? texteCompte(j.compte) : 'à choisir'}
                        {j.compte && !j.compte.imputable && <span style={{ ...pastille('#fef3c7', '#92400e'), marginLeft: 6 }} title="Ce compte a des sous-comptes actifs : choisissez le sous-compte">Compte à préciser</span>}
                        {j.compte && !j.compte.actif && <span style={{ ...pastille('#fee2e2', '#991b1b'), marginLeft: 6 }}>Compte désactivé</span>}
                      </span>
                    )}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={pastille('#f1f5f9', '#64748b')}>{j.typeLibelle}</span>
                  {j.origine === 'ajout' && <span style={pastille('#eef2ff', '#3730a3')}>Ajouté</span>}
                  {!j.actif && <span style={pastille('#e2e8f0', '#475569')}>Désactivé</span>}
                </span>
                {modifiable && (
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
                    <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'modifier', journal: j }); }} disabled={occupe} style={lien}>Modifier</button>
                    {j.actif && <button type="button" onClick={() => agir(j, 'desactiver')} disabled={occupe} style={lien}>Désactiver</button>}
                    {!j.actif && (!j.compte || j.compte.actif) && <button type="button" onClick={() => agir(j, 'reactiver')} disabled={occupe} style={lien}>Réactiver</button>}
                  </span>
                )}
              </div>
            ))}
            {journaux.length === 0 && <p style={{ margin: 0, padding: '12px 18px', fontSize: '0.82rem', color: '#64748b' }}>Aucun journal actif.</p>}
          </div>

          {fenetre?.type === 'creer' && <FenetreJournal etatJx={etatJx} role={role} onClose={() => setFenetre(null)} onEnregistre={(p, code) => appliquer(p, `Journal ${code} ajouté.`)} onRefus={refus} />}
          {fenetre?.type === 'modifier' && <FenetreJournal etatJx={etatJx} journal={fenetre.journal} role={role} onClose={() => setFenetre(null)} onEnregistre={(p, code) => appliquer(p, `Journal ${code} enregistré.`)} onRefus={refus} />}
        </>
      )}
    </div>
  );
}

// Ajouter un journal (type, code proposé, libellé, compte de contrepartie pour banque et caisse) ou modifier un journal
// existant (libellé ; compte de contrepartie tant qu'il n'a pas d'écriture ; le type et le code sont figés).
function FenetreJournal({ etatJx, journal, role, onClose, onEnregistre, onRefus }: {
  etatJx: JournauxReponse; journal?: Journal; role: Role; onClose: () => void; onEnregistre: (p: JournauxReponse, code: string) => void; onRefus: Refus;
}) {
  const creation = !journal;
  const [type, setType] = useState<TypeJournal>(journal?.type || 'banque');
  const [code, setCode] = useState(journal?.code || codePropose('banque', etatJx.journaux));
  const [libelle, setLibelle] = useState(journal?.libelle || '');
  const [compteId, setCompteId] = useState<number | null>(journal?.compte?.id ?? null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const choixType = etatJx.types.find((t) => t.valeur === type) || etatJx.types[0];
  const comptes = useMemo(() => etatJx.comptes.filter((c) => !choixType.nature || c.nature === choixType.nature), [etatJx.comptes, choixType.nature]);
  const changerType = (t: TypeJournal) => {
    setType(t);
    setCode(codePropose(t, etatJx.journaux));
    setCompteId(null);
    setErreur(null);
  };
  const enregistrer = async () => {
    if (envoi) return;
    const c = code.trim().toUpperCase();
    if (creation) {
      const e = controlerCodeJournal(c, etatJx.code.max);
      if (e) { setErreur(e); return; }
      if (etatJx.journaux.some((j) => j.code === c)) { setErreur(`Le journal ${c} existe déjà : choisissez un autre code.`); return; }
    }
    if (!libelle.trim()) { setErreur('Indiquez le libellé du journal.'); return; }
    if (creation && choixType.avecCompte && !compteId) { setErreur(`Choisissez le compte de contrepartie (nature ${choixType.libelle.toLowerCase()}).`); return; }
    const corps: Record<string, string | number | null> = {};
    if (creation) { corps.code = c; corps.type = type; corps.libelle = libelle.trim(); if (choixType.avecCompte) corps.compteId = compteId; } else {
      if (libelle.trim() !== journal.libelle) corps.libelle = libelle.trim();
      if (journal.avecCompte && compteId !== (journal.compte?.id ?? null)) corps.compteId = compteId;
      if (!Object.keys(corps).length) { onClose(); return; }
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const url = `/api/compta/dossiers/${etatJx.dossier.id}/journaux`;
      const { data } = creation ? await api.post(url, corps) : await api.put(`${url}/${journal.id}`, corps);
      onEnregistre(data as JournauxReponse, creation ? c : journal.code);
    } catch (err) {
      // Un code pris entre-temps, un deuxième à-nouveaux, un compte désactivé : la saisie reste à corriger dans la fenêtre.
      if (!CORRIGEABLES.includes(codeDe(err) || '') && onRefus(err)) return;
      setErreur(messageDossier(err, 'Le journal n\'a pas pu être enregistré — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={creation ? 'Ajouter un journal' : `Modifier le journal ${journal.code}`} sousTitre={creation ? 'Un journal par compte bancaire ou caisse ; achats, ventes et opérations diverses s\'ajoutent aussi' : `${journal.typeLibelle}${journal.origine === 'paquet' ? ' · journal du paquet' : ''}`} onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur} libelleEnvoi={creation ? '✓ Ajouter le journal' : '✓ Enregistrer'}>
      {creation && (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="fj-type" style={lbl}>Type</label>
          <select id="fj-type" value={type} onChange={(e) => changerType(e.target.value as TypeJournal)} disabled={envoi} style={inp}>
            {etatJx.types.map((t) => <option key={t.valeur} value={t.valeur} disabled={t.valeur === 'an' && etatJx.journaux.some((j) => j.type === 'an')}>{t.libelle}{t.valeur === 'an' && etatJx.journaux.some((j) => j.type === 'an') ? ' (déjà présent)' : ''}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) 3fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label htmlFor="fj-code" style={lbl}>Code</label>
          <input id="fj-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErreur(null); }} disabled={envoi || !creation} maxLength={etatJx.code.max} style={{ ...inp, fontFamily: 'ui-monospace, monospace', fontWeight: 700, textTransform: 'uppercase' }} />
        </div>
        <div>
          <label htmlFor="fj-libelle" style={lbl}>Libellé</label>
          <input id="fj-libelle" value={libelle} onChange={(e) => { setLibelle(e.target.value); setErreur(null); }} disabled={envoi} maxLength={255} placeholder={type === 'banque' ? 'ex. Banque BIAT' : type === 'caisse' ? 'ex. Caisse bar' : 'ex. Ventes comptoir'} style={inp} autoFocus />
        </div>
      </div>
      {choixType.avecCompte && (
        <ChoixCompte id="fj-compte" libelle={`Compte de contrepartie (nature ${choixType.libelle.toLowerCase()})`} comptes={comptes} valeur={compteId} onChange={(id) => { setCompteId(id); setErreur(null); }} disabled={envoi}
          aide={type === 'banque' ? 'Un compte par banque : si 5321 n\'est pas encore subdivisé, faites-le d\'abord dans le plan de comptes (53211 « BIAT »…).' : 'Le compte 5411 ou un de ses sous-comptes.'} />
      )}
      <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
        {creation ? `Le code a de 2 à ${etatJx.code.max} lettres ou chiffres et ne change plus ensuite.` : 'Le code et le type ne changent pas : désactivez ce journal et créez-en un autre s\'il le faut.'}
      </p>
    </Modale>
  );
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
