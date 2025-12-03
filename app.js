// Geoplayground – Bubble Graph Builder (Upgraded)
// Colors:
//   Grid: violet / purple
//   Lines: neon green
//   Selected: yellow
//   Cursor / snap dot: yellow

// ---------- Canvas & DOM ----------
const canvas = document.getElementById('bubbleCanvas');
const ctx = canvas.getContext('2d');

const toolButtons = Array.from(document.querySelectorAll('.toolBtn'));
const statusTool = document.getElementById('stTool');
const statusPos = document.getElementById('stPos');
const statusTransform = document.getElementById('stTransform');

const btnReset = document.getElementById('btnReset');
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

// Bubble grid params (flower-of-life style)
const BASE_R = 40;
const STEP_X = BASE_R;
const STEP_Y = BASE_R * Math.sqrt(3) / 2;

// ---------- App state ----------
const state = {
  tool: 'select',          // 'select' | 'line' | 'shape' | 'erase'
  lines: [],               // { a:{x,y}, b:{x,y}, color:string }
  drawingLine: null,       // for line tool
  shapeStart: null,        // for basic rect shape tool
  selection: new Set(),    // indices of selected lines
  mouseScreen: { x: 0, y: 0 },
  snapWorld: { x: 0, y: 0 },
  isPanning: false,
  panStart: { x: 0, y: 0 },
  panOrigin: { x: 0, y: 0 },

  // measurements toggle (dimensions ON/OFF)
  showDimensions: false,

  // line color
  currentColor: '#00ff55', // neon green

  // transforms
  transformMode: 'move',   // 'move' | 'rotate' | 'scale'
  transformDrag: null,     // { startWorld, center, originals: [ {i,a,b} ] }

  // rotation: snap vs free
  rotateSnap: true
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

// ---------- Snap to hex-lattice centers (used as intersection points) ----------
function snapToHexCenter(wx, wy) {
  const r = Math.round(wy / STEP_Y);
  const rowOffset = (r % 2) ? STEP_X / 2 : 0;
  const c = Math.round((wx - rowOffset) / STEP_X);
  const sx = c * STEP_X + rowOffset;
  const sy = r * STEP_Y;
  return { x: sx, y: sy };
}

// helper: snap endpoints softly (for move/rotate)
function maybeSnapPoint(p) {
  const target = snapToHexCenter(p.x, p.y);
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  const threshold = STEP_X * 0.25; // snap if close
  if (dist < threshold) return target;
  return p;
}

// ---------- Draw bubble grid ----------
function drawGrid() {
  ctx.save();

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);

  // violet/purple grid (eye-friendly)
  ctx.strokeStyle = 'rgba(168,85,247,0.6)'; // #a855f7-ish
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

// ---------- Dimension drawing (length labels) ----------
function drawDimensionForLine(ln) {
  const mx = (ln.a.x + ln.b.x) / 2;
  const my = (ln.a.y + ln.b.y) / 2;
  const dx = ln.b.x - ln.a.x;
  const dy = ln.b.y - ln.a.y;
  const length = Math.hypot(dx, dy) || 0.0001;

  const offset = 10 / zoom;
  const nx = mx + (-dy / length) * offset;
  const ny = my + (dx / length) * offset;

  ctx.save();
  ctx.font = `${10 / zoom}px system-ui`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = length.toFixed(1);
  ctx.fillText(text, nx, ny);
  ctx.restore();
}

// ---------- Draw lines + shapes ----------
function drawLines() {
  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);

  state.lines.forEach((ln, i) => {
    const selected = state.selection.has(i);
    ctx.strokeStyle = selected ? '#ffe36a' : (ln.color || '#00ff55'); // yellow selected, neon green default
    ctx.lineWidth = selected ? (3 / zoom) : (2 / zoom);

    ctx.beginPath();
    ctx.moveTo(ln.a.x, ln.a.y);
    ctx.lineTo(ln.b.x, ln.b.y);
    ctx.stroke();

    if (state.showDimensions) {
      drawDimensionForLine(ln);
    }
  });

  // preview line (line tool)
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

  // preview shape (shape tool: simple rect for now)
  if (state.tool === 'shape' && state.shapeStart) {
    const A = state.shapeStart;
    const B = state.snapWorld;
    const rect = makeRectFromTwoPoints(A, B);
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

// ---------- Upgraded cursor: yellow dot + small crosshair ----------
function drawSnapDot() {
  const s = worldToScreen(state.snapWorld.x, state.snapWorld.y);

  ctx.save();
  // dot
  ctx.fillStyle = '#ffe36a';
  ctx.shadowColor = '#ffe36a';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // small crosshair
  ctx.strokeStyle = '#ffe36a';
  ctx.lineWidth = 1;
  const len = 6;
  ctx.beginPath();
  ctx.moveTo(s.x - len, s.y);
  ctx.lineTo(s.x + len, s.y);
  ctx.moveTo(s.x, s.y - len);
  ctx.lineTo(s.x, s.y + len);
  ctx.stroke();

  ctx.restore();
}

// ---------- Hit test ----------
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

// ---------- Shape grouping (connected lines) ----------
function getConnectedShape(startIndex) {
  const visited = new Set();
  const stack = [startIndex];

  function samePoint(p1, p2) {
    const eps = 1e-3;
    return Math.hypot(p1.x - p2.x, p1.y - p2.y) < eps;
  }

  while (stack.length) {
    const idx = stack.pop();
    if (visited.has(idx)) continue;
    visited.add(idx);
    const ln = state.lines[idx];

    state.lines.forEach((other, j) => {
      if (visited.has(j)) return;
      if (
        samePoint(ln.a, other.a) ||
        samePoint(ln.a, other.b) ||
        samePoint(ln.b, other.a) ||
        samePoint(ln.b, other.b)
      ) {
        stack.push(j);
      }
    });
  }
  return visited; // set of indices = one "shape"
}

// ---------- Render ----------
function render() {
  if (!width || !height) return;
  drawGrid();
  drawLines();
  drawSnapDot();
  statusPos.textContent = `x:${state.snapWorld.x.toFixed(1)}  y:${state.snapWorld.y.toFixed(1)}`;
}

// ---------- Shape helper (simple rect for now) ----------
function makeRectFromTwoPoints(A, B) {
  return [
    { x: A.x, y: A.y },
    { x: B.x, y: A.y },
    { x: B.x, y: B.y },
    { x: A.x, y: B.y }
  ];
}
function addRectShape(A, B, color) {
  const rect = makeRectFromTwoPoints(A, B);
  const n = rect.length;
  for (let i = 0; i < n; i++) {
    const p1 = rect[i];
    const p2 = rect[(i + 1) % n];
    state.lines.push({ a: { ...p1 }, b: { ...p2 }, color });
  }
}

// ---------- Selection center (for transforms) ----------
function getSelectionCenter() {
  const idx = [...state.selection];
  if (!idx.length) return null;
  let sumX = 0, sumY = 0, count = 0;
  idx.forEach(i => {
    const ln = state.lines[i];
    sumX += ln.a.x + ln.b.x;
    sumY += ln.a.y + ln.b.y;
    count += 2;
  });
  return { x: sumX / count, y: sumY / count };
}

// ---------- Mouse interaction ----------
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

  // live transform drag
  if (state.transformDrag) {
    applyTransformDrag(world);
  }

  render();
});

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const world = screenToWorld(sx, sy);

  // right button = pan
  if (e.button === 2) {
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    state.panOrigin = { x: panX, y: panY };
    return;
  }

  // left button actions
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
          b: { ...state.drawingLine.b },
          color: state.currentColor
        });
      }
      state.drawingLine = null;
    }
  } else if (state.tool === 'shape') {
    if (!state.shapeStart) {
      state.shapeStart = { ...state.snapWorld };
    } else {
      addRectShape(state.shapeStart, state.snapWorld, state.currentColor);
      state.shapeStart = null;
    }
  } else if (state.tool === 'erase') {
    const hit = hitTestLine(world);
    if (hit >= 0) {
      state.lines.splice(hit, 1);
      state.selection.clear();
    }
  } else if (state.tool === 'select') {
    const hit = hitTestLine(world);
    if (hit >= 0) {
      // shape-based selection
      const shapeSet = getConnectedShape(hit);

      if (e.shiftKey) {
        // multi-select toggle per shape
        const allInSelection = [...shapeSet].every(i => state.selection.has(i));
        if (allInSelection) {
          shapeSet.forEach(i => state.selection.delete(i));
        } else {
          shapeSet.forEach(i => state.selection.add(i));
        }
      } else {
        // replace selection with that shape
        state.selection = new Set(shapeSet);
      }

      // start transform drag for current selection
      startTransformDrag(world);
    } else {
      if (!e.shiftKey) {
        state.selection.clear();
      }
    }
  }

  render();
});

canvas.addEventListener('mouseup', () => {
  state.isPanning = false;
  state.transformDrag = null;
});

canvas.addEventListener('mouseleave', () => {
  state.isPanning = false;
  state.transformDrag = null;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Transform drag ----------
function startTransformDrag(startWorld) {
  if (!state.selection.size) return;
  const center = getSelectionCenter();
  if (!center) return;

  const originals = [...state.selection].map(i => {
    const ln = state.lines[i];
    return {
      i,
      a: { ...ln.a },
      b: { ...ln.b }
    };
  });

  state.transformDrag = {
    startWorld,
    center,
    originals
  };
}

function applyTransformDrag(currentWorld) {
  const drag = state.transformDrag;
  if (!drag) return;

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
      const step = Math.PI / 12; // 15°
      angleDelta = Math.round(angleDelta / step) * step;
    }
  } else if (mode === 'scale') {
    const d0 = Math.hypot(drag.startWorld.x - center.x, drag.startWorld.y - center.y) || 1;
    const d1 = Math.hypot(currentWorld.x - center.x, currentWorld.y - center.y);
    scaleFactor = d1 / d0;
  }

  drag.originals.forEach(entry => {
    const idx = entry.i;
    const base = entry;
    const ln = state.lines[idx];

    function transformPoint(p0) {
      let x = p0.x;
      let y = p0.y;

      if (mode === 'move') {
        x += dx;
        y += dy;
      } else if (mode === 'rotate') {
        const relX = p0.x - center.x;
        const relY = p0.y - center.y;
        const cosA = Math.cos(angleDelta);
        const sinA = Math.sin(angleDelta);
        x = center.x + relX * cosA - relY * sinA;
        y = center.y + relX * sinA + relY * cosA;
      } else if (mode === 'scale') {
        const relX = p0.x - center.x;
        const relY = p0.y - center.y;
        x = center.x + relX * scaleFactor;
        y = center.y + relY * scaleFactor;
      }

      // snap-to-intersection logic while moving/rotating
      if (mode === 'move' || (mode === 'rotate' && state.rotateSnap)) {
        const snapped = maybeSnapPoint({ x, y });
        x = snapped.x;
        y = snapped.y;
      }

      return { x, y };
    }

    ln.a = transformPoint(base.a);
    ln.b = transformPoint(base.b);
  });
}

// ---------- Zoom ----------
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

// ---------- Tool switching ----------
function setTool(name) {
  state.tool = name;
  statusTool.textContent = `Tool: ${name}`;
  toolButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
  });
  if (name !== 'line') state.drawingLine = null;
  if (name !== 'shape') state.shapeStart = null;
  render();
}
toolButtons.forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

// ---------- Transform mode switching (M / R / S) ----------
function setTransformMode(mode) {
  state.transformMode = mode;
  statusTransform.textContent = `Transform: ${mode} (M/R/S, F=free, N=snap)`;
}
setTransformMode('move');

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'm') setTransformMode('move');
  if (key === 'r') setTransformMode('rotate');
  if (key === 's') setTransformMode('scale');

  // rotate snap/free toggle
  if (key === 'f') {
    state.rotateSnap = false;
    statusTransform.textContent = `Transform: ${state.transformMode} (free rotate)`;
  }
  if (key === 'n') {
    state.rotateSnap = true;
    statusTransform.textContent = `Transform: ${state.transformMode} (snap rotate)`;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    const remove = [...state.selection].sort((a, b) => b - a);
    remove.forEach(i => state.lines.splice(i, 1));
    state.selection.clear();
    render();
  }
});

// ---------- Dimensions toggle (measurement labels ON/OFF) ----------
btnDim.addEventListener('click', () => {
  state.showDimensions = !state.showDimensions;
  btnDim.textContent = state.showDimensions ? 'Dimensions: On' : 'Dimensions: Off';
  render();
});

// ---------- Color picker ----------
colorPicker.addEventListener('input', (e) => {
  const newColor = e.target.value;
  state.currentColor = newColor;

  // recolor selected lines if any
  if (state.selection.size) {
    state.selection.forEach(i => {
      state.lines[i].color = newColor;
    });
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
        state.lines = data.lines.map(ln => ({
          a: ln.a,
          b: ln.b,
          color: ln.color || '#00ff55'
        }));
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
