// Client Supabase pour l'application de signature de documents
// À utiliser dans app.js pour sauvegarder les documents signés

// Configuration Supabase
// Les valeurs seront injectées depuis les variables d'environnement Vercel
// Pour le développement local, créez un fichier config.js avec ces valeurs
const SUPABASE_URL = typeof window !== 'undefined' && window.SUPABASE_CONFIG
    ? window.SUPABASE_CONFIG.url
    : 'https://votre-projet.supabase.co';
const SUPABASE_ANON_KEY = typeof window !== 'undefined' && window.SUPABASE_CONFIG
    ? window.SUPABASE_CONFIG.anonKey
    : 'votre_anon_key_publique';

// Initialiser le client Supabase
// Note: Incluez la bibliothèque Supabase dans index.html :
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

let supabaseClient = null;

// Initialiser Supabase
function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.warn('Supabase library not loaded. Include the CDN script in index.html');
        return null;
    }

    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

// Sauvegarder un document signé dans Supabase
async function saveSignedDocument(documentData) {
    const client = initSupabase();
    if (!client) return { success: false, error: 'Supabase not initialized' };

    try {
        const { data, error } = await client
            .from('signed_documents')
            .insert([{
                original_filename: documentData.filename,
                file_type: documentData.fileType,
                file_size_bytes: documentData.fileSize,
                signature_position_x: documentData.signatureX,
                signature_position_y: documentData.signatureY,
                signature_width: documentData.signatureWidth,
                signature_color: documentData.signatureColor,
                email_sent: false
            }])
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du document:', error);
        return { success: false, error: error.message };
    }
}

// Uploader le PDF signé dans Supabase Storage
async function uploadSignedPDF(pdfBlob, filename) {
    const client = initSupabase();
    if (!client) return { success: false, error: 'Supabase not initialized' };

    try {
        const { data, error } = await client
            .storage
            .from('signed-documents')
            .upload(`${Date.now()}_${filename}`, pdfBlob, {
                contentType: 'application/pdf',
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Obtenir l'URL publique
        const { data: publicUrlData } = client
            .storage
            .from('signed-documents')
            .getPublicUrl(data.path);

        return {
            success: true,
            path: data.path,
            url: publicUrlData.publicUrl
        };
    } catch (error) {
        console.error('Erreur lors de l\'upload du PDF:', error);
        return { success: false, error: error.message };
    }
}

// Logger l'envoi d'un email
async function logEmailSent(documentId, emailData) {
    const client = initSupabase();
    if (!client) return { success: false, error: 'Supabase not initialized' };

    try {
        const { data, error } = await client
            .from('email_logs')
            .insert([{
                document_id: documentId,
                recipient_email: emailData.to,
                subject: emailData.subject,
                message: emailData.message,
                status: emailData.success ? 'sent' : 'failed',
                error_message: emailData.error,
                message_id: emailData.messageId,
                sent_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // Mettre à jour le document pour indiquer que l'email a été envoyé
        if (documentId && emailData.success) {
            await client
                .from('signed_documents')
                .update({
                    email_sent: true,
                    email_recipient: emailData.to,
                    email_sent_at: new Date().toISOString()
                })
                .eq('id', documentId);
        }

        return { success: true, data };
    } catch (error) {
        console.error('Erreur lors du logging de l\'email:', error);
        return { success: false, error: error.message };
    }
}

// Sauvegarder un template de signature
async function saveSignatureTemplate(name, signatureData) {
    const client = initSupabase();
    if (!client) return { success: false, error: 'Supabase not initialized' };

    try {
        const { data, error } = await client
            .from('signature_templates')
            .insert([{
                name: name,
                signature_data: signatureData,
                default_width: parseInt(document.getElementById('signature-scale')?.value || 150),
                default_color: document.getElementById('signature-color')?.value || '#000000'
            }])
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du template:', error);
        return { success: false, error: error.message };
    }
}

// Récupérer tous les templates de signature
async function getSignatureTemplates() {
    const client = initSupabase();
    if (!client) return { success: false, error: 'Supabase not initialized' };

    try {
        const { data, error } = await client
            .from('signature_templates')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return { success: true, data };
    } catch (error) {
        console.error('Erreur lors de la récupération des templates:', error);
        return { success: false, error: error.message };
    }
}

// Obtenir les statistiques
async function getDocumentStatistics() {
    const client = initSupabase();
    if (!client) return { success: false, error: 'Supabase not initialized' };

    try {
        const { data, error } = await client
            .from('document_statistics')
            .select('*')
            .limit(30);

        if (error) throw error;

        return { success: true, data };
    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques:', error);
        return { success: false, error: error.message };
    }
}

// Exporter les fonctions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initSupabase,
        saveSignedDocument,
        uploadSignedPDF,
        logEmailSent,
        saveSignatureTemplate,
        getSignatureTemplates,
        getDocumentStatistics
    };
}
