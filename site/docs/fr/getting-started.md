---
title: Démarrage
description: Créer un site de documentation, le prévisualiser avec rechargement automatique, puis le construire.
audience: [writer, admin]
source_hash: de7a9a0bc9bb
---

## Prérequis

Node.js 22 ou plus récent. Rien d’autre : ni base de données, ni installation globale, ni compte.

## Installation

Choisissez comment lancer Lumy. Votre choix est retenu sur toutes les pages de ce site.

:::tabs group=install
@tab npm
```bash
npm install --save-dev lumy-docs
```
@tab pnpm
```bash
pnpm add -D lumy-docs
```
@tab Depuis GitHub {#from-github}
```bash
npm install --save-dev github:PetitOursManu/Lumy
```
:::

Une fois installée, la commande s’appelle `lumy` : `npx lumy dev`, `npx lumy build`.

## Votre premier site

:::vars
port = 4000 | Port de l’aperçu
:::

:::steps id=first-site
1. **Créez le site.** Dans un dossier vide, cette commande écrit la configuration et une première page dans chaque langue indiquée.
   ```bash
   npx lumy init --lang en,fr --title "Mon appli"
   ```
2. **Lancez l’aperçu.** Ouvrez l’adresse affichée. À chaque enregistrement d’un fichier, la page se recharge.
   ```bash
   npx lumy dev --port {{port}}
   ```
   Puis ouvrez `http://localhost:{{port}}/`.
3. **Écrivez.** Modifiez `docs/fr/index.md`, ajoutez des pages à côté, et listez-les sous `nav` dans `lumy.config.json`. [Rédiger les pages](writing.md) montre tout ce qu’une page peut contenir.
4. **Construisez.** Le site complet arrive dans `dist/`, prêt pour n’importe quel hébergeur statique.
   ```bash
   npx lumy build
   ```
:::

:::tip
Lancez `npx lumy check` avant de publier. La commande liste les liens cassés, les images manquantes, les blocs inconnus et les traductions en retard, et se termine en erreur quand quelque chose ne va pas : elle peut donc garder un pipeline de CI.
:::

## Ce que contient un site

```text title="ma-doc/"
lumy.config.json      titre, langues, navigation, couleurs
docs/
  assets/             images partagées par toutes les langues
  en/
    index.md          la page d’accueil
    getting-started.md
    glossary.md       facultatif : termes expliqués au survol
  fr/
    index.md          mêmes noms de fichiers dans chaque langue
dist/                 le site construit (lumy build)
```

Un site d’une seule langue peut mettre ses pages directement dans `docs/`.

## Les commandes

| Commande | Ce qu’elle fait |
|---|---|
| `lumy init [dossier]` | Crée un site : configuration et premières pages |
| `lumy dev` | Aperçu avec rechargement automatique |
| `lumy build` | Écrit le site statique dans `dist/` |
| `lumy serve` | Sert `dist/`, et enregistre les avis des lecteurs |
| `lumy check` | Signale les liens cassés, images manquantes, blocs inconnus |
| `lumy translations` | Montre les traductions manquantes ou en retard ; `--stamp` les marque à jour |
| `lumy mcp` | Permet à un assistant IA de lire et d’écrire la doc |
| `lumy import docsify <dossier>` | Convertit un site Docsify |

:::quiz
Vous avez modifié une page et voulez la voir. Que lancez-vous ?
- `lumy build`, puis ouvrir `dist/`
- [x] Rien : `lumy dev` recharge la page à l’enregistrement
- `lumy check`
> `lumy dev` reconstruit et recharge la page ouverte à chaque modification. On ne construit que pour publier.
:::
