import * as THREE from 'three';
import SpiralShaderMaterial from './spiral-shader.js';

const EXPERIENCE_COLOR = 0x5c0f8b;
const CUBE_COUNT = 10;
const FORE_SPRITE_COUNT = 100;
const MAX_LIFE = 1000;
const PARTICLE_FRICTION = 0.97;

let cubes = [];
let sprites = [], velocities = [], life = [];

// Add these to hold internal state
let background = { renderer: null, scene: null, camera: null, spiralMaterial: null };
let foreground = { renderer: null, scene: null, camera: null };

export default {
    foreBlendMode: "plus-lighter",
    initBackground(canvas) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 5);
        const geometry = new THREE.ConeGeometry(1, 1.5, 4);
        cubes = [];
        for (let j = 0; j < CUBE_COUNT; j++) {
            const material = new THREE.MeshStandardMaterial({ color: EXPERIENCE_COLOR, roughness: 0.5, metalness: 0.5 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * -10);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            scene.add(mesh);
            cubes.push(mesh);
        }

        // Add spiral-shader plane to background
        const spiralGeometry = new THREE.PlaneGeometry(3, 3);
        const spiralMaterial = SpiralShaderMaterial([0.3608, 0.1725, 0.5255]); // BLUE
        spiralMaterial.uniforms.rot_points.value = Float32Array.from({length: 100}, (_, i) => {
            const idx = i % 5;
            if (idx === 0) return Math.random() * Math.PI * 2;
            if (idx === 1) return 0.2 + Math.random() * 0.2;
            if (idx === 2) return Math.random() * 0.2;
            if (idx === 3) return 0.5 + Math.random() * 0.5;
            if (idx === 4) return 0.01 + Math.random() * 0.03;
        });
        const spiralPlane = new THREE.Mesh(spiralGeometry, spiralMaterial);
        spiralPlane.position.set(0, 0, -2.5);
        spiralPlane.scale.set(3, 3, 1);
        scene.add(spiralPlane);
        background.spiralMaterial = spiralMaterial;

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);
        background.renderer = renderer;
        background.scene = scene;
        background.camera = camera;
    },
    updateBackground({ canvas, time }) {
        const { renderer, scene, camera, spiralMaterial } = background;
        for (let j = 0; j < cubes.length; j++) {
            cubes[j].rotation.x += 0.01;
            cubes[j].rotation.y += 0.01;
            cubes[j].rotation.z += 0.01;
        }

        // Animate spiral points: angle += speed
        if (spiralMaterial) {
            const arr = spiralMaterial.uniforms.rot_points.value;
            for (let i = 0; i < 100; i += 5) {
                arr[i] += arr[i + 4];
                if (arr[i] > Math.PI * 2) arr[i] -= Math.PI * 2;
            }
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
                // color: EXPERIENCE_COLOR,
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
