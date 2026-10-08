import { useCallback, useEffect, useRef, useState } from 'react';
import { NIVEAUX, type DossierChoix, type DossiersAcces, type Niveau } from './comptables';
import { PAGE_DOSSIERS, lirePageDossiers } from './dossiers';
import { inp, lbl, pastille, petit } from './styles';

// LabFlow Compta : éléments d'écran partagés par ses pages (étape S3c ; repris à l'identique des pages des étapes S2b et
// S3b) — carte à en-tête, ligne « libellé : valeur », choix du niveau d'un accès, choix des dossiers d'un accès (S4c).
// Styles : styles.ts.

export function Carte({ titre, sousTitre, children }: { titre: string; sousTitre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef2ff', background: 'linear-gradient(135deg,#f8faff,#eef2ff)' }}>
        <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.95rem' }}>{titre}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{sousTitre}</div>
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  );
}

export function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ color: '#64748b' }}>{libelle}</span>
      <span style={{ color: '#0f172a', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{valeur}</span>
    </div>
  );
}

// Niveau d'un accès (Consultation / Saisie / Complet, validés par le client le 07/10), en boutons radio. `id` : identifiant
// du libellé du groupe (un par formulaire).
export function ChoixNiveau({ id, valeur, onChange }: { id: string; valeur: Niveau; onChange: (n: Niveau) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div id={id} style={lbl}>Niveau</div>
      <div role="radiogroup" aria-labelledby={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {NIVEAUX.map((n) => (
          <button key={n.valeur} type="button" role="radio" aria-checked={valeur === n.valeur} aria-label={n.libelle} onClick={() => onChange(n.valeur)}
            style={{ flex: '1 1 180px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${valeur === n.valeur ? '#4338ca' : '#e2e8f0'}`, background: valeur === n.valeur ? '#eef2ff' : '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: valeur === n.valeur ? '#3730a3' : '#374151' }}>{valeur === n.valeur ? '✓ ' : ''}{n.libelle}</div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{n.aide}</div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>Sur les dossiers : Complet configure et saisit ; Saisie saisit les écritures (en brouillard) et les tiers ; Consultation consulte.</div>
    </div>
  );
}

// S4c (réponses 2 et 4 du client du 07/10) : les dossiers d'un accès — « Tous les dossiers » (ceux d'aujourd'hui et ceux
// à venir) ou « Choisir » (liste à cocher). S4d « grands cabinets » (25 par page, « Afficher plus », archivés présents
// et marqués) : rien n'est chargé d'avance — les dossiers COCHÉS sont montrés en premier, avec leur nombre (noms relus
// par identifiants), puis une RECHERCHE côté serveur pour en ajouter, par pages. `espaceId` : la comptabilité ; `id` :
// identifiant du libellé du groupe (un par formulaire) ; l'appelant donne une `key` par ouverture pour repartir d'un
// état neuf. Dans un <form>, Entrée dans la recherche ou sur une case ne soumet rien (relecture de S4c).
const OPTIONS_DOSSIERS: { valeur: 'tous' | 'choisir'; libelle: string; aide: string }[] = [
  { valeur: 'tous', libelle: 'Tous les dossiers', aide: 'ceux d\'aujourd\'hui et ceux à venir' },
  { valeur: 'choisir', libelle: 'Choisir', aide: 'seulement les dossiers cochés' },
];
const sansEntree = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); };
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
export function ChoixDossiers({ id, valeur, onChange, espaceId, libelle = 'Dossiers' }: { id: string; valeur: DossiersAcces; onChange: (v: DossiersAcces) => void; espaceId: number; libelle?: string }) {
  // Dernière liste cochée : gardée quand on passe à « Tous » puis qu'on revient à « Choisir ».
  const [derniereListe, setDerniereListe] = useState<number[]>(valeur === 'tous' ? [] : valeur);
  const choisir = valeur !== 'tous';
  const coches = valeur === 'tous' ? [] : valeur;
  const poser = (liste: number[]) => { setDerniereListe(liste); onChange(liste); };
  const basculer = (idDossier: number) => poser(coches.includes(idDossier) ? coches.filter((x) => x !== idDossier) : [...coches, idDossier].sort((a, b) => a - b));

  // Noms connus par identifiant : remplis par chaque lecture ; les cochés affichés sans nom sont relus par identifiants,
  // par lots d'une page (200). Un identifiant que le serveur ne rend pas est « inconnu » (dossier supprimé entre-temps :
  // la case se décoche à la main) ; un échec de lecture ne met rien en cache (Réessayer).
  const [noms, setNoms] = useState<Map<number, DossierChoix | 'inconnu'>>(() => new Map());
  const retenir = (lignes: DossierChoix[], inconnus: number[] = []) => setNoms((m) => {
    const n = new Map(m);
    lignes.forEach((d) => n.set(d.id, d));
    inconnus.forEach((x) => n.set(x, 'inconnu'));
    return n;
  });
  const [erreurNoms, setErreurNoms] = useState(false);
  const [essaiNoms, setEssaiNoms] = useState(0);
  const [nbCochesAffiches, setNbCochesAffiches] = useState(PAGE_DOSSIERS);
  const cochesAffiches = coches.slice(0, nbCochesAffiches);
  const cleManquants = cochesAffiches.filter((x) => !noms.has(x)).join(',');
  useEffect(() => {
    if (!choisir || !cleManquants) return undefined;
    const ids = cleManquants.split(',').map(Number).slice(0, 200);
    let annule = false;
    lirePageDossiers(espaceId, { ids, archives: true, limite: 200 })
      .then((r) => {
        if (annule) return;
        retenir(r.dossiers, ids.filter((x) => !r.dossiers.some((d) => d.id === x)));
        setErreurNoms(false);
      })
      .catch(() => { if (!annule) setErreurNoms(true); });
    return () => { annule = true; };
  }, [choisir, cleManquants, espaceId, essaiNoms]);
  const nbInconnus = cochesAffiches.filter((x) => noms.get(x) === 'inconnu').length;

  // Recherche côté serveur, par pages. `lu` : la dernière réponse, avec la recherche qu'elle sert (une lecture en route
  // se voit à la différence) ; `total` = résultats ; `nbTotal` = dossiers de la comptabilité (0 : rien à cocher).
  const [q, setQ] = useState('');
  const [qEnvoye, setQEnvoye] = useState('');
  useEffect(() => { const t = setTimeout(() => setQEnvoye(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const [lu, setLu] = useState<{ q: string; resultats: DossierChoix[]; total: number; nbTotal: number; page: number } | null>(null);
  const [erreur, setErreur] = useState(false);
  const [plus, setPlus] = useState(false);
  const tour = useRef(0);
  const lirePage = useCallback((p: number) => {
    const moi = ++tour.current;
    lirePageDossiers(espaceId, { q: qEnvoye, page: p, limite: PAGE_DOSSIERS, archives: true })
      .then((r) => {
        if (moi !== tour.current) return;
        // Pages cumulées, dédoublonnées par identifiant (un dossier créé entre deux pages décale la suivante).
        setLu((prev) => {
          const reprise = p === 1 || !prev || prev.q !== qEnvoye;
          const vus = new Set(reprise ? [] : prev.resultats.map((d) => d.id));
          return { q: qEnvoye, resultats: reprise ? r.dossiers : [...prev.resultats, ...r.dossiers.filter((d) => !vus.has(d.id))], total: r.total, nbTotal: r.nbActifs + r.nbArchives, page: p };
        });
        setErreur(false);
        retenir(r.dossiers);
      })
      .catch(() => { if (moi === tour.current) setErreur(true); })
      .finally(() => { if (moi === tour.current) setPlus(false); });
  }, [espaceId, qEnvoye]);
  useEffect(() => { if (choisir) lirePage(1); }, [choisir, lirePage]);
  const resultats = lu?.resultats ?? [];
  const total = lu && lu.q === qEnvoye ? lu.total : null;
  const lecture = !erreur && (!lu || lu.q !== qEnvoye);
  // Résultats d'une recherche précédente encore affichés (lecture en route ou impossible) : atténués.
  const perimes = !!lu && lu.q !== qEnvoye;

  const idsAffiches = resultats.map((d) => d.id);
  const cocherAffiches = () => poser([...new Set([...coches, ...idsAffiches])].sort((a, b) => a - b));
  const decocherAffiches = () => poser(coches.filter((x) => !idsAffiches.includes(x)));
  const vide = lu?.nbTotal === 0 && !qEnvoye;

  const ligne = (d: DossierChoix) => (
    <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.82rem', color: d.etat === 'archive' ? '#64748b' : '#0f172a', cursor: 'pointer', padding: '4px 2px' }}>
      <input type="checkbox" checked={coches.includes(d.id)} onChange={() => basculer(d.id)} aria-label={d.nom} />
      <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{d.nom}</span>
      {d.matriculeFiscal && <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.74rem', color: '#64748b' }}>{d.matriculeFiscal}</span>}
      {d.source === 'labflow' && <span style={pastille('#dcfce7', '#166534')} title="Dossier créé d'après l'identité du compte LabFlow">Mon entreprise · LabFlow</span>}
      {d.etat === 'archive' && <span style={pastille('#e2e8f0', '#475569')}>Archivé</span>}
    </label>
  );
  // Un dossier coché : son nom s'il est connu, « lecture… » en attendant, « introuvable » s'il n'existe plus.
  const ligneCochee = (x: number) => {
    const d = noms.get(x);
    if (d && d !== 'inconnu') return ligne(d);
    const nom = d === 'inconnu' ? `Dossier n° ${x} — introuvable : décochez-le` : `Dossier n° ${x} (lecture…)`;
    return (
      <label key={x} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: d === 'inconnu' ? '#92400e' : '#94a3b8', cursor: 'pointer', padding: '4px 2px' }}>
        <input type="checkbox" checked onChange={() => basculer(x)} aria-label={nom} />
        <span style={{ fontWeight: 600 }}>{d === 'inconnu' ? nom : '…'}</span>
      </label>
    );
  };

  return (
    <div style={{ marginBottom: 12 }} onKeyDown={sansEntree}>
      <div id={id} style={lbl}>{libelle}</div>
      <div role="radiogroup" aria-labelledby={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {OPTIONS_DOSSIERS.map((o) => {
          const actif = (o.valeur === 'choisir') === choisir;
          return (
            <button key={o.valeur} type="button" role="radio" aria-checked={actif} aria-label={o.libelle} onClick={() => (o.valeur === 'tous' ? onChange('tous') : poser(derniereListe))}
              style={{ flex: '1 1 180px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${actif ? '#4338ca' : '#e2e8f0'}`, background: actif ? '#eef2ff' : '#fff' }}>
              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: actif ? '#3730a3' : '#374151' }}>{actif ? '✓ ' : ''}{o.libelle}</div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{o.aide}</div>
            </button>
          );
        })}
      </div>
      {choisir && (
        <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 1. Les dossiers cochés, en premier */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <span aria-live="polite" style={{ fontSize: '0.78rem', fontWeight: 700, color: coches.length ? '#3730a3' : '#92400e' }}>
                {coches.length ? `${pluriel(coches.length, 'dossier')} coché${coches.length > 1 ? 's' : ''}` : 'Aucun dossier coché : la personne ne verra rien'}
              </span>
              <span style={{ flex: 1 }} />
              {erreurNoms && <button type="button" onClick={() => setEssaiNoms((n) => n + 1)} style={lien}>Noms impossibles à lire : réessayer</button>}
              {coches.length > 0 && <button type="button" onClick={() => poser([])} style={lien}>Tout décocher</button>}
            </div>
            {nbInconnus > 0 && <div role="status" style={{ fontSize: '0.76rem', color: '#92400e', marginBottom: 4 }}>{pluriel(nbInconnus, 'dossier coché')} n'existe{nbInconnus > 1 ? 'nt' : ''} plus : décochez-le{nbInconnus > 1 ? 's' : ''} avant d'enregistrer.</div>}
            {coches.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {cochesAffiches.map(ligneCochee)}
                {coches.length > nbCochesAffiches && (
                  <button type="button" onClick={() => setNbCochesAffiches((n) => n + PAGE_DOSSIERS)} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), alignSelf: 'flex-start', marginTop: 4 }}>
                    Afficher plus ({pluriel(coches.length - nbCochesAffiches, 'autre')})
                  </button>
                )}
              </div>
            )}
          </div>
          {/* 2. En ajouter : recherche côté serveur, par pages */}
          {vide ? (
            <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>Aucun dossier dans cette comptabilité pour l'instant : la personne ne verra rien tant que vous n'en aurez pas créé, puis coché.</div>
          ) : (
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Ajouter des dossiers</div>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, raison sociale, matricule)" aria-label="Rechercher un dossier à cocher" style={{ ...inp, marginBottom: 6 }} autoComplete="off" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4, fontSize: '0.76rem', color: '#64748b' }}>
                <span aria-live="polite">
                  {erreur ? 'Lecture impossible.' : lecture || total === null ? 'Lecture…' : qEnvoye ? `${pluriel(total, 'résultat')}` : `${pluriel(total, 'dossier')} dans cette comptabilité`}
                </span>
                <span style={{ flex: 1 }} />
                {erreur && <button type="button" onClick={() => lirePage(1)} style={lien}>Réessayer</button>}
                {resultats.length > 0 && <button type="button" onClick={cocherAffiches} style={lien}>Cocher les {resultats.length} affichés</button>}
                {resultats.length > 0 && <button type="button" onClick={decocherAffiches} style={lien}>Décocher les affichés</button>}
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, opacity: perimes ? 0.6 : 1 }}>
                {resultats.map(ligne)}
                {total === 0 && <div style={{ fontSize: '0.78rem', color: '#64748b', padding: '4px 2px' }}>Aucun dossier ne correspond.</div>}
                {total !== null && lu && !perimes && resultats.length < total && (
                  <button type="button" onClick={() => { setPlus(true); lirePage(lu.page + 1); }} disabled={plus} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), alignSelf: 'flex-start', marginTop: 4 }}>
                    {plus ? 'Lecture…' : `Afficher plus (${pluriel(total - resultats.length, 'autre')})`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>La personne ne voit et ne modifie que ses dossiers ; un dossier qu'elle crée elle-même lui est ouvert aussitôt.</div>
    </div>
  );
}
const lien: React.CSSProperties = { background: 'none', border: 'none', color: '#4338ca', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: 0 };

