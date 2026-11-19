// Import d'un fichier de caisse (étape V1c — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §5 bis) : ce que vaut
// une ligne du fichier. Le plus souvent UN produit de la carte ; « Menu, formule ou lot… » ouvre la ligne composée :
// plusieurs produits (un menu, une formule), chacun avec sa quantité pour une ligne vendue, ou un seul produit en
// plusieurs unités (« Lot de 6 »). Le montant de la ligne est partagé entre ses produits d'après leurs prix à la carte
// (importCaisse.ts : verifierLigne, partager).
import { useVocabulaire } from '../../../../hooks/useVocabulaire';
import type { CibleChoisie, CibleVerifiee, ProduitCarte } from './importCaisse';

const C = '#b45309';
const CD = '#78350f';
const CB = '#fcd34d';
const ROUGE = '#b91c1c';
export const CIBLES_MAX = 8;

const dt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
const qte = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });

interface Props {
  designation: string;
  /** Quantité de la ligne dans le fichier (le nombre de menus, de lots). */
  quantiteLigne: number;
  cibles: readonly CibleChoisie[];
  /** Ligne composée : la quantité de chaque produit se saisit, des produits s'ajoutent. */
  composee: boolean;
  /** Les produits tels que vérifiés (avec leur part du montant) ; absent tant que la ligne n'est pas complète. */
  verifiees: readonly CibleVerifiee[] | undefined;
  carte: readonly ProduitCarte[];
  desactive: boolean;
  badge: { texte: string; fond: string; couleur: string; aide: string } | null;
  onChange: (cibles: CibleChoisie[], composee: boolean) => void;
}

export default function ProduitsLigne({ designation, quantiteLigne, cibles, composee, verifiees, carte, desactive, badge, onChange }: Props) {
  const voc = useVocabulaire();
  const remplacer = (i: number, plus: Partial<CibleChoisie>) => onChange(cibles.map((c, k) => (k === i ? { ...c, ...plus } : c)), composee);
  const lien = { border: 'none', background: 'none', color: C, fontWeight: 700, cursor: 'pointer', fontSize: '0.72rem', padding: 0, textDecoration: 'underline' };
  const plusieurs = cibles.length > 1;
  const detail = !composee || !verifiees ? null
    : verifiees.length > 1
      ? `Montant partagé d'après les prix de la carte : ${verifiees.map((c) => `${c.produit.nom} ${dt(c.montant)}`).join(' · ')}`
      : verifiees[0].quantite !== 1
        ? `Soit ${qte(quantiteLigne * verifiees[0].quantite)} unités à ${dt(verifiees[0].montant / (quantiteLigne * verifiees[0].quantite))}`
        : null;

  return (
    <div>
      {cibles.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <select value={c.produit ?? ''} disabled={desactive}
            aria-label={plusieurs ? `Élément ${i + 1} vendu pour « ${designation} »` : `Ce qui a été vendu pour « ${designation} »`}
            onChange={(e) => remplacer(i, { produit: e.target.value || null })}
            style={{ flex: 1, minWidth: 0, padding: '5px 6px', borderRadius: 8, border: `1.5px solid ${!desactive && !c.produit ? ROUGE : CB}`, fontSize: '0.82rem', color: CD, background: '#fff' }}>
            <option value="">— Choisir —</option>
            {carte.map((p) => <option key={p.cle} value={p.cle}>{p.nom}</option>)}
          </select>
          {composee && (
            <>
              <span aria-hidden="true" style={{ color: '#64748b', fontWeight: 700 }}>×</span>
              <input type="text" inputMode="decimal" value={c.quantite} disabled={desactive}
                aria-label={`Quantité par ligne vendue, élément ${i + 1} de « ${designation} »`} title="Quantité pour une ligne vendue"
                onChange={(e) => remplacer(i, { quantite: e.target.value })}
                style={{ width: 46, padding: '5px 4px', borderRadius: 8, textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: CD, border: `1.5px solid ${CB}` }} />
              {plusieurs && (
                <button type="button" disabled={desactive} aria-label={`Retirer l'élément ${i + 1} de « ${designation} »`} onClick={() => onChange(cibles.filter((_, k) => k !== i), true)}
                  style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', padding: '0 2px' }}>✕</button>
              )}
            </>
          )}
        </div>
      ))}
      {!desactive && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
          {badge && <span title={badge.aide} style={{ fontSize: '0.66rem', fontWeight: 800, background: badge.fond, color: badge.couleur, borderRadius: 20, padding: '1px 8px' }}>{badge.texte}</span>}
          {composee
            ? cibles.length < CIBLES_MAX && <button type="button" style={lien} onClick={() => onChange([...cibles, { produit: null, quantite: '1' }], true)}>+ Ajouter {voc.un('produit')}</button>
            : (
              <button type="button" style={lien} title={`La ligne vaut plusieurs ${voc.nom('produit', true)} (menu, formule) ou plusieurs unités (lot)`} onClick={() => onChange([...cibles], true)}>
                Menu, formule ou lot…
              </button>
            )}
        </div>
      )}
      {!desactive && detail && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 3 }}>{detail}</div>}
    </div>
  );
}
