let _videos, _cropDivOuters, _cdoLinePercs;

export function setupVideoUtils(videos, cropDivOuters, cdoLinePercs){
    _videos = videos;
    _cropDivOuters = cropDivOuters;
    _cdoLinePercs = cdoLinePercs;
    // _cdoLines0 = _cropDivOuters[0].querySelectorAll(".video-crop-line");
    // _cdoLines1 = _cropDivOuters[1].querySelectorAll(".video-crop-line");
}

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

        const cdoLinePerc = _cdoLinePercs[i];
        let cdoLines = _cropDivOuters[1].querySelectorAll(".video-crop-line");
        for(let j = 0; j < 4; ++j){
            const perc = cdoLinePerc[j];
            const line = cdoLines[j];
            const readout = line.querySelector(".video-crop-readout");
            line.style.left = perc + "%";
            readout.innerHTML = Math.round(perc) + "%";
        }
    }
}

function trimFourFromVideo = ()