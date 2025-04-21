import { loadModels } from "./processing";
import { blendCanvasesToOutCanvas } from "./shader-program.js";
import "./shader-program.js";

let video, cropDivOuter;
let _videos, _cropDivOuters, _cdoMasks, _finalCanvas;

const { segmenter, poseLandmarker } = await loadModels();

const fps = document.getElementById("fps");
let t = performance.now();

const SEG_DIMENSION = 256;
const BASE_CUTOUT_HEIGHT = 1200;
const TOP_OFFSET = (1900 - BASE_CUTOUT_HEIGHT) / 2;
const BASE_WIDTH_FOURTH = 800;
const BASE_WIDTH_EIGHTH = 400;

const VIDEO_INPUT_WIDTH = 1600;
const VIDEO_INPUT_HEIGHT = BASE_CUTOUT_HEIGHT;
const combinedVideoCanvas = new OffscreenCanvas(VIDEO_INPUT_WIDTH, VIDEO_INPUT_HEIGHT);
const combinedCtx = combinedVideoCanvas.getContext("2d");

let processing = false;
let rawCaptureAreas = new Array(8).fill(0);

let gl;
let lastVideoFrameTime = -1;
let frameCount = 0;

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

    if (!processing) processStreams();
}

window.addEventListener('resize', matchCropToVideo);

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
        if (window.setCaptureAreas) {
            window.setCaptureAreas(captureAreas);
        }

        // Only run segmenter for one video per frame, alternating
        const segIndex = frameCount % 2;
        const base = segIndex * 4;
        const [cx, cy, cw, ch] = rawCaptureAreas.slice(base, base + 4);
        const bitmap = await createImageBitmap(video, cx, cy, cw, ch, {
            resizeWidth: SEG_DIMENSION,
            resizeHeight: SEG_DIMENSION,
            resizeQuality: "high"
        });
        const segmentation = await segmenter.segmentForVideo(bitmap, performance.now());
        bitmap.close();
        const masks = segmentation.confidenceMasks;
        if (masks?.[0]) {
            const w = masks[0].width, h = masks[0].height;
            const mask0 = masks[0].getAsFloat32Array();
            const mask4 = masks[4]?.getAsFloat32Array() || null;
            window.uploadMaskToTexture(mask0, segIndex * 2, w, h);
            if (mask4) {
                window.uploadMaskToTexture(mask4, segIndex * 2 + 1, w, h);
            } else {
                window.clearMaskTexture(segIndex * 2 + 1, w, h);
            }
            masks.forEach(mask => mask.close());
        }
        segmentation.close();

        // Only upload video frame if it changed (using video.currentTime)
        if (video.currentTime !== lastVideoFrameTime) {
            gl.activeTexture(gl.TEXTURE0 + 4);
            gl.bindTexture(gl.TEXTURE_2D, window.videoTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            lastVideoFrameTime = video.currentTime;
        }

        blendCanvasesToOutCanvas(_finalCanvas);
    }

    function loop() {
        let now = performance.now();
        let d = now - t;
        frameCount++;
        if (frameCount % 10 === 0) {
            fps.innerHTML = (1000 / d).toFixed(2);
            t = now;
        }
        processFrame().then(() => requestAnimationFrame(loop));
    }

    loop();
}
