// Application de Signature de Documents
// État global
const state = {
    uploadedFile: null,
    uploadedFileType: null,
    signatureData: null,
    parapheData: null,
    isDrawing: false,
    isDrawingParaphe: false,
    pdfDoc: null,
    originalPdfBytes: null,
    signatureScale: 1
};

// Éléments DOM
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const documentPreview = document.getElementById('document-preview');
const signatureSection = document.getElementById('signature-section');
const parapheSection = document.getElementById('paraphe-section');
const actionsSection = document.getElementById('actions-section');

const signatureCanvas = document.getElementById('signature-canvas');
const ctx = signatureCanvas.getContext('2d');
const clearBtn = document.getElementById('clear-signature');
const colorInput = document.getElementById('signature-color');
const widthInput = document.getElementById('signature-width');

const parapheCanvas = document.getElementById('paraphe-canvas');
const ctxParaphe = parapheCanvas ? parapheCanvas.getContext('2d') : null;
const clearParapheBtn = document.getElementById('clear-paraphe');
const parapheColorInput = document.getElementById('paraphe-color');
const parapheWidthInput = document.getElementById('paraphe-width');

const downloadBtn = document.getElementById('download-btn');
const emailBtn = document.getElementById('email-btn');
const emailForm = document.getElementById('email-form');
const sendEmailBtn = document.getElementById('send-email-btn');
const cancelEmailBtn = document.getElementById('cancel-email-btn');

// Configuration du canvas de signature
ctx.lineJoin = 'round';
ctx.lineCap = 'round';

// Configuration du canvas de paraphe
if (ctxParaphe) {
    ctxParaphe.lineJoin = 'round';
    ctxParaphe.lineCap = 'round';
}

// Rendre le canvas responsive sur mobile
function resizeCanvas() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const container = signatureCanvas.parentElement;
        const containerWidth = container.clientWidth - 40; // padding
        signatureCanvas.width = containerWidth;
        signatureCanvas.height = 300;

        if (parapheCanvas) {
            parapheCanvas.width = containerWidth;
            parapheCanvas.height = 200;
        }
    } else {
        signatureCanvas.width = 600;
        signatureCanvas.height = 200;

        if (parapheCanvas) {
            parapheCanvas.width = 400;
            parapheCanvas.height = 150;
        }
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
    parapheSection.style.display = 'block';
    actionsSection.style.display = 'block';

    // Afficher le contrôle de taille de la signature
    const sizeControl = document.getElementById('signature-size-control');
    if (sizeControl) {
        sizeControl.style.display = 'block';
    }
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

        // Afficher automatiquement la signature sur le document
        showSignatureOnDocument();
    }
}

// Afficher automatiquement la signature sur le document
function showSignatureOnDocument() {
    const signaturePreview = document.getElementById('signature-preview');
    const signatureOverlay = document.getElementById('signature-overlay');

    if (state.signatureData && signaturePreview && signatureOverlay) {
        signaturePreview.src = state.signatureData;
        signatureOverlay.style.display = 'block';
        updateSignaturePreviewPosition();
    }
}

// Effacer la signature
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    state.signatureData = null;
    // Masquer la signature du document
    const signatureOverlay = document.getElementById('signature-overlay');
    if (signatureOverlay) {
        signatureOverlay.style.display = 'none';
    }
});

// ============================================
// GESTION DU PARAPHE
// ============================================

let lastXParaphe = 0;
let lastYParaphe = 0;

// Dessin du paraphe - Souris
if (parapheCanvas) {
    parapheCanvas.addEventListener('mousedown', startDrawingParaphe);
    parapheCanvas.addEventListener('mousemove', drawParaphe);
    parapheCanvas.addEventListener('mouseup', stopDrawingParaphe);
    parapheCanvas.addEventListener('mouseout', stopDrawingParaphe);

    // Support tactile
    parapheCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = parapheCanvas.getBoundingClientRect();
        lastXParaphe = touch.clientX - rect.left;
        lastYParaphe = touch.clientY - rect.top;
        state.isDrawingParaphe = true;
    });

    parapheCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!state.isDrawingParaphe) return;

        const touch = e.touches[0];
        const rect = parapheCanvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        ctxParaphe.strokeStyle = parapheColorInput.value;
        ctxParaphe.lineWidth = parapheWidthInput.value;
        ctxParaphe.beginPath();
        ctxParaphe.moveTo(lastXParaphe, lastYParaphe);
        ctxParaphe.lineTo(x, y);
        ctxParaphe.stroke();

        lastXParaphe = x;
        lastYParaphe = y;
    });

    parapheCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        state.isDrawingParaphe = false;
        state.parapheData = parapheCanvas.toDataURL();
    });
}

function startDrawingParaphe(e) {
    state.isDrawingParaphe = true;
    const rect = parapheCanvas.getBoundingClientRect();
    lastXParaphe = e.clientX - rect.left;
    lastYParaphe = e.clientY - rect.top;
}

function drawParaphe(e) {
    if (!state.isDrawingParaphe) return;

    const rect = parapheCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctxParaphe.strokeStyle = parapheColorInput.value;
    ctxParaphe.lineWidth = parapheWidthInput.value;
    ctxParaphe.beginPath();
    ctxParaphe.moveTo(lastXParaphe, lastYParaphe);
    ctxParaphe.lineTo(x, y);
    ctxParaphe.stroke();

    lastXParaphe = x;
    lastYParaphe = y;
}

function stopDrawingParaphe() {
    if (state.isDrawingParaphe) {
        state.isDrawingParaphe = false;
        state.parapheData = parapheCanvas.toDataURL();
    }
}

// Effacer le paraphe
if (clearParapheBtn) {
    clearParapheBtn.addEventListener('click', () => {
        ctxParaphe.clearRect(0, 0, parapheCanvas.width, parapheCanvas.height);
        state.parapheData = null;
    });
}

// Gestion du slider de taille du paraphe
const parapheSizeSlider = document.getElementById('paraphe-size');
const parapheSizeValue = document.getElementById('paraphe-size-value');

if (parapheSizeSlider && parapheSizeValue) {
    parapheSizeSlider.addEventListener('input', (e) => {
        parapheSizeValue.textContent = `${e.target.value}px`;
    });
}

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

// Nouveau slider de taille sous le PDF
const signatureSizeSlider = document.getElementById('signature-size-slider');
const sizeValueDisplay = document.getElementById('size-value-display');

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let currentSignatureWidth = 150; // Taille par défaut

// Gestion du slider de taille sous le PDF
if (signatureSizeSlider && sizeValueDisplay) {
    signatureSizeSlider.addEventListener('input', (e) => {
        currentSignatureWidth = parseInt(e.target.value);
        sizeValueDisplay.textContent = `${currentSignatureWidth}px`;

        if (signaturePreview && signatureOverlay.style.display !== 'none') {
            // Mettre à jour la largeur de la signature
            signaturePreview.style.width = `${currentSignatureWidth}px`;

            // Contraindre aux limites après le changement de taille
            constrainSignaturePosition();
        }
    });
}

// Drag & Drop de la signature
signaturePreview.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', stopDrag);

// Support tactile pour le drag
signaturePreview.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        startDrag({ clientX: touch.clientX, clientY: touch.clientY });
    }
});

document.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        drag({ clientX: touch.clientX, clientY: touch.clientY });
    }
});

document.addEventListener('touchend', stopDrag);

// Fonction pour contraindre la signature aux limites du PDF
function constrainSignaturePosition() {
    if (!signaturePreview || !documentPreview) return;

    const docCanvas = documentPreview.querySelector('canvas');
    if (!docCanvas) return;

    const docRect = docCanvas.getBoundingClientRect();
    const sigRect = signaturePreview.getBoundingClientRect();

    // Récupérer la position actuelle
    let currentLeft = parseFloat(signaturePreview.style.left) || 0;
    let currentTop = parseFloat(signaturePreview.style.top) || 0;

    // Calculer les dimensions effectives
    const effectiveWidth = sigRect.width;
    const effectiveHeight = sigRect.height;

    // Contraindre aux limites
    const maxX = docRect.width - effectiveWidth;
    const maxY = docRect.height - effectiveHeight;

    currentLeft = Math.max(0, Math.min(currentLeft, maxX));
    currentTop = Math.max(0, Math.min(currentTop, maxY));

    // Appliquer les nouvelles positions
    signaturePreview.style.left = `${currentLeft}px`;
    signaturePreview.style.top = `${currentTop}px`;
}

function startDrag(e) {
    isDragging = true;
    const rect = signaturePreview.getBoundingClientRect();
    const docCanvas = documentPreview.querySelector('canvas');
    if (docCanvas) {
        const docRect = docCanvas.getBoundingClientRect();
        dragStartX = e.clientX - rect.left;
        dragStartY = e.clientY - rect.top;
    }
    signaturePreview.style.cursor = 'grabbing';
}

function drag(e) {
    if (!isDragging) return;

    const docCanvas = documentPreview.querySelector('canvas');
    if (!docCanvas) return;

    const docRect = docCanvas.getBoundingClientRect();

    // Position de la souris relative au document
    let mouseX = e.clientX - docRect.left - dragStartX;
    let mouseY = e.clientY - docRect.top - dragStartY;

    // Calculer les dimensions effectives de la signature avec le scale
    const sigRect = signaturePreview.getBoundingClientRect();
    const effectiveWidth = sigRect.width;
    const effectiveHeight = sigRect.height;

    // Limiter aux bords du document (contrainte stricte)
    const maxX = docRect.width - effectiveWidth;
    const maxY = docRect.height - effectiveHeight;

    mouseX = Math.max(0, Math.min(mouseX, maxX));
    mouseY = Math.max(0, Math.min(mouseY, maxY));

    // Mettre à jour la position visuelle
    signaturePreview.style.left = `${mouseX}px`;
    signaturePreview.style.top = `${mouseY}px`;
}

function stopDrag() {
    if (isDragging) {
        isDragging = false;
        signaturePreview.style.cursor = 'move';
    }
}

// Mettre à jour la position de la signature
function updateSignaturePreviewPosition() {
    if (!signaturePreview || !signatureOverlay) return;

    signaturePreview.style.width = `${currentSignatureWidth}px`;
    signaturePreview.style.height = 'auto';

    // Position initiale au centre
    if (!signaturePreview.style.left) {
        signaturePreview.style.left = '50px';
        signaturePreview.style.top = '50px';
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

    // Récupérer toutes les pages
    const pages = pdfDoc.getPages();

    // Convertir la signature en image PNG
    const signatureImageBytes = await fetch(state.signatureData).then(res => res.arrayBuffer());
    const signatureImage = await pdfDoc.embedPng(signatureImageBytes);

    // Calculer la position de la signature depuis la prévisualisation
    const docCanvas = documentPreview.querySelector('canvas');
    const signatureLeft = parseFloat(signaturePreview.style.left) || 50;
    const signatureTop = parseFloat(signaturePreview.style.top) || 50;

    let signatureX = 50;
    let signatureY = 700;

    if (docCanvas) {
        const docRect = docCanvas.getBoundingClientRect();
        const sigRect = signaturePreview.getBoundingClientRect();

        // Convertir en coordonnées PDF (A4: 595x842 points)
        signatureX = Math.round((signatureLeft / docRect.width) * 595);
        signatureY = Math.round(842 - ((signatureTop + sigRect.height) / docRect.height) * 842);
    }

    // Utiliser la taille actuelle (du slider)
    const signatureDims = signatureImage.scale(currentSignatureWidth / signatureImage.width);

    // Ajouter la signature sur la première page
    const firstPage = pages[0];
    firstPage.drawImage(signatureImage, {
        x: signatureX,
        y: signatureY,
        width: signatureDims.width,
        height: signatureDims.height
    });

    // Ajouter le paraphe sur toutes les pages si défini
    if (state.parapheData) {
        const parapheImageBytes = await fetch(state.parapheData).then(res => res.arrayBuffer());
        const parapheImage = await pdfDoc.embedPng(parapheImageBytes);

        const parapheSize = parseInt(document.getElementById('paraphe-size')?.value || 80);
        const paraphePosition = document.getElementById('paraphe-position')?.value || 'bottom-right';
        const parapheDims = parapheImage.scale(parapheSize / parapheImage.width);

        // Calculer la position selon le choix
        pages.forEach(page => {
            let parapheX, parapheY;
            const pageWidth = page.getWidth();
            const pageHeight = page.getHeight();
            const margin = 5;

            switch (paraphePosition) {
                case 'bottom-right':
                    parapheX = pageWidth - parapheDims.width - margin;
                    parapheY = margin;
                    break;
                case 'bottom-left':
                    parapheX = margin;
                    parapheY = margin;
                    break;
                case 'top-right':
                    parapheX = pageWidth - parapheDims.width - margin;
                    parapheY = pageHeight - parapheDims.height - margin;
                    break;
                case 'top-left':
                    parapheX = margin;
                    parapheY = pageHeight - parapheDims.height - margin;
                    break;
                default:
                    parapheX = pageWidth - parapheDims.width - margin;
                    parapheY = margin;
            }

            page.drawImage(parapheImage, {
                x: parapheX,
                y: parapheY,
                width: parapheDims.width,
                height: parapheDims.height
            });
        });
    }

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
