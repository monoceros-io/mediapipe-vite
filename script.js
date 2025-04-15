
        import { setupVideoUtils, matchCropToVideo } from "./camera-utils";
        

        // PAGE ELEMENTS

        const videos = document.querySelectorAll(".video");
        const cameraSelectors = document.querySelectorAll('.camera-select');
        const cropDivOuters = document.querySelectorAll(".video-crop-div-outer");
        const dumpCanvases = document.querySelectorAll(".crop-canvas");


        const cdoMasks = [ 
            5, 5, 20, 20, 
            55, 5, 20, 40,
            10, 10, 10, 10, 
            30, 10, 20, 40
        ];

        setupVideoUtils(videos, cropDivOuters, cdoMasks, dumpCanvases);

        let cameraSourceActive = [false, false];
        let frameCounter = 0;

        const devices = await navigator.mediaDevices.enumerateDevices();

        devices.filter(device => device.kind === 'videoinput').forEach((device, index) => {

            for (let sel of cameraSelectors) {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${index + 1}`;
                sel.appendChild(option);
                sel.selectedIndex = 2;
            }
        });

        cameraSelectors.forEach((sel, index) => {
            sel.addEventListener('change', async (event) => {
                cameraSourceActive[index] = false;
                const video = document.getElementById(`vid-${index}`);
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        frameRate: { min: 30, ideal: 60 },
                        deviceId: { exact: event.target.value },
                        width: { ideal: 1920 }, // Try for 4K width
                        height: { ideal: 1080 }, // Try for 4K height
                    }
                });

                const streamStart = () => {
                    video.removeEventListener('loadeddata', streamStart);
                    cameraSourceActive[index] = true;
                    matchCropToVideo();
                }

                video.addEventListener('loadeddata', streamStart);
                video.srcObject = stream;
                video.play();

            });
        });



