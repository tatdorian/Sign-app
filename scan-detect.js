// ==============================================
// SCANNER — DÉTECTION DU DOCUMENT (fonctions pures, sans DOM)
// Chargé deux fois : par la page (<script>) pour les photos importées, et
// comme Web Worker pour analyser le flux de la caméra en direct sans
// bloquer l'interface (le cadre bleu reste fluide).
// ==============================================

// Réglages de la détection, calibrés sur des photos réelles de documents
// (reçus froissés, feuilles sur parquet clair, bureaux encombrés…) et sur
// des scènes de synthèse
const SCAN_DETECT = {
    contrast: 6,         // écart min de luminosité de part et d'autre d'un bord
    inverted: 0.7,       // poids d'un bord inversé (feuille à l'ombre, plus sombre que le fond)
    minNormal: 0.6,      // part minimale de bords « normaux » sur le contour
    presence: 1.5,       // tolérance de position d'un bord le long de la normale (px)
    orientCos: 0.9,      // gradient ~perpendiculaire au côté (cosinus de l'écart max)
    edgeMin: 14,         // magnitude min d'un bord…
    edgeSigma: 4,        // … et en multiples de l'écart-type du bruit
    houghMin: 0.07,      // votes min d'une droite (fraction du petit côté)
    houghKeep: 48,       // droites conservées
    houghSpread: 6,      // demi-fenêtre de vote angulaire (degrés) : l'orientation
                         // d'un bord peu contrasté est bruitée de plusieurs degrés
    worstWeight: 0.5,    // poids du pire côté dans la preuve de bord
    overshoot: 0.4       // pénalité d'un bord prolongé au-delà d'un coin
};

// Niveaux de gris + gradients de Sobel BI-CANAUX : gris, et canal "papier"
// (clair ET peu saturé) qui révèle les bords que la seule luminance ne voit
// pas (feuille blanche sur fond coloré de luminosité proche). À chaque pixel
// on garde le canal au gradient le plus fort.
function computeEdgeMaps(data, w, h, blurPasses) {
    let gray = new Float32Array(w * h);
    let paperCh = new Float32Array(w * h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
        const r = data[j], g = data[j + 1], b = data[j + 2];
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        paperCh[i] = 0.55 * gray[i] + 0.45 * (255 - sat);
    }
    for (let p = 0; p < blurPasses; p++) {
        gray = gaussianBlur5(gray, w, h);
        paperCh = gaussianBlur5(paperCh, w, h);
    }

    const mag = new Float32Array(w * h);
    const gxA = new Float32Array(w * h), gyA = new Float32Array(w * h);
    const dir = new Uint8Array(w * h); // 0:0°, 1:45°, 2:90°, 3:135°
    const T22 = 0.41421356, T67 = 2.41421356;   // tan 22,5° / tan 67,5°
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            let gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1]
                    + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
            let gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
                    + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
            let m = Math.hypot(gx, gy);
            const pgx = -paperCh[i - w - 1] - 2 * paperCh[i - 1] - paperCh[i + w - 1]
                       + paperCh[i - w + 1] + 2 * paperCh[i + 1] + paperCh[i + w + 1];
            const pgy = -paperCh[i - w - 1] - 2 * paperCh[i - w] - paperCh[i - w + 1]
                       + paperCh[i + w - 1] + 2 * paperCh[i + w] + paperCh[i + w + 1];
            const pm = Math.hypot(pgx, pgy) * 0.92;
            if (pm > m) { m = pm; gx = pgx; gy = pgy; }
            mag[i] = m; gxA[i] = gx; gyA[i] = gy;
            // Direction quantifiée (pour la suppression des non-maxima)
            const ax = Math.abs(gx), ay = Math.abs(gy);
            dir[i] = ay <= ax * T22 ? 0 : ay >= ax * T67 ? 2 : (gx > 0) === (gy > 0) ? 1 : 3;
        }
    }
    return { gray, paperCh, mag, gx: gxA, gy: gyA, dir };
}

// ---------- Détection automatique des coins ----------
// Pipeline : gris + canal papier -> gaussien -> Sobel -> non-maxima, puis
// trois générateurs de candidats (droites de Hough orientées, contours Canny,
// région claire d'Otsu) départagés par la PREUVE DE BORD : le long de chaque
// côté, un vrai bord de feuille est présent, orienté comme le côté, et
// l'intérieur (papier) y est plus clair que l'extérieur.
// Entrée : image RGBA déjà réduite (~300-420 px de côté).
// Sortie : { quad: 4 coins normalisés TL,TR,BR,BL, score, confidence,
//            partial, relaxed } ou null. confidence (0..1) = preuve de bord du
//            quad retenu : la capture automatique ne déclenche qu'au-dessus
//            d'un seuil, et jamais sur un document partiel (partial).
function detectQuadInRGBA(data, w, h) {
    try {
        const { gray, paperCh, mag, gx, gy, dir } = computeEdgeMaps(data, w, h, 2);

        // Suppression des non-maxima (comparaison EN TRAVERS du bord)
        const nms = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const m = mag[i];
                if (m === 0) continue;
                let a = 0, b = 0;
                switch (dir[i]) {
                    case 0: a = mag[i - 1]; b = mag[i + 1]; break;
                    case 1: a = mag[i - w - 1]; b = mag[i + w + 1]; break;
                    case 2: a = mag[i - w]; b = mag[i + w]; break;
                    default: a = mag[i - w + 1]; b = mag[i + w - 1];
                }
                if (m >= a && m >= b) nms[i] = m;
            }
        }

        // Porte anti-bruit : sur une photo en basse lumière le gradient est
        // partout non nul. Écart-type du bruit estimé sur le 10e percentile
        // des magnitudes (loi de Rayleigh : p10 ≈ 0,46 σ) — la médiane, elle,
        // serait faussée par un fond texturé (nappe à carreaux, bois veiné)
        // qui éteindrait alors les vrais bords. NMS éteint sous ~3 σ.
        const magSample = [];
        for (let i = 0; i < mag.length; i += 11) magSample.push(mag[i]);
        magSample.sort((a, b) => a - b);
        const sigma = magSample[Math.floor(magSample.length * 0.1)] / 0.46;
        if (sigma > 0.5) {
            const gate = sigma * 3;
            for (let i = 0; i < nms.length; i++) if (nms[i] < gate) nms[i] = 0;
        }

        const sample = [];
        for (let i = 0; i < nms.length; i += 7) if (nms[i] > 0) sample.push(nms[i]);
        sample.sort((a, b) => a - b);
        if (!sample.length) return null;

        // Seuil de "bord présent" : bas (un bord de feuille sur fond clair
        // est faible comparé au texte) mais au-dessus du bruit — la polarité
        // exigée en plus écarte les faux bords
        const edgeThr = Math.max(SCAN_DETECT.edgeMin, sigma * SCAN_DETECT.edgeSigma);
        const ctx = {
            gray, paperCh, nms, gx, gy, w, h, edgeThr,
            off: Math.max(2, Math.round(Math.min(w, h) * 0.015))
        };

        const candidates = [];
        // Stratégie 1 — droites de Hough orientées -> tous les quadrilatères
        // formés par 2 paires de droites, classés par preuve de bord rapide
        const lines = orientedHoughLines(ctx);
        for (const q of quadsFromLines(lines, ctx, 12)) candidates.push(q);

        // Stratégie 2 — Canny multi-seuils + enveloppe convexe (feuille
        // légèrement cornée ou bombée, où les bords ne sont pas droits)
        for (const pct of [0.85, 0.6, 0.35]) {
            const high = sample[Math.floor(sample.length * pct)];
            const q = quadFromNms(nms, w, h, high, high * 0.4);
            if (q) candidates.push(q);
        }

        // Stratégie 3 — segmentation d'Otsu sur DEUX canaux : le gris
        // (document = grande région claire) et le canal "papier"
        const otsuQuad = quadFromBrightRegion(gray, w, h);
        if (otsuQuad) candidates.push(otsuQuad);
        const paperQuad = quadFromBrightRegion(paperCh, w, h);
        if (paperQuad) candidates.push(paperQuad);

        // Sélection : angles plausibles + score composite
        let best = null, bestScore = 0, bestRelaxed = false;
        for (const q of candidates) {
            const score = scoreQuadCandidate(q, ctx, false);
            if (score > bestScore) { bestScore = score; best = q; }
        }
        // Repli assoupli : mieux vaut un candidat imparfait que la boîte
        // par défaut que l'utilisateur devra replacer entièrement (signalé
        // par `relaxed` : la capture automatique ne s'y fie pas)
        if (!best) {
            bestRelaxed = true;
            for (const q of candidates) {
                const score = scoreQuadCandidate(q, ctx, true);
                if (score > bestScore) { bestScore = score; best = q; }
            }
        }
        if (!best) return null;

        // Raffinement sub-pixel : chaque bord s'aimante sur la crête de
        // gradient locale, puis les coins sont recalculés par intersection.
        // Garde-fou : on ne garde le raffinement que s'il ne dégrade pas la
        // preuve de bord.
        const bestEv = quadEdgeEvidence(best, ctx);
        const refined = refineQuadEdges(best, { gx, gy }, w, h);
        const refinedEv = quadEdgeEvidence(refined, ctx);
        let confidence = bestEv;
        if (refinedEv >= bestEv - 0.02) { best = refined; confidence = refinedEv; }

        const partial = quadCornerOvershoot(best, ctx).partial;
        // Coins ramenés dans l'image (feuille coupée : coin sur le bord)
        return {
            quad: orderQuad(best.map(p => ({
                x: Math.min(w - 1, Math.max(0, p[0])) / w,
                y: Math.min(h - 1, Math.max(0, p[1])) / h
            }))),
            score: bestScore,
            confidence,
            // Bords prolongés au-delà d'un coin : document incomplet
            partial,
            relaxed: bestRelaxed
        };
    } catch (err) {
        console.warn('Détection coins:', err);
        return null;
    }
}

// Score composite d'un quad candidat : aire x preuve de bord x contraste
function scoreQuadCandidate(q, ctx, relaxed) {
    const { gray, w, h } = ctx;
    if (!quadAnglesOk(q, relaxed)) return 0;
    const areaRatio = polygonArea(q) / (w * h);
    // > 1 possible quand des coins sortent du cadre (feuille coupée)
    if (areaRatio < (relaxed ? 0.07 : 0.1) || areaRatio > 1.3) return 0;
    const evidence = quadEdgeEvidence(q, ctx);                 // 0..1
    if (!relaxed && evidence < 0.3) return 0;
    const contrast = quadInsideOutsideContrast(q, gray, w, h);   // 0..1
    const overshoot = quadCornerOvershoot(q, ctx).worst;        // 0..1
    // L'aire compte peu : c'est la preuve de bord qui départage (sinon un
    // quad débordant sur le fond jusqu'à une limite d'ombre l'emporterait)
    return Math.pow(Math.min(1, areaRatio), 0.35) * (0.1 + evidence)
         * (0.6 + 0.4 * contrast) * (1 - SCAN_DETECT.overshoot * overshoot);
}

// Bord de feuille au point (px,py), pour un côté de normale intérieure
// (nx,ny) : contraste net de part et d'autre (une fine ligne imprimée, avec du
// papier des deux côtés, est rejetée) et gradient présent à ±presence px,
// perpendiculaire au côté. Retour : 1 = bord « normal » (papier plus clair à
// l'intérieur), -1 = bord inversé (feuille à l'ombre sur un fond clair),
// 0 = pas de bord, null = hors de l'image.
function edgeSignAt(px, py, nx, ny, ctx) {
    const { gray, paperCh, nms, gx, gy, w, h, edgeThr, off } = ctx;
    const xi = Math.round(px + nx * off), yi = Math.round(py + ny * off);
    const xo = Math.round(px - nx * off), yo = Math.round(py - ny * off);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h || xo < 0 || yo < 0 || xo >= w || yo >= h) return null;
    const ii = yi * w + xi, io = yo * w + xo;
    const con = SCAN_DETECT.contrast, win = SCAN_DETECT.presence, cmin = SCAN_DETECT.orientCos;
    if (Math.abs(gray[ii] - gray[io]) <= con && Math.abs(paperCh[ii] - paperCh[io]) <= con) return 0;
    let found = 0;
    for (let d = -win; d <= win; d += 0.75) {
        const x = Math.round(px + nx * d), y = Math.round(py + ny * d);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const i = y * w + x;
        const m = nms[i];
        if (m < edgeThr) continue;
        const c = (gx[i] * nx + gy[i] * ny) / m;
        if (c >= cmin) return 1;
        if (c <= -cmin) found = -1;
    }
    return found;
}

// Preuve de bord d'un quad (0..1) : fraction des points de chaque côté qui
// sont de vrais bords de feuille. Un côté qui longe le bord de l'image (rien à
// vérifier : feuille coupée ou faux côté) est pénalisé, de même qu'un côté
// dont l'intérieur est bien plus sombre que celui des autres (limite d'ombre
// sur le fond prise pour un bord : l'intérieur n'y est pas du papier).
function quadEdgeEvidence(q, ctx) {
    const { gray, w, h, off } = ctx;
    let cx = 0, cy = 0;
    for (const p of q) { cx += p[0] / 4; cy += p[1] / 4; }
    const per = [], lum = [];
    let sumOk = 0, sumInv = 0;
    for (let e = 0; e < 4; e++) {
        const a = q[e], b = q[(e + 1) % 4];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 4) return 0;
        let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }   // vers l'intérieur
        const steps = Math.max(16, Math.round(len / 1.5));
        let ok = 0, inv = 0, tot = 0;
        const inside = [];
        for (let k = 0; k <= steps; k++) {
            const t = 0.05 + 0.9 * k / steps;
            const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
            const r = edgeSignAt(px, py, nx, ny, ctx);
            if (r === null) continue;
            tot++;
            if (r > 0) ok++; else if (r < 0) inv++;
            const xi = Math.round(px + nx * off * 2), yi = Math.round(py + ny * off * 2);
            if (xi >= 0 && yi >= 0 && xi < w && yi < h) inside.push(gray[yi * w + xi]);
        }
        if (tot >= (steps + 1) * 0.3) {
            per.push((ok + SCAN_DETECT.inverted * inv) / tot);
            sumOk += ok; sumInv += inv;
        } else {
            per.push(0.25);
        }
        inside.sort((x, y) => x - y);
        lum.push(inside.length ? inside[inside.length >> 1] : -1);
    }
    const maxLum = Math.max(...lum);
    for (let e = 0; e < 4; e++) {
        if (lum[e] >= 0 && maxLum > 0) per[e] *= Math.min(1, lum[e] / (0.7 * maxLum));
    }
    return edgeEvidenceAggregate(per) * normalShareFactor(sumOk, sumInv);
}

// Dépassement aux coins : sur un vrai coin de feuille, les deux bords
// s'arrêtent net. Si des bords se PROLONGENT au-delà des coins, la feuille
// continue : le quad n'est qu'une partie du document (ex. bas de page hors
// cadre et limite d'un paragraphe prise pour le bord inférieur).
// Retour : { worst: 0..1, partial } — partial quand les DEUX côtés voisins
// d'un même côté le dépassent (signature d'une feuille coupée) ; une ligne du
// fond alignée avec un côté (veine du bois, ombre) ne prolonge, elle, que ce
// côté-là, à ses deux bouts.
function quadCornerOvershoot(q, ctx) {
    let cx = 0, cy = 0;
    for (const p of q) { cx += p[0] / 4; cy += p[1] / 4; }
    let worst = 0;
    const overA = [0, 0, 0, 0], overB = [0, 0, 0, 0];   // au-delà du coin e / e+1
    for (let e = 0; e < 4; e++) {
        const a = q[e], b = q[(e + 1) % 4];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 8) continue;
        const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        let nx = -uy, ny = ux;
        if ((cx - (a[0] + b[0]) / 2) * nx + (cy - (a[1] + b[1]) / 2) * ny < 0) { nx = -nx; ny = -ny; }
        const ext = Math.max(8, len * 0.1), start = Math.max(2, len * 0.03);
        for (const [ox, oy, dir] of [[b[0], b[1], 1], [a[0], a[1], -1]]) {
            let ok = 0, tot = 0;
            for (let sd = start; sd <= start + ext; sd += 1) {
                const r = edgeSignAt(ox + ux * sd * dir, oy + uy * sd * dir, nx, ny, ctx);
                if (r === null) continue;
                tot++; ok += r > 0 ? 1 : 0;   // bord de papier « normal » seulement
            }
            if (tot < 5) continue;
            worst = Math.max(worst, ok / tot);
            if (dir > 0) overB[e] = ok / tot; else overA[e] = ok / tot;
        }
    }
    let partial = false;
    for (let e = 0; e < 4; e++) {
        // côté e : le côté précédent dépasse son coin e, le suivant son coin e+1
        if (overB[(e + 3) % 4] > 0.5 && overA[(e + 1) % 4] > 0.5) partial = true;
    }
    return { worst, partial };
}

// Une feuille est, sur l'essentiel de son contour, plus claire que le fond :
// un contour majoritairement inversé est suspect (bloc de texte, objet sombre)
function normalShareFactor(ok, inv) {
    if (ok + inv <= 0) return 1;
    return Math.min(1, (ok / (ok + inv)) / SCAN_DETECT.minNormal);
}

// Agrégat des 4 côtés : moyenne, modulée par le pire côté (un coin masqué par
// un doigt coûte un peu, un côté faux coûte beaucoup)
function edgeEvidenceAggregate(per) {
    const mean = (per[0] + per[1] + per[2] + per[3]) / 4;
    const ww = SCAN_DETECT.worstWeight;
    return mean * (1 - ww + ww * Math.min(per[0], per[1], per[2], per[3]));
}

// L'intérieur d'un document est plus clair que l'extérieur (0..1, 0.5 neutre)
function quadInsideOutsideContrast(q, gray, w, h) {
    // Signes des produits vectoriels constants => point dans le quad convexe
    const inside = (x, y) => {
        let sign = 0;
        for (let i = 0; i < 4; i++) {
            const a = q[i], b = q[(i + 1) % 4];
            const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
            if (c === 0) continue;
            const s = c > 0 ? 1 : -1;
            if (!sign) sign = s;
            else if (s !== sign) return false;
        }
        return true;
    };
    let sumIn = 0, nIn = 0, sumOut = 0, nOut = 0;
    const step = Math.max(4, Math.round(Math.min(w, h) / 40));
    for (let y = 2; y < h - 2; y += step) {
        for (let x = 2; x < w - 2; x += step) {
            const g = gray[y * w + x];
            if (inside(x, y)) { sumIn += g; nIn++; }
            else { sumOut += g; nOut++; }
        }
    }
    if (nIn < 8 || nOut < 8) return 0.5;
    const diff = (sumIn / nIn) - (sumOut / nOut);
    const c = Math.max(-1, Math.min(1, diff / 60));
    return (c + 1) / 2;
}

// Transformée de Hough ORIENTÉE : chaque pixel de bord ne vote que pour les
// droites proches de sa propre orientation de gradient (±2°). Les pics sont
// nets, les lignes de texte voisines ne masquent plus le bord de la feuille.
function orientedHoughLines(ctx) {
    const { nms, gx, gy, w, h, edgeThr } = ctx;
    const thetaSteps = 180;                       // pas de 1°
    const rhoStep = 2;
    const diag = Math.hypot(w, h);
    const rhoOff = Math.ceil(diag / rhoStep);
    const rhoBins = rhoOff * 2 + 1;
    const acc = new Float32Array(thetaSteps * rhoBins);
    const spread = SCAN_DETECT.houghSpread;
    const cosT = new Float32Array(thetaSteps), sinT = new Float32Array(thetaSteps);
    for (let t = 0; t < thetaSteps; t++) {
        const a = t * Math.PI / thetaSteps;
        cosT[t] = Math.cos(a); sinT[t] = Math.sin(a);
    }
    for (let y = 2; y < h - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
            const i = y * w + x;
            if (nms[i] < edgeThr) continue;
            let a = Math.atan2(gy[i], gx[i]);
            if (a < 0) a += Math.PI;                  // normale modulo 180°
            const t0 = Math.round(a * thetaSteps / Math.PI);
            for (let dt = -spread; dt <= spread; dt++) {
                let t = t0 + dt;
                if (t < 0) t += thetaSteps; else if (t >= thetaSteps) t -= thetaSteps;
                const r = Math.round((x * cosT[t] + y * sinT[t]) / rhoStep) + rhoOff;
                acc[t * rhoBins + r] += 1 - Math.abs(dt) / (spread + 1);
            }
        }
    }
    // Maxima locaux (fenêtre ±3°, ±3 bins rho ; theta circulaire)
    const minVotes = Math.min(w, h) * SCAN_DETECT.houghMin;
    const peaks = [];
    for (let t = 0; t < thetaSteps; t++) {
        for (let r = 1; r < rhoBins - 1; r++) {
            const v = acc[t * rhoBins + r];
            if (v < minVotes) continue;
            let isMax = true;
            for (let dt = -3; dt <= 3 && isMax; dt++) {
                let tt = t + dt, rr0 = r;
                if (tt < 0) { tt += thetaSteps; rr0 = rhoBins - 1 - r; }
                else if (tt >= thetaSteps) { tt -= thetaSteps; rr0 = rhoBins - 1 - r; }
                for (let dr = -3; dr <= 3; dr++) {
                    if (!dt && !dr) continue;
                    const rr = rr0 + dr;
                    if (rr < 0 || rr >= rhoBins) continue;
                    const u = acc[tt * rhoBins + rr];
                    // départage des égalités : le 1er rencontré gagne
                    if (u > v || (u === v && (tt * rhoBins + rr) < t * rhoBins + r)) { isMax = false; break; }
                }
            }
            if (isMax) peaks.push({ theta: t * Math.PI / thetaSteps, rho: (r - rhoOff) * rhoStep, votes: v });
        }
    }
    peaks.sort((a, b) => b.votes - a.votes);
    return peaks.slice(0, SCAN_DETECT.houghKeep);
}

// Tous les quadrilatères formés par deux paires de droites ~parallèles,
// évalués en O(1) par côté grâce à des sommes cumulées de "preuve de bord"
// précalculées le long de chaque droite. Retourne les `keep` meilleurs.
function quadsFromLines(lines, ctx, keep) {
    const { w, h } = ctx;
    if (lines.length < 4) return [];
    const R = Math.ceil(Math.hypot(w, h));
    // Profils : pour chaque droite, preuve de bord côté +n et côté -n
    for (const L of lines) {
        const nx = Math.cos(L.theta), ny = Math.sin(L.theta);
        const dx = -ny, dy = nx;
        const n = 2 * R + 1;
        const pos = new Int32Array(n + 1), neg = new Int32Array(n + 1), img = new Int32Array(n + 1);
        for (let k = 0; k < n; k++) {
            const s = k - R;
            const px = L.rho * nx + s * dx, py = L.rho * ny + s * dy;
            // pos : bord normal pour un intérieur côté +n (= inversé côté -n)
            let p = 0, q = 0, inside = 0;
            if (px >= 2 && py >= 2 && px <= w - 3 && py <= h - 3) {
                const r = edgeSignAt(px, py, nx, ny, ctx);
                if (r !== null) { inside = 1; p = r > 0 ? 1 : 0; q = r < 0 ? 1 : 0; }
            }
            pos[k + 1] = pos[k] + p; neg[k + 1] = neg[k] + q; img[k + 1] = img[k] + inside;
        }
        L.nx = nx; L.ny = ny; L.dx = dx; L.dy = dy; L.pos = pos; L.neg = neg; L.img = img;
    }
    const angDist = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
    // Distance (signée) du centre de l'image à la droite
    const cxI = w / 2, cyI = h / 2;
    const pairs = [];
    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const A = lines[i], B = lines[j];
            if (angDist(A.theta, B.theta) > 0.5) continue;    // ~28°
            // Écart entre les deux droites, mesuré près du centre
            const fx = B.rho * B.nx + ((cxI - B.rho * B.nx) * B.dx + (cyI - B.rho * B.ny) * B.dy) * B.dx;
            const fy = B.rho * B.ny + ((cxI - B.rho * B.nx) * B.dx + (cyI - B.rho * B.ny) * B.dy) * B.dy;
            if (Math.abs(fx * A.nx + fy * A.ny - A.rho) < Math.min(w, h) * 0.2) continue;
            pairs.push([A, B]);
        }
    }
    const inter = (l1, l2) => {
        const d = l1.nx * l2.ny - l1.ny * l2.nx;
        if (Math.abs(d) < 1e-6) return null;
        return [(l1.rho * l2.ny - l2.rho * l1.ny) / d, (l2.rho * l1.nx - l1.rho * l2.nx) / d];
    };
    // Qualité du côté porté par la droite L entre les points p et q
    const sideQuality = (L, p, q, cx, cy) => {
        let s1 = p[0] * L.dx + p[1] * L.dy, s2 = q[0] * L.dx + q[1] * L.dy;
        if (s1 > s2) { const t = s1; s1 = s2; s2 = t; }
        const span = s2 - s1;
        const lo = Math.max(0, Math.min(2 * R + 1, Math.round(s1 + span * 0.05) + R));
        const hi = Math.max(0, Math.min(2 * R + 1, Math.round(s2 - span * 0.05) + R + 1));
        const inImg = L.img[hi] - L.img[lo];
        if (inImg < Math.max(4, (hi - lo) * 0.3)) return 0.25;   // côté hors image
        const insidePlus = cx * L.nx + cy * L.ny - L.rho > 0;
        const nPos = L.pos[hi] - L.pos[lo], nNeg = L.neg[hi] - L.neg[lo];
        const ok = insidePlus ? nPos : nNeg, inv = insidePlus ? nNeg : nPos;
        tally.ok += ok; tally.inv += inv;
        return (ok + SCAN_DETECT.inverted * inv) / inImg;
    };
    const tally = { ok: 0, inv: 0 };
    const m = 0.12 * Math.max(w, h);
    const minArea = w * h * 0.1;
    const top = [];
    for (let a = 0; a < pairs.length; a++) {
        for (let b = a + 1; b < pairs.length; b++) {
            const [A1, A2] = pairs[a], [B1, B2] = pairs[b];
            if (A1 === B1 || A1 === B2 || A2 === B1 || A2 === B2) continue;
            const cross = Math.min(
                angDist(A1.theta, B1.theta), angDist(A1.theta, B2.theta),
                angDist(A2.theta, B1.theta), angDist(A2.theta, B2.theta)
            );
            if (cross < 0.87) continue;   // familles à ~50° minimum
            const c1 = inter(A1, B1), c2 = inter(B1, A2), c3 = inter(A2, B2), c4 = inter(B2, A1);
            if (!c1 || !c2 || !c3 || !c4) continue;
            const quad = [c1, c2, c3, c4];
            let ok = true;
            for (const c of quad) {
                if (c[0] < -m || c[0] > w + m || c[1] < -m || c[1] > h + m) { ok = false; break; }
            }
            if (!ok) continue;
            const area = polygonArea(quad);
            if (area < minArea || !quadAnglesOk(quad, false)) continue;
            const cx = (c1[0] + c2[0] + c3[0] + c4[0]) / 4, cy = (c1[1] + c2[1] + c3[1] + c4[1]) / 4;
            tally.ok = tally.inv = 0;
            const ev = edgeEvidenceAggregate([
                sideQuality(B1, c1, c2, cx, cy), sideQuality(A2, c2, c3, cx, cy),
                sideQuality(B2, c3, c4, cx, cy), sideQuality(A1, c4, c1, cx, cy)
            ]) * normalShareFactor(tally.ok, tally.inv);
            if (ev < 0.3) continue;
            const score = Math.pow(Math.min(1, area / (w * h)), 0.35) * ev;
            if (top.length < keep || score > top[top.length - 1].score) {
                top.push({ quad, score });
                top.sort((x, y) => y.score - x.score);
                if (top.length > keep) top.pop();
            }
        }
    }
    return top.map(t => t.quad);
}

// Droite par moindres carrés totaux (point moyen + direction principale),
// en deux passes : les points trop éloignés de la 1re droite (texte proche du
// bord, doigt, ombre) sont écartés avant l'ajustement final
function fitLineTLS(pts) {
    const fit = (arr) => {
        let mx = 0, my = 0;
        for (const p of arr) { mx += p[0]; my += p[1]; }
        mx /= arr.length; my /= arr.length;
        let sxx = 0, sxy = 0, syy = 0;
        for (const p of arr) {
            const dx = p[0] - mx, dy = p[1] - my;
            sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
        }
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        return { px: mx, py: my, dx: Math.cos(ang), dy: Math.sin(ang) };
    };
    if (pts.length < 5) return null;
    const l = fit(pts);
    const res = pts.map(p => Math.abs((p[0] - l.px) * l.dy - (p[1] - l.py) * l.dx));
    const med = res.slice().sort((a, b) => a - b)[res.length >> 1];
    const lim = Math.max(1, 2.5 * med);
    const kept = pts.filter((p, i) => res[i] <= lim);
    return kept.length >= 5 && kept.length < pts.length ? fit(kept) : l;
}

// Raffinement : aimante chaque bord sur la crête de gradient la plus proche,
// ajuste une droite (moindres carrés totaux, points aberrants écartés),
// recalcule les coins. La réponse est SIGNÉE : seul compte un gradient dirigé
// vers l'intérieur (papier plus clair que le fond) — le bord d'une ligne de
// texte voisine, plus contrasté mais de polarité inverse, n'attire plus le
// côté. `maps` = { gx, gy }. Options (en px) : search = demi-largeur de
// recherche le long de la normale, guard = déplacement max d'un coin,
// samples = points échantillonnés par bord, minMag = réponse minimale.
function refineQuadEdges(quad, maps, w, h, opts) {
    const o = opts || {};
    const search = o.search || 5, guard = o.guard || 12;
    const samples = o.samples || 11, minMag = o.minMag || 10;
    const step = Math.max(0.25, search / 10);
    const { gx, gy } = maps;
    const bil = (arr, x, y) => {
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
        const i = y0 * w + x0;
        return arr[i] * (1 - fx) * (1 - fy) + arr[i + 1] * fx * (1 - fy)
             + arr[i + w] * (1 - fx) * fy + arr[i + w + 1] * fx * fy;
    };
    const response = (x, y, nx, ny) => {
        if (x < 0 || y < 0 || x > w - 2 || y > h - 2) return 0;
        return bil(gx, x, y) * nx + bil(gy, x, y) * ny;
    };
    let corners = quad.map(p => [p[0], p[1]]);

    for (let iter = 0; iter < 2; iter++) {
        const edgeLines = [];
        for (let e = 0; e < 4; e++) {
            const a = corners[e], b = corners[(e + 1) % 4];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len < 12) return quad;
            let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
            // Normale orientée vers l'intérieur du quad
            const ccx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4;
            const ccy = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;
            if ((ccx - (a[0] + b[0]) / 2) * nx + (ccy - (a[1] + b[1]) / 2) * ny < 0) { nx = -nx; ny = -ny; }
            const fit = [];
            // Échantillons répartis sur 1/7..6/7 du bord (loin des coins)
            for (let k = 0; k < samples; k++) {
                const t = 1 / 7 + (5 / 7) * k / (samples - 1);
                const px = a[0] + (b[0] - a[0]) * t;
                const py = a[1] + (b[1] - a[1]) * t;
                let bestS = 0, bestV = -1;
                for (let sd = -search; sd <= search; sd += step) {
                    const v = response(px + nx * sd, py + ny * sd, nx, ny);
                    if (v > bestV) { bestV = v; bestS = sd; }
                }
                if (bestV > minMag) fit.push([px + nx * bestS, py + ny * bestS]);
            }
            const line = fitLineTLS(fit);
            if (line) {
                edgeLines.push(line);
            } else {
                edgeLines.push({ px: a[0], py: a[1], dx: (b[0] - a[0]) / len, dy: (b[1] - a[1]) / len });
            }
        }
        // Coins = intersections des bords adjacents (coin e : bords e-1 et e)
        const next = [];
        for (let e = 0; e < 4; e++) {
            const l1 = edgeLines[(e + 3) % 4], l2 = edgeLines[e];
            const det = l1.dx * l2.dy - l1.dy * l2.dx;
            if (Math.abs(det) < 1e-6) { next.push(corners[e]); continue; }
            const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / det;
            const ix = l1.px + l1.dx * t, iy = l1.py + l1.dy * t;
            // Garde-fou : un coin raffiné ne doit pas s'éloigner de plus de `guard` px
            if (Math.hypot(ix - corners[e][0], iy - corners[e][1]) > guard) next.push(corners[e]);
            else next.push([ix, iy]);
        }
        corners = next;
    }
    return corners.map(c => [
        Math.min(w - 1, Math.max(0, c[0])),
        Math.min(h - 1, Math.max(0, c[1]))
    ]);
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

// Angles internes plausibles pour une feuille photographiée
// (32°..148°, ou 24°..156° en mode assoupli)
function quadAnglesOk(quad, relaxed) {
    const lo = relaxed ? 24 : 32, hi = relaxed ? 156 : 148;
    for (let i = 0; i < 4; i++) {
        const p = quad[(i + 3) % 4], q = quad[i], r = quad[(i + 1) % 4];
        const v1x = p[0] - q[0], v1y = p[1] - q[1];
        const v2x = r[0] - q[0], v2y = r[1] - q[1];
        const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
        if (n1 < 4 || n2 < 4) return false;
        const cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
        const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        if (ang < lo || ang > hi) return false;
    }
    return true;
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

// ---------- Raffinement haute résolution ----------
// La détection travaille sur ~420 px : 1 px d'erreur y vaut 3 à 7 px sur la
// photo. On ré-aimante les bords sur une version plus grande (~1200 px),
// d'abord large puis fin, pour un cadrage précis au pixel près.
function refineQuadInRGBA(data, w, h, quadNorm) {
    try {
        const { gray, paperCh, mag, gx, gy } = computeEdgeMaps(data, w, h, 1);
        const side = Math.max(w, h);
        const q0 = quadNorm.map(p => [p.x * w, p.y * h]);
        let q = refineQuadEdges(q0, { gx, gy }, w, h, {
            search: side * 0.012, guard: side * 0.03, samples: 31, minMag: 12
        });
        q = refineQuadEdges(q, { gx, gy }, w, h, {
            search: Math.max(2, side * 0.004), guard: side * 0.012, samples: 41, minMag: 12
        });
        // Garde-fou : preuve de bord à cette résolution, avant / après
        const ctx = {
            gray, paperCh, nms: mag, gx, gy, w, h, edgeThr: 14,
            off: Math.max(2, Math.round(Math.min(w, h) * 0.012))
        };
        if (quadEdgeEvidence(q, ctx) < quadEdgeEvidence(q0, ctx) - 0.02) return quadNorm;
        return orderQuad(q.map(p => ({ x: p[0] / w, y: p[1] / h })));
    } catch (err) {
        console.warn('Raffinement coins:', err);
        return quadNorm;
    }
}

// ---------- Web Worker (analyse du flux caméra) ----------
// Messages : { id, type: 'detect', w, h, buffer } -> { id, result }
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = (e) => {
        const m = e.data || {};
        let result = null;
        if (m.type === 'detect') {
            result = detectQuadInRGBA(new Uint8ClampedArray(m.buffer), m.w, m.h);
        }
        self.postMessage({ id: m.id, result });
    };
}
