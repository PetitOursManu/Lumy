---
title: Langues
description: Un dossier par langue, des lecteurs dans leur langue, et une alerte quand une traduction prend du retard.
audience: [writer, admin]
source_hash: 3c906aad7096
---

## Choisir les langues

Listez-les dans `lumy.config.json`. La première est la [[langue source|source-language]] : celle dans laquelle les pages sont écrites d’abord, et celle vers laquelle les autres se replient.

```json title="lumy.config.json"
{
  "languages": ["en", "fr", "de"]
}
```

Chaque langue a son dossier sous `docs/`, avec les mêmes noms de fichiers : `docs/en/install.md` et `docs/fr/install.md` sont la même page en deux langues. Tous les codes de langue fonctionnent ; le menu des langues affiche chacune dans sa propre langue.

## Ce que voit le lecteur

- À sa première visite, le lecteur arrive dans la langue que demande son navigateur, puis Lumy retient son choix.
- Changer de langue le garde sur la même page, à la même section.
- Une page pas encore traduite existe quand même dans chaque langue. Elle affiche le texte source, avec une note indiquant qu’elle n’est pas encore traduite : les liens et le menu ne cassent jamais.
- L’interface de Lumy (recherche, boutons, messages) existe en anglais, français, espagnol, allemand, italien et portugais. Pour une autre langue, ou pour changer un mot, ajoutez une section `ui` à la configuration :

```json title="lumy.config.json"
{
  "ui": {
    "nl": { "search": "Zoeken", "searchPlaceholder": "Zoek in de documentatie…" }
  }
}
```

## Garder les traductions à jour

Une traduction enregistre la version de sa source à partir de laquelle elle a été faite, sous la forme de `source_hash` dans son en-tête. Quand la page source change, les deux ne correspondent plus : `lumy check` et `lumy translations` signalent la page, et le lecteur voit une note l’invitant à lire la langue source.

:::steps id=translation-cycle
1. **Faites le point.** Pages manquantes, en retard et non vérifiées, par langue.
   ```bash
   npx lumy translations
   ```
2. **Mettez les traductions à jour.** Modifiez les fichiers, ou demandez-le à un assistant IA par [MCP](ai.md), qui enregistre l’empreinte tout seul.
3. **Marquez-les à jour.** Pour une page, une langue entière, ou tout le site.
   ```bash
   npx lumy translations --stamp fr/install
   npx lumy translations --stamp fr
   ```
:::

| État | Signification |
|---|---|
| à jour (current) | La traduction a été faite à partir de la source telle qu’elle est aujourd’hui |
| en retard (outdated) | La source a changé depuis ; le lecteur voit une note |
| non vérifiée (unverified) | Pas encore de `source_hash` : Lumy ne peut pas savoir |
| manquante (missing) | Aucun fichier dans cette langue ; le lecteur reçoit le texte source |

:::why Pourquoi une empreinte plutôt que les dates des fichiers ?
Les dates changent quand on clone un dépôt, qu’on copie un fichier, ou qu’on corrige une faute dans la traduction elle-même. Une empreinte du texte source ne change que lorsque le texte source change, et elle survit à toutes les copies.
:::
