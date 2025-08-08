import * as THREE from 'three';

const ATTRACTION_RADIUS = 3.0; // Distance within which attraction occurs
const ATTRACTION_FORCE = 0.0001; // Strength of movement when near attractors (much gentler)
const RESTORATION_FORCE = 0.005; // Strength of force pulling back to original position (gentler)
const DAMPING = 0.95; // Air resistance (less damping for smoother movement)
const MAX_VELOCITY = 0.01; // Hard limit on velocity to prevent flicker (much lower)
const SCALE_MULTIPLIER = 1.2; // How much particles can grow when near attractors (less dramatic)

export class InstancedParticleSystem extends THREE.Mesh {

    update(){
        // Pre-compute collider positions in local space once per frame
        const localColliderPositions = [];
        for (let j = 0; j < this.colliders.length; j++) {
            const collider = this.colliders[j];
            // Get world position and convert to local space efficiently
            const worldPos = collider.position;
            const localPos = this.worldToLocal(worldPos.clone());
            localColliderPositions.push(localPos);
        }
        
        for (let i = 0; i < this.total; i++) {
            // Get current position
            const posAttr = this.geometry.getAttribute('instancePos');
            const scaleAttr = this.geometry.getAttribute('instanceScale');
            const currentX = posAttr.getX(i);
            const currentY = posAttr.getY(i);
            const currentZ = posAttr.getZ(i);
            
            // Check for collider influence using pre-computed positions
            let attracted = false;
            let closestDistance = Infinity;
            let attractionInfluence = 0;
            
            for (let j = 0; j < localColliderPositions.length; j++) {
                const localPos = localColliderPositions[j];
                const dx = localPos.x - currentX;
                const dy = localPos.y - currentY;
                const dz = localPos.z - currentZ;
                const distSq = dx * dx + dy * dy + dz * dz;
                const dist = Math.sqrt(distSq);
                
                if (dist < ATTRACTION_RADIUS) {
                    // Calculate influence (stronger when closer)
                    const influence = 1.0 - (dist / ATTRACTION_RADIUS);
                    attractionInfluence = Math.max(attractionInfluence, influence);
                    
                    // Apply gentle movement force (not magnetic pull)
                    const moveForce = ATTRACTION_FORCE * influence;
                    this.velocities[i * 3] += (dx / dist) * moveForce;
                    this.velocities[i * 3 + 1] += (dy / dist) * moveForce;
                    this.velocities[i * 3 + 2] += (dz / dist) * moveForce;
                    attracted = true;
                }
                
                closestDistance = Math.min(closestDistance, dist);
            }
            
            // Update scale based on attraction influence
            const targetScale = 1.0 + (attractionInfluence * SCALE_MULTIPLIER);
            const currentScale = scaleAttr.getX(i);
            const newScale = currentScale + (targetScale - currentScale) * 0.1; // Smooth interpolation
            scaleAttr.setX(i, newScale);
            
            if (!attracted) {
                // Apply restoration force to original position
                const originalX = this.originalPositions[i * 3];
                const originalY = this.originalPositions[i * 3 + 1];
                const originalZ = this.originalPositions[i * 3 + 2];
                
                const restoreX = originalX - currentX;
                const restoreY = originalY - currentY;
                const restoreZ = originalZ - currentZ;
                
                this.velocities[i * 3] += restoreX * RESTORATION_FORCE;
                this.velocities[i * 3 + 1] += restoreY * RESTORATION_FORCE;
                this.velocities[i * 3 + 2] += restoreZ * RESTORATION_FORCE;
            }
            
            // Apply damping
            this.velocities[i * 3] *= DAMPING;
            this.velocities[i * 3 + 1] *= DAMPING;
            this.velocities[i * 3 + 2] *= DAMPING;
            
            // Clamp velocity to prevent flicker
            this.velocities[i * 3] = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, this.velocities[i * 3]));
            this.velocities[i * 3 + 1] = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, this.velocities[i * 3 + 1]));
            this.velocities[i * 3 + 2] = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, this.velocities[i * 3 + 2]));
            
            // Update position
            const newX = currentX + this.velocities[i * 3];
            const newY = currentY + this.velocities[i * 3 + 1];
            const newZ = currentZ + this.velocities[i * 3 + 2];
            
            posAttr.setXYZ(i, newX, newY, newZ);
        }
        
        this.geometry.getAttribute('instancePos').needsUpdate = true;
        this.geometry.getAttribute('instanceScale').needsUpdate = true;
    }

    constructor(texture, gridX, gridY, quadSize = 1, colliders = []) {
        // Build geometry
        const total = gridX * gridY;
        const base = new THREE.PlaneGeometry(quadSize, quadSize);
        const geometry = new THREE.InstancedBufferGeometry().copy(base);
        geometry.instanceCount = total;

        const positions = new Float32Array(total * 3);
        const uvOffsets = new Float32Array(total * 2);
        const uvScale = new Float32Array(total * 2);
        const rotations = new Float32Array(total); // New: rotation per instance
        const scales = new Float32Array(total); // New: scale per instance

        // Physics arrays - will be stored after super() call
        const velocities = new Float32Array(total * 3); // Velocity for each instance
        const originalPositions = new Float32Array(total * 3); // Original positions for restoration

        let i = 0;
        for (let y = 0; y < gridY; y++) {
            for (let x = 0; x < gridX; x++) {
                const posX = (x - gridX / 2) * quadSize;
                const posY = (y - gridY / 2) * quadSize;
                const posZ = 0;
                
                positions[i * 3] = posX;
                positions[i * 3 + 1] = posY;
                positions[i * 3 + 2] = posZ;
                
                // Store original positions
                originalPositions[i * 3] = posX;
                originalPositions[i * 3 + 1] = posY;
                originalPositions[i * 3 + 2] = posZ;
                
                // Initialize velocities to zero
                velocities[i * 3] = 0;
                velocities[i * 3 + 1] = 0;
                velocities[i * 3 + 2] = 0;

                uvOffsets[i * 2] = x / gridX;
                uvOffsets[i * 2 + 1] = y / gridY;

                uvScale[i * 2] = 1.0 / gridX;
                uvScale[i * 2 + 1] = 1.0 / gridY;

                rotations[i] = 0.0; // Initial rotation
                scales[i] = 1.0; // Initial scale

                i++;
            }
        }

        geometry.setAttribute('instancePos', new THREE.InstancedBufferAttribute(positions, 3));
        geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
        geometry.setAttribute('uvScale', new THREE.InstancedBufferAttribute(uvScale, 2));
        geometry.setAttribute('instanceRot', new THREE.InstancedBufferAttribute(rotations, 1)); // New
        geometry.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(scales, 1)); // New

        // Shader material
        const material = new THREE.ShaderMaterial({
            depthTest: false,
            depthWrite: false,
            uniforms: {
                map: { value: texture }
            },
            vertexShader: `
                attribute vec3 instancePos;
                attribute vec2 uvOffset;
                attribute vec2 uvScale;
                attribute float instanceRot;
                attribute float instanceScale;
                varying vec2 vUv;
                void main() {
                    vUv = uv * uvScale + uvOffset;
                    // Apply rotation around Z
                    float c = cos(instanceRot);
                    float s = sin(instanceRot);
                    vec3 pos = position * instanceScale; // Apply scale first
                    pos.xy = vec2(
                        pos.x * c - pos.y * s,
                        pos.x * s + pos.y * c
                    );
                    vec3 transformed = pos + instancePos;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(map, vUv);
                }
            `,
            transparent: true
        });

        super(geometry, material);

        // Store colliders and physics arrays after super() call
        this.colliders = colliders;
        this.velocities = velocities;
        this.originalPositions = originalPositions;

        // Store useful props
        this.gridX = gridX;
        this.gridY = gridY;
        this.quadSize = quadSize;
        this.total = total;
    }

    // Method to update texture at runtime
    setTexture(texture) {
        this.material.uniforms.map.value = texture;
    }

    // Example method to update positions
    setInstancePosition(index, x, y, z) {
        if (index < 0 || index >= this.total) return;
        const attr = this.geometry.getAttribute('instancePos');
        attr.setXYZ(index, x, y, z);
        attr.needsUpdate = true;
    }
}
