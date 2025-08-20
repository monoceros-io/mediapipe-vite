import * as THREE from 'three';
import { bodies } from './processing.js';
import { Constellation, Curve, Emitter, Force } from './Constellation.js';

const EXPERIENCE_COLOR = 0x00953b;
const ROT_SPEED = 0.1;

// Equilateral triangle geometry centered at origin, side length 1
const a = 1;
const h = Math.sqrt(3) / 2 * a;
// Salt triangle geometry
const saltGeo = new THREE.BufferGeometry();
const vertices = new Float32Array([
    0, h / 3, 0,
    -a / 2, -h / 3 * 2, 0,
    a / 2, -h / 3 * 2, 0
]);
saltGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
saltGeo.setIndex([0, 1, 2]);
saltGeo.computeVertexNormals();

// Paprika plane geometry
const paprikaGeo = new THREE.PlaneGeometry(1, 1);

const nrm = v => (v - 0.5);

let leftHandCube = null;
let rightHandCube = null;
let headCube = null;
let cheeseParticles = null;
let pepperParticles = null;
let saltParticles = null;
let paprikaParticles = null;
let backgroundParticles = null;


// Add these to hold internal state
let background = { renderer: null, scene: null, camera: null, spiralMaterial: null };
let foreground = { renderer: null, scene: null, camera: null };

const leftVortexPosition = new THREE.Vector3(-1, 0, 0);
const rightVortexPosition = new THREE.Vector3(1, 0, 0);
const headRepulsorPosition = new THREE.Vector3(0, 1.5, 0);

const leftVortex = new Force({
    type : "vortex",
    position: leftVortexPosition,
    direction: rightVortexPosition,
    strength: 1,
    radius: 2,
    suction: 6
});

const rightVortex = new Force({
    type : "vortex",
    position: rightVortexPosition,
    direction: leftVortexPosition,
    strength: 1,
    radius: 2,
    suction: 6
});

const headRepulsor = new Force({
    type : "attractor",
    position: headRepulsorPosition,
    strength: 1,
    radius: 3
});

const forces = [leftVortex, rightVortex, headRepulsor];


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
        // Create left hand cube and add a box mesh
        leftHandCube = new THREE.Object3D();

        // Create right hand cube and add a box mesh
        rightHandCube = new THREE.Object3D();
        // Create head cube and add a box mesh
        headCube = new THREE.Object3D();

        
        // Position cubes initially visible for testing
        leftHandCube.position.set(-2, 0, 0);
        rightHandCube.position.set(2, 0, 0);

/*         
        leftHandCube.visible = false;
        rightHandCube.visible = false;
        headCube.visible = false;
 */
        scene.add(leftHandCube);
        scene.add(rightHandCube);
        scene.add(headCube);

        const INIT_FRIC_FLOAT = 1.03;
        const initFrictionBase = new THREE.Vector3(INIT_FRIC_FLOAT, INIT_FRIC_FLOAT, INIT_FRIC_FLOAT);

        cheeseParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(1.5, 2, 0),
                    dimensions: new THREE.Vector3(1, 1, 1),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.2, 0.2, 0.2),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 1,
            minLife : 1000, maxLife : 10000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(0, 0, 20),
            rotationVelocityCurve : new Curve([{ p: 0, v: 0 }, { p: 1, v: 1 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(0, 0, 0),
            initAlpha : 1,
            initAlphaVariation : 0,
            initFrictionBase,
            alphaCurve : new Curve([
                { p: 0, v: 1 }, { p: 1, v: 1 }
            ]),
            forces : forces,
            emitChance : 0.5,
            emitMinCount : 1,
            emitMaxCount : 1,
            maxCount : 20,
            maxVelocity : 10,
            texture : "part-tex-atlas.png"
        });
        
        scene.add(cheeseParticles.object3D);
        

        pepperParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(-1.5, 2, 0),
                    dimensions: new THREE.Vector3(1, 1, 1),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.2, 0.2, 0.2),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 1,
            initFrictionBase,
            minLife : 1000, maxLife : 10000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(0, 0, 3),
            rotationVelocityCurve : new Curve([{ p: 0, v: 0 }, { p: 1, v: 1 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(0, 0, 0),
            initAlpha : 1,
            initAlphaVariation : 0,
            alphaCurve : new Curve([
                { p: 0, v: 1 }, { p: 1, v: 1 }
            ]),
            forces : forces,
            emitChance : 0.5,
            emitMinCount : 1,
            emitMaxCount : 1,
            maxCount : 20,
            maxVelocity : 10,
            texture : "salt_and_pepper.png"
        });
        scene.add(pepperParticles.object3D);
 
        
        

        saltParticles = new Constellation({
            geometry : saltGeo,
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(1.5, -2, 0),
                    dimensions: new THREE.Vector3(1, 1, 1),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.01, 0.01, 0.01),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 2.0,
            initFrictionBase,
            minLife : 100, maxLife : 10000,
            scaleCurve : new Curve([{ p: 0, v: 0 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(100, 100, 100),
            rotationVelocityCurve : new Curve([{ p: 0, v: 0 }, { p: 1, v: 1 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(0, 0, 0),
            initAlpha : 1,
            initAlphaVariation : 0.8,
            alphaCurve : new Curve([
                { p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 0 }
            ]),
            forces : forces,
            emitChance : 1,
            emitMinCount : 1,
            emitMaxCount : 100,
            maxCount : 2000,
            maxVelocity : 60,
            textureDimensions : new THREE.Vector2(1, 1),
            colours : [0xffffff, 0xffffff, 0xffffff]
        });
        scene.add(saltParticles.object3D);
        
        
        

        paprikaParticles = new Constellation({
            geometry : paprikaGeo,
            gravityForce: new THREE.Vector3(0, 0, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(-1.5, -2, 0),
                    dimensions: new THREE.Vector3(1, 1, 1),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.01, 0.01, 0.01),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 2.0,
            minLife : 100, maxLife : 10000,
            scaleCurve : new Curve([{ p: 0, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(20, 20, 20),
            rotationVelocityCurve : new Curve([{ p: 0, v: 0 }, { p: 1, v: 1 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(0, 0, 0),
            initAlpha : 1,
            initAlphaVariation : 0.8,
            initFrictionBase,
            alphaCurve : new Curve([
                { p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 0 }
            ]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0 }])
            },
            forces : forces,
            emitChance : 1,
            emitMinCount : 1,
            emitMaxCount : 100,
            maxCount : 4000,
            maxVelocity : 60,
            texture : "basepart.png",
            textureDimensions : new THREE.Vector2(1, 1),
            colours : [0xffff00, 0xffffcc, 0xffcc44]
        });
        scene.add(paprikaParticles.object3D);


        backgroundParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, -0.5, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, 3, 0),
                    dimensions: new THREE.Vector3(6, 0, 0),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.1, 0.1, 0.1),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 20.0,
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(),
            minLife : 3000, maxLife : 12000,
            scaleCurve : new Curve([{ p: 0, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 1 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(0, 0, 2),
            rotationVelocityCurve : new Curve([{ p: 0, v: 0 }, { p: 1, v: 1 }]),
            initAlpha : 1,
            initAlphaVariation : 0,
            alphaCurve : new Curve([
                { p: 0, v: 1 }, { p: 0.5, v: 1 }, { p: 1, v: 1 }
            ]),
            colourCurves : {
                r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
                g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0.3 }]),
                b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 0 }])
            },
            emitChance : 1,
            emitMinCount : 2,
            emitMaxCount : 2,
            maxCount : 100,
            maxVelocity : 60,
            texture : "four-chips.png",
            textureDimensions : new THREE.Vector2(4, 2),
            colours : [0x666666, 0x686868, 0x6a6a6a]
        });
        background.scene.add(backgroundParticles.object3D);

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

        if(saltParticles){
            saltParticles.update();
        }

        if(paprikaParticles){
            paprikaParticles.update();
        }

        if(backgroundParticles){
            backgroundParticles.update();
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
                    
                } else {
                    // Ease to default visible position more slowly
                    leftHandCube.position.x += (-2 - leftHandCube.position.x) * 0.1;
                    leftHandCube.position.y += (0 - leftHandCube.position.y) * 0.1;
                    leftHandCube.position.z += (0 - leftHandCube.position.z) * 0.1;
                   
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
                 
                } else {
                    // Ease to default visible position more slowly
                    rightHandCube.position.x += (2 - rightHandCube.position.x) * 0.1;
                    rightHandCube.position.y += (0 - rightHandCube.position.y) * 0.1;
                    rightHandCube.position.z += (0 - rightHandCube.position.z) * 0.1;
                    
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
        }

        leftVortexPosition.copy(leftHandCube.position).divideScalar(2);
        rightVortexPosition.copy(rightHandCube.position).divideScalar(2);
        headRepulsorPosition.copy(headCube.position).divideScalar(2);

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
