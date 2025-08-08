import * as THREE from 'three';

export class InstancedParticleSystem extends THREE.Mesh {

    update(){
        // Simple update method without repulsor logic
        // Available for future enhancements
    }

    constructor(texture, gridX, gridY, quadSize = 1) {
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
                scales[i] = 1; // Initial scale

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

        // Store physics arrays after super() call
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
