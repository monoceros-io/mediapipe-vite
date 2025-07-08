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
precision mediump float;                        // Set default precision for floats
varying vec2 v_texCoord;                        // Interpolated texture coordinates from vertex shader

// Texture samplers for 4 masks and the main video texture
uniform sampler2D u_mask0;
uniform sampler2D u_mask1;
uniform sampler2D u_mask2;
uniform sampler2D u_mask3;
uniform sampler2D u_video;

// Capture areas: 2 vec4 defining crop areas [x, y, width, height] for each half
uniform vec4 u_captureAreas[2];

// Controls for image adjustments and mask overlay
uniform float u_brightness;                     // Brightness adjustment
uniform float u_contrast;                       // Contrast adjustment
uniform bool u_overlayMask;                      // (Unused in shader code but declared)
uniform float u_width;                          // Canvas width in pixels
uniform float u_height;                         // Canvas height in pixels

// Colors used for mask overlays (4 vec3 colors)
uniform vec3 u_maskColors[4];


// Helper function: maps normalized coords 't' into the cropped area 'area'
vec2 cropSample(vec2 t, vec4 area) {
    return vec2(
        area.x + t.x * area.z,                  // Map x coordinate inside crop rectangle
        area.y + t.y * area.w                   // Map y coordinate inside crop rectangle
    );
}

// Helper function: performs aspect-fit calculation for half of the canvas
// Returns if the input tex coordinate is inside the drawn crop area,
// outputs cropped UV coordinates in cropUV
bool aspectFitHalf(vec2 tex, float halfX0, float halfX1, vec4 area, out vec2 cropUV) {
    float halfW = u_width / 2.0;                // Half of canvas width in pixels
    float halfH = u_height * 2.0;               // Twice the canvas height in pixels (for aspect calc)
    float cropW = area.z * u_width;             // Crop width in pixels
    float cropH = area.w * u_height;            // Crop height in pixels

    float cropAspect = cropW / cropH;           // Aspect ratio of crop area
    float halfAspect = halfW / halfH;           // Aspect ratio of half canvas

    float scale, padX, padY, drawW, drawH;

    // Compare aspect ratios to fit crop inside half canvas
    if (cropAspect > halfAspect) {
        scale = halfW / cropW;                   // Scale to fit width
        drawW = halfW;                           // Drawn width fills half canvas width
        drawH = cropH * scale;                   // Scaled height
        padX = 0.0;                             // No horizontal padding
        padY = (halfH - drawH) / 2.0;           // Vertical padding to center crop vertically
    } else {
        scale = halfH / cropH;                   // Scale to fit height
        drawH = halfH;                           // Drawn height fills double canvas height (odd but consistent)
        drawW = cropW * scale;                   // Scaled width
        padY = 0.0;                             // No vertical padding
        padX = (halfW - drawW) / 2.0;           // Horizontal padding to center crop horizontally
    }

    // Compute local position inside half canvas from input normalized tex coordinate
    float localX = (tex.x - halfX0) / (halfX1 - halfX0);
    float px = localX * halfW;                   // X in pixels inside half canvas
    float py = tex.y * halfH;                     // Y in pixels inside double height

    // If outside the padded crop rectangle, return false and zero UV
    if (px < padX || px > (padX + drawW) || py < padY || py > (padY + drawH)) {
        cropUV = vec2(0.0);
        return false;
    }

    // Otherwise, compute normalized UV coordinates inside crop rect
    float u = (px - padX) / drawW;
    float v = (py - padY) / drawH;
    cropUV = vec2(u, v);
    return true;
}

// Applies a Gaussian-like blur on the mask texture around 'uv' with given 'radius'
// Uses a weighted sum of mask values in a 9x9 kernel (x, y from -4 to 4)
float blurMask(sampler2D mask, vec2 uv, vec2 texel, float radius) {
    float total = 0.0;
    float weight = 0.0;
    for (float x = -4.0; x <= 4.0; x++) {
        for (float y = -4.0; y <= 4.0; y++) {
            float dist = length(vec2(x, y));
            if (dist > radius) continue;                 // Skip samples outside radius
            float influence = exp(-dist * dist / (2.0 * radius)); // Gaussian weight
            total += texture2D(mask, uv + vec2(x, y) * texel).r * influence; // Sample mask red channel
            weight += influence;
        }
    }
    return weight > 0.0 ? total / weight : 0.0;         // Return weighted average or 0
}


void main() {
    // Invert texture coordinates because source textures are flipped
    vec2 tex = vec2(1.0 - v_texCoord.x, 1.0 - v_texCoord.y);

    vec3 outputColor = vec3(0.0);                      // Initialize output color
    float a = 1.0;                                     // Initialize alpha

    float u_blurStrength = 12.0;                       // Blur radius for masks

    // Sample base video color (full frame) with contrast and brightness adjustments
    vec4 videoColorFull = texture2D(u_video, tex);
    vec3 baseColor = (videoColorFull.rgb - 0.5) * u_contrast + 0.5 + u_brightness;

    bool inCrop = false;                               // Flag if fragment is inside crop area
    vec2 cropUV;                                       // UV inside crop area

    // Process left half of the canvas (tex.x < 0.5)
    if (tex.x < 0.5) {
        inCrop = aspectFitHalf(tex, 0.0, 0.5, u_captureAreas[0], cropUV);
        if (!inCrop) {
            gl_FragColor = vec4(0.0);
            return;
        }
        // Sample video and masks inside crop area
        vec2 videoTex = cropSample(cropUV, u_captureAreas[0]);
        vec4 videoColor = texture2D(u_video, videoTex);
        vec2 texel = vec2(1.0 / (u_width / 2.0), 1.0 / u_height);

        // Blur and sample two masks for this half
        float m0 = 0.0;
        float m1 = blurMask(u_mask1, cropUV, texel, u_blurStrength);

        // Smoothstep fade for mask alpha falloff
        float fade0 = smoothstep(0.01, 0.4, m0);
        float fade1 = smoothstep(0.01, 0.4, m1);

        // Invert fade for maskFade0 with power curve to adjust blending
        float maskFade0 = pow(1.0 - fade0, 2.0);
        float maskFade1 = fade1;

        // Adjust video color with brightness and contrast
        vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;

        // Blend colors using mask fades and maskColors: mask1 overlays with color tint
        outputColor = mix(color, color * u_maskColors[1], maskFade1);
        outputColor = mix(baseColor, outputColor, maskFade0);

        // Adjust alpha with mask fade
        a *= maskFade0;

    } else {
        // Process right half of canvas (tex.x >= 0.5)
        inCrop = aspectFitHalf(tex, 0.5, 1.0, u_captureAreas[1], cropUV);
        if (!inCrop) {
            gl_FragColor = vec4(0.0);
            return;
        }

        // Sample video and masks inside right crop area
        vec2 videoTex = cropSample(cropUV, u_captureAreas[1]);
        vec4 videoColor = texture2D(u_video, videoTex);
        vec2 texel = vec2(1.0 / (u_width / 2.0), 1.0 / u_height);

        // Blur and sample masks 2 and 3
        float m2 = 0.0;
        float m3 = blurMask(u_mask3, cropUV, texel, u_blurStrength);

        // Smoothstep fade masks
        float fade2 = smoothstep(0.01, 0.4, m2);
        float fade3 = smoothstep(0.01, 0.4, m3);

        // Compute mask fades (same logic as left side)
        float maskFade2 = pow(1.0 - fade2, 2.0);
        float maskFade3 = fade3;

        // Adjust color with brightness/contrast
        vec3 color = (videoColor.rgb - 0.5) * u_contrast + 0.5 + u_brightness;

        // Blend with mask3 tinted color and base color using mask fades
        outputColor = mix(color, color * u_maskColors[3], maskFade3);
        outputColor = mix(baseColor, outputColor, maskFade2);

        // Modify alpha by mask fade
        a *= maskFade2;
    }

    // Output final fragment color with computed alpha
    gl_FragColor = vec4(outputColor, a);
}`;



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
