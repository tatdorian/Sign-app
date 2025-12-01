// ============================================
// VÉRIFICATION DE SESSION - Protection de l'application
// ============================================

let currentUser = null;
let supabaseAuth = null;

// Initialiser Supabase pour la vérification de session
async function initSessionCheck() {
    try {
        if (typeof window.SUPABASE_CONFIG !== 'undefined' && typeof supabase !== 'undefined') {
            supabaseAuth = supabase.createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey
            );
            return true;
        }
        return false;
    } catch (error) {
        console.warn('⚠️ Supabase non disponible:', error);
        return false;
    }
}

// Vérifier si l'utilisateur est connecté
async function checkAuth() {
    try {
        const initialized = await initSessionCheck();

        if (!initialized) {
            console.log('ℹ️ Mode sans authentification');
            return;
        }

        const { data: { session } } = await supabaseAuth.auth.getSession();

        if (!session) {
            // Pas de session, rediriger vers login
            console.log('❌ Aucune session active, redirection vers login...');
            window.location.href = 'login.html';
            return;
        }

        currentUser = session.user;
        console.log('✅ Utilisateur connecté:', currentUser.email);

        // Afficher les informations de l'utilisateur
        displayUserInfo();

    } catch (error) {
        console.error('❌ Erreur vérification session:', error);
        // En cas d'erreur, ne pas bloquer l'accès (mode dégradé)
    }
}

// Afficher les informations de l'utilisateur dans le header
function displayUserInfo() {
    const header = document.querySelector('header');

    if (!header || !currentUser) return;

    // Créer une barre d'utilisateur
    const userBar = document.createElement('div');
    userBar.className = 'user-bar';
    userBar.innerHTML = `
        <div class="user-info">
            <span class="user-icon">👤</span>
            <span class="user-name">${currentUser.user_metadata?.full_name || currentUser.email}</span>
        </div>
        <button class="btn btn-secondary" id="logout-btn" onclick="logout()">
            🚪 Déconnexion
        </button>
    `;

    header.appendChild(userBar);
}

// Fonction de déconnexion
async function logout() {
    try {
        if (supabaseAuth) {
            await supabaseAuth.auth.signOut();
        }

        // Nettoyer le localStorage
        localStorage.removeItem('user');
        localStorage.removeItem('lastSignature');
        localStorage.removeItem('lastSignatureId');

        console.log('✅ Déconnexion réussie');

        // Rediriger vers la page de connexion
        window.location.href = 'login.html';

    } catch (error) {
        console.error('❌ Erreur lors de la déconnexion:', error);
        alert('Erreur lors de la déconnexion');
    }
}

// Écouter les changements d'état d'authentification
async function setupAuthListener() {
    if (supabaseAuth) {
        supabaseAuth.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                window.location.href = 'login.html';
            }
        });
    }
}

// Vérifier l'authentification au chargement
window.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await setupAuthListener();
});
