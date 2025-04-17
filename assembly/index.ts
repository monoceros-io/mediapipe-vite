// AssemblyScript version
export function processMask(mask: Float32Array, colors: Float32Array, maskIndex: i32, outputBuffer: Float32Array, pixelCount: i32): void {
  // Calculate color index and get corresponding r, g, b values
  const baseIndex = (maskIndex % 6) * 3;
  const r = colors[baseIndex];
  const g = colors[baseIndex + 1];
  const b = colors[baseIndex + 2];

  for (let i = 0; i < pixelCount; i++) {
    const alpha = mask[i];
    const base = i * 3;
    outputBuffer[base] += alpha * r;
    outputBuffer[base + 1] += alpha * g;
    outputBuffer[base + 2] += alpha * b;
  }
}
