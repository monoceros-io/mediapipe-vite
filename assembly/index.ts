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
