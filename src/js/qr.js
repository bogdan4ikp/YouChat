// Lightweight deterministic QR-like matrix + real BarcodeDetector scanner
(function () {
  function drawQrMatrix(canvas, text) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;

    // Use real QR generator if loaded
    if (typeof window.qrcode === 'function') {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const cell = Math.floor((size - 16) / count);
      const offset = Math.floor((size - cell * count) / 2);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#09090b';

      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
          }
        }
      }
      return;
    }

    const modules = 25;
    const cell = Math.floor(size / modules);
    const offset = Math.floor((size - cell * modules) / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#09090b';

    function drawFinder(r0, c0) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (isBorder || isCenter) {
            ctx.fillRect(offset + (c0 + c) * cell, offset + (r0 + r) * cell, cell, cell);
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, modules - 7);
    drawFinder(modules - 7, 0);

    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        const inFinder =
          (r < 8 && c < 8) ||
          (r < 8 && c >= modules - 8) ||
          (r >= modules - 8 && c < 8);
        if (inFinder) continue;

        hash ^= r * 31 + c * 17;
        hash = Math.imul(hash, 16777619);
        if ((hash >>> 0) % 2 === 0) {
          ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
        }
      }
    }
  }

  let scannerStream = null;
  let scanInterval = null;

  function stopScanner() {
    clearInterval(scanInterval);
    scanInterval = null;
    if (scannerStream) {
      scannerStream.getTracks().forEach((t) => t.stop());
      scannerStream = null;
    }
  }

  async function startScanner(videoEl, resultEl, onDetect) {
    stopScanner();
    resultEl.textContent = 'Наведите камеру на QR-код';
    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      videoEl.srcObject = scannerStream;

      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        scanInterval = setInterval(async () => {
          if (videoEl.readyState < 2) return;
          try {
            const codes = await detector.detect(videoEl);
            if (codes.length > 0) {
              const raw = codes[0].rawValue;
              resultEl.textContent = `Найдено: ${raw}`;
              stopScanner();
              if (typeof onDetect === 'function') onDetect(raw);
            }
          } catch {}
        }, 400);
      } else {
        resultEl.textContent = 'Камера активна. Для авто-распознавания используйте Chrome/Android или загрузите фото.';
      }
    } catch {
      resultEl.textContent = 'Нет доступа к камере — загрузите фото QR-кода ниже.';
    }
  }

  window.YouChatQR = {
    drawQrMatrix,
    startScanner,
    stopScanner,
  };
})();
