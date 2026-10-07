import { Suspense, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EnteteCompta from './EnteteCompta';
import MenuCompta from './MenuCompta';
import { AccesComptaProvider } from './FournisseurAcces';
import { NotificationProvider } from '../context/NotificationContext';
import './compta.css';

// Mise en page des pages connectées de LabFlow Compta : celle de LabFlow (src/components/common/Layout.tsx) — barre du
// haut, menu de gauche, contenu sur le fond de LabFlow. Connexion exigée ; tout rôle est admis à cette étape (l'accueil
// dit à chacun quelles comptabilités lui sont ouvertes).
export default function LayoutCompta() {
  const { user, isLoading } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);

  if (isLoading) return <div className="page-loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  // S3a : les accès de la personne (menu, pages réservées) sont lus une fois pour toute la mise en page.
  // S3c : la cloche de LabFlow Compta (notifications de LabFlow Compta seulement).
  return (
    <AccesComptaProvider>
    <NotificationProvider produit="compta">
    <div className="app-layout">
      <EnteteCompta onMenu={() => setMenuOuvert((v) => !v)} />
      <div className="layout-body">
        <MenuCompta ouvert={menuOuvert} onFermer={() => setMenuOuvert(false)} />
        <main className="main-content">
          {/* Page chargée à la demande : attente claire dans la mise en page (jamais l'écran sombre de la connexion). */}
          <Suspense fallback={<div className="loading-text">Chargement…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
    </NotificationProvider>
    </AccesComptaProvider>
  );
}
