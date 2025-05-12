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

const startCount0 = (count) => {
    clearTimeout(countTimeout0);
    messageElements0[0].innerHTML = messageElements0[1].innerHTML = "Preparate...";
    countdown0.innerHTML = "";
    countTimeout0 = setTimeout(() => {
        messageElements0[0].innerHTML = messageElements0[1].innerHTML = "";
        countdown0.innerHTML = "3";
        countTimeout0 = setTimeout(() => {
            countdown0.innerHTML = "2";
            countTimeout0 = setTimeout(() => {
                countdown0.innerHTML = "1";
                countTimeout0 = setTimeout(() => {
                    countdown0.innerHTML = "";
                    takePhoto(0);
                }, 1000);
            }, 1000);
        }, 1000);
    }, 1000);
}

const startCount1 = (count) => {
    clearTimeout(countTimeout1);
    messageElements1[0].innerHTML = messageElements1[1].innerHTML = "Preparate...";
    countdown1.innerHTML = "";
    countTimeout1 = setTimeout(() => {
        messageElements1[0].innerHTML = messageElements1[1].innerHTML = "";
        countdown1.innerHTML = "3";
        countTimeout1 = setTimeout(() => {
            countdown1.innerHTML = "2";
            countTimeout1 = setTimeout(() => {
                countdown1.innerHTML = "1";
                countTimeout1 = setTimeout(() => {
                    countdown1.innerHTML = "";
                    takePhoto(1);
                }, 1000);
            }, 1000);
        }, 1000);
    }, 1000);
}

const flashElements = document.querySelectorAll('.flash-white');
const foreCanvases = document.querySelectorAll('.fore-canvas');
const backingCanvases = [
    document.getElementById('backing-canvas-0'),
    document.getElementById('backing-canvas-1')
];
const finalCanvas = document.getElementById('final-canvas');
const photoCanvas = document.getElementById('photo-canvas');
const photoCtx = photoCanvas.getContext('2d');

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
        photoCtx.drawImage(
            finalCanvas,

            sx,
            0,
            halfW,
            finalCanvas.height, // source rect

            0,
            0,
            photoCanvas.width,
            photoCanvas.height // dest rect

        );

        // Draw fore canvas for this side
        photoCtx.drawImage(foreCanvases[index], 0, 0, photoCanvas.width, photoCanvas.height);
    });
}

eventController.addEventListener("pose-lost", ({ segIndex }) => {
    console.log("Pose lost", segIndex);
    if (segIndex === 1) {
        killCount0();
    } else if (segIndex === 0) {
        killCount1();
    }
});
eventController.addEventListener("pose-found", ({ segIndex }) => {
    console.log("Pose found", segIndex);
    if (segIndex === 1) {
        startCount0();
    } else if (segIndex === 0) {
        startCount1();
    }
});
