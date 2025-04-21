import { loadModels } from "./processing";

// State for video/canvas elements and contexts
let _videos, _cropDivOuters, _cdoMasks, _dumpCanvases, _dumpContexts = [], _finalCanvas; // removed _finalContext

// Load MediaPipe models (segmenter, poseLandmarker)
const { segmenter, poseLandmarker } = await loadModels();

// FPS display element
const fps = document.getElementById("fps");

let video, cropDivOuter;

// Import shader blending utilities
import "./shader-program.js";
import { blendCanvasesToOutCanvas } from "./shader-program.js";

// Color palette for mask rendering (as Float32Array)
const colors = new Float32Array([
    0, 1, 0,   // GREEN - BG
    0, 1, 1,   // Green
    0, 0, 1,   // Blue
    1, 0, 1,   // Yellow
    0, 0, 1,   // Magenta
    1, 0, 0    // Cyan
]);

// Buffers for mask processing and image data
let tempFloatBuffer = null;
let imageDataBuffer = null;
let lastBufferSize = 0;
let u8TempView = null;

// Setup function to initialize video/canvas references
export function setupVideoUtils({ videos, cropDivOuters, cdoMasks, dumpCanvases, finalCanvas }) {
    _videos = videos;
    _cropDivOuters = cropDivOuters;
    _cdoMasks = cdoMasks;
    _finalCanvas = finalCanvas;
    video = _videos[0];
    cropDivOuter = _cropDivOuters[0];
}

let processing = false;
let rawCaptureAreas = [];
let lastMask0 = null, lastMask4 = null, lastMaskDims0 = { width: 0, height: 0 }, lastMaskDims4 = { width: 0, height: 0 };

// Adjust crop overlay to match video aspect ratio and update capture areas
export function matchCropToVideo() {

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const elementWidth = video.clientWidth;
    const elementHeight = video.clientHeight;

    const videoAspect = videoWidth / videoHeight;
    const elementAspect = elementWidth / elementHeight;

    let visibleWidth, visibleHeight;

    if (videoAspect > elementAspect) {
        visibleWidth = elementWidth;
        visibleHeight = elementWidth / videoAspect;
    } else {
        visibleHeight = elementHeight;
        visibleWidth = elementHeight * videoAspect;
    }

    Object.assign(cropDivOuter.style, {
        width: `${visibleWidth}px`,
        height: `${visibleHeight}px`,
        position: 'absolute',
        left: `${(elementWidth - visibleWidth) / 2}px`,
        top: `${(elementHeight - visibleHeight) / 2}px`
    });

    const boundElements = cropDivOuter.querySelectorAll(".video-crop-box");

    // Update crop box positions and raw capture areas
    for (let j = 0; j < 2; ++j) {
        const element = boundElements[j];
        const style = element.style;
        const boundStart = j * 4;

        style.left = _cdoMasks[boundStart] + "%";
        style.top = _cdoMasks[boundStart + 1] + "%";
        style.width = _cdoMasks[boundStart + 2] + "%";
        style.height = _cdoMasks[boundStart + 3] + "%";

        rawCaptureAreas[boundStart] = videoWidth * _cdoMasks[boundStart] / 100;
        rawCaptureAreas[boundStart + 1] = videoHeight * _cdoMasks[boundStart + 1] / 100;
        rawCaptureAreas[boundStart + 2] = videoWidth * _cdoMasks[boundStart + 2] / 100;
        rawCaptureAreas[boundStart + 3] = videoHeight * _cdoMasks[boundStart + 3] / 100;

    }

    if (!processing) processStreams();
}

// Update crop overlay on window resize
window.addEventListener('resize', matchCropToVideo);

// Constants for output/canvas layout
const BASE_CUTOUT_HEIGHT = 1200;
const TOP_OFFSET = (1900 - BASE_CUTOUT_HEIGHT) / 2;
const BASE_WIDTH_FOURTH = 800;
const BASE_WIDTH_EIGHTH = 400;

let frameCounter = 0;
const SEG_DIMENSION = 256; // Segmentation mask resolution
const offscreenCanvas = new OffscreenCanvas(SEG_DIMENSION, SEG_DIMENSION);
const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

const offscreenRenderCanvas = new OffscreenCanvas(SEG_DIMENSION, SEG_DIMENSION);
const offscreenRenderCtx = offscreenRenderCanvas.getContext("2d");

let fpsTime = performance.now();

let fc = 0;

// Main processing loop: capture, segment, and render video frames
async function processStreams() {
    if (processing) return;
    processing = true;

    const outW = _finalCanvas.width, outH = _finalCanvas.height;

    let lastMasks = [null, null];
    let lastMaskDims = [{ width: 0, height: 0 }, { width: 0, height: 0 }];

    async function loop() {


        for (let i = 0; i < 2; ++i) {
            const base = i * 4;
            const cx = rawCaptureAreas[base];
            const cy = rawCaptureAreas[base + 1];
            const cw = rawCaptureAreas[base + 2];
            const ch = rawCaptureAreas[base + 3];

            if (video.readyState !== video.HAVE_ENOUGH_DATA || cw === 0 || ch === 0) continue;

            const cRatio = cw / ch;
            const cWidth = BASE_CUTOUT_HEIGHT * cRatio;
            const cX = BASE_WIDTH_FOURTH * i + BASE_WIDTH_EIGHTH - (cWidth / 2);

            // --- Instead of drawing to 2D context, upload video crop as a WebGL texture here ---
            window.uploadVideoToTexture(video, cx, cy, cw, ch, cX, TOP_OFFSET, cWidth, BASE_CUTOUT_HEIGHT);

            offscreenCtx.drawImage(video, cx, cy, cw, ch, 0, 0, SEG_DIMENSION, SEG_DIMENSION);
            const imageData = offscreenCtx.getImageData(0, 0, SEG_DIMENSION, SEG_DIMENSION);
            const segmentationResult = await segmenter.segmentForVideo(imageData, performance.now());
            const confidenceMasks = segmentationResult.confidenceMasks;

            if (confidenceMasks && confidenceMasks[0]) {
                const { width, height } = confidenceMasks[0];
                lastMasks[i] = [
                    confidenceMasks[0].getAsFloat32Array(),
                    confidenceMasks[4] ? confidenceMasks[4].getAsFloat32Array() : null,
                    width, height
                ];
                lastMaskDims[i] = { width, height };
                confidenceMasks.forEach(mask => mask.close());
            }
            segmentationResult.close();

            // Only upload mask if we have one
            if (lastMasks[i]) {
                const [mask0, mask4, width, height] = lastMasks[i];
                window.uploadMaskToTexture(mask0, 0, width, height);
                if (mask4) {
                    window.uploadMaskToTexture(mask4, 1, width, height);
                } else {
                    window.clearMaskTexture(1, width, height);
                }
                // Now blend and draw everything in WebGL
                blendCanvasesToOutCanvas(_finalCanvas);
            }
        }

        requestAnimationFrame(loop);
    }

    loop();
}

