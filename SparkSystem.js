import * as THREE from 'three';

const MAX_LIFE = 1000;
const MIN_LIFE = 10;

export class SparkSystem extends THREE.Mesh {
    constructor(particleCount = 50, cloudSize = 5) {
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
            positions[i * 3] = (Math.random() - 0.5) * 5;
            positions[i * 3 + 1] = (Math.random() - 2);
            positions[i * 3 + 2] = (Math.random() - 0.5);
            
            // Random burst velocity - ensure balanced distribution
            const angle = 0;
            const speed = Math.random() * 0.01 + 0.003;
            velocities[i * 3] = Math.cos(angle) * speed;
            velocities[i * 3 + 1] = Math.random() * 0.01 + 0.003; // Always upward
            velocities[i * 3 + 2] = Math.sin(angle) * speed;
            
            const maxLife = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);
            maxLives[i] = maxLife;
            lives[i] = maxLife;
            scales[i] = 0.5 + Math.random() * 0.5;
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

                // Scale the particle based on life
                float lifeFactor = vLife / vMaxLife;
                vec3 pos = position * instanceScale * lifeFactor;
                
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
                
                gl_FragColor = vec4(sparkColor * texColor.rgb, texColor.a * lifeFactor);
            }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        super(geometry, material);

        this.particleCount = particleCount;
        this.cloudSize = cloudSize;
        
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

        for (let i = 0; i < this.particleCount; i++) {
            // Apply physics
            // this.velocities[i * 3] *= 0.998; // Air resistance
            // this.velocities[i * 3 + 1] -= 0.0003; // Gravity
            // this.velocities[i * 3 + 2] *= 0.998; // Air resistance
            
            // Update position
            this.positions[i * 3] += this.velocities[i * 3];
            this.positions[i * 3 + 1] += this.velocities[i * 3 + 1];
            this.positions[i * 3 + 2] += this.velocities[i * 3 + 2];
            
            this.lives[i] -= 1;
            
            if (this.lives[i] <= 0) {
                // Reset particle with burst effect
                this.positions[i * 3] = (Math.random() - 0.5) * 5;
                this.positions[i * 3 + 1] = (Math.random() - 2);
                this.positions[i * 3 + 2] = (Math.random() - 0.5);
                
                // Balanced radial velocity
                const angle = Math.random() * Math.PI - Math.PI;
                const speed = Math.random() * 0.03 + 0.01;
                this.velocities[i * 3] = Math.cos(angle) * speed;
                this.velocities[i * 3 + 1] = Math.random() * 0.01 + 0.01; // Always upward
                this.velocities[i * 3 + 2] = Math.sin(angle) * speed;


                
                this.maxLives[i] = this.lives[i] = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);
                this.scales[i] = 0.5 + Math.random() * 1.5;
            }
        }
        
        this.positionAttr.needsUpdate = true;
        this.velocityAttr.needsUpdate = true;
        this.lifeAttr.needsUpdate = true;
        this.maxLifeAttr.needsUpdate = true;
    }
}

export default SparkSystem;
