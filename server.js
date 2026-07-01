const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(__dirname));

// Route pour servir l'application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route de test pour vérifier si le serveur fonctionne
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Application de signature opérationnelle' });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║  🖊️  Application de signature                                 ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  📍 URL: http://localhost:${PORT}                             ║
    ║  ✅ Serveur démarré avec succès                              ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
