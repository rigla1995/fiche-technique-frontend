# VOCAB-GUIDE — balayer un lot d'écrans (lot 2a)

Guide des agents F1 à F12. Référence : `docs/lot-2-spec.md` du dépôt backend (§2 le moteur, §3 le balayage).
Le moteur (`src/vocab/`), le lexique et `fr.json` sont **gelés** depuis l'étape S4 : tu ne les modifies pas.
L'étape S5 les a étendus UNE fois, puis regelés : `voc.accN` (accord avec plusieurs termes coordonnés), la casse
`'court'` de `voc.MAJ`, `voc.nomS` et `voc.NomS`, et la clé dérivée `article_ingredient` (décisions :
`scripts/vocab-besoins/S5-decisions.json`).
Après le balayage, une seconde extension, regelée elle aussi : `voc.estDefaut`, `voc.ex` et la balise
`[[ex:clé:texte par défaut]]` — les **exemples de saisie** restent ceux d'aujourd'hui pour un compte dont le
vocabulaire est celui par défaut (règle 6, E26, §5 bis).

## 0. En bref

**But.** Dans tes fichiers, chaque texte visible qui porte un terme du lexique (« labo », « activité »,
« article »…) doit sortir du moteur : `voc.le('labo')`, `voc.Aucun('activite')`. Pour un compte restauration,
l'écran reste **identique au caractère près**. Pour un compte Hôtellerie, « le labo » devient « la cuisine
centrale », accords compris.

**Ta boucle de travail**, fichier par fichier :

1. `node scripts/vocab-check.mjs residuels <tes fichiers>` : la liste de ce qui reste à faire
   (`node scripts/vocab-lots.mjs <ton lot>` donne tes fichiers).
2. Tu réécris les textes avec `voc` (§3 à §5).
3. Les quatre contrôles du §8 : `identite`, `residuels`, `accords`, `tsc`. Tous à 0.
4. Tu **relis chaque ligne « miroir »** que le mode `accords` affiche pour tes fichiers (§8) : « 0 signalement »
   ne suffit pas, l'outil ne voit pas tous les accords.

**Tu ne touches pas** : `src/vocab/**`, `src/i18n/**`, `src/context/AuthContext.tsx`, `src/types/index.ts`,
`src/services/excelBrand.ts`, les fichiers des autres lots, `scripts/vocab-allow/_global.json`.
**Tu n'écris que** dans tes fichiers, `scripts/vocab-allow/<ton lot>.json` et `scripts/vocab-besoins/<ton lot>.json`.
Aucune commande git d'écriture, pas de `npm run build`.

## 1. Les règles (spec §3)

1. **Tout texte visible portant un terme passe par `voc`, accords compris** : le déterminant, l'adjectif et le
   participe qui s'accordent avec le terme sortent du moteur eux aussi.
2. **Noms composés.** Libellé, menu, colonne, badge, tuile : forme courte, dans la même casse
   (`Stock ${voc.Court('labo')}`, `Pertes ${voc.court('labo')}`). Dans une phrase : `voc.compl`
   (`depuis le stock ${voc.compl('labo')}`).
3. **Pluriels : reproduire la règle de l'existant.** Le code teste `> 1` → `voc.nom('article', n)` ; il teste
   `!== 1` → `voc.nom('article', n !== 1)`. « (s) » → `voc.nomS`. « ce(s) », « du/des », « la/les » → réécrits avec
   le nombre réel quand il est connu (écart admis `faute-corrigee`, E27). Nombre inconnu : le couple reste, accordé
   en genre par `voc.acc` (`voc.acc('activite', 'le/les', 'la/les')`, sans écart) ; à défaut, le texte reste tel
   quel avec un écart admis justifié (spec §3 règle 3).
4. **Homonymes et noms figés ne passent pas par `voc`** : noms de formule (« Activité Basique / Premium »),
   « domaine d'activité », supplément tarifaire (« Supplément Activité / Labo / Gérant »), locutions
   « prix de vente », « type de vente », unités citées en exemple. Les cas communs sont déjà admis (§7).
5. **Verbes et participes issus d'un terme** (transféré, vendu, inventorié, perdu, fabriqué) : ils restent en dur.
   Leur **accord** avec un terme passe par `voc.acc`.
6. **Exemples de saisie** : `voc.ex(parDefaut, sinon)`. Le premier argument est le texte **exact** de l'existant
   (« Ex: Labo Central », « Ex: Poulet entier ») : un compte dont le vocabulaire est celui par défaut
   (restauration, café, boulangerie, admin) lit l'exemple concret d'aujourd'hui, **sans aucun écart admis**. Le
   second est l'exemple **neutre et construit** (`` `Ex: ${voc.Nom('labo')} 1` ``) que lisent les autres domaines.
   Aucun exemple propre à un secteur en dur ailleurs que dans ce premier argument — **même quand l'exemple ne
   porte aucun terme du lexique** (« Ex. Burger, Pizza Margherita… », « Ex: Poulet entier », « BRG-001 ») : liste
   par lot au §5 bis. Dans `fr.json` : la balise `[[ex:clé:texte par défaut]]`.
7. **Icônes** : `voc.icon(k)` seulement là où l'emoji affiché est déjà l'icône par défaut de la clé (annexe A).
8. **Ne pas toucher** : identifiants, routes, clés d'API, valeurs comparées (`=== 'labo'`), commentaires,
   `console.*`, noms de fichiers téléchargés, pages publiques (`auth/*`), espace admin.
9. **Ce qui manque au moteur** : tu laisses le texte en l'état, tu l'admets en `provisoire` et tu décris le manque
   dans `scripts/vocab-besoins/<lot>.json`. Tu ne modifies ni le moteur, ni le lexique, ni `fr.json`.
10. **Contrôle** : `vocab-check identite | residuels | accords` sur tes fichiers et `npx tsc --noEmit -p tsconfig.app.json`.

### Décisions de l'étape S4 (à appliquer telles quelles, sans les rediscuter)

| Cas | Décision |
|---|---|
| « sous-produit(s) » | Reste en dur (admis dans `_global.json`). |
| Adjectifs de type isolés : « Vendable », « Utilisable », « Valorisé(s) », « Composé(s) », « P. Vendable » | Restent en dur. L'outil ne les voit pas : rien à déclarer. |
| « Suppléments vendables », « Articles valorisés », « produit valorisé composé » | Le NOM passe par `voc`, l'adjectif reste en dur, accordé par `voc.acc` s'il varie en genre : `${voc.Pl('article')} ${voc.acc('article', 'valorisés', 'valorisées')}`. |
| Abréviations « Transf. », « Trf », « Fourn. », « inv. », « Suppl. » | Restent en dur. Rien à déclarer. |
| Sigle « PU » (produit utilisable) | `voc.Court('produit_utilisable')`. « PU TTC » et « PU HT » (prix unitaire) sont admis dans `_global.json`. |
| « Espace Produits » (Sidebar, ProductForm) | `` `Espace ${voc.Pl('produit')}` `` : identité, AUCUN écart (décision de l'orchestrateur : le libellé de la barre latérale ne change pas pour un compte restauration). Là où l'existant écrit « Espace Produit » : `voc.Nom('espace_produits')`. |
| « Espace Labos » (ActivitesPage) | `` `Espace ${voc.Court('labo', true)}` `` : pas d'écart. |
| « Appro » accordé au féminin (« Appro enregistrée », « Appro existante », « cette appro ») | Accord par le moteur (masculin) : écart admis `faute-corrigee` (E30). |
| « Option Acheteurs », « Module Acheteurs », « Module Vente », « Base acheteurs », « Portail Acheteur », « Carnet d'Acheteurs » | Ce ne sont PAS des noms figés : composés avec `Court` / `court` / `compl` / `de`. |
| « en activité », « côté activité » | `` `en ${voc.nom('activite')}` ``, `` `côté ${voc.nom('activite')}` `` : la locution « côté X » prend le nom nu (« côté cuisine »), jamais `voc.compl` (« côté du service »). |
| Terme en apposition dans une phrase | `voc.compl` pour `labo`, `activite`, `acheteur`, `gerant` (les seules clés `appo`). Pour les autres (« la config vente », « les colonnes prestataire ») : `voc.nom`. |
| Filtre de catégories PT écrit en dur (`<option>Produits Transformés Utilisables</option>`) | `voc.Nom('cat_pt_utilisable')`, `cat_pt_vendable`, `cat_pt_valorise` (E29). Une valeur venue de l'API : `libelleCategoriePt(voc, valeur)` de `src/vocab/categoriesPt.ts`. |
| Nom d'onglet d'un export Excel | `nomOnglet(...)` de `src/vocab/excel.ts` (E17). |
| Branche ou menu de l'espace ADMIN dans un fichier partagé (Sidebar) | Reste en dur (invariant I4) : écart admis `homonyme`, justification « espace admin ». |
| Portail acheteur : « votre fournisseur » | C'est le vendeur vu par l'acheteur, pas la clé `fournisseur` : `homonyme`. |

## 2. Préparer un fichier

```tsx
import { useVocabulaire } from '../../hooks/useVocabulaire';

export default function MaPage() {
  const voc = useVocabulaire();   // le vocabulaire du compte connecté ; la variable s'appelle TOUJOURS voc
```

- **Chaque composant qui affiche un terme appelle lui-même le hook**, y compris un sous-composant déclaré dans le
  même fichier (E13, E18). Le hook se place **avant tout `return` anticipé** (règle des hooks).
- **Hors React** (fonction de module, `contractPdf.ts`, `manuelPdf.ts`) : `voc` est un **paramètre**
  (`import type { Vocab } from '../../vocab/vocab'`). Pas de vocabulaire global.
- **Table de libellés au niveau module** : elle devient `const xxx = (voc: Vocab) => […]`, appelée sous
  `useMemo(() => xxx(voc), [voc])`. Les identifiants (`key`, `value`) restent des littéraux (E10).
- **Composant de `common/`** : le hook rend le vocabulaire par défaut à un admin ou à un boss. Sidebar, Header et
  AssistantChat l'appellent donc directement. Un composant de `common/` qu'un écran ADMIN utilise pour montrer les
  données d'un client ne lit pas le hook : il reçoit ses libellés en props.
- **Jamais de balise `[[…]]` dans un fichier `.ts` / `.tsx`** : les balises ne sont rendues que dans `fr.json` ;
  dans un littéral, un attribut ou la valeur par défaut d'un `t()`, l'écran afficherait « [[Nom:labo]] » tel quel.
  L'outil le refuse (`ERREUR balise … dans un fichier source`, aucune entrée `allow` ne l'éteint).
  Un `t('clé')` existant se garde tel quel (sa valeur est déjà balisée).
- **`t('clé', 'défaut')` dont la clé est dans `fr.json`** : le 2ᵉ argument est mort (i18next ne le lit plus) et
  `residuels` le signale (« Labo », « Stock Activités »). **Supprime-le** : `t('client.entreprise.labo')`. L'outil
  juge le texte identique. Clés concernées : `nav.stock_activite`, `client.entreprise.labo`,
  `client.entreprise.irreversible`, `client.entreprise.confirm_delete_title`, `client.entreprise.delete_activity_warning`.

### E00 — Poser l'import et le hook

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- import { useAuth } from '../../context/AuthContext';
+ import { useAuth } from '../../context/AuthContext';
+ import { useVocabulaire } from '../../hooks/useVocabulaire';
```

```diff
- export default function ActivitesPage({ onCreated, minimal }: Props) {
-   const { t } = useTranslation();
+ export default function ActivitesPage({ onCreated, minimal }: Props) {
+   const { t } = useTranslation();
+   const voc = useVocabulaire();
```

## 3. L'API

`k` = clé **littérale** du lexique (annexe A), ou condition entre deux littéraux : `voc.du(estLabo ? 'labo' : 'activite')`.
`n` = nombre (pluriel si `n >= 2`), ou booléen (`true` = pluriel), ou absent (singulier).
`c` = casse du nom : `'nom'` (défaut, minuscules), `'Nom'` (forme stockée), `'Titre'`, `'court'`, `'Court'`.
Une méthode à initiale majuscule met la majuscule au **premier mot du résultat** (`voc.Le` → « Le labo »).

| Appel | Défaut | Hôtellerie | Céramique |
|---|---|---|---|
| `voc.nom('labo')` | labo | cuisine centrale | site de production |
| `voc.nom('produit_vendable', 3)` | produits vendables | prestations vendues | produits finis |
| `voc.Nom('labo')` | Labo | Cuisine centrale | Site de production |
| `voc.Nom('article', true)` | Articles | Fournitures | Matières premières |
| `voc.Titre('fiche_technique')` | Fiche Technique | Fiche Technique | Fiche de Coût de Revient |
| `voc.Titre('produit_vendable', true)` | Produits Vendables | Prestations Vendues | Produits Finis |
| `voc.MAJ('vente')` | VENTE | VENTE | VENTE |
| `voc.MAJ('labo', false, 'court')` | LABO | CUISINE | SITE |
| `voc.pl('acheteur')` | acheteurs | clients professionnels | revendeurs |
| `voc.Pl('activite')` | Activités | Services | Points de vente |
| `voc.court('appro', 2)` | appros | appros | réceptions |
| `voc.Court('labo')` | Labo | Cuisine | Site |
| `voc.Court('pt')` | PT | Prépa | PF |
| `voc.Court('produit_utilisable')` | PU | Consommable | Semi-fini |
| `voc.nomS('labo')` | labo(s) | cuisine(s) centrale(s) | site(s) de production |
| `voc.NomS('article')` | Article(s) | Fourniture(s) | Matière(s) première(s) |
| `voc.NomS('labo', 'Court')` | Labo(s) | Cuisine(s) | Site(s) |
| `voc.n('activite', 1)` | 1 activité | 1 service | 1 point de vente |
| `voc.n('labo', 3)` | 3 labos | 3 cuisines centrales | 3 sites de production |
| `voc.compl('labo')` | labo | de la cuisine centrale | du site de production |
| `voc.compl('acheteur', true)` | acheteurs | des clients professionnels | des revendeurs |
| `voc.avecCourt('pt', true)` | produits transformés (PT) | préparations (prépas) | produits fabriqués (PF) |
| `voc.le('article')` | l'article | la fourniture | la matière première |
| `voc.Le('labo', true)` | Les labos | Les cuisines centrales | Les sites de production |
| `voc.un('activite')` | une activité | un service | un point de vente |
| `voc.Un('appro')` | Un approvisionnement | Un approvisionnement | Une réception |
| `voc.du('labo')` | du labo | de la cuisine centrale | du site de production |
| `voc.du('activite')` | de l'activité | du service | du point de vente |
| `voc.Du('vente')` | De la vente | De la vente | De la vente |
| `voc.de('acheteur', true)` | d'acheteurs | de clients professionnels | de revendeurs |
| `voc.de('acheteur', true, 'Nom')` | d'Acheteurs | de Clients professionnels | de Revendeurs |
| `voc.De('article', true)` | D'articles | De fournitures | De matières premières |
| `voc.au('labo')` | au labo | à la cuisine centrale | au site de production |
| `voc.Au('acheteur', true)` | Aux acheteurs | Aux clients professionnels | Aux revendeurs |
| `voc.ce('article')` | cet article | cette fourniture | cette matière première |
| `voc.Ce('activite')` | Cette activité | Ce service | Ce point de vente |
| `voc.aucun('activite')` | aucune activité | aucun service | aucun point de vente |
| `voc.Aucun('labo')` | Aucun labo | Aucune cuisine centrale | Aucun site de production |
| `voc.votre('labo')` | votre labo | votre cuisine centrale | votre site de production |
| `voc.Votre('activite', true)` | Vos activités | Vos services | Vos points de vente |
| `voc.mon('activite')` | mon activité | mon service | mon point de vente |
| `voc.Mon('labo')` | Mon labo | Ma cuisine centrale | Mon site de production |
| `voc.son('fiche_technique')` | sa fiche technique | sa fiche technique | sa fiche de coût de revient |
| `voc.Son('labo', true)` | Ses labos | Ses cuisines centrales | Ses sites de production |
| `voc.nouveau('article')` | nouvel article | nouvelle fourniture | nouvelle matière première |
| `voc.Nouveau('activite')` | Nouvelle activité | Nouveau service | Nouveau point de vente |
| `voc.tous('labo')` | tous les labos | toutes les cuisines centrales | tous les sites de production |
| `voc.Tous('activite', 'vos')` | Toutes vos activités | Tous vos services | Tous vos points de vente |
| `voc.Tous('prestataire', '')` | Tous prestataires | Tous prestataires | Tous intermédiaires |
| `voc.acc('activite', 'créé', 'créée')` | créée | créé | créé |
| `voc.acc('article', 'transféré', 'transférée', true)` | transférés | transférées | transférées |
| `voc.accN(['activite', 'labo'], 'assignés', 'assignées')` | assignés | assignés | assignés |
| `voc.accN(['article', 'produit_vendable'], 'proposés', 'proposées')` | proposés | proposées | proposés |
| `voc.det('stock', 'du')` | `"du "` | `"du "` | `"du "` |
| `voc.det('activite', 'le')` | `"l'"` | `"le "` | `"le "` |
| `voc.Det('article', 'ce')` | `"Cet "` | `"Cette "` | `"Cette "` |
| `voc.un('appro', false, 'court')` | un appro | un appro | une réception |
| `voc.le('fiche_technique', false, 'Court')` | la FT | la FT | la FCR |
| `voc.g('labo')` | m | f | m |
| `voc.icon('labo')` | 🏭 | 🏭 | 🏭 |
| `voc.avec({ sg: 'Bar', pl: 'Bars', g: 'm', el: false }).mon('_')` | mon bar | mon bar | mon bar |
| `voc.estDefaut` | true | false | false |
| `voc.ex('Ex: Poulet entier', 'Ex: ' + voc.Nom('article') + ' A')` | Ex: Poulet entier | Ex: Fourniture A | Ex: Matière première A |
| `voc.ex('Ex: Viandes & Volailles', 'Ex: Catégorie A')` | Ex: Viandes & Volailles | Ex: Catégorie A | Ex: Catégorie A |
| `voc.Nom('espace_labo')` | Espace Labo | Espace Cuisine | Espace Site |
| `voc.Nom('labo_long')` | Laboratoire | Cuisine centrale | Site de production |
| `voc.Nom('labo_desc', true)` | Laboratoires de production | Cuisines centrales | Sites de production |
| `voc.Nom('activite_desc')` | Point de vente | Service | Point de vente |
| `voc.Nom('article_ingredient')` | Ingrédient | Fourniture | Matière première |
| `voc.Nom('cat_pt_utilisable')` | Produits Transformés Utilisables | Consommables | Semi-finis |

Précisions :

- `voc.aucun(k, c?)` n'a pas de nombre (toujours singulier). `voc.tous(k, det?, c?)` est toujours pluriel ;
  `det` vaut `'les'` (défaut), `'vos'`, `'ces'`, `'mes'` ou `''` (nom nu : « Tous prestataires »).
- `voc.acc(k, masc, fem, n?)` rend la forme du genre de `k` ; avec `n` au pluriel il ajoute « s » (sauf finale
  s, x, z). Tu peux aussi écrire les deux pluriels toi-même : `voc.acc('activite', 'liés', 'liées')`.
  **Avec un nombre, `acc` n'accepte que des mots dont le pluriel est en « s »** : `acc('labo', 'nouveau',
  'nouvelle', n)` rendrait « nouveaus », `acc('labo', 'principal', 'principale', n)` « principals ». Pour
  nouveau, principal, tout, le/la, ou une forme vide : écris les deux pluriels (`voc.acc(k, 'principaux',
  'principales')`), avec `n > 1 ? … : …` autour si le nombre varie.
- `voc.accN(cles, masc, fem, n?)` (étape S5) accorde avec **plusieurs termes coordonnés** : féminin seulement si
  TOUS les termes de la liste sont féminins, masculin sinon (« activités & labos assignés », « aucune activité ni
  labo configuré », « des articles et produits proposés », pronom « ils / elles » qui reprend deux termes). La liste
  est un tableau d'au moins deux clés littérales ; pour un seul terme, c'est `voc.acc`. Même règle de pluriel que
  `acc`. Il n'a pas de balise.
- `voc.MAJ(k, n?, c?)`, `voc.nomS(k, c?)` et `voc.NomS(k, c?)` (étape S5) : avec `c` = `'court'` / `'Court'` ils
  rendent la forme courte (« CUISINE », « cuisine(s) », « Cuisine(s) ») — pour une référence d'exemple
  (`Ex: ${voc.MAJ('labo', false, 'court')}-001` : identique à « Ex: LABO-001 » par défaut, donc sans `voc.ex`) ou
  un nom composé en libellé (`${voc.NomS('labo', 'Court')} de fabrication`). Sans cet argument, la forme longue,
  comme avant.
- `article_ingredient` (étape S5) : l'article que l'existant nomme « ingrédient » là où il est une ligne de stock
  (saisie d'inventaire, historique des transferts, cumul d'appro). Par défaut « Ingrédient » ; un domaine qui renomme
  « article » y lit son terme. La clé `ingredient` reste celle du composant d'une recette.
- `voc.estDefaut` (propriété) est vrai quand le lexique du compte donne exactement les rendus du lexique par
  défaut (formes, genre, élision, icône, forme courte, apposition) : domaine sans écart (restauration, café,
  boulangerie), admin, boss, non connecté. Un seul écart de rendu, même une icône, le rend faux.
- `voc.ex(parDefaut, sinon)` rend `parDefaut` si `voc.estDefaut`, sinon `sinon` : c'est la seule écriture d'un
  **exemple de saisie** (règle 6, E26). `parDefaut` est un texte **littéral**, recopié de l'existant ; `sinon` est
  un littéral ou un gabarit à appels `voc` (`` `Ex: ${voc.Nom('article')} A` ``). L'outil juge les deux :
  `identite` compare `parDefaut` à la référence, `residuels` l'exempte et juge `sinon` comme n'importe quel texte,
  `accords` lit `sinon` et la ligne « miroir » le rend. Balise équivalente pour `fr.json` :
  `[[ex:clé:texte par défaut]]` = `voc.ex('texte par défaut', voc.Nom('clé') + ' A')` (un seul argument, non
  vide, sans « : », « | » ni crochet).
- `voc.det(k, d, n?, c?)` rend le déterminant **seul, suivi de son séparateur** (une espace, ou rien après une
  apostrophe). `d` : `'le'`, `'un'`, `'du'`, `'de'`, `'au'`, `'ce'`, `'aucun'`, `'votre'`, `'mon'`, `'son'`,
  `'nouveau'`. Il sert quand une balise sépare le déterminant du terme (E18, E19) — et seulement là.
- `voc.compl(k, n?)` : le terme nu si la clé est `appo` (`labo`, `activite`, `acheteur`, `gerant` par défaut),
  sinon `voc.du(k, n)`. Un domaine qui renomme le terme perd l'apposition : « stock de la cuisine centrale ».
- `voc.court` / `voc.Court` : forme courte si l'entrée en a une (`pt` → PT, `appro` → Appro,
  `fiche_technique` → FT, `produit_utilisable` → PU), sinon la forme normale.
- `voc.n(k, n)` = `String(n) + ' ' + voc.nom(k, n)` : **seulement pour un compteur entier** (`length`, `size`,
  `nb_*`). Le moteur met le pluriel à partir de 2 ; le code d'origine teste le plus souvent `> 1`. Pour une
  quantité qui peut être fractionnaire (1,5 portion) ou un nombre formaté (« 1 234 »), reproduis le test de
  l'existant : `` `${fmt(x)} ${voc.nom(k, x > 1)}` `` — jamais `voc.n(k, x)` ni `voc.nom(k, x)` (l'outil ne
  distingue pas `> 1` de `>= 2` : « 1.5 portions » deviendrait « 1.5 portion » sans qu'il le voie).
- Clé inconnue → `‹clé›` à l'écran et erreur de compilation (les clés sont typées).

### Quelle méthode ?

| Le texte d'origine | Tu écris |
|---|---|
| libellé seul : « Labos », « Fournisseur » | `voc.Pl('labo')`, `voc.Nom('fournisseur')` |
| nom composé en libellé : « Stock Labo », « Historique Appro », « Production PT » | `` `${voc.Nom('stock')} ${voc.Court('labo')}` ``, `` `Historique ${voc.Court('appro')}` ``, `` `Production ${voc.Court('pt')}` `` |
| nom composé en phrase : « depuis le stock labo » | `` `depuis ${voc.le('stock')} ${voc.compl('labo')}` `` |
| « 3 labos », « 1 article » | `voc.n('labo', n)` — ou `` `${n} ${voc.nom('article', n !== 1)}` `` si le code teste `!== 1` |
| « labo(s) » | `voc.nomS('labo')` |
| « Carnet d'Acheteurs », « à l'Espace Acheteurs » | `voc.de('acheteur', true, 'Nom')`, `voc.au('espace_acheteurs', false, 'Nom')` |
| « l'appro », « d'appro », « un PU » | `voc.le('appro', false, 'court')`, `voc.de('appro', false, 'court')`, `voc.un('produit_utilisable', false, 'court')` — en milieu de phrase la casse est `'court'` (un sigle garde ses capitales : « un PU » ; ailleurs « un consommable ») |
| participe ou adjectif accordé : « activité créée », « stock insuffisant » | `voc.acc('activite', 'créé', 'créée')`, `voc.acc('stock', 'insuffisant', 'insuffisante')` |
| mot invariable devant le terme : chaque, plusieurs, par, sans, avec, en, via, leur(s) | le mot en dur, puis `voc.nom(k)` |
| « le premier labo », « un seul article », « la même activité », « il / elle », « lequel / laquelle » | `voc.acc('labo', 'le premier', 'la première')` puis `voc.nom('labo')` — **le déterminant va DANS `acc`** |
| « Dernier inventaire », « Meilleures marges », « Première activité », « nouveaux articles », « certains articles », « Toute l'activité » | `voc.acc('inventaire', 'Dernier', 'Dernière')` puis `voc.nom('inventaire')` ; `voc.acc('marge', 'Meilleurs', 'Meilleures')` puis `voc.pl('marge')` ; `voc.nouveau('article', true)` ; `voc.acc('article', 'certains', 'certaines')` puis `voc.pl('article')` ; `voc.acc('activite', 'Tout', 'Toute')` puis `voc.le('activite')` |
| pronom qui reprend le terme : « L'activité est vide : elle sera masquée » | `{voc.Le('activite')} est vide : {voc.acc('activite', 'il', 'elle')} sera {voc.acc('activite', 'masqué', 'masquée')}` |
| comparaison sur un libellé devenu `voc` : `h === 'Article'` | `h === voc.Nom('article')` (le même appel que le libellé), ou une comparaison sur l'indice ou sur une clé technique |
| « Tous prestataires », « tous labos » | `voc.Tous('prestataire', '')`, `voc.tous('labo', '')` |
| « le **stock** », « votre **référentiel** » (déterminant, balise, terme) | `{voc.det('stock', 'le')}<strong>{voc.nom('stock')}</strong>`, `{voc.det('referentiel', 'votre')}<strong>{voc.nom('referentiel')}</strong>` |
| « la/les **activité(s)** » | `{voc.acc('activite', 'le/les', 'la/les')} <strong>{voc.nomS('activite')}</strong>` |
| exemple de saisie : « Ex: Poulet entier », « Ex: Viandes » | `` voc.ex('Ex: Poulet entier', `Ex: ${voc.Nom('article')} A`) ``, `voc.ex('Ex: Viandes', 'Ex: Catégorie A')` — le texte de l'existant d'abord, l'exemple neutre ensuite |
| « Aucune activité ou labo trouvé », « activités & labos assignés » (termes coordonnés) | `` `${voc.Aucun('activite')} ou ${voc.nom('labo')} ${voc.accN(['activite', 'labo'], 'trouvé', 'trouvée')}` `` : le participe sort de `voc.accN` (féminin seulement si tous les termes sont féminins) |

## 4. Les trois réflexes

1. **L'appel `voc.…` s'écrit là où le texte est assemblé.** Pas de `const lab = voc.nom('labo')` réutilisé plus
   bas : l'outil le refuse dès que le texte de la phrase change (R10), et le mode `accords` lit la variable dans la
   phrase qui l'emploie (« `Aucun ${nom} trouvé` » est signalé comme « Aucun {voc.nom(…)} trouvé »).
2. **Rien de ce qui s'accorde avec le terme ne reste en dur autour d'un appel `voc`.** Le mode `accords` signale :
   - **devant l'appel**, un mot de la liste fermée : le, la, l', les, un, une, des, du, de, d', au, aux, ce, cet,
     cette, ces, aucun(e), votre, vos, mon, ma, mes, son, sa, ses, nouveau, nouvel, nouvelle, nouveaux, nouvelles,
     tous, toutes, tout, toute, quel(le)(s), seul(e)(s), premier, première(s), dernier, dernière(s),
     meilleur(e)(s), prochain(e)(s), certain(e)(s), chacun, chacune — même suivi de « autre » ou « même »
     (« aucun autre », « la même »), même porté par une condition (`${n > 1 ? 'les' : 'le'} ${voc.nom(k, n)}`),
     même séparé de l'appel par un guillemet ou un emoji (« le « {voc.nom(k)} » ») ;
   - **juste après l'appel**, un participe ou un adjectif de la liste `ACCORDS_APRES` de l'outil (créé, lié,
     supprimé, enregistré, trouvé, sélectionné, affecté, rattaché, insuffisant, actif, manuel, direct…), avec ou
     sans « est », « sera », « non », « déjà » devant : « {voc.Nom('activite')} créée », « {voc.Le('labo')} sera
     supprimé » ;
   - **plus loin dans la phrase**, un pronom qui reprend le terme : elle(s), ils, il (sauf « il faut », « il y
     a »…), celui, celle, lequel, laquelle…

   Exception : « de » devant `voc.ce`, `voc.un`, `voc.votre`, `voc.mon`, `voc.son`, `voc.tous`, `voc.nouveau`,
   `voc.aucun` (« de ce labo », « d'un labo », « de votre activité » sont justes partout).
   L'outil ne voit PAS un accord hors de ces listes, ni un déterminant devant un libellé venu d'une table
   (`Aucun {tab.label}`) : écris la phrase entière dans la table, et relis les lignes « miroir ».
3. **Rien ne se colle à un appel `voc`** : ni « s » de pluriel (`{voc.nom('labo')}s`), ni suffixe conditionnel
   (`{voc.nom('labo')}{n > 1 ? 's' : ''}`). Le nombre se passe au moteur.

## 5. Exemples AVANT → APRÈS

Tous sont tirés du code réel. Chacun a été appliqué sur une copie du dépôt (hors dépôt) et jugé par l'outil :
`identite` 0 écart (hors écart admis montré dans l'exemple), `accords` 0 signalement, `tsc` 0 erreur
(`labflow-reprise/lot-2/s4-verifier-guide.mjs`, qui relit les blocs ci-dessous).
Les lignes `-` sont le code actuel, les lignes `+` le code à écrire.

### E01 — Texte JSX simple

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>+ Ajouter une activité</button>
+ <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>+ Ajouter {voc.un('activite')}</button>
```

### E02 — « Aucun / aucune » et accord du participe

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0 0 12px' }}>Aucune activité créée.</p>
+ <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0 0 12px' }}>{voc.Aucun('activite')} {voc.acc('activite', 'créé', 'créée')}.</p>
```

Hôtellerie : « Aucun service créé. » Écrire `Aucune {voc.nom('activite')} créée.` rendrait « Aucune service créée. » :
identique par défaut, donc invisible du mode `identite`, mais signalé par le mode `accords`.

### E03 — Texte coupé par une balise

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- <li>Les activités liées à ce labo passeront en <strong>mode gestion séparée</strong>.</li>
+ <li>{voc.Le('activite', true)} {voc.acc('activite', 'liés', 'liées')} à {voc.ce('labo')} passeront en <strong>mode gestion séparée</strong>.</li>
```

La balise ne bouge pas : l'outil compare le texte du parent (« … passeront en ⟦<strong>⟧. ») et celui de la
balise séparément.

### E04 — Gabarit et forme « (s) »

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- ? `Votre abonnement inclut jusqu'à ${maxActivites} activité(s) et ${maxLabos} labo(s). Configurez votre business en quelques étapes.`
+ ? `Votre abonnement inclut jusqu'à ${maxActivites} ${voc.nomS('activite')} et ${maxLabos} ${voc.nomS('labo')}. Configurez votre business en quelques étapes.`
```

Hôtellerie : « … 3 service(s) et 1 cuisine(s) centrale(s). » Ne jamais écrire `${voc.nom('labo')}(s)`.

### E05 — Pluriel « > 1 » dans un gabarit

Fichier : `src/components/client/ClientDashboard.tsx`

```diff
- function OverviewTab({ data, seuil }: { data: any; seuil: number }) {
+ function OverviewTab({ data, seuil }: { data: any; seuil: number }) {
+   const voc = useVocabulaire();
```

```diff
- sub={`${k.nb_ventes} vente${k.nb_ventes > 1 ? 's' : ''} · panier ${fmtDT(k.panier_moyen, 2)}`}
+ sub={`${voc.n('vente', k.nb_ventes)} · panier ${fmtDT(k.panier_moyen, 2)}`}
```

`voc.n` rend le nombre puis le nom accordé (pluriel si `n >= 2`). Le hook est posé dans le sous-composant, avant son
`return` anticipé.

### E06 — Pluriel « !== 1 » : passer le test du code au moteur

Fichier : `src/components/client/FicheTechniqueModal.tsx`

```diff
- {visibleCount} article{visibleCount !== 1 ? 's' : ''}
+ {visibleCount} {voc.nom('article', visibleCount !== 1)}
```

```diff
- {manualSearch && ` — filtrés sur "${manualSearch}"`}
+ {manualSearch && ` — ${voc.acc('article', 'filtrés', 'filtrées')} sur "${manualSearch}"`}
```

Le code écrit « 0 articles ». `voc.n('article', visibleCount)` écrirait « 0 article » : l'outil signale l'écart
(`@≠1` contre `@>1`). Le participe de la ligne suivante s'accorde avec le terme : laissé en dur, il ne se verrait
que dans la ligne « miroir » du mode `accords` (« 3 denrées — filtrés »).

### E07 — Forme « (s) » en JSX, forme courte après un mot invariable

Fichier : `src/components/client/FicheTechniqueModal.tsx`

```diff
- ⚠ {check.missingCount} article(s) sans appro — coût partiel
+ ⚠ {check.missingCount} {voc.nomS('article')} sans {voc.court('appro')} — coût partiel
```

### E08 — Condition entre deux libellés → condition sur la clé

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- {isDepot ? 'Démarrez votre labo' : 'Démarrez votre activité'}
+ Démarrez {voc.votre(isDepot ? 'labo' : 'activite')}
```

### E09 — Condition entre deux phrases, icône de la clé

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- 🏭 {editingLaboId ? 'Modifier le labo' : 'Nouveau labo'}
+ {voc.icon('labo')} {editingLaboId ? `Modifier ${voc.le('labo')}` : voc.Nouveau('labo')}
```

`voc.icon('labo')` parce que 🏭 est l'icône par défaut de `labo`. Un autre emoji (📍 devant « Activités ») reste en dur.

### E10 — Table de libellés au niveau module → fonction de `voc`

Fichier : `src/components/client/ClientDashboard.tsx`

```diff
- const TABS: { key: TabKey; icon: string; label: string }[] = [
-   { key: 'overview', icon: '📊', label: "Vue d'ensemble" },
-   { key: 'ventes', icon: '💰', label: 'Ventes & marges' },
-   { key: 'achats', icon: '📦', label: 'Achats & stock' },
-   { key: 'pertes', icon: '🗑️', label: 'Pertes' },
-   { key: 'labo', icon: '🧪', label: 'Labo' },
-   { key: 'acheteurs', icon: '🤝', label: 'Acheteurs (B2B)' },
- ];
+ const tabs = (voc: Vocab): { key: TabKey; icon: string; label: string }[] => [
+   { key: 'overview', icon: '📊', label: "Vue d'ensemble" },
+   { key: 'ventes', icon: '💰', label: `${voc.Pl('vente')} & ${voc.pl('marge')}` },
+   { key: 'achats', icon: '📦', label: `Achats & ${voc.nom('stock')}` },
+   { key: 'pertes', icon: '🗑️', label: voc.Pl('perte') },
+   { key: 'labo', icon: '🧪', label: voc.Court('labo') },
+   { key: 'acheteurs', icon: '🤝', label: `${voc.Pl('acheteur')} (B2B)` },
+ ];
```

Les identifiants (`key`) restent des littéraux. Tous les emplois de la table suivent :

```diff
- const computeTabsVisibles = (options: FiltresOptions | null) => {
-   if (!options) return TABS.filter((t) => t.key !== 'labo' && t.key !== 'acheteurs');
+ const computeTabsVisibles = (options: FiltresOptions | null, voc: Vocab) => {
+   if (!options) return tabs(voc).filter((t) => t.key !== 'labo' && t.key !== 'acheteurs');
```

```diff
- return TABS.filter((t) => {
+ return tabs(voc).filter((t) => {
```

```diff
- const tab = (TABS.some((t) => t.key === get('tab')) ? get('tab') : 'overview') as TabKey;
+ const tab = (TAB_PRIORITE.includes(get('tab')) ? get('tab') : 'overview') as TabKey;
```

```diff
- const tabsVisibles = computeTabsVisibles(options);
+ const tabsVisibles = useMemo(() => computeTabsVisibles(options, voc), [options, voc]);
```

```diff
- const vis = computeTabsVisibles(options);
+ const vis = computeTabsVisibles(options, voc);
```

```diff
- const tabDef = TABS.find((t) => t.key === tab)!;
+ const tabDef = tabs(voc).find((t) => t.key === tab)!;
```

```diff
- const ws = wb.addWorksheet(tabDef.label);
+ const ws = wb.addWorksheet(nomOnglet(tabDef.label));
```

Là où seule la clé compte (l'onglet lu dans l'URL), on n'appelle pas la table de libellés : la liste de clés
`TAB_PRIORITE` existait déjà. L'effet qui choisit l'onglet par défaut emploie `voc` sans l'ajouter à ses dépendances.
Le libellé sert aussi de nom d'onglet Excel : il passe par `nomOnglet` (E17).

### E11 — Nom composé en libellé : forme courte, même casse

Fichier : `src/components/common/Sidebar.tsx`

```diff
- <span className="link-label">Stock Labo</span>
+ <span className="link-label">{voc.Nom('stock')} {voc.Court('labo')}</span>
```

Hôtellerie : « Stock Cuisine » (et non « Stock Cuisine centrale »).

### E12 — Nom composé en phrase : `voc.compl`, accord de l'adjectif

Fichier : `src/components/client/CommandesAcheteursPage.tsx`

```diff
- setExpErr('Stock labo insuffisant :');
+ setExpErr(`${voc.Nom('stock')} ${voc.compl('labo')} ${voc.acc('stock', 'insuffisant', 'insuffisante')} :`);
```

Hôtellerie : « Stock de la cuisine centrale insuffisant : ».

### E13 — Sous-composant : son propre hook, libellés de tuiles, sigle

Fichier : `src/components/client/ClientDashboard.tsx`

```diff
- function LaboTab({ data, moduleAcheteurs = false }: { data: any; moduleAcheteurs?: boolean }) {
-   if (data.vide) return <EmptyHint text="Aucun labo dans le périmètre." />;
+ function LaboTab({ data, moduleAcheteurs = false }: { data: any; moduleAcheteurs?: boolean }) {
+   const voc = useVocabulaire();
+   if (data.vide) return <EmptyHint text={`${voc.Aucun('labo')} dans le périmètre.`} />;
```

```diff
- label="Production PT"
+ label={`Production ${voc.Court('pt')}`}
```

```diff
- label="Pertes labo"
+ label={`${voc.Pl('perte')} ${voc.court('labo')}`}
```

`LaboTab` ne reçoit pas `voc` en props : il appelle le hook, avant son `return` anticipé. Une tuile est un libellé :
forme courte (`court`, en minuscules ici comme dans l'existant).

### E14 — Message de confirmation (`useConfirm`)

Fichier : `src/components/client/GerantsPage.tsx`

```diff
- title: `Supprimer le gérant « ${g.nom} » ?`,
+ title: `Supprimer ${voc.le('gerant')} « ${g.nom} » ?`,
```

### E15 — Attribut `title`

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- title={locked ? 'Suppression impossible : des articles sont affectés à cette activité.' : t('common.delete')}
+ title={locked ? `Suppression impossible : ${voc.un('article', true)} sont ${voc.acc('article', 'affectés', 'affectées')} à ${voc.ce('activite')}.` : t('common.delete')}
```

« à » reste en dur devant `voc.ce` (« à cette activité »). Devant `voc.le`, il faudrait `voc.au`.

### E16 — Attribut `placeholder`, sigle derrière un déterminant

Fichier : `src/components/client/ComposedValoriseModal.tsx`

```diff
- placeholder="🔍 Rechercher un PU…"
+ placeholder={`🔍 Rechercher ${voc.un('produit_utilisable', false, 'court')}…`}
```

Hôtellerie : « 🔍 Rechercher un consommable… ». En milieu de phrase la casse est `'court'` : le sigle « PU » garde
ses capitales par défaut, un nom ordinaire reste en minuscules (`'Court'` rendrait « un Consommable »).

### E17 — Export Excel côté front

Fichier : `src/components/client/CommandesAcheteursPage.tsx`

```diff
- const ws = wb.addWorksheet('Ventes Acheteurs');
+ const ws = wb.addWorksheet(nomOnglet(`${voc.Pl('vente')} ${voc.Court('acheteur', true)}`));
```

```diff
- titre: 'Ventes & commandes acheteurs',
+ titre: `${voc.Pl('vente')} & commandes ${voc.compl('acheteur', true)}`,
```

```diff
- ['Date', 'Acheteur', 'Entreprise', 'Labo', 'Source', 'Statut', 'Expédiée le', 'Livrée le', 'Lignes', 'Remise %', 'Brut TTC', 'Facture', 'Net TTC facturé', 'Motif annulation'],
+ ['Date', voc.Nom('acheteur'), 'Entreprise', voc.Court('labo'), 'Source', 'Statut', 'Expédiée le', 'Livrée le', 'Lignes', 'Remise %', 'Brut TTC', 'Facture', 'Net TTC facturé', 'Motif annulation'],
```

```diff
- c.source === 'portail' ? 'Portail' : 'Vente directe',
+ c.source === 'portail' ? 'Portail' : `${voc.Nom('vente')} ${voc.acc('vente', 'direct', 'directe')}`,
```

`nomOnglet` (`import { nomOnglet } from '../../vocab/excel'`) retire les caractères qu'Excel refuse et coupe à
31 caractères : un terme comme « Casse / Rebut » ferait échouer l'export. Le nom du fichier téléchargé ne change pas
(règle 8). Ne pas modifier `excelBrand.ts`.

### E18 — Constante JSX de module → sous-composant ; déterminant séparé du terme par une balise

Fichier : `src/components/client/LaboHistoriqueApproPage.tsx`

```diff
- const warningBanner = (
-   <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
-     <span>⚠️</span>
-     <span>Cette action modifiera les valeurs du <strong>stock labo</strong>. Assurez-vous que les données sont correctes avant de confirmer.</span>
-   </div>
- );
+ function WarningBanner() {
+   const voc = useVocabulaire();
+   return (
+     <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
+       <span>⚠️</span>
+       <span>Cette action modifiera les valeurs {voc.det('stock', 'du')}<strong>{voc.nom('stock')} {voc.compl('labo')}</strong>. Assurez-vous que les données sont correctes avant de confirmer.</span>
+     </div>
+   );
+ }
```

Occurrences : 2

```diff
- {warningBanner}
+ <WarningBanner />
```

Une constante de module ne peut pas appeler le hook : elle devient un composant. `voc.det('stock', 'du')` rend
« du␣ » (l'espace comprise) : on ne laisse **pas** d'espace entre l'appel et `<strong>`. Avec un lexique où « stock »
devient « armoire » : « les valeurs de l'**armoire** … ».

### E19 — Clé conditionnelle sous un déterminant, dans une balise

Fichier : `src/components/client/TransferHistoriquePage.tsx`

```diff
- Cette suppression va recalculer le <strong>stock du labo</strong> (la quantité sera restituée) et le <strong>stock {isLaboDest(deleteTarget) ? 'du labo' : "de l'activité"} «{destNomOf(deleteTarget)}»</strong> (la quantité transférée sera retirée). Cette action est irréversible.
+ Cette suppression va recalculer {voc.det('stock', 'le')}<strong>{voc.nom('stock')} {voc.du('labo')}</strong> (la quantité sera restituée) et {voc.det('stock', 'le')}<strong>{voc.nom('stock')} {voc.du(isLaboDest(deleteTarget) ? 'labo' : 'activite')} «{destNomOf(deleteTarget)}»</strong> (la quantité transférée sera retirée). Cette action est irréversible.
```

`voc.du(cond ? 'labo' : 'activite')` rend « du labo » ou « de l'activité » : la condition porte sur la clé, pas sur
deux textes.

### E20 — Casse du nom derrière un déterminant

Fichier : `src/components/common/Sidebar.tsx`

```diff
- <span className="link-label">Carnet d'Acheteurs</span>
+ <span className="link-label">Carnet {voc.de('acheteur', true, 'Nom')}</span>
```

`voc.De(...)` rendrait « D'acheteurs ». Hôtellerie : « Carnet de Clients professionnels ».

### E21 — « Tous / toutes », article indéfini, participe

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- Toutes les activités ont déjà un labo assigné.
+ {voc.Tous('activite')} ont déjà {voc.un('labo')} {voc.acc('labo', 'assigné', 'assignée')}.
```

Hôtellerie : « Tous les services ont déjà une cuisine centrale assignée. »

### E22 — Idiome sans méthode : le déterminant entre dans `voc.acc`

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- Créer le premier labo
+ Créer {voc.acc('labo', 'le premier', 'la première')} {voc.nom('labo')}
```

`Créer le {voc.acc('labo', 'premier', 'première')} …` laisserait « le » en dur : faux pour « la cuisine centrale ».

### E23 — Formes longues et synonymes : clés dérivées

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- Gérez vos points de vente et laboratoires de production
+ Gérez {voc.votre('activite_desc', true)} et {voc.pl('labo_desc')}
```

« Point de vente » est la clé `activite_desc`, « Laboratoire » `labo_long`, « Laboratoire de production »
`labo_desc`. Hôtellerie : « Gérez vos services et cuisines centrales ».

### E24 — Message d'erreur (`setError`, `alerte`)

Fichier : `src/components/client/ActivitesPage.tsx`

```diff
- setError('Veuillez choisir une option pour le labo');
+ setError(`Veuillez choisir une option pour ${voc.le('labo')}`);
```

### E25 — MAJUSCULES

Fichier : `src/components/client/StockPage.tsx`

```diff
- 💰 VENTE −{parseFloat(entry.venteDepuisInv.toFixed(3))}
+ 💰 {voc.MAJ('vente')} −{parseFloat(entry.venteDepuisInv.toFixed(3))}
```

Jamais `voc.Nom('vente').toUpperCase()` : l'outil n'y voit qu'un trou.

### E26 — Exemple de saisie : `voc.ex`, l'existant par défaut, un exemple neutre ailleurs (aucun écart)

Fichier : `src/components/client/ActivitesPage.tsx`

Occurrences : 2

```diff
- placeholder="Ex: Labo Central"
+ placeholder={voc.ex('Ex: Labo Central', `Ex: ${voc.Nom('labo')} 1`)}
```

Restauration, café, boulangerie : « Ex: Labo Central », comme aujourd'hui (`identite` : 0 écart, sans entrée
`allow`). Hôtellerie : « Ex: Cuisine centrale 1 » — « Labo Central » y aurait donné « Cuisine centrale Central ».
Le premier argument se **recopie** de l'existant : un caractère de différence est un écart (`avant : « Ex: Labo
Central »` / `après : « Ex: Labo central »`). La ligne « miroir » montre le second argument (« Ex: Usine 1 »).

Quand l'exemple neutre ne porte aucun terme du lexique, il reste en dur dans le second argument, et s'admet par
une entrée `exemple` du mode `residuels` sur ce texte neutre (§5 bis) :

Fichier : `src/components/client/ReferentielCategoriesPage.tsx`

```diff
- placeholder="Ex: Viandes"
+ placeholder={voc.ex('Ex: Viandes', 'Ex: Catégorie A')}
```

```json
{
  "fichier": "src/components/client/ReferentielCategoriesPage.tsx",
  "avant": "Ex: Catégorie A",
  "apres": "Ex: Catégorie A",
  "type": "exemple",
  "justification": "Exemple neutre gardé en dur, second argument de voc.ex : « catégorie » n'est pas un terme du lexique."
}
```

### E27 — Double nombre « ce(s) … (s) » : le nombre réel (écart admis)

Fichier : `src/components/client/ComposedValoriseModal.tsx`

```diff
- Aucune activité rattachée à ce(s) labo(s).
+ {voc.Aucun('activite')} {voc.acc('activite', 'rattaché', 'rattachée')} à {voc.ce('labo', selectedLabos.length)}.
```

```json
{
  "fichier": "src/components/client/ComposedValoriseModal.tsx",
  "avant": "Aucune activité rattachée à ce(s) labo(s).",
  "apres": "Aucune activité rattachée à ⟦ce|ces@>1⟧ ⟦labo|labos@>1⟧.",
  "type": "faute-corrigee",
  "justification": "Spec §3 règle 3 : « ce(s) labo(s) » est réécrit avec le nombre réel de labos sélectionnés (« ce labo » / « ces labos »)."
}
```

Le texte canonique de `apres` se recopie de la sortie de l'outil (`--proposer-allow`), il ne se retape pas.

### E28 — Homonyme ou nom figé : on ne touche à rien

Fichier : `src/components/client/FormuleGuard.tsx`

```tsx
Formule Activité Premium requise
```

« Activité Premium » est un nom de formule. Il est admis pour tous les fichiers par
`scripts/vocab-allow/_global.json` : le mode `residuels` ne le signale pas, tu n'as rien à déclarer.

### E29 — Libellés de catégorie de produits transformés

Fichier : `src/components/client/LaboHistoriqueApproPage.tsx`

```diff
- <option value="pt-utilisable">Produits Transformés Utilisables</option>
- <option value="pt-vendable">Produits Transformés Vendables</option>
- <option value="pt-valorise">Produits Composés Valorisés</option>
+ <option value="pt-utilisable">{voc.Nom('cat_pt_utilisable')}</option>
+ <option value="pt-vendable">{voc.Nom('cat_pt_vendable')}</option>
+ <option value="pt-valorise">{voc.Nom('cat_pt_valorise')}</option>
```

Les `value` ne changent pas. Hôtellerie : « Consommables », « Prestations Vendues », « Prestations Catalogue ».

### E30 — Faute d'accord de l'existant : le moteur la corrige (écart admis)

Fichier : `src/components/client/PortionsModal.tsx`

```diff
- ✓ Appro enregistrée
+ ✓ {voc.Court('appro')} {voc.acc('appro', 'enregistré', 'enregistrée')}
```

```json
{
  "fichier": "src/components/client/PortionsModal.tsx",
  "avant": "✓ Appro enregistrée",
  "apres": "✓ Appro enregistré",
  "type": "faute-corrigee",
  "justification": "« Appro » (approvisionnement) est masculin dans le lexique et dans le reste de l'application (« un appro », « appros manuels ») : l'accord féminin d'origine était une faute."
}
```

## 5 bis. Exemples de saisie propres à la restauration (règle 6)

Ces placeholders ne portent parfois aucun terme du lexique : `residuels` les liste quand même, sous le pseudo-terme
`[exemple]`, dès qu'ils commencent par « Ex ». Réécriture : `voc.ex(<le texte d'aujourd'hui, recopié>, <un exemple
neutre et construit avec le terme du domaine>)`. **Aucune entrée `allow` en mode `identite`** : un compte au
vocabulaire par défaut lit l'exemple d'aujourd'hui, au caractère près.

| Lot | Site | Premier argument : aujourd'hui (inchangé par défaut) | Second argument : les autres domaines |
|---|---|---|---|
| F2 | ActivitesPage (×2 chacun) | « Ex: Labo Central », « Ex: Point de vente Tunis » | `` `Ex: ${voc.Nom('labo')} 1` ``, `` `Ex: ${voc.Nom('activite')} 1` `` |
| F2 | ActivitesPage (×2) | « Ex: LABO-001 » | sans `voc.ex` : `` `Ex: ${voc.MAJ('labo', false, 'court')}-001` `` rend déjà « Ex: LABO-001 » par défaut (« Ex: CUISINE-001 » en Hôtellerie) |
| F6 | ProductForm:434, ProductList:924 | « Ex. Burger, Pizza Margherita… », « Ex. Burger Classic, Pizza Margherita… » | `` `Ex. ${voc.Nom('produit')} A, ${voc.Nom('produit')} B…` `` |
| F6 | ProductForm:447, ProductList:932 | « Ex. BRG-001, REF-42… », « Ex. BRG-001 » | « Ex. REF-001, REF-42… », « Ex. REF-001 » (référence neutre, sans `voc`) |
| F7 | ComposedValoriseModal:182 | « Ex. Cookie maison » | `` `Ex. ${voc.Nom('produit_compose')} A` `` |
| F9 | ReferentielArticlesPage:568, :708, :895 | « Ex: Poulet entier » | `` `Ex: ${voc.Nom('article')} A` `` |
| F9 | ReferentielCategoriesPage:208, :246 | « Ex: Viandes », « Ex: Viandes & Volailles » | « Ex: Catégorie A » (mot hors lexique : en dur) |
| F9 | ReferentielFamillesPage:208, :256 | « Ex: Produits laitiers » | « Ex: Famille A » |
| F9 | ProductCategoriesPage:200, :238 | « Ex: Boissons » | « Ex: Catégorie A » |
| F9 | ReferentielUnitesPage:167, :199 | « Ex: kg, L, pièce… » | sans `voc.ex`, inchangé : unités de mesure, neutres — entrée `exemple` en mode `residuels` (texte entier) |
| socle | `fr.json`, `client.entreprise.activity_nom` | « Nom de l'activité (ex: Restaurant A) » | `Nom [[du:activite]] (ex: [[ex:activite:Restaurant A]])` : « Nom du service (ex: Service A) » en Hôtellerie |

Ce que l'outil en fait :

- `identite` : `voc.ex(a, b)` vaut `a`. Le premier argument est un **littéral** (ni variable, ni gabarit à trou) ;
  les erreurs du second (clé inconnue, pluriel collé) sont signalées même s'il n'est pas affiché par défaut.
- `residuels` : le premier argument est exempté (« Labo », « vente », « Produits » n'y sont pas des résiduels). Le
  second est jugé comme n'importe quel texte : sans mot en dur de 3 lettres ou plus (`Ex: ${voc.Nom('labo')} 1`),
  il n'est pas listé ; neutre mais en dur (« Ex: Catégorie A », « Ex. REF-001 »), il reste listé `[exemple]` —
  admets-le par une entrée `exemple` dont `avant` = `apres` = **le texte neutre** entier (une entrée écrite sur le
  texte du premier argument n'admet rien).
- `accords` : le second argument est lu comme n'importe quel texte ; la ligne « miroir » le rend (« défaut : Ex:
  Poulet entier » / « miroir : Ex: Denrée A »).

## 6. Pièges

**1. L'espace perdue entre deux expressions JSX sur deux lignes.** JSX supprime le saut de ligne entre `}` et `{`.

```tsx
{/* FAUX : rend « aux activitésliées » */}
assignez des {voc.pl('article')} {voc.au('activite', true)}
{voc.acc('activite', 'liés', 'liées')} à {voc.ce('labo')}

{/* JUSTE */}
assignez des {voc.pl('article')} {voc.au('activite', true)}{' '}
{voc.acc('activite', 'liés', 'liées')} à {voc.ce('labo')}
```

L'outil le voit (`identite` : « aux activitésliées »). Tant qu'une ligne finit ou commence par du texte, l'espace
est conservée ; le risque n'existe qu'entre deux `{…}`.

**2. La variable intermédiaire.** `const lab = voc.nom('labo')` puis `` `Stock ${lab}` `` : refusé (R10,
« variable intermédiaire ») dès que le texte de la phrase a changé. Une variable qui existait déjà
(`const nom = isLabo ? 'labo' : 'activité'` devenue `const nom = voc.nom(isLabo ? 'labo' : 'activite')`) n'est pas
une erreur d'identité, mais le déterminant ou le participe resté autour d'elle (`` `Aucun ${nom} trouvé` ``) est
signalé par `accords` : écris `` `${voc.Aucun(isLabo ? 'labo' : 'activite')} ${voc.acc(…, 'trouvé', 'trouvée')}` ``.

**3. `voc` dans les dépendances d'un effet de chargement.** Le vocabulaire change quand l'admin modifie le
lexique : un `useEffect(() => { charger(); }, [voc])` rechargerait les données. `voc` va dans les dépendances d'un
`useMemo` de libellés ou d'un `useCallback` d'export, jamais dans celles d'un effet qui appelle `api`. L'outil ne le
vérifie pas : relis tes `useEffect`.

**4. TS6133 casse le build.** Un `const voc = useVocabulaire();` ou un import resté sans emploi est une erreur.
Pose le hook seulement dans les composants qui s'en servent, et retire ce qui ne sert plus (un `TABS` devenu
fonction, un paramètre).

**5. CRLF.** Presque tous les fichiers sont en CRLF. Garde les fins de ligne du fichier. Si l'outil d'édition
échoue sur un remplacement de plusieurs lignes, édite par un script Node (fichier `.mjs`, pas de `node -e`) qui
normalise en LF, remplace, puis restaure les CRLF.

**6. Le hook après un `return`.** `if (data.vide) return …; const voc = useVocabulaire();` viole la règle des
hooks. Le hook se pose en tête du composant (E13).

**7. Méthode de chaîne sur un appel `voc`.** `voc.nom('labo').toUpperCase()`, `` `Stock ${voc.nom('labo')}`.slice(0, 5) ``,
`.replace()`, `.length` : l'outil lit le texte AVANT la méthode, pas ce que l'écran affiche. C'est une erreur
(`ERREUR méthode ou propriété appliquée à un appel voc`), même quand le texte par défaut ne change pas. Utilise
`voc.MAJ`, `voc.Nom`, `voc.Titre`, `voc.Court`.

**8. Clé non littérale.** `voc.nom(type)` est refusé. Écris `voc.nom(type === 'labo' ? 'labo' : 'activite')`.

**9. Identifiants.** `'labo'`, `'vente'`, `'transfert'` sont souvent des valeurs techniques (`type_appro`, clé
d'onglet, paramètre d'URL). On ne les remplace jamais. S'ils sont listés par `residuels`, c'est un écart admis
`discriminant`.

**10. Comparaison sur un libellé.** Une valeur de l'API qui sert de clé (catégorie PT, filtre) reste la chaîne de
l'API. On ne traduit qu'à l'affichage (`libelleCategoriePt`), jamais la valeur comparée ou stockée : `=== 'PT'`
reste, listé par `residuels`, admis en `discriminant`.
À l'inverse, un libellé que TU passes à `voc` ne doit plus être comparé en dur :

```tsx
{/* FAUX : l'en-tête devient « Fourniture », le test reste 'Article' → la colonne perd son alignement */}
{[voc.Nom('article'), 'Qté'].map((h) => <th style={{ textAlign: h === 'Article' ? 'left' : 'right' }}>{h}</th>)}

{/* JUSTE : le même appel des deux côtés (ou une comparaison sur l'indice) */}
{[voc.Nom('article'), 'Qté'].map((h) => <th style={{ textAlign: h === voc.Nom('article') ? 'left' : 'right' }}>{h}</th>)}
```

`residuels` liste le littéral comparé dès qu'il a une majuscule ou une espace (« Article », « Article / Produit »).
Sites : FacturesApproPage:310, InvoiceConfirmModal:62, LaboFacturesApproPage:342, TarifsAcheteursPage:319,
TransferConfirmModal:75, VenteAcheteurPage:358, PortailCommandesPage:174.

**11. `{voc.det(...)}` suivi d'une espace.** `voc.det` rend déjà l'espace : `{voc.det('stock', 'le')} <strong>`
donnerait deux espaces en Hôtellerie… et « l' armoire » avec un terme élidé. Colle la balise à l'appel.

**12. Apostrophe.** Le moteur rend l'apostrophe droite `'`. L'outil confond `’` et `'` : pas d'écart à déclarer,
mais il cite le changement (`… apostrophe(s) typographique(s) ’ devenue(s) droite(s) '`) : recopie cette ligne dans
ton compte rendu (2 unités connues : ProductList:1200 et :1201).

**13. `Nom` au lieu de `Court` dans un libellé.** `{voc.Nom('stock')} {voc.Nom('labo')}` rend « Stock Labo » par
défaut, comme `voc.Court('labo')` : l'identité ne voit rien. Hôtellerie : « Stock Cuisine centrale » au lieu de
« Stock Cuisine ». La ligne « miroir » les sépare : `Court` y rend « Abr-Usine », `Nom` « Usine ». Dans un
libellé, un menu, une colonne, un badge ou une tuile (règle 2), la ligne miroir doit montrer « Abr-… ».

**14. Déterminant devant un libellé de table.** `` `Aucun ${tab.label}` `` : le libellé est un trou pour l'outil,
ni `accords` ni le miroir ne le lisent. La table porte la phrase entière (`vide: voc.Aucun('labo')`).

**15. Accord écrit loin du terme.** « {voc.Le('activite', true)} du compte sont toutes liées » : l'outil ne signale
que le mot qui suit l'appel. Tout ce qui s'accorde passe par `voc.acc`, et la ligne miroir se relit en entier.

## 7. Écarts admis et besoins

`scripts/vocab-allow/README.md` décrit le format. À retenir :

- **`_global.json`** (tu n'y écris pas) vaut pour tous les fichiers, en mode `residuels` : « Activité Basique »,
  « Activité Premium », « Supplément Activité / Labo / Gérant », « Domaine d'activité », « Domaines d'activités »,
  « prix de vente », « Prix vente », « Type de vente », « Type vente », « types vente », « canal de vente »,
  « PU TTC », « PU HT », « sous-produit », « pièce, portion ». Le reste de l'unité reste à balayer
  (« … au prix de vente **acheteur** »).
- **`<lot>.json`** : tes écarts, un par un, typés et justifiés. `--proposer-allow` imprime l'entrée à compléter.
  - Une entrée `avant: null` (texte nouveau) ou `apres: null` (texte supprimé) n'admet qu'**une** unité ; s'il y en
    a plusieurs identiques, ajoute `"occurrences": n` (le nombre exact). L'outil nomme toute entrée qui absorbe
    plusieurs unités.
  - Un extrait (mode `residuels`) doit porter le terme avec un **mot plein** : « prix de vente » masque, « du labo »
    ou « pour le labo » ne masquent rien. Sinon, donne le texte entier de l'unité.
- **Plus d'écart venu du socle** : `fr.json` rend de nouveau « Nom de l'activité (ex: Restaurant A) » par défaut
  (balise `[[ex:activite:Restaurant A]]`, « Service A » en Hôtellerie). L'entrée `exemple` que F2 portait pour
  `ActivitesPage.tsx` a été retirée, comme toutes les entrées `exemple` du mode `identite`.

| Situation | Type | Mode |
|---|---|---|
| valeur technique listée par `residuels` (`'labo'` clé d'onglet, `type_appro`, `=== 'PT'` valeur d'API, nom de fichier `FT-….xlsx`) | `discriminant` | residuels |
| exemple de saisie neutre gardé en dur, listé `[exemple]` (« Ex: kg, L, pièce… » ; « Ex: Catégorie A », second argument de `voc.ex`) | `exemple` | residuels |
| le mot n'est pas le terme (« votre fournisseur » du portail, « PRESTATAIRE » partie au contrat, menu admin) | `homonyme` | residuels |
| nom de formule hors `_global` (« Labo » de FormuleGuard, « activité » du supplément tarifaire) | `formule` | residuels |
| exemple de saisie réécrit (E26) | aucun : `voc.ex` garde le texte de l'existant par défaut | — |
| faute d'accord corrigée, double nombre réécrit, « Espace Produits » harmonisé (E27, E30) | `faute-corrigee` | identite |
| mot de la liste fermée signalé à tort par `accords` : il ne se rapporte pas au terme qui suit (« … pour tous. {voc.Le('labo')} … ») | le type qui convient + `"mode": "accords"` | accords |
| il manque une clé, une forme ou une méthode | `provisoire` + un besoin (pendant un balayage ; l'étape S5 les a tous repris : il n'en reste aucun) | residuels |

Un écart que l'on peut supprimer en écrivant mieux l'appel n'est pas un écart admis. Une **erreur** de l'outil
(clé non littérale, variable intermédiaire, pluriel collé) ne s'admet pas : elle se corrige.

## 8. Contrôle

À lancer depuis la racine du dépôt frontend, sur **tes** fichiers (chemins relatifs au dépôt) :

```
node scripts/vocab-check.mjs identite  src/components/client/ActivitesPage.tsx src/components/client/GerantsPage.tsx
node scripts/vocab-check.mjs residuels src/components/client/ActivitesPage.tsx src/components/client/GerantsPage.tsx
node scripts/vocab-check.mjs accords   src/components/client/ActivitesPage.tsx src/components/client/GerantsPage.tsx
npx tsc --noEmit -p tsconfig.app.json
node scripts/vocab-check.mjs lexique
```

| Commande | Attendu | Ce qu'elle prouve |
|---|---|---|
| `identite` | `0 écart(s), 0 erreur(s)`, code 0 | rien ne change pour un compte restauration |
| `residuels` | `0 unité(s)`, code 0 | plus aucun terme ni exemple en dur (hors écarts admis) |
| `accords` | `0 signalement(s)`, code 0 ; **ET chaque ligne « miroir » relue** (obligatoire) | aucun accord resté en dur |
| `tsc` | aucune erreur dans tes fichiers | clés valides, hooks et imports employés |
| `lexique` | `gel : empreinte inchangée`, code 0 | tu n'as pas touché au moteur |

- Code de sortie : 0 conforme, 1 écart, 2 erreur d'usage ou entrée `allow` invalide.
- `identite` affiche `avant` / `après` en notation canonique : `⟦·⟧` = valeur dynamique, `⟦<strong>⟧` = balise
  enfant, `⟦labo|labos@>1⟧` = pluriel si n > 1, `⟦…@≠1⟧` = pluriel si n ≠ 1, `⟦?A|B⟧` = condition.
- La ligne « miroir » rend ton texte avec un lexique où chaque genre et chaque élision sont inversés
  (« labo » → « usine », féminin élidé) et où chaque terme a une forme courte « Abr-… ». Un accord faux y saute
  aux yeux : « Aucun usine créé », « Dernier pesée », « Local supprimée ». **Relire ces lignes fait partie du
  contrôle** : l'outil ne signale que les mots de ses listes fermées, juste devant ou juste après l'appel.
  Ce que tu cherches dans une ligne miroir : un déterminant, un adjectif, un participe ou un pronom qui ne
  s'accorde pas avec « usine » (f), « local » (m), « denrée » (f), « pesée » (f), « encaissement » (m)… ; un
  libellé (menu, colonne, badge) sans « Abr- » ; « de l'usine » là où le texte d'origine disait « stock labo ».
- Signalement : `« aucun » devant voc.nom('labo')`, `« créé » après voc.nom('labo')`, `pronom « elle » qui
  reprend voc.Le('activite')`, `« aucun » devant la variable « nom »`. Un signalement faux (le mot ne se
  rapporte pas au terme) s'admet par une entrée `"mode": "accords"` ; tous les autres se corrigent.
- Une balise oubliée dans un fichier source est une erreur du mode `identite` (plus besoin de chercher `[[`).
- Diff à relire à la main, l'outil ne les voit pas : deux libellés échangés dans une même table, un texte passé
  d'un attribut à un autre (`title` ↔ `placeholder`), un test modifié (`n > 1` remplacé par un autre booléen).
  `--ensemble` est réservé aux chaînes réellement déplacées d'un fichier à l'autre.

## 9. Les lots

**La répartition qui fait foi est celle de `scripts/vocab-lots.mjs`** (table `LOTS`), reprise à l'identique par le
§3 de la spec : `node scripts/vocab-lots.mjs` affiche les 12 lots avec leur charge recalculée (unités listées par
`residuels`), `node scripts/vocab-lots.mjs F3` les fichiers d'un lot. Le script échoue si un fichier à unités
n'appartient à aucun lot, ou à deux.
Un fichier appartient à un seul lot. Si un texte de ton fichier dépend d'un fichier d'un autre lot, écris-le dans
`scripts/vocab-besoins/<lot>.json` : ne modifie pas le fichier de l'autre.

| Lot | Charge | Fichiers |
|---|---|---|
| F1 | 48 | Sidebar, Header, AssistantChat, OnboardingChecklist |
| F2 | 88 | ActivitesPage, GerantsPage |
| F3 | 86 | StockPage, ApproPreviewPanel, InvoiceConfirmModal, HistoriqueApproPage |
| F4 | 95 | StockLaboPage, LaboHistoriqueApproPage, PortionsModal |
| F5 | 80 | TransferPage, TransferConfirmModal, TransferHistoriquePage, LaboVentesPage, TypeApproFilter, FacturesApproPage, LaboFacturesApproPage |
| F6 | 99 | ProductList, ProductForm, ProductCard, RecipeTree |
| F7 | 99 | ValorisesPage, ComposedValoriseModal, FicheTechniqueModal, ConfigurationVentePage |
| F8 | 118 | ClientDashboard, dashboardV2Widgets |
| F9 | 102 | ReferentielArticlesPage, ReferentielCategoriesPage, ReferentielFamillesPage, ReferentielImportPage, ReferentielUnitesPage, FournisseursPage, FournisseursImportPage, ProductCategoriesPage |
| F10 | 98 | InventairePage, HistoriqueInventairePage, HistoriquepertesPage, LaboHistoriquepertesPage, VentesPage |
| F11 | 105 | AcheteursPage, AcheteursImportPage, TarifsAcheteursPage, CommandesAcheteursPage, VenteAcheteurPage, PortailAcheteurPage, PortailCommandesPage, PortailShell |
| F12 | 77 | AcheteursGuard, FormuleGuard, VenteGuard, MonAbonnementPage, AbonnementGerantPage, SupportPage, ConfigPrestatairesPage, ConfigChargesPage, contractPdf, manuelPdf, AdminSupportPage, GuidePage |

Total : 1 095 unités dans 63 fichiers (mesure du socle corrigé : les comparaisons sur un libellé, les textes
visibles des attributs `value` / `name` et les exemples de saisie sont maintenant listés).

F12 : `contractPdf.ts` et `manuelPdf.ts` ne sont pas des composants, `voc` y entre en paramètre. Leurs points
d'appel sont dans le lot : `AdminSupportPage.tsx` (l'admin fournit le lexique du CLIENT de la demande :
`AvenantPdfParams.lexique`, spec §2.3 — rien d'autre ne change dans ce fichier admin) et `GuidePage.tsx`.

## Annexe A — Les clés du lexique (41)

| Clé | Singulier / pluriel | Genre | Élision | Courte | Apposition | Icône |
|---|---|---|---|---|---|---|
| `activite` | Activité / Activités | f | oui | | oui | 🏪 |
| `labo` | Labo / Labos | m | | | oui | 🏭 |
| `produit_vendable` | Produit vendable / Produits vendables | m | | | | 🛒 |
| `produit_utilisable` | Produit utilisable / Produits utilisables | m | | PU | | 🧂 |
| `produit_valorise` | Produit valorisé / Produits valorisés | m | | | | 💎 |
| `article` | Article / Articles | m | oui | | | 📦 |
| `ingredient` | Ingrédient / Ingrédients | m | oui | | | 🥕 |
| `recette` | Recette / Recettes | f | | | | 📖 |
| `fiche_technique` | Fiche technique / Fiches techniques | f | | FT | | 📋 |
| `portion` | Portion / Portions | f | | | | 🍽️ |
| `food_cost` | Food cost / Food costs | m | | | | 📊 |
| `cout_matiere` | Coût matière / Coûts matière | m | | | | 💰 |
| `marge` | Marge / Marges | f | | | | 📈 |
| `transfert` | Transfert / Transferts | m | | | | 🚚 |
| `appro` | Approvisionnement / Approvisionnements | m | oui | Appro / Appros | | 📥 |
| `perte` | Perte / Pertes | f | | | | 🗑️ |
| `inventaire` | Inventaire / Inventaires | m | oui | | | 📝 |
| `vente` | Vente / Ventes | f | | | | 💵 |
| `acheteur` | Acheteur / Acheteurs | m | oui | | oui | 🤝 |
| `gerant` | Gérant / Gérants | m | | | oui | 👤 |
| `fournisseur` | Fournisseur / Fournisseurs | m | | | | 🏬 |
| `depot` | Dépôt / Dépôts | m | | | | 🏗️ |
| `pt` | Produit transformé / Produits transformés | m | | PT | | 🍲 |
| `stock` | Stock / Stocks | m | | | | 📦 |
| `prestataire` | Prestataire / Prestataires | m | | | | 🛵 |
| `supplement` | Supplément / Suppléments | m | | | | ➕ |
| `espace_activites` | Espace Activités / Espaces Activités | m | oui | | | 🏪 |
| `espace_labo` | Espace Labo / Espaces Labo | m | oui | | | 🏭 |
| `espace_vente` | Espace Vente / Espaces Vente | m | oui | | | 💵 |
| `espace_acheteurs` | Espace Acheteurs / Espaces Acheteurs | m | oui | | | 🤝 |
| `espace_produits` | Espace Produit / Espaces Produit | m | oui | | | 💎 |
| `referentiel` | Référentiel / Référentiels | m | | | | 📚 |
| `produit` | Produit / Produits | m | | | | |
| `produit_compose` | Produit composé / Produits composés | m | | | | |
| `labo_long` | Laboratoire / Laboratoires | m | | | | 🏭 |
| `labo_desc` | Laboratoire de production / Laboratoires de production | m | | | | 🏭 |
| `activite_desc` | Point de vente / Points de vente | m | | | | 🏪 |
| `article_ingredient` | Ingrédient / Ingrédients | m | oui | | | 📦 |
| `cat_pt_utilisable` | Produits Transformés Utilisables | m | | | | 🧂 |
| `cat_pt_valorise` | Produits Composés Valorisés | m | | | | 💎 |
| `cat_pt_vendable` | Produits Transformés Vendables | m | | | | 🛒 |

Hors lexique, donc en dur : catégorie, famille, unité, commande, facture, prix, tarif, quantité, coût, seuil, charge,
historique, compte, abonnement, formule, client, composant, production, site, collaborateur, B2B.
