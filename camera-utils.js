let _videos, _cropDivOuters, _cdoMasks, _dumpCanvases, _dumpContexts = [];

export function setupVideoUtils(videos, cropDivOuters, cdoMasks, dumpCanvases){
    _videos = videos;
    _cropDivOuters = cropDivOuters;
    _cdoMasks = cdoMasks;
    _dumpCanvases = dumpCanvases;
    for(let i = 0; i < 4; ++i){
        _dumpContexts[i] = dumpCanvases[i].getContext("2d", { willReadFrequently : true });
    }
}

let processing = false;
let rawCaptureAreas = [];

const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

export function matchCropToVideo() {
    for (let i = 0; i < _videos.length; i++) {
        const video = _videos[i];
        const cropDivOuter = _cropDivOuters[i];

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const elementWidth = video.clientWidth;
        const elementHeight = video.clientHeight;

        const videoAspect = videoWidth / videoHeight;
        const elementAspect = elementWidth / elementHeight;

        let visibleWidth, visibleHeight;

        if (videoAspect > elementAspect) {
            // Letterbox top and bottom
            visibleWidth = elementWidth;
            visibleHeight = elementWidth / videoAspect;
        } else {
            // Letterbox left and right
            visibleHeight = elementHeight;
            visibleWidth = elementHeight * videoAspect;
        }

        cropDivOuter.style.width = visibleWidth + 'px';
        cropDivOuter.style.height = visibleHeight + 'px';
        cropDivOuter.style.position = 'absolute';
        cropDivOuter.style.left = ((elementWidth - visibleWidth) / 2) + 'px';
        cropDivOuter.style.top = ((elementHeight - visibleHeight) / 2) + 'px';

        const boundElements = cropDivOuter.querySelectorAll(".video-crop-box");
        

        for(let j = 0; j < 2; ++j){

            const element = boundElements[j];
            const style = element.style;
            
            const boundStart = i * 8 + j * 4;

            console.log(i, j, boundStart);
            
            style.left = _cdoMasks[boundStart] + "%";
            style.top = _cdoMasks[boundStart + 1] + "%";
            style.width = _cdoMasks[boundStart + 2] + "%";
            style.height = _cdoMasks[boundStart + 3] + "%";

            rawCaptureAreas[boundStart] = videoWidth * (_cdoMasks[boundStart]) / 100;
            rawCaptureAreas[boundStart + 1] = videoHeight * (_cdoMasks[boundStart + 1]) / 100;
            rawCaptureAreas[boundStart + 2] = videoWidth * (_cdoMasks[boundStart + 2]) / 100;
            rawCaptureAreas[boundStart + 3] = videoHeight * (_cdoMasks[boundStart + 3]) / 100;
            
        }        
    }

    if(!processing)
        processStreams();

}


window.addEventListener('resize', matchCropToVideo);


function processStreams(){

    for(let i = 0; i < 4; ++i){
        const video = _videos[Math.floor(i / 2)];
        const dumpCTX = _dumpContexts[i];
        let index = i * 4;
        
        const cx = rawCaptureAreas[index];
        const cy = rawCaptureAreas[index]+ 1;
        const cw = rawCaptureAreas[index]+ 2;
        const ch = rawCaptureAreas[index]+ 3;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            dumpCTX.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);
        }
        
    }

    requestAnimationFrame(processStreams);
}
