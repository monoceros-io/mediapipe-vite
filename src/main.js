import "./style.css";

import {
  ImageSegmenter,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2"

import {
  PoseLandmarker,
  DrawingUtils
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0"



// Get DOM elements for video, canvas, and other UI components
const video = document.getElementById("webcam")
const canvasElement = document.getElementById("canvas")
const canvasCtx = canvasElement.getContext("2d")
const webcamPredictions = document.getElementById("webcamPredictions")
const demosSection = document.getElementById("demos")
let enableWebcamButton
let webcamRunning = false
const videoHeight = "360px"
const videoWidth = "480px"
let runningMode = "VIDEO"; // Set default running mode to VIDEO
const resultWidthHeigth = 256 // Output resolution for segmentation

let imageSegmenter // Instance of the ImageSegmenter
let labels // Labels for segmentation categories

// Define colors for segmentation categories
const legendColors = [
  [255, 197, 0, 255], // Vivid Yellow
  [128, 62, 117, 255], // Strong Purple
  [255, 104, 0, 255], // Vivid Orange
  [166, 189, 215, 255], // Very Light Blue
  [193, 0, 32, 255], // Vivid Red
  [206, 162, 98, 255], // Grayish Yellow
  [129, 112, 102, 255], // Medium Gray
  [0, 125, 52, 255], // Vivid Green
  [246, 118, 142, 255], // Strong Purplish Pink
  [0, 83, 138, 255], // Strong Blue
  [255, 112, 92, 255], // Strong Yellowish Pink
  [83, 55, 112, 255], // Strong Violet
  [255, 142, 0, 255], // Vivid Orange Yellow
  [179, 40, 81, 255], // Strong Purplish Red
  [244, 200, 0, 255], // Vivid Greenish Yellow
  [127, 24, 13, 255], // Strong Reddish Brown
  [147, 170, 0, 255], // Vivid Yellowish Green
  [89, 51, 21, 255], // Deep Yellowish Brown
  [241, 58, 19, 255], // Vivid Reddish Orange
  [35, 44, 22, 255], // Dark Olive Green
  [0, 161, 194, 255] // Vivid Blue
]

let poseLandmarker;

// Before we can use PoseLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  )
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
      delegate: "GPU"
    },
    runningMode: runningMode, // Ensure running mode is VIDEO
    numPoses: 2
  })
  demosSection.classList.remove("invisible")
}
createPoseLandmarker()

// Function to create and initialize the ImageSegmenter
const createImageSegmenter = async () => {
  const audio = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );

  

  // Dynamically fetch the .tflite model file
  const modelAssetPath = new URL("./data/deeplab_v3.tflite", import.meta.url).href;

  imageSegmenter = await ImageSegmenter.createFromOptions(audio, {
    baseOptions: {
      modelAssetPath: modelAssetPath, // Use dynamically resolved model path
      delegate: "GPU",
    },
    runningMode: runningMode, // Ensure running mode is VIDEO
    outputCategoryMask: true,
    outputConfidenceMasks: true, // Enable confidence masks
  });
  labels = imageSegmenter.getLabels(); // Retrieve category labels
  demosSection.classList.remove("invisible"); // Show demo section
};
createImageSegmenter()

// Removed code related to imageContainers and handleClick
// Removed callback logic for static image segmentation

// Callback function to process segmentation and pose landmark results for video
function callbackForVideo(result) {
  // Ensure canvas size matches video dimensions
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  let imageData = canvasCtx.getImageData(
    0,
    0,
    video.videoWidth,
    video.videoHeight
  ).data
  const mask = result.categoryMask.getAsFloat32Array()
  let j = 0

  for (let i = 0; i < mask.length; ++i) {
    const maskVal = Math.ceil(mask[i]); // Mask value is between 0 and 1
    const grayscale = maskVal * 255; // Scale to 0-255 for full brightness range
    imageData[j] = grayscale; // Red channel
    imageData[j + 1] = 0; // Green channel
    imageData[j + 2] = 0; // Blue channel
    imageData[j + 3] = 255; // Full opacity
    j += 4;
  }
  const uint8Array = new Uint8ClampedArray(imageData.buffer)
  const dataNew = new ImageData(uint8Array, video.videoWidth, video.videoHeight)
  canvasCtx.putImageData(dataNew, 0, 0)

  // Perform pose landmark detection and draw skeleton
  if (poseLandmarker) {
    poseLandmarker.detectForVideo(video, performance.now(), poseResult => {
      for (const landmark of poseResult.landmarks) {
        const drawingUtils = new DrawingUtils(canvasCtx)
        drawingUtils.drawLandmarks(landmark, {
          radius: data => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1)
        })
        drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS)
      }
    })
  }

  // Continue processing frames if webcam is running
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam)
  }
}

/********************************************************************
// Demo 2: Continuously grab image from webcam stream and segment it.
********************************************************************/

// Check if the browser supports webcam access
function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

// Perform segmentation on the webcam stream
let lastWebcamTime = -1
async function predictWebcam() {
  // Dynamically set canvas size to match video dimensions
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  if (video.currentTime === lastWebcamTime) {
    if (webcamRunning === true) {
      window.requestAnimationFrame(predictWebcam)
    }
    return
  }
  lastWebcamTime = video.currentTime
  canvasCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

  // Do nothing if the ImageSegmenter is not loaded
  if (imageSegmenter === undefined) {
    return
  }

  // Ensure running mode remains VIDEO
  if (runningMode !== "VIDEO") {
    runningMode = "VIDEO";
    await imageSegmenter.setOptions({ runningMode: runningMode });
    await poseLandmarker.setOptions({ runningMode: runningMode });
  }

  // Start segmenting the webcam stream
  imageSegmenter.segmentForVideo(video, performance.now(), callbackForVideo)

  // Apply the threshold shader to the video feed
  applyThresholdShader();
}

// Enable or disable webcam segmentation
async function enableCam(event) {
  if (imageSegmenter === undefined) {
    return
  }

  if (webcamRunning === true) {
    webcamRunning = false
    enableWebcamButton.innerText = "ENABLE SEGMENTATION"
  } else {
    webcamRunning = true
    enableWebcamButton.innerText = "DISABLE SEGMENTATION"
  }

  // Webcam stream constraints
  const constraints = {
    video: true
  }

  // Activate the webcam stream
  video.srcObject = await navigator.mediaDevices.getUserMedia(constraints)
  video.addEventListener("loadeddata", predictWebcam)
}

// If webcam is supported, add event listener to the button
if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton")
  enableWebcamButton.addEventListener("click", enableCam)
} else {
  console.warn("getUserMedia() is not supported by your browser")
}

// Initialize WebGL for the threshold shader
const thresholdCanvas = document.getElementById("blurredCanvas");
const gl = thresholdCanvas.getContext("webgl");

if (!gl) {
  console.error("WebGL not supported");
}

// Get the slider element for threshold adjustment
const thresholdSlider = document.getElementById("thresholdSlider");

// Updated vertex shader source to flip the texture vertically
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y); // Flip vertically
  }
`;

// Fragment shader source for thresholding with adjustable threshold
const fragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform float u_threshold;
  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    float grayscale = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float value = step(u_threshold, grayscale);
    gl_FragColor = vec4(vec3(value), 1.0);
  }
`;

// Add a WebGL shader for dilation
const dilationFragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  void main() {
    float kernel[9];
    kernel[0] = 1.0; kernel[1] = 1.0; kernel[2] = 1.0;
    kernel[3] = 1.0; kernel[4] = 1.0; kernel[5] = 1.0;
    kernel[6] = 1.0; kernel[7] = 1.0; kernel[8] = 1.0;

    vec2 texOffset = vec2(1.0 / float(textureSize(u_image, 0).x), 1.0 / float(textureSize(u_image, 0).y));
    float maxVal = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec4 color = texture2D(u_image, v_texCoord + vec2(float(i) * texOffset.x, float(j) * texOffset.y));
        maxVal = max(maxVal, color.r);
      }
    }

    gl_FragColor = vec4(vec3(maxVal), 1.0);
  }
`;

// Compile shader
function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Create WebGL program
function createProgram(gl, vertexShaderSource, fragmentShaderSource) {
  const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link failed:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

// Set up WebGL attributes and uniforms
const positionLocation = gl.getAttribLocation(program, "a_position");
const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
const thresholdLocation = gl.getUniformLocation(program, "u_threshold");
const imageLocation = gl.getUniformLocation(program, "u_image");

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1, 1, -1, -1, 1,
  -1, 1, 1, -1, 1, 1,
]), gl.STATIC_DRAW);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  0, 0, 1, 0, 0, 1,
  0, 1, 1, 0, 1, 1,
]), gl.STATIC_DRAW);

const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

// Function to apply the threshold shader
function applyThresholdShader() {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

  gl.useProgram(program);

  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.enableVertexAttribArray(texCoordLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  // Set the threshold value from the slider
  const thresholdValue = parseFloat(thresholdSlider.value) / 100.0; // Normalize to 0-1
  gl.uniform1f(thresholdLocation, thresholdValue);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(imageLocation, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
