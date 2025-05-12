import * as THREE from 'three';
import SpiralShaderMaterial from './spiral-shader.js';

const EXPERIENCE_COLOR = 0xff0000;
const FORE_SPRITE_COUNT = 20;
const MAX_LIFE = 1000;
const PARTICLE_FRICTION = 0.97;
const STARFIELD_COUNT = 50;
const CHILI_SCALE = 2;
const CHILI_GROW = 0.08; // How fast chilis grow in (per frame)
const HYPER_SPEED = 0.19; // Constant speed for all chilis
const MAX_ROT = 0.08; // Maximum rotation speed (radians per frame)

let starPlanes = [];
let starScales = []; // Track scale scalar for each chili
let starRotations = []; // Track rotation speed for each chili
let starTexture = null;

let sprites = [], velocities = [], life = [];

// Add these to hold internal state
let background = { renderer: null, scene: null, camera: null, spiralMaterial: null };
let foreground = { renderer: null, scene: null, camera: null };

let scene, camera;

export default {
    foreBlendMode: "plus-lighter",
    async initBackground(canvas) {
        // Load chili texture
        const loader = new THREE.TextureLoader();
        starTexture = await new Promise((resolve, reject) => {
            loader.load('chili.png', resolve, undefined, reject);
        });
        // Ensure correct color space for texture
        starTexture.encoding = THREE.sRGBEncoding;

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        // Ensure renderer outputs sRGB
        renderer.outputEncoding = THREE.sRGBEncoding;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 5);

        // Starfield planes
        const geometry = new THREE.PlaneGeometry(0.4, 0.4);
        starPlanes = [];
        starScales = [];
        starRotations = [];
        for (let j = 0; j < STARFIELD_COUNT; j++) {
            const material = new THREE.MeshBasicMaterial({
                map: starTexture,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(
                Math.random() * 10 - 5,
                Math.random() * 10 - 5,
                Math.random() * -30 - 5
            );
            scene.add(mesh);
            starPlanes.push(mesh);
            // Start with full scale
            starScales.push(1);
            // Assign random rotation speed between -MAX_ROT and MAX_ROT
            starRotations.push((Math.random() * 2 - 1) * MAX_ROT);
        }

        // Add spiral-shader plane to background
        const spiralGeometry = new THREE.PlaneGeometry(3, 3);
        const spiralMaterial = SpiralShaderMaterial([1, 0, 0]); // RED
        spiralMaterial.uniforms.rot_points.value = Float32Array.from({length: 100}, (_, i) => {
            const idx = i % 5;
            if (idx === 0) return Math.random() * Math.PI * 2; // angle
            if (idx === 1) return 0.2 + Math.random() * 0.2;   // range
            if (idx === 2) return Math.random() * 0.2;         // start
            if (idx === 3) return 0.5 + Math.random() * 0.5;   // alpha
            if (idx === 4) return 0.01 + Math.random() * 0.03; // speed
        });
        const spiralPlane = new THREE.Mesh(spiralGeometry, spiralMaterial);
        spiralPlane.position.set(0, 0, -20);
        spiralPlane.scale.set(10, 10, 1);
        scene.add(spiralPlane);
        background.spiralMaterial = spiralMaterial;

        // No lighting needed for unlit material
        background.renderer = renderer;
        background.scene = scene;
        background.camera = camera;
    },
    updateBackground({ canvas, time }) {
        if (!background.renderer) return;
        const { renderer, spiralMaterial } = background;

        // Animate spiral points: angle += speed
        if (spiralMaterial) {
            const arr = spiralMaterial.uniforms.rot_points.value;
            for (let i = 0; i < 100; i += 5) {
                arr[i] += arr[i + 4];
                if (arr[i] > Math.PI * 2) arr[i] -= Math.PI * 2;
            }
        }

        for (let j = 0; j < starPlanes.length; j++) {
            const plane = starPlanes[j];
            // Move towards camera
            plane.position.z += HYPER_SPEED;
            // Rotate through Y
            plane.rotation.z += starRotations[j];
            // Respawn if passed camera
            if (plane.position.z > camera.position.z) {
                plane.position.x = Math.random() * 10 - 5;
                plane.position.y = Math.random() * 10 - 5;
                plane.position.z = Math.random() * -30 - 5;
                // Set scale scalar to 0 for grow-in effect
                starScales[j] = 0;
                // Assign new random rotation speed
                starRotations[j] = (Math.random() * 2 - 1) * MAX_ROT;
            }
            // Grow scale if not yet 1
            if (starScales[j] < CHILI_SCALE) {
                starScales[j] = Math.min(1, starScales[j] + CHILI_GROW);
            }
            plane.scale.setScalar(starScales[j]);
            // Always face the camera
            // plane.lookAt(camera.position);
        }
        if (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height) {
            renderer.setSize(canvas.width, canvas.height, false);
        }
        renderer.render(scene, camera);
        if (renderer.domElement !== canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(renderer.domElement, 0, 0);
        }
    },
    initForeground(canvas, spriteTexture) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 5);
        sprites = [];
        velocities = [];
        life = [];
        for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
            const material = new THREE.SpriteMaterial({ 
                map: spriteTexture, 
                color: EXPERIENCE_COLOR,
                transparent: true
            });
            const sprite = new THREE.Sprite(material);
            sprite.position.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2);
            sprite.scale.set(0.2, 0.2, 0.2);
            scene.add(sprite);
            sprites.push(sprite);
            velocities[j] = [
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05
            ];
            life[j] = Math.floor(Math.random() * MAX_LIFE);
        }
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);

        foreground.renderer = renderer;
        foreground.scene = scene;
        foreground.camera = camera;
    },
    updateForeground({ canvas, gravityPoints, time }) {
        const { renderer, scene, camera } = foreground;

        for (let j = 0; j < sprites.length; j++) {
            const sprite = sprites[j];
            let v = velocities[j];
            let l = life[j];
            for (let k = 0; k < gravityPoints.length; k++) {
                const pt = gravityPoints[k];
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
            l--;
            const scale = 0.7 * l / MAX_LIFE;
            sprite.scale.set(scale, scale, scale);
            let wrapped = false;
            if (sprite.position.x > 2) { sprite.position.x = -2; wrapped = true; }
            if (sprite.position.x < -2) { sprite.position.x = 2; wrapped = true; }
            if (sprite.position.y > 2) { sprite.position.y = -2; wrapped = true; }
            if (sprite.position.y < -2) { sprite.position.y = 2; wrapped = true; }
            if (sprite.position.z > 2) { sprite.position.z = -2; wrapped = true; }
            if (sprite.position.z < -2) { sprite.position.z = 2; wrapped = true; }
            if (l <= 0 || wrapped) {
                const respawnPt = gravityPoints[Math.floor(Math.random() * gravityPoints.length)];
                sprite.position.set(respawnPt.x, respawnPt.y, respawnPt.z);
                v[0] = (Math.random() - 0.5) * 0.05;
                v[1] = (Math.random() - 0.5) * 0.05;
                v[2] = (Math.random() - 0.5) * 0.05;
                l = Math.floor(Math.random() * MAX_LIFE);
            }
            life[j] = l;
        }
        if (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height) {
            renderer.setSize(canvas.width, canvas.height, false);
        }
        renderer.render(scene, camera);
        if (renderer.domElement !== canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(renderer.domElement, 0, 0);
        }
    }
};
