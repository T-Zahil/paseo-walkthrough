Walkthrough explique un changement comme le ferait un chef de produit, dans un onglet à côté des agents : ce qui change pour les utilisateurs, pourquoi ça compte pour le business, à quoi ressemblent les écrans et quoi vérifier avant de livrer. Pas de code.

Un agent lit le diff et le code autour, puis écrit un titre, une phrase qui résume le changement, un « en bref », les enjeux (revenus, conversion, rétention, confiance, SEO, coûts, opérations) et une visite en étapes, dans l'ordre où un utilisateur rencontre le changement. Chaque étape signale les risques, les décisions à prendre et les questions ouvertes. Une note d'impact sur 10 dit ce qui peut mal tourner.

## Les écrans en vrai

Le plugin lance le site du worktree, ouvre chaque écran ajouté ou modifié et le capture en version ordinateur et mobile. Les captures apparaissent sur la vue d'ensemble et dans chaque étape, avec ce qui change et où regarder.

Par défaut, il lance le script `dev` de `package.json` sur un port libre et capture avec `scripts/qa-screenshots.ts` s'il existe dans le projet. Les deux commandes se règlent dans les réglages. Pour capturer les écrans réservés aux membres, le script de capture doit pouvoir se connecter (avec needev : `QA_USER_EMAIL` et `QA_USER_PASSWORD` dans le `.env`). Le plugin réutilise aussi une session récente laissée par ce script dans un autre worktree du dépôt.

## Lire

- La vue d'ensemble montre les écrans touchés, les étapes en cartes (vues cochées, risques signalés) et une liste « À vérifier » à cocher.
- Sur desktop, `j` et `k` passent d'une étape à l'autre et `x` marque l'étape comme vue.
- Depuis une étape, envoie une question à un agent du workspace, ou lance une nouvelle session sur un worktree créé depuis la branche courante.

## Ce qu'il faut savoir

- La génération tourne dans un agent d'arrière-plan, en lecture seule : le plugin accepte ses commandes de lecture (`git diff`, `grep`, `cat`…) et refuse tout le reste.
- Le coût est celui d'un tour de l'agent choisi ; il s'affiche sous le titre quand le provider le donne.
- Walkthroughs, captures et progression sont rangés dans le dossier git du worktree (`.git/paseo-walkthrough/`), jamais dans le dépôt.
- Nécessite Paseo 0.17 ou plus récent.
