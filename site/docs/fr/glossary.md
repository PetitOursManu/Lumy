---
title: Glossaire
description: Les mots qu’emploie cette documentation, chacun défini une fois.
source_hash: b5a211da8ee5
---

## Bloc {#block}

Une partie de page écrite entre `:::nom` et `:::`, comme `:::steps` ou `:::tabs`. Lumy en fait quelque chose d’utilisable par le lecteur : une liste à cocher, des onglets, un quiz.

## Slug {#slug}

Le nom d’une page dans les adresses et les liens : le chemin de son fichier sans `.md`. `docs/fr/guide/setup.md` a pour slug `guide/setup` ; celui de la page d’accueil est `index`.

## Langue source {#source-language}

La première langue de `languages` : celle dans laquelle les pages sont écrites d’abord, et celle vers laquelle une page se replie quand elle n’a pas encore de traduction.

## Page de repli {#fallback}

Une page affichée dans la langue source parce qu’elle n’a pas de traduction dans la langue du lecteur. Une note le signale.

## Empreinte de traduction {#stamp}

Le `source_hash` enregistré dans l’en-tête d’une traduction : l’empreinte de la page source à partir de laquelle elle a été faite. Quand la source change, l’empreinte ne correspond plus et la traduction est signalée en retard.

## MCP {#mcp}

Model Context Protocol : un standard ouvert qui permet à un assistant IA d’utiliser des outils. `lumy mcp` donne à un assistant les outils pour lire et écrire votre documentation.

## llms.txt {#llms-txt}

Un index en texte brut d’un site, écrit pour les modèles de langue. Lumy l’écrit à la racine de chaque construction, avec `llms-full.txt` qui contient toutes les pages.
