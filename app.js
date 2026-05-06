// Application de Signature de Documents
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
    signaturePageMode: 'current', // 'current', 'all', 'custom'
    signatureCustomPages: [],     // pages selectionees en mode custom
    paraphePosition: { x: 50, y: 50 },
    paraphePage: 1,
    signatureHistory: [],  // historique pour undo signature
    parapheHistory: [],    // historique pour undo paraphe
    previewVisible: false,
    // Outils par cible: 'pen' | 'highlighter' | 'eraser'
    signatureTool: 'pen',
    parapheTool: 'pen'
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
const emailBtn = document.getElementById('email-btn');
const emailForm = document.getElementById('email-form');
const sendEmailBtn = document.getElementById('send-email-btn');
const cancelEmailBtn = document.getElementById('cancel-email-btn');

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
// LOCK / UNLOCK SCROLL CORPS (fix iOS scroll-to-top)
// ==============================================
let _savedScrollY = 0;

function lockBodyScroll() {
    _savedScrollY = window.scrollY;
    document.body.style.top = `-${_savedScrollY}px`;
    document.body.classList.add('drawing-active');
}

function unlockBodyScroll() {
    document.body.classList.remove('drawing-active');
    document.body.style.top = '';
    window.scrollTo(0, _savedScrollY);
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

dropZone.addEventListener('click', () => fileInput.click());

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

        // Vider le contenu precedent (garder les overlays)
        const children = Array.from(documentPreview.children);
        children.forEach(child => {
            if (child.id !== 'signature-overlay' && child.id !== 'paraphe-overlay') {
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

        // Afficher les sections
        signatureSection.style.display = 'block';
        parapheSection.style.display = 'block';
        actionsSection.style.display = 'block';

        const sizeControl = document.getElementById('signature-size-control');
        if (sizeControl) sizeControl.style.display = 'block';

        // Afficher toolbar
        const toolbar = document.getElementById('doc-toolbar');
        if (toolbar) toolbar.style.display = 'flex';

        // Afficher page selector si multi-pages
        updatePageSelector();

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
        state.signaturePageMode = 'current';
        state.signatureCustomPages = [];

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

        // Vider le preview
        const children = Array.from(documentPreview.children);
        children.forEach(child => {
            if (child.id !== 'signature-overlay' && child.id !== 'paraphe-overlay') {
                child.remove();
            }
        });

        // Masquer les controls
        const sizeControl = document.getElementById('signature-size-control');
        const toolbar = document.getElementById('doc-toolbar');
        const pageSelector = document.getElementById('page-selector-panel');
        if (sizeControl) sizeControl.style.display = 'none';
        if (toolbar) toolbar.style.display = 'none';
        if (pageSelector) pageSelector.style.display = 'none';

        // Remettre la zone d'upload visible
        dropZone.style.display = '';
        fileInput.value = '';
        fileInfo.textContent = 'PDF ou Image (JPG, PNG)';

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
        if (child.id !== 'signature-overlay' && child.id !== 'paraphe-overlay') {
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
    lockBodyScroll();
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
    unlockBodyScroll();
    state.isDrawing = false;
    state.signatureData = signatureCanvas.toDataURL();
    saveToCache();
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

async function stopDrawing() {
    if (state.isDrawing) {
        state.isDrawing = false;
        state.signatureData = signatureCanvas.toDataURL();
        await saveSignatureToDatabase();
        saveToCache();
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
                saveToCache();
            };
            img.src = lastState;
        } else {
            ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
            state.signatureData = null;
            const overlay = document.getElementById('signature-overlay');
            if (overlay) overlay.style.display = 'none';
            saveToCache();
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
    saveToCache();
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
            signatureOverlay.style.display = 'block';
            updateSignaturePreviewPosition();
        };
        if (signaturePreview.complete) {
            signatureOverlay.style.display = 'block';
            updateSignaturePreviewPosition();
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
        lockBodyScroll();
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
        unlockBodyScroll();
        state.isDrawingParaphe = false;
        state.parapheData = parapheCanvas.toDataURL();
        saveToCache();
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
        saveToCache();
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
                saveToCache();
            };
            img.src = lastState;
        } else {
            ctxParaphe.clearRect(0, 0, parapheCanvas.width, parapheCanvas.height);
            state.parapheData = null;
            const overlay = document.getElementById('paraphe-overlay');
            if (overlay) overlay.style.display = 'none';
            removeParapheClones();
            saveToCache();
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
        saveToCache();
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
            parapheOverlay.style.display = 'block';
            updateParaphePreviewPosition();
            createParapheClones();
        };
        if (paraphePreview.complete) {
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
        clone.style.opacity = '0.8';
        clone.style.border = '2px dashed #764ba2';
        clone.style.borderRadius = '5px';
        clone.style.padding = '5px';
        clone.style.background = 'rgba(255, 255, 255, 0.9)';
        clone.style.boxShadow = '0 4px 12px rgba(118, 75, 162, 0.3)';

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
        }
    }, { passive: false });
}

document.addEventListener('mousemove', dragParaphe);
document.addEventListener('mouseup', stopDragParaphe);

document.addEventListener('touchmove', (e) => {
    if (isDraggingParaphe && e.touches.length === 1) {
        e.preventDefault();
        dragParaphe({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
});

document.addEventListener('touchend', stopDragParaphe);

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
    });
}

signaturePreview.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', stopDrag);

signaturePreview.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        e.preventDefault();
        startDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
        e.preventDefault();
        drag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
});

document.addEventListener('touchend', stopDrag);

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
        updateCurrentPageDisplay();
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

// ==============================================
// PAGE SELECTOR
// ==============================================
function updatePageSelector() {
    const panel = document.getElementById('page-selector-panel');
    if (!panel) return;

    if (state.totalPages > 1) {
        panel.style.display = 'block';
        buildCustomPageCheckboxes();
    } else {
        panel.style.display = 'none';
    }
}

function buildCustomPageCheckboxes() {
    const container = document.getElementById('custom-pages-container');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= state.totalPages; i++) {
        const label = document.createElement('label');
        label.className = 'page-checkbox';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = i;
        checkbox.dataset.pageNum = i;
        // Par defaut cocher la page actuelle
        if (i === state.signaturePage) {
            checkbox.checked = true;
            label.classList.add('checked');
        }

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                label.classList.add('checked');
            } else {
                label.classList.remove('checked');
            }
            updateCustomPagesState();
        });

        const span = document.createElement('span');
        span.textContent = `Page ${i}`;

        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
    }

    updateCustomPagesState();
}

function updateCustomPagesState() {
    const container = document.getElementById('custom-pages-container');
    if (!container) return;
    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    state.signatureCustomPages = Array.from(checked).map(cb => parseInt(cb.value));
}

function updateCurrentPageDisplay() {
    const display = document.getElementById('current-page-display');
    if (display) {
        display.textContent = state.signaturePage;
    }
}

// Event listeners pour les radio buttons du page selector
document.querySelectorAll('input[name="sig-page-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        state.signaturePageMode = e.target.value;
        const customContainer = document.getElementById('custom-pages-container');
        if (customContainer) {
            customContainer.style.display = e.target.value === 'custom' ? 'flex' : 'none';
        }
    });
});

// Obtenir les pages cibles pour la signature
function getSignatureTargetPages() {
    switch (state.signaturePageMode) {
        case 'all':
            return Array.from({ length: state.totalPages }, (_, i) => i + 1);
        case 'custom':
            return state.signatureCustomPages.length > 0
                ? state.signatureCustomPages
                : [state.signaturePage];
        case 'current':
        default:
            return [state.signaturePage];
    }
}

// ==============================================
// SAUVEGARDE AUTOMATIQUE (Supabase)
// ==============================================
async function saveSignatureToDatabase() {
    if (!state.signatureData) return;
    try {
        localStorage.setItem('lastSignature', state.signatureData);
        if (typeof saveSignatureTemplate === 'function') {
            await saveSignatureTemplate('Signature', state.signatureData);
        }
    } catch (error) {
        console.warn('Erreur sauvegarde signature:', error);
    }
}

// ==============================================
// CACHE LOCALSTORAGE (signature + paraphe + prefs)
// ==============================================
function saveToCache() {
    try {
        if (state.signatureData) {
            localStorage.setItem('cachedSignature', state.signatureData);
        } else {
            localStorage.removeItem('cachedSignature');
        }
        if (state.parapheData) {
            localStorage.setItem('cachedParaphe', state.parapheData);
        } else {
            localStorage.removeItem('cachedParaphe');
        }
        // Sauvegarder les preferences
        localStorage.setItem('signaturePrefs', JSON.stringify({
            signatureColor: colorInput.value,
            signatureWidth: widthInput.value,
            parapheColor: parapheColorInput ? parapheColorInput.value : '#000000',
            parapheWidth: parapheWidthInput ? parapheWidthInput.value : '2',
            signatureSize: currentSignatureWidth,
            parapheSize: currentParapheSize
        }));
    } catch (error) {
        console.warn('Erreur sauvegarde cache:', error);
    }
}

function loadFromCache() {
    try {
        // Charger la signature
        const cachedSig = localStorage.getItem('cachedSignature') || localStorage.getItem('lastSignature');
        if (cachedSig) {
            state.signatureData = cachedSig;
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
                ctx.drawImage(img, 0, 0, signatureCanvas.width, signatureCanvas.height);
            };
            img.src = cachedSig;

            // Afficher le badge
            const badge = document.getElementById('cached-signature-badge');
            if (badge) badge.style.display = 'inline-block';
        }

        // Charger le paraphe
        const cachedParaphe = localStorage.getItem('cachedParaphe');
        if (cachedParaphe && ctxParaphe) {
            state.parapheData = cachedParaphe;
            const img = new Image();
            img.onload = () => {
                ctxParaphe.clearRect(0, 0, parapheCanvas.width, parapheCanvas.height);
                ctxParaphe.drawImage(img, 0, 0, parapheCanvas.width, parapheCanvas.height);
            };
            img.src = cachedParaphe;
        }

        // Charger les preferences
        const prefsStr = localStorage.getItem('signaturePrefs');
        if (prefsStr) {
            const prefs = JSON.parse(prefsStr);
            if (prefs.signatureColor) colorInput.value = prefs.signatureColor;
            if (prefs.signatureWidth) widthInput.value = prefs.signatureWidth;
            if (prefs.parapheColor && parapheColorInput) parapheColorInput.value = prefs.parapheColor;
            if (prefs.parapheWidth && parapheWidthInput) parapheWidthInput.value = prefs.parapheWidth;
            if (prefs.signatureSize) {
                currentSignatureWidth = prefs.signatureSize;
                if (signatureSizeSlider) signatureSizeSlider.value = currentSignatureWidth;
                if (sizeValueDisplay) sizeValueDisplay.textContent = `${currentSignatureWidth}px`;
            }
            if (prefs.parapheSize) {
                currentParapheSize = prefs.parapheSize;
                if (parapheSizeSlider) parapheSizeSlider.value = currentParapheSize;
                if (parapheSizeValue) parapheSizeValue.textContent = `${currentParapheSize}px`;
            }
        }

        console.log('Cache charge:', cachedSig ? 'signature' : '-', cachedParaphe ? 'paraphe' : '-');
    } catch (error) {
        console.warn('Erreur chargement cache:', error);
    }
}

// ==============================================
// GENERATION DU PDF SIGNE
// ==============================================
downloadBtn.addEventListener('click', generateAndDownloadPDF);

async function generateAndDownloadPDF() {
    if (!state.signatureData) {
        alert('Veuillez creer une signature d\'abord!');
        return;
    }

    const fileName = prompt('Nom du fichier PDF:', 'document_signe');
    if (fileName === null) return;

    const cleanFileName = fileName.trim() || 'document_signe';
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

    const pages = pdfDoc.getPages();

    // Embed signature
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

    return await pdfDoc.save();
}

// ==============================================
// EMAIL
// ==============================================
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
        statusDiv.textContent = 'Veuillez creer une signature d\'abord';
        statusDiv.className = 'status-message error';
        return;
    }

    try {
        statusDiv.textContent = 'Envoi en cours...';
        statusDiv.className = 'status-message';

        const pdfBytes = await createSignedPDF();
        const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));

        const apiUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3000/send-email'
            : '/api/send-email';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: recipientEmail,
                subject: subject,
                message: message,
                pdfData: pdfBase64
            })
        });

        const result = await response.json();

        if (result.success) {
            statusDiv.textContent = 'Email envoye avec succes!';
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
        console.error('Erreur envoi email:', error);
        statusDiv.textContent = 'Erreur lors de l\'envoi. Verifiez que le serveur est demarre.';
        statusDiv.className = 'status-message error';
    }
});

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
        if (annotToolbar) annotToolbar.style.display = 'flex';
        if (toggleAnnotBtn) {
            toggleAnnotBtn.style.background = 'rgba(255,214,10,.35)';
            toggleAnnotBtn.style.borderColor = '#FFD60A';
            toggleAnnotBtn.style.color = '#7a5f00';
        }
    } else {
        documentPreview.classList.remove('annotation-mode');
        documentPreview.classList.remove('erase-mode');
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
if (annotOpacityInput) {
    annotOpacityInput.addEventListener('input', () => { annotOpacity = parseInt(annotOpacityInput.value) / 100; });
}

if (annotClearBtn) {
    annotClearBtn.addEventListener('click', () => {
        document.querySelectorAll('.annotation-canvas').forEach(c => {
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
        });
    });
}

function getAnnotCanvasForEvent(e) {
    const touch = e.touches ? e.touches[0] : e;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return null;
    // chercher le canvas annotation le plus proche
    const pageContainer = el.closest('.pdf-page-container') || documentPreview.querySelector('.pdf-page-container');
    if (!pageContainer) return null;
    return pageContainer.querySelector('.annotation-canvas');
}

function annotDraw(annotCtx, fromX, fromY, toX, toY) {
    if (annotationEraseMode) {
        annotCtx.save();
        annotCtx.globalCompositeOperation = 'destination-out';
        annotCtx.lineWidth = annotSize * 2;
        annotCtx.lineCap = 'round'; annotCtx.lineJoin = 'round';
        annotCtx.globalAlpha = 1;
        annotCtx.beginPath();
        annotCtx.moveTo(fromX, fromY);
        annotCtx.lineTo(toX, toY);
        annotCtx.stroke();
        annotCtx.restore();
    } else {
        annotCtx.save();
        annotCtx.globalCompositeOperation = 'source-over';
        annotCtx.globalAlpha = annotOpacity;
        annotCtx.strokeStyle = annotColor;
        annotCtx.lineWidth = annotSize;
        annotCtx.lineCap = 'square'; annotCtx.lineJoin = 'miter';
        annotCtx.beginPath();
        annotCtx.moveTo(fromX, fromY);
        annotCtx.lineTo(toX, toY);
        annotCtx.stroke();
        annotCtx.restore();
    }
}

let currentAnnotCanvas = null;

documentPreview.addEventListener('mousedown', (e) => {
    if (!annotationMode) return;
    currentAnnotCanvas = e.target.closest('.pdf-page-container')?.querySelector('.annotation-canvas')
        || documentPreview.querySelector('.annotation-canvas');
    if (!currentAnnotCanvas) return;
    isAnnotating = true;
    const rect = currentAnnotCanvas.getBoundingClientRect();
    const scaleX = currentAnnotCanvas.width / rect.width;
    const scaleY = currentAnnotCanvas.height / rect.height;
    annotLastX = (e.clientX - rect.left) * scaleX;
    annotLastY = (e.clientY - rect.top) * scaleY;
    e.preventDefault();
});

documentPreview.addEventListener('mousemove', (e) => {
    if (!annotationMode || !isAnnotating || !currentAnnotCanvas) return;
    const rect = currentAnnotCanvas.getBoundingClientRect();
    const scaleX = currentAnnotCanvas.width / rect.width;
    const scaleY = currentAnnotCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    annotDraw(currentAnnotCanvas.getContext('2d'), annotLastX, annotLastY, x, y);
    annotLastX = x; annotLastY = y;
    e.preventDefault();
});

document.addEventListener('mouseup', () => { isAnnotating = false; currentAnnotCanvas = null; });

documentPreview.addEventListener('touchstart', (e) => {
    if (!annotationMode) return;
    if (e.touches.length === 2) {
        // 2 fingers: prepare for manual scroll
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
    const scaleX = currentAnnotCanvas.width / rect.width;
    const scaleY = currentAnnotCanvas.height / rect.height;
    annotLastX = (touch.clientX - rect.left) * scaleX;
    annotLastY = (touch.clientY - rect.top) * scaleY;
    e.preventDefault();
}, { passive: false });

documentPreview.addEventListener('touchmove', (e) => {
    if (!annotationMode) return;
    if (e.touches.length === 2) {
        // 2 fingers: scroll the page
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        if (twoFingerLastY !== null) {
            window.scrollBy(0, twoFingerLastY - centerY);
        }
        twoFingerLastY = centerY;
        e.preventDefault();
        return;
    }
    if (!isAnnotating || !currentAnnotCanvas || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = currentAnnotCanvas.getBoundingClientRect();
    const scaleX = currentAnnotCanvas.width / rect.width;
    const scaleY = currentAnnotCanvas.height / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;
    annotDraw(currentAnnotCanvas.getContext('2d'), annotLastX, annotLastY, x, y);
    annotLastX = x; annotLastY = y;
    e.preventDefault();
}, { passive: false });

documentPreview.addEventListener('touchend', () => {
    isAnnotating = false;
    currentAnnotCanvas = null;
    twoFingerLastY = null;
});

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
    loadFromCache();
    updateCanvasCursor(signatureCanvas, state.signatureTool);
    if (parapheCanvas) updateCanvasCursor(parapheCanvas, state.parapheTool);
});
