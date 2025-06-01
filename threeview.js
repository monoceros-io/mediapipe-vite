import * as THREE from 'three';
// import BASE_PART_IMG from "/basepart.png";
import BASE_PART_IMG from "/chip0.png";
import { bodies } from './processing';

// Import experience modules

import experience0 from './experience0.js';
import experience1 from './experience1.js';
import experience2 from './experience2.js';
import experience3 from './experience3.js';

const experiences = [experience0, experience1, experience2, experience3];

const spriteTexture = new THREE.TextureLoader().load(BASE_PART_IMG);

let canvases = [];
let running = false;

const CUBE_COUNT = 100;
const FORE_SPRITE_COUNT = 50;
const PARTICLE_FRICTION = 0.97;
const MAX_LIFE = 1000;
const EXPERIENCE_COLORS = [0xffd100, 0x00953b, 0x5c0f8b, 0x101820];

let activeBackground = [0, 1];
let activeForeground = [0, 1];

// Remove arrays for renderers/scenes/cameras
let fgGravityPoints = [];

// For each foreground experience, keep two gravity points (for two possible views)
for (let i = 0; i < 4; i++) {
    fgGravityPoints[i] = [
        [ { x: 1.5, y: 1.5, z: 0, g: 0.002 }, { x: -1.5, y: -1.5, z: 0, g: 0.002 } ], // left view
        [ { x: 1.5, y: -1.5, z: 0, g: 0.002 }, { x: -1.5, y: 1.5, z: 0, g: 0.002 } ]  // right view
    ];
}


export function init() {
    canvases = [
        document.getElementById('backing-canvas-0'),
        document.getElementById('backing-canvas-1'),
        document.getElementById('fore-canvas-0'),
        document.getElementById('fore-canvas-1')
    ];

    for (let i = 0; i < 4; i++) {
        // Background
        experiences[i].initBackground(canvases[0]);
        // Foreground
        experiences[i].initForeground(canvases[2], spriteTexture);
    }
}

const X_MULT = 3.0;
const Y_MULT = 3.0;

export function run() {
    if (running) return;
    running = true;
    function animate() {
        if (document.hidden) {
            requestAnimationFrame(animate);
            return;
        }
        // Update gravity points for each view's active experience
        for (let view = 0; view < 2; view++) {
            
            const fgIdx = activeForeground[view];
            const { hand0, hand1 } = bodies[1 - view];
            
            if (hand0.length === 2) {
                fgGravityPoints[fgIdx][view][0].x = -(hand0[0] - 0.5) * X_MULT;
                fgGravityPoints[fgIdx][view][0].y = -(hand0[1] - 0.5) * Y_MULT;
            }

            if (hand1.length === 2) {
                fgGravityPoints[fgIdx][view][1].x = -(hand1[0] - 0.5) * X_MULT;
                fgGravityPoints[fgIdx][view][1].y = -(hand1[1] - 0.5) * Y_MULT;
            }
            
        }

        // Only update/render active experiences
        
        for (let view = 0; view < 2; view++) {
            // Background
            const bgIdx = activeBackground[view];
            experiences[bgIdx].updateBackground({
                canvas: canvases[view],
                time: performance.now(),
                view,
            });
            // Foreground
            const fgIdx = activeForeground[view];
            experiences[fgIdx].updateForeground({
                canvas: canvases[view + 2],
                gravityPoints: fgGravityPoints[fgIdx][view],
                time: performance.now(),
                view,
            });
        }
        requestAnimationFrame(animate);
    }
    animate();
}

export { activeBackground, activeForeground };
