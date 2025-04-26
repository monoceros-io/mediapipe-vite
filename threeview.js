import * as THREE from 'three';

import BASE_PART_IMG from "/basepart.png";
import { bodies } from './processing';
const spriteTexture = new THREE.TextureLoader().load(BASE_PART_IMG);

let renderers = [], scenes = [], cameras = [], meshes = [], canvases = [];
let worker;
let running = false;
// Define meshTransforms to store rotation data for all cubes in both scenes
let meshTransforms = [
    [ [0,0,0], [0,0,0], [0,0,0], [0,0,0], [0,0,0] ],
    [ [0,0,0], [0,0,0], [0,0,0], [0,0,0], [0,0,0] ]
];

const CUBE_COUNT = 100;
const FORE_SPRITE_COUNT = 50;

// Store sprite velocities and life for each fore-canvas
let foreSpriteVelocities = [
    Array(FORE_SPRITE_COUNT).fill().map(() => [0, 0, 0]),
    Array(FORE_SPRITE_COUNT).fill().map(() => [0, 0, 0])
];
let foreSpriteLife = [
    Array(FORE_SPRITE_COUNT).fill(0),
    Array(FORE_SPRITE_COUNT).fill(0)
];

// Define gravity points for each particle window
const gravityPoints = [
    [ // For fore-canvas-0
        { x: 1.5, y: 1.5, z: 0, g: 0.002 },
        { x: -1.5, y: -1.5, z: 0, g: 0.002 }
    ],
    [ // For fore-canvas-1
        { x: 1.5, y: -1.5, z: 0, g: 0.002 },
        { x: -1.5, y: 1.5, z: 0, g: 0.002 }
    ]
];

// Particle friction constant
const PARTICLE_FRICTION = 0.97;
// Particle max life
const MAX_LIFE = 1000;

// Experience colors: Red, Green, Blue, Yellow
const EXPERIENCE_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];

// Track which background/foreground experience is active in each view (left/right)
let activeBackground = [0, 1]; // default: left=0, right=1
let activeForeground = [0, 1];

// Arrays for 4 backgrounds and 4 foregrounds
let bgRenderers = [], bgScenes = [], bgCameras = [], bgMeshes = [];
let fgRenderers = [], fgScenes = [], fgCameras = [], fgMeshes = [], fgSpriteVelocities = [], fgSpriteLife = [], fgGravityPoints = [];

export function init() {
    canvases = [
        document.getElementById('backing-canvas-0'),
        document.getElementById('backing-canvas-1'),
        document.getElementById('fore-canvas-0'),
        document.getElementById('fore-canvas-1')
    ];

    // Create 4 background experiences
    for (let i = 0; i < 4; i++) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvases[0].width, canvases[0].height, false);
        bgRenderers.push(renderer);
        const scene = new THREE.Scene();
        bgScenes.push(scene);
        const camera = new THREE.PerspectiveCamera(45, canvases[0].width / canvases[0].height, 0.1, 100);
        camera.position.set(0, 0, 5);
        bgCameras.push(camera);
        // Create cubes per scene
        const cubes = [];
        for (let j = 0; j < CUBE_COUNT; j++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const color = EXPERIENCE_COLORS[i];
            const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(
                Math.random() * 10 - 5,
                Math.random() * 10 - 5,
                Math.random() * -10
            );
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            scene.add(mesh);
            cubes.push(mesh);
        }
        bgMeshes.push(cubes);
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);
    }

    // Create 4 foreground experiences
    for (let i = 0; i < 4; i++) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvases[2].width, canvases[2].height, false);
        fgRenderers.push(renderer);
        const scene = new THREE.Scene();
        fgScenes.push(scene);
        const camera = new THREE.PerspectiveCamera(45, canvases[2].width / canvases[2].height, 0.1, 100);
        camera.position.set(0, 0, 5);
        fgCameras.push(camera);
        // Create sprites
        const sprites = [];
        fgSpriteVelocities[i] = [];
        fgSpriteLife[i] = [];
        for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
            const material = new THREE.SpriteMaterial({ 
                map: spriteTexture, 
                color: EXPERIENCE_COLORS[i],
                transparent: true
            });
            const sprite = new THREE.Sprite(material);
            sprite.position.set(
                Math.random() * 4 - 2,
                Math.random() * 4 - 2,
                Math.random() * 4 - 2
            );
            sprite.scale.set(0.2, 0.2, 0.2);
            scene.add(sprite);
            sprites.push(sprite);
            fgSpriteVelocities[i][j] = [
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05
            ];
            fgSpriteLife[i][j] = Math.floor(Math.random() * MAX_LIFE);
        }
        fgMeshes.push(sprites);
        // Gravity points for this experience
        fgGravityPoints[i] = [
            { x: 1.5, y: 1.5, z: 0, g: 0.002 },
            { x: -1.5, y: -1.5, z: 0, g: 0.002 }
        ];
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);
    }

    worker = new Worker(new URL('./threeview.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = function(e) {
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < CUBE_COUNT; j++) {
                meshes[i][j].rotation.x += Math.random() * 0.1;
                meshes[i][j].rotation.y += Math.random() * 0.1;
                meshes[i][j].rotation.z += Math.random() * 0.1;
            }
        }
        // No rotation for sprites
    };
}

const X_MULT = 3.0;
const Y_MULT = 3.0;

export function run() {
    if (running) return;
    running = true;
    function animate() {
        // Only update/render active experiences
        for (let view = 0; view < 2; view++) {
            // Background
            const bgIdx = activeBackground[view];
            // Animate cubes (simple rotation for now)
            for (let j = 0; j < CUBE_COUNT; j++) {
                bgMeshes[bgIdx][j].rotation.x += 0.01;
                bgMeshes[bgIdx][j].rotation.y += 0.01;
            }
            // Render to correct canvas
            bgRenderers[bgIdx].setSize(canvases[view].width, canvases[view].height, false);
            bgRenderers[bgIdx].render(bgScenes[bgIdx], bgCameras[bgIdx]);
            // Copy renderer output to canvas
            const ctx = canvases[view].getContext('2d');
            ctx.clearRect(0, 0, canvases[view].width, canvases[view].height);
            ctx.drawImage(bgRenderers[bgIdx].domElement, 0, 0);

            // Foreground
            const fgIdx = activeForeground[view];
            // Animate sprites
            for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
                const sprite = fgMeshes[fgIdx][j];
                let v = fgSpriteVelocities[fgIdx][j];
                let life = fgSpriteLife[fgIdx][j];
                // Gravity attraction
                for (const pt of fgGravityPoints[fgIdx]) {
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
                sprite.scale.set(0.7 * life / MAX_LIFE, 0.7 * life / MAX_LIFE, 0.7 * life / MAX_LIFE);
                let wrapped = false;
                if (sprite.position.x > 2) { sprite.position.x = -2; wrapped = true; }
                if (sprite.position.x < -2) { sprite.position.x = 2; wrapped = true; }
                if (sprite.position.y > 2) { sprite.position.y = -2; wrapped = true; }
                if (sprite.position.y < -2) { sprite.position.y = 2; wrapped = true; }
                if (sprite.position.z > 2) { sprite.position.z = -2; wrapped = true; }
                if (sprite.position.z < -2) { sprite.position.z = 2; wrapped = true; }
                if (life <= 0 || wrapped) {
                    const respawnPt = fgGravityPoints[fgIdx][Math.floor(Math.random() * fgGravityPoints[fgIdx].length)];
                    sprite.position.set(respawnPt.x, respawnPt.y, respawnPt.z);
                    fgSpriteVelocities[fgIdx][j] = [
                        (Math.random() - 0.5) * 0.05,
                        (Math.random() - 0.5) * 0.05,
                        (Math.random() - 0.5) * 0.05
                    ];
                    life = Math.floor(Math.random() * MAX_LIFE);
                }
                fgSpriteLife[fgIdx][j] = life;
            }
            fgRenderers[fgIdx].setSize(canvases[view+2].width, canvases[view+2].height, false);
            fgRenderers[fgIdx].render(fgScenes[fgIdx], fgCameras[fgIdx]);
            const ctxf = canvases[view+2].getContext('2d');
            ctxf.clearRect(0, 0, canvases[view+2].width, canvases[view+2].height);
            ctxf.drawImage(fgRenderers[fgIdx].domElement, 0, 0);
        }
        requestAnimationFrame(animate);
    }
    animate();
}

export { activeBackground, activeForeground };
