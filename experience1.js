import * as THREE from 'three';
import SpiralShaderMaterial from './spiral-shader.js';
import { CheeseParticles } from './CheeseParticles.js';
import { bodies } from './processing.js';
import { Constellation, Curve, Emitter, Force } from './Constellation.js';

const EXPERIENCE_COLOR = 0x00953b;
const ROT_SPEED = 0.1;

// Equilateral triangle geometry centered at origin, side length 1
const a = 1;
const h = Math.sqrt(3) / 2 * a;

// Salt plane geometry
const saltGeo = new THREE.PlaneGeometry(1, 1);

// Paprika plane geometry
const paprikaGeo = new THREE.PlaneGeometry(1, 1);

const nrm = v => (v - 0.5);

let leftHandCube = null;
let rightHandCube = null;
let headCube = null;
let leftChild = null;
let rightChild = null;
let cheeseParticles = null;
let pepperParticles = null;
let saltParticles = null;
let paprikaParticles = null;


// Add these to hold internal state
let background = { renderer: null, scene: null, camera: null, spiralMaterial: null };
let foreground = { renderer: null, scene: null, camera: null };

const leftVortex = new Force({
    type : "vortex",
    position: new THREE.Vector3(-1, 0, 0),
    direction: new THREE.Vector3(-1, 0, 0),
    strength: 1,
    radius: 1,
    suction: 10
});

const rightVortex = new Force({
    type : "vortex",
    position: new THREE.Vector3(1, 0, 0),
    direction: new THREE.Vector3(1, 0, 0),
    strength: 1,
    radius: 1,
    suction: 10
});



const headRepulsor = new Force({
    type : "attractor",
    position: new THREE.Vector3(0, 1.5, 0),
    strength: 10,
    radius: 1
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

        const INIT_FRIC_FLOAT = 1.03;
        const initFrictionBase = new THREE.Vector3(INIT_FRIC_FLOAT, INIT_FRIC_FLOAT, INIT_FRIC_FLOAT);

        cheeseParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, -0.5, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, 3, 0),
                    dimensions: new THREE.Vector3(10, 2, 10),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.1, 0.1, 0.1),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 1,
            minLife : 1000, maxLife : 10000,
            scaleCurve : new Curve([{ p: 0, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(0, 0, 20),
            rotationVelocityCurve : new Curve([{ p: 0, v: 0 }, { p: 1, v: 1 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(0, 0, 0),
            initAlpha : 1,
            initAlphaVariation : 0.1,
            initFrictionBase,
            alphaCurve : new Curve([
                { p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 1 }
            ]),
            forces : forces,
            emitChance : 1,
            emitMinCount : 1,
            emitMaxCount : 10,
            maxCount : 500,
            maxVelocity : 10,
            texture : "part-tex-atlas.png"
        });
        background.scene.add(cheeseParticles.object3D);
        

        pepperParticles = new Constellation({
            gravityForce: new THREE.Vector3(0, 0.5, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(0, -3, 0),
                    dimensions: new THREE.Vector3(10, 2, 10),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.1, 0.1, 0.1),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 1,
            initFrictionBase,
            minLife : 1000, maxLife : 10000,
            scaleCurve : new Curve([{ p: 0, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(0, 0, 20),
            rotationVelocityCurve : new Curve([{ p: 0, v: 0 }, { p: 1, v: 1 }]),
            initVelocityBase : new THREE.Vector3(0, 0, 0),
            initVelocityVariation : new THREE.Vector3(0, 0, 0),
            initAlpha : 1,
            initAlphaVariation : 0.1,
            alphaCurve : new Curve([
                { p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 1 }
            ]),
            forces : forces,
            emitChance : 1,
            emitMinCount : 1,
            emitMaxCount : 10,
            maxCount : 500,
            maxVelocity : 10,
            texture : "salt_and_pepper.png"
        });
        scene.add(pepperParticles.object3D);
 
        
        

        saltParticles = new Constellation({
            geometry : saltGeo,
            gravityForce: new THREE.Vector3(0, 0.5, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(-2, 0, 0),
                    dimensions: new THREE.Vector3(0, 10, 10),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.02, 0.02, 0.02),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 0.0,
            initFrictionBase,
            minLife : 100, maxLife : 10000,
            scaleCurve : new Curve([{ p: 0, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }]),
            initRotationVelocity : new THREE.Vector3(0, 0, 0),
            initRotationVelocityVariation : new THREE.Vector3(20, 20, 20),
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
            maxCount : 9000,
            maxVelocity : 30,
            texture : "basepart.png",
            textureDimensions : new THREE.Vector2(1, 1),
            colours : [0xffffff, 0xffff33, 0xffdd22]
        });
        scene.add(saltParticles.object3D);
        
        
        

        paprikaParticles = new Constellation({
            geometry : paprikaGeo,
            gravityForce: new THREE.Vector3(0, 0.5, 0),
            emitters : [
                new Emitter({
                    position: new THREE.Vector3(2, 0, 0),
                    dimensions: new THREE.Vector3(0, 10, 10),
                })
            ],
            initScaleBase : new THREE.Vector3( 0.02, 0.02, 0.02),
            initScaleVariation : new THREE.Vector3( 0.0, 0.0, 0.0),
            initScaleScalarVariation : 0.0,
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
            forces : forces,
            emitChance : 1,
            emitMinCount : 1,
            emitMaxCount : 100,
            maxCount : 9000,
            maxVelocity : 30,
            texture : "basepart.png",
            textureDimensions : new THREE.Vector2(1, 1),
            colours : [0xffff00, 0xffffcc, 0xffcc44]
        });
        scene.add(paprikaParticles.object3D);

        


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
