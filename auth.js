// ============================================
// AUTHENTIFICATION SUPABASE
// ============================================

// Initialiser Supabase client
let supabase = null;

// Fonction pour basculer entre les onglets
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Mettre à jour les onglets actifs
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`${targetTab}-form`).classList.add('active');

        // Réinitialiser les messages
        document.querySelectorAll('.auth-message').forEach(msg => {
            msg.style.display = 'none';
            msg.textContent = '';
        });
    });
});

// Fonction pour afficher/masquer le mot de passe
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

// Fonction pour afficher un message
function showMessage(formType, message, isError = false) {
    const messageDiv = document.getElementById(`${formType}-message`);
    messageDiv.textContent = message;
    messageDiv.className = `auth-message ${isError ? 'error' : 'success'}`;
    messageDiv.style.display = 'block';
}

// Fonction pour désactiver/activer un bouton
function setButtonState(buttonId, disabled, text) {
    const button = document.getElementById(buttonId);
    button.disabled = disabled;
    button.textContent = text;
}

// Initialiser Supabase
async function initAuth() {
    try {
        // Vérifier si Supabase est disponible
        if (typeof window.SUPABASE_CONFIG !== 'undefined') {
            supabase = window.supabase.createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey
            );
            console.log('✅ Supabase Auth initialisé');
            return true;
        } else {
            console.warn('⚠️ Configuration Supabase non trouvée');
            showMessage('login', 'Configuration Supabase manquante. Veuillez configurer l\'application.', true);
            return false;
        }
    } catch (error) {
        console.error('❌ Erreur initialisation Supabase:', error);
        return false;
    }
}

// ============================================
// CONNEXION
// ============================================

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    setButtonState('login-btn', true, '⏳ Connexion en cours...');

    try {
        if (!supabase) {
            const initialized = await initAuth();
            if (!initialized) {
                setButtonState('login-btn', false, 'Se connecter');
                return;
            }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        showMessage('login', '✅ Connexion réussie ! Redirection...', false);

        // Sauvegarder la session
        localStorage.setItem('user', JSON.stringify(data.user));

        // Rediriger vers l'application principale
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);

    } catch (error) {
        console.error('❌ Erreur de connexion:', error);

        let errorMessage = 'Erreur de connexion';

        if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'Email ou mot de passe incorrect';
        } else if (error.message.includes('Email not confirmed')) {
            errorMessage = 'Veuillez confirmer votre email';
        } else {
            errorMessage = error.message || 'Une erreur est survenue';
        }

        showMessage('login', errorMessage, true);
        setButtonState('login-btn', false, 'Se connecter');
    }
});

// ============================================
// INSCRIPTION
// ============================================

document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const passwordConfirm = document.getElementById('signup-password-confirm').value;

    // Vérifier que les mots de passe correspondent
    if (password !== passwordConfirm) {
        showMessage('signup', 'Les mots de passe ne correspondent pas', true);
        return;
    }

    // Vérifier la longueur du mot de passe
    if (password.length < 6) {
        showMessage('signup', 'Le mot de passe doit contenir au moins 6 caractères', true);
        return;
    }

    setButtonState('signup-btn', true, '⏳ Création du compte...');

    try {
        if (!supabase) {
            const initialized = await initAuth();
            if (!initialized) {
                setButtonState('signup-btn', false, 'Créer un compte');
                return;
            }
        }

        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name
                }
            }
        });

        if (error) throw error;

        showMessage('signup', '✅ Compte créé avec succès ! Vérifiez votre email pour confirmer votre compte.', false);

        // Réinitialiser le formulaire
        document.getElementById('signup-form').reset();

        // Basculer vers le formulaire de connexion après 3 secondes
        setTimeout(() => {
            document.querySelector('[data-tab="login"]').click();
            showMessage('login', 'Compte créé ! Vous pouvez maintenant vous connecter.', false);
        }, 3000);

        setButtonState('signup-btn', false, 'Créer un compte');

    } catch (error) {
        console.error('❌ Erreur d\'inscription:', error);

        let errorMessage = 'Erreur lors de la création du compte';

        if (error.message.includes('already registered')) {
            errorMessage = 'Cette adresse email est déjà utilisée';
        } else if (error.message.includes('Password should be')) {
            errorMessage = 'Le mot de passe doit contenir au moins 6 caractères';
        } else {
            errorMessage = error.message || 'Une erreur est survenue';
        }

        showMessage('signup', errorMessage, true);
        setButtonState('signup-btn', false, 'Créer un compte');
    }
});

// ============================================
// VÉRIFIER SI DÉJÀ CONNECTÉ
// ============================================

async function checkExistingSession() {
    try {
        if (!supabase) {
            await initAuth();
        }

        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                // Utilisateur déjà connecté, rediriger vers l'app
                console.log('✅ Session active détectée');
                window.location.href = 'index.html';
            }
        }
    } catch (error) {
        console.error('⚠️ Erreur vérification session:', error);
    }
}

// Initialiser au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
    initAuth();
    checkExistingSession();
});
