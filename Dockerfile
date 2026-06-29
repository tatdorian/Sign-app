# Image de base légère avec Node.js
FROM node:20-alpine

# Répertoire de travail dans le conteneur
WORKDIR /app

# Installer uniquement les dépendances de production
# (copie séparée du package.json pour profiter du cache de build Docker)
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copier le reste du code de l'application
COPY . .

# Le serveur écoute sur le port 3000
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Lancer l'application avec un utilisateur non-root (fourni par l'image node)
USER node

# Démarrer le serveur Express
CMD ["node", "server.js"]
