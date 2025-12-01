// Configuration pour le développement local
// Copiez ce fichier vers config.js et remplissez avec vos vraies valeurs
// Ne committez JAMAIS config.js (il est dans .gitignore)

window.SUPABASE_CONFIG = {
    url: 'https://votre-projet.supabase.co',
    anonKey: 'votre_anon_key_publique'
};

// Instructions:
// 1. Copiez ce fichier: cp config.example.js config.js
// 2. Obtenez vos clés depuis: https://app.supabase.com/project/_/settings/api
// 3. Remplacez les valeurs dans config.js
// 4. Ajoutez <script src="config.js"></script> dans index.html (avant supabase-client.js)
// 5. Ne committez JAMAIS config.js
