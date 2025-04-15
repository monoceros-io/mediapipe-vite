export function processMasks(
  maskIndices: Int32Array,
  masks: Float32Array[],
  colors: Uint8Array[],
  data: Uint8Array
): void {
  for (let m = 0; m < maskIndices.length; m++) {
    let maskIndex = maskIndices[m];
    let maskArray = masks[maskIndex];
    let r: u8 = colors[maskIndex][0];
    let g: u8 = colors[maskIndex][1];
    let b: u8 = colors[maskIndex][2];

    for (let i = 0; i < maskArray.length; i++) {
      let alpha: f32 = maskArray[i] * 255.0;
      let offset: i32 = i * 4;

      data[offset] = max(data[offset], u8(r * (alpha / 255.0)));
      data[offset + 1] = max(data[offset + 1], u8(g * (alpha / 255.0)));
      data[offset + 2] = max(data[offset + 2], u8(b * (alpha / 255.0)));
      data[offset + 3] = 255;
    }
  }
}
// assembly/index.ts
export function drawMasks(
  width: i32, 
  height: i32, 
  personCount: i32, 
  masksPtr: usize,
  outputPtr: usize
): void {
  for (let y: i32 = 0; y < height; y++) {
    for (let x: i32 = 0; x < width; x++) {
      let offset = y * width + x;
      let r: u8 = 0;
      let g: u8 = 0;
      let b: u8 = 0;
      let a: u8 = 0;

      for (let i = 0; i < personCount; i++) {
        let value = load<f32>(masksPtr + (i * width * height << 2) + (offset << 2));
        if (value > 0.1) {
          let hue = i * 40;
          let sat = 0.6;
          let val = 0.7;
          let c = val * sat;
          let xcol = c * (1.0 - Math.abs((hue / 60.0) % 2.0 - 1.0));
          let m = val - c;

          // Simplified hue to RGB
          if (hue < 60) { r = <u8>((c + m) * 255); g = <u8>((xcol + m) * 255); b = <u8>((0 + m) * 255); }
          else if (hue < 120) { r = <u8>((xcol + m) * 255); g = <u8>((c + m) * 255); b = <u8>((0 + m) * 255); }
          else { r = 150; g = 150; b = 150; }

          a = 255;
          break;
        }
      }

      let idx = offset << 2;
      store<u8>(outputPtr + idx, r);
      store<u8>(outputPtr + idx + 1, g);
      store<u8>(outputPtr + idx + 2, b);
      store<u8>(outputPtr + idx + 3, a);
    }
  }
}
