self.onmessage = function(e) {
    const { mask, unit, w, h } = e.data;
    // mask is a Float32Array (0..1)
    const u8 = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        u8[i] = Math.round(mask[i] * 255);
    }
    self.postMessage({ maskData: u8, unit, w, h }, [u8.buffer]);
};
