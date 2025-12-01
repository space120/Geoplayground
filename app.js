// Geoplayground - Bubble Graph Grid (hex circle pattern + snap dot + pan + zoom)

// ---------- Canvas setup ----------
const canvas = document.getElementById('bubbleCanvas');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

// ---------- View state (screen <-> world) ----------
let zoom = 1;               // scale factor
let panX = width / 2;       // start with world origin roughly centered
let panY = height / 2;

const BASE_R = 40;          // circle radius (world units)
const STEP_X = BASE_R;      // horizontal spacing between centers
const STEP_Y = BASE_R * Math.sqrt(3) / 2; // vertical spacing for hex lattice

// mouse & snapping
let mouseScreen = { x: width / 2, y: height / 2 };
let snapWorld = { x: 0, y: 0 };

// pan drag
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };

// ---------- Helpers ----------
function screenToWorld(sx, sy) {
  return {
    x: (sx - panX) / zoom,
    y: (sy - panY) / zoom
  };
}

function worldToScreen(wx, wy) {
  return {
    x: wx * zoom + panX,
    y: wy * zoom + panY
  };
}

// Given any world point, snap to nearest hex-lattice center
function snapToHexCenter(wx, wy) {
  const r = Math.round(wy / STEP_Y); // hex row index
  const rowOffset = (r % 2) ? STEP_X / 2 : 0;
  const c = Math.round((wx - rowOffset) / STEP_X); // column index

  const sx = c * STEP_X + rowOffset;
  const sy = r * STEP_Y;
  return { x: sx, y: sy };
}

// ---------- Drawing the hex circle grid ----------
function drawGrid() {
  ctx.save();

  // clear background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // world transform
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // style for circles
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1 / zoom;

  // visible world bounds
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

// ---------- Yellow snap dot ----------
function drawSnapDot() {
  const s = worldToScreen(snapWorld.x, snapWorld.y);

  ctx.save();
  ctx.fillStyle = '#ffe36a';
  ctx.beginPath();
  ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
  ctx.fill();

  // glow
  ctx.shadowColor = '#ffe36a';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Main render ----------
function render() {
  drawGrid();
  drawSnapDot();
}

// ---------- Mouse & interaction ----------
canvas.addEventListener('mousemove', (e) => {
  mouseScreen.x = e.clientX;
  mouseScreen.y = e.clientY;

  if (isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    panX = panOrigin.x + dx;
    panY = panOrigin.y + dy;
  }

  // update snap target
  const world = screenToWorld(mouseScreen.x, mouseScreen.y);
  snapWorld = snapToHexCenter(world.x, world.y);

  render();
});

canvas.addEventListener('mousedown', (e) => {
  // right button (2) for pan
  if (e.button === 2) {
    isPanning = true;
    panStart.x = e.clientX;
    panStart.y = e.clientY;
    panOrigin.x = panX;
    panOrigin.y = panY;
  }
});

canvas.addEventListener('mouseup', () => {
  isPanning = false;
});

canvas.addEventListener('mouseleave', () => {
  isPanning = false;
});

// disable context menu so right-drag feels natura
