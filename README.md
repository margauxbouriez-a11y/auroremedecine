# Carnet de révisions · Med 4

Planning de révisions pour la 4e année de médecine (EDN). La page fonctionne seule sur GitHub Pages ; ses données et ses mises à jour automatiques tournent sur n8n.

## Ce que contient le site

- **Cours** : calendrier mensuel des révisions, colonnes « À faire » / « En cours » / « Faits » par matière, filtres par examen (Semestre 1, Semestre 2, Med 3) et par matière, tableau complet par matière, évènements (RDV, gardes, déj, dîner, sport).
- **QCM** : résultats EDN.fr par item, séries notées, carnet d'erreurs EDN (une par une ou tout afficher, export PDF).
- **LCA** : fiches LCA One (synchronisées) et articles des annales avec date et note.
- **Import / export Excel**, chrono et minuteur.

## Où sont les données

Tout passe par n8n :

| Workflow n8n | Rôle |
|---|---|
| Carnet de révisions — API | Lit et enregistre le carnet (table n8n « Carnet de révisions »), protégé par une clé |
| Carnet de révisions — Mise à jour EDN et LCA One | Tous les jours à 7h39 et 18h39 : résultats EDN.fr par item, nouvelles erreurs reformulées, fiches LCA One terminées |
| Carnet de révisions — Connexion EDN et LCA One (formulaire) | À ouvrir quand le carnet affiche « reconnecte-toi » : n8n se reconnecte et mémorise la session |

La page s'ouvre avec le lien qui contient la clé (`…/#k=…`) ; la clé reste ensuite enregistrée sur l'appareil. Tous les appareils voient le même carnet, mis à jour en moins d'une minute.

## Mise en ligne

Settings → Pages → Deploy from a branch → `main` / `(root)`.
