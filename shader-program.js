const finalCanvas = document.getElementById('final-canvas');
let width = finalCanvas.width;
let height = finalCanvas.height;

const gl = finalCanvas.getContext('webgl');
if (!gl) throw new Error('WebGL not supported');

function updateGLSize() {
    width = finalCanvas.width;
    height = finalCanvas.height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.uniform1f(u_width, width);
    gl.uniform1f(u_height, height);
}

window.addEventListener('resize', updateGLSize);

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
uniform float u_width;
uniform float u_height;
uniform vec3 u_maskColors[4];

vec2 cropSample(vec2 t, vec4 area) {
    return vec2(
        area.x + t.x * area.z,
        area.y + t.y * area.w
    );
}

// 7x7 box blur for mask channel (subtle blur)
float blurMask(sampler2D mask, vec2 uv, vec2 texel) {
    float sum = 0.0;
    for (int dx = -3; dx <= 3; ++dx) {
        for (int dy = -3; dy <= 3; ++dy) {
            sum += texture2D(mask, uv + vec2(float(dx), float(dy)) * texel).r;
        }
    }
    return clamp(sum / 49.0, 0.0, 1.0);
}

// Aspect-ratio fit and center logic for a half
// Returns: (inCrop, cropUV)
bool aspectFitHalf(vec2 tex, float halfX0, float halfX1, vec4 area, out vec2 cropUV) {
    float halfW = u_width / 2.0;
    float halfH = u_height;
    float cropW = area.z * u_width;
    float cropH = area.w * u_height;
    float cropAspect = cropW / cropH;
    float halfAspect = halfW / halfH;
    float scale, padX, padY, drawW, drawH;
    if (cropAspect > halfAspect) {
        // Fit to width
        scale = halfW / cropW;
        drawW = halfW;
        drawH = cropH * scale;
        padX = 0.0;
        padY = (halfH - drawH) / 2.0;
    } else {
        // Fit to height
        scale = halfH / cropH;
        drawH = halfH;
        drawW = cropW * scale;
        padY = 0.0;
        padX = (halfW - drawW) / 2.0;
    }
    // Map tex to [0,1] in half
    float localX = (tex.x - halfX0) / (halfX1 - halfX0);
    float px = localX * halfW;
    float py = tex.y * halfH;
    // Check if inside drawn crop
    if (px < padX || px > (padX + drawW) || py < padY || py > (padY + drawH)) {
        cropUV = vec2(0.0);
        return false;
    }
    // Map to cropUV in [0,1]
    float u = (px - padX) / drawW;
    float v = (py - padY) / drawH;
    cropUV = vec2(u, v);
    return true;
}

void main() {
    // Flip horizontally by reversing x
    vec2 tex = vec2(1.0 - v_texCoord.x, 1.0 - v_texCoord.y);

    vec3 outputColor = vec3(0.0);
    float a = 1.0;

    if (u_overlayMask) {
        bool inCrop = false;
        vec2 cropUV;
        if (tex.x < 0.5) {
            // Left half
            inCrop = aspectFitHalf(tex, 0.0, 0.5, u_captureAreas[0], cropUV);
            if (!inCrop) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // transparent
                return;
            }
            vec2 t = cropUV;
            vec2 videoTex = cropSample(t, u_captureAreas[0]);
            vec4 videoColor = texture2D(u_video, videoTex);
            vec2 texel = vec2(1.0 / (u_width / 2.0), 1.0 / u_height);
            float m0 = blurMask(u_mask0, t, texel);
            float m1 = blurMask(u_mask1, t, texel);
            float mask0Edge = smoothstep(0.05, 0.35, m0);
            float mask1Edge = smoothstep(0.05, 0.35, m1);
            if (mask0Edge > 0.5) {
                a = 1.0 - mask0Edge;
                outputColor = vec3(0.0);
            } else if (mask1Edge > 0.0) {
                vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                outputColor = mix(color, color * u_maskColors[1], mask1Edge);
                a = 1.0;
            } else {
                vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                outputColor = color;
                a = 1.0;
            }
        } else {
            // Right half
            inCrop = aspectFitHalf(tex, 0.5, 1.0, u_captureAreas[1], cropUV);
            if (!inCrop) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // transparent
                return;
            }
            vec2 t = cropUV;
            vec2 videoTex = cropSample(t, u_captureAreas[1]);
            vec4 videoColor = texture2D(u_video, videoTex);
            vec2 texel = vec2(1.0 / (u_width / 2.0), 1.0 / u_height);
            float m2 = blurMask(u_mask2, t, texel);
            float m3 = blurMask(u_mask3, t, texel);
            float mask2Edge = smoothstep(0.05, 0.35, m2);
            float mask3Edge = smoothstep(0.05, 0.35, m3);
            if (mask2Edge > 0.5) {
                a = 1.0 - mask2Edge;
                outputColor = vec3(0.0);
            } else if (mask3Edge > 0.0) {
                vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                outputColor = mix(color, color * u_maskColors[3], mask3Edge);
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
            vec2 texel = vec2(1.0 / (u_width / 4.0), 1.0 / u_height);
            float m0 = blurMask(u_mask0, t, texel);
            float m1 = blurMask(u_mask1, t, texel);
            vec3 blendA = mix(vec3(0.0), u_maskColors[0], m0); // red mask
            blendA = mix(blendA, u_maskColors[1], m1); // green mask
            outputColor = blendA;
        } else if (tex.x >= 0.25 && tex.x < 0.5) {
            vec2 t = vec2((tex.x - 0.25) * 4.0, tex.y);
            vec2 videoTex = cropSample(t, u_captureAreas[0]);
            vec4 videoColor = texture2D(u_video, videoTex);
            vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
            outputColor = color;
        } else if (tex.x >= 0.5 && tex.x < 0.75) {
            vec2 t = vec2((tex.x - 0.5) * 4.0, tex.y);
            vec2 texel = vec2(1.0 / (u_width / 4.0), 1.0 / u_height);
            float m2 = blurMask(u_mask2, t, texel);
            float m3 = blurMask(u_mask3, t, texel);
            vec3 blendB = mix(vec3(0.0), u_maskColors[2], m2); // blue mask
            blendB = mix(blendB, u_maskColors[3], m3); // yellow mask
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
const u_width = gl.getUniformLocation(program, 'u_width');
const u_height = gl.getUniformLocation(program, 'u_height');
const u_maskColors = gl.getUniformLocation(program, 'u_maskColors');

// Set default values
gl.uniform1f(u_brightness, 0.0);
gl.uniform1f(u_contrast, 1.5);
gl.uniform1i(u_overlayMask, 0);
gl.uniform3fv(u_maskColors, new Float32Array([
    1.0, 1.0, 0.0, // Red
    0.0, 1.0, 0.0, // Green
    0.0, 0.0, 1.0, // Blue
    1.0, 1.0, 0.0  // Yellow
]));

// Helper to set capture areas (expects array of 2 crops: [x, y, w, h] normalized to video texture)
function setCaptureAreas(captureAreas) {
    // captureAreas: [[x0, y0, w0, h0], [x1, y1, w1, h1]] in normalized (0..1) coordinates
    const flat = new Float32Array(8);
    for (let i = 0; i < 2; ++i) flat.set(captureAreas[i], i * 4);
    gl.uniform4fv(u_captureAreas, flat);
}

// Helper to set brightness/contrast
function setBrightnessContrast(brightness, contrast) {
    gl.useProgram(program);
    gl.uniform1f(u_brightness, brightness);
    gl.uniform1f(u_contrast, contrast);
}

// Helper to set overlay mask mode
function setOverlayMask(enabled) {
    gl.useProgram(program);
    gl.uniform1i(u_overlayMask, enabled ? 1 : 0);
}

// Helper to set mask colors dynamically
function setMaskColors(maskColors) {
    // maskColors: [[r,g,b], [r,g,b], [r,g,b], [r,g,b]]
    gl.useProgram(program);
    gl.uniform3fv(u_maskColors, new Float32Array(maskColors.flat()));
}

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

function blendCanvasesToOutCanvas(destCanvas, index) {
    // updateGLSize();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

const videoTexture = textures[4];

updateGLSize();

export {
    setCaptureAreas,
    setBrightnessContrast,
    setOverlayMask,
    uploadMaskToTexture,
    clearMaskTexture,
    blendCanvasesToOutCanvas,
    videoTexture,
    setMaskColors
};