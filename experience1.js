import * as THREE from 'three';
import SpiralShaderMaterial from './spiral-shader.js';
import { CheeseParticles } from './CheeseParticles.js';
import { bodies } from './processing.js';

const EXPERIENCE_COLOR = 0x00953b;
const ROT_SPEED = 0.1;

const nrm = v => (v - 0.5);

let leftHandCube = null;
let rightHandCube = null;
let headCube = null;
let leftChild = null;
let rightChild = null;
let cheeseParticles = null;
let pepperParticles = null;
let centerParticles = null;

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
        
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);

        // Create hand tracking cubes first
        leftHandCube = new THREE.Object3D();
        rightHandCube = new THREE.Object3D();
        headCube = new THREE.Object3D();

        // Create rotating child objects
        const childGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const childMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        
        leftChild = new THREE.Mesh(childGeometry, childMaterial);
        leftChild.position.set(0, 0.5, 0);
        leftHandCube.add(leftChild);
        
        rightChild = new THREE.Mesh(childGeometry, childMaterial);
        rightChild.position.set(0, 0.5, 0);
        rightHandCube.add(rightChild);


        // Add cube children to the hand objects
        const cubeGeometry = new THREE.BoxGeometry(1.0, 1.0, 1.0);
        const redMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: false,
            opacity: 1.0
        });
        
        const leftCube = new THREE.Mesh(cubeGeometry, redMaterial);
        leftCube.position.set(0, 0, 0); // At the parent center
        leftHandCube.add(leftCube);
        
        const rightCube = new THREE.Mesh(cubeGeometry, redMaterial);
        rightCube.position.set(0, 0, 0); // At the parent center
        rightHandCube.add(rightCube);
        
        // Position cubes initially visible for testing
        leftHandCube.position.set(-2, 0, 0);
        rightHandCube.position.set(2, 0, 0);

        
        leftChild.visible = false;
        rightChild.visible = false;
        leftHandCube.visible = false;
        rightHandCube.visible = false;
        headCube.visible = false;

        scene.add(leftHandCube);
        scene.add(rightHandCube);
        scene.add(headCube);

        // Create cheese particles - attracted to both hands
        cheeseParticles = new CheeseParticles(
            400, // Number of particles
            [leftChild, rightChild], // Attracted to both hand spheres
            'public/part-tex-atlas.png', 
            { x: 1.5, y: 2.15, z: 0 }, // Right side of screen, at the top
            null, // No color - use texture
            0.01, // Base scale
            0.03 // Scale range
        );
        scene.add(cheeseParticles.getGroup());

        // Create pepper particles - attracted to both hands
        pepperParticles = new CheeseParticles(
            400, // Number of particles
            [leftChild, rightChild], // Attracted to both hand spheres
            'public/salt_and_pepper.png', 
            { x: -1.5, y: 2.15, z: 0 }, // Left side of screen, at the top
            null, // No color - use texture
            0.01, // Base scale
            0.03 // Scale range
        );
        scene.add(pepperParticles.getGroup());

        // Create center particles - attracted to both hands
        centerParticles = new CheeseParticles(
            400, // Number of particles
            [leftChild, rightChild], // Attracted to both hand spheres
            'public/basepart.png', // Base part texture
            { x: 0, y: 2.15, z: 0 }, // Center of screen, at the top
            null, // No color - use texture
            0.02, // Base scale
            0.04 // Scale range
        );
        scene.add(centerParticles.getGroup());

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
        
        // Update center particles
        if (centerParticles) {
            centerParticles.update();
        }
        
        // Update hand tracking cubes
        // Use the correct skeleton based on view (matching threeview.js logic)
        const body = bodies[1 - view];
        if (body) {
            const { hand0, hand1 } = body;
            
            // Position head cube using body.head data
            if (headCube && body.head && body.head.length > 0) {
                const targetX = nrm(body.head[0]) * -5;
                const targetY = nrm(body.head[1]) * -5;
                const targetZ = body.head[2] || 0;
                headCube.position.x += (targetX - headCube.position.x) * 0.25;
                headCube.position.y += (targetY - headCube.position.y) * 0.25;
                headCube.position.z += (targetZ - headCube.position.z) * 0.25;
            }
            
            // Position left hand cube
            if (leftHandCube) {
                if (hand0.length > 0) {
                    // Use smaller scale factor to keep cubes in view
                    const targetX = nrm(hand0[0]) * -5;
                    const targetY = nrm(hand0[1]) * -5;
                    const targetZ = 0;
                    // Ease to target position more slowly
                    leftHandCube.position.x += (targetX - leftHandCube.position.x) * 0.1;
                    leftHandCube.position.y += (targetY - leftHandCube.position.y) * 0.1;
                    leftHandCube.position.z += (targetZ - leftHandCube.position.z) * 0.1;
                    
                    // Update left sphere based on hand Y position
                    if (leftChild) {
                        const handY = nrm(hand0[1]); // -0.5 to 0.5
                        const distance = 0.5 + Math.abs(handY) * 2; // 0.5 to 2.5 distance
                        leftChild.position.y = distance;
                    }
                } else {
                    // Ease to default visible position more slowly
                    leftHandCube.position.x += (-2 - leftHandCube.position.x) * 0.1;
                    leftHandCube.position.y += (0 - leftHandCube.position.y) * 0.1;
                    leftHandCube.position.z += (0 - leftHandCube.position.z) * 0.1;
                    
                    // Reset left sphere to default position
                    if (leftChild) {
                        leftChild.position.y = 0.5;
                    }
                }
            }
            
            // Position right hand cube
            if (rightHandCube) {
                if (hand1.length > 0) {
                    // Use smaller scale factor to keep cubes in view
                    const targetX = nrm(hand1[0]) * -5;
                    const targetY = nrm(hand1[1]) * -5;
                    const targetZ = 0;
                    // Ease to target position more slowly
                    rightHandCube.position.x += (targetX - rightHandCube.position.x) * 0.1;
                    rightHandCube.position.y += (targetY - rightHandCube.position.y) * 0.1;
                    rightHandCube.position.z += (targetZ - rightHandCube.position.z) * 0.1;
                    
                    // Update right sphere based on hand Y position
                    if (rightChild) {
                        const handY = nrm(hand1[1]); // -0.5 to 0.5
                        const distance = 0.5 + Math.abs(handY) * 2; // 0.5 to 2.5 distance
                        rightChild.position.y = distance;
                    }
                } else {
                    // Ease to default visible position more slowly
                    rightHandCube.position.x += (2 - rightHandCube.position.x) * 0.1;
                    rightHandCube.position.y += (0 - rightHandCube.position.y) * 0.1;
                    rightHandCube.position.z += (0 - rightHandCube.position.z) * 0.1;
                    
                    // Reset right sphere to default position
                    if (rightChild) {
                        rightChild.position.y = 0.5;
                    }
                }
            }
        } else {
            // If no body data, ease cubes to default positions more slowly
            if (leftHandCube) {
                leftHandCube.position.x += (-2 - leftHandCube.position.x) * 0.1;
                leftHandCube.position.y += (0 - leftHandCube.position.y) * 0.1;
                leftHandCube.position.z += (0 - leftHandCube.position.z) * 0.1;
            }
            if (rightHandCube) {
                rightHandCube.position.x += (2 - rightHandCube.position.x) * 0.1;
                rightHandCube.position.y += (0 - rightHandCube.position.y) * 0.1;
                rightHandCube.position.z += (0 - rightHandCube.position.z) * 0.1;
            }
            // Reset spheres to default positions
            if (leftChild) leftChild.position.y = 0.5;
            if (rightChild) rightChild.position.y = 0.5;
        }
        
        // Rotate the parent cubes around Z axis with speed and direction based on hand Y position
        if (leftHandCube) {
            let rotSpeed = ROT_SPEED;
            if (body && body.hand0.length > 0) {
                const handY = nrm(body.hand0[1]); // -0.5 to 0.5
                rotSpeed = ROT_SPEED * (1 + Math.abs(handY) * 3); // 1x to 4x speed
                // Change direction based on hand height: positive Y (higher) = positive rotation
                if (handY > 0) {
                    leftHandCube.rotation.z += rotSpeed;
                } else {
                    leftHandCube.rotation.z -= rotSpeed;
                }
            } else {
                leftHandCube.rotation.z += rotSpeed; // Default positive rotation
            }
        }
        if (rightHandCube) {
            let rotSpeed = ROT_SPEED;
            if (body && body.hand1.length > 0) {
                const handY = nrm(body.hand1[1]); // -0.5 to 0.5
                rotSpeed = ROT_SPEED * (1 + Math.abs(handY) * 3); // 1x to 4x speed
                // Change direction based on hand height: positive Y (higher) = negative rotation (opposite of left)
                if (handY > 0) {
                    rightHandCube.rotation.z -= rotSpeed;
                } else {
                    rightHandCube.rotation.z += rotSpeed;
                }
            } else {
                rightHandCube.rotation.z -= rotSpeed; // Default negative rotation
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
    }
};
