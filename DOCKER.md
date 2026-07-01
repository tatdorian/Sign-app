# Déploiement avec Docker

L'application (serveur Express qui sert le front statique) peut être déployée
dans un conteneur Docker.

## Prérequis

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/) (inclus avec Docker Desktop)

## Démarrage rapide

1. **Construire et lancer le conteneur** :

   ```bash
   docker compose up -d --build
   ```

2. **Accéder à l'application** : http://localhost:3000

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
docker run -d -p 3000:3000 --name sign-app sign-app
```

## Détails techniques

- **Image de base** : `node:20-alpine` (légère).
- **Port exposé** : `3000` (configurable via la variable `PORT`).
- **Utilisateur** : le conteneur tourne en `node` (non-root).
- **Healthcheck** : interroge `GET /health` toutes les 30 s.
- **Variables d'environnement** prises en charge : `PORT`.
