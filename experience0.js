import * as THREE from 'three';
import { InstancedParticleSystem } from './InstancedParticleSystem.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { bodies } from './processing.js';
import { Constellation, Curve, Emitter, Force } from './Constellation.js';

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
let composer = null; // Post-processing composer


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


const nrm = v => (v - 0.5);

let backParticles, backParticlesBig, backParticlesSpirals, frontParticles;

const bigChillies = [];

let leftHandCube, rightHandCube, headCube;

const bigChiliMat = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load('jala/six-chili.png'),
    transparent: true,
    depthTest: false,
    depthWrite: false
});

const bigChiliGeo = new THREE.PlaneGeometry(1, 1);



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
        console.log("SHAFFO", canvas.width, canvas.height);
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
            0.0  // threshold - low threshold for more bloom
        );
        composer.addPass(bloomPass);
        
        // Chromatic aberration pass
        const chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
        chromaticAberrationPass.uniforms.amount.value = 0.015; // Much stronger aberration
        composer.addPass(chromaticAberrationPass);



        // Create hand tracking cubes first
        // Create left hand cube and add a box mesh
        leftHandCube = new THREE.Object3D();

        // Create right hand cube and add a box mesh
        rightHandCube = new THREE.Object3D();
        // Create head cube and add a box mesh
        headCube = new THREE.Object3D();

        const forces = [
            new Force({
                type : "attractor",
                position: leftHandCube.position,
                strength: 10,
                radius: 3
            }),
            new Force({
                type : "attractor",
                position: rightHandCube.position,
                strength: 10,
                radius: 3
            })
        ];

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


        


        background.renderer = renderer;
        background.scene = scene;
        background.camera = camera;

        
        
        backParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, 0, 0),
                    dimensions: new THREE.Vector3(0, 0, 0),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.04, 0.5, 0.05),
            initScaleVariation : new THREE.Vector3( 0.0, 1, 0.0),
            initScaleScalarVariation : 1,
            minLife : 100, maxLife : 2000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.9, v: 1 }, { p: 1, v: 0 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(100, 100, 100),
            initAlpha : 1,
            initAlphaVariation : 1,
            alphaCurve : new Curve([{ p: 0, v: 0 }, { p: 0.9, v: 1 }, { p: 1, v: 0 }]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.5 }])
            },
            lerpToFaceMotion : 1,
            forces : [],
            emitChance : 1,
            emitMinCount : 1,
            emitMaxCount : 20,
            maxCount : 100,
            maxVelocity : 15,
            texture : "basepart.png",
            textureDimensions: new THREE.Vector2(1, 1),
        });
        scene.add(backParticles.object3D);

        
        
        backParticlesBig = new Constellation({
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, 0, 0),
                    dimensions: new THREE.Vector3(1, 1, 1),
                })
            ],
            initScaleBase : new THREE.Vector3( 3.15, 3.15, 3.15),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 6,
            minLife : 1000, maxLife : 5000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(10, 10, 10),
            initAlpha : 0.02,
            initAlphaVariation : 0.1,
            alphaCurve : new Curve([{ p: 0, v: 0 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.5 }])
            },
            forces : [],
            emitChance : 0.5,
            emitMinCount : 1,
            emitMaxCount : 2,
            maxCount : 100,
            maxVelocity : 2,
            texture : "jala/back-pure.png",
            textureDimensions: new THREE.Vector2(1, 1),
        });
        scene.add(backParticlesBig.object3D);
        
        
        backParticlesSpirals = new Constellation({
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, 0, 0),
                    dimensions: new THREE.Vector3(0, 0, 0),
                })
            ],
            initScaleBase : new THREE.Vector3( 2, 2, 2),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 10,
            initRotationVelocityVariation : new THREE.Vector3(0, 0, 4),
            minLife : 2000, maxLife : 5000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.2, v: 1 }, { p: 1, v: 1 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 20),
            initVelocityVariation : new THREE.Vector3(0, 0, 5),
            initAlpha : 0.02,
            initAlphaVariation : 0.02,
            alphaCurve : new Curve([{ p: 0, v: 0 }, { p: 0.2, v: 1 }, { p: 1, v: 0 }]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.5 }])
            },
            forces : [],
            emitChance : 0.04,
            emitMinCount : 1,
            emitMaxCount : 1,
            maxCount : 10,
            maxVelocity : 10,
            texture : "jala/six-chili.png",
            textureDimensions: new THREE.Vector2(1, 1),
        });
        scene.add(backParticlesSpirals.object3D);

        
        frontParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, 0, 0),
                    dimensions: new THREE.Vector3(10, 30, 0),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.5, 0.5, 0.5),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 0.3,
            initRotationVelocityVariation : new THREE.Vector3(0, 0, 4),
            minLife : 2000, maxLife : 5000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 0 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(0, 0, 0),
            initAlpha : 1,
            lerpToFaceMotion : 0.9,
            initAlphaVariation : 0.5,
            alphaCurve : new Curve([{ p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 0 }]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.5 }])
            },
            forces : forces,
            emitChance : 1,
            emitMinCount : 1,
            emitMaxCount : 10,
            maxCount : 100,
            maxVelocity : 10,
            texture : "jala/back-single.png",
            textureDimensions: new THREE.Vector2(1, 1),
        });
        scene.add(frontParticles.object3D);


        for(let i = 0; i < 6; i++) {
            const bigChiliMesh = new THREE.Mesh(bigChiliGeo, bigChiliMat);
            bigChiliMesh.position.set(
                Math.cos((i / 6) * Math.PI * 2) * 2,
                Math.sin((i / 6) * Math.PI * 2) * 2,
                0
            );
            bigChillies.push(bigChiliMesh);
            scene.add(bigChiliMesh);
        }

        

        const smallCubeGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const smallCubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        const leftHandSmallCube = new THREE.Mesh(smallCubeGeometry, smallCubeMaterial);
        leftHandCube.add(leftHandSmallCube);

        const rightHandSmallCube = new THREE.Mesh(smallCubeGeometry, smallCubeMaterial);
        rightHandCube.add(rightHandSmallCube);

        const headSmallCube = new THREE.Mesh(smallCubeGeometry, smallCubeMaterial);
        headCube.add(headSmallCube);

        // Add cubes to the scene
        scene.add(leftHandCube);
        scene.add(rightHandCube);
        scene.add(headCube);
        
        // Position cubes initially visible for testing
        leftHandCube.position.set(-1, 1, 0);
        rightHandCube.position.set(1, -1, 0);

    },

    updateBackground({ canvas, time, view }) {
        if (!background.renderer) return;
        const { renderer } = background;

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

        // Render the chili scene to texture for the instanced particle system
        renderer.setRenderTarget(chiliRenderTarget);
        renderer.render(chiliRenderScene, chiliRenderCamera);
        renderer.setRenderTarget(null);

        backParticles.update();
        backParticlesBig.update();
        backParticlesSpirals.update();
        frontParticles.update();

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
            
            if (hand0.length > 0) {
                // Use smaller scale factor to keep cubes in view
                const targetX = nrm(hand0[0]) * -5;
                const targetY = nrm(hand0[1]) * -5;
                const targetZ = 0;
                // Ease to target position more slowly
                leftHandCube.position.x += (targetX - leftHandCube.position.x) * 0.1;
                leftHandCube.position.y += (targetY - leftHandCube.position.y) * 0.1;
                leftHandCube.position.z += (targetZ - leftHandCube.position.z) * 0.1;
                
            } else {
                // Ease to default visible position more slowly
                leftHandCube.position.x += (-2 - leftHandCube.position.x) * 0.1;
                leftHandCube.position.y += (1 - leftHandCube.position.y) * 0.1;
                leftHandCube.position.z += (0 - leftHandCube.position.z) * 0.1;
                
            }
            
            
            // Position right hand cube
            
            if (hand1.length > 0) {
                // Use smaller scale factor to keep cubes in view
                const targetX = nrm(hand1[0]) * -5;
                const targetY = nrm(hand1[1]) * -5;
                const targetZ = 0;
                // Ease to target position more slowly
                rightHandCube.position.x += (targetX - rightHandCube.position.x) * 0.1;
                rightHandCube.position.y += (targetY - rightHandCube.position.y) * 0.1;
                rightHandCube.position.z += (targetZ - rightHandCube.position.z) * 0.1;
                
            } else {
                // Ease to default visible position more slowly
                rightHandCube.position.x += (2 - rightHandCube.position.x) * 0.1;
                rightHandCube.position.y += (-1 - rightHandCube.position.y) * 0.1;
                rightHandCube.position.z += (0 - rightHandCube.position.z) * 0.1;
                
            }
            
        } else {
            // If no body data, ease cubes to default positions more slowly
            
                leftHandCube.position.x += (-2 - leftHandCube.position.x) * 0.1;
                leftHandCube.position.y += (1 - leftHandCube.position.y) * 0.1;
                leftHandCube.position.z += (0 - leftHandCube.position.z) * 0.1;
            
                rightHandCube.position.x += (2 - rightHandCube.position.x) * 0.1;
                rightHandCube.position.y += (-1 - rightHandCube.position.y) * 0.1;
                rightHandCube.position.z += (0 - rightHandCube.position.z) * 0.1;
            
        }
        

    },

    initForeground(canvas, spriteTexture) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 20);

        sprites = [];
        velocities = [];
        life = [];
        for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
            const material = new THREE.SpriteMaterial({
                map: spriteTexture,
                color   : EXPERIENCE_COLOR,
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

        foreground.renderer = renderer;
        foreground.scene = scene;
        foreground.camera = camera;

 
    },

    updateForeground({ canvas, gravityPoints, time }) {
        const { renderer, scene, camera } = foreground;

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
