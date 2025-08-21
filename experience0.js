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

let backParticles, backParticlesBig, backParticlesSpirals, frontParticles, foregroundParticles, backTrackParticles;

const bigChillies = [];


const bigChiliMat = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load('jala/back-single.png'),
    transparent: true,
    depthTest: false,
    depthWrite: false
});

const bigChiliGeo = new THREE.PlaneGeometry(1, 1);


        // Create hand tracking cubes first
        // Create left hand cube and add a box mesh
const leftHandCube = new THREE.Object3D();
        // Create right hand cube and add a box mesh
const rightHandCube = new THREE.Object3D();


const leftForcePosition = new THREE.Vector3(-2, 1, 0);
const rightForcePosition = new THREE.Vector3(2, 1, 0);


const forces = [
    new Force({
        type : "attractor",
        position: leftForcePosition,
        strength: 100,
        radius: 10,
        suction : 100,
        direction : new THREE.Vector3(0, 0, 1)
    }),
    new Force({
        type : "attractor",
        position: rightForcePosition,
        strength: 100,
        radius: 10,
        suction : 100,
        direction : new THREE.Vector3(0, 0, 1)
    })
];

const bigChiliContainer = new THREE.Object3D();

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
       


        


        background.renderer = renderer;
        background.scene = scene;
        background.camera = camera;

      
        
        
        backParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, 0, 0),
                    dimensions: new THREE.Vector3(10, 10, 10),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.02, 0.2, 0.02),
            initScaleVariation : new THREE.Vector3( 0.0, 0.2, 0.0),
            initScaleScalarVariation : 1,
            minLife : 300, maxLife : 3000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.9, v: 1 }, { p: 1, v: 0 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(2, 2, 2),
            initAlpha : 1,
            initAlphaVariation : 1,
            alphaCurve : new Curve([{ p: 0, v: 0 }, { p: 0.9, v: 1 }, { p: 1, v: 0 }]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.5 }])
            },
            lerpToFaceMotion : 1,
            emitChance : 1,
            forces : forces,
            emitMinCount : 1,
            emitMaxCount : 100,
            maxCount : 2000,
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
            initAlpha : 0.1,
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
            initAlpha : 0.2,
            initAlphaVariation : 0.02,
            alphaCurve : new Curve([{ p: 0, v: 0 }, { p: 0.2, v: 1 }, { p: 1, v: 0 }]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.5 }])
            },
            forces : [],
            emitChance : 0.1,
            emitMinCount : 1,
            emitMaxCount : 1,
            maxCount : 1,
            maxVelocity : 10,
            texture : "jala/six-chili.png",
            textureDimensions: new THREE.Vector2(1, 1),
        });
        scene.add(backParticlesSpirals.object3D);


        scene.add(bigChiliContainer);

        for(let i = 0; i < 6; i++) {
            const bigChiliMesh = new THREE.Mesh(bigChiliGeo, bigChiliMat);
            bigChiliMesh.position.set(
                Math.cos((i / 6) * Math.PI * 2) * 2,
                Math.sin((i / 6) * Math.PI * 2) * 2,
                0
            );
            bigChiliMesh.baseRot = bigChiliMesh.rotation.z = (i / 6) * Math.PI * 2 + Math.PI / 2;
            
            bigChillies.push(bigChiliMesh);
            bigChiliContainer.add(bigChiliMesh);
        }

        

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


        backParticles.update();
        backParticlesBig.update();
        backParticlesSpirals.update();
        const MOVE_SCALE_X = -10;
        const MOVE_SCALE_Y = -25;
        const body = bodies[view];
        if (body) {
            const { hand0, hand1 } = body;
            
            // Position right hand cube
            if (rightHandCube) {
                if (hand1.length > 0) {
                    rightHandCube.position.x += (nrm(hand1[0]) * MOVE_SCALE_X - rightHandCube.position.x) * 0.3;
                    rightHandCube.position.y += (nrm(hand1[1]) * MOVE_SCALE_Y - rightHandCube.position.y) * 0.3;
                }
            }

            if (leftHandCube) {
                if (hand0.length > 0) {
                    leftHandCube.position.x += (nrm(hand0[0]) * MOVE_SCALE_X - leftHandCube.position.x) * 0.3;
                    leftHandCube.position.y += (nrm(hand0[1]) * MOVE_SCALE_Y - leftHandCube.position.y) * 0.3;
                }
            }

        } else {
            // If no body data, ease cubes to default positions more slowly
           
        }

        leftForcePosition.copy(leftHandCube.position);

        rightForcePosition.copy(rightHandCube.position);

        // Ease bigChiliContainer.rotation.z towards target value
        const targetRotationZ = leftHandCube.position.y / 10;
        bigChiliContainer.rotation.z += (targetRotationZ - bigChiliContainer.rotation.z) * 0.1;

        
        // Smoothly ease bigChiliContainer.scale towards targetScale
        const targetScale = Math.max(0.1, 1 + rightHandCube.position.y / 10);
        const ease = 0.08; // Lower = smoother/slower
        const currentScale = bigChiliContainer.scale.x;
        const newScale = currentScale + (targetScale - currentScale) * ease;
        //bigChiliContainer.scale.setScalar(newScale);


        const rhx = rightHandCube.position.y * 0.1;
        const lhx = leftHandCube.position.y * 0.5;

        // Add easing for rotation and z position
        bigChillies.forEach((chili, i) => {
            const targetRotation = chili.baseRot + (rhx * Math.PI * 2);
            const targetZ = lhx * i;

            // Easing factor (0.1 for smoothness, adjust as needed)
            chili.rotation.z += (targetRotation - chili.rotation.z) * 0.1;
        });

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

        

        const smallCubeGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const smallCubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        const leftHandSmallCube = new THREE.Mesh(smallCubeGeometry, smallCubeMaterial);
        //leftHandCube.add(leftHandSmallCube);

        const rightHandSmallCube = new THREE.Mesh(smallCubeGeometry, smallCubeMaterial);
        //rightHandCube.add(rightHandSmallCube);

        // Add cubes to the scene
        scene.add(leftHandCube);
        scene.add(rightHandCube);


 
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
