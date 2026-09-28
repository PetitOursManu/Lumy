<p align="center">
  <img src="site/docs/assets/lumy.svg" width="72" alt="Lumy">
</p>

<h1 align="center">Lumy</h1>

<p align="center">Une documentation légère, multilingue et interactive. Écrivez du Markdown, obtenez un site statique rapide.</p>

<p align="center"><a href="README.md">English</a> · <strong>Français</strong></p>

<p align="center">
  <img src="site/docs/assets/readme-steps.png" width="900" alt="Une page Lumy : un menu, une liste d’étapes à cocher avec sa barre de progression, des commandes qui affichent le port choisi par le lecteur, et une table des matières.">
</p>

---

Lumy transforme un dossier de fichiers Markdown en un site de documentation qui s’affiche aussitôt, se lit bien sur téléphone, parle plusieurs langues et aide le lecteur à faire ce que la page décrit.

- **Léger.** Du HTML simple construit à l’avance, une feuille de style, un petit script. Aucun framework dans le navigateur, rien depuis un CDN tiers, une seule dépendance à la construction.
- **Facile à modifier.** Les pages sont en Markdown ; la navigation, les langues et les couleurs tiennent dans `lumy.config.json`.
- **Multilingue.** Un dossier par langue. Le lecteur arrive dans sa langue et garde sa place quand il en change ; une page non traduite s’affiche dans la langue source, et une traduction en retard sur sa source est signalée.
- **Interactif.** Des blocs qui font agir le lecteur : étapes à cocher, onglets retenus sur tout le site, ses propres valeurs dans les commandes, captures annotées, quiz, glossaire au survol, recherche tolérante aux fautes (Ctrl K).
- **Ouvert à l’IA.** `lumy mcp` permet à Claude, ou à tout client MCP, de lire et d’écrire la doc ; chaque site publie `llms.txt` et chaque page en Markdown.
- **Fluide.** Chaque interaction est animée, et toutes les animations s’arrêtent pour les lecteurs qui demandent moins de mouvement à leur système.
- **Aucun compte pour lire. Jamais.**

## Démarrage rapide

```bash
npm install --save-dev lumy-docs     # ou : npm install --save-dev github:PetitOursManu/Lumy
npx lumy init --lang fr,en --title "Mon appli"
npx lumy dev
```

Modifiez ensuite `docs/fr/index.md`. `npx lumy build` écrit le site dans `dist/`.

## Une page

```md
---
title: Installation
description: La lancer en cinq minutes.
---

:::vars
port = 8080 | Port
:::

:::steps id=install
1. **Démarrez le conteneur.**
   ```bash
   docker run -p {{port}}:8080 mon-appli
   ```
2. **Ouvrez-la.** Allez sur `http://localhost:{{port}}`.
:::

:::why Pourquoi le port 8080 ?
Parce que les ports sous 1024 demandent des droits supplémentaires sur la plupart des systèmes.
:::
```

Chaque bloc est décrit, avec un exemple vivant, dans la documentation : [`site/docs/fr/writing.md`](site/docs/fr/writing.md).

## Commandes

| Commande | Ce qu’elle fait |
|---|---|
| `lumy init [dossier]` | Crée un site |
| `lumy dev` | Aperçu avec rechargement automatique |
| `lumy build` | Écrit le site statique dans `dist/` |
| `lumy serve` | Sert `dist/` et enregistre les avis des lecteurs |
| `lumy check` | Signale liens cassés, images manquantes, blocs inconnus, traductions en retard |
| `lumy translations [--stamp]` | État des traductions ; `--stamp` les marque à jour |
| `lumy mcp` | Serveur MCP pour les assistants IA (stdio) |
| `lumy import docsify <dossier>` | Convertit un site Docsify |

## Documentation

La documentation de Lumy est écrite avec Lumy, en anglais et en français, dans [`site/`](site/) :

```bash
npm run dev        # then open http://localhost:4000
```

## Développement

```bash
npm install
npm test               # node:test, aucun autre outil
npm run dev        # la doc de Lumy, avec rechargement automatique
```

Le code est volontairement petit : `src/` contient la construction (Markdown, pages, recherche, langues, MCP), `theme/` la feuille de style et le script côté lecteur. `maquette/` garde la première maquette dont le design est issu.

## Licence

MIT. Les polices Geist de `theme/fonts/` sont sous licence SIL Open Font License (`theme/fonts/OFL.txt`).
