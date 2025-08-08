import * as THREE from 'three';

const MAX_LIFE = 300;
const MIN_LIFE = 200;
const ATT_FORCE = 0.05; // Attraction force strength
const AIR_FRICTION = 0.99; // Air resistance coefficient
const MAX_SPEED = 0.2; // Maximum particle speed
const TELEPORT_PROBABILITY = 0.02; // Probability per frame to teleport 20% of particles


const rand = (min, max) => Math.random() * (max - min) + min;

function randomEdgePosition(idx, positions) {
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
        case 0:
            positions[idx] = -10;
            positions[idx + 1] = rand(-10, 10);
            positions[idx + 2] = rand(-5, 5);
            break;
        case 1:
            positions[idx] = 10;
            positions[idx + 1] = rand(-10, 10);
            positions[idx + 2] = rand(-5, 5);
            break;
        case 2:
            positions[idx] = rand(-10, 10);
            positions[idx + 1] = -10;
            positions[idx + 2] = rand(-5, 5);
            break;
        case 3:
            positions[idx] = rand(-10, 10);
            positions[idx + 1] = 10;
            positions[idx + 2] = rand(-5, 5);
            break;
    }
}


export class SparkSystem extends THREE.Mesh {
    constructor(particleCount = 50, cloudSize = 5, attractors = []) {
        // Create base plane geometry
        const baseGeometry = new THREE.PlaneGeometry(0.05, 0.3); // Thin vertical streaks
        const geometry = new THREE.InstancedBufferGeometry().copy(baseGeometry);
        geometry.instanceCount = particleCount;

        // Create instanced attributes
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const lives = new Float32Array(particleCount);
        const maxLives = new Float32Array(particleCount);

        // Initialize particles
        for (let i = 0; i < particleCount; i++) {
            // Start at origin with burst velocity
            randomEdgePosition(i * 3, positions);
            
            // Random burst velocity - ensure balanced distribution
            // const angle = 0;
            // const speed = Math.random() * 0.01 + 0.003;
            // velocities[i * 3] = Math.cos(angle) * speed;
            // velocities[i * 3 + 1] = Math.random() * 0.01 + 0.003; // Always upward
            // velocities[i * 3 + 2] = Math.sin(angle) * speed;
            
            const maxLife = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);
            maxLives[i] = maxLife;
            lives[i] = maxLife;
            scales[i] = 1 + Math.random(); // Random scale between 0.5 and 1.0
        }

        geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(positions, 3));
        geometry.setAttribute('instanceVelocity', new THREE.InstancedBufferAttribute(velocities, 3));
        geometry.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(scales, 1));
        geometry.setAttribute('instanceLife', new THREE.InstancedBufferAttribute(lives, 1));
        geometry.setAttribute('instanceMaxLife', new THREE.InstancedBufferAttribute(maxLives, 1));

        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load('jala/back-spark.png');
        texture.encoding = THREE.sRGBEncoding;

        const material = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: texture },
                time: { value: 0.0 },
                xNoiseArray: { value: new Float32Array(particleCount) },
                yNoiseArray: { value: new Float32Array(particleCount) },
                zNoiseArray: { value: new Float32Array(particleCount) }
            },
            vertexShader: `
            attribute vec3 instancePosition;
            attribute vec3 instanceVelocity;
            attribute float instanceScale;
            attribute float instanceLife;
            attribute float instanceMaxLife;
            uniform float time;
            varying vec2 vUv;
            varying float vLife;
            varying float vMaxLife;

            void main() {
                vUv = uv;
                vLife = instanceLife;
                vMaxLife = instanceMaxLife;

                float T = (vMaxLife - vLife) / vMaxLife;

                // Scale the particle based on velocity magnitude
                float speed = length(instanceVelocity);
                float speedFactor = clamp(speed / 0.01, 0.1, 2.0); // Scale based on speed
                vec3 pos = position * instanceScale * speedFactor;
                
                // Align particle with velocity direction using lookAt approach
                vec3 velocity = normalize(instanceVelocity);
                
                // Calculate rotation to align Y-axis (height) with velocity
                vec3 up = velocity;
                vec3 forward = vec3(0.0, 0.0, 1.0);
                
                // If velocity is too close to forward, use right as reference
                if (abs(dot(up, forward)) > 0.9) {
                    forward = vec3(1.0, 0.0, 0.0);
                }
                
                vec3 right = normalize(cross(up, forward));
                forward = normalize(cross(right, up));
                
                // Apply rotation matrix
                mat3 rotation = mat3(right, up, forward);
                vec3 rotatedPos = rotation * pos;
                
                vec3 worldPos = rotatedPos + instancePosition;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
            }
            `,
            fragmentShader: `
            uniform sampler2D map;
            varying vec2 vUv;
            varying float vLife;
            varying float vMaxLife;

            void main() {
                float lifeFactor = vLife / vMaxLife;
                vec4 texColor = texture2D(map, vUv);
                
                // Bright spark colors that fade
                vec3 sparkColor = vec3(1.0, 0.9, 0.4) * lifeFactor;
                sparkColor += vec3(1.0, 0.3, 0.1) * (1.0 - lifeFactor); // Orange trail
                
                gl_FragColor = vec4(sparkColor * texColor.rgb, texColor.a * lifeFactor * 0.25);
            }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        super(geometry, material);

        this.particleCount = particleCount;
        this.cloudSize = cloudSize;
        this.attractors = attractors;
        
        // Debug: log attractor info
        console.log('SparkSystem attractors:', attractors.length, attractors.map(a => ({x: a.position.x, y: a.position.y, z: a.position.z})));
        
        // Store references to attributes for JS updates
        this.positionAttr = geometry.getAttribute('instancePosition');
        this.velocityAttr = geometry.getAttribute('instanceVelocity');
        this.scaleAttr = geometry.getAttribute('instanceScale');
        this.lifeAttr = geometry.getAttribute('instanceLife');
        this.maxLifeAttr = geometry.getAttribute('instanceMaxLife');
        this.lives = lives;
        this.maxLives = maxLives;
        this.positions = positions;
        this.velocities = velocities;
        this.scales = scales;
    }

    update(time) {
        this.material.uniforms.time.value = time;

        // Check for random teleportation event every frame
        if (Math.random() < TELEPORT_PROBABILITY) {
            // Pick a single random spot for all teleported particles
            const teleportSpot = {
                x: rand(-10, 10),
                y: rand(-10, 10),
                z: rand(-10, 10)
            };
            
            // Teleport 20% of particles to the same spot
            const particlesToTeleport = Math.floor(this.particleCount * 0.1);
            const teleportedIndices = new Set();
            
            for (let i = 0; i < particlesToTeleport; i++) {
                let particleIndex;
                // Ensure we don't teleport the same particle twice
                do {
                    particleIndex = Math.floor(Math.random() * this.particleCount);
                } while (teleportedIndices.has(particleIndex));
                
                teleportedIndices.add(particleIndex);
                const idx = particleIndex * 3;
                
                // Teleport to the same spot
                this.positions[idx] = teleportSpot.x;
                this.positions[idx + 1] = teleportSpot.y;
                this.positions[idx + 2] = teleportSpot.z;
                
            }
        }

        for (let i = 0; i < this.particleCount; i++) {
            // Apply air resistance
            this.velocities[i * 3] *= AIR_FRICTION;
            this.velocities[i * 3 + 1] *= AIR_FRICTION;
            this.velocities[i * 3 + 2] *= AIR_FRICTION;
            
            // Apply gravity
            // this.velocities[i * 3 + 1] += GRAVITY;
            
            // Check for attractor influence
            for (let j = 0; j < this.attractors.length; j++) {
                const attractor = this.attractors[j];
                
                // Convert attractor world position to local space
                // Account for SparkSystem position and scale
                const localAttractorX = attractor.position.x / this.scale.x - this.position.x / this.scale.x;
                const localAttractorY = attractor.position.y / this.scale.y - this.position.y / this.scale.y;
                const localAttractorZ = attractor.position.z / this.scale.z - this.position.z / this.scale.z;
                
                const dx = localAttractorX - this.positions[i * 3];
                const dy = localAttractorY - this.positions[i * 3 + 1];
                const dz = localAttractorZ - this.positions[i * 3 + 2];
                const distSq = dx * dx + dy * dy + dz * dz;
                const dist = Math.sqrt(distSq);
                
                
                    // Apply attraction force (inverse square law)
                    const force = ATT_FORCE / (distSq + 0.01); // Add small constant to prevent division by zero
                    this.velocities[i * 3] += (dx / dist) * force;
                    this.velocities[i * 3 + 1] += (dy / dist) * force;
                    this.velocities[i * 3 + 2] += (dz / dist) * force;
                
            }
            
            // Apply speed limit
            const speedSq = this.velocities[i * 3] * this.velocities[i * 3] + 
                           this.velocities[i * 3 + 1] * this.velocities[i * 3 + 1] + 
                           this.velocities[i * 3 + 2] * this.velocities[i * 3 + 2];
            
            if (speedSq > MAX_SPEED * MAX_SPEED) {
                const speed = Math.sqrt(speedSq);
                const scale = MAX_SPEED / speed;
                this.velocities[i * 3] *= scale;
                this.velocities[i * 3 + 1] *= scale;
                this.velocities[i * 3 + 2] *= scale;
            }
            
            // Update position
            this.positions[i * 3] += this.velocities[i * 3];
            this.positions[i * 3 + 1] += this.velocities[i * 3 + 1];
            this.positions[i * 3 + 2] += this.velocities[i * 3 + 2];

            
            
            this.lives[i] -= 1;
            
            if (this.lives[i] <= 0) {
                // Reset particle with burst effect
                randomEdgePosition(i * 3, this.positions);
                
                // Radial burst velocity
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 0.02 + 0.01;
                this.velocities[i * 3] = Math.cos(angle) * speed;
                this.velocities[i * 3 + 1] = Math.random() * 0.1 + 0.01; // Always upward
                this.velocities[i * 3 + 2] = Math.sin(angle) * speed;
                
                this.maxLives[i] = this.lives[i] = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);
            }
        }
        
        this.positionAttr.needsUpdate = true;
        this.velocityAttr.needsUpdate = true;
        this.lifeAttr.needsUpdate = true;
        this.maxLifeAttr.needsUpdate = true;
    }
}

export default SparkSystem;
