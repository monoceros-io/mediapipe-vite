import { setupVideoUtils, matchCropToVideo } from "./camera-utils";
import { setBrightnessContrast, setMaskColors, setAlphaThresholds } from './shader-program.js';
import { activeBackground, activeForeground } from './threeview.js';
import "./image-camera";
import experience0 from './experience0.js';
import experience1 from './experience1.js';
import eventController from "./EventController.js";
import "./server.js"



const experiences = [experience0, experience1];

const foreCanvasArray = document.querySelectorAll('.fore-canvas');

// PAGE ELEMENTS

const videos = document.querySelectorAll(".video");
const cameraSelectors = document.querySelectorAll('.camera-select');
const cropDivOuters = document.querySelectorAll(".video-crop-div-outer");
const dumpCanvases = document.querySelectorAll(".crop-canvas");
const finalCanvas = document.querySelector("#final-canvas");

const cdoMasks = [
    10, 40, 10, 10,
    40, 80, 10, 10
];

document.getElementById("save-btn").addEventListener("click", ()=>{
    document.cookie = `cdoMaskCache=${JSON.stringify(cdoMasks)}; path=/; max-age=31536000`;
});

const cookieMatch = document.cookie.match(/cdoMaskCache=([^;]+)/);
if (cookieMatch) {
    try {
        const cachedMasks = JSON.parse(cookieMatch[1]);
        if (Array.isArray(cachedMasks) && cachedMasks.length === cdoMasks.length) {
            cdoMasks.splice(0, cdoMasks.length, ...cachedMasks);
            console.log("Loaded cdoMaskCache from cookie:", cdoMasks);
        }
    } catch (e) {
        console.error("Failed to parse cdoMaskCache cookie:", e);
    }
}

setupVideoUtils({ videos, cropDivOuters, cdoMasks, dumpCanvases, finalCanvas });

let cameraSourceActive = [false, false];
let frameCounter = 0;

const devices = await navigator.mediaDevices.enumerateDevices();

let firstSet = false;// TODO NB FIRST SET TO FALSE TO RUN THE APP!


const canvas4k = document.getElementById("canvas-4k");

const cameraChange = async (id) => {
    cameraSourceActive[0] = false;
    const video = document.getElementById(`vid-0`);

    // Try to get supported constraints (not per device, but global)
    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    console.log("Supported constraints:", supportedConstraints);

    // Try to get camera capabilities via enumerateDevices (labels may hint at resolution, but not guaranteed)
    // There is no direct way to get max resolution before opening the stream.
    // Some browsers support getCapabilities() on MediaStreamTrack after getUserMedia.

    // Request 4K resolution (3840x2160)
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { exact: 3840 },
            height: { exact: 2160 },
            deviceId: { exact: id },
            frameRate: { ideal: 60, max: 60 },
        }
    });

    console.log("Camera stream started");
    console.log(stream);

    // After stream is started, you can check actual capabilities
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack.getCapabilities) {
        const caps = videoTrack.getCapabilities();
        console.log("Video track capabilities:", caps);
    }
    if (videoTrack.getSettings) {
        const settings = videoTrack.getSettings();
        console.log("Video track settings:", settings);
    }

    const streamStart = () => {
        video.removeEventListener('loadeddata', streamStart);
        cameraSourceActive[0] = true;
        console.log('Camera videoWidth:', video.videoWidth, 'videoHeight:', video.videoHeight);
        matchCropToVideo();
    }

    video.addEventListener('loadeddata', streamStart);
    video.srcObject = stream;
    video.play();



}

devices.filter(device => device.kind === 'videoinput').forEach((device, index) => {

    for (let sel of cameraSelectors) {

        if(!firstSet){
            firstSet = true;
            cameraChange(device.deviceId);
        }
        
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        sel.appendChild(option);
        sel.selectedIndex = 2;
    }


});


cameraSelectors.forEach((sel, index) => {

    sel.addEventListener('change', event => {
        cameraChange(event.target.value);
    });
});


// Wire up brightness and contrast controls
const brightnessInput = document.getElementById('brightness');
const contrastInput = document.getElementById('contrast');

const detectedReadouts = document.querySelectorAll('.cb-det-sta');

eventController.addEventListener("pose-found", ({ segIndex }) => {
    detectedReadouts[1 - segIndex].innerHTML = "Persona detectada";
    detectedReadouts[1 - segIndex].style.color = "green";
});


eventController.addEventListener("pose-lost", ({ segIndex }) => {
    detectedReadouts[1 - segIndex].innerHTML = "Nadie detectado";
    detectedReadouts[1 - segIndex].style.color = "red";
});

function updateShaderBC() {
    // Map slider values to shader-friendly ranges
    const brightness = Number(brightnessInput.value) / 10; // -1 to 1
    const contrast = Number(contrastInput.value); // -10 to 10
    // Clamp contrast to positive values for shader
    const shaderContrast = Math.max(0, contrast);
    setBrightnessContrast(brightness, shaderContrast);
}

brightnessInput.addEventListener('input', updateShaderBC);
contrastInput.addEventListener('input', updateShaderBC);

// Fullscreen button logic for qc-0
const fullscreenBtn = document.getElementById('fullscreen-btn');
const qc0 = document.querySelector('.qc-0');
const mainColumn = document.querySelector('.main-column');
      

fullscreenBtn.addEventListener('click', () => {
    console.log("Fullscreen button clicked");

    if (qc0.style.display === 'none') {
        qc0.style.display = 'flex';
    } else {
        qc0.style.display = 'none';
    }
    // Enter fullscreen mode for main column
    if (mainColumn.requestFullscreen) {
        mainColumn.requestFullscreen();
    } else if (mainColumn.webkitRequestFullscreen) {
        mainColumn.webkitRequestFullscreen();
    } else if (mainColumn.mozRequestFullScreen) {
        mainColumn.mozRequestFullScreen();
    } else if (mainColumn.msRequestFullscreen) {
        mainColumn.msRequestFullscreen();
    }
});

// Listen for Escape key and fullscreen change to turn off qc-0 hiding
function exitQc0Hide() {
    qc0.style.display = 'flex';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        exitQc0Hide();
    }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        exitQc0Hide();
    }
});

// --- Experience switching logic ---

const EXPERIENCE_COLORS = [
    [0.2, 1.0, 0.1],  // Yellow
    [0.7, 0.8, 1.0],  // Yellow
    [1, 1, 0], // Blue
    [1.0, 0.5, 0]  // Yellow
];

function updateMaskColors() {
    setMaskColors([
        EXPERIENCE_COLORS[activeForeground[1]], // left view (flipped: use right)
        EXPERIENCE_COLORS[activeForeground[1]], // left mask (for both left masks)
        EXPERIENCE_COLORS[activeForeground[0]], // right view (flipped: use left)
        EXPERIENCE_COLORS[activeForeground[0]]  // right mask (for both right masks)
    ]);
}

// Wire up control-panel buttons for experience switching
const leftButtons = document.querySelectorAll('.control-panel label:nth-of-type(1) + .cb-row button');
const rightButtons = document.querySelectorAll('.control-panel label:nth-of-type(2) + .cb-row button');

leftButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
        activeForeground[0] = idx;
        activeBackground[0] = idx;
        updateMaskColors();
    });
});

rightButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
        activeForeground[1] = idx;
        activeBackground[1] = idx;
        updateMaskColors();
    });
});

// Set initial mask colors
updateMaskColors();

// Helper to update experience for a view
function setExperience(view, type, idx) {


    if (type === 'bg') {
        activeBackground[view] = idx;
    } else {
        const canvas = foreCanvasArray[view];
        // const mode = experiences[idx].foreBlendMode;
        // canvas.style.mixBlendMode = mode;
        activeForeground[view] = idx;
    }
}

// Wire up control-panel buttons
const controlPanel = document.querySelector('.control-panel');
const cbRows = controlPanel.querySelectorAll('.cb-row');
// cbRows[0] = left, cbRows[1] = right
cbRows.forEach((row, viewIdx) => {
    const buttons = row.querySelectorAll('button');
    buttons.forEach((btn, expIdx) => {
        btn.addEventListener('click', () => {
            // For this demo, both bg and fg switch together
            setExperience(viewIdx, 'bg', expIdx);
            setExperience(viewIdx, 'fg', expIdx);
        });
    });
});

// Set initial values
updateShaderBC();

// === Alpha Threshold Sliders wiring ===
const alphaMinInput = document.getElementById('alpha-min');
const alphaMaxInput = document.getElementById('alpha-max');
const alphaMinValue = document.getElementById('alpha-min-value');
const alphaMaxValue = document.getElementById('alpha-max-value');

function updateAlphaThresholds() {
    const min = parseFloat(alphaMinInput.value);
    const max = parseFloat(alphaMaxInput.value);
    setAlphaThresholds(min, max);
    alphaMinValue.textContent = min.toFixed(2);
    alphaMaxValue.textContent = max.toFixed(2);
}
if (alphaMinInput && alphaMaxInput) {
    alphaMinInput.addEventListener('input', updateAlphaThresholds);
    alphaMaxInput.addEventListener('input', updateAlphaThresholds);
    // Set initial values
    updateAlphaThresholds();
}
// ===============================


const holas = document.querySelectorAll(".hola-inner");

let holaTimeout;

let foundHolas = [false, false];

function showHola(index, name = "Nick"){

    return;

    if(foundHolas[index])
        return;
    foundHolas[index] = true;


    const elem = holas[index];
    elem.style.opacity = 1;
    elem.style.transform = "rotate(0deg) scale(1)";
    clearTimeout(holaTimeout);

    // holaTimeout = setTimeout(() => {
    //     elem.style.opacity = 0;
    //     elem.style.transform = "rotate(360deg) scale(0.5)";
    // }, 1000);
}

function hideHola(index){

    
    return;

    if(!foundHolas[index])
        return;
    foundHolas[index] = false;
    
    // clearTimeout(holaTimeout);
    const elem = holas[index];
    elem.style.opacity = 0;
    elem.style.transform = "rotate(360deg) scale(0.5)";
}

export { showHola, hideHola };