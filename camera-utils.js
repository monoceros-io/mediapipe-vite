import { loadModels } from "./processing";

// State for video/canvas elements and contexts
let _videos, _cropDivOuters, _cdoMasks, _dumpCanvases, _dumpContexts = [], _finalCanvas, _finalContext;

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
    _finalContext = finalCanvas.getContext("2d");
    video = _videos[0];
    cropDivOuter = _cropDivOuters[0];
}

let processing = false;
let rawCaptureAreas = [];
let lastMask0 = null, lastMask4 = null, lastMaskDims = { width: 0, height: 0 };

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

// Main processing loop: capture, segment, and render video frames
async function processStreams() {
    if (processing) return; // Prevent multiple loops
    processing = true;

    async function loop() {
        fps.innerHTML = (1000 / (performance.now() - fpsTime)).toFixed(2);
        fpsTime = performance.now();
        ++frameCounter;

        // Only process the first crop/video for performance
        const i = 0;
        const index = i * 4;
        const [cx, cy, cw, ch] = rawCaptureAreas.slice(index, index + 4);

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            // Calculate output positions and sizes
            const cRatio = cw / ch;
            const cWidth = BASE_CUTOUT_HEIGHT * cRatio;
            const cX = BASE_WIDTH_FOURTH * i + BASE_WIDTH_EIGHTH - (cWidth / 2);

            // Draw cropped video to final canvas (background)
            _finalContext.drawImage(video, cx, cy, cw, ch, cX, TOP_OFFSET, cWidth, BASE_CUTOUT_HEIGHT);

            // Draw cropped video to offscreen canvas for segmentation
            offscreenCtx.drawImage(video, cx, cy, cw, ch, 0, 0, SEG_DIMENSION, SEG_DIMENSION);
            const imageData = offscreenCtx.getImageData(0, 0, SEG_DIMENSION, SEG_DIMENSION);

            // Run segmentation model
            const segmentationResult = await segmenter.segmentForVideo(imageData, performance.now());
            const confidenceMasks = segmentationResult.confidenceMasks;
            if (confidenceMasks && confidenceMasks[0]) {
                const { width, height } = confidenceMasks[0];

                // Only upload if mask or size changed
                const mask0 = confidenceMasks[0].getAsFloat32Array();
                if (!lastMask0 || lastMaskDims.width !== width || lastMaskDims.height !== height ||
                    !mask0.every((v, idx) => v === lastMask0[idx])) {
                    window.uploadMaskToTexture(mask0, 0, width, height);
                    lastMask0 = mask0;
                    lastMaskDims = { width, height };
                }

                if (confidenceMasks[4]) {
                    const mask4 = confidenceMasks[4].getAsFloat32Array();
                    if (!lastMask4 || !mask4.every((v, idx) => v === lastMask4[idx])) {
                        window.uploadMaskToTexture(mask4, 1, width, height);
                        lastMask4 = mask4;
                    }
                } else {
                    window.clearMaskTexture(1, width, height);
                    lastMask4 = null;
                }

                segmentationResult.confidenceMasks.forEach(mask => mask.close());
            }

            // Blend all mask textures to the output canvas using WebGL shader
            blendCanvasesToOutCanvas();

            // Draw the shader output (out-canvas) over the camera feed in final canvas
            const outCanvas = document.getElementById('out-canvas');
            _finalContext.drawImage(outCanvas, 0, 0, _finalCanvas.width, _finalCanvas.height);

            requestAnimationFrame(loop);
        } else {
            requestAnimationFrame(loop);
        }
    }

    loop();
}

