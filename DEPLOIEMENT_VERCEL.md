# 🚀 Guide de Déploiement sur Vercel avec Supabase

Ce guide détaillé vous accompagne pour déployer votre application de signature de documents sur Vercel avec une base de données Supabase.

---

## 📋 Prérequis

- Un compte GitHub (pour héberger le code)
- Un compte Vercel (gratuit) : https://vercel.com
- Un compte Supabase (gratuit) : https://supabase.com
- Un compte Gmail (pour l'envoi d'emails)

---

## 🗄️ ÉTAPE 1 : Configuration de Supabase

### 1.1 Créer un projet Supabase

1. Allez sur https://app.supabase.com
2. Cliquez sur **"New Project"**
3. Remplissez les informations :
   - **Name** : `document-signature-app`
   - **Database Password** : Générez un mot de passe fort (sauvegardez-le)
   - **Region** : Choisissez la région la plus proche de vos utilisateurs
4. Cliquez sur **"Create new project"**
5. Attendez 2-3 minutes que le projet soit créé

### 1.2 Obtenir les clés API Supabase

1. Dans votre projet Supabase, allez dans **Settings** (⚙️) → **API**
2. Notez ces 3 informations importantes :

```
Project URL: https://xxxxx.supabase.co
anon public key: eyJhbGc...
service_role key: eyJhbGc... (⚠️ À garder SECRET)
```

### 1.3 Créer la base de données

1. Dans Supabase, allez dans **SQL Editor**
2. Cliquez sur **"New query"**
3. Copiez tout le contenu du fichier `supabase/schema.sql`
4. Collez-le dans l'éditeur SQL
5. Cliquez sur **"Run"** (ou appuyez sur Ctrl+Enter)
6. Vérifiez qu'il n'y a pas d'erreurs

### 1.4 Créer le bucket de stockage

1. Allez dans **Storage** → **"New bucket"**
2. Nom du bucket : `signed-documents`
3. **Public bucket** : ✅ Coché (pour permettre le téléchargement)
4. Cliquez sur **"Create bucket"**

### 1.5 Configurer les politiques de sécurité du bucket

1. Cliquez sur votre bucket `signed-documents`
2. Allez dans **Policies** → **"New policy"**
3. Créez ces politiques :

**Politique 1 : Upload**
```sql
CREATE POLICY "Permettre upload public"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'signed-documents');
```

**Politique 2 : Lecture**
```sql
CREATE POLICY "Permettre lecture publique"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'signed-documents');
```

---

## 📧 ÉTAPE 2 : Configuration Gmail

### 2.1 Activer la validation en 2 étapes

1. Allez sur https://myaccount.google.com/security
2. Dans "Connexion à Google", activez **"Validation en deux étapes"**
3. Suivez les instructions pour configurer

### 2.2 Créer un mot de passe d'application

1. Allez sur https://myaccount.google.com/apppasswords
2. Dans "Sélectionner l'application", choisissez **"Autre (nom personnalisé)"**
3. Entrez : `Document Signature App`
4. Cliquez sur **"Générer"**
5. **Copiez le mot de passe de 16 caractères** (vous ne pourrez plus le revoir)
6. Sauvegardez-le en lieu sûr

---

## 🚢 ÉTAPE 3 : Déploiement sur Vercel

### 3.1 Pousser le code sur GitHub

Si ce n'est pas déjà fait :

```bash
git add .
git commit -m "Prêt pour déploiement Vercel avec Supabase"
git push origin claude/document-signature-app-01JMVvJfgdvmFCno2H2KbhpU
```

### 3.2 Connecter le projet à Vercel

1. Allez sur https://vercel.com/new
2. Cliquez sur **"Import Git Repository"**
3. Sélectionnez votre repository GitHub `scanner-de-vuln-rabilit-s`
4. Cliquez sur **"Import"**

### 3.3 Configurer le projet

1. **Project Name** : `document-signature-app` (ou votre choix)
2. **Framework Preset** : Laissez sur "Other"
3. **Root Directory** : Laissez vide (`.`)
4. **Build Command** : Laissez par défaut
5. **Output Directory** : Laissez vide

### 3.4 Ajouter les variables d'environnement

**⚠️ ÉTAPE CRUCIALE**

Dans la section **"Environment Variables"**, ajoutez TOUTES ces variables :

#### Variables Supabase :

| Nom | Valeur | Où la trouver |
|-----|--------|---------------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | `eyJhbG...` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` | Supabase → Settings → API → service_role |

#### Variables Email :

| Nom | Valeur | Description |
|-----|--------|-------------|
| `EMAIL_SERVICE` | `gmail` | Service email |
| `EMAIL_USER` | `votre-email@gmail.com` | Votre adresse Gmail |
| `EMAIL_PASSWORD` | `xxxx xxxx xxxx xxxx` | Mot de passe d'application (16 caractères) |

#### Variables Application :

| Nom | Valeur | Description |
|-----|--------|-------------|
| `NODE_ENV` | `production` | Environnement |
| `NEXT_PUBLIC_APP_URL` | *(laissez vide pour l'instant)* | URL de l'app (à remplir après déploiement) |

**Important :**
- Cochez **"Production"**, **"Preview"** et **"Development"** pour chaque variable
- Cliquez sur **"Add"** après chaque variable

### 3.5 Déployer

1. Cliquez sur **"Deploy"**
2. Attendez 2-3 minutes que le déploiement se termine
3. Une fois terminé, vous verrez : 🎉 **"Congratulations!"**

### 3.6 Obtenir l'URL de votre application

1. Cliquez sur **"Visit"** ou copiez l'URL affichée
2. Format : `https://document-signature-app-xxxxx.vercel.app`
3. **Sauvegardez cette URL**

### 3.7 Mettre à jour l'URL de l'application

1. Retournez dans **Settings** → **Environment Variables**
2. Trouvez `NEXT_PUBLIC_APP_URL`
3. Cliquez sur les **"..."** → **"Edit"**
4. Entrez l'URL complète : `https://document-signature-app-xxxxx.vercel.app`
5. Cliquez sur **"Save"**

### 3.8 Redéployer

1. Allez dans **Deployments**
2. Cliquez sur les **"..."** du dernier déploiement
3. Cliquez sur **"Redeploy"**
4. Attendez que le redéploiement se termine

---

## ✅ ÉTAPE 4 : Vérification

### 4.1 Tester l'application

1. Ouvrez votre URL Vercel dans un navigateur
2. Testez le téléchargement d'un document (PDF ou image)
3. Créez une signature
4. Téléchargez le PDF signé
5. Testez l'envoi par email (utilisez votre propre email)

### 4.2 Vérifier Supabase

1. Allez dans **Table Editor** → `signed_documents`
2. Vérifiez qu'une ligne a été créée après avoir signé un document
3. Allez dans **Storage** → `signed-documents`
4. Vérifiez que le PDF signé est présent

### 4.3 Vérifier l'email

1. Vérifiez votre boîte de réception
2. L'email devrait contenir le PDF signé en pièce jointe

---

## 🔧 Configuration Avancée (Optionnel)

### Domaine personnalisé

1. Dans Vercel, allez dans **Settings** → **Domains**
2. Ajoutez votre domaine personnalisé
3. Suivez les instructions pour configurer le DNS

### Limites de débit

Pour éviter les abus, configurez des limites dans Supabase :
1. Allez dans **Settings** → **API**
2. Configurez les limites de requêtes

---

## 🐛 Dépannage

### Erreur : "Configuration email non définie"

**Solution :** Vérifiez que `EMAIL_USER` et `EMAIL_PASSWORD` sont bien définis dans Vercel

```bash
# Dans Vercel : Settings → Environment Variables
# Vérifiez que ces variables existent et sont correctes
```

### Erreur : "Supabase not initialized"

**Solution :** Vérifiez les variables Supabase

```bash
# Vérifiez dans le navigateur (Console)
console.log(SUPABASE_URL)  // Doit afficher l'URL
console.log(SUPABASE_ANON_KEY)  // Doit afficher la clé
```

### L'email ne s'envoie pas

**Solutions :**

1. **Vérifiez le mot de passe d'application**
   - Il doit faire 16 caractères (avec ou sans espaces)
   - Essayez de le régénérer

2. **Vérifiez que la validation en 2 étapes est activée**
   - https://myaccount.google.com/security

3. **Consultez les logs Vercel**
   - Allez dans **Deployments** → Dernier déploiement
   - Cliquez sur **"View Function Logs"**
   - Cherchez les erreurs liées à l'email

### Les documents ne se sauvegardent pas dans Supabase

**Solutions :**

1. **Vérifiez que le schéma SQL a été exécuté**
   - Allez dans **Table Editor**
   - Vous devez voir : `signed_documents`, `signature_templates`, `email_logs`

2. **Vérifiez les politiques RLS**
   - Allez dans **Authentication** → **Policies**
   - Vérifiez que les politiques d'insertion sont actives

3. **Consultez les logs Supabase**
   - Allez dans **Logs** → **Postgres Logs**

---

## 📊 Surveillance et Logs

### Logs Vercel

1. **Deployments** → Cliquez sur un déploiement
2. Consultez les logs en temps réel
3. Filtrez par "error" pour voir uniquement les erreurs

### Logs Supabase

1. **Logs** → **Postgres Logs**
2. Filtrez par table ou opération
3. Consultez les erreurs SQL

---

## 💰 Coûts et Limites

### Vercel (Plan gratuit)

- ✅ 100 GB de bande passante par mois
- ✅ Déploiements illimités
- ✅ Domaine personnalisé
- ⚠️ Limite de 100 exécutions serverless par jour

### Supabase (Plan gratuit)

- ✅ 500 MB de base de données
- ✅ 1 GB de stockage fichiers
- ✅ 2 GB de bande passante par mois
- ⚠️ Pause après 7 jours d'inactivité (réactivation automatique)

### Gmail

- ✅ Gratuit
- ⚠️ Limite : 500 emails par jour

---

## 🔐 Sécurité en Production

### Recommandations importantes

1. **Limitez l'accès RLS dans Supabase**
   - Modifiez les politiques pour n'autoriser que les utilisateurs authentifiés

2. **Activez l'authentification**
   - Ajoutez Supabase Auth pour protéger l'application

3. **Limitez la taille des fichiers**
   - Maximum 25 MB par défaut (modifiable dans `api/send-email.js`)

4. **Surveillez l'usage**
   - Consultez régulièrement les dashboards Vercel et Supabase

5. **Activez HTTPS uniquement**
   - Vercel le fait automatiquement

---

## 📞 Support

### Ressources utiles

- **Documentation Vercel** : https://vercel.com/docs
- **Documentation Supabase** : https://supabase.com/docs
- **Documentation Nodemailer** : https://nodemailer.com/about/

### En cas de problème

1. Consultez les logs (Vercel + Supabase)
2. Vérifiez toutes les variables d'environnement
3. Testez en local d'abord avec les mêmes variables
4. Redéployez après chaque modification de variable

---

## 🎉 Félicitations !

Votre application de signature de documents est maintenant déployée en production !

**URL de votre application :** `https://votre-app.vercel.app`

Partagez cette URL avec vos utilisateurs et profitez de votre application de signature de documents professionnelle ! 🚀

---

**Note :** Ce guide est valable à la date du 2025-12-01. Les interfaces Vercel et Supabase peuvent évoluer.
