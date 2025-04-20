const canvases = document.querySelectorAll('.base-canvas');

const vertSrc = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texCoord = a_texCoord;
      }
    `;

const fragSrc = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_tex0;
      uniform sampler2D u_tex1;
      void main() {
        vec2 v_tex = v_texCoord;
        
        vec4 color0 = texture2D(u_tex0, v_tex);
        vec4 color1 = texture2D(u_tex1, v_tex);
        gl_FragColor = (color0 + color1);
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

function drawRandomPixelsToCanvases() {
    const cols = [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
    ];
    for (let i = 0; i < 2; i++) {
        const canvas = canvases[i];
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        const col = cols[i];
        for (let j = 0; j < data.length; j += 4) {
            data[j] = Math.random() * col[0] | 0;
            data[j + 1] = Math.random() * col[1] | 0;
            data[j + 2] = col[2];
            data[j + 3] = Math.random() * 256 | 0;
        }
        ctx.putImageData(imageData, 0, 0);
    }
}

const inCanvas0 = document.getElementById('in-canvas-0');
const inCanvas1 = document.getElementById('in-canvas-1');
const outCanvas = document.getElementById('out-canvas');
const width = outCanvas.width;
const height = outCanvas.height;

const gl = outCanvas.getContext('webgl');
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
const u_tex0 = gl.getUniformLocation(program, 'u_tex0');
const u_tex1 = gl.getUniformLocation(program, 'u_tex1');

gl.enableVertexAttribArray(a_position);
gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(a_texCoord);
gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, 16, 8);

gl.uniform1i(u_tex0, 0);
gl.uniform1i(u_tex1, 1);

// Create and init textures
const texture0 = gl.createTexture();
const texture1 = gl.createTexture();

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

function updateTextureFromCanvas(tex, canvas, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas
    );
}

function blendCanvasesToOutCanvas() {

    const finalCanvas = document.getElementById('final-canvas');
    const finalCtx = finalCanvas.getContext('2d');
    const inCanvas0Context = inCanvas0.getContext('2d');

    inCanvas0Context.drawImage(finalCanvas, 0, 0);
    


    updateTextureFromCanvas(texture0, inCanvas0, 0);
    updateTextureFromCanvas(texture1, inCanvas1, 1);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

window.drawRandomPixelsToCanvases = drawRandomPixelsToCanvases;
window.blendCanvasesToOutCanvas = blendCanvasesToOutCanvas;

// Loop

// drawRandomPixelsToCanvases();

function loop() {
    // drawRandomPixelsToCanvases();
    blendCanvasesToOutCanvas();
    // requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        // drawRandomPixelsToCanvases();
        blendCanvasesToOutCanvas();
    }
});

loop();