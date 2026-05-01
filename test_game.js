const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("game.js", "utf8");

const dom = new JSDOM(html.replace('<script src="game.js"></script>', `<script>${js}</script>`), { runScripts: "dangerously" });
const window = dom.window;

setTimeout(() => {
  try {
    window.Game.start();
    console.log("Game started.");
    
    // Run loops
    for (let i = 0; i < 5; i++) {
        window.Game._testLoop(window.performance.now() + i*16);
    }
  } catch (e) {
    console.error("ERROR:", e);
  }
}, 500);
