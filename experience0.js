import * as THREE from 'three';

const EXPERIENCE_COLOR = 0xff0000;
const FORE_SPRITE_COUNT = 50;
const MAX_LIFE = 1000;
const PARTICLE_FRICTION = 0.97;

const STARFIELD_COUNT = 100;
let starPlanes = [];
let starVelocities = [];
let starTexture = null;

let sprites = [], velocities = [], life = [];

// Add these to hold internal state
let background = { renderer: null, scene: null, camera: null };
let foreground = { renderer: null, scene: null, camera: null };

let scene, camera;

export default {
    async initBackground(canvas) {
        // Load chili texture
        const loader = new THREE.TextureLoader();
        starTexture = await new Promise((resolve, reject) => {
            loader.load('chili.png', resolve, undefined, reject);
        });

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 5);

        // Starfield planes
        const geometry = new THREE.PlaneGeometry(0.4, 0.4);
        starPlanes = [];
        starVelocities = [];
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
            // Give each star a random z velocity (towards camera)

            starVelocities.push(0.05 + Math.random() * 0.07);
        }
        // No lighting needed for unlit material
        background.renderer = renderer;
        background.scene = scene;
        background.camera = camera;
    },
    updateBackground({ canvas, time }) {
        const { renderer } = background;

        for (let j = 0; j < starPlanes.length; j++) {
            const plane = starPlanes[j];
            // Move towards camera

            plane.position.z += starVelocities[j];
            // Respawn if passed camera
            if (plane.position.z > camera.position.z) {
                plane.position.x = Math.random() * 10 - 5;
                plane.position.y = Math.random() * 10 - 5;
                plane.position.z = Math.random() * -30 - 5;
                starVelocities[j] = 0.05 + Math.random() * 0.07;
            }
            // Always face the camera
            plane.lookAt(camera.position);
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
