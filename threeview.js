import * as THREE from 'three';
import BASE_PART_IMG from "/basepart.png";
import { bodies } from './processing';

// Import experience modules
import experience0 from './experience0.js';
import experience1 from './experience1.js';
import experience2 from './experience2.js';
import experience3 from './experience3.js';

const spriteTexture = new THREE.TextureLoader().load(BASE_PART_IMG);

let canvases = [];
let running = false;

const CUBE_COUNT = 100;
const FORE_SPRITE_COUNT = 50;
const PARTICLE_FRICTION = 0.97;
const MAX_LIFE = 1000;
const EXPERIENCE_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];

let activeBackground = [0, 1];
let activeForeground = [0, 1];

// Arrays for 4 backgrounds and 4 foregrounds
let bgRenderers = [], bgScenes = [], bgCameras = [], bgMeshes = [];
let fgRenderers = [], fgScenes = [], fgCameras = [], fgMeshes = [], fgSpriteVelocities = [], fgSpriteLife = [], fgGravityPoints = [];

// For each foreground experience, keep two gravity points (for two possible views)
for (let i = 0; i < 4; i++) {
    fgGravityPoints[i] = [
        [ { x: 1.5, y: 1.5, z: 0, g: 0.002 }, { x: -1.5, y: -1.5, z: 0, g: 0.002 } ], // left view
        [ { x: 1.5, y: -1.5, z: 0, g: 0.002 }, { x: -1.5, y: 1.5, z: 0, g: 0.002 } ]  // right view
    ];
}

const experiences = [experience0, experience1, experience2, experience3];

export function init() {
    canvases = [
        document.getElementById('backing-canvas-0'),
        document.getElementById('backing-canvas-1'),
        document.getElementById('fore-canvas-0'),
        document.getElementById('fore-canvas-1')
    ];

    // Use experience modules to initialize background and foreground scenes
    for (let i = 0; i < 4; i++) {
        // Background
        const bg = experiences[i].initBackground(canvases[0]);
        bgRenderers[i] = bg.renderer;
        bgScenes[i] = bg.scene;
        bgCameras[i] = bg.camera;
        bgMeshes[i] = bg.meshes;

        // Foreground
        const fg = experiences[i].initForeground(canvases[2], spriteTexture);
        fgRenderers[i] = fg.renderer;
        fgScenes[i] = fg.scene;
        fgCameras[i] = fg.camera;
        fgMeshes[i] = fg.sprites;
        fgSpriteVelocities[i] = fg.velocities;
        fgSpriteLife[i] = fg.life;
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
            const cubes = bgMeshes[bgIdx];
            for (let j = 0; j < CUBE_COUNT; j++) {
                const mesh = cubes[j];
                if (bgIdx % 2 === 0) {
                    // Even: rotation
                    mesh.rotation.x += 0.01;
                    mesh.rotation.y += 0.01;
                } else {
                    // Odd: sin oscillating scale
                    const t = performance.now() * 0.001 + j;
                    const s = 0.7 + 0.3 * Math.sin(t + j);
                    mesh.scale.set(s, s, s);
                }
            }
            // Only resize renderer if canvas size changed
            const renderer = bgRenderers[bgIdx];
            const canvas = canvases[view];
            if (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height) {
                renderer.setSize(canvas.width, canvas.height, false);
            }
            renderer.render(bgScenes[bgIdx], bgCameras[bgIdx]);
            // Copy renderer output to canvas only if not the same element
            if (renderer.domElement !== canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(renderer.domElement, 0, 0);
            }
            // Foreground
            const fgIdx = activeForeground[view];
            const sprites = fgMeshes[fgIdx];
            const velocities = fgSpriteVelocities[fgIdx];
            const lifeArr = fgSpriteLife[fgIdx];
            const gravPts = fgGravityPoints[fgIdx][view];
            for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
                const sprite = sprites[j];
                let v = velocities[j];
                let life = lifeArr[j];
                // Gravity attraction (use only this view's gravity points for this experience)
                for (let k = 0; k < gravPts.length; k++) {
                    const pt = gravPts[k];
                    const dx = pt.x - sprite.position.x;
                    const dy = pt.y - sprite.position.y;
                    const dz = pt.z - sprite.position.z;
                    const distSq = dx*dx + dy*dy + dz*dz + 0.0001;
                    const force = pt.g / (distSq / 3);
                    v[0] += force * dx;
                    v[1] += force * dy;
                    v[2] += force * dz;
                }
                v[0] *= PARTICLE_FRICTION;
                v[1] *= PARTICLE_FRICTION;
                v[2] *= PARTICLE_FRICTION;
                sprite.position.x += v[0];
                sprite.position.y += v[1];
                sprite.position.z += v[2];
                life--;
                const scale = 0.7 * life / MAX_LIFE;
                sprite.scale.set(scale, scale, scale);
                let wrapped = false;
                if (sprite.position.x > 2) { sprite.position.x = -2; wrapped = true; }
                if (sprite.position.x < -2) { sprite.position.x = 2; wrapped = true; }
                if (sprite.position.y > 2) { sprite.position.y = -2; wrapped = true; }
                if (sprite.position.y < -2) { sprite.position.y = 2; wrapped = true; }
                if (sprite.position.z > 2) { sprite.position.z = -2; wrapped = true; }
                if (sprite.position.z < -2) { sprite.position.z = 2; wrapped = true; }
                if (life <= 0 || wrapped) {
                    const respawnPt = gravPts[Math.floor(Math.random() * gravPts.length)];
                    sprite.position.set(respawnPt.x, respawnPt.y, respawnPt.z);
                    v[0] = (Math.random() - 0.5) * 0.05;
                    v[1] = (Math.random() - 0.5) * 0.05;
                    v[2] = (Math.random() - 0.5) * 0.05;
                    life = Math.floor(Math.random() * MAX_LIFE);
                }
                lifeArr[j] = life;
            }
            // Only resize renderer if canvas size changed
            const fgRenderer = fgRenderers[fgIdx];
            const fgCanvas = canvases[view+2];
            if (fgRenderer.domElement.width !== fgCanvas.width || fgRenderer.domElement.height !== fgCanvas.height) {
                fgRenderer.setSize(fgCanvas.width, fgCanvas.height, false);
            }
            fgRenderer.render(fgScenes[fgIdx], fgCameras[fgIdx]);
            if (fgRenderer.domElement !== fgCanvas) {
                const ctxf = fgCanvas.getContext('2d');
                ctxf.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
                ctxf.drawImage(fgRenderer.domElement, 0, 0);
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
}

export { activeBackground, activeForeground };
