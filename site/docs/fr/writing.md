---
title: Rédiger les pages
description: Du Markdown, plus une poignée de blocs qui transforment les instructions en actions.
audience: [writer]
source_hash: d471878c0317
---

Une page est un fichier Markdown. Tout ce que GitHub comprend fonctionne ici : titres, listes, tableaux, liens, images, listes de tâches, blocs de code. Lumy y ajoute des blocs qui s’ouvrent par `:::nom` et se ferment par une ligne ne contenant que `:::`.

Chaque exemple ci-dessous a deux onglets. **Résultat** montre ce que voit le lecteur, **Markdown** ce que vous écrivez. Choisissez-en un et tous les exemples de la page suivent.

## En-tête de page

Des réglages facultatifs en haut de la page, entre deux lignes `---`.

```yaml title="docs/fr/installation.md"
---
title: Installation       # sinon le premier « # Titre » sert de titre
description: Une phrase, affichée sous le titre et dans la recherche.
navTitle: Installer       # un libellé plus court pour le menu
audience: [writer, admin] # pour le filtre par profil de lecteur
badge: Nouveau            # un petit badge dans le menu
---
```

## Encadrés

:::tabs group=view
@tab Résultat {#result}
:::note
Les notes portent une information à ne pas manquer.
:::
:::tip Plus vite
Les astuces font gagner du temps. Un titre après le nom du bloc est facultatif.
:::
:::warning
Les avertissements évitent les erreurs qui coûtent quelque chose.
:::
:::danger
Le danger est réservé à ce qui ne se défait pas.
:::
@tab Markdown
````md
:::note
Les notes portent une information à ne pas manquer.
:::

:::tip Plus vite
Les astuces font gagner du temps. Un titre après le nom du bloc est facultatif.
:::

:::warning
Les avertissements évitent les erreurs qui coûtent quelque chose.
:::

:::danger
Le danger est réservé à ce qui ne se défait pas.
:::
````
Les alertes GitHub fonctionnent aussi : `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!IMPORTANT]`.
:::

## Des explications qui ne gênent pas

`:::why` contient la raison d’une instruction. L’instruction reste courte ; la raison est à un clic. `:::details` fait la même chose, sans l’étiquette « pourquoi ».

:::tabs group=view
@tab Résultat {#result}
Lumy écrit l’index de recherche dans un fichier à part.

:::why Pourquoi ne pas le mettre dans chaque page ?
L’index couvre tout le site. Ne le charger que lorsque le lecteur ouvre la recherche garde chaque page légère, et le fichier reste en cache après la première recherche.
:::
@tab Markdown
````md
Lumy écrit l’index de recherche dans un fichier à part.

:::why Pourquoi ne pas le mettre dans chaque page ?
L’index couvre tout le site. Ne le charger que lorsque le lecteur
ouvre la recherche garde chaque page légère, et le fichier reste
en cache après la première recherche.
:::
````
:::

## Onglets

Une ligne `@tab Libellé` commence chaque onglet. Avec `group=nom`, tous les blocs d’onglets du même groupe changent ensemble, sur cette page comme sur les suivantes : un lecteur qui choisit « Windows » une fois voit Windows partout.

:::tabs group=view
@tab Résultat {#result}
:::tabs group=os
@tab macOS
```bash
brew install node
```
@tab Windows
```bash
winget install OpenJS.NodeJS
```
@tab Linux
```bash
sudo apt install nodejs
```
:::
@tab Markdown
````md
:::tabs group=os
@tab macOS
```bash
brew install node
```
@tab Windows
```bash
winget install OpenJS.NodeJS
```
@tab Linux
```bash
sudo apt install nodejs
```
:::
````
:::

## Étapes

Une liste numérotée dans `:::steps` devient une liste à cocher. Le lecteur coche les étapes au fil de l’eau ; sa progression est gardée dans son navigateur. Le texte en gras au début de chaque élément en est le titre.

:::tabs group=view
@tab Résultat {#result}
:::steps id=demo
1. **Créez le dossier.** N’importe quel dossier vide convient.
2. **Lancez init.** La commande écrit la configuration et une première page.
3. **Lancez l’aperçu.** Laissez-le tourner pendant que vous écrivez.
:::
@tab Markdown
````md
:::steps id=demo
1. **Créez le dossier.** N’importe quel dossier vide convient.
2. **Lancez init.** La commande écrit la configuration et une première page.
3. **Lancez l’aperçu.** Laissez-le tourner pendant que vous écrivez.
:::
````
:::

## Vos valeurs dans les commandes

`:::vars` déclare des valeurs que le lecteur tape une seule fois. Partout où la page écrit `{{clé}}`, dans le texte, dans du code en ligne ou dans un bloc de code, c’est la valeur du lecteur qui apparaît, et « Copier » copie la commande prête à lancer. Les valeurs sont retenues d’une page à l’autre.

:::tabs group=view
@tab Résultat {#result}
:::vars
domain = docs.example.com | Votre domaine
port = 8080 | Port
:::

```bash
curl -I https://{{domain}}:{{port}}/
```
@tab Markdown
````md
:::vars
domain = docs.example.com | Votre domaine
port = 8080 | Port
:::

```bash
curl -I https://{{domain}}:{{port}}/
```
````
:::

## Capture annotée

`:::hotspots` place des points numérotés sur une image. Chaque ligne donne la position du point, en pourcentage de la largeur et de la hauteur de l’image, puis son titre et son texte. Le lecteur clique sur les points ou suit la visite avec **Suivant**. Sans JavaScript, les annotations s’affichent en liste.

:::tabs group=view
@tab Résultat {#result}
:::hotspots src=../assets/lumy-page.png alt="Une page de la documentation de Mocky, construite avec Lumy"
- 79.5,3.1 **Recherche** : Ctrl K n’importe où. Les fautes de frappe sont pardonnées et les résultats arrivent pendant la saisie.
- 91.6,3.1 **Langue et thème** : changer de langue garde le lecteur sur la même page ; le thème suit le système tant que le lecteur n’en choisit pas un.
- 9.3,13.5 **Profil de lecteur** : le lecteur peut masquer les pages qui ne le concernent pas. Chaque page indique son public dans son en-tête.
- 9.3,25.9 **Navigation** : tirée de `nav` dans lumy.config.json. Le menu garde sa position de défilement d’une page à l’autre.
- 71.1,20.5 **Copier la page** : la page en Markdown, pour un assistant IA, plus la source de la page et l’adresse MCP.
- 88.5,11.7 **Sur cette page** : suit la lecture. Sur téléphone, elle devient une liste déroulante sous l’en-tête.
:::
@tab Markdown
````md
:::hotspots src=../assets/lumy-page.png alt="Une page construite avec Lumy"
- 79.5,3.1 **Recherche** : Ctrl K n’importe où. Les fautes de frappe…
- 91.6,3.1 **Langue et thème** : changer de langue garde…
- 9.3,13.5 **Profil de lecteur** : le lecteur peut masquer…
- 9.3,25.9 **Navigation** : tirée de `nav` dans lumy.config.json…
- 71.1,20.5 **Copier la page** : la page en Markdown…
- 88.5,11.7 **Sur cette page** : suit la lecture…
:::
````
:::

:::tip Trouver les coordonnées
Ouvrez l’image dans une visionneuse qui affiche la position du curseur, puis divisez par la largeur et la hauteur de l’image. `50,50` est le centre.
:::

## Quiz

Une question pour vérifier la compréhension. `- [x]` marque la bonne réponse, une ligne `>` porte l’explication affichée quand le lecteur la trouve, et une ligne `?>` facultative donne un indice après une mauvaise réponse.

:::tabs group=view
@tab Résultat {#result}
:::quiz
Une page française n’a pas de `source_hash` dans son en-tête. Comment est-elle signalée ?
- En retard
- [x] Non vérifiée
- Manquante
> Sans empreinte, Lumy ne peut pas comparer la traduction à sa source : il ne peut dire ni qu’elle est à jour, ni qu’elle est en retard.
?> La page existe, elle n’est donc pas manquante.
:::
@tab Markdown
````md
:::quiz
Une page française n’a pas de `source_hash` dans son en-tête. Comment est-elle signalée ?
- En retard
- [x] Non vérifiée
- Manquante
> Sans empreinte, Lumy ne peut pas comparer la traduction à sa source…
?> La page existe, elle n’est donc pas manquante.
:::
````
:::

## Cartes

Des liens présentés en grille, pour les pages d’accueil et les vues d’ensemble. `cols` fixe le nombre de colonnes sur les grands écrans.

:::tabs group=view
@tab Résultat {#result}
:::cards cols=2
- [Langues](languages.md) Dossiers, pages de repli et état des traductions.
- [Mise en ligne](deploy.md) N’importe quel hébergeur statique, ou `lumy serve`.
:::
@tab Markdown
````md
:::cards cols=2
- [Langues](languages.md) Dossiers, pages de repli et état des traductions.
- [Mise en ligne](deploy.md) N’importe quel hébergeur statique, ou `lumy serve`.
:::
````
:::

## Glossaire

Les termes sont définis une fois, dans `docs/<langue>/glossary.md`, sous forme de sections `## Terme {#cle}`. Dans n’importe quelle page, `[[Terme]]` affiche la définition au survol ou au toucher, et `[[autres mots|cle]]` fait de même avec un autre texte. La page du glossaire est elle-même cherchable comme toute page.

:::tabs group=view
@tab Résultat {#result}
Lumy construit les [[blocs|block]] à l’avance et fournit un serveur [[MCP]].
@tab Markdown
````md
Lumy construit les [[blocs|block]] à l’avance et fournit un serveur [[MCP]].
````
````md title="docs/fr/glossary.md"
## Bloc {#block}

Une partie de page écrite entre `:::nom` et `:::`…
````
:::

## Code

Les blocs de code reçoivent un bouton de copie et des couleurs pour les langages courants (shell, JavaScript et TypeScript, JSON, YAML, CSS, HTML, Python, SQL, Dockerfile, INI et .env, diff). Après le langage, on peut donner un titre et des lignes à mettre en évidence.

:::tabs group=view
@tab Résultat {#result}
```js title="lumy.config.js" {2}
export default {
  title: 'Mon appli',
}
```
@tab Markdown
````md
```js title="lumy.config.js" {2}
export default {
  title: 'Mon appli',
}
```
````
:::

## Liens et images

Liez les autres pages par leur fichier, relativement à la page courante : `[Mise en ligne](deploy.md#github-pages)`. Lumy le transforme en la bonne adresse dans chaque langue, et `lumy check` signale les liens qui ne mènent nulle part. Les images vont dans `docs/assets/` ; depuis une page, écrivez `../assets/image.png`. Leur taille est lue à la construction, pour que le texte ne saute pas pendant leur chargement, et le lecteur peut les agrandir.

## Blocs propres au site

Pour un besoin propre à votre application, comme une liste vivante lue dans vos propres données, écrivez un bloc avec un nom et un texte de repli :

```md
:::widget presets source=styles
Les préréglages sont listés sur la page Design de l’application.
:::
```

Puis déclarez-le dans un script listé sous `scripts` dans `lumy.config.json` :

```js title="widgets.js"
Lumy.widget('presets', (el, { lang, attrs }) => {
  el.textContent = `Chargement de ${attrs.source} en ${lang}…`
})
```

Le texte de repli est ce que la recherche indexe et ce que voient les lecteurs sans JavaScript.
