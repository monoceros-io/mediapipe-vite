import { ImageSegmenter } from '@mediapipe/tasks-vision';

console.log("Loading MediaPipe Image Segmenter...");
let imageSegmenter;
let currentModelUrl = './selfie_multiclass_256x256.tflite'; // Local model file

export async function setupCamera(video) {
    if (!video) {
        throw new Error("Video element is undefined. Ensure it is passed correctly.");
    }
    try {
        console.log("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await new Promise(resolve => video.onloadedmetadata = resolve);
        console.log("Camera access granted.");
    } catch (error) {
        console.error("Error accessing camera:", error);
    }
}

export async function initializeSegmentation(canvas) {
    if (!canvas) {
        throw new Error("Canvas element is undefined. Ensure it is passed correctly.");
    }
    console.log("Canvas passed to initializeSegmentation:", canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error("Failed to get canvas context. Ensure the canvas element is valid.");
    }

    console.log("Initializing MediaPipe Image Segmenter...");
    try {
        imageSegmenter = await ImageSegmenter.createFromOptions({
            baseOptions: {
                modelAssetPath: currentModelUrl,
                delegate: 'GPU'
            },
            runningMode: 'VIDEO'
        });
    } catch (error) {
        console.error("Error initializing ImageSegmenter:", error);
        throw error;
    }

    return ctx;
}

export async function startSegmentation(video, canvas) {
    if (!video || !canvas) {
        throw new Error("Video or canvas element is undefined. Ensure both are passed correctly.");
    }
    console.log("Video passed to startSegmentation:", video);
    console.log("Canvas passed to startSegmentation:", canvas);

    try {
        console.log("Starting segmentation...");
        await setupCamera(video);
        video.play();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = await initializeSegmentation(canvas);

        function processFrame() {
            imageSegmenter.segmentForVideo(video, performance.now())
                .then(results => {
                    ctx.save();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height); // Draw the original video frame

                    if (results.categoryMask) {
                        // Draw the segmentation mask
                        const mask = results.categoryMask;
                        ctx.globalCompositeOperation = 'destination-in';
                        ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);

                        // Apply a semi-transparent green overlay
                        ctx.globalCompositeOperation = 'destination-over';
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }

                    ctx.restore();
                    requestAnimationFrame(processFrame);
                })
                .catch(err => console.error("Error processing frame:", err));
        }
        processFrame();
    } catch (error) {
        console.error("Error starting segmentation:", error);
    }
}

export async function changeModel(newModelUrl, canvas) {
    if (!canvas) {
        throw new Error("Canvas element is undefined. Ensure it is passed correctly.");
    }
    console.log("Canvas passed to changeModel:", canvas);

    try {
        console.log(`Changing model to: ${newModelUrl}`);
        currentModelUrl = newModelUrl;
        if (imageSegmenter) {
            await imageSegmenter.close(); // Clean up the existing instance
        }
        await initializeSegmentation(canvas); // Reinitialize with the new model
    } catch (error) {
        console.error("Error changing model:", error);
    }
}
