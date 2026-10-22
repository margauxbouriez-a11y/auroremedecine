# Med 4 Révisions

Plateforme de suivi des révisions de 4e année de médecine (EDN), construite à partir du Google Sheet **« Med 4 »** et organisée exactement comme lui.

## Organisation

| Onglet du classeur | Vue de la plateforme |
|---|---|
| 16 matières (urologie, néphrologie, orthopédie, cardiologie, rhumatologie, gynécologie, nutrition, endocrinologie, neurologie, neurochirurgie, pneumologie, pédiatrie, chir dig, gastro, santé publique, Pilly) | Un onglet par matière, avec les mêmes colonnes : **Item**, **Nom / Cours**, **Rédacteur ?**, **Nombre de fois vu**, **Dernière révision**, et les colonnes propres à certains onglets (**QCM**, **objectif manquant** en neurologie, note en neurochirurgie). La **Source du sommaire** (édition du référentiel et lien) est affichée en tête d'onglet. |
| externat | Les 367 items du programme avec le **collège rédacteur**, et les matières de ton classeur qui contiennent chaque item. |
| (nouveau) | **Tableau de bord** : avancement par matière (jamais vu / 1 / 2 / 3+), dernière révision, et liste des priorités : items dont le collège est rédacteur et jamais vus. |

Dans chaque onglet : recherche, filtres (Rédacteur ?, Nombre de fois vu), tri par colonne. Les boutons **+1 vu** et **Révisé** enregistrent la progression dans le navigateur (le Google Sheet n'est pas modifié).

## Mettre à jour les données

1. Dans Google Sheets : Fichier → Télécharger → Microsoft Excel (.xlsx).
2. `python3 scripts/extract.py chemin/vers/Med\ 4.xlsx` → met à jour `data/med4.json`
3. `python3 scripts/build.py` → régénère `index.html`
4. Commit + push.

## Mise en ligne

Settings → Pages → Deploy from a branch → `main` / `(root)`.
