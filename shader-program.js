const finalCanvas = document.getElementById('final-canvas');
const width = finalCanvas.width;
const height = finalCanvas.height;

const gl = finalCanvas.getContext('webgl');
if (!gl) throw new Error('WebGL not supported');

const vertSrc = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
    gl_Position = vec4(a_position, 1.0, 1);
    v_texCoord = a_texCoord;
}
`;

const fragSrc = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_mask0;
uniform sampler2D u_mask1;
uniform sampler2D u_mask2;
uniform sampler2D u_mask3;
uniform sampler2D u_video;
uniform vec4 u_captureAreas[2];
uniform float u_brightness;
uniform float u_contrast;
uniform bool u_overlayMask;

vec2 cropSample(vec2 t, vec4 area) {
    return vec2(
        area.x + t.x * area.z,
        area.y + t.y * area.w
    );
}

// 7x7 box blur for mask channel (stronger blur)
float blurMask(sampler2D mask, vec2 uv, vec2 texel) {
    float sum = 0.0;
    for (int dx = -3; dx <= 3; ++dx) {
        for (int dy = -3; dy <= 3; ++dy) {
            sum += texture2D(mask, uv + vec2(float(dx), float(dy)) * texel).r;
        }
    }
    return sum / 49.0;
}

void main() {
    vec2 tex = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
    vec3 outputColor = vec3(0.0);
    float a = 1.0;

    if (u_overlayMask) {
        if (tex.x < 0.5) {
            // First video+mask (left half)
            vec2 t = vec2(tex.x * 2.0, tex.y);
            vec2 videoTex = cropSample(t, u_captureAreas[0]);
            vec4 videoColor = texture2D(u_video, videoTex);
            vec2 texel = vec2(1.0 / float(${width / 2}), 1.0 / float(${height}));
            float m0 = blurMask(u_mask0, t, texel); // red
            float m1 = blurMask(u_mask1, t, texel); // green

            float redEdge = smoothstep(0.30, 0.70, m0);
            float greenEdge = smoothstep(0.30, 0.70, m1);

            if (redEdge > 0.5) {
                // Red mask: transparency cutout
                a = 1.0 - redEdge;
                outputColor = vec3(0.0);
            } else if (greenEdge > 0.0) {
                // Green mask: multiply video by green, soft edge
                vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                outputColor = mix(color, color * vec3(0.0, 1.0, 0.0), greenEdge);
                a = 1.0;
            } else {
                vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                outputColor = color;
                a = 1.0;
            }
        } else {
            // Second video+mask (right half)
            vec2 t = vec2((tex.x - 0.5) * 2.0, tex.y);
            vec2 videoTex = cropSample(t, u_captureAreas[1]);
            vec4 videoColor = texture2D(u_video, videoTex);
            vec2 texel = vec2(1.0 / float(${width / 2}), 1.0 / float(${height}));
            float m2 = blurMask(u_mask2, t, texel); // blue
            float m3 = blurMask(u_mask3, t, texel); // yellow

            float blueEdge = smoothstep(0.30, 0.70, m2);
            float yellowEdge = smoothstep(0.30, 0.70, m3);

            if (blueEdge > 0.5) {
                // Blue mask: transparency cutout
                a = 1.0 - blueEdge;
                outputColor = vec3(0.0);
            } else if (yellowEdge > 0.0) {
                // Yellow mask: multiply video by yellow, soft edge
                vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                outputColor = mix(color, color * vec3(1.0, 1.0, 0.0), yellowEdge);
                a = 1.0;
            } else {
                vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                outputColor = color;
                a = 1.0;
            }
        }
    } else {
        // Default: masks in first/third, videos in second/fourth (quarters)
        if (tex.x < 0.25) {
            vec2 t = vec2(tex.x * 4.0, tex.y);
            vec2 texel = vec2(1.0 / float(${width / 4}), 1.0 / float(${height}));
            float m0 = blurMask(u_mask0, t, texel);
            float m1 = blurMask(u_mask1, t, texel);
            vec3 blendA = mix(vec3(0.0), vec3(1.0, 0.0, 0.0), m0); // red mask
            blendA = mix(blendA, vec3(0.0, 1.0, 0.0), m1); // green mask
            outputColor = blendA;
        } else if (tex.x >= 0.25 && tex.x < 0.5) {
            vec2 t = vec2((tex.x - 0.25) * 4.0, tex.y);
            vec2 videoTex = cropSample(t, u_captureAreas[0]);
            vec4 videoColor = texture2D(u_video, videoTex);
            vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
            outputColor = color;
        } else if (tex.x >= 0.5 && tex.x < 0.75) {
            vec2 t = vec2((tex.x - 0.5) * 4.0, tex.y);
            vec2 texel = vec2(1.0 / float(${width / 4}), 1.0 / float(${height}));
            float m2 = blurMask(u_mask2, t, texel);
            float m3 = blurMask(u_mask3, t, texel);
            vec3 blendB = mix(vec3(0.0), vec3(0.0, 0.0, 1.0), m2); // blue mask
            blendB = mix(blendB, vec3(1.0, 1.0, 0.0), m3); // yellow mask
            outputColor = blendB;
        } else if (tex.x >= 0.75 && tex.x < 1.0) {
            vec2 t = vec2((tex.x - 0.75) * 4.0, tex.y);
            vec2 videoTex = cropSample(t, u_captureAreas[1]);
            vec4 videoColor = texture2D(u_video, videoTex);
            vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
            outputColor = color;
        }
    }
    gl_FragColor = vec4(outputColor, a);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
    const v = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const f = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    gl.attachShader(program, v);
    gl.attachShader(program, f);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

const program = createProgram(gl, vertSrc, fragSrc);
gl.useProgram(program);

// Setup buffer and attributes
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
        -1, -1, 0, 0,
         1, -1, 1, 0,
        -1,  1, 0, 1,
         1,  1, 1, 1
    ]),
    gl.STATIC_DRAW
);

const attribs = [
    { name: 'a_position', size: 2, offset: 0 },
    { name: 'a_texCoord', size: 2, offset: 8 }
];
attribs.forEach(attr => {
    const loc = gl.getAttribLocation(program, attr.name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, 16, attr.offset);
});

// Setup textures and uniforms
const textureUnits = [0, 1, 2, 3, 4]; // 4 masks, 1 video
const uniforms = ['u_mask0', 'u_mask1', 'u_mask2', 'u_mask3', 'u_video'];
uniforms.forEach((name, i) => {
    gl.uniform1i(gl.getUniformLocation(program, name), textureUnits[i]);
});

const u_captureAreas = gl.getUniformLocation(program, 'u_captureAreas');
const u_brightness = gl.getUniformLocation(program, 'u_brightness');
const u_contrast = gl.getUniformLocation(program, 'u_contrast');
const u_overlayMask = gl.getUniformLocation(program, 'u_overlayMask');
// Set default values
gl.uniform1f(u_brightness, 0.0);
gl.uniform1f(u_contrast, 1.5);
gl.uniform1i(u_overlayMask, 0);

// Helper to set capture areas (expects array of 2 crops: [x, y, w, h] normalized to video texture)
function setCaptureAreas(captureAreas) {
    // captureAreas: [[x0, y0, w0, h0], [x1, y1, w1, h1]] in normalized (0..1) coordinates
    const flat = new Float32Array(8);
    for (let i = 0; i < 2; ++i) flat.set(captureAreas[i], i * 4);
    gl.uniform4fv(u_captureAreas, flat);
}
window.setCaptureAreas = setCaptureAreas;

// Helper to set brightness/contrast
function setBrightnessContrast(brightness, contrast) {
    gl.useProgram(program);
    gl.uniform1f(u_brightness, brightness);
    gl.uniform1f(u_contrast, contrast);
}
window.setBrightnessContrast = setBrightnessContrast;

// Helper to set overlay mask mode
function setOverlayMask(enabled) {
    gl.useProgram(program);
    gl.uniform1i(u_overlayMask, enabled ? 1 : 0);
}
window.setOverlayMask = setOverlayMask;

// Texture creation helper
function createAndSetupTexture(unit, format, w, h) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        format,
        w,
        h,
        0,
        format,
        gl.UNSIGNED_BYTE,
        null
    );
    return tex;
}

const textures = textureUnits.map(i =>
    createAndSetupTexture(i, gl.LUMINANCE, width, height)
);

window.videoTexture = textures[4];

function uploadMaskToTexture(maskArray, unit, w, h) {
    const glTex = textures[unit];
    const u8 = new Uint8Array(maskArray.length);
    for (let i = 0; i < maskArray.length; i++) u8[i] = Math.round(maskArray[i] * 255);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, u8);
}

function clearMaskTexture(unit, w, h) {
    const zero = new Uint8Array(w * h);
    const glTex = textures[unit];
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, zero);
}

function blendCanvasesToOutCanvas(destCanvas) {
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

window.uploadMaskToTexture = uploadMaskToTexture;
window.clearMaskTexture = clearMaskTexture;
window.blendCanvasesToOutCanvas = blendCanvasesToOutCanvas;

export { blendCanvasesToOutCanvas };