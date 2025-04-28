import * as THREE from 'three';

const SpiralShaderMaterial = () => new THREE.ShaderMaterial({
    uniforms: {
        rot_points: { value: new Float32Array(100) }, // 20 points * 5 values
        time: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float rot_points[100];
        uniform float time;
        varying vec2 vUv;

        void main() {
            float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
            float radius = length(vUv - vec2(0.5));
            float green = 0.0;
            float alpha = 0.0;
            for (int i = 0; i < 20; i++) {
                float base = float(i) * 5.0;
                float pt_angle = rot_points[int(base) + 0];
                float pt_range = rot_points[int(base) + 1];
                float pt_start = rot_points[int(base) + 2] * 2.0;
                float pt_alpha = rot_points[int(base) + 3];
                // float pt_speed = rot_points[int(base) + 4]; // not used in shader
                float d_angle = abs(mod(angle - pt_angle + 3.14159265, 6.2831853) - 3.14159265);
                if (d_angle < pt_range && radius > pt_start) {
                    green = 1.0;
                    alpha += pt_alpha;;
                    break;
                }
            }
            gl_FragColor = vec4(0.0, green, 0.0, alpha);
        }
    `,
    transparent: true
});

export default SpiralShaderMaterial;
