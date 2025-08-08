import * as THREE from 'three';

const MAX_LIFE = 1400;
const ATT_FORCE = 0.02; // Attraction force strength for smoke (weaker than sparks)
const AIR_FRICTION = 0.998; // Air resistance coefficient for smoke

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

export class SmokeSystem extends THREE.Mesh {
    constructor(particleCount = 100, cloudSize = 10, attractors = []) {
        // Create base plane geometry
        const baseGeometry = new THREE.PlaneGeometry(0.5, 0.5);
        const geometry = new THREE.InstancedBufferGeometry().copy(baseGeometry);
        geometry.instanceCount = particleCount;

        // Create instanced attributes
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const lives = new Float32Array(particleCount);
        const maxLives = new Float32Array(particleCount);

        // Randomize particles at edges
        for (let i = 0; i < particleCount; i++) {
            randomEdgePosition(i * 3, positions);
            
            // Initialize velocities to small inward drift
            velocities[i * 3] = (Math.random() - 0.5) * 0.002;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
            
            const maxLife = MAX_LIFE * Math.random();
            maxLives[i] = maxLife;
            lives[i] = maxLife; // Random life duration
            scales[i] = 2 + Math.random() * 10;
        }

        geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(positions, 3));
        geometry.setAttribute('instanceVelocity', new THREE.InstancedBufferAttribute(velocities, 3));
        geometry.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(scales, 1));
        geometry.setAttribute('instanceLife', new THREE.InstancedBufferAttribute(lives, 1));
        geometry.setAttribute('instanceMaxLife', new THREE.InstancedBufferAttribute(maxLives, 1));

        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load('jala/back-pure.png');
        texture.encoding = THREE.sRGBEncoding;

        const material = new THREE.ShaderMaterial({
            uniforms: {
            map: { value: texture },
            time: { value: 0.0 }
            },
            vertexShader: `
            attribute vec3 instancePosition;
            attribute float instanceScale;
            attribute float instanceLife;
            attribute float instanceMaxLife;
            varying vec2 vUv;
            varying float vLife;
            varying float vMaxLife;

            void main() {
                vUv = uv;
                vLife = instanceLife;
                vMaxLife = instanceMaxLife;

                
                vec3 pos = position * instanceScale;
                pos.x += sin(instanceLife * instancePosition.y * 0.01) * 0.1;
                pos.y += cos(instanceLife * instancePosition.z * 0.01) * 0.1 * sin(instancePosition.x);
                vec3 transformed = pos + instancePosition;
                
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
            `,
            fragmentShader: `
            uniform sampler2D map;
            varying vec2 vUv;
            varying float vLife;
            varying float vMaxLife;

            void main() {
                float lifeFactor = vLife / vMaxLife * 3.14159265;
                lifeFactor = abs(sin(lifeFactor)) * 0.1;
                vec4 texColor = texture2D(map, vUv);
                gl_FragColor = vec4(texColor.rgb, texColor.a * lifeFactor * 0.8);
            }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        super(geometry, material);

        this.particleCount = particleCount;
        this.cloudSize = cloudSize;
        this.attractors = attractors;
        
        // Store references to attributes for JS updates
        this.positionAttr = geometry.getAttribute('instancePosition');
        this.velocityAttr = geometry.getAttribute('instanceVelocity');
        this.scaleAttr = geometry.getAttribute('instanceScale');
        this.lifeAttr = geometry.getAttribute('instanceLife');
        this.maxLifeAttr = geometry.getAttribute('instanceMaxLife');
        this.lives = lives; // Store the life array for direct access
        this.maxLives = maxLives; // Store the max life array for reference
        this.positions = positions; // Store the position array for direct access
        this.velocities = velocities; // Store the velocity array for direct access
        this.scales = scales; // Store the scale array for direct access
    }

    update(time) {
        this.material.uniforms.time.value = time;

        for (let i = 0; i < this.particleCount; i++) {
            // Apply air resistance
            this.velocities[i * 3] *= AIR_FRICTION;
            this.velocities[i * 3 + 1] *= AIR_FRICTION;
            this.velocities[i * 3 + 2] *= AIR_FRICTION;
            
            // Check for attractor influence
            for (let j = 0; j < this.attractors.length; j++) {
                const attractor = this.attractors[j];
                
                // Convert attractor world position to local space
                const localAttractorX = attractor.position.x / this.scale.x - this.position.x / this.scale.x;
                const localAttractorY = attractor.position.y / this.scale.y - this.position.y / this.scale.y;
                const localAttractorZ = attractor.position.z / this.scale.z - this.position.z / this.scale.z;
                
                const dx = localAttractorX - this.positions[i * 3];
                const dy = localAttractorY - this.positions[i * 3 + 1];
                const dz = localAttractorZ - this.positions[i * 3 + 2];
                const distSq = dx * dx + dy * dy + dz * dz;
                const dist = Math.sqrt(distSq);
                
                // Apply gentle attraction force for smoke
                const force = ATT_FORCE / (distSq + 0.1); // Gentler force for smoke
                this.velocities[i * 3] += (dx / dist) * force;
                this.velocities[i * 3 + 1] += (dy / dist) * force;
                this.velocities[i * 3 + 2] += (dz / dist) * force;
            }
            
            // Update position based on velocity
            this.positions[i * 3] += this.velocities[i * 3];
            this.positions[i * 3 + 1] += this.velocities[i * 3 + 1];
            this.positions[i * 3 + 2] += this.velocities[i * 3 + 2];
            
            this.lives[i] -= 1; // Decrease life
            if(this.lives[i] <= 0) {
                // Reset particle at edge
                randomEdgePosition(i * 3, this.positions);
                
                // Reset velocity with gentle drift
                this.velocities[i * 3] = (Math.random() - 0.5) * 0.002;
                this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
                this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
                
                this.maxLives[i] = this.lives[i] = Math.random() * MAX_LIFE; // Reset life
                this.scales[i] = 2 + Math.random() * 20;
            }
        }
        this.positionAttr.needsUpdate = true;
        this.scaleAttr.needsUpdate = true;
        this.velocityAttr.needsUpdate = true;
        this.lifeAttr.needsUpdate = true;
        this.maxLifeAttr.needsUpdate = true;

        
        // All particle updates will be done in JS here
        // Position, scale, and life can be updated by modifying the attributes
        // Example:
        // this.positionAttr.setXYZ(i, x, y, z);
        // this.scaleAttr.setX(i, scale);
        // this.lifeAttr.setX(i, life);
        // this.lives[i] = newLifeValue; // Update the life array directly
        
    }
}

export default SmokeSystem;
