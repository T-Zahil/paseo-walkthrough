Walkthrough explique un changement comme le ferait un chef de produit, dans un panneau à côté de tes agents : ce qui change pour les utilisateurs, pourquoi ça compte pour le business, à quoi ressemblent les écrans et quoi vérifier avant de livrer. Pas de code.

Un agent lit le diff et le code autour, puis écrit un titre, une phrase qui résume le changement, un « en bref », les enjeux business (revenus, conversion, rétention, confiance, SEO, coûts, opérations) et une visite en étapes, dans l'ordre où un utilisateur rencontre le changement. Chaque étape signale les risques, les décisions à prendre et les questions ouvertes. Une review facultative note l'impact business sur 10 et liste ce qui peut mal tourner.

## Les écrans en vrai

Pour les projets web, le plugin lance le serveur de dev du worktree, ouvre chaque page ajoutée ou modifiée et la capture en version ordinateur et mobile. Les captures apparaissent sur la vue d'ensemble et dans chaque étape, avec ce qui change et où regarder.

Le plugin prend la première méthode de capture disponible :

1. La commande de capture des réglages du plugin.
2. Un script `scripts/qa-screenshots.ts` dans le projet.
3. Le Playwright installé dans le projet (`node_modules/.bin/playwright`), avec Chromium. Le plugin ne télécharge jamais Playwright ni de navigateur.

Il lance le serveur avec la commande des réglages, ou avec le script `dev` du projet sur un port libre. Les pages réservées aux utilisateurs connectés montrent la page de connexion, sauf si ta commande de capture se connecte. Les captures sont facultatives et se coupent dans les réglages.

## Lire un walkthrough

- La vue d'ensemble montre les écrans touchés, les étapes en cartes (vues, signalées) et une liste de choses à essayer avant de livrer.
- Sur ordinateur, `j` et `k` passent d'une étape à l'autre et `x` marque l'étape comme vue.
- Depuis une étape, envoie une question à un agent du workspace, ou lance une nouvelle session sur un worktree créé depuis la branche courante, avec un agent déjà briefé.

## Réglages

Choisis l'agent et le modèle, la langue du walkthrough (celle de l'app par défaut), la portée ouverte par défaut (cette branche, les modifs non commitées ou le dernier commit), la review, les commandes du serveur de dev et de capture, et des consignes en plus pour l'agent.

## Données et permissions

- Le diff, la liste des fichiers modifiés et tes consignes sont envoyés au provider d'agent que tu choisis, qui lit le reste du dépôt avec des commandes en lecture seule. Le plugin répond lui-même aux demandes de permission de l'agent : il accepte les commandes de lecture comme `git diff`, `grep` et `cat`, et refuse tout le reste.
- Les captures lancent le serveur de dev et la commande de capture de ton projet sur ta machine. Les pages sont chargées depuis `localhost` uniquement.
- Walkthroughs, captures et progression sont rangés dans le dossier git du worktree (`.git/paseo-walkthrough/`), jamais dans le dépôt.
- Les questions posées depuis une étape sont envoyées à l'agent choisi, avec le texte de l'étape et les fichiers concernés.
- Chaque génération coûte un tour d'agent ; le coût s'affiche sous le titre quand le provider le donne.

Nécessite Paseo 0.17 ou plus récent. Les captures fonctionnent sur macOS et Linux.
