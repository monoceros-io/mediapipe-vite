import * as THREE from 'three';
import { InstancedParticleSystem } from './InstancedParticleSystem.js';
import SmokeSystem from './SmokeSystem.js';
import SparkSystem from './SparkSystem.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const EXPERIENCE_COLOR = 0xffff00;
const FORE_SPRITE_COUNT = 0;
const MAX_LIFE = 1000;
const PARTICLE_FRICTION = 0.97;
const STARFIELD_COUNT = 0;
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
let background = { renderer: null, scene: null, camera: null };
let foreground = { renderer: null, scene: null, camera: null };

let scene, camera;
let chiliParticles = null; // reference to InstancedParticleSystem
let smokeSystem = null; // reference to SmokeSystem
let sparkSystem = null; // reference to SparkSystem
let composer = null; // Post-processing composer

const dummyGeometry = new THREE.SphereGeometry(0.5, 8, 8); // Dummy geometry for instancing
const dummyMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });

const dummyLH = new THREE.Mesh(dummyGeometry, dummyMaterial);
dummyLH.position.set(-5, 4.5, 0);
const dummyRH = new THREE.Mesh(dummyGeometry, dummyMaterial);
dummyRH.position.set(5, -2, 0);
const dummyHH = new THREE.Mesh(dummyGeometry, dummyMaterial);
dummyHH.position.set(0, 6, 0);

const dummyLF = new THREE.Mesh(dummyGeometry, dummyMaterial);
dummyLF.position.set(-3, -6, 0);
const dummyRF = new THREE.Mesh(dummyGeometry, dummyMaterial);
dummyRF.position.set(3, -6, 0);

dummyLH.visible = false;
dummyRH.visible = false;
dummyHH.visible = false;
dummyLF.visible = false;
dummyRF.visible = false;

const dummies = [dummyLH, dummyRH, dummyHH, dummyLF, dummyRF];

// Store initial positions for dummies
const dummyInitialPositions = dummies.map(d => d.position.clone());

// Oscillation parameters for each dummy: [xSpeed, ySpeed, xAmplitude, yAmplitude]
const dummyOscillationParams = [
    [0.7, 4.1, 1.0, 0.7], // dummyLH
    [1.3, 2.8, 0.8, 1.2], // dummyRH
    [0.9, 6.5, 1.1, 1.1],  // dummyHH
];

// In updateBackground, oscillate dummies
function oscillateDummies(time) {
    for (let i = 0; i < 3; i++) {
        const [xSpeed, ySpeed, xAmp, yAmp] = dummyOscillationParams[i];
        const initPos = dummyInitialPositions[i];
        dummies[i].position.x = initPos.x + Math.sin(time * xSpeed) * xAmp;
        dummies[i].position.y = initPos.y + Math.cos(time * ySpeed) * yAmp;
    }
}

const singleChiliPlaneGeometry = new THREE.PlaneGeometry(6, 6);
const singleChiliPlaneMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load('jala/back-single.png'),
    transparent: true,
    depthTest: false,
    depthWrite: false
});

const singleChiliMeshes = [];
const chiliCount = 6;
const chiliRadius = 4;

let smallChiliSin = 0.0;
let bigChiliSin = 0.0;

const BIG_SIN_SPEED = 0.0001; // Speed of big sine wave oscillation
const SMALL_SIN_SPEED = 0.002; // Speed of small sine wave oscillation

// Create a parent group for small chili meshes
const chiliGroup = new THREE.Group();
chiliGroup.position.set(0, 0, 0);


// Move chili mesh creation into the group
for (let i = 0; i < chiliCount; i++) {
    const angle = (i / chiliCount) * Math.PI * 2;
    const mesh = new THREE.Mesh(singleChiliPlaneGeometry, singleChiliPlaneMaterial);
    mesh.position.set(
        Math.cos(angle) * chiliRadius,
        Math.sin(angle) * chiliRadius,
        0
    );
    mesh.rotation.z = angle + Math.PI / 2;
    chiliGroup.add(mesh);
    singleChiliMeshes.push(mesh);
}

const chiliRenderScene = new THREE.Scene();
const chiliRenderCamera = new THREE.PerspectiveCamera(
    45,
    1, // square aspect for canvas texture
    0.1,
    100
);
chiliRenderCamera.position.set(0, 0, 40);

// Add the chili group to the new scene
chiliRenderScene.add(chiliGroup);

// Create a render target for the chili scene
const chiliRenderTarget = new THREE.WebGLRenderTarget(2048, 2048, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
});

// Chromatic aberration shader
const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.005 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        varying vec2 vUv;
        
        void main() {
            vec2 offset = amount * (vUv - 0.5);
            vec4 cr = texture2D(tDiffuse, vUv + offset);
            vec4 cga = texture2D(tDiffuse, vUv);
            vec4 cb = texture2D(tDiffuse, vUv - offset);
            gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
        }
    `
};

export default {
    foreBlendMode: "plus-lighter",

    async initBackground(canvas) {
        // Load chili texture
        const loader = new THREE.TextureLoader();
        starTexture = await new Promise((resolve, reject) => {
            loader.load('jala/six-chili.png', resolve, undefined, reject);
        });
        starTexture.encoding = THREE.sRGBEncoding;

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        renderer.outputEncoding = THREE.sRGBEncoding;

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 20);

        // Set up post-processing after scene and camera are created
        composer = new EffectComposer(renderer);
        
        // Basic render pass
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        
        // Harsh bloom pass
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(canvas.width, canvas.height),
            0.4, // strength - very harsh
            1, // radius
            0.1  // threshold - low threshold for more bloom
        );
        composer.addPass(bloomPass);
        
        // Chromatic aberration pass
        const chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
        chromaticAberrationPass.uniforms.amount.value = 0.008; // Strong aberration
        composer.addPass(chromaticAberrationPass);


        scene.add(dummyLH);
        scene.add(dummyRH);
        scene.add(dummyHH);
        scene.add(dummyLF);
        scene.add(dummyRF);


        // scene.add(chiliGroup);

        // Chili meshes are already created in chiliGroup at the top of the file

        // Starfield planes
        const geometry = new THREE.PlaneGeometry(1, 1);
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
            starScales.push(1);
            starRotations.push((Math.random() * 2 - 1) * MAX_ROT);
        }

        // Instanced particle system — large & in front
        // First render the chili scene to get the texture
        renderer.setRenderTarget(chiliRenderTarget);
        renderer.render(chiliRenderScene, chiliRenderCamera);
        renderer.setRenderTarget(null);
        
        chiliParticles = new InstancedParticleSystem(chiliRenderTarget.texture, 400, 400, 0.075, dummies);
        chiliParticles.position.z = 0; // in front of most stars
        chiliParticles.scale.set(1, 1, 1); // big enough to see
        chiliParticles.renderOrder = 1; // render after stars
        scene.add(chiliParticles);

        // Add smoke system
        smokeSystem = new SmokeSystem(500, 8, dummies);
        smokeSystem.position.set(0, 0, 0);
        smokeSystem.scale.set(2, 2, 2);
        scene.add(smokeSystem);

        // Add spark system
        sparkSystem = new SparkSystem(8000, 6, dummies);
        sparkSystem.position.set(0, 0, 0);
        sparkSystem.scale.set(1, 1, 1);
        scene.add(sparkSystem);


        background.renderer = renderer;
        background.scene = scene;
        background.camera = camera;
    },

    updateBackground({ canvas, time }) {
        if (!background.renderer) return;
        const { renderer } = background;

        oscillateDummies(performance.now() * 0.001); // Use performance.now() for smoother oscillation

        chiliParticles.update();
        smokeSystem.update(time * 0.001); // Convert time to seconds
        sparkSystem.update(time * 0.001); // Convert time to seconds
        
        chiliGroup.rotation.z += Math.sin(smallChiliSin) * Math.sin(bigChiliSin) * Math.PI * 0.02;

        for (let j = 0; j < starPlanes.length; j++) {
            const plane = starPlanes[j];
            // Move towards camera
            plane.position.z += HYPER_SPEED;
            // Rotate
            plane.rotation.z += starRotations[j];
            // Respawn if passed camera
            if (plane.position.z > camera.position.z) {
                plane.position.x = Math.random() * 10 - 5;
                plane.position.y = Math.random() * 10 - 5;
                plane.position.z = Math.random() * -30 - 5;
                starScales[j] = 0;
                starRotations[j] = (Math.random() * 2 - 1) * MAX_ROT;
            }
            // Grow scale if not yet at target
            if (starScales[j] < CHILI_SCALE) {
                starScales[j] = Math.min(1, starScales[j] + CHILI_GROW);
            }
            plane.scale.setScalar(starScales[j]);
        }

        // Animate chili particle system
        if (chiliParticles) {
            chiliParticles.rotation.z += 0.001;
        }

        if (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height) {
            renderer.setSize(canvas.width, canvas.height, false);
            composer.setSize(canvas.width, canvas.height);
        }
        
        // Use composer instead of direct renderer
        composer.render();
        
        if (renderer.domElement !== canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(renderer.domElement, 0, 0);
        }

        smallChiliSin += SMALL_SIN_SPEED;
        bigChiliSin += BIG_SIN_SPEED;

        for (let i = 0; i < singleChiliMeshes.length; i++) {
            const mesh = singleChiliMeshes[i];

            let d = i / singleChiliMeshes.length * 2 * Math.PI; // Spread out over circle

            mesh.position.z = Math.sin(smallChiliSin + d) * Math.sin(bigChiliSin) * 40;
        }

        // Render the chili scene to texture for the instanced particle system
        renderer.setRenderTarget(chiliRenderTarget);
        renderer.render(chiliRenderScene, chiliRenderCamera);
        renderer.setRenderTarget(null);
        
        // Update the instanced particle system texture
        if (chiliParticles) {
            chiliParticles.setTexture(chiliRenderTarget.texture);
        }


    },

    initForeground(canvas, spriteTexture) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);

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
                const distSq = dx * dx + dy * dy + dz * dz + 0.0001;
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
