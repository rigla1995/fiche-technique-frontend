import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { ChoixCompte } from '../ChoixCompte';
import { Modale } from '../DossierFormulaires';
import { FenetreImport } from '../FenetreImport';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { texteCompte } from '../journaux';
import {
  LIBELLES_TYPE, PAGE_TIERS, controlerCodeTiers, controlerPrefixe, exempleCode, importerTiers, lireTiers, retenueProposee, telechargerModeleTiers, telechargerTiers, texteDelai, texteIdentifiant, texteRetenue,
  type EcritureTiers, type RegimeTvaTiers, type Tiers, type TiersReponse, type TypeIdentifiant, type TypeTiers,
} from '../tiers';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Tiers » (LabFlow Compta, étape S5c ; labflow-reprise/achats-compta/PLAN-S5.md §2, §4 ; réponses du client du 07/10 —
// questions 4, 5 et 6 — et du 08/10 — « ok pour les 4 ») : les fournisseurs et les clients d'un dossier, en deux onglets,
// par pages de 25 avec la recherche côté serveur (code, nom, matricule) et « Afficher plus » (modèle de la liste des
// dossiers, S4d) ; ajouter (code généré d'après le modèle du dossier ou saisi, compte collectif 4011 / 4111 par défaut,
// régime de TVA, retenue par défaut, délai de paiement), modifier, désactiver / réactiver (titulaire, Complet ou Saisie),
// supprimer un tiers sans écriture, régler le modèle des codes et importer un classeur Excel en tout-ou-rien (titulaire
// ou Complet), exporter (tout niveau). Chaque écriture rend le tiers touché, remplacé en place ; une création ou un
// import relit la liste ; un refus sur un état périmé (404, 409) ferme la fenêtre et relit (convention de S3c), sauf les
// refus que la personne corrige dans la fenêtre. S7b : la fiche d'un fournisseur porte son régime fiscal (qui propose la
// retenue par défaut), sa résidence et, sans matricule fiscal, son identifiant de secours (CIN, passeport, carte de séjour,
// autre) : la plateforme TEJ les exige au certificat de retenue (page Taxes du mois).
type Fenetre = { type: 'creer' } | { type: 'modifier'; tiers: Tiers } | { type: 'modele' } | { type: 'importer' } | null;
type Role = 'titulaire' | 'gerant';
type Refus = (err: unknown) => boolean;
const CORRIGEABLES = ['CODE_EXISTANT', 'COMPTE_DESACTIVE', 'TAXE_DESACTIVEE', 'COLLECTIF_DEFAUT'];
const codeDe = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaTiersPage() {
  const { dossierId } = useParams();
  return <ComptaTiers key={dossierId} dossierId={dossierId} />;
}

function ComptaTiers({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  // `lu` : la dernière réponse (en-tête, droits, modèle, listes de choix, total), les lignes accumulées depuis la page 1,
  // et la clé (onglet, désactivés, recherche) qu'elle sert — une relecture en route se voit à la différence avec la clé.
  const [lu, setLu] = useState<{ cle: string; etat: TiersReponse; lignes: Tiers[] } | null>(null);
  const [etatPage, setEtatPage] = useState<'chargement' | 'pret' | 'introuvable'>('chargement');
  const [erreurLecture, setErreurLecture] = useState(false);
  const [type, setType] = useState<TypeTiers>('fournisseur');
  const [recherche, setRecherche] = useState('');
  const [q, setQ] = useState('');
  const [inactifs, setInactifs] = useState(false);
  const [plus, setPlus] = useState(false);
  // Une relecture de la même clé est en route (après une écriture, « Réessayer ») : posée par le geste, levée à la réponse.
  const [enRelecture, setEnRelecture] = useState(false);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);
  // Lectures numérotées : une lecture partie avant la dernière réponse reçue ne l'écrase jamais.
  const tour = useRef(0);
  const cle = `${type}\u0000${inactifs ? 1 : 0}\u0000${q}`;

  useEffect(() => { const t = setTimeout(() => setQ(recherche.trim()), 300); return () => clearTimeout(t); }, [recherche]);
  const charger = useCallback((page: number, limite: number = PAGE_TIERS) => {
    const moi = ++tour.current;
    lireTiers(dossierId || '', { type, q, inactifs, page, limite })
      .then((r) => {
        if (moi !== tour.current) return;
        // Pages cumulées pour la même clé, dédoublonnées par identifiant ; une autre clé repart de sa page 1.
        setLu((prev) => {
          const reprise = page === 1 || !prev || prev.cle !== cle;
          const vus = new Set(reprise ? [] : prev.lignes.map((t) => t.id));
          return { cle, etat: r, lignes: reprise ? r.tiers : [...prev.lignes, ...r.tiers.filter((t) => !vus.has(t.id))] };
        });
        setEtatPage('pret');
        setErreurLecture(false);
      })
      .catch((err) => {
        if (moi !== tour.current) return;
        if (statutDe(err) === 404) setEtatPage('introuvable'); else setErreurLecture(true);
      })
      .finally(() => { if (moi === tour.current) { setPlus(false); setEnRelecture(false); } });
  }, [dossierId, type, q, inactifs, cle]);
  useEffect(() => { charger(1); return () => { tour.current += 1; }; }, [charger]);

  const etat = lu?.etat ?? null;
  const lignes = useMemo(() => (lu?.lignes ?? []).filter((t) => inactifs || t.actif), [lu, inactifs]);
  const relecture = !!lu && lu.cle !== cle;
  // Une lecture est en route (autre clé, page suivante, relecture) : rien ne se clique en attendant (relecture).
  const lecture = relecture || plus || enRelecture;
  const role: Role = etat?.dossier.espace.role || 'titulaire';
  const ouvert = !!etat && etat.etatAbonnement === 'actif';
  const dossierActif = !!etat && etat.dossier.etat === 'actif';
  const peutTiers = !!etat && etat.droits.tiers && dossierActif && ouvert;
  const peutConfigurer = !!etat && etat.droits.configurer && dossierActif && ouvert;
  const L = LIBELLES_TYPE[type];
  const typeChoix = etat?.types.find((t) => t.valeur === type);
  const retenuesInactives = useMemo(() => lignes.filter((t) => t.actif && t.retenue && !t.retenue.actif).length, [lignes]);

  // La fenêtre chargée (pages entières, 200 au plus) relue d'un coup : après une écriture qui change l'ensemble, les
  // pages suivantes (OFFSET) restent justes (relecture).
  const relireFenetre = useCallback(() => {
    const n = lu ? lu.lignes.length : 0;
    setEnRelecture(true);
    charger(1, Math.min(200, Math.max(PAGE_TIERS, Math.ceil(n / PAGE_TIERS) * PAGE_TIERS)));
  }, [lu, charger]);
  // Une écriture rend le tiers touché : remplacé en place (ou retiré), comptes rendus et modèle mis à jour ; `relire`
  // (création, import, désactivation, réactivation, suppression) relit la fenêtre chargée de la clé en cours.
  const appliquer = (r: EcritureTiers, message: string, options: { retirer?: number; relire?: boolean } = {}) => {
    setLu((prev) => (prev ? {
      ...prev,
      // Le total de la recherche baisse d'un quand un tiers retiré ou désactivé quitte la liste (les désactivés cachés).
      etat: { ...prev.etat, nb: r.nb, modele: r.modele, total: options.retirer || (r.tiers && !r.tiers.actif && !inactifs && prev.lignes.some((t) => t.id === r.tiers?.id && t.actif)) ? Math.max(0, prev.etat.total - 1) : prev.etat.total },
      lignes: options.retirer ? prev.lignes.filter((t) => t.id !== options.retirer) : r.tiers ? prev.lignes.map((t) => (t.id === r.tiers?.id ? r.tiers : t)) : prev.lignes,
    } : prev));
    setErreur('');
    setInfo(`${message}${r.avertissements?.length ? ` ⚠️ ${r.avertissements.join(' ')}` : ''}`);
    setFenetre(null);
    if (options.relire) relireFenetre();
  };
  // Refus sur un état périmé (tiers disparu, dossier archivé entre-temps) : fenêtre fermée, liste relue.
  const refus: Refus = (err) => {
    const s = statutDe(err);
    if (s !== 404 && s !== 409) return false;
    setFenetre(null);
    setInfo('');
    setErreur(messageDossier(err, 'Action impossible : la liste a été relue.', role));
    charger(1);
    return true;
  };

  const agir = async (t: Tiers, action: 'desactiver' | 'reactiver' | 'supprimer') => {
    if (!etat || occupeRef.current) return;
    const un = LIBELLES_TYPE[t.type].un;
    const ok = await confirm(action === 'desactiver'
      ? { title: `Désactiver le ${un} ${t.code} ?`, message: `« ${t.nom} » sortira de la saisie. Rien n'est effacé : vous pourrez le réactiver.`, tone: 'primary', confirmLabel: 'Désactiver', icon: '⏸️' }
      : action === 'reactiver'
        ? { title: `Réactiver le ${un} ${t.code} ?`, message: `« ${t.nom} » redevient disponible pour la saisie.`, tone: 'primary', confirmLabel: 'Réactiver', icon: '▶️' }
        : { title: `Supprimer le ${un} ${t.code} ?`, message: `« ${t.nom} » sera retiré du dossier. Le journal de la comptabilité en garde la trace.`, details: ['Un tiers qui a des écritures ne se supprime pas : il se désactive.'], tone: 'danger', confirmLabel: 'Supprimer' });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const url = `/api/compta/dossiers/${etat.dossier.id}/tiers/${t.id}`;
      const { data } = action === 'supprimer' ? await api.delete(url) : await api.post(`${url}/${action}`);
      appliquer(data as EcritureTiers, action === 'desactiver' ? `${t.typeLibelle} ${t.code} désactivé.` : action === 'reactiver' ? `${t.typeLibelle} ${t.code} réactivé.` : `${t.typeLibelle} ${t.code} supprimé.`, { relire: true, ...(action === 'supprimer' ? { retirer: t.id } : {}) });
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Action impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  const exporter = async () => {
    if (!etat || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    setErreur('');
    try {
      await telechargerTiers(etat.dossier.id, type);
      setInfo(`${L.pluriel.charAt(0).toUpperCase()}${L.pluriel.slice(1)} exportés (Excel).`);
    } catch (err) {
      setErreur(messageDossier(err, 'Export impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  const changerOnglet = (t: TypeTiers) => { if (t !== type) { setType(t); setInfo(''); setErreur(''); } };

  const retour = etat ? { lien: `/dossiers/${etat.dossier.id}`, libelle: etat.dossier.nom } : null;
  const nbF = etat?.nb.fournisseur;
  const nbC = etat?.nb.client;
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📇</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Tiers</h1>
            {etat?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {nbF && nbC
              ? `${pluriel(nbF.actifs, 'fournisseur actif', 'fournisseurs actifs')} · ${pluriel(nbC.actifs, 'client actif', 'clients actifs')}${nbF.total + nbC.total > nbF.actifs + nbC.actifs ? ` · ${pluriel(nbF.total + nbC.total - nbF.actifs - nbC.actifs, 'désactivé', 'désactivés')}` : ''}`
              : 'Les fournisseurs et les clients du dossier : une dimension des écritures sur les comptes collectifs'}
          </p>
        </div>
        <BoutonAide section="compta-tiers" />
      </div>

      {etatPage === 'chargement' && !erreurLecture && <div className="loading-text">Chargement…</div>}
      {erreurLecture && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: lu ? 12 : 0 }}>
          <span>{lu ? 'Impossible de relire les tiers.' : 'Impossible de charger les tiers.'}</span>
          <button type="button" onClick={relireFenetre} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}
      {etatPage === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}

      {etat && etatPage === 'pret' && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etat.etatAbonnement, role)} : les tiers restent consultables mais ne se modifient plus.
            </div>
          )}
          {etat.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : ses tiers ne se modifient pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && dossierActif && !etat.droits.tiers && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter les tiers ; le titulaire et les gérants de niveau Complet ou Saisie les modifient.
            </div>
          )}
          {retenuesInactives > 0 && (
            <div role="status" style={{ ...alerte, background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', marginBottom: 16 }}>
              ⚠️ {retenuesInactives > 1 ? `${retenuesInactives} ${L.pluriel} ont` : `Un ${L.un} a`} une retenue par défaut désactivée (page Taxes) : choisissez-en une autre avec <strong>Modifier</strong>{peutTiers ? '' : ' (titulaire, niveau Complet ou Saisie)'}.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          <div role="tablist" aria-label="Fournisseurs ou clients" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {etat.types.map((t) => {
              const actif = t.valeur === type;
              const nb = etat.nb[t.valeur];
              return (
                <button key={t.valeur} type="button" role="tab" aria-selected={actif} onClick={() => changerOnglet(t.valeur)}
                  style={{ padding: '9px 18px', borderRadius: 12, border: `1.5px solid ${actif ? '#4338ca' : '#e2e8f0'}`, background: actif ? '#eef2ff' : '#fff', color: actif ? '#3730a3' : '#475569', fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer' }}>
                  {t.libelle}s <span style={{ fontWeight: 600, color: actif ? '#4338ca' : '#94a3b8' }}>· {nb.actifs}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (code, nom, matricule)" aria-label={`Rechercher un ${L.un}`} style={{ ...inp, width: 'min(100%, 300px)' }} autoComplete="off" />
            {(etat.nb[type].total > etat.nb[type].actifs || inactifs) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} /> Afficher les désactivés ({etat.nb[type].total - etat.nb[type].actifs})
              </label>
            )}
            <span style={{ flex: 1 }} />
            {peutConfigurer && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'modele' }); }} disabled={occupe || lecture} style={petit('#fff', '#475569', '#cbd5e1')}>🔢 Modèle des codes</button>}
            {peutConfigurer && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'importer' }); }} disabled={occupe || lecture} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>📤 Importer (Excel)</button>}
            <button type="button" onClick={exporter} disabled={occupe || lecture || etat.nb[type].total === 0} style={petit('#f0fdf4', '#166534', '#bbf7d0')}>📥 Exporter (Excel)</button>
            {peutTiers && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'creer' }); }} disabled={occupe || lecture} style={bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent')}>{L.bouton}</button>}
          </div>

          <div style={cadre}>
            <div style={enTeteCadre}>
              <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
                {relecture ? 'Lecture…' : q ? `${pluriel(etat.total, 'résultat', 'résultats')}` : pluriel(etat.total, L.un, L.pluriel)}
              </span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                Modèle des codes : {etat.modele.prefixes[type] || 'aucun préfixe'} + {etat.modele.chiffres} chiffres{etat.modele.prochain[type] ? ` (prochain ${etat.modele.prochain[type]})` : ' (série pleine : changez le modèle)'} · collectif par défaut {typeChoix?.collectifDefaut || '—'}
              </span>
            </div>
            {lignes.length === 0 && !relecture && (
              <p style={{ margin: 0, padding: '16px 18px', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.6 }}>
                {q ? `Aucun ${L.un} ne correspond à cette recherche.` : etat.nb[type].total > 0 ? `Tous les ${L.pluriel} sont désactivés : cochez « Afficher les désactivés ».`
                  : peutTiers ? `Aucun ${L.un} pour l'instant : cliquez sur « ${L.bouton} »${peutConfigurer ? ', ou importez un classeur Excel (« Importer »)' : ''}.` : `Aucun ${L.un} pour l'instant.`}
              </p>
            )}
            <div style={{ opacity: relecture ? 0.6 : 1 }}>
              {lignes.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderTop: '1px solid #f1f5f9', fontSize: '0.84rem', flexWrap: 'wrap', opacity: t.actif ? 1 : 0.6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 320px' }}>
                    <span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b', minWidth: 70 }}>{t.code}</span>
                    <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <span style={{ color: '#0f172a', fontWeight: 600, overflowWrap: 'anywhere' }}>{t.nom}</span>
                      <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b' }}>
                        {t.matriculeFiscal ? <span style={{ fontFamily: mono }}>{t.matriculeFiscal}</span> : t.identifiant ? <span style={{ fontFamily: mono }}>{texteIdentifiant(t.identifiant)}</span> : 'MF non renseigné'}{t.ville ? ` · ${t.ville}` : ''}{t.type === 'fournisseur' && t.regimeFiscalLibelle ? ` · ${t.regimeFiscalLibelle}` : ''}{!t.resident ? ' · non résident' : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b' }}>
                        Compte {t.compte ? texteCompte(t.compte) : '—'} · Retenue {texteRetenue(t.retenue)} · {texteDelai(t.delaiPaiement)}
                        {t.retenue && !t.retenue.actif && <span style={{ ...pastille('#fee2e2', '#991b1b'), marginLeft: 6 }} title="Ce code de retenue a été désactivé (page Taxes) : choisissez-en un autre">Retenue désactivée</span>}
                      </span>
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={pastille('#f1f5f9', '#64748b')}>{t.regimeTvaLibelle}</span>
                    {t.origine === 'import' && <span style={pastille('#eef2ff', '#3730a3')}>Importé</span>}
                    {!t.actif && <span style={pastille('#e2e8f0', '#475569')}>Désactivé</span>}
                  </span>
                  {/* S7a : le lettrage du tiers (lecture pour tout accès ; lettrer : titulaire, Complet, Saisie). */}
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
                    <Link to={`/dossiers/${etat.dossier.id}/lettrage?tiers=${t.id}`} style={{ ...lien, textDecoration: 'none' }} aria-label={`Lettrage de ${t.code}`} title={`Lettrage de ${t.code} : lignes non lettrées, lettres, propositions`}>🔗 Lettrage</Link>
                  </span>
                  {(peutTiers || peutConfigurer) && (
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {peutTiers && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'modifier', tiers: t }); }} disabled={occupe || lecture} style={lien}>Modifier</button>}
                      {peutTiers && t.actif && <button type="button" onClick={() => agir(t, 'desactiver')} disabled={occupe || lecture} style={lien}>Désactiver</button>}
                      {peutTiers && !t.actif && <button type="button" onClick={() => agir(t, 'reactiver')} disabled={occupe || lecture} style={lien}>Réactiver</button>}
                      {peutConfigurer && <button type="button" onClick={() => agir(t, 'supprimer')} disabled={occupe || lecture} style={{ ...lien, color: '#be123c' }}>Supprimer</button>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {!relecture && lignes.length > 0 && lu && lu.lignes.length < etat.total && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <button type="button" onClick={() => { setPlus(true); charger(Math.floor(lu.lignes.length / PAGE_TIERS) + 1); }} disabled={plus || occupe || lecture} style={{ ...bouton('#fff', '#4338ca', '#c7d2fe'), opacity: plus ? 0.7 : 1 }}>
                {plus ? 'Lecture…' : `Afficher plus (${pluriel(etat.total - lu.lignes.length, 'autre', 'autres')})`}
              </button>
            </div>
          )}

          {fenetre?.type === 'creer' && <FenetreTiers etat={etat} type={type} role={role} onClose={() => setFenetre(null)} onEnregistre={(r) => appliquer(r, `${r.tiers?.typeLibelle} ${r.tiers?.code} ajouté.`, { relire: true })} onRefus={refus} />}
          {fenetre?.type === 'modifier' && <FenetreTiers etat={etat} type={fenetre.tiers.type} tiers={fenetre.tiers} role={role} onClose={() => setFenetre(null)} onEnregistre={(r) => appliquer(r, `${r.tiers?.typeLibelle} ${r.tiers?.code} enregistré.`)} onRefus={refus} />}
          {fenetre?.type === 'modele' && <FenetreModele etat={etat} role={role} onClose={() => setFenetre(null)} onEnregistre={(r) => appliquer(r, 'Modèle des codes enregistré : les codes déjà attribués n\'ont pas changé.')} onRefus={refus} />}
          {fenetre?.type === 'importer' && (
            <FenetreImport titre={`Importer des ${L.pluriel} (Excel)`} sousTitre={etat.dossier.nom} role={role} onClose={() => setFenetre(null)} onRefus={refus}
              aide={`Une ligne par ${L.un} : code en première colonne (vide = généré d'après le modèle), nom, matricule fiscal, adresse, ville, téléphone, email, compte collectif par son numéro (vide = ${typeChoix?.collectifDefaut || 'à indiquer'}), régime de TVA en toutes lettres, retenue par défaut par son code (page Taxes), délai de paiement en jours. Seul le nom est obligatoire ; ${etat.importMax.toLocaleString('fr-FR')} lignes au plus.`}
              telechargerModele={() => telechargerModeleTiers(etat.dossier.id, type)}
              importer={async (f) => {
                const r = await importerTiers(etat.dossier.id, type, f);
                appliquer({ nb: r.nb, modele: r.modele, avertissements: r.avertissements }, `${pluriel(r.importes, `${L.un} importé`, `${L.pluriel} importés`)}${r.codesGeneres ? ` (${pluriel(r.codesGeneres, 'code généré', 'codes générés')})` : ''}.`, { relire: true });
              }} />
          )}
        </>
      )}
    </div>
  );
}

interface PropsFenetre { etat: TiersReponse; role: Role; onClose: () => void; onEnregistre: (r: EcritureTiers) => void; onRefus: Refus }

// Ajouter un tiers (code vide = généré, compte collectif par défaut présélectionné) ou modifier un tiers existant (seuls
// les champs changés sont envoyés ; le code aussi, tant que le tiers n'a pas d'écriture). Le serveur revérifie tout.
function FenetreTiers({ etat, type, tiers, role, onClose, onEnregistre, onRefus }: PropsFenetre & { type: TypeTiers; tiers?: Tiers }) {
  const creation = !tiers;
  const L = LIBELLES_TYPE[type];
  const typeChoix = etat.types.find((x) => x.valeur === type);
  const collectifs = useMemo(() => etat.collectifs.filter((c) => c.nature === typeChoix?.nature), [etat.collectifs, typeChoix?.nature]);
  const defaut = useMemo(() => collectifs.find((c) => c.numero === typeChoix?.collectifDefaut) || null, [collectifs, typeChoix?.collectifDefaut]);
  // Retenues proposées : les actives, plus celle du tiers si elle a été désactivée (gardée telle quelle, marquée).
  const retenues = useMemo(() => {
    const liste = etat.retenues.filter((x) => x.actif);
    if (tiers?.retenue && !tiers.retenue.actif && !liste.some((x) => x.id === tiers.retenue?.id)) liste.push(tiers.retenue);
    return liste;
  }, [etat.retenues, tiers]);
  const [code, setCode] = useState(tiers?.code || '');
  const [nom, setNom] = useState(tiers?.nom || '');
  const [matricule, setMatricule] = useState(tiers?.matriculeFiscal || '');
  const [adresse, setAdresse] = useState(tiers?.adresse || '');
  const [ville, setVille] = useState(tiers?.ville || '');
  const [telephone, setTelephone] = useState(tiers?.telephone || '');
  const [email, setEmail] = useState(tiers?.email || '');
  const [compteId, setCompteId] = useState<number | null>(tiers ? (tiers.compte?.id ?? null) : (defaut?.id ?? null));
  const [regime, setRegime] = useState<RegimeTvaTiers>(tiers?.regimeTva || 'assujetti');
  const [retenueId, setRetenueId] = useState<number | null>(tiers?.retenue?.id ?? null);
  const [delai, setDelai] = useState(tiers ? String(tiers.delaiPaiement) : '');
  // S7b : régime fiscal, résidence, identifiant de secours (fournisseurs).
  const [regimeFiscal, setRegimeFiscal] = useState(tiers?.regimeFiscal || '');
  const [resident, setResident] = useState(tiers ? tiers.resident : true);
  const [idType, setIdType] = useState<TypeIdentifiant | ''>(tiers?.identifiant?.type || '');
  const [idNumero, setIdNumero] = useState(tiers?.identifiant?.numero || '');
  const [idNaissance, setIdNaissance] = useState(tiers?.identifiant?.naissance || '');
  const [idPays, setIdPays] = useState(tiers?.identifiant?.pays || '');
  const [noteRetenue, setNoteRetenue] = useState('');
  const fournisseur = type === 'fournisseur';
  const regimeChoisi = etat.regimesFiscaux.find((r) => r.valeur === regimeFiscal);
  // Changer de régime propose la retenue par défaut de la même famille (achats ou honoraires) ; elle reste modifiable.
  const choisirRegime = (v: string) => {
    setRegimeFiscal(v);
    setErreur(null);
    const regime = etat.regimesFiscaux.find((r) => r.valeur === v);
    const actuel = retenues.find((x) => x.id === retenueId)?.code ?? null;
    const proposee = retenueProposee(regime, actuel, etat.familles);
    if (proposee && proposee.id !== retenueId) { setRetenueId(proposee.id); setNoteRetenue(`Retenue par défaut proposée d'après le régime : ${texteRetenue({ id: proposee.id, code: proposee.code, libelle: '', taux: proposee.taux, actif: true })}.`); } else setNoteRetenue('');
  };
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const poser = <T,>(f: (v: T) => void) => (v: T) => { f(v); setErreur(null); };
  const enregistrer = async () => {
    if (envoi) return;
    const c = code.trim().toUpperCase();
    const e = controlerCodeTiers(c, etat.code);
    if (e) { setErreur(e); return; }
    if (!creation && !c) { setErreur('Indiquez le code (il ne peut pas être vide en modification).'); return; }
    if (!nom.trim()) { setErreur(`Indiquez le nom du ${L.un}.`); return; }
    if (!compteId) { setErreur('Choisissez le compte collectif.'); return; }
    const d = delai.trim() || '0';
    if (!/^\d{1,3}$/.test(d) || Number(d) > etat.delaiMax) { setErreur(`Le délai de paiement est un nombre de jours de 0 à ${etat.delaiMax}.`); return; }
    // S7b : l'identifiant de secours (numéro en majuscules ; CIN : 8 chiffres ; pays : deux lettres) — le serveur revérifie.
    const numeroId = idType === 'cin' ? idNumero.replace(/\s/g, '') : idNumero.trim().toUpperCase();
    if (idType && !numeroId) { setErreur('Indiquez le numéro de l\'identifiant, ou choisissez « Aucun ».'); return; }
    if (idType === 'cin' && !/^\d{8}$/.test(numeroId)) { setErreur('Le numéro de CIN a 8 chiffres.'); return; }
    if (idType && idPays.trim() && !/^[A-Za-z]{2}$/.test(idPays.trim())) { setErreur('Le pays se note en deux lettres (TN, FR, DZ…).'); return; }
    const identifiant = idType ? { type: idType, numero: numeroId, naissance: idNaissance || null, pays: idPays.trim().toUpperCase() || null } : null;
    type Valeur = string | number | boolean | null | { type: string; numero: string; naissance: string | null; pays: string | null };
    const tout: Record<string, Valeur> = { code: c, nom: nom.trim(), matriculeFiscal: matricule.trim(), adresse: adresse.trim(), ville: ville.trim(), telephone: telephone.trim(), email: email.trim(), compteId, regimeTva: regime, retenueId, delaiPaiement: Number(d), regimeFiscal: regimeFiscal || null, resident, identifiant };
    let corps: Record<string, Valeur> = { ...tout, type };
    if (!creation) {
      const avant: Record<string, Valeur> = {
        code: tiers.code, nom: tiers.nom, matriculeFiscal: tiers.matriculeFiscal || '', adresse: tiers.adresse || '', ville: tiers.ville || '', telephone: tiers.telephone || '', email: tiers.email || '', compteId: tiers.compte?.id ?? null, regimeTva: tiers.regimeTva, retenueId: tiers.retenue?.id ?? null, delaiPaiement: tiers.delaiPaiement,
        regimeFiscal: tiers.regimeFiscal, resident: tiers.resident, identifiant: tiers.identifiant ? { type: tiers.identifiant.type, numero: tiers.identifiant.numero, naissance: tiers.identifiant.naissance, pays: tiers.identifiant.pays } : null,
      };
      corps = Object.fromEntries(Object.entries(tout).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(avant[k])));
      if (!Object.keys(corps).length) { onClose(); return; }
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const url = `/api/compta/dossiers/${etat.dossier.id}/tiers`;
      const { data } = creation ? await api.post(url, corps) : await api.put(`${url}/${tiers.id}`, corps);
      onEnregistre(data as EcritureTiers);
    } catch (err) {
      // Un code pris entre-temps, un compte ou une retenue désactivés, pas de collectif par défaut : à corriger dans la fenêtre.
      if (!CORRIGEABLES.includes(codeDe(err) || '') && onRefus(err)) return;
      setErreur(messageDossier(err, `Le ${L.un} n'a pas pu être enregistré — réessayez.`, role));
      setEnvoi(false);
    }
  };
  const prochain = etat.modele.prochain[type];
  return (
    <Modale titre={creation ? `Ajouter un ${L.un}` : `Modifier le ${L.un} ${tiers.code}`} sousTitre={creation ? `Code vide = généré d'après le modèle du dossier${prochain ? ` (${prochain})` : ''} ; seul le nom est obligatoire` : `${tiers.nom}${tiers.origine === 'import' ? ' · importé' : ''}`}
      onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur} libelleEnvoi={creation ? `✓ Ajouter le ${L.un}` : '✓ Enregistrer'} large>
      <div style={grille}>
        <div>
          <label htmlFor="ft-code" style={lbl}>Code</label>
          <input id="ft-code" value={code} onChange={(e) => poser(setCode)(e.target.value.toUpperCase())} disabled={envoi} maxLength={etat.code.max} placeholder={creation ? (prochain ? `${prochain} (généré)` : 'Série pleine : saisissez-le') : ''} style={{ ...inp, fontFamily: mono, fontWeight: 700, textTransform: 'uppercase' }} autoFocus={!creation} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label htmlFor="ft-nom" style={lbl}>Nom</label>
          <input id="ft-nom" value={nom} onChange={(e) => poser(setNom)(e.target.value)} disabled={envoi} maxLength={255} placeholder={type === 'fournisseur' ? 'ex. Société Tunisienne de Boissons' : 'ex. Voyages Méditerranée'} style={inp} autoFocus={creation} />
        </div>
        <div>
          <label htmlFor="ft-mf" style={lbl}>Matricule fiscal</label>
          <input id="ft-mf" value={matricule} onChange={(e) => poser(setMatricule)(e.target.value)} disabled={envoi} maxLength={50} placeholder="1234567A/A/M/000" style={{ ...inp, fontFamily: mono }} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label htmlFor="ft-adresse" style={lbl}>Adresse</label>
          <input id="ft-adresse" value={adresse} onChange={(e) => poser(setAdresse)(e.target.value)} disabled={envoi} maxLength={300} style={inp} />
        </div>
        <div>
          <label htmlFor="ft-ville" style={lbl}>Ville</label>
          <input id="ft-ville" value={ville} onChange={(e) => poser(setVille)(e.target.value)} disabled={envoi} maxLength={120} style={inp} />
        </div>
        <div>
          <label htmlFor="ft-tel" style={lbl}>Téléphone</label>
          <input id="ft-tel" value={telephone} onChange={(e) => poser(setTelephone)(e.target.value)} disabled={envoi} maxLength={30} style={inp} />
        </div>
        <div>
          <label htmlFor="ft-email" style={lbl}>Email</label>
          <input id="ft-email" type="email" value={email} onChange={(e) => poser(setEmail)(e.target.value)} disabled={envoi} maxLength={255} style={inp} />
        </div>
      </div>
      <ChoixCompte id="ft-collectif" libelle={`Compte collectif (nature ${typeChoix?.natureLibelle.toLowerCase() || L.pluriel})`} comptes={collectifs} valeur={compteId} onChange={poser(setCompteId)} disabled={envoi}
        aide={`${typeChoix?.collectifDefaut || '—'} par défaut ; tout compte actif de même nature convient (${type === 'fournisseur' ? '404 pour un fournisseur d\'immobilisations' : '416 pour un client douteux'}, par exemple).`} />
      <div style={grille}>
        <div>
          <label htmlFor="ft-regime" style={lbl}>Régime de TVA</label>
          <select id="ft-regime" value={regime} onChange={(e) => poser(setRegime)(e.target.value as RegimeTvaTiers)} disabled={envoi} style={inp}>
            {etat.regimes.map((r) => <option key={r.valeur} value={r.valeur}>{r.libelle}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ft-retenue" style={lbl}>Retenue par défaut</label>
          <select id="ft-retenue" value={retenueId ?? ''} onChange={(e) => { poser(setRetenueId)(e.target.value ? Number(e.target.value) : null); setNoteRetenue(''); }} disabled={envoi} style={inp}>
            <option value="">Aucune</option>
            {retenues.map((x) => <option key={x.id} value={x.id}>{texteRetenue(x)}{x.actif ? '' : ' — désactivée'}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ft-delai" style={lbl}>Délai de paiement (jours)</label>
          <input id="ft-delai" inputMode="numeric" value={delai} onChange={(e) => poser(setDelai)(e.target.value)} disabled={envoi} maxLength={3} placeholder="0 = comptant" style={inp} />
        </div>
      </div>
      {fournisseur && (
        <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', margin: '4px 0 10px' }}>
          <legend style={{ ...lbl, padding: '0 6px', marginBottom: 0 }}>Fiscalité — retenues et certificats TEJ</legend>
          <div style={grille}>
            <div style={{ gridColumn: 'span 2' }}>
              <label htmlFor="ft-regime-fiscal" style={lbl}>Régime fiscal</label>
              <select id="ft-regime-fiscal" value={regimeFiscal} onChange={(e) => choisirRegime(e.target.value)} disabled={envoi} style={inp}>
                <option value="">Non renseigné</option>
                {etat.regimesFiscaux.map((r) => <option key={r.valeur} value={r.valeur}>{r.libelle}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#334155', fontWeight: 600, cursor: 'pointer', alignSelf: 'end', paddingBottom: 10 }}>
              <input type="checkbox" checked={resident} onChange={(e) => poser(setResident)(e.target.checked)} disabled={envoi} /> Résident en Tunisie
            </label>
          </div>
          {regimeChoisi && <p style={{ margin: '-4px 0 8px', fontSize: '0.74rem', color: '#64748b' }}>Retenue proposée : achats {regimeChoisi.retenues.achats ? texteRetenue({ ...regimeChoisi.retenues.achats, libelle: '', actif: true }) : '—'} · honoraires {regimeChoisi.retenues.honoraires ? texteRetenue({ ...regimeChoisi.retenues.honoraires, libelle: '', actif: true }) : '—'} · catégorie {regimeChoisi.personne === 'morale' ? 'personne morale (PM)' : 'personne physique (PP)'}{regimeChoisi.note ? ` — ${regimeChoisi.note}` : ''}</p>}
          {noteRetenue && <p role="status" style={{ margin: '-4px 0 8px', fontSize: '0.76rem', color: '#166534', fontWeight: 600 }}>{noteRetenue}</p>}
          <div style={grille}>
            <div>
              <label htmlFor="ft-id-type" style={lbl}>Identifiant de secours</label>
              <select id="ft-id-type" value={idType} onChange={(e) => poser(setIdType)(e.target.value as TypeIdentifiant | '')} disabled={envoi} style={inp}>
                <option value="">Aucun</option>
                {etat.typesIdentifiant.map((x) => <option key={x.valeur} value={x.valeur}>{x.libelle}</option>)}
              </select>
            </div>
            {idType && (
              <>
                <div>
                  <label htmlFor="ft-id-numero" style={lbl}>Numéro</label>
                  <input id="ft-id-numero" value={idNumero} onChange={(e) => poser(setIdNumero)(e.target.value)} disabled={envoi} maxLength={30} placeholder={idType === 'cin' ? '8 chiffres' : ''} style={{ ...inp, fontFamily: mono }} />
                </div>
                {idType !== 'autre' && (
                  <div>
                    <label htmlFor="ft-id-naissance" style={lbl}>Date de naissance</label>
                    <input id="ft-id-naissance" type="date" value={idNaissance} onChange={(e) => poser(setIdNaissance)(e.target.value)} disabled={envoi} style={inp} />
                  </div>
                )}
                {idType !== 'cin' && (
                  <div>
                    <label htmlFor="ft-id-pays" style={lbl}>Pays (2 lettres)</label>
                    <input id="ft-id-pays" value={idPays} onChange={(e) => poser(setIdPays)(e.target.value.toUpperCase())} disabled={envoi} maxLength={2} placeholder="FR" style={{ ...inp, fontFamily: mono, textTransform: 'uppercase' }} />
                  </div>
                )}
              </>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b', lineHeight: 1.5 }}>
            Pour un certificat de retenue, la plateforme TEJ exige : le matricule fiscal avec sa lettre de clé (à défaut, l'identifiant de secours : CIN de 8 chiffres et date de naissance ; passeport ou carte de séjour avec date de naissance et pays ; autre identifiant avec pays), le régime fiscal, l'adresse, l'email et le téléphone.
          </p>
        </fieldset>
      )}
      <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
        {creation
          ? `Le code a de ${etat.code.min} à ${etat.code.max} lettres ou chiffres et reste unique parmi les ${L.pluriel} du dossier. Un matricule déjà porté par un autre tiers est signalé, jamais refusé. La retenue par défaut sera proposée à la saisie, jamais imposée.`
          : 'Le code change tant que le tiers n\'a pas d\'écriture. Le type (fournisseur ou client) ne change pas : créez un autre tiers s\'il le faut.'}
      </p>
    </Modale>
  );
}

// Le modèle des codes du dossier : préfixe des fournisseurs, préfixe des clients, nombre de chiffres ; les codes déjà
// attribués ne changent pas (le serveur rend les prochains codes).
function FenetreModele({ etat, role, onClose, onEnregistre, onRefus }: PropsFenetre) {
  const [pf, setPf] = useState(etat.modele.prefixes.fournisseur);
  const [pc, setPc] = useState(etat.modele.prefixes.client);
  const [chiffres, setChiffres] = useState(String(etat.modele.chiffres));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const n = Number(chiffres);
  const enregistrer = async () => {
    if (envoi) return;
    for (const [p, quoi] of [[pf, 'Préfixe des fournisseurs'], [pc, 'Préfixe des clients']] as const) {
      const e = controlerPrefixe(p, etat.code.prefixeMax);
      if (e) { setErreur(`${quoi} : ${e.charAt(0).toLowerCase()}${e.slice(1)}`); return; }
    }
    const corps: Record<string, string | number> = {};
    if (pf.trim().toUpperCase() !== etat.modele.prefixes.fournisseur) corps.prefixeFournisseur = pf.trim().toUpperCase();
    if (pc.trim().toUpperCase() !== etat.modele.prefixes.client) corps.prefixeClient = pc.trim().toUpperCase();
    if (n !== etat.modele.chiffres) corps.chiffres = n;
    if (!Object.keys(corps).length) { onClose(); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const { data } = await api.put(`/api/compta/dossiers/${etat.dossier.id}/tiers/modele`, corps);
      onEnregistre(data as EcritureTiers);
    } catch (err) {
      if (onRefus(err)) return;
      setErreur(messageDossier(err, 'Le modèle n\'a pas pu être enregistré — réessayez.', role));
      setEnvoi(false);
    }
  };
  const choixChiffres = Array.from({ length: etat.code.chiffresMax - etat.code.chiffresMin + 1 }, (_, i) => etat.code.chiffresMin + i);
  return (
    <Modale titre="Modèle des codes de tiers" sousTitre="Un code = un préfixe + un numéro qui s'incrémente ; les codes déjà attribués ne changent pas" onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur}>
      <div style={grille}>
        <div>
          <label htmlFor="fm-pf" style={lbl}>Préfixe des fournisseurs</label>
          <input id="fm-pf" value={pf} onChange={(e) => { setPf(e.target.value.toUpperCase()); setErreur(null); }} disabled={envoi} maxLength={etat.code.prefixeMax} placeholder="F" style={{ ...inp, fontFamily: mono, fontWeight: 700, textTransform: 'uppercase' }} autoFocus />
        </div>
        <div>
          <label htmlFor="fm-pc" style={lbl}>Préfixe des clients</label>
          <input id="fm-pc" value={pc} onChange={(e) => { setPc(e.target.value.toUpperCase()); setErreur(null); }} disabled={envoi} maxLength={etat.code.prefixeMax} placeholder="C" style={{ ...inp, fontFamily: mono, fontWeight: 700, textTransform: 'uppercase' }} />
        </div>
        <div>
          <label htmlFor="fm-chiffres" style={lbl}>Nombre de chiffres</label>
          <select id="fm-chiffres" value={chiffres} onChange={(e) => { setChiffres(e.target.value); setErreur(null); }} disabled={envoi} style={inp}>
            {choixChiffres.map((x) => <option key={x} value={String(x)}>{x}</option>)}
          </select>
        </div>
      </div>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#0f172a' }}>
        Exemples : <span style={{ fontFamily: mono, fontWeight: 800 }}>{exempleCode(pf, n)}</span> (fournisseur), <span style={{ fontFamily: mono, fontWeight: 800 }}>{exempleCode(pc, n)}</span> (client).
        <span style={{ display: 'block', color: '#64748b', fontSize: '0.76rem', marginTop: 4 }}>Préfixe de 0 à {etat.code.prefixeMax} lettres ou chiffres (vide : codes tout en chiffres), {etat.code.chiffresMin} à {etat.code.chiffresMax} chiffres. Un cabinet qui code 401001 règle « 401 » + 3 chiffres.</span>
      </div>
    </Modale>
  );
}

const grille: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 };
const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
