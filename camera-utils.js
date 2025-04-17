import { loadModels } from "./processing";


let _videos, _cropDivOuters, _cdoMasks, _dumpCanvases, _dumpContexts = [], _finalCanvas, _finalContext;

const { segmenter, poseLandmarker } = await loadModels();


let video, cropDivOuter;

const colors = [
    [0, 1, 0],   // GREEN - BG
    [1, 1, 0],   // Green
    [0, 0, 1],   // Blue
    [1, 1, 0],   // Yellow
    [0, 0, 1],   // Magenta
    [0, 1, 1]    // Cyan
]; // Replace with your actual colors array

// Global buffers to avoid reallocations
let tempFloatBuffer = null;
let imageDataBuffer = null;
let lastBufferSize = 0;
let u8TempView = null; // Adding Uint8Array view for faster conversions

export function setupVideoUtils({
    videos, cropDivOuters, cdoMasks, dumpCanvases, finalCanvas
}) {

    _videos = videos;
    _cropDivOuters = cropDivOuters;
    _cdoMasks = cdoMasks;
    _finalCanvas = finalCanvas;
    console.log("SONNO", finalCanvas);
    _finalContext = finalCanvas.getContext("2d");


    video = _videos[0];
    cropDivOuter = _cropDivOuters[0];
}

let processing = false;
let rawCaptureAreas = [];

export function matchCropToVideo() {



    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const elementWidth = video.clientWidth;
    const elementHeight = video.clientHeight;

    const videoAspect = videoWidth / videoHeight;
    const elementAspect = elementWidth / elementHeight;

    let visibleWidth, visibleHeight;

    if (videoAspect > elementAspect) {
        // Letterbox top and bottom
        visibleWidth = elementWidth;
        visibleHeight = elementWidth / videoAspect;
    } else {
        // Letterbox left and right
        visibleHeight = elementHeight;
        visibleWidth = elementHeight * videoAspect;
    }

    cropDivOuter.style.width = visibleWidth + 'px';
    cropDivOuter.style.height = visibleHeight + 'px';
    cropDivOuter.style.position = 'absolute';
    cropDivOuter.style.left = ((elementWidth - visibleWidth) / 2) + 'px';
    cropDivOuter.style.top = ((elementHeight - visibleHeight) / 2) + 'px';

    const boundElements = cropDivOuter.querySelectorAll(".video-crop-box");


    for (let j = 0; j < 2; ++j) {

        const element = boundElements[j];
        const style = element.style;

        const boundStart = j * 4;


        style.left = _cdoMasks[boundStart] + "%";
        style.top = _cdoMasks[boundStart + 1] + "%";
        style.width = _cdoMasks[boundStart + 2] + "%";
        style.height = _cdoMasks[boundStart + 3] + "%";

        rawCaptureAreas[boundStart] = videoWidth * (_cdoMasks[boundStart]) / 100;
        rawCaptureAreas[boundStart + 1] = videoHeight * (_cdoMasks[boundStart + 1]) / 100;
        rawCaptureAreas[boundStart + 2] = videoWidth * (_cdoMasks[boundStart + 2]) / 100;
        rawCaptureAreas[boundStart + 3] = videoHeight * (_cdoMasks[boundStart + 3]) / 100;

    }



    if (!processing)
        processStreams();

}


window.addEventListener('resize', matchCropToVideo);

const BASE_CUTOUT_HEIGHT = 1200;
const TOP_OFFSET = (1900 - BASE_CUTOUT_HEIGHT) / 2;
const BASE_WIDTH_FOURTH = 800;
const BASE_WIDTH_EIGHTH = 400;

let frameCounter = 0;

// const sharedDumpCVS = document.createElement("canvas");

const SEG_DIMENSION = 200;
const offscreenCanvas = new OffscreenCanvas(SEG_DIMENSION, SEG_DIMENSION);
const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

async function processStreams() {
    ++frameCounter;

    for (let i = 0; i < 2; ++i) {
        let index = i * 4;

        const cx = rawCaptureAreas[index];
        const cy = rawCaptureAreas[index + 1];
        const cw = rawCaptureAreas[index + 2];
        const ch = rawCaptureAreas[index + 3];

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const cRatio = cw / ch;
            const cWidth = BASE_CUTOUT_HEIGHT * cRatio;

            const cX = BASE_WIDTH_FOURTH * i + BASE_WIDTH_EIGHTH - (cWidth / 2);
            const cX2 = BASE_WIDTH_FOURTH * (i + 2) + BASE_WIDTH_EIGHTH - (cWidth / 2);

            _finalContext.drawImage(video, cx, cy, cw, ch, cX, TOP_OFFSET, cWidth, BASE_CUTOUT_HEIGHT);

            offscreenCtx.drawImage(video, cx, cy, cw, ch, 0, 0, SEG_DIMENSION, SEG_DIMENSION);
            const imageData = offscreenCtx.getImageData(0, 0, SEG_DIMENSION, SEG_DIMENSION);

            if ((i + frameCounter) % 1 == 0) {
                const segmentationResult = await segmenter.segmentForVideo(imageData, performance.now());
                const confidenceMasks = segmentationResult.confidenceMasks;

                if (confidenceMasks && confidenceMasks[0]) {
                    const { width, height } = confidenceMasks[0];
                    const pixelCount = width * height;

                    if (!tempFloatBuffer || lastBufferSize !== pixelCount) {
                        tempFloatBuffer = new Float32Array(pixelCount * 3);
                        imageDataBuffer = _finalContext.createImageData(width, height);
                        u8TempView = new Uint8Array(tempFloatBuffer.buffer);
                        lastBufferSize = pixelCount;
                    } else {
                        tempFloatBuffer.set(new Float32Array(pixelCount * 3).fill(0));
                    }

                    processMask(confidenceMasks[1], 0, tempFloatBuffer, pixelCount);
                    processMask(confidenceMasks[2], 0, tempFloatBuffer, pixelCount);
                    processMask(confidenceMasks[3], 3, tempFloatBuffer, pixelCount);
                    processMask(confidenceMasks[4], 4, tempFloatBuffer, pixelCount);

                    const data = imageDataBuffer.data;

                    for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
                        const base = i * 3;
                        data[j] = Math.min(255, Math.round(tempFloatBuffer[base] * 255));
                        data[j + 1] = Math.min(255, Math.round(tempFloatBuffer[base + 1] * 255));
                        data[j + 2] = Math.min(255, Math.round(tempFloatBuffer[base + 2] * 255));
                        data[j + 3] = 255;
                    }

                    const bitmap = await createImageBitmap(imageDataBuffer);
                    _finalContext.imageSmoothingEnabled = false;

                    // Draw the mask at the same size as the video feed
                    _finalContext.drawImage(bitmap, 0, 0, width, height, cX2, TOP_OFFSET, cWidth, BASE_CUTOUT_HEIGHT);

                    segmentationResult.confidenceMasks.forEach(mask => mask.close());
                }
            }
        }
    }

    requestAnimationFrame(processStreams);
}


export async function drawAllMasksToDumpCanvas(confidenceMasks, dumpCVS, dumpCTX) {
    // Early validation
    if (!confidenceMasks || !confidenceMasks[0]) return Promise.resolve();

    const { width, height } = confidenceMasks[0];
    const pixelCount = width * height;

    // Buffer management - reuse when possible
    if (!tempFloatBuffer || lastBufferSize !== pixelCount) {
        tempFloatBuffer = new Float32Array(pixelCount * 3);
        imageDataBuffer = dumpCTX.createImageData(width, height);
        u8TempView = new Uint8Array(tempFloatBuffer.buffer); // Create view of the same memory
        lastBufferSize = pixelCount;
    } else {
        // Faster than .fill() for large arrays
        tempFloatBuffer.set(new Float32Array(pixelCount * 3).fill(0));
    }

    processMask(confidenceMasks[1], 0, tempFloatBuffer, pixelCount);
    processMask(confidenceMasks[2], 0, tempFloatBuffer, pixelCount);
    processMask(confidenceMasks[3], 3, tempFloatBuffer, pixelCount);
    processMask(confidenceMasks[4], 4, tempFloatBuffer, pixelCount);

    const data = imageDataBuffer.data;

    const CHUNK_SIZE = 1024; // Process 1KB chunks

    for (let chunk = 0; chunk < pixelCount; chunk += CHUNK_SIZE) {
        const limit = Math.min(chunk + CHUNK_SIZE, pixelCount);

        for (let i = chunk, j = i * 4; i < limit; i++, j += 4) {
            const base = i * 3;
        
            // Convert RGB float values (0-1) to 0-255
            data[j] = Math.min(255, Math.round(tempFloatBuffer[base] * 255));       // R
            data[j + 1] = Math.min(255, Math.round(tempFloatBuffer[base + 1] * 255)); // G
            data[j + 2] = Math.min(255, Math.round(tempFloatBuffer[base + 2] * 255)); // B
        
            // Alpha = average of RGB or their sum capped
            const alphaSum = tempFloatBuffer[base] +
                             tempFloatBuffer[base + 1] +
                             tempFloatBuffer[base + 2];
            data[j + 3] = 255;
        }
    }

    // Create bitmap and draw - use offscreen if available for parallelization
    const bitmap = await createImageBitmap(imageDataBuffer);
    dumpCTX.imageSmoothingEnabled = false;
    dumpCTX.drawImage(bitmap, 0, 0, dumpCVS.width, dumpCVS.height);
    return bitmap;
}

// Separate function for processing each mask (helps with JS optimization)

function processMask(mask, maskIndex, outputBuffer, pixelCount) {
    const maskArray = mask.getAsFloat32Array();
    const [r, g, b] = colors[maskIndex % colors.length];

    // Process in chunks for better cache locality
    const CHUNK_SIZE = 4096;

    for (let chunk = 0; chunk < pixelCount; chunk += CHUNK_SIZE) {
        const limit = Math.min(chunk + CHUNK_SIZE, pixelCount);

        for (let i = chunk; i < limit; i++) {
            const alpha = maskArray[i];
            // Skip zero values but avoid branch prediction failures with a threshold
            if (alpha < 0.001) continue;

            const base = i * 3;
            outputBuffer[base] = Math.max(outputBuffer[base], r * alpha);
            outputBuffer[base + 1] = Math.max(outputBuffer[base + 1], g * alpha);
            outputBuffer[base + 2] = Math.max(outputBuffer[base + 2], b * alpha);
        }
    }
}