import { setupVideoUtils, matchCropToVideo } from "./camera-utils";
import { loadModels } from "./processing";

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
    if (window.setBrightnessContrast) {
        window.setBrightnessContrast(brightness, shaderContrast);
    }
}

brightnessInput.addEventListener('input', updateShaderBC);
contrastInput.addEventListener('input', updateShaderBC);

// Wire up overlay-mask checkbox
const overlayMaskInput = document.getElementById('overlay-mask');
if (overlayMaskInput && window.setOverlayMask) {
    window.setOverlayMask(overlayMaskInput.checked);
    overlayMaskInput.addEventListener('change', () => {
        window.setOverlayMask(overlayMaskInput.checked);
    });
}

// Set initial values
updateShaderBC();