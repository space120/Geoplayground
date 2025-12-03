// Geoplayground – Bubble Graph Builder (Upgraded)
// Colors: Grid = violet, Lines = neon green, Selected = yellow, Cursor = yellow crosshair

// ---------- Canvas & DOM ----------
const canvas = document.getElementById('bubbleCanvas');
const ctx = canvas.getContext('2d');

const toolButtons = Array.from(document.querySelectorAll('.toolBtn'));
const statusTool = document.getElementById('stTool');
const statusPos = document.getElementById('stPos');
const statusTransform = document.getElementById('stTransform');

const btnReset = document.getElementById('btnReset');
const btnClear = document.getElementById('btnClear');
const btnSave = document.getElementById('btnSave');
const btnLoad = document.getElementById('btnLoad');
const btnPNG = document.getElementById('btnPNG');
const btnDim = document.getElementById('btnDim');
const fileInput = document.getElementById('fileInput');
const colorPicker = document.getElementById('colorPicker');

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

// Bubble grid geometry
const BASE_R = 40;
const STEP_X = BASE_R;
const STEP_Y = BASE_R * Math.sqrt(3) / 2;

// ---------- App state ----------
const state = {
  tool: 'select',
  lines: [],
  drawingLine: null,
  shapeStart: null,
  selection: new Set(),
  mouseScreen: { x: 0, y: 0 },
  snapWorld: { x: 0, y: 0 },
  isPanning: false,
  panStart: { x: 0, y: 0 },
  panOrigin: { x: 0, y: 0 },
  showDimensions: false,
  currentColor: '#00ff55',
  transformMode: 'move',
  transformDrag: null,
  rotateSnap: true
};

// ---------- Coordinate helpers ----------
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

// ---------- Snap-to-center ----------
function snapToHexCenter(wx, wy) {
  const r = Math.round(wy / STEP_Y);
  const rowOffset = (r % 2) ? STEP_X / 2 : 0;
  const c = Math.round((wx - rowOffset) / STEP_X);
  return {
    x: c * STEP_X + rowOffset,
    y: r * STEP_Y
  };
}
function maybeSnapPoint(p) {
  const t = snapToHexCenter(p.x, p.y);
  const dist = Math.hypot(p.x - t.x, p.y - t.y);
  if (dist < STEP_X * 0.25) return t;
  return p;
}

// ---------- Draw grid ----------
function drawGrid() {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.strokeStyle = 'rgba(168,85,247,0.6)';
  ctx.lineWidth = 1 / zoom;

  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(width, height);

  const minRow = Math.floor(topLeft.y / STEP_Y) - 2;
  const maxRow = Math.ceil(bottomRight.y / STEP_Y) + 2;

  for (let r = minRow; r <= maxRow; r++) {
    const offset = (r % 2) ? STEP_X / 2 : 0;
    const minCol = Math.floor((topLeft.x - offset) / STEP_X) - 2;
    const maxCol = Math.ceil((bottomRight.x - offset) / STEP_X) + 2;

    for (let c = minCol; c <= maxCol; c++) {
      const cx = c * STEP_X + offset;
      const cy = r * STEP_Y;
      ctx.beginPath();
      ctx.arc(cx, cy, BASE_R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- Dimensions ----------
function drawDimensionForLine(ln) {
  const mx = (ln.a.x + ln.b.x) / 2;
  const my = (ln.a.y + ln.b.y) / 2;
  const dx = ln.b.x - ln.a.x;
  const dy = ln.b.y - ln.a.y;
  const length = Math.hypot(dx, dy);

  const offset = 10 / zoom;
  const nx = mx + (-dy / length) * offset;
  const ny = my + (dx / length) * offset;

  ctx.save();
  ctx.font = `${10 / zoom}px system-ui`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(length.toFixed(1), nx, ny);
  ctx.restore();
}

// ---------- Draw lines & previews ----------
function drawLines() {
  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);

  state.lines.forEach((ln, i) => {
    const selected = state.selection.has(i);
    ctx.strokeStyle = selected ? '#ffe36a' : (ln.color || '#00ff55');
    ctx.lineWidth = selected ? (3 / zoom) : (2 / zoom);

    ctx.beginPath();
    ctx.moveTo(ln.a.x, ln.a.y);
    ctx.lineTo(ln.b.x, ln.b.y);
    ctx.stroke();

    if (state.showDimensions) drawDimensionForLine(ln);
  });

  if (state.drawingLine) {
    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 6 / zoom]);
    ctx.beginPath();
    ctx.moveTo(state.drawingLine.a.x, state.drawingLine.a.y);
    ctx.lineTo(state.drawingLine.b.x, state.drawingLine.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (state.tool === 'shape' && state.shapeStart) {
    const A = state.shapeStart;
    const B = state.snapWorld;
    const rect = [
      { x: A.x, y: A.y },
      { x: B.x, y: A.y },
      { x: B.x, y: B.y },
      { x: A.x, y: B.y }
    ];

    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 6 / zoom]);

    ctx.beginPath();
    ctx.moveTo(rect[0].x, rect[0].y);
    for (let i = 1; i < rect.length; i++) ctx.lineTo(rect[i].x, rect[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ---------- Cursor ----------
function drawSnapDot() {
  const s = worldToScreen(state.snapWorld.x, state.snapWorld.y);

  ctx.save();
  ctx.fillStyle = '#ffe36a';
  ctx.shadowColor = '#ffe36a';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#ffe36a';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(s.x - 6, s.y);
  ctx.lineTo(s.x + 6, s.y);
  ctx.moveTo(s.x, s.y - 6);
  ctx.lineTo(s.x, s.y + 6);
  ctx.stroke();

  ctx.restore();
}

// ---------- Hit test ----------
function distPointSeg(P, A, B) {
  const vx = B.x - A.x, vy = B.y - A.y;
  const wx = P.x - A.x, wy = P.y - A.y;
  const proj = Math.max(0, Math.min(1, (vx * wx + vy * wy) / ((vx * vx + vy * vy) || 1)));
  const px = A.x + proj * vx, py = A.y + proj * vy;
  return Math.hypot(P.x - px, P.y - py);
}
function hitTestLine(worldPoint, tol = 12 / zoom) {
  let best = -1, bestDist = Infinity;
  state.lines.forEach((ln, i) => {
    const d = distPointSeg(worldPoint, ln.a, ln.b);
    if (d < tol && d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

// ---------- Shape recognition ----------
function getConnectedShape(startIndex) {
  const visited = new Set();
  const stack = [startIndex];

  function samePoint(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y) < 1e-3;
  }

  while (stack.length) {
    const idx = stack.pop();
    if (visited.has(idx)) continue;
    visited.add(idx);

    const ln = state.lines[idx];
    state.lines.forEach((other, j) => {
      if (visited.has(j)) return;
      if (samePoint(ln.a, other.a) || samePoint(ln.a, other.b) ||
          samePoint(ln.b, other.a) || samePoint(ln.b, other.b)) {
        stack.push(j);
      }
    });
  }
  return visited;
}

// ---------- Render ----------
function render() {
  drawGrid();
  drawLines();
  drawSnapDot();
  statusPos.textContent = `x:${state.snapWorld.x.toFixed(1)}  y:${state.snapWorld.y.toFixed(1)}`;
}

// ---------- Mouse ----------
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

  if (state.transformDrag) {
    applyTransformDrag(world);
  }

  render();
});

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const world = screenToWorld(sx, sy);

  if (e.button === 2) {
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    state.panOrigin = { x: panX, y: panY };
    return;
  }

  if (state.tool === 'line') {
    if (!state.drawingLine) {
      state.drawingLine = { a: { ...state.snapWorld }, b: { ...state.snapWorld } };
    } else {
      state.drawingLine.b = { ...state.snapWorld };
      const dx = state.drawingLine.b.x - state.drawingLine.a.x;
      const dy = state.drawingLine.b.y - state.drawingLine.a.y;
      if (Math.hypot(dx, dy) > 0.001) {
        state.lines.push({
          a: { ...state.drawingLine.a },
          b: { ...state.drawingLine.b },
          color: state.currentColor
        });
      }
      state.drawingLine = null;
    }
  }

  else if (state.tool === 'shape') {
    if (!state.shapeStart) {
      state.shapeStart = { ...state.snapWorld };
    } else {
      const A = state.shapeStart;
      const B = state.snapWorld;
      const rect = [
        { x: A.x, y: A.y },
        { x: B.x, y: A.y },
        { x: B.x, y: B.y },
        { x: A.x, y: B.y }
      ];
      for (let i = 0; i < 4; i++) {
        const p1 = rect[i];
        const p2 = rect[(i + 1) % 4];
        state.lines.push({
          a: { ...p1 },
          b: { ...p2 },
          color: state.currentColor
        });
      }
      state.shapeStart = null;
    }
  }

  else if (state.tool === 'erase') {
    const hit = hitTestLine(world);
    if (hit >= 0) {
      state.lines.splice(hit, 1);
      state.selection.clear();
      render();
    }
  }

  else if (state.tool === 'select') {
    const hit = hitTestLine(world);
    if (hit >= 0) {
      const shape = getConnectedShape(hit);
      if (e.shiftKey) {
        const allSel = [...shape].every(i => state.selection.has(i));
        shape.forEach(i => allSel ? state.selection.delete(i) : state.selection.add(i));
      } else {
        state.selection = shape;
      }
      startTransformDrag(world);
    } else {
      if (!e.shiftKey) state.selection.clear();
    }
  }

  render();
});

canvas.addEventListener('mouseup', () => {
  state.isPanning = false;
  state.transformDrag = null;
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Transform drag ----------
function startTransformDrag(startWorld) {
  if (!state.selection.size) return;
  const center = getSelectionCenter();
  const originals = [...state.selection].map(i => ({
    i,
    a: { ...state.lines[i].a },
    b: { ...state.lines[i].b }
  }));

  state.transformDrag = { startWorld, center, originals };
}

function applyTransformDrag(currentWorld) {
  const drag = state.transformDrag;
  const mode = state.transformMode;
  const center = drag.center;

  const dx = currentWorld.x - drag.startWorld.x;
  const dy = currentWorld.y - drag.startWorld.y;

  let angleDelta = 0;
  let scaleFactor = 1;

  if (mode === 'rotate') {
    const a0 = Math.atan2(drag.startWorld.y - center.y, drag.startWorld.x - center.x);
    const a1 = Math.atan2(currentWorld.y - center.y, currentWorld.x - center.x);
    angleDelta = a1 - a0;
    if (state.rotateSnap) {
      const s = Math.PI / 12;
      angleDelta = Math.round(angleDelta / s) * s;
    }
  }

  if (mode === 'scale') {
    const d0 = Math.hypot(drag.startWorld.x - center.x, drag.startWorld.y - center.y) || 1;
    const d1 = Math.hypot(currentWorld.x - center.x, currentWorld.y - center.y);
    scaleFactor = d1 / d0;
  }

  drag.originals.forEach(o => {
    const ln = state.lines[o.i];

    function transformPoint(p0) {
      let x = p0.x, y = p0.y;

      if (mode === 'move') {
        x += dx; y += dy;
      }
      else if (mode === 'rotate') {
        const rx = p0.x - center.x;
        const ry = p0.y - center.y;
        const c = Math.cos(angleDelta);
        const s = Math.sin(angleDelta);
        x = center.x + rx * c - ry * s;
        y = center.y + rx * s + ry * c;
      }
      else if (mode === 'scale') {
        const rx = p0.x - center.x;
        const ry = p0.y - center.y;
        x = center.x + rx * scaleFactor;
        y = center.y + ry * scaleFactor;
      }

      if (mode === 'move' || (mode === 'rotate' && state.rotateSnap)) {
        return maybeSnapPoint({ x, y });
      }
      return { x, y };
    }

    ln.a = transformPoint(o.a);
    ln.b = transformPoint(o.b);
  });
}

// ---------- Transform mode ----------
function getSelectionCenter() {
  const ids = [...state.selection];
  if (!ids.length) return null;

  let sx = 0, sy = 0, count = 0;

  ids.forEach(i => {
    const ln = state.lines[i];
    sx += ln.a.x + ln.b.x;
    sy += ln.a.y + ln.b.y;
    count += 2;
  });

  return { x: sx / count, y: sy / count };
}

function setTransformMode(mode) {
  state.transformMode = mode;
  statusTransform.textContent = `Transform: ${mode} (M/R/S, F free, N snap)`;
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'm') setTransformMode('move');
  if (key === 'r') setTransformMode('rotate');
  if (key === 's') setTransformMode('scale');

  if (key === 'f') state.rotateSnap = false;
  if (key === 'n') state.rotateSnap = true;

  if (key === 'delete' || key === 'backspace') {
    const arr = [...state.selection].sort((a, b) => b - a);
    arr.forEach(i => state.lines.splice(i, 1));
    state.selection.clear();
    render();
  }
});

// ---------- View reset ----------
btnReset.addEventListener('click', () => {
  panX = 0;
  panY = 0;
  zoom = 1;
  render();
});

// ---------- CLEAR CANVAS (NEW FEATURE) ----------
btnClear.addEventListener('click', () => {
  state.lines = [];
  state.selection.clear();
  state.drawingLine = null;
  state.shapeStart = null;
  render();
});

// ---------- Dimensions toggle ----------
btnDim.addEventListener('click', () => {
  state.showDimensions = !state.showDimensions;
  btnDim.textContent = state.showDimensions ? "Dimensions: On" : "Dimensions: Off";
  render();
});

// ---------- Color picker ----------
colorPicker.addEventListener('input', e => {
  const c = e.target.value;
  state.currentColor = c;

  state.selection.forEach(i => {
    state.lines[i].color = c;
  });

  render();
});

// ---------- Save / Load / PNG ----------
btnSave.addEventListener('click', () => {
  const data = JSON.stringify({ lines: state.lines }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
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
        state.lines = data.lines.map(ln => ({
          a: ln.a,
          b: ln.b,
          color: ln.color || '#00ff55'
        }));
        state.selection.clear();
        render();
      }
    } catch {
      alert("Invalid file.");
    }
  };

  reader.readAsText(file);
  e.target.value = '';
});

btnPNG.addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'geoplayground.png';
  link.click();
});

// ---------- Init ----------
function init() {
  resizeCanvas();
  setTool('select');
}
function setTool(name) {
  state.tool = name;
  statusTool.textContent = `Tool: ${name}`;
  toolButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
  });
}
init();
