const canvases = document.querySelectorAll('.base-canvas');

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
    uniform sampler2D u_video;
    uniform sampler2D u_mask0;
    uniform sampler2D u_mask1;
    void main() {
        vec2 v_tex = v_texCoord;
        v_tex.y = 1.0 - v_tex.y;

        // Adjust texture coordinates to cover only half the canvas, starting a quarter in
        v_tex.x = v_tex.x * 2.0 - 0.5;
        v_tex.y = v_tex.y * 2.0;

        // Clamp: if out of bounds, output transparent
        if (v_tex.x < 0.0 || v_tex.x > 1.0 || v_tex.y < 0.0 || v_tex.y > 1.0) {
            discard;
        }

        vec4 videoColor = texture2D(u_video, v_tex);
        float mask0 = texture2D(u_mask0, v_tex).r;
        float mask1 = texture2D(u_mask1, v_tex).r;

        // Example: show video where mask0+mask1==0, otherwise blend with mask color
        vec3 maskColor0 = vec3(1.0, 0.0, 0.0); // red
        vec3 maskColor1 = vec3(1.0, 1.0, 0.0); // yellow

        vec3 blended = videoColor.rgb;
        blended = mix(blended, maskColor0, mask0);
        blended = mix(blended, maskColor1, mask1);

        gl_FragColor = vec4(blended, 1.0);
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
    const vertShader = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

const finalCanvas = document.getElementById('final-canvas');
const width = finalCanvas.width;
const height = finalCanvas.height;

const gl = finalCanvas.getContext('webgl');
if (!gl) {
    console.error('WebGL not supported');
}

const program = createProgram(gl, vertSrc, fragSrc);
gl.useProgram(program);
console.log("WAGGO", program);

// Setup buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
        -1, -1, 0, 0,
        1, -1, 1, 0,
        -1, 1, 0, 1,
        1, 1, 1, 1,
    ]),
    gl.STATIC_DRAW
);

// Lookup shader attributes/uniforms
const a_position = gl.getAttribLocation(program, 'a_position');
const a_texCoord = gl.getAttribLocation(program, 'a_texCoord');
const u_video = gl.getUniformLocation(program, 'u_video');
const u_mask0 = gl.getUniformLocation(program, 'u_mask0');
const u_mask1 = gl.getUniformLocation(program, 'u_mask1');
const u_color0 = gl.getUniformLocation(program, 'u_color0');
const u_color1 = gl.getUniformLocation(program, 'u_color1');

gl.enableVertexAttribArray(a_position);
gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(a_texCoord);
gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, 16, 8);

gl.uniform1i(u_video, 2); // video texture at unit 2
gl.uniform1i(u_mask0, 0);
gl.uniform1i(u_mask1, 1);

// Set color uniforms (replace with your palette as needed)
gl.uniform3f(u_color0, 0.0, 1.0, 0.0); // GREEN
gl.uniform3f(u_color1, 0.0, 0.0, 1.0); // BLUE

// Create and init textures
const texture0 = gl.createTexture();
const texture1 = gl.createTexture();
const videoTexture = gl.createTexture();

function initTexture(tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
    );
}

initTexture(texture0, 0);
initTexture(texture1, 1);
initTexture(videoTexture, 2);

function uploadMaskToTexture(maskArray, unit, width, height) {
    const glTex = unit === 0 ? texture0 : texture1;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, glTex);

    // Convert Float32Array [0,1] to Uint8Array [0,255] for LUMINANCE
    const u8 = new Uint8Array(maskArray.length);
    for (let i = 0; i < maskArray.length; ++i) {
        u8[i] = Math.round(maskArray[i] * 255);
    }

    // Use RED if available (WebGL2), else fallback to LUMINANCE
    if (gl instanceof WebGL2RenderingContext) {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R8,
            width,
            height,
            0,
            gl.RED,
            gl.UNSIGNED_BYTE,
            u8
        );
    } else {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.LUMINANCE,
            width,
            height,
            0,
            gl.LUMINANCE,
            gl.UNSIGNED_BYTE,
            u8
        );
    }
}

function clearMaskTexture(unit, width, height) {
    const glTex = unit === 0 ? texture0 : texture1;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    const zero = new Uint8Array(width * height);
    if (gl instanceof WebGL2RenderingContext) {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R8,
            width,
            height,
            0,
            gl.RED,
            gl.UNSIGNED_BYTE,
            zero
        );
    } else {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.LUMINANCE,
            width,
            height,
            0,
            gl.LUMINANCE,
            gl.UNSIGNED_BYTE,
            zero
        );
    }
}

function updateTextureFromCanvas(tex, canvas, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        canvas
    );
}

function uploadVideoToTexture(video, sx, sy, sw, sh, dx, dy, dw, dh) {
    gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    // Draw the video crop to a temporary canvas if cropping is needed
    // For simplicity, assume video is already the right size and just use:
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    // If cropping/scaling is needed, use an offscreen canvas:
    if (
        sx !== 0 || sy !== 0 ||
        sw !== video.videoWidth || sh !== video.videoHeight ||
        dw !== width || dh !== height
    ) {
        // Use an offscreen canvas to crop/scale
        let temp = uploadVideoToTexture._tempCanvas;
        if (!temp) {
            temp = document.createElement('canvas');
            uploadVideoToTexture._tempCanvas = temp;
        }
        temp.width = width;
        temp.height = height;
        const ctx = temp.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, temp);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }
}

function blendCanvasesToOutCanvas(destCanvas) {
    // Always use finalCanvas as the WebGL target
    let glCtx = gl;
    let w = width, h = height;
    if (destCanvas && destCanvas !== finalCanvas) {
        glCtx = destCanvas.getContext('webgl') || destCanvas.getContext('experimental-webgl');
        w = destCanvas.width;
        h = destCanvas.height;
    }
    glCtx.viewport(0, 0, w, h);
    glCtx.clear(glCtx.COLOR_BUFFER_BIT);
    glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4);
}

window.blendCanvasesToOutCanvas = blendCanvasesToOutCanvas;
window.uploadMaskToTexture = uploadMaskToTexture;
window.clearMaskTexture = clearMaskTexture;
window.uploadVideoToTexture = uploadVideoToTexture;

export { blendCanvasesToOutCanvas };
