# 🖊️ Application de signature

Une application web moderne et intuitive pour **signer** et **éditer** vos
documents (PDF ou images), 100 % côté navigateur et fonctionnelle hors ligne (PWA).

L'application propose deux services, accessibles depuis la barre de navigation
en haut de l'écran :

## ✍️ Service « Signature »

- **Upload de documents** : PDF et images (JPG, PNG…)
- **Signature électronique** : dessinez votre signature au doigt ou à la souris
- **Paraphe** : ajoutez un paraphe (optionnel) sur les pages
- **Surligneur** : annotez / surlignez le document
- **Personnalisation** : couleur, épaisseur, taille et position
- **Fond transparent** : la signature et le paraphe sont intégrés sans fond blanc
- **Téléchargement PDF** : exportez le document signé

## 📝 Service « Éditeur PDF »

Un éditeur type Word, par calque, aplati dans le PDF à l'enregistrement :

- **Modifier texte** : toutes les lignes de texte du PDF sont surlignées et
  cliquables — cliquez sur une ligne pour la réécrire (couleur d'origine
  reprise automatiquement). L'original est masqué et remplacé à l'export.
- **Texte** : ajoutez des zones de texte éditables (couleur, taille, gras)
- **Image** : insérez des images, déplaçables et redimensionnables
- **Forme** : ajoutez des rectangles
- **Cache** : recouvrez / masquez du contenu existant (pour le remplacer)
- **Déplacement / redimensionnement / suppression** de chaque élément
- **Export** : tout est aplati dans un PDF téléchargeable

> Remarque sur « Modifier texte » : un PDF ne stocke pas des paragraphes
> rééditables mais des glyphes positionnés. La modification fonctionne donc en
> recouvrant l'original (rectangle blanc) et en redessinant le nouveau texte au
> même endroit, en police standard. Résultat fidèle sur les PDF simples à fond
> uni ; imparfait sur fonds colorés, images ou documents scannés (OCR non géré).

## 📷 Service « Scanner »

Transformez une photo de document en scan « qualité imprimante », 100 % dans
le navigateur (aucune image n'est envoyée sur un serveur) :

- **Capture** : appareil photo (mobile) ou image existante
- **Détection automatique des coins** (trois stratégies combinées) :
  contours de Canny multi-seuils, segmentation d'Otsu (gris + canal
  « papier » clair et peu saturé), et transformée de Hough (bords en tant
  que droites dominantes — reconstruit les coins masqués par un doigt) ;
  sélection par score composite (aire, adhérence aux gradients robuste à
  l'occlusion, contraste intérieur/extérieur) puis **raffinement
  sub-pixel** des coins (aimantation des bords sur les crêtes de gradient,
  moindres carrés, intersections) — repli sur un cadre ajustable si besoin
- **Ajustement manuel** : 4 poignées draggables avec loupe de précision
- **Redressement** : homographie (transformation projective) calculée à partir
  des 4 coins, interpolation bilinéaire, ratio A4 auto-détecté
- **Filtres « scanner » anti-ombre / anti-reflet** :
  - *Noir & blanc* : accentuation + binarisation adaptative de Sauvola
    (images intégrales) + despeckle — élimine ombres et reflets localement,
    fond blanc pur, encre noire profonde
  - *Couleur* : normalisation d'illumination (division par le fond estimé,
    double filtre max) + contraste + accentuation — supprime ombres et
    reflets en conservant les couleurs
  - *Photo* : redressement seul, sans filtre
- **Multi-pages** : ajoutez plusieurs photos au même document (vignettes,
  suppression page par page) — export en un seul PDF
- **Sortie** : utiliser le scan directement dans Signature/Éditeur, ou
  télécharger en PDF (nom de fichier au choix)

## ✨ Autres caractéristiques

- **PWA installable** (desktop, iOS, Android) avec une icône violette unifiée
- **Fonctionne hors ligne** (service worker)
- **Thème clair / sombre**
- **Responsive** et **tactile**

## 🚀 Installation

### Prérequis

- Node.js (version 18 ou supérieure)
- npm

### Étapes

1. **Cloner le dépôt**
   ```bash
   git clone <votre-repo>
   cd Sign-app
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Démarrer le serveur**
   ```bash
   npm start
   ```
   L'application est disponible sur http://localhost:3000

> L'application est entièrement statique : `server.js` ne fait que servir les
> fichiers. Elle peut aussi être déployée sur n'importe quel hébergeur statique
> (Vercel, Netlify…) ou via Docker (voir `DOCKER.md`).

## 🛠️ Technologies

- HTML / CSS / JavaScript (aucun framework)
- [pdf.js](https://mozilla.github.io/pdf.js/) — rendu des PDF
- [pdf-lib](https://pdf-lib.js.org/) — génération / modification des PDF
- Express — serveur statique

## 📄 Licence

MIT
