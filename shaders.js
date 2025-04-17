const ProcessFrag = `#version 300 es
    precision highp float;

    uniform sampler2D u_mask;  // The confidence mask texture
    uniform vec3 u_color;      // The color to blend with the mask

    in vec2 v_texCoord;        // Interpolated texture coordinate from the vertex shader

    out vec4 fragColor;        // Final color output

    void main() {
        float alpha = texture(u_mask, v_texCoord).r;  // Sample the mask (grayscale value)
        fragColor = vec4(u_color * alpha, 1.0);  // Blend the mask with the colour (multiply)
    }
`;

const ProcessVert = `#version 300 es
    in vec4 a_position;
    in vec2 a_texCoord;

    out vec2 v_texCoord;

    void main() {
        gl_Position = a_position;
        v_texCoord = a_texCoord;
    }
`;

// Compile shader function
function compileShader(source, type, gl) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error: " + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export { ProcessFrag, ProcessVert, compileShader };