# Conventions du projet

## Version affichée

La version de l'application est affichée dans le pied de page (`index.html`,
`<span class="app-version">vX.Y.Z</span>`) pour vérifier d'un coup d'œil que la
mise en ligne a bien pris.

**Règle : à chaque push, incrémenter la version (patch) partout à la fois.**

Avant chaque `git push`, incrémenter le numéro de patch (le `Z` de `X.Y.Z`)
dans les trois endroits, qui doivent toujours rester synchronisés :

1. `index.html` — `<span class="app-version">vX.Y.Z</span>` dans le `<footer>`
2. `package.json` — champ `"version"`
3. `sw.js` — `const VERSION = 'sig-app-vN'` (incrémenter N) pour que le service
   worker force le rafraîchissement du cache chez les utilisateurs

Exemple : `v1.0.1` → `v1.0.2` (et `sig-app-v6` → `sig-app-v7`).
Passer à une version mineure/majeure (`1.1.0`, `2.0.0`) seulement pour une
grosse fonctionnalité ou un changement cassant.
