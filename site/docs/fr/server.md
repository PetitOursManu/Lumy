---
title: Serveur et tableau de bord
navTitle: Serveur et tableau de bord
description: lumy serve ajoute un tableau de bord, des comptes, une documentation privée, l’assistant des lecteurs et un serveur MCP distant.
audience: [admin]
source_hash: 505b1f266f4c
---

Un site statique suffit pour une documentation publique. `lumy serve` ajoute ce qu’un hébergeur statique ne sait pas faire, le tout réglé depuis un tableau de bord dans le navigateur :

- **Les avis des lecteurs**, enregistrés et résumés page par page.
- **L’assistant**, qui répond aux lecteurs à partir de la documentation avec le modèle de votre choix.
- **Un serveur MCP distant**, pour que des assistants lisent la doc, et l’écrivent avec un jeton.
- **Des comptes**, pour les personnes qui font vivre le site et, si vous le voulez, une **documentation privée**.

Lire un site public ne demande jamais de compte.

## Le lancer

:::tabs group=serve
@tab Node
```bash
npx lumy serve --host 0.0.0.0 --port 4000 --watch
```
`--watch` reconstruit le site quand une page change sur le disque, après un `git pull` par exemple.
@tab Docker
```bash
docker compose up -d
```
Avec le `docker-compose.example.yml` du dépôt, copié à côté de votre `lumy.config.json`. Voir [Docker](#docker) plus bas.
:::

Ouvrez ensuite `/_lumy/setup` sur votre site : le premier compte créé est l’administrateur. Ensuite, le tableau de bord se trouve à `/_lumy/admin`.

:::why Pourquoi le premier visiteur devient-il administrateur ?
Il n’y a personne d’autre à qui le demander. C’est aussi pour cela que `lumy serve` écoute sur `127.0.0.1` tant que vous ne passez pas `--host` : créez l’administrateur avant d’ouvrir le serveur au réseau, ou créez-le depuis l’environnement avec `LUMY_ADMIN_USER` et `LUMY_ADMIN_PASSWORD`.
:::

## Le tableau de bord

:::cards cols=3
- [Vue d’ensemble](#le-tableau-de-bord) Pages, traductions, avis et dernière construction, avec ses avertissements.
- [Avis](#le-tableau-de-bord) Votes et commentaires par page, les moins utiles d’abord.
- [Assistant](#lassistant) Le fournisseur, le modèle, la clé, et un bouton de test.
- [Accès](#comptes-et-acces) Qui peut lire, qui peut s’inscrire, les comptes.
- [MCP](#mcp-distant) L’adresse du serveur et les jetons d’accès.
- [Compte](#le-tableau-de-bord) Votre mot de passe.
:::

## Comptes et accès

| Rôle | Peut |
|---|---|
| Administrateur | Tout : réglages, comptes, clés de l’assistant |
| Rédacteur | Voir la vue d’ensemble et les avis, créer des jetons MCP pour écrire des pages |
| Lecteur | Lire une documentation privée |

- **Qui peut lire.** Publique : tout le monde, sans compte. Privée : seulement les comptes connectés ; chaque page, l’index de recherche et `llms.txt` sont fermés aux autres.
- **Inscriptions.** Fermées par défaut : l’administrateur ajoute les comptes. Ouvertes : tout le monde peut en créer un, avec le rôle que vous choisissez (lecteur ou rédacteur).

Les mots de passe sont hachés avec scrypt, les sessions durent 30 jours et se prolongent tant qu’on s’en sert, et les tentatives de connexion sont limitées à dix par minute et par adresse.

## L’assistant

Le lecteur ouvre **Demander à l’IA**, tape sa question et reçoit une réponse écrite à partir des sections de la documentation qui y correspondent le mieux, avec les sources en liens. Seules ces sections sont envoyées au modèle, jamais tout le site.

| Fournisseur | Modèle par défaut | Clé |
|---|---|---|
| Ollama (cloud ou local) | `gpt-oss:120b` | Clé Ollama Cloud ; aucune pour un Ollama local |
| OpenAI | `gpt-4o-mini` | Clé OpenAI |
| Anthropic | `claude-haiku-4-5` | Clé Anthropic |
| Google (Gemini) | `gemini-2.5-flash` | Clé Google AI Studio |
| OpenRouter | `openai/gpt-4o-mini` | Clé OpenRouter |
| fal.ai | `openai/gpt-4o-mini` | Clé fal (`id:secret`) |
| Mistral | `mistral-small-latest` | Clé Mistral |
| Groq | `llama-3.3-70b-versatile` | Clé Groq |
| Compatible OpenAI | le vôtre | si votre serveur en demande une : LM Studio, vLLM, LocalAI, Together… |

:::steps id=assistant-setup
1. **Choisissez un fournisseur.** Dans le tableau de bord, sous Assistant.
2. **Remplissez le modèle et la clé.** L’adresse est déjà la bonne pour chaque fournisseur, sauf le dernier.
3. **Testez.** Le tableau de bord envoie une question d’un mot et affiche le temps de réponse, ou l’erreur du fournisseur.
4. **Activez et enregistrez.** « Demander à l’IA » apparaît sur chaque page après la construction suivante, une seconde plus tard.
:::

Les clés sont chiffrées sur le serveur (AES-256-GCM) avec `LUMY_SECRET`, ou avec une clé créée dans le dossier de données quand il n’est pas défini. Elles ne sont jamais envoyées à un navigateur. Chaque visiteur peut poser 30 questions par heure par défaut ; le tableau de bord permet de changer ce nombre.

## MCP distant

Le serveur répond aux clients MCP à `/_lumy/mcp` (Streamable HTTP). Sur un site public, tout le monde peut utiliser les outils de lecture, comme tout le monde peut lire les pages. Écrire (`write_page`, `set_nav`) demande un jeton créé dans le tableau de bord, et le site est reconstruit après chaque modification.

:::vars
site = docs.example.com | Votre site
:::

```bash
claude mcp add --transport http docs https://{{site}}/_lumy/mcp --header "Authorization: Bearer lumy_…"
```

Un jeton n’est affiché qu’une fois. Révoquez-le depuis le tableau de bord si un appareil est perdu.

## Docker

```yaml title="docker-compose.yml"
services:
  lumy:
    build: https://github.com/PetitOursManu/Lumy.git
    ports:
      - "127.0.0.1:4000:4000"
    volumes:
      - ./:/site          # lumy.config.json et docs/
      - lumy-data:/data   # comptes, réglages, avis, site construit
    environment:
      LUMY_SECRET: remplacez-par-une-longue-chaine-aleatoire
    restart: unless-stopped
volumes:
  lumy-data:
```

Placez un reverse proxy devant `{{site}}`, et indiquez `LUMY_TRUST_PROXY: "1"` pour que les limites de débit voient l’adresse du lecteur plutôt que celle du proxy.

## Environnement

| Variable | Ce qu’elle fait |
|---|---|
| `LUMY_DATA_DIR` | Où vivent les comptes, les réglages et les avis. Par défaut : `.lumy/` à côté du site |
| `LUMY_OUT_DIR` | Où le site servi est construit. Par défaut : `outDir` de la configuration |
| `LUMY_SECRET` | Chiffre les clés d’API au repos. Définissez-la pour garder les clés lisibles quand le dossier de données change de place |
| `LUMY_ADMIN_USER`, `LUMY_ADMIN_PASSWORD` | Crée l’administrateur au premier démarrage |
| `LUMY_TRUST_PROXY` | `1` derrière un reverse proxy |

Le dossier de données contient de simples fichiers JSON : sauvegardez-le comme n’importe quel dossier.
