import { ImageSegmenter, FilesetResolver, PoseLandmarker, DrawingUtils } from "./node_modules/@mediapipe/tasks-vision";

const runningMode = "VIDEO";


let wasmInstance = null;
let wasmdrawInstance = null;

let poseUpdateInterval = 300; // 1 second
let lastPoseTime = Date.now();
let xThreshold = 0.1;
let yThreshold = 0.1;

let frameCounter = 0;

const colors = [
    [255, 0, 0],   // Red BACKGROUND
    [0, 255, 0],   // Green HAIR
    [0, 0, 255],   // Blue SKIN
    [255, 255, 0], // Yellow FACE
    [0, 255, 255], // Cyan CLOTHES
    [255, 0, 255]  // Magenta OBJECTS
];

const body = {
    head: [],
    shoulder0: [], shoulder1: [],
    hand0: [], hand1: [],
    foot0: [], foot1: []
}

let segmenter, poseLandmarker;

let cameraSourceActive = [false, false];

export async function loadModels() {

    const vision = await FilesetResolver.forVisionTasks("./node_modules/@mediapipe/tasks-vision/wasm");

    segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "./selfie_multiclass_256x256.tflite",
            delegate: 'GPU'
        },
        runningMode: runningMode,
    });


    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numPoses: 2
    });

}

function updatePose(landmark) {

    if (Date.now() - lastPoseTime > poseUpdateInterval) {

        lastPoseTime = Date.now();

        if (checkThreshold(landmark[0])) {
            body.head[0] = landmark[0].x;
            body.head[1] = landmark[0].y;
        }
        if (checkThreshold(landmark[11])) {
            body.shoulder0[0] = landmark[11].x;
            body.shoulder0[1] = landmark[11].y;
        }
        if (checkThreshold(landmark[12])) {
            body.shoulder1[0] = landmark[12].x;
            body.shoulder1[1] = landmark[12].y;
        }
        if (checkThreshold(landmark[15])) {
            body.hand0[0] = landmark[15].x;
            body.hand0[1] = landmark[15].y;
        }
        if (checkThreshold(landmark[16])) {
            body.hand1[0] = landmark[16].x;
            body.hand1[1] = landmark[16].y;
        }
        if (checkThreshold(landmark[27])) {
            body.foot0[0] = landmark[27].x;
            body.foot0[1] = landmark[27].y;
        }
        if (checkThreshold(landmark[28])) {
            body.foot1[0] = landmark[28].x;
            body.foot1[1] = landmark[28].y;
        }

    }
}

const SEG_DIMENSION = 256;

const offscreenCanvas = document.createElement("canvas");
offscreenCanvas.width = SEG_DIMENSION;
offscreenCanvas.height = SEG_DIMENSION;
const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

export async function processVideoFrame(dumpCVS, dumpCTX) {

    if(!dumpCVS.height || !dumpCVS.width)
        return;

    offscreenCtx.drawImage(dumpCVS, 0, 0, SEG_DIMENSION, SEG_DIMENSION);

    const imageData = offscreenCtx.getImageData(0, 0, SEG_DIMENSION, SEG_DIMENSION);

    // Perform segmentation
    const segmentationResult = await segmenter.segmentForVideo(imageData, performance.now());
    if (segmentationResult?.confidenceMasks) {
        // drawAllMasksToDumpCanvas(segmentationResult.confidenceMasks);
        segmentationResult.confidenceMasks.forEach(mask => mask.close());
    }

    // if (Math.floor(frameCounter % 10) === 0) {
    //     poseLandmarker.detectForVideo(video, performance.now(), drawPoseLandmarks);
    // }

    frameCounter++;
    // requestAnimationFrame(processVideoFrame);
}


let tempFloatBuffer = null;
let lastBufferSize = 0;

function drawAllMasksToDumpCanvas(confidenceMasks) {

    const canvas = canvases[cameraDumpIndex];
    const dumpCtx = dumpContexts[cameraDumpIndex];
    const { width, height } = confidenceMasks[0];
    const cMask = confidenceMasks[0];

    const pixelCount = width * height;

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    // (Re)allocate buffer if needed
    if (!tempFloatBuffer || lastBufferSize !== pixelCount) {
        tempFloatBuffer = new Float32Array(pixelCount * 3); // R, G, B
        lastBufferSize = pixelCount;
    } else {
        tempFloatBuffer.fill(0);
    }

    [0, 4].forEach(maskIndex => {
        const maskData = confidenceMasks[maskIndex];
        const maskArray = maskData.getAsFloat32Array();
        const [r, g, b] = colors[maskIndex % colors.length];

        for (let i = 0; i < pixelCount; i++) {
            const alpha = maskArray[i];
            if (alpha === 0) continue;

            const base = i * 3;
            tempFloatBuffer[base] = Math.max(tempFloatBuffer[base], r * alpha);
            tempFloatBuffer[base + 1] = Math.max(tempFloatBuffer[base + 1], g * alpha);
            tempFloatBuffer[base + 2] = Math.max(tempFloatBuffer[base + 2], b * alpha);
        }
    });

    const imageData = dumpCtx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
        const base = i * 3;
        data[j] = tempFloatBuffer[base];     // R
        data[j + 1] = tempFloatBuffer[base + 1]; // G
        data[j + 2] = tempFloatBuffer[base + 2]; // B
        data[j + 3] = 255; // Opaque
    }

    dumpCtx.putImageData(imageData, 0, 0);
}

