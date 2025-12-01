// Application de Signature de Documents
// État global
const state = {
    uploadedFile: null,
    uploadedFileType: null,
    signatureData: null,
    isDrawing: false,
    pdfDoc: null,
    originalPdfBytes: null,
    previewVisible: false
};

// Éléments DOM
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const documentPreview = document.getElementById('document-preview');
const signatureSection = document.getElementById('signature-section');
const positionSection = document.getElementById('position-section');
const actionsSection = document.getElementById('actions-section');

const signatureCanvas = document.getElementById('signature-canvas');
const ctx = signatureCanvas.getContext('2d');
const clearBtn = document.getElementById('clear-signature');
const colorInput = document.getElementById('signature-color');
const widthInput = document.getElementById('signature-width');

const downloadBtn = document.getElementById('download-btn');
const emailBtn = document.getElementById('email-btn');
const emailForm = document.getElementById('email-form');
const sendEmailBtn = document.getElementById('send-email-btn');
const cancelEmailBtn = document.getElementById('cancel-email-btn');

// Configuration du canvas de signature
ctx.lineJoin = 'round';
ctx.lineCap = 'round';

// Gestion de l'upload de fichier
fileInput.addEventListener('change', handleFileUpload);

// ============================================
// DRAG & DROP - Upload de documents
// ============================================

const dropZone = document.getElementById('drop-zone');

// Empêcher le comportement par défaut pour tous les événements de drag
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight de la zone de drop quand on survole
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight() {
    dropZone.classList.add('dragover');
}

function unhighlight() {
    dropZone.classList.remove('dragover');
}

// Gérer le drop du fichier
dropZone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
        const file = files[0];

        // Vérifier le type de fichier
        if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
            // Créer un événement simulé pour handleFileUpload
            const event = {
                target: {
                    files: [file]
                }
            };
            handleFileUpload(event);
        } else {
            alert('Veuillez déposer un fichier PDF ou une image (JPG, PNG)');
        }
    }
}

// Cliquer sur la zone de drop ouvre aussi le sélecteur de fichiers
dropZone.addEventListener('click', () => {
    fileInput.click();
});

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    state.uploadedFile = file;
    fileInfo.textContent = `Fichier sélectionné: ${file.name}`;

    // Réinitialiser la prévisualisation de la signature
    state.previewVisible = false;
    const signatureOverlay = document.getElementById('signature-overlay');
    const toggleBtn = document.getElementById('toggle-preview-btn');

    if (signatureOverlay) {
        signatureOverlay.style.display = 'none';
    }

    if (toggleBtn) {
        toggleBtn.textContent = '👁️ Afficher la signature sur le document';
    }

    // Vider seulement le contenu du document (garder l'overlay)
    const children = Array.from(documentPreview.children);
    children.forEach(child => {
        if (child.id !== 'signature-overlay') {
            child.remove();
        }
    });

    if (file.type === 'application/pdf') {
        state.uploadedFileType = 'pdf';
        await loadPDF(file);
    } else if (file.type.startsWith('image/')) {
        state.uploadedFileType = 'image';
        loadImage(file);
    }

    // Afficher les sections suivantes
    signatureSection.style.display = 'block';
    positionSection.style.display = 'block';
    actionsSection.style.display = 'block';
}

// Charger et afficher un PDF
async function loadPDF(file) {
    const arrayBuffer = await file.arrayBuffer();

    // Créer une copie de l'ArrayBuffer pour éviter le détachement
    const arrayBufferCopy = arrayBuffer.slice(0);
    state.originalPdfBytes = arrayBufferCopy;

    // Utiliser PDF.js pour l'affichage (avec l'original)
    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;

    // Afficher la première page
    const page = await pdf.getPage(1);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;

    documentPreview.appendChild(canvas);
}

// Charger et afficher une image
function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.maxWidth = '100%';
        documentPreview.appendChild(img);
    };
    reader.readAsDataURL(file);
}

// Gestion du dessin de signature
let lastX = 0;
let lastY = 0;

signatureCanvas.addEventListener('mousedown', startDrawing);
signatureCanvas.addEventListener('mousemove', draw);
signatureCanvas.addEventListener('mouseup', stopDrawing);
signatureCanvas.addEventListener('mouseout', stopDrawing);

// Support tactile
signatureCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = signatureCanvas.getBoundingClientRect();
    lastX = touch.clientX - rect.left;
    lastY = touch.clientY - rect.top;
    state.isDrawing = true;
});

signatureCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!state.isDrawing) return;

    const touch = e.touches[0];
    const rect = signatureCanvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.strokeStyle = colorInput.value;
    ctx.lineWidth = widthInput.value;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
});

signatureCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    state.isDrawing = false;
    state.signatureData = signatureCanvas.toDataURL();
});

function startDrawing(e) {
    state.isDrawing = true;
    const rect = signatureCanvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
}

function draw(e) {
    if (!state.isDrawing) return;

    const rect = signatureCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.strokeStyle = colorInput.value;
    ctx.lineWidth = widthInput.value;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
}

async function stopDrawing() {
    if (state.isDrawing) {
        state.isDrawing = false;
        state.signatureData = signatureCanvas.toDataURL();

        // Sauvegarder automatiquement dans Supabase
        await saveSignatureToDatabase();

        // Mettre à jour la prévisualisation si visible
        updateSignaturePreview();
    }
}

// Fonction pour mettre à jour la prévisualisation de la signature
function updateSignaturePreview() {
    const signaturePreview = document.getElementById('signature-preview');
    const signatureOverlay = document.getElementById('signature-overlay');

    if (state.signatureData && signaturePreview && state.previewVisible) {
        signaturePreview.src = state.signatureData;
        updateSignaturePreviewPosition();
    }
}

// Effacer la signature
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    state.signatureData = null;
    // Masquer la prévisualisation
    const signatureOverlay = document.getElementById('signature-overlay');
    if (signatureOverlay) {
        signatureOverlay.style.display = 'none';
    }
});

// ============================================
// GESTION DES SIGNATURES MULTIPLES
// ============================================

let savedSignatures = [];
let selectedSignatureId = null;

// Éléments DOM pour la gestion des signatures
const saveSignatureBtn = document.getElementById('save-signature-btn');
const signatureNameInput = document.getElementById('signature-name');
const savedSignaturesList = document.getElementById('saved-signatures-list');

// Bouton de sauvegarde
if (saveSignatureBtn) {
    saveSignatureBtn.addEventListener('click', async () => {
        const signatureName = signatureNameInput.value.trim();

        if (!state.signatureData) {
            alert('Veuillez dessiner une signature d\'abord !');
            return;
        }

        if (!signatureName) {
            alert('Veuillez entrer un nom pour la signature');
            signatureNameInput.focus();
            return;
        }

        await saveNewSignature(signatureName);
    });
}

// Sauvegarder une nouvelle signature
async function saveNewSignature(name) {
    try {
        setButtonState('save-signature-btn', true, '⏳ Sauvegarde...');

        // Créer l'objet signature
        const signature = {
            id: `sig_${Date.now()}`,
            name: name,
            data: state.signatureData,
            created_at: new Date().toISOString(),
            width: parseInt(document.getElementById('signature-scale')?.value || 150),
            color: document.getElementById('signature-color')?.value || '#000000'
        };

        // Sauvegarder dans Supabase
        if (typeof saveSignatureTemplate === 'function') {
            const result = await saveSignatureTemplate(name, state.signatureData);

            if (result.success && result.data) {
                signature.id = result.data.id;
                signature.supabase_id = result.data.id;
                console.log('✅ Signature sauvegardée dans Supabase:', signature.id);
            } else {
                console.warn('⚠️ Supabase non disponible, sauvegarde locale uniquement');
            }
        }

        // Sauvegarder dans localStorage comme backup
        savedSignatures.push(signature);
        localStorage.setItem('savedSignatures', JSON.stringify(savedSignatures));

        // Sélectionner automatiquement la nouvelle signature
        selectedSignatureId = signature.id;
        localStorage.setItem('selectedSignatureId', selectedSignatureId);

        // Rafraîchir l'affichage
        displaySavedSignatures();

        // Réinitialiser le formulaire
        signatureNameInput.value = '';

        // Message de succès
        alert(`✅ Signature "${name}" sauvegardée avec succès !`);

        setButtonState('save-signature-btn', false, '✅ Sauvegarder');

    } catch (error) {
        console.error('❌ Erreur sauvegarde signature:', error);
        alert('Erreur lors de la sauvegarde de la signature');
        setButtonState('save-signature-btn', false, '✅ Sauvegarder');
    }
}

// Afficher toutes les signatures sauvegardées
function displaySavedSignatures() {
    if (!savedSignaturesList) return;

    if (savedSignatures.length === 0) {
        savedSignaturesList.innerHTML = '<p class="no-signatures">Aucune signature sauvegardée</p>';
        return;
    }

    savedSignaturesList.innerHTML = '';

    savedSignatures.forEach(signature => {
        const card = document.createElement('div');
        card.className = `signature-card ${signature.id === selectedSignatureId ? 'selected' : ''}`;
        card.onclick = () => selectSignature(signature.id);

        card.innerHTML = `
            <div class="signature-card-header">
                <span class="signature-card-name">${signature.name}</span>
                <div class="signature-card-actions">
                    <button class="signature-card-btn delete" onclick="event.stopPropagation(); deleteSignature('${signature.id}')">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="signature-card-preview">
                <img src="${signature.data}" alt="${signature.name}">
            </div>
            <div class="signature-card-date">
                ${new Date(signature.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                })}
            </div>
            ${signature.id === selectedSignatureId ? '<span class="signature-card-selected-badge">✓ Sélectionnée</span>' : ''}
        `;

        savedSignaturesList.appendChild(card);
    });
}

// Sélectionner une signature
function selectSignature(signatureId) {
    const signature = savedSignatures.find(s => s.id === signatureId);
    if (!signature) return;

    selectedSignatureId = signatureId;
    localStorage.setItem('selectedSignatureId', selectedSignatureId);

    // Charger la signature sur le canvas
    state.signatureData = signature.data;

    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        ctx.drawImage(img, 0, 0, signatureCanvas.width, signatureCanvas.height);
        console.log('✅ Signature sélectionnée:', signature.name);
    };
    img.src = signature.data;

    // Mettre à jour l'affichage
    displaySavedSignatures();

    // Mettre à jour la prévisualisation si visible
    if (state.previewVisible) {
        updateSignaturePreview();
    }
}

// Supprimer une signature
async function deleteSignature(signatureId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette signature ?')) {
        return;
    }

    try {
        const signature = savedSignatures.find(s => s.id === signatureId);

        // Supprimer de Supabase si elle a un ID Supabase
        if (signature && signature.supabase_id && typeof supabaseClient !== 'undefined') {
            // TODO: Ajouter une fonction de suppression dans supabase-client.js
            console.log('🗑️ Suppression Supabase:', signature.supabase_id);
        }

        // Supprimer du tableau local
        savedSignatures = savedSignatures.filter(s => s.id !== signatureId);
        localStorage.setItem('savedSignatures', JSON.stringify(savedSignatures));

        // Si c'était la signature sélectionnée, la déselectionner
        if (selectedSignatureId === signatureId) {
            selectedSignatureId = null;
            localStorage.removeItem('selectedSignatureId');
            // Effacer le canvas
            ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
            state.signatureData = null;
        }

        // Rafraîchir l'affichage
        displaySavedSignatures();

        console.log('✅ Signature supprimée');

    } catch (error) {
        console.error('❌ Erreur suppression signature:', error);
        alert('Erreur lors de la suppression de la signature');
    }
}

// Charger les signatures au démarrage
async function loadSavedSignatures() {
    try {
        // Charger depuis localStorage
        const localSignatures = localStorage.getItem('savedSignatures');
        if (localSignatures) {
            savedSignatures = JSON.parse(localSignatures);
            console.log(`📋 ${savedSignatures.length} signature(s) chargée(s) depuis localStorage`);
        }

        // Charger depuis Supabase
        if (typeof getSignatureTemplates === 'function') {
            const result = await getSignatureTemplates();

            if (result.success && result.data && result.data.length > 0) {
                console.log(`📋 ${result.data.length} signature(s) trouvée(s) dans Supabase`);

                // Fusionner avec les signatures locales
                result.data.forEach(supabaseSignature => {
                    // Vérifier si elle n'existe pas déjà
                    const exists = savedSignatures.find(s => s.supabase_id === supabaseSignature.id);
                    if (!exists) {
                        savedSignatures.push({
                            id: supabaseSignature.id,
                            supabase_id: supabaseSignature.id,
                            name: supabaseSignature.name,
                            data: supabaseSignature.signature_data,
                            created_at: supabaseSignature.created_at,
                            width: supabaseSignature.default_width,
                            color: supabaseSignature.default_color
                        });
                    }
                });

                // Sauvegarder dans localStorage
                localStorage.setItem('savedSignatures', JSON.stringify(savedSignatures));
            }
        }

        // Charger la signature sélectionnée
        const savedSelectedId = localStorage.getItem('selectedSignatureId');
        if (savedSelectedId) {
            selectSignature(savedSelectedId);
        }

        // Afficher les signatures
        displaySavedSignatures();

    } catch (error) {
        console.warn('⚠️ Erreur chargement signatures:', error);
    }
}

// Fonction helper pour désactiver/activer un bouton
function setButtonState(buttonId, disabled, text) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = disabled;
        button.textContent = text;
    }
}

// Charger les signatures au démarrage de l'application
window.addEventListener('DOMContentLoaded', () => {
    loadSavedSignatures();
});

// ============================================
// DRAG & DROP - Positionnement de la signature
// ============================================

const signatureOverlay = document.getElementById('signature-overlay');
const signaturePreview = document.getElementById('signature-preview');
const togglePreviewBtn = document.getElementById('toggle-preview-btn');
const signatureXInput = document.getElementById('signature-x');
const signatureYInput = document.getElementById('signature-y');
const signatureScaleInput = document.getElementById('signature-scale');
const scaleValueDisplay = document.getElementById('scale-value');

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// Toggle affichage de la signature sur le document
if (togglePreviewBtn) {
    togglePreviewBtn.addEventListener('click', () => {
        if (!state.signatureData) {
            alert('Veuillez créer une signature d\'abord!');
            return;
        }

        state.previewVisible = !state.previewVisible;

        if (state.previewVisible) {
            // Afficher la signature
            signaturePreview.src = state.signatureData;
            updateSignaturePreviewPosition();
            signatureOverlay.style.display = 'block';
            togglePreviewBtn.textContent = '👁️ Masquer la signature';
        } else {
            // Masquer la signature
            signatureOverlay.style.display = 'none';
            togglePreviewBtn.textContent = '👁️ Afficher la signature';
        }
    });
}

// Mettre à jour la position et taille de la signature preview
function updateSignaturePreviewPosition() {
    if (!signaturePreview || !signatureOverlay) return;

    const x = parseInt(signatureXInput.value);
    const y = parseInt(signatureYInput.value);
    const width = parseInt(signatureScaleInput.value);

    // Calculer la position relative au document preview
    const docCanvas = documentPreview.querySelector('canvas');
    if (!docCanvas) return;

    const docRect = docCanvas.getBoundingClientRect();
    const previewRect = documentPreview.getBoundingClientRect();

    // Position relative dans le preview
    const relativeX = (x / 595) * docCanvas.width;
    const relativeY = docCanvas.height - (y / 842) * docCanvas.height;

    signaturePreview.style.left = `${relativeX}px`;
    signaturePreview.style.top = `${relativeY}px`;
    signaturePreview.style.width = `${width}px`;
    signaturePreview.style.height = 'auto';
}

// Mettre à jour l'affichage de la valeur du scale
signatureScaleInput.addEventListener('input', (e) => {
    scaleValueDisplay.textContent = `${e.target.value}px`;
    if (state.previewVisible) {
        updateSignaturePreviewPosition();
    }
});

// Mettre à jour la position quand les inputs changent
signatureXInput.addEventListener('input', () => {
    if (state.previewVisible) updateSignaturePreviewPosition();
});

signatureYInput.addEventListener('input', () => {
    if (state.previewVisible) updateSignaturePreviewPosition();
});

// Drag & Drop de la signature
signaturePreview.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', stopDrag);

// Support tactile
signaturePreview.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDrag({ clientX: touch.clientX, clientY: touch.clientY });
});

document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    drag({ clientX: touch.clientX, clientY: touch.clientY });
});

document.addEventListener('touchend', stopDrag);

function startDrag(e) {
    isDragging = true;
    const rect = signaturePreview.getBoundingClientRect();
    dragStartX = e.clientX - rect.left;
    dragStartY = e.clientY - rect.top;
    signaturePreview.style.cursor = 'grabbing';
}

function drag(e) {
    if (!isDragging) return;

    const docCanvas = documentPreview.querySelector('canvas');
    if (!docCanvas) return;

    const docRect = docCanvas.getBoundingClientRect();
    const previewRect = documentPreview.getBoundingClientRect();

    // Position de la souris relative au document
    let mouseX = e.clientX - docRect.left - dragStartX;
    let mouseY = e.clientY - docRect.top - dragStartY;

    // Limiter aux bords du document
    mouseX = Math.max(0, Math.min(mouseX, docRect.width - signaturePreview.offsetWidth));
    mouseY = Math.max(0, Math.min(mouseY, docRect.height - signaturePreview.offsetHeight));

    // Mettre à jour la position visuelle
    signaturePreview.style.left = `${mouseX}px`;
    signaturePreview.style.top = `${mouseY}px`;

    // Convertir en coordonnées PDF (A4: 595x842 points)
    const pdfX = Math.round((mouseX / docRect.width) * 595);
    const pdfY = Math.round(842 - ((mouseY + signaturePreview.offsetHeight) / docRect.height) * 842);

    // Mettre à jour les inputs
    signatureXInput.value = pdfX;
    signatureYInput.value = pdfY;
}

function stopDrag() {
    if (isDragging) {
        isDragging = false;
        signaturePreview.style.cursor = 'move';
    }
}

// Générer le PDF avec signature
downloadBtn.addEventListener('click', generateAndDownloadPDF);

async function generateAndDownloadPDF() {
    if (!state.signatureData) {
        alert('Veuillez créer une signature d\'abord!');
        return;
    }

    try {
        const pdfBytes = await createSignedPDF();

        // Télécharger le PDF
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document_signé_${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);

        alert('PDF téléchargé avec succès!');
    } catch (error) {
        console.error('Erreur lors de la génération du PDF:', error);
        alert('Erreur lors de la génération du PDF: ' + error.message);
    }
}

async function createSignedPDF() {
    const { PDFDocument } = PDFLib;

    let pdfDoc;

    if (state.uploadedFileType === 'pdf') {
        // Charger le PDF existant
        pdfDoc = await PDFDocument.load(state.originalPdfBytes);
    } else {
        // Créer un nouveau PDF pour l'image
        pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595, 842]); // A4

        if (state.uploadedFileType === 'image') {
            const imgData = await state.uploadedFile.arrayBuffer();
            let image;

            if (state.uploadedFile.type === 'image/png') {
                image = await pdfDoc.embedPng(imgData);
            } else {
                image = await pdfDoc.embedJpg(imgData);
            }

            const imgDims = image.scale(0.5);
            page.drawImage(image, {
                x: 50,
                y: page.getHeight() - imgDims.height - 50,
                width: imgDims.width,
                height: imgDims.height,
            });
        }
    }

    // Ajouter la signature à la première page
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // Convertir la signature en image PNG
    const signatureImageBytes = await fetch(state.signatureData).then(res => res.arrayBuffer());
    const signatureImage = await pdfDoc.embedPng(signatureImageBytes);

    const signatureX = parseInt(document.getElementById('signature-x').value);
    const signatureY = parseInt(document.getElementById('signature-y').value);
    const signatureScale = parseInt(document.getElementById('signature-scale').value);

    const signatureDims = signatureImage.scale(signatureScale / signatureImage.width);

    firstPage.drawImage(signatureImage, {
        x: signatureX,
        y: signatureY,
        width: signatureDims.width,
        height: signatureDims.height,
    });

    return await pdfDoc.save();
}

// Gestion de l'email
emailBtn.addEventListener('click', () => {
    emailForm.style.display = 'block';
});

cancelEmailBtn.addEventListener('click', () => {
    emailForm.style.display = 'none';
    document.getElementById('email-status').textContent = '';
});

sendEmailBtn.addEventListener('click', async () => {
    const recipientEmail = document.getElementById('recipient-email').value;
    const subject = document.getElementById('email-subject').value;
    const message = document.getElementById('email-message').value;
    const statusDiv = document.getElementById('email-status');

    if (!recipientEmail) {
        statusDiv.textContent = 'Veuillez entrer une adresse email';
        statusDiv.className = 'status-message error';
        return;
    }

    if (!state.signatureData) {
        statusDiv.textContent = 'Veuillez créer une signature d\'abord';
        statusDiv.className = 'status-message error';
        return;
    }

    try {
        statusDiv.textContent = 'Envoi en cours...';
        statusDiv.className = 'status-message';

        const pdfBytes = await createSignedPDF();
        const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));

        // Utiliser l'API relative pour Vercel (fonctionne aussi en local avec server.js)
        const apiUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3000/send-email'
            : '/api/send-email';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: recipientEmail,
                subject: subject,
                message: message,
                pdfData: pdfBase64
            })
        });

        const result = await response.json();

        if (result.success) {
            statusDiv.textContent = 'Email envoyé avec succès!';
            statusDiv.className = 'status-message success';
            setTimeout(() => {
                emailForm.style.display = 'none';
                statusDiv.textContent = '';
            }, 3000);
        } else {
            statusDiv.textContent = 'Erreur: ' + result.message;
            statusDiv.className = 'status-message error';
        }
    } catch (error) {
        console.error('Erreur lors de l\'envoi de l\'email:', error);
        statusDiv.textContent = 'Erreur lors de l\'envoi de l\'email. Assurez-vous que le serveur est démarré.';
        statusDiv.className = 'status-message error';
    }
});
