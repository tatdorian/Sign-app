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

- **Modifier texte** : cliquez sur un texte existant du PDF pour le retaper —
  l'original est masqué et remplacé à l'export (best-effort, voir remarque)
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
