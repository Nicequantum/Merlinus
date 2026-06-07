import Tesseract from 'tesseract.js';

export async function preprocessImageForOCR(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        const MAX_DIM = 2200;
        if (Math.max(w, h) > MAX_DIM) {
          const scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        let ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, w, h);

        let imageData = ctx.getImageData(0, 0, w, h);
        let data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          data[i] = data[i + 1] = data[i + 2] = gray;
        }

        let minV = 255,
          maxV = 0;
        for (let i = 0; i < data.length; i += 4) {
          minV = Math.min(minV, data[i]);
          maxV = Math.max(maxV, data[i]);
        }
        const range = Math.max(1, maxV - minV);
        for (let i = 0; i < data.length; i += 4) {
          let v = Math.round(((data[i] - minV) / range) * 255);
          v = Math.min(255, Math.max(0, Math.round((v - 128) * 2.2 + 128)));
          data[i] = data[i + 1] = data[i + 2] = v;
        }

        const tempData = new Uint8ClampedArray(data);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            let sum = 0,
              cnt = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const idx = ((y + dy) * w + (x + dx)) * 4;
                sum += tempData[idx];
                cnt++;
              }
            }
            const avg = Math.round(sum / cnt);
            const idx = (y * w + x) * 4;
            data[idx] = data[idx + 1] = data[idx + 2] = avg;
          }
        }

        const sharpData = new Uint8ClampedArray(data);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            const c = data[idx];
            let neigh = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                if (dx || dy) {
                  neigh += data[((y + dy) * w + (x + dx)) * 4];
                }
            const sharpened = Math.min(255, Math.max(0, Math.round(c + (c - Math.round(neigh / 8)) * 1.8)));
            sharpData[idx] = sharpData[idx + 1] = sharpData[idx + 2] = sharpened;
          }
        }
        data.set(sharpData);

        const hist = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
        const totalPix = w * h;
        let sum = 0;
        for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sumB = 0,
          wB = 0,
          varMax = 0,
          threshold = 140;
        for (let t = 0; t < 256; t++) {
          wB += hist[t];
          if (wB === 0) continue;
          const wF = totalPix - wB;
          if (wF === 0) break;
          sumB += t * hist[t];
          const mB = sumB / wB;
          const mF = (sum - sumB) / wF;
          const variance = wB * wF * (mB - mF) * (mB - mF);
          if (variance > varMax) {
            varMax = variance;
            threshold = t;
          }
        }
        for (let i = 0; i < data.length; i += 4) {
          const v = data[i] > threshold ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = v;
        }

        function computeRowVariance(idata: ImageData, ww: number, hh: number): number {
          const rowSums = new Array(hh).fill(0);
          for (let y = 0; y < hh; y++) {
            for (let x = 0; x < ww; x++) {
              if (idata.data[(y * ww + x) * 4] === 0) rowSums[y]++;
            }
          }
          const mean = rowSums.reduce((a, b) => a + b, 0) / hh;
          return rowSums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / hh;
        }

        let bestAngle = 0;
        let bestScore = -Infinity;
        const testAngles: number[] = [];
        for (let a = -6; a <= 6; a += 0.25) testAngles.push(a);
        for (const angle of testAngles) {
          const rad = (angle * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const nw = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
          const nh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));
          const tCan = document.createElement('canvas');
          tCan.width = nw;
          tCan.height = nh;
          const tctx = tCan.getContext('2d', { willReadFrequently: true })!;
          tctx.translate(nw / 2, nh / 2);
          tctx.rotate(rad);
          tctx.drawImage(canvas, -w / 2, -h / 2, w, h);
          const tData = tctx.getImageData(0, 0, nw, nh);
          const score = computeRowVariance(tData, nw, nh);
          if (score > bestScore) {
            bestScore = score;
            bestAngle = angle;
          }
        }

        if (Math.abs(bestAngle) > 0.1) {
          const rad = (bestAngle * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const nw = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
          const nh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));
          const rotCan = document.createElement('canvas');
          rotCan.width = nw;
          rotCan.height = nh;
          const rctx = rotCan.getContext('2d')!;
          rctx.translate(nw / 2, nh / 2);
          rctx.rotate(rad);
          rctx.drawImage(canvas, -w / 2, -h / 2, w, h);
          canvas = rotCan;
          ctx = rctx;
          imageData = ctx.getImageData(0, 0, nw, nh);
          data = imageData.data;
          w = nw;
          h = nh;
          for (let i = 0; i < data.length; i += 4) {
            const v = data[i] > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = v;
          }
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => {
          resolve(blob || file);
        }, 'image/png', 0.95);
      } catch (e) {
        console.warn('Aggressive preprocess failed, using original', e);
        resolve(file);
      }
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export async function runOCR(imageSource: Blob | File, onProgress?: (p: number) => void): Promise<string> {
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    langPath: 'https://tesseract.projectnaptha.com/4.0.0',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  const {
    data: { text },
  } = await worker.recognize(imageSource as File, {
    tessedit_pageseg_mode: '6',
    tessedit_oem: '3',
    tessedit_char_whitelist:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;/-_()[]#%&*+=@\'" \n',
  } as Record<string, string>);
  await worker.terminate();
  return text;
}