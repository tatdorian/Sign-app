# 📝 Variables d'Environnement pour Vercel

## À copier dans Vercel → Settings → Environment Variables

---

## 🔑 Variables Supabase

Obtenez ces valeurs depuis : https://app.supabase.com/project/_/settings/api

| Nom de la variable | Valeur à remplacer | Où la trouver |
|-------------------|-------------------|---------------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | `eyJhbGc...` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | Settings → API → service_role ⚠️ SECRET |

---

## 📧 Variables Email (Gmail)

Créez un mot de passe d'application : https://myaccount.google.com/apppasswords

| Nom de la variable | Valeur à remplacer | Description |
|-------------------|-------------------|-------------|
| `EMAIL_SERVICE` | `gmail` | Service email (gmail par défaut) |
| `EMAIL_USER` | `votre-email@gmail.com` | Votre adresse Gmail complète |
| `EMAIL_PASSWORD` | `xxxx xxxx xxxx xxxx` | Mot de passe d'application (16 caractères) |

---

## 🚀 Variables Application

| Nom de la variable | Valeur | Description |
|-------------------|--------|-------------|
| `NODE_ENV` | `production` | Environnement de production |
| `NEXT_PUBLIC_APP_URL` | `https://votre-app.vercel.app` | URL de votre app (à remplir après 1er déploiement) |

---

## ✅ Checklist de configuration

- [ ] Créer un projet Supabase
- [ ] Exécuter le schéma SQL (`supabase/schema.sql`)
- [ ] Créer le bucket `signed-documents`
- [ ] Copier les 3 clés Supabase
- [ ] Créer un mot de passe d'application Gmail
- [ ] Ajouter TOUTES les variables dans Vercel
- [ ] Sélectionner Production, Preview et Development pour chaque variable
- [ ] Déployer l'application
- [ ] Mettre à jour `NEXT_PUBLIC_APP_URL` avec l'URL Vercel
- [ ] Redéployer

---

## 📋 Format pour copier-coller dans Vercel

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
EMAIL_SERVICE=gmail
EMAIL_USER=votre-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://votre-app.vercel.app
```

---

## ⚠️ Sécurité

- ✅ `SUPABASE_ANON_KEY` : Clé publique, peut être exposée côté client
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` : **À GARDER SECRET**, ne JAMAIS l'exposer côté client
- ⚠️ `EMAIL_PASSWORD` : Mot de passe d'application Gmail, à garder secret
- ✅ `NEXT_PUBLIC_APP_URL` : Publique, préfixe `NEXT_PUBLIC_` signifie qu'elle peut être exposée

---

## 🔄 Après modification des variables

Si vous modifiez une variable d'environnement dans Vercel :

1. Allez dans **Deployments**
2. Cliquez sur **"..."** du dernier déploiement
3. Cliquez sur **"Redeploy"**
4. Attendez que le redéploiement se termine

---

## 🧪 Tester en local avant Vercel

Pour tester avec les mêmes variables en local :

1. Copiez `.env.example` vers `.env`
2. Remplissez toutes les variables
3. Lancez `npm start`
4. Testez sur http://localhost:3000

---

## 🆘 En cas d'erreur

### "Configuration email non définie"
→ Vérifiez `EMAIL_USER` et `EMAIL_PASSWORD` dans Vercel

### "Supabase not initialized"
→ Vérifiez `SUPABASE_URL` et `SUPABASE_ANON_KEY`

### "Authentification email échouée"
→ Régénérez le mot de passe d'application Gmail

### "Cannot connect to database"
→ Vérifiez que le schéma SQL a été exécuté dans Supabase

---

**Date de création :** 2025-12-01
**Version :** 1.0.0
