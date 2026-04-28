// script.js - 최종 통합판 (상하정렬 버그 수정)
document.addEventListener('DOMContentLoaded', () => {
  const pngInput = document.getElementById('pngInput');
  const urlInput = document.getElementById('urlInput');
  const labelInput = document.getElementById('labelInput');
  const fontSizeInput = document.getElementById('fontSize');
  const textAlignSelect = document.getElementById('textAlign');
  const verticalAlignSelect = document.getElementById('verticalAlign');
  const posXInput = document.getElementById('textPosX');
  const posYInput = document.getElementById('textPosY');
  const previewBtn = document.getElementById('previewBtn');
  const generateBtn = document.getElementById('generateBtn');
  const downloadLink = document.getElementById('downloadLink');
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');

  let inputFile = null;
  let authidChunk = null;
  let authorChunk = null;
  let previewData = null;
  let textPos = { x: parseInt(posXInput.value || 101, 10), y: parseInt(posYInput.value || 5, 10) };
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  fontSizeInput.setAttribute('min', '6');
  fontSizeInput.setAttribute('max', '72');

  function hideDownload() { downloadLink.style.display = 'none'; }
  function markDirty() { hideDownload(); }

  function wrapLabelLines(label, maxWidth) {
    const paragraphs = label.replace(/\r\n/g, '\n').split('\n');
    const lines = [];

    for (const paragraph of paragraphs) {
      if (paragraph === '') {
        lines.push('');
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            lines.push(word);
            currentLine = '';
          }
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine !== '') lines.push(currentLine);
    }

    return lines.length ? lines : [''];
  }

  // --- PNG 입력 시 authid/author 읽기 ---
  pngInput.addEventListener('change', async (e) => {
    inputFile = e.target.files[0] || null;
    authidChunk = null;
    authorChunk = null;
    if (!inputFile) { markDirty(); return; }
    const data = new Uint8Array(await inputFile.arrayBuffer());
    let pos = 8;
    while (pos + 8 <= data.length) {
      const length = (data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3];
      const type = String.fromCharCode(...data.slice(pos+4,pos+8));
      const chunkData = data.slice(pos+8,pos+8+length);
      if (type==='zTXt'){
        const nullIdx = chunkData.indexOf(0);
        const key = String.fromCharCode(...chunkData.slice(0,nullIdx));
        if(key==='authid') authidChunk = chunkData;
        if(key==='author') authorChunk = chunkData;
      }
      pos += length + 12;
    }
    markDirty();
  });

  // --- 미리보기 그리기 ---
  function drawPreview() {
    hideDownload();
    const url = urlInput.value.trim();
    const label = labelInput.value || '';
    const fontSize = parseInt(fontSizeInput.value||'25',10);
    const textAlign = textAlignSelect.value;
    const verticalAlign = verticalAlignSelect.value;

    const qrCanvas = document.createElement('canvas');
    QRCode.toCanvas(qrCanvas, url||'', {width:92,margin:0,errorCorrectionLevel:'M'}, (err)=>{
      ctx.fillStyle='#fefefe';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(qrCanvas,2,Math.floor((canvas.height-92)/2));
      ctx.fillStyle='#000000';
      ctx.font = `${fontSize}px NanumBarunGothic`;
      ctx.textAlign=textAlign;
      ctx.textBaseline='top';

      const textAreaX = 96;
      const textAreaWidth = canvas.width - textAreaX - 4;

      const lines = wrapLabelLines(label, textAreaWidth);

      const lineHeight = fontSize+2;
      const totalHeight = lines.length*lineHeight;
      let startY = textPos.y;

      // --- 상하정렬 버그 수정 ---
      if(verticalAlign==='middle') startY = Math.round((canvas.height-totalHeight)/2)+textPos.y;
      else if(verticalAlign==='bottom') startY = canvas.height-totalHeight-2+textPos.y;
      // top: 그대로 textPos.y 사용

      for(let i=0;i<lines.length;i++){
        const y=startY+i*lineHeight;
        let drawX=textPos.x;
        if(textAlign==='center') drawX=textPos.x+(textAreaWidth/2);
        else if(textAlign==='right') drawX=textPos.x+textAreaWidth;
        ctx.fillText(lines[i],drawX,y);
      }

      // 텍스트 박스 표시
      const boxX=textPos.x-2, boxY=startY-2, boxW=textAreaWidth+4, boxH=totalHeight+4;
      ctx.strokeStyle='red';
      ctx.lineWidth=1;
      ctx.strokeRect(boxX,boxY,boxW,boxH);

      posXInput.value = Math.round(textPos.x);
      posYInput.value = Math.round(startY);

      const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
      previewData = canvasTo2BitBW(imgData);
      canvas.style.cursor = dragging ? 'grabbing':'move';
    });
  }

  previewBtn.addEventListener('click',()=>{ drawPreview(); });

  generateBtn.addEventListener('click',()=>{
    if(!previewData) return alert('먼저 미리보기를 실행하세요.');
    const blob = createPNG2Bit(previewData,canvas.width,canvas.height,authidChunk,authorChunk);
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = getDefaultFileName(inputFile);
    downloadLink.style.display='inline';
  });

  [urlInput,labelInput,fontSizeInput,textAlignSelect,verticalAlignSelect].forEach(el=>el.addEventListener('input',markDirty));

  posXInput.addEventListener('input',()=>{
    dragging=false;
    const v=parseInt(posXInput.value||'0',10);
    if(!Number.isNaN(v)) textPos.x=v;
    drawPreview();
  });
  posYInput.addEventListener('input',()=>{
    dragging=false;
    const v=parseInt(posYInput.value||'0',10);
    if(!Number.isNaN(v)) textPos.y=v;
    drawPreview();
  });

  fontSizeInput.addEventListener('input',()=>{ markDirty(); drawPreview(); });

  // 드래그 핸들
  canvas.addEventListener('mousedown',(e)=>{
    const rect=canvas.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const y=e.clientY-rect.top;
    const fontSize=parseInt(fontSizeInput.value||'25',10);
    const textAreaWidth=canvas.width-96-4;

    ctx.font=`${fontSize}px NanumBarunGothic`;
    const label=labelInput.value||'';
    const linesCandidate = wrapLabelLines(label, textAreaWidth);
    const totalHeight=linesCandidate.length*(fontSize+2);

    let startY=textPos.y;
    const verticalAlign = verticalAlignSelect.value;
    if(verticalAlign==='middle') startY=Math.round((canvas.height-totalHeight)/2)+textPos.y;
    else if(verticalAlign==='bottom') startY=canvas.height-totalHeight-2+textPos.y;

    if(x>=textPos.x-2 && x<=textPos.x+textAreaWidth+2 && y>=startY-2 && y<=startY+totalHeight+2){
      dragging=true;
      dragOffset.x=x-textPos.x;
      dragOffset.y=y-startY;
      canvas.style.cursor='grabbing';
    }
  });

  window.addEventListener('mousemove',(e)=>{
    if(!dragging) return;
    const rect=canvas.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const y=e.clientY-rect.top;
    textPos.x=Math.round(x-dragOffset.x);
    textPos.y=Math.round(y-dragOffset.y);
    posXInput.value=textPos.x;
    posYInput.value=textPos.y;
    markDirty();
    drawPreview();
  });

  window.addEventListener('mouseup',()=>{
    if(dragging){ dragging=false; canvas.style.cursor='move'; }
  });

  textAlignSelect.addEventListener('change',()=>{
    dragging=false; textPos.x=101; textPos.y=5; markDirty(); drawPreview();
  });
  verticalAlignSelect.addEventListener('change',()=>{
    dragging=false; textPos.x=101; textPos.y=5; markDirty(); drawPreview();
  });

  // --- PNG 생성 유틸 & 헬퍼 (기존 작업용 그대로) ---
  function canvasTo2BitBW(imgData){
    const w=imgData.width,h=imgData.height;
    const packed=new Uint8Array(h*Math.ceil(w/4));
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x+=4){
        let byte=0;
        for(let i=0;i<4;i++){
          const idx=x+i;
          let val=0;
          if(idx<w){
            const j=(y*w+idx)*4;
            const lum=0.2126*imgData.data[j]+0.7152*imgData.data[j+1]+0.0722*imgData.data[j+2];
            val=lum>128?0:3;
          }
          byte|=val<<((3-i)*2);
        }
        packed[y*Math.ceil(w/4)+Math.floor(x/4)]=byte;
      }
    }
    return {width:w,height:h,pixels:packed};
  }

  const crcTable=(function(){const t=new Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(buf){let crc=-1;for(let i=0;i<buf.length;i++) crc=(crc>>>8)^crcTable[(crc^buf[i])&0xff];return(crc^-1)>>>0;}

  function createPNG2Bit(dataObj,w,h,authChunk,authorChunk){
    const palette=new Uint8Array([255,255,255,0,0,0,0,0,0,0,0,0]);
    const chunks=[];
    function createChunk(type,data){
      const len=new Uint8Array(4);
      len[0]=(data.length>>>24)&0xff; len[1]=(data.length>>>16)&0xff; len[2]=(data.length>>>8)&0xff; len[3]=data.length&0xff;
      const chunk=new Uint8Array(4+4+data.length+4);
      chunk.set(len,0);
      for(let i=0;i<4;i++) chunk[4+i]=type.charCodeAt(i);
      chunk.set(data,8);
      const crc=crc32(chunk.slice(4,8+data.length));
      chunk[8+data.length]=(crc>>>24)&0xff;
      chunk[9+data.length]=(crc>>>16)&0xff;
      chunk[10+data.length]=(crc>>>8)&0xff;
      chunk[11+data.length]=crc&0xff;
      return chunk;
    }

    chunks.push(new Uint8Array([137,80,78,71,13,10,26,10]));
    const ihdr=new Uint8Array(13);
    ihdr[0]=(w>>>24)&0xff; ihdr[1]=(w>>>16)&0xff; ihdr[2]=(w>>>8)&0xff; ihdr[3]=w&0xff;
    ihdr[4]=(h>>>24)&0xff; ihdr[5]=(h>>>16)&0xff; ihdr[6]=(h>>>8)&0xff; ihdr[7]=h&0xff;
    ihdr[8]=2; ihdr[9]=3; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
    chunks.push(createChunk('IHDR',ihdr));
    chunks.push(createChunk('PLTE',palette));
    if(authChunk) chunks.push(createChunk('zTXt',authChunk));
    if(authorChunk) chunks.push(createChunk('zTXt',authorChunk));

    const rowBytes=Math.ceil(w/4);
    const rawData=new Uint8Array(h*(1+rowBytes));
    for(let y=0;y<h;y++){
      rawData[y*(1+rowBytes)]=0;
      rawData.set(dataObj.pixels.slice(y*rowBytes,(y+1)*rowBytes),y*(1+rowBytes)+1);
    }
    const compressed=pako.deflate(rawData);
    chunks.push(createChunk('IDAT',compressed));
    chunks.push(createChunk('IEND',new Uint8Array(0)));

    const totalLen=chunks.reduce((a,b)=>a+b.length,0);
    const png=new Uint8Array(totalLen);
    let offset=0;
    for(const c of chunks){png.set(c,offset); offset+=c.length;}
    return new Blob([png],{type:'image/png'});
  }

  function getDefaultFileName(inputFile){
    const now=new Date();
    const yyyy=now.getFullYear().toString().padStart(4,'0');
    const mm=(now.getMonth()+1).toString().padStart(2,'0');
    const dd=now.getDate().toString().padStart(2,'0');
    const hh=now.getHours().toString().padStart(2,'0');
    const min=now.getMinutes().toString().padStart(2,'0');
    const ss=now.getSeconds().toString().padStart(2,'0');

    if(!inputFile) return `chat_${yyyy}${mm}${dd}_${hh}${min}${ss}_user.png`;
    const raw=inputFile.name.split('/').pop().split('\\').pop();
    const m=raw.match(/^chat_\d{8}_\d{6}_(.+)\.png$/);
    const nick=m? m[1]: raw.replace(/\.[^/.]+$/,'');
    return `chat_${yyyy}${mm}${dd}_${hh}${min}${ss}_${nick}.png`;
  }

  ctx.fillStyle='#fefefe';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#ccc';
  ctx.strokeRect(0,0,canvas.width,canvas.height);
  hideDownload();
});
