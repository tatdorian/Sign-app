const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Configuration de Nodemailer
// NOTE: Pour utiliser cette fonctionnalité, vous devez configurer vos identifiants email
// Vous pouvez utiliser Gmail, SendGrid, ou tout autre service SMTP
const createTransporter = () => {
    // Option 1: Configuration Gmail (nécessite un mot de passe d'application)
    // Allez sur https://myaccount.google.com/apppasswords pour créer un mot de passe d'application

    // Option 2: Utilisez des variables d'environnement
    const emailConfig = {
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER || 'votre-email@gmail.com',
            pass: process.env.EMAIL_PASSWORD || 'votre-mot-de-passe-application'
        }
    };

    // Option 3: Configuration SMTP générique
    // const emailConfig = {
    //     host: process.env.SMTP_HOST || 'smtp.gmail.com',
    //     port: process.env.SMTP_PORT || 587,
    //     secure: false,
    //     auth: {
    //         user: process.env.EMAIL_USER,
    //         pass: process.env.EMAIL_PASSWORD
    //     }
    // };

    return nodemailer.createTransporter(emailConfig);
};

// Route pour servir l'application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour envoyer un email
app.post('/send-email', async (req, res) => {
    try {
        const { to, subject, message, pdfData } = req.body;

        // Validation
        if (!to || !pdfData) {
            return res.status(400).json({
                success: false,
                message: 'Email destinataire et PDF requis'
            });
        }

        // Créer le transporteur
        const transporter = createTransporter();

        // Convertir le PDF base64 en buffer
        const pdfBuffer = Buffer.from(pdfData, 'base64');

        // Options de l'email
        const mailOptions = {
            from: process.env.EMAIL_USER || 'votre-email@gmail.com',
            to: to,
            subject: subject || 'Document signé',
            text: message || 'Veuillez trouver ci-joint le document signé.',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #667eea;">Document signé</h2>
                    <p>${message || 'Veuillez trouver ci-joint le document signé.'}</p>
                    <hr style="border: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">
                        Ce document a été signé électroniquement via l'application de signature de documents.
                    </p>
                </div>
            `,
            attachments: [
                {
                    filename: `document_signé_${Date.now()}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        // Envoyer l'email
        const info = await transporter.sendMail(mailOptions);

        console.log('Email envoyé:', info.messageId);

        res.json({
            success: true,
            message: 'Email envoyé avec succès',
            messageId: info.messageId
        });

    } catch (error) {
        console.error('Erreur lors de l\'envoi de l\'email:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors de l\'envoi de l\'email'
        });
    }
});

// Route de test pour vérifier si le serveur fonctionne
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Serveur de signature de documents opérationnel' });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║  🚀 Serveur de Signature de Documents                        ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  📍 URL: http://localhost:${PORT}                             ║
    ║  ✅ Serveur démarré avec succès                              ║
    ║                                                               ║
    ║  ⚠️  IMPORTANT: Configuration Email                          ║
    ║  Pour utiliser la fonctionnalité email, configurez:          ║
    ║  - EMAIL_USER: votre adresse email                           ║
    ║  - EMAIL_PASSWORD: votre mot de passe d'application          ║
    ║  - EMAIL_SERVICE: gmail (par défaut) ou autre service        ║
    ║                                                               ║
    ║  Exemple:                                                     ║
    ║  export EMAIL_USER="votre-email@gmail.com"                   ║
    ║  export EMAIL_PASSWORD="votre-mot-de-passe-app"              ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
