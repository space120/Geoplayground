// ------------------------------
// Canvas Setup
// ------------------------------
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let DPR = window.devicePixelRatio || 1;

function resize() {
    canvas.width = innerWidth * DPR;
    canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
resize();
window.addEventListener("resize", resize);

// ------------------------------
// Grid Settings (Bubble Grid)
// ------------------------------
const GRID_RADIUS = 26;           // distance between bubble centers
const CIRCLE_R = 5;               // size of each bubble circle

let zoom = 1;
let offsetX = 0;
let offsetY = 0;

// ------------------------------
// Tools + State
// ------------------------------
let tool = "line";
let drawingPoint = null;
let shapes = []; // {a:{x,y}, b:{x,y}}
const cursorDot = document.getElementById("cursorDot");

// Set current tool
function setTool(t) { tool = t; }

// ------------------------------
// Bubble Grid Drawing
// ------------------------------
function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    const w = canvas.width / DPR;
    const h = canvas.height / DPR;

    const cols = Math.ceil(w / GRID_RADIUS) + 4;
    const rows = Math.ceil(h / (GRID_RADIUS * 0.85)) + 4;

    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1 / zoom;

    for (let r = -rows; r < rows; r++) {
        for (let c = -cols; c < cols; c++) {
            const x = c * GRID_RADIUS + (r % 2 ? GRID_RADIUS / 2 : 0);
            const y = r * (GRID_RADIUS * 0.85);

            ctx.beginPath();
            ctx.arc(x, y, CIRCLE_R, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    ctx.restore();
}

// ------------------------------
// Snap to nearest bubble center
// ------------------------------
function snapToGrid(x, y) {
    let best = { x, y };
    let bestDist = Infinity;

    const testR = 3;
    for (let rr = -testR; rr <= testR; rr++) {
        for (let cc = -testR; cc <= testR; cc++) {

            const gx = cc * GRID_RADIUS + (rr % 2 ? GRID_RADIUS / 2 : 0);
            const gy = rr * (GRID_RADIUS * 0.85);

            const dx = gx - x;
            const dy = gy - y;
            const dist = dx * dx + dy * dy;

            if (dist < bestDist) {
                bestDist = dist;
                best = { x: gx, y: gy };
            }
        }
    }
    return best;
}

// ------------------------------
// Draw Shapes (Green Lines)
// ------------------------------
function drawShapes() {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    shapes.forEach(line => {
        ctx.beginPath();
        ctx.strokeStyle = "#00ff55"; // GREEN LINES
        ctx.lineWidth = 2 / zoom;
        ctx.moveTo(line.a.x, line.a.y);
        ctx.lineTo(line.b.x, line.b.y);
        ctx.stroke();
    });

    ctx.restore();
}

// ------------------------------
// Mouse Handling
// ------------------------------
let mouseIsDown = false;
let lastMouse = { x: 0, y: 0 };

canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left);
    const sy = (e.clientY - rect.top);

    const worldX = (sx - offsetX) / zoom;
    const worldY = (sy - offsetY) / zoom;

    const snapped = snapToGrid(worldX, worldY);
    const screenX = snapped.x * zoom + offsetX;
    const screenY = snapped.y * zoom + offsetY;

    cursorDot.style.left = screenX + "px";
    cursorDot.style.top = screenY + "px";

    if (mouseIsDown && tool === "pan") {
        offsetX += e.clientX - lastMouse.x;
        offsetY += e.clientY - lastMouse.y;
    }

    lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mousedown", e => {
    mouseIsDown = true;

    if (e.button === 2) { // Right-click = pan mode
        tool = "pan";
        return;
    }

    if (tool === "line") {
        const sx = (e.clientX - canvas.getBoundingClientRect().left);
        const sy = (e.clientY - canvas.getBoundingClientRect().top);

        const wx = (sx - offsetX) / zoom;
        const wy = (sy - offsetY) / zoom;

        const snapped = snapToGrid(wx, wy);

        if (!drawingPoint) {
            drawingPoint = snapped; // start
        } else {
            shapes.push({ a: drawingPoint, b: snapped });
            drawingPoint = null;
        }
    }

    if (tool === "erase") {
        const sx = (e.clientX - canvas.getBoundingClientRect().left);
        const sy = (e.clientY - canvas.getBoundingClientRect().top);

        const wx = (sx - offsetX) / zoom;
        const wy = (sy - offsetY) / zoom;

        let best = -1;
        let bestDist = 20 / zoom;

        shapes.forEach((line, i) => {
            const dx = (line.a.x + line.b.x) / 2 - wx;
            const dy = (line.a.y + line.b.y) / 2 - wy;
            const d = Math.hypot(dx, dy);

            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        });

        if (best >= 0) shapes.splice(best, 1);
    }
});

canvas.addEventListener("mouseup", () => {
    mouseIsDown = false;
    if (tool === "pan") tool = "line"; // return to line mode
});

// Disable right-click menu
canvas.addEventListener("contextmenu", e => e.preventDefault());

// ------------------------------
// Zoom
// ------------------------------
canvas.addEventListener("wheel", e => {
    const zoomAmount = -e.deltaY * 0.001;
    const newZoom = zoom * (1 + zoomAmount);
    if (newZoom < 0.2 || newZoom > 6) return;

    zoom = newZoom;
});

// ------------------------------
// View Reset
// ------------------------------
function resetView() {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
}

// ------------------------------
// Save / Load
// ------------------------------
function saveFile() {
    const data = JSON.stringify(shapes);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "geoplayground.json";
    a.click();
}

function loadFile() {
    document.getElementById("fileInput").click();
}

document.getElementById("fileInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
        shapes = JSON.parse(event.target.result);
    };
    reader.readAsText(file);
});

// ------------------------------
// Main Loop
// ------------------------------
function animate() {
    drawGrid();
    drawShapes();
    requestAnimationFrame(animate);
}

animate();
