import { Application, Assets, Container, Sprite } from 'pixi.js';

const parent0 = document.getElementById("fore-2d-0");
const app0 = new Application();
await app0.init({ backgroundAlpha : 0  });
app0.renderer.resize(1920, 2160);
app0.renderer.backgroundColor = 0x00000000;
app0.canvas.style.width  = "100%";
app0.canvas.style.height = "100%";
const container0 = new Container();
app0.stage.addChild(container0);

const parent1 = document.getElementById("fore-2d-1");
const app1 = new Application();
await app1.init({ backgroundAlpha : 0 });
app1.renderer.resize(1920, 2160);
app1.canvas.style.width  = "100%";
app1.canvas.style.height = "100%";
const container1 = new Container();
app1.stage.addChild(container1);



parent0.appendChild(app0.canvas);
parent1.appendChild(app1.canvas);

const logo = await Assets.load("./images/chips_logo.png");

const logoSprite = new Sprite(logo);
logoSprite.anchor.set(0.5, 0.5);
logoSprite.height = 200;
logoSprite.width = 200;
logoSprite.x = 1080 / 2;
logoSprite.y = 1920 / 2;

container0.addChild(logoSprite);
logoSprite.rotation = 45;
