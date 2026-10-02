# archives-2b — écarts admis du lot 2b sans objet (lot 2c, étape O)

Spécification : `fiche-technique-backend/docs/lot-2c-spec.md` §2.7, point 1.

Depuis le réépinglage de `scripts/vocab-check.base` sur la tête de `develop` après le lot 2b (frontend `53b91f8`, base `1683d7b`), le mode
`identite` compare le code au code du 2b : les entrées qui admettaient les changements du 2b n'ont plus d'objet
(« allow sans objet » au mode `identite`, code de sortie 0). Elles sont archivées ici, comme `archives-2a/` au
lot 2b : l'outil ne lit que les `*.json` de `scripts/vocab-allow/`, jamais ses sous-dossiers. Raison : une entrée
`avant: null` restée sans objet absorberait en silence un nouveau littéral identique.

65 entrée(s), toutes de mode `identite` seul (explicite ou déduit), retirées de : `B6.json` (65 sur 143). Chaque fichier
d'ici porte, dans l'ordre d'origine, les entrées retirées du fichier de même nom. Les entrées des modes
`residuels` et `accords` restent dans `scripts/vocab-allow/`.

Contrôle après archivage : `identite`, `residuels`, `accords` à 0 dans les deux dépôts, aucune ligne
« allow sans objet » au mode `identite`.
