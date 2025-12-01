// Application de Signature de Documents
// État global
const state = {
    uploadedFile: null,
    uploadedFileType: null,
    signatureData: null,
    isDrawing: false,
    pdfDoc: null,
    originalPdfBytes: null,
    previewVisible: false,
    signatureRotation: 0,
    signatureScale: 1
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

// Rendre le canvas responsive sur mobile
function resizeCanvas() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const container = signatureCanvas.parentElement;
        const containerWidth = container.clientWidth - 40; // padding
        signatureCanvas.width = containerWidth;
        signatureCanvas.height = 300;
    } else {
        signatureCanvas.width = 600;
        signatureCanvas.height = 200;
    }
}

// Appeler au chargement et au redimensionnement
window.addEventListener('load', resizeCanvas);
window.addEventListener('resize', resizeCanvas);

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
// SAUVEGARDE AUTOMATIQUE DE LA SIGNATURE
// ============================================

// Sauvegarder automatiquement la signature
async function saveSignatureToDatabase() {
    if (!state.signatureData) return;

    try {
        // Sauvegarder dans localStorage
        localStorage.setItem('lastSignature', state.signatureData);

        // Sauvegarder dans Supabase si disponible
        if (typeof saveSignatureTemplate === 'function') {
            const result = await saveSignatureTemplate('Signature', state.signatureData);
            if (result.success) {
                console.log('✅ Signature sauvegardée dans Supabase');
            }
        }
    } catch (error) {
        console.warn('⚠️ Erreur sauvegarde signature:', error);
    }
}

// Charger la dernière signature au démarrage
async function loadLastSignature() {
    try {
        const localSignature = localStorage.getItem('lastSignature');
        if (localSignature) {
            state.signatureData = localSignature;
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
                ctx.drawImage(img, 0, 0, signatureCanvas.width, signatureCanvas.height);
                console.log('✅ Signature chargée');
            };
            img.src = state.signatureData;
        }
    } catch (error) {
        console.warn('⚠️ Erreur chargement signature:', error);
    }
}

// Charger la signature au démarrage de l'application
window.addEventListener('DOMContentLoaded', () => {
    loadLastSignature();
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

// ============================================
// GESTES TACTILES - Pinch to Zoom et Rotation
// ============================================

let touchStartDistance = 0;
let touchStartAngle = 0;
let lastScale = 1;
let lastRotation = 0;

// Calculer la distance entre deux points tactiles
function getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Calculer l'angle entre deux points tactiles
function getAngle(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.atan2(dy, dx) * 180 / Math.PI;
}

// Gestion des gestes tactiles sur la signature
signaturePreview.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        // Deux doigts : pinch to zoom et rotation
        touchStartDistance = getDistance(e.touches[0], e.touches[1]);
        touchStartAngle = getAngle(e.touches[0], e.touches[1]);
        lastScale = state.signatureScale;
        lastRotation = state.signatureRotation;
    } else if (e.touches.length === 1) {
        // Un doigt : drag (déjà géré plus haut)
        const touch = e.touches[0];
        startDrag({ clientX: touch.clientX, clientY: touch.clientY });
    }
});

signaturePreview.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();

        // Calculer le nouveau zoom
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scaleChange = currentDistance / touchStartDistance;
        state.signatureScale = Math.max(0.5, Math.min(3, lastScale * scaleChange));

        // Calculer la nouvelle rotation
        const currentAngle = getAngle(e.touches[0], e.touches[1]);
        const angleDiff = currentAngle - touchStartAngle;
        state.signatureRotation = lastRotation + angleDiff;

        // Appliquer les transformations
        applySignatureTransform();

    } else if (e.touches.length === 1 && isDragging) {
        // Un doigt : drag
        e.preventDefault();
        const touch = e.touches[0];
        drag({ clientX: touch.clientX, clientY: touch.clientY });
    }
});

signaturePreview.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        touchStartDistance = 0;
        touchStartAngle = 0;
    }
    if (e.touches.length === 0) {
        stopDrag();
    }
});

// Appliquer les transformations CSS à la signature
function applySignatureTransform() {
    if (signaturePreview) {
        const transform = `scale(${state.signatureScale}) rotate(${state.signatureRotation}deg)`;
        signaturePreview.style.transform = transform;
        signaturePreview.style.transformOrigin = 'center center';
    }
}

// Mettre à jour la position de la signature avec les transformations
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

    // Appliquer les transformations (zoom et rotation)
    applySignatureTransform();
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
    const signatureBaseScale = parseInt(document.getElementById('signature-scale').value);

    // Appliquer l'échelle de base et l'échelle du geste tactile
    const finalScale = signatureBaseScale * state.signatureScale;
    const signatureDims = signatureImage.scale(finalScale / signatureImage.width);

    // Convertir la rotation en radians pour pdf-lib
    const rotationRadians = (state.signatureRotation * Math.PI) / 180;

    firstPage.drawImage(signatureImage, {
        x: signatureX,
        y: signatureY,
        width: signatureDims.width,
        height: signatureDims.height,
        rotate: { angle: rotationRadians, type: 'radians' }
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
