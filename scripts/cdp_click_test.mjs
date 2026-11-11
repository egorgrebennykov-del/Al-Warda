// Headless Edge/Chrome click test for the assistant trigger button (CDP over Node's built-in WebSocket)
import { spawn } from "node:child_process";
import fs from "node:fs";

const URL_ = process.argv[2] || "http://localhost:4173/";
const candidates = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const exe = candidates.find((p) => fs.existsSync(p));
if (!exe) { console.log("NO BROWSER"); process.exit(1); }
const port = 9333;
const proc = spawn(exe, [`--remote-debugging-port=${port}`, "--headless=new", "--no-first-run", `--user-data-dir=${process.env.TEMP}/cdp-prof`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(500);
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") logs.push("EXC: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === "Runtime.consoleAPICalled" && ["error"].includes(d.params.type)) logs.push("CONSOLE.ERROR: " + d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate", { url: URL_ });
await sleep(8000);
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
console.log("trigger exists:", await ev(`!!document.querySelector('.warda-trigger-btn')`));
console.log("trigger rect:", JSON.stringify(await ev(`(()=>{const b=document.querySelector('.warda-trigger-btn'); if(!b) return null; const r=b.getBoundingClientRect(); const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {x:r.x,y:r.y,w:r.width,h:r.height, topEl: el && (el.className||el.tagName)}})()`)));
await ev(`document.querySelector('.warda-trigger-btn')?.click()`);
await sleep(1500);
console.log("panel open:", await ev(`!!document.querySelector('.warda-assistant-root--open')`));
console.log("body text sample:", (await ev(`document.body.innerText.slice(0,200)`)) );
console.log(logs.join("\n") || "no errors");
ws.close(); proc.kill();
