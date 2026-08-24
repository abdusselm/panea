

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PORT = Number(process.env.PANEA_PORT || 4820);
const HOST = "127.0.0.1";
const ROOT = path.join(__dirname, "..");

process.title = "Panea";
app.setName("Panea");
app.setAboutPanelOptions({
  applicationName: "Panea",
  applicationVersion: require("../package.json").version,
  copyright: "Copyright (c) 2026 Abdusselam Keskin. MIT.",
});

let win = null;

async function startServer() {
  const { start } = await import(pathToFileURL(path.join(ROOT, "server", "start.js")).href);
  return start({ open: false });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 18 },
    title: "Panea",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.session.clearCache().catch(() => {});
  win.loadURL(`http://${HOST}:${PORT}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.PANEA_CAPTURE) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          if (process.env.PANEA_DEMO_TITLE) {

            const t = JSON.stringify(process.env.PANEA_DEMO_TITLE);
            await win.webContents.executeJavaScript(
              `panea.state.panes.get(panea.state.focusedPaneId).term.write("\\x1b]2;" + ${t} + "\\x07")`
            );
            await new Promise((r) => setTimeout(r, 600));
          }
          if (process.env.PANEA_DEMO_TEXT) {
            const txt = JSON.stringify(process.env.PANEA_DEMO_TEXT);
            await win.webContents.executeJavaScript(
              `panea.state.panes.get(panea.state.focusedPaneId).term.write(${txt}.replace(/\\n/g, "\\r\\n"))`
            );
            await new Promise((r) => setTimeout(r, 400));
          }
          if (process.env.PANEA_DEMO_JS) {
            await win.webContents.executeJavaScript(process.env.PANEA_DEMO_JS);
            await new Promise((r) => setTimeout(r, 1100));
          }
          const img = await win.webContents.capturePage();
          require("node:fs").writeFileSync(process.env.PANEA_CAPTURE, img.toPNG());
        } catch (e) { console.error("capture failed", e); }
        app.quit();
      }, Number(process.env.PANEA_CAPTURE_DELAY || 3500));
    });
  }
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    console.error(e.message);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
