import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { Modale } from '../DossierFormulaires';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { fmtJour, fmtMontant, versMillimes } from '../ecritures';
import { signe } from '../echeancier';
import {
  LIBELLES_SOURCE, annulerCertificat, fmtTaux, libelleMois, libelleMoisCourt, lireTaxesMois, produireCertificats, produireFichierTej, telechargerCertificat, telechargerFichierTej, telechargerLot, telechargerTaxesMois,
  type Certificat, type Operation, type Paiement, type TaxesMoisReponse,
} from '../taxesMois';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Taxes du mois » (LabFlow Compta, étape S7b ; labflow-reprise/achats-compta/PLAN-S7.md §2 « S7b », §4 « TVA »,
// « Retenues », « Seuil des retenues sur achats », « Droits » ; réponses du client du 09/10 — « ok pour les 9 » : date de
// paiement = règlement lettré, sinon facture, modifiable avant de produire ; fichier XML au cahier des charges TEJ v2.0, à
// essayer sur la plateforme) : pour une période, l'état de TVA (collectée, déductible, retenues de TVA subies, crédit
// reporté, TVA à payer ou crédit à reporter), les retenues opérées à certifier groupées en paiements (bénéficiaire, date
// modifiable, pièces), les certificats du mois (PDF, annuler), le fichier TEJ du mois (dépôt initial puis rectificatif),
// les retenues subies, les signalements ; « Exporter (Excel) ». Brouillard compris par défaut dans l'état de TVA. Le
// titulaire et le niveau Complet produisent et annulent ; tout le monde lit. Le serveur calcule et décide.
type Role = 'titulaire' | 'gerant';
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;
const montant = (v: string) => fmtMontant(signe(v));
const nonNul = (v: string) => signe(v) !== 0n;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaTaxesMoisPage() {
  const { dossierId } = useParams();
  return <ComptaTaxesMois key={dossierId} dossierId={dossierId} />;
}

function ComptaTaxesMois({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [parametres, setParametres] = useSearchParams();
  const [periodeId, setPeriodeId] = useState<number | null>(() => { const v = Number(parametres.get('periode')); return Number.isInteger(v) && v > 0 ? v : null; });
  const [brouillard, setBrouillard] = useState(true);
  const cle = `${periodeId ?? ''}|${brouillard ? 1 : 0}`;
  const [lecture, setLecture] = useState<{ cle: string; valeur: TaxesMoisReponse } | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable'>('chargement');
  const [erreurLecture, setErreurLecture] = useState<{ cle: string; message: string } | null>(null);
  const [essai, setEssai] = useState(0);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  // Les paiements DÉCOCHÉS (tous les paiements producibles le sont d'office) et les dates corrigées, par clé de paiement.
  const [exclus, setExclus] = useState<Set<string>>(() => new Set());
  const [dates, setDates] = useState<Map<string, string>>(() => new Map());
  const [action, setAction] = useState('');
  const occupe = action !== '';
  const occupeRef = useRef(false);
  const [annulation, setAnnulation] = useState<{ certificat: Certificat; motif: string; erreur: string } | null>(null);
  const tour = useRef(0);
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  // La page, relue à chaque changement de période ou de « Brouillard compris » (et après chaque écriture : essai).
  const charger = useCallback((c: string, p: number | null, b: boolean) => {
    const moi = ++tour.current;
    lireTaxesMois(dossierId || '', p, b)
      .then((r) => { if (moi === tour.current) { setLecture({ cle: c, valeur: r }); setEtat('pret'); setErreurLecture(null); } })
      .catch((err) => {
        if (moi !== tour.current) return;
        if (statutDe(err) === 404) setEtat('introuvable');
        else setErreurLecture({ cle: c, message: messageDossier(err, 'Lecture impossible, réessayez.') });
      });
  }, [dossierId]);
  useEffect(() => { charger(cle, periodeId, brouillard); return () => { tour.current += 1; }; }, [charger, cle, periodeId, brouillard, essai]);

  const e = lecture && lecture.cle === cle ? lecture.valeur : null;
  const page = e || lecture?.valeur || null;
  const erreurCourante = erreurLecture && erreurLecture.cle === cle ? erreurLecture.message : '';
  const role: Role = page?.dossier.espace.role || 'titulaire';
  const actif = !!page && page.dossier.etat === 'actif';
  const ouvert = !!page && page.etatAbonnement === 'actif';
  const peutProduire = !!page && page.droits.configurer && actif && ouvert;
  const relire = () => { setErreurLecture(null); setEssai((n) => n + 1); };
  const changerPeriode = (id: number) => {
    setPeriodeId(id); setExclus(new Set()); setDates(new Map()); setInfo(''); setErreur('');
    setParametres({ periode: String(id) }, { replace: true });
  };
  const changerBrouillard = (b: boolean) => { setBrouillard(b); setInfo(''); setErreur(''); };

  // Une action (écriture ou téléchargement) : un geste à la fois ; un refus sur un état périmé (404, 409) relit la page.
  const agir = async (nom: string, travail: () => Promise<string>, defaut: string): Promise<boolean> => {
    if (occupeRef.current) return false;
    occupeRef.current = true;
    setAction(nom);
    setErreur('');
    setInfo('');
    try {
      const message = await travail();
      if (monte.current) setInfo(message);
      return true;
    } catch (err) {
      const message = await messageTelechargement(err, defaut, role);
      if (monte.current) {
        setErreur(message);
        if (statutDe(err) === 404 || statutDe(err) === 409) relire();
      }
      return false;
    } finally {
      occupeRef.current = false;
      if (monte.current) setAction('');
    }
  };
  const dateDe = (p: Paiement) => dates.get(p.cle) ?? p.date;
  const producibles = (page && e ? e.retenues.paiements : []).filter((p) => !p.bloque);
  const choisis = producibles.filter((p) => !exclus.has(p.cle));
  const datesFausses = choisis.filter((p) => { const d = dateDe(p); return !RE_DATE.test(d) || (!!page && d > page.aujourdhui); });
  const produire = async () => {
    if (!page || !choisis.length) return;
    if (datesFausses.length) { setErreur(`Date du paiement invalide ou future pour ${datesFausses.map((p) => p.tiers?.code || '?').join(', ')}.`); return; }
    const total = choisis.reduce((s, p) => s + (versMillimes(p.totaux.rs) ?? 0n), 0n);
    const ok = await confirm({
      title: `Produire ${pluriel(choisis.length, 'certificat', 'certificats')} de retenue ?`,
      message: `Retenues : ${fmtMontant(total)} D. Chaque certificat reçoit son numéro (sans trou par année) ; ses pièces, le bénéficiaire et votre identité sont figés.`,
      details: ['Un certificat produit se retélécharge à l\'identique ; il s\'annule (avec un motif) mais garde son numéro.', 'Le certificat qui fait foi s\'établit sur la plateforme TEJ : déposez ensuite le fichier du mois.'],
      tone: 'primary', confirmLabel: 'Produire', icon: '🧾',
    });
    if (!ok) return;
    const corps = choisis.map((p) => ({ tiersId: p.tiers?.id ?? 0, date: dateDe(p), ecritures: p.operations.map((o) => o.ecritureId) }));
    const fait = await agir('produire', async () => {
      const r = await produireCertificats(page.dossier.id, corps);
      return `${pluriel(r.produits.length, 'certificat produit', 'certificats produits')} : ${r.produits.map((x) => x.reference).join(', ')}.`;
    }, 'Les certificats n\'ont pas pu être produits, réessayez.');
    if (fait && monte.current) { setExclus(new Set()); setDates(new Map()); relire(); }
  };
  const fichier = async () => {
    if (!page || !e) return;
    const f = e.prochainFichier;
    const ok = await confirm({
      title: `Produire le fichier TEJ de ${libelleMois(e.periode.debut)} ?`,
      message: `${f.acte === 0 ? 'Dépôt initial' : 'Rectificatif'} ${f.nom || ''} : ${pluriel(f.nbAjouts, 'certificat ajouté', 'certificats ajoutés')}${f.nbAnnulations ? `, ${pluriel(f.nbAnnulations, 'annulation', 'annulations')}` : ''}. Les certificats qu'il contient seront marqués déposés dans ce fichier.`,
      details: ['Fichier au cahier des charges TEJ v2.0 : à essayer sur la plateforme (tej.finances.gov.tn) avant d\'y compter ; en cas de refus, saisissez les certificats sur la plateforme à partir des PDF.', 'Le fichier reste téléchargeable à l\'identique depuis cette page.'],
      tone: 'primary', confirmLabel: 'Produire le fichier', icon: '📤',
    });
    if (!ok) return;
    const fait = await agir('fichier', async () => {
      await produireFichierTej(page.dossier.id, f.annee, f.mois, f.nom || 'declaration-tej.xml');
      return `Fichier ${f.nom || 'TEJ'} téléchargé : déposez-le sur la plateforme TEJ (à essayer).`;
    }, 'Le fichier n\'a pas pu être produit, réessayez.');
    if (fait && monte.current) relire();
  };
  const annuler = async () => {
    if (!page || !annulation) return;
    const motif = annulation.motif.trim();
    if (!motif) { setAnnulation({ ...annulation, erreur: 'Indiquez le motif de l\'annulation.' }); return; }
    const c = annulation.certificat;
    const fait = await agir('annuler', async () => {
      const r = await annulerCertificat(page.dossier.id, c.id, motif);
      return `Certificat ${r.annule.reference} annulé${r.annule.depose ? ' : l\'annulation partira dans le prochain rectificatif' : ''} ; ses pièces sont de nouveau à certifier.`;
    }, 'L\'annulation n\'a pas pu être faite, réessayez.');
    if (!monte.current) return;
    if (fait) { setAnnulation(null); relire(); } else setAnnulation(null);
  };
  const exporter = () => { if (page && e) void agir('export', async () => { await telechargerTaxesMois(page.dossier.id, e.periode.id, brouillard); return 'Taxes du mois exportées (Excel).'; }, 'Export impossible, réessayez.'); };

  const retour = page ? { lien: `/dossiers/${page.dossier.id}`, libelle: page.dossier.nom } : null;
  const tva = e?.tva;
  const resultat = tva ? signe(tva.resultat) : 0n;
  // Le premier mois de l'exercice : le crédit reporté vient des à-nouveaux (compte du crédit de TVA).
  const premiere = !!e && page?.exercices.find((x) => x.id === e.exercice.id)?.periodes[0]?.id === e.periode.id;
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
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Taxes du mois</h1>
            {page?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {e && tva
              ? `${libelleMois(e.periode.debut)} · ${resultat > 0n ? `TVA à payer ${montant(tva.aPayer)}` : resultat < 0n ? `crédit à reporter ${montant(tva.creditAReporter)}` : 'TVA nulle'} · ${pluriel(e.retenues.paiements.length, 'paiement à certifier', 'paiements à certifier')} · ${pluriel(e.certificats.filter((c) => c.etat === 'produit').length, 'certificat', 'certificats')}`
              : 'État de TVA, retenues à la source et certificats de la plateforme TEJ'}
          </p>
        </div>
        <BoutonAide section="compta-taxes-mois" />
      </div>

      {etat === 'chargement' && !erreurCourante && <div className="loading-text">Chargement…</div>}
      {etat === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier ou cette période n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}
      {erreurCourante && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span>{erreurCourante}</span>
          <button type="button" onClick={relire} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}

      {page && etat !== 'introuvable' && (
        <>
          {!ouvert && <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>{texteEtatAbonnement(page.etatAbonnement, role)} : la page reste consultable ; les certificats et le fichier ne se produisent plus.</div>}
          {page.dossier.etat === 'archive' && ouvert && <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>Dossier archivé : rien ne se produit tant qu'il n'est pas désarchivé.</div>}
          {ouvert && actif && !page.droits.configurer && <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>Votre niveau d'accès permet de consulter les taxes du mois et de télécharger les certificats ; le titulaire et les gérants de niveau Complet les produisent.</div>}

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="tm-periode" style={lbl}>Période</label>
              <select id="tm-periode" value={page.periode.id} onChange={(ev) => changerPeriode(Number(ev.target.value))} disabled={occupe} style={inp}>
                {page.exercices.map((x) => (
                  <optgroup key={x.id} label={`Exercice du ${fmtJour(x.debut)} au ${fmtJour(x.fin)}${x.etat === 'clos' ? ' (clos)' : ''}`}>
                    {x.periodes.map((p) => <option key={p.id} value={p.id}>{libelleMois(p.debut)}{p.etat === 'close' ? ' — close' : ''}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#334155', fontWeight: 600, cursor: 'pointer', paddingBottom: 9 }}>
              <input type="checkbox" checked={brouillard} onChange={(ev) => changerBrouillard(ev.target.checked)} disabled={occupe} />
              Brouillard compris
            </label>
            <span style={{ flex: '1 1 10px' }} />
            <button type="button" onClick={exporter} disabled={occupe || !e} style={petit('#f0fdf4', '#166534', '#bbf7d0')}>{action === 'export' ? 'Export…' : '📥 Exporter (Excel)'}</button>
          </div>
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}
          {!e && !erreurCourante && <div className="loading-text">Lecture…</div>}

          {e && tva && (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* L'état de TVA */}
              <section style={cadre} aria-labelledby="tm-tva">
                <div style={enTeteCadre}>
                  <span id="tm-tva" style={titreCadre}>État de TVA — {libelleMois(e.periode.debut)}{e.periode.etat === 'close' ? ' (période close)' : ''}</span>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Exigibilité aux débits : chaque facture compte dans la période de son écriture{tva.nbBrouillard ? ` · ${pluriel(tva.nbBrouillard, 'ligne en brouillard comprise', 'lignes en brouillard comprises')}` : ''}</span>
                </div>
                <div style={{ overflowX: 'auto', position: 'relative' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 620 }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left' }}>
                        <th style={cellule}>Code</th><th style={cellule}>Libellé</th><th style={{ ...cellule, textAlign: 'right' }}>Base ventes</th><th style={{ ...cellule, textAlign: 'right' }}>Collectée</th>
                        <th style={{ ...cellule, textAlign: 'right' }}>Base achats</th><th style={{ ...cellule, textAlign: 'right' }}>Déductible</th><th style={{ ...cellule, textAlign: 'right' }}>Sur immobilisations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tva.codes.filter((c) => c.type === 'tva' && [c.baseVente, c.collectee, c.baseAchat, c.deductible, c.deductibleImmo].some(nonNul)).map((c) => (
                        <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ ...cellule, fontFamily: mono, fontWeight: 700 }}>{c.code}</td><td style={cellule}>{c.libelle}</td>
                          <td style={nombre}>{nonNul(c.baseVente) ? montant(c.baseVente) : ''}</td><td style={nombre}>{nonNul(c.collectee) ? montant(c.collectee) : ''}</td>
                          <td style={nombre}>{nonNul(c.baseAchat) ? montant(c.baseAchat) : ''}</td><td style={nombre}>{nonNul(c.deductible) ? montant(c.deductible) : ''}</td><td style={nombre}>{nonNul(c.deductibleImmo) ? montant(c.deductibleImmo) : ''}</td>
                        </tr>
                      ))}
                      {!tva.codes.some((c) => c.type === 'tva') && <tr><td colSpan={7} style={{ ...cellule, color: '#64748b' }}>Aucune ligne de TVA codée sur la période.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 18px 14px', display: 'grid', gap: 2, maxWidth: 520, marginLeft: 'auto' }}>
                  <Rangee libelle="TVA collectée" valeur={montant(tva.collectee)} />
                  <Rangee libelle="− TVA déductible sur biens et services" valeur={montant(tva.deductibleBs)} />
                  <Rangee libelle="− TVA déductible sur immobilisations" valeur={montant(tva.deductibleImmo)} />
                  {nonNul(tva.retenuesSubies) && <Rangee libelle="− Retenues de TVA subies (secteur public)" valeur={montant(tva.retenuesSubies)} />}
                  <Rangee libelle={`− Crédit reporté${premiere ? " (à-nouveaux de l'exercice)" : ' du mois précédent'}`} valeur={montant(tva.creditReporte)} />
                  <Rangee fort libelle={resultat > 0n ? 'TVA à payer' : resultat < 0n ? 'Crédit à reporter (mois suivant)' : 'Résultat'} valeur={montant(resultat > 0n ? tva.aPayer : tva.creditAReporter)} couleur={resultat > 0n ? '#b45309' : '#166534'} />
                  {nonNul(tva.nonRecuperable) && <span style={{ fontSize: '0.74rem', color: '#64748b' }}>TVA non récupérable passée en charge : {montant(tva.nonRecuperable)} (pour mémoire).</span>}
                </div>
              </section>

              {/* Les retenues à certifier */}
              <section style={cadre} aria-labelledby="tm-retenues">
                <div style={enTeteCadre}>
                  <span id="tm-retenues" style={titreCadre}>Retenues à certifier — paiements de {libelleMois(e.periode.debut)}</span>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Un certificat par fournisseur et par paiement · date du règlement lettré, sinon de la facture, modifiable</span>
                </div>
                {e.retenues.paiements.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucune retenue opérée à certifier pour les paiements de ce mois.</p>}
                {e.retenues.paiements.map((p) => (
                  <BlocPaiement key={p.cle} p={p} date={dateDe(p)} max={page.aujourdhui} coche={!p.bloque && !exclus.has(p.cle)} modifiable={peutProduire && !p.bloque} occupe={occupe} dossierId={page.dossier.id}
                    basculer={(c) => setExclus((s) => { const n = new Set(s); if (c) n.delete(p.cle); else n.add(p.cle); return n; })}
                    changerDate={(d) => setDates((m) => { const n = new Map(m); n.set(p.cle, d); return n; })} />
                ))}
                {(e.retenues.brouillard.length > 0 || e.retenues.autresMois.length > 0 || e.retenues.problemes.length > 0) && (
                  <div style={{ padding: '10px 18px', borderTop: '1px solid #f1f5f9', fontSize: '0.78rem', color: '#475569', display: 'grid', gap: 4 }}>
                    {e.retenues.brouillard.length > 0 && <span>✍️ {pluriel(e.retenues.brouillard.length, 'pièce à retenue en brouillard', 'pièces à retenue en brouillard')} ({e.retenues.brouillard.map((o) => o.reference).join(', ')}) : validez-la (page <Link to={`/dossiers/${page.dossier.id}/ecritures`} style={lienTexte}>Écritures</Link>) pour produire son certificat.</span>}
                    {e.retenues.problemes.map((o) => <span key={o.ecritureId}>⛔ Pièce {o.numero || o.reference} : {o.probleme?.message}</span>)}
                    {e.retenues.autresMois.length > 0 && <span>📅 À certifier sur d'autres mois : {e.retenues.autresMois.map((m) => `${libelleMoisCourt(m.mois)} (${m.nb})`).join(', ')} — choisissez la période.</span>}
                  </div>
                )}
                {peutProduire && producibles.length > 0 && (
                  <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#f8faff' }}>
                    <span style={{ fontSize: '0.8rem', color: '#334155' }}>{pluriel(choisis.length, 'paiement coché', 'paiements cochés')} sur {producibles.length}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" onClick={() => setExclus(choisis.length ? new Set(producibles.map((p) => p.cle)) : new Set())} disabled={occupe} style={petit('#fff', '#475569', '#cbd5e1')}>{choisis.length ? 'Tout décocher' : 'Tout cocher'}</button>
                    <button type="button" onClick={() => { void produire(); }} disabled={occupe || !choisis.length || !page.declarant.complet} style={bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent')}>{action === 'produire' ? 'Production…' : `🧾 Produire les certificats (${choisis.length})`}</button>
                  </div>
                )}
                {!page.declarant.complet && <div role="alert" style={{ padding: '10px 18px', borderTop: '1px solid #fecaca', background: '#fef2f2', fontSize: '0.8rem', color: '#b91c1c' }}>Identité du dossier à compléter pour la plateforme TEJ : {page.declarant.manque.join(', ')} — <Link to={`/dossiers/${page.dossier.id}`} style={lienTexte}>fiche du dossier</Link>.</div>}
              </section>

              {/* Les certificats du mois et le fichier TEJ */}
              <section style={cadre} aria-labelledby="tm-certificats">
                <div style={enTeteCadre}>
                  <span id="tm-certificats" style={titreCadre}>Certificats des paiements de {libelleMois(e.periode.debut)}</span>
                  {e.certificats.some((c) => c.etat === 'produit') && <button type="button" onClick={() => { void agir('lot', async () => { await telechargerLot(page.dossier.id, e.periode.id); return 'Certificats du mois téléchargés (PDF).'; }, 'Le PDF n\'a pas pu être produit, réessayez.'); }} disabled={occupe} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>{action === 'lot' ? 'Préparation…' : '📄 Certificats du mois (PDF)'}</button>}
                </div>
                {e.certificats.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucun certificat produit pour les paiements de ce mois.</p>}
                {e.certificats.length > 0 && (
                  <div style={{ overflowX: 'auto', position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 720 }}>
                      <thead>
                        <tr style={{ color: '#64748b', textAlign: 'left' }}>
                          <th style={cellule}>Numéro</th><th style={cellule}>Paiement</th><th style={cellule}>Bénéficiaire</th><th style={{ ...cellule, textAlign: 'right' }}>Retenue</th><th style={cellule}>État</th><th style={cellule}><span style={cache}>Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.certificats.map((c) => (
                          <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9', opacity: c.etat === 'annule' ? 0.65 : 1 }}>
                            <td style={{ ...cellule, fontFamily: mono, fontWeight: 800 }}>{c.reference}</td>
                            <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(c.datePaiement)} <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>({LIBELLES_SOURCE[c.sourceDate]})</span></td>
                            <td style={cellule}><span style={{ fontFamily: mono, fontWeight: 700 }}>{c.tiers.code}</span> {c.tiers.nom}</td>
                            <td style={nombre}>{montant(c.totaux.rs)}{nonNul(c.totaux.taxes) ? ` + ${montant(c.totaux.taxes)}` : ''}</td>
                            <td style={cellule}>
                              {c.etat === 'annule'
                                ? <span style={pastille('#fee2e2', '#991b1b')} title={c.annulation?.motif || ''}>Annulé{c.annulation?.fichier ? ` · ${c.annulation.fichier.nom}` : c.fichier ? ' · à déclarer (rectificatif)' : ''}</span>
                                : c.fichier ? <span style={pastille('#dcfce7', '#166534')}>Déposé · {c.fichier.nom}</span> : <span style={pastille('#eef2ff', '#3730a3')}>Produit</span>}
                              {c.etat === 'annule' && c.annulation?.motif && <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{c.annulation.motif}</span>}
                            </td>
                            <td style={{ ...cellule, whiteSpace: 'nowrap', textAlign: 'right' }}>
                              <button type="button" onClick={() => { void agir(`pdf-${c.id}`, async () => { await telechargerCertificat(page.dossier.id, c); return `Certificat ${c.reference} téléchargé (PDF).`; }, 'Le PDF n\'a pas pu être produit, réessayez.'); }} disabled={occupe} aria-label={`Certificat ${c.reference} (PDF)`} style={lien}>{action === `pdf-${c.id}` ? '…' : '📄 PDF'}</button>
                              {peutProduire && c.etat === 'produit' && <button type="button" onClick={() => setAnnulation({ certificat: c, motif: '', erreur: '' })} disabled={occupe} aria-label={`Annuler le certificat ${c.reference}`} style={{ ...lien, color: '#be123c' }}>Annuler</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#f8faff', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', color: '#1e1b4b', fontWeight: 700 }}>Fichier TEJ du mois</span>
                    <span style={pastille('#fef3c7', '#92400e')} title="Cahier des charges TEJ v2.0 ; nouveau schéma de septembre 2026 non publié">À essayer sur TEJ</span>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                      {e.prochainFichier.nbAjouts + e.prochainFichier.nbAnnulations > 0
                        ? `Prochain : ${e.prochainFichier.nom || '—'} — ${e.prochainFichier.acte === 0 ? 'dépôt initial' : 'rectificatif'}, ${pluriel(e.prochainFichier.nbAjouts, 'certificat', 'certificats')}${e.prochainFichier.nbAnnulations ? `, ${pluriel(e.prochainFichier.nbAnnulations, 'annulation', 'annulations')}` : ''}`
                        : e.fichiers.length ? 'Tous les certificats du mois sont dans un fichier.' : 'Produisez d\'abord les certificats du mois.'}
                    </span>
                    <span style={{ flex: 1 }} />
                    {peutProduire && <button type="button" onClick={() => { void fichier(); }} disabled={occupe || e.prochainFichier.nbAjouts + e.prochainFichier.nbAnnulations === 0 || !page.declarant.complet} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>{action === 'fichier' ? 'Production…' : '📤 Fichier TEJ (XML)'}</button>}
                  </div>
                  {e.fichiers.map((f) => (
                    <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: '#334155' }}>
                      <span style={{ fontFamily: mono, fontWeight: 700 }}>{f.nom}</span>
                      <span>{f.acte === 0 ? 'dépôt initial' : 'rectificatif'} · {pluriel(f.nbAjouts, 'certificat', 'certificats')}{f.nbAnnulations ? ` · ${pluriel(f.nbAnnulations, 'annulation', 'annulations')}` : ''} · produit le {new Date(f.produitLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}{f.produitPar ? ` par ${f.produitPar}` : ''}</span>
                      <button type="button" onClick={() => { void agir(`xml-${f.id}`, async () => { await telechargerFichierTej(page.dossier.id, f); return `Fichier ${f.nom} retéléchargé (identique).`; }, 'Le fichier n\'a pas pu être téléchargé, réessayez.'); }} disabled={occupe} aria-label={`Télécharger ${f.nom}`} style={lien}>{action === `xml-${f.id}` ? '…' : '⬇️ Télécharger'}</button>
                    </div>
                  ))}
                  <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5 }}>Le fichier suit le cahier des charges TEJ v2.0 (juin 2024) ; un nouveau schéma est exigé depuis septembre 2026 et n'est pas publié : essayez le dépôt sur tej.finances.gov.tn avant d'y compter. Le certificat qui fait foi est celui de la plateforme ; le PDF en reprend le contenu.</span>
                </div>
              </section>

              {/* Les retenues subies */}
              <section style={cadre} aria-labelledby="tm-subies">
                <div style={enTeteCadre}>
                  <span id="tm-subies" style={titreCadre}>Retenues subies — {libelleMois(e.periode.debut)}</span>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Ce que vos clients ont retenu sur vous (comptes de retenues subies) : {montant(e.subies.total)}</span>
                </div>
                {e.subies.lignes.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucune retenue subie sur la période.</p>}
                {e.subies.lignes.length > 0 && (
                  <div style={{ overflowX: 'auto', position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 600 }}>
                      <thead><tr style={{ color: '#64748b', textAlign: 'left' }}><th style={cellule}>Date</th><th style={cellule}>Pièce</th><th style={cellule}>Tiers</th><th style={cellule}>Code</th><th style={{ ...cellule, textAlign: 'right' }}>Montant</th></tr></thead>
                      <tbody>
                        {e.subies.lignes.map((s) => (
                          <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(s.date)}</td>
                            <td style={{ ...cellule, fontFamily: mono }}>{s.reference}{s.etat === 'brouillard' ? ' (*)' : ''}</td>
                            <td style={cellule}>{s.tiers ? `${s.tiers.code} ${s.tiers.nom}` : '—'}</td>
                            <td style={{ ...cellule, fontFamily: mono }}>{s.code || s.compte}</td>
                            <td style={nombre}>{montant(s.montant)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Les signalements */}
              <section style={cadre} aria-labelledby="tm-signalements">
                <div style={enTeteCadre}>
                  <span id="tm-signalements" style={titreCadre}>Signalements</span>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Rien n'est passé d'office : à vérifier</span>
                </div>
                {e.signalements.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucun signalement.</p>}
                {e.signalements.length > 0 && (
                  <ul style={{ margin: 0, padding: '10px 18px 14px', listStyle: 'none', display: 'grid', gap: 6 }}>
                    {e.signalements.map((s, i) => (
                      <li key={`${s.code}-${i}`} style={{ fontSize: '0.8rem', color: s.gravite === 'bloquant' ? '#b91c1c' : s.gravite === 'attention' ? '#92400e' : '#475569', lineHeight: 1.5 }}>
                        {s.gravite === 'bloquant' ? '⛔' : s.gravite === 'attention' ? '⚠️' : 'ℹ️'} {s.message}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
                Seules les lignes portant un code de taxe comptent dans l'état de TVA ; les retenues opérées viennent des lignes de retenue passées sur leur compte à l'achat (432). Le seuil de {e.seuilAchats ? fmtMontant(e.seuilAchats) : '1 000,000'} D des retenues sur achats s'apprécie par paiement. Un certificat s'établit au plus tard à la fin du mois qui suit le paiement.
              </p>
            </div>
          )}
        </>
      )}

      {annulation && page && (
        <Modale titre={`Annuler le certificat ${annulation.certificat.reference}`} sousTitre={`${annulation.certificat.tiers.code} ${annulation.certificat.tiers.nom} · paiement du ${fmtJour(annulation.certificat.datePaiement)}`}
          onClose={() => { if (!occupe) setAnnulation(null); }} onSubmit={() => { void annuler(); }} envoi={occupe} erreur={annulation.erreur || null} libelleEnvoi="Annuler le certificat" libelleAttente="Annulation…">
          <label htmlFor="tm-motif" style={lbl}>Motif</label>
          <textarea id="tm-motif" value={annulation.motif} onChange={(ev) => setAnnulation({ ...annulation, motif: ev.target.value, erreur: '' })} rows={3} maxLength={255} autoFocus style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            Le certificat garde son numéro et se marque annulé ; ses pièces redeviennent à certifier.{annulation.certificat.fichier ? ` Il a été déposé dans ${annulation.certificat.fichier.nom} : l'annulation partira dans le prochain rectificatif.` : ''}
          </p>
        </Modale>
      )}
    </div>
  );
}

// Une rangée du résumé de l'état de TVA.
function Rangee({ libelle, valeur, fort = false, couleur }: { libelle: string; valeur: string; fort?: boolean; couleur?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: fort ? '0.92rem' : '0.82rem', padding: '4px 0', borderTop: fort ? '2px solid #c7d2fe' : 'none', fontWeight: fort ? 800 : 500, color: couleur || '#0f172a' }}>
      <span style={{ color: fort ? couleur || '#0f172a' : '#475569' }}>{libelle}</span>
      <span style={{ fontFamily: mono }}>{valeur}</span>
    </div>
  );
}

// Un paiement à certifier : case, bénéficiaire, date (modifiable), pièces, ce qui bloque, ce qui est à vérifier.
function BlocPaiement({ p, date, max, coche, modifiable, occupe, dossierId, basculer, changerDate }: {
  p: Paiement; date: string; max: string; coche: boolean; modifiable: boolean; occupe: boolean; dossierId: number;
  basculer: (c: boolean) => void; changerDate: (d: string) => void;
}) {
  const t = p.tiers;
  const id = `tm-p-${p.cle.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 18px', background: p.bloque ? '#fffafa' : '#fff' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {modifiable && <input type="checkbox" checked={coche} onChange={(ev) => basculer(ev.target.checked)} disabled={occupe} aria-label={`Certifier le paiement de ${t?.code || ''} du ${fmtJour(date)}`} />}
        <span style={{ minWidth: 0, flex: '1 1 260px' }}>
          <span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{t?.code}</span> <span style={{ fontWeight: 600 }}>{t?.nom}</span>
          <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b' }}>{t?.regimeFiscalLibelle || 'Régime fiscal non renseigné'}{t?.matriculeFiscal ? ` · ${t.matriculeFiscal}` : ''}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label htmlFor={id} style={{ fontSize: '0.74rem', color: '#64748b' }}>Paiement du</label>
          {modifiable
            ? <input id={id} type="date" value={date} max={max} onChange={(ev) => changerDate(ev.target.value)} disabled={occupe} style={{ ...inp, width: 'auto', padding: '6px 8px' }} />
            : <span id={id} style={{ fontWeight: 700 }}>{fmtJour(date)}</span>}
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{date === p.date ? LIBELLES_SOURCE[p.sourceDate] : 'date corrigée'}</span>
        </span>
        <span style={{ fontFamily: mono, fontWeight: 800, whiteSpace: 'nowrap' }}>{montant(p.totaux.rs)} D</span>
      </div>
      <div style={{ overflowX: 'auto', position: 'relative', marginTop: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: 760 }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={cellule}>Pièce</th><th style={cellule}>Facture du</th><th style={cellule}>Nature</th><th style={{ ...cellule, textAlign: 'right' }}>Hors taxes</th><th style={{ ...cellule, textAlign: 'right' }}>TVA</th>
              <th style={{ ...cellule, textAlign: 'right' }}>TTC</th><th style={{ ...cellule, textAlign: 'right' }}>Taux</th><th style={{ ...cellule, textAlign: 'right' }}>Retenue</th><th style={{ ...cellule, textAlign: 'right' }}>Net servi</th>
            </tr>
          </thead>
          <tbody>
            {p.operations.map((o: Operation) => (
              <tr key={o.ecritureId} style={{ borderTop: '1px solid #f8fafc' }}>
                <td style={{ ...cellule, whiteSpace: 'nowrap' }}><span style={{ fontFamily: mono, fontWeight: 700 }}>{o.reference}</span> <span style={{ color: '#94a3b8' }}>{o.numero}</span></td>
                <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(o.dateFacture)}</td>
                <td style={cellule}><span style={{ fontFamily: mono }}>{o.code}</span> <span style={{ color: '#64748b' }}>({o.codeTej})</span></td>
                <td style={nombre}>{montant(o.ht)}</td><td style={nombre}>{montant(o.tva)}</td><td style={nombre}>{montant(o.ttc)}</td>
                <td style={nombre}>{fmtTaux(o.tauxRs)}</td><td style={{ ...nombre, fontWeight: 700 }}>{montant(o.rs)}{o.rsTva ? ` + ${montant(o.rsTva.montant)}` : ''}</td><td style={nombre}>{montant(o.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.bloque && <div role="alert" style={{ marginTop: 6, fontSize: '0.78rem', color: '#b91c1c' }}>⛔ {p.bloque} — <Link to={`/dossiers/${dossierId}/tiers`} style={lienTexte}>page Tiers</Link></div>}
      {p.avertissements.map((a, i) => <div key={`${a.code}-${i}`} style={{ marginTop: 4, fontSize: '0.76rem', color: a.code === 'NON_REGLE' ? '#64748b' : '#92400e' }}>{a.code === 'NON_REGLE' ? 'ℹ️' : '⚠️'} {a.message}</div>)}
    </div>
  );
}

// Le message d'un refus : un téléchargement rend un blob, son JSON est relu.
async function messageTelechargement(err: unknown, defaut: string, role: Role) {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const corps = JSON.parse(await data.text()) as { message?: string; code?: string };
      return messageDossier({ response: { data: corps } }, defaut, role);
    } catch {
      return defaut;
    }
  }
  return messageDossier(err, defaut, role);
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'clip', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const titreCadre: React.CSSProperties = { fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' };
const cellule: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const nombre: React.CSSProperties = { ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const lienTexte: React.CSSProperties = { color: '#4338ca', fontWeight: 700, textDecoration: 'none' };
// Texte lu par les lecteurs d'écran, invisible (en-tête d'une colonne de boutons).
const cache: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
