// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) : la
// fenêtre « Importer la caisse » de la saisie des ventes. On dépose l'export de la caisse (Excel ou PDF) ; LabFlow le
// lit dans le navigateur, puis l'utilisateur VÉRIFIE chaque ligne : le produit de la carte auquel elle correspond
// (appris pour les fois suivantes) et sa quantité par canal. Décisions du client (18/11/2026) : la part de chaque
// prestataire est saisie, le reste est de la vente directe ; dans une catégorie de livraison, seuls les prestataires.
// Le serveur revérifie tout et crée les ventes de la journée, une par canal, avec les règles de la saisie.
// Lecture : lireCaisse.ts, ouvrirFichier.ts ; logique de la fenêtre : importCaisse.ts (pures, testées).
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../../api/client';
import { useConfirm } from '../../../common/ConfirmDialog';
import { useVocabulaire } from '../../../../hooks/useVocabulaire';
import { ouvertALaSaisie } from '../canaux';
import type { PrixPrestataire } from '../canaux';
import { jourDuFichier } from './lireCaisse';
import { FichierIllisible, ouvrirFichierCaisse } from './ouvrirFichier';
import type { FichierCaisse } from './ouvrirFichier';
import {
  CANAL_DIRECT, bilan, cleCategorie, cleProduit, corpsImport, livraisonProposee, proposerProduit, repartir,
} from './importCaisse';
import type { CategorieApprise, CorrespondanceApprise, EtatLigne, LigneVerifiee, ProduitCarte } from './importCaisse';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';
const ROUGE = '#b91c1c';

const apiMsg = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
const dt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
const qte = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const jourFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Ce que la saisie des ventes connaît déjà de l'activité : sa carte, ses prestataires, ses prix par canal. */
export interface ArticleCarte { id: string; article_type: 'produit' | 'ingredient'; article_id: number; nom: string; prix_vente: number; actif: boolean; directe?: boolean }
export interface PrestataireCarte { id: string; prestataire_nom: string; conditions_renseignees?: boolean }
interface Props {
  activiteId: number;
  activiteNom: string;
  articles: readonly ArticleCarte[];
  prestataires: readonly PrestataireCarte[];
  prixPrestataires: readonly PrixPrestataire[];
  onFermer: () => void;
  onImporte: () => void;
}

interface Contexte { correspondances: Map<string, CorrespondanceApprise>; categories: Map<string, CategorieApprise>; jours: Set<string> }
interface Choix { produit: string | null; etat: EtatLigne | 'choisie'; ignoree: boolean; saisies: Record<string, string> }

export default function ImporterCaisse({ activiteId, activiteNom, articles, prestataires, prixPrestataires, onFermer, onImporte }: Props) {
  const voc = useVocabulaire();
  const { alerte } = useConfirm();
  const champ = useRef<HTMLInputElement>(null);
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [fichier, setFichier] = useState<FichierCaisse | null>(null);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState('');
  const [date, setDate] = useState('');
  const [livraisons, setLivraisons] = useState<Record<string, boolean>>({});
  const [choix, setChoix] = useState<Record<number, Choix>>({});
  const [envoi, setEnvoi] = useState(false);

  // Seuls les prestataires dont les conditions sont renseignées reçoivent des ventes (la saisie les refuse aussi).
  const prets = useMemo(() => prestataires.filter((p) => p.conditions_renseignees !== false), [prestataires]);
  const liens = useMemo(() => prets.map((p) => p.id), [prets]);
  const carte = useMemo<ProduitCarte[]>(() => articles
    .map((a) => ({
      cle: cleProduit(a.article_type, a.article_id), articleType: a.article_type, articleId: a.article_id, nom: a.nom,
      canaux: [CANAL_DIRECT, ...liens].filter((canal) => ouvertALaSaisie(a, prixPrestataires, canal)),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')), [articles, liens, prixPrestataires]);

  useEffect(() => {
    let vivant = true;
    api.get(`/api/ventes/imports/contexte?activiteId=${activiteId}`)
      .then(({ data }) => {
        if (!vivant) return;
        const d = data as { correspondances: CorrespondanceApprise[]; categories: CategorieApprise[]; jours: string[] };
        setContexte({ correspondances: new Map(d.correspondances.map((c) => [c.cle, c])), categories: new Map(d.categories.map((c) => [c.cle, c])), jours: new Set(d.jours) });
      })
      .catch((e: unknown) => { if (vivant) setErreur(apiMsg(e, 'Chargement impossible.')); });
    return () => { vivant = false; };
  }, [activiteId]);

  const voulus = (livraison: boolean) => (livraison ? liens : [CANAL_DIRECT]);
  const messageIllisible = (e: unknown): string => {
    const raison = e instanceof FichierIllisible ? e.raison : 'ILLISIBLE';
    if (raison === 'XLS') return 'Ancien format Excel (.xls) : enregistrez le fichier en .xlsx, ou exportez-le en PDF.';
    if (raison === 'CSV') return 'Les fichiers CSV ne sont pas encore lus : exportez en Excel (.xlsx) ou en PDF.';
    if (raison === 'FORMAT') return 'Fichier non reconnu : un export Excel (.xlsx) ou PDF de la caisse est attendu.';
    if (raison === 'TROP_GROS') return 'Fichier trop lourd (15 Mo au plus).';
    if (raison === 'PDF_IMAGE') return 'Ce PDF est une image (un ticket numérisé) : il ne contient pas de texte à lire. Exportez le fichier depuis la caisse, en Excel ou en PDF.';
    if (raison === 'SANS_TABLEAU') return `Aucun tableau ${voc.de('vente', true)} reconnu dans ce fichier. Le modèle lu aujourd'hui est l'export par ${voc.nom('produit')} de la caisse (désignation, quantité, chiffre).`;
    return 'Fichier illisible (abîmé ou protégé).';
  };

  const ouvrir = async (f: File | undefined) => {
    if (!f || !contexte) return;
    setErreur('');
    setLecture(true);
    try {
      const lu = await ouvrirFichierCaisse(f);
      const jour = jourDuFichier(lu.lecture);
      if (jour.etat === 'plusieurs') {
        setErreur(`Ce fichier porte du chiffre sur ${jour.jours.length} jours (${jour.jours.map(jourFr).join(', ')}). Un import vaut une journée : exportez un fichier par jour.`);
        return;
      }
      const nature: Record<string, boolean> = {};
      for (const nom of lu.lecture.categories) {
        const cle = cleCategorie(nom);
        nature[cle] = contexte.categories.get(cle)?.livraison ?? livraisonProposee(nom, prets.map((p) => p.prestataire_nom));
      }
      const premiers: Record<number, Choix> = {};
      for (const l of lu.lecture.lignes) {
        const p = proposerProduit(l, carte, contexte.correspondances, voulus(l.categorie ? nature[cleCategorie(l.categorie)] === true : false));
        premiers[l.rang] = { produit: p.produit, etat: p.etat, ignoree: false, saisies: {} };
      }
      setFichier(lu);
      setDate(jour.date ?? '');
      setLivraisons(nature);
      setChoix(premiers);
    } catch (e: unknown) {
      setErreur(messageIllisible(e));
    } finally {
      setLecture(false);
      if (champ.current) champ.current.value = '';
    }
  };

  const estLivraison = (categorie: string | null) => (categorie ? livraisons[cleCategorie(categorie)] === true : false);
  const lignes: LigneVerifiee[] = (fichier?.lecture.lignes ?? []).map((ligne) => {
    const c = choix[ligne.rang];
    const produit = carte.find((p) => p.cle === c?.produit) ?? null;
    return { ligne, ignoree: c?.ignoree === true, produit, repartition: repartir(ligne.quantite, c?.saisies ?? {}, estLivraison(ligne.categorie), liens, produit ? produit.canaux : null) };
  });
  const b = bilan(lignes);
  const dejaImportee = Boolean(date && contexte?.jours.has(date));
  const sommesFausses = fichier ? fichier.lecture.controles.filter((x) => !x.juste) : [];
  const pret = b.pret && /^\d{4}-\d{2}-\d{2}$/.test(date) && !dejaImportee && !envoi;

  const modifier = (rang: number, plus: Partial<Choix>) => setChoix((avant) => ({ ...avant, [rang]: { ...avant[rang], ...plus } }));
  // Changer la nature d'une catégorie : les parts saisies de ses lignes repartent de zéro ; une ligne dont le produit
  // n'a pas été choisi à la main est proposée à nouveau (la variante de livraison, ou le plat sur place).
  const basculerLivraison = (nom: string, livraison: boolean) => {
    if (!fichier || !contexte) return;
    setLivraisons((avant) => ({ ...avant, [cleCategorie(nom)]: livraison }));
    setChoix((avant) => {
      const suite = { ...avant };
      for (const l of fichier.lecture.lignes) {
        if (l.categorie !== nom) continue;
        const c = suite[l.rang];
        const p = c.etat === 'choisie' || c.etat === 'reconnue' ? { produit: c.produit, etat: c.etat } : proposerProduit(l, carte, contexte.correspondances, voulus(livraison));
        suite[l.rang] = { ...c, ...p, saisies: {} };
      }
      return suite;
    });
  };

  const nomCanal = (canal: string) => (canal === CANAL_DIRECT
    ? `${voc.Nom('vente')} ${voc.acc('vente', 'direct', 'directe')}`
    : prets.find((p) => p.id === canal)?.prestataire_nom ?? voc.Nom('prestataire'));

  const enregistrer = async () => {
    if (!fichier || !pret) return;
    setEnvoi(true);
    setErreur('');
    try {
      const corps = corpsImport({
        activiteId, date, source: fichier.source, fichierNom: fichier.nom, empreinte: fichier.empreinte, modele: fichier.lecture.modele, totalLu: fichier.lecture.totalLu,
        categories: fichier.lecture.categories.map((nom) => ({ nom, livraison: livraisons[cleCategorie(nom)] === true })), lignes,
      });
      const { data } = await api.post('/api/ventes/imports', corps);
      const r = data as { import: { total_enregistre: number; nb_lignes: number }; ventes: { canal: string; total: number }[] };
      onImporte();
      onFermer();
      await alerte({
        title: `Journée du ${jourFr(date)} importée`,
        message: `${r.import.nb_lignes} ligne${r.import.nb_lignes > 1 ? 's' : ''}, ${dt(r.import.total_enregistre)} : ${r.ventes.map((v) => `${nomCanal(v.canal)} ${dt(v.total)}`).join(' · ')}.`,
        tone: 'info',
      });
    } catch (e: unknown) {
      setErreur(apiMsg(e, 'Enregistrement impossible.'));
    } finally {
      setEnvoi(false);
    }
  };

  const messageRepartition = (l: LigneVerifiee): string | null => {
    const r = l.repartition;
    if (!r.erreur) return null;
    if (r.erreur === 'SAISIE') return 'Quantité à corriger : un nombre, trois décimales au plus.';
    if (r.erreur === 'TROP') return `Réparti ${qte(l.ligne.quantite - r.reste)} pour ${qte(l.ligne.quantite)} dans le fichier.`;
    if (r.erreur === 'RESTE') return `Reste ${qte(r.reste)} à répartir entre ${voc.le('prestataire', true)}.`;
    if (r.erreur === 'SANS_PRESTATAIRE') return `Catégorie de livraison : activez d'abord ${voc.un('prestataire')} pour ${voc.ce('activite')}, ou décochez « Livraison ».`;
    if (r.erreur === 'PAS_CHEZ_PRESTATAIRE') return `Pas en ${voc.nom('vente')} chez ${voc.un('prestataire')} : cochez la case dans Configuration ${voc.Court('vente')}, ou choisissez la variante de livraison.`;
    return `Pas en ${voc.nom('vente')} sur ${r.horsCanal.map(nomCanal).join(', ')} : cochez la case dans Configuration ${voc.Court('vente')}, ou changez la répartition.`;
  };

  const groupes: { nom: string | null; lignes: LigneVerifiee[] }[] = [];
  for (const l of lignes) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.nom === l.ligne.categorie) dernier.lignes.push(l); else groupes.push({ nom: l.ligne.categorie, lignes: [l] });
  }
  const BADGES: Record<Choix['etat'], { texte: string; fond: string; couleur: string; aide: string }> = {
    reconnue: { texte: '✓ Reconnue', fond: '#dcfce7', couleur: '#166534', aide: 'Déjà apprise lors d\'un import précédent' },
    proposee: { texte: '≈ Proposée', fond: '#e0f2fe', couleur: '#075985', aide: 'Proposée d\'après le nom : vérifiez' },
    a_choisir: { texte: '? À choisir', fond: '#fee2e2', couleur: ROUGE, aide: 'Choisissez ce qui a été vendu, ou ignorez la ligne' },
    choisie: { texte: '✎ Choisie', fond: CL, couleur: CD, aide: 'Choisie à la main' },
  };
  const cellule = { padding: '7px 10px', borderBottom: `1px solid ${CB}`, fontSize: '0.83rem', verticalAlign: 'top' as const };
  const titreCol = { ...cellule, fontSize: '0.7rem', fontWeight: 800, color: CD, textTransform: 'uppercase' as const, background: CL, whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, zIndex: 1 };

  return (
    <div role="dialog" aria-modal="true" aria-label="Importer la caisse"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: fichier ? 1180 : 620, boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 22px', borderBottom: `1px solid ${CB}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: CD }}>📥 Importer la caisse — {activiteNom}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              {fichier
                ? `Vérifiez chaque ligne, puis enregistrez : LabFlow crée ${voc.le('vente', true)} de la journée et retient vos choix.`
                : `Déposez l'export de la caisse : LabFlow y lit ${voc.le('vente', true)} de la journée, sans rien envoyer ailleurs.`}
            </p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ border: 'none', background: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          {erreur && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: ROUGE, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600 }}>{erreur}</div>
          )}

          {!fichier && (
            <div>
              <label style={{ display: 'block', border: `2px dashed ${CB}`, borderRadius: 14, padding: '34px 20px', textAlign: 'center', background: CL, cursor: contexte && !lecture ? 'pointer' : 'wait' }}>
                <input ref={champ} type="file" accept=".xlsx,.pdf" disabled={!contexte || lecture} onChange={(e) => ouvrir(e.target.files?.[0])} style={{ display: 'none' }} />
                <div style={{ fontSize: '2rem', marginBottom: 6 }}>📄</div>
                <div style={{ fontWeight: 800, color: CD, fontSize: '0.98rem' }}>{lecture ? 'Lecture du fichier…' : contexte ? 'Choisir le fichier de la caisse' : 'Chargement…'}</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 6 }}>Excel (.xlsx) ou PDF exporté de la caisse · un fichier par journée</div>
              </label>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '12px 2px 0' }}>
                Le fichier doit détailler {voc.le('vente', true)} par {voc.nom('produit')} : désignation, quantité et chiffre. Une journée ne s'importe qu'une fois.
              </p>
            </div>
          )}

          {fichier && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.82rem', color: '#475569' }}>📄 <strong>{fichier.nom}</strong> · {fichier.lecture.lignes.length} lignes</span>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: CD, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Journée
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${date && !dejaImportee ? CB : ROUGE}`, fontSize: '0.84rem', color: CD }} />
                </label>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: sommesFausses.length ? ROUGE : '#166534' }}>
                  {fichier.lecture.controles.length === 0
                    ? 'Le fichier n\'imprime pas de total à contrôler'
                    : sommesFausses.length
                      ? `⚠ ${sommesFausses.length} somme${sommesFausses.length > 1 ? 's' : ''} du fichier ne ${sommesFausses.length > 1 ? 'tombent' : 'tombe'} pas juste : ${sommesFausses.map((x) => x.quoi).join(', ')}`
                      : `✓ Sommes du fichier vérifiées (${fichier.lecture.controles.length} sur ${fichier.lecture.controles.length})`}
                </span>
              </div>
              {!date && <div style={{ color: ROUGE, fontSize: '0.8rem', fontWeight: 600, marginBottom: 10 }}>Le fichier n'annonce pas sa journée : indiquez-la.</div>}
              {dejaImportee && <div style={{ color: ROUGE, fontSize: '0.8rem', fontWeight: 600, marginBottom: 10 }}>La journée du {jourFr(date)} a déjà été importée pour {voc.ce('activite')}.</div>}
              {prets.length < prestataires.length && (
                <div style={{ color: '#92400e', fontSize: '0.78rem', marginBottom: 10 }}>
                  ⚠ {voc.Un('prestataire')} {voc.acc('prestataire', 'activé', 'activée')} sans conditions n'est pas {voc.acc('prestataire', 'proposé', 'proposée')} ici : renseignez sa commission dans Config {voc.Court('prestataire', true)}.
                </div>
              )}

              <div style={{ border: `1px solid ${CB}`, borderRadius: 12, overflow: 'auto', maxHeight: '56vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...titreCol, textAlign: 'left' }}>Ligne du fichier</th>
                      <th style={{ ...titreCol, textAlign: 'right' }}>Qté</th>
                      <th style={{ ...titreCol, textAlign: 'right' }}>Montant</th>
                      <th style={{ ...titreCol, textAlign: 'left', minWidth: 230 }}>{voc.Nom('produit')} de la carte</th>
                      <th style={{ ...titreCol, textAlign: 'center' }}>🏪 {voc.Nom('vente')} {voc.acc('vente', 'direct', 'directe')}</th>
                      {prets.map((p) => <th key={p.id} style={{ ...titreCol, textAlign: 'center' }}>🛵 {p.prestataire_nom}</th>)}
                      <th style={{ ...titreCol, textAlign: 'center' }}>Ignorer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupes.map((g, gi) => {
                      const livraison = estLivraison(g.nom);
                      return [
                        g.nom !== null && (
                          <tr key={`c${gi}`}>
                            <td colSpan={6 + prets.length} style={{ ...cellule, background: '#fffdf7', fontWeight: 800, color: CD }}>
                              <span style={{ marginRight: 14 }}>🏷️ {g.nom}</span>
                              <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={livraison} onChange={(e) => basculerLivraison(g.nom as string, e.target.checked)} style={{ accentColor: C, width: 15, height: 15 }} />
                                Livraison : {voc.le('prestataire', true)} seulement, rien en {voc.nom('vente')} {voc.acc('vente', 'direct', 'directe')}
                              </label>
                            </td>
                          </tr>
                        ),
                        ...g.lignes.map((l) => {
                          const c = choix[l.ligne.rang];
                          const r = l.repartition;
                          const message = l.ignoree ? null : !l.produit ? null : messageRepartition(l);
                          const badge = BADGES[c.etat];
                          return (
                            <tr key={l.ligne.rang} style={{ opacity: l.ignoree ? 0.5 : 1 }}>
                              <td style={cellule}>
                                <div style={{ fontWeight: 700, color: CD }}>{l.ligne.designation}</div>
                                {l.ligne.sousCategorie && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{l.ligne.sousCategorie}</div>}
                                {message && <div role="alert" style={{ color: ROUGE, fontSize: '0.74rem', fontWeight: 600, marginTop: 3 }}>{message}</div>}
                              </td>
                              <td style={{ ...cellule, textAlign: 'right', fontWeight: 700 }}>{qte(l.ligne.quantite)}</td>
                              <td style={{ ...cellule, textAlign: 'right', whiteSpace: 'nowrap' }}>{dt(l.ligne.montant)}</td>
                              <td style={cellule}>
                                <select value={c.produit ?? ''} disabled={l.ignoree} aria-label={`Ce qui a été vendu pour « ${l.ligne.designation} »`}
                                  onChange={(e) => modifier(l.ligne.rang, { produit: e.target.value || null, etat: e.target.value ? 'choisie' : 'a_choisir' })}
                                  style={{ width: '100%', padding: '5px 6px', borderRadius: 8, border: `1.5px solid ${!l.ignoree && !l.produit ? ROUGE : CB}`, fontSize: '0.82rem', color: CD, background: '#fff' }}>
                                  <option value="">— Choisir —</option>
                                  {carte.map((p) => <option key={p.cle} value={p.cle}>{p.nom}</option>)}
                                </select>
                                {!l.ignoree && (
                                  <span title={badge.aide} style={{ display: 'inline-block', marginTop: 4, fontSize: '0.66rem', fontWeight: 800, background: badge.fond, color: badge.couleur, borderRadius: 20, padding: '1px 8px' }}>{badge.texte}</span>
                                )}
                              </td>
                              <td style={{ ...cellule, textAlign: 'center', fontWeight: 700, color: livraison || l.ignoree ? '#cbd5e1' : CD }}>
                                {livraison || l.ignoree ? '—' : qte(r.directe)}
                              </td>
                              {prets.map((p) => {
                                const ferme = l.ignoree || (l.produit !== null && !l.produit.canaux.includes(p.id));
                                const calcule = r.calcules.includes(p.id);
                                return (
                                  <td key={p.id} style={{ ...cellule, textAlign: 'center' }}>
                                    {ferme && !(c.saisies[p.id] ?? '').trim()
                                      ? <span title={l.ignoree ? 'Ligne ignorée' : `Pas en ${voc.nom('vente')} sur ce canal`} style={{ color: '#cbd5e1' }}>—</span>
                                      : (
                                        <input type="text" inputMode="decimal" value={c.saisies[p.id] ?? ''} disabled={l.ignoree}
                                          placeholder={calcule ? qte(r.parPrestataire[p.id]) : '0'}
                                          aria-label={`Quantité chez ${p.prestataire_nom} pour « ${l.ligne.designation} »`}
                                          title={calcule ? 'Calculé : le reste de la ligne' : undefined}
                                          onChange={(e) => modifier(l.ligne.rang, { saisies: { ...c.saisies, [p.id]: e.target.value } })}
                                          style={{ width: 64, padding: '5px 6px', borderRadius: 8, textAlign: 'center', fontSize: '0.84rem', fontWeight: 700, color: CD,
                                            border: `1.5px solid ${message ? ROUGE : CB}`, background: calcule ? '#f0fdf4' : '#fff' }} />
                                      )}
                                  </td>
                                );
                              })}
                              <td style={{ ...cellule, textAlign: 'center' }}>
                                <input type="checkbox" checked={l.ignoree} aria-label={`Ignorer « ${l.ligne.designation} »`}
                                  onChange={(e) => modifier(l.ligne.rang, { ignoree: e.target.checked })} style={{ accentColor: C, width: 16, height: 16 }} />
                              </td>
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div style={{ fontSize: '0.84rem', color: CD }}>
                  <strong>À enregistrer : {dt(b.total)}</strong>
                  {fichier.lecture.totalLu !== null && <span style={{ color: Math.abs(fichier.lecture.totalLu - b.total) < 0.0011 ? '#166534' : '#92400e' }}> · total du fichier {dt(fichier.lecture.totalLu)}</span>}
                  {b.ignorees > 0 && <span style={{ color: '#64748b' }}> · {b.ignorees} ligne{b.ignorees > 1 ? 's' : ''} ignorée{b.ignorees > 1 ? 's' : ''}</span>}
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 3 }}>
                    {Object.entries(b.parCanal).map(([canal, total]) => `${nomCanal(canal)} ${dt(total)}`).join(' · ')}
                  </div>
                  {(b.sansProduit > 0 || b.enErreur > 0) && (
                    <div style={{ fontSize: '0.78rem', color: ROUGE, fontWeight: 600, marginTop: 3 }}>
                      {b.sansProduit > 0 ? `${b.sansProduit} ligne${b.sansProduit > 1 ? 's' : ''} à rattacher ou à ignorer` : ''}
                      {b.sansProduit > 0 && b.enErreur > b.sansProduit ? ' · ' : ''}
                      {b.enErreur > b.sansProduit ? 'des quantités restent à répartir' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => { setFichier(null); setErreur(''); }} disabled={envoi}
                    style={{ padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${CB}`, background: '#fff', color: CD, fontWeight: 700, cursor: 'pointer', fontSize: '0.86rem' }}>
                    Changer de fichier
                  </button>
                  <button type="button" onClick={enregistrer} disabled={!pret}
                    style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: pret ? C : '#e5e7eb', color: pret ? '#fff' : '#9ca3af', fontWeight: 800, cursor: pret ? 'pointer' : 'not-allowed', fontSize: '0.86rem' }}>
                    {envoi ? 'Enregistrement…' : `💾 Enregistrer ${voc.le('vente', true)}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
