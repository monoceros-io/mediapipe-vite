import * as THREE from 'three';

export class PepperParticles {
    constructor(count) {
        this.count = count;
        this.group = new THREE.Group();
        
        // Physics arrays
        this.velocities = new Float32Array(count * 3);
        this.rotationVelocities = new Float32Array(count); // Z-axis rotation only
        this.life = new Float32Array(count); // Life for each particle
        
        // Attraction point
        this.attractionPoint = new THREE.Vector3(0, 0, 0);
        
        // Physics constants
        this.attractionForce = 0.001;
        this.damping = 0.98;
        this.rotationSpeed = 0.02;
        this.maxLife = 300; // Maximum life value
        
        // Create simple particle system with plane geometry
        this.createParticleSystem();
    }
    
    createParticleSystem() {
        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(1, 1);
        
        // Load texture atlas
        const textureLoader = new THREE.TextureLoader();
        const atlasTexture = textureLoader.load('public/salt_and_pepper.png');
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
            // Pick random atlas cell from full 4x2 grid (0-7)
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
            // Simple random rectangular positioning, more spaced out
            dummy.position.set(
                (Math.random() - 0.5) * 5, // -2.5 to 2.5
                (Math.random() - 0.5) * 5, // -2.5 to 2.5
                (Math.random() - 0.5) * 0  // flat
            );
            
            // Initialize random velocities
            this.velocities[i * 3] = (Math.random() - 0.5) * 0.02;     // vx
            this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02; // vy
            this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02; // vz
            
            // Initialize random Z rotation velocity
            this.rotationVelocities[i] = (Math.random() - 0.5) * this.rotationSpeed;
            
            // Initialize random life
            this.life[i] = Math.random() * this.maxLife;
            
            // Random initial Z rotation only
            dummy.rotation.set(0, 0, Math.random() * Math.PI * 2);
            
            // Smaller scale
            const scale = 0.1 + Math.random() * 0.2; // 0.1 to 0.3
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
            
            // Apply damping
            this.velocities[i * 3] *= this.damping;
            this.velocities[i * 3 + 1] *= this.damping;
            this.velocities[i * 3 + 2] *= this.damping;
            
            // Update position
            dummy.position.x += this.velocities[i * 3];
            dummy.position.y += this.velocities[i * 3 + 1];
            dummy.position.z += this.velocities[i * 3 + 2];
            
            // Update Z rotation only
            const currentRotation = dummy.rotation.z + this.rotationVelocities[i];
            dummy.rotation.set(0, 0, currentRotation);
            
            // Update life
            this.life[i]--;
            
            // Check if particle should respawn
            if (this.life[i] <= 0) {
                // Respawn at (2, 2, 0) - top right to center
                dummy.position.set(2, 2, 0);
                
                // Reset velocities
                this.velocities[i * 3] = (Math.random() - 0.5) * 0.02;
                this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
                this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
                
                // Reset rotation velocity
                this.rotationVelocities[i] = (Math.random() - 0.5) * this.rotationSpeed;
                
                // Reset life
                this.life[i] = this.maxLife;
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
