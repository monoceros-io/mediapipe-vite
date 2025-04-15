let _videos, _cropDivOuters, _cdoMasks;

export function setupVideoUtils(videos, cropDivOuters, cdoMasks){
    _videos = videos;
    _cropDivOuters = cropDivOuters;
    _cdoMasks = cdoMasks;
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

        const boundElements = cropDivOuter.querySelectorAll(".video-crop-box");
        

        for(let j = 0; j < 2; ++j){
            const element = boundElements[j];
            const bound = _cdoMasks[i][j];
            const style = element.style;
            style.left = bound[0] + "%";
            style.top = bound[1] + "%";
            style.width = bound[2] + "%";
            style.height = bound[3] + "%";
            console.log("BOUND LAND", bound);

        }


        
    }
}


window.addEventListener('resize', matchCropToVideo);

function trimFourFromVideo(){


}