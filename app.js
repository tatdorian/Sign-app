// Application de Signature de Documents

// Configuration pdf.js : le worker doit correspondre exactement à la version du CDN
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ==============================================
// ETAT GLOBAL
// ==============================================
const state = {
    uploadedFile: null,
    uploadedFileType: null,
    signatureData: null,
    parapheData: null,
    isDrawing: false,
    isDrawingParaphe: false,
    pdfDoc: null,
    originalPdfBytes: null,
    signatureScale: 1,
    totalPages: 1,
    currentPage: 1,
    signaturePage: 1,
    paraphePosition: { x: 50, y: 50 },
    paraphePage: 1,
    signatureHistory: [],  // historique pour undo signature
    parapheHistory: [],    // historique pour undo paraphe
    previewVisible: false,
    // Outils par cible: 'pen' | 'highlighter' | 'eraser'
    signatureTool: 'pen',
    parapheTool: 'pen',
    // Texte extrait du PDF par page (pour l'édition inline du texte existant)
    pageTextRuns: {}
};

// ==============================================
// ELEMENTS DOM
// ==============================================
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const documentPreview = document.getElementById('document-preview');
const signatureSection = document.getElementById('signature-section');
const parapheSection = document.getElementById('paraphe-section');
const actionsSection = document.getElementById('actions-section');

const signatureCanvas = document.getElementById('signature-canvas');
const ctx = signatureCanvas.getContext('2d');
const clearBtn = document.getElementById('clear-signature');
const undoSignatureBtn = document.getElementById('undo-signature');
const colorInput = document.getElementById('signature-color');
const widthInput = document.getElementById('signature-width');

const parapheCanvas = document.getElementById('paraphe-canvas');
const ctxParaphe = parapheCanvas ? parapheCanvas.getContext('2d') : null;
const clearParapheBtn = document.getElementById('clear-paraphe');
const undoParapheBtn = document.getElementById('undo-paraphe');
const parapheColorInput = document.getElementById('paraphe-color');
const parapheWidthInput = document.getElementById('paraphe-width');

const downloadBtn = document.getElementById('download-btn');

// Configuration du canvas
ctx.lineJoin = 'round';
ctx.lineCap = 'round';

if (ctxParaphe) {
    ctxParaphe.lineJoin = 'round';
    ctxParaphe.lineCap = 'round';
}

// ==============================================
// DETECTION MOBILE
// ==============================================
function isMobile() {
    return window.innerWidth <= 768 || ('ontouchstart' in window);
}

function isPhone() {
    return window.innerWidth <= 480;
}

// ==============================================
// OUTILS DE DESSIN: stylo, surligneur, gomme
// ==============================================
function applyToolStyle(context, tool, color, width) {
    context.save();
    context.lineJoin = 'round';
    context.lineCap = 'round';
    if (tool === 'eraser') {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = 'rgba(0,0,0,1)';
        context.globalAlpha = 1;
        context.lineWidth = Math.max(width * 3, 8);
    } else if (tool === 'highlighter') {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = color;
        context.globalAlpha = 0.35;
        context.lineWidth = Math.max(width * 4, 12);
        context.lineCap = 'square';
        context.lineJoin = 'miter';
    } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = color;
        context.globalAlpha = 1;
        context.lineWidth = width;
    }
}

function resetToolStyle(context) {
    context.restore();
}

// Indicateur de curseur selon l'outil
function updateCanvasCursor(canvas, tool) {
    if (!canvas) return;
    if (tool === 'eraser') canvas.style.cursor = 'cell';
    else if (tool === 'highlighter') canvas.style.cursor = 'crosshair';
    else canvas.style.cursor = 'crosshair';
}

// ==============================================
// CANVAS RESPONSIVE
// ==============================================
let resizeTimeout;
function resizeCanvas() {
    const container = signatureCanvas.parentElement;
    if (!container) return;
    const containerWidth = container.clientWidth - (isPhone() ? 28 : 40);

    if (isMobile()) {
        signatureCanvas.width = Math.max(200, containerWidth);
        signatureCanvas.height = isPhone() ? 220 : 240;
        if (parapheCanvas) {
            parapheCanvas.width = Math.max(200, containerWidth);
            parapheCanvas.height = isPhone() ? 160 : 180;
        }
    } else {
        signatureCanvas.width = 600;
        signatureCanvas.height = 200;
        if (parapheCanvas) {
            parapheCanvas.width = 400;
            parapheCanvas.height = 150;
        }
    }

    // Reconfigurer apres resize
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (ctxParaphe) {
        ctxParaphe.lineJoin = 'round';
        ctxParaphe.lineCap = 'round';
    }

    // Redessiner la signature si elle existe
    if (state.signatureData) {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, signatureCanvas.width, signatureCanvas.height);
        };
        img.src = state.signatureData;
    }
    if (state.parapheData && ctxParaphe) {
        const img = new Image();
        img.onload = () => {
            ctxParaphe.drawImage(img, 0, 0, parapheCanvas.width, parapheCanvas.height);
        };
        img.src = state.parapheData;
    }

    // Adapter la taille par defaut de la signature sur mobile
    if (isPhone() && currentSignatureWidth > 120) {
        currentSignatureWidth = 100;
        if (signatureSizeSlider) signatureSizeSlider.value = currentSignatureWidth;
        if (sizeValueDisplay) sizeValueDisplay.textContent = `${currentSignatureWidth}px`;
    }
}

window.addEventListener('load', resizeCanvas);
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeCanvas, 150);
});

// Gestion changement d'orientation
window.addEventListener('orientationchange', () => {
    setTimeout(resizeCanvas, 300);
});

// ==============================================
// UPLOAD DE FICHIER
// ==============================================
fileInput.addEventListener('change', handleFileUpload);

const dropZone = document.getElementById('drop-zone');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
            handleFileUpload({ target: { files: [file] } });
        } else {
            alert('Veuillez deposer un fichier PDF ou une image (JPG, PNG)');
        }
    }
}

// "Parcourir" déclenche le sélecteur de fichier — le click du bouton
// remonte à dropZone, donc on gère tout ici (pas de double déclenchement).
dropZone.addEventListener('click', (e) => {
    // Ignorer les clics qui viennent d'éléments interactifs internes
    // autres que le bouton de navigation (swatches, sliders…)
    fileInput.click();
});
const browseBtn = document.getElementById('browse-btn');
if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // évite le double déclenchement via dropZone
        fileInput.click();
    });
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    showLoader();

    try {
        state.uploadedFile = file;
        fileInfo.textContent = `Fichier: ${file.name}`;

        // Reset overlays position for new document
        const signatureOverlay = document.getElementById('signature-overlay');
        const parapheOverlay = document.getElementById('paraphe-overlay');
        const sigPreview = document.getElementById('signature-preview');
        const parPreview = document.getElementById('paraphe-preview');

        if (signatureOverlay) signatureOverlay.style.display = 'none';
        if (parapheOverlay) parapheOverlay.style.display = 'none';

        // Reset position for new document
        if (sigPreview) {
            sigPreview.style.left = '';
            sigPreview.style.top = '';
        }
        if (parPreview) {
            parPreview.style.left = '';
            parPreview.style.top = '';
        }

        removeParapheClones();
        removeSignatureClones();

        // Vider le contenu precedent (garder les overlays)
        const children = Array.from(documentPreview.children);
        children.forEach(child => {
            if (child.id !== 'signature-overlay' && child.id !== 'paraphe-overlay' && child.id !== 'editor-overlay') {
                child.remove();
            }
        });

        if (file.type === 'application/pdf') {
            state.uploadedFileType = 'pdf';
            await loadPDF(file);
        } else if (file.type.startsWith('image/')) {
            state.uploadedFileType = 'image';
            await loadImage(file);
        }

        // Document chargé : appliquer la visibilité selon le service actif
        documentLoaded = true;

        const sizeControl = document.getElementById('signature-size-control');
        if (sizeControl) sizeControl.style.display = 'block';

        const placementControl = document.getElementById('sig-placement-control');
        if (placementControl) placementControl.style.display = 'flex';

        // Afficher toolbar
        const toolbar = document.getElementById('doc-toolbar');
        if (toolbar) toolbar.style.display = 'flex';

        applyView();

        // Afficher page selector si multi-pages

        // Si une signature/paraphe cache existe, l'afficher
        setTimeout(() => {
            if (state.signatureData) showSignatureOnDocument();
            if (state.parapheData) showParapheOnDocument();
        }, 500);
    } catch (error) {
        console.error('Erreur chargement fichier:', error);
        alert('Erreur lors du chargement: ' + error.message);
    } finally {
        hideLoader();
    }
}

// ==============================================
// NOUVEAU DOCUMENT
// ==============================================
const newDocBtn = document.getElementById('new-doc-btn');
if (newDocBtn) {
    newDocBtn.addEventListener('click', () => {
        // Reset document state mais garder signature/paraphe
        state.uploadedFile = null;
        state.uploadedFileType = null;
        state.pdfDoc = null;
        state.originalPdfBytes = null;
        state.totalPages = 1;
        state.currentPage = 1;
        state.signaturePage = 1;

        // Reset overlays
        const signatureOverlay = document.getElementById('signature-overlay');
        const parapheOverlay = document.getElementById('paraphe-overlay');
        const sigPreview = document.getElementById('signature-preview');
        const parPreview = document.getElementById('paraphe-preview');

        if (signatureOverlay) signatureOverlay.style.display = 'none';
        if (parapheOverlay) parapheOverlay.style.display = 'none';
        if (sigPreview) {
            sigPreview.style.left = '';
            sigPreview.style.top = '';
        }
        if (parPreview) {
            parPreview.style.left = '';
            parPreview.style.top = '';
        }

        removeParapheClones();
        removeSignatureClones();

        // Vider le preview
        const children = Array.from(documentPreview.children);
        children.forEach(child => {
            if (child.id !== 'signature-overlay' && child.id !== 'paraphe-overlay' && child.id !== 'editor-overlay') {
                child.remove();
            }
        });

        // Masquer les controls
        const sizeControl = document.getElementById('signature-size-control');
        const toolbar = document.getElementById('doc-toolbar');
        const placementControl = document.getElementById('sig-placement-control');
        if (sizeControl) sizeControl.style.display = 'none';
        if (toolbar) toolbar.style.display = 'none';
        if (placementControl) placementControl.style.display = 'none';

        // Remettre la zone d'upload visible
        dropZone.style.display = '';
        fileInput.value = '';
        fileInfo.textContent = 'PDF ou Image (JPG, PNG)';

        // Réinitialiser l'éditeur (les éléments sont propres au document)
        documentLoaded = false;
        if (typeof resetEditor === 'function') resetEditor();
        if (typeof applyView === 'function') applyView();

        // Garder les sections signature/paraphe/actions visibles si signature existe
        if (!state.signatureData) {
            signatureSection.style.display = 'none';
            parapheSection.style.display = 'none';
            actionsSection.style.display = 'none';
        }
    });
}

// ==============================================
// LOADER
// ==============================================
function showLoader() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = 'none';
}

// ==============================================
// CHARGEMENT PDF - RESPONSIVE
// ==============================================
async function loadPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const arrayBufferCopy = arrayBuffer.slice(0);
    state.originalPdfBytes = arrayBufferCopy;

    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;

    // Vider contenu precedent
    const children = Array.from(documentPreview.children);
    children.forEach(child => {
        if (child.id !== 'signature-overlay' && child.id !== 'paraphe-overlay' && child.id !== 'editor-overlay') {
            child.remove();
        }
    });

    const pagesContainer = document.createElement('div');
    pagesContainer.className = 'pdf-pages-container';
    pagesContainer.id = 'pdf-pages-container';

    const numPages = pdf.numPages;

    // Calculer le scale adaptatif base sur la largeur du conteneur
    const containerWidth = documentPreview.clientWidth || 800;
    const firstPage = await pdf.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    // Scale pour que la page rentre dans le conteneur, avec un minimum de 1.5 pour la qualite
    const fitScale = containerWidth / baseViewport.width;
    const renderScale = Math.max(1.5, fitScale);

    state.pageTextRuns = {};

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: renderScale });

        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page-container';
        pageContainer.dataset.pageNumber = pageNum;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.className = 'pdf-page-canvas';

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Extraire le texte existant (positions en pixels canvas) pour l'édition inline
        try {
            const textContent = await page.getTextContent();
            const runs = [];
            const Util = pdfjsLib.Util;
            for (const item of textContent.items) {
                if (!item.str || !item.str.trim()) continue;
                const tx = Util.transform(viewport.transform, item.transform);
                const fontHeight = Math.hypot(tx[2], tx[3]);
                const left = tx[4];
                const top = tx[5] - fontHeight;
                const width = (item.width || 0) * viewport.scale;
                if (width < 1 || fontHeight < 1) continue;
                runs.push({ str: item.str, cx: left, cy: top, cw: width, ch: fontHeight });
            }
            state.pageTextRuns[pageNum] = runs;
        } catch (err) {
            console.warn('Extraction texte page ' + pageNum + ':', err);
            state.pageTextRuns[pageNum] = [];
        }

        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        pageLabel.textContent = `Page ${pageNum} / ${numPages}`;

        // Canvas d'annotation par-dessus la page PDF
        const annotCanvas = document.createElement('canvas');
        annotCanvas.width = canvas.width;
        annotCanvas.height = canvas.height;
        annotCanvas.className = 'annotation-canvas';
        annotCanvas.dataset.page = pageNum;

        pageContainer.appendChild(canvas);
        pageContainer.appendChild(annotCanvas);
        pageContainer.appendChild(pageLabel);
        pagesContainer.appendChild(pageContainer);
    }

    documentPreview.insertBefore(pagesContainer, documentPreview.firstChild);

    // Positionner les overlays - couvrir toute la hauteur du document
    const signatureOverlay = document.getElementById('signature-overlay');
    const parapheOverlay = document.getElementById('paraphe-overlay');

    // Attendre que le layout soit calcule avant de mesurer la hauteur
    requestAnimationFrame(() => {
        const totalHeight = pagesContainer.scrollHeight || pagesContainer.offsetHeight;

        if (signatureOverlay) {
            signatureOverlay.style.position = 'absolute';
            signatureOverlay.style.top = '0';
            signatureOverlay.style.left = '0';
            signatureOverlay.style.width = '100%';
            signatureOverlay.style.height = `${totalHeight}px`;
            signatureOverlay.style.pointerEvents = 'none';
        }

        if (parapheOverlay) {
            parapheOverlay.style.position = 'absolute';
            parapheOverlay.style.top = '0';
            parapheOverlay.style.left = '0';
            parapheOverlay.style.width = '100%';
            parapheOverlay.style.height = `${totalHeight}px`;
            parapheOverlay.style.pointerEvents = 'none';
        }

        if (typeof syncEditorOverlayHeight === 'function') syncEditorOverlayHeight();
    });

    state.totalPages = numPages;
    state.currentPage = 1;

    // Mettre a jour l'info des pages
    const pageInfoDisplay = document.getElementById('page-info-display');
    if (pageInfoDisplay) {
        pageInfoDisplay.textContent = `${numPages} page${numPages > 1 ? 's' : ''}`;
    }

    console.log(`PDF charge: ${numPages} page(s)`);
}

// ==============================================
// CHARGEMENT IMAGE
// ==============================================
async function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.maxWidth = '100%';

            documentPreview.insertBefore(img, documentPreview.firstChild);

            const signatureOverlay = document.getElementById('signature-overlay');
            const parapheOverlay = document.getElementById('paraphe-overlay');

            if (signatureOverlay) {
                signatureOverlay.style.position = 'absolute';
                signatureOverlay.style.top = '0';
                signatureOverlay.style.left = '0';
                signatureOverlay.style.width = '100%';
                signatureOverlay.style.pointerEvents = 'none';
            }

            if (parapheOverlay) {
                parapheOverlay.style.position = 'absolute';
                parapheOverlay.style.top = '0';
                parapheOverlay.style.left = '0';
                parapheOverlay.style.width = '100%';
                parapheOverlay.style.pointerEvents = 'none';
            }

            state.totalPages = 1;

            const pageInfoDisplay = document.getElementById('page-info-display');
            if (pageInfoDisplay) pageInfoDisplay.textContent = 'Image';

            resolve();
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==============================================
// DESSIN DE LA SIGNATURE (avec undo)
// ==============================================
let lastX = 0;
let lastY = 0;

signatureCanvas.addEventListener('mousedown', startDrawing);
signatureCanvas.addEventListener('mousemove', draw);
signatureCanvas.addEventListener('mouseup', stopDrawing);
signatureCanvas.addEventListener('mouseout', stopDrawing);

signatureCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    state.signatureHistory.push(signatureCanvas.toDataURL());
    const touch = e.touches[0];
    const rect = signatureCanvas.getBoundingClientRect();
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    lastX = (touch.clientX - rect.left) * scaleX;
    lastY = (touch.clientY - rect.top) * scaleY;
    state.isDrawing = true;
}, { passive: false });

signatureCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!state.isDrawing) return;
    const touch = e.touches[0];
    const rect = signatureCanvas.getBoundingClientRect();
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    const w = isMobile() ? Math.max(parseInt(widthInput.value), 2) : parseInt(widthInput.value);
    applyToolStyle(ctx, state.signatureTool, colorInput.value, w);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    resetToolStyle(ctx);
    lastX = x;
    lastY = y;
}, { passive: false });

signatureCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    state.isDrawing = false;
    state.signatureData = signatureCanvas.toDataURL();
    showSignatureOnDocument();
}, { passive: false });

function startDrawing(e) {
    // Sauvegarder l'etat avant le trait pour undo
    state.signatureHistory.push(signatureCanvas.toDataURL());
    state.isDrawing = true;
    const rect = signatureCanvas.getBoundingClientRect();
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    lastX = (e.clientX - rect.left) * scaleX;
    lastY = (e.clientY - rect.top) * scaleY;
}

function draw(e) {
    if (!state.isDrawing) return;
    const rect = signatureCanvas.getBoundingClientRect();
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    applyToolStyle(ctx, state.signatureTool, colorInput.value, parseInt(widthInput.value));
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    resetToolStyle(ctx);
    lastX = x;
    lastY = y;
}

function stopDrawing() {
    if (state.isDrawing) {
        state.isDrawing = false;
        state.signatureData = signatureCanvas.toDataURL();
        showSignatureOnDocument();
    }
}

// Undo signature
if (undoSignatureBtn) {
    undoSignatureBtn.addEventListener('click', () => {
        if (state.signatureHistory.length > 0) {
            const lastState = state.signatureHistory.pop();
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
                ctx.drawImage(img, 0, 0);
                state.signatureData = signatureCanvas.toDataURL();
                // Verifier si le canvas est vide
                const pixels = ctx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data;
                const hasContent = pixels.some((val, i) => i % 4 === 3 && val > 0);
                if (!hasContent) {
                    state.signatureData = null;
                    const overlay = document.getElementById('signature-overlay');
                    if (overlay) overlay.style.display = 'none';
                } else {
                    showSignatureOnDocument();
                }
            };
            img.src = lastState;
        } else {
            ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
            state.signatureData = null;
            const overlay = document.getElementById('signature-overlay');
            if (overlay) overlay.style.display = 'none';
        }
    });
}

// Effacer la signature
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    state.signatureData = null;
    state.signatureHistory = [];
    const signatureOverlay = document.getElementById('signature-overlay');
    if (signatureOverlay) signatureOverlay.style.display = 'none';
    removeSignatureClones();
});

// ==============================================
// AFFICHER LA SIGNATURE SUR LE DOCUMENT
// ==============================================
function showSignatureOnDocument() {
    const signaturePreview = document.getElementById('signature-preview');
    const signatureOverlay = document.getElementById('signature-overlay');

    if (state.signatureData && signaturePreview && signatureOverlay) {
        signaturePreview.src = state.signatureData;
        signaturePreview.onload = () => {
            const _sy = window.scrollY;
            signatureOverlay.style.display = 'block';
            updateSignaturePreviewPosition();
            extraSignatures.forEach(c => { c.src = state.signatureData; });
            if (window.scrollY !== _sy) document.documentElement.scrollTop = _sy;
        };
        if (signaturePreview.complete) {
            const _sy = window.scrollY;
            signatureOverlay.style.display = 'block';
            updateSignaturePreviewPosition();
            extraSignatures.forEach(c => { c.src = state.signatureData; });
            if (window.scrollY !== _sy) document.documentElement.scrollTop = _sy;
        }
    }
}

// ==============================================
// DESSIN DU PARAPHE (avec undo)
// ==============================================
let lastXParaphe = 0;
let lastYParaphe = 0;

if (parapheCanvas) {
    parapheCanvas.addEventListener('mousedown', startDrawingParaphe);
    parapheCanvas.addEventListener('mousemove', drawParaphe);
    parapheCanvas.addEventListener('mouseup', stopDrawingParaphe);
    parapheCanvas.addEventListener('mouseout', stopDrawingParaphe);

    parapheCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        state.parapheHistory.push(parapheCanvas.toDataURL());
        const touch = e.touches[0];
        const rect = parapheCanvas.getBoundingClientRect();
        const scaleX = parapheCanvas.width / rect.width;
        const scaleY = parapheCanvas.height / rect.height;
        lastXParaphe = (touch.clientX - rect.left) * scaleX;
        lastYParaphe = (touch.clientY - rect.top) * scaleY;
        state.isDrawingParaphe = true;
    }, { passive: false });

    parapheCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!state.isDrawingParaphe) return;
        const touch = e.touches[0];
        const rect = parapheCanvas.getBoundingClientRect();
        const scaleX = parapheCanvas.width / rect.width;
        const scaleY = parapheCanvas.height / rect.height;
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;

        const w = isMobile() ? Math.max(parseInt(parapheWidthInput.value), 2) : parseInt(parapheWidthInput.value);
        applyToolStyle(ctxParaphe, state.parapheTool, parapheColorInput.value, w);
        ctxParaphe.beginPath();
        ctxParaphe.moveTo(lastXParaphe, lastYParaphe);
        ctxParaphe.lineTo(x, y);
        ctxParaphe.stroke();
        resetToolStyle(ctxParaphe);
        lastXParaphe = x;
        lastYParaphe = y;
    }, { passive: false });

    parapheCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        state.isDrawingParaphe = false;
        state.parapheData = parapheCanvas.toDataURL();
        showParapheOnDocument();
    }, { passive: false });
}

function startDrawingParaphe(e) {
    state.parapheHistory.push(parapheCanvas.toDataURL());
    state.isDrawingParaphe = true;
    const rect = parapheCanvas.getBoundingClientRect();
    const scaleX = parapheCanvas.width / rect.width;
    const scaleY = parapheCanvas.height / rect.height;
    lastXParaphe = (e.clientX - rect.left) * scaleX;
    lastYParaphe = (e.clientY - rect.top) * scaleY;
}

function drawParaphe(e) {
    if (!state.isDrawingParaphe) return;
    const rect = parapheCanvas.getBoundingClientRect();
    const scaleX = parapheCanvas.width / rect.width;
    const scaleY = parapheCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    applyToolStyle(ctxParaphe, state.parapheTool, parapheColorInput.value, parseInt(parapheWidthInput.value));
    ctxParaphe.beginPath();
    ctxParaphe.moveTo(lastXParaphe, lastYParaphe);
    ctxParaphe.lineTo(x, y);
    ctxParaphe.stroke();
    resetToolStyle(ctxParaphe);
    lastXParaphe = x;
    lastYParaphe = y;
}

function stopDrawingParaphe() {
    if (state.isDrawingParaphe) {
        state.isDrawingParaphe = false;
        state.parapheData = parapheCanvas.toDataURL();
        showParapheOnDocument();
    }
}

// Undo paraphe
if (undoParapheBtn) {
    undoParapheBtn.addEventListener('click', () => {
        if (state.parapheHistory.length > 0) {
            const lastState = state.parapheHistory.pop();
            const img = new Image();
            img.onload = () => {
                ctxParaphe.clearRect(0, 0, parapheCanvas.width, parapheCanvas.height);
                ctxParaphe.drawImage(img, 0, 0);
                state.parapheData = parapheCanvas.toDataURL();
                const pixels = ctxParaphe.getImageData(0, 0, parapheCanvas.width, parapheCanvas.height).data;
                const hasContent = pixels.some((val, i) => i % 4 === 3 && val > 0);
                if (!hasContent) {
                    state.parapheData = null;
                    const overlay = document.getElementById('paraphe-overlay');
                    if (overlay) overlay.style.display = 'none';
                    removeParapheClones();
                } else {
                    showParapheOnDocument();
                }
            };
            img.src = lastState;
        } else {
            ctxParaphe.clearRect(0, 0, parapheCanvas.width, parapheCanvas.height);
            state.parapheData = null;
            const overlay = document.getElementById('paraphe-overlay');
            if (overlay) overlay.style.display = 'none';
            removeParapheClones();
        }
    });
}

// Effacer le paraphe
if (clearParapheBtn) {
    clearParapheBtn.addEventListener('click', () => {
        ctxParaphe.clearRect(0, 0, parapheCanvas.width, parapheCanvas.height);
        state.parapheData = null;
        state.parapheHistory = [];
        const parapheOverlay = document.getElementById('paraphe-overlay');
        if (parapheOverlay) parapheOverlay.style.display = 'none';
        removeParapheClones();
    });
}

// ==============================================
// TAILLE DU PARAPHE
// ==============================================
const parapheSizeSlider = document.getElementById('paraphe-size');
const parapheSizeValue = document.getElementById('paraphe-size-value');
let currentParapheSize = 80;

if (parapheSizeSlider && parapheSizeValue) {
    parapheSizeSlider.addEventListener('input', (e) => {
        currentParapheSize = parseInt(e.target.value);
        parapheSizeValue.textContent = `${currentParapheSize}px`;
        const paraphePreview = document.getElementById('paraphe-preview');
        const parapheOverlay = document.getElementById('paraphe-overlay');
        if (paraphePreview && parapheOverlay && parapheOverlay.style.display !== 'none') {
            paraphePreview.style.width = `${currentParapheSize}px`;
            constrainParaphePosition();
            createParapheClones();
        }
    });
}

// ==============================================
// AFFICHER LE PARAPHE SUR LE DOCUMENT
// ==============================================
function showParapheOnDocument() {
    const paraphePreview = document.getElementById('paraphe-preview');
    const parapheOverlay = document.getElementById('paraphe-overlay');

    if (state.parapheData && paraphePreview && parapheOverlay) {
        paraphePreview.src = state.parapheData;
        paraphePreview.onload = () => {
            const _sy = window.scrollY;
            parapheOverlay.style.display = 'block';
            updateParaphePreviewPosition();
            createParapheClones();
            if (window.scrollY !== _sy) document.documentElement.scrollTop = _sy;
        };
        if (paraphePreview.complete) {
            const _sy = window.scrollY;
            parapheOverlay.style.display = 'block';
            updateParaphePreviewPosition();
            createParapheClones();
        }
    }
}

// ==============================================
// CLONES DU PARAPHE SUR TOUTES LES PAGES
// ==============================================
function createParapheClones() {
    removeParapheClones();

    const paraphePreview = document.getElementById('paraphe-preview');
    const pagesContainer = document.getElementById('pdf-pages-container');
    if (!paraphePreview || !pagesContainer || !state.parapheData) return;

    const pageContainers = pagesContainer.querySelectorAll('.pdf-page-container');
    const containerRect = documentPreview.getBoundingClientRect();
    const parapheOverlay = document.getElementById('paraphe-overlay');
    const mainLeft = parseFloat(paraphePreview.style.left) || 0;
    const mainTop = parseFloat(paraphePreview.style.top) || 0;
    const mainPageNum = detectParaphePage();

    pageContainers.forEach((pageContainer) => {
        const pageNum = parseInt(pageContainer.dataset.pageNumber);
        if (pageNum === mainPageNum) return;

        const clone = document.createElement('img');
        clone.src = state.parapheData;
        clone.className = 'paraphe-clone';
        clone.style.width = `${currentParapheSize}px`;
        clone.style.height = 'auto';
        clone.style.position = 'absolute';
        clone.style.pointerEvents = 'none';
        clone.style.opacity = '0.85';
        clone.style.border = '2px dashed var(--purple)';
        clone.style.borderRadius = '5px';
        clone.style.padding = '5px';
        clone.style.background = 'transparent';
        clone.style.boxShadow = 'none';

        const pageCanvas = pageContainer.querySelector('.pdf-page-canvas');
        if (pageCanvas) {
            const pageRect = pageCanvas.getBoundingClientRect();
            const mainPageContainer = pagesContainer.querySelector(`.pdf-page-container[data-page-number="${mainPageNum}"]`);
            const mainCanvas = mainPageContainer ? mainPageContainer.querySelector('.pdf-page-canvas') : null;

            if (mainCanvas) {
                const mainCanvasRect = mainCanvas.getBoundingClientRect();
                const relativeLeft = mainLeft - (mainCanvasRect.left - containerRect.left);
                const relativeTop = mainTop - (mainCanvasRect.top - containerRect.top);
                const cloneLeft = (pageRect.left - containerRect.left) + relativeLeft;
                const cloneTop = (pageRect.top - containerRect.top) + relativeTop;

                clone.style.left = `${cloneLeft}px`;
                clone.style.top = `${cloneTop}px`;
                clone.style.zIndex = '8';
            }
        }

        parapheOverlay.appendChild(clone);
    });
}

function removeParapheClones() {
    const parapheOverlay = document.getElementById('paraphe-overlay');
    if (!parapheOverlay) return;
    parapheOverlay.querySelectorAll('.paraphe-clone').forEach(clone => clone.remove());
}

// ==============================================
// POSITION DU PARAPHE
// ==============================================
function updateParaphePreviewPosition() {
    const paraphePreview = document.getElementById('paraphe-preview');
    const parapheOverlay = document.getElementById('paraphe-overlay');
    if (!paraphePreview || !parapheOverlay) return;

    paraphePreview.style.width = `${currentParapheSize}px`;
    paraphePreview.style.height = 'auto';

    // Position initiale: coin bas droit de la premiere page
    if (!paraphePreview.style.left || paraphePreview.style.left === '') {
        const pagesContainer = document.getElementById('pdf-pages-container');
        const firstPageContainer = pagesContainer ? pagesContainer.querySelector('.pdf-page-container') : null;
        const firstCanvas = firstPageContainer ? firstPageContainer.querySelector('.pdf-page-canvas') : documentPreview.querySelector('canvas, img');

        if (firstCanvas) {
            const canvasRect = firstCanvas.getBoundingClientRect();
            const containerRect = documentPreview.getBoundingClientRect();
            const canvasRelativeTop = canvasRect.top - containerRect.top;
            const canvasRelativeLeft = canvasRect.left - containerRect.left;

            const posX = canvasRelativeLeft + canvasRect.width - currentParapheSize - 20;
            const posY = canvasRelativeTop + canvasRect.height - currentParapheSize - 20;

            paraphePreview.style.left = `${Math.max(10, posX)}px`;
            paraphePreview.style.top = `${Math.max(10, posY)}px`;
            state.paraphePosition = { x: posX, y: posY };
            state.paraphePage = 1;
        } else {
            paraphePreview.style.left = '50px';
            paraphePreview.style.top = '50px';
            state.paraphePosition = { x: 50, y: 50 };
        }
    }

    paraphePreview.style.position = 'absolute';
    paraphePreview.style.display = 'block';
    paraphePreview.style.zIndex = '9';
    paraphePreview.style.pointerEvents = 'auto';
}

// ==============================================
// DRAG & DROP - PARAPHE
// ==============================================
const paraphePreview = document.getElementById('paraphe-preview');
let isDraggingParaphe = false;
let dragStartXParaphe = 0;
let dragStartYParaphe = 0;

if (paraphePreview) {
    paraphePreview.addEventListener('mousedown', startDragParaphe);
    paraphePreview.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            startDragParaphe({ clientX: touch.clientX, clientY: touch.clientY });
            document.addEventListener('touchmove', _parTouchMove, { passive: false });
            document.addEventListener('touchend', _parTouchEnd);
        }
    }, { passive: false });
}

document.addEventListener('mousemove', dragParaphe);
document.addEventListener('mouseup', stopDragParaphe);

function _parTouchMove(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        dragParaphe({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
}
function _parTouchEnd() {
    stopDragParaphe();
    document.removeEventListener('touchmove', _parTouchMove);
    document.removeEventListener('touchend', _parTouchEnd);
}

function constrainParaphePosition() {
    const paraphePreview = document.getElementById('paraphe-preview');
    if (!paraphePreview || !documentPreview) return;

    const pagesContainer = document.getElementById('pdf-pages-container');
    if (!pagesContainer) {
        const docEl = documentPreview.querySelector('canvas, img');
        if (!docEl) return;
        const docRect = docEl.getBoundingClientRect();
        const parapheRect = paraphePreview.getBoundingClientRect();
        const containerRect = documentPreview.getBoundingClientRect();
        let currentLeft = parseFloat(paraphePreview.style.left) || 0;
        let currentTop = parseFloat(paraphePreview.style.top) || 0;
        const relativeMaxX = (docRect.left - containerRect.left) + docRect.width - parapheRect.width;
        const relativeMaxY = (docRect.top - containerRect.top) + docRect.height - parapheRect.height;
        paraphePreview.style.left = `${Math.max(0, Math.min(currentLeft, relativeMaxX))}px`;
        paraphePreview.style.top = `${Math.max(0, Math.min(currentTop, relativeMaxY))}px`;
        return;
    }

    const containerRect = documentPreview.getBoundingClientRect();
    const pagesRect = pagesContainer.getBoundingClientRect();
    const parapheRect = paraphePreview.getBoundingClientRect();
    let currentLeft = parseFloat(paraphePreview.style.left) || 0;
    let currentTop = parseFloat(paraphePreview.style.top) || 0;
    const relativeTop = pagesRect.top - containerRect.top;
    const relativeLeft = pagesRect.left - containerRect.left;
    const maxX = relativeLeft + pagesRect.width - parapheRect.width;
    const maxY = relativeTop + pagesRect.height - parapheRect.height;

    paraphePreview.style.left = `${Math.max(relativeLeft, Math.min(currentLeft, maxX))}px`;
    paraphePreview.style.top = `${Math.max(relativeTop, Math.min(currentTop, maxY))}px`;
}

function startDragParaphe(e) {
    const el = document.getElementById('paraphe-preview');
    if (!el) return;
    isDraggingParaphe = true;
    const rect = el.getBoundingClientRect();
    dragStartXParaphe = e.clientX - rect.left;
    dragStartYParaphe = e.clientY - rect.top;
    el.style.cursor = 'grabbing';
}

function dragParaphe(e) {
    if (!isDraggingParaphe) return;
    const el = document.getElementById('paraphe-preview');
    if (!el) return;

    const containerRect = documentPreview.getBoundingClientRect();
    let mouseX = e.clientX - containerRect.left - dragStartXParaphe;
    let mouseY = e.clientY - containerRect.top - dragStartYParaphe;

    const pagesContainer = document.getElementById('pdf-pages-container');
    if (pagesContainer) {
        const pagesRect = pagesContainer.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const relativeTop = pagesRect.top - containerRect.top;
        const relativeLeft = pagesRect.left - containerRect.left;
        const maxX = relativeLeft + pagesRect.width - elRect.width;
        const maxY = relativeTop + pagesRect.height - elRect.height;
        mouseX = Math.max(relativeLeft, Math.min(mouseX, maxX));
        mouseY = Math.max(relativeTop, Math.min(mouseY, maxY));
    }

    el.style.left = `${mouseX}px`;
    el.style.top = `${mouseY}px`;
    state.paraphePosition = { x: mouseX, y: mouseY };
}

function stopDragParaphe() {
    if (isDraggingParaphe) {
        const el = document.getElementById('paraphe-preview');
        if (el) {
            isDraggingParaphe = false;
            el.style.cursor = 'move';
            detectParaphePage();
            createParapheClones();
        }
    }
}

function detectParaphePage() {
    const el = document.getElementById('paraphe-preview');
    if (!el) return 1;
    const elRect = el.getBoundingClientRect();
    const centerY = elRect.top + elRect.height / 2;

    const pagesContainer = document.getElementById('pdf-pages-container');
    if (!pagesContainer) return 1;

    const pages = pagesContainer.querySelectorAll('.pdf-page-container');
    for (const page of pages) {
        const pageRect = page.getBoundingClientRect();
        if (centerY >= pageRect.top && centerY <= pageRect.bottom) {
            state.paraphePage = parseInt(page.dataset.pageNumber);
            return state.paraphePage;
        }
    }
    return 1;
}

// ==============================================
// DRAG & DROP - SIGNATURE
// ==============================================
const signatureOverlay = document.getElementById('signature-overlay');
const signaturePreview = document.getElementById('signature-preview');

const signatureSizeSlider = document.getElementById('signature-size-slider');
const sizeValueDisplay = document.getElementById('size-value-display');

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let currentSignatureWidth = 150;

if (signatureSizeSlider && sizeValueDisplay) {
    signatureSizeSlider.addEventListener('input', (e) => {
        currentSignatureWidth = parseInt(e.target.value);
        sizeValueDisplay.textContent = `${currentSignatureWidth}px`;
        if (signaturePreview && signatureOverlay.style.display !== 'none') {
            signaturePreview.style.width = `${currentSignatureWidth}px`;
            constrainSignaturePosition();
        }
        extraSignatures.forEach(c => { c.style.width = `${currentSignatureWidth}px`; });
    });
}

// Extra instances placed via multi-mode
let extraSignatures = [];

function removeSignatureClones() {
    if (signatureOverlay) signatureOverlay.querySelectorAll('.signature-clone').forEach(c => c.remove());
    extraSignatures = [];
}

function addSignatureClone(x, y) {
    if (!state.signatureData || !signatureOverlay) return;
    const clone = document.createElement('img');
    clone.src = state.signatureData;
    clone.className = 'signature-draggable signature-clone';
    clone.style.cssText = `width:${currentSignatureWidth}px;height:auto;position:absolute;left:${x}px;top:${y}px;z-index:10;pointer-events:auto;cursor:move;`;
    signatureOverlay.appendChild(clone);
    extraSignatures.push(clone);

    let _cdragging = false, _cdx = 0, _cdy = 0;
    function _cStart(e) {
        _cdragging = true;
        const r = clone.getBoundingClientRect();
        _cdx = e.clientX - r.left; _cdy = e.clientY - r.top;
        clone.style.cursor = 'grabbing';
    }
    function _cDrag(e) {
        if (!_cdragging) return;
        const cr = documentPreview.getBoundingClientRect();
        clone.style.left = `${e.clientX - cr.left - _cdx}px`;
        clone.style.top  = `${e.clientY - cr.top  - _cdy}px`;
    }
    function _cStop() { if (_cdragging) { _cdragging = false; clone.style.cursor = 'move'; } }
    clone.addEventListener('mousedown', _cStart);
    document.addEventListener('mousemove', _cDrag);
    document.addEventListener('mouseup', _cStop);

    function _cTouchMove(e) {
        if (e.touches.length === 1) { e.preventDefault(); _cDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
    }
    function _cTouchEnd() {
        _cStop();
        document.removeEventListener('touchmove', _cTouchMove);
        document.removeEventListener('touchend', _cTouchEnd);
    }
    clone.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            _cStart({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
            document.addEventListener('touchmove', _cTouchMove, { passive: false });
            document.addEventListener('touchend', _cTouchEnd);
        }
    }, { passive: false });
}

// Place la signature centrée sur un point (coordonnées clientX/Y)
function placeSignatureAt(clientX, clientY) {
    if (!signaturePreview || !signatureOverlay || !state.signatureData) return;
    const containerRect = documentPreview.getBoundingClientRect();
    const x = clientX - containerRect.left - signaturePreview.offsetWidth / 2;
    const y = clientY - containerRect.top  - signaturePreview.offsetHeight / 2;
    const sigMultiChk = document.getElementById('sig-multi-place');
    if (sigMultiChk && sigMultiChk.checked) {
        addSignatureClone(Math.max(0, x), Math.max(0, y));
    } else {
        signaturePreview.style.left = `${Math.max(0, x)}px`;
        signaturePreview.style.top  = `${Math.max(0, y)}px`;
        constrainSignaturePosition();
        detectSignaturePage();
    }
}

signaturePreview.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', stopDrag);

// Drag touch — listeners ajoutés/retirés dynamiquement pour ne pas
// bloquer le scroll natif quand on ne fait que scroller
function _sigTouchMove(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        drag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
}
function _sigTouchEnd() {
    stopDrag();
    document.removeEventListener('touchmove', _sigTouchMove);
    document.removeEventListener('touchend', _sigTouchEnd);
}

signaturePreview.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        e.preventDefault();
        startDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
        document.addEventListener('touchmove', _sigTouchMove, { passive: false });
        document.addEventListener('touchend', _sigTouchEnd);
    }
}, { passive: false });

// Retire une instance de signature du document (sans effacer le dessin)
function removePlacedSignature(sigEl) {
    if (sigEl === signaturePreview) {
        signatureOverlay.style.display = 'none';
    } else if (sigEl.classList.contains('signature-clone')) {
        const idx = extraSignatures.indexOf(sigEl);
        if (idx !== -1) extraSignatures.splice(idx, 1);
        sigEl.remove();
    }
}

// Double-clic (bureau) → place ou retire la signature
documentPreview.addEventListener('dblclick', (e) => {
    const sigEl = e.target.closest('.signature-draggable');
    if (sigEl) { removePlacedSignature(sigEl); return; }
    if (!state.signatureData) return;
    if (e.target.closest('.paraphe-draggable, .annotation-canvas')) return;
    placeSignatureAt(e.clientX, e.clientY);
});

// Appui long (mobile) → place ou retire la signature
let _lpTimer = null;
let _lpStartX = 0, _lpStartY = 0;
documentPreview.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    _lpStartX = t.clientX; _lpStartY = t.clientY;

    const el = document.elementFromPoint(t.clientX, t.clientY);
    const sigEl = el?.closest?.('.signature-draggable');
    if (sigEl) {
        _lpTimer = setTimeout(() => { _lpTimer = null; removePlacedSignature(sigEl); }, 600);
        return;
    }

    if (e.target.closest('.paraphe-draggable')) return;
    if (!state.signatureData) return;
    _lpTimer = setTimeout(() => { _lpTimer = null; placeSignatureAt(t.clientX, t.clientY); }, 500);
}, { passive: true });
documentPreview.addEventListener('touchmove', (e) => {
    if (_lpTimer === null) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - _lpStartX) > 8 || Math.abs(t.clientY - _lpStartY) > 8) {
        clearTimeout(_lpTimer); _lpTimer = null;
    }
}, { passive: true });
let _lastTapSigEl = null;
let _lastTapTime = 0;
documentPreview.addEventListener('touchend', (e) => {
    if (_lpTimer !== null) { clearTimeout(_lpTimer); _lpTimer = null; }
    if (!e.changedTouches.length) return;
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const sigEl = el?.closest?.('.signature-draggable');
    const now = Date.now();
    if (sigEl && sigEl === _lastTapSigEl && now - _lastTapTime < 350) {
        removePlacedSignature(sigEl);
        _lastTapSigEl = null; _lastTapTime = 0;
    } else {
        _lastTapSigEl = sigEl || null;
        _lastTapTime = now;
    }
}, { passive: true });

function constrainSignaturePosition() {
    if (!signaturePreview || !documentPreview) return;

    const pagesContainer = document.getElementById('pdf-pages-container');
    if (!pagesContainer) {
        const docEl = documentPreview.querySelector('canvas, img');
        if (!docEl) return;
        const docRect = docEl.getBoundingClientRect();
        const sigRect = signaturePreview.getBoundingClientRect();
        const containerRect = documentPreview.getBoundingClientRect();
        let currentLeft = parseFloat(signaturePreview.style.left) || 0;
        let currentTop = parseFloat(signaturePreview.style.top) || 0;
        const relativeMaxX = (docRect.left - containerRect.left) + docRect.width - sigRect.width;
        const relativeMaxY = (docRect.top - containerRect.top) + docRect.height - sigRect.height;
        signaturePreview.style.left = `${Math.max(0, Math.min(currentLeft, relativeMaxX))}px`;
        signaturePreview.style.top = `${Math.max(0, Math.min(currentTop, relativeMaxY))}px`;
        return;
    }

    const containerRect = documentPreview.getBoundingClientRect();
    const pagesRect = pagesContainer.getBoundingClientRect();
    const sigRect = signaturePreview.getBoundingClientRect();
    let currentLeft = parseFloat(signaturePreview.style.left) || 0;
    let currentTop = parseFloat(signaturePreview.style.top) || 0;
    const relativeTop = pagesRect.top - containerRect.top;
    const relativeLeft = pagesRect.left - containerRect.left;
    const maxX = relativeLeft + pagesRect.width - sigRect.width;
    const maxY = relativeTop + pagesRect.height - sigRect.height;

    signaturePreview.style.left = `${Math.max(relativeLeft, Math.min(currentLeft, maxX))}px`;
    signaturePreview.style.top = `${Math.max(relativeTop, Math.min(currentTop, maxY))}px`;
}

function startDrag(e) {
    isDragging = true;
    const rect = signaturePreview.getBoundingClientRect();
    dragStartX = e.clientX - rect.left;
    dragStartY = e.clientY - rect.top;
    signaturePreview.style.cursor = 'grabbing';
}

function drag(e) {
    if (!isDragging) return;

    const containerRect = documentPreview.getBoundingClientRect();
    let mouseX = e.clientX - containerRect.left - dragStartX;
    let mouseY = e.clientY - containerRect.top - dragStartY;

    const pagesContainer = document.getElementById('pdf-pages-container');
    if (pagesContainer) {
        const pagesRect = pagesContainer.getBoundingClientRect();
        const sigRect = signaturePreview.getBoundingClientRect();
        const relativeTop = pagesRect.top - containerRect.top;
        const relativeLeft = pagesRect.left - containerRect.left;
        const maxX = relativeLeft + pagesRect.width - sigRect.width;
        const maxY = relativeTop + pagesRect.height - sigRect.height;
        mouseX = Math.max(relativeLeft, Math.min(mouseX, maxX));
        mouseY = Math.max(relativeTop, Math.min(mouseY, maxY));
    }

    signaturePreview.style.left = `${mouseX}px`;
    signaturePreview.style.top = `${mouseY}px`;
}

function stopDrag() {
    if (isDragging) {
        isDragging = false;
        signaturePreview.style.cursor = 'move';
        detectSignaturePage();
    }
}

function updateSignaturePreviewPosition() {
    if (!signaturePreview || !signatureOverlay) return;

    signaturePreview.style.width = `${currentSignatureWidth}px`;
    signaturePreview.style.height = 'auto';

    // Position initiale au centre de la premiere page
    if (!signaturePreview.style.left || signaturePreview.style.left === '') {
        const pagesContainer = document.getElementById('pdf-pages-container');
        const firstPageContainer = pagesContainer ? pagesContainer.querySelector('.pdf-page-container') : null;
        const firstCanvas = firstPageContainer ? firstPageContainer.querySelector('.pdf-page-canvas') : documentPreview.querySelector('canvas, img');

        if (firstCanvas) {
            const canvasRect = firstCanvas.getBoundingClientRect();
            const containerRect = documentPreview.getBoundingClientRect();
            const canvasRelativeTop = canvasRect.top - containerRect.top;
            const canvasRelativeLeft = canvasRect.left - containerRect.left;

            const centerX = canvasRelativeLeft + (canvasRect.width - currentSignatureWidth) / 2;
            const centerY = canvasRelativeTop + canvasRect.height / 2;

            signaturePreview.style.left = `${Math.max(10, centerX)}px`;
            signaturePreview.style.top = `${Math.max(10, centerY)}px`;
            state.signaturePage = 1;
        } else {
            signaturePreview.style.left = '50px';
            signaturePreview.style.top = '50px';
        }
    }

    signaturePreview.style.position = 'absolute';
    signaturePreview.style.display = 'block';
    signaturePreview.style.zIndex = '10';
    signaturePreview.style.pointerEvents = 'auto';
}

function detectSignaturePage() {
    if (!signaturePreview || !signatureOverlay) return 1;
    const sigRect = signaturePreview.getBoundingClientRect();
    const sigCenterY = sigRect.top + sigRect.height / 2;

    const pagesContainer = document.getElementById('pdf-pages-container');
    if (!pagesContainer) return 1;

    const pages = pagesContainer.querySelectorAll('.pdf-page-container');
    for (const page of pages) {
        const pageRect = page.getBoundingClientRect();
        if (sigCenterY >= pageRect.top && sigCenterY <= pageRect.bottom) {
            state.signaturePage = parseInt(page.dataset.pageNumber);
            return state.signaturePage;
        }
    }
    return 1;
}

function getSignatureTargetPages() {
    return [state.signaturePage];
}


// ==============================================
// GENERATION DU PDF SIGNE
// ==============================================
downloadBtn.addEventListener('click', generateAndDownloadPDF);

async function generateAndDownloadPDF() {
    const hasEditorContent = document.querySelectorAll('#editor-overlay .editor-el').length > 0;
    if (!state.signatureData && !state.parapheData && !hasEditorContent) {
        alert(currentView === 'editor'
            ? 'Ajoutez au moins un élément (texte, image, forme…) avant de télécharger.'
            : 'Veuillez creer une signature d\'abord!');
        return;
    }

    const defaultName = currentView === 'editor' ? 'document_edite' : 'document_signe';
    const fileName = prompt('Nom du fichier PDF:', defaultName);
    if (fileName === null) return;

    const cleanFileName = fileName.trim() || defaultName;
    const finalFileName = cleanFileName.endsWith('.pdf') ? cleanFileName : `${cleanFileName}.pdf`;

    try {
        showLoader();
        const pdfBytes = await createSignedPDF();

        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFileName;
        a.click();
        URL.revokeObjectURL(url);

        alert('PDF telecharge avec succes!');
    } catch (error) {
        console.error('Erreur generation PDF:', error);
        alert('Erreur lors de la generation du PDF: ' + error.message);
    } finally {
        hideLoader();
    }
}

async function createSignedPDF() {
    const { PDFDocument } = PDFLib;
    let pdfDoc;

    if (state.uploadedFileType === 'pdf') {
        pdfDoc = await PDFDocument.load(state.originalPdfBytes);
    } else {
        pdfDoc = await PDFDocument.create();

        if (state.uploadedFileType === 'image') {
            const imgData = await state.uploadedFile.arrayBuffer();
            let image;
            if (state.uploadedFile.type === 'image/png') {
                image = await pdfDoc.embedPng(imgData);
            } else {
                image = await pdfDoc.embedJpg(imgData);
            }
            // Conserver les proportions et dimensions d'origine de l'image
            const { width: iw, height: ih } = image;
            // Limiter à 1200 pts max (raisonnable pour PDF) tout en gardant le ratio
            const maxPts = 1200;
            const s = (iw > maxPts || ih > maxPts) ? Math.min(maxPts / iw, maxPts / ih) : 1;
            const pw = Math.round(iw * s);
            const ph = Math.round(ih * s);
            const page = pdfDoc.addPage([pw, ph]);
            page.drawImage(image, { x: 0, y: 0, width: pw, height: ph });
        }
    }

    const pages = pdfDoc.getPages();

    // Embed signature (optionnelle : le document peut être seulement édité)
    if (state.signatureData) {
    const signatureImageBytes = await fetch(state.signatureData).then(res => res.arrayBuffer());
    const signatureImage = await pdfDoc.embedPng(signatureImageBytes);

    // Calculer la position relative de la signature sur sa page de reference
    const refPageNum = detectSignaturePage();
    const pagesContainer = document.getElementById('pdf-pages-container');
    const refPageContainer = pagesContainer ? pagesContainer.querySelector(`.pdf-page-container[data-page-number="${refPageNum}"]`) : null;
    const refCanvas = refPageContainer ? refPageContainer.querySelector('.pdf-page-canvas') : documentPreview.querySelector('canvas, img');

    const sigLeft = parseFloat(signaturePreview.style.left) || 50;
    const sigTop = parseFloat(signaturePreview.style.top) || 50;

    // Calculer les fractions relatives a la page de reference
    let fracX = 0.1, fracY = 0.5, fracW = 0.25;

    if (refCanvas) {
        const canvasRect = refCanvas.getBoundingClientRect();
        const containerRect = documentPreview.getBoundingClientRect();
        const sigRect = signaturePreview.getBoundingClientRect();

        const canvasRelLeft = canvasRect.left - containerRect.left;
        const canvasRelTop = canvasRect.top - containerRect.top;

        fracX = (sigLeft - canvasRelLeft) / canvasRect.width;
        fracY = (sigTop - canvasRelTop) / canvasRect.height;
        fracW = sigRect.width / canvasRect.width;
    }

    // Obtenir les pages cibles
    const targetPages = getSignatureTargetPages();

    // Appliquer la signature sur chaque page cible
    targetPages.forEach(pageNum => {
        if (pageNum < 1 || pageNum > pages.length) return;
        const page = pages[pageNum - 1];
        const { width: pw, height: ph } = page.getSize();

        const sigW = fracW * pw;
        const sigH = sigW * (signatureImage.height / signatureImage.width);
        const sigX = fracX * pw;
        // Convertir Y du repere top-left (HTML) vers bottom-left (PDF)
        const sigY = ph - (fracY * ph) - sigH;

        page.drawImage(signatureImage, {
            x: sigX,
            y: sigY,
            width: sigW,
            height: sigH
        });
    });

    // Signature clones (multi-placement)
    for (const clone of extraSignatures) {
        const cloneLeft = parseFloat(clone.style.left) || 50;
        const cloneTop  = parseFloat(clone.style.top)  || 50;
        const cloneRect = clone.getBoundingClientRect();
        const cloneCenterY = cloneRect.top + cloneRect.height / 2;

        let clonePageNum = state.signaturePage;
        if (pagesContainer) {
            for (const pageEl of pagesContainer.querySelectorAll('.pdf-page-container')) {
                const pr = pageEl.getBoundingClientRect();
                if (cloneCenterY >= pr.top && cloneCenterY <= pr.bottom) {
                    clonePageNum = parseInt(pageEl.dataset.pageNumber); break;
                }
            }
        }
        const clonePageCont = pagesContainer ? pagesContainer.querySelector(`.pdf-page-container[data-page-number="${clonePageNum}"]`) : null;
        const cloneRefCanvas = clonePageCont ? clonePageCont.querySelector('.pdf-page-canvas') : documentPreview.querySelector('canvas, img');

        let cFracX = fracX, cFracY = fracY, cFracW = fracW;
        if (cloneRefCanvas) {
            const cr = cloneRefCanvas.getBoundingClientRect();
            const ctr = documentPreview.getBoundingClientRect();
            cFracX = (cloneLeft - (cr.left - ctr.left)) / cr.width;
            cFracY = (cloneTop  - (cr.top  - ctr.top )) / cr.height;
            cFracW = cloneRect.width / cr.width;
        }

        if (clonePageNum >= 1 && clonePageNum <= pages.length) {
            const page = pages[clonePageNum - 1];
            const { width: pw, height: ph } = page.getSize();
            const cW = cFracW * pw;
            const cH = cW * (signatureImage.height / signatureImage.width);
            page.drawImage(signatureImage, {
                x: cFracX * pw,
                y: ph - (cFracY * ph) - cH,
                width: cW, height: cH
            });
        }
    }
    } // fin if (state.signatureData)

    // Ajouter le paraphe sur toutes les pages
    if (state.parapheData) {
        const parapheImageBytes = await fetch(state.parapheData).then(res => res.arrayBuffer());
        const parapheImage = await pdfDoc.embedPng(parapheImageBytes);

        const parapheEl = document.getElementById('paraphe-preview');
        const parapheLeft = parseFloat(parapheEl?.style.left || '50');
        const parapheTop = parseFloat(parapheEl?.style.top || '50');

        const paraphePageNum = detectParaphePage();
        const paraphePageContainer = pagesContainer ? pagesContainer.querySelector(`.pdf-page-container[data-page-number="${paraphePageNum}"]`) : null;
        const parapheCanvas = paraphePageContainer ? paraphePageContainer.querySelector('.pdf-page-canvas') : documentPreview.querySelector('canvas, img');

        let pFracX = 0.7, pFracY = 0.9, pFracW = 0.15;

        if (parapheCanvas) {
            const canvasRect = parapheCanvas.getBoundingClientRect();
            const containerRect = documentPreview.getBoundingClientRect();
            const parapheRect = parapheEl.getBoundingClientRect();

            const canvasRelLeft = canvasRect.left - containerRect.left;
            const canvasRelTop = canvasRect.top - containerRect.top;

            pFracX = (parapheLeft - canvasRelLeft) / canvasRect.width;
            pFracY = (parapheTop - canvasRelTop) / canvasRect.height;
            pFracW = parapheRect.width / canvasRect.width;
        }

        // Appliquer le paraphe sur toutes les pages
        pages.forEach((page) => {
            const { width: pw, height: ph } = page.getSize();
            const parW = pFracW * pw;
            const parH = parW * (parapheImage.height / parapheImage.width);
            const parX = pFracX * pw;
            const parY = ph - (pFracY * ph) - parH;

            page.drawImage(parapheImage, {
                x: parX,
                y: parY,
                width: parW,
                height: parH
            });
        });
    }

    // Integrer les annotations (surligneur) sur chaque page
    const annotCanvases = document.querySelectorAll('.annotation-canvas');
    for (const annotCanvas of annotCanvases) {
        const pageNum = parseInt(annotCanvas.dataset.page);
        if (!pageNum || pageNum < 1 || pageNum > pages.length) continue;

        // Verifier si le canvas a des pixels non transparents
        const actx = annotCanvas.getContext('2d');
        const imgData = actx.getImageData(0, 0, annotCanvas.width, annotCanvas.height);
        const hasContent = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
        if (!hasContent) continue;

        const annotPng = annotCanvas.toDataURL('image/png');
        const annotBytes = await fetch(annotPng).then(r => r.arrayBuffer());
        const annotImage = await pdfDoc.embedPng(annotBytes);

        const page = pages[pageNum - 1];
        const { width: pw, height: ph } = page.getSize();
        page.drawImage(annotImage, { x: 0, y: 0, width: pw, height: ph });
    }

    // Aplatir les éléments de l'éditeur (texte, images, formes, caches)
    await embedEditorElements(pdfDoc, pages);

    return await pdfDoc.save();
}

// ==============================================
// ANNOTATION SUR LE DOCUMENT (surligneur de pages)
// ==============================================
let annotationMode = false;
let annotationEraseMode = false;
let annotColor = '#FFD60A';
let annotSize = 22;
let annotOpacity = 0.42;
let isAnnotating = false;
let annotLastX = 0, annotLastY = 0;
let twoFingerLastY = null;

const annotToolbar = document.getElementById('annotation-toolbar');
const toggleAnnotBtn = document.getElementById('toggle-annotation-btn');
const annotHighlightBtn = document.getElementById('annot-highlight-btn');
const annotEraseBtn = document.getElementById('annot-erase-btn');
const annotSizeInput = document.getElementById('annot-size');
const annotClearBtn = document.getElementById('annot-clear-btn');

function setAnnotationMode(active) {
    annotationMode = active;
    if (active) {
        documentPreview.classList.add('annotation-mode');
        documentPreview.addEventListener('touchstart', _annotTouchStart, { passive: false });
        documentPreview.addEventListener('touchmove',  _annotTouchMove,  { passive: false });
        documentPreview.addEventListener('touchend',   _annotTouchEnd);
        if (annotToolbar) annotToolbar.style.display = 'flex';
        if (toggleAnnotBtn) {
            toggleAnnotBtn.style.background = 'rgba(255,214,10,.35)';
            toggleAnnotBtn.style.borderColor = '#FFD60A';
            toggleAnnotBtn.style.color = '#7a5f00';
        }
    } else {
        documentPreview.classList.remove('annotation-mode');
        documentPreview.classList.remove('erase-mode');
        documentPreview.removeEventListener('touchstart', _annotTouchStart);
        documentPreview.removeEventListener('touchmove',  _annotTouchMove);
        documentPreview.removeEventListener('touchend',   _annotTouchEnd);
        isAnnotating = false;
        currentAnnotCanvas = null;
        twoFingerLastY = null;
        if (annotToolbar) annotToolbar.style.display = 'none';
        if (toggleAnnotBtn) {
            toggleAnnotBtn.style.background = '';
            toggleAnnotBtn.style.borderColor = '';
            toggleAnnotBtn.style.color = '';
        }
    }
}

if (toggleAnnotBtn) {
    toggleAnnotBtn.addEventListener('click', () => setAnnotationMode(!annotationMode));
}

if (annotHighlightBtn) {
    annotHighlightBtn.addEventListener('click', () => {
        annotationEraseMode = false;
        documentPreview.classList.remove('erase-mode');
        annotHighlightBtn.classList.add('active');
        annotHighlightBtn.classList.remove('active-erase');
        if (annotEraseBtn) {
            annotEraseBtn.classList.remove('active');
            annotEraseBtn.classList.remove('active-erase');
        }
    });
}

if (annotEraseBtn) {
    annotEraseBtn.addEventListener('click', () => {
        annotationEraseMode = true;
        documentPreview.classList.add('erase-mode');
        annotEraseBtn.classList.add('active', 'active-erase');
        if (annotHighlightBtn) {
            annotHighlightBtn.classList.remove('active');
        }
    });
}

document.querySelectorAll('.annot-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        document.querySelectorAll('.annot-color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        annotColor = swatch.dataset.annotColor;
    });
});

if (annotSizeInput) {
    annotSizeInput.addEventListener('input', () => { annotSize = parseInt(annotSizeInput.value); });
}

const annotOpacityInput = document.getElementById('annot-opacity');
const annotOpacityVal = document.getElementById('annot-opacity-val');
if (annotOpacityInput) {
    annotOpacityInput.addEventListener('input', () => {
        annotOpacity = parseInt(annotOpacityInput.value) / 100;
        if (annotOpacityVal) annotOpacityVal.textContent = annotOpacityInput.value + '%';
        document.querySelectorAll('.annotation-canvas').forEach(c => _recomposeAnnot(c));
    });
}

if (annotClearBtn) {
    annotClearBtn.addEventListener('click', () => {
        document.querySelectorAll('.annotation-canvas').forEach(c => {
            c.getContext('2d').clearRect(0, 0, c.width, c.height);
            const raw = _annotRawMap.get(c);
            if (raw) raw.getContext('2d').clearRect(0, 0, raw.width, raw.height);
        });
    });
}

// ==============================================
// SURLIGNEUR — opacité uniforme via canvas brut
// ==============================================
// Chaque canvas d'annotation possède un canvas "brut" (full-alpha).
// Le canvas visible = canvas brut composité à l'opacité choisie.
// Re-passer au même endroit ne change donc jamais l'opacité finale.
const _annotRawMap = new WeakMap();
let _annotRawBackup = null;   // sauvegarde du canvas brut en début de trait
let _annotStrokePts = [];     // points du trait en cours (coordonnées canvas)

function _getRawCanvas(annotCanvas) {
    if (!_annotRawMap.has(annotCanvas)) {
        const raw = document.createElement('canvas');
        raw.width  = annotCanvas.width;
        raw.height = annotCanvas.height;
        _annotRawMap.set(annotCanvas, raw);
    }
    return _annotRawMap.get(annotCanvas);
}

function _recomposeAnnot(annotCanvas) {
    const raw = _annotRawMap.get(annotCanvas);
    if (!raw) return;
    const actx = annotCanvas.getContext('2d');
    actx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
    actx.save();
    actx.globalAlpha = annotOpacity;
    actx.drawImage(raw, 0, 0);
    actx.restore();
}

function _annotStrokeStart(annotCanvas, x, y) {
    if (annotationEraseMode) {
        _annotStrokePts = [];
        return;
    }
    const raw = _getRawCanvas(annotCanvas);
    // Backup du raw en début de trait pour pouvoir redessiner proprement
    _annotRawBackup = document.createElement('canvas');
    _annotRawBackup.width  = raw.width;
    _annotRawBackup.height = raw.height;
    _annotRawBackup.getContext('2d').drawImage(raw, 0, 0);
    _annotStrokePts = [{ x, y }];
}

function _annotStrokeContinue(annotCanvas, x, y) {
    if (annotationEraseMode) {
        // Gomme: effacer du raw directement puis recomposer
        const raw = _getRawCanvas(annotCanvas);
        const rctx = raw.getContext('2d');
        rctx.save();
        rctx.globalCompositeOperation = 'destination-out';
        rctx.lineWidth = annotSize * 2;
        rctx.lineCap = 'round'; rctx.lineJoin = 'round';
        rctx.globalAlpha = 1;
        rctx.beginPath();
        rctx.moveTo(annotLastX, annotLastY);
        rctx.lineTo(x, y);
        rctx.stroke();
        rctx.restore();
        _recomposeAnnot(annotCanvas);
        return;
    }
    _annotStrokePts.push({ x, y });
    if (_annotStrokePts.length < 2) return;

    const raw = _getRawCanvas(annotCanvas);
    const rctx = raw.getContext('2d');
    // Restaurer le raw à son état pré-trait
    rctx.clearRect(0, 0, raw.width, raw.height);
    if (_annotRawBackup) rctx.drawImage(_annotRawBackup, 0, 0);
    // Redessiner tout le trait courant d'un seul trait (pas de jointures visibles)
    rctx.save();
    rctx.strokeStyle = annotColor;
    rctx.lineWidth = annotSize;
    rctx.lineCap = 'round';
    rctx.lineJoin = 'round';
    rctx.globalCompositeOperation = 'source-over';
    rctx.globalAlpha = 1;
    rctx.beginPath();
    rctx.moveTo(_annotStrokePts[0].x, _annotStrokePts[0].y);
    for (let i = 1; i < _annotStrokePts.length; i++) rctx.lineTo(_annotStrokePts[i].x, _annotStrokePts[i].y);
    rctx.stroke();
    rctx.restore();
    _recomposeAnnot(annotCanvas);
}

function _annotStrokeEnd() {
    _annotRawBackup = null;
    _annotStrokePts = [];
}

let currentAnnotCanvas = null;

documentPreview.addEventListener('mousedown', (e) => {
    if (!annotationMode) return;
    currentAnnotCanvas = e.target.closest('.pdf-page-container')?.querySelector('.annotation-canvas')
        || documentPreview.querySelector('.annotation-canvas');
    if (!currentAnnotCanvas) return;
    isAnnotating = true;
    const rect = currentAnnotCanvas.getBoundingClientRect();
    annotLastX = (e.clientX - rect.left) * (currentAnnotCanvas.width / rect.width);
    annotLastY = (e.clientY - rect.top)  * (currentAnnotCanvas.height / rect.height);
    _annotStrokeStart(currentAnnotCanvas, annotLastX, annotLastY);
    e.preventDefault();
});

documentPreview.addEventListener('mousemove', (e) => {
    if (!annotationMode || !isAnnotating || !currentAnnotCanvas) return;
    const rect = currentAnnotCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (currentAnnotCanvas.width / rect.width);
    const y = (e.clientY - rect.top)  * (currentAnnotCanvas.height / rect.height);
    _annotStrokeContinue(currentAnnotCanvas, x, y);
    annotLastX = x; annotLastY = y;
    e.preventDefault();
});

document.addEventListener('mouseup', () => {
    if (isAnnotating) _annotStrokeEnd();
    isAnnotating = false;
    currentAnnotCanvas = null;
});

// Touch handlers for annotation — added/removed dynamically so they NEVER
// block native scroll when annotation mode is off (passive listeners allow scroll).
function _annotTouchStart(e) {
    if (e.touches.length === 2) {
        if (isAnnotating) _annotStrokeEnd();
        isAnnotating = false;
        currentAnnotCanvas = null;
        twoFingerLastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        e.preventDefault();
        return;
    }
    if (e.touches.length !== 1) return;
    twoFingerLastY = null;
    const touch = e.touches[0];
    const pageContainer = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.pdf-page-container');
    currentAnnotCanvas = pageContainer?.querySelector('.annotation-canvas')
        || documentPreview.querySelector('.annotation-canvas');
    if (!currentAnnotCanvas) return;
    isAnnotating = true;
    const rect = currentAnnotCanvas.getBoundingClientRect();
    annotLastX = (touch.clientX - rect.left) * (currentAnnotCanvas.width / rect.width);
    annotLastY = (touch.clientY - rect.top)  * (currentAnnotCanvas.height / rect.height);
    _annotStrokeStart(currentAnnotCanvas, annotLastX, annotLastY);
    e.preventDefault();
}

function _annotTouchMove(e) {
    if (e.touches.length === 2) {
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        if (twoFingerLastY !== null) {
            const delta = twoFingerLastY - centerY;
            document.documentElement.scrollTop += delta;
            document.body.scrollTop += delta;
        }
        twoFingerLastY = centerY;
        e.preventDefault();
        return;
    }
    if (!isAnnotating || !currentAnnotCanvas || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = currentAnnotCanvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (currentAnnotCanvas.width / rect.width);
    const y = (touch.clientY - rect.top)  * (currentAnnotCanvas.height / rect.height);
    _annotStrokeContinue(currentAnnotCanvas, x, y);
    annotLastX = x; annotLastY = y;
    e.preventDefault();
}

function _annotTouchEnd() {
    if (isAnnotating) _annotStrokeEnd();
    isAnnotating = false;
    currentAnnotCanvas = null;
    twoFingerLastY = null;
}

// ==============================================
// BARRE D'OUTILS (stylo / surligneur / gomme)
// ==============================================
document.querySelectorAll('.tools-bar').forEach(bar => {
    const target = bar.dataset.tools; // 'signature' | 'paraphe'
    bar.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            bar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tool = btn.dataset.tool;
            if (target === 'signature') {
                state.signatureTool = tool;
                updateCanvasCursor(signatureCanvas, tool);
            } else if (target === 'paraphe') {
                state.parapheTool = tool;
                updateCanvasCursor(parapheCanvas, tool);
            }
        });
    });
});

// ==============================================
// COLOR PRESETS (palettes rapides)
// ==============================================
document.querySelectorAll('.control-color').forEach(group => {
    const target = group.dataset.target;
    const picker = group.querySelector('.color-picker-custom');
    const swatches = group.querySelectorAll('.color-swatch');

    swatches.forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            e.preventDefault();
            const color = swatch.dataset.color;
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            if (picker) picker.value = color;
            // Trigger change
            if (target === 'signature' && colorInput) {
                colorInput.value = color;
                colorInput.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (target === 'paraphe' && parapheColorInput) {
                parapheColorInput.value = color;
                parapheColorInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });

    if (picker) {
        picker.addEventListener('input', () => {
            swatches.forEach(s => s.classList.remove('active'));
        });
    }
});

// ==============================================
// AFFICHAGE DE LA VALEUR D'EPAISSEUR
// ==============================================
const widthValueDisplay = document.getElementById('signature-width-value');
const parapheWidthValueDisplay = document.getElementById('paraphe-width-value');

if (widthInput && widthValueDisplay) {
    widthInput.addEventListener('input', () => {
        widthValueDisplay.textContent = widthInput.value;
    });
}
if (parapheWidthInput && parapheWidthValueDisplay) {
    parapheWidthInput.addEventListener('input', () => {
        parapheWidthValueDisplay.textContent = parapheWidthInput.value;
    });
}

// ==============================================
// THEME TOGGLE (clair / sombre)
// ==============================================
const themeToggle = document.getElementById('theme-toggle');
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem('theme', theme); } catch (e) {}
}
function loadTheme() {
    let saved;
    try { saved = localStorage.getItem('theme'); } catch (e) {}
    if (saved) {
        applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        applyTheme('dark');
    }
}
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });
}

// ==============================================
// INITIALISATION
// ==============================================
window.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    updateCanvasCursor(signatureCanvas, state.signatureTool);
    if (parapheCanvas) updateCanvasCursor(parapheCanvas, state.parapheTool);
});

// ==============================================
// SERVICES : NAVBAR (Signature / Éditeur PDF)
// ==============================================
let currentView = 'signature';
let documentLoaded = false;

const navEl = document.querySelector('.app-nav');
const navTabs = document.querySelectorAll('.nav-tab');
const editorToolbar = document.getElementById('editor-toolbar');
const editorOverlay = document.getElementById('editor-overlay');
const downloadBtnLabel = document.getElementById('download-btn-label');

function applyView() {
    if (navEl) navEl.dataset.view = currentView;
    navTabs.forEach(t => {
        const on = t.dataset.view === currentView;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const container = document.querySelector('.container');
    if (container) {
        container.classList.toggle('view-editor', currentView === 'editor');
        container.classList.toggle('view-signature', currentView === 'signature');
    }

    const isEditor = currentView === 'editor';

    // Sections propres au service Signature
    if (signatureSection) signatureSection.style.display = (!isEditor && documentLoaded) ? 'block' : 'none';
    if (parapheSection)   parapheSection.style.display   = (!isEditor && documentLoaded) ? 'block' : 'none';
    if (actionsSection)   actionsSection.style.display   = documentLoaded ? 'block' : 'none';

    const sizeControl = document.getElementById('signature-size-control');
    const placementControl = document.getElementById('sig-placement-control');
    if (sizeControl)      sizeControl.style.display      = (!isEditor && documentLoaded) ? 'block' : 'none';
    if (placementControl) placementControl.style.display = (!isEditor && documentLoaded) ? 'flex'  : 'none';

    // Barre + overlay de l'éditeur
    if (editorOverlay) editorOverlay.style.display = documentLoaded ? 'block' : 'none';

    if (isEditor) {
        if (typeof setAnnotationMode === 'function') setAnnotationMode(false);
        if (editorToolbar) editorToolbar.style.display = documentLoaded ? 'flex' : 'none';
        enableEditorMode(documentLoaded);
    } else {
        if (editorToolbar) editorToolbar.style.display = 'none';
        enableEditorMode(false);
    }

    if (downloadBtnLabel) {
        downloadBtnLabel.textContent = isEditor ? 'Télécharger le PDF' : 'Télécharger le document signé';
    }
}

function setView(view) {
    if (view !== 'signature' && view !== 'editor') return;
    currentView = view;
    applyView();
    // Repositionner l'overlay si on arrive sur l'éditeur
    if (view === 'editor') syncEditorOverlayHeight();
}

navTabs.forEach(tab => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
});

// ==============================================
// ÉDITEUR : état & outils
// ==============================================
let editorMode = false;
let editorTool = 'select';           // select | text | image | rect | whiteout
let editorColor = '#111111';
let editorFontSize = 18;
let editorBold = false;
let editorSelected = null;

const edFormat = document.getElementById('editor-format');
const edColorsWrap = document.getElementById('ed-colors');
const edSizeWrap = document.getElementById('ed-size-wrap');
const edFontSizeInput = document.getElementById('ed-font-size');
const edBoldBtn = document.getElementById('ed-bold');
const edDeleteBtn = document.getElementById('ed-delete');
const edImageInput = document.getElementById('editor-image-input');

function enableEditorMode(on) {
    editorMode = on;
    if (documentPreview) documentPreview.classList.toggle('editor-mode', on);
    if (!on) {
        if (documentPreview) documentPreview.classList.remove('editor-add-mode');
        deselectEditor();
    } else {
        syncEditorOverlayHeight();
        refreshFormatBar();
    }
}

function syncEditorOverlayHeight() {
    if (!editorOverlay) return;
    const pc = document.getElementById('pdf-pages-container');
    let h = 0;
    if (pc) h = pc.scrollHeight || pc.offsetHeight;
    else {
        const el = documentPreview.querySelector('canvas, img');
        h = el ? el.getBoundingClientRect().height : documentPreview.scrollHeight;
    }
    editorOverlay.style.height = `${h}px`;
}

function setEditorTool(tool) {
    editorTool = tool;
    document.querySelectorAll('.ed-tool').forEach(b => b.classList.toggle('active', b.dataset.edTool === tool));
    if (documentPreview) {
        documentPreview.classList.toggle('editor-add-mode', tool !== 'select' && tool !== 'edit-text');
        documentPreview.classList.toggle('editor-edittext-mode', tool === 'edit-text');
    }
    if (tool === 'image') {
        if (edImageInput) edImageInput.click();
        // rester en 'select' après ouverture du sélecteur
        setEditorTool('select');
    }
}

document.querySelectorAll('.ed-tool').forEach(btn => {
    btn.addEventListener('click', () => setEditorTool(btn.dataset.edTool));
});

// ==============================================
// ÉDITEUR : couleurs helpers
// ==============================================
function parseColor(str) {
    if (!str) return { r: 0, g: 0, b: 0 };
    str = ('' + str).trim();
    if (str[0] === '#') {
        let h = str.slice(1);
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h, 16);
        return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
    }
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (m) {
        const p = m[1].split(',').map(s => parseFloat(s));
        return { r: (p[0] || 0) / 255, g: (p[1] || 0) / 255, b: (p[2] || 0) / 255 };
    }
    return { r: 0, g: 0, b: 0 };
}
function hexToRgba(hex, a) {
    const c = parseColor(hex);
    return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
function sanitizeWinAnsi(s) {
    // pdf-lib StandardFonts n'encode que WinAnsi : retirer les caractères hors Latin-1
    return ('' + s).replace(/[^\x00-\xFF]/g, '');
}

// ==============================================
// ÉDITEUR : création / interaction des éléments
// ==============================================
function addEditorElement(type, x, y, opts) {
    opts = opts || {};
    if (!editorOverlay) return null;

    const el = document.createElement('div');
    el.className = 'editor-el editor-el-' + type;
    el.dataset.type = type;

    let w = opts.w, h = opts.h;

    if (type === 'text') {
        el.classList.add('editor-el-text');
        el.style.color = editorColor === '#FFFFFF' ? '#111111' : editorColor;
        el.dataset.color = editorColor === '#FFFFFF' ? '#111111' : editorColor;
        el.style.fontSize = editorFontSize + 'px';
        el.style.fontWeight = editorBold ? '700' : '400';
        const c = document.createElement('div');
        c.className = 'editor-text-content';
        c.setAttribute('contenteditable', 'true');
        c.textContent = opts.text || 'Votre texte';
        el.appendChild(c);
        w = w || 170;
    } else if (type === 'image') {
        el.classList.add('editor-el-image');
        const img = document.createElement('img');
        img.src = opts.src;
        img.alt = 'image';
        el.appendChild(img);
        const aspect = opts.aspect || 1.5;
        el.dataset.aspect = aspect;
        w = w || 200;
        h = h || Math.round(w / aspect);
    } else if (type === 'rect') {
        el.dataset.color = editorColor === '#FFFFFF' ? '#7C3AED' : editorColor;
        el.style.borderColor = el.dataset.color;
        el.style.background = hexToRgba(el.dataset.color, 0.18);
        w = w || 170; h = h || 90;
    } else if (type === 'whiteout') {
        el.dataset.color = '#FFFFFF';
        w = w || 170; h = h || 42;
    }

    const boxH = h || 34;
    el.style.left = Math.max(0, x - w / 2) + 'px';
    el.style.top = Math.max(0, y - boxH / 2) + 'px';
    el.style.width = w + 'px';
    if (type !== 'text' && h) el.style.height = h + 'px';

    // Poignées
    const remove = document.createElement('button');
    remove.className = 'ed-remove';
    remove.type = 'button';
    remove.innerHTML = '&#10005;';
    remove.addEventListener('pointerdown', ev => ev.stopPropagation());
    remove.addEventListener('click', ev => { ev.stopPropagation(); removeEditorEl(el); });

    const resize = document.createElement('span');
    resize.className = 'ed-resize';
    attachResize(resize, el);

    el.appendChild(remove);
    el.appendChild(resize);
    attachElementDrag(el);
    editorOverlay.appendChild(el);
    selectEditor(el);
    return el;
}

// Trouver le bloc de texte du PDF sous le pointeur
function hitTestExistingText(clientX, clientY) {
    const pagesContainer = document.getElementById('pdf-pages-container');
    if (!pagesContainer) return null;
    const containers = pagesContainer.querySelectorAll('.pdf-page-container');
    for (const cont of containers) {
        const canvas = cont.querySelector('.pdf-page-canvas');
        if (!canvas) continue;
        const rect = canvas.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
        const pageNum = parseInt(cont.dataset.pageNumber);
        const runs = state.pageTextRuns[pageNum] || [];
        const scale = rect.width / canvas.width;
        const cx = (clientX - rect.left) / scale;
        const cy = (clientY - rect.top) / scale;
        let best = null, bestDist = Infinity;
        for (const r of runs) {
            const pad = Math.max(2, r.ch * 0.35);
            if (cx >= r.cx - pad && cx <= r.cx + r.cw + pad && cy >= r.cy - pad && cy <= r.cy + r.ch + pad) {
                const dcx = cx - (r.cx + r.cw / 2), dcy = cy - (r.cy + r.ch / 2);
                const d = dcx * dcx + dcy * dcy;
                if (d < bestDist) { bestDist = d; best = r; }
            }
        }
        return best ? { run: best, pageNum, canvas, rect, scale } : null;
    }
    return null;
}

// Créer une zone éditable par-dessus un texte existant (le couvre et sera masqué à l'export)
function createExistingTextEdit(hit) {
    const { run, canvas, rect, scale, pageNum } = hit;
    const dpRect = documentPreview.getBoundingClientRect();
    const left = (rect.left - dpRect.left) + run.cx * scale;
    const top = (rect.top - dpRect.top) + run.cy * scale;
    const fontPx = Math.max(6, run.ch * scale);
    const wpx = Math.max(40, run.cw * scale + 12);

    const el = addEditorElement('text', 0, 0, { text: run.str });
    el.classList.add('editor-el-existing');
    el.dataset.existing = '1';
    el.dataset.origPage = pageNum;
    el.dataset.origFracX = run.cx / canvas.width;
    el.dataset.origFracY = run.cy / canvas.height;
    el.dataset.origFracW = run.cw / canvas.width;
    el.dataset.origFracH = run.ch / canvas.height;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.width = wpx + 'px';
    el.style.fontSize = fontPx + 'px';
    el.style.color = '#111111';
    el.dataset.color = '#111111';
    el.style.fontWeight = '400';
    // Couvrir le texte d'origine (fond page supposé uni/blanc — best-effort)
    el.style.background = '#ffffff';
    startEditingText(el);
    refreshFormatBar();
}

function removeEditorEl(el) {
    if (!el) return;
    if (editorSelected === el) editorSelected = null;
    el.remove();
    refreshFormatBar();
}

function selectEditor(el) {
    deselectEditor();
    editorSelected = el;
    el.classList.add('selected');
    refreshFormatBar();
}

function deselectEditor() {
    if (editorOverlay) editorOverlay.querySelectorAll('.editor-el.selected').forEach(e => e.classList.remove('selected'));
    editorSelected = null;
    refreshFormatBar();
}

// Barre de format toujours visible en mode éditeur (évite les sauts de mise en page).
// Sans sélection : règle les valeurs par défaut du prochain élément.
// Avec sélection : édite l'élément sélectionné.
function refreshFormatBar() {
    if (!edFormat) return;
    if (!editorMode) { edFormat.style.display = 'none'; return; }
    edFormat.style.display = 'flex';

    const el = editorSelected;
    const t = el ? el.dataset.type : null;
    // Couleur / taille / gras : pertinents pour texte & formes (et comme réglages par défaut)
    const showColor = !el || t === 'text' || t === 'rect';
    const showSize  = !el || t === 'text';
    const showBold  = !el || t === 'text';
    if (edColorsWrap) edColorsWrap.style.display = showColor ? 'flex' : 'none';
    if (edSizeWrap)   edSizeWrap.style.display   = showSize ? 'flex' : 'none';
    if (edBoldBtn)    edBoldBtn.style.display     = showBold ? 'inline-flex' : 'none';
    if (edDeleteBtn)  edDeleteBtn.style.display   = el ? 'inline-flex' : 'none';

    if (el && t === 'text') {
        if (edFontSizeInput) edFontSizeInput.value = parseInt(el.style.fontSize) || editorFontSize;
        if (edBoldBtn) edBoldBtn.classList.toggle('active', el.style.fontWeight === '700');
    } else {
        if (edFontSizeInput) edFontSizeInput.value = editorFontSize;
        if (edBoldBtn) edBoldBtn.classList.toggle('active', editorBold);
    }
    const cur = (el ? (el.dataset.color || '#111111') : editorColor).toLowerCase();
    document.querySelectorAll('.ed-color-swatch').forEach(s =>
        s.classList.toggle('active', (s.dataset.edColor || '').toLowerCase() === cur));
}

function attachElementDrag(el) {
    el.addEventListener('pointerdown', (e) => {
        if (!editorMode) return;
        if (e.target.closest('.ed-resize') || e.target.closest('.ed-remove')) return;
        if (el.classList.contains('editing')) return;      // édition texte en cours
        if (editorTool !== 'select') return;               // en mode ajout, ne pas déplacer
        e.preventDefault();
        selectEditor(el);
        const startX = e.clientX, startY = e.clientY;
        const origL = parseFloat(el.style.left) || 0;
        const origT = parseFloat(el.style.top) || 0;
        function move(ev) {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            const maxL = (editorOverlay.clientWidth || 9999) - el.offsetWidth;
            const maxT = (editorOverlay.clientHeight || 99999) - el.offsetHeight;
            el.style.left = Math.max(0, Math.min(origL + dx, maxL)) + 'px';
            el.style.top = Math.max(0, Math.min(origT + dy, maxT)) + 'px';
        }
        function up() {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    });

    if (el.dataset.type === 'text') {
        el.addEventListener('dblclick', () => startEditingText(el));
    }
}

function attachResize(handle, el) {
    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectEditor(el);
        const startX = e.clientX, startY = e.clientY;
        const startW = el.offsetWidth, startH = el.offsetHeight;
        const type = el.dataset.type;
        const aspect = parseFloat(el.dataset.aspect) || (startW / Math.max(1, startH));
        function move(ev) {
            let w = Math.max(28, startW + (ev.clientX - startX));
            if (type === 'image') {
                el.style.width = w + 'px';
                el.style.height = Math.max(20, Math.round(w / aspect)) + 'px';
            } else if (type === 'text') {
                el.style.width = w + 'px';  // hauteur auto selon le contenu
            } else {
                let h = Math.max(16, startH + (ev.clientY - startY));
                el.style.width = w + 'px';
                el.style.height = h + 'px';
            }
        }
        function up() {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    });
}

function startEditingText(el) {
    if (!el || el.dataset.type !== 'text') return;
    el.classList.add('editing');
    selectEditor(el);
    const c = el.querySelector('.editor-text-content');
    if (!c) return;
    setTimeout(() => {
        c.focus();
        const r = document.createRange();
        r.selectNodeContents(c);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
    }, 0);
    const onBlur = () => {
        el.classList.remove('editing');
        if (!c.textContent.trim()) removeEditorEl(el);
        c.removeEventListener('blur', onBlur);
    };
    c.addEventListener('blur', onBlur);
}

// Clic sur le document en mode ajout / désélection
if (documentPreview) {
    documentPreview.addEventListener('pointerdown', (e) => {
        if (!editorMode) return;
        if (e.target.closest('.editor-el')) return;   // interaction avec un élément existant
        if (editorTool === 'select') { deselectEditor(); return; }

        // Modifier le texte existant : clic sur un texte du PDF
        if (editorTool === 'edit-text') {
            const hit = hitTestExistingText(e.clientX, e.clientY);
            if (hit) createExistingTextEdit(hit);
            return;   // rester dans l'outil pour enchaîner les modifications
        }

        const rect = documentPreview.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (editorTool === 'text') {
            const el = addEditorElement('text', x, y);
            startEditingText(el);
        } else if (editorTool === 'rect') {
            addEditorElement('rect', x, y);
        } else if (editorTool === 'whiteout') {
            addEditorElement('whiteout', x, y);
        }
        setEditorTool('select');
    });
}

// Ajout d'image
if (edImageInput) {
    edImageInput.addEventListener('change', () => {
        const file = edImageInput.files && edImageInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const tmp = new Image();
            tmp.onload = () => {
                // Convertir en PNG pour un embed fiable dans le PDF
                const cv = document.createElement('canvas');
                cv.width = tmp.naturalWidth; cv.height = tmp.naturalHeight;
                cv.getContext('2d').drawImage(tmp, 0, 0);
                let pngSrc;
                try { pngSrc = cv.toDataURL('image/png'); } catch (err) { pngSrc = reader.result; }
                const aspect = tmp.naturalWidth / Math.max(1, tmp.naturalHeight);
                // Placer au centre visible du document
                const rect = documentPreview.getBoundingClientRect();
                const x = Math.max(60, (rect.width || 300) / 2);
                const y = Math.max(60, window.scrollY - rect.top + 160);
                addEditorElement('image', x, y, { src: pngSrc, aspect: aspect, w: 200 });
            };
            tmp.src = reader.result;
        };
        reader.readAsDataURL(file);
        edImageInput.value = '';
    });
}

// Barre de format (couleur / taille / gras / supprimer)
document.querySelectorAll('.ed-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
        editorColor = sw.dataset.edColor;
        document.querySelectorAll('.ed-color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        if (editorSelected) {
            const t = editorSelected.dataset.type;
            if (t === 'text') {
                editorSelected.style.color = editorColor;
                editorSelected.dataset.color = editorColor;
            } else if (t === 'rect') {
                editorSelected.dataset.color = editorColor;
                editorSelected.style.borderColor = editorColor;
                editorSelected.style.background = hexToRgba(editorColor, 0.18);
            }
        }
    });
});

if (edFontSizeInput) {
    edFontSizeInput.addEventListener('input', () => {
        editorFontSize = parseInt(edFontSizeInput.value) || 18;
        if (editorSelected && editorSelected.dataset.type === 'text') {
            editorSelected.style.fontSize = editorFontSize + 'px';
        }
    });
}

if (edBoldBtn) {
    edBoldBtn.addEventListener('click', () => {
        if (editorSelected && editorSelected.dataset.type === 'text') {
            const bold = editorSelected.style.fontWeight === '700';
            editorSelected.style.fontWeight = bold ? '400' : '700';
            editorBold = !bold;
            edBoldBtn.classList.toggle('active', !bold);
        } else {
            editorBold = !editorBold;
            edBoldBtn.classList.toggle('active', editorBold);
        }
    });
}

if (edDeleteBtn) {
    edDeleteBtn.addEventListener('click', () => { if (editorSelected) removeEditorEl(editorSelected); });
}

const editorClearBtn = document.getElementById('editor-clear');
if (editorClearBtn) {
    editorClearBtn.addEventListener('click', () => {
        if (!editorOverlay) return;
        if (!editorOverlay.querySelector('.editor-el')) return;
        if (confirm('Supprimer tous les éléments ajoutés ?')) {
            editorOverlay.querySelectorAll('.editor-el').forEach(e => e.remove());
            deselectEditor();
        }
    });
}

// Supprimer via clavier
document.addEventListener('keydown', (e) => {
    if (!editorMode || !editorSelected) return;
    if (editorSelected.classList.contains('editing')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeEditorEl(editorSelected);
    }
});

function resetEditor() {
    if (editorOverlay) editorOverlay.querySelectorAll('.editor-el').forEach(e => e.remove());
    deselectEditor();
    setEditorTool('select');
}

window.addEventListener('resize', () => { if (documentLoaded) syncEditorOverlayHeight(); });

// ==============================================
// ÉDITEUR : aplatissement dans le PDF exporté
// ==============================================
async function embedDataUrlImage(pdfDoc, dataUrl) {
    const bytes = await fetch(dataUrl).then(r => r.arrayBuffer());
    if (/^data:image\/png/i.test(dataUrl)) return pdfDoc.embedPng(bytes);
    return pdfDoc.embedJpg(bytes);
}

async function embedEditorElements(pdfDoc, pages) {
    if (!editorOverlay) return;
    const els = Array.from(editorOverlay.querySelectorAll('.editor-el'));
    if (!els.length) return;

    const { rgb, StandardFonts } = PDFLib;
    let helv = null, helvBold = null;

    const pagesContainer = document.getElementById('pdf-pages-container');
    const containers = pagesContainer ? Array.from(pagesContainer.querySelectorAll('.pdf-page-container')) : null;
    const singleEl = !containers ? documentPreview.querySelector('canvas, img') : null;

    for (const el of els) {
        const elRect = el.getBoundingClientRect();
        const centerY = elRect.top + elRect.height / 2;

        let pageNum = 1, canvas = null;
        if (containers && containers.length) {
            for (const c of containers) {
                const pr = c.getBoundingClientRect();
                if (centerY >= pr.top && centerY <= pr.bottom) {
                    pageNum = parseInt(c.dataset.pageNumber);
                    canvas = c.querySelector('.pdf-page-canvas');
                    break;
                }
            }
            if (!canvas) { canvas = containers[0].querySelector('.pdf-page-canvas'); pageNum = 1; }
        } else {
            canvas = singleEl; pageNum = 1;
        }
        if (!canvas || pageNum < 1 || pageNum > pages.length) continue;

        const cr = canvas.getBoundingClientRect();
        const page = pages[pageNum - 1];
        const { width: pw, height: ph } = page.getSize();
        const scaleX = pw / cr.width;

        const fracX = (elRect.left - cr.left) / cr.width;
        const fracY = (elRect.top - cr.top) / cr.height;
        const w = (elRect.width / cr.width) * pw;
        const h = (elRect.height / cr.height) * ph;
        const x = fracX * pw;
        const yTop = fracY * ph;
        const y = ph - yTop - h;
        const type = el.dataset.type;

        if (type === 'whiteout') {
            page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
        } else if (type === 'rect') {
            const c = parseColor(el.dataset.color || '#7C3AED');
            page.drawRectangle({
                x, y, width: w, height: h,
                color: rgb(c.r, c.g, c.b), opacity: 0.15,
                borderColor: rgb(c.r, c.g, c.b), borderWidth: Math.max(1, 1.5 * scaleX)
            });
        } else if (type === 'image') {
            const img = el.querySelector('img');
            if (img && img.src) {
                try {
                    const im = await embedDataUrlImage(pdfDoc, img.src);
                    page.drawImage(im, { x, y, width: w, height: h });
                } catch (err) { console.warn('Export image éditeur:', err); }
            }
        } else if (type === 'text') {
            // Texte existant modifié : masquer d'abord l'original à son emplacement
            if (el.dataset.existing === '1') {
                const op = parseInt(el.dataset.origPage) || pageNum;
                if (op >= 1 && op <= pages.length) {
                    const opage = pages[op - 1];
                    const os = opage.getSize();
                    const ox = (parseFloat(el.dataset.origFracX) || 0) * os.width;
                    const ow = (parseFloat(el.dataset.origFracW) || 0) * os.width;
                    const oh = (parseFloat(el.dataset.origFracH) || 0) * os.height;
                    const oy = os.height - ((parseFloat(el.dataset.origFracY) || 0) * os.height) - oh;
                    opage.drawRectangle({ x: ox - 1, y: oy - 1, width: ow + 2, height: oh + 2, color: rgb(1, 1, 1) });
                }
            }
            if (!helv) {
                helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
                helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            }
            const bold = el.style.fontWeight === '700';
            const font = bold ? helvBold : helv;
            const sizePt = (parseFloat(el.style.fontSize) || 18) * scaleX;
            const lineH = sizePt * 1.25;
            const col = parseColor(el.style.color || '#111111');
            const padL = 4 * scaleX, padT = 2 * scaleX;
            const content = el.querySelector('.editor-text-content');
            const text = (content ? content.innerText : '').replace(/\r/g, '');
            const lines = text.split('\n');
            const topBaseline = (ph - yTop) - padT - sizePt * 0.82;
            for (let i = 0; i < lines.length; i++) {
                const ln = sanitizeWinAnsi(lines[i]);
                if (!ln) continue;
                try {
                    page.drawText(ln, {
                        x: x + padL, y: topBaseline - i * lineH,
                        size: sizePt, font, color: rgb(col.r, col.g, col.b)
                    });
                } catch (err) { console.warn('Export texte éditeur:', err); }
            }
        }
    }
}

// Appliquer le service par défaut au démarrage
applyView();
