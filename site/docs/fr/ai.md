---
title: Assistants IA
description: Laissez Claude, ou tout client MCP, lire et écrire votre documentation. Donnez aux lecteurs tout le site en texte brut.
audience: [writer, admin]
source_hash: c8b81957138c
---

## Écrire la doc avec un assistant

`lumy mcp` lance un serveur [[MCP]] pour votre site. Un assistant qui s’y connecte peut lire chaque page, en écrire de nouvelles au bon endroit et au bon format, garder les traductions à jour, et vérifier le site à la recherche de liens cassés. Avant d’écrire, il lit un guide des blocs de Lumy : ses pages utilisent les étapes, les onglets et les encadrés comme les vôtres.

Connectez votre client :

:::tabs group=mcp-client
@tab Claude Code
```bash
claude mcp add lumy -- npx lumy mcp --root /chemin/vers/ma-doc
```
@tab Claude Desktop
```json title="claude_desktop_config.json"
{
  "mcpServers": {
    "lumy": {
      "command": "npx",
      "args": ["lumy", "mcp", "--root", "/chemin/vers/ma-doc"]
    }
  }
}
```
@tab Autres clients {#other-clients}
Tout client capable de lancer un serveur MCP en stdio convient. La commande est :
```bash
npx lumy mcp --root /chemin/vers/ma-doc
```
:::

Demandez ensuite ce dont vous avez besoin : « Documente le nouveau bouton d’export dans la page de l’interface, en anglais et en français », « Quelles pages françaises sont en retard ? Mets-les à jour. »

### Ce que l’assistant peut faire

| Outil | Ce qu’il fait |
|---|---|
| `get_guide` | Explique l’organisation des fichiers, l’en-tête des pages et les blocs de Lumy |
| `get_site` | Titre, langues, navigation |
| `list_pages` | Toutes les pages, avec leur état dans chaque langue |
| `read_page` | Le Markdown d’une page |
| `write_page` | Crée ou remplace une page et signale ses problèmes ; une traduction est marquée à jour |
| `translation_status` | Pages manquantes, en retard et non vérifiées, par langue |
| `search_docs` | Trouve les sections qui parlent de quelque chose |
| `check_site` | Construit le site à part et liste chaque avertissement |
| `set_nav` | Réécrit le menu dans lumy.config.json |

:::warning
Le serveur écrit des fichiers dans votre dossier de doc. Relisez ce qu’un assistant a écrit avant de le publier, comme pour tout autre auteur : `git diff` montre chaque modification.
:::

## Lire la doc avec un assistant

Chaque site construit sert aussi son contenu sous des formes qu’un assistant lit bien :

- **`/llms.txt`** : un index de toutes les pages avec leur description, selon la convention llms.txt.
- **`/llms-full.txt`** : toute la documentation dans un seul fichier, à coller dans une conversation.
- **Chaque page en Markdown** : ajoutez `index.md` à l’adresse d’une page. Le bouton **Copier la page**, en haut de chaque page, la copie pour vous.

## Répondre aux questions des lecteurs

Le panneau d’assistant (« Demander à l’IA ») répond aux lecteurs à partir de votre documentation, avec des liens vers les pages utilisées. Il a besoin d’un serveur qui détient la clé du modèle : il vient donc avec `lumy serve`, et le fournisseur (Ollama, OpenAI, Anthropic, Google, OpenRouter, fal.ai, Mistral, Groq ou tout serveur compatible OpenAI) se choisit dans le tableau de bord. Voir [Serveur et tableau de bord](server.md#lassistant). Lire la doc ne demande jamais de compte.

## Un serveur MCP distant

Un site servi par `lumy serve` répond aussi aux clients MCP en HTTP, à `/_lumy/mcp` : tout le monde peut lire un site public par ce biais, et écrire demande un jeton du tableau de bord. Voir [MCP distant](server.md#mcp-distant).
