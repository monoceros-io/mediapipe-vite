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

vec2 cropSample(vec2 t, vec4 area) {
    return vec2(
        area.x + t.x * area.z,
        area.y + t.y * area.w
    );
}

void main() {
    vec2 tex = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
    vec3 outputColor = vec3(0.0);

    if (tex.x < 0.25) {
        // First mask pair (first quarter)
        vec2 t = vec2(tex.x * 4.0, tex.y);
        float m0 = texture2D(u_mask0, t).r;
        float m1 = texture2D(u_mask1, t).r;
        vec3 blendA = mix(vec3(0.0), vec3(1.0, 0.0, 0.0), m0); // red mask
        blendA = mix(blendA, vec3(0.0, 1.0, 0.0), m1); // green mask
        outputColor = blendA;
    } else if (tex.x >= 0.25 && tex.x < 0.5) {
        // First video feed (second quarter)
        vec2 t = vec2((tex.x - 0.25) * 4.0, tex.y);
        vec2 videoTex = cropSample(t, u_captureAreas[0]);
        vec4 videoColor = texture2D(u_video, videoTex);
        outputColor = videoColor.rgb;
    } else if (tex.x >= 0.5 && tex.x < 0.75) {
        // Second mask pair (third quarter)
        vec2 t = vec2((tex.x - 0.5) * 4.0, tex.y);
        float m2 = texture2D(u_mask2, t).r;
        float m3 = texture2D(u_mask3, t).r;
        vec3 blendB = mix(vec3(0.0), vec3(0.0, 0.0, 1.0), m2); // blue mask
        blendB = mix(blendB, vec3(1.0, 1.0, 0.0), m3); // yellow mask
        outputColor = blendB;
    } else if (tex.x >= 0.75 && tex.x < 1.0) {
        // Second video feed (fourth quarter)
        vec2 t = vec2((tex.x - 0.75) * 4.0, tex.y);
        vec2 videoTex = cropSample(t, u_captureAreas[1]);
        vec4 videoColor = texture2D(u_video, videoTex);
        outputColor = videoColor.rgb;
    }
    // else: outputColor remains black

    gl_FragColor = vec4(outputColor, 1.0);
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

const a_position = gl.getAttribLocation(program, 'a_position');
const a_texCoord = gl.getAttribLocation(program, 'a_texCoord');

gl.enableVertexAttribArray(a_position);
gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(a_texCoord);
gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, 16, 8);

const textureUnits = [0, 1, 2, 3, 4]; // 4 masks, 1 video
const uniforms = ['u_mask0', 'u_mask1', 'u_mask2', 'u_mask3', 'u_video'];
uniforms.forEach((name, i) => {
    gl.uniform1i(gl.getUniformLocation(program, name), textureUnits[i]);
});

// Add uniform location for capture areas
const u_captureAreas = gl.getUniformLocation(program, 'u_captureAreas');

// Helper to set capture areas (expects array of 2 crops: [x, y, w, h] normalized to video texture)
function setCaptureAreas(captureAreas) {
    // captureAreas: [[x0, y0, w0, h0], [x1, y1, w1, h1]] in normalized (0..1) coordinates
    const flat = new Float32Array(8);
    for (let i = 0; i < 2; ++i) {
        flat.set(captureAreas[i], i * 4);
    }
    gl.useProgram(program);
    gl.uniform4fv(u_captureAreas, flat);
}
window.setCaptureAreas = setCaptureAreas;

const textures = textureUnits.map(() => gl.createTexture());
textures.forEach((tex, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        width,
        height,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        null
    );
});

window.videoTexture = textures[4];

function uploadMaskToTexture(maskArray, unit, w, h) {
    const glTex = textures[unit];
    const u8 = new Uint8Array(maskArray.length);
    for (let i = 0; i < maskArray.length; i++) {
        u8[i] = Math.round(maskArray[i] * 255);
    }
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
    const glCtx = gl;
    glCtx.viewport(0, 0, width, height);
    glCtx.clear(glCtx.COLOR_BUFFER_BIT);
    glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4);
}

window.uploadMaskToTexture = uploadMaskToTexture;
window.clearMaskTexture = clearMaskTexture;
window.blendCanvasesToOutCanvas = blendCanvasesToOutCanvas;

export { blendCanvasesToOutCanvas };