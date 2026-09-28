---
title: Lumy
navTitle: Introduction
description: Une documentation légère, multilingue et interactive. Écrivez du Markdown, obtenez un site statique rapide.
source_hash: a90b3baae175
---

Lumy transforme un dossier de fichiers Markdown en un site de documentation qui s’affiche aussitôt, se lit bien sur téléphone, parle plusieurs langues et aide le lecteur à faire ce que la page décrit, plutôt qu’à seulement la lire.

:::cards cols=2
- [Démarrage](getting-started.md) Créez un site et prévisualisez-le en deux minutes.
- [Rédiger les pages](writing.md) Du Markdown, plus des blocs qui font agir le lecteur : étapes, onglets, quiz.
- [Langues](languages.md) Un dossier par langue, et une alerte quand une traduction prend du retard.
- [Assistants IA](ai.md) Laissez Claude, ou tout client MCP, lire et écrire votre doc.
:::

## Pourquoi Lumy

- **Léger.** Les pages sont du HTML simple, construit à l’avance. Le lecteur télécharge une feuille de style, un petit script et la page elle-même. Rien ne vient d’un CDN tiers.
- **Facile à modifier.** Le contenu est du Markdown. La navigation, les langues et les couleurs tiennent dans un seul fichier, `lumy.config.json`.
- **Multilingue.** Le lecteur arrive dans sa langue et reste au même endroit quand il en change. Une page non traduite s’affiche dans la langue source ; une traduction en retard le signale.
- **Pensé aussi pour le téléphone.** Le menu devient un tiroir, la table des matières une liste déroulante, et les tableaux et le code trop larges défilent sans casser la page.
- **Interactif.** Les [[blocs|block]] transforment les instructions en actions : cocher des étapes, choisir un onglet une fois pour tout le site, taper ses propres valeurs dans les commandes, explorer une capture annotée, vérifier qu’on a compris.
- **Ouvert à l’IA.** Chaque page existe aussi en Markdown, le site publie `llms.txt`, et un serveur [[MCP]] permet à un assistant d’écrire des pages pour vous.

:::why Pourquoi un outil de documentation de plus ?
Lumy est né de la documentation de Mocky, devenue trop grande pour son premier outil : l’apparence demandait des centaines de lignes de retouches, les pages étaient téléchargées depuis GitHub à chaque visite, et rien n’aidait le lecteur à mettre en pratique ce qu’il lisait. Lumy garde ce qui marchait, du Markdown simple et aucune infrastructure, et intègre le reste à l’outil.
:::

## En bref

| Quoi | Comment |
|---|---|
| Résultat | Du HTML statique, que n’importe quel hébergeur sait servir |
| Script envoyé au lecteur | Un fichier, sans framework |
| Dépendances | Un analyseur Markdown, seulement à la construction |
| Langues | Toutes ; l’interface de Lumy existe en anglais, français, espagnol, allemand, italien et portugais |
| Comptes | Aucun pour lire. Jamais. |
| Licence | MIT |
