import eventController from "./EventController";

const messageElements0 = document.querySelectorAll('.fsmall-0');
const messageElements1 = document.querySelectorAll('.fsmall-1');

const countdown0 = document.querySelector('#fcount-0');
const countdown1 = document.querySelector('#fcount-1');

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

const takePhoto = index => {
    // Flash logic
    const flash = flashElements[index];
    flash.style.display = "none";
    flash.style.transition = "1s";
    setTimeout(() => {
        flash.style.display = "flex";
        flash.style.opacity = "1";
        setTimeout(() => {
            flash.style.opacity = "0";
        });
    });

    // Composite logic
    // Clear photo canvas
    photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);

    // Fill the canvas with black
    photoCtx.fillStyle = "black";
    photoCtx.fillRect(0, 0, photoCanvas.width, photoCanvas.height);

    // Draw backing canvas for this side
    photoCtx.drawImage(backingCanvases[index], 0, 0, photoCanvas.width, photoCanvas.height);

    // Draw the correct half of the final canvas
    // Left half: index 0, Right half: index 1
    const halfW = finalCanvas.width / 2;
    const sx = index === 0 ? 0 : halfW;

    // Ensure WebGL rendering is finished before drawing
    if (finalCanvas.getContext("webgl")) {
        finalCanvas.getContext("webgl").flush();
    }

    // Use requestAnimationFrame to ensure the canvas is ready
    requestAnimationFrame(() => {
        // photoCtx.drawImage(
        //     finalCanvas,

        //     sx,
        //     0,
        //     halfW,
        //     finalCanvas.height, // source rect

        //     0,
        //     0,
        //     photoCanvas.width,
        //     photoCanvas.height // dest rect

        // );

        // photoCtx.drawImage(foreCanvases[index], 0, 0, photoCanvas.width, photoCanvas.height);
    });
}

const posesDetected = [false, false];

eventController.addEventListener("pose-lost", ({ segIndex }) => {
    
    if (posesDetected[segIndex]) {
        posesDetected[segIndex] = false;
        showCTA(+(!segIndex));
    }


});
eventController.addEventListener("pose-found", ({ segIndex }) => {

    if (!posesDetected[segIndex]) {
        posesDetected[segIndex] = true;
        hideCTA(+(!segIndex));
    }

    // showPrepare(i);
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

    console.log("SHOW CTA", index);

    if (ctasVisible[index])
        return;
    ctasVisible[index] = true;

    ctaLoop(index);

}

const hideCTA = index => {

    console.log("HIDE CTA", index);
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
        notice.style.opacity = 0.1;
        notice.style.transform = "scale(3)";
    }, 3000);
}