---
title: Mise en ligne
description: Publier le site construit sur n’importe quel hébergeur statique, ou le servir soi-même avec lumy serve.
audience: [admin]
source_hash: 91e0321d32ac
---

`lumy build` écrit un dossier de fichiers simples. Tout ce qui sait servir des fichiers peut l’héberger.

## GitHub Pages

Ce workflow reconstruit le site à chaque modification d’une page sur la branche principale.

```yaml title=".github/workflows/docs.yml"
name: Docs
on:
  push:
    branches: [main]
    paths: ['docs/**', 'lumy.config.json']
permissions:
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # tout l’historique, pour les dates « Mis à jour le »
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx lumy check
      - run: npx lumy build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

:::note
Quand le site vit à `https://moi.github.io/mon-appli/`, indiquez `"base": "/mon-appli/"` dans la configuration.
:::

## Votre propre serveur

:::vars
domain = docs.example.com | Domaine
:::

:::tabs group=server
@tab nginx
```nginx title="/etc/nginx/sites-available/docs"
server {
  server_name {{domain}};
  root /var/www/docs/dist;
  location / { try_files $uri $uri/ =404; }
  location /_lumy/ { expires 1y; add_header Cache-Control "public, immutable"; }
  error_page 404 /404.html;
}
```
@tab lumy serve
```bash
npx lumy build
npx lumy serve --host 0.0.0.0 --port 4000
```
Faites ensuite pointer votre reverse proxy pour `{{domain}}` vers le port 4000.
@tab Dashy
Zippez le contenu de `dist/` et importez le `.zip` dans Dashy comme application statique. Réglez `base` dans la configuration sur le chemin sous lequel Dashy sert l’application, puis reconstruisez avant de zipper.
:::

## lumy serve

`lumy serve` sert `dist/` et s’occupe de ce qu’un hébergeur statique ne sait pas faire :

- **Les avis.** Avec `"feedback": true`, les réponses à « Cette page vous a-t-elle aidé ? » sont écrites, une par ligne, dans `.lumy/feedback.jsonl` : la page, la réponse, le commentaire éventuel et l’heure. Pas de compte, pas de cookie, et au plus 20 votes par minute depuis une même adresse.

Il écoute sur `127.0.0.1` sauf si vous passez `--host 0.0.0.0` : il n’est joignable de l’extérieur que lorsque vous l’avez décidé.

:::why Pourquoi les fichiers du thème ont-ils une empreinte dans leur nom ?
Les navigateurs gardent longtemps les feuilles de style et les scripts. Quand leur contenu change, leur nom change avec lui : un lecteur ne reçoit jamais une nouvelle page avec une ancienne feuille de style, et le serveur peut demander aux navigateurs de garder les fichiers un an.
:::
