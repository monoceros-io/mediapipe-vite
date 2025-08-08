import * as THREE from 'three';

export class InstancedParticleSystem extends THREE.Mesh {

    update(){
        // Animate Z position with sine wave, staggered by instance index
        const attr = this.geometry.getAttribute('instancePos');
        const time = performance.now() * 0.001;
        for (let i = 0; i < this.total; i++) {
            const phase = i * 0.2; // Stagger factor
            const z = Math.sin(time + phase); // Range [-1,1]
            // Keep X and Y unchanged, animate Z
            const x = attr.getX(i);
            const y = attr.getY(i);
            attr.setXYZ(i, x, y, z);
        }
        attr.needsUpdate = true;
    }

    constructor(texture, gridX, gridY, quadSize = 1) {
        // Build geometry
        const total = gridX * gridY;
        const base = new THREE.BoxGeometry(quadSize, quadSize, quadSize);
        const geometry = new THREE.InstancedBufferGeometry().copy(base);
        geometry.instanceCount = total;

        const positions = new Float32Array(total * 3);
        const uvOffsets = new Float32Array(total * 2);
        const uvScale = new Float32Array(total * 2);
        const rotations = new Float32Array(total); // New: rotation per instance

        let i = 0;
        for (let y = 0; y < gridY; y++) {
            for (let x = 0; x < gridX; x++) {
                positions[i * 3]     = (x - gridX / 2) * quadSize;
                positions[i * 3 + 1] = (y - gridY / 2) * quadSize;
                positions[i * 3 + 2] = 0;

                uvOffsets[i * 2]     = x / gridX;
                uvOffsets[i * 2 + 1] = y / gridY;

                uvScale[i * 2]       = 1.0 / gridX;
                uvScale[i * 2 + 1]   = 1.0 / gridY;

                rotations[i]         = 0.0; // Initial rotation

                i++;
            }
        }

        geometry.setAttribute('instancePos', new THREE.InstancedBufferAttribute(positions, 3));
        geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
        geometry.setAttribute('uvScale', new THREE.InstancedBufferAttribute(uvScale, 2));
        geometry.setAttribute('instanceRot', new THREE.InstancedBufferAttribute(rotations, 1)); // New

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
                varying vec2 vUv;
                void main() {
                    vUv = uv * uvScale + uvOffset;
                    // Apply rotation around Z
                    float c = cos(instanceRot);
                    float s = sin(instanceRot);
                    vec3 pos = position;
                    pos.xy = vec2(
                        position.x * c - position.y * s,
                        position.x * s + position.y * c
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
