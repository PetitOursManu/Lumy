---
title: Configuration
description: Chaque réglage de lumy.config.json.
audience: [admin]
source_hash: ac2c0469fc67
---

`lumy.config.json` se trouve à la racine du site. Seul `title` est nécessaire ; tout le reste a une valeur par défaut.

```json title="lumy.config.json"
{
  "title": "Mon appli",
  "description": "Ce que fait mon appli, en une phrase.",
  "languages": ["fr", "en"],
  "logo": "assets/logo.svg",
  "theme": { "brand": "#4f46e5" },
  "github": "https://github.com/moi/mon-appli",
  "editUrl": "https://github.com/moi/mon-appli/edit/main/docs/{path}",
  "nav": [
    { "group": { "fr": "Démarrer", "en": "Get started" }, "pages": ["index", "installation"] },
    { "group": "Référence", "pages": ["api", { "label": "Versions", "link": "https://github.com/moi/mon-appli/releases" }] }
  ]
}
```

## Site

| Clé | Par défaut | Ce qu’elle fait |
|---|---|---|
| `title` | `Documentation` | Le nom du site, dans l’en-tête et l’onglet du navigateur |
| `description` | | Utilisée quand une page n’a pas la sienne, et dans `llms.txt` |
| `url` | | L’adresse publique, comme `https://docs.example.com`. Active les liens canoniques et `sitemap.xml` |
| `base` | `/` | Le chemin sous lequel le site est servi, comme `/docs/` |
| `version` | | Une petite étiquette à côté du titre |
| `logo`, `favicon` | | Chemins dans le dossier de doc, comme `assets/logo.svg` |
| `docsDir`, `outDir` | `docs`, `dist` | Où les pages sont lues et où le site est écrit |

## Apparence

| Clé | Par défaut | Ce qu’elle fait |
|---|---|---|
| `theme.brand` | `#20796c` | La seule couleur de l’interface : liens, page courante, boutons |
| `theme.brandDark` | déduite | La même couleur pour le thème sombre ; éclaircie à partir de `brand` si absente |
| `theme.radius` | `12` | Arrondi des blocs, en pixels |
| `styles` | `[]` | Vos propres feuilles de style, chemins depuis la racine du site |
| `scripts` | `[]` | Vos propres scripts, pour les blocs propres au site |

Le lecteur choisit le thème clair ou sombre ; par défaut, le site suit son système.

## Navigation

| Clé | Ce qu’elle fait |
|---|---|
| `nav` | Les groupes de pages du menu. Le libellé d’un groupe est un texte, ou un texte par langue. Une page est son slug (`index` pour l’accueil), ou `{ "label", "link" }` pour un lien externe. Sans `nav`, un groupe par dossier. |
| `links` | Liens de l’en-tête : `{ "label", "href" }`, où `href` est le slug d’une page ou une adresse |
| `audiences` | Profils de lecteur pour le filtre du menu : `{ "id", "label" }`. Les pages déclarent le leur avec `audience` dans leur en-tête. |

## Langues

| Clé | Par défaut | Ce qu’elle fait |
|---|---|---|
| `languages` | `["en"]` | Codes de langue, ou `{ "code", "label" }`. La première est la langue source. |
| `ui` | | Vos propres mots pour l’interface de Lumy, par langue |

## Liens vers l’extérieur

| Clé | Ce qu’elle fait |
|---|---|
| `github` | Ajoute un bouton GitHub dans l’en-tête |
| `editUrl` | Adresse de « Modifier cette page » ; `{path}` est le fichier dans le dossier de doc |
| `issuesUrl` | Adresse de « Signaler un problème » |
| `outsideDocsUrl` | Où mènent les liens vers des fichiers hors du dossier de doc, comme le code source sur GitHub |

## Fonctionnalités

| Clé | Par défaut | Ce qu’elle fait |
|---|---|---|
| `search` | `true` | Champ de recherche et Ctrl K |
| `llms` | `true` | Écrit `llms.txt` et `llms-full.txt` |
| `feedback` | `false` | « Cette page vous a-t-elle aidé ? » en fin de page. Les votes sont enregistrés par `lumy serve`, ou envoyés à l’adresse que vous indiquez. |
| `assistant` | `false` | Le panneau « Demander à l’IA ». Demande `lumy serve`, ou une adresse qui répond. |
| `mcp` | `false` | Montre aux lecteurs l’adresse d’un serveur MCP distant pour le site |
| `legacyHashRoutes` | `false` | Envoie les anciennes adresses `#/page`, de Docsify, vers la bonne page |
