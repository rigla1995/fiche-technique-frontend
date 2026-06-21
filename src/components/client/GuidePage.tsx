import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// ─── Shared typography helpers ───────────────────────────────────────────────
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', marginBottom: 12, marginTop: 0 }}>{children}</h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2563eb', marginBottom: 8, marginTop: 24 }}>{children}</h3>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.75, margin: '0 0 10px' }}>{children}</p>
);
const Steps = ({ items }: { items: string[] }) => (
  <ol style={{ paddingLeft: 20, margin: '0 0 12px' }}>
    {items.map((s, i) => (
      <li key={i} style={{ fontSize: '0.84rem', color: '#374151', lineHeight: 1.75, marginBottom: 4 }}
        dangerouslySetInnerHTML={{ __html: s }} />
    ))}
  </ol>
);
const List = ({ items }: { items: string[] }) => (
  <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
    {items.map((s, i) => (
      <li key={i} style={{ fontSize: '0.84rem', color: '#374151', lineHeight: 1.75, marginBottom: 4 }}
        dangerouslySetInnerHTML={{ __html: s }} />
    ))}
  </ul>
);
const Tip = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#1d4ed8', display: 'flex', gap: 8 }}>
    <span>💡</span><span>{children}</span>
  </div>
);
const Warn = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#c2410c', display: 'flex', gap: 8 }}>
    <span>⚠️</span><span>{children}</span>
  </div>
);
const Rule = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#15803d', display: 'flex', gap: 8 }}>
    <span>✅</span><span>{children}</span>
  </div>
);
const Formula = ({ label, expr, note }: { label: string; expr: string; note?: string }) => (
  <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '10px 14px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: 'monospace', fontSize: '0.86rem', color: '#1e293b', fontWeight: 700, lineHeight: 1.6 }}>{expr}</div>
    {note && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{note}</div>}
  </div>
);
const Example = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#854d0e' }}>
    <strong>Exemple :</strong> {children}
  </div>
);

interface Section {
  id: string;
  icon: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  // ════════════════════════ PRISE EN MAIN ════════════════════════
  {
    id: 'demarrage',
    icon: '🚀',
    title: 'Prise en main — Bienvenue',
    content: (
      <>
        <H2>🚀 Bienvenue sur LabFlow</H2>
        <P>LabFlow est votre outil de gestion complète de cuisine professionnelle : référentiel d'articles, fiches techniques et calcul de coûts, gestion des stocks et approvisionnements, transferts, inventaires, pertes, et module de vente.</P>
        <P>L'application suit une <strong>logique en cascade</strong> : chaque étape débloque la suivante. Voici le parcours recommandé pour bien démarrer.</P>

        <H3>Parcours de démarrage conseillé</H3>
        <Steps items={[
          '<strong>Référentiel</strong> — Créez vos unités, familles, catégories puis vos articles (ingrédients et produits).',
          '<strong>Activités</strong> — Déclarez vos points de vente / cuisines (et vos labos si vous êtes en mode entreprise).',
          '<strong>Sélection des articles</strong> — Indiquez quels articles sont utilisés par chaque activité.',
          '<strong>Stock</strong> — Saisissez vos approvisionnements (prix d\'achat, TVA, quantités).',
          '<strong>Produits & Fiches techniques</strong> — Composez vos recettes pour calculer leur coût de revient.',
          '<strong>Espace Vente</strong> (optionnel) — Configurez les prix de vente puis enregistrez vos ventes.',
        ]} />

        <H3>Repères dans l'interface</H3>
        <List items={[
          'Le <strong>menu latéral</strong> regroupe les espaces : Référentiel, Espace Produit, Stock/Appro, Espace Vente, Gestion.',
          'Un bouton <strong>?</strong> est présent sur la plupart des pages : il ouvre ce manuel directement à la bonne section.',
          'Les montants sont exprimés en <strong>DT</strong> (dinar tunisien).',
        ]} />
        <Tip>Vous pouvez à tout moment revenir à ce manuel via le lien <strong>Manuel d'utilisation</strong> en bas du menu latéral.</Tip>
      </>
    ),
  },
  {
    id: 'roles',
    icon: '👤',
    title: 'Prise en main — Rôles & accès',
    content: (
      <>
        <H2>👤 Rôles, comptes et accès</H2>
        <H3>Les types de compte</H3>
        <List items={[
          '<strong>Indépendant</strong> — Une seule activité, gestion simple et directe.',
          '<strong>Entreprise</strong> — Plusieurs activités, un ou plusieurs <strong>labos centraux</strong> qui approvisionnent les activités par transfert, et la possibilité d\'ajouter des gérants.',
        ]} />

        <H3>Les rôles</H3>
        <List items={[
          '<span style="background:#2563eb22;color:#2563eb;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Client</span> Propriétaire du compte. Accès complet à ses données.',
          '<span style="background:#7c3aed22;color:#7c3aed;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Gérant</span> Utilisateur délégué, rattaché à une activité ou à un labo précis. Son accès est limité à son périmètre.',
        ]} />

        <H3>État du compte (mode)</H3>
        <P>Selon votre abonnement et vos paiements, votre compte peut être en :</P>
        <List items={[
          '<span style="background:#16a34a22;color:#16a34a;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Actif</span> Toutes les fonctions sont disponibles.',
          '<span style="background:#d9770622;color:#d97706;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Lecture seule</span> Vous pouvez consulter mais pas modifier (paiement en attente). Un bandeau vous en informe.',
          '<span style="background:#dc262622;color:#dc2626;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Bloqué / Désactivé</span> Accès restreint. Régularisez via la page Abonnement ou contactez le support.',
        ]} />
        <Warn>En mode lecture seule, les boutons d'enregistrement sont désactivés. Vous pouvez toujours créer une demande d'assistance pour débloquer votre compte.</Warn>
      </>
    ),
  },

  // ════════════════════════ RÉFÉRENTIEL ════════════════════════
  {
    id: 'referentiel-unites',
    icon: '📏',
    title: 'Référentiel — Unités',
    content: (
      <>
        <H2>📏 Référentiel — Unités de mesure</H2>
        <P>Les unités définissent comment vous quantifiez vos articles : kilogramme (kg), litre (L), gramme (g), pièce, portion, boîte… Elles sont <strong>obligatoires</strong> pour créer un article.</P>

        <H3>Créer une ou plusieurs unités</H3>
        <Steps items={[
          'Allez dans <strong>Référentiel → Unités</strong>.',
          'Cliquez sur <strong>"Ajouter des unités"</strong>.',
          'Saisissez le nom de l\'unité (ex. kg).',
          'Utilisez <strong>"+ Ajouter une ligne"</strong> pour en saisir plusieurs d\'un coup, puis <strong>Enregistrer</strong>.',
        ]} />

        <H3>Modifier / Supprimer</H3>
        <P>L'icône ✏️ permet de renommer. La suppression est <strong>bloquée</strong> si l'unité est utilisée par un article ayant des approvisionnements.</P>
        <Tip>Restez cohérent : utilisez la même unité pour l'achat et pour la recette d'un même article (ex. tout en kg) afin que les coûts soient justes.</Tip>
      </>
    ),
  },
  {
    id: 'referentiel-familles',
    icon: '🗂️',
    title: 'Référentiel — Familles',
    content: (
      <>
        <H2>🗂️ Référentiel — Familles</H2>
        <P>Une famille regroupe des catégories d'articles (ex. « Viandes », « Boissons », « Épicerie »). Chaque famille porte <strong>deux propriétés déterminantes</strong> :</P>
        <List items={[
          '<strong>Consommable</strong> — L\'article est consommé/transformé en cuisine (un ingrédient).',
          '<strong>Vendable</strong> — L\'article peut être vendu tel quel au client.',
        ]} />

        <H3>Pourquoi c'est important</H3>
        <P>Le croisement de ces deux propriétés détermine la nature des articles :</P>
        <List items={[
          '<span style="background:#16a34a22;color:#16a34a;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Consommable = Oui</span> → l\'article apparaît dans le stock et peut entrer dans les fiches techniques.',
          '<span style="background:#b4530922;color:#b45309;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Consommable = Non &amp; Vendable = Oui</span> → l\'article est <strong>valorisé</strong> : il se vend directement sans recette (voir « Articles Valorisés »).',
        ]} />
        <Rule>Un article ne devient « valorisé » que si sa famille est <strong>Vendable = Oui</strong> et <strong>Consommable = Non</strong>.</Rule>

        <H3>Créer / modifier une famille</H3>
        <Steps items={[
          'Allez dans <strong>Référentiel → Familles</strong>.',
          'Cliquez sur <strong>"Nouvelle famille"</strong>, saisissez le nom et cochez Consommable / Vendable selon le cas.',
          'Enregistrez. Vous pourrez modifier ces propriétés tant que cela reste cohérent avec vos articles.',
        ]} />
      </>
    ),
  },
  {
    id: 'referentiel-categories',
    icon: '🏷️',
    title: 'Référentiel — Catégories',
    content: (
      <>
        <H2>🏷️ Référentiel — Catégories d'articles</H2>
        <P>Les catégories affinent les familles (ex. dans la famille « Viandes » : « Bœuf », « Volaille »…). Elles servent à organiser et filtrer vos articles, et à les regrouper dans les fiches techniques et écrans de stock.</P>
        <Warn>Ne confondez pas les <strong>catégories d'articles</strong> (ce référentiel) avec les <strong>catégories de produits</strong> (Espace Produit), qui classent les articles vendables pour la vente.</Warn>

        <H3>Créer une catégorie</H3>
        <Steps items={[
          'Allez dans <strong>Référentiel → Catégories</strong>.',
          'Cliquez sur <strong>"Nouvelle catégorie"</strong>, choisissez la <strong>famille</strong> de rattachement et saisissez le nom.',
          'Vous pouvez créer plusieurs catégories en une fois (bouton "+ Ajouter une ligne").',
        ]} />
        <P>La suppression est bloquée si la catégorie contient des articles avec des approvisionnements.</P>
      </>
    ),
  },
  {
    id: 'referentiel-articles',
    icon: '🧂',
    title: 'Référentiel — Articles',
    content: (
      <>
        <H2>🧂 Référentiel — Articles</H2>
        <P>Les articles sont la matière première de votre gestion : ingrédients, matières, et produits achetés. Chaque article possède un nom, une unité, et (recommandé) une catégorie/famille.</P>

        <H3>Créer un article</H3>
        <Steps items={[
          'Allez dans <strong>Référentiel → Articles</strong>.',
          'Cliquez sur <strong>"Nouvel article"</strong>.',
          'Saisissez le nom, choisissez l\'<strong>unité</strong> et la <strong>catégorie</strong> (qui détermine la famille).',
          'Enregistrez. L\'article est alors disponible pour le stock et les fiches techniques.',
        ]} />
        <Tip>Si l'unité ou la catégorie manque, vous pouvez la créer à la volée depuis les listes déroulantes, sans quitter la page.</Tip>

        <H3>Affecter les articles aux activités</H3>
        <P>Un article doit être <strong>sélectionné</strong> pour une activité (ou un labo) afin d'y être approvisionné et utilisé. Cette sélection se fait depuis l'activité ou lors de la saisie du stock.</P>
      </>
    ),
  },
  {
    id: 'referentiel-import',
    icon: '📥',
    title: 'Référentiel — Import Excel',
    content: (
      <>
        <H2>📥 Référentiel — Ajout dynamique / Import Excel</H2>
        <P>Pour gagner du temps, importez votre catalogue d'articles en masse via un fichier Excel.</P>
        <Steps items={[
          'Allez dans <strong>Référentiel → Ajout Dynamique</strong>.',
          'Téléchargez le <strong>modèle Excel</strong> fourni.',
          'Remplissez une ligne par article (nom, unité, famille, catégorie).',
          'Importez le fichier : les unités, familles et catégories manquantes sont créées automatiquement.',
          'Vérifiez l\'aperçu puis validez.',
        ]} />
        <Warn>Respectez l'orthographe exacte des unités/familles/catégories existantes pour éviter les doublons.</Warn>
      </>
    ),
  },

  // ════════════════════════ ESPACE PRODUIT ════════════════════════
  {
    id: 'categories-produits',
    icon: '🏷️',
    title: 'Espace Produit — Catégories Produits',
    content: (
      <>
        <H2>🏷️ Catégories Produits</H2>
        <P>Les catégories de produits classent vos articles vendables pour la vente (ex. « Entrées », « Boissons », « Desserts »). Elles servent à organiser et regrouper les écrans de Configuration Vente et de saisie des ventes.</P>

        <H3>Le typage des catégories</H3>
        <P>Chaque catégorie est rattachée à <strong>un type</strong> obligatoire :</P>
        <List items={[
          '<span style="background:#05966922;color:#059669;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">🍽️ Produit vendable</span> pour les produits vendus directement.',
          '<span style="background:#d9770622;color:#d97706;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">➕ Supplément vendable</span> pour les suppléments.',
          '<span style="background:#0ea5e922;color:#0ea5e9;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">💎 Article valorisé</span> pour les articles valorisés.',
        ]} />
        <Rule>Lors de l'assignation d'une catégorie à un produit, seules les catégories du <strong>bon type</strong> sont proposées.</Rule>

        <H3>Créer une catégorie</H3>
        <Steps items={[
          'Allez dans <strong>Espace Produit → Catégories Produits</strong>.',
          'Cliquez sur <strong>"Nouvelle catégorie"</strong>, choisissez le <strong>type</strong> puis saisissez le ou les noms.',
          'Enregistrez. La colonne « Type » et le filtre vous aident à vous y retrouver.',
        ]} />
        <Tip>Un même nom peut exister pour deux types différents (ex. « Boissons » en vendable et en valorisé).</Tip>
      </>
    ),
  },
  {
    id: 'produits-vendables',
    icon: '🍔',
    title: 'Espace Produit — Produits Vendables',
    content: (
      <>
        <H2>🍔 Produits Vendables & Suppléments</H2>
        <P>Un <strong>produit vendable</strong> est un produit fini destiné à la vente (plat, formule…). Un <strong>supplément</strong> est un produit vendable complémentaire (sauce, accompagnement…). Tous deux sont définis par une fiche technique.</P>

        <H3>Créer un produit vendable</H3>
        <Steps items={[
          'Allez dans <strong>Espace Produit → Produits Vendables</strong> (onglet Produit ou Supplément).',
          'Cliquez sur <strong>"+ Produit vendable"</strong> (ou "+ Supplément").',
          'Saisissez le nom, une référence (optionnel) et choisissez la <strong>catégorie de produit</strong> (obligatoire).',
          'Composez la recette : ajoutez les <strong>articles</strong> et leurs portions, et éventuellement des <strong>produits utilisables</strong> (sous-produits).',
          'Affectez le produit à une ou plusieurs <strong>activités</strong>.',
        ]} />
        <Rule>La <strong>catégorie de produit est obligatoire</strong> pour tout produit vendable ou supplément (mais pas pour un produit utilisable).</Rule>

        <H3>Assigner les activités depuis la carte</H3>
        <P>Sous chaque carte produit, des pastilles d'activités permettent d'<strong>assigner / désassigner</strong> le produit en un clic. Une pastille ✓ verte indique que le produit est disponible dans cette activité.</P>

        <H3>Compteurs de la carte</H3>
        <List items={[
          '🧂 <strong>Articles</strong> — nombre d\'ingrédients de la recette.',
          '📦 <strong>Util.</strong> — nombre de produits utilisables (sous-produits) intégrés.',
        ]} />
        <Tip>Le coût de revient du produit est calculé automatiquement à partir de sa fiche technique (voir « Fiches Techniques & Formules »).</Tip>
      </>
    ),
  },
  {
    id: 'produits-utilisables',
    icon: '🧪',
    title: 'Espace Produit — Produits Utilisables',
    content: (
      <>
        <H2>🧪 Produits Utilisables (produits transformés)</H2>
        <P>Un <strong>produit utilisable</strong> (ou produit transformé, PT) est une préparation intermédiaire qui n'est pas vendue telle quelle mais <strong>réutilisée</strong> dans d'autres recettes (ex. une sauce, une pâte, un fond). Il possède sa propre fiche technique.</P>

        <H3>Créer un produit utilisable</H3>
        <Steps items={[
          'Allez dans <strong>Espace Produit → Produits Utilisables</strong>.',
          'Cliquez sur <strong>"+ Produit utilisable"</strong>, saisissez le nom et composez sa recette (articles + éventuels sous-produits).',
          'Assignez-le aux activités concernées via les pastilles.',
        ]} />

        <H3>Mise en stock</H3>
        <P>Un produit utilisable peut être <strong>activé dans le stock</strong> (bouton bascule sur la carte). Il est alors géré comme un article : on peut le produire, en suivre le stock, et le transférer.</P>
        <Formula label="Coût unitaire d'un produit utilisable" expr="Coût = Σ ( portion_article × prix_unitaire ) + Σ ( portion_sous_produit × coût_sous_produit )" note="Calcul récursif : le coût d'un sous-produit est lui-même calculé à partir de sa recette." />
        <Tip>Les produits utilisables permettent de mutualiser une préparation : son coût se répercute automatiquement dans tous les produits qui l'utilisent.</Tip>
      </>
    ),
  },
  {
    id: 'articles-valorises',
    icon: '💎',
    title: 'Espace Produit — Articles Valorisés',
    content: (
      <>
        <H2>💎 Articles Valorisés</H2>
        <P>Un <strong>article valorisé</strong> est un article vendu directement, sans recette : il provient d'une famille marquée <strong>Vendable = Oui</strong> et <strong>Consommable = Non</strong> (ex. une boisson en bouteille, un produit revendu en l'état).</P>

        <H3>Le rôle de cette page</H3>
        <P>Cette interface liste tous vos articles valorisables, <strong>regroupés par catégorie d'article</strong>. Vous y assignez à chacun sa <strong>catégorie de produit</strong> (de type « Article valorisé »).</P>
        <Steps items={[
          'Allez dans <strong>Espace Produit → Articles Valorisés</strong>.',
          'Utilisez les filtres (famille, statut, recherche) pour retrouver vos articles. La liste est paginée par 10 catégories.',
          'Pour chaque article, sélectionnez sa <strong>catégorie produit</strong> dans la liste déroulante. L\'enregistrement est immédiat.',
        ]} />
        <Rule>Seuls les articles valorisés <strong>ayant une catégorie</strong> apparaissent ensuite dans la Configuration Vente et la saisie des ventes.</Rule>
        <Warn>Si aucune catégorie de type « Article valorisé » n'existe encore, créez-la d'abord dans <strong>Catégories Produits</strong>.</Warn>

        <H3>Vente d'un article valorisé</H3>
        <P>À la vente, l'article valorisé est <strong>déduit directement du stock</strong> de l'article (pas de décomposition en ingrédients).</P>
      </>
    ),
  },
  {
    id: 'fiches-techniques',
    icon: '📋',
    title: 'Espace Produit — Fiches Techniques & Formules',
    content: (
      <>
        <H2>📋 Fiches Techniques & Calcul des coûts</H2>
        <P>La fiche technique décrit la composition d'un produit et calcule son <strong>coût de revient matière</strong>. C'est le cœur du chiffrage de votre carte.</P>

        <H3>Les modes de valorisation du coût</H3>
        <P>Le prix unitaire d'un article dans la recette peut être déterminé selon plusieurs modes :</P>
        <List items={[
          '<span style="background:#2563eb22;color:#2563eb;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Stock à date</span> Prix issu du stock à une date choisie (coût réel constaté).',
          '<span style="background:#7c3aed22;color:#7c3aed;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Manuel</span> Prix saisi manuellement, utile pour simuler ou figer un coût.',
          '<span style="background:#05966922;color:#059669;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Historique</span> Dernier prix d\'approvisionnement connu.',
          '<span style="background:#d9770622;color:#d97706;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Mixte</span> Stock par défaut, complété par un prix manuel pour les articles sans stock.',
        ]} />

        <H3>Formules de calcul</H3>
        <Formula label="Coût d'une ligne d'ingrédient" expr="Coût ligne = portion × prix unitaire" note="La portion est exprimée dans l'unité de l'article." />
        <Formula label="Coût total d'un produit" expr="Coût total = Σ ( coût des articles ) + Σ ( portion_SP × coût_unitaire_SP )" note="SP = sous-produit (produit utilisable). Le calcul descend récursivement dans chaque sous-produit." />
        <Formula label="Coût d'une portion vendue" expr="Coût portion = Coût total de la recette ÷ nombre de portions" note="Si la fiche est définie pour un rendement de N portions." />

        <Example>Une sauce (produit utilisable) coûte 8 DT/kg. Un plat utilise 0,15 kg de cette sauce + 0,2 kg de viande à 30 DT/kg. Coût = (0,15 × 8) + (0,2 × 30) = 1,2 + 6 = <strong>7,2 DT</strong>.</Example>

        <H3>Marge et prix de vente</H3>
        <Formula label="Marge brute" expr="Marge = Prix de vente HT − Coût matière" />
        <Formula label="Taux de marge" expr="Taux de marge (%) = ( Marge ÷ Prix de vente HT ) × 100" />
        <Formula label="Coefficient multiplicateur" expr="Coefficient = Prix de vente ÷ Coût matière" note="Un coefficient de 3 signifie un prix de vente égal à 3× le coût matière." />

        <H3>Export</H3>
        <P>Chaque fiche technique peut être <strong>exportée en Excel</strong> avec le détail des ingrédients, portions et coûts, pour archivage ou impression.</P>
      </>
    ),
  },

  // ════════════════════════ STOCK & APPRO ════════════════════════
  {
    id: 'stock-activites',
    icon: '📦',
    title: 'Stock & Appro — Stock Activités',
    content: (
      <>
        <H2>📦 Stock & Approvisionnements (Activités)</H2>
        <P>Cet écran suit, pour chaque article d'une activité : la quantité en stock, le prix d'achat, la TVA et le seuil minimum. C'est ici que vous enregistrez vos <strong>approvisionnements</strong> (achats / entrées).</P>

        <H3>Enregistrer un approvisionnement</H3>
        <Steps items={[
          'Allez dans <strong>Stock → Stock Activités</strong> et sélectionnez l\'activité.',
          'Sur la ligne de l\'article, saisissez la <strong>quantité</strong>, le <strong>prix HT unitaire</strong>, la <strong>TVA (%)</strong>, et le fournisseur / n° de facture (optionnel).',
          'Validez : le stock et le coût moyen sont mis à jour, et l\'entrée est tracée dans l\'historique.',
        ]} />

        <H3>HT, TVA et TTC</H3>
        <Formula label="Prix TTC" expr="TTC = HT × ( 1 + TVA ÷ 100 )" />
        <Formula label="Prix HT depuis le TTC" expr="HT = TTC ÷ ( 1 + TVA ÷ 100 )" />
        <Formula label="Montant de TVA" expr="TVA = HT × ( TVA% ÷ 100 )" />
        <Example>Un article acheté 10 DT HT avec 19 % de TVA coûte 10 × 1,19 = <strong>11,90 DT TTC</strong>.</Example>
        <Tip>Le coût matière des fiches techniques se base sur le prix <strong>HT</strong> (hors taxe récupérable). Le TTC sert au suivi des décaissements.</Tip>

        <H3>Stock actuel et seuil minimum</H3>
        <Formula label="Stock actuel" expr="Stock = Appro + Transferts entrants − Consommation (ventes / recettes) − Pertes ± Ajustements d'inventaire" />
        <P>Définissez un <strong>seuil minimum</strong> par article : lorsqu'il est atteint, l'article est signalé pour réapprovisionnement.</P>
      </>
    ),
  },
  {
    id: 'stock-labo',
    icon: '🏭',
    title: 'Stock & Appro — Stock Labo',
    content: (
      <>
        <H2>🏭 Stock Labo (mode Entreprise)</H2>
        <P>Le labo central reçoit les approvisionnements en gros et <strong>alimente les activités par transfert</strong>. Son écran de stock fonctionne comme celui des activités (appro, HT/TVA, seuils), mais à l'échelle du labo.</P>
        <List items={[
          'Approvisionnez les <strong>articles</strong> du labo.',
          'Gérez le stock des <strong>produits transformés</strong> (PT) fabriqués au labo.',
          'Suivez les seuils et l\'historique propres au labo.',
        ]} />
        <Tip>Le labo est utile pour mutualiser les achats et préparations entre plusieurs activités d'une même entreprise.</Tip>
      </>
    ),
  },
  {
    id: 'transferts',
    icon: '🔄',
    title: 'Stock & Appro — Transferts',
    content: (
      <>
        <H2>🔄 Transferts Labo → Activité</H2>
        <P>Le transfert déplace des articles (ou produits transformés) du <strong>labo</strong> vers une <strong>activité</strong>. Il diminue le stock du labo et augmente celui de l'activité, au coût du labo.</P>

        <H3>Effectuer un transfert</H3>
        <Steps items={[
          'Allez dans <strong>Stock → Transferts</strong> et choisissez le labo source.',
          'Sélectionnez l\'activité de destination et la date.',
          'Pour chaque article, saisissez la quantité à transférer.',
          'Un <strong>aperçu</strong> récapitule les mouvements ; confirmez pour valider.',
        ]} />
        <Warn>En cas de conflit (transfert déjà existant pour la même date/activité), une confirmation détaillée vous est demandée avant d'écraser ou compléter.</Warn>
        <P>Tous les transferts sont consultables dans l'<strong>historique des transferts</strong>.</P>
      </>
    ),
  },
  {
    id: 'inventaire',
    icon: '📋',
    title: 'Stock & Appro — Inventaire',
    content: (
      <>
        <H2>📋 Inventaire</H2>
        <P>L'inventaire réconcilie le <strong>stock théorique</strong> (calculé par l'application) avec le <strong>stock physique réel</strong> que vous comptez. L'écart est enregistré comme ajustement.</P>

        <H3>Réaliser un inventaire</H3>
        <Steps items={[
          'Allez dans <strong>Stock → Inventaire</strong> et sélectionnez l\'activité (ou le labo).',
          'Pour chaque article, saisissez la <strong>quantité réelle comptée</strong>.',
          'Validez : le stock est ajusté à la valeur réelle et l\'écart est tracé.',
        ]} />
        <Formula label="Écart d'inventaire" expr="Écart = Quantité réelle comptée − Stock théorique" note="Un écart négatif correspond à une perte/démarque ; positif à un surplus." />
        <Tip>Réalisez des inventaires réguliers pour fiabiliser vos coûts et détecter les pertes non saisies.</Tip>
      </>
    ),
  },
  {
    id: 'pertes',
    icon: '🗑️',
    title: 'Stock & Appro — Pertes',
    content: (
      <>
        <H2>🗑️ Pertes</H2>
        <P>Enregistrez les pertes pour qu'elles soient déduites du stock et valorisées dans vos rapports de coût.</P>
        <H3>Types de perte</H3>
        <List items={[
          '<span style="background:#dc262622;color:#dc2626;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Avarie</span> Produit abîmé, périmé, impropre.',
          '<span style="background:#d9770622;color:#d97706;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Déchet</span> Pertes de production, parures, casse.',
        ]} />
        <H3>Enregistrer une perte</H3>
        <Steps items={[
          'Depuis le stock de l\'activité (ou du labo), ouvrez la saisie de perte de l\'article.',
          'Indiquez la <strong>quantité</strong>, le <strong>type</strong> (avarie / déchet) et la date.',
          'Validez : le stock diminue et la perte est valorisée au prix unitaire courant.',
        ]} />
        <Formula label="Valeur d'une perte" expr="Valeur = quantité perdue × prix unitaire de l'article" />
        <P>Les pertes sont consultables et exportables (Excel / PDF) dans l'<strong>historique des pertes</strong>.</P>
      </>
    ),
  },
  {
    id: 'factures',
    icon: '🧾',
    title: 'Stock & Appro — Factures',
    content: (
      <>
        <H2>🧾 Factures d'approvisionnement</H2>
        <P>Regroupe les approvisionnements par <strong>facture fournisseur</strong>, pour rapprocher vos achats et suivre vos décaissements.</P>
        <List items={[
          'Consultez les factures par activité (ou labo) et par période.',
          'Chaque facture liste les articles, quantités, prix HT, TVA et totaux.',
          'Le n° de facture saisi à l\'approvisionnement relie automatiquement les lignes.',
        ]} />
        <Formula label="Total facture TTC" expr="Total TTC = Σ ( quantité × prix HT ) × ( 1 + TVA ÷ 100 )" note="Calculé ligne par ligne selon la TVA de chaque article." />
      </>
    ),
  },
  {
    id: 'historique',
    icon: '🕑',
    title: 'Stock & Appro — Historiques',
    content: (
      <>
        <H2>🕑 Historiques</H2>
        <P>Toutes vos opérations sont tracées et consultables, avec filtres par date, article et activité :</P>
        <List items={[
          '<strong>Historique des approvisionnements</strong> — toutes les entrées de stock (manuel, transfert, recette).',
          '<strong>Historique des pertes</strong> — avaries et déchets valorisés.',
          '<strong>Historique des inventaires</strong> — comptages et écarts.',
          '<strong>Historique des transferts</strong> — mouvements labo → activité.',
        ]} />
        <P>Le type d'entrée est étiqueté (Manuel, Transfert, Recette…) pour comprendre l'origine de chaque mouvement. Plusieurs historiques s'exportent en Excel/PDF.</P>
        <Tip>Utilisez les filtres de période pour préparer vos clôtures mensuelles et vos rapports.</Tip>
      </>
    ),
  },

  // ════════════════════════ ESPACE VENTE ════════════════════════
  {
    id: 'configuration-vente',
    icon: '💲',
    title: 'Espace Vente — Configuration Vente',
    content: (
      <>
        <H2>💲 Configuration Vente</H2>
        <P>Avant de vendre, définissez les <strong>prix de vente</strong> de vos articles. La page est organisée en onglets et les lignes sont <strong>regroupées par catégorie de produit</strong>.</P>

        <H3>Les onglets</H3>
        <List items={[
          '<span style="background:#b4530922;color:#b45309;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Produits</span> Produits vendables (hors suppléments).',
          '<span style="background:#b4530922;color:#b45309;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Suppléments</span> Produits suppléments.',
          '<span style="background:#0ea5e922;color:#0ea5e9;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Valorisés</span> Articles valorisés <strong>ayant une catégorie</strong> (assignée dans « Articles Valorisés »).',
          '<span style="background:#64748b22;color:#64748b;padding:2px 7px;border-radius:6px;font-size:0.76rem;font-weight:700">Historique</span> Suivi des changements de prix.',
        ]} />

        <H3>Définir un prix</H3>
        <Steps items={[
          'Activez l\'article via la case <strong>Vendable</strong>.',
          'Saisissez le <strong>prix direct</strong> (vente au comptoir).',
          'Pour chaque prestataire activé, saisissez son <strong>prix de vente dédié</strong> (saisie manuelle).',
          'Cliquez sur <strong>Enregistrer</strong> pour valider les modifications.',
        ]} />
        <Rule>Les prix prestataires sont <strong>saisis manuellement</strong>, prix par prix. Il n'y a pas de commission ni de prix calculé automatiquement.</Rule>
        <Warn>Dans l'onglet Valorisés, la catégorie ne s'assigne plus ici : elle se gère dans <strong>Espace Produit → Articles Valorisés</strong>.</Warn>
      </>
    ),
  },
  {
    id: 'charges',
    icon: '⚡',
    title: 'Espace Vente — Charges',
    content: (
      <>
        <H2>⚡ Charges d'exploitation</H2>
        <P>Renseignez vos charges (énergie, eau, emballages, main d'œuvre…) pour affiner l'analyse de rentabilité au-delà du seul coût matière.</P>
        <Steps items={[
          'Allez dans <strong>Espace Vente → Charges</strong>.',
          'Ajoutez chaque charge avec son libellé et son montant.',
          'Les charges sont prises en compte dans les rapports de marge et de rentabilité.',
        ]} />
        <Formula label="Marge nette (indicative)" expr="Marge nette = Prix de vente − Coût matière − Charges réparties" />
      </>
    ),
  },
  {
    id: 'saisie-ventes',
    icon: '🛒',
    title: 'Espace Vente — Saisie des Ventes',
    content: (
      <>
        <H2>🛒 Saisie des Ventes (Vente activités)</H2>
        <P>Enregistrez vos ventes par activité. Les articles sont présentés <strong>par catégorie</strong> et répartis en onglets : Produits, Suppléments, Valorisés.</P>

        <H3>Enregistrer des ventes</H3>
        <Steps items={[
          'Allez dans <strong>Espace Vente → Vente activités</strong> et choisissez la date.',
          'Pour chaque article, saisissez les quantités vendues en <strong>vente directe</strong> et/ou via chaque <strong>prestataire</strong>.',
          'Le prix appliqué est celui défini en Configuration Vente (le prix prestataire est le prix manuel configuré).',
          'Cliquez sur <strong>"Confirmer les ventes"</strong> ; un récapitulatif vous est présenté avant validation.',
        ]} />
        <Rule>Le prix prestataire affiché provient de la <strong>saisie manuelle</strong> en Configuration Vente. S'il n'est pas configuré, la mention « non configuré » apparaît — définissez-le d'abord.</Rule>

        <H3>Calculs</H3>
        <Formula label="Chiffre d'affaires d'une ligne" expr="CA = quantité vendue × prix de vente" />
        <Formula label="Marge d'une vente" expr="Marge = CA − ( quantité × coût matière unitaire )" />
        <P>À la confirmation, les quantités vendues <strong>déduisent le stock</strong> : les articles valorisés directement, les produits via la décomposition de leur fiche technique.</P>
        <Tip>Le total du CA se met à jour en direct en bas du tableau au fur et à mesure de la saisie.</Tip>
      </>
    ),
  },
  {
    id: 'rapports-vente',
    icon: '📈',
    title: 'Espace Vente — Rapports Vente',
    content: (
      <>
        <H2>📈 Rapports de Vente</H2>
        <P>Analysez vos performances commerciales : chiffre d'affaires, marges et quantités, par période, par produit et par canal (direct / prestataire).</P>
        <List items={[
          'Filtrez par <strong>période</strong>, <strong>activité</strong> et <strong>type</strong> (produit / supplément / valorisé).',
          'Visualisez le CA, le coût matière et la marge par produit.',
          'Exportez les données pour vos analyses.',
        ]} />
        <Formula label="Taux de marge global" expr="Taux (%) = ( ( CA − Coût matière total ) ÷ CA ) × 100" />
      </>
    ),
  },

  // ════════════════════════ GESTION ════════════════════════
  {
    id: 'activites',
    icon: '📍',
    title: 'Gestion — Activités',
    content: (
      <>
        <H2>📍 Activités</H2>
        <P>Une activité représente un point de vente / une cuisine. Selon votre formule, vous pouvez en gérer une (indépendant) ou plusieurs (entreprise).</P>
        <H3>Gérer vos activités</H3>
        <Steps items={[
          'Allez dans <strong>Gestion → Activités</strong>.',
          'Créez une activité (nom, type, et labo de rattachement si applicable).',
          'Sélectionnez les <strong>articles</strong> utilisés par l\'activité et, au besoin, ajustez les prix par activité.',
          'Vous pouvez <strong>dupliquer</strong> une activité pour réutiliser sa configuration.',
        ]} />
        <Warn>Le nombre d'activités dépend de votre abonnement. Une demande d'ajout peut être nécessaire au-delà de votre quota.</Warn>
      </>
    ),
  },
  {
    id: 'fournisseurs',
    icon: '🚚',
    title: 'Gestion — Fournisseurs',
    content: (
      <>
        <H2>🚚 Fournisseurs</H2>
        <P>Gérez vos fournisseurs pour les associer à vos approvisionnements et factures. Les fournisseurs peuvent être propres à une activité ou au labo.</P>
        <Steps items={[
          'Allez dans <strong>Gestion → Fournisseurs</strong> (ou Fournisseurs Labo).',
          'Ajoutez un fournisseur (nom, coordonnées).',
          'À l\'approvisionnement, sélectionnez le fournisseur pour tracer l\'origine de l\'achat.',
        ]} />
      </>
    ),
  },
  {
    id: 'gerants',
    icon: '🧑‍💼',
    title: 'Gestion — Gérants',
    content: (
      <>
        <H2>🧑‍💼 Gérants</H2>
        <P>Déléguez la gestion d'une activité ou d'un labo à un <strong>gérant</strong>. Son accès est limité à son périmètre.</P>
        <Steps items={[
          'Allez dans <strong>Gestion → Gérants</strong>.',
          'Ajoutez un gérant (nom, e-mail) et rattachez-le à une activité ou à un labo.',
          'Le gérant reçoit une <strong>invitation</strong> par e-mail pour activer son compte et définir son mot de passe.',
        ]} />
        <Warn>L'ajout de gérants peut être soumis à votre abonnement (option payante). Une demande peut être requise.</Warn>
      </>
    ),
  },
  {
    id: 'abonnement',
    icon: '💳',
    title: 'Gestion — Abonnement & Paiements',
    content: (
      <>
        <H2>💳 Abonnement & Paiements</H2>
        <P>Consultez votre formule, vos options (activités, labos, gérants, module vente) et votre historique de paiements.</P>
        <List items={[
          'Visualisez votre <strong>plan</strong> et son contenu.',
          'Suivez l\'<strong>historique des paiements</strong> (payé, en attente, remisé).',
          'Demandez des <strong>options supplémentaires</strong> (gérant, labo, module vente) — la demande est validée par le support.',
        ]} />
        <Warn>Un retard de paiement peut faire passer le compte en <strong>lecture seule</strong> puis le bloquer. Régularisez pour rétablir l'accès complet.</Warn>
      </>
    ),
  },
  {
    id: 'rapports',
    icon: '📊',
    title: 'Gestion — Rapports',
    content: (
      <>
        <H2>📊 Rapports de synthèse</H2>
        <P>Les rapports consolident votre activité : pertes, coûts matière, approvisionnements et états de stock, sur la période de votre choix.</P>
        <List items={[
          '<strong>Pertes</strong> — montant et détail des avaries/déchets.',
          '<strong>Coût matière</strong> — valorisation des consommations.',
          '<strong>Approvisionnements</strong> — achats par fournisseur / période.',
          '<strong>Stock</strong> — quantités et valeur du stock.',
        ]} />
        <P>Filtres disponibles : période, activité, article. Exports Excel/PDF pour vos clôtures.</P>
      </>
    ),
  },

  // ════════════════════════ COMPTE & AIDE ════════════════════════
  {
    id: 'compte',
    icon: '⚙️',
    title: 'Compte & Aide — Profil & Compte',
    content: (
      <>
        <H2>⚙️ Profil & Compte</H2>
        <P>Gérez vos informations personnelles et la sécurité de votre compte.</P>
        <Steps items={[
          'Allez dans <strong>Profil</strong> (menu en haut à droite ou bas du menu).',
          'Mettez à jour votre nom, e-mail et téléphone.',
          'Changez votre <strong>mot de passe</strong> régulièrement.',
        ]} />
        <Tip>À la première connexion, un assistant d'onboarding vous guide pour définir votre mot de passe et configurer vos premières activités.</Tip>
      </>
    ),
  },
  {
    id: 'assistant-ia',
    icon: '🤖',
    title: 'Compte & Aide — Assistant IA',
    content: (
      <>
        <H2>🤖 Assistant IA</H2>
        <P>Un assistant intelligent peut répondre à vos questions sur vos données (stock, ventes, coûts…) et vous aider au quotidien.</P>
        <List items={[
          'Posez vos questions en langage naturel depuis la page Assistant.',
          'Selon la configuration, l\'assistant peut aussi être disponible via messagerie (Telegram / WhatsApp).',
          'Il interroge vos données pour vous fournir des réponses contextualisées.',
        ]} />
        <Tip>Exemples de questions : « Quel est mon stock de poulet ? », « Quelles ont été mes ventes cette semaine ? ».</Tip>
      </>
    ),
  },
  {
    id: 'support',
    icon: '🆘',
    title: 'Compte & Aide — Support',
    content: (
      <>
        <H2>🆘 Support & Aide</H2>
        <P>Besoin d'aide ou d'un article/ingrédient manquant au référentiel ? Adressez une demande au support.</P>
        <Steps items={[
          'Allez dans <strong>Support</strong>.',
          'Choisissez le type de demande (aide, article manquant, option supplémentaire…).',
          'Décrivez votre besoin avec un maximum de détails et validez.',
        ]} />
        <P>Vous pouvez suivre le statut de vos demandes. Pour les questions d'abonnement, passez par la page <strong>Abonnement</strong>.</P>
        <Tip>Ce manuel reste votre première ressource : la plupart des réponses s'y trouvent, section par section.</Tip>
      </>
    ),
  },
];

const NAV_GROUPS = [
  { label: 'Prise en main', ids: ['demarrage', 'roles'] },
  { label: 'Référentiel', ids: ['referentiel-unites', 'referentiel-familles', 'referentiel-categories', 'referentiel-articles', 'referentiel-import'] },
  { label: 'Espace Produit', ids: ['categories-produits', 'produits-vendables', 'produits-utilisables', 'articles-valorises', 'fiches-techniques'] },
  { label: 'Stock & Appro', ids: ['stock-activites', 'stock-labo', 'transferts', 'inventaire', 'pertes', 'factures', 'historique'] },
  { label: 'Espace Vente', ids: ['configuration-vente', 'charges', 'saisie-ventes', 'rapports-vente'] },
  { label: 'Gestion', ids: ['activites', 'fournisseurs', 'gerants', 'abonnement', 'rapports'] },
  { label: 'Compte & Aide', ids: ['compte', 'assistant-ia', 'support'] },
];

export default function GuidePage() {
  const location = useLocation();
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      setActiveId(hash);
    }
  }, [location.hash]);

  const activeSection = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeId]);

  return (
    <div className="page" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af 0%,#3b82f6 100%)', padding: '20px 28px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            📖
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>Manuel d'utilisation</h1>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Guide complet de l'application LabFlow</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar with groups */}
        <nav style={{ width: 220, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '12px 0' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={{ padding: '8px 18px 4px', fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {group.label}
              </div>
              {group.ids.map((id) => {
                const s = SECTIONS.find((x) => x.id === id);
                if (!s) return null;
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 18px',
                      background: isActive ? '#eff6ff' : 'transparent',
                      border: 'none',
                      borderLeft: `3px solid ${isActive ? '#2563eb' : 'transparent'}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{s.icon}</span>
                    <span style={{ fontSize: '0.80rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#1d4ed8' : '#475569' }}>
                      {s.title.replace(/^.+? — /, '')}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Content */}
        <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', overscrollBehavior: 'contain' }}>
          <div style={{ maxWidth: 700 }}>
            {activeSection.content}
          </div>
        </div>
      </div>
    </div>
  );
}
