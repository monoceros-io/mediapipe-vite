import { ImageSegmenter, FilesetResolver, PoseLandmarker, DrawingUtils } from "./node_modules/@mediapipe/tasks-vision";

const runningMode = "VIDEO";


let wasmInstance = null;
let wasmdrawInstance = null;

let poseUpdateInterval = 300; // 1 second
let lastPoseTime = Date.now();
let xThreshold = 0.1;
let yThreshold = 0.1;

let frameCounter = 0;

const bodies = [
    {
        head: [],
        shoulder0: [], shoulder1: [],
        hand0: [], hand1: [],
        foot0: [], foot1: []
    }, {
        head: [],
        shoulder0: [], shoulder1: [],
        hand0: [], hand1: [],
        foot0: [], foot1: []
    }
];

const velocities = [
    {
        head: [],
        shoulder0: [], shoulder1: [],
        hand0: [], hand1: [],
        foot0: [], foot1: []
    }, {
        head: [],
        shoulder0: [], shoulder1: [],
        hand0: [], hand1: [],
        foot0: [], foot1: []
    }
];

export { velocities, bodies };

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
        numPoses: 1
    });

    return { segmenter, poseLandmarker };

}
const checkThreshold = (landmark) => {
    return (
        landmark.x > xThreshold &&
        landmark.x < 1 - xThreshold &&
        landmark.y > yThreshold &&
        landmark.y < 1 - yThreshold
    );
};

const ctx = document.getElementById("skel-draw-canvas").getContext("2d");

function updatePose(landmark, regIndex) {

    let body = bodies[regIndex];

    lastPoseTime = Date.now();

    const velocity = velocities[regIndex];

    if (body.head.length === 2) {
        velocity.head[0] = landmark[0].x - body.head[0];
        velocity.head[1] = landmark[0].y - body.head[1];
    }
    if (body.shoulder0.length === 2) {
        velocity.shoulder0[0] = landmark[11].x - body.shoulder0[0];
        velocity.shoulder0[1] = landmark[11].y - body.shoulder0[1];
    }
    if (body.shoulder1.length === 2) {
        velocity.shoulder1[0] = landmark[12].x - body.shoulder1[0];
        velocity.shoulder1[1] = landmark[12].y - body.shoulder1[1];
    }
    if (body.hand0.length === 2) {
        velocity.hand0[0] = landmark[15].x - body.hand0[0];
        velocity.hand0[1] = landmark[15].y - body.hand0[1];
    }
    if (body.hand1.length === 2) {
        velocity.hand1[0] = landmark[16].x - body.hand1[0];
        velocity.hand1[1] = landmark[16].y - body.hand1[1];
    }
    if (body.foot0.length === 2) {
        velocity.foot0[0] = landmark[27].x - body.foot0[0];
        velocity.foot0[1] = landmark[27].y - body.foot0[1];
    }
    if (body.foot1.length === 2) {
        velocity.foot1[0] = landmark[28].x - body.foot1[0];
        velocity.foot1[1] = landmark[28].y - body.foot1[1];
    }


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



export function detectPose(bitmap, segIndex) {

    if (poseLandmarker) {
        poseLandmarker.detect(bitmap, performance.now(), poseResult => {

            for (const landmark of poseResult.landmarks) {

                updatePose(landmark, segIndex);

                // const drawingUtils = new DrawingUtils(ctx)
                // drawingUtils.drawLandmarks(landmark, {
                //     radius: data => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1)
                // })
                // drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS)
            }
        })
    }
};