# scripts/vocab-allow — écarts admis par l'outil de preuve

`node scripts/vocab-check.mjs` (spec `docs/lot-2-spec.md` §2.5, dépôt backend) doit sortir **0 écart hors allow**.
Ce dossier liste les écarts que l'on accepte, un par un, avec leur raison.

**Règle : toute entrée est justifiée et relue.** Une entrée sans type connu ou sans justification fait
échouer l'outil (code 2). La revue du lot relit chaque entrée ; une entrée qui ne sert plus est retirée.

## Un fichier par lot

`scripts/vocab-allow/<lot>.json` (`F1.json` … `F12.json`, `B6.json` …). Un agent n'écrit que dans le
fichier de son lot : l'outil fusionne tous les fichiers du dossier. Le dossier lu est celui du dépôt analysé
(`<root>/scripts/vocab-allow/`) : les écarts du backend vivent dans le dépôt backend.

`archives-2a/` (lot 2b, spec `docs/lot-2b-spec.md` §3.1) : les écarts admis du lot 2a qui ne servent plus,
archivés et **non lus** par l'outil (il ne lit que les `*.json` du dossier, pas les sous-dossiers) : `S1.json`,
`S5.json`, et les entrées des `F*.json` dont le mode, explicite ou déduit, est `identite`. Raison : la référence
de l'outil (`scripts/vocab-check.base`) a été réépinglée sur la tête du 2a ; une entrée `avant: null` restée
sans objet absorberait en silence un nouveau littéral identique. Les entrées `residuels` et `accords` restent.
La preuve « rien ne change depuis avant le lot 2 » garde sa propre référence : `scripts/vocab-reference-lot2`.

## Format

Chaque fichier est un tableau JSON d'entrées :

```json
[
  {
    "fichier": "src/components/client/ProductList.tsx",
    "avant": "Aucun ⟦?labo|activité⟧ disponible.",
    "apres": "⟦?Aucun labo|Aucune activité⟧ disponible.",
    "type": "faute-corrigee",
    "justification": "« Aucun activité » était une faute d'accord ; voc.Aucun la corrige."
  }
]
```

| Champ | Contenu |
|---|---|
| `fichier` | chemin relatif au dépôt, avec des `/` |
| `avant` | texte canonique de l'unité dans la référence, ou `null` si le texte est nouveau |
| `apres` | texte canonique de l'unité dans la version courante, ou `null` si le texte a disparu |
| `type` | un des types ci-dessous |
| `justification` | une phrase (10 caractères au moins) qui dit POURQUOI l'écart est acceptable |
| `mode` | facultatif : `"identite"`, `"residuels"` ou `"accords"` (ou un tableau) ; voir plus bas |
| `occurrences` | facultatif, entier ≥ 1 : seulement pour une entrée `avant: null` ou `apres: null` — nombre d'unités identiques admises (1 par défaut) |

Le texte canonique est celui que l'outil affiche entre « » : ne pas le retaper, le recopier.
`--proposer-allow` imprime les entrées des écarts restants, prêtes à coller ; il reste à choisir le type
et à écrire la justification (la proposition brute est refusée).

```
node scripts/vocab-check.mjs identite --proposer-allow src/components/client/ProductList.tsx
```

## Ce qu'une entrée admet, selon le mode

- **identite** (par défaut quand `avant` ≠ `apres`) : dans ce fichier, l'unité `avant` est devenue `apres`.
  L'entrée vaut pour toutes les occurrences de cette PAIRE dans le fichier, et pour ce fichier seulement
  (avec `--ensemble`, l'un des deux côtés peut être dans un autre fichier de l'ensemble, jamais les deux).
  `avant: null` admet un texte nouveau, `apres: null` un texte supprimé (chaîne déplacée : une entrée
  `deplacement` dans chacun des deux fichiers) : **une seule unité par entrée**, dans son fichier — s'il y en a
  plusieurs identiques, l'entrée le dit par `"occurrences": n`. Sans cela, une entrée écrite pour une
  comparaison (`'labo'`) absorberait aussi trois `<span>labo</span>` visibles.
- **residuels** (par défaut quand `avant` = `apres`) : le texte reste écrit en dur. `apres` est soit le texte
  ENTIER de l'unité (canonique, ou « dur » : appels voc affichés `⟦voc⟧`), soit un EXTRAIT qui porte le terme
  avec un **mot plein** (« prix de vente », « Activité Basique ») : l'extrait est masqué partout dans le
  fichier, le reste de l'unité reste contrôlé. Un extrait réduit au terme seul (« labo »), ou au terme
  accompagné d'un déterminant ou d'une préposition (« du labo », « pour le labo »), ne masque rien : il ferait
  taire l'outil pour toutes les unités du fichier qui le contiennent.
  Un exemple de saisie resté en dur (listé `[exemple]`) ne s'admet que par le texte entier de l'unité.
  Pour un `voc.ex(a, b)`, ce texte est le texte NEUTRE (`b`, tel que `residuels` l'affiche : « Ex: Catégorie A ») ;
  `a`, l'exemple de la référence, est exempté et une entrée écrite sur lui n'admet rien.
- **accords** (seulement avec `"mode": "accords"`) : un mot signalé autour d'un appel voc (devant, juste après,
  pronom de reprise) ne se rapporte pas au terme. `apres` est le texte entier de l'unité tel que l'outil
  l'affiche. Une entrée sans ce mode n'éteint jamais un signalement d'accord.

Le rapport nomme chaque entrée qui absorbe plusieurs unités (`F1.json[0] : 4 unités absorbées — « … »`) : ce
sont les premières qu'une revue relit.

## Types admis

| Type | Emploi | Exemple |
|---|---|---|
| `homonyme` | le mot n'est pas le terme du lexique | « domaine d'activité », « Vente » (verbe ou titre sans rapport) |
| `formule` | nom de formule ou de supplément tarifaire, figé | « Activité Basique », « Supplément Labo » |
| `locution` | locution figée | « prix de vente », « type de vente » |
| `verbe` | verbe ou participe issu d'un terme | « Articles les plus transférés » |
| `exemple` | exemple de saisie neutre gardé en dur (mode `residuels`) : unités de mesure, mot hors lexique dans le second argument de `voc.ex` | « Ex: kg, L, pièce… », « Ex: Catégorie A » |
| `discriminant` | chaîne technique jamais affichée (clé, valeur d'état, URL, nom d'événement) | `['manuel', 'transfert', 'vente']` |
| `deplacement` | chaîne déplacée d'un fichier à un autre, texte inchangé | table de libellés sortie dans un helper |
| `non-repliable` | construction que l'outil ne sait pas replier (pluriel par fonction ou par donnée) | `plur(n, 'labo', 'labos')` |
| `apostrophe` | écart d'apostrophe ou de ponctuation typographique assumé | — (`’` et `'` sont déjà confondus par l'outil) |
| `faute-corrigee` | faute de français de l'existant, corrigée par le moteur | « Aucun activité » → « Aucune activité » |
| `provisoire` | texte laissé en l'état en attendant une extension du moteur ou du lexique | avec une ligne dans `scripts/vocab-besoins/<lot>.json` |
| `reporte` | texte laissé pour un lot ultérieur (lot 2b, E8) : champ **`lot` obligatoire**, `3` ou `2c` | texte fixe du contrat (lot 3), description de l'outil de recherche de l'assistant (2c) |
| `admin` | texte lu seulement par un super_admin ou le boss (I4), dans un fichier mixte (E8) : la justification nomme **la route et son garde** (`requireSuperAdmin`, `requireBoss`) | « … : route /admin/clients, garde requireSuperAdmin » |
| `fiscal` | texte d'un document fiscal inchangé à l'octet près (E1) | facture acheteur de `docuseal-templates/generate.js` |
| `retire` | lot 3 : texte SUPPRIMÉ avec la fonctionnalité qui l'affichait, sur décision écrite du client ; seulement `apres: null`, la justification nomme la décision | bouton « Contrat actif » (plus de contrats, décision du 04/10/2026) |
| `remplace` | lot 3 : texte NOUVEAU et visible qui remplace un texte retiré, sur décision écrite du client ; seulement `avant: null`, la justification nomme la décision | introduction de l'email de bienvenue sans contrat |

`provisoire` est une dette : l'outil rappelle leur nombre à chaque passage, et l'étape S5 doit les ramener à 0.
Après l'étape S5 du lot 2a il n'en reste aucune (les 9 entrées, toutes des accords avec des termes coordonnés, passent
par `voc.accN`) ; l'écart admis à cette étape (`S5.json`) est archivé dans `archives-2a/`.

**SQL (lot 2b, E3 / E4).** Une requête se compare par ses constantes-libellés (avec les autres textes du
fichier), ses constantes-codes (`[a-z0-9_]+`, et `'PT'`) et son squelette. Un code ajouté, retiré ou changé
s'affiche `⟦sql⟧'code'` et ne s'admet QUE par une entrée `discriminant`. Un squelette changé n'est pas un écart :
c'est une ligne « requête modifiée, à relire », que l'intégrateur relit.

## Ce qui ne va PAS dans allow

- Un écart que l'on peut supprimer en écrivant mieux l'appel voc (pluriel `!== 1` : `voc.nom('article', n !== 1)` ;
  espace perdue entre deux expressions JSX : `{' '}` en fin de ligne).
- Un exemple de saisie devenu neutre pour un compte restauration (« Ex: Poulet entier » → « Ex: Article A ») :
  il s'écrit `voc.ex('Ex: Poulet entier', …)`, le texte de l'existant en premier argument — aucun écart en mode
  `identite`. Les 14 entrées `exemple` de ce mode ont été retirées.
- Une erreur de l'outil (`ERREUR clé non littérale`, `variable intermédiaire`, `pluriel collé à un appel voc`,
  `balise invalide`, `balise … dans un fichier source`, `balise sans rendu` (serveur, E2 ; dite en `identite` ET en `residuels`),
  `méthode ou propriété appliquée à un appel voc`) :
  elle se corrige dans le code, aucune entrée ne l'éteint.
- Un doute : dans ce cas, `provisoire` + un besoin, pas `homonyme`.
