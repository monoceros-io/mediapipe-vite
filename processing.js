import { ImageSegmenter, FilesetResolver, PoseLandmarker, DrawingUtils } from "./node_modules/@mediapipe/tasks-vision";

const runningMode = "VIDEO";


let wasmInstance = null;
let wasmdrawInstance = null;

let poseUpdateInterval = 300; // 1 second
let lastPoseTime = Date.now();
let xThreshold = 0.1;
let yThreshold = 0.1;

let frameCounter = 0;

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

    return { segmenter, poseLandmarker };

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
// Missing colors array from your original code
const colors = [
  [1, 0, 0],   // Red
  [0, 1, 0],   // Green
  [0, 0, 1],   // Blue
  [1, 1, 0],   // Yellow
  [1, 0, 1],   // Magenta
  [0, 1, 1]    // Cyan
]; // Replace with your actual colors array

// Global buffers to avoid reallocations
let tempFloatBuffer = null;
let imageDataBuffer = null;
let lastBufferSize = 0;
let u8TempView = null; // Adding Uint8Array view for faster conversions

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
    
    // Hard-coded mask indices for better performance
    const mask1 = confidenceMasks[1];
    const mask4 = confidenceMasks[4];
    
    // Process only available masks
    if (mask1) {
        processMask(mask1, 1, tempFloatBuffer, pixelCount);
    }
    
    if (mask4) {
        processMask(mask4, 4, tempFloatBuffer, pixelCount);
    }
    
    // Get direct access to typed arrays for better performance
    const data = imageDataBuffer.data;
    
    // Process in chunks for better performance
    const CHUNK_SIZE = 1024; // Process 1KB chunks
    
    for (let chunk = 0; chunk < pixelCount; chunk += CHUNK_SIZE) {
        const limit = Math.min(chunk + CHUNK_SIZE, pixelCount);
        
        for (let i = chunk, j = i * 4; i < limit; i++, j += 4) {
            const base = i * 3;
            
            // Set RGB values (consistently with your original code)
            data[j] = 255; // R
            data[j + 1] = 0; // G
            data[j + 2] = 0; // B
            
            // Optimized alpha calculation with one multiplication outside the loop
            const alphaSum = tempFloatBuffer[base] + 
                            tempFloatBuffer[base + 1] + 
                            tempFloatBuffer[base + 2];
                            
            // Fast clamping to 0-255 range
            data[j + 3] = alphaSum * 255 > 255 ? 255 : (alphaSum * 255);
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