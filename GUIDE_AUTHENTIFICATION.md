# 🔐 Guide d'Authentification - Application de Signature

## 🎉 Système de Login Intégré !

L'application dispose maintenant d'un système d'authentification complet avec Supabase Auth.

---

## ✨ Fonctionnalités

### 🔐 Connexion / Inscription
- ✅ Création de compte avec email et mot de passe
- ✅ Connexion sécurisée
- ✅ Vérification par email (optionnel)
- ✅ Protection des pages par authentification
- ✅ Déconnexion

### 👤 Profil Utilisateur
- ✅ Affichage du nom d'utilisateur dans le header
- ✅ Icône utilisateur
- ✅ Bouton de déconnexion accessible

### 🔒 Sécurité
- ✅ Sessions sécurisées avec Supabase
- ✅ Mots de passe hachés
- ✅ Protection automatique des pages
- ✅ Redirection si non connecté

---

## 📖 Comment utiliser

### 1️⃣ Première visite (Inscription)

1. **Allez sur** `login.html` (ou serez redirigé automatiquement)
2. **Cliquez sur** l'onglet "Inscription"
3. **Remplissez le formulaire :**
   - Nom complet
   - Email
   - Mot de passe (min. 6 caractères)
   - Confirmer le mot de passe
4. **Cliquez sur** "Créer un compte"
5. **Vérifiez votre email** (si configuré)
6. **Connectez-vous** avec vos identifiants

### 2️⃣ Connexions suivantes

1. **Entrez votre email**
2. **Entrez votre mot de passe**
3. **Cliquez sur** "Se connecter"
4. ✅ Vous êtes redirigé vers l'application !

### 3️⃣ Utilisation de l'application

Une fois connecté :
- Votre nom apparaît dans le header
- Vous avez accès à toutes les fonctionnalités
- Cliquez sur "🚪 Déconnexion" pour vous déconnecter

---

## 🛠️ Configuration Technique

### Fichiers créés

| Fichier | Description |
|---------|-------------|
| `login.html` | Page de connexion/inscription |
| `auth.js` | Logique d'authentification |
| `session-check.js` | Vérification de session |
| `styles.css` | Styles pour la barre utilisateur |

### Structure d'authentification

```
login.html
    ↓
auth.js → Supabase Auth
    ↓
Session créée ✅
    ↓
Redirection → index.html
    ↓
session-check.js vérifie la session
    ↓
✅ Accès autorisé
OU
❌ Redirection vers login.html
```

---

## 🔧 Configuration Supabase Auth

### 1. Activer l'authentification

1. Allez sur https://app.supabase.com/project/msmbvsmadmuhgijdlquj/auth
2. L'authentification est déjà activée par défaut !

### 2. Configurer les emails (optionnel)

#### Option 1 : Désactiver la confirmation email (dev)
```
Auth → Settings → Email Auth
→ Décochez "Enable email confirmations"
```

#### Option 2 : Configurer l'envoi d'emails (production)
```
Auth → Settings → Email Templates
→ Configurez vos templates d'emails
→ Configurez votre serveur SMTP
```

### 3. Configurer les URLs de redirection

```
Auth → Settings → URL Configuration
→ Site URL: https://votre-app.vercel.app
→ Redirect URLs: https://votre-app.vercel.app/index.html
```

---

## 🧪 Tester localement

### Sans Supabase (Mode dev)
```bash
# Ouvrez simplement index.html
# L'app fonctionnera sans authentification

# Pour tester l'authentification :
# 1. Créez config.js avec vos clés Supabase
# 2. Ouvrez login.html
```

### Avec Supabase

1. **Créez `config.js` :**
```javascript
window.SUPABASE_CONFIG = {
    url: 'https://msmbvsmadmuhgijdlquj.supabase.co',
    anonKey: 'votre_anon_key'
};
```

2. **Ajoutez dans `index.html` avant `supabase-client.js` :**
```html
<script src="config.js"></script>
```

3. **Ouvrez `login.html`** dans votre navigateur

---

## 🚀 Déploiement sur Vercel

### Variables d'environnement

Ajoutez ces variables dans Vercel → Settings → Environment Variables :

```
SUPABASE_URL=https://msmbvsmadmuhgijdlquj.supabase.co
SUPABASE_ANON_KEY=votre_anon_key
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
```

### Créer un script d'injection des variables

Créez `api/config.js` :
```javascript
export default function handler(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
        window.SUPABASE_CONFIG = {
            url: '${process.env.SUPABASE_URL}',
            anonKey: '${process.env.SUPABASE_ANON_KEY}'
        };
    `);
}
```

Modifiez `index.html` et `login.html` :
```html
<script src="/api/config"></script>
```

---

## 📊 Gestion des utilisateurs

### Dans Supabase Dashboard

1. **Voir tous les utilisateurs :**
   - https://app.supabase.com/project/msmbvsmadmuhgijdlquj/auth/users

2. **Actions possibles :**
   - Voir les détails d'un utilisateur
   - Confirmer manuellement un email
   - Supprimer un utilisateur
   - Réinitialiser un mot de passe

---

## 🔐 Fonctionnalités de sécurité

### Protection automatique des pages

```javascript
// session-check.js vérifie automatiquement
checkAuth() {
    const session = await supabase.auth.getSession();
    if (!session) {
        // Redirection vers login.html
    }
}
```

### Déconnexion automatique

- Fermeture du navigateur → Session expirée
- Token expiré → Redirection automatique
- Déconnexion manuelle → Nettoyage complet

### Stockage sécurisé

- Sessions stockées dans Supabase
- Tokens JWT sécurisés
- Aucun mot de passe en clair

---

## 🆘 Dépannage

### "Configuration Supabase manquante"

**Solution :**
1. Vérifiez que `config.js` existe
2. Vérifiez que les clés sont correctes
3. Rechargez la page

### "Email ou mot de passe incorrect"

**Solutions :**
- Vérifiez votre email
- Vérifiez votre mot de passe (min. 6 caractères)
- Réinitialisez votre mot de passe si besoin

### "Veuillez confirmer votre email"

**Solutions :**
- Vérifiez votre boîte email
- Vérifiez les spams
- Ou désactivez la confirmation email dans Supabase

### Redirection en boucle

**Solution :**
1. Ouvrez la console (F12)
2. Vérifiez les erreurs
3. Videz le cache et les cookies
4. Reconnectez-vous

---

## 📱 Interface Mobile

Le système d'authentification est **100% responsive** :

- ✅ Formulaires adaptés mobiles
- ✅ Boutons tactiles optimisés
- ✅ Barre utilisateur responsive
- ✅ Déconnexion facile sur mobile

---

## 🎯 Workflow complet

```
1. INSCRIPTION
   ↓
   • Créer un compte
   • Email de confirmation (optionnel)
   ↓
2. CONNEXION
   ↓
   • Entrer email + mot de passe
   • Session créée ✅
   ↓
3. UTILISATION
   ↓
   • Upload documents
   • Créer signatures
   • Positionner signatures
   • Exporter PDF
   ↓
4. DÉCONNEXION
   ↓
   • Clic sur "Déconnexion"
   • Session terminée
   • Redirection vers login
```

---

## 💾 Données utilisateur

### Ce qui est stocké

| Donnée | Où | Quand |
|--------|-----|-------|
| Email | Supabase Auth | À l'inscription |
| Mot de passe (haché) | Supabase Auth | À l'inscription |
| Nom complet | Supabase user_metadata | À l'inscription |
| Signatures | Supabase + localStorage | Après chaque dessin |
| Session | Supabase Auth | À la connexion |

### Ce qui n'est PAS stocké

- ❌ Mots de passe en clair
- ❌ Documents uploadés (sauf si explicitement sauvegardés)
- ❌ Historique de navigation

---

## 🔄 Migration utilisateurs existants

Si vous aviez des utilisateurs avant l'authentification :

1. **Demandez-leur de créer un compte**
2. **Leurs signatures seront chargées** depuis localStorage
3. **Tout continue de fonctionner** normalement

---

## ✅ Checklist de déploiement

- [ ] Schéma SQL exécuté dans Supabase
- [ ] Auth activé dans Supabase
- [ ] URLs de redirection configurées
- [ ] Variables d'environnement dans Vercel
- [ ] Confirmation email configurée (ou désactivée)
- [ ] `login.html` accessible
- [ ] `index.html` protégé par session-check.js
- [ ] Tests de connexion/déconnexion

---

## 🎉 C'est tout !

Votre application dispose maintenant d'un système d'authentification complet et sécurisé !

**Pour toute question :**
- Consultez la documentation Supabase Auth
- Ouvrez la console (F12) pour déboguer
- Vérifiez les logs Supabase

**Bon développement ! 🚀**
