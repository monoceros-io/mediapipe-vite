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

export function init() {
    canvases = [
        document.getElementById('backing-canvas-0'),
        document.getElementById('backing-canvas-1'),
        document.getElementById('fore-canvas-0'),
        document.getElementById('fore-canvas-1')
    ];

    // Backing canvases (cubes)
    for (let i = 0; i < 2; i++) {
        const renderer = new THREE.WebGLRenderer({ canvas: canvases[i], preserveDrawingBuffer: true, alpha: true });
        renderer.setSize(canvases[i].width, canvases[i].height, false);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvases[i].width / canvases[i].height, 0.1, 100);
        camera.position.set(0, 0, 5);

        // Create cubes per scene
        
        const cubes = [];
        for (let j = 0; j < CUBE_COUNT; j++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            // Set color: green for first window, yellow for second
            const color = i === 0 ? 0x00ff00 : 0xffff00;
            const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 });
            const mesh = new THREE.Mesh(geometry, material);
            // Spread cubes out for visibility
            mesh.position.set(
                Math.random() * 10 - 5,
                Math.random() * 10 - 5,
                Math.random() * -10
            );
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            scene.add(mesh);
            cubes.push(mesh);
        }

        renderers.push(renderer);
        scenes.push(scene);
        cameras.push(camera);
        meshes.push(cubes);

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);
    }

    // Fore canvases (sprites)
    for (let i = 0; i < 2; i++) {
        const renderer = new THREE.WebGLRenderer({ canvas: canvases[i+2], preserveDrawingBuffer: true, alpha: true });
        renderer.setSize(canvases[i+2].width, canvases[i+2].height, false);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvases[i+2].width / canvases[i+2].height, 0.1, 100);
        camera.position.set(0, 0, 5);

        // Create 100 sprites with random positions and velocities
        const sprites = [];
        foreSpriteVelocities[i] = [];
        for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
            const material = new THREE.SpriteMaterial({ 
                map: spriteTexture, 
                color: i === 0 ? 0x00ff00 : 0xffff00,
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
            // Assign random velocity
            foreSpriteVelocities[i][j] = [
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05
            ];
            // Assign random life
            foreSpriteLife[i][j] = Math.floor(Math.random() * MAX_LIFE);
        }

        renderers.push(renderer);
        scenes.push(scene);
        cameras.push(camera);
        meshes.push(sprites);

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

        for(let i = 0; i < 2; i++) {
            const { head, hand0, hand1 } = bodies[1 - i];
            
            if(hand0.length === 2) {
                gravityPoints[i][0].x = -(hand0[0] - 0.5) * X_MULT;
                gravityPoints[i][0].y = -(hand0[1] - 0.5) * Y_MULT;
            }
            if(hand1.length === 2) {
                gravityPoints[i][1].x = -(hand1[0] - 0.5) * X_MULT;
                gravityPoints[i][1].y = -(hand1[1] - 0.5) * Y_MULT;
            }
            
        }

        // Update meshTransforms with current rotations before sending to worker
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < CUBE_COUNT; j++) {
                meshTransforms[i][j] = [
                    meshes[i][j].rotation.x,
                    meshes[i][j].rotation.y,
                    meshes[i][j].rotation.z
                ];
            }
        }
        worker.postMessage(meshTransforms);

        // Animate sprites in fore canvases
        for (let i = 0; i < 2; i++) {
            const sprites = meshes[i+2];
            for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
                const sprite = sprites[j];
                let v = foreSpriteVelocities[i][j];
                let life = foreSpriteLife[i][j];
                // Gravity attraction (use only this window's gravity points)
                for (const pt of gravityPoints[i]) {
                    const dx = pt.x - sprite.position.x;
                    const dy = pt.y - sprite.position.y;
                    const dz = pt.z - sprite.position.z;
                    const distSq = dx*dx + dy*dy + dz*dz + 0.0001;
                    const force = pt.g / (distSq / 3);
                    v[0] += force * dx;
                    v[1] += force * dy;
                    v[2] += force * dz;
                }
                // Apply friction
                v[0] *= PARTICLE_FRICTION;
                v[1] *= PARTICLE_FRICTION;
                v[2] *= PARTICLE_FRICTION;
                // Move sprite
                sprite.position.x += v[0];
                sprite.position.y += v[1];
                sprite.position.z += v[2];
                // Decrement life
                life--;
                // Scale by life
                sprite.scale.set(0.7 * life / MAX_LIFE, 0.7 * life / MAX_LIFE, 0.7 * life / MAX_LIFE);
                // Respawn if life is zero or out of bounds
                let wrapped = false;
                if (sprite.position.x > 2) { sprite.position.x = -2; wrapped = true; }
                if (sprite.position.x < -2) { sprite.position.x = 2; wrapped = true; }
                if (sprite.position.y > 2) { sprite.position.y = -2; wrapped = true; }
                if (sprite.position.y < -2) { sprite.position.y = 2; wrapped = true; }
                if (sprite.position.z > 2) { sprite.position.z = -2; wrapped = true; }
                if (sprite.position.z < -2) { sprite.position.z = 2; wrapped = true; }
                if (life <= 0 || wrapped) {
                    // Respawn at a random gravity point for this view
                    const respawnPt = gravityPoints[i][Math.floor(Math.random() * gravityPoints[i].length)];
                    sprite.position.set(
                        respawnPt.x,
                        respawnPt.y,
                        respawnPt.z
                    );
                    foreSpriteVelocities[i][j] = [
                        (Math.random() - 0.5) * 0.05,
                        (Math.random() - 0.5) * 0.05,
                        (Math.random() - 0.5) * 0.05
                    ];
                    life = Math.floor(Math.random() * MAX_LIFE);
                }
                foreSpriteLife[i][j] = life;
            }
        }

        // Render all four scenes (including animated sprites)
        for (let i = 0; i < 4; i++) {
            renderers[i].render(scenes[i], cameras[i]);
        }
        requestAnimationFrame(animate);
    }
    animate();
}
