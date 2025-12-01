# 📋 Variables à copier dans Vercel

## 🎯 Votre projet Supabase: `msmbvsmadmuhgijdlquj`

---

## 📍 ÉTAPE 1 : Récupérer vos clés Supabase

1. Allez sur https://app.supabase.com/project/msmbvsmadmuhgijdlquj/settings/api
2. Vous verrez cette page avec vos clés :

### URL du projet
```
https://msmbvsmadmuhgijdlquj.supabase.co
```

### anon public key
```
eyJhbGc... (copiez la clé complète)
```

### service_role key
```
eyJhbGc... (copiez la clé complète)
```

---

## 📍 ÉTAPE 2 : Créer mot de passe Gmail

1. Allez sur https://myaccount.google.com/apppasswords
2. Créez un mot de passe d'application
3. Copiez le mot de passe (16 caractères avec ou sans espaces)

---

## 📍 ÉTAPE 3 : Ajouter dans Vercel

Allez dans **Vercel** → Votre projet → **Settings** → **Environment Variables**

Ajoutez ces **8 variables** une par une :

### Variable 1
```
Name:  SUPABASE_URL
Value: https://msmbvsmadmuhgijdlquj.supabase.co
```
✅ Cochez : Production, Preview, Development

### Variable 2
```
Name:  SUPABASE_ANON_KEY
Value: [Collez votre anon public key]
```
✅ Cochez : Production, Preview, Development

### Variable 3
```
Name:  SUPABASE_SERVICE_ROLE_KEY
Value: [Collez votre service_role key]
```
✅ Cochez : Production, Preview, Development

### Variable 4
```
Name:  EMAIL_SERVICE
Value: gmail
```
✅ Cochez : Production, Preview, Development

### Variable 5
```
Name:  EMAIL_USER
Value: [Votre email Gmail complet]
```
✅ Cochez : Production, Preview, Development

### Variable 6
```
Name:  EMAIL_PASSWORD
Value: [Votre mot de passe d'application]
```
✅ Cochez : Production, Preview, Development

### Variable 7
```
Name:  NODE_ENV
Value: production
```
✅ Cochez : Production, Preview, Development

### Variable 8
```
Name:  NEXT_PUBLIC_APP_URL
Value: [Laissez vide pour l'instant]
```
✅ Cochez : Production, Preview, Development

---

## 📍 ÉTAPE 4 : Déployer

1. Cliquez sur **Deployments**
2. Cliquez sur **"Redeploy"** du dernier déploiement
3. Attendez 2 minutes

---

## 📍 ÉTAPE 5 : Mettre à jour l'URL

1. Une fois le déploiement terminé, copiez l'URL (ex: `https://document-signature-app.vercel.app`)
2. Retournez dans **Settings** → **Environment Variables**
3. Trouvez `NEXT_PUBLIC_APP_URL` et cliquez sur **"Edit"**
4. Collez votre URL Vercel
5. Cliquez sur **"Save"**
6. **Redéployez** encore une fois

---

## ✅ TERMINÉ !

Votre application est maintenant en ligne ! 🎉

Testez-la en allant sur votre URL Vercel.

---

## 🔍 Récapitulatif des 8 variables

| Variable | Où la trouver |
|----------|---------------|
| `SUPABASE_URL` | https://app.supabase.com/project/msmbvsmadmuhgijdlquj/settings/api |
| `SUPABASE_ANON_KEY` | https://app.supabase.com/project/msmbvsmadmuhgijdlquj/settings/api |
| `SUPABASE_SERVICE_ROLE_KEY` | https://app.supabase.com/project/msmbvsmadmuhgijdlquj/settings/api |
| `EMAIL_SERVICE` | Tapez : `gmail` |
| `EMAIL_USER` | Votre adresse Gmail |
| `EMAIL_PASSWORD` | https://myaccount.google.com/apppasswords |
| `NODE_ENV` | Tapez : `production` |
| `NEXT_PUBLIC_APP_URL` | URL donnée par Vercel après 1er déploiement |

---

## 🆘 Problèmes ?

### Erreur : "Configuration email non définie"
→ Vérifiez `EMAIL_USER` et `EMAIL_PASSWORD`

### Erreur : "Supabase not initialized"
→ Vérifiez `SUPABASE_URL` et `SUPABASE_ANON_KEY`

### L'email ne s'envoie pas
→ Vérifiez que vous avez bien créé un **mot de passe d'application** (pas votre mot de passe Gmail normal)

### Les documents ne se sauvegardent pas
→ Vérifiez que vous avez bien exécuté le fichier `supabase/schema.sql` dans le SQL Editor de Supabase

---

**Bon déploiement ! 🚀**
