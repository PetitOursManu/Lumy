---
title: Quitter Docsify
description: Convertir un site Docsify en une commande, liens et navigation compris.
audience: [admin]
source_hash: 99cea6d2f9ef
---

`lumy import docsify` lit un dossier Docsify et écrit un site Lumy à côté. Le dossier Docsify n’est pas modifié.

```bash
npx lumy import docsify ./docs --out ./docs-lumy --lang en,fr --title "Mon appli"
```

`--lang` liste les langues, la langue source en premier. Docsify garde la langue source à la racine et les autres dans des sous-dossiers (`fr/`) ou dans des fichiers `page.fr.md` ; les deux sont compris.

## Ce qui change

| Docsify | Lumy |
|---|---|
| `README.md` | `index.md` |
| `fr/page.md`, `page.fr.md` | `docs/fr/page.md` |
| Liens écrits depuis la racine du site | Liens écrits depuis le fichier, comme sur GitHub |
| `_sidebar.md` | `nav` dans lumy.config.json, noms de groupes repris du menu de chaque langue |
| `?> texte`, `!> texte` | `:::tip`, `:::warning` |
| `<div data-…-widget="nom">` | `:::widget nom` |
| Une ligne comme « English · Français » | Supprimée : Lumy dessine le menu des langues |
| Adresses `#/page` | Toujours valides, avec `"legacyHashRoutes": true` |

Les ancres de titres sont réécrites aussi : un lien vers `#première-utilisation` pointe toujours vers la bonne section.

## Les explications en blocs repliables

Si vos pages ouvrent des sections par une étiquette en gras dans une citation, comme `> **Pourquoi c’est ainsi —** …`, `--why` transforme ces citations en blocs `:::why` :

```bash
npx lumy import docsify ./docs --out ./docs-lumy --lang en,fr --why "Why it works this way,Pourquoi c'est ainsi"
```

## Après l’import

:::steps id=after-import
1. **Vérifiez le site.** Tout ce que Docsify tolérait et que Lumy refuse est listé.
   ```bash
   npx lumy check --root ./docs-lumy
   ```
2. **Marquez les traductions à jour.** L’import ne peut pas savoir quelles traductions étaient à jour ; si toutes l’étaient, dites-le une fois.
   ```bash
   npx lumy translations --root ./docs-lumy --stamp all
   ```
3. **Rangez la navigation.** Le menu est converti tel quel ; c’est souvent le moment de renommer les groupes.
4. **Portez vos widgets.** Déclarez chaque `:::widget` avec `Lumy.widget(nom, fn)` dans un script listé sous `scripts`.
:::
