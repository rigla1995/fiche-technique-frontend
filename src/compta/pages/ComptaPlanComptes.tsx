import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { Modale } from '../DossierFormulaires';
import { FenetreImport } from '../FenetreImport';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { CLASSES, controlerNumero, correspond, enfantsParParent, importerPlan, lirePlan, normaliser, numeroPropose, telechargerModelePlan, telechargerPlan, type Compte, type PlanReponse } from '../plan';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Plan de comptes » (LabFlow Compta, étape S5a ; labflow-reprise/achats-compta/PLAN-S5.md §2) : l'arbre des comptes
// d'un dossier, copié du paquet pays (NC 01) puis adapté — sept classes dépliables, recherche, subdiviser, renommer
// (et rétablir le libellé de la norme), désactiver / réactiver, supprimer un compte ajouté, export Excel. Les droits
// viennent du serveur (réponse 6 du 07/10 : Complet configure ; Saisie et Consultation lisent) ; un dossier archivé ou
// une comptabilité non active se consultent sans rien changer. Chaque écriture rend l'arbre entier, que la page
// remplace ; un refus sur un état périmé (404, 409) ferme la fenêtre et relit (convention de S3c).
// S5c : « Importer (Excel) » — le plan d'un autre logiciel, en tout-ou-rien (FenetreImport).
type Fenetre = { type: 'subdiviser'; compte: Compte } | { type: 'modifier'; compte: Compte } | { type: 'importer' } | null;
type Role = 'titulaire' | 'gerant';
type Refus = (err: unknown) => boolean;
type Ligne = { c: Compte; profondeur: number };

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaPlanComptesPage() {
  const { dossierId } = useParams();
  return <ComptaPlanComptes key={dossierId} dossierId={dossierId} />;
}

function ComptaPlanComptes({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [plan, setPlan] = useState<PlanReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [recherche, setRecherche] = useState('');
  const [desactives, setDesactives] = useState(false);
  // Classes (« c4 ») et comptes (« n12 ») dépliés.
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set());
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);

  // Lectures numérotées : une lecture partie avant la dernière réponse reçue ne l'écrase jamais.
  const tour = useRef(0);
  const charger = useCallback(() => {
    const moi = ++tour.current;
    lirePlan(dossierId || '')
      .then((p) => { if (moi === tour.current) { setPlan(p); setEtat('pret'); } })
      .catch((err) => { if (moi === tour.current) setEtat(statutDe(err) === 404 ? 'introuvable' : 'erreur'); });
  }, [dossierId]);
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);

  const role: Role = plan?.dossier.espace.role || 'titulaire';
  const ouvert = !!plan && plan.etatAbonnement === 'actif';
  const modifiable = !!plan && plan.droits.configurer && plan.dossier.etat === 'actif' && ouvert;
  const comptes = useMemo(() => plan?.comptes || [], [plan]);
  const enfants = useMemo(() => enfantsParParent(comptes), [comptes]);
  const parId = useMemo(() => new Map(comptes.map((c) => [c.id, c])), [comptes]);
  const natures = useMemo(() => new Map((plan?.natures || []).map((n) => [n.valeur, n.libelle])), [plan]);
  // Comptes actifs par classe (en-têtes) et libellés normalisés (recherche) : calculés une fois par plan, pas à chaque frappe.
  const nbParClasse = useMemo(() => comptes.reduce((a, c) => { if (c.actif) a[c.classe] = (a[c.classe] || 0) + 1; return a; }, {} as Record<number, number>), [comptes]);
  const libellesNormalises = useMemo(() => new Map(comptes.map((c) => [c.id, normaliser(c.libelle)])), [comptes]);
  const q = recherche.trim();
  const resultats = useMemo(() => (q ? comptes.filter((c) => (desactives || c.actif) && correspond(c, q, libellesNormalises.get(c.id))) : []), [comptes, q, desactives, libellesNormalises]);

  // Nature affichée quand elle n'est pas celle du parent (les ruptures ; les comptes à 2 chiffres toujours).
  const natureAffichee = (c: Compte) => {
    const parent = c.parentId == null ? null : parId.get(c.parentId);
    return !parent || parent.nature !== c.nature ? natures.get(c.nature) || c.nature : null;
  };
  // Un compte ne se réactive que sous un parent actif : le bouton n'est pas proposé sinon (le serveur refuserait).
  const parentActif = (c: Compte) => (c.parentId == null ? true : (parId.get(c.parentId)?.actif ?? true));
  // Lignes visibles d'une classe : parcours des comptes dépliés, désactivés sur demande.
  const lignesDe = (classe: number): Ligne[] => {
    const out: Ligne[] = [];
    const visiter = (liste: Compte[], profondeur: number) => {
      for (const c of liste) {
        if (!desactives && !c.actif) continue;
        out.push({ c, profondeur });
        if (ouverts.has(`n${c.id}`)) visiter(enfants.get(c.id) || [], profondeur + 1);
      }
    };
    visiter((enfants.get(null) || []).filter((c) => c.classe === classe), 0);
    return out;
  };
  const basculer = (cle: string) => setOuverts((prev) => { const n = new Set(prev); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  // Le chemin d'un compte (sa classe, ses ancêtres) : déplié après un ajout, pour le voir.
  const cheminDe = (c: Compte): string[] => {
    const cles = [`c${c.classe}`];
    let p = c.parentId;
    while (p != null) { cles.push(`n${p}`); p = parId.get(p)?.parentId ?? null; }
    return cles;
  };

  // Plan renvoyé par une écriture : affiché tel quel.
  const appliquer = (p: PlanReponse, message: string, deplier: string[] = []) => {
    tour.current += 1;
    setPlan(p);
    setErreur('');
    setInfo(message);
    setFenetre(null);
    if (deplier.length) setOuverts((prev) => new Set([...prev, ...deplier]));
  };
  // Refus sur un état périmé (compte disparu, dossier archivé entre-temps) : fenêtre fermée, plan relu.
  const refus: Refus = (err) => {
    const s = statutDe(err);
    if (s !== 404 && s !== 409) return false;
    setFenetre(null);
    setInfo('');
    setErreur(messageDossier(err, 'Action impossible : le plan a été relu.', role));
    charger();
    return true;
  };

  const agir = async (c: Compte, type: 'desactiver' | 'reactiver' | 'supprimer') => {
    if (!plan || occupeRef.current) return;
    const ok = await confirm(type === 'desactiver'
      ? { title: `Désactiver le compte ${c.numero} ?`, message: `« ${c.libelle} » sortira de la saisie. Rien n'est effacé : vous pourrez le réactiver.`, tone: 'primary', confirmLabel: 'Désactiver', icon: '⏸️' }
      : type === 'reactiver'
        ? { title: `Réactiver le compte ${c.numero} ?`, message: `« ${c.libelle} » redevient disponible pour la saisie.`, tone: 'primary', confirmLabel: 'Réactiver', icon: '▶️' }
        : { title: `Supprimer le compte ${c.numero} ?`, message: `« ${c.libelle} » sera retiré du plan. Le journal de la comptabilité en garde la trace.`, details: ['Un compte de la norme ne se supprime jamais : il se désactive.'], tone: 'danger', confirmLabel: 'Supprimer' });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const url = `/api/compta/dossiers/${plan.dossier.id}/plan/comptes/${c.id}`;
      const { data } = type === 'supprimer' ? await api.delete(url) : await api.post(`${url}/${type}`);
      appliquer(data as PlanReponse, type === 'desactiver' ? `Compte ${c.numero} désactivé.` : type === 'reactiver' ? `Compte ${c.numero} réactivé.` : `Compte ${c.numero} supprimé.`);
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Action impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  const exporter = async () => {
    if (!plan || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    setErreur('');
    try {
      await telechargerPlan(plan.dossier.id, plan.dossier.nom);
      setInfo('Plan de comptes exporté (Excel).');
    } catch (err) {
      setErreur(messageDossier(err, 'Export impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };

  const retour = plan ? { lien: `/dossiers/${plan.dossier.id}`, libelle: plan.dossier.nom } : null;
  const actions = (c: Compte) => ({
    modifiable,
    occupe,
    parentActif: parentActif(c),
    onSubdiviser: () => { setInfo(''); setFenetre({ type: 'subdiviser', compte: c }); },
    onModifier: () => { setInfo(''); setFenetre({ type: 'modifier', compte: c }); },
    onDesactiver: () => agir(c, 'desactiver'),
    onReactiver: () => agir(c, 'reactiver'),
    onSupprimer: () => agir(c, 'supprimer'),
  });

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📑</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Plan de comptes</h1>
            {plan?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {plan ? `${plan.paquet ? `${plan.paquet.libelle} · ` : ''}${plan.nb.actifs} compte${plan.nb.actifs > 1 ? 's' : ''} actif${plan.nb.actifs > 1 ? 's' : ''}${plan.nb.ajoutes ? ` · ${plan.nb.ajoutes} ajouté${plan.nb.ajoutes > 1 ? 's' : ''}` : ''}${plan.nb.desactives ? ` · ${plan.nb.desactives} désactivé${plan.nb.desactives > 1 ? 's' : ''}` : ''}` : 'Les comptes sur lesquels les écritures du dossier seront passées'}
          </p>
        </div>
        <BoutonAide section="compta-plan-comptes" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger le plan de comptes.</span>
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

      {etat === 'pret' && plan && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(plan.etatAbonnement, role)} : le plan reste consultable mais ne se modifie plus.
            </div>
          )}
          {plan.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : son plan ne se modifie pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && plan.dossier.etat === 'actif' && !plan.droits.configurer && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter le plan ; le titulaire et les gérants de niveau Complet le modifient.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (numéro ou libellé)" aria-label="Rechercher un compte" style={{ ...inp, width: 'min(100%, 320px)' }} />
            {(plan.nb.desactives > 0 || desactives) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={desactives} onChange={(e) => setDesactives(e.target.checked)} /> Afficher les désactivés{plan.nb.desactives ? ` (${plan.nb.desactives})` : ''}
              </label>
            )}
            <span style={{ flex: 1 }} />
            {modifiable && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'importer' }); }} disabled={occupe} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>📤 Importer (Excel)</button>}
            <button type="button" onClick={exporter} disabled={occupe} style={petit('#f0fdf4', '#166534', '#bbf7d0')}>📥 Exporter (Excel)</button>
          </div>

          {q ? (
            <div style={cadre}>
              <div style={enTeteCadre}>
                <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>{resultats.length === 0 ? 'Aucun compte ne correspond' : `${resultats.length} compte${resultats.length > 1 ? 's' : ''} trouvé${resultats.length > 1 ? 's' : ''}`}</span>
                <button type="button" onClick={() => setRecherche('')} style={petit('#fff', '#475569', '#cbd5e1')}>Effacer la recherche</button>
              </div>
              {resultats.slice(0, 200).map((c) => (
                <LigneCompte key={c.id} c={c} profondeur={0} aEnfants={false} ouvert={false} onBasculer={() => {}} nature={natures.get(c.nature) || c.nature} chemin={CLASSES.find((k) => k.numero === c.classe)?.libelle || ''} {...actions(c)} />
              ))}
              {resultats.length > 200 && <p style={{ margin: 0, padding: '10px 18px', fontSize: '0.78rem', color: '#64748b' }}>Les 200 premiers sont affichés : précisez la recherche.</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CLASSES.map((k) => {
                const cle = `c${k.numero}`;
                const deplie = ouverts.has(cle);
                const nb = nbParClasse[k.numero] || 0;
                return (
                  <div key={k.numero} style={cadre}>
                    <button type="button" onClick={() => basculer(cle)} aria-expanded={deplie} style={{ ...enTeteCadre, width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ color: '#4338ca', fontSize: '0.8rem', width: 12 }}>{deplie ? '▾' : '▸'}</span>
                        <span style={{ fontWeight: 900, color: '#1e1b4b', fontFamily: 'ui-monospace, monospace' }}>Classe {k.numero}</span>
                        <span style={{ fontWeight: 700, color: '#1e1b4b', fontSize: '0.92rem', overflowWrap: 'anywhere' }}>{k.libelle}</span>
                      </span>
                      <span style={{ fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap' }}>{nb} compte{nb > 1 ? 's' : ''} actif{nb > 1 ? 's' : ''}</span>
                    </button>
                    {deplie && lignesDe(k.numero).map(({ c, profondeur }) => (
                      <LigneCompte key={c.id} c={c} profondeur={profondeur} aEnfants={(enfants.get(c.id) || []).some((e) => desactives || e.actif)} ouvert={ouverts.has(`n${c.id}`)} onBasculer={() => basculer(`n${c.id}`)} nature={natureAffichee(c)} {...actions(c)} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {fenetre?.type === 'subdiviser' && <FenetreSubdiviser plan={plan} parent={fenetre.compte} role={role} onClose={() => setFenetre(null)} onEnregistre={(p, numero) => { const nouveau = p.comptes.find((c) => c.numero === numero); appliquer(p, `Compte ${numero} ajouté.`, nouveau ? cheminDe(nouveau) : []); }} onRefus={refus} />}
          {fenetre?.type === 'modifier' && <FenetreModifier plan={plan} compte={fenetre.compte} role={role} onClose={() => setFenetre(null)} onEnregistre={(p) => appliquer(p, `Compte ${fenetre.compte.numero} enregistré.`)} onRefus={refus} />}
          {fenetre?.type === 'importer' && (
            <FenetreImport titre="Importer un plan de comptes (Excel)" sousTitre={plan.dossier.nom} role={role} onClose={() => setFenetre(null)} onRefus={refus}
              aide={`Une ligne par compte : numéro (${plan.numero.min} à ${plan.numero.max} chiffres), libellé, nature facultative (Banque, Caisse, Fournisseurs…). Un numéro déjà dans le plan est renommé ; un numéro inconnu est ajouté sous le compte dont il prolonge le numéro, nature héritée sauf indication. L'import ne désactive ni ne supprime jamais un compte.`}
              telechargerModele={() => telechargerModelePlan(plan.dossier.id)}
              importer={async (f) => {
                const p = await importerPlan(plan.dossier.id, f);
                const n = (x: number, un: string, des: string) => `${x} ${x > 1 ? des : un}`;
                appliquer(p, `Plan importé (${p.importation.fichier}) : ${n(p.importation.renommes, 'compte renommé', 'comptes renommés')}, ${n(p.importation.ajoutes, 'ajouté', 'ajoutés')}, ${n(p.importation.inchanges, 'inchangé', 'inchangés')}.`);
              }} />
          )}
        </>
      )}
    </div>
  );
}

// Une ligne de l'arbre (ou d'une recherche : `chemin` = sa classe) : numéro, libellé, mentions, nature quand elle
// change, actions selon les droits. Un compte « feuille » (sans sous-compte actif) recevra des écritures : point discret.
// L'indentation est un retrait de la ligne entière (relecture : sur téléphone, un libellé qui passe à la ligne garde sa
// place dans l'arbre) ; désactiver n'est proposé que sans sous-compte actif, réactiver que sous un parent actif.
function LigneCompte({ c, profondeur, aEnfants, ouvert, onBasculer, nature, chemin, modifiable, occupe, parentActif, onSubdiviser, onModifier, onDesactiver, onReactiver, onSupprimer }: {
  c: Compte; profondeur: number; aEnfants: boolean; ouvert: boolean; onBasculer: () => void; nature: string | null; chemin?: string;
  modifiable: boolean; occupe: boolean; parentActif: boolean; onSubdiviser: () => void; onModifier: () => void; onDesactiver: () => void; onReactiver: () => void; onSupprimer: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `7px 18px 7px ${14 + profondeur * 18}px`, borderTop: '1px solid #f1f5f9', fontSize: '0.84rem', flexWrap: 'wrap', opacity: c.actif ? 1 : 0.6 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 220px' }}>
        {aEnfants
          ? <button type="button" onClick={onBasculer} aria-expanded={ouvert} aria-label={ouvert ? `Replier ${c.numero}` : `Déplier ${c.numero}`} style={{ width: 24, height: 24, flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontSize: '0.8rem', padding: 0 }}>{ouvert ? '▾' : '▸'}</button>
          : <span title={c.feuille && c.actif ? 'Compte feuille : recevra des écritures' : undefined} style={{ width: 24, flexShrink: 0, textAlign: 'center', color: '#c7d2fe', fontSize: '0.6rem' }}>{c.feuille && c.actif ? '●' : ''}</span>}
        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#1e1b4b', minWidth: 64, flexShrink: 0 }}>{c.numero}</span>
        <span style={{ color: '#0f172a', fontWeight: c.numero.length <= 2 ? 700 : 500, minWidth: 0, overflowWrap: 'anywhere', flex: '1 1 auto' }} title={c.note ? `${c.libelle} (${c.note})` : c.explication ? `${c.libelle} — ${c.explication}` : undefined}>
          {c.libelle}
          {chemin && <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}> · classe {c.classe}</span>}
        </span>
      </span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {c.origine === 'ajout' && <span style={pastille('#eef2ff', '#3730a3')}>Ajouté</span>}
        {c.renomme && <span style={pastille('#fef3c7', '#92400e')} title={`Libellé de la norme : ${c.libellePaquet || ''}`}>Renommé</span>}
        {!c.actif && <span style={pastille('#e2e8f0', '#475569')}>Désactivé</span>}
        {nature && <span style={pastille('#f1f5f9', '#64748b')}>{nature}</span>}
      </span>
      {modifiable && (
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {c.actif && <button type="button" onClick={onSubdiviser} disabled={occupe} style={lien}>Subdiviser</button>}
          <button type="button" onClick={onModifier} disabled={occupe} style={lien}>{c.origine === 'ajout' ? 'Modifier' : 'Renommer'}</button>
          {c.actif && c.nbEnfantsActifs === 0 && <button type="button" onClick={onDesactiver} disabled={occupe} style={lien}>Désactiver</button>}
          {!c.actif && parentActif && <button type="button" onClick={onReactiver} disabled={occupe} style={lien}>Réactiver</button>}
          {c.origine === 'ajout' && c.nbEnfants === 0 && <button type="button" onClick={onSupprimer} disabled={occupe} style={{ ...lien, color: '#be123c' }}>Supprimer</button>}
        </span>
      )}
    </div>
  );
}

interface PropsFenetre { plan: PlanReponse; role: Role; onClose: () => void; onRefus: Refus }

// Subdiviser : numéro proposé (le parent prolongé du premier chiffre libre), libellé, nature héritée (modifiable),
// explication facultative (NC 01, 3ᵉ partie §3). Le serveur revérifie tout (vrai parent, unicité).
function FenetreSubdiviser({ plan, parent, role, onClose, onEnregistre, onRefus }: PropsFenetre & { parent: Compte; onEnregistre: (p: PlanReponse, numero: string) => void }) {
  const [numero, setNumero] = useState(() => numeroPropose(parent, plan.comptes));
  const [libelle, setLibelle] = useState('');
  const [nature, setNature] = useState(parent.nature);
  const [explication, setExplication] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistrer = async () => {
    if (envoi) return;
    const n = numero.replace(/\s/g, '');
    const e = controlerNumero(n, parent, plan.numero.min, plan.numero.max);
    if (e) { setErreur(e); return; }
    if (plan.comptes.some((c) => c.numero === n)) { setErreur(`Le compte ${n} existe déjà : choisissez un autre numéro.`); return; }
    if (!libelle.trim()) { setErreur('Indiquez le libellé du compte.'); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const { data } = await api.post(`/api/compta/dossiers/${plan.dossier.id}/plan/comptes`, { parentId: parent.id, numero: n, libelle: libelle.trim(), nature, explication: explication.trim() || null });
      onEnregistre(data as PlanReponse, n);
    } catch (err) {
      // Un numéro pris entre-temps (ou qui dépend d'un compte plus précis) : la saisie reste à corriger dans la fenêtre.
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code !== 'NUMERO_EXISTANT' && onRefus(err)) return;
      setErreur(messageDossier(err, 'Le compte n\'a pas pu être ajouté — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`Subdiviser le compte ${parent.numero}`} sousTitre={parent.libelle} onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur} libelleEnvoi="✓ Ajouter le compte">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 3fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label htmlFor="fs-numero" style={lbl}>Numéro</label>
          <input id="fs-numero" value={numero} onChange={(e) => { setNumero(e.target.value); setErreur(null); }} disabled={envoi} inputMode="numeric" maxLength={plan.numero.max} style={{ ...inp, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }} />
        </div>
        <div>
          <label htmlFor="fs-libelle" style={lbl}>Libellé</label>
          <input id="fs-libelle" value={libelle} onChange={(e) => { setLibelle(e.target.value); setErreur(null); }} disabled={envoi} maxLength={255} placeholder="ex. BIAT — compte courant" style={inp} autoFocus />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="fs-nature" style={lbl}>Nature</label>
        <select id="fs-nature" value={nature} onChange={(e) => setNature(e.target.value)} disabled={envoi} style={inp}>
          {plan.natures.map((n) => <option key={n.valeur} value={n.valeur}>{n.libelle}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="fs-explication" style={lbl}>Explication de l'ajout (facultatif)</label>
        <textarea id="fs-explication" value={explication} onChange={(e) => setExplication(e.target.value)} disabled={envoi} maxLength={500} rows={2} placeholder="Pourquoi ce compte (la norme demande d'expliquer chaque ajout)" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>Le numéro commence par {parent.numero} et le prolonge ({plan.numero.min} à {plan.numero.max} chiffres).</p>
    </Modale>
  );
}

// Renommer un compte de la norme (avec « Rétablir »), ou modifier un compte ajouté (libellé, nature, explication).
function FenetreModifier({ plan, compte, role, onClose, onEnregistre, onRefus }: PropsFenetre & { compte: Compte; onEnregistre: (p: PlanReponse) => void }) {
  const ajout = compte.origine === 'ajout';
  const [libelle, setLibelle] = useState(compte.libelle);
  const [nature, setNature] = useState(compte.nature);
  const [explication, setExplication] = useState(compte.explication || '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistrer = async () => {
    if (envoi) return;
    if (!libelle.trim()) { setErreur('Indiquez le libellé du compte.'); return; }
    const corps: Record<string, string | null> = {};
    if (libelle.trim() !== compte.libelle) corps.libelle = libelle.trim();
    if (ajout && nature !== compte.nature) corps.nature = nature;
    if (ajout && (explication.trim() || null) !== (compte.explication || null)) corps.explication = explication.trim() || null;
    if (!Object.keys(corps).length) { onClose(); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const { data } = await api.put(`/api/compta/dossiers/${plan.dossier.id}/plan/comptes/${compte.id}`, corps);
      onEnregistre(data as PlanReponse);
    } catch (err) {
      if (onRefus(err)) return;
      setErreur(messageDossier(err, 'Le compte n\'a pas pu être enregistré — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`${ajout ? 'Modifier' : 'Renommer'} le compte ${compte.numero}`} sousTitre={ajout ? 'Compte ajouté au plan' : `Libellé de la norme : ${compte.libellePaquet || compte.libelle}`} onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur}>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="fm-libelle" style={lbl}>Libellé</label>
        <input id="fm-libelle" value={libelle} onChange={(e) => { setLibelle(e.target.value); setErreur(null); }} disabled={envoi} maxLength={255} style={inp} autoFocus />
        {!ajout && compte.libellePaquet && libelle.trim() !== compte.libellePaquet && (
          <button type="button" onClick={() => setLibelle(compte.libellePaquet || '')} disabled={envoi} style={{ ...petit('#fff', '#475569', '#cbd5e1'), marginTop: 8 }}>↺ Rétablir le libellé de la norme</button>
        )}
      </div>
      {ajout && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="fm-nature" style={lbl}>Nature</label>
            <select id="fm-nature" value={nature} onChange={(e) => setNature(e.target.value)} disabled={envoi} style={inp}>
              {plan.natures.map((n) => <option key={n.valeur} value={n.valeur}>{n.libelle}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="fm-explication" style={lbl}>Explication de l'ajout (facultatif)</label>
            <textarea id="fm-explication" value={explication} onChange={(e) => setExplication(e.target.value)} disabled={envoi} maxLength={500} rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </>
      )}
    </Modale>
  );
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
