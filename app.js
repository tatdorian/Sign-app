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
        container.classList.toggle('view-scanner', currentView === 'scanner');
    }

    const isEditor = currentView === 'editor';
    const isScanner = currentView === 'scanner';

    // Le service Scanner remplace la carte Document
    const uploadSection = document.getElementById('upload-section');
    const scannerSection = document.getElementById('scanner-section');
    if (uploadSection)  uploadSection.style.display  = isScanner ? 'none' : 'block';
    if (scannerSection) scannerSection.style.display = isScanner ? 'block' : 'none';

    // Sections propres au service Signature
    if (signatureSection) signatureSection.style.display = (!isEditor && !isScanner && documentLoaded) ? 'block' : 'none';
    if (parapheSection)   parapheSection.style.display   = (!isEditor && !isScanner && documentLoaded) ? 'block' : 'none';
    if (actionsSection)   actionsSection.style.display   = (!isScanner && documentLoaded) ? 'block' : 'none';

    const sizeControl = document.getElementById('signature-size-control');
    const placementControl = document.getElementById('sig-placement-control');
    if (sizeControl)      sizeControl.style.display      = (!isEditor && !isScanner && documentLoaded) ? 'block' : 'none';
    if (placementControl) placementControl.style.display = (!isEditor && !isScanner && documentLoaded) ? 'flex'  : 'none';

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
    if (view !== 'signature' && view !== 'editor' && view !== 'scanner') return;
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
        removeEditTextTargets();
        deselectEditor();
    } else {
        syncEditorOverlayHeight();
        refreshFormatBar();
        if (editorTool === 'edit-text') showEditTextTargets();
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
    if (tool === 'edit-text') showEditTextTargets();
    else removeEditTextTargets();
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

// Fusionner les fragments de texte pdf.js en LIGNES (comme un traitement de texte)
function getPageTextLines(pageNum) {
    const runs = state.pageTextRuns[pageNum] || [];
    const sorted = runs.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const lines = [];
    for (const r of sorted) {
        const line = lines.find(L => {
            const overlap = Math.min(L.cy + L.ch, r.cy + r.ch) - Math.max(L.cy, r.cy);
            return overlap > 0.5 * Math.min(L.ch, r.ch);
        });
        if (!line) {
            lines.push({ cx: r.cx, cy: r.cy, cw: r.cw, ch: r.ch, parts: [r] });
        } else {
            line.parts.push(r);
            const x2 = Math.max(line.cx + line.cw, r.cx + r.cw);
            const y2 = Math.max(line.cy + line.ch, r.cy + r.ch);
            line.cx = Math.min(line.cx, r.cx);
            line.cy = Math.min(line.cy, r.cy);
            line.cw = x2 - line.cx;
            line.ch = y2 - line.cy;
        }
    }
    for (const L of lines) {
        L.parts.sort((a, b) => a.cx - b.cx);
        let str = '', prevEnd = null;
        for (const p of L.parts) {
            if (prevEnd !== null && p.cx - prevEnd > L.ch * 0.22 && !str.endsWith(' ') && !p.str.startsWith(' ')) str += ' ';
            str += p.str;
            prevEnd = p.cx + p.cw;
        }
        L.str = str;
    }
    return lines;
}

// Lignes déjà transformées en zone d'édition (pour ne pas recréer de cible dessus)
const editedLineKeys = new Set();

// Afficher des cibles cliquables sur CHAQUE ligne de texte du PDF.
// L'utilisateur voit immédiatement ce qui est modifiable — clic = édition.
function showEditTextTargets() {
    removeEditTextTargets();
    if (!editorOverlay) return;
    const pagesContainer = document.getElementById('pdf-pages-container');
    if (!pagesContainer) return;
    const dpRect = documentPreview.getBoundingClientRect();
    let total = 0;
    pagesContainer.querySelectorAll('.pdf-page-container').forEach(cont => {
        const pageNum = parseInt(cont.dataset.pageNumber);
        const canvas = cont.querySelector('.pdf-page-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scale = rect.width / canvas.width;
        for (const line of getPageTextLines(pageNum)) {
            total++;
            const key = pageNum + ':' + Math.round(line.cy) + ':' + Math.round(line.cx);
            if (editedLineKeys.has(key)) continue;
            const t = document.createElement('div');
            t.className = 'edit-text-target';
            t.style.left = ((rect.left - dpRect.left) + line.cx * scale - 3) + 'px';
            t.style.top = ((rect.top - dpRect.top) + line.cy * scale - 2) + 'px';
            t.style.width = (line.cw * scale + 6) + 'px';
            t.style.height = (line.ch * scale + 4) + 'px';
            t.title = 'Cliquer pour modifier ce texte';
            t.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                editedLineKeys.add(key);
                t.remove();
                createExistingTextEdit(line, pageNum, canvas, key);
            });
            editorOverlay.appendChild(t);
        }
    });
    if (total === 0) {
        alert('Aucun texte détecté dans ce document.\nS\'il s\'agit d\'un scan (image), le texte n\'est pas modifiable directement : utilisez l\'outil « Cache » + « Texte » pour le recouvrir.');
    }
}

function removeEditTextTargets() {
    if (editorOverlay) editorOverlay.querySelectorAll('.edit-text-target').forEach(t => t.remove());
}

// Couleur du texte d'origine : moyenne des pixels sombres dans la zone
function sampleTextColor(canvas, line) {
    try {
        const x = Math.max(0, Math.round(line.cx)), y = Math.max(0, Math.round(line.cy));
        const w = Math.min(canvas.width - x, Math.round(line.cw)), h = Math.min(canvas.height - y, Math.round(line.ch));
        if (w < 1 || h < 1) return '#111111';
        const d = canvas.getContext('2d').getImageData(x, y, w, h).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (lum < 130) { r += d[i]; g += d[i + 1]; b += d[i + 2]; count++; }
        }
        if (!count) return '#111111';
        const hex = v => Math.round(v / count).toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(b);
    } catch (e) { return '#111111'; }
}

// Créer la zone éditable par-dessus une ligne existante
// (l'original est couvert à l'écran et masqué dans le PDF exporté)
function createExistingTextEdit(line, pageNum, canvas, lineKey) {
    const dpRect = documentPreview.getBoundingClientRect();
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    const left = (rect.left - dpRect.left) + line.cx * scale;
    const top = (rect.top - dpRect.top) + line.cy * scale;
    const fontPx = Math.max(6, line.ch * scale * 0.92);
    const wpx = Math.max(40, line.cw * scale + 14);
    const color = sampleTextColor(canvas, line);

    const el = addEditorElement('text', 0, 0, { text: line.str });
    el.classList.add('editor-el-existing');
    el.dataset.existing = '1';
    el.dataset.lineKey = lineKey || '';
    el.dataset.origPage = pageNum;
    el.dataset.origFracX = line.cx / canvas.width;
    el.dataset.origFracY = line.cy / canvas.height;
    el.dataset.origFracW = line.cw / canvas.width;
    el.dataset.origFracH = line.ch / canvas.height;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.width = wpx + 'px';
    el.style.fontSize = fontPx + 'px';
    el.style.color = color;
    el.dataset.color = color;
    el.style.fontWeight = '400';
    el.style.lineHeight = '1.15';
    // Couvrir le texte d'origine (fond page supposé uni/blanc — best-effort)
    el.style.background = '#ffffff';
    startEditingText(el);
    refreshFormatBar();
}

function removeEditorEl(el) {
    if (!el) return;
    if (editorSelected === el) editorSelected = null;
    // Ligne existante rendue de nouveau éditable si sa zone est supprimée
    if (el.dataset.lineKey) {
        editedLineKeys.delete(el.dataset.lineKey);
        if (editorTool === 'edit-text') showEditTextTargets();
    }
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

        // Modifier le texte existant : les cibles cliquables gèrent le clic
        if (editorTool === 'edit-text') return;

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
    removeEditTextTargets();
    editedLineKeys.clear();
    deselectEditor();
    setEditorTool('select');
}

window.addEventListener('resize', () => {
    if (!documentLoaded) return;
    syncEditorOverlayHeight();
    if (editorMode && editorTool === 'edit-text') showEditTextTargets();
});

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
            // (marge verticale généreuse pour couvrir descendantes et accents)
            if (el.dataset.existing === '1') {
                const op = parseInt(el.dataset.origPage) || pageNum;
                if (op >= 1 && op <= pages.length) {
                    const opage = pages[op - 1];
                    const os = opage.getSize();
                    const ox = (parseFloat(el.dataset.origFracX) || 0) * os.width;
                    const ow = (parseFloat(el.dataset.origFracW) || 0) * os.width;
                    const oh = (parseFloat(el.dataset.origFracH) || 0) * os.height;
                    const oy = os.height - ((parseFloat(el.dataset.origFracY) || 0) * os.height) - oh;
                    opage.drawRectangle({
                        x: ox - 2,
                        y: oy - oh * 0.32,
                        width: ow + 4,
                        height: oh * 1.5,
                        color: rgb(1, 1, 1)
                    });
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

// ==============================================
// SCANNER DE DOCUMENTS — pipeline 100 % client
// (détection de coins, homographie, filtres scanner)
// ==============================================
const scanState = {
    source: null,     // canvas source plein format (plafonné)
    quad: null,       // 4 coins normalisés [0..1] — ordre TL,TR,BR,BL
    warped: null,     // canvas redressé (avant filtres)
    mode: 'bw',
    pages: []         // pages déjà scannées (canvas) pour un PDF multi-pages
};

const scanSection     = document.getElementById('scanner-section');
const scanCaptureStep = document.getElementById('scan-capture');
const scanAdjustStep  = document.getElementById('scan-adjust');
const scanResultStep  = document.getElementById('scan-result');
const scanInput       = document.getElementById('scan-input');
const scanInputGal    = document.getElementById('scan-input-gallery');
const scanPreview     = document.getElementById('scan-preview');
const scanQuadSvg     = document.getElementById('scan-quad-svg');
const scanQuadPoly    = document.getElementById('scan-quad-poly');
const scanLoupe       = document.getElementById('scan-loupe');
const scanLoupeCanvas = document.getElementById('scan-loupe-canvas');
const scanResultCanvas = document.getElementById('scan-result-canvas');
const scanProcessing  = document.getElementById('scan-processing');

function scanShowStep(step) {
    if (scanCaptureStep) scanCaptureStep.style.display = step === 'capture' ? 'block' : 'none';
    if (scanAdjustStep)  scanAdjustStep.style.display  = step === 'adjust'  ? 'block' : 'none';
    if (scanResultStep)  scanResultStep.style.display  = step === 'result'  ? 'block' : 'none';
}

// ---------- Capture ----------
async function scanLoadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    showLoader();
    try {
        let bmp = null;
        try {
            bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (e1) {
            try { bmp = await createImageBitmap(file); } catch (e2) { bmp = null; }
        }
        if (!bmp) {
            bmp = await new Promise((res, rej) => {
                const url = URL.createObjectURL(file);
                const im = new Image();
                im.onload = () => { URL.revokeObjectURL(url); res(im); };
                im.onerror = rej;
                im.src = url;
            });
        }
        const bw = bmp.width || bmp.naturalWidth, bh = bmp.height || bmp.naturalHeight;
        // Plafonner la source (mémoire + perfs)
        const maxSide = 3000;
        const s = Math.min(1, maxSide / Math.max(bw, bh));
        const src = document.createElement('canvas');
        src.width = Math.round(bw * s); src.height = Math.round(bh * s);
        src.getContext('2d').drawImage(bmp, 0, 0, src.width, src.height);
        if (bmp.close) bmp.close();
        scanState.source = src;

        // Détection automatique des coins (sur version réduite)
        scanState.quad = detectDocumentQuad(src) || defaultQuad();

        drawScanPreview();
        scanShowStep('adjust');
    } catch (err) {
        console.error('Scanner chargement image:', err);
        alert('Impossible de charger cette image: ' + err.message);
    } finally {
        hideLoader();
    }
}

function defaultQuad() {
    const m = 0.08;
    return [{ x: m, y: m }, { x: 1 - m, y: m }, { x: 1 - m, y: 1 - m }, { x: m, y: 1 - m }];
}

const scanTakeBtn = document.getElementById('scan-take-btn');
const scanGalleryBtn = document.getElementById('scan-gallery-btn');
if (scanTakeBtn && scanInput) scanTakeBtn.addEventListener('click', () => scanInput.click());
if (scanGalleryBtn && scanInputGal) scanGalleryBtn.addEventListener('click', () => scanInputGal.click());
if (scanInput) scanInput.addEventListener('change', () => { scanLoadFile(scanInput.files[0]); scanInput.value = ''; });
if (scanInputGal) scanInputGal.addEventListener('change', () => { scanLoadFile(scanInputGal.files[0]); scanInputGal.value = ''; });

const scanDrop = document.getElementById('scan-drop');
if (scanDrop) {
    scanDrop.addEventListener('dragover', (e) => { e.preventDefault(); scanDrop.classList.add('dragover'); });
    scanDrop.addEventListener('dragleave', () => scanDrop.classList.remove('dragover'));
    scanDrop.addEventListener('drop', (e) => {
        e.preventDefault(); scanDrop.classList.remove('dragover');
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) scanLoadFile(f);
    });
}

// ---------- Aperçu + poignées ----------
function drawScanPreview() {
    if (!scanState.source || !scanPreview) return;
    const src = scanState.source;
    const pw = Math.min(1000, src.width);
    const ph = Math.round(pw * src.height / src.width);
    scanPreview.width = pw; scanPreview.height = ph;
    scanPreview.getContext('2d').drawImage(src, 0, 0, pw, ph);
    if (scanQuadSvg) scanQuadSvg.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
    updateQuadUI();
}

function updateQuadUI() {
    if (!scanState.quad || !scanQuadPoly) return;
    const pw = scanPreview.width, ph = scanPreview.height;
    const pts = scanState.quad.map(p => `${(p.x * pw).toFixed(1)},${(p.y * ph).toFixed(1)}`).join(' ');
    scanQuadPoly.setAttribute('points', pts);
    const handles = scanQuadSvg.querySelectorAll('.scan-handle');
    handles.forEach(h => {
        const i = parseInt(h.dataset.corner);
        h.setAttribute('cx', (scanState.quad[i].x * pw).toFixed(1));
        h.setAttribute('cy', (scanState.quad[i].y * ph).toFixed(1));
    });
}

// Drag des poignées (pointer events + loupe)
if (scanQuadSvg) {
    scanQuadSvg.querySelectorAll('.scan-handle').forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const corner = parseInt(handle.dataset.corner);
            handle.setPointerCapture(e.pointerId);
            const move = (ev) => {
                const rect = scanQuadSvg.getBoundingClientRect();
                let nx = (ev.clientX - rect.left) / rect.width;
                let ny = (ev.clientY - rect.top) / rect.height;
                nx = Math.max(0, Math.min(1, nx));
                ny = Math.max(0, Math.min(1, ny));
                scanState.quad[corner] = { x: nx, y: ny };
                updateQuadUI();
                updateLoupe(nx, ny, ev.clientX - rect.left, ev.clientY - rect.top, rect);
            };
            const up = () => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', up);
                if (scanLoupe) scanLoupe.style.display = 'none';
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
        });
    });
}

function updateLoupe(nx, ny, dispX, dispY, rect) {
    if (!scanLoupe || !scanLoupeCanvas || !scanPreview) return;
    scanLoupe.style.display = 'block';
    // Position: au-dessus du doigt, rabattue si près des bords
    const L = 120;
    let lx = dispX - L / 2;
    let ly = dispY - L - 28;
    if (ly < 0) ly = dispY + 28;
    lx = Math.max(0, Math.min(lx, rect.width - L));
    scanLoupe.style.left = lx + 'px';
    scanLoupe.style.top = ly + 'px';
    // Zoom x2.5 autour du coin
    const ctx = scanLoupeCanvas.getContext('2d');
    const zoom = 2.5;
    const srcSize = L / zoom;
    const cx = nx * scanPreview.width, cy = ny * scanPreview.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, L, L);
    ctx.drawImage(scanPreview,
        cx - srcSize / 2, cy - srcSize / 2, srcSize, srcSize,
        0, 0, L, L);
}

// ---------- Étapes ----------
const scanRetakeBtn = document.getElementById('scan-retake-btn');
const scanValidateBtn = document.getElementById('scan-validate-btn');
const scanBackBtn = document.getElementById('scan-back-btn');
if (scanRetakeBtn) scanRetakeBtn.addEventListener('click', () => scanShowStep('capture'));
if (scanBackBtn) scanBackBtn.addEventListener('click', () => scanShowStep('adjust'));

if (scanValidateBtn) {
    scanValidateBtn.addEventListener('click', async () => {
        if (!scanState.source || !scanState.quad) return;
        showLoader();
        // Laisser le loader s'afficher avant le calcul lourd
        await new Promise(r => setTimeout(r, 30));
        try {
            scanState.warped = warpDocument(scanState.source, orderQuad(scanState.quad));
            scanShowStep('result');
            await applyScanMode();
        } catch (err) {
            console.error('Scanner warp:', err);
            alert('Erreur lors du redressement: ' + err.message);
        } finally {
            hideLoader();
        }
    });
}

// Modes de rendu
document.querySelectorAll('.scan-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        document.querySelectorAll('.scan-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        scanState.mode = btn.dataset.scanMode;
        await applyScanMode();
    });
});

async function applyScanMode() {
    if (!scanState.warped || !scanResultCanvas) return;
    if (scanProcessing) scanProcessing.style.display = 'flex';
    await new Promise(r => setTimeout(r, 20));
    try {
        const w = scanState.warped;
        scanResultCanvas.width = w.width;
        scanResultCanvas.height = w.height;
        const ctx = scanResultCanvas.getContext('2d');
        if (scanState.mode === 'original') {
            ctx.drawImage(w, 0, 0);
        } else if (scanState.mode === 'color') {
            ctx.putImageData(enhanceColor(w), 0, 0);
        } else {
            ctx.putImageData(enhanceBW(w), 0, 0);
        }
    } finally {
        if (scanProcessing) scanProcessing.style.display = 'none';
    }
}

// ---------- Détection automatique des coins ----------
// Pipeline: réduction -> gris -> gaussien -> Sobel/Canny -> dilatation
// -> composantes connexes -> enveloppe convexe -> réduction à 4 sommets
function detectDocumentQuad(srcCanvas) {
    try {
        const maxSide = 420;
        const s = maxSide / Math.max(srcCanvas.width, srcCanvas.height);
        const w = Math.max(2, Math.round(srcCanvas.width * s));
        const h = Math.max(2, Math.round(srcCanvas.height * s));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cctx = cv.getContext('2d');
        cctx.drawImage(srcCanvas, 0, 0, w, h);
        const data = cctx.getImageData(0, 0, w, h).data;

        // Niveaux de gris
        let gray = new Float32Array(w * h);
        for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
            gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
        }
        gray = gaussianBlur5(gray, w, h);

        // Gradients de Sobel
        const mag = new Float32Array(w * h);
        const dir = new Uint8Array(w * h); // 0:0°, 1:45°, 2:90°, 3:135°
        let maxMag = 0;
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1]
                          + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
                const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
                          + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
                const m = Math.hypot(gx, gy);
                mag[i] = m;
                if (m > maxMag) maxMag = m;
                const a = Math.atan2(gy, gx) * 180 / Math.PI;
                const aa = ((a % 180) + 180) % 180;
                dir[i] = aa < 22.5 || aa >= 157.5 ? 0 : aa < 67.5 ? 1 : aa < 112.5 ? 2 : 3;
            }
        }

        // Suppression des non-maxima
        const nms = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const m = mag[i];
                if (m === 0) continue;
                let a = 0, b = 0;
                switch (dir[i]) {
                    case 0: a = mag[i - 1]; b = mag[i + 1]; break;
                    case 1: a = mag[i - w + 1]; b = mag[i + w - 1]; break;
                    case 2: a = mag[i - w]; b = mag[i + w]; break;
                    default: a = mag[i - w - 1]; b = mag[i + w + 1];
                }
                if (m >= a && m >= b) nms[i] = m;
            }
        }

        // Stratégie 1 — Canny multi-seuils : le texte du document produit des
        // gradients très forts qui tirent le percentile vers le haut ; on teste
        // plusieurs seuils décroissants et on garde tous les quads candidats.
        const sample = [];
        for (let i = 0; i < nms.length; i += 7) if (nms[i] > 0) sample.push(nms[i]);
        sample.sort((a, b) => a - b);
        if (!sample.length) return null;

        const supportThr = sample[Math.floor(sample.length * 0.25)];
        const candidates = [];
        for (const pct of [0.9, 0.78, 0.62, 0.45, 0.3]) {
            const high = sample[Math.floor(sample.length * pct)];
            const q = quadFromNms(nms, w, h, high, high * 0.4);
            if (q) candidates.push(q);
        }

        // Stratégie 2 — segmentation d'Otsu : le document est généralement la
        // grande région CLAIRE de la photo. Robuste quand les bords de Canny
        // sont coupés (faible contraste local, doigt sur le bord…).
        const otsuQuad = quadFromBrightRegion(gray, w, h);
        if (otsuQuad) candidates.push(otsuQuad);

        // Sélection : angles plausibles + score aire × adhérence aux gradients
        let best = null, bestScore = 0;
        const totalArea = w * h;
        for (const q of candidates) {
            if (!quadAnglesOk(q)) continue;
            const areaRatio = polygonArea(q) / totalArea;
            if (areaRatio < 0.15 || areaRatio > 0.99) continue;
            const support = quadEdgeSupport(q, nms, w, h, supportThr);
            const score = areaRatio * (0.35 + support);
            if (score > bestScore) { bestScore = score; best = q; }
        }

        if (!best) return null;
        return orderQuad(best.map(p => ({ x: p[0] / w, y: p[1] / h })));
    } catch (err) {
        console.warn('Détection coins:', err);
        return null;
    }
}

// Segmentation de la région claire (Otsu) -> plus grande composante -> quad
function quadFromBrightRegion(gray, w, h) {
    const hist = new Float64Array(256);
    for (let i = 0; i < gray.length; i++) {
        const g = gray[i] < 0 ? 0 : gray[i] > 255 ? 255 : gray[i] | 0;
        hist[g]++;
    }
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, maxVar = 0, thresh = 127;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const v = wB * wF * (mB - mF) * (mB - mF);
        if (v > maxVar) { maxVar = v; thresh = t; }
    }

    const mask = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) mask[i] = gray[i] > thresh ? 1 : 0;

    // Plus grande composante claire
    const seen = new Uint8Array(w * h);
    let bestQuad = null, bestArea = 0;
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || seen[i]) continue;
        const pts = [];
        const st = [i]; seen[i] = 1;
        while (st.length) {
            const c = st.pop();
            const cy = (c / w) | 0, cx = c % w;
            pts.push([cx, cy]);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const ny = cy + dy, nx2 = cx + dx;
                if (ny < 0 || ny >= h || nx2 < 0 || nx2 >= w) continue;
                const n = ny * w + nx2;
                if (mask[n] && !seen[n]) { seen[n] = 1; st.push(n); }
            }
        }
        if (pts.length < w * h * 0.12) continue;
        const hull = convexHull(pts);
        if (hull.length < 4) continue;
        const quad = hullToQuad(hull);
        if (!quad) continue;
        const qa = polygonArea(quad);
        // La composante doit remplir son quad (rejette les fonds clairs troués)
        if (qa < w * h * 0.15 || pts.length < qa * 0.55) continue;
        if (qa > bestArea) { bestArea = qa; bestQuad = quad; }
    }
    return bestQuad;
}

// Angles internes plausibles pour une feuille photographiée (32°..148°)
function quadAnglesOk(quad) {
    for (let i = 0; i < 4; i++) {
        const p = quad[(i + 3) % 4], q = quad[i], r = quad[(i + 1) % 4];
        const v1x = p[0] - q[0], v1y = p[1] - q[1];
        const v2x = r[0] - q[0], v2y = r[1] - q[1];
        const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
        if (n1 < 4 || n2 < 4) return false;
        const cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
        const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        if (ang < 32 || ang > 148) return false;
    }
    return true;
}

// Fraction du périmètre du quad posée sur un gradient fort
function quadEdgeSupport(quad, nms, w, h, thr) {
    let hit = 0, tot = 0;
    for (let e = 0; e < 4; e++) {
        const a = quad[e], b = quad[(e + 1) % 4];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(8, Math.round(len / 2));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const x = Math.round(a[0] + (b[0] - a[0]) * t);
            const y = Math.round(a[1] + (b[1] - a[1]) * t);
            tot++;
            let found = 0;
            for (let dy = -2; dy <= 2 && !found; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const yy = y + dy, xx = x + dx;
                    if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
                    if (nms[yy * w + xx] >= thr) { found = 1; break; }
                }
            }
            hit += found;
        }
    }
    return tot ? hit / tot : 0;
}

// Hystérésis + composantes connexes + enveloppe convexe -> meilleur quad
function quadFromNms(nms, w, h, high, low) {
    const edges = new Uint8Array(w * h);
    const stack = [];
    for (let i = 0; i < nms.length; i++) {
        if (nms[i] >= high && !edges[i]) {
            edges[i] = 1; stack.push(i);
            while (stack.length) {
                const c = stack.pop();
                const cy = (c / w) | 0, cx = c % w;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const ny = cy + dy, nx2 = cx + dx;
                    if (ny < 0 || ny >= h || nx2 < 0 || nx2 >= w) continue;
                    const n = ny * w + nx2;
                    if (!edges[n] && nms[n] >= low) { edges[n] = 1; stack.push(n); }
                }
            }
        }
    }

    // Dilatation 3x3 (referme les petites coupures)
    const dil = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (edges[i] || edges[i - 1] || edges[i + 1] || edges[i - w] || edges[i + w]) dil[i] = 1;
    }

    // Composantes connexes -> quad candidat par enveloppe convexe
    const seen = new Uint8Array(w * h);
    const totalArea = w * h;
    let best = null, bestArea = 0;
    for (let i = 0; i < dil.length; i++) {
        if (!dil[i] || seen[i]) continue;
        const pts = [];
        const st = [i]; seen[i] = 1;
        let minX = w, maxX = 0, minY = h, maxY = 0;
        while (st.length) {
            const c = st.pop();
            const cy = (c / w) | 0, cx = c % w;
            pts.push([cx, cy]);
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const ny = cy + dy, nx2 = cx + dx;
                if (ny < 0 || ny >= h || nx2 < 0 || nx2 >= w) continue;
                const n = ny * w + nx2;
                if (dil[n] && !seen[n]) { seen[n] = 1; st.push(n); }
            }
        }
        const bboxArea = (maxX - minX) * (maxY - minY);
        if (bboxArea < totalArea * 0.2) continue;

        const hull = convexHull(pts);
        if (hull.length < 4) continue;
        const quad = hullToQuad(hull);
        if (!quad) continue;
        const qa = polygonArea(quad);
        if (qa < totalArea * 0.2) continue;
        // Le quad doit remplir raisonnablement sa propre bbox (rejette les "L")
        if (qa < bboxArea * 0.5) continue;
        if (qa > bestArea) { bestArea = qa; best = quad; }
    }
    return best;
}

function gaussianBlur5(src, w, h) {
    // Noyau séparable [1,4,6,4,1]/16
    const k = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0;
            for (let j = -2; j <= 2; j++) {
                const xx = Math.min(w - 1, Math.max(0, x + j));
                s += src[y * w + xx] * k[j + 2];
            }
            tmp[y * w + x] = s;
        }
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0;
            for (let j = -2; j <= 2; j++) {
                const yy = Math.min(h - 1, Math.max(0, y + j));
                s += tmp[yy * w + x] * k[j + 2];
            }
            out[y * w + x] = s;
        }
    }
    return out;
}

// Enveloppe convexe (monotone chain) — points [[x,y],...]
function convexHull(points) {
    if (points.length < 3) return points.slice();
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
}

// Réduire l'enveloppe à 4 sommets: on retire itérativement le sommet
// dont la suppression modifie le moins l'aire (décimation)
function hullToQuad(hull) {
    let poly = hull.slice();
    while (poly.length > 4) {
        let minLoss = Infinity, minIdx = -1;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[(i - 1 + poly.length) % poly.length];
            const b = poly[i];
            const c = poly[(i + 1) % poly.length];
            const loss = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
            if (loss < minLoss) { minLoss = loss; minIdx = i; }
        }
        poly.splice(minIdx, 1);
    }
    return poly.length === 4 ? poly : null;
}

function polygonArea(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
}

// Ordonner TL, TR, BR, BL
function orderQuad(quad) {
    const pts = quad.map(p => (p.x !== undefined ? p : { x: p[0], y: p[1] }));
    const tl = pts.reduce((m, p) => (p.x + p.y < m.x + m.y ? p : m));
    const br = pts.reduce((m, p) => (p.x + p.y > m.x + m.y ? p : m));
    const tr = pts.reduce((m, p) => (p.x - p.y > m.x - m.y ? p : m));
    const bl = pts.reduce((m, p) => (p.x - p.y < m.x - m.y ? p : m));
    return [tl, tr, br, bl];
}

// ---------- Homographie + redressement ----------
// Résout H (dst -> src) à partir de 4 correspondances — système 8x8 (Gauss)
function computeHomography(srcPts, dstPts) {
    // On veut mapper chaque point de DESTINATION vers la SOURCE
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
        const { x: X, y: Y } = dstPts[i];   // destination (rectangle)
        const { x: u, y: v } = srcPts[i];   // source (quad photo)
        A.push([X, Y, 1, 0, 0, 0, -X * u, -Y * u]); B.push(u);
        A.push([0, 0, 0, X, Y, 1, -X * v, -Y * v]); B.push(v);
    }
    // Élimination de Gauss avec pivot partiel
    for (let c = 0; c < 8; c++) {
        let piv = c;
        for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
        if (Math.abs(A[piv][c]) < 1e-12) throw new Error('Quadrilatère dégénéré');
        [A[c], A[piv]] = [A[piv], A[c]];
        [B[c], B[piv]] = [B[piv], B[c]];
        for (let r = c + 1; r < 8; r++) {
            const f = A[r][c] / A[c][c];
            for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
            B[r] -= f * B[c];
        }
    }
    const hh = new Array(8);
    for (let r = 7; r >= 0; r--) {
        let s = B[r];
        for (let k = r + 1; k < 8; k++) s -= A[r][k] * hh[k];
        hh[r] = s / A[r][r];
    }
    return [hh[0], hh[1], hh[2], hh[3], hh[4], hh[5], hh[6], hh[7], 1];
}

function warpDocument(srcCanvas, quadNorm) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    let quad = quadNorm.map(p => ({ x: p.x * sw, y: p.y * sh }));
    // Rétrécir légèrement vers le centre pour ne pas inclure le bord/fond
    const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
    const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
    const shrink = 0.012;
    quad = quad.map(p => ({ x: p.x + (cx - p.x) * shrink, y: p.y + (cy - p.y) * shrink }));
    const [tl, tr, br, bl] = quad;

    // Dimensions réelles estimées (moyenne des côtés opposés)
    const topLen = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const botLen = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftLen = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightLen = Math.hypot(br.x - tr.x, br.y - tr.y);
    let outW = Math.round((topLen + botLen) / 2);
    let outH = Math.round((leftLen + rightLen) / 2);

    // Snap sur le ratio A4 si proche (±8 %)
    const A4 = 297 / 210;
    const ratio = outH / outW;
    if (Math.abs(ratio - A4) / A4 < 0.08) outH = Math.round(outW * A4);
    else if (Math.abs(1 / ratio - A4) / A4 < 0.08) outW = Math.round(outH * A4);

    // Plafonner la sortie
    const cap = 2400;
    const cs = Math.min(1, cap / Math.max(outW, outH));
    outW = Math.max(8, Math.round(outW * cs));
    outH = Math.max(8, Math.round(outH * cs));

    const H = computeHomography(quad, [
        { x: 0, y: 0 }, { x: outW - 1, y: 0 },
        { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }
    ]);

    const sctx = srcCanvas.getContext('2d');
    const sdata = sctx.getImageData(0, 0, sw, sh).data;
    const out = new ImageData(outW, outH);
    const odata = out.data;

    for (let y = 0; y < outH; y++) {
        const Hy1 = H[1] * y + H[2], Hy4 = H[4] * y + H[5], Hy7 = H[7] * y + 1;
        for (let x = 0; x < outW; x++) {
            const d = H[6] * x + Hy7;
            const u = (H[0] * x + Hy1) / d;
            const v = (H[3] * x + Hy4) / d;
            const oi = (y * outW + x) * 4;
            if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) {
                odata[oi] = odata[oi + 1] = odata[oi + 2] = 255; odata[oi + 3] = 255;
                continue;
            }
            // Interpolation bilinéaire
            const x0 = u | 0, y0 = v | 0;
            const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
            const fx = u - x0, fy = v - y0;
            const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
            const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
            for (let c = 0; c < 3; c++) {
                const top = sdata[i00 + c] * (1 - fx) + sdata[i10 + c] * fx;
                const bot = sdata[i01 + c] * (1 - fx) + sdata[i11 + c] * fx;
                odata[oi + c] = top * (1 - fy) + bot * fy;
            }
            odata[oi + 3] = 255;
        }
    }

    const outCv = document.createElement('canvas');
    outCv.width = outW; outCv.height = outH;
    outCv.getContext('2d').putImageData(out, 0, 0);
    return outCv;
}

// ---------- Filtres "qualité scanner" ----------
// Estimation du fond (illumination) : réduction forte + filtre max + flou,
// puis remise à l'échelle. Divise l'image par ce fond => ombres éliminées.
function estimateBackground(canvas) {
    const w = canvas.width, h = canvas.height;
    const smallW = 48, smallH = Math.max(8, Math.round(smallW * h / w));
    const sm = document.createElement('canvas');
    sm.width = smallW; sm.height = smallH;
    const smctx = sm.getContext('2d');
    smctx.drawImage(canvas, 0, 0, smallW, smallH);
    const sd = smctx.getImageData(0, 0, smallW, smallH);
    const px = sd.data;

    // Filtre max 5x5 par canal, appliqué deux fois : le fond est l'enveloppe
    // claire — les ombres ET le texte disparaissent de l'estimation, les
    // reflets y restent et seront donc normalisés eux aussi par la division
    let cur = px;
    for (let pass = 0; pass < 2; pass++) {
        const maxed = new Uint8ClampedArray(cur.length);
        for (let y = 0; y < smallH; y++) {
            for (let x = 0; x < smallW; x++) {
                let mr = 0, mg = 0, mb = 0;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    const yy = Math.min(smallH - 1, Math.max(0, y + dy));
                    const xx = Math.min(smallW - 1, Math.max(0, x + dx));
                    const i = (yy * smallW + xx) * 4;
                    if (cur[i] > mr) mr = cur[i];
                    if (cur[i + 1] > mg) mg = cur[i + 1];
                    if (cur[i + 2] > mb) mb = cur[i + 2];
                }
                const o = (y * smallW + x) * 4;
                maxed[o] = mr; maxed[o + 1] = mg; maxed[o + 2] = mb; maxed[o + 3] = 255;
            }
        }
        cur = maxed;
    }
    sd.data.set(cur);
    smctx.putImageData(sd, 0, 0);

    // Remise à l'échelle avec lissage bilinéaire natif = flou du fond
    const bg = document.createElement('canvas');
    bg.width = w; bg.height = h;
    const bgctx = bg.getContext('2d');
    bgctx.imageSmoothingEnabled = true;
    bgctx.imageSmoothingQuality = 'high';
    bgctx.drawImage(sm, 0, 0, w, h);
    return bgctx.getImageData(0, 0, w, h).data;
}

// Mode COULEUR: division par le fond estimé => ombres et reflets éliminés,
// fond blanc, encre préservée ; puis contraste + accentuation du texte
function enhanceColor(canvas) {
    const w = canvas.width, h = canvas.height;
    const img = canvas.getContext('2d').getImageData(0, 0, w, h);
    const d = img.data;
    const n = w * h;
    const bg = estimateBackground(canvas);
    for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const b = Math.max(1, bg[i + c]);
            let v = d[i + c] / b * 252;
            // Courbe de contraste (assombrit l'encre, blanchit le papier)
            v = (v - 140) * 1.22 + 148;
            d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
    }
    // Accentuation (unsharp mask sur la luminance)
    const gray = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
        gray[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    }
    const blurred = gaussianBlur5(gray, w, h);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
        const boost = 0.55 * (gray[i] - blurred[i]);
        for (let c = 0; c < 3; c++) {
            const v = d[j + c] + boost;
            d[j + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
    }
    return img;
}

// Mode NOIR & BLANC: netteté + binarisation adaptative de Sauvola
// via images intégrales (O(n), fenêtre locale => élimine les ombres)
function enhanceBW(canvas) {
    const w = canvas.width, h = canvas.height;
    const img = canvas.getContext('2d').getImageData(0, 0, w, h);
    const d = img.data;
    const n = w * h;

    // Niveaux de gris
    let gray = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
        gray[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    }

    // Accentuation (unsharp mask léger) avant seuillage
    const blurred = gaussianBlur5(gray, w, h);
    for (let i = 0; i < n; i++) {
        const v = gray[i] + 0.7 * (gray[i] - blurred[i]);
        gray[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }

    // Images intégrales (somme et somme des carrés)
    const W = w + 1;
    const sat = new Float64Array(W * (h + 1));
    const sat2 = new Float64Array(W * (h + 1));
    for (let y = 1; y <= h; y++) {
        let rowSum = 0, rowSum2 = 0;
        for (let x = 1; x <= w; x++) {
            const g = gray[(y - 1) * w + (x - 1)];
            rowSum += g; rowSum2 += g * g;
            sat[y * W + x] = sat[(y - 1) * W + x] + rowSum;
            sat2[y * W + x] = sat2[(y - 1) * W + x] + rowSum2;
        }
    }

    // Sauvola: T = m * (1 + k*((s/R) - 1))
    const win = Math.max(15, (Math.round(Math.max(w, h) / 55) | 1));
    const half = win >> 1;
    const k = 0.22, R = 128;
    const bin = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
            const area = (x1 - x0 + 1) * (y1 - y0 + 1);
            const sum = sat[(y1 + 1) * W + (x1 + 1)] - sat[(y0) * W + (x1 + 1)]
                      - sat[(y1 + 1) * W + (x0)] + sat[(y0) * W + (x0)];
            const sum2 = sat2[(y1 + 1) * W + (x1 + 1)] - sat2[(y0) * W + (x1 + 1)]
                       - sat2[(y1 + 1) * W + (x0)] + sat2[(y0) * W + (x0)];
            const mean = sum / area;
            const variance = Math.max(0, sum2 / area - mean * mean);
            const T = mean * (1 + k * (Math.sqrt(variance) / R - 1));
            bin[y * w + x] = gray[y * w + x] > T ? 1 : 0;
        }
    }

    // Despeckle : un pixel noir sans voisin noir = bruit (poussière, grain)
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (bin[i]) continue;
            const blackNeighbors =
                (1 - bin[i - 1]) + (1 - bin[i + 1]) + (1 - bin[i - w]) + (1 - bin[i + w]) +
                (1 - bin[i - w - 1]) + (1 - bin[i - w + 1]) + (1 - bin[i + w - 1]) + (1 - bin[i + w + 1]);
            if (blackNeighbors <= 1) bin[i] = 1;
        }
    }

    for (let i = 0, j = 0; i < n; i++, j += 4) {
        const v = bin[i] ? 255 : 0;
        d[j] = d[j + 1] = d[j + 2] = v;
        d[j + 3] = 255;
    }
    return img;
}

// ---------- Multi-pages ----------
function scanRefreshPagesStrip() {
    const strip = document.getElementById('scan-pages-strip');
    const thumbs = document.getElementById('scan-pages-thumbs');
    const count = document.getElementById('scan-pages-count');
    if (!strip || !thumbs) return;
    thumbs.innerHTML = '';
    if (!scanState.pages.length) { strip.style.display = 'none'; return; }
    strip.style.display = 'block';
    if (count) count.textContent = scanState.pages.length;
    scanState.pages.forEach((pg, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'scan-page-thumb';
        const img = document.createElement('img');
        img.src = pg.thumb;
        img.alt = 'Page ' + (idx + 1);
        const num = document.createElement('span');
        num.className = 'scan-page-num';
        num.textContent = idx + 1;
        const del = document.createElement('button');
        del.className = 'scan-page-del';
        del.type = 'button';
        del.innerHTML = '&#10005;';
        del.title = 'Supprimer cette page';
        del.addEventListener('click', () => {
            scanState.pages.splice(idx, 1);
            scanRefreshPagesStrip();
        });
        wrap.appendChild(img);
        wrap.appendChild(num);
        wrap.appendChild(del);
        thumbs.appendChild(wrap);
    });
}

function scanSnapshotCurrentPage() {
    const c = document.createElement('canvas');
    c.width = scanResultCanvas.width;
    c.height = scanResultCanvas.height;
    c.getContext('2d').drawImage(scanResultCanvas, 0, 0);
    // Vignette (économise la mémoire d'affichage)
    const t = document.createElement('canvas');
    const th = 120, tw = Math.round(th * c.width / c.height);
    t.width = tw; t.height = th;
    t.getContext('2d').drawImage(c, 0, 0, tw, th);
    return { canvas: c, mode: scanState.mode, thumb: t.toDataURL('image/jpeg', 0.7) };
}

const scanAddPageBtn = document.getElementById('scan-add-page-btn');
if (scanAddPageBtn) {
    scanAddPageBtn.addEventListener('click', () => {
        if (!scanResultCanvas || !scanResultCanvas.width) return;
        scanState.pages.push(scanSnapshotCurrentPage());
        scanRefreshPagesStrip();
        scanShowStep('capture');
    });
}

// Toutes les pages du document : pages validées + celle affichée le cas échéant
function scanCollectPages() {
    const all = scanState.pages.slice();
    const resultVisible = scanResultStep && scanResultStep.style.display !== 'none';
    if (resultVisible && scanResultCanvas && scanResultCanvas.width) {
        all.push(scanSnapshotCurrentPage());
    }
    return all;
}

async function scanBuildPdfBytes(pages) {
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    const scalePt = 72 / 200; // ~200 DPI
    for (const pg of pages) {
        const c = pg.canvas;
        let image;
        if (pg.mode === 'bw') {
            const bytes = await fetch(c.toDataURL('image/png')).then(r => r.arrayBuffer());
            image = await pdfDoc.embedPng(bytes);
        } else {
            const bytes = await fetch(c.toDataURL('image/jpeg', 0.92)).then(r => r.arrayBuffer());
            image = await pdfDoc.embedJpg(bytes);
        }
        const pw = c.width * scalePt, ph = c.height * scalePt;
        const page = pdfDoc.addPage([pw, ph]);
        page.drawImage(image, { x: 0, y: 0, width: pw, height: ph });
    }
    return pdfDoc.save();
}

function scanResetAll() {
    scanState.pages = [];
    scanState.warped = null;
    scanRefreshPagesStrip();
    scanShowStep('capture');
}

// ---------- Sortie ----------
const scanUseBtn = document.getElementById('scan-use-btn');
if (scanUseBtn) {
    scanUseBtn.addEventListener('click', async () => {
        const pages = scanCollectPages();
        if (!pages.length) return;
        try {
            showLoader();
            let file;
            if (pages.length === 1) {
                const blob = await new Promise(res => pages[0].canvas.toBlob(res, 'image/png'));
                file = new File([blob], `scan_${Date.now()}.png`, { type: 'image/png' });
            } else {
                const bytes = await scanBuildPdfBytes(pages);
                file = new File([new Blob([bytes], { type: 'application/pdf' })], `scan_${Date.now()}.pdf`, { type: 'application/pdf' });
            }
            scanResetAll();
            setView('signature');
            await handleFileUpload({ target: { files: [file] } });
        } catch (err) {
            console.error('Scanner -> document:', err);
            alert('Erreur: ' + err.message);
        } finally {
            hideLoader();
        }
    });
}

const scanPdfBtn = document.getElementById('scan-pdf-btn');
if (scanPdfBtn) {
    scanPdfBtn.addEventListener('click', async () => {
        const pages = scanCollectPages();
        if (!pages.length) return;
        // Choix du nom du fichier avant l'enregistrement
        const name = prompt('Nom du fichier PDF:', 'document_scanne');
        if (name === null) return;
        const clean = (name.trim() || 'document_scanne');
        const fileName = clean.endsWith('.pdf') ? clean : clean + '.pdf';
        try {
            showLoader();
            const bytes = await scanBuildPdfBytes(pages);
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Scanner export PDF:', err);
            alert('Erreur lors de la génération du PDF: ' + err.message);
        } finally {
            hideLoader();
        }
    });
}
