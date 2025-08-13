import * as THREE from 'three';

export class CheeseParticles {
    constructor(count, targetObjects = [], texturePath = 'public/part-tex-atlas.png', spawnPosition = { x: -2, y: 2, z: 0 }, color = null, baseScale = 0.01, scaleRange = 0.03, repulsors = []) {
        this.count = count;
        this.group = new THREE.Group();
        this.targetObjects = Array.isArray(targetObjects) ? targetObjects : (targetObjects ? [targetObjects] : []); // Array of objects to track
        this.repulsors = Array.isArray(repulsors) ? repulsors : (repulsors ? [repulsors] : []); // Array of objects to repel from
        this.texturePath = texturePath; // Texture file path
        this.spawnPosition = spawnPosition; // Spawn position
        this.color = color; // Optional solid color (if no texture desired)
        this.baseScale = baseScale; // Base scale for particles
        this.scaleRange = scaleRange; // Range of scale variation
        
        // Physics arrays
        this.velocities = new Float32Array(count * 3);
        this.rotationVelocities = new Float32Array(count); // Z-axis rotation only
        this.life = new Float32Array(count); // Life for each particle
        
        // Individual variation arrays
        this.dampingVariations = new Float32Array(count); // Individual damping values
        this.maxSpeedVariations = new Float32Array(count); // Individual max speeds
        this.jitterVariations = new Float32Array(count); // Individual jitter strengths
        
        // Attraction point
        this.attractionPoint = new THREE.Vector3(0, 0, 0);
        
        // Physics constants
        this.attractionForce = 0.01; // Reduced from 0.02 - less powerful attraction
        this.attractionRadius = 1.0; // Reduced from 3.0 - smaller attraction radius
        this.repulsionForce = 0.008; // Slightly stronger than attraction for clear avoidance
        this.repulsionRadius = 1.5; // Smaller radius for more localized repulsion
        this.damping = 0.99; // Reduced friction (was 0.999)
        this.rotationSpeed = 0.02;
        this.maxLife = 120; // Reduced from 300 to 120
        this.maxSpeed = 0.005; // Maximum particle speed
        // Add random velocity jitter
        this.jitterStrength = 0.002;
        
        // Create simple particle system with plane geometry
        this.createParticleSystem();
    }
    
    // Helper function to initialize a particle at spawn position with random properties
    initializeParticle(index, dummy) {
        // Position at exact spawn point
        dummy.position.set(
            this.spawnPosition.x,
            this.spawnPosition.y,
            this.spawnPosition.z
        );
        
        // Initialize random velocities with downward bias (reduced)
        this.velocities[index * 3] = (Math.random() - 0.5) * 0.04;     // vx (reduced from 0.08)
        this.velocities[index * 3 + 1] = -Math.random() * 0.04 - 0.02; // vy (reduced from 0.08/0.04)
        this.velocities[index * 3 + 2] = (Math.random() - 0.5) * 0.04; // vz (reduced from 0.08)
        
        // Initialize random Z rotation velocity
        this.rotationVelocities[index] = (Math.random() - 0.5) * this.rotationSpeed * 3;
        
        // Initialize individual variations
        this.dampingVariations[index] = 0.995 + Math.random() * 0.009; // 0.995 to 0.9999
        this.maxSpeedVariations[index] = 0.08 + Math.random() * 0.08; // 0.08 to 0.16
        this.jitterVariations[index] = 0.001 + Math.random() * 0.002; // 0.001 to 0.003
        
        // Reset life with variation (80-100% of max life)
        this.life[index] = this.maxLife * (0.8 + Math.random() * 0.2);
        
        // Random initial Z rotation only
        dummy.rotation.set(0, 0, Math.random() * Math.PI * 2);
        
        // Scale using constructor parameters
        const scale = this.baseScale + Math.random() * this.scaleRange;
        dummy.scale.setScalar(scale);
    }
    
    createParticleSystem() {
        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(1, 1);
        
        let material;
        
        if (this.color) {
            // Create simple color material when color is specified
            material = new THREE.MeshBasicMaterial({
                color: this.color,
                transparent: true,
                side: THREE.DoubleSide
            });
        } else {
            // Load texture atlas when no color specified
            const textureLoader = new THREE.TextureLoader();
            const atlasTexture = textureLoader.load(this.texturePath);
            atlasTexture.wrapS = THREE.ClampToEdgeWrap;
            atlasTexture.wrapT = THREE.ClampToEdgeWrap;
            atlasTexture.generateMipmaps = false;
            atlasTexture.minFilter = THREE.LinearFilter;
            atlasTexture.magFilter = THREE.LinearFilter;
            
            // Create shader material for texture atlas
            material = new THREE.ShaderMaterial({
                depthTest: false,
                depthWrite: false,
                uniforms: {
                    map: { value: atlasTexture }
                },
                vertexShader: `
                    attribute vec2 uvOffset;
                    varying vec2 vUv;
                    varying vec2 vUvOffset;
                    
                    void main() {
                        vUv = uv;
                        vUvOffset = uvOffset;
                        
                        vec3 transformed = position;
                        
                        #ifdef USE_INSTANCING
                            transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
                        #else
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
                        #endif
                    }
                `,
                fragmentShader: `
                    uniform sampler2D map;
                    varying vec2 vUv;
                    varying vec2 vUvOffset;
                    
                    void main() {
                        vec2 atlasUV = vUv * vec2(0.25, 0.5) + vUvOffset;
                        vec4 texelColor = texture2D(map, atlasUV);
                        gl_FragColor = texelColor;
                    }
                `,
                side: THREE.DoubleSide,
                transparent: true
            });
        }
        
        // Create instanced mesh
        const instancedMesh = new THREE.InstancedMesh(geometry, material, this.count);
        
        // Add UV offset attribute for atlas mapping only when using textures
        if (!this.color) {
            const uvOffsets = new Float32Array(this.count * 2);
            const atlasSize = { x: 4, y: 2 }; // 4 columns, 2 rows

            for (let i = 0; i < this.count; i++) {
                // Pick random atlas cell (0-7)
                const atlasIndex = Math.floor(Math.random() * 8);
                const col = atlasIndex % atlasSize.x;
                const row = Math.floor(atlasIndex / atlasSize.x);
                
                // Calculate UV offset for this atlas cell
                uvOffsets[i * 2] = col / atlasSize.x;       // U offset
                uvOffsets[i * 2 + 1] = row / atlasSize.y;   // V offset
            }
            
            // Add the UV offset attribute to the geometry
            instancedMesh.geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
        }
        
        // Position instances randomly
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < this.count; i++) {
            // Position at exact spawn point (single point in space)
            dummy.position.set(
                this.spawnPosition.x, // Exact spawn X
                this.spawnPosition.y, // Exact spawn Y
                this.spawnPosition.z  // Exact spawn Z
            );
            
            // Initialize random velocities with slight downward bias
            this.velocities[i * 3] = (Math.random() - 0.5) * 0.02;     // vx
            this.velocities[i * 3 + 1] = -Math.random() * 0.04 - 0.02; // vy (downward bias)
            this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02; // vz
            
            // Initialize random Z rotation velocity
            this.rotationVelocities[i] = (Math.random() - 0.5) * this.rotationSpeed;
            
            // Initialize random life
            this.life[i] = Math.random() * this.maxLife;
            
            // Initialize individual variations
            this.dampingVariations[i] = 0.995 + Math.random() * 0.009; // 0.995 to 0.9999
            this.maxSpeedVariations[i] = 0.08 + Math.random() * 0.08; // 0.08 to 0.16
            this.jitterVariations[i] = 0.001 + Math.random() * 0.002; // 0.001 to 0.003
            
            // Random initial Z rotation only
            dummy.rotation.set(0, 0, Math.random() * Math.PI * 2);
            
            // Much smaller scale
            const scale = 0.01 + Math.random() * 0.01; // 0.01 to 0.04 (much smaller)
            dummy.scale.setScalar(scale);
            
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        
        // Add to group
        this.group.add(instancedMesh);
        this.particleSystem = instancedMesh;
    }
    
    // Method to get the group for adding to scene
    getGroup() {
        return this.group;
    }
    
    // Method to check if loaded (always true now since no async loading)
    isLoaded() {
        return true;
    }
    
    // Method to update particles with physics
    update() {
        if (!this.particleSystem) return;
        
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < this.count; i++) {
            // Get current matrix
            this.particleSystem.getMatrixAt(i, dummy.matrix);
            dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
            
            // Apply attraction forces from all target objects
            if (this.targetObjects.length > 0) {
                for (const targetObject of this.targetObjects) {
                    if (targetObject) {
                        // Get target position
                        const attractionPoint = new THREE.Vector3();
                        targetObject.getWorldPosition(attractionPoint);
                        
                        // Calculate distance and attraction force
                        const dx = attractionPoint.x - dummy.position.x;
                        const dy = attractionPoint.y - dummy.position.y;
                        const dz = attractionPoint.z - dummy.position.z;
                        
                        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        
                        // Only apply attraction within radius
                        if (distance < this.attractionRadius && distance > 0.01) {
                            const distSquared = distance * distance + 0.0001;
                            const force = this.attractionForce / distSquared;
                            
                            // Apply attraction force to velocities
                            this.velocities[i * 3] += dx * force;
                            this.velocities[i * 3 + 1] += dy * force;
                            this.velocities[i * 3 + 2] += dz * force;
                        }
                    }
                }
            }
            
            // Apply repulsion forces from all repulsor objects
            if (this.repulsors.length > 0) {
                for (const repulsor of this.repulsors) {
                    if (repulsor) {
                        // Get repulsor position
                        const repulsionPoint = new THREE.Vector3();
                        repulsor.getWorldPosition(repulsionPoint);
                        
                        // Calculate distance and repulsion force
                        const dx = dummy.position.x - repulsionPoint.x; // Note: reversed direction for repulsion
                        const dy = dummy.position.y - repulsionPoint.y;
                        const dz = dummy.position.z - repulsionPoint.z;
                        
                        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        
                        // Only apply repulsion within radius
                        if (distance < this.repulsionRadius && distance > 0.01) {
                            const distSquared = distance * distance + 0.0001;
                            const force = this.repulsionForce / distSquared;
                            
                            // Apply repulsion force to velocities (pushing away)
                            this.velocities[i * 3] += dx * force;
                            this.velocities[i * 3 + 1] += dy * force;
                            this.velocities[i * 3 + 2] += dz * force;
                        }
                    }
                }
            }
            
            // Apply gravity (downward force)
            this.velocities[i * 3 + 1] -= 0.0001; // Reduced gravity for gentler falling
            
            // Apply damping with individual variation
            this.velocities[i * 3] *= this.dampingVariations[i];
            this.velocities[i * 3 + 1] *= this.dampingVariations[i];
            this.velocities[i * 3 + 2] *= this.dampingVariations[i];
            
            // Apply jitter with individual variation
            this.velocities[i * 3] += (Math.random() - 0.5) * this.jitterVariations[i];
            this.velocities[i * 3 + 1] += (Math.random() - 0.5) * this.jitterVariations[i];
            this.velocities[i * 3 + 2] += (Math.random() - 0.5) * this.jitterVariations[i];
            
            // Clamp velocity to individual max speed
            const vx = this.velocities[i * 3];
            const vy = this.velocities[i * 3 + 1];
            const vz = this.velocities[i * 3 + 2];
            const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
            
            if (speed > this.maxSpeedVariations[i]) {
                const scale = this.maxSpeedVariations[i] / speed;
                this.velocities[i * 3] *= scale;
                this.velocities[i * 3 + 1] *= scale;
                this.velocities[i * 3 + 2] *= scale;
            }
            
            // Update position
            dummy.position.x += this.velocities[i * 3];
            dummy.position.y += this.velocities[i * 3 + 1];
            dummy.position.z += this.velocities[i * 3 + 2];
            
            // Update Z rotation only
            const currentRotation = dummy.rotation.z + this.rotationVelocities[i];
            dummy.rotation.set(0, 0, currentRotation);
            
            // Update life
            this.life[i]--;
            
            // Scale based on remaining life - grow bigger as life decreases
            const lifeRatio = this.life[i] / this.maxLife; // 1.0 to 0.0
            // Exponential growth: scale = min + (max - min) * (1 - exp(-k * (1 - lifeRatio)))
            const minScale = this.baseScale * 0.1; // Start very small
            const maxScale = this.baseScale + this.scaleRange; // Use constructor parameters
            const k = 4; // Growth rate, higher = more rapid growth
            const exponential = 1 - Math.exp(-k * (1 - lifeRatio));
            const scale = minScale + (maxScale - minScale) * exponential;
            dummy.scale.setScalar(scale);
            
            // Check if particle should respawn
            if (this.life[i] <= 0) {
                // Respawn at exact spawn point (single point in space)
                dummy.position.set(
                    this.spawnPosition.x, // Exact spawn X
                    this.spawnPosition.y, // Exact spawn Y
                    this.spawnPosition.z  // Exact spawn Z
                );
                
                // Reset velocities with downward bias
                this.velocities[i * 3] = (Math.random() - 0.5) * 0.01;     // vx
                this.velocities[i * 3 + 1] = -Math.random() * 0.08 - 0.01; // vy (downward bias)
                this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01; // vz
                
                // Reset rotation velocity with more drama
                this.rotationVelocities[i] = (Math.random() - 0.5) * this.rotationSpeed * 3;
                
                // Reset individual variations
                this.dampingVariations[i] = 0.995 + Math.random() * 0.009; // 0.995 to 0.9999
                this.maxSpeedVariations[i] = 0.08 + Math.random() * 0.08; // 0.08 to 0.16
                this.jitterVariations[i] = 0.001 + Math.random() * 0.002; // 0.001 to 0.003
                
                // Reset life with variation (80-100% of max life)
                this.life[i] = this.maxLife * (0.8 + Math.random() * 0.2);
            }
            
            // Update matrix
            dummy.updateMatrix();
            this.particleSystem.setMatrixAt(i, dummy.matrix);
        }
        
        this.particleSystem.instanceMatrix.needsUpdate = true;
    }
    
    // Method to set attraction point
    setAttractionPoint(x, y, z) {
        this.attractionPoint.set(x, y, z);
    }
    
    // Method to dispose of resources
    dispose() {
        if (this.particleSystem) {
            if (this.particleSystem.geometry) this.particleSystem.geometry.dispose();
            if (this.particleSystem.material) this.particleSystem.material.dispose();
        }
    }
}
