import * as THREE from 'three';
import SpiralShaderMaterial from './spiral-shader.js';
import { CheeseParticles } from './CheeseParticles.js';
import { PepperParticles } from './PepperParticles.js';
import { bodies } from './processing.js';

const EXPERIENCE_COLOR = 0x00953b;
const CUBE_COUNT = 10;
const FORE_SPRITE_COUNT = 0;
const MAX_LIFE = 1000;
const PARTICLE_FRICTION = 0.97;

const ROT_SPEED = 0.2;

const nrm = v => (v - 0.5);

let sprites = [], velocities = [], life = [];
let cheeseParticles = null;
let pepperParticles = null;
let leftHandCube = null;
let rightHandCube = null;

// Add these to hold internal state
let background = { renderer: null, scene: null, camera: null, spiralMaterial: null };
let foreground = { renderer: null, scene: null, camera: null };

export default {
    foreBlendMode: "normal",
    initBackground(canvas) 
    {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 5);
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        
        // Add three point lights and one ambient light
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight1.position.set(5, 5, 5);
        directionalLight1.target.position.set(0, 0, 0);
        scene.add(directionalLight1);
        scene.add(directionalLight1.target);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight2.position.set(-5, 5, 5);
        directionalLight2.target.position.set(2, -2, 0);
        scene.add(directionalLight2);
        scene.add(directionalLight2.target);

        const directionalLight3 = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight3.position.set(0, -5, -5);
        directionalLight3.target.position.set(-2, 2, 2);
        scene.add(directionalLight3);
        scene.add(directionalLight3.target);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        background.renderer = renderer;
        background.scene = scene;
        background.camera = camera;
    },
    updateBackground({ canvas, time }) {
        const { renderer, scene, camera } = background;
        
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
                color: 0xffffff,
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

        // Create cheese particles in foreground
        cheeseParticles = new CheeseParticles(100);
        scene.add(cheeseParticles.getGroup());

        // Create pepper particles in foreground
        pepperParticles = new PepperParticles(100);
        scene.add(pepperParticles.getGroup());

        // Create hand tracking cubes
        const cubeGeometry = new THREE.BoxGeometry(1.0, 1.0, 1.0);
        const redMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: false,
            opacity: 1.0
        });
        
        leftHandCube = new THREE.Object3D();
        rightHandCube = new THREE.Object3D();

        // Create rotating child objects
        const childGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const childMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        
        const leftChild = new THREE.Mesh(childGeometry, childMaterial);
        leftChild.position.set(0, 0.5, 0);
        leftHandCube.add(leftChild);
        
        const rightChild = new THREE.Mesh(childGeometry, childMaterial);
        rightChild.position.set(0, 0.5, 0);
        rightHandCube.add(rightChild);
        
        // Position cubes initially visible for testing
        leftHandCube.position.set(-2, 0, 0);
        rightHandCube.position.set(2, 0, 0);
        
        scene.add(leftHandCube);
        scene.add(rightHandCube);

        foreground.renderer = renderer;
        foreground.scene = scene;
        foreground.camera = camera;
    },
    updateForeground({ canvas, gravityPoints, time, view }) {
        const { renderer, scene, camera } = foreground;
        
        // Update cheese particles
        if (cheeseParticles) {
            cheeseParticles.update();
        }
        
        // Update pepper particles
        if (pepperParticles) {
            pepperParticles.update();
        }
        
        // Update hand tracking cubes
        // Use the correct skeleton based on view (matching threeview.js logic)
        const body = bodies[1 - view];
        if (body) {
            const { hand0, hand1 } = body;
            
            // Position left hand cube
            if (leftHandCube) {
                if (hand0.length > 0) {
                    // Use smaller scale factor to keep cubes in view
                    const targetX = nrm(hand0[0]) * -5;
                    const targetY = nrm(hand0[1]) * -5;
                    const targetZ = 0;
                    // Ease to target position by 0.5
                    leftHandCube.position.x += (targetX - leftHandCube.position.x) * 0.5;
                    leftHandCube.position.y += (targetY - leftHandCube.position.y) * 0.5;
                    leftHandCube.position.z += (targetZ - leftHandCube.position.z) * 0.5;
                } else {
                    // Ease to default visible position
                    leftHandCube.position.x += (-2 - leftHandCube.position.x) * 0.5;
                    leftHandCube.position.y += (0 - leftHandCube.position.y) * 0.5;
                    leftHandCube.position.z += (0 - leftHandCube.position.z) * 0.5;
                }
            }
            
            // Position right hand cube
            if (rightHandCube) {
                if (hand1.length > 0) {
                    // Use smaller scale factor to keep cubes in view
                    const targetX = nrm(hand1[0]) * -5;
                    const targetY = nrm(hand1[1]) * -5;
                    const targetZ = 0;
                    // Ease to target position by 0.5
                    rightHandCube.position.x += (targetX - rightHandCube.position.x) * 0.5;
                    rightHandCube.position.y += (targetY - rightHandCube.position.y) * 0.5;
                    rightHandCube.position.z += (targetZ - rightHandCube.position.z) * 0.5;
                } else {
                    // Ease to default visible position
                    rightHandCube.position.x += (2 - rightHandCube.position.x) * 0.5;
                    rightHandCube.position.y += (0 - rightHandCube.position.y) * 0.5;
                    rightHandCube.position.z += (0 - rightHandCube.position.z) * 0.5;
                }
            }
        } else {
            // If no body data, ease cubes to default positions
            if (leftHandCube) {
                leftHandCube.position.x += (-2 - leftHandCube.position.x) * 0.5;
                leftHandCube.position.y += (0 - leftHandCube.position.y) * 0.5;
                leftHandCube.position.z += (0 - leftHandCube.position.z) * 0.5;
            }
            if (rightHandCube) {
                rightHandCube.position.x += (2 - rightHandCube.position.x) * 0.5;
                rightHandCube.position.y += (0 - rightHandCube.position.y) * 0.5;
                rightHandCube.position.z += (0 - rightHandCube.position.z) * 0.5;
            }
        }
        
        // Rotate the parent cubes around Z axis
        if (leftHandCube) {
            leftHandCube.rotation.z += ROT_SPEED; // Slow rotation of the parent cube
        }
        if (rightHandCube) {
            rightHandCube.rotation.z -= ROT_SPEED; // Slow rotation of the parent cube
        }
        
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
