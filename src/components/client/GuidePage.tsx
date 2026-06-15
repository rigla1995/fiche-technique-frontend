import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface Section {
  id: string;
  icon: string;
  title: string;
  content: React.ReactNode;
}

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', marginBottom: 12, marginTop: 0 }}>{children}</h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2563eb', marginBottom: 8, marginTop: 20 }}>{children}</h3>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.7, margin: '0 0 10px' }}>{children}</p>
);
const Steps = ({ items }: { items: string[] }) => (
  <ol style={{ paddingLeft: 20, margin: '0 0 12px' }}>
    {items.map((s, i) => (
      <li key={i} style={{ fontSize: '0.84rem', color: '#374151', lineHeight: 1.7, marginBottom: 4 }}>{s}</li>
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

const SECTIONS: Section[] = [
  {
    id: 'stock-activites',
    icon: '📦',
    title: 'Stock Activités',
    content: (
      <>
        <H2>📦 Stock Activités</H2>
        <P>Le stock activités regroupe tous les ingrédients utilisés par vos activités (cuisine, salle, etc.). C'est ici que vous enregistrez les approvisionnements reçus.</P>

        <H3>Saisir un approvisionnement</H3>
        <Steps items={[
          'Allez dans Stock → Activités.',
          'Sélectionnez la catégorie et/ou l\'activité à approvisionner.',
          'Dans la colonne "Quantité", entrez la quantité reçue pour chaque article.',
          'Dans la colonne "Prix HT", entrez le prix unitaire hors taxes.',
          'Si l\'article est soumis à la TVA, entrez le taux dans la colonne "TVA (%)".',
          'Le panneau "Aperçu saisie" à droite se met à jour en temps réel.',
          'Cliquez sur "Enregistrer appro" pour valider.',
        ]} />
        <Tip>Le panneau Aperçu saisie peut être réduit (bouton ↓) si il gêne la vue. Cliquez sur la pill pour le rouvrir.</Tip>

        <H3>Confirmer et attacher une facture</H3>
        <Steps items={[
          'Une fenêtre de confirmation s\'affiche avec le récapitulatif.',
          'Entrez la référence de la facture et sélectionnez le fournisseur (optionnel).',
          'Cochez "Timbre Fiscal" si la facture inclut 1 DT de timbre (activé par défaut).',
          'Cliquez sur "Confirmer" pour enregistrer.',
        ]} />

        <H3>Enregistrer une perte</H3>
        <P>Si un article a été perdu ou abîmé, saisissez la quantité perdue dans la colonne dédiée puis cliquez sur "Enregistrer pertes".</P>

        <H3>Faire un inventaire</H3>
        <P>Allez dans Stock → Inventaire. Entrez le stock réel observé pour chaque article. Le système calcule l'écart avec le stock théorique automatiquement.</P>
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
        <P>Le stock labo fonctionne comme le stock activités mais pour votre laboratoire de production. Il gère les matières premières du labo.</P>

        <H3>Approvisionner le labo</H3>
        <Steps items={[
          'Allez dans Labo → Stock Labo.',
          'Saisissez les quantités et prix pour chaque article reçu.',
          'Cliquez sur "Enregistrer appro" et confirmez.',
        ]} />
        <Tip>Même fonctionnement que le stock activités — le panneau Aperçu saisie est également disponible.</Tip>

        <H3>Consulter les factures labo</H3>
        <P>Allez dans Labo → Factures pour voir toutes les factures d'approvisionnement du labo, triées par fournisseur et date.</P>
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
        <P>Les transferts permettent de déplacer des articles du stock labo vers une ou plusieurs activités. C'est le flux de production : le labo fabrique, les activités consomment.</P>

        <H3>Créer un transfert</H3>
        <Steps items={[
          'Allez dans Labo → Transferts.',
          'Pour chaque article, saisissez la quantité à transférer vers chaque activité.',
          'Le panneau Aperçu saisie s\'actualise en temps réel.',
          'Cliquez sur "Valider le transfert".',
          'Une fenêtre de confirmation affiche le récapitulatif avant validation finale.',
        ]} />
        <Warn>Un transfert débit le stock labo et crédite le stock de l'activité. L'opération est irréversible une fois confirmée.</Warn>

        <H3>Consulter l'historique des transferts</H3>
        <P>Allez dans Labo → Historique transferts pour retrouver tous les transferts effectués avec leur date, quantités et activités concernées.</P>
      </>
    ),
  },
  {
    id: 'factures',
    icon: '🧾',
    title: 'Factures',
    content: (
      <>
        <H2>🧾 Factures d'approvisionnement</H2>
        <P>Les factures sont créées automatiquement à chaque enregistrement d'approvisionnement. Vous pouvez les consulter, filtrer et exporter.</P>

        <H3>Consulter les factures</H3>
        <Steps items={[
          'Allez dans Stock → Factures (ou Labo → Factures pour le labo).',
          'Les factures sont regroupées par fournisseur.',
          'Chaque carte affiche : fournisseur, référence, date, montant HT et TTC.',
        ]} />

        <H3>Le Timbre Fiscal</H3>
        <P>Le timbre fiscal est une taxe de <Tag>1,000 DT</Tag> ajoutée au montant TTC de la facture. Il est activé par défaut lors de la confirmation d'un approvisionnement.</P>
        <Tip>Vous pouvez le désactiver en décochant "Timbre Fiscal" dans la fenêtre de confirmation si la facture n'en inclut pas.</Tip>

        <H3>Montant TTC</H3>
        <P>Le montant TTC est toujours affiché, même si aucune TVA n'est appliquée. Dans ce cas, TTC = HT. Si des articles ont une TVA, le TTC = HT + TVA calculée.</P>
      </>
    ),
  },
  {
    id: 'historique',
    icon: '📊',
    title: 'Historiques',
    content: (
      <>
        <H2>📊 Historiques</H2>
        <P>Les historiques vous permettent de tracer tous les mouvements de stock : approvisionnements, pertes, transferts et inventaires.</P>

        <H3>Historique approvisionnements</H3>
        <Steps items={[
          'Allez dans Stock → Historique appro.',
          'Filtrez par date, activité ou article.',
          'Chaque ligne affiche : article, quantité, prix HT, TVA, prix TTC et total.',
          'Le total TTC en bas du tableau = somme de tous les articles (HT + TVA si applicable).',
        ]} />

        <H3>Historique des pertes</H3>
        <P>Allez dans Stock → Historique pertes pour voir tous les enregistrements de pertes avec les quantités et dates.</P>

        <H3>Historique inventaires</H3>
        <P>Allez dans Stock → Inventaire → Historique pour consulter les écarts d'inventaire enregistrés.</P>
      </>
    ),
  },
  {
    id: 'fournisseurs',
    icon: '🏭',
    title: 'Fournisseurs',
    content: (
      <>
        <H2>🏭 Fournisseurs</H2>
        <P>Les fournisseurs peuvent être rattachés à vos factures d'approvisionnement pour un meilleur suivi.</P>

        <H3>Ajouter un fournisseur</H3>
        <Steps items={[
          'Allez dans Stock → Fournisseurs (ou Labo → Fournisseurs).',
          'Cliquez sur "Ajouter un fournisseur".',
          'Renseignez le nom, téléphone et email (optionnels).',
          'Enregistrez.',
        ]} />
        <P>Le fournisseur sera disponible dans la liste déroulante lors de la confirmation d'un approvisionnement.</P>
      </>
    ),
  },
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
          'Allez dans "Profil".',
          'Modifiez votre nom, email ou mot de passe.',
          'Enregistrez les changements.',
        ]} />

        <H3>Gérer les gérants</H3>
        <P>Un gérant est un utilisateur avec un accès limité à l'application (pas d'accès à l'abonnement ni aux paramètres principaux).</P>
        <Steps items={[
          'Allez dans Paramètres → Gérants.',
          'Cliquez sur "Inviter un gérant" et entrez son email.',
          'Il recevra une invitation par email pour créer son compte.',
        ]} />

        <H3>Mon abonnement</H3>
        <P>Consultez votre abonnement, les activités incluses, et les options disponibles dans <Tag color="#7c3aed">Paramètres → Abonnement</Tag>.</P>
        <Tip>Pour ajouter des activités ou un labo, allez dans Support → Ajout de capacité.</Tip>
      </>
    ),
  },
  {
    id: 'support',
    icon: '❓',
    title: 'Support & Aide',
    content: (
      <>
        <H2>❓ Support & Aide</H2>
        <P>Si vous avez un problème ou une question, l'équipe support est disponible via la page Support de l'application.</P>

        <H3>Envoyer une demande</H3>
        <Steps items={[
          'Allez dans Support (menu latéral gauche).',
          'Choisissez le type de demande :',
        ]} />
        <div style={{ paddingLeft: 16, marginBottom: 10 }}>
          <div style={{ marginBottom: 6 }}>
            <Tag>🥕 Ingrédient manquant</Tag>
            <span style={{ fontSize: '0.82rem', color: '#475569' }}>— Demander l'ajout d'un article absent du catalogue</span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <Tag color="#7c3aed">➕ Ajout de capacité</Tag>
            <span style={{ fontSize: '0.82rem', color: '#475569' }}>— Demander plus d'activités, labos ou gérants</span>
          </div>
          <div>
            <Tag color="#059669">💬 Besoin d'aide</Tag>
            <span style={{ fontSize: '0.82rem', color: '#475569' }}>— Signaler un problème ou décrire votre besoin</span>
          </div>
        </div>
        <Steps items={[
          'Remplissez le formulaire et envoyez.',
          'Vous pouvez suivre l\'état de votre demande dans la liste (En attente / Validée / Refusée).',
        ]} />
        <Warn>Les demandes sont traitées par l'équipe dans les plus brefs délais. Pensez à être précis dans votre description.</Warn>
      </>
    ),
  },
];

export default function GuidePage() {
  const location = useLocation();
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  // Deep-link via URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      setActiveId(hash);
    }
  }, [location.hash]);

  const activeSection = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  // Scroll content to top on section change
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeId]);

  return (
    <div className="page" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg,#1e40af 0%,#3b82f6 100%)',
        padding: '20px 28px',
        flexShrink: 0,
      }}>
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

      {/* Body: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <nav style={{
          width: 220,
          flexShrink: 0,
          background: '#f8fafc',
          borderRight: '1px solid #e2e8f0',
          overflowY: 'auto',
          padding: '12px 0',
        }}>
          {SECTIONS.map((s) => {
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 18px',
                  background: isActive ? '#eff6ff' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${isActive ? '#2563eb' : 'transparent'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <span style={{ fontSize: '0.83rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#1d4ed8' : '#475569' }}>
                  {s.title}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px 36px',
            overscrollBehavior: 'contain',
          }}
        >
          <div style={{ maxWidth: 680 }}>
            {activeSection.content}
          </div>
        </div>
      </div>
    </div>
  );
}
