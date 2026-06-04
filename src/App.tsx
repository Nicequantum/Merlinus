import React, { useState, useEffect } from 'react';
import { Camera, Settings, ArrowLeft, Plus, Copy, RefreshCw, Trash2, Edit2 } from 'lucide-react';
import Tesseract from 'tesseract.js';

// Types
interface ExtractedData {
  codes: string[];
  guidedTests: string[];
  measurements: Array<{ label: string; value: string }>;
  components: string[];
  circuits: string[];
}

interface RepairLine {
  id: string;
  lineNumber: number;
  description: string;
  customerConcern: string;
  technicianNotes: string;
  xentryImages: Array<{ id: string; dataUrl: string; name: string }>;
  xentryOcrTexts?: string[];  // raw OCR from diagnostic photos for AI
  extractedData?: ExtractedData;
  warrantyStory?: string;
}

interface RepairOrder {
  id: string;
  roNumber: string;
  vehicle: {
    vin: string;
    year: string;
    make: string;
    model: string;
    mileageIn: string;
    mileageOut: string;
  };
  customer: {
    name: string;
  };
  complaints: string[];
  // RO-level Xentry saved data / Quick Test images (scanned on second page after RO)
  xentryImages?: Array<{ id: string; dataUrl: string; name: string }>;
  xentryOcrTexts?: string[];
  repairLines: RepairLine[];
  createdAt?: string;
}

// Image preprocessing for reliable OCR (grayscale + contrast boost + binarize). Greatly improves Tesseract on paper ROs and Xentry screenshots.
async function preprocessImageForOCR(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Scale down very large images for speed/accuracy balance (Tesseract likes ~150-300 DPI equiv)
        const MAX_DIM = 1600;
        let w = img.width;
        let h = img.height;
        if (Math.max(w, h) > MAX_DIM) {
          const scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        // Grayscale + aggressive contrast + threshold (tuned for docs/screens)
        for (let i = 0; i < data.length; i += 4) {
          let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          // Contrast stretch around mid
          gray = Math.min(255, Math.max(0, (gray - 120) * 1.95 + 120));
          // Binarize - slightly adaptive feel by local-ish threshold
          const bin = gray > 145 ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = bin;
        }
        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
          resolve(blob || file);
        }, 'image/png', 0.92);
      } catch (e) {
        resolve(file);
      }
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// Helper to run Tesseract with good settings for forms / tables / screens. Accepts preprocessed blob.
async function runOCR(imageSource: Blob | File, onProgress?: (p: number) => void): Promise<string> {
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    }
  });
  // PSM 6 = assume a single uniform block of text (good for RO complaint sections and Xentry data blocks)
  const { data: { text } } = await worker.recognize(imageSource as any, { 
    tessedit_pageseg_mode: '6' as any
  });
  await worker.terminate();
  return text;
}

// === Encrypted xAI Grok API key handling (client-side AES-GCM + PBKDF2) ===
// Never stores plain key in localStorage. Requires user passphrase to unlock per session.
// "Selection" supported via multiple named slots in future; current: primary encrypted key.

const ENC_KEY_STORAGE = 'benztech_grok_key_enc_v1';
const PLAIN_KEY_STORAGE = 'maybachtech_grok_key'; // legacy migration only (pre-encryption)

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptApiKey(plain: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  const payload = {
    v: 1,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ct)))
  };
  return JSON.stringify(payload);
}

async function decryptApiKey(payloadJson: string, passphrase: string): Promise<string> {
  const p = JSON.parse(payloadJson);
  const salt = Uint8Array.from(atob(p.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(p.iv), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(p.ct), c => c.charCodeAt(0));
  const key = await deriveKey(passphrase, salt);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}

async function loadEncryptedKey(passphrase?: string): Promise<string> {
  try {
    const enc = localStorage.getItem(ENC_KEY_STORAGE);
    if (enc && passphrase) {
      return await decryptApiKey(enc, passphrase);
    }
    // legacy plain (one-time migrate on save)
    const plain = localStorage.getItem(PLAIN_KEY_STORAGE);
    if (plain && !enc) return plain;
    return '';
  } catch (e) {
    console.warn('Key decrypt failed (bad passphrase?)', e);
    return '';
  }
}

async function saveEncryptedKey(plain: string, passphrase: string) {
  if (!plain) {
    localStorage.removeItem(ENC_KEY_STORAGE);
    localStorage.removeItem(PLAIN_KEY_STORAGE);
    return;
  }
  const enc = await encryptApiKey(plain, passphrase);
  localStorage.setItem(ENC_KEY_STORAGE, enc);
  localStorage.removeItem(PLAIN_KEY_STORAGE); // clean legacy
}

// Full system prompt - Mercedes-Benz (incl. Maybach) master technician warranty story requirements
const SYSTEM_PROMPT = `Act as a senior Mercedes-Maybach master technician with 18 years experience writing warranty stories that always pass review.
Strict rules you must follow:

Always mention that a battery charger was connected during the entire repair.
Always state that an initial Quick Test was performed using XENTRY.
Include a test drive with mileage in and mileage out (use realistic numbers like 12 miles in, 15 miles out).
Clearly show the 3 C’s: Customer Complaint/Concern, Cause, and Correction. Use the actual customer complaints labeled A/B/C from the RO and tie the work to them.
Always perform and document a final Quick Test after repairs.
End with a final verification drive to confirm the repair.
Reference standard test values and common issues for the model/mileage when they align with data (e.g. "fuel rail pressure held at 220-245 bar per spec"). Incorporate any provided smart defaults / extracted measurements naturally.

Use the following example as the GOLD STANDARD for technical depth, specificity (exact module names like MRG1AMGV8, adaptation values like ZGSTH +1.05%, fra/fra2, ora/ora2, lambda, guided test results, pressures, injector IMA codes, recoding steps like HW3 to 32 2D, data before/after, etc.), natural first-person language, and professional detail level:

Customer presented vehicle with check engine light illuminated and reports of intermittent rough idle and hesitation during acceleration. Diagnostic scan confirmed DTCs P0171 (system too lean, bank 1) and P0174 (system too lean, bank 2). Performed initial quick test via XENTRY, revealing no additional faults in other modules. Conducted smoke test on intake system to rule out vacuum leaks; no leaks detected, confirming issue isolated to fuel delivery. Reviewed injector adaptation data in motor electronics module (MRG1AMGV8), noting cylinder-specific smoothing corrections (ZGSTH) with significant deviations: cylinder 3 at +1.05% and cylinder 7 at +1.34% (indicating under-delivery, ECU compensating by adding fuel), while cylinders 2 and 8 showed -0.55% and -1.32% respectively (indicating over-delivery, ECU reducing fuel). Global fuel rail adaptations (fra/fra2) exceeded 1.0 (1.074707 and 1.028168), supporting overall lean condition, and lambda offsets (ora/ora2) displayed split readings with bank 1 leaning positive (0.125000%) and bank 2 trending rich (-0.179688%), consistent with mixed cylinder contributions averaging to lean banks. Ran guided high-pressure fuel system tests on both banks per XENTRY protocol; rail pressure held stable at idle (200-250 bar) and under load (up to 2000+ bar), with no external leaks, but leak-off rates on cylinders 3 and 7 exceeded specifications, suggesting internal injector faults or carbon buildup. Cleared all injector adaptation values to reset baseline, then performed Mercedes-Benz prescribed drive cycle: cold start, idle warm-up, steady cruise at 50-60 mph, wide-open throttle bursts to 4000 RPM, and stop-and-go simulation. Post-drive data logging showed trims re-establishing similar patterns, with cylinders 3 and 7 persistently positive and contributing to the lean DTCs, confirming hardware failure rather than software drift. Replaced injectors for cylinders 3 (bank 1, third from front) and 7 (bank 2, third from front) with new Bosch piezo units (calibration codes 322DB and 332FN), entered updated IMA codes into the ECU (updating HW3 to 32 2D and HW7 to 34 34), and re-encoded SE cluster. Cleared adaptations again and performed final verification drive cycle; post-replacement data showed improved global adaptations nearing 1.0 (fra at 1.011810 and fra2 at 0.986298), lambda offsets tightening (ora at 0.242188% and ora2 at -0.554688%), and cylinder trims shifting with cylinder 3 flipping to -3.07% (over-delivery correction) and cylinder 7 at -1.61% (mild over-delivery), while overall spread narrowed with cylinders 1 at +1.57%, 2 at +0.76%, 4 at +0.66%, 5 at -0.01%, 6 at +2.11%, and 8 at -0.44%, and DTCs did not recur after adaptation learning. Vehicle released with smooth idle, no hesitation, and check engine light extinguished. Warranty labor includes diagnostics, smoke test, guided fuel system tests, adaptation resets, injector replacement, recoding, and multiple road test verifications.

Vary the writing style and structure naturally using one of the provided templates so stories do not sound identical, but ALWAYS cover the mandatory requirements above and match the example's technical depth and detail using the actual data provided in the user message (Xentry codes, adaptations, Guided Tests, pressures, etc.). Write in natural first-person technician language. Sound like a real tech who did the work. Structure every story using the 3 C's. Punch times must logically match the work described. Use realistic mileage numbers for test drives. Write only the warranty story for this specific line. Make it sound completely human.`;

// 12 varied template structures for natural variety (AI picks one per generation via prompt)
const STORY_TEMPLATES = [
  "Chronological narrative: Open with customer presentation, symptoms, and initial DTCs from Quick Test. Detail the diagnostic path, data analysis, and tests performed. Identify cause. Describe correction steps including parts and coding. Document final Quick Test results. End with verification drive confirmation and battery charger mention.",
  "Data-first technical deep-dive: Lead with specific Xentry data points, adaptations (e.g. ZGSTH, fra/fra2, ora), module names, and Guided Test results. Explain how the data reveals the cause. Cover initial and final Quick Tests, test drive mileages, 3 C's woven in, repair details, and verification drive.",
  "3 C's explicit structure: Clearly state 'Customer Complaint: ... Cause: ... Correction: ...' early. Then provide supporting test data, initial Quick Test, drive cycles, final Quick Test, and verification. Integrate battery charger and realistic mileages naturally.",
  "Step-by-step diagnostic journey: 'I began by connecting the battery charger and performing initial XENTRY Quick Test...' Sequence through tests, data review, cause determination, repair actions, final Quick Test, verification drive. Use varied sentence lengths for flow.",
  "Before-and-after data comparison: Detail pre-repair data (adaptations, pressures, trims) from initial Quick Test and Guided Tests. Describe correction. Then post-repair data from final Quick Test showing improvement. Include test drives with in/out mileage, 3 C's, battery charger mention.",
  "Module and adaptation focused: Dive deep into specific ECU/module (e.g. MRG1AMGV8), cylinder trims (ZGSTH values), global adaptations, lambda offsets. Tie data to cause. Cover Quick Tests, drive cycle description with mileages, repair (injector replacement + IMA coding), final verification.",
  "Test sequence and drive cycle emphasis: Emphasize the sequence of initial Quick Test, smoke/guided tests, adaptation reset, prescribed drive cycle (cold start, cruise, WOT, etc. with realistic speeds/miles), final Quick Test, verification drive. Weave in data and 3 C's.",
  "Evidence-based cause deduction: List multiple data points (DTCs, adaptations, leak-off rates, pressures) as evidence building to the root cause (e.g. specific injectors). Then correction, tests, drives, battery charger, final confirmation.",
  "Repair execution and recoding focus: After brief diagnosis, detail the physical repair (which cylinders, part numbers, calibration codes), ECU recoding steps (HWx to XX XX), SE cluster, then post-repair Quick Test and verification drive data proving success.",
  "Customer symptom to root cause narrative: Start with how symptoms manifested (idle, hesitation during accel). Link to initial Quick Test DTCs. Use data to deduce cause. Detail fix, final tests and drives. End with customer vehicle released smooth.",
  "Warranty labor documentation style: Frame as professional record: Initial Quick Test and charger connection. Diagnostic steps and findings with exact values. Cause and 3 C's. Replacement and coding actions. Final Quick Test and verification drive. Summarize labor operations.",
  "Conversational tech recap: Sound like explaining the job to a fellow tech over coffee: 'Customer comes in with CEL and rough idle...' Describe the process, key data points that sealed the cause, what was replaced and coded, the drives, final confirmation that it was fixed."
];

// Smart Mercedes-Benz knowledge: common issues + standard test values by model family + mileage bands.
// Used client-side to suggest + prefill when vehicle/mileage known and after diagnostic photo uploads.
const MERCEDES_KB: Record<string, {
  families: string[];
  mileageBands: Array<{
    min: number; max: number;
    commonIssues: string[];
    standardTests: Array<{ label: string; spec: string; note?: string }>;
  }>;
}> = {
  'GLE': {
    families: ['GLE', 'GLS', 'GLC'],
    mileageBands: [
      { min: 0, max: 30000, commonIssues: ['Software updates / SCN coding', 'Battery / IBS issues', 'Sensor faults (TPMS, radar)'], standardTests: [
        { label: 'Battery voltage (resting)', spec: '12.6-12.8 V', note: 'Charger connected during diag' },
        { label: 'Fuel rail pressure idle (M256/M177)', spec: '200-280 bar' },
      ]},
      { min: 30001, max: 75000, commonIssues: ['High pressure fuel injectors (lean codes P0171/P0174)', 'Turbo actuator / boost leaks', 'ABC or Airmatic suspension leaks', 'Crankshaft position sensor'], standardTests: [
        { label: 'Fuel rail pressure idle', spec: '200-250 bar' },
        { label: 'Leak-off rate (injectors)', spec: '< 2 ml / 30s per cyl per XENTRY' },
        { label: 'Rail pressure under load', spec: 'up to 2000+ bar stable' },
        { label: 'Injector adaptation ZGSTH', spec: 'typically ±1.0% max recommended' },
      ]},
      { min: 75001, max: 150000, commonIssues: ['Injector failure / carbon', 'Timing chain stretch (some M276)', 'Transmission conductor plate / valve body', 'EGR cooler / AdBlue'], standardTests: [
        { label: 'Compression test', spec: 'per XENTRY spec ~12-15 bar' },
        { label: 'Chain stretch measurement', spec: 'see XENTRY guided' },
      ]}
    ]
  },
  'S': {
    families: ['S', 'Maybach'],
    mileageBands: [
      { min: 0, max: 40000, commonIssues: ['Active Body Control (ABC) leaks', 'Distronic radar alignment', 'Magic Body Control sensor'], standardTests: [{ label: 'ABC pressure', spec: '~180-200 bar system' }] },
      { min: 40001, max: 90000, commonIssues: ['Injectors / fuel trim issues on M256', 'Air suspension compressor', 'Wiring harness chafing (doors, trunk)'], standardTests: [
        { label: 'Fuel pressure', spec: '200-250 bar idle' },
        { label: 'Battery + IBS', spec: '>12.4V resting, check quiescent current <50mA' },
      ]}
    ]
  },
  'E': {
    families: ['E', 'CLS'],
    mileageBands: [
      { min: 25000, max: 80000, commonIssues: ['M264/M256 injector / HPFP issues', 'Balance shaft / chain', 'Electrical consumers drain'], standardTests: [
        { label: 'HP fuel pressure', spec: '200-280 bar' },
        { label: 'Lambda / fuel trims', spec: 'fra/fra2 near 1.0 ±0.03' },
      ]}
    ]
  },
  'C': {
    families: ['C', 'CLA', 'GLA'],
    mileageBands: [
      { min: 20000, max: 70000, commonIssues: ['M264 timing chain / balance', 'Turbo wastegate rattle', '7G/9G conductor plate'], standardTests: [{ label: 'Oil pressure', spec: 'per spec ~2.5-4.5 bar hot' }] }
    ]
  },
  default: {
    families: [],
    mileageBands: [
      { min: 0, max: 999999, commonIssues: ['Battery/charging system', 'Sensor faults', 'Software adaptations drift'], standardTests: [
        { label: 'Battery resting voltage', spec: '12.6 V+' },
        { label: 'Guided test values', spec: 'follow XENTRY exactly' },
      ]}
    ]
  }
};

function getSuggestions(ro: RepairOrder): { issues: string[]; tests: Array<{label: string; spec: string; note?: string}>; bandNote: string } {
  const model = (ro.vehicle.model || '').toUpperCase();
  const miles = parseInt(ro.vehicle.mileageIn || '0', 10) || 0;
  let kb = MERCEDES_KB.default;
  let famKey = 'default';
  for (const [key, val] of Object.entries(MERCEDES_KB)) {
    if (key === 'default') continue;
    if (val.families.some(f => model.includes(f)) || model.includes(key)) {
      kb = val;
      famKey = key;
      break;
    }
  }
  // pick best band
  let band = kb.mileageBands[kb.mileageBands.length-1];
  for (const b of kb.mileageBands) {
    if (miles >= b.min && miles <= b.max) { band = b; break; }
  }
  const bandNote = `${famKey} • ${miles ? miles + ' mi' : 'mileage unknown'} band`;
  return { issues: band.commonIssues, tests: band.standardTests, bandNote };
}

// Enhance parseDiagnosticText to also capture some standard value hints
function parseDiagnosticText(text: string): Partial<ExtractedData> {
  const upper = text.toUpperCase();
  const codes = Array.from(upper.matchAll(/\b([PBCU]\d{4}(?:[-–]\d{3})?)\b/g)).map(m => m[1]);
  const guidedTests = Array.from(text.matchAll(/Guided Test[:\s-]*(.+?)(?=\n|Test|$)/gi)).map(m => m[1].trim()).filter(t => t.length > 3);
  const measurements = Array.from(text.matchAll(/([A-Za-z0-9\s\/]+?)\s*[:=]\s*([\d.]+\s*(?:V|VOLTS|PSI|BAR|OHM|kOHM|mA|°C|°F|bar|kpa)?)/gi))
    .map(m => ({ label: m[1].trim(), value: m[2].trim() })).slice(0, 8);
  const components = Array.from(upper.matchAll(/\b([A-Z]\d{1,2}\/\d{1,2}[A-Z]?(?:Y\d)?)\b/g)).map(m => m[1]);
  const circuits = Array.from(text.matchAll(/pin\s*(\d+\.?\d*)|circuit\s*(\d+[A-Z]?)/gi)).map(m => m[0].trim());
  return { codes, guidedTests, measurements, components, circuits };
}

// Grok API call
async function generateWarrantyStoryWithGrok(
  ro: RepairOrder,
  line: RepairLine,
  apiKey: string,
  historyContext: string = ''
): Promise<string> {
  const vehicleInfo = `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model} | VIN: ${ro.vehicle.vin} | Miles: ${ro.vehicle.mileageIn} → ${ro.vehicle.mileageOut}`.replace(/\s+/g, ' ').trim();

  const allRepairs = ro.repairLines
    .map((l) => `Line ${l.lineNumber}: ${l.description}`)
    .join('\n');

  const data = line.extractedData || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] };
  const xentryText = [
    data.codes.length ? `Codes: ${data.codes.join(', ')}` : '',
    data.guidedTests.length ? `Guided Tests: ${data.guidedTests.join(' | ')}` : '',
    data.measurements.length ? `Measurements: ${data.measurements.map(m => `${m.label} = ${m.value}`).join('; ')}` : '',
    data.components.length ? `Components: ${data.components.join(' | ')}` : '',
    data.circuits.length ? `Circuits/Pins: ${data.circuits.join(', ')}` : ''
  ].filter(Boolean).join('\n') || 'No Xentry data provided.';

  // Include raw OCR from diagnostic photos for more accurate AI analysis
  const rawXentryOcr = (line.xentryOcrTexts && line.xentryOcrTexts.length > 0)
    ? '\nRaw OCR from Xentry photos (per line):\n' + line.xentryOcrTexts.join('\n---\n')
    : '';

  // RO-level Xentry saved data (scanned on the RO review / second page) - critical for initial QT / saved data
  const roRawXentryOcr = (ro.xentryOcrTexts && ro.xentryOcrTexts.length > 0)
    ? '\nRO-level Xentry Saved Data / Quick Test OCR (from RO page scan):\n' + ro.xentryOcrTexts.join('\n---\n')
    : '';

  const selectedTemplate = STORY_TEMPLATES[Math.floor(Math.random() * STORY_TEMPLATES.length)];

  const userMessage = `Vehicle information: ${vehicleInfo}

RO Complaints (A, B, C etc from photo):
${(ro.complaints || []).join('\n')}

All repairs on this RO:
${allRepairs}

Current repair line: Line ${line.lineNumber} - ${line.description}

Customer concern for this line: ${line.customerConcern || line.description}

Technician notes: ${line.technicianNotes || 'None'}

Xentry test data and images:
${xentryText}
${rawXentryOcr}
${roRawXentryOcr}
${historyContext}

MANDATORY REQUIREMENTS - Your story MUST explicitly include all of these (use the example in system prompt as gold standard for depth):
- A battery charger was connected during the entire repair.
- An initial Quick Test was performed using XENTRY.
- Include a test drive with realistic mileage in (e.g. 12 miles) and mileage out (e.g. 15 miles).
- Clearly show the 3 C’s: Customer Complaint/Concern, Cause, and Correction. Reference the specific labeled complaints (A, B, C...) from the RO.
- Always perform and document a final Quick Test after repairs.
- End with a final verification drive to confirm the repair.
Incorporate standard values (pressures, adaptations, leak rates etc) and common model/mileage issues from the provided context when they match the data. Sound like a real tech. Avoid hedging language.

For natural variety on this generation, follow this template structure (but keep it flowing naturally in first-person tech language and match the technical detail level of the example): ${selectedTemplate}

Write only the warranty story for this specific line. Make it sound completely human.`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 900
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Grok API error: ${response.status} ${err}`);
  }

  const apiResponse = await response.json();
  return apiResponse.choices?.[0]?.message?.content?.trim() || 'No story generated.';
}

function App() {
  const [view, setView] = useState<'home' | 'ro' | 'line' | 'settings'>('home');
  const [currentRO, setCurrentRO] = useState<RepairOrder | null>(null);
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(''); // in-memory only (decrypted)
  const [passphrase, setPassphrase] = useState(''); // temp for encrypt/unlock ops
  const [hasEncryptedKey, setHasEncryptedKey] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [allROs, setAllROs] = useState<RepairOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // IndexedDB helpers for persistent multi-RO storage
  const DB_NAME = 'maybachtech_db';
  const STORE_NAME = 'repairOrders';

  async function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadAllROs(): Promise<RepairOrder[]> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('IDB load failed, falling back to empty', e);
      return [];
    }
  }

  async function saveROToDB(ro: RepairOrder): Promise<void> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(ro);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('IDB save failed', e);
    }
  }

  async function deleteROFromDB(id: string): Promise<void> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('IDB delete failed', e);
    }
  }

  // Load all ROs and detect encrypted key status on mount. Key stays encrypted until user unlocks with passphrase.
  useEffect(() => {
    (async () => {
      let saved = await loadAllROs();
      saved = saved.map((ro: any) => {
        if (ro.vehicle && ro.vehicle.make === undefined) {
          ro.vehicle.make = '';
        }
        return ro;
      });
      setAllROs(saved);

      const enc = localStorage.getItem(ENC_KEY_STORAGE);
      setHasEncryptedKey(!!enc);

      // Legacy plain migration (will be re-saved encrypted on next Settings save)
      const legacy = localStorage.getItem(PLAIN_KEY_STORAGE);
      if (legacy && !enc) {
        setApiKey(legacy);
        setIsUnlocked(true);
      }
    })();
  }, []);

  const saveRO = (ro: RepairOrder | null) => {
    if (ro) {
      saveROToDB(ro); // persist async in background
      setAllROs(prev => {
        const idx = prev.findIndex(r => r.id === ro.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = ro;
          return copy;
        } else {
          return [ro, ...prev];
        }
      });
    }
    setCurrentRO(ro);
  };

  const saveApiKey = async (key: string, pass: string) => {
    setApiKey(key);
    if (pass && key) {
      await saveEncryptedKey(key, pass);
      setHasEncryptedKey(true);
      setIsUnlocked(true);
      setPassphrase(''); // clear after use
      alert('Key encrypted and saved locally. Remember your passphrase to unlock on future sessions.');
    } else if (key) {
      // no pass provided: warn but allow plain for this session only (not recommended)
      localStorage.setItem(PLAIN_KEY_STORAGE, key);
      localStorage.removeItem(ENC_KEY_STORAGE);
      setHasEncryptedKey(false);
      alert('Saved without encryption (legacy). Enter passphrase next time to encrypt.');
    } else {
      await saveEncryptedKey('', '');
      setHasEncryptedKey(false);
      setIsUnlocked(false);
    }
  };

  const unlockWithPassphrase = async (pass: string) => {
    const k = await loadEncryptedKey(pass);
    if (k) {
      setApiKey(k);
      setIsUnlocked(true);
      setPassphrase('');
      return true;
    } else {
      alert('Unlock failed. Check passphrase.');
      return false;
    }
  };

  const clearAllKeys = () => {
    localStorage.removeItem(ENC_KEY_STORAGE);
    localStorage.removeItem(PLAIN_KEY_STORAGE);
    setApiKey('');
    setHasEncryptedKey(false);
    setIsUnlocked(false);
    setPassphrase('');
  };

  const deleteRO = async (id: string) => {
    if (!confirm('Delete this RO and all its data?')) return;
    await deleteROFromDB(id);
    setAllROs(prev => prev.filter(r => r.id !== id));
    if (currentRO?.id === id) {
      setCurrentRO(null);
      setCurrentLineId(null);
      setView('home');
    }
  };

  const openRO = (ro: RepairOrder) => {
    setCurrentRO(ro);
    setCurrentLineId(null);
    setView('ro');
  };

  const currentLine = currentRO?.repairLines.find(l => l.id === currentLineId);

  // Camera + OCR - improved with preprocessing for far higher reliability on real shop photos
  const handleScanRO = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsProcessingOCR(true);
      setOcrProgress(0);

      try {
        const preprocessed = await preprocessImageForOCR(file);
        const text = await runOCR(preprocessed, (p) => setOcrProgress(p));
        createROFromText(text);
      } catch (error) {
        console.error('OCR error', error);
        alert('OCR failed. You can enter data manually.');
        createROFromText('');
      } finally {
        setIsProcessingOCR(false);
        setOcrProgress(0);
      }
    };
    input.click();
  };

  // Helper to parse complaints A. B. C. etc from RO OCR text - robust for real Mercedes RO forms
  // Significantly hardened with more patterns, OCR fixes, section awareness, and deduping.
  function extractComplaints(text: string): string[] {
    if (!text || text.trim().length < 6) return [];
    const comps: string[] = [];
    const rawLines = text.split(/[\n\r]+/);
    const lines = rawLines.map(l => l.trim()).filter(Boolean);
    let inComplaintSection = false;
    const stopHeaders = /vin|ro\s*#|mileage|odometer|technician|tech|service advisor|advisor|date|repair order|vehicle id|work order|parts|correction|cause|authorized|labor|signature|notes|print name|customer name|phone|email/i;

    const isJunk = (s: string) => /^(vin|mile|km|ro\s*#|date|tech|name|model|customer|service|advisor|authorized|total|tax|parts|shop|dealer)/i.test(s);

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (/customer\s*(complaint|concern|cc|states?|reported)|complaints?\s*:|concerns?\s*:|c\.?c\.?\s*[:\-]|symptom|description\s*of\s*concern|customer\s*states?/i.test(line)) {
        inComplaintSection = true;
        continue;
      }
      if (inComplaintSection && stopHeaders.test(line)) {
        inComplaintSection = false; // stop at next header
      }
      if (inComplaintSection || comps.length < 2) {  // allow early lines too
        // Lettered: A. A) A: A- etc (A B C D from Mercedes ROs)
        let m = line.match(/^([A-Z])[\.\)\:\s\-–—–—]+\s*(.+)$/);
        if (m && m[2]) {
          let c = m[2].trim();
          if (c.length > 5 && !isJunk(c) && !/^[A-Z]$/.test(c)) {
            comps.push(c);
            continue;
          }
        }
        // Numbered 1. 01) 1: etc
        m = line.match(/^(\d{1,2})[\.\)\:\s\-–—]+\s*(.+)$/);
        if (m && m[2]) {
          let c = m[2].trim();
          if (c.length > 5 && !isJunk(c)) {
            comps.push(c);
            continue;
          }
        }
        // Bullets or dashes
        m = line.match(/^[\-\•\*]\s*(.+)$/);
        if (m && m[1]) {
          let c = m[1].trim();
          if (c.length > 6 && !stopHeaders.test(c) && !isJunk(c)) {
            comps.push(c);
            continue;
          }
        }
        // Plain substantial line while in section (Mercedes ROs often have wrapped text)
        if (inComplaintSection && line.length > 10 && !stopHeaders.test(line) && !/^\d{1,2}[\.\)]?\s*$/.test(line) && !isJunk(line)) {
          comps.push(line);
        }
      }
    }

    // Global fallback regexes (catch when header OCR mangled)
    if (comps.length === 0 || comps.length < 2) {
      const patterns = [
        /([A-Z])[\.\)]\s*([A-Za-z][^\n]{8,220})/g,
        /([0-9]{1,2})[\.\)]\s*([A-Za-z][^\n]{8,220})/g,
        /(?:Customer\s*)?Complaint[s]?:?\s*([A-Za-z][^\n]{8,260})/gi,
        /Concern[s]?:?\s*([A-Za-z][^\n]{8,260})/gi,
        /C\.?C\.?\s*[:\-]?\s*([A-Za-z][^\n]{8,260})/gi,
        /Customer\s*states?\s*:?\s*([A-Za-z][^\n]{8,260})/gi,
        /Symptom[s]?:?\s*([A-Za-z][^\n]{8,260})/gi,
        /Description\s*of\s*Concern:?\s*([A-Za-z][^\n]{8,260})/gi,
        /Vehicle\s*Complaint[s]?:?\s*([A-Za-z][^\n]{8,260})/gi
      ];
      patterns.forEach(p => {
        let match;
        while ((match = p.exec(text)) !== null) {
          const cand = (match[2] || match[1] || '').trim().replace(/[\s\-–—–—]+$/, '');
          if (cand.length > 7 && !/vin|mileage|ro\s*#|date|tech|customer name|model year|authorized/i.test(cand) && !isJunk(cand)) {
            comps.push(cand);
          }
        }
      });
    }

    // Dedupe + clean + limit to reasonable # of complaints
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const c of comps) {
      const key = c.toLowerCase().replace(/\s+/g, ' ').slice(0, 32);
      if (!seen.has(key) && c.length > 5 && c.length < 300) {
        seen.add(key);
        unique.push(c.replace(/\s+/g, ' ').trim());
      }
    }
    return unique.slice(0, 8);
  }

  function extractVehicleDetails(text: string) {
    // Clean common OCR confusions early (VINs especially)
    let cleaned = text
      .replace(/\bO\b/g, '0').replace(/\bI\b/g, '1').replace(/\bL\b/g, '1')
      .replace(/[\u2018\u2019]/g, "'"); // smart quotes

    const vinMatch = cleaned.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    let vin = vinMatch ? vinMatch[1] : '';
    // Final VIN sanitize: correct common OCR letter/number swaps in valid positions
    if (vin) {
      vin = vin.toUpperCase()
        .replace(/O/g, '0').replace(/I/g, '1').replace(/Q/g, '0').replace(/B/g, '8');
      // Mercedes WMI quick confirm/fix common
      if (!vin.match(/^[A-HJ-NPR-Z0-9]{17}$/)) vin = '';
    }

    // Year: MY2024 / Model Year 2023 / 2023 GLE etc. Prefer explicit, avoid false 4-digit in other numbers.
    let year = '';
    const myMatch = cleaned.match(/\bM\.?Y\.?\s*(20\d{2}|19\d{2})\b/i) || cleaned.match(/\bModel\s*Year\s*(20\d{2}|19\d{2})\b/i) || cleaned.match(/\b(20\d{2}|19\d{2})\s*MY\b/i);
    if (myMatch) year = myMatch[1];
    if (!year) {
      // Year right before common Mercedes model tokens
      const yearBefore = cleaned.match(/\b(20\d{2}|19\d{2})\s+(?:Mercedes|Maybach|MB|GLE|GLS|GLC|GLA|S\s|E\s|C\s|EQ|AMG|GT|SL|CLS|CLA)\b/i);
      if (yearBefore) year = yearBefore[1];
    }
    if (!year) {
      // Last resort: first plausible 20xx near "vehicle" or top of doc
      const yearAny = cleaned.match(/(?:vehicle|car|auto|ro|repair|mileage|vin)[^\n]{0,60}?\b(20\d{2}|19\d{2})\b/i) || cleaned.match(/\b(20\d{2}|19\d{2})\b/);
      if (yearAny) year = yearAny[1];
    }

    // Make - default Mercedes-Benz, detect Maybach or explicit
    let make = 'Mercedes-Benz';
    if (/Maybach/i.test(cleaned)) make = 'Maybach';
    else if (/Mercedes[- ]?Benz/i.test(cleaned) || /\bMercedes\b/i.test(cleaned)) make = 'Mercedes-Benz';
    else if (/\bMB\b/i.test(cleaned) || /\bMERCEDES\b/i.test(cleaned)) make = 'Mercedes-Benz';
    else if (vin.startsWith('W1') || vin.startsWith('WDD') || vin.startsWith('WDC') || vin.startsWith('WDF') || vin.startsWith('W1N') || vin.startsWith('W1K')) {
      make = 'Mercedes-Benz';
    }

    // Model extraction - expanded patterns for Mercedes lineup + trims
    let model = '';
    const modelPatterns = [
      /\b(Maybach\s+)?(?:GLE|GLS|GLC|GLA|GLB|G)\s*\d{2,3}[A-Z]?(?:\s*(?:4MATIC|4M|AMG|Maybach|Coupe|SUV|Cabriolet))?\b/i,
      /\b(Maybach\s+)?S\s*\d{2,3}[A-Z]?(?:\s*(?:4MATIC|AMG|Maybach|Maybach\s+S))?\b/i,
      /\b(Maybach\s+)?E\s*\d{2,3}[A-Z]?(?:\s*(?:4MATIC|AMG))?\b/i,
      /\b(Maybach\s+)?C\s*\d{2,3}[A-Z]?(?:\s*(?:4MATIC|AMG))?\b/i,
      /\b(?:EQE|EQS|EQB|EQC|EQ)\s*\d{2,3}[A-Z]?(?:\s*(?:4MATIC|AMG))?\b/i,
      /\bAMG\s*(?:GT|SL|GLE|GLS|G)\s*\d{2,3}[A-Z]?(?:\s*(?:4MATIC|AMG))?\b/i,
      /\b(?:CLS|CLA|SL|GT|ML|GL)\s*\d{2,3}[A-Z]?(?:\s*(?:4MATIC|AMG))?\b/i,
      /\b(?:Sprinter|Vito|Metris)\b/i
    ];
    for (const re of modelPatterns) {
      const m = cleaned.match(re);
      if (m) {
        model = m[0].replace(/\s+/g, ' ').trim();
        break;
      }
    }
    if (!model) {
      const generic = cleaned.match(/\b(?:20\d{2}|19\d{2}|Mercedes|Maybach|MB)\s+([A-Z]{1,4}[\s-]?\d{2,3}[A-Z0-9\s-]{0,10})/i);
      if (generic && generic[1]) model = generic[1].trim();
    }
    model = model.replace(/\b4\s*MATIC\b/i, '4MATIC').replace(/\s+/g, ' ').trim();

    // Mileage in - prefer "Mileage In", "Odometer", "Current Mileage", common RO labels. Fallback any 5-7 digit + mi/km
    let mileageIn = '';
    const labeled = cleaned.match(/(?:mileage\s*(?:in|at|reading)?|odometer|current\s*(?:mile|km)|miles\s*in)\s*:?\s*([\d,]{3,7})/i);
    if (labeled) {
      mileageIn = labeled[1].replace(/,/g, '');
    } else {
      const any = cleaned.match(/([\d,]{4,7})\s*(?:mi|mile|miles|km)\b/i);
      if (any) mileageIn = any[1].replace(/,/g, '');
    }

    // Also try to extract customer name for prefill
    // (we return it separately via side logic in create)

    return { vin, year, make, model, mileageIn, mileageOut: '' };
  }

  // Extract customer name if present on RO scan
  function extractCustomerName(text: string): string {
    const patterns = [
      /customer\s*(?:name|:)?:?\s*([A-Z][A-Za-z'\-\s]{2,40})/i,
      /(?:name|owner)\s*:?\s*([A-Z][A-Za-z'\-\s]{2,40})/i,
      /^([A-Z][A-Za-z'\-\s]{2,30})\s*(?:RO|Repair|Vehicle|VIN)/im
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m[1]) {
        const n = m[1].trim();
        if (n.length > 2 && n.length < 45 && !/vin|mile|ro|tech/i.test(n)) return n;
      }
    }
    return '';
  }

  const createROFromText = (text: string) => {
    const roNumber = (text.match(/(?:RO|Repair\s*Order|Work\s*Order)[:\s#\-]*([A-Z0-9\-]{3,12})/i) || [])[1] || `R-${Date.now().toString().slice(-6)}`;
    const vehicle = extractVehicleDetails(text);
    const complaints = extractComplaints(text);
    const custName = extractCustomerName(text);

    const newRO: RepairOrder = {
      id: 'ro-' + Date.now(),
      roNumber,
      vehicle,
      customer: { name: custName },
      complaints,
      xentryImages: [],
      xentryOcrTexts: [],
      createdAt: new Date().toISOString(),
      repairLines: [{
        id: 'line-1',
        lineNumber: 1,
        description: complaints[0] ? complaints[0].slice(0, 60) : 'Enter repair description',
        customerConcern: complaints[0] || '',
        technicianNotes: '',
        xentryImages: [],
        xentryOcrTexts: [],
        extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
      }]
    };

    saveRO(newRO);
    setView('ro');
  };

  function mergeExtracted(base: ExtractedData, add: Partial<ExtractedData>): ExtractedData {
    return {
      codes: [...new Set([...(base.codes || []), ...(add.codes || [])])],
      guidedTests: [...new Set([...(base.guidedTests || []), ...(add.guidedTests || [])])],
      measurements: [...(base.measurements || []), ...(add.measurements || [])].slice(0, 8),
      components: [...new Set([...(base.components || []), ...(add.components || [])])],
      circuits: [...new Set([...(base.circuits || []), ...(add.circuits || [])])],
    };
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  const createManualRO = () => {
    const newRO: RepairOrder = {
      id: 'ro-' + Date.now(),
      roNumber: `R-${Date.now().toString().slice(-6)}`,
      vehicle: { vin: '', year: '', make: '', model: '', mileageIn: '', mileageOut: '' },
      customer: { name: '' },
      complaints: ['Enter customer concern / symptom here (will label as A.)'],
      xentryImages: [],
      xentryOcrTexts: [],
      createdAt: new Date().toISOString(),
      repairLines: [{
        id: 'line-1',
        lineNumber: 1,
        description: 'Enter repair description',
        customerConcern: '',
        technicianNotes: '',
        xentryImages: [],
        xentryOcrTexts: [],
        extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
      }]
    };
    saveRO(newRO);
    setView('ro');
  };

  const addXentryPhotos = async (lineId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.setAttribute('capture', 'environment');

    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0 || !currentRO) return;

      setIsProcessingOCR(true);
      setOcrProgress(0);

      const latestROAtClick = allROs.find(r => r.id === currentRO?.id) || currentRO;
      const lineForExtract = latestROAtClick ? latestROAtClick.repairLines.find(l => l.id === lineId) : null;
      let updatedExtracted: ExtractedData = (lineForExtract?.extractedData) || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] };
      let updatedOcrTexts: string[] = lineForExtract?.xentryOcrTexts || [];
      const newImgs: Array<{ id: string; dataUrl: string; name: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dataUrl = await fileToDataUrl(file);
        newImgs.push({ id: 'ximg-' + Date.now() + i, dataUrl, name: file.name });

        try {
          const pre = await preprocessImageForOCR(file);
          const text = await runOCR(pre, (p) => setOcrProgress(Math.round(((i + p) / files.length) * 100)));
          const diag = parseDiagnosticText(text);
          updatedExtracted = mergeExtracted(updatedExtracted, diag);
          updatedOcrTexts = [...updatedOcrTexts, text];
        } catch (err) {
          console.warn('Xentry OCR failed for one image', err);
        }
      }

      if (!latestROAtClick) return;
      const lineInLatest = latestROAtClick.repairLines.find(l => l.id === lineId);
      const updatedLine = {
        xentryImages: [...(lineInLatest?.xentryImages || []), ...newImgs],
        xentryOcrTexts: updatedOcrTexts,
        extractedData: updatedExtracted
      };
      const updatedLines = latestROAtClick.repairLines.map(l => l.id === lineId ? { ...l, ...updatedLine } : l);
      saveRO({ ...latestROAtClick, repairLines: updatedLines });
      setIsProcessingOCR(false);
      setOcrProgress(0);
      // Auto-seed smart defaults for this vehicle if tech notes still empty (helps new lines)
      const updatedLineCheck = updatedLines.find(l => l.id === lineId);
      if (updatedLineCheck && (!updatedLineCheck.technicianNotes || updatedLineCheck.technicianNotes.trim().length < 5)) {
        // fire and forget, will use latest in closure via re-find inside
        setTimeout(() => applySmartDefaultsToLine(lineId), 60);
      }
      alert(`${files.length} diagnostic photo(s) added and analyzed. Smart defaults suggested.`);
    };
    input.click();
  };

  // RO-level Xentry Saved Data scan (called from second page / renderRO)
  // Stores images+OCR on the RO, and also merges parsed data + OCR texts into the *first* repair line
  // so the line's story generator sees the initial Quick Test / saved data.
  const addROXentryPhotos = async () => {
    if (!currentRO) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.setAttribute('capture', 'environment');

    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0 || !currentRO) return;

      setIsProcessingOCR(true);
      setOcrProgress(0);

      const latestROAtClick = allROs.find(r => r.id === currentRO?.id) || currentRO;

      // RO level accumulators
      let roUpdatedImgs: Array<{ id: string; dataUrl: string; name: string }> = [...(latestROAtClick.xentryImages || [])];
      let roUpdatedOcr: string[] = [...(latestROAtClick.xentryOcrTexts || [])];

      // Also merge into first repair line so extracted data flows to stories
      const firstLine = latestROAtClick.repairLines[0];
      let lineUpdatedExtracted: ExtractedData = { ...(firstLine?.extractedData || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] }) };
      let lineUpdatedOcr: string[] = [...(firstLine?.xentryOcrTexts || [])];
      const newImgsForRO: Array<{ id: string; dataUrl: string; name: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dataUrl = await fileToDataUrl(file);
        const imgEntry = { id: 'rox-' + Date.now() + i, dataUrl, name: file.name || `xentry-${i+1}.jpg` };
        newImgsForRO.push(imgEntry);

        try {
          const pre = await preprocessImageForOCR(file);
          const text = await runOCR(pre, (p) => setOcrProgress(Math.round(((i + p) / files.length) * 100)));
          const diag = parseDiagnosticText(text);
          lineUpdatedExtracted = mergeExtracted(lineUpdatedExtracted, diag);
          lineUpdatedOcr = [...lineUpdatedOcr, text];
          roUpdatedOcr = [...roUpdatedOcr, text];
        } catch (err) {
          console.warn('RO Xentry OCR failed for one image', err);
        }
      }

      roUpdatedImgs = [...roUpdatedImgs, ...newImgsForRO];

      if (!latestROAtClick) return;

      // Update first line with merged data + ocr
      let updatedLines = latestROAtClick.repairLines;
      if (firstLine) {
        updatedLines = latestROAtClick.repairLines.map((l, idx) =>
          idx === 0 ? {
            ...l,
            xentryImages: [...(l.xentryImages || []), ...newImgsForRO],
            xentryOcrTexts: lineUpdatedOcr,
            extractedData: lineUpdatedExtracted
          } : l
        );
      }

      const updatedRO: RepairOrder = {
        ...latestROAtClick,
        xentryImages: roUpdatedImgs,
        xentryOcrTexts: roUpdatedOcr,
        repairLines: updatedLines
      };
      saveRO(updatedRO);
      setIsProcessingOCR(false);
      setOcrProgress(0);
      alert(`${files.length} Xentry saved data photo(s) added and analyzed.`);
    };
    input.click();
  };

  const addRepairLine = () => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const newLine: RepairLine = {
      id: 'line-' + Date.now(),
      lineNumber: latestRO.repairLines.length + 1,
      description: 'New repair item',
      customerConcern: '',
      technicianNotes: '',
      xentryImages: [],
      xentryOcrTexts: [],
      extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] }
    };
    const updated = { ...latestRO, repairLines: [...latestRO.repairLines, newLine] };
    saveRO(updated);
    setCurrentLineId(newLine.id);
    setView('line');
  };

  const updateLine = (lineId: string, updates: Partial<RepairLine>) => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const updatedLines = latestRO.repairLines.map(line =>
      line.id === lineId ? { ...line, ...updates } : line
    );
    const updatedRO = { ...latestRO, repairLines: updatedLines };
    saveRO(updatedRO);
  };

  // RO-level editable updates for pre-populated scan data (vehicle, customer, complaints)
  const updateVehicle = (updates: Partial<RepairOrder['vehicle']>) => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const updated = { ...latestRO, vehicle: { ...latestRO.vehicle, ...updates } };
    saveRO(updated);
  };

  const updateCustomer = (name: string) => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const updated = { ...latestRO, customer: { ...latestRO.customer, name } };
    saveRO(updated);
  };

  const updateComplaints = (newComplaints: string[]) => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    // If first complaint changed, try to keep line 1 concern in sync if it was previously matching
    let updatedLines = latestRO.repairLines;
    if (newComplaints.length > 0) {
      const oldFirst = latestRO.complaints[0] || '';
      updatedLines = latestRO.repairLines.map((l, idx) => {
        if (idx === 0 && (!l.customerConcern || l.customerConcern === oldFirst)) {
          return { ...l, customerConcern: newComplaints[0] || '' };
        }
        return l;
      });
    }
    const updated = { ...latestRO, complaints: newComplaints, repairLines: updatedLines };
    saveRO(updated);
  };

  const addComplaint = () => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    updateComplaints([...(latestRO.complaints || []), 'New concern - describe symptom']);
  };

  const removeComplaint = (index: number) => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const filtered = (latestRO.complaints || []).filter((_, i) => i !== index);
    updateComplaints(filtered);
  };

  const editComplaint = (index: number, value: string) => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const updated = [...(latestRO.complaints || [])];
    updated[index] = value;
    updateComplaints(updated);
  };

  // Apply smart Mercedes defaults + common issues for the current vehicle + mileage into the line
  const applySmartDefaultsToLine = (lineId: string) => {
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const line = latestRO.repairLines.find(l => l.id === lineId);
    if (!line) return;

    const sugg = getSuggestions(latestRO);
    let notes = (line.technicianNotes || '').trim();
    const addBlock = `\n\n[Smart defaults for ${sugg.bandNote}]\nCommon issues at this mileage: ${sugg.issues.join(' • ')}\nStandard values: ${sugg.tests.map(t => `${t.label}: ${t.spec}${t.note ? ' ('+t.note+')' : ''}`).join('; ')}`;

    if (!notes.includes('Smart defaults')) {
      notes = (notes + addBlock).trim();
    }
    // Also seed some measurements into extractedData if none
    let newExtract = line.extractedData || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] };
    if (newExtract.measurements.length === 0 && sugg.tests.length) {
      newExtract = {
        ...newExtract,
        measurements: sugg.tests.slice(0, 4).map(t => ({ label: t.label, value: t.spec }))
      };
    }
    const updatedLines = latestRO.repairLines.map(l => l.id === lineId ? { ...l, technicianNotes: notes, extractedData: newExtract } : l);
    saveRO({ ...latestRO, repairLines: updatedLines });
  };

  // Grok generation - enhanced with history for smarter AI over time
  const generateStory = async (lineId: string) => {
    if (!currentRO || !apiKey) {
      if (hasEncryptedKey && !isUnlocked) {
        alert('Unlock your encrypted xAI key in Settings using your passphrase.');
        setView('settings');
        return;
      }
      alert('Please enter / unlock your xAI Grok API key in Settings (gear icon).');
      setView('settings');
      return;
    }

    // use latest from list to avoid stale closure
    const latestRO = allROs.find(r => r.id === currentRO?.id) || currentRO;
    if (!latestRO) return;
    const line = latestRO.repairLines.find(l => l.id === lineId);
    if (!line) return;

    setIsGenerating(true);
    try {
      // Learn from history: include 1-2 similar past stories in prompt for consistency
      let historyContext = '';
      const similar = allROs
        .filter(r => r.id !== latestRO.id && r.vehicle.model && latestRO.vehicle.model && 
          (r.vehicle.model.toLowerCase().includes(latestRO.vehicle.model.toLowerCase().split(' ')[0]) ||
           (r.vehicle.make && latestRO.vehicle.make && r.vehicle.make.toLowerCase() === latestRO.vehicle.make.toLowerCase())))
        .slice(0, 2);
      if (similar.length > 0) {
        historyContext = '\n\nFor style consistency, examples from my previous similar repairs:\n' + 
          similar.map(r => r.repairLines.filter(l => l.warrantyStory).map(l => `For ${l.description}: ${l.warrantyStory!.substring(0, 250)}...`).join('\n')).join('\n---\n');
      }

      const story = await generateWarrantyStoryWithGrok(latestRO, line, apiKey, historyContext);
      const updatedLines = latestRO.repairLines.map(l => l.id === lineId ? { ...l, warrantyStory: story } : l);
      saveRO({ ...latestRO, repairLines: updatedLines });
    } catch (error: any) {
      alert('Failed to generate story: ' + (error.message || 'Check your API key and internet connection.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyStory = (story: string) => {
    navigator.clipboard.writeText(story);
    alert('Copied to clipboard!');
  };

  // Render helpers
  const renderHome = () => {
    const filteredROs = allROs.filter(ro => 
      ro.roNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ro.vehicle.make && ro.vehicle.make.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (ro.vehicle.model && ro.vehicle.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (ro.vehicle.year && ro.vehicle.year.includes(searchTerm)) ||
      (ro.vehicle.vin && ro.vehicle.vin.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a,b) => ((b.createdAt || '0') > (a.createdAt || '0') ? 1 : -1));

    return (
      <div className="relative min-h-dvh px-4 pt-2 pb-8">
        {/* Gear icon in top right of main screen */}
        <button
          onClick={() => setView('settings')}
          className="absolute top-4 right-4 p-2 text-[#8e8e93] z-10 touch-target"
          aria-label="Settings"
        >
          <Settings size={22} />
        </button>

        <div className="pt-12">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#0a84ff] to-[#0066cc] flex items-center justify-center mb-3 p-1">
              <img src="/icon-512.png" alt="Benz Tech - Mercedes-Benz" className="w-full h-full rounded-2xl" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tighter">Benz Tech</h1>
            <p className="text-[#8e8e93] text-sm">Mercedes-Benz Technician • Warranty Story Assistant</p>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={handleScanRO}
              disabled={isProcessingOCR}
              className="primary-btn flex-1 h-12 flex items-center justify-center gap-2 text-sm"
            >
              <Camera size={18} />
              {isProcessingOCR ? `SCANNING RO... ${ocrProgress}%` : 'SCAN NEW RO'}
            </button>
            <button
              onClick={createManualRO}
              className="secondary-btn flex-1 h-12 flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={18} /> NEW MANUAL
            </button>
          </div>
          <div className="text-center text-[10px] text-[#8e8e93] mb-4 -mt-1">
            Scan RO photo (improved OCR) or manual • Pre-populates year/make/model/VIN/mileage + A/B/C complaints reliably
          </div>

          <div className="mb-3">
            <input
              type="text"
              placeholder="Search past ROs (number, model, VIN)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1c1c1e] border border-[#38383a] rounded-xl px-4 py-2.5 text-sm placeholder-[#8e8e93]"
            />
          </div>

          {filteredROs.length === 0 ? (
            <div className="text-center py-10 text-[#8e8e93]">
              <p>No past ROs yet.</p>
              <p className="text-xs mt-1">Scan your first repair order above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredROs.map(ro => (
                <div 
                  key={ro.id} 
                  onClick={() => openRO(ro)}
                  className="ios-card p-3 active:bg-[#252528] cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold text-sm">{ro.roNumber}</div>
                    <div className="text-xs text-[#8e8e93]">{[ro.vehicle.year, ro.vehicle.make, ro.vehicle.model].filter(Boolean).join(' ')} • {ro.repairLines.length} lines</div>
                    <div className="text-[10px] text-[#8e8e93] mt-0.5">{ro.complaints[0]?.slice(0,60)}...</div>
                    <div className="text-[9px] text-[#666]">{ro.createdAt ? new Date(ro.createdAt).toLocaleDateString() : ''}</div>
                  </div>
                  <div className="text-right">
                    {ro.repairLines.some(l => l.warrantyStory) && <div className="text-[10px] text-[#30d158]">✓ stories</div>}
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteRO(ro.id); }} 
                      className="text-[10px] text-[#ff9f0a] mt-1"
                    >
                      DEL
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRO = () => {
    if (!currentRO) return null;
    const ro = currentRO;

    const letter = (i: number) => String.fromCharCode(65 + i); // A, B, C...

    return (
      <div className="px-5 pt-4 pb-8">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="text-xl font-semibold">{ro.roNumber}</div>
            <div className="text-sm text-[#8e8e93]">Repair Order • Pre-populated from scan or manual entry</div>
          </div>
          <button onClick={() => setView('home')} className="text-[#0a84ff] text-sm">Done</button>
        </div>

        {/* CUSTOMER + VEHICLE INFO - editable, prefilled from improved OCR */}
        <div className="ios-card p-4 mb-5">
          <div className="text-xs uppercase tracking-widest text-[#8e8e93] mb-3">VEHICLE &amp; CUSTOMER (from RO scan/manual)</div>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-[#8e8e93] block mb-0.5">YEAR</label>
              <input value={ro.vehicle.year} onChange={e => updateVehicle({ year: e.target.value })} placeholder="2023" className="w-full bg-[#2c2c2e] border border-[#38383a] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-[#8e8e93] block mb-0.5">MAKE</label>
              <input value={ro.vehicle.make} onChange={e => updateVehicle({ make: e.target.value })} placeholder="Mercedes-Benz" className="w-full bg-[#2c2c2e] border border-[#38383a] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-[#8e8e93] block mb-0.5">MODEL</label>
              <input value={ro.vehicle.model} onChange={e => updateVehicle({ model: e.target.value })} placeholder="GLE 450 4MATIC" className="w-full bg-[#2c2c2e] border border-[#38383a] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-[#8e8e93] block mb-0.5">MILEAGE IN</label>
              <input value={ro.vehicle.mileageIn} onChange={e => updateVehicle({ mileageIn: e.target.value })} placeholder="48250" className="w-full bg-[#2c2c2e] border border-[#38383a] rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="mb-3">
            <label className="text-[10px] text-[#8e8e93] block mb-0.5">VIN</label>
            <input value={ro.vehicle.vin} onChange={e => updateVehicle({ vin: e.target.value.toUpperCase() })} placeholder="W1Nxxxx..." maxLength={17} className="w-full bg-[#2c2c2e] border border-[#38383a] rounded-xl px-3 py-2 text-sm font-mono tracking-[1px]" />
          </div>

          <div>
            <label className="text-[10px] text-[#8e8e93] block mb-0.5">CUSTOMER NAME</label>
            <input value={ro.customer?.name || ''} onChange={e => updateCustomer(e.target.value)} placeholder="John Smith" className="w-full bg-[#2c2c2e] border border-[#38383a] rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        {/* COMPLAINTS - labeled A, B, C... editable, auto from improved scan, add/remove support */}
        <div className="ios-card p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-widest text-[#8e8e93]">CUSTOMER COMPLAINTS (A, B, C...)</div>
            <button onClick={addComplaint} className="text-[#0a84ff] text-xs flex items-center gap-1"><Plus size={14}/> ADD</button>
          </div>
          <p className="text-[10px] text-[#8e8e93] mb-3">Pre-populated accurately from RO photo scan. Edit to refine before generating stories.</p>

          {(ro.complaints && ro.complaints.length > 0) ? (
            ro.complaints.map((c, idx) => (
              <div key={idx} className="flex gap-2 mb-2 items-start">
                <div className="mt-2 w-6 text-[#0a84ff] font-semibold text-sm shrink-0">{letter(idx)}.</div>
                <textarea
                  value={c}
                  onChange={(e) => editComplaint(idx, e.target.value)}
                  className="flex-1 bg-[#2c2c2e] border border-[#38383a] rounded-2xl px-3 py-2 text-sm min-h-[52px] resize-y"
                />
                <button onClick={() => removeComplaint(idx)} className="mt-1 p-1.5 text-[#ff9f0a]" title="Remove complaint">
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="text-sm text-[#8e8e93] mb-2">No complaints. Add one or rescan.</div>
          )}
          <button onClick={addComplaint} className="text-xs text-[#0a84ff] mt-1">+ Add another complaint</button>
        </div>

        {/* XENTRY SAVED DATA IMAGE SCAN - supports Quick Test, fault codes, guided, wiring, continuity etc. */}
        <div className="ios-card p-4 mb-6">
          <div className="text-xs uppercase tracking-widest text-[#8e8e93] mb-1">XENTRY / DIAGNOSTIC IMAGE SCANS (RO level)</div>
          <p className="text-[10px] text-[#8e8e93] mb-2 leading-snug">Upload or capture XENTRY Quick Test, fault codes, Guided Tests, wiring diagrams, continuity checks, measurements. OCR + smart parsing feeds the AI + suggestions.</p>
          <button
            onClick={addROXentryPhotos}
            disabled={isProcessingOCR}
            className="secondary-btn w-full h-12 flex items-center justify-center gap-2 text-sm mb-2"
          >
            <Camera size={18} />
            {isProcessingOCR ? `ANALYZING... ${ocrProgress}%` : 'SCAN / ADD XENTRY PHOTOS (QT, CODES, GUIDED, WIRING...)'}
          </button>
          {ro.xentryImages && ro.xentryImages.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {ro.xentryImages.map((img, idx) => (
                <img 
                  key={idx} 
                  src={img.dataUrl} 
                  className="w-full h-16 object-cover rounded border border-[#38383a]" 
                  alt={img.name}
                  onClick={() => window.open(img.dataUrl)}
                />
              ))}
            </div>
          )}
          {ro.repairLines[0]?.extractedData && (ro.repairLines[0].extractedData.codes.length > 0 || ro.repairLines[0].extractedData.guidedTests.length > 0 || ro.repairLines[0].extractedData.measurements.length > 0) && (
            <div className="text-[10px] bg-[#1c1c1e] p-2 rounded">
              <div className="font-semibold mb-0.5">Extracted:</div>
              {ro.repairLines[0].extractedData.codes.length > 0 && <div>Codes: {ro.repairLines[0].extractedData.codes.join(', ')}</div>}
              {ro.repairLines[0].extractedData.guidedTests.length > 0 && <div>Guided: {ro.repairLines[0].extractedData.guidedTests.slice(0, 2).join(' | ')}</div>}
              {ro.repairLines[0].extractedData.measurements.length > 0 && <div>Meas: {ro.repairLines[0].extractedData.measurements.slice(0,1).map(m => `${m.label}=${m.value}`).join('; ')}</div>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-sm font-semibold text-[#8e8e93]">REPAIR LINES (A/B/C map to lines)</div>
          <button onClick={addRepairLine} className="flex items-center gap-1 text-[#0a84ff] text-sm font-medium">
            <Plus size={16} /> ADD LINE
          </button>
        </div>

        <div className="space-y-2">
          {ro.repairLines.map(line => (
            <div
              key={line.id}
              onClick={() => {
                const latestRO = allROs.find(r => r.id === ro?.id) || ro;
                if (latestRO) {
                  setCurrentRO(latestRO);
                  setCurrentLineId(line.id);
                  setView('line');
                }
              }}
              className="ios-card px-4 py-4 flex justify-between items-center active:bg-[#252528] cursor-pointer"
            >
              <div>
                <div className="font-medium">Line {line.lineNumber}: {line.description}</div>
                {line.customerConcern && <div className="text-[10px] text-[#8e8e93] mt-0.5 truncate max-w-[240px]">{line.customerConcern}</div>}
                {line.warrantyStory && <div className="text-xs text-[#30d158] mt-0.5">Story ready</div>}
              </div>
              <div className="text-[#8e8e93]">›</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setView('home')}
            className="flex-1 text-sm text-[#8e8e93] py-2 border border-[#38383a] rounded"
          >
            Back to List
          </button>
          <button
            onClick={() => deleteRO(ro.id)}
            className="flex-1 text-sm text-[#ff9f0a] py-2 border border-[#38383a] rounded"
          >
            Delete RO
          </button>
        </div>
      </div>
    );
  };

  const renderLine = () => {
    if (!currentLine || !currentRO) return null;
    const ro = currentRO;
    const line = currentLine;

    // Show vehicle summary + all complaints labeled for context on diagnostic page
    const letter = (i: number) => String.fromCharCode(65 + i);
    const vehicleSummary = [ro.vehicle.year, ro.vehicle.make, ro.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const mileageStr = ro.vehicle.mileageIn ? `${ro.vehicle.mileageIn} mi` : '';

    return (
      <div className="px-5 pt-4 pb-10">
        <button onClick={() => {
          const latest = allROs.find(r => r.id === currentRO?.id) || currentRO;
          if (latest) setCurrentRO(latest);
          setView('ro');
        }} className="flex items-center text-[#0a84ff] mb-4">
          <ArrowLeft size={18} className="mr-1" /> Back to RO
        </button>

        {/* Customer / Vehicle info summary + complaints reference */}
        <div className="ios-card p-3 mb-4 text-xs">
          <div className="font-semibold mb-0.5">{vehicleSummary} {mileageStr ? `• ${mileageStr}` : ''} {ro.vehicle.vin ? `• VIN ${ro.vehicle.vin.slice(0,10)}...` : ''}</div>
          {ro.customer?.name && <div className="text-[#8e8e93]">Customer: {ro.customer.name}</div>}
          {ro.complaints && ro.complaints.length > 0 && (
            <div className="mt-1.5 text-[10px] text-[#8e8e93]">
              Complaints: {ro.complaints.map((c,i) => `${letter(i)}. ${c.slice(0,42)}${c.length>42?'…':''}`).join('  ')}
            </div>
          )}
        </div>

        <div className="mb-5">
          <div className="text-sm text-[#8e8e93]">LINE {line.lineNumber}</div>
          <input
            value={line.description}
            onChange={(e) => updateLine(line.id, { description: e.target.value })}
            className="text-xl font-semibold bg-transparent w-full focus:outline-none"
          />
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-widest text-[#8e8e93] block mb-1.5">CUSTOMER CONCERN (prefilled from scan)</label>
            <textarea
              value={line.customerConcern}
              onChange={(e) => updateLine(line.id, { customerConcern: e.target.value })}
              className="w-full bg-[#1c1c1e] border border-[#38383a] rounded-2xl p-3.5 text-sm min-h-[80px]"
              placeholder="Customer stated..."
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-[#8e8e93] block mb-1.5">TECHNICIAN NOTES + FINDINGS</label>
            <textarea
              value={line.technicianNotes}
              onChange={(e) => updateLine(line.id, { technicianNotes: e.target.value })}
              className="w-full bg-[#1c1c1e] border border-[#38383a] rounded-2xl p-3.5 text-sm min-h-[100px]"
              placeholder="Road test results, findings, observations..."
            />
          </div>

          {/* Uploads for Xentry tests, fault codes, guided tests, wiring diagrams, continuity checks */}
          <div>
            <div className="text-xs uppercase tracking-widest text-[#8e8e93] mb-1.5">DIAGNOSTIC EVIDENCE PHOTOS</div>
            <button
              onClick={() => addXentryPhotos(line.id)}
              disabled={isProcessingOCR}
              className="secondary-btn w-full h-12 flex items-center justify-center gap-2 text-sm mb-2"
            >
              <Camera size={18} />
              {isProcessingOCR ? `ANALYZING PHOTOS... ${ocrProgress}%` : 'ADD XENTRY TESTS / FAULT CODES / GUIDED / WIRING / CONTINUITY'}
            </button>
            <p className="text-[10px] text-[#8e8e93] -mt-1 mb-2">Photos analyzed with OCR. AI uses them + common issue knowledge for suggestions and stories.</p>

            {line.xentryImages && line.xentryImages.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {line.xentryImages.map((img, idx) => (
                  <img 
                    key={idx} 
                    src={img.dataUrl} 
                    className="w-full h-16 object-cover rounded border border-[#38383a]" 
                    alt={img.name}
                    onClick={() => window.open(img.dataUrl)}
                  />
                ))}
              </div>
            )}
            {line.extractedData && (line.extractedData.codes.length || line.extractedData.guidedTests.length || line.extractedData.measurements.length) && (
              <div className="text-[10px] bg-[#1c1c1e] p-2 rounded mb-2">
                <div className="font-semibold mb-1">Extracted from photos:</div>
                {line.extractedData.codes.length > 0 && <div>Codes: {line.extractedData.codes.join(', ')}</div>}
                {line.extractedData.guidedTests.length > 0 && <div>Guided: {line.extractedData.guidedTests.slice(0,2).join(' | ')}</div>}
                {line.extractedData.measurements.length > 0 && <div>Meas: {line.extractedData.measurements[0].label}={line.extractedData.measurements[0].value}</div>}
              </div>
            )}
          </div>

          {/* Smart Mercedes defaults + common issues + standard test values (client-side, augments AI) */}
          <div className="ios-card p-3 mb-1">
            <div className="flex justify-between items-center mb-1">
              <div className="text-xs uppercase tracking-widest text-[#8e8e93]">SMART DEFAULTS &amp; COMMON ISSUES</div>
              <button onClick={() => applySmartDefaultsToLine(line.id)} className="text-[10px] px-2 py-0.5 bg-[#2c2c2e] rounded text-[#0a84ff]">APPLY FOR THIS VEHICLE</button>
            </div>
            <div className="text-[10px] text-[#8e8e93]">
              {(() => { const s = getSuggestions(ro); return `${s.bandNote} — ${s.issues.slice(0,2).join(', ')}... Standard: ${s.tests.slice(0,2).map(t=>t.label).join(' / ')}`; })()}
            </div>
            <div className="text-[9px] mt-1 text-[#666]">Click APPLY to seed technician notes + expected values. AI will reference + expand in the warranty story.</div>
          </div>

          {/* One-click generate - prominent */}
          <div>
            <button
              onClick={() => generateStory(line.id)}
              disabled={isGenerating || !apiKey}
              className="primary-btn w-full h-14 text-base disabled:opacity-60"
            >
              {isGenerating ? 'GENERATING WITH GROK...' : 'GENERATE WARRANTY STORY (ONE-CLICK)'}
            </button>
            {!apiKey && <p className="text-center text-xs text-[#ff9f0a] mt-2">Add xAI Grok API key in Settings (gear) to generate.</p>}
          </div>

          {line.warrantyStory && (
            <div className="story-card p-5 mt-2">
              <div className="text-xs uppercase tracking-[1px] text-[#8e8e93] mb-3">WARRANTY STORY — 3 C's • AUDIT-RESISTANT</div>
              <div className="whitespace-pre-line text-[14.5px] leading-relaxed mb-5">{line.warrantyStory}</div>
              <div className="flex gap-3">
                <button onClick={() => copyStory(line.warrantyStory!)} className="flex-1 secondary-btn h-11 flex items-center justify-center gap-2 text-sm">
                  <Copy size={16} /> COPY
                </button>
                <button onClick={() => generateStory(line.id)} className="secondary-btn h-11 px-5 flex items-center gap-2 text-sm">
                  <RefreshCw size={16} /> REGENERATE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="px-5 pt-6">
      <button onClick={() => setView(currentRO ? 'ro' : 'home')} className="flex items-center text-[#0a84ff] mb-6">
        <ArrowLeft size={18} className="mr-1" /> Back
      </button>

      <h2 className="text-2xl font-semibold mb-6">Settings</h2>

      <div className="ios-card p-5 mb-6">
        <div className="font-semibold mb-1">xAI Grok API Key (encrypted storage)</div>
        <div className="text-[10px] text-[#8e8e93] mb-3">Key never stored in plain text. Uses AES-GCM encryption with your passphrase.</div>

        {hasEncryptedKey && !isUnlocked && (
          <div className="mb-4 p-3 bg-[#2c2c2e] rounded-xl">
            <div className="text-sm mb-2">Encrypted key detected. Enter passphrase to unlock for this session:</div>
            <input
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder="Your encryption passphrase"
              className="w-full bg-[#1c1c1e] border border-[#38383a] rounded-xl p-3 text-sm mb-2"
            />
            <button onClick={async () => { if (passphrase) await unlockWithPassphrase(passphrase); }} className="primary-btn w-full h-10 text-sm">UNLOCK KEY</button>
          </div>
        )}

        <div>
          <label className="text-xs text-[#8e8e93] mb-1 block">API KEY (xai-...)</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="xai-yourkeyhere"
            className="w-full bg-[#2c2c2e] border border-[#444] rounded-xl p-3.5 font-mono text-sm mb-3"
          />
        </div>

        <div>
          <label className="text-xs text-[#8e8e93] mb-1 block">PASSPHRASE (for encryption - remember this!)</label>
          <input
            type="password"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            placeholder="Strong passphrase to encrypt key"
            className="w-full bg-[#2c2c2e] border border-[#444] rounded-xl p-3.5 text-sm mb-3"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={() => saveApiKey(apiKey, passphrase)} className="flex-1 secondary-btn h-11">SAVE ENCRYPTED KEY</button>
          <button onClick={clearAllKeys} className="secondary-btn h-11 px-6 text-[#ff9f0a]">CLEAR ALL</button>
        </div>
        <p className="text-xs text-[#8e8e93] mt-3 leading-snug">
          Get key at <span className="underline">console.x.ai</span>. Encrypted with passphrase using Web Crypto (AES-GCM + 150k PBKDF2). Passphrase required on each app restart if key is encrypted.
        </p>
        {isUnlocked && <div className="text-[10px] text-[#30d158] mt-2">✓ Key unlocked in memory for this session.</div>}
      </div>

      <div className="text-xs text-[#8e8e93] px-1 leading-relaxed">
        Uses official xAI Grok API + master Mercedes-Benz technician prompt engineered for detailed, audit-resistant warranty stories covering the 3 C's, battery charger, initial/final Quick Tests, realistic test drives, etc.
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* Global header for non-main screens */}
      {view !== 'home' && view !== 'settings' && (
        <header className="ios-header h-14 px-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/icon-512.png" alt="Benz Tech" className="w-6 h-6 rounded" />
            Benz Tech
          </div>
          <button onClick={() => setView('settings')} className="p-2 text-[#8e8e93]">
            <Settings size={20} />
          </button>
        </header>
      )}

      {view === 'home' && renderHome()}
      {view === 'ro' && renderRO()}
      {view === 'line' && renderLine()}
      {view === 'settings' && renderSettings()}
    </div>
  );
}

export default App;
