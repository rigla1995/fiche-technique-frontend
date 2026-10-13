import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Link, useParams } from 'react-router-dom';
import BoutonAide from '../BoutonAide';
import { ChoixCompte } from '../ChoixCompte';
import { Modale } from '../DossierFormulaires';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { texteCompte } from '../journaux';
import { lireComptesAchat, reglerCompteAchat, type CibleAchat, type CompteDefaut, type ComptesAchatReponse } from '../comptesAchat';
import type { CompteCourt } from '../journaux';
import { bouton, pastille } from '../styles';

// « Comptes d'achat » (F4, factures fournisseur → LabFlow Compta ; labflow-reprise/achats-compta/PLAN-FACTURES.md §4,
// question 17) : pour le dossier « Mon entreprise » d'un client LabFlow, le compte où le pont impute les achats des
// factures envoyées depuis LabFlow — par catégorie (avec ses articles), et pour les frais hors stock. Sans réglage : le
// compte par défaut (d'après la famille : 601 ingrédients, 607 revendu en l'état, 6022 fournitures ; transport et
// livraison 6241, consigne 4096, prestation 604, autre 606). Le réglage d'un article l'emporte sur celui de sa catégorie.
// Les droits viennent du serveur (titulaire et niveau Complet règlent ; les autres lisent).
type Role = 'titulaire' | 'gerant';
interface Edition { cible: CibleAchat; libelle: string; compte: CompteCourt | null; defaut: string }

export default function ComptaComptesAchatPage() {
  const { dossierId } = useParams();
  return <ComptaComptesAchat key={dossierId} dossierId={dossierId} />;
}

function ComptaComptesAchat({ dossierId }: { dossierId?: string }) {
  const [donnees, setDonnees] = useState<ComptesAchatReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur' | 'non_labflow'>('chargement');
  const [ouvertes, setOuvertes] = useState<Set<number | 'sans'>>(new Set());
  const [edition, setEdition] = useState<Edition | null>(null);
  const [info, setInfo] = useState('');
  const tour = useRef(0);
  const charger = useCallback(() => {
    const moi = ++tour.current;
    lireComptesAchat(dossierId || '')
      .then((p) => { if (moi === tour.current) { setDonnees(p); setEtat('pret'); } })
      .catch((err) => {
        if (moi !== tour.current) return;
        const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
        setEtat(code === 'DOSSIER_NON_LABFLOW' ? 'non_labflow' : statutDe(err) === 404 ? 'introuvable' : 'erreur');
      });
  }, [dossierId]);
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);

  const role: Role = donnees?.dossier.espace.role || 'titulaire';
  const ouvert = !!donnees && donnees.etatAbonnement === 'actif';
  const modifiable = !!donnees && donnees.droits.configurer && donnees.dossier.etat === 'actif' && ouvert;
  const articlesPar = useMemo(() => {
    const m = new Map<number | 'sans', ComptesAchatReponse['articles']>();
    const connues = new Set((donnees?.categories || []).map((c) => c.id));
    for (const a of donnees?.articles || []) {
      // Une catégorie absente de la liste : l'article est rangé « sans catégorie » plutôt que perdu.
      const k = a.categorieId != null && connues.has(a.categorieId) ? a.categorieId : 'sans';
      m.set(k, [...(m.get(k) || []), a]);
    }
    return m;
  }, [donnees]);
  const basculer = (k: number | 'sans') => setOuvertes((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const texteDefaut = (d: CompteDefaut) => `${d.numero} — ${d.libelle}${d.imputable ? '' : ' (à régler : absent ou subdivisé)'}`;
  const sansCategorie = donnees?.sansCategorie ? texteDefaut(donnees.sansCategorie.defaut) : '601';

  const retour = donnees ? { lien: `/dossiers/${donnees.dossier.id}`, libelle: donnees.dossier.nom } : null;
  const ligne = (cle: string, titre: React.ReactNode, compte: CompteCourt | null, parDefaut: string, edit: Edition | null, sousTitre?: React.ReactNode, retrait = 0) => (
    <div key={cle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `8px 18px 8px ${18 + retrait}px`, borderTop: '1px solid #f1f5f9', fontSize: '0.84rem', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 240px', minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: '#0f172a', overflowWrap: 'anywhere' }}>{titre}</span>
        {sousTitre && <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b' }}>{sousTitre}</span>}
      </span>
      <span style={{ flex: '1 1 260px', minWidth: 0, fontSize: '0.8rem' }}>
        {compte
          ? <><strong style={{ color: compte.imputable ? '#1e1b4b' : '#b91c1c' }}>{texteCompte(compte)}</strong> <span style={pastille('#eef2ff', '#3730a3')}>Réglé</span>
            {!compte.imputable && <span style={{ ...pastille('#fee2e2', '#991b1b'), marginLeft: 6 }} title="Les factures envoyées depuis LabFlow sont refusées tant qu'un compte imputable n'est pas choisi">À régler : désactivé ou subdivisé</span>}</>
          : <span style={{ color: '#64748b' }}>{parDefaut}</span>}
      </span>
      {modifiable && edit && <button type="button" onClick={() => { setInfo(''); setEdition(edit); }} style={lien}>Choisir le compte</button>}
    </div>
  );

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🛒</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Comptes d'achat</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Où sont imputés les achats des factures envoyées depuis LabFlow : par catégorie, par article, et pour les frais hors stock
          </p>
        </div>
        <BoutonAide section="compta-dossier" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger les comptes d'achat.</span>
          <button type="button" onClick={() => { setEtat('chargement'); charger(); }} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}
      {(etat === 'introuvable' || etat === 'non_labflow') && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>
            {etat === 'non_labflow' ? 'Les comptes d\'achat ne concernent que le dossier « Mon entreprise » d\'un client LabFlow' : 'Ce dossier n\'existe pas ou ne vous est pas ouvert'}
          </div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}

      {etat === 'pret' && donnees && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(donnees.etatAbonnement, role)} : les comptes d'achat restent consultables mais ne se modifient plus.
            </div>
          )}
          {donnees.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : ses comptes d'achat ne se règlent pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && donnees.dossier.etat === 'actif' && !donnees.droits.configurer && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter les comptes d'achat ; le titulaire et les gérants de niveau Complet les règlent.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}

          <div style={{ ...cadre, marginBottom: 18 }}>
            <div style={enTeteCadre}>
              <span style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>Catégories ({donnees.categories.length})</span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Le compte d'une catégorie vaut pour ses articles, sauf un article réglé à part. Ouvrez une catégorie pour ses articles.</span>
            </div>
            {donnees.categories.map((c) => {
              const arts = articlesPar.get(c.id) || [];
              const ouverte = ouvertes.has(c.id);
              const regles = arts.filter((a) => a.compte).length;
              return (
                <div key={c.id}>
                  {ligne(`c${c.id}`,
                    <button type="button" onClick={() => basculer(c.id)} style={{ ...lien, fontSize: '0.84rem', color: '#0f172a', padding: 0 }} aria-expanded={ouverte}>
                      {ouverte ? '▼' : '▶'} {c.famille ? `${c.famille} › ` : ''}{c.nom}
                    </button>,
                    c.compte, `${texteDefaut(c.defaut)} (par défaut)`,
                    { cible: { type: 'categorie', id: c.id }, libelle: `la catégorie ${c.nom}`, compte: c.compte, defaut: texteDefaut(c.defaut) },
                    `${c.nbArticles} article${c.nbArticles > 1 ? 's' : ''}${regles ? ` · ${regles} réglé${regles > 1 ? 's' : ''} à part` : ''}`)}
                  {ouverte && arts.map((a) => ligne(`a${a.id}`, a.nom, a.compte, `comme la catégorie`,
                    { cible: { type: 'article', id: a.id }, libelle: `l'article ${a.nom}`, compte: a.compte, defaut: `celui de la catégorie (${c.compte ? texteCompte(c.compte) : texteDefaut(c.defaut)})` },
                    a.unite ? `unité : ${a.unite}` : undefined, 24))}
                </div>
              );
            })}
            {(articlesPar.get('sans') || []).length > 0 && (
              <div>
                {ligne('sans', <button type="button" onClick={() => basculer('sans')} style={{ ...lien, fontSize: '0.84rem', color: '#0f172a', padding: 0 }} aria-expanded={ouvertes.has('sans')}>{ouvertes.has('sans') ? '▼' : '▶'} Sans catégorie</button>,
                  null, `${sansCategorie} (par défaut)`, null, `${(articlesPar.get('sans') || []).length} article(s) : réglez-les un par un`)}
                {ouvertes.has('sans') && (articlesPar.get('sans') || []).map((a) => ligne(`a${a.id}`, a.nom, a.compte, `${sansCategorie} (par défaut)`,
                  { cible: { type: 'article', id: a.id }, libelle: `l'article ${a.nom}`, compte: a.compte, defaut: sansCategorie }, undefined, 24))}
              </div>
            )}
          </div>

          <div style={cadre}>
            <div style={enTeteCadre}>
              <span style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>Frais hors stock</span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Les lignes d'une facture qui n'entrent pas en stock : transport, consigne, prestation…</span>
            </div>
            {donnees.natures.map((n) => ligne(`n${n.valeur}`, n.libelle, n.compte, `${texteDefaut(n.defaut)} (par défaut)`,
              { cible: { type: 'nature', valeur: n.valeur }, libelle: n.libelle.toLowerCase(), compte: n.compte, defaut: texteDefaut(n.defaut) }))}
          </div>
        </>
      )}

      {edition && donnees && (
        <FenetreCompte edition={edition} comptes={donnees.comptes} dossierId={donnees.dossier.id} role={role}
          onClose={() => setEdition(null)}
          onFait={(p, message) => { tour.current += 1; setDonnees(p); setEdition(null); setInfo(message); }}
          onPerime={() => { setEdition(null); charger(); }} />
      )}
    </div>
  );
}

function FenetreCompte({ edition, comptes, dossierId, role, onClose, onFait, onPerime }: {
  edition: Edition; comptes: CompteCourt[]; dossierId: number; role: Role;
  onClose: () => void; onFait: (p: ComptesAchatReponse, message: string) => void; onPerime: () => void;
}) {
  const [compteId, setCompteId] = useState<number | null>(edition.compte?.id ?? null);
  // Un achat va en charges (classe 6) ; la consigne peut aussi aller au compte du fournisseur (4096) — même règle au serveur.
  const consigne = edition.cible.type === 'nature' && edition.cible.valeur === 'consigne';
  const proposes = comptes.filter((k) => k.numero.startsWith('6') || (consigne && k.nature === 'fournisseurs'));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const envoyer = async (id: number | null) => {
    setEnvoi(true);
    setErreur(null);
    try {
      const p = await reglerCompteAchat(dossierId, edition.cible, id);
      onFait(p, id ? `Compte réglé pour ${edition.libelle}.` : `${edition.libelle.charAt(0).toUpperCase()}${edition.libelle.slice(1)} reprend le compte par défaut.`);
    } catch (err) {
      const s = statutDe(err);
      if (s === 404) { onPerime(); return; }
      setErreur(messageDossier(err, 'Réglage impossible, réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`Compte d'achat de ${edition.libelle}`} sousTitre={`Sans réglage : ${edition.defaut}`} onClose={onClose}
      onSubmit={() => { if (compteId) void envoyer(compteId); else setErreur('Choisissez un compte, ou revenez au compte par défaut.'); }}
      envoi={envoi} erreur={erreur} libelleEnvoi="✓ Enregistrer">
      <ChoixCompte id="ca-compte" libelle="Compte imputé" comptes={proposes} valeur={compteId} onChange={(id) => { setCompteId(id); setErreur(null); }} disabled={envoi}
        aide={consigne ? 'Un compte de charges (classe 6) ou un compte fournisseurs (4096, emballages à rendre).' : 'Un compte de charges (classe 6).'} />
      {edition.compte && (
        <button type="button" onClick={() => void envoyer(null)} disabled={envoi} style={{ ...lien, marginTop: 10 }}>↺ Revenir au compte par défaut</button>
      )}
    </Modale>
  );
}

const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
