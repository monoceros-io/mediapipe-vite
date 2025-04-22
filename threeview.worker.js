self.onmessage = function(e) {
    // e.data: [ [ [x,y,z], ... ], [ [x,y,z], ... ] ]
    const updated = e.data.map(meshList =>
        meshList.map(([x, y, z]) => [
            x + 0.01 + Math.random() * 0.01,
            y + 0.01 + Math.random() * 0.01,
            z
        ])
    );
    self.postMessage(updated);
};
