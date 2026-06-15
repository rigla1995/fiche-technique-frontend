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
const Tag = ({ children, color = '#2563eb' }: { children: React.ReactNode; color?: string }) => (
  <span style={{ background: `${color}18`, color, padding: '2px 8px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 700, marginRight: 4 }}>
    {children}
  </span>
);
const Formula = ({ label, expr, note }: { label: string; expr: string; note?: string }) => (
  <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '10px 14px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#1e293b', fontWeight: 700 }}>{expr}</div>
    {note && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{note}</div>}
  </div>
);

interface Section {
  id: string;
  icon: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  // ─── RÉFÉRENTIEL ──────────────────────────────────────────────────────────
  {
    id: 'referentiel-unites',
    icon: '📏',
    title: 'Référentiel — Unités',
    content: (
      <>
        <H2>📏 Référentiel — Unités de mesure</H2>
        <P>Les unités de mesure définissent comment vous quantifiez vos articles : kilogramme (kg), litre (L), gramme (g), pièce, portion, boîte, etc. Elles sont obligatoires pour créer un article.</P>

        <H3>Créer une ou plusieurs unités</H3>
        <Steps items={[
          'Allez dans Référentiel → Unités de mesure.',
          'Cliquez sur <strong>"Ajouter des unités"</strong>.',
          'Une fenêtre s\'ouvre avec une ligne de saisie. Entrez le nom de l\'unité (ex. kg).',
          'Cliquez sur <strong>"+ Ajouter une ligne"</strong> pour saisir plusieurs unités à la fois.',
          'Cliquez sur <strong>"Enregistrer"</strong> pour valider.',
        ]} />
        <Tip>Vous pouvez créer plusieurs unités en une seule fois avec le bouton "Ajouter une ligne".</Tip>

        <H3>Modifier une unité</H3>
        <Steps items={[
          'Cliquez sur l\'icône ✏️ à droite de l\'unité.',
          'Modifiez le nom et enregistrez.',
        ]} />

        <H3>Supprimer une unité</H3>
        <P>La suppression est <strong>bloquée</strong> si l'unité est utilisée par au moins un article ayant des approvisionnements. Supprimez d'abord les articles concernés ou réassignez-les.</P>

        <H3>Ajout dynamique depuis la saisie</H3>
        <P>Lors de la création d'un article dans le référentiel, si l'unité souhaitée n'existe pas encore, vous pouvez la créer directement depuis le champ déroulant "Unité" sans quitter la page.</P>
      </>
    ),
  },
  {
    id: 'referentiel-familles',
    icon: '🗂️',
    title: 'Référentiel — Familles',
    content: (
      <>
        <H2>🗂️ Référentiel — Familles d'articles</H2>
        <P>Les familles sont le premier niveau de classification de vos articles (ex. Viandes, Épicerie, Boissons, Produits laitiers). Chaque catégorie appartient à une famille.</P>

        <H3>Créer des familles</H3>
        <Steps items={[
          'Allez dans Référentiel → Familles.',
          'Cliquez sur <strong>"Ajouter des familles"</strong>.',
          'Renseignez le nom de la famille.',
          'Définissez les deux attributs :',
          '&nbsp;&nbsp;• <strong>Consommable</strong> : si les articles de cette famille sont consommés en production.',
          '&nbsp;&nbsp;• <strong>Vendable</strong> : si les articles peuvent être vendus directement.',
          'Cliquez sur "Enregistrer".',
        ]} />

        <H3>Attributs Consommable et Vendable</H3>
        <P>Ces deux attributs sont configurables directement depuis la liste, via des <strong>interrupteurs inline</strong> (toggle), sans avoir à ouvrir une fenêtre de modification.</P>

        <H3>Supprimer une famille</H3>
        <P>Impossible si la famille contient des catégories ou des articles ayant des approvisionnements. Videz-la d'abord.</P>
      </>
    ),
  },
  {
    id: 'referentiel-categories',
    icon: '📁',
    title: 'Référentiel — Catégories',
    content: (
      <>
        <H2>📁 Référentiel — Catégories</H2>
        <P>Les catégories sont le deuxième niveau de classification, regroupées sous les familles. Exemple : Famille "Viandes" → Catégorie "Volailles", "Bœuf", "Agneau".</P>

        <H3>Créer des catégories</H3>
        <Steps items={[
          'Allez dans Référentiel → Catégories.',
          'Cliquez sur <strong>"Ajouter des catégories"</strong>.',
          'Pour chaque catégorie, renseignez le nom et sélectionnez la famille parente.',
          'Enregistrez.',
        ]} />
        <Tip>Filtrez la liste par famille avec le filtre en haut de page pour ne voir que les catégories d'une famille donnée.</Tip>

        <H3>Supprimer une catégorie</H3>
        <P>Bloquée si des articles de cette catégorie ont des approvisionnements. Réassignez ou supprimez les articles d'abord.</P>
      </>
    ),
  },
  {
    id: 'referentiel-articles',
    icon: '🥕',
    title: 'Référentiel — Articles',
    content: (
      <>
        <H2>🥕 Référentiel — Articles</H2>
        <P>Les articles sont vos matières premières et ingrédients. Un article doit être lié à au moins une activité ou un labo pour apparaître dans les stocks.</P>

        <H3>Créer un article (wizard en 2 étapes)</H3>
        <Steps items={[
          'Allez dans Référentiel → Articles.',
          'Cliquez sur <strong>"Ajouter un article"</strong>.',
          '<strong>Étape 1 :</strong> Renseignez le nom, l\'unité et la catégorie (tous requis).',
          '<strong>Étape 2 :</strong> Cochez les activités et/ou laboratoires auxquels l\'article est affecté (au moins un requis).',
          'Cliquez sur "Enregistrer".',
        ]} />
        <Warn>Un article doit être lié à au moins une activité OU un labo. Sans affectation, il n'apparaîtra dans aucun stock.</Warn>

        <H3>Ajout multiple (lot)</H3>
        <Steps items={[
          'Cliquez sur <strong>"Ajout multiple"</strong>.',
          'Une grille s\'affiche avec plusieurs lignes. Renseignez nom / unité / catégorie pour chaque article.',
          'Pour chaque ligne, cliquez sur le bouton d\'affectation pour choisir les activités/labos.',
          'Enregistrez toutes les lignes en une fois.',
        ]} />
        <Tip>L'ajout multiple est idéal lors du paramétrage initial de l'application pour saisir votre catalogue complet d'un coup.</Tip>

        <H3>Organisation hiérarchique</H3>
        <P>Les articles sont affichés groupés par <strong>Famille → Catégorie → Articles</strong>. Chaque groupe est repliable/dépliable.</P>

        <H3>Supprimer un article</H3>
        <P>Bloquée si l'article a des approvisionnements enregistrés. Dans ce cas, la suppression n'est pas possible pour garantir la cohérence des historiques.</P>
      </>
    ),
  },
  {
    id: 'referentiel-import',
    icon: '📥',
    title: 'Référentiel — Import Excel',
    content: (
      <>
        <H2>📥 Import en masse depuis Excel</H2>
        <P>Pour importer un grand nombre d'articles en une fois, utilisez l'import Excel. Le système crée automatiquement les unités, familles et catégories manquantes.</P>

        <H3>Procédure d'import</H3>
        <Steps items={[
          'Allez dans Référentiel → Import.',
          'Cliquez sur <strong>"Télécharger le modèle"</strong> pour obtenir le fichier Excel vierge.',
          'Remplissez le fichier : une ligne par article, avec les colonnes : <strong>Article | Unité | Catégorie | Famille</strong>.',
          'Maximum <strong>1 000 lignes</strong> par import.',
          'Uploadez le fichier rempli.',
          'Le système valide ligne par ligne et affiche les résultats.',
        ]} />

        <H3>Résultats de l'import</H3>
        <P>Après import, un rapport détaillé indique :</P>
        <ul style={{ paddingLeft: 20, fontSize: '0.84rem', color: '#374151', lineHeight: 1.75 }}>
          <li>Nombre d'articles créés</li>
          <li>Articles auto-affectés (trouvés et liés automatiquement)</li>
          <li>Catégories, familles et unités créées automatiquement</li>
          <li>Erreurs par numéro de ligne avec message explicatif</li>
        </ul>
        <Tip>Si une catégorie ou famille n'existe pas encore, elle est créée automatiquement lors de l'import.</Tip>
        <Warn>Vérifiez bien l'orthographe des unités existantes dans le fichier Excel — une faute crée une nouvelle unité au lieu de réutiliser l'existante.</Warn>
      </>
    ),
  },

  // ─── STOCK ────────────────────────────────────────────────────────────────
  {
    id: 'stock-activites',
    icon: '📦',
    title: 'Stock Activités',
    content: (
      <>
        <H2>📦 Stock Activités</H2>
        <P>Le stock activités regroupe tous les ingrédients utilisés par vos activités (cuisine, salle, etc.). C'est ici que vous enregistrez les approvisionnements reçus et les pertes constatées.</P>

        <H3>Saisir un approvisionnement</H3>
        <Steps items={[
          'Allez dans Stock → Activités.',
          'Sélectionnez l\'activité et la catégorie en haut de page.',
          'Dans la colonne <strong>Quantité</strong>, entrez la quantité reçue.',
          'Dans la colonne <strong>Prix HT</strong>, entrez le prix unitaire hors taxes.',
          'Si l\'article est soumis à la TVA, entrez le taux dans <strong>TVA (%)</strong>.',
          'Le panneau <strong>Aperçu saisie</strong> à droite se met à jour en temps réel.',
          'Cliquez sur <strong>"Enregistrer appro"</strong>.',
        ]} />
        <Tip>Le panneau Aperçu saisie peut être réduit (bouton ↓) s'il gêne. Cliquez sur la pill pour le rouvrir.</Tip>

        <H3>Confirmer et attacher une facture</H3>
        <Steps items={[
          'Une fenêtre de confirmation affiche le récapitulatif de l\'approvisionnement.',
          'Entrez la <strong>référence de la facture</strong> et sélectionnez le <strong>fournisseur</strong> (optionnel).',
          'Cochez <strong>"Timbre Fiscal"</strong> si la facture inclut 1 DT de timbre (actif par défaut).',
          'Cliquez sur "Confirmer" pour enregistrer.',
        ]} />

        <H3>Enregistrer une perte</H3>
        <Steps items={[
          'Dans la colonne <strong>Perte</strong>, saisissez la quantité perdue ou abîmée.',
          'Cliquez sur <strong>"Enregistrer pertes"</strong>.',
          'Les pertes sont tracées dans l\'historique des pertes.',
        ]} />

        <H3>Inventaire</H3>
        <Steps items={[
          'Allez dans Stock → Inventaire.',
          'Entrez le <strong>stock réel observé</strong> pour chaque article.',
          'Le système calcule l\'écart entre stock théorique et stock réel.',
          'Validez pour enregistrer l\'inventaire.',
        ]} />

        <H3>Panneau Aperçu Saisie</H3>
        <P>Lors de la saisie d'un approvisionnement, un panneau flottant s'affiche à droite avec :</P>
        <ul style={{ paddingLeft: 20, fontSize: '0.84rem', color: '#374151', lineHeight: 1.75 }}>
          <li>La liste des articles en cours de saisie</li>
          <li>La quantité et le prix unitaire TTC par article</li>
          <li>Le total TTC en bas du panneau</li>
        </ul>
        <P>Ce panneau peut être <strong>réduit</strong> (bouton ↓) en une petite pill flottante. Cliquez sur la pill pour l'agrandir à nouveau.</P>
      </>
    ),
  },
  {
    id: 'stock-labo',
    icon: '🧪',
    title: 'Stock Labo',
    content: (
      <>
        <H2>🧪 Stock Labo</H2>
        <P>Le stock labo gère les matières premières de votre laboratoire de production. Il fonctionne comme le stock activités mais est isolé par labo.</P>

        <H3>Approvisionner le labo</H3>
        <Steps items={[
          'Allez dans Labo → Stock Labo.',
          'Sélectionnez le labo concerné (si vous en avez plusieurs).',
          'Saisissez les quantités et prix pour chaque article reçu.',
          'Utilisez l\'onglet <strong>"Appro"</strong> puis cliquez sur "Enregistrer appro".',
          'Confirmez avec référence de facture et fournisseur (optionnels).',
        ]} />

        <H3>Enregistrer des pertes labo</H3>
        <P>Depuis l'onglet "Pertes" du stock labo, saisissez les quantités perdues et enregistrez.</P>

        <H3>Inventaire labo</H3>
        <P>Allez dans Labo → Inventaire pour enregistrer le stock physique réel du labo et constater les écarts.</P>
      </>
    ),
  },
  {
    id: 'transferts',
    icon: '🔄',
    title: 'Transferts',
    content: (
      <>
        <H2>🔄 Transferts Labo → Activités</H2>
        <P>Les transferts permettent de déplacer des articles du stock labo vers une ou plusieurs activités. C'est le flux de production : le labo fabrique/prépare, les activités consomment.</P>

        <H3>Créer un transfert</H3>
        <Steps items={[
          'Allez dans Labo → Transferts.',
          'Pour chaque article, saisissez la quantité à transférer vers chaque activité.',
          'Le panneau <strong>Aperçu saisie</strong> affiche le total en temps réel.',
          'Cliquez sur <strong>"Valider le transfert"</strong>.',
          'Une fenêtre de confirmation récapitule les mouvements avant validation finale.',
        ]} />
        <Warn>Un transfert débite le stock labo et crédite le stock de l'activité. L'opération est définitive une fois confirmée.</Warn>

        <H3>Historique des transferts</H3>
        <P>Allez dans Labo → Historique Transferts pour retrouver tous les transferts passés, filtrables par date, article et activité.</P>
      </>
    ),
  },

  // ─── FACTURES ─────────────────────────────────────────────────────────────
  {
    id: 'factures',
    icon: '🧾',
    title: 'Factures',
    content: (
      <>
        <H2>🧾 Factures d'approvisionnement</H2>
        <P>Les factures sont générées automatiquement à chaque approvisionnement. Elles regroupent les articles achetés avec leur fournisseur, date, montant HT et TTC.</P>

        <H3>Consulter les factures</H3>
        <Steps items={[
          'Allez dans Stock → Factures (ou Labo → Factures pour le labo).',
          'Les factures sont listées avec : <strong>fournisseur</strong>, référence, date, montant HT et TTC.',
          'Cliquez sur une facture pour voir le détail article par article.',
        ]} />

        <H3>Timbre Fiscal</H3>
        <P>Le timbre fiscal est une taxe fixe de <Tag>1,000 DT</Tag> optionnelle par facture. Activée par défaut lors de la confirmation d'un approvisionnement.</P>
        <Tip>Décochez "Timbre Fiscal" dans la fenêtre de confirmation si votre fournisseur ne l'applique pas.</Tip>

        <H3>Calcul du montant TTC</H3>
        <Formula label="Total TTC d'une facture" expr="Σ (Qté × Prix HT × (1 + TVA%)) + Timbre Fiscal" note="Si TVA = 0 ou non renseignée, Prix TTC = Prix HT pour cet article." />
        <P>Le montant TTC est toujours affiché, même sans TVA (dans ce cas TTC = HT).</P>
      </>
    ),
  },

  // ─── HISTORIQUES ──────────────────────────────────────────────────────────
  {
    id: 'historique',
    icon: '📊',
    title: 'Historiques',
    content: (
      <>
        <H2>📊 Historiques</H2>
        <P>Les historiques tracent tous les mouvements de stock : approvisionnements, pertes, transferts et inventaires.</P>

        <H3>Historique approvisionnements</H3>
        <Steps items={[
          'Allez dans Stock → Historique Appro.',
          'Filtrez par période, activité ou article.',
          'Chaque ligne affiche : article, quantité, prix HT, TVA, prix TTC, total.',
        ]} />
        <Formula label="Total TTC (historique)" expr="Σ Qté × (PrixTTC si TVA renseigné, sinon Prix HT)" note="Le total TTC est toujours ≥ Total HT." />

        <H3>Historique des pertes</H3>
        <P>Stock → Historique Pertes — liste toutes les pertes enregistrées par date, article et quantité.</P>

        <H3>Historique inventaires</H3>
        <P>Stock → Inventaire → Historique — liste les sessions d'inventaire avec les écarts constatés (théorique vs réel).</P>

        <H3>Historique transferts</H3>
        <P>Labo → Historique Transferts — liste tous les transferts labo→activités.</P>
      </>
    ),
  },

  // ─── PRODUITS ─────────────────────────────────────────────────────────────
  {
    id: 'produits',
    icon: '🍽️',
    title: 'Gestion des Produits',
    content: (
      <>
        <H2>🍽️ Gestion des Produits</H2>
        <P>Les produits sont les plats ou préparations composés d'articles du référentiel. Ils permettent de calculer le coût de revient (fiche technique).</P>

        <H3>Types de produits</H3>
        <ul style={{ paddingLeft: 20, fontSize: '0.84rem', color: '#374151', lineHeight: 1.75 }}>
          <li><Tag color="#2563eb">Vendable</Tag> — Produit vendu directement aux clients (plat à la carte, formule…)</li>
          <li><Tag color="#7c3aed">Utilisable</Tag> — Préparation intermédiaire utilisée comme ingrédient dans d'autres produits (sauce, pâte…)</li>
        </ul>

        <H3>Créer un produit</H3>
        <Steps items={[
          'Allez dans Produits (via le menu).',
          'Cliquez sur <strong>"Ajouter un produit"</strong>.',
          'Choisissez le type (Vendable ou Utilisable).',
          'Donnez un nom au produit.',
          'Sélectionnez les ingrédients (articles du référentiel) et leurs quantités.',
          'Vous pouvez inclure des produits "Utilisables" comme sous-composants.',
          'Enregistrez.',
        ]} />

        <H3>Modifier / Supprimer un produit</H3>
        <P>Cliquez sur le produit dans la liste pour accéder aux options d'édition. La suppression est définitive.</P>

        <H3>Export Excel</H3>
        <P>Vous pouvez exporter la liste des produits en Excel depuis le bouton "Exporter" en haut de la page produits.</P>
      </>
    ),
  },

  // ─── FICHES TECHNIQUES ────────────────────────────────────────────────────
  {
    id: 'fiches-techniques',
    icon: '📐',
    title: 'Fiches Techniques & Formules',
    content: (
      <>
        <H2>📐 Fiches Techniques & Formules de calcul</H2>
        <P>La fiche technique calcule le coût de revient (coût matière) d'un produit selon les prix réels des ingrédients. Elle peut être générée en Excel.</P>

        <H3>Accéder à une fiche technique</H3>
        <Steps items={[
          'Allez dans Produits → onglet <strong>"Fiche Technique"</strong>.',
          'Sélectionnez l\'activité (si vous en avez plusieurs).',
          'Choisissez le type de produit (Vendable ou Utilisable).',
          'Sélectionnez le produit.',
          'Choisissez le mode de tarification.',
        ]} />

        <H3>Modes de tarification</H3>
        <P><strong>FP Stock</strong> — utilise les prix issus des approvisionnements réels enregistrés dans le stock.</P>
        <P><strong>FP Manuel</strong> — vous saisissez manuellement les prix des ingrédients.</P>

        <H3>Méthodes de prix (FP Stock)</H3>
        <ul style={{ paddingLeft: 20, fontSize: '0.84rem', color: '#374151', lineHeight: 1.75, marginBottom: 12 }}>
          <li><Tag>DP</Tag> <strong>Dernier Prix</strong> — prix du dernier approvisionnement enregistré.</li>
          <li><Tag color="#7c3aed">MP</Tag> <strong>Moyenne des Prix</strong> — moyenne pondérée des prix depuis le dernier inventaire.</li>
        </ul>
        <Tip>Vous pouvez activer DP et MP simultanément pour comparer les deux calculs côte à côte.</Tip>

        <H3>Formules de calcul</H3>

        <Formula
          label="Prix TTC d'un article"
          expr="Prix TTC = Prix HT × (1 + TVA / 100)"
          note="Si TVA = 0 ou non renseignée : Prix TTC = Prix HT"
        />
        <Formula
          label="Coût matière d'un ingrédient"
          expr="Coût = Quantité utilisée × Prix unitaire (DP ou MP)"
        />
        <Formula
          label="Coût matière total du produit"
          expr="Coût Total = Σ (Qté_i × Prix_i) pour tous les ingrédients i"
          note="Si un ingrédient est un produit Utilisable, son coût total est calculé récursivement."
        />
        <Formula
          label="Dernier Prix (DP)"
          expr="DP = Prix HT du dernier approvisionnement enregistré pour cet article"
        />
        <Formula
          label="Moyenne des Prix (MP)"
          expr="MP = Σ (Qté_appro_j × Prix_appro_j) / Σ Qté_appro_j"
          note="Calculée depuis le dernier inventaire. MP = moyenne pondérée par les quantités."
        />
        <Formula
          label="Timbre Fiscal"
          expr="Total TTC facture = Σ (Qté × Prix TTC) + 1,000 DT (si timbre activé)"
        />

        <H3>Générer la fiche technique Excel</H3>
        <Steps items={[
          'Renseignez tous les prix (ou sélectionnez DP/MP en mode FP Stock).',
          'Cliquez sur <strong>"Générer la fiche technique"</strong>.',
          'Un fichier Excel <code>fiche-technique-{NomProduit}.xlsx</code> est téléchargé.',
        ]} />
        <Warn>Si un ingrédient a un prix à 0, un avertissement s'affiche avant la génération. Le fichier ne sera pas généré tant que tous les prix ne sont pas renseignés.</Warn>
      </>
    ),
  },

  // ─── FOURNISSEURS ─────────────────────────────────────────────────────────
  {
    id: 'fournisseurs',
    icon: '🏭',
    title: 'Fournisseurs',
    content: (
      <>
        <H2>🏭 Fournisseurs</H2>
        <P>Les fournisseurs peuvent être rattachés à vos factures d'approvisionnement pour un meilleur suivi des achats.</P>

        <H3>Ajouter un fournisseur</H3>
        <Steps items={[
          'Allez dans Stock → Fournisseurs (ou Labo → Fournisseurs).',
          'Cliquez sur <strong>"Ajouter un fournisseur"</strong>.',
          'Renseignez : nom (obligatoire), téléphone, email (optionnels).',
          'Enregistrez.',
        ]} />
        <P>Le fournisseur apparaît ensuite dans la liste déroulante lors de la confirmation d'un approvisionnement.</P>

        <H3>Modifier / Supprimer un fournisseur</H3>
        <P>Cliquez sur ✏️ pour modifier les informations. La suppression est possible à condition qu'aucune facture ne soit encore liée à ce fournisseur.</P>
      </>
    ),
  },

  // ─── COMPTE ───────────────────────────────────────────────────────────────
  {
    id: 'compte',
    icon: '👤',
    title: 'Profil & Compte',
    content: (
      <>
        <H2>👤 Profil & Compte</H2>

        <H3>Modifier mon profil</H3>
        <Steps items={[
          'Cliquez sur votre nom en haut à droite.',
          'Accédez à "Profil".',
          'Modifiez votre nom, email ou mot de passe.',
          'Enregistrez les changements.',
        ]} />

        <H3>Gérer les gérants</H3>
        <P>Un gérant est un utilisateur secondaire avec accès limité (pas d'accès abonnement ni paramètres principaux). Idéal pour déléguer la gestion quotidienne.</P>
        <Steps items={[
          'Allez dans Paramètres → Gérants.',
          'Cliquez sur <strong>"Inviter un gérant"</strong>.',
          'Entrez l\'email de la personne.',
          'Elle reçoit un email d\'invitation pour créer son compte.',
        ]} />

        <H3>Mon abonnement</H3>
        <P>Consultez votre abonnement actuel, les activités et labos inclus, les options tarifaires et l'historique de paiement dans <Tag color="#7c3aed">Paramètres → Abonnement</Tag>.</P>
        <Tip>Pour demander l'ajout d'activités, d'un labo ou de gérants supplémentaires, passez par Support → "Ajout de capacité".</Tip>
      </>
    ),
  },

  // ─── SUPPORT ──────────────────────────────────────────────────────────────
  {
    id: 'support',
    icon: '❓',
    title: 'Support & Aide',
    content: (
      <>
        <H2>❓ Support & Aide</H2>
        <P>Pour toute question ou problème, l'équipe support est accessible directement depuis l'application.</P>

        <H3>Envoyer une demande</H3>
        <Steps items={[
          'Allez dans <strong>Support</strong> (menu latéral gauche).',
          'Choisissez le type de demande :',
        ]} />
        <div style={{ paddingLeft: 16, marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <Tag>🥕 Ingrédient manquant</Tag>
            <span style={{ fontSize: '0.82rem', color: '#475569' }}>— Demander l'ajout d'un article absent du catalogue global</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Tag color="#7c3aed">➕ Ajout de capacité</Tag>
            <span style={{ fontSize: '0.82rem', color: '#475569' }}>— Demander des activités, labos ou gérants supplémentaires</span>
          </div>
          <div>
            <Tag color="#059669">💬 Besoin d'aide</Tag>
            <span style={{ fontSize: '0.82rem', color: '#475569' }}>— Signaler un problème ou décrire votre besoin</span>
          </div>
        </div>
        <Steps items={[
          'Remplissez le formulaire avec un maximum de détails.',
          'Envoyez la demande.',
          'Suivez l\'état dans la liste : <strong>En attente</strong> / <strong>Validée</strong> / <strong>Refusée</strong>.',
        ]} />
        <Warn>Plus votre description est précise, plus le support pourra traiter rapidement votre demande.</Warn>
      </>
    ),
  },
];

const NAV_GROUPS = [
  { label: 'Référentiel', ids: ['referentiel-unites', 'referentiel-familles', 'referentiel-categories', 'referentiel-articles', 'referentiel-import'] },
  { label: 'Stock & Appro', ids: ['stock-activites', 'stock-labo', 'transferts', 'factures', 'historique'] },
  { label: 'Produits', ids: ['produits', 'fiches-techniques'] },
  { label: 'Paramètres', ids: ['fournisseurs', 'compte', 'support'] },
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
