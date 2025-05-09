import { detectPose, loadModels } from "./processing";
import { setCaptureAreas, setBrightnessContrast, setOverlayMask, uploadMaskToTexture, clearMaskTexture, blendCanvasesToOutCanvas, videoTexture } from './shader-program.js';
import { init, run } from "./threeview.js";

let video, cropDivOuter;
let _videos, _cropDivOuters, _cdoMasks, _finalCanvas;

const { segmenter, poseLandmarker } = await loadModels();

const fps = document.getElementById("fps");
let t = performance.now();

const SEG_DIMENSION = 256;
const TOP_OFFSET = (1900 - 1200) / 2;

let combinedVideoCanvas = null;
let combinedCtx = null;

let processing = false;
let rawCaptureAreas = new Array(8).fill(0);

let gl;
let lastVideoFrameTime = -1;
let frameCount = 0;

const SKEL_FRAMES = 5; // Only detect pose every 5 frames (adjust as needed)
let skelFrameCounter = 0;

init();

export function setupVideoUtils({ videos, cropDivOuters, cdoMasks, finalCanvas }) {
    _videos = videos;
    _cropDivOuters = cropDivOuters;
    _cdoMasks = cdoMasks;
    _finalCanvas = finalCanvas;
    video = _videos[0];
    cropDivOuter = _cropDivOuters[0];
    gl = _finalCanvas.getContext("webgl");
}

export function matchCropToVideo() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const ew = video.clientWidth, eh = video.clientHeight;

    // (Re)create combinedVideoCanvas if video size changed
    if (!combinedVideoCanvas || combinedVideoCanvas.width !== vw || combinedVideoCanvas.height !== vh) {
        combinedVideoCanvas = new OffscreenCanvas(vw, vh);
        combinedCtx = combinedVideoCanvas.getContext("2d");
    }

    const videoAspect = vw / vh;
    const elementAspect = ew / eh;

    const visibleWidth = videoAspect > elementAspect ? ew : eh * videoAspect;
    const visibleHeight = videoAspect > elementAspect ? ew / videoAspect : eh;

    Object.assign(cropDivOuter.style, {
        width: `${visibleWidth}px`,
        height: `${visibleHeight}px`,
        position: 'absolute',
        left: `${(ew - visibleWidth) / 2}px`,
        top: `${(eh - visibleHeight) / 2}px`
    });

    const boxes = cropDivOuter.querySelectorAll(".video-crop-box");

    for (let i = 0; i < 2; i++) {
        const base = i * 4;
        const el = boxes[i].style;

        el.left = `${_cdoMasks[base]}%`;
        el.top = `${_cdoMasks[base + 1]}%`;
        el.width = `${_cdoMasks[base + 2]}%`;
        el.height = `${_cdoMasks[base + 3]}%`;

        rawCaptureAreas[base] = vw * _cdoMasks[base] / 100;
        rawCaptureAreas[base + 1] = vh * _cdoMasks[base + 1] / 100;
        rawCaptureAreas[base + 2] = vw * _cdoMasks[base + 2] / 100;
        rawCaptureAreas[base + 3] = vh * _cdoMasks[base + 3] / 100;
    }

    updateShaderCaptureAreas();
    if (!processing) processStreams();
}

window.addEventListener('resize', matchCropToVideo);

function setupCropBoxDragging() {
    const cropDivOuter = document.querySelector('.video-crop-div-outer');
    const boxes = cropDivOuter.querySelectorAll('.video-crop-box');
    if (!_cdoMasks) _cdoMasks = new Array(8).fill(0);

    boxes.forEach((box, boxIdx) => {
        // --- Move logic for video-centre-box ---
        const centreHandle = box.querySelector('.video-centre-box');
        let dragging = false;
        let startX, startY, startLeft, startTop;
        centreHandle.style.cursor = 'move';
        centreHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = box.getBoundingClientRect();
            const parentRect = cropDivOuter.getBoundingClientRect();
            startLeft = rect.left - parentRect.left;
            startTop = rect.top - parentRect.top;
            document.body.style.userSelect = 'none';
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const cropRect = cropDivOuter.getBoundingClientRect();
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            // Clamp within parent
            newLeft = Math.max(0, Math.min(newLeft, cropRect.width - box.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, cropRect.height - box.offsetHeight));
            // Move the crop box
            box.style.left = `${(newLeft / cropRect.width) * 100}%`;
            box.style.top = `${(newTop / cropRect.height) * 100}%`;
            // Update _cdoMasks
            const base = boxIdx * 4;
            _cdoMasks[base] = (newLeft / cropRect.width) * 100;
            _cdoMasks[base + 1] = (newTop / cropRect.height) * 100;
            // Optionally, update immediately
            matchCropToVideo();
        });
        window.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                document.body.style.userSelect = '';
            }
        });

        // --- Resize logic for video-scaler-box ---
        const scalerHandle = box.querySelector('.video-scaler-box');
        let resizing = false;
        let resizeStartX, resizeStartY, startWidth, startHeight;
        scalerHandle.style.cursor = 'nwse-resize';
        scalerHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            resizing = true;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            const rect = box.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            document.body.style.userSelect = 'none';
        });
        window.addEventListener('mousemove', (e) => {
            if (!resizing) return;
            const dx = e.clientX - resizeStartX;
            const dy = e.clientY - resizeStartY;
            const cropRect = cropDivOuter.getBoundingClientRect();
            let newWidth = Math.max(20, Math.min(startWidth + dx, cropRect.width - box.offsetLeft));
            let newHeight = Math.max(20, Math.min(startHeight + dy, cropRect.height - box.offsetTop));
            // Resize the crop box
            box.style.width = `${(newWidth / cropRect.width) * 100}%`;
            box.style.height = `${(newHeight / cropRect.height) * 100}%`;
            // Update _cdoMasks
            const base = boxIdx * 4;
            _cdoMasks[base + 2] = (newWidth / cropRect.width) * 100;
            _cdoMasks[base + 3] = (newHeight / cropRect.height) * 100;
            // Optionally, update immediately
            matchCropToVideo();
        });
        window.addEventListener('mouseup', () => {
            if (resizing) {
                resizing = false;
                document.body.style.userSelect = '';
            }
        });
    });
}

async function processStreams() {
    if (processing) return;
    processing = true;

    async function processFrame() {
        const readyState = video.readyState;
        if (readyState < video.HAVE_ENOUGH_DATA) return;

        // Calculate normalized capture areas for shader
        const captureAreas = [];
        for (let i = 0; i < 2; i++) {
            const base = i * 4;
            const x = rawCaptureAreas[base] / video.videoWidth;
            const y = rawCaptureAreas[base + 1] / video.videoHeight;
            const w = rawCaptureAreas[base + 2] / video.videoWidth;
            const h = rawCaptureAreas[base + 3] / video.videoHeight;
            captureAreas.push([x, y, w, h]);
        }

        // Capture the video frame ONCE and use for both crops
        const frameBitmap = await createImageBitmap(video);

        // Upload the captured frame to the GL texture ONCE
        gl.activeTexture(gl.TEXTURE0 + 4);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frameBitmap);
        lastVideoFrameTime = video.currentTime;

        // for (let i = 0; i < 2; i++) {

        let i = frameCount % 2;
        const base = i * 4;
        const [cx, cy, cw, ch] = rawCaptureAreas.slice(base, base + 4);
        const cropBitmap = await createImageBitmap(frameBitmap, cx, cy, cw, ch, {
            resizeWidth: SEG_DIMENSION,
            resizeHeight: SEG_DIMENSION,
            resizeQuality: "high"
        });

        // Only detect pose every SKEL_FRAMES frames
        if (skelFrameCounter == 0) {
            detectPose(cropBitmap, i);
        }

        // Segment every frame for both feeds
        const segmentation = await segmenter.segmentForVideo(cropBitmap, performance.now());
        cropBitmap.close();
        const masks = segmentation.confidenceMasks;
        if (masks?.[0]) {
            const w = masks[0].width, h = masks[0].height;
            const mask0 = masks[0].getAsFloat32Array();
            const mask4 = masks[4]?.getAsFloat32Array() || null;
            uploadMaskToTexture(mask0, i * 2, w, h);
            if (mask4) {
                uploadMaskToTexture(mask4, i * 2 + 1, w, h);
            } else {
                clearMaskTexture(i * 2 + 1, w, h);
            }
            masks.forEach(mask => mask.close());
        }
        segmentation.close();
        // }

        frameBitmap.close();

        // Increment pose frame counter after both processed
        skelFrameCounter++;
        if (skelFrameCounter >= SKEL_FRAMES) skelFrameCounter = 0;

        blendCanvasesToOutCanvas(_finalCanvas, i);
    }

    function loop() {

        let now = performance.now();
        let d = now - t;
        frameCount++;
        if (frameCount % 10 === 0) {
            fps.innerHTML = (10000 / d).toFixed(2);
            t = now;
        }
        run();
        processFrame().then(() => requestAnimationFrame(loop));
    }

    loop();
}

// Call setCaptureAreas only when crop areas change
function updateShaderCaptureAreas() {
    const captureAreas = [];
    for (let i = 0; i < 2; i++) {
        const base = i * 4;
        const x = rawCaptureAreas[base] / video.videoWidth;
        const y = rawCaptureAreas[base + 1] / video.videoHeight;
        const w = rawCaptureAreas[base + 2] / video.videoWidth;
        const h = rawCaptureAreas[base + 3] / video.videoHeight;
        captureAreas.push([x, y, w, h]);
    }
    setCaptureAreas(captureAreas);
}

setupCropBoxDragging();
