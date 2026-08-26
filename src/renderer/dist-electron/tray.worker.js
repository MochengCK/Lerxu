"use strict";
process.env.PORTABLE_EXECUTABLE_DIR;
const APP_THEME = {
  LIGHT: "light"
};
const TRAY_CANVAS_CONFIG = {
  WIDTH: 66,
  HEIGHT: 16,
  ICON_WIDTH: 16,
  ICON_HEIGHT: 16,
  TEXT_WIDTH: 46,
  TEXT_FONT_SIZE: 8
};
const bytesToSize = (bytes) => {
  const b = parseInt(bytes, 10) || 0;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  if (b === 0) {
    return "0 KB";
  }
  const i = parseInt(Math.floor(Math.log(b) / Math.log(1024)), 10);
  return `${(b / 1024 ** i).toFixed(1)} ${sizes[i]}`;
};
const lightTextColor = "#000";
const darkTextColor = "#fff";
const baseWidth = TRAY_CANVAS_CONFIG.WIDTH;
const baseHeight = TRAY_CANVAS_CONFIG.HEIGHT;
const baseIconWidth = TRAY_CANVAS_CONFIG.ICON_WIDTH;
const baseIconHeight = TRAY_CANVAS_CONFIG.ICON_HEIGHT;
const baseTextWidth = TRAY_CANVAS_CONFIG.TEXT_WIDTH;
const baseFontSize = TRAY_CANVAS_CONFIG.TEXT_FONT_SIZE;
const fontFamily = "Arial";
const draw = async ({
  canvas: canvas2,
  theme,
  icon,
  uploadSpeed,
  downloadSpeed,
  scale,
  resultType
}) => {
  if (!canvas2) {
    throw new Error("canvas is required");
  }
  const width = baseWidth * scale;
  const height = baseHeight * scale;
  const textColor = theme === APP_THEME.LIGHT ? lightTextColor : darkTextColor;
  const fontSize = baseFontSize * scale + 1;
  const textFont = `${fontSize}px "${fontFamily}"`;
  const iconWidth = baseIconWidth * scale;
  const iconHeight = baseIconHeight * scale;
  const textWidth = baseTextWidth * scale;
  if (canvas2.width !== width) {
    canvas2.width = width;
  }
  if (canvas2.height !== height) {
    canvas2.height = height;
  }
  const ctx = canvas2.getContext("2d");
  ctx.clearRect(0, 0, canvas2.width, canvas2.height);
  if (icon) {
    ctx.drawImage(icon, 0, 0, iconWidth, iconHeight);
  }
  ctx.font = textFont;
  ctx.textBaseline = "top";
  ctx.textAlign = "right";
  ctx.fillStyle = textColor;
  const uploadText = `${bytesToSize(uploadSpeed)}/s`;
  const uploadTextY = 0;
  ctx.fillText(uploadText, width, uploadTextY, textWidth);
  const downloadText = `${bytesToSize(downloadSpeed)}/s`;
  const downloadTextY = baseFontSize * scale + 0.5;
  ctx.fillText(downloadText, width, downloadTextY, textWidth);
  const result = transferCanvasTo(canvas2, resultType);
  return result;
};
const transferCanvasTo = (canvas2, type) => {
  switch (type) {
    case "DATA_URL":
      return canvas2.toDataURL();
    case "BLOB":
      return canvas2.convertToBlob();
    case "BITMAP":
      return canvas2.transferToImageBitmap();
    default:
      return canvas2.convertToBlob();
  }
};
let idx = 0;
let canvas;
const initCanvas = () => {
  if (canvas) {
    return canvas;
  }
  const { WIDTH, HEIGHT } = TRAY_CANVAS_CONFIG;
  return new OffscreenCanvas(WIDTH, HEIGHT);
};
const drawTray = async (payload) => {
  self.postMessage({
    type: "log",
    payload
  });
  if (!canvas) {
    canvas = initCanvas();
  }
  try {
    const tray = await draw({
      canvas,
      ...payload
    });
    self.postMessage({
      type: "tray:drawed",
      payload: {
        idx,
        tray
      }
    });
    idx += 1;
  } catch (error) {
    logger(error.message);
  }
};
const logger = (text) => {
  self.postMessage({
    type: "log",
    payload: text
  });
};
self.postMessage({
  type: "initialized",
  payload: Date.now()
});
self.addEventListener("message", (event) => {
  const { type, payload } = event.data;
  switch (type) {
    case "tray:draw":
      drawTray(payload);
      break;
    default:
      logger(JSON.stringify(event.data));
  }
});
