# 🗄️ Configuration Supabase - À FAIRE AVANT VERCEL

**Projet :** `msmbvsmadmuhgijdlquj`

---

## ✅ ÉTAPE 1 : Créer les tables (2 minutes)

### 1. Ouvrir le SQL Editor

Allez sur : https://app.supabase.com/project/msmbvsmadmuhgijdlquj/sql/new

### 2. Copier le schéma SQL

Ouvrez le fichier `supabase/schema.sql` dans votre projet et copiez **TOUT** le contenu.

### 3. Coller et exécuter

1. Collez le contenu dans l'éditeur SQL
2. Cliquez sur **"Run"** (ou Ctrl + Enter)
3. Vérifiez qu'il n'y a pas d'erreurs

### 4. Vérifier les tables créées

Allez dans **Table Editor** : https://app.supabase.com/project/msmbvsmadmuhgijdlquj/editor

Vous devez voir ces 3 tables :
- ✅ `signed_documents`
- ✅ `signature_templates`
- ✅ `email_logs`

---

## ✅ ÉTAPE 2 : Créer le bucket de stockage (1 minute)

### 1. Ouvrir Storage

Allez sur : https://app.supabase.com/project/msmbvsmadmuhgijdlquj/storage/buckets

### 2. Créer le bucket

1. Cliquez sur **"New bucket"**
2. **Name** : `signed-documents`
3. **Public bucket** : ✅ Cochez cette case (important !)
4. Cliquez sur **"Create bucket"**

### 3. Vérifier

Vous devez voir le bucket `signed-documents` dans la liste.

---

## ✅ ÉTAPE 3 : Vérifier les clés API

Allez sur : https://app.supabase.com/project/msmbvsmadmuhgijdlquj/settings/api

Vous devez voir :

### Project URL
```
https://msmbvsmadmuhgijdlquj.supabase.co
```

### anon (public)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbWJ2c21hZG11aGdpamRscXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1ODMxMzQsImV4cCI6MjA4MDE1OTEzNH0.uqzdTcat9WxBui49r9veQ73lvpp84qYHir4o7XsHbKw
```

### service_role (secret)
```
⚠️ Copiez cette clé pour Vercel - Ne la partagez JAMAIS publiquement !
```

---

## ✅ ÉTAPE 4 : Tester la connexion (optionnel)

### Test rapide dans le SQL Editor

Exécutez cette requête :

```sql
SELECT * FROM signed_documents;
```

Vous devriez voir "No rows" (c'est normal, la table est vide).

---

## 📋 Checklist complète

Avant de déployer sur Vercel, vérifiez :

- [ ] ✅ Tables créées (`signed_documents`, `signature_templates`, `email_logs`)
- [ ] ✅ Bucket `signed-documents` créé et public
- [ ] ✅ Clé `anon` copiée
- [ ] ✅ Clé `service_role` copiée

---

## 🎯 Prochaine étape

Une fois Supabase configuré, passez à Vercel :

👉 Ouvrez le fichier **`VERCEL_ENV_READY.txt`** pour copier les variables d'environnement

---

## 🆘 Problèmes ?

### "Table already exists"
→ C'est OK ! Les tables ont déjà été créées

### "Permission denied"
→ Vérifiez que vous êtes bien connecté au bon projet Supabase

### Le bucket n'apparaît pas
→ Rafraîchissez la page (F5)

### Les politiques RLS bloquent l'insertion
→ Le schéma SQL crée automatiquement les politiques nécessaires

---

**Supabase est prêt ! 🎉**

**Prochaine étape :** Configurez Vercel avec le fichier `VERCEL_ENV_READY.txt`
