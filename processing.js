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
        runningMode: "IMAGE",
        numPoses: 2
    });

    return { segmenter, poseLandmarker };

}

const ctx = document.getElementById("skel-draw-canvas").getContext("2d");

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



export function detectPose(bitmap, segIndex) {

    console.log("CHIFFO", segIndex);

    // if(frameCount % 3 !== 0)
    //     return;
    
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    if (poseLandmarker) {
        poseLandmarker.detect(bitmap, performance.now(), poseResult => {
            
            for (const landmark of poseResult.landmarks) {
                
                const drawingUtils = new DrawingUtils(ctx)
                drawingUtils.drawLandmarks(landmark, {
                    radius: data => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1)
                })
                drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS)
            }
        })
    }
};