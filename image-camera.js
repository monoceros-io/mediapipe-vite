import eventController from "./EventController";

const messageElements0 = document.querySelectorAll('.fsmall-0');
const messageElements1 = document.querySelectorAll('.fsmall-1');

const countdown0 = document.querySelector('#fcount-0');
const countdown1 = document.querySelector('#fcount-1');

const buttons = document.querySelectorAll('.clc-btn');

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



const takePhoto = index => {
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
    
}

// buttons[0].addEventListener('click', startCount0);
// buttons[1].addEventListener('click', startCount1);

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

const startExperience0 = () => {

}