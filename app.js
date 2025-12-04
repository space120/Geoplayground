// Geoplayground — Bubble Graph Builder (with presets, snap modes, and file/export menu)

// ---------- DOM ----------
const canvas = document.getElementById('bubbleCanvas');
const ctx = canvas.getContext('2d');

const toolButtons = Array.from(document.querySelectorAll('.toolBtn'));
const statusTool = document.getElementById('stTool');
const statusPos = document.getElementById('stPos');
const statusTransform = document.getElementById('stTransform');

const btnReset = document.getElementById('btnReset');
const btnDim = document.getElementById('btnDim');
const colorPicker = document.getElementById('colorPicker');

const fileInput = document.getElementById('fileInput');
const fileMenuItems = Array.from(document.querySelectorAll('.menu-item'));

const btnPresets = document.getElementById('btnPresets');
const presetDrawer = document.getElementById('presetDrawer');
const presetTriangleBtn = document.getElementById('presetTriangle');
const presetHexagonBtn = document.getElementById('presetHexagon');
const presetCubeBtn = document.getElementById('presetCube');
const presetTesseractBtn = document.getElementById('presetTesseract');
const presetSizeSlider = document.getElementById('presetSize');
const snapModeSelect = document.getElementById('snapModeSelect');

const btnExportAll = document.getElementById('btnExportAll');

const presetButtons = [
  presetTriangleBtn,
  presetHexagonBtn,
  presetCubeBtn,
  presetTesseractBtn
];

// ---------- Canvas size / DPR ----------
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
  snapWorld: { x: 0, y: 0 },
  isPanning: false,
  panStart: { x: 0, y: 0 },
  panOrigin: { x: 0, y: 0 },

  showDimensions: false,
  currentColor: '#00ff55',

  transformMode: 'move',
  transformDrag: null,
  rotateSnap: true,

  // Snap modes: 'grid' | 'gridMid' | 'free'
  snapMode: 'grid',

  // Presets
  presetActive: false,
  presetType: null,
  presetScale: 1.0
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

// ---------- Grid snapping ----------
function nearestHexCenter(wx, wy) {
  const r = Math.round(wy / STEP_Y);
  const offset = (r % 2) ? STEP_X / 2 : 0;
  const c = Math.round((wx - offset) / STEP_X);
  return {
    x: c * STEP_X + offset,
    y: r * STEP_Y
  };
}

function computeSnapCandidates(wx, wy) {
  const center = nearestHexCenter(wx, wy);

  // immediate hex neighbors (approx)
  const g = [];
  g.push(center);
  g.push({ x: center.x + STEP_X, y: center.y });
  g.push({ x: center.x - STEP_X, y: center.y });
  g.push({ x: center.x + STEP_X / 2, y: center.y + STEP_Y });
  g.push({ x: center.x - STEP_X / 2, y: center.y + STEP_Y });
  g.push({ x: center.x + STEP_X / 2, y: center.y - STEP_Y });
  g.push({ x: center.x - STEP_X / 2, y: center.y - STEP_Y });

  const mids = [];
  for (let i = 1; i < g.length; i++) {
    const a = center;
    const b = g[i];
    mids.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    });
  }

  return { grid: g, midpoints: mids };
}

function snapPointForMode(worldPoint) {
  if (state.snapMode === 'free') return { ...worldPoint };

  const { grid, midpoints } = computeSnapCandidates(worldPoint.x, worldPoint.y);
  const candidates = (state.snapMode === 'gridMid')
    ? grid.concat(midpoints)
    : grid;

  let best = worldPoint;
  let bestDist = Infinity;

  for (const p of candidates) {
    const d = Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

// ---------- Draw grid ----------
function drawGrid() {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.strokeStyle = 'rgba(168,85,247,0.6)'; // violet/purple
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

// ---------- Draw lines & shape previews ----------
function drawLines() {
  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);

  state.lines.forEach((ln, i) => {
    const selected = state.selection.has(i);
    ctx.strokeStyle = selected ? '#ffe36a' : (ln.color || '#00ff55'); // yellow / neon green
    ctx.lineWidth = selected ? (3 / zoom) : (2 / zoom);

    ctx.beginPath();
    ctx.moveTo(ln.a.x, ln.a.y);
    ctx.lineTo(ln.b.x, ln.b.y);
    ctx.stroke();

    if (state.showDimensions) drawDimensionForLine(ln);
  });

  // live line
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

  // live rectangle
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

// ---------- Preset geometry ----------

// Triangle (equilateral)
function buildTriangle(center, scale) {
  const radius = BASE_R * 1.6 * scale;
  const raw = [];
  for (let i = 0; i < 3; i++) {
    const angle = -Math.PI / 2 + i * (2 * Math.PI / 3);
    raw.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  }
  const pts = raw.map(p => snapPointForMode(p));
  const lines = [];
  for (let i = 0; i < 3; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 3];
    lines.push({ a, b });
  }
  return lines;
}

// Hexagon (regular)
function buildHexagon(center, scale) {
  const radius = BASE_R * 1.4 * scale;
  const raw = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + i * (2 * Math.PI / 6);
    raw.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  }
  const pts = raw.map(p => snapPointForMode(p));
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 6];
    lines.push({ a, b });
  }
  return lines;
}

// Cube (3D-ish projection)
function buildCube(center, scale) {
  const s = BASE_R * 1.2 * scale;
  const verts3D = [
    [-1, -1, -1],
    [ 1, -1, -1],
    [ 1,  1, -1],
    [-1,  1, -1],
    [-1, -1,  1],
    [ 1, -1,  1],
    [ 1,  1,  1],
    [-1,  1,  1]
  ].map(v => v.map(x => x * s));

  function project([x, y, z]) {
    const px = x + z * 0.5;
    const py = y - z * 0.5;
    return { x: center.x + px, y: center.y + py };
  }

  const rawPts = verts3D.map(project);
  const pts = rawPts.map(p => snapPointForMode(p));

  const edges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];

  return edges.map(([i,j]) => ({
    a: pts[i],
    b: pts[j]
  }));
}

// Tesseract-like frame
function buildTesseract(center, scale) {
  const outerScale = scale;
  const innerScale = scale * 0.6;

  const sOuter = BASE_R * 1.2 * outerScale;
  const sInner = BASE_R * 1.2 * innerScale;

  const verts3D = [
    [-1, -1, -1],
    [ 1, -1, -1],
    [ 1,  1, -1],
    [-1,  1, -1],
    [-1, -1,  1],
    [ 1, -1,  1],
    [ 1,  1,  1],
    [-1,  1,  1]
  ];

  function scaleVerts(scale) {
    return verts3D.map(v => v.map(x => x * scale));
  }
  function project([x, y, z]) {
    const px = x + z * 0.5;
    const py = y - z * 0.5;
    return { x: center.x + px, y: center.y + py };
  }

  const rawOuter = scaleVerts(sOuter).map(project);
  const rawInner = scaleVerts(sInner).map(project);

  const outerPts = rawOuter.map(p => snapPointForMode(p));
  const innerPts = rawInner.map(p => snapPointForMode(p));

  const edgesCube = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];

  const lines = [];

  edgesCube.forEach(([i,j]) => {
    lines.push({ a: outerPts[i], b: outerPts[j] });
    lines.push({ a: innerPts[i], b: innerPts[j] });
  });

  for (let i = 0; i < 8; i++) {
    lines.push({ a: outerPts[i], b: innerPts[i] });
  }

  return lines;
}

function buildPresetLines(type, center, scale) {
  if (!type) return [];
  if (type === 'triangle') return buildTriangle(center, scale);
  if (type === 'hexagon') return buildHexagon(center, scale);
  if (type === 'cube') return buildCube(center, scale);
  if (type === 'tesseract') return buildTesseract(center, scale);
  return [];
}

// ---------- Preset ghost ----------
function drawPresetGhost() {
  if (!state.presetActive || !state.presetType) return;

  const center = state.snapWorld;
  const lines = buildPresetLines(state.presetType, center, state.presetScale);
  if (!lines.length) return;

  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([6 / zoom, 6 / zoom]);

  lines.forEach(ln => {
    ctx.beginPath();
    ctx.moveTo(ln.a.x, ln.a.y);
    ctx.lineTo(ln.b.x, ln.b.y);
    ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.restore();
}

// ---------- Cursor / yellow dot ----------
function drawSnapDot() {
  const s = worldToScreen(state.snapWorld.x, state.snapWorld.y);

  ctx.save();
  ctx.fillStyle = '#ffe36a'; // yellow
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

// ---------- Hit testing ----------
function distPointSeg(P, A, B) {
  const vx = B.x - A.x, vy = B.y - A.y;
  const wx = P.x - A.x, wy = P.y - A.y;
  const denom = (vx * vx + vy * vy) || 1;
  const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / denom));
  const px = A.x + t * vx, py = A.y + t * vy;
  return Math.hypot(P.x - px, P.y - py);
}
function hitTestLine(worldPoint, tol = 12 / zoom) {
  let best = -1, bestDist = Infinity;
  state.lines.forEach((ln, i) => {
    const d = distPointSeg(worldPoint, ln.a, ln.b);
    if (d < tol && d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

// ---------- Shape grouping ----------
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

// ---------- Rendering ----------
function render() {
  drawGrid();
  drawLines();
  drawPresetGhost();
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
  state.snapWorld = snapPointForMode(world);

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

  // Right-click: pan
  if (e.button === 2) {
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    state.panOrigin = { x: panX, y: panY };
    return;
  }

  // Preset placement
  if (state.presetActive && state.presetType) {
    const center = state.snapWorld;
    const ghostLines = buildPresetLines(state.presetType, center, state.presetScale);
    const startIdx = state.lines.length;
    ghostLines.forEach(gl => {
      state.lines.push({
        a: { ...gl.a },
        b: { ...gl.b },
        color: state.currentColor
      });
    });
    state.selection.clear();
    for (let i = startIdx; i < state.lines.length; i++) {
      state.selection.add(i);
    }
    render();
    return;
  }

  // Tools
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
  } else if (state.tool === 'shape') {
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
      const startIdx = state.lines.length;
      for (let i = 0; i < 4; i++) {
        const p1 = snapPointForMode(rect[i]);
        const p2 = snapPointForMode(rect[(i + 1) % 4]);
        state.lines.push({
          a: p1,
          b: p2,
          color: state.currentColor
        });
      }
      state.shapeStart = null;
      state.selection.clear();
      for (let i = startIdx; i < state.lines.length; i++) {
        state.selection.add(i);
      }
    }
  } else if (state.tool === 'erase') {
    const hit = hitTestLine(world);
    if (hit >= 0) {
      state.lines.splice(hit, 1);
      state.selection.clear();
      render();
    }
  } else if (state.tool === 'select') {
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
    render();
  }
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
  if (!center) return;

  const originals = [...state.selection].map(i => ({
    i,
    a: { ...state.lines[i].a },
    b: { ...state.lines[i].b }
  }));

  state.transformDrag = { startWorld, center, originals };
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
  }

  if (mode === 'scale') {
    const d0 = Math.hypot(drag.startWorld.x - center.x, drag.startWorld.y - center.y) || 1;
    const d1 = Math.hypot(currentWorld.x - center.x, currentWorld.y - center.y);
    scaleFactor = d1 / d0;
  }

  drag.originals.forEach(o => {
    const ln = state.lines[o.i];

    function transformPoint(p0) {
      let x = p0.x;
      let y = p0.y;

      if (mode === 'move') {
        x += dx;
        y += dy;
      } else if (mode === 'rotate') {
        const rx = p0.x - center.x;
        const ry = p0.y - center.y;
        const c = Math.cos(angleDelta);
        const s = Math.sin(angleDelta);
        x = center.x + rx * c - ry * s;
        y = center.y + rx * s + ry * c;
      } else if (mode === 'scale') {
        const rx = p0.x - center.x;
        const ry = p0.y - center.y;
        x = center.x + rx * scaleFactor;
        y = center.y + ry * scaleFactor;
      }

      if (state.snapMode !== 'free' && (mode === 'move' || (mode === 'rotate' && state.rotateSnap))) {
        return snapPointForMode({ x, y });
      }
      return { x, y };
    }

    ln.a = transformPoint(o.a);
    ln.b = transformPoint(o.b);
  });
}

// ---------- Selection center ----------
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

// ---------- Transform mode ----------
function setTransformMode(mode) {
  state.transformMode = mode;
  statusTransform.textContent = `Transform: ${mode} (M/R/S, F free, N snap)`;
}

// ---------- Keyboard ----------
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  if (key === 'm') setTransformMode('move');
  if (key === 'r') setTransformMode('rotate');
  if (key === 's') setTransformMode('scale');

  if (key === 'f') state.rotateSnap = false;
  if (key === 'n') state.rotateSnap = true;

  if (e.key === 'Escape') {
    state.presetActive = false;
    state.presetType = null;
    presetButtons.forEach(b => b.classList.remove('active'));
    render();
  }

  if (e.key === 'delete' || e.key === 'backspace') {
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

// ---------- Dimensions toggle ----------
btnDim.addEventListener('click', () => {
  state.showDimensions = !state.showDimensions;
  btnDim.textContent = state.showDimensions ? 'Dimensions: On' : 'Dimensions: Off';
  render();
});

// ---------- Color picker ----------
colorPicker.addEventListener('input', e => {
  const c = e.target.value;
  state.currentColor = c;
  state.selection.forEach(i => { state.lines[i].color = c; });
  render();
});

// ---------- Save / Load / Clear / Export ----------
function saveDrawing() {
  const data = JSON.stringify({
    lines: state.lines,
    snapMode: state.snapMode
  }, null, 2);

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'geoplayground.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadDrawing() {
  fileInput.click();
}

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
        state.snapMode = data.snapMode || 'grid';
        snapModeSelect.value = state.snapMode;
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

function clearCanvas() {
  const ok = confirm('Clear the canvas? This cannot be undone.');
  if (!ok) return;
  state.lines = [];
  state.selection.clear();
  state.drawingLine = null;
  state.shapeStart = null;
  render();
}

function exportAll() {
  render(); // ensure current

  // JSON
  const data = JSON.stringify({
    lines: state.lines,
    snapMode: state.snapMode
  }, null, 2);
  const blobJson = new Blob([data], { type: 'application/json' });
  const urlJson = URL.createObjectURL(blobJson);
  const aJson = document.createElement('a');
  aJson.href = urlJson;
  aJson.download = 'geoplayground.json';
  aJson.click();
  setTimeout(() => URL.revokeObjectURL(urlJson), 1000);

  // PNG
  canvas.toBlob((blobPng) => {
    if (!blobPng) return;
    const urlPng = URL.createObjectURL(blobPng);
    const aPng = document.createElement('a');
    aPng.href = urlPng;
    aPng.download = 'geoplayground.png';
    aPng.click();
    setTimeout(() => URL.revokeObjectURL(urlPng), 1000);
  }, 'image/png');

  // SVG (shapes only)
  const svgParts = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`
  );
  svgParts.push(`<g stroke-linecap="round" stroke-linejoin="round">`);

  state.lines.forEach(ln => {
    const a = worldToScreen(ln.a.x, ln.a.y);
    const b = worldToScreen(ln.b.x, ln.b.y);
    const color = ln.color || '#00ff55';
    svgParts.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="2" />`
    );
  });

  svgParts.push(`</g></svg>`);
  const svgBlob = new Blob(svgParts, { type: 'image/svg+xml' });
  const urlSvg = URL.createObjectURL(svgBlob);
  const aSvg = document.createElement('a');
  aSvg.href = urlSvg;
  aSvg.download = 'geoplayground.svg';
  aSvg.click();
  setTimeout(() => URL.revokeObjectURL(urlSvg), 1000);
}

// File menu clicks
fileMenuItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.fileAction;
    if (action === 'save') saveDrawing();
    if (action === 'load') loadDrawing();
    if (action === 'clear') clearCanvas();
    if (action === 'export') exportAll();
  });
});

// Top-bar export icon
btnExportAll.addEventListener('click', exportAll);

// ---------- Preset drawer ----------
btnPresets.addEventListener('click', () => {
  const opened = presetDrawer.classList.toggle('open');
  btnPresets.textContent = opened ? 'Presets ◂' : 'Presets ▸';
});

function activatePreset(type) {
  state.presetActive = true;
  state.presetType = type;
  presetButtons.forEach(b => b.classList.remove('active'));
  if (type === 'triangle') presetTriangleBtn.classList.add('active');
  if (type === 'hexagon') presetHexagonBtn.classList.add('active');
  if (type === 'cube') presetCubeBtn.classList.add('active');
  if (type === 'tesseract') presetTesseractBtn.classList.add('active');
}

presetTriangleBtn.addEventListener('click', () => activatePreset('triangle'));
presetHexagonBtn.addEventListener('click', () => activatePreset('hexagon'));
presetCubeBtn.addEventListener('click', () => activatePreset('cube'));
presetTesseractBtn.addEventListener('click', () => activatePreset('tesseract'));

presetSizeSlider.addEventListener('input', e => {
  state.presetScale = parseFloat(e.target.value) || 1.0;
  render();
});

snapModeSelect.addEventListener('change', e => {
  state.snapMode = e.target.value;
  render();
});

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

  const worldAfter = screenToWorld(sx, sy);
  state.snapWorld = snapPointForMode(worldAfter);

  render();
}, { passive: false });

// ---------- Tools ----------
function setTool(name) {
  state.tool = name;
  statusTool.textContent = `Tool: ${name}`;
  toolButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
  });
}

toolButtons.forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

// ---------- Init ----------
function init() {
  resizeCanvas();
  setTool('select');
  setTransformMode('move');
  state.presetScale = parseFloat(presetSizeSlider.value) || 1.0;
  state.snapMode = snapModeSelect.value;
}
init();
