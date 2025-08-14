import { io } from "socket.io-client";

let serverURL = "http://localhost:3000";

const serverUrlInput = document.getElementById('server-url');

const serverConnect = document.getElementById('server-connect');

const connStat = document.getElementById('conn-stat');

let connected = false;
let socket;

let interv;

const connectSuccess = () => {
    connected = true;
    connStat.className = "conn-stat-con";
    connStat.innerHTML = "Connected";
}

const connectFailure = () => {
    connected = false;
    connStat.className = "conn-stat-dis";
    connStat.innerHTML = "Disconnected";
};

function handleServerConnect() {
    if (connected) return;

    console.log("Attempting connection…");

    // Create Socket.IO connection
    socket = io(serverURL);

    // Log the socket object for debugging
    console.log("SOCKO", socket);

    // Connection successful
    socket.on("connect", () => {

        connectSuccess();

        clearInterval(interv);
        interv = setInterval(() => {
            if (socket && socket.connected) {
                console.log("Socket is connected");
            } else {
                console.log("Socket is not connected");
            }
        }, 10000);
    });

    // Server replies
    socket.on("reply", (msg) => {
        console.log("📩 Server replied:", msg);
    });

    // Connection lost
    socket.on("disconnect", () => {
        connectFailure();
    });

    // Connection errors
    socket.on("connect_error", (err) => {
        connectFailure();
    });
}

serverConnect.addEventListener('click', handleServerConnect);

let peopleDetected = [false, false];

function updateServerForPerson(personIndex, status){
    if (socket && connected) {
        console.log("GOT SOME")
        if(peopleDetected[personIndex] !== status) {
            peopleDetected[personIndex] = status;
            console.log("GOT THE OTHER");
            socket.emit("message", { type: "update_person", personIndex, status });
            
        }
    } else {

    }
}

const backCanvases = document.querySelectorAll('.bk-cvs');
const finalCanvas = document.querySelector('#final-canvas');
const foreCanvases = document.querySelectorAll('.fore-canvas');


function compileImage(index) {
    // Draw three canvases (back, final, fore) into a new fixed-size canvas (same size as finalCanvas)
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = finalCanvas.width;
    outputCanvas.height = finalCanvas.height;
    const ctx = outputCanvas.getContext('2d');

    if (backCanvases[index]) ctx.drawImage(backCanvases[index], 0, 0);
    ctx.drawImage(finalCanvas, 0, 0);
    if (foreCanvases[index]) ctx.drawImage(foreCanvases[index], 0, 0);

    return outputCanvas.toDataURL();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') {
        const dataUrl = compileImage(1);
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.position = 'fixed';
        img.style.top = '0';
        img.style.left = '0';
        img.style.width = '100vw';
        img.style.height = '100vh';
        img.style.zIndex = '999';
        img.style.objectFit = 'cover';
        document.body.appendChild(img);
    }
});

export { updateServerForPerson };