// app.js — Shape Builder with floating mode toolbar
(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const GRID_SPACING = 40;
  const GRID_COLOR = '#ffffff';
  const CURSOR_COLOR = '#FFD400';
  const CURSOR_RADIUS = 6;
  const HIT_TOLERANCE = 8;
  const HANDLE_SIZE = 8;
  const ROTATE_HANDLE_OFFSET = 30;

  let width = 0, height = 0, DPR = window.devicePixelRatio || 1;
  let scale = 1, panX = 0, panY = 0;

  let tool = 'draw';
  let currentLineStart = null;
  let shapes = [];
  let nextId = 1;
  let selectedShapeIds = new Set();
  let dragInfo = null;
  let marquee = null;
  let lastPointer = null;

  const btnDraw = document.getElementById('tool-draw');
  const btnSelect = document.getElementById('tool-select');
  const btnDelete = document.getElementById('delete');
  const btnClear = document.getElementById('clear');
  const btnReset = document.getElementById('resetview');
  const status = document.getElementById('status');
  const modeSelect = document.getElementById('mode-select');

  function resizeCanvas() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    render();
  }
  window.addEventListener('resize', resizeCanvas);

  function screenToWorld(sx,sy){return {x:(sx-panX)/scale, y:(sy-panY)/scale};}
  function worldToScreen(wx,wy){return {x:wx*scale+panX, y:wy*scale+panY};}
  function snapToGrid(wx,wy){const g=GRID_SPACING; return {x:Math.round(wx/g)*g, y:Math.round(wy/g)*g};}

  function distPointToSegment(px,py,x1,y1,x2,y2){
    const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1;
    const dot=A*C+B*D,len2=C*C+D*D; let t=len2?dot/len2:-1;
    if(t<0)t=0;else if(t>1)t=1;
    const projx=x1+t*C,projy=y1+t*D; const dx=px-projx,dy=py-projy;
    return Math.hypot(dx,dy);
  }

  function hitTestShapes(wx,wy){
    for(let i=shapes.length-1;i>=0;i--){
      const s=shapes[i];
      if(s.type==='line'){
        if(distPointToSegment(wx,wy,s.x1,s.y1,s.x2,s.y2)<=HIT_TOLERANCE/scale) return {shape:s};
      }
    }
    return null;
  }

  function drawGrid(){
    const g=GRID_SPACING;
    ctx.save();
    ctx.lineWidth=1/scale;
    ctx.strokeStyle=GRID_COLOR;
    const topLeft=screenToWorld(0,0), bottomRight=screenToWorld(width,height);
    const startX=Math.floor(topLeft.x/g)*g,endX=Math.ceil(bottomRight.x/g)*g;
    const startY=Math.floor(topLeft.y/g)*g,endY=Math.ceil(bottomRight.y/g)*g;
    for(let x=startX;x<=endX;x+=g){ctx.beginPath(); ctx.moveTo(x*scale+panX,0); ctx.lineTo(x*scale+panX,height); ctx.stroke();}
    for(let y=startY;y<=endY;y+=g){ctx.beginPath(); ctx.moveTo(0,y*scale+panY); ctx.lineTo(width,y*scale+panY); ctx.stroke();}
    ctx.restore();
  }

  function drawShapes(){
    ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
    shapes.forEach(s=>{
      if(s.type==='line'){
        const p1=worldToScreen(s.x1,s.y1), p2=worldToScreen(s.x2,s.y2);
        ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y);
        ctx.lineWidth=3; ctx.strokeStyle='#ddd'; ctx.stroke();
        if(s.selected){
          const minX=Math.min(s.x1,s.x2), minY=Math.min(s.y1,s.y2), maxX=Math.max(s.x1,s.x2), maxY=Math.max(s.y1,s.y2);
          const pMin=worldToScreen(minX,minY), pMax=worldToScreen(maxX,maxY);
          ctx.strokeStyle=CURSOR_COLOR; ctx.lineWidth=1; ctx.setLineDash([6,6]);
          ctx.strokeRect(pMin.x-6,pMin.y-6,pMax.x-pMin.x+12,pMax.y-pMin.y+12);
          ctx.setLineDash([]);
        }
      }
    });
    ctx.restore();
  }

  function drawCursor(screenX,screenY){
    ctx.save(); ctx.beginPath(); ctx.fillStyle=CURSOR_COLOR;
    ctx.arc(screenX,screenY,CURSOR_RADIUS,0,Math.PI*2); ctx.fill(); ctx.lineWidth=1; ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.stroke(); ctx.restore();
  }

  function render(mouse=null){
    ctx.fillStyle='#000'; ctx.fillRect(0,0,width,height);
    drawGrid(); drawShapes();
    if(mouse){ const snapped=snapToGrid(screenToWorld(mouse.x,mouse.y).x,screenToWorld(mouse.x,mouse.y).y); const s=worldToScreen(snapped.x,snapped.y); drawCursor(s.x,s.y);}
  }

  function setTool(t){
    tool=t; btnDraw.classList.toggle('active',t==='draw'); btnSelect.classList.toggle('active',t==='select');
    status.textContent=`Mode: ${modeSelect.value} | Tool: ${t.toUpperCase()} — Grid ${GRID_SPACING}px — Snap enabled`;
  }

  btnDraw.addEventListener('click',()=>setTool('draw'));
  btnSelect.addEventListener('click',()=>setTool('select'));
  btnDelete.addEventListener('click',()=>{shapes=shapes.filter(s=>!s.selected); selectedShapeIds.clear(); render(lastPointer);});
  btnClear.addEventListener('click',()=>{shapes=[]; selectedShapeIds.clear(); render(lastPointer);});
  btnReset.addEventListener('click',()=>{scale=1; panX=0; panY=0; render(lastPointer);});
  modeSelect.addEventListener('change',()=>setTool(tool));

  canvas.addEventListener('pointermove',e=>{
    const rect=canvas.getBoundingClientRect(); const sx=e.clientX-rect.left,sy=e.clientY-rect.top;
    lastPointer={x:sx,y:sy};
    render(lastPointer);
  });

  canvas.addEventListener('pointerdown',e=>{
    const rect=canvas.getBoundingClientRect(); const sx=e.clientX-rect.left,sy=e.clientY-rect.top;
    const w=screenToWorld(sx,sy); const snapped=snapToGrid(w.x,w.y);
    if(tool==='draw'){
      if(!currentLineStart) currentLineStart=snapped;
      else{ shapes.push({type:'line',id:nextId++,x1:currentLineStart.x,y1:currentLineStart.y,x2:snapped.x,y2:snapped.y,selected:false}); currentLineStart=null;}
      render(lastPointer); return;
    }
    if(tool==='select'){
      const hit=hitTestShapes(w.x,w.y);
      if(hit){ const s=hit.shape; s.selected=true; selectedShapeIds.add(s.id); dragInfo={start:{x:sx,y:sy}}; render(lastPointer); return;}
    }
  });

  canvas.addEventListener('pointerup',()=>{dragInfo=null; currentLineStart=null;});

  function init(){resizeCanvas(); setTool('draw');}
  init();
})();
