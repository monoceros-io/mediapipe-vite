import { loadModels } from "./processing";

let _videos, _cropDivOuters, _cdoMasks, _dumpCanvases, _dumpContexts = [], _finalCanvas, _finalContext;

const { segmenter, poseLandmarker } = await loadModels();

let video, cropDivOuter;

const colors = new Float32Array([
    0, 1, 0,   // GREEN - BG
    0, 1, 1,   // Green
    0, 0, 1,   // Blue
    1, 0, 1,   // Yellow
    0, 0, 1,   // Magenta
    1, 0, 0    // Cyan
  ]);

let tempFloatBuffer = null;
let imageDataBuffer = null;
let lastBufferSize = 0;
let u8TempView = null;

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

window.addEventListener('resize', matchCropToVideo);

const BASE_CUTOUT_HEIGHT = 1200;
const TOP_OFFSET = (1900 - BASE_CUTOUT_HEIGHT) / 2;
const BASE_WIDTH_FOURTH = 800;
const BASE_WIDTH_EIGHTH = 400;

let frameCounter = 0;
const SEG_DIMENSION = 200;
const offscreenCanvas = new OffscreenCanvas(SEG_DIMENSION, SEG_DIMENSION);
const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

async function processStreams() {
    ++frameCounter;

    for (let i = 0; i < 2; ++i) {
        const index = i * 4;
        const [cx, cy, cw, ch] = rawCaptureAreas.slice(index, index + 4);

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const cRatio = cw / ch;
            const cWidth = BASE_CUTOUT_HEIGHT * cRatio;
            const cX = BASE_WIDTH_FOURTH * i + BASE_WIDTH_EIGHTH - (cWidth / 2);
            const cX2 = BASE_WIDTH_FOURTH * (i + 2) + BASE_WIDTH_EIGHTH - (cWidth / 2);

            _finalContext.drawImage(video, cx, cy, cw, ch, cX, TOP_OFFSET, cWidth, BASE_CUTOUT_HEIGHT);

            offscreenCtx.drawImage(video, cx, cy, cw, ch, 0, 0, SEG_DIMENSION, SEG_DIMENSION);
            const imageData = offscreenCtx.getImageData(0, 0, SEG_DIMENSION, SEG_DIMENSION);

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
                    tempFloatBuffer.fill(0);
                }

                processMask(confidenceMasks[0], 0, tempFloatBuffer, pixelCount);
                processMask(confidenceMasks[4], 4, tempFloatBuffer, pixelCount);//CLOTHES

                const data = imageDataBuffer.data;
                for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
                    const base = i * 3;
                    let tfb0 = tempFloatBuffer[base + 0] * 255;
                    let tfb1 = tempFloatBuffer[base + 1] * 255;
                    let tfb2 = tempFloatBuffer[base + 2] * 255;
                    
                    data[j] = Math.min(255, Math.round(tfb0));
                    data[j + 1] = Math.min(255, Math.round(tfb1));
                    data[j + 2] = Math.min(255, Math.round(tfb2));
                    data[j + 3] = 255;
                }

                const bitmap = await createImageBitmap(imageDataBuffer);
                _finalContext.imageSmoothingEnabled = false;

                _finalContext.drawImage(bitmap, 0, 0, width, height, cX2, TOP_OFFSET, cWidth, BASE_CUTOUT_HEIGHT);

                segmentationResult.confidenceMasks.forEach(mask => mask.close());
            }
        }
    }

    requestAnimationFrame(processStreams);
}



function processMask(mask, maskIndex, outputBuffer, pixelCount) {
    console.time();
    const maskArray = mask.getAsFloat32Array();
    const r = colors[(maskIndex * 3) % colors.length];
    const g = colors[(maskIndex * 3 + 1) % colors.length];
    const b = colors[(maskIndex * 3 + 2) % colors.length];

    for (let i = 0; i < pixelCount; i++) {
        const alpha = maskArray[i];
        const base = i * 3;
        outputBuffer[base] += alpha * r;
        outputBuffer[base + 1] += alpha * g;
        outputBuffer[base + 2] += alpha * b;
    }
    console.timeEnd();
}
