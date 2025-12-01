// Geoplayground – Bubble Graph Builder (Updated w/ Soft Gray-Blue Grid)
// Bubble grid (flower-of-life style) + snap dot + pan/zoom + line drawing + erase + save/load/png

// ---------- Canvas & DOM ----------
const canvas = document.getElementById('bubbleCanvas');
const ctx = canvas.getContext('2d');

const toolButtons = Array.from(document.querySelectorAll('.toolBtn'));
const statusTool = document.getElementById('stTool');
const statusPos = document.getElementById('stPos');

const btnReset = document.getElementById('btnReset');
const btnSave = document.getElementById('btnSave');
const btnLoad = document.getElementById('btnLoad');
const btnPNG = document.getElementById('btnPNG');
const fileInput = document.getElementById('fileInput');

// ---------- Size / DPR ----------
let width, height;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}
window.addEventListener('resize', resizeCanvas);

// ---------- View state ----------
let zoom = 1;
let panX = 0;
let panY = 0;

// Bubble grid params (flower-of-life style)
const BASE_R = 40;
const STEP_X = BASE_R;
const STEP_Y = BASE_R * Math.sqrt(3) / 2;

// ---------- App state ----------
const state = {
  tool: 'select',
  lines: [],
  drawingLine: null,
  selection: new Set(),
  mouseScreen: { x: 0, y: 0 },
  snapWorld: { x: 0, y: 0 },
  isPanning: false,
  panStart: { x: 0, y: 0 },
  panOrigin: { x: 0, y: 0 }
};

// ---------- Transform helpers ----------
function screenToWorld(sx, sy) {
  return {
    x: (sx - panX - width / 2) / zoom,
    y: (sy - panY - height / 2) / zoom
  };
}
function worldToScreen(wx, wy) {
  return {
    x: wx * zoom + panX + width / 2,
    y: wy * zoom + panY + height / 2
  };
}

// ---------- Snap to hex-lattice circle centers ----------
function snapToHexCenter(wx, wy) {
  const r = Math.round(wy / STEP_Y);
  const rowOffset = (r % 2) ? STEP_X / 2 : 0;
  const c = Math.round((wx - rowOffset) / STEP_X);
  const sx = c * STEP_X + rowOffset;
  const sy = r * STEP_Y;
  return { x: sx, y: sy };
}

// ---------- Draw the Bubble Grid ----------
function drawGrid() {
  ctx.save();

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);

  // NEW soft gray-blue grid color (eye-friendly)
  ctx.strokeStyle = 'rgba(92,122,255,0.55)'; // #5c7aff
  ctx.lineWidth = 1 / zoom;

  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(width, height);

  const minRow = Math.floor(topLeft.y / STEP_Y) - 2;
  const maxRow = Math.ceil(bottomRight.y / STEP_Y) + 2;

  for (let r = minRow; r <= maxRow; r++) {
    const rowOffset = (r % 2) ? STEP_X / 2 : 0;
    const minCol = Math.floor((topLeft.x - rowOffset) / STEP_X) - 2;
    const maxCol = Math.ceil((bottomRight.x - rowOffset) / STEP_X) + 2;

    for (let c = minCol; c <= maxCol; c++) {
      const cx = c * STEP_X + rowOffset;
      const cy = r * STEP_Y;
      ctx.beginPath();
      ctx.arc(cx, cy, BASE_R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ---------- Draw User Lines ----------
function drawLines() {
  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);

  state.lines.forEach((ln, i) => {
    const selected = state.selection.has(i);
    ctx.strokeStyle = selected ? '#ffe36a' : '#00ff55'; // yellow selected, green normal
    ctx.lineWidth = selected ? (3 / zoom) : (2 / zoom);

    ctx.beginPath();
    ctx.moveTo(ln.a.x, ln.a.y);
    ctx.lineTo(ln.b.x, ln.b.y);
    ctx.stroke();
  });

  if (state.drawingLine) {
    ctx.strokeStyle = '#00ff55';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 6 / zoom]);
    ctx.beginPath();
    ctx.moveTo(state.drawingLine.a.x, state.drawingLine.a.y);
    ctx.lineTo(state.drawingLine.b.x, state.drawingLine.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ---------- Draw Snap Dot ----------
function drawSnapDot() {
  const s = worldToScreen(state.snapWorld.x, state.snapWorld.y);

  ctx.save();
  ctx.fillStyle = '#ffe36a';
  ctx.shadowColor = '#ffe36a';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Hit Test ----------
function distPointSeg(P, A, B) {
  const vx = B.x - A.x, vy = B.y - A.y;
  const wx = P.x - A.x, wy = P.y - A.y;
  const denom = (vx * vx + vy * vy) || 1;
  const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / denom));
  const px = A.x + t * vx, py = A.y + t * vy;
  return Math.hypot(P.x - px, P.y - py);
}
function hitTestLine(worldPoint, tol = 12 / zoom) {
  let best = -1;
  let bestDist = Infinity;

  state.lines.forEach((ln, i) => {
    const d = distPointSeg(worldPoint, ln.a, ln.b);
    if (d < tol && d < bestDist) {
      bestDist = d;
      best = i;
    }
  });

  return best;
}

// ---------- Render Loop ----------
function render() {
  if (!width || !height) return;
  drawGrid();
  drawLines();
  drawSnapDot();
  statusPos.textContent = `x:${state.snapWorld.x.toFixed(1)}  y:${state.snapWorld.y.toFixed(1)}`;
}

// ---------- Interaction ----------
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (state.isPanning) {
    panX = state.panOrigin.x + (e.clientX - state.panStart.x);
    panY = state.panOrigin.y + (e.clientY - state.panStart.y);
  }

  const world = screenToWorld(sx, sy);
  state.snapWorld = snapToHexCenter(world.x, world.y);

  if (state.drawingLine && state.tool === 'line') {
    state.drawingLine.b = { ...state.snapWorld };
  }

  render();
});

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();

  if (e.button === 2) {
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    state.panOrigin = { x: panX, y: panY };
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const world = screenToWorld(sx, sy);

  if (state.tool === 'line') {
    if (!state.drawingLine) {
      state.drawingLine = {
        a: { ...state.snapWorld },
        b: { ...state.snapWorld }
      };
    } else {
      state.drawingLine.b = { ...state.snapWorld };
      const dx = state.drawingLine.b.x - state.drawingLine.a.x;
      const dy = state.drawingLine.b.y - state.drawingLine.a.y;

      if (Math.hypot(dx, dy) > 0.001) {
        state.lines.push({
          a: { ...state.drawingLine.a },
          b: { ...state.drawingLine.b }
        });
      }
      state.drawingLine = null;
    }
  }

  if (state.tool === 'select') {
    const hit = hitTestLine(world);
    if (hit >= 0) state.selection = new Set([hit]);
    else state.selection.clear();
  }

  if (state.tool === 'erase') {
    const hit = hitTestLine(world);
    if (hit >= 0) state.lines.splice(hit, 1);
  }

  render();
});

canvas.addEventListener('mouseup', () => {
  state.isPanning = false;
});

canvas.addEventListener('mouseleave', () => {
  state.isPanning = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Zoom Around Cursor ----------
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const worldBefore = screenToWorld(sx, sy);
  const zoomAmount = Math.exp(-e.deltaY * 0.0018);
  zoom = Math.max(0.25, Math.min(zoom * zoomAmount, 8));

  const wx = worldBefore.x;
  const wy = worldBefore.y;

  const screenAfterX = wx * zoom + panX + width / 2;
  const screenAfterY = wy * zoom + panY + height / 2;

  panX += sx - screenAfterX;
  panY += sy - screenAfterY;

  state.snapWorld = snapToHexCenter(screenToWorld(sx, sy).x, screenToWorld(sx, sy).y);

  render();
}, { passive: false });

// ---------- Tool Switching ----------
function setTool(name) {
  state.tool = name;
  statusTool.textContent = `Tool: ${name}`;
  toolButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
  });
  if (name !== 'line') state.drawingLine = null;
  render();
}
toolButtons.forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

// ---------- Keyboard Delete ----------
window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const remove = [...state.selection].sort((a, b) => b - a);
    remove.forEach(i => state.lines.splice(i, 1));
    state.selection.clear();
    render();
  }
});

// ---------- Reset / Save / Load / PNG ----------
btnReset.addEventListener('click', () => {
  panX = 0;
  panY = 0;
  zoom = 1;
  render();
});

btnSave.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ lines: state.lines }, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'geoplayground.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

btnLoad.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data.lines)) {
        state.lines = data.lines;
        state.selection.clear();
        render();
      }
    } catch {
      alert('Invalid file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

btnPNG.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'geoplayground.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ---------- Init ----------
function init() {
  resizeCanvas();
  setTool('select');
}
init();
