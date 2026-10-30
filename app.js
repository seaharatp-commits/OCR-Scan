import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.mjs';

const EASY_OCR_URL = 'http://127.0.0.1:4174';
const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const attachmentArea = document.querySelector('#attachment-area');
const attachmentList = document.querySelector('#attachment-list');
const fileCount = document.querySelector('#file-count');
const scanButton = document.querySelector('#scan-button');
const progressArea = document.querySelector('#progress-area');
const progressTitle = document.querySelector('#progress-title');
const progressDetail = document.querySelector('#progress-detail');
const progressFill = document.querySelector('#progress-fill');
const resultArea = document.querySelector('#result-area');
const resultText = document.querySelector('#result-text');
const copyButton = document.querySelector('#copy-button');
const downloadButton = document.querySelector('#download-button');
const clearButton = document.querySelector('#clear-button');
const toast = document.querySelector('#toast');

const MAX_FILE_SIZE = 40 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2600;
let files = [];
let busy = false;
let toastTimer;

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  return file.type.startsWith('image/') && ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext);
}

function formatSize(size) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function drawAttachments() {
  attachmentArea.hidden = files.length === 0;
  fileCount.textContent = `${files.length} ไฟล์`;
  scanButton.disabled = busy || files.length === 0;
  clearButton.disabled = busy;
  fileInput.disabled = busy;
  attachmentList.replaceChildren();

  files.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'attachment-item';
    const thumb = document.createElement('span');
    thumb.className = 'attachment-thumb';
    if (entry.previewUrl) {
      const image = document.createElement('img');
      image.src = entry.previewUrl;
      image.alt = '';
      thumb.append(image);
    } else {
      thumb.textContent = 'PDF';
      thumb.style.color = '#a55343';
      thumb.style.background = '#fbefeb';
    }
    const name = document.createElement('span');
    name.className = 'attachment-name';
    name.title = entry.file.name;
    name.textContent = entry.file.name;
    const size = document.createElement('span');
    size.className = 'attachment-size';
    size.textContent = formatSize(entry.file.size);
    const remove = document.createElement('button');
    remove.className = 'remove-file';
    remove.type = 'button';
    remove.setAttribute('aria-label', `นำ ${entry.file.name} ออก`);
    remove.textContent = '×';
    remove.disabled = busy;
    remove.addEventListener('click', () => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      files.splice(index, 1);
      drawAttachments();
    });
    row.append(thumb, name, size, remove);
    attachmentList.append(row);
  });
}

function addFiles(selected) {
  if (busy) return;
  let count = 0;
  for (const file of selected) {
    if (file.size > MAX_FILE_SIZE) {
      showToast(`${file.name} มีขนาดเกิน 40 MB`);
      continue;
    }
    if (!isPdf(file) && !isImage(file)) {
      showToast(`ยังไม่รองรับ ${file.name} — เลือก PDF, JPG, PNG, WEBP, BMP หรือ GIF`);
      continue;
    }
    files.push({ file, previewUrl: isPdf(file) ? '' : URL.createObjectURL(file) });
    count += 1;
  }
  drawAttachments();
  if (count) showToast(`เพิ่มไฟล์แล้ว ${count} รายการ`);
}

function setProgress(percent, title, detail) {
  progressArea.hidden = false;
  progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressTitle.textContent = title;
  progressDetail.textContent = detail;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getOcrEngine() {
  let setup;
  try {
    const localStatus = await fetch('/api/easyocr/status', { cache: 'no-store' });
    if (!localStatus.ok || !localStatus.headers.get('content-type')?.includes('application/json')) return 'tesseract';
    setup = await localStatus.json();
  } catch {
    return 'tesseract';
  }
  if (!setup.available) return 'tesseract';

  let backendFound = false;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      const response = await fetch(`${EASY_OCR_URL}/health`, { cache: 'no-store' });
      if (response.ok) {
        backendFound = true;
        const health = await response.json();
        if (health.ready) return 'easyocr';
        if (health.error) {
          showToast('EasyOCR เปิดไม่สำเร็จ ใช้ OCR ในเบราว์เซอร์แทน');
          return 'tesseract';
        }
        setProgress(2, 'กำลังเตรียม EasyOCR', 'กำลังโหลดโมเดลไทยและอังกฤษครั้งแรก');
        await delay(1000);
        continue;
      }
    } catch {
      // The local Python service may need a moment to start.
    }
    await delay(500);
  }

  if (!backendFound) return 'tesseract';
  setProgress(2, 'กำลังเตรียม EasyOCR', 'โหลดโมเดลครั้งแรกอาจใช้เวลาหลายนาที');
  for (let attempt = 0; attempt < 900; attempt += 1) {
    try {
      const response = await fetch(`${EASY_OCR_URL}/health`, { cache: 'no-store' });
      const health = await response.json();
      if (health.ready) return 'easyocr';
      if (health.error) {
        showToast('EasyOCR เปิดไม่สำเร็จ ใช้ OCR ในเบราว์เซอร์แทน');
        return 'tesseract';
      }
      setProgress(2, 'กำลังเตรียม EasyOCR', 'กำลังโหลดโมเดลสำเร็จรูปครั้งแรก');
    } catch {
      showToast('ติดต่อ EasyOCR ไม่ได้ ใช้ OCR ในเบราว์เซอร์แทน');
      return 'tesseract';
    }
    await delay(1000);
  }
  showToast('EasyOCR ใช้เวลาเตรียมนาน ใช้ OCR ในเบราว์เซอร์แทน');
  return 'tesseract';
}

async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('แปลงภาพเพื่อ OCR ไม่สำเร็จ')), 'image/png');
  });
}

async function recognizeWithEasyOcr(canvas) {
  const blob = await canvasToBlob(canvas);
  const response = await fetch(`${EASY_OCR_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: blob,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'EasyOCR อ่านภาพไม่สำเร็จ');
  return result.text || '';
}

async function imageCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function pdfCanvas(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const original = page.getViewport({ scale: 1 });
  const scale = Math.min(2, MAX_IMAGE_EDGE / Math.max(original.width, original.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
  page.cleanup();
  return canvas;
}

async function scanDocuments() {
  if (busy || !files.length) return;
  busy = true;
  drawAttachments();
  resultArea.hidden = false;
  resultText.value = '';
  copyButton.disabled = true;
  downloadButton.disabled = true;
  setProgress(1, 'กำลังตรวจสอบ OCR', 'โปรดรอสักครู่');

  let worker;
  let engine = 'tesseract';
  const output = [];
  let activeFileIndex = 0;
  let currentPage = 0;
  let pageCount = 1;

  try {
    engine = await getOcrEngine();
    if (engine === 'tesseract') {
      if (!window.Tesseract?.createWorker) throw new Error('โหลด OCR ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า');
      showToast('กำลังใช้ OCR ในเบราว์เซอร์ หากต้องการ EasyOCR ให้รัน ติดตั้ง-EasyOCR.bat ก่อน');
      worker = await window.Tesseract.createWorker(['tha', 'eng'], 1, {
        logger: message => {
          if (message.status === 'recognizing text' && Number.isFinite(message.progress)) {
            const part = (currentPage + message.progress) / Math.max(pageCount, 1);
            const overall = ((activeFileIndex + part) / files.length) * 100;
            setProgress(overall, 'กำลังอ่านข้อความ…', `ไฟล์ ${activeFileIndex + 1} จาก ${files.length}${pageCount > 1 ? ` · หน้า ${currentPage + 1} จาก ${pageCount}` : ''}`);
          }
        },
      });
    }

    for (activeFileIndex = 0; activeFileIndex < files.length; activeFileIndex += 1) {
      const file = files[activeFileIndex].file;
      const fileLabel = `ไฟล์ ${activeFileIndex + 1} จาก ${files.length}: ${file.name}`;
      const recognize = async canvas => {
        if (engine === 'easyocr') return recognizeWithEasyOcr(canvas);
        const result = await worker.recognize(canvas);
        return result.data.text.trim();
      };
      let text = '';

      if (isPdf(file)) {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        pageCount = pdf.numPages;
        const pages = [];
        for (currentPage = 0; currentPage < pageCount; currentPage += 1) {
          setProgress(((activeFileIndex + currentPage / pageCount) / files.length) * 100, `กำลังอ่านข้อความด้วย ${engine === 'easyocr' ? 'EasyOCR' : 'OCR ในเบราว์เซอร์'}`, `${fileLabel} · หน้า ${currentPage + 1} จาก ${pageCount}`);
          const canvas = await pdfCanvas(pdf, currentPage + 1);
          const pageText = await recognize(canvas);
          pages.push(`หน้า ${currentPage + 1}\n${pageText}`);
          canvas.width = 0;
          canvas.height = 0;
          text = pages.join('\n\n');
          resultText.value = [...output, `===== ${file.name} =====\n${text}`].join('\n\n');
        }
        await pdf.destroy();
      } else {
        currentPage = 0;
        pageCount = 1;
        setProgress((activeFileIndex / files.length) * 100, `กำลังอ่านข้อความด้วย ${engine === 'easyocr' ? 'EasyOCR' : 'OCR ในเบราว์เซอร์'}`, fileLabel);
        const canvas = await imageCanvas(file);
        text = await recognize(canvas);
        canvas.width = 0;
        canvas.height = 0;
      }

      output.push(`===== ${file.name} =====\n${text}`);
      resultText.value = output.join('\n\n');
      resultText.scrollTop = resultText.scrollHeight;
      copyButton.disabled = !resultText.value.trim();
      downloadButton.disabled = !resultText.value.trim();
      setProgress(((activeFileIndex + 1) / files.length) * 100, 'เสร็จแล้ว', `อ่านข้อความครบ ${activeFileIndex + 1} จาก ${files.length} ไฟล์`);
    }
    showToast(`อ่านข้อความเสร็จแล้วด้วย ${engine === 'easyocr' ? 'EasyOCR' : 'OCR ในเบราว์เซอร์'}`);
  } catch (error) {
    console.error(error);
    showToast('อ่านไฟล์ไม่สำเร็จ ลองใช้ภาพที่ชัดขึ้นหรือตรวจสอบการติดตั้ง OCR');
    progressTitle.textContent = 'สแกนไม่สำเร็จ';
    progressDetail.textContent = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
  } finally {
    if (worker) await worker.terminate();
    busy = false;
    drawAttachments();
    copyButton.disabled = !resultText.value.trim();
    downloadButton.disabled = !resultText.value.trim();
  }
}

function saveText() {
  const blob = new Blob([resultText.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'OCRScan-result.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

fileInput.addEventListener('change', event => {
  addFiles(event.target.files);
  fileInput.value = '';
});
dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.add('dragging'); });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.remove('dragging'); });
}
dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
scanButton.addEventListener('click', scanDocuments);
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultText.value);
    showToast('คัดลอกข้อความแล้ว');
  } catch {
    resultText.focus(); resultText.select(); document.execCommand('copy'); showToast('คัดลอกข้อความแล้ว');
  }
});
downloadButton.addEventListener('click', saveText);
resultText.addEventListener('input', () => {
  const hasText = Boolean(resultText.value.trim());
  copyButton.disabled = !hasText; downloadButton.disabled = !hasText;
});
clearButton.addEventListener('click', () => {
  if (busy) return;
  files.forEach(entry => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); });
  files = []; resultText.value = ''; resultArea.hidden = true; progressArea.hidden = true; drawAttachments();
});

drawAttachments();
