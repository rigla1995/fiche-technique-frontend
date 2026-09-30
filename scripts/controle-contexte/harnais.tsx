// Harnais du contrôle du contexte (scripts/controle-contexte.mjs) : le VRAI AuthContext, le vrai
// useVocabulaire et le vrai i18n du dépôt, montés dans un navigateur sans backend (API bouchonnée par
// ./api-bouchon.ts). Hors de `src` : jamais compilé par `tsc -b` ni embarqué dans le build.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from '@front/context/AuthContext';
import { useVocabulaire } from '@front/hooks/useVocabulaire';
import '@front/i18n';
import { LEXIQUE_DEFAUT } from '@front/vocab/lexiqueDefaut';
import { resoudreLexique, vocabDefaut } from '@front/vocab/vocab';
import ESSAIS from '@front-scripts/vocab-lexiques-test.json';

const w = window as any;
w.__log = [];
w.__lexiques = {
  defaut: JSON.parse(JSON.stringify(LEXIQUE_DEFAUT)),
  hotellerie: resoudreLexique(LEXIQUE_DEFAUT, (ESSAIS as any).hotellerie),
  ceramique: resoudreLexique(LEXIQUE_DEFAUT, (ESSAIS as any).ceramique),
};
const ids = new WeakMap<object, number>();
let seq = 0;
const idDe = (o: object) => { if (!ids.has(o)) ids.set(o, ++seq); return ids.get(o); };
idDe(vocabDefaut); // id 1 = vocabulaire par défaut
const log = (e: Record<string, unknown>) => w.__log.push(e);

function Pont() {
  const a = useAuth();
  w.__auth = a;
  return null;
}

// Composant monté en permanence (comme Sidebar / Header une fois connecté).
function Ecran() {
  const { user, isLoading } = useAuth();
  const voc = useVocabulaire();
  const { t } = useTranslation();
  log({ c: 'Ecran', user: user?.email ?? null, isLoading, le: voc.le('labo'), t: t('client.labo.stock_title'), voc: idDe(voc) });
  useEffect(() => { log({ c: 'effet[voc]', voc: idDe(voc) }); }, [voc]);
  useEffect(() => { if (user) log({ c: 'effet[user]' }); }, [user]);
  return <div id="ecran">{voc.le('labo')} | {t('client.labo.stock_title')}</div>;
}

// Exemple de saisie (voc.ex) et libellé de fr.json à balise [[ex:…]] : l'exemple d'aujourd'hui tant que le
// vocabulaire est celui par défaut, l'exemple neutre construit pour les autres domaines. Aucun journal : ce
// composant ne compte pas dans les décomptes de rendus.
function Exemple() {
  const voc = useVocabulaire();
  const { t } = useTranslation();
  return <input id="exemple" readOnly placeholder={voc.ex('Ex: Poulet entier', `Ex: ${voc.Nom('article')} A`)} aria-label={t('client.entreprise.activity_nom')} data-defaut={String(voc.estDefaut)} />;
}

// Même forme que src/components/client/Profile.tsx : un effet dépendant de l'objet `user` recopie le
// user dans un formulaire. Une saisie en cours ne doit pas être écrasée par un retour sur l'onglet.
function Profil() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '' });
  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: user.name || '', phone: user.phone || '' }));
  }, [user]);
  if (!user) return null;
  return (
    <form>
      <input id="profil-nom" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      <input id="profil-tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
    </form>
  );
}

// Composant mémoïsé sans props qui n'emploie QUE t() : il doit se re-rendre quand le paquet est remplacé.
const Memo = React.memo(function Memo() {
  const { t } = useTranslation();
  log({ c: 'Memo', t: t('nav.activites') });
  return <span id="memo">{t('nav.activites')}</span>;
});

// Écran protégé, monté comme dans App.tsx : seulement quand isLoading est faux et user présent.
function EcranProtege() {
  const { user } = useAuth();
  const voc = useVocabulaire();
  const { t } = useTranslation();
  log({ c: 'EcranProtege', user: user?.email ?? null, le: voc.le('labo'), t: t('client.labo.stock_title'), voc: idDe(voc) });
  return <div id="protege">{voc.Nom('espace_labo')} | {t('nav.activites')}</div>;
}
function Garde() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p id="etat">chargement</p>;
  if (!user) return <p id="etat">login</p>;
  return <EcranProtege />;
}

// Hors provider : lecture tolérante.
function HorsProvider() {
  const voc = useVocabulaire();
  return <i id="hors">{voc.le('activite')}</i>;
}

const App = (
  <>
    <AuthProvider>
      <Pont />
      <Ecran />
      <Exemple />
      <Profil />
      <Memo />
      <Garde />
    </AuthProvider>
    <HorsProvider />
  </>
);
createRoot(document.getElementById('root')!).render(w.__strict ? <React.StrictMode>{App}</React.StrictMode> : App);
