import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { affecterResultat, cloturerExercice, lireCloture, type ClotureReponse, type CompteAffectation, type EcritureApercu, type LigneApercu } from '../cloture';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { fmtJour, fmtMontant, texteMillimes, versMillimes, type Ecriture } from '../ecritures';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Clôture de l'exercice » (LabFlow Compta, étape X2 ; labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X2, §3 ;
// réponses du client du 13/10 — « ok pour les 5 » : clôture définitive par le titulaire, affectation du résultat préparée en
// brouillard) : l'assistant d'un exercice — les contrôles (au vert ou au rouge, avec quoi faire et où), le résultat (produits,
// charges, bénéfice ou perte), l'aperçu des deux écritures (détermination du résultat, à-nouveaux de l'exercice suivant :
// rien n'est écrit), le bouton « Clôturer » (titulaire, tout au vert, confirmation) ; exercice clos : qui, quand, les deux
// écritures passées, le formulaire d'affectation du résultat (parts contre le 131 / 135, somme = résultat) qui prépare un
// brouillard dans l'exercice suivant. Les droits viennent du serveur ; chaque écriture rend l'état entier, que l'écran
// remplace ; un refus sur un état périmé (404, 409) relit la page (convention de S3c). Vocabulaire comptable fixe.
type Role = 'titulaire' | 'gerant';
const mono = 'ui-monospace, monospace';
const quand = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;

// Une page par exercice : changer d'exercice (navigation directe) repart d'un état neuf.
export default function ComptaCloturePage() {
  const { dossierId, exerciceId } = useParams();
  return <ComptaCloture key={`${dossierId}/${exerciceId}`} dossierId={dossierId} exerciceId={exerciceId} />;
}

function ComptaCloture({ dossierId, exerciceId }: { dossierId?: string; exerciceId?: string }) {
  const { confirm } = useConfirm();
  const [etatPx, setEtatPx] = useState<ClotureReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);
  const tour = useRef(0);

  const charger = useCallback(() => {
    const moi = ++tour.current;
    lireCloture(dossierId || '', exerciceId || '')
      .then((r) => { if (moi === tour.current) { setEtatPx(r); setEtat('pret'); } })
      .catch((err) => { if (moi === tour.current) setEtat(statutDe(err) === 404 ? 'introuvable' : 'erreur'); });
  }, [dossierId, exerciceId]);
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);

  const role: Role = etatPx?.dossier.espace.role || 'titulaire';
  const ouvert = !!etatPx && etatPx.etatAbonnement === 'actif';
  const dossierActif = !!etatPx && etatPx.dossier.etat === 'actif';
  const clos = !!etatPx?.exercice.clos;
  const peutCloturer = !!etatPx && etatPx.droits.archiver && dossierActif && ouvert && !clos && etatPx.pret;
  const peutAffecter = !!etatPx && etatPx.droits.configurer && dossierActif && ouvert && etatPx.affectation.possible;

  const appliquer = (r: ClotureReponse, message: string) => {
    tour.current += 1;
    setEtatPx(r);
    setErreur('');
    setInfo(message);
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
  const cloturer = async () => {
    if (!etatPx) return;
    const x = etatPx.exercice;
    const r = etatPx.resultat;
    const ok = await confirm({
      title: `Clôturer l'exercice ${x.millesime} ?`,
      message: `L'exercice du ${fmtJour(x.debut)} au ${fmtJour(x.fin)} sera clos : ${r.benefice ? 'bénéfice' : versMillimes(r.resultat) === 0n ? 'résultat nul' : 'perte'} de ${fmtMontant(r.resultat.replace('-', ''))}. L'écriture de résultat est passée et validée, la dernière période est close, les à-nouveaux sont passés et validés dans l'exercice ${etatPx.suivant?.millesime ?? ''}.`,
      details: ['C\'est définitif : plus aucune écriture dans cet exercice, aucune période ne rouvre. Une erreur découverte ensuite se corrige dans l\'exercice suivant (compte 128).'],
      tone: 'danger',
      confirmLabel: 'Clôturer (définitif)',
      icon: '🔒',
    });
    if (!ok) return;
    await agir(async () => appliquer(await cloturerExercice(etatPx.dossier.id, x.id), `Exercice ${x.millesime} clos. Les à-nouveaux sont passés dans l'exercice ${etatPx.suivant?.millesime ?? 'suivant'}.`), 'Clôture impossible, réessayez.');
  };

  const retour = etatPx ? { lien: `/dossiers/${etatPx.dossier.id}`, libelle: etatPx.dossier.nom } : null;
  const x = etatPx?.exercice;
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🔒</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Clôture de l'exercice{x ? ` ${x.millesime}` : ''}</h1>
            {x?.clos && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Clos</span>}
            {etatPx?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {x ? `Du ${fmtJour(x.debut)} au ${fmtJour(x.fin)}${etatPx?.suivant ? ` · exercice suivant ${etatPx.suivant.millesime} (${etatPx.suivant.etat === 'ouvert' ? 'ouvert' : 'clos'})` : ' · exercice suivant non ouvert'}` : 'Contrôles, résultat, écritures de résultat et d\'à-nouveaux, affectation du résultat'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {etatPx && <Link to={`/dossiers/${etatPx.dossier.id}/etats?exercice=${etatPx.exercice.id}`} style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 9, padding: '6px 12px' }}>📊 États financiers</Link>}
          <BoutonAide section="compta-cloture" />
        </div>
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger la clôture.</span>
          <button type="button" onClick={() => { setEtat('chargement'); charger(); }} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}
      {etat === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Cet exercice n'existe pas ou son dossier ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}

      {etatPx && x && etat === 'pret' && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etatPx.etatAbonnement, role)} : la clôture se consulte mais ne se fait pas.
            </div>
          )}
          {etatPx.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : désarchivez-le avant de clôturer ou d'affecter le résultat.
            </div>
          )}
          {ouvert && dossierActif && !clos && !etatPx.droits.archiver && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Seul le titulaire de la comptabilité clôture un exercice. Votre niveau d'accès permet de suivre les contrôles et de lire l'aperçu.
            </div>
          )}
          {!clos && !x.fini && (
            <div role="status" style={{ ...alerte, background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', marginBottom: 16 }}>
              L'exercice {x.millesime} n'est pas fini : il se clôture après le {fmtJour(x.fin)}. Les contrôles ci-dessous se lisent déjà.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          {x.clos && (
            <div style={{ ...cadre, marginBottom: 18 }}>
              <div style={enTeteCadre}><span style={titreCadre}>✅ Exercice {x.millesime} clos</span></div>
              <div style={{ padding: '12px 18px', fontSize: '0.86rem', color: '#334155', lineHeight: 1.7 }}>
                Clos le <strong>{quand(x.clos.le)}</strong>{x.clos.par ? <> par <strong>{x.clos.par}</strong></> : null} ·{' '}
                <strong style={{ color: etatPx.resultat.benefice ? '#166534' : versMillimes(etatPx.resultat.resultat) === 0n ? '#475569' : '#b91c1c' }}>
                  {etatPx.resultat.benefice ? 'Bénéfice' : versMillimes(etatPx.resultat.resultat) === 0n ? 'Résultat nul' : 'Perte'} : {fmtMontant(etatPx.resultat.resultat.replace('-', ''))}
                </strong>
                {etatPx.resultat.compte ? ` (compte ${etatPx.resultat.compte.numero})` : ''}.
                {' '}Les écritures de cet exercice sont définitives ; une erreur se corrige dans l'exercice suivant (compte 128).
              </div>
            </div>
          )}

          {/* ── Contrôles ── */}
          {!clos && (
            <div style={{ ...cadre, marginBottom: 18 }}>
              <div style={enTeteCadre}>
                <span style={titreCadre}>1 · Contrôles avant la clôture</span>
                <span style={{ fontSize: '0.76rem', color: etatPx.pret ? '#166534' : '#92400e', fontWeight: 700 }}>{etatPx.pret ? 'Tout est au vert' : `${pluriel(etatPx.controles.filter((c) => !c.ok).length, 'point à régler', 'points à régler')}`}</span>
              </div>
              {etatPx.controles.map((c) => (
                <div key={c.code} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 18px', borderTop: '1px solid #f1f5f9', fontSize: '0.84rem' }}>
                  <span style={{ width: 20, textAlign: 'center', color: c.ok ? '#16a34a' : '#dc2626', fontWeight: 900 }}>{c.ok ? '✓' : '✗'}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ color: c.ok ? '#334155' : '#0f172a', fontWeight: c.ok ? 500 : 700 }}>{c.libelle}</span>
                    {!c.ok && c.detail && <span style={{ display: 'block', color: '#b45309', fontSize: '0.8rem', marginTop: 2 }}>{c.detail}</span>}
                  </span>
                  {!c.ok && lienControle(c.code, etatPx) && <Link to={lienControle(c.code, etatPx) as string} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), textDecoration: 'none', whiteSpace: 'nowrap' }}>Ouvrir →</Link>}
                </div>
              ))}
            </div>
          )}

          {/* ── Résultat ── */}
          <div style={{ ...cadre, marginBottom: 18 }}>
            <div style={enTeteCadre}><span style={titreCadre}>{clos ? 'Résultat de l\'exercice' : '2 · Résultat (écritures validées)'}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '14px 18px' }}>
              <Chiffre libelle="Produits (classe 7)" valeur={fmtMontant(etatPx.resultat.produits)} />
              <Chiffre libelle="Charges (classe 6)" valeur={fmtMontant(etatPx.resultat.charges)} />
              <Chiffre libelle={etatPx.resultat.benefice ? 'Bénéfice' : versMillimes(etatPx.resultat.resultat) === 0n ? 'Résultat nul' : 'Perte'} valeur={fmtMontant(etatPx.resultat.resultat.replace('-', ''))} couleur={etatPx.resultat.benefice ? '#166534' : versMillimes(etatPx.resultat.resultat) === 0n ? '#475569' : '#b91c1c'} />
              <Chiffre libelle="Compte du résultat" valeur={etatPx.resultat.compte ? `${etatPx.resultat.compte.numero} · ${etatPx.resultat.compte.libelle}` : `${etatPx.resultat.numeroCompte} (absent du plan)`} />
            </div>
          </div>

          {/* ── Aperçu ou écritures passées ── */}
          {etatPx.apercu && (
            <div style={{ ...cadre, marginBottom: 18 }}>
              <div style={enTeteCadre}>
                <span style={titreCadre}>3 · Aperçu des écritures de clôture</span>
                <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Rien n'est écrit tant que vous ne clôturez pas</span>
              </div>
              <div style={{ padding: '6px 18px 16px' }}>
                <TableApercu titre={`Détermination du résultat — journal ${etatPx.apercu.resultat.journal}, ${fmtJour(etatPx.apercu.resultat.date)}, pièce ${etatPx.apercu.resultat.reference}`} e={etatPx.apercu.resultat} vide="Aucun compte de charges ni de produits mouvementé : pas d'écriture de résultat." />
                <TableApercu titre={`À-nouveaux — journal ${etatPx.apercu.anouveaux.journal}, ${fmtJour(etatPx.apercu.anouveaux.date)}, pièce ${etatPx.apercu.anouveaux.reference}${etatPx.suivant ? '' : ' (exercice suivant à ouvrir)'}`} e={etatPx.apercu.anouveaux} vide="Tous les comptes de bilan sont soldés : pas d'à-nouveaux." />
              </div>
            </div>
          )}
          {etatPx.ecritures && (
            <div style={{ ...cadre, marginBottom: 18 }}>
              <div style={enTeteCadre}><span style={titreCadre}>Écritures de clôture passées</span></div>
              <div style={{ padding: '6px 18px 16px' }}>
                <TableEcriture titre="Détermination du résultat" e={etatPx.ecritures.resultat} dossierId={etatPx.dossier.id} exerciceId={x.id} vide="Aucune écriture de résultat (rien à solder)." />
                <TableEcriture titre={`À-nouveaux de l'exercice ${etatPx.suivant?.millesime ?? 'suivant'}`} e={etatPx.ecritures.anouveaux} dossierId={etatPx.dossier.id} exerciceId={etatPx.suivant?.id} vide="Aucun à-nouveaux (tous les comptes soldés)." />
              </div>
            </div>
          )}

          {/* ── Clôturer ── */}
          {!clos && (
            <div style={{ ...cadre, marginBottom: 18 }}>
              <div style={enTeteCadre}><span style={titreCadre}>4 · Clôturer</span></div>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <button type="button" onClick={cloturer} disabled={!peutCloturer || occupe} style={{ ...bouton('#1e1b4b', '#fff', '#1e1b4b'), opacity: peutCloturer ? 1 : 0.5 }}>🔒 Clôturer l'exercice {x.millesime}</button>
                <span style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                  {!x.fini ? `Après le ${fmtJour(x.fin)}.` : !etatPx.pret ? 'Réglez d\'abord les points en rouge.' : !etatPx.droits.archiver ? 'Titulaire seul.' : 'Définitif : une confirmation est demandée.'}
                </span>
              </div>
            </div>
          )}

          {/* ── Affectation du résultat ── */}
          {clos && (
            <Affectation etatPx={etatPx} peut={peutAffecter} occupe={occupe} onPreparer={async (corps) => agir(async () => appliquer(await affecterResultat(etatPx.dossier.id, x.id, corps), 'Écriture d\'affectation du résultat préparée en brouillard : relisez-la et validez-la sur la page Écritures.'), 'Affectation impossible, réessayez.')} />
          )}
        </>
      )}
    </div>
  );
}

// Où régler un contrôle qui échoue.
const lienControle = (code: string, r: ClotureReponse): string | null => {
  const d = r.dossier.id;
  switch (code) {
    case 'brouillard': return `/dossiers/${d}/ecritures?exercice=${r.exercice.id}&etat=brouillard`;
    case 'periodes': return `/dossiers/${d}/periodes?exercice=${r.exercice.id}`;
    case 'precedent': return r.precedent ? `/dossiers/${d}/exercices/${r.precedent.id}/cloture` : null;
    case 'suivant': return `/dossiers/${d}`;
    case 'journalOD': case 'journalAN': return `/dossiers/${d}/journaux`;
    case 'compteResultat': return `/dossiers/${d}/plan`;
    case 'tiers': case 'equilibre': return `/dossiers/${d}/livres?vue=balance&exercice=${r.exercice.id}`;
    default: return null;
  }
};

function Chiffre({ libelle, valeur, couleur = '#0f172a' }: { libelle: string; valeur: string; couleur?: string }) {
  return (
    <div style={{ background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{libelle}</div>
      <div style={{ fontFamily: mono, fontWeight: 800, fontSize: '1.05rem', color: couleur, marginTop: 4, overflowWrap: 'anywhere' }}>{valeur}</div>
    </div>
  );
}

function LignesTable({ lignes, total }: { lignes: { compte: { numero: string; libelle: string }; tiers: { code: string; nom: string } | null; debit: string; credit: string }[]; total: string }) {
  return (
    <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ color: '#64748b', textAlign: 'left', background: '#f8fafc' }}>
            <th style={cellule}>Compte</th><th style={cellule}>Tiers</th><th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={cellule}><span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{l.compte.numero}</span> <span style={{ color: '#475569' }}>{l.compte.libelle}</span></td>
              <td style={{ ...cellule, color: '#475569' }}>{l.tiers ? `${l.tiers.code} · ${l.tiers.nom}` : ''}</td>
              <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{versMillimes(l.debit) ? fmtMontant(l.debit) : ''}</td>
              <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{versMillimes(l.credit) ? fmtMontant(l.credit) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800 }}>
            <td style={cellule} colSpan={2}>Total ({pluriel(lignes.length, 'ligne', 'lignes')})</td>
            <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtMontant(total)}</td>
            <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtMontant(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TableApercu({ titre, e, vide }: { titre: string; e: EcritureApercu; vide: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#4338ca', marginBottom: 6 }}>{titre}</div>
      {e.lignes.length === 0 ? <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{vide}</div> : <LignesTable lignes={e.lignes as LigneApercu[]} total={e.total} />}
    </div>
  );
}

function TableEcriture({ titre, e, dossierId, exerciceId, vide }: { titre: string; e: Ecriture | null; dossierId: number; exerciceId?: number; vide: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#4338ca' }}>{titre}</span>
        {e && <span style={pastille('#eef2ff', '#3730a3')}>{e.numero || e.numeroProvisoire}</span>}
        {e && <span style={{ fontSize: '0.76rem', color: '#64748b' }}>{fmtJour(e.date)} · journal {e.journal.code} · pièce {e.reference}{e.validePar ? ` · validée par ${e.validePar}` : ''}</span>}
        {e && exerciceId && <Link to={`/dossiers/${dossierId}/ecritures?exercice=${exerciceId}&q=${encodeURIComponent(e.reference)}`} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), textDecoration: 'none' }}>✍️ Écritures</Link>}
      </div>
      {!e ? <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{vide}</div> : <LignesTable lignes={e.lignes || []} total={e.total} />}
    </div>
  );
}

// Le formulaire d'affectation du résultat : une part par compte proposé (du paquet, imputable ; pour une perte, seuls les
// comptes qui conviennent aux deux cas : report à nouveau, compte de l'exploitant), la somme doit égaler le résultat.
function Affectation({ etatPx, peut, occupe, onPreparer }: { etatPx: ClotureReponse; peut: boolean; occupe: boolean; onPreparer: (corps: { date?: string; lignes: { compteId: number; montant: string }[] }) => Promise<void> }) {
  const a = etatPx.affectation;
  const comptes = useMemo<CompteAffectation[]>(() => a.comptes.filter((k) => a.benefice || k.usage === 'tous'), [a.comptes, a.benefice]);
  const [date, setDate] = useState(a.dateProposee || '');
  const [parts, setParts] = useState<Record<number, string>>({});
  const montant = versMillimes(a.resultat.replace('-', '')) ?? 0n;
  let somme = 0n;
  let illisible = false;
  for (const k of comptes) {
    const v = (parts[k.id] || '').trim();
    if (!v) continue;
    const m = versMillimes(v.replace(',', '.'));
    if (m == null || m < 0n) { illisible = true; continue; }
    somme += m;
  }
  const reste = montant - somme;
  const pret = !illisible && reste === 0n && somme > 0n;
  const preparer = async () => {
    const lignes = comptes.map((k) => ({ compteId: k.id, montant: texteMillimes(versMillimes((parts[k.id] || '').trim().replace(',', '.')) ?? 0n) })).filter((l) => versMillimes(l.montant)! > 0n);
    await onPreparer({ ...(date ? { date } : {}), lignes });
  };
  return (
    <div style={{ ...cadre, marginBottom: 18 }}>
      <div style={enTeteCadre}>
        <span style={titreCadre}>Affectation du résultat {etatPx.exercice.millesime}</span>
        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Brouillard préparé dans l'exercice {etatPx.suivant?.millesime ?? 'suivant'}, à valider sur la page Écritures</span>
      </div>
      <div style={{ padding: '14px 18px' }}>
        {a.ecriture ? (
          <TableEcriture titre="Écriture préparée (en brouillard)" e={a.ecriture} dossierId={etatPx.dossier.id} exerciceId={etatPx.suivant?.id} vide="" />
        ) : !a.possible ? (
          <div style={{ fontSize: '0.84rem', color: '#64748b', lineHeight: 1.6 }}>
            {versMillimes(a.resultat) === 0n ? 'Résultat nul : rien à affecter.' : !etatPx.suivant || etatPx.suivant.etat !== 'ouvert' ? 'L\'exercice suivant n\'est pas ouvert : l\'affectation s\'y enregistre.' : etatPx.dossier.etat === 'archive' ? 'Dossier archivé.' : 'Affectation impossible pour l\'instant.'}
          </div>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: '#334155', lineHeight: 1.6 }}>
              {a.benefice ? 'Bénéfice' : 'Perte'} de <strong>{fmtMontant(a.resultat.replace('-', ''))}</strong> au compte {a.compte?.numero ?? '—'} : répartissez-le entre les comptes ci-dessous ({a.benefice ? 'réserve légale, réserves, report à nouveau, dividendes, compte de l\'exploitant' : 'report à nouveau ou compte de l\'exploitant'}). La somme des parts doit égaler le résultat.
            </p>
            <div style={{ maxWidth: 220, marginBottom: 12 }}>
              <label htmlFor="fa-date" style={lbl}>Date de l'écriture</label>
              <input id="fa-date" type="date" value={date} min={etatPx.suivant?.debut} max={etatPx.suivant?.fin} onChange={(e) => setDate(e.target.value)} disabled={!peut || occupe} style={inp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {comptes.map((k) => (
                <div key={k.id}>
                  <label htmlFor={`fa-${k.id}`} style={lbl}><span style={{ fontFamily: mono }}>{k.numero}</span> {k.libelle}</label>
                  <input id={`fa-${k.id}`} type="text" inputMode="decimal" placeholder="0,000" value={parts[k.id] || ''} onChange={(e) => setParts((p) => ({ ...p, [k.id]: e.target.value }))} disabled={!peut || occupe} style={inp} />
                </div>
              ))}
            </div>
            {comptes.length === 0 && <div role="alert" style={{ fontSize: '0.82rem', color: '#b91c1c', marginTop: 8 }}>Aucun compte d'affectation imputable dans le plan du dossier (111, 112, 1181, 121, 447, 108) : saisissez l'écriture à la main sur la page Écritures.</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
              <button type="button" onClick={preparer} disabled={!peut || !pret || occupe} style={{ ...bouton('#4338ca', '#fff', '#4338ca'), opacity: peut && pret ? 1 : 0.5 }}>📝 Préparer l'écriture en brouillard</button>
              <span style={{ fontSize: '0.8rem', color: illisible ? '#b91c1c' : reste === 0n && somme > 0n ? '#166534' : '#92400e', fontFamily: mono, fontWeight: 700 }}>
                {illisible ? 'Montant illisible' : reste === 0n && somme > 0n ? 'Parts = résultat' : reste > 0n ? `Reste à affecter : ${fmtMontant(reste)}` : `${fmtMontant(-reste)} de trop`}
              </span>
              {!peut && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Titulaire ou niveau Complet.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const titreCadre: React.CSSProperties = { fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' };
const cellule: React.CSSProperties = { padding: '5px 8px' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
