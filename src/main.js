// Copyright 2023 The MediaPipe Authors.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//      http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Import necessary modules from MediaPipe library
import {
  ImageSegmenter,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2"

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
let runningMode = "IMAGE" // Default running mode
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

// Function to create and initialize the ImageSegmenter
const createImageSegmenter = async () => {
  const audio = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  )

  imageSegmenter = await ImageSegmenter.createFromOptions(audio, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
      delegate: "GPU"
    },
    runningMode: runningMode,
    outputCategoryMask: true,
    outputConfidenceMasks: true // Enable confidence masks
  })
  labels = imageSegmenter.getLabels() // Retrieve category labels
  demosSection.classList.remove("invisible") // Show demo section
}
createImageSegmenter()

// Removed code related to imageContainers and handleClick
// Removed callback logic for static image segmentation

// Callback function to process segmentation results for video
function callbackForVideo(result) {
  let imageData = canvasCtx.getImageData(
    0,
    0,
    video.videoWidth,
    video.videoHeight
  ).data
  const mask = result.categoryMask.getAsFloat32Array()
  let j = 0

  for (let i = 0; i < mask.length; ++i) {
    const maskVal = Math.round(mask[i] * 255.0)
    const legendColor = legendColors[maskVal % legendColors.length]
    imageData[j] = (legendColor[0] + imageData[j]) / 2
    imageData[j + 1] = (legendColor[1] + imageData[j + 1]) / 2
    imageData[j + 2] = (legendColor[2] + imageData[j + 2]) / 2
    imageData[j + 3] = 255 // Full opacity
    j += 4
  }
  const uint8Array = new Uint8ClampedArray(imageData.buffer)
  const dataNew = new ImageData(uint8Array, video.videoWidth, video.videoHeight)
  canvasCtx.putImageData(dataNew, 0, 0)

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

  // Switch to VIDEO mode if currently in IMAGE mode
  if (runningMode === "IMAGE") {
    runningMode = "VIDEO"
    await imageSegmenter.setOptions({
      runningMode: runningMode
    })
  }
  let startTimeMs = performance.now()

  // Start segmenting the webcam stream
  imageSegmenter.segmentForVideo(video, startTimeMs, callbackForVideo)
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
