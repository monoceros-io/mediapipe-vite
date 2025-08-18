import * as THREE from 'three';

function createConstellationShaderMaterial(texture, atlasCellSize, opts = {}) {
    return new THREE.ShaderMaterial({
        uniforms: {
            map: { value: texture },
            atlasCellSize: { value: atlasCellSize }
        },
        vertexShader: `
            uniform vec2 atlasCellSize;
            attribute vec2 instanceUVOffset;
            attribute float instanceAlpha;
            varying vec3 vColor;
            varying vec2 vUvAtlas;
            varying float vAlpha;
            void main() {
                vColor = instanceColor;
                vAlpha = instanceAlpha;
                // Calculate atlas UV
                vUvAtlas = uv * atlasCellSize + instanceUVOffset;
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            varying vec3 vColor;
            varying vec2 vUvAtlas;
            varying float vAlpha;
            void main() {
                vec4 tex = texture2D(map, vUvAtlas);
                gl_FragColor = vec4(tex.rgb * vColor, tex.a * vAlpha);
            }
        `,
    transparent: true,
    depthWrite: opts.depthWrite ?? false,
    depthTest: opts.depthTest ?? false
    });
}


const CONSTELLATION_DEFAULT_GEO = new THREE.PlaneGeometry(1, 1);
const CONSTELLATION_DEFAULT_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const r = (rng) => Math.random() * rng - rng / 2;
const PI2 = Math.PI * 2;

function Force(props = {}) {
    const {
        type = "wind_box",
        position = new THREE.Vector3(0, -4, 0),
        dimensions = new THREE.Vector3(10, 4, 4),
        direction = new THREE.Vector3(2, 0, 0),
        strength = 10,
        radius = 10,
        suction = 0
    } = props;

    this.type = type;
    this.position = position;
    this.direction = direction;
    this.strength = strength;
    this.dimensions = dimensions;
    this.radius = radius;
    this.suction = suction;

    this.checkEffect = (point, particle, delta) => {
        switch (type) {
            case "wind_box":
                {
                    const min = this.position.clone().sub(this.dimensions.clone().multiplyScalar(0.5));
                    const max = this.position.clone().add(this.dimensions.clone().multiplyScalar(0.5));
                    if (
                        point.x >= min.x && point.x <= max.x &&
                        point.y >= min.y && point.y <= max.y &&
                        point.z >= min.z && point.z <= max.z
                    ) {
                        // Apply wind force directly to velocity
                        if (particle && particle.velocity) {
                            particle.velocity.add(this.direction.clone().multiplyScalar(this.strength * delta));
                        }
                    }
                    break;
                }
            case "vortex":
                {
                    // Vortex: spin is inversely proportional to distance from center (faster near center)
                    // Also applies suction toward the center, controlled by this.suction
                    const dir = point.clone().sub(this.position);
                    const distSq = dir.lengthSq();
                    const minDist = 0.1; // avoid infinite force at center
                    const radius = this.radius !== undefined ? this.radius : 10;
                    const dist = Math.sqrt(distSq);
                    if (dist > minDist && dist < radius) {
                        // Axis of vortex
                        let axis = (this.direction && this.direction.lengthSq() > 0) ? this.direction.clone().normalize() : new THREE.Vector3(0, 1, 0);
                        // Perpendicular vector to axis and dir
                        let perp = new THREE.Vector3().crossVectors(axis, dir).normalize();
                        // Spin force: increases as particle gets closer to center
                        const forceMag = this.strength * (radius / dist);
                        if (particle && particle.velocity) {
                            // Spin force
                            particle.velocity.add(perp.multiplyScalar(forceMag * delta));
                            // Push in vortex axis direction (optional, keep if you want axial flow)
                            particle.velocity.add(axis.clone().multiplyScalar(forceMag * delta * 0.2));
                            // Suction toward center, stronger as particle gets closer
                            if (this.suction && this.suction !== 0) {
                                let toCenter = this.position.clone().sub(point);
                                let distToCenter = toCenter.length();
                                if (distToCenter > 0.01) {
                                    toCenter.normalize();
                                    // Suction scales as 1/dist, capped
                                    const suctionMag = this.suction * (1 / distToCenter);
                                    particle.velocity.add(toCenter.multiplyScalar(suctionMag * delta));
                                }
                            }
                        }
                    }
                    break;
                }
            case "attractor": {
                // Attractor: pulls toward this.position, falloff with square of radius
                const dir = this.position.clone().sub(point);
                const distSq = dir.lengthSq();
                const minDistSq = 1.0; // Minimum squared distance to avoid huge forces
                if (distSq > minDistSq) {
                    dir.normalize();
                    // Use 1/distSq falloff
                    const forceMag = this.strength / distSq;
                    if (particle && particle.velocity) {
                        particle.velocity.add(dir.multiplyScalar(forceMag * delta));
                    }
                }
                break;
            }
        }
    }
}
// ...existing code...

function Curve(points = [
    { p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 0 }
]) {
    this.points = points;
    this.points.sort((a, b) => a.p - b.p);

    this.getValueAtPoint = point => {
        if (point <= this.points[0].p) return this.points[0].v;
        if (point >= this.points[this.points.length - 1].p) return this.points[this.points.length - 1].v;

        for (let i = 0; i < this.points.length - 1; i++) {
            const a = this.points[i];
            const b = this.points[i + 1];
            if (point >= a.p && point <= b.p) {
                const t = (point - a.p) / (b.p - a.p);
                return a.v + (b.v - a.v) * t;
            }
        }
        return 0;
    }

    this.addPoint = (p, v) => {
        this.points.push({ p, v });
        this.points.sort((a, b) => a.p - b.p);
    };
}

function Emitter(props = {}) {
    const {
        type = "cube",
        position = new THREE.Vector3(0, 0, 0),
        dimensions = new THREE.Vector3(1, 1, 1)
    } = props;

    this.type = type;
    this.position = position;
    this.dimensions = dimensions;

    this.getEmissionPoint = () => {
        const halfDimensions = this.dimensions.clone().multiplyScalar(0.5);
        return new THREE.Vector3(
            this.position.x + Constellation.r(halfDimensions.x),
            this.position.y + Constellation.r(halfDimensions.y),
            this.position.z + Constellation.r(halfDimensions.z)
        );
    }
}


function Constellation(props = {}) {

    const {
        depthWrite = false,
        depthTest = false,

        emitChance = 0.5,
        emitMinCount = 1,
        emitMaxCount = 10000,
        maxCount = 1000,
        maxVelocity = 10,
        lerpToFaceMotion = 0.0,
        geometry = CONSTELLATION_DEFAULT_GEO,
        material = CONSTELLATION_DEFAULT_MAT,
        minLife = 1000, maxLife = 5000,
        gravityForce = new THREE.Vector3(0, -9, 0),

        initVelocityBase = new THREE.Vector3(0, 0, 0),
        initVelocityVariation = new THREE.Vector3(0, 0, 0),

        initFrictionBase = new THREE.Vector3(1, 1, 1),
        initFrictionVariation = new THREE.Vector3(0, 0, 0),

        initScaleBase = new THREE.Vector3(0.2, 0.2, 0.2),
        initScaleVariation = new THREE.Vector3(0, 0, 0),
        initScaleScalarVariation = 1,
        scaleCurve = new Curve([{ p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 0 }]),

        initRotationBase = new THREE.Vector3(0, 0, 0),
        initRotationVariation = new THREE.Vector3(0, 0, 0),

        initRotationVelocity = new THREE.Vector3(0, 0, 0),
        initRotationVelocityVariation = new THREE.Vector3(0, 0, 0),
        rotationVelocityCurve = new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),

        sineAmountBase = new THREE.Vector3(0, 0, 0),
        sineAmountVariation = new THREE.Vector3(0, 0, 0),
        sineSpeedBase = new THREE.Vector3(0, 0, 0),
        sineSpeedVariation = new THREE.Vector3(0, 0, 0),
        sineCurve = new Curve([{ p: 0, v: 0 }, { p: 0.5, v: 1 }, { p: 1, v: 0 }]),

        initAlpha = 1,
        initAlphaVariation = 0.1,
        alphaCurve = new Curve([
            { p: 0, v: 0 }, { p: 0.2, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }
        ]),

        colours = [0xffffff, 0xffffff, 0xffffff],
        colourCurves = {
            r: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
            g: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
            b: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }]),
            a: new Curve([{ p: 0, v: 1 }, { p: 1, v: 1 }])
        },

        texture = "salt_and_pepper.png",
        // texture = null,
        textureDimensions = new THREE.Vector2(4, 2),

        forces = [
            // new Force({
            //     type: "wind_box",
            //     position: new THREE.Vector3(0, 0, 0),
            //     dimensions: new THREE.Vector3(10, 100, 100),
            //     direction: new THREE.Vector3(-1, 0, 0),
            //     strength: 100
            // }),
            // new Force({
            //     type : "attractor",
            //     position: new THREE.Vector3(4, -6, 0),
            //     radius : 10,
            //     strength : -1000
            // }),
            // new Force({
            //     type : "vortex",
            //     position: new THREE.Vector3(10, 0, 0),
            //     direction: new THREE.Vector3(1, 0, 0),
            //     strength: 20,
            //     radius: 200,
            //     suction: 800
            // })
        ],

        emitters = [
            new Emitter({
                position: new THREE.Vector3(0, 0, 0),
                dimensions: new THREE.Vector3(0, 0, 0)
            })
        ],

        onSpawn = (object, mesh) => {

            object.readyToEmit = false;
            object.life = object.startLife;

            const emitter = emitters[Math.floor(Math.random() * emitters.length)];
            const position = emitter.getEmissionPoint();

            object.position.copy(position);
            const startVelocity = initVelocityBase.clone().add(
                new THREE.Vector3(
                    Constellation.r(initVelocityVariation.x),
                    Constellation.r(initVelocityVariation.y),
                    Constellation.r(initVelocityVariation.z)
                )
            );

            object.velocity.copy(startVelocity);

            const particleFriction = initFrictionBase.clone().add(
                new THREE.Vector3(
                    Constellation.r(initFrictionVariation.x),
                    Constellation.r(initFrictionVariation.y),
                    Constellation.r(initFrictionVariation.z)
                )
            );

            object.friction.copy(particleFriction);

            const particleScale = initScaleBase.clone().add(
                new THREE.Vector3(
                    Constellation.r(initScaleVariation.x),
                    Constellation.r(initScaleVariation.y),
                    Constellation.r(initScaleVariation.z)
                )
            );
            particleScale.multiplyScalar(Math.random() * initScaleScalarVariation);
            object.scale.copy(particleScale);

            // Set initial rotation
            if (!object.rotation) object.rotation = new THREE.Euler();
            if (!object.quaternion) object.quaternion = new THREE.Quaternion();
            const baseRot = (initRotationBase || new THREE.Vector3(0, 0, 0)).clone();
            const varRot = (initRotationVariation || new THREE.Vector3(0, 0, 0)).clone();
            object.rotation.set(
                baseRot.x + Constellation.r(varRot.x),
                baseRot.y + Constellation.r(varRot.y),
                baseRot.z + Constellation.r(varRot.z)
            );
            object.quaternion.setFromEuler(object.rotation);

            // Set initial rotation velocity
            if (!object.rotationVelocity) object.rotationVelocity = new THREE.Vector3();
            object.rotationVelocity.set(
                initRotationVelocity.x + (Math.random() - 0.5) * initRotationVelocityVariation.x,
                initRotationVelocity.y + (Math.random() - 0.5) * initRotationVelocityVariation.y,
                initRotationVelocity.z + (Math.random() - 0.5) * initRotationVelocityVariation.z
            );

            // Assign per-particle sine oscillation parameters
            object.sineAmount = new THREE.Vector3(
                sineAmountBase.x + Constellation.r(sineAmountVariation.x),
                sineAmountBase.y + Constellation.r(sineAmountVariation.y),
                sineAmountBase.z + Constellation.r(sineAmountVariation.z)
            );
            object.sineSpeed = new THREE.Vector3(
                sineSpeedBase.x + Constellation.r(sineSpeedVariation.x),
                sineSpeedBase.y + Constellation.r(sineSpeedVariation.y),
                sineSpeedBase.z + Constellation.r(sineSpeedVariation.z)
            );
            object.sinePhase = new THREE.Vector3(Math.random() * PI2, Math.random() * PI2, Math.random() * PI2);

            // Apply scale curve at p=0 so particle starts at correct scale
            const sc = scaleCurve.getValueAtPoint(0);
            const initialScale = object.scale.clone().multiplyScalar(sc);
            const matrix = new THREE.Matrix4();
            matrix.compose(
                position,
                object.quaternion,
                initialScale
            );
            mesh.setMatrixAt(object.i, matrix);



        },
        onParticleUpdate = (object, mesh, delta, deltaBig) => {

            object.life -= deltaBig; // convert delta back to ms for life
            let p = 1 - object.life / object.startLife;
            let sc = scaleCurve.getValueAtPoint(p);

            // Apply all forces
            for (let f = 0; f < forces.length; f++) {
                const force = forces[f];
                force.checkEffect(object.position, object, delta);
            }


            object.position.addScaledVector(object.velocity, delta);
            object.velocity.addScaledVector(gravityForce, delta);
            object.velocity.divide(object.friction);

            // Clamp velocity to maxVelocity
            if (object.velocity.lengthSq() > maxVelocity * maxVelocity) {
                object.velocity.setLength(maxVelocity);
            }

            const scaled = object.scale.clone().multiplyScalar(sc);

            // Animate rotation over lifetime using rotationVelocityCurve
            if (object.rotation && object.rotationVelocity) {
                const rotVelCurve = rotationVelocityCurve ? rotationVelocityCurve.getValueAtPoint(p) : 1;
                object.rotation.x += object.rotationVelocity.x * rotVelCurve * delta;
                object.rotation.y += object.rotationVelocity.y * rotVelCurve * delta;
                object.rotation.z += object.rotationVelocity.z * rotVelCurve * delta;
                object.quaternion.setFromEuler(object.rotation);
            }

            // Lerp to face direction of motion, but avoid abrupt flips by tracking previous direction
            if (lerpToFaceMotion > 0 && object.velocity.lengthSq() > 1e-6) {
                const up = new THREE.Vector3(0, 1, 0);
                const dir = object.velocity.clone().normalize();
                if (!object.prevMotionDir) {
                    object.prevMotionDir = dir.clone();
                }
                // Slerp previous direction toward current direction
                const slerpDir = object.prevMotionDir.clone().lerp(dir, lerpToFaceMotion).normalize();
                const lookAtQuat = new THREE.Quaternion().setFromUnitVectors(up, slerpDir);
                object.quaternion.copy(lookAtQuat);
                // Only update prevMotionDir if direction changed significantly
                if (object.prevMotionDir.angleTo(dir) > 0.01) {
                    object.prevMotionDir.copy(slerpDir);
                }
            }

            // Sine oscillation
            const t = performance.now() * 0.001;
            const oscP = p;
            const oscCurve = sineCurve.getValueAtPoint(oscP);
            const oscX = object.sineAmount.x * oscCurve * Math.sin(t * object.sineSpeed.x + object.sinePhase.x);
            const oscY = object.sineAmount.y * oscCurve * Math.sin(t * object.sineSpeed.y + object.sinePhase.y);
            const oscZ = object.sineAmount.z * oscCurve * Math.sin(t * object.sineSpeed.z + object.sinePhase.z);
            const oscillatedPosition = object.position.clone().add(new THREE.Vector3(oscX, oscY, oscZ));

            matrix.compose(
                oscillatedPosition,
                object.quaternion || new THREE.Quaternion(),
                scaled
            );
            mesh.setMatrixAt(object.i, matrix);
        }
    } = props;

    this.running = true;

    let mesh;
    let atlasCellSize;
    if (texture) {
        // Load texture and create shader material
        const texLoader = new THREE.TextureLoader();
        const loadedTexture = texLoader.load(
            (texture.startsWith('public/') ? texture : 'public/' + texture),
            () => { loadedTexture.needsUpdate = true; }
        );
        loadedTexture.wrapS = loadedTexture.wrapT = THREE.RepeatWrapping;
        atlasCellSize = new THREE.Vector2(1 / textureDimensions.x, 1 / textureDimensions.y);
        const shaderMaterial = createConstellationShaderMaterial(loadedTexture, atlasCellSize, { depthWrite, depthTest });
        mesh = new THREE.InstancedMesh(geometry, shaderMaterial, maxCount);
        // Enable per-instance color
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
        // Add per-instance UV offset attribute for texture atlas
        mesh.instanceUVOffset = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 2), 2);
        // Add per-instance alpha attribute
        mesh.instanceAlpha = new THREE.InstancedBufferAttribute(new Float32Array(maxCount), 1);
        mesh.geometry.setAttribute('instanceColor', mesh.instanceColor);
        mesh.geometry.setAttribute('instanceUVOffset', mesh.instanceUVOffset);
        mesh.geometry.setAttribute('instanceAlpha', mesh.instanceAlpha);
    } else {
        // No texture: use default material and only color/alpha attributes
        mesh = new THREE.InstancedMesh(geometry, material, maxCount);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
        mesh.instanceAlpha = new THREE.InstancedBufferAttribute(new Float32Array(maxCount), 1);
        mesh.geometry.setAttribute('instanceColor', mesh.instanceColor);
        mesh.geometry.setAttribute('instanceAlpha', mesh.instanceAlpha);
    }
    this.object3D = new THREE.Object3D();
    this.object3D.add(mesh);
    let particleDataObjects = [];
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < maxCount; i++) {
        const l = Math.random() * (maxLife - minLife) + minLife;
        // Set initial alpha for this particle
        const alpha = initAlpha + Constellation.r(initAlphaVariation);
        let obj;
        if (texture) {
            // Pick a random cell in the atlas
            const cellX = Math.floor(Math.random() * textureDimensions.x);
            const cellY = Math.floor(Math.random() * textureDimensions.y);
            const uvOffset = new THREE.Vector2(cellX * atlasCellSize.x, cellY * atlasCellSize.y);
            obj = {
                life: 0,
                startLife: l,
                position: new THREE.Vector3(),
                friction: new THREE.Vector3(),
                scale: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                i,
                colour: new THREE.Color(colours[Math.floor(Math.random() * colours.length)]),
                readyToEmit: true,
                atlasCell: { x: cellX, y: cellY },
                uvOffset: uvOffset.clone(),
                uvScale: atlasCellSize.clone(),
                alpha: alpha
            };
            particleDataObjects.push(obj);
            // Set initial color (invisible)
            mesh.instanceColor.setXYZ(i, 0, 0, 0);
            mesh.instanceUVOffset.setXY(i, uvOffset.x, uvOffset.y);
            mesh.instanceAlpha.setX(i, 0);
        } else {
            obj = {
                life: 0,
                startLife: l,
                position: new THREE.Vector3(),
                friction: new THREE.Vector3(),
                scale: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                i,
                colour: new THREE.Color(colours[Math.floor(Math.random() * colours.length)]),
                readyToEmit: true,
                alpha: alpha
            };
            particleDataObjects.push(obj);
            // Set initial color (invisible)
            mesh.instanceColor.setXYZ(i, 0, 0, 0);
            mesh.instanceAlpha.setX(i, 0);
        }
    }

    this.emit = (count = 1) => {
        let emitted = 0;
        for (let i = 0; i < maxCount && emitted < count; i++) {
            const particle = particleDataObjects[i];
            if (particle.readyToEmit) {
                onSpawn(particle, mesh);
                emitted++;
            }
        }
    }

    let time = performance.now();
    let delta = 0;
    this.update = () => {
        const now = performance.now();

        delta = (now - time); // delta in seconds
        const dTiny = delta / 1000;
        time = now;

        if (this.running) {

            const emitCount = Math.floor(Math.random() * (emitMaxCount - emitMinCount + 1)) + emitMinCount;
            if (Math.random() < emitChance) {
                this.emit(emitCount);
            }

            for (let i = 0; i < maxCount; i++) {
                const particle = particleDataObjects[i];
                let p = 1 - particle.life / particle.startLife;
                // Apply R, G, B curves
                const curveR = colourCurves.r.getValueAtPoint(p);
                const curveG = colourCurves.g.getValueAtPoint(p);
                const curveB = colourCurves.b.getValueAtPoint(p);
                const curveA = alphaCurve.getValueAtPoint(p);
                if (particle.life <= 0) {
                    particle.readyToEmit = true;
                } else {
                    onParticleUpdate(particle, mesh, dTiny, delta);
                    mesh.instanceColor.setXYZ(i, particle.colour.r * curveR, particle.colour.g * curveG, particle.colour.b * curveB);
                    mesh.instanceAlpha.setX(i, particle.alpha * curveA);
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
            mesh.instanceAlpha.needsUpdate = true;
        }
    }

}

Constellation.r = r;
Constellation.Curve = Curve;

export { CONSTELLATION_DEFAULT_GEO, CONSTELLATION_DEFAULT_MAT, Constellation, PI2, Emitter, Curve };