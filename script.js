import { setupVideoUtils, matchCropToVideo } from "./camera-utils";
import { loadModels } from "./processing";
import { setBrightnessContrast, setOverlayMask, setMaskColors } from './shader-program.js';
import { activeBackground, activeForeground } from './threeview.js';

// PAGE ELEMENTS

const videos = document.querySelectorAll(".video");
const cameraSelectors = document.querySelectorAll('.camera-select');
const cropDivOuters = document.querySelectorAll(".video-crop-div-outer");
const dumpCanvases = document.querySelectorAll(".crop-canvas");
const finalCanvas = document.querySelector("#final-canvas");

const cdoMasks = [
    10, 5, 40, 90,
    55, 5, 40, 90
];

setupVideoUtils({ videos, cropDivOuters, cdoMasks, dumpCanvases, finalCanvas });

let cameraSourceActive = [false, false];
let frameCounter = 0;

const devices = await navigator.mediaDevices.enumerateDevices();

devices.filter(device => device.kind === 'videoinput').forEach((device, index) => {

    for (let sel of cameraSelectors) {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        sel.appendChild(option);
        sel.selectedIndex = 2;
    }
});

cameraSelectors.forEach((sel, index) => {
    sel.addEventListener('change', async (event) => {
        cameraSourceActive[index] = false;
        const video = document.getElementById(`vid-${index}`);
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                frameRate: { min: 30, ideal: 120 },
                deviceId: { exact: event.target.value },
                width: { ideal: 1920 }, // Try for 4K width
                height: { ideal: 1080 }, // Try for 4K height
            }
        });

        const streamStart = () => {
            video.removeEventListener('loadeddata', streamStart);
            cameraSourceActive[index] = true;
            matchCropToVideo();
        }

        video.addEventListener('loadeddata', streamStart);
        video.srcObject = stream;
        video.play();

    });
});

// Wire up brightness and contrast controls
const brightnessInput = document.getElementById('brightness');
const contrastInput = document.getElementById('contrast');

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

// Wire up overlay-mask checkbox
const overlayMaskInput = document.getElementById('overlay-mask');
const foreCanvases = document.querySelector('.fore-canvases');
if (overlayMaskInput) {
    setOverlayMask(overlayMaskInput.checked);
    overlayMaskInput.addEventListener('change', () => {
        setOverlayMask(overlayMaskInput.checked);
        if (foreCanvases) {
            foreCanvases.style.display = overlayMaskInput.checked ? 'flex' : 'none';
        }
    });
    // Set initial visibility on load
    if (foreCanvases) {
        foreCanvases.style.display = overlayMaskInput.checked ? 'flex' : 'none';
    }
}

// Fullscreen button logic for qc-0
const fullscreenBtn = document.getElementById('fullscreen-btn');
const qc0 = document.querySelector('.qc-0');
const mainColumn = document.querySelector('.main-column');

fullscreenBtn.addEventListener('click', () => {
    console.log("Fullscreen button clicked");
    // Toggle display flex/none for qc-0
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
    [1, 0, 0], // Red
    [0, 1, 0], // Green
    [0, 0, 1], // Blue
    [1, 1, 0]  // Yellow
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