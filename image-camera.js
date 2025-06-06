import eventController from "./EventController";

const messageElements0 = document.querySelectorAll('.fsmall-0');
const messageElements1 = document.querySelectorAll('.fsmall-1');

const countdown0 = document.querySelector('#fcount-0');
const countdown1 = document.querySelector('#fcount-1');

const photoElements = document.querySelectorAll(".photo-overlay-outer");
const foreCanvases = document.querySelectorAll(".fore-canvas");

const photoEffectCanvases = document.querySelectorAll(".photo-overlay-inner");
const photoEffectOuter = document.querySelectorAll(".photo-overlay-outer");

const modeEnabled = document.getElementById("photo-mode");
let canTakePhotos = false;

modeEnabled.addEventListener('change', () => {
    
    canTakePhotos = true;
});


let countTimeout0, countTimeout1;

const killCount0 = () => {
    messageElements0[0].innerHTML = messageElements0[1].innerHTML = "Buscando a una persona...";
    countdown0.innerHTML = "";
    clearTimeout(countTimeout0);
}

const killCount1 = () => {
    messageElements1[0].innerHTML = messageElements1[1].innerHTML = "Buscando a una persona...";
    countdown1.innerHTML = "";
    clearTimeout(countTimeout1);
}

const flashElements = document.querySelectorAll('.flash-white');

const backingCanvases = [
    document.getElementById('backing-canvas-0'),
    document.getElementById('backing-canvas-1')
];

const finalCanvas = document.getElementById('final-canvas');
const photoCanvas = document.getElementById('photo-canvas');

const photoCtx = photoCanvas.getContext('2d', { antialias: true });

const flashTimeouts = [NaN, NaN];

const retakeTimeouts = [NaN, NaN];

const takePhoto = index => {

    clearTimeout(flashTimeouts[index]);
    // Flash logic
    const flash = flashElements[index];
    flash.style.display = "none";
    flash.style.transition = "1s";
    flashTimeouts[index] = setTimeout(() => {
        flash.style.display = "flex";
        flash.style.opacity = "1";
        flashTimeouts[index] = setTimeout(() => {
            flash.style.opacity = "0";
        });

        photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
        photoCtx.fillStyle = "black";
        photoCtx.fillRect(0, 0, photoCanvas.width, photoCanvas.height);
        photoCtx.drawImage(backingCanvases[index], 0, 0, photoCanvas.width, photoCanvas.height);

        const peo = photoEffectOuter[index];


        peo.style.transition = "0s";
        peo.style.opacity = 0;
        peo.style.animationName = "none";
        peo.style.rotate = "0deg";
        peo.style.scale = "1";
        peo.style.left = "0";
        peo.style.top = "0";
        peo.style.width = "100%";

        setTimeout(() => {
            peo.style.display = "flex";
            peo.style.transitionDuration = "0.5s";
        }, 20);
        setTimeout(() => {
            peo.style.opacity = 1;
            peo.style.rotate = "370deg";
            peo.style.width = "20%";
            peo.style.top = "10%";
            peo.style.left = "10%";
            peo.style.scale = "1";
            peo.style.opacity = "1";
        }, 200);

        setTimeout(() => {
            peo.style.opacity = 1;
            peo.style.scale = "1.2";
            peo.style.opacity = "0";
        }, 2000);


        requestAnimationFrame(() => {
            const isLeft = index === 0;

            const sx = isLeft ? 0 : finalCanvas.width / 2;  // source x
            const sy = 0;
            const sWidth = finalCanvas.width / 2;
            const sHeight = finalCanvas.height;

            const dx = 0;
            const dy = 0;
            const dWidth = photoCanvas.width;
            const dHeight = photoCanvas.height;

            photoCtx.drawImage(
                finalCanvas,
                sx, sy, sWidth, sHeight,  // source rectangle
                dx, dy, dWidth, dHeight   // destination rectangle
            );

            photoCtx.drawImage(foreCanvases[index], 0, 0);

            const peCanvas = photoEffectCanvases[index];
            const ctx = peCanvas.getContext("2d");

            peCanvas.width = photoCanvas.width;
            peCanvas.height = photoCanvas.height;
            ctx.drawImage(photoCanvas, 0, 0, peCanvas.width, peCanvas.height);

            clearTimeout(retakeTimeouts[index]);
            // retakeTimeouts[index] = setTimeout(() => {
            //     if(posesDetected[+(!index)]){
            //         showPrepare(+(!index));
            //         takePhoto(+(!index));
            //     }

            // }, 2000);

        });

    }, 2000);



}

const posesDetected = [false, false];

eventController.addEventListener("pose-lost", ({ segIndex }) => {

    console.log("POSE LOST", segIndex);

    if (posesDetected[segIndex]) {
        posesDetected[segIndex] = false;
        if (canTakePhotos) {
            showCTA(+(!segIndex));
            hidePrepare(+(!segIndex));
            clearTimeout(retakeTimeouts[segIndex]);
        }
    }


});
eventController.addEventListener("pose-found", ({ segIndex }) => {
    console.log("POSE FOUND", segIndex);

    if (!posesDetected[segIndex]) {
        posesDetected[segIndex] = true;
        if (canTakePhotos) {
            hideCTA(+(!segIndex));
            showPrepare(+(!segIndex));
            takePhoto(+(!segIndex));
            clearTimeout(retakeTimeouts[+(!segIndex)]);
        }
    }


});


const ctas = document.querySelectorAll(".cta-inner");
let ctasVisible = [false, false];

ctas[0].style.opacity = 0.0;
ctas[0].style.transform = "scale(3) rotate(180deg)";

ctas[1].style.opacity = 0.0;
ctas[1].style.transform = "scale(3) rotate(180deg)";

let ctaImageIndices = [0, 1];

let ctaImageCount = 2;

let ctaTimeouts = [NaN, NaN];

const ctaLoop = index => {

    if (!ctasVisible[index])
        return;

    const cta = ctas[index];
    cta.style.transform = "scale(1) rotate(0deg)";
    cta.style.opacity = 1;

    clearTimeout(ctaTimeouts[index]);

    ctaTimeouts[index] = setTimeout(() => {
        cta.style.transform = "scale(3) rotate(180deg)";
        cta.style.opacity = 0;
        ctaTimeouts[index] = setTimeout(() => {

            if (!ctasVisible[index])
                return;

            let i = ctaImageIndices[index];
            i = (i + 1) % ctaImageCount;
            ctaImageIndices[index] = i;
            cta.style.backgroundImage = `url("./images/cta${i}.png")`;
            ctaLoop(index);
        }, 2000);
    }, 2000);
}

const showCTA = index => {

    if (ctasVisible[index])
        return;
    ctasVisible[index] = true;

    ctaLoop(index);

}

const hideCTA = index => {

    ctasVisible[index] = false;
    const cta = ctas[index];
    cta.style.transform = "scale(3) rotate(180deg)";
    cta.style.opacity = 0;
}

showCTA(0);
showCTA(1);

const prepNotices = document.querySelectorAll(".prep-inner");

let prepTimeouts = [NaN, NaN];

const showPrepare = index => {
    const notice = prepNotices[index];
    notice.style.opacity = 1;
    notice.style.transform = "scale(1)";

    clearTimeout(prepTimeouts[index]);
    prepTimeouts[index] = setTimeout(() => {
        notice.style.opacity = 0.0;
        notice.style.transform = "scale(3)";
    }, 3000);
}

const hidePrepare = index => {
    clearTimeout(prepTimeouts[index]);
    const notice = prepNotices[index];
    notice.style.opacity = 0.0;
    notice.style.transform = "scale(3)";
}