const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

// Grid settings
let gridSize = 50;

// Pan & zoom
let offsetX = 0;
let offsetY = 0;
let scale = 1;

let isDragging = false;
let dragStart = { x: 0, y: 0 };

function drawGrid() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw grid
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1 / scale;
    for (let x = 0; x < width / scale; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height / scale);
        ctx.stroke();
    }
    for (let y = 0; y < height / scale; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width / scale, y);
        ctx.stroke();
    }

    // Draw yellow cursor at mouse position (snapped to grid)
    ctx.fillStyle = 'yellow';
    if (mouse.x !== null && mouse.y !== null) {
        let gridX = Math.round((mouse.x - offsetX) / (gridSize * scale)) * gridSize;
        let gridY = Math.round((mouse.y - offsetY) / (gridSize * scale)) * gridSize;
        ctx.beginPath();
        ctx.arc(gridX, gridY, 5 / scale, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

const mouse = { x: null, y: null };

// Mouse move
canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (isDragging) {
        offsetX += e.clientX - dragStart.x;
        offsetY += e.clientY - dragStart.y;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
    }
    drawGrid();
});

// Mouse down/up for dragging
canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
});
canvas.addEventListener('mouseup', () => {
    isDragging = false;
});

// Zoom with mouse wheel
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Adjust offset so zoom is centered on mouse
    const prevScale = scale;
    if (e.deltaY < 0) {
        scale *= zoomFactor;
    } else {
        scale /= zoomFactor;
    }
    offsetX = mouseX - ((mouseX - offsetX) * (scale / prevScale));
    offsetY = mouseY - ((mouseY - offsetY) * (scale / prevScale));

    drawGrid();
}, { passive: false });

// Resize canvas when window changes
window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    drawGrid();
});

// Initial draw
drawGrid();
