# scripts/vocab-besoins — ce qui manque au moteur ou au lexique

Un agent de balayage ne modifie ni le moteur (`src/vocab/`), ni le lexique, ni `fr.json`, ni `AuthContext`,
ni `types/index.ts` (spec `docs/lot-2-spec.md` §3, règle 9). Quand il lui manque une clé, une forme ou une
méthode, il :

1. laisse le texte en l'état ;
2. l'inscrit dans `scripts/vocab-allow/<lot>.json` avec le type `provisoire` ;
3. décrit le manque ici, dans `scripts/vocab-besoins/<lot>.json`.

L'étape S5 fusionne tous les fichiers, étend le moteur et le lexique UNE fois, puis reprend chaque texte
provisoire. Critère de sortie : 0 entrée `provisoire`, 0 besoin ouvert.

## État après l'étape S5 (lot 2a)

Les besoins des lots F1 à F12 (37) ont été fusionnés dans `S5-decisions.json`, avec la décision prise pour chacun :
extension unique du moteur (`voc.accN`, casse `'court'` de `voc.MAJ` / `voc.nomS` / `voc.NomS`) et du lexique
(clé dérivée `article_ingredient`), meilleure écriture, texte laissé en dur, ou report au sous-lot 2b. Ce fichier est
un OBJET (pas un tableau) : l'outil ne le compte pas. Les fichiers par lot ont été retirés : 0 besoin ouvert,
0 entrée `provisoire`. Un prochain balayage (sous-lot 2b : `B1.json` …) reprend le format ci-dessous.

## Un fichier par lot

`scripts/vocab-besoins/<lot>.json` (`F1.json` … `F12.json`, `B1.json` …). Un agent n'écrit que dans le
fichier de son lot.

## Format

Un tableau JSON ; une entrée par besoin :

```json
[
  {
    "besoin": "cle",
    "demande": "clé « commande » (Commande / Commandes, f, sans élision)",
    "fichier": "src/components/client/CommandesAcheteursPage.tsx",
    "ligne": 364,
    "texte": "Commandes des acheteurs",
    "ecriture_souhaitee": "`${voc.Pl('commande')} ${voc.du('acheteur', true)}`",
    "raison": "« commande » devient « bon de livraison » en Céramique."
  }
]
```

| Champ | Contenu |
|---|---|
| `besoin` | `cle` (terme absent du lexique), `forme` (forme courte, apposition, clé dérivée), `methode` (tournure que le moteur ne sait pas accorder), `balise` (argument de balise manquant), `autre` |
| `demande` | ce qu'il faudrait ajouter, en une phrase précise |
| `fichier`, `ligne` | où le texte est resté en l'état |
| `texte` | le texte canonique de l'unité, recopié de la sortie de l'outil (le même que dans l'entrée `provisoire`) |
| `ecriture_souhaitee` | l'appel voc que l'agent aurait écrit si le besoin était satisfait |
| `raison` | pourquoi le moteur actuel ne suffit pas (exemple dans un autre domaine) |

Avant d'écrire un besoin, vérifier que le moteur ne le couvre pas déjà : `voc.acc` pour un accord,
`voc.nomS` pour « (s) », `voc.compl` pour un nom en apposition, `voc.avecCourt` pour « nom (sigle) »,
l'argument `c` (`'Nom'`, `'Titre'`, `'court'`) pour la casse du nom derrière un déterminant.
