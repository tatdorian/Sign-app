# ⚡ Quick Start - Déploiement Vercel

Guide ultra-rapide pour déployer en 10 minutes ! ⏱️

---

## 🎯 Prérequis (5 min)

### 1️⃣ Compte Supabase
- Allez sur https://supabase.com
- Créez un compte (gratuit)
- Créez un nouveau projet
- Attendez 2 minutes que le projet soit créé

### 2️⃣ Base de données Supabase
- Dans SQL Editor, collez le contenu de `supabase/schema.sql`
- Cliquez sur "Run"
- Dans Storage, créez un bucket "signed-documents" (public)

### 3️⃣ Gmail App Password
- Allez sur https://myaccount.google.com/apppasswords
- Créez un mot de passe d'application
- Copiez le mot de passe (16 caractères)

---

## 🚀 Déploiement sur Vercel (5 min)

### 1️⃣ Push sur GitHub
```bash
git add .
git commit -m "Ready for Vercel deployment"
git push
```

### 2️⃣ Déployer sur Vercel
- Allez sur https://vercel.com/new
- Importez votre repository GitHub
- Cliquez sur "Deploy" (ne configurez rien encore)

### 3️⃣ Ajouter les variables d'environnement

Dans Vercel → Settings → Environment Variables, ajoutez :

**Supabase (3 variables) :**
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```
📍 Trouvez ces valeurs dans Supabase → Settings → API

**Email (3 variables) :**
```
EMAIL_SERVICE=gmail
EMAIL_USER=votre-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
```
📍 Utilisez le mot de passe d'application Gmail (16 caractères)

**App (2 variables) :**
```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://votre-app.vercel.app
```
📍 Pour `NEXT_PUBLIC_APP_URL`, utilisez l'URL donnée par Vercel après le 1er déploiement

### 4️⃣ Redéployer
- Allez dans Deployments
- Cliquez sur "..." → "Redeploy"

---

## ✅ Tester

1. Ouvrez votre URL Vercel
2. Uploadez un document
3. Créez une signature
4. Téléchargez le PDF ✅
5. Envoyez par email ✅

---

## 🎉 C'est tout !

Votre application est maintenant en ligne !

**Besoin d'aide ?** Consultez `DEPLOIEMENT_VERCEL.md` pour le guide complet.

---

## 📋 Checklist rapide

- [ ] Projet Supabase créé
- [ ] Schéma SQL exécuté
- [ ] Bucket "signed-documents" créé
- [ ] Mot de passe Gmail app créé
- [ ] Code pushé sur GitHub
- [ ] Projet créé sur Vercel
- [ ] 8 variables d'environnement ajoutées
- [ ] Application redéployée
- [ ] Application testée ✅

**Temps total : 10-15 minutes** ⏱️
