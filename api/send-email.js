const nodemailer = require('nodemailer');

// Configuration CORS pour Vercel
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Créer le transporteur email
const createTransporter = () => {
  const emailConfig = {
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  };

  // Configuration SMTP personnalisée si définie
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  return nodemailer.createTransporter(emailConfig);
};

// Fonction serverless principale
module.exports = async (req, res) => {
  // Gérer les requêtes OPTIONS (preflight CORS)
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  // Accepter uniquement POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Méthode non autorisée'
    });
  }

  try {
    const { to, subject, message, pdfData } = req.body;

    // Validation des données
    if (!to || !pdfData) {
      return res.status(400).json({
        success: false,
        message: 'Email destinataire et PDF requis'
      });
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: 'Adresse email invalide'
      });
    }

    // Vérifier la configuration email
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error('Configuration email manquante');
      return res.status(500).json({
        success: false,
        message: 'Configuration email non définie sur le serveur'
      });
    }

    // Créer le transporteur
    const transporter = createTransporter();

    // Convertir le PDF base64 en buffer
    const pdfBuffer = Buffer.from(pdfData, 'base64');

    // Vérifier la taille du PDF (limite à 25MB)
    if (pdfBuffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Le fichier PDF est trop volumineux (max 25MB)'
      });
    }

    // Options de l'email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject || 'Document signé',
      text: message || 'Veuillez trouver ci-joint le document signé.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">📝 Document signé</h2>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              ${message || 'Veuillez trouver ci-joint le document signé électroniquement.'}
            </p>
            <hr style="border: none; border-top: 2px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px; line-height: 1.4;">
              <strong>Note :</strong> Ce document a été signé électroniquement via l'application de signature de documents.
              <br>La signature électronique a la même valeur légale qu'une signature manuscrite.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `document_signe_${Date.now()}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    // Envoyer l'email
    const info = await transporter.sendMail(mailOptions);

    console.log('Email envoyé avec succès:', info.messageId);

    // Retourner une réponse de succès
    return res.status(200).json({
      success: true,
      message: 'Email envoyé avec succès',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);

    // Gérer les erreurs spécifiques
    if (error.code === 'EAUTH') {
      return res.status(401).json({
        success: false,
        message: 'Erreur d\'authentification email. Vérifiez vos identifiants.'
      });
    }

    if (error.code === 'ECONNECTION') {
      return res.status(503).json({
        success: false,
        message: 'Impossible de se connecter au serveur email.'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de l\'envoi de l\'email'
    });
  }
};
