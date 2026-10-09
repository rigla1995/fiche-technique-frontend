import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/client';
import ClientIdentiteForm from '../../components/admin/ClientIdentiteForm';
import { controlerMatriculeFiscal } from '../../components/admin/matriculeFiscal';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { champsModifies, identiteDe, libelleForme, type IdentiteLegale } from '../../utils/identiteLegale';
import BoutonAide from '../BoutonAide';
import { FormulaireExercice, FormulaireRegime, Modale } from '../DossierFormulaires';
import { libelleNiveau } from '../comptables';
import {
  controlerExercice, fmtDate, fmtMoisAnnee, libelleImpot, libellePersonne, libelleTva, messageDossier, ouiNon, statutDe, texteEtatAbonnement,
  type Exercice, type FicheDossier, type Regime, type ResumeFiscalite, type ResumeTenue,
} from '../dossiers';
import { signe } from '../echeancier';
import { fmtMontant } from '../ecritures';
import { bouton, pastille, petit } from '../styles';
import { Carte, Ligne } from '../ui';

// « Fiche du dossier » (LabFlow Compta, étape S4a ; labflow-reprise/achats-compta/PLAN-S4.md §2) : identité (modifiable,
// patente comprise), régime fiscal, exercice en cours et ses périodes, qui y a accès ; archiver, désarchiver, supprimer
// un dossier vide (titulaire). Les droits viennent du serveur (réponse du client du 07/10 : Complet crée et modifie ;
// Saisie et Consultation lisent ; archiver, désarchiver, supprimer = titulaire). Un dossier archivé ne se modifie pas ;
// une comptabilité dont l'abonnement n'est pas actif reste consultable. Un refus du serveur sur un état périmé (404,
// 409) ferme la fenêtre et relit la fiche (convention de S3c).
type Fenetre = 'identite' | 'regime' | 'exercice' | null;
type Role = 'titulaire' | 'gerant';
// Rendu par une fenêtre quand le serveur refuse : vrai si la page a pris la main (fenêtre fermée, fiche relue).
type Refus = (err: unknown) => boolean;

// Une ligne de la carte « Configuration » : libellé, compte rendu, bouton « Ouvrir » vers la page (S5a plan de comptes ;
// S5b journaux et taxes ; S6a écritures, carte « Tenue »).
function LigneConfiguration({ libelle, valeur, lien, icone }: { libelle: string; valeur: string; lien: string; icone: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid #f8fafc', flexWrap: 'wrap' }}>
      <span style={{ color: '#64748b' }}>{libelle}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: '#0f172a', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{valeur}</span>
        <Link to={lien} style={{ ...petit('#eef2ff', '#4338ca', '#c7d2fe'), textDecoration: 'none' }}>{icone} Ouvrir</Link>
      </span>
    </div>
  );
}

// S7a : le dû non lettré d'un type de tiers (carte Tenue, ligne Échéancier) : « 1 190,000 dont 300,000 échu », « soldé »,
// « 500,000 en votre faveur » (relecture : un dû négatif se dit en clair).
const texteDu = (r: ResumeTenue) => {
  const du = signe(r.du);
  const echu = signe(r.echu);
  if (du === 0n) return 'soldé';
  if (du < 0n) return `${fmtMontant(-du)} en votre faveur`;
  return `${fmtMontant(du)}${echu > 0n ? ` dont ${fmtMontant(echu)} échu` : ''}`;
};

// S7b : le compte rendu des taxes du mois (carte Taxes) : « septembre 2026 : TVA à payer 1 234,500 · 3 pièces à certifier ».
// S7c : la déclaration mensuelle à faire (carte Taxes) : « septembre 2026 : échéance le 20/10/2026 » ou « septembre 2026 :
// déclarée le 18/10/2026 ».
const texteDeclaration = (r: ResumeFiscalite) => {
  const d = r.declaration;
  if (!d) return 'aucun mois fini à déclarer';
  const mois = fmtMoisAnnee(d.periode.debut);
  return d.declareeLe ? `${mois} : déclarée le ${fmtDate(d.declareeLe)}` : `${mois} : à déclarer${d.echeance ? ` avant le ${fmtDate(d.echeance)}` : ''}`;
};
const texteTaxes = (r: ResumeFiscalite) => {
  if (!r.periode || !r.tva) return `${r.aProduire} pièce${r.aProduire > 1 ? 's' : ''} à retenue sans certificat (tous mois)`;
  const aPayer = signe(r.tva.aPayer);
  const credit = signe(r.tva.creditAReporter);
  const tva = aPayer > 0n ? `TVA à payer ${fmtMontant(aPayer)}` : credit > 0n ? `crédit de TVA ${fmtMontant(credit)}` : 'TVA nulle';
  const certificats = r.aProduire ? `${r.aProduire} pièce${r.aProduire > 1 ? 's' : ''} à retenue sans certificat (tous mois)` : r.certificatsMois ? `${r.certificatsMois} certificat${r.certificatsMois > 1 ? 's' : ''} ce mois` : 'aucun certificat à produire';
  return `${fmtMoisAnnee(r.periode.debut)} : ${tva} · ${certificats}`;
};

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaDossierPage() {
  const { dossierId } = useParams();
  return <ComptaDossier key={dossierId} dossierId={dossierId} />;
}

function ComptaDossier({ dossierId }: { dossierId?: string }) {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const [fiche, setFiche] = useState<FicheDossier | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [info, setInfo] = useState('');
  const [avertissements, setAvertissements] = useState<string[]>([]);
  const [erreur, setErreur] = useState('');
  // Une action à la fois (archiver, désarchiver, supprimer) : référence lue au moment du clic, jamais une valeur périmée.
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);

  // Lectures numérotées : une lecture partie avant la dernière réponse reçue ne l'écrase jamais.
  const tour = useRef(0);
  const charger = useCallback(() => {
    const moi = ++tour.current;
    api.get(`/api/compta/dossiers/${encodeURIComponent(dossierId || '')}`)
      .then(({ data }) => { if (moi === tour.current) { setFiche(data as FicheDossier); setEtat('pret'); } })
      .catch((err) => { if (moi === tour.current) setEtat(statutDe(err) === 404 ? 'introuvable' : 'erreur'); });
  }, [dossierId]);
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);

  const role: Role = fiche?.espace.role || 'titulaire';
  // Fiche renvoyée par une écriture : affichée telle quelle ; les avertissements (matricule déjà porté, sans clé) à part.
  const appliquer = (f: FicheDossier, message: string) => {
    tour.current += 1;
    setFiche(f);
    setErreur('');
    setInfo(message);
    setAvertissements(f.avertissements || []);
    setFenetre(null);
  };
  // Refus sur un état périmé (dossier archivé entre-temps, disparu, exercice clos) : fenêtre fermée, fiche relue.
  const refus: Refus = (err) => {
    const s = statutDe(err);
    if (s !== 404 && s !== 409) return false;
    setFenetre(null);
    setInfo('');
    setErreur(messageDossier(err, 'Action impossible : la fiche a été relue.', role));
    charger();
    return true;
  };

  const ouvert = !!fiche && fiche.etatAbonnement === 'actif';
  const modifiable = !!fiche && fiche.droits.modifier && fiche.etat === 'actif' && ouvert;
  const retour = fiche
    ? (fiche.espace.role === 'titulaire'
      ? { lien: fiche.espace.type === 'cabinet' ? '/dossiers' : '/ma-comptabilite', libelle: fiche.espace.type === 'cabinet' ? 'Dossiers' : 'Ma comptabilité' }
      : { lien: fiche.espace.type === 'cabinet' ? `/cabinets/${fiche.espace.id}` : `/confiee/${fiche.espace.id}`, libelle: fiche.espace.nom })
    : null;

  const basculer = async (action: 'archiver' | 'desarchiver') => {
    if (!fiche || occupeRef.current) return;
    const ok = await confirm(action === 'archiver'
      ? { title: 'Archiver ce dossier ?', message: `« ${fiche.nom} » sortira de la liste courante. Rien n'est effacé : vous pourrez le désarchiver.`, tone: 'primary', confirmLabel: 'Archiver', icon: '📦' }
      : { title: 'Désarchiver ce dossier ?', message: `« ${fiche.nom} » revient dans la liste courante et redevient modifiable.`, tone: 'primary', confirmLabel: 'Désarchiver', icon: '📂' });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const { data } = await api.post(`/api/compta/dossiers/${fiche.id}/${action}`);
      appliquer(data as FicheDossier, action === 'archiver' ? 'Dossier archivé.' : 'Dossier désarchivé.');
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Action impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };

  // S4b : le dossier « Mon entreprise » d'un client LabFlow recopie l'identité du compte LabFlow (règle PLAN-S4 §4 :
  // copie à la création, puis indépendante ; recopie à la demande).
  const reprendre = async () => {
    if (!fiche || occupeRef.current) return;
    const ok = await confirm({
      title: 'Reprendre l\'identité de LabFlow ?',
      message: 'Les champs que LabFlow connaît (page Mon entreprise) remplaceront ceux de ce dossier. Un champ vide dans LabFlow n\'efface rien ici. Le compte LabFlow, lui, ne change pas.',
      tone: 'primary',
      confirmLabel: 'Reprendre',
      icon: '🔄',
    });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const { data } = await api.post(`/api/compta/dossiers/${fiche.id}/reprendre-identite`);
      const f = data as FicheDossier;
      const n = f.reprise ?? 0;
      appliquer(f, n === 0 ? 'Identité déjà identique à celle de LabFlow : rien à reprendre.' : `Identité reprise de LabFlow : ${n} champ${n > 1 ? 's' : ''} mis à jour.`);
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Reprise impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };

  const supprimer = async () => {
    if (!fiche || occupeRef.current) return;
    const ok = await confirm({
      title: 'Supprimer ce dossier ?',
      message: `« ${fiche.nom} » n'a aucune écriture : il sera supprimé avec son exercice et ses périodes. Le journal de la comptabilité en garde la trace.`,
      details: ['Un dossier qui a des écritures ne se supprime jamais : il s\'archive.'],
      tone: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      await api.delete(`/api/compta/dossiers/${fiche.id}`);
      navigate(retour?.lien || '/', { replace: true });
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Suppression impossible, réessayez.', role));
      occupeRef.current = false;
      setOccupe(false);
    }
  };

  // S6b : les périodes de l'exercice en cours, ouvertes et closes (carte Tenue, carte Exercice).
  const nbCloses = fiche?.exercice ? fiche.exercice.periodes.filter((p) => p.etat === 'close').length : 0;
  const nbOuvertes = fiche?.exercice ? fiche.exercice.periodes.length - nbCloses : 0;
  const id = fiche?.identite;
  const lignesIdentite: [string, string | null | undefined][] = id ? [
    ['Raison sociale', id.raisonSociale],
    ['Nom commercial', id.nomCommercial],
    ['Forme juridique', libelleForme(id.formeJuridique)],
    ['Matricule fiscal', id.matriculeFiscal],
    ['RNE', id.rne],
    ['Adresse', [id.adresse, id.ville].filter(Boolean).join(', ')],
    ['Représentant légal', [id.representantNom, id.representantQualite].filter(Boolean).join(' — ')],
  ] : [];

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🗂️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, overflowWrap: 'anywhere' }}>{fiche ? fiche.nom : 'Dossier'}</h1>
            {fiche?.source === 'labflow' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')} title="Dossier « Mon entreprise », créé d'après l'identité du compte LabFlow">LabFlow</span>}
            {fiche?.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Archivé</span>}
            {fiche && !fiche.identiteComplete && <span style={pastille('#fef3c7', '#92400e')}>Identité à compléter</span>}
          </div>
          {fiche && (
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
              {[fiche.identite.raisonSociale, libelleForme(fiche.identite.formeJuridique), fiche.identite.matriculeFiscal ? `MF ${fiche.identite.matriculeFiscal}` : null].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <BoutonAide section="compta-dossier" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger ce dossier.</span>
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

      {etat === 'pret' && fiche && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(fiche.etatAbonnement, role)} : ce dossier reste consultable mais ne se modifie plus.
            </div>
          )}
          {fiche.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : il ne se modifie pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {avertissements.map((a) => (
            <div key={a} role="status" style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>⚠️ {a}</div>
          ))}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Carte titre="🪪 Identité" sousTitre={fiche.source === 'labflow' ? 'Dossier « Mon entreprise » : reprise du compte LabFlow à la demande' : "Telle qu'écrite sur la patente"}>
                {lignesIdentite.map(([l, v]) => <Ligne key={l} libelle={l} valeur={v || '—'} />)}
                {modifiable && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button type="button" onClick={() => { setInfo(''); setFenetre('identite'); }} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>✏️ Modifier</button>
                    {fiche.source === 'labflow' && (
                      <button type="button" onClick={reprendre} disabled={occupe} style={petit('#f0fdf4', '#166534', '#bbf7d0')}>↺ Reprendre l'identité de LabFlow</button>
                    )}
                  </div>
                )}
              </Carte>
              <Carte titre="⚖️ Régime fiscal" sousTitre="Servira aux taxes et aux déclarations">
                <Ligne libelle="Personne" valeur={libellePersonne(fiche.regime.personne)} />
                <Ligne libelle="Impôt sur le bénéfice" valeur={libelleImpot(fiche.regime.impot)} />
                <Ligne libelle="TVA" valeur={libelleTva(fiche.regime.tva)} />
                <Ligne libelle="Exportateur total" valeur={ouiNon(fiche.regime.exportateurTotal)} />
                <Ligne libelle="Télédéclaration" valeur={ouiNon(fiche.regime.teledeclaration)} />
                <Ligne libelle="Début d'activité" valeur={fmtDate(fiche.regime.debutActivite)} />
                <Ligne libelle="Pays · devise" valeur={`Tunisie · dinar tunisien (${fiche.decimales} décimales)`} />
                {modifiable && <button type="button" onClick={() => { setInfo(''); setFenetre('regime'); }} style={{ ...petit('#f0f9ff', '#0369a1', '#bae6fd'), marginTop: 12 }}>✏️ Modifier</button>}
              </Carte>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Carte titre="📅 Exercice en cours" sousTitre={fiche.exercice ? `Du ${fmtDate(fiche.exercice.debut)} au ${fmtDate(fiche.exercice.fin)}` : 'Aucun exercice ouvert'}>
                {fiche.exercice && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {fiche.exercice.periodes.map((p) => (
                        <span key={p.debut} title={`Du ${fmtDate(p.debut)} au ${fmtDate(p.fin)}`} style={pastille(p.etat === 'ouverte' ? '#eef2ff' : '#e2e8f0', p.etat === 'ouverte' ? '#3730a3' : '#475569')}>
                          {fmtMoisAnnee(p.debut)}{p.etat === 'close' ? ' · close' : ''}
                        </span>
                      ))}
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                      {fiche.exercice.periodes.length} période{fiche.exercice.periodes.length > 1 ? 's' : ''} mensuelle{fiche.exercice.periodes.length > 1 ? 's' : ''} : {nbOuvertes} ouverte{nbOuvertes > 1 ? 's' : ''}, {nbCloses} close{nbCloses > 1 ? 's' : ''} (page Périodes : valider, clore, rouvrir, journal général).
                      {fiche.mouvemente ? ' Le dossier a des écritures : les dates de l\'exercice ne changent plus.' : ''}
                    </p>
                    {modifiable && !fiche.mouvemente && <button type="button" onClick={() => { setInfo(''); setFenetre('exercice'); }} style={{ ...petit('#f0f9ff', '#0369a1', '#bae6fd'), marginTop: 12 }}>✏️ Modifier les dates</button>}
                  </>
                )}
              </Carte>
              {/* S5a : la configuration du dossier — le plan de comptes (copié du paquet pays) ; S5b : ses journaux et ses
                  codes de taxe (copiés selon le régime) ; S5c : ses tiers (fournisseurs, clients) (PLAN-S5 §2). */}
              <Carte titre="⚙️ Configuration" sousTitre={fiche.plan.paquet ? `Plan de comptes : ${fiche.plan.paquet.libelle}` : 'Plan de comptes, journaux, taxes, tiers'}>
                <LigneConfiguration libelle="Plan de comptes" lien={`/dossiers/${fiche.id}/plan`} icone="📑"
                  valeur={`${fiche.plan.nbActifs} compte${fiche.plan.nbActifs > 1 ? 's' : ''} actif${fiche.plan.nbActifs > 1 ? 's' : ''}${fiche.plan.nbAjoutes > 0 ? ` · ${fiche.plan.nbAjoutes} ajouté${fiche.plan.nbAjoutes > 1 ? 's' : ''}` : ''}${fiche.plan.nbDesactives > 0 ? ` · ${fiche.plan.nbDesactives} désactivé${fiche.plan.nbDesactives > 1 ? 's' : ''}` : ''}`} />
                <LigneConfiguration libelle="Journaux" lien={`/dossiers/${fiche.id}/journaux`} icone="📒"
                  valeur={`${fiche.journaux.nbActifs} journa${fiche.journaux.nbActifs > 1 ? 'ux' : 'l'} actif${fiche.journaux.nbActifs > 1 ? 's' : ''}${fiche.journaux.nbTotal > fiche.journaux.nbActifs ? ` · ${fiche.journaux.nbTotal - fiche.journaux.nbActifs} désactivé${fiche.journaux.nbTotal - fiche.journaux.nbActifs > 1 ? 's' : ''}` : ''}`} />
                <LigneConfiguration libelle="Taxes" lien={`/dossiers/${fiche.id}/taxes`} icone="🧾"
                  valeur={`${fiche.taxes.nbActifs} code${fiche.taxes.nbActifs > 1 ? 's' : ''} actif${fiche.taxes.nbActifs > 1 ? 's' : ''}${fiche.taxes.nbTotal > fiche.taxes.nbActifs ? ` · ${fiche.taxes.nbTotal - fiche.taxes.nbActifs} désactivé${fiche.taxes.nbTotal - fiche.taxes.nbActifs > 1 ? 's' : ''}` : ''}`} />
                <LigneConfiguration libelle="Tiers" lien={`/dossiers/${fiche.id}/tiers`} icone="📇"
                  valeur={`${fiche.tiers.fournisseurs.nbActifs} fournisseur${fiche.tiers.fournisseurs.nbActifs > 1 ? 's' : ''} · ${fiche.tiers.clients.nbActifs} client${fiche.tiers.clients.nbActifs > 1 ? 's' : ''}${fiche.tiers.fournisseurs.nbTotal + fiche.tiers.clients.nbTotal > fiche.tiers.fournisseurs.nbActifs + fiche.tiers.clients.nbActifs ? ` · ${fiche.tiers.fournisseurs.nbTotal + fiche.tiers.clients.nbTotal - fiche.tiers.fournisseurs.nbActifs - fiche.tiers.clients.nbActifs} désactivé${fiche.tiers.fournisseurs.nbTotal + fiche.tiers.clients.nbTotal - fiche.tiers.fournisseurs.nbActifs - fiche.tiers.clients.nbActifs > 1 ? 's' : ''}` : ''}`} />
              </Carte>
              {/* S6a : la tenue du dossier — les écritures (PLAN-S6 §2) ; S6b : validation et périodes ; S6c : les livres
                  (grand livre, balance, journaux) sur la page Livres, chacun par son onglet ; S7a : lettrage et échéancier. */}
              <Carte titre="✍️ Tenue" sousTitre="Écritures, périodes, livres, lettrage et échéancier">
                <LigneConfiguration libelle="Écritures" lien={`/dossiers/${fiche.id}/ecritures`} icone="✍️"
                  valeur={`${fiche.ecritures.nbBrouillard} en brouillard · ${fiche.ecritures.nbValidees} validée${fiche.ecritures.nbValidees > 1 ? 's' : ''}`} />
                <LigneConfiguration libelle="Périodes" lien={`/dossiers/${fiche.id}/periodes`} icone="🔏"
                  valeur={fiche.exercice ? `${nbOuvertes} ouverte${nbOuvertes > 1 ? 's' : ''} · ${nbCloses} close${nbCloses > 1 ? 's' : ''}` : 'Aucun exercice'} />
                <LigneConfiguration libelle="Grand livre" lien={`/dossiers/${fiche.id}/livres?vue=grand-livre`} icone="📖" valeur="Par compte, par tiers" />
                <LigneConfiguration libelle="Balance" lien={`/dossiers/${fiche.id}/livres?vue=balance`} icone="⚖️" valeur="Générale, auxiliaire" />
                <LigneConfiguration libelle="Journaux" lien={`/dossiers/${fiche.id}/livres?vue=journaux`} icone="📒" valeur="Par journal, par période" />
                {fiche.tenue && (
                  <>
                    <LigneConfiguration libelle="Lettrage" lien={`/dossiers/${fiche.id}/lettrage`} icone="🔗"
                      valeur={`${fiche.tenue.fournisseurs.aLettrer + fiche.tenue.clients.aLettrer} ligne${fiche.tenue.fournisseurs.aLettrer + fiche.tenue.clients.aLettrer > 1 ? 's' : ''} à lettrer`} />
                    <LigneConfiguration libelle="Échéancier" lien={`/dossiers/${fiche.id}/echeancier`} icone="📅"
                      valeur={`Fournisseurs ${texteDu(fiche.tenue.fournisseurs)} · clients ${texteDu(fiche.tenue.clients)}`} />
                  </>
                )}
              </Carte>
              {/* S7b : les taxes du mois — état de TVA, retenues et certificats (PLAN-S7 §2 « S7b ») ; S7c : la déclaration
                  mensuelle (le mois à déclarer, son échéance). */}
              {fiche.fiscalite && (
                <Carte titre="🧾 Taxes" sousTitre="TVA du mois, retenues à la source, certificats TEJ, déclaration mensuelle">
                  <LigneConfiguration libelle="Taxes du mois" lien={`/dossiers/${fiche.id}/taxes-mois${fiche.fiscalite.periode ? `?periode=${fiche.fiscalite.periode.id}` : ''}`} icone="🧾" valeur={texteTaxes(fiche.fiscalite)} />
                  <LigneConfiguration libelle="Déclaration mensuelle" lien={`/dossiers/${fiche.id}/declaration${fiche.fiscalite.declaration ? `?periode=${fiche.fiscalite.declaration.periode.id}` : ''}`} icone="🗓️" valeur={texteDeclaration(fiche.fiscalite)} />
                </Carte>
              )}
              <Carte titre="🔑 Accès" sousTitre="Les personnes qui voient ce dossier">
                {fiche.acces.map((a, i) => (
                  <div key={`${a.email}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.84rem', padding: '6px 0', borderBottom: '1px solid #f8fafc', flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{a.nom || a.email}</strong>{a.nom && a.email ? <span style={{ color: '#64748b' }}> · {a.email}</span> : null}</span>
                    <span style={pastille(a.role === 'titulaire' ? '#eef2ff' : '#f1f5f9', a.role === 'titulaire' ? '#3730a3' : '#334155')}>{a.role === 'titulaire' ? 'Titulaire' : `Collaborateur · ${libelleNiveau(a.niveau)}`}</span>
                  </div>
                ))}
                <p style={{ margin: '10px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>Créé le {fmtDate(fiche.creeLe)} · dernière modification le {fmtDate(fiche.modifieLe)}.</p>
              </Carte>
              {fiche.droits.archiver && (
                <Carte titre="🗃️ Archivage et suppression" sousTitre="Réservés au titulaire">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {fiche.etat === 'actif'
                      ? <button type="button" onClick={() => basculer('archiver')} disabled={occupe || !ouvert} style={{ ...bouton('#fff', '#475569', '#cbd5e1'), ...(ouvert ? {} : inactif) }}>📦 Archiver</button>
                      : <button type="button" onClick={() => basculer('desarchiver')} disabled={occupe || !ouvert} style={{ ...bouton('#eef2ff', '#4338ca', '#c7d2fe'), ...(ouvert ? {} : inactif) }}>📂 Désarchiver</button>}
                    {fiche.droits.supprimer && !fiche.mouvemente && fiche.source !== 'labflow' && (
                      <button type="button" onClick={supprimer} disabled={occupe || !ouvert} style={{ ...bouton('#fff', '#be123c', '#fecdd3'), ...(ouvert ? {} : inactif) }}>🗑 Supprimer</button>
                    )}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
                    {fiche.source === 'labflow'
                      ? 'Archiver retire le dossier de la liste courante sans rien effacer. Le dossier « Mon entreprise » ne se supprime pas : il s\'archive.'
                      : 'Archiver retire le dossier de la liste courante sans rien effacer. Supprimer n\'est possible que pour un dossier sans écriture.'}
                  </p>
                </Carte>
              )}
            </div>
          </div>

          {fenetre === 'identite' && <FenetreIdentite fiche={fiche} role={role} onClose={() => setFenetre(null)} onEnregistre={(f) => appliquer(f, 'Identité enregistrée.')} onRefus={refus} />}
          {fenetre === 'regime' && <FenetreRegime fiche={fiche} role={role} onClose={() => setFenetre(null)} onEnregistre={(f) => appliquer(f, 'Régime fiscal enregistré.')} onRefus={refus} />}
          {fenetre === 'exercice' && fiche.exercice && <FenetreExercice fiche={fiche} role={role} onClose={() => setFenetre(null)} onEnregistre={(f) => appliquer(f, 'Dates de l\'exercice enregistrées, périodes refaites.')} onRefus={refus} />}
        </>
      )}
    </div>
  );
}

interface PropsFenetre { fiche: FicheDossier; role: Role; onClose: () => void; onEnregistre: (f: FicheDossier) => void; onRefus: Refus }

// Modification de l'identité : seuls les champs modifiés partent (champsModifies) ; la raison sociale reste obligatoire ;
// pas d'enregistrement pendant la lecture de la patente.
function FenetreIdentite({ fiche, role, onClose, onEnregistre, onRefus }: PropsFenetre) {
  const initiale = identiteDe(fiche.identite);
  const [valeur, setValeur] = useState<IdentiteLegale>(initiale);
  const [envoi, setEnvoi] = useState(false);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistrer = async () => {
    if (envoi || lectureEnCours) return;
    const corps = champsModifies(valeur, initiale);
    if (Object.keys(corps).length === 0) { onClose(); return; }
    if (!(valeur.raisonSociale ?? '').trim()) { setErreur('La raison sociale est obligatoire.'); return; }
    const mf = controlerMatriculeFiscal(valeur.matriculeFiscal);
    if (!mf.ok) { setErreur(mf.erreur || 'Matricule fiscal invalide.'); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const { data } = await api.put(`/api/compta/dossiers/${fiche.id}`, { identite: corps });
      onEnregistre(data as FicheDossier);
    } catch (err) {
      if (onRefus(err)) return;
      setErreur(messageDossier(err, 'L\'identité n\'a pas pu être enregistrée — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre="Identité du dossier" sousTitre={lectureEnCours ? 'Lecture de la patente en cours…' : 'Telle qu\'écrite sur la patente'} onClose={onClose} onSubmit={enregistrer} envoi={envoi} inactif={lectureEnCours} erreur={erreur} large>
      <ClientIdentiteForm value={valeur} onChange={(v) => { setValeur(v); setErreur(null); }} disabled={envoi} onLecture={setLectureEnCours} />
    </Modale>
  );
}

function FenetreRegime({ fiche, role, onClose, onEnregistre, onRefus }: PropsFenetre) {
  const [valeur, setValeur] = useState<Regime>(fiche.regime);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistrer = async () => {
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const { data } = await api.put(`/api/compta/dossiers/${fiche.id}`, { regime: valeur });
      onEnregistre(data as FicheDossier);
    } catch (err) {
      if (onRefus(err)) return;
      setErreur(messageDossier(err, 'Le régime n\'a pas pu être enregistré — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre="Régime fiscal" onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur}>
      <FormulaireRegime valeur={valeur} onChange={setValeur} disabled={envoi} prefixe="fd-regime" />
    </Modale>
  );
}

function FenetreExercice({ fiche, role, onClose, onEnregistre, onRefus }: PropsFenetre) {
  const [valeur, setValeur] = useState<Exercice>({ debut: fiche.exercice?.debut || '', fin: fiche.exercice?.fin || '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistrer = async () => {
    if (envoi) return;
    const e = controlerExercice(valeur);
    if (e) { setErreur(e); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const { data } = await api.put(`/api/compta/dossiers/${fiche.id}`, { exercice: valeur });
      onEnregistre(data as FicheDossier);
    } catch (err) {
      if (onRefus(err)) return;
      setErreur(messageDossier(err, 'Les dates n\'ont pas pu être enregistrées — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre="Dates de l'exercice" sousTitre="Les périodes mensuelles sont refaites" onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur}>
      <FormulaireExercice valeur={valeur} onChange={(e) => { setValeur(e); setErreur(null); }} disabled={envoi} prefixe="fd-exercice" premier={false} />
    </Modale>
  );
}

const inactif: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
