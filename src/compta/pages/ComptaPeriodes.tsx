import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { fmtMoisAnnee, messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { fmtJour, fmtMontant, validerPeriode } from '../ecritures';
import { LIBELLES_ETAT_PERIODE, clorePeriode, lireCentralisation, lirePeriodes, rouvrirPeriode, telechargerJournalGeneral, type CentralisationReponse, type Periode, type PeriodesReponse } from '../periodes';
import { bouton, pastille, petit } from '../styles';

// « Périodes » (LabFlow Compta, étape S6b ; labflow-reprise/achats-compta/PLAN-S6.md §2, §4 ; réponse 5 du client du
// 08/10 : clôture par le titulaire ou Complet quand tout est validé, réouverture par le titulaire seul) : les mois de
// l'exercice ouvert d'un dossier avec leur état, leurs écritures en brouillard et validées, qui a clos ou rouvert et
// quand ; « Valider tout » (toutes les écritures en brouillard du mois, définitif), « Clore » (plus rien en brouillard),
// « Rouvrir » (titulaire), « Journal général (PDF) » (pages numérotées, centralisation, écritures validées) ; une
// période dépliée montre sa centralisation (totaux par journal). Les droits viennent du serveur ; un dossier archivé ou
// une comptabilité non active se consultent sans rien changer. Chaque écriture rend la page entière, que l'écran
// remplace ; un refus sur un état périmé (404, 409) relit la page (convention de S3c).
type Role = 'titulaire' | 'gerant';
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;
const quand = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaPeriodesPage() {
  const { dossierId } = useParams();
  return <ComptaPeriodes key={dossierId} dossierId={dossierId} />;
}

function ComptaPeriodes({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [etatPx, setEtatPx] = useState<PeriodesReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);
  // Les périodes dépliées et leur centralisation (lue à la demande ; relue après une action qui la change).
  const [depliees, setDepliees] = useState<Set<number>>(() => new Set());
  const [details, setDetails] = useState<Map<number, CentralisationReponse | 'lecture' | 'erreur'>>(() => new Map());
  const tour = useRef(0);

  const charger = useCallback(() => {
    const moi = ++tour.current;
    lirePeriodes(dossierId || '')
      .then((r) => { if (moi === tour.current) { setEtatPx(r); setEtat('pret'); } })
      .catch((err) => { if (moi === tour.current) setEtat(statutDe(err) === 404 ? 'introuvable' : 'erreur'); });
  }, [dossierId]);
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);

  const lireDetail = useCallback((id: number) => {
    if (!etatPx) return;
    setDetails((m) => { const n = new Map(m); n.set(id, 'lecture'); return n; });
    lireCentralisation(etatPx.dossier.id, id)
      .then((c) => setDetails((m) => { const n = new Map(m); n.set(id, c); return n; }))
      .catch(() => setDetails((m) => { const n = new Map(m); n.set(id, 'erreur'); return n; }));
  }, [etatPx]);

  const role: Role = etatPx?.dossier.espace.role || 'titulaire';
  const ouvert = !!etatPx && etatPx.etatAbonnement === 'actif';
  const dossierActif = !!etatPx && etatPx.dossier.etat === 'actif';
  const exerciceOuvert = !!etatPx?.exercice && etatPx.exercice.etat === 'ouvert';
  const peutValider = !!etatPx && etatPx.droits.configurer && dossierActif && ouvert && exerciceOuvert;
  const peutRouvrir = !!etatPx && etatPx.droits.archiver && dossierActif && ouvert && exerciceOuvert;

  // Page rendue par une écriture : remplacée ; la centralisation des périodes dépliées est relue.
  const appliquer = (r: PeriodesReponse, message: string, relire: number[] = []) => {
    tour.current += 1;
    setEtatPx(r);
    setErreur('');
    setInfo(message);
    setDetails((m) => { const n = new Map(m); relire.forEach((id) => n.delete(id)); return n; });
  };
  const refus = (err: unknown) => {
    const s = statutDe(err);
    if (s !== 404 && s !== 409) return false;
    setInfo('');
    setErreur(messageDossier(err, 'Action impossible : la page a été relue.', role));
    charger();
    return true;
  };
  const agir = async (travail: () => Promise<void>, defaut: string) => {
    if (occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      await travail();
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, defaut, role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  const validerTout = async (p: Periode) => {
    if (!etatPx) return;
    const ok = await confirm({
      title: `Valider les écritures de ${fmtMoisAnnee(p.debut)} ?`,
      message: `${pluriel(p.nbBrouillard, 'écriture en brouillard', 'écritures en brouillard')} vont être validées dans l'ordre des dates : chacune reçoit son numéro définitif (continu par journal et par exercice). C'est définitif : une écriture validée ne se modifie plus et ne se supprime plus ; elle se contre-passe.`,
      tone: 'primary',
      confirmLabel: 'Valider tout',
      icon: '🔏',
    });
    if (!ok) return;
    await agir(async () => {
      const r = await validerPeriode(etatPx.dossier.id, p.id);
      const page = await lirePeriodes(etatPx.dossier.id);
      appliquer(page, `${pluriel(r.validees, 'écriture validée', 'écritures validées')} pour ${fmtMoisAnnee(p.debut)} (définitif).`, [p.id]);
      if (depliees.has(p.id)) setTimeout(() => lireDetail(p.id), 0);
    }, 'Validation impossible, réessayez.');
  };
  const clore = async (p: Periode) => {
    if (!etatPx) return;
    const ok = await confirm({
      title: `Clore ${fmtMoisAnnee(p.debut)} ?`,
      message: `La période du ${fmtJour(p.debut)} au ${fmtJour(p.fin)} (${pluriel(p.nbValidees, 'écriture validée', 'écritures validées')}) n'acceptera plus aucune écriture datée dedans. Une opération oubliée s'enregistrera au premier jour de la période ouverte suivante, avec sa vraie date.`,
      details: ['Le titulaire peut rouvrir une période tant que l\'exercice est ouvert ; la réouverture est journalisée.'],
      tone: 'primary',
      confirmLabel: 'Clore',
      icon: '🔒',
    });
    if (!ok) return;
    await agir(async () => appliquer(await clorePeriode(etatPx.dossier.id, p.id), `Période ${fmtMoisAnnee(p.debut)} close.`), 'Clôture impossible, réessayez.');
  };
  const rouvrir = async (p: Periode) => {
    if (!etatPx) return;
    const ok = await confirm({
      title: `Rouvrir ${fmtMoisAnnee(p.debut)} ?`,
      message: `La période du ${fmtJour(p.debut)} au ${fmtJour(p.fin)} acceptera de nouveau des écritures. Les écritures validées restent validées. La réouverture est journalisée (qui, quand) : à réserver à une opération oubliée.`,
      tone: 'danger',
      confirmLabel: 'Rouvrir',
      icon: '🔓',
    });
    if (!ok) return;
    await agir(async () => appliquer(await rouvrirPeriode(etatPx.dossier.id, p.id), `Période ${fmtMoisAnnee(p.debut)} rouverte.`), 'Réouverture impossible, réessayez.');
  };
  const pdf = async (p: Periode) => {
    if (!etatPx) return;
    setInfo('');
    await agir(async () => { await telechargerJournalGeneral(etatPx.dossier.id, p); setInfo(`Journal général de ${fmtMoisAnnee(p.debut)} téléchargé (PDF).`); }, 'Le journal général n\'a pas pu être produit, réessayez.');
  };
  const basculer = (p: Periode) => {
    const ouverte = depliees.has(p.id);
    setDepliees((s) => { const n = new Set(s); if (ouverte) n.delete(p.id); else n.add(p.id); return n; });
    if (ouverte || (details.get(p.id) && details.get(p.id) !== 'erreur')) return;
    lireDetail(p.id);
  };

  const retour = etatPx ? { lien: `/dossiers/${etatPx.dossier.id}`, libelle: etatPx.dossier.nom } : null;
  const periodes = etatPx?.exercice?.periodes ?? [];
  const nbCloses = periodes.filter((p) => p.etat === 'close').length;
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🔏</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Périodes</h1>
            {etatPx?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {etatPx
              ? `${pluriel(etatPx.nb.brouillard, 'écriture en brouillard', 'écritures en brouillard')} · ${pluriel(etatPx.nb.validees, 'validée', 'validées')}${etatPx.exercice ? ` · exercice du ${fmtJour(etatPx.exercice.debut)} au ${fmtJour(etatPx.exercice.fin)} · ${pluriel(nbCloses, 'période close', 'périodes closes')} sur ${periodes.length}` : ' · aucun exercice'}`
              : 'Validation, clôture et réouverture des périodes mensuelles ; journal général imprimable'}
          </p>
        </div>
        <BoutonAide section="compta-periodes" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger les périodes.</span>
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

      {etatPx && etat === 'pret' && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etatPx.etatAbonnement, role)} : les périodes restent consultables mais ne changent plus.
            </div>
          )}
          {etatPx.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : ses périodes se lisent mais ne changent pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && dossierActif && !etatPx.droits.configurer && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter les périodes et d'imprimer le journal général ; le titulaire et les gérants de niveau Complet valident et clôturent, le titulaire seul rouvre.
            </div>
          )}
          {!etatPx.exercice && (
            <div role="status" style={{ ...alerte, background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', marginBottom: 16 }}>
              Aucun exercice dans ce dossier.
            </div>
          )}
          {etatPx.exercice && !exerciceOuvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Exercice clos : ses périodes ne changent plus.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          {etatPx.exercice && (
            <div style={cadre}>
              <div style={enTeteCadre}>
                <span style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>Exercice du {fmtJour(etatPx.exercice.debut)} au {fmtJour(etatPx.exercice.fin)} · {pluriel(periodes.length, 'période mensuelle', 'périodes mensuelles')}</span>
                <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Valider = définitif · une période se clôt quand tout est validé · le journal général se lit sur les écritures validées</span>
              </div>
              {periodes.map((p) => {
                const ouverte = depliees.has(p.id);
                const d = details.get(p.id);
                const close = p.etat === 'close';
                return (
                  <div key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', flexWrap: 'wrap', background: ouverte ? '#f8faff' : '#fff' }}>
                      <button type="button" onClick={() => basculer(p)} aria-expanded={ouverte} aria-controls={`periode-${p.id}`} title="Centralisation des journaux"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.86rem', padding: 0, minWidth: 0, flex: '1 1 260px', textAlign: 'left' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem', width: 10 }}>{ouverte ? '▾' : '▸'}</span>
                        <span style={{ fontWeight: 800, color: '#1e1b4b', minWidth: 120, textTransform: 'capitalize' }}>{fmtMoisAnnee(p.debut)}</span>
                        <span style={{ color: '#64748b', fontSize: '0.76rem' }}>du {fmtJour(p.debut)} au {fmtJour(p.fin)}</span>
                        <span style={pastille(close ? '#e2e8f0' : '#dcfce7', close ? '#475569' : '#166534')}>{LIBELLES_ETAT_PERIODE[p.etat]}</span>
                      </button>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                        <span style={pastille(p.nbBrouillard > 0 ? '#fef3c7' : '#f1f5f9', p.nbBrouillard > 0 ? '#92400e' : '#64748b')}>{pluriel(p.nbBrouillard, 'en brouillard', 'en brouillard')}</span>
                        <span style={pastille('#eef2ff', '#3730a3')}>{pluriel(p.nbValidees, 'validée', 'validées')}</span>
                        <span style={{ fontFamily: mono, fontWeight: 700, color: '#0f172a', minWidth: 100, textAlign: 'right', whiteSpace: 'nowrap' }} title="Total des écritures validées">{fmtMontant(p.totalValidees)}</span>
                      </span>
                      <span style={{ flex: '1 1 10px' }} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {peutValider && !close && p.nbBrouillard > 0 && <button type="button" onClick={() => validerTout(p)} disabled={occupe} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>🔏 Valider tout</button>}
                        {peutValider && !close && <button type="button" onClick={() => clore(p)} disabled={occupe || p.nbBrouillard > 0} title={p.nbBrouillard > 0 ? `${pluriel(p.nbBrouillard, 'écriture en brouillard', 'écritures en brouillard')} : validez-les d'abord` : 'Clore la période'} style={{ ...petit('#fff', '#475569', '#cbd5e1'), opacity: p.nbBrouillard > 0 ? 0.5 : 1 }}>🔒 Clore</button>}
                        {peutRouvrir && close && <button type="button" onClick={() => rouvrir(p)} disabled={occupe} style={petit('#fff', '#be123c', '#fecdd3')}>🔓 Rouvrir</button>}
                        <button type="button" onClick={() => pdf(p)} disabled={occupe} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>📄 Journal général (PDF)</button>
                        <Link to={`/dossiers/${etatPx.dossier.id}/ecritures?periode=${p.id}`} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), textDecoration: 'none' }}>✍️ Écritures</Link>
                      </span>
                    </div>
                    {(p.closLe || p.rouvertLe) && (
                      <div style={{ padding: '0 18px 8px 38px', fontSize: '0.74rem', color: '#64748b', background: ouverte ? '#f8faff' : '#fff' }}>
                        {p.closLe ? `Close le ${quand(p.closLe)}${p.closPar ? ` par ${p.closPar}` : ''}` : ''}{p.closLe && p.rouvertLe ? ' · ' : ''}{p.rouvertLe ? `rouverte le ${quand(p.rouvertLe)}${p.rouvertPar ? ` par ${p.rouvertPar}` : ''}` : ''}
                      </div>
                    )}
                    {ouverte && (
                      <div id={`periode-${p.id}`} style={{ padding: '4px 18px 14px 38px', background: '#f8faff' }}>
                        {(!d || d === 'lecture') && <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '6px 0' }}>Lecture de la centralisation…</div>}
                        {d === 'erreur' && <div role="alert" style={{ fontSize: '0.8rem', color: '#b91c1c', padding: '6px 0' }}>Centralisation impossible à lire. <button type="button" onClick={() => lireDetail(p.id)} style={lien}>Réessayer</button></div>}
                        {d && d !== 'lecture' && d !== 'erreur' && (
                          <>
                            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Centralisation des journaux auxiliaires (écritures validées)</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                              <thead>
                                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                                  <th style={cellule}>Journal</th><th style={{ ...cellule, textAlign: 'right' }}>Écritures</th><th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.journaux.length === 0 && <tr><td style={{ ...cellule, color: '#64748b' }} colSpan={4}>Aucune écriture validée dans cette période{d.nbBrouillard ? ` (${pluriel(d.nbBrouillard, 'écriture en brouillard', 'écritures en brouillard')} non comprises)` : ''}.</td></tr>}
                                {d.journaux.map((j) => (
                                  <tr key={j.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={cellule}><span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{j.code}</span> <span style={{ color: '#475569' }}>{j.libelle}</span></td>
                                    <td style={{ ...cellule, textAlign: 'right' }}>{j.nbEcritures}</td>
                                    <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtMontant(j.debit)}</td>
                                    <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtMontant(j.credit)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              {d.journaux.length > 0 && (
                                <tfoot>
                                  <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800 }}>
                                    <td style={cellule}>Total de la période{d.nbBrouillard ? <span style={{ fontWeight: 400, color: '#92400e' }}> · {pluriel(d.nbBrouillard, 'écriture en brouillard', 'écritures en brouillard')} non comprises</span> : null}</td>
                                    <td style={{ ...cellule, textAlign: 'right' }}>{d.totaux.nbEcritures}</td>
                                    <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtMontant(d.totaux.debit)}</td>
                                    <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtMontant(d.totaux.credit)}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ margin: '12px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            Une opération datée d'une période close s'enregistre au premier jour de la période ouverte suivante, avec sa vraie date (NC 01 §61) : la fenêtre de saisie le propose. Le journal des événements de la comptabilité garde chaque validation, clôture et réouverture.
          </p>
        </>
      )}
    </div>
  );
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const cellule: React.CSSProperties = { padding: '5px 8px' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
