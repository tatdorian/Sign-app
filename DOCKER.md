# Déploiement avec Docker

L'application (serveur Express qui sert le front et l'API d'envoi d'email)
peut être déployée dans un conteneur Docker.

## Prérequis

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/) (inclus avec Docker Desktop)

## Démarrage rapide

1. **Configurer les variables d'environnement** (pour l'envoi d'email).
   Copiez le modèle et renseignez vos identifiants :

   ```bash
   cp .env.example .env
   # puis éditez .env :
   #   EMAIL_USER=votre-email@gmail.com
   #   EMAIL_PASSWORD=votre-mot-de-passe-application
   ```

   > Pour Gmail, générez un « mot de passe d'application » :
   > https://myaccount.google.com/apppasswords
   >
   > L'application démarre même sans ces variables : seul l'envoi d'email
   > sera désactivé (le téléchargement du PDF signé fonctionne toujours).

2. **Construire et lancer le conteneur** :

   ```bash
   docker compose up -d --build
   ```

3. **Accéder à l'application** : http://localhost:3000

## Commandes utiles

```bash
docker compose logs -f          # suivre les logs
docker compose ps               # état du conteneur (et healthcheck)
docker compose restart          # redémarrer
docker compose down             # arrêter et supprimer le conteneur
docker compose up -d --build    # reconstruire après une modification du code
```

## Sans Docker Compose

```bash
docker build -t sign-app .
docker run -d -p 3000:3000 \
  -e EMAIL_USER=votre-email@gmail.com \
  -e EMAIL_PASSWORD=votre-mot-de-passe-application \
  --name sign-app sign-app
```

## Détails techniques

- **Image de base** : `node:20-alpine` (légère).
- **Port exposé** : `3000` (configurable via la variable `PORT`).
- **Utilisateur** : le conteneur tourne en `node` (non-root).
- **Healthcheck** : interroge `GET /health` toutes les 30 s.
- **Variables d'environnement** prises en charge : `PORT`, `EMAIL_SERVICE`,
  `EMAIL_USER`, `EMAIL_PASSWORD`, et en option `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_SECURE` pour un serveur SMTP personnalisé.

Le fichier `.env` n'est jamais inclus dans l'image (voir `.dockerignore`) :
les secrets sont injectés au runtime par Docker Compose.
