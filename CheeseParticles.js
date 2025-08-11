import * as THREE from 'three';

export class CheeseParticles {
    constructor(count, targetObject = null, texturePath = 'public/part-tex-atlas.png', spawnPosition = { x: -2, y: 2, z: 0 }) {
        this.count = count;
        this.group = new THREE.Group();
        this.targetObject = targetObject; // Object to track
        this.texturePath = texturePath; // Texture file path
        this.spawnPosition = spawnPosition; // Spawn position
        
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
        this.attractionForce = 0.02;
        this.damping = 0.99999; // Reduced friction (was 0.999)
        this.rotationSpeed = 0.02;
        this.maxLife = 160; // Reduced from 300 to 120
        this.maxSpeed = 0.005; // Maximum particle speed
            // Add random velocity jitter
        this.jitterStrength = 0.002;
        
        // Create simple particle system with plane geometry
        this.createParticleSystem();
    }
    
    createParticleSystem() {
        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(1, 1);
        
        // Load texture atlas
        const textureLoader = new THREE.TextureLoader();
        const atlasTexture = textureLoader.load(this.texturePath);
        atlasTexture.wrapS = THREE.ClampToEdgeWrap;
        atlasTexture.wrapT = THREE.ClampToEdgeWrap;
        atlasTexture.generateMipmaps = false;
        atlasTexture.minFilter = THREE.LinearFilter;
        atlasTexture.magFilter = THREE.LinearFilter;
        
        // Create basic shader material
        const material = new THREE.ShaderMaterial({
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
        
        // Create instanced mesh
        const instancedMesh = new THREE.InstancedMesh(geometry, material, this.count);
        
        // Add UV offset attribute for atlas mapping (4x2 grid = 8 textures)
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
        
        // Position instances randomly
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < this.count; i++) {
            // Position across full width of screen at top
            dummy.position.set(
                (Math.random() - 0.5) * 8, // Full screen width: -4 to +4
                3 + Math.random() * 1, // Top of screen with some variation: 3 to 4
                this.spawnPosition.z + (Math.random() - 0.5) * 0.5 // ±0.25 around spawn depth
            );
            
            // Initialize random velocities
            this.velocities[i * 3] = (Math.random() - 0.5) * 0.02;     // vx
            this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02; // vy
            this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02; // vz
            
            // Initialize random Z rotation velocity
            this.rotationVelocities[i] = (Math.random() - 0.5) * this.rotationSpeed;
            
            // Initialize random life
            this.life[i] = Math.random() * this.maxLife;
            
            // Initialize individual variations
            this.dampingVariations[i] = 0.995 + Math.random() * 0.009; // 0.995 to 0.9999
            this.maxSpeedVariations[i] = 0.08 + Math.random() * 0.08; // 0.08 to 0.16
            this.jitterVariations[i] = 0.01 + Math.random() * 0.03; // 0.01 to 0.04
            
            // Random initial Z rotation only
            dummy.rotation.set(0, 0, Math.random() * Math.PI * 2);
            
            // Much smaller scale
            const scale = 0.01 + Math.random() * 0.03; // 0.01 to 0.04 (much smaller)
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
        
        // Update attraction point to target object's global position
        if (this.targetObject) {
            this.targetObject.getWorldPosition(this.attractionPoint);
        }
        
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < this.count; i++) {
            // Get current matrix
            this.particleSystem.getMatrixAt(i, dummy.matrix);
            dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
            
            // Calculate attraction force
            const dx = this.attractionPoint.x - dummy.position.x;
            const dy = this.attractionPoint.y - dummy.position.y;
            const dz = this.attractionPoint.z - dummy.position.z;
            
            const distSquared = dx * dx + dy * dy + dz * dz + 0.0001; // Avoid division by zero
            const force = this.attractionForce / distSquared;
            
            // Apply attraction force to velocities
            this.velocities[i * 3] += dx * force;
            this.velocities[i * 3 + 1] += dy * force;
            this.velocities[i * 3 + 2] += dz * force;
            
            // Apply gravity (downward force)
            this.velocities[i * 3 + 1] -= 0.002; // Mild gravity pulling down
            
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
            
            // Scale based on remaining life - grow bigger as life decreases (much smaller)
            const lifeRatio = this.life[i] / this.maxLife; // 1.0 to 0.0
            // Exponential growth: scale = min + (max - min) * (1 - exp(-k * (1 - lifeRatio)))
            const minScale = 0.001;
            const maxScale = 0.1;
            const k = 4; // Growth rate, higher = more rapid growth
            const exponential = 1 - Math.exp(-k * (1 - lifeRatio));
            const scale = minScale + (maxScale - minScale) * exponential;
            dummy.scale.setScalar(scale);
            
            // Check if particle should respawn
            if (this.life[i] <= 0) {
                // Respawn across full width at top of screen
                dummy.position.set(
                    (Math.random() - 0.5) * 8, // Full screen width: -4 to +4
                    3 + Math.random() * 1, // Top of screen with some variation: 3 to 4
                    this.spawnPosition.z + (Math.random() - 0.5) * 0.5 // ±0.25 around spawn depth
                );
                
                // Reset velocities with more dramatic variation
                this.velocities[i * 3] = (Math.random() - 0.5) * 0.08;     // 4x more variation
                this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.08; // 4x more variation
                this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.08; // 4x more variation
                
                // Reset rotation velocity with more drama
                this.rotationVelocities[i] = (Math.random() - 0.5) * this.rotationSpeed * 3;
                
                // Reset individual variations
                this.dampingVariations[i] = 0.995 + Math.random() * 0.009; // 0.995 to 0.9999
                this.maxSpeedVariations[i] = 0.08 + Math.random() * 0.08; // 0.08 to 0.16
                this.jitterVariations[i] = 0.01 + Math.random() * 0.03; // 0.01 to 0.04
                
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
