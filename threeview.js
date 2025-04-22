import * as THREE from 'three';

let renderers = [], scenes = [], cameras = [], meshes = [], canvases = [];
let worker;
let running = false;
// Define meshTransforms to store rotation data for all cubes in both scenes
let meshTransforms = [
    [ [0,0,0], [0,0,0], [0,0,0], [0,0,0], [0,0,0] ],
    [ [0,0,0], [0,0,0], [0,0,0], [0,0,0], [0,0,0] ]
];

const CUBE_COUNT = 200;

export function init() {
    canvases = [
        document.getElementById('backing-canvas-0'),
        document.getElementById('backing-canvas-1')
    ];

    for (let i = 0; i < 2; i++) {
        const renderer = new THREE.WebGLRenderer({ canvas: canvases[i], preserveDrawingBuffer: true, alpha: true });
        renderer.setSize(canvases[i].width, canvases[i].height, false);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvases[i].width / canvases[i].height, 0.1, 100);
        camera.position.set(0, 0, 5);

        // Create five cubes per scene
        const cubes = [];
        for (let j = 0; j < CUBE_COUNT; j++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x44aa88, roughness: 0.5, metalness: 0.5 });
            const mesh = new THREE.Mesh(geometry, material);
            // Spread cubes out for visibility
            mesh.position.set((j % 10 - 5) * 1.5, Math.floor(j / 10 - 10) * 1.5, -5);
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

    worker = new Worker(new URL('./threeview.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = function(e) {
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < CUBE_COUNT; j++) {
                meshes[i][j].rotation.x += Math.random() * 0.1;
                meshes[i][j].rotation.y += Math.random() * 0.1;
                meshes[i][j].rotation.z += Math.random() * 0.1;
            }
        }
    };
}

export function run() {
    if (running) return;
    running = true;
    function animate() {
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

        for (let i = 0; i < 2; i++) {
            renderers[i].render(scenes[i], cameras[i]);
        }
        requestAnimationFrame(animate);
    }
    animate();
}
