import * as THREE from 'three';

const EXPERIENCE_COLOR = 0xffff00;
const CUBE_COUNT = 100;
const FORE_SPRITE_COUNT = 50;
const MAX_LIFE = 1000;

export default {
    initBackground(canvas) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 5);
        const geometry = new THREE.TorusKnotGeometry(0.6, 0.2, 100, 16);
        const cubes = [];
        for (let j = 0; j < CUBE_COUNT; j++) {
            const material = new THREE.MeshStandardMaterial({ color: EXPERIENCE_COLOR, roughness: 0.5, metalness: 0.5 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * -10);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            scene.add(mesh);
            cubes.push(mesh);
        }
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);
        return { renderer, scene, camera, meshes: cubes };
    },
    initForeground(canvas, spriteTexture) {
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 0, 5);
        const sprites = [];
        const velocities = [];
        const life = [];
        for (let j = 0; j < FORE_SPRITE_COUNT; j++) {
            const material = new THREE.SpriteMaterial({ 
                map: spriteTexture, 
                color: EXPERIENCE_COLOR,
                transparent: true
            });
            const sprite = new THREE.Sprite(material);
            sprite.position.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2);
            sprite.scale.set(0.2, 0.2, 0.2);
            scene.add(sprite);
            sprites.push(sprite);
            velocities[j] = [
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05
            ];
            life[j] = Math.floor(Math.random() * MAX_LIFE);
        }
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        scene.add(light);
        return { renderer, scene, camera, sprites, velocities, life };
    }
};
