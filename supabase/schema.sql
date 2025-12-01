-- ========================================
-- SCHÉMA SUPABASE POUR L'APPLICATION DE SIGNATURE
-- ========================================
-- À exécuter dans le SQL Editor de Supabase
-- https://app.supabase.com/project/_/sql

-- Activer l'extension UUID si pas déjà fait
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- TABLE: signed_documents
-- Stocke les informations sur les documents signés
-- ========================================
CREATE TABLE IF NOT EXISTS public.signed_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Informations du document
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'pdf' ou 'image'
    file_size_bytes BIGINT,

    -- Informations de la signature
    signature_position_x INTEGER,
    signature_position_y INTEGER,
    signature_width INTEGER,
    signature_color TEXT,

    -- Métadonnées
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,

    -- Stockage du fichier signé (optionnel, peut utiliser Supabase Storage)
    signed_document_url TEXT,

    -- Email (si envoyé)
    email_sent BOOLEAN DEFAULT FALSE,
    email_recipient TEXT,
    email_sent_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_signed_documents_signed_at ON public.signed_documents(signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signed_documents_email_recipient ON public.signed_documents(email_recipient);
CREATE INDEX IF NOT EXISTS idx_signed_documents_created_at ON public.signed_documents(created_at DESC);

-- ========================================
-- TABLE: signature_templates
-- Stocke les signatures réutilisables (optionnel)
-- ========================================
CREATE TABLE IF NOT EXISTS public.signature_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Données de la signature
    name TEXT NOT NULL,
    signature_data TEXT NOT NULL, -- Base64 de l'image de signature

    -- Paramètres par défaut
    default_width INTEGER DEFAULT 150,
    default_color TEXT DEFAULT '#000000',

    -- Métadonnées
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Index pour les templates
CREATE INDEX IF NOT EXISTS idx_signature_templates_created_at ON public.signature_templates(created_at DESC);

-- ========================================
-- TABLE: email_logs
-- Journalise tous les emails envoyés
-- ========================================
CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Référence au document
    document_id UUID REFERENCES public.signed_documents(id) ON DELETE SET NULL,

    -- Informations de l'email
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT,

    -- Statut
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    error_message TEXT,

    -- Identifiant du message (retourné par le service email)
    message_id TEXT,

    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les logs d'emails
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient_email);

-- ========================================
-- BUCKET STORAGE
-- Pour stocker les documents signés (à créer dans Storage)
-- ========================================
-- Exécutez cette commande dans l'interface Storage de Supabase :
-- 1. Allez dans Storage
-- 2. Créez un nouveau bucket nommé "signed-documents"
-- 3. Configurez les permissions selon vos besoins

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================
-- Active RLS sur toutes les tables
ALTER TABLE public.signed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'insertion publique (à adapter selon vos besoins)
CREATE POLICY "Permettre insertion publique documents"
    ON public.signed_documents
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Politique pour permettre la lecture publique (OPTIONNEL - à sécuriser en production)
CREATE POLICY "Permettre lecture publique documents"
    ON public.signed_documents
    FOR SELECT
    TO anon
    USING (true);

-- Politique pour les templates de signature
CREATE POLICY "Permettre insertion publique templates"
    ON public.signature_templates
    FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Permettre lecture publique templates"
    ON public.signature_templates
    FOR SELECT
    TO anon
    USING (true);

-- Politique pour les logs d'emails
CREATE POLICY "Permettre insertion publique email_logs"
    ON public.email_logs
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- ========================================
-- FONCTION: Mise à jour automatique du timestamp
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour la mise à jour automatique
CREATE TRIGGER update_signed_documents_updated_at
    BEFORE UPDATE ON public.signed_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signature_templates_updated_at
    BEFORE UPDATE ON public.signature_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- VUE: Statistiques des documents signés
-- ========================================
CREATE OR REPLACE VIEW public.document_statistics AS
SELECT
    DATE(signed_at) as date,
    COUNT(*) as total_signed,
    COUNT(CASE WHEN email_sent THEN 1 END) as total_emailed,
    COUNT(CASE WHEN file_type = 'pdf' THEN 1 END) as total_pdf,
    COUNT(CASE WHEN file_type = 'image' THEN 1 END) as total_images
FROM public.signed_documents
GROUP BY DATE(signed_at)
ORDER BY date DESC;

-- ========================================
-- DONNÉES DE TEST (Optionnel)
-- ========================================
-- Décommentez pour insérer des données de test

-- INSERT INTO public.signed_documents (
--     original_filename,
--     file_type,
--     file_size_bytes,
--     signature_position_x,
--     signature_position_y,
--     signature_width,
--     signature_color,
--     email_sent,
--     email_recipient
-- ) VALUES (
--     'contrat_test.pdf',
--     'pdf',
--     245678,
--     100,
--     650,
--     150,
--     '#000000',
--     true,
--     'test@example.com'
-- );

-- ========================================
-- NOTES D'UTILISATION
-- ========================================
-- 1. Exécutez ce script dans le SQL Editor de Supabase
-- 2. Créez un bucket "signed-documents" dans Storage
-- 3. Ajustez les politiques RLS selon vos besoins de sécurité
-- 4. Pour un usage en production, limitez l'accès avec authentification
-- 5. Configurez la rétention des données selon vos besoins légaux
-- ========================================
