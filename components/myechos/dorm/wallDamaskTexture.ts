import * as THREE from "three";

/** Dark, warm damask-like repeat for interior walls (client-only). */
export function createDamaskWallTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) {
    throw new Error("2d context unavailable");
  }

  g.fillStyle = "#1a2230";
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(235, 210, 170, ${0.015 + Math.random() * 0.035})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
  }

  const step = 128;
  g.lineWidth = 1.05;
  g.strokeStyle = "rgba(210, 172, 118, 0.2)";
  for (let y = 0; y <= h + step; y += step) {
    for (let x = 0; x <= w + step; x += step) {
      g.save();
      g.translate(x, y);
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = 32 + Math.sin(a * 3) * 6;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 14, 0, Math.PI * 2);
      g.strokeStyle = "rgba(190, 155, 100, 0.12)";
      g.stroke();
      g.restore();
    }
  }

  g.strokeStyle = "rgba(175, 140, 90, 0.055)";
  g.lineWidth = 0.8;
  for (let i = 0; i < 36; i++) {
    g.beginPath();
    const y = i * 28;
    g.moveTo(0, y);
    g.bezierCurveTo(w * 0.25, y + 18, w * 0.72, y - 12, w, y + 10);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 2.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
