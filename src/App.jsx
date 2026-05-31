import React, { useState, useEffect } from 'react';
import Tesseract from 'tesseract.js';

// ==================== UTILITIES ====================
function haptic(type = 'light') {
  if (navigator.vibrate) {
    const patterns = { light: 8, medium: 25, heavy: 60, success: [15, 40, 15] };
    navigator.vibrate(patterns[type] || 10);
  }
}

function showToast(message, type = 'success') {
  // Simple toast implementation using DOM for now (can be improved with portal)
  const container = document.getElementById('toast-root');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto mx-auto px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-x-2.5 max-w-[92%] text-sm font-medium border ${type === 'success' ? 'bg-[#1f2a1f] border-[#2e4a2e] text-[#30d158]' : 'bg-[#2a1f1f] border-[#4a2e2e] text-[#ff9f0a]'}`;
  toast.innerHTML = `<div class="flex-1">${message}</div>`;
  container.innerHTML = '';
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transition = 'all 0.2s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 180);
  }, 2400);
}

// ==================== GROK API CONFIG ====================
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-3';

const WARRANTY_STORY_SYSTEM_PROMPT = `Act as a senior Mercedes-Benz master technician with 18 years experience writing warranty stories that always pass review.
Strict rules you must follow:

Always structure every story using the 3 C's: Customer Concern, Cause, and Correction
Every story must state that a battery charger was installed and maintained above 12.5 volts throughout testing
Every story must state that an Xentry Quick Test was performed and reference any relevant codes found
Always mention that all testing, Guided Tests, and data were reviewed in Xentry under the vehicle’s VIN in the cloud-based server
When Xentry images or Guided Test results are provided, specifically reference the exact component locations, wiring circuits, pin numbers, and test results shown in those images
Include specific technical details — SDS codes, Guided Test names, voltage readings, pin numbers, road test miles in and out, chassis ear results, wiring checks, etc.
All tech stories must have a clear cause. State it directly.
Write in natural first-person technician language. Sound like a real tech who did the work.
Vary sentence structure and phrasing between every repair line on the same vehicle.
Punch times must logically match the work described.

Vehicle information: Customer concern for this line: All repairs on this RO: Current repair line: Xentry test data and images: Write only the warranty story for this specific line. Make it sound completely human.`;

// ==================== STORY GENERATOR (Exact rules from prompt) ====================
function buildWarrantyStory(ro, line) {
  const v = ro.vehicle;
  const vehicleDesc = [v.year, v.model].filter(Boolean).join(' ') || 'the vehicle';
  const vin = v.vin || 'the vehicle VIN';
  const mileage = v.mileageIn || 'current';

  const concern = (line.customerConcern || line.description || 'the reported concern').trim();
  const notes = line.technicianNotes || '';
  const data = line.extractedData || { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] };

  const codesStr = data.codes.length ? data.codes.slice(0, 3).join(', ') : 'no active fault codes';
  const hasSpecifics = data.measurements.length > 0 || data.components.length > 0;

  const seed = (line._regenSeed || 0) + (line.lineNumber || 1);
  const v1 = seed % 4;
  const v2 = Math.floor(seed / 3) % 3;

  let story = '';

  const concernOpeners = [
    `Customer concern for this repair line was: ${concern}.`,
    `The customer reported ${concern.toLowerCase().replace(/^\w/, c => c.toLowerCase())}.`,
    `Vehicle presented with the following customer concern: ${concern}.`,
    `Per the repair order and customer interview, the primary issue was ${concern.toLowerCase()}.`
  ];
  story += concernOpeners[v1] + ' ';

  // REQUIRED
  story += 'I installed the battery charger and maintained system voltage above 12.5 volts for the entire duration of testing. ';

  // REQUIRED
  story += `An Xentry Quick Test was performed and all data was reviewed in Xentry under the vehicle’s VIN (${vin}) in the cloud-based server. Relevant codes retrieved included ${codesStr}. `;

  story += '\n\n';

  const causeOpeners = [
    'The root cause was isolated to',
    'After following the Guided Test procedures, the cause was determined to be',
    'Diagnostic steps confirmed the failure originated from',
    'Testing pointed directly to'
  ];
  story += causeOpeners[v2] + ' ';

  if (hasSpecifics) {
    if (data.measurements.length) {
      const meas = data.measurements[0];
      story += `${meas.label || 'the measured value'} of ${meas.value}. `;
    }
    if (data.components.length) {
      story += `This was confirmed on component ${data.components[0]}. `;
    }
    if (data.guidedTests.length > 1) {
      story += `The Guided Test "${data.guidedTests[1]}" showed out-of-specification results. `;
    }
    if (data.circuits.length) {
      story += `Wiring circuit ${data.circuits[0]} was verified with no continuity faults. `;
    }
  } else if (notes) {
    story += notes.slice(0, 160) + '. ';
  } else {
    story += 'component level testing results and live data review. ';
  }

  story += '\n\n';

  const corrections = [
    `Correction: ${line.description}.`,
    `I performed the correction by completing ${line.description.toLowerCase()}.`,
    `The repair was completed by ${line.description.toLowerCase()}.`,
    `Replaced/Repaired per the above diagnosis: ${line.description}.`
  ];
  story += corrections[(v1 + v2) % 4] + ' ';

  const roadTest = v.mileageOut && v.mileageIn ? 
    `Road test performed: ${parseInt(v.mileageOut) - parseInt(v.mileageIn) || 12} miles in and out. ` : 
    'Road test completed with no recurrence of the original concern. ';

  story += roadTest;

  const punch = line.punchTime || '1.0';
  story += `Total time for this line: ${punch} hrs.`;

  if (!story.toLowerCase().includes('cloud')) {
    story += ' All test results and Guided Test data remain available for review in the Xentry cloud server under this VIN.';
  }

  return story.replace(/\s{2,}/g, ' ').trim();
}

// ==================== REAL GROK API STORY GENERATOR ====================
async function generateStoryWithGrok(ro, line, apiKey) {
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const v = ro.vehicle || {};
  const vehicleInfo = [
    v.year,
    v.model,
    v.vin ? `VIN: ${v.vin}` : '',
    v.mileageIn ? `Mileage In: ${v.mileageIn}` : '',
    v.mileageOut ? `Mileage Out: ${v.mileageOut}` : ''
  ].filter(Boolean).join(' | ');

  const allRepairs = (ro.repairLines || [])
    .map((l, i) => `Line ${l.lineNumber || i + 1}: ${l.description}`)
    .join('\n');

  const currentLineText = `Line ${line.lineNumber}: ${line.description}`;
  const customerConcern = line.customerConcern || line.description || 'Not specified';
  const techNotes = line.technicianNotes || 'None provided';

  // Format extracted Xentry data nicely
  const data = line.extractedData || {};
  let xentryDataText = 'No Xentry diagnostic images or test data provided for this line.';
  if (data.codes?.length || data.guidedTests?.length || data.measurements?.length || data.components?.length) {
    xentryDataText = [
      data.codes?.length ? `SDS / DTC Codes: ${data.codes.join(', ')}` : '',
      data.guidedTests?.length ? `Guided Tests Performed: ${data.guidedTests.join(' | ')}` : '',
      data.measurements?.length ? `Key Measurements: ${data.measurements.map(m => `${m.label}: ${m.value}`).join('; ')}` : '',
      data.components?.length ? `Components: ${data.components.join(' | ')}` : '',
      data.circuits?.length ? `Circuits / Pins Referenced: ${data.circuits.join(', ')}` : ''
    ].filter(Boolean).join('\n');
  }

  const userPrompt = `Vehicle information: ${vehicleInfo || 'Not provided'}

All repairs on this RO:
${allRepairs || 'Only this line'}

Current repair line: ${currentLineText}

Customer concern for this line: ${customerConcern}

Technician notes / observations: ${techNotes}

Xentry test data and images:
${xentryDataText}

Write only the warranty story for this specific line following all the rules in the system prompt. Make it sound completely human and natural.`;

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [
        { role: 'system', content: WARRANTY_STORY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.75,
      max_tokens: 900
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) throw new Error('INVALID_API_KEY');
    if (response.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`API_ERROR: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const story = data.choices?.[0]?.message?.content?.trim();

  if (!story) {
    throw new Error('EMPTY_RESPONSE');
  }

  return story;
}

// ==================== XENTRY IMAGE ANALYSIS ====================
function extractXentryDataFromText(ocrText, existing = {}) {
  const result = {
    codes: [...(existing.codes || [])],
    guidedTests: [...(existing.guidedTests || [])],
    measurements: [...(existing.measurements || [])],
    components: [...(existing.components || [])],
    circuits: [...(existing.circuits || [])]
  };

  const upper = (ocrText || '').toUpperCase();

  // DTC codes
  const dtcRegex = /\b([BCUP]\d{4}(?:[-–]\d{3})?)\b/g;
  let m;
  while ((m = dtcRegex.exec(upper)) !== null) {
    if (!result.codes.includes(m[1])) result.codes.push(m[1]);
  }

  // Guided Tests
  const gtMatches = (ocrText || '').match(/Guided Test[:\s]*([A-Za-z0-9\s\-–/()]{6,70})/gi) || [];
  gtMatches.forEach(gt => {
    const clean = gt.replace(/Guided Test[:\s]*/i, '').trim();
    if (clean.length > 4 && !result.guidedTests.includes(clean)) result.guidedTests.push(clean);
  });

  // Measurements
  const voltMatches = (ocrText || '').match(/(\d{1,2}\.\d{1,2})\s*(?:V|VOLTS|PSI|BAR)/gi) || [];
  voltMatches.forEach((val) => {
    if (result.measurements.length < 6) {
      result.measurements.push({ label: `Measurement ${result.measurements.length + 1}`, value: val.trim() });
    }
  });

  // Mercedes component IDs
  const compRegex = /\b([A-Z]\d{1,2}\/\d{1,2}[A-Z]?(?:y\d)?)\b/g;
  while ((m = compRegex.exec(upper)) !== null) {
    const c = m[1];
    if (!result.components.some(x => x.includes(c))) {
      result.components.push(`${c} — Component referenced in test`);
    }
  }

  // Pins / circuits
  const pinMatches = (ocrText || '').match(/pin\s*(\d+(?:\.\d+)?)|circuit\s*(\d+(?:\.\d+)?)/gi) || [];
  pinMatches.forEach(p => {
    if (!result.circuits.includes(p)) result.circuits.push(p);
  });

  if (result.guidedTests.length === 0 && result.codes.length === 0) {
    result.guidedTests.push('Component test via Xentry');
  }

  return result;
}

// ==================== MAIN APP ====================
function App() {
  const [currentRO, setCurrentRO] = useState(null);
  const [currentLineId, setCurrentLineId] = useState(null);
  const [view, setView] = useState('home'); // home | ro | line | settings
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // Grok API Key (stored only locally)
  const [apiKey, setApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('benztech_current_ro');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCurrentRO(parsed);
        setView('ro');
      } catch (e) {}
    }

    // Load Grok API key
    const savedKey = localStorage.getItem('benztech_grok_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Persist RO
  const saveRO = (ro) => {
    if (ro) {
      localStorage.setItem('benztech_current_ro', JSON.stringify(ro));
    }
    setCurrentRO(ro);
  };

  const updateRO = (updater) => {
    setCurrentRO(prev => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      saveRO(updated);
      return updated;
    });
  };

  // ==================== NAVIGATION ====================
  const goHome = () => {
    setView('home');
    setCurrentLineId(null);
  };

  const showROScreen = () => {
    setView('ro');
    setCurrentLineId(null);
  };

  const openLineDetail = (lineId) => {
    setCurrentLineId(lineId);
    setView('line');
    haptic('light');
  };

  const closeLineDetail = () => {
    setCurrentLineId(null);
    setView('ro');
  };

  // ==================== SETTINGS NAVIGATION ====================
  const openSettings = () => setView('settings');
  const closeSettings = () => {
    if (currentRO) setView('ro');
    else setView('home');
  };

  // ==================== SAMPLE DATA ====================
  const loadSampleRO = () => {
    const sample = {
      id: 'RO-' + Date.now().toString(36).slice(-6).toUpperCase(),
      created: new Date().toISOString(),
      roNumber: 'R-2847193',
      vehicle: {
        vin: 'W1N4N4HB5PJ123456',
        year: '2024',
        model: 'GLE 450 4MATIC',
        mileageIn: '12480',
        mileageOut: '12512'
      },
      customer: { name: 'Michael R. Thompson', phone: '(310) 555-0182' },
      complaints: [
        'Intermittent hard start when engine is warm',
        'Check engine light came on yesterday after highway drive'
      ],
      repairLines: [
        {
          id: 'line1',
          lineNumber: 1,
          description: 'Diagnose and repair hard start / P0172 rich condition',
          customerConcern: 'Vehicle intermittently hard to start especially after driving 30+ minutes. Strong fuel smell on occasion.',
          technicianNotes: 'Road tested 14 miles in. Chassis ear on fuel pump showed slight whine at 48-51 Hz. Fuel pressure at rail 67 psi (spec 58-62).',
          xentryImages: [],
          extractedData: {
            codes: ['P0172 - Fuel Trim System Too Rich (Bank 1)', 'P0304 - Cylinder 4 Misfire Detected'],
            guidedTests: ['Test of fuel pressure regulator (A7/3y1)', 'Lambda sensor evaluation - B6/1'],
            measurements: [
              { label: 'Fuel rail pressure (warm engine)', value: '67.4 psi' },
              { label: 'O2 sensor B6/1 voltage at idle', value: '0.82 V (rich)' },
              { label: 'Battery voltage at SAM pin 30.2', value: '12.61 V' }
            ],
            components: ['A7/3 - Fuel pressure regulator (left side of engine)', 'B6/1 - Oxygen sensor upstream of cat'],
            circuits: ['Circuit 30 (constant battery)', 'Signal circuit pin 2 of B6/1']
          },
          warrantyStory: null,
          punchTime: '1.4'
        },
        {
          id: 'line2',
          lineNumber: 2,
          description: 'Replace fuel pressure regulator and reset adaptations',
          customerConcern: 'Same as line 1 — root cause suspected fuel pressure regulation.',
          technicianNotes: '',
          xentryImages: [],
          extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] },
          warrantyStory: null,
          punchTime: '0.6'
        }
      ]
    };
    saveRO(sample);
    showROScreen();
    haptic('medium');
    showToast('Sample RO loaded — ready for testing');
  };

  // ==================== CAMERA / SCAN ====================
  const startScanRepairOrder = () => {
    haptic('medium');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) handleCapturedImage(file);
    };
    input.click();
  };

  const handleCapturedImage = async (file) => {
    setIsProcessing(true);
    setOcrProgress(0);

    let extractedText = '';
    let usedOCR = false;

    try {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(m.progress * 100);
            setOcrProgress(pct);
          }
        }
      });
      const { data: { text } } = await worker.recognize(file);
      extractedText = text.trim();
      usedOCR = true;
      await worker.terminate();
    } catch (err) {
      console.warn('OCR failed, using fallback parsing');
    }

    setIsProcessing(false);
    createROFromExtractedText(extractedText, file, usedOCR);
  };

  const createROFromExtractedText = (text, sourceFile, usedOCR) => {
    const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const roNumberMatch = (text || '').match(/(?:RO|Repair Order|#)\s*[:#]?\s*([A-Z0-9-]{6,12})/i);
    const vinMatch = (text || '').match(/\b([A-HJ-NPR-Z0-9]{17})\b/);

    const complaintKeywords = /customer|complaint|concern|reported|stated|issue|problem/i;
    const possibleComplaints = lines.filter(l => complaintKeywords.test(l) && l.length > 18 && l.length < 180).slice(0, 3);

    const repairLineRegex = /^\s*(\d{1,2})[\.\)]\s+(.{12,})$/;
    const foundLines = [];
    let currentLineNum = 1;

    lines.forEach(l => {
      const m = l.match(repairLineRegex);
      if (m) {
        foundLines.push({
          id: 'line' + Date.now().toString(36) + foundLines.length,
          lineNumber: parseInt(m[1]) || currentLineNum++,
          description: m[2].trim().slice(0, 110),
          customerConcern: '',
          technicianNotes: '',
          xentryImages: [],
          extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] },
          warrantyStory: null,
          punchTime: '0.8'
        });
      }
    });

    if (foundLines.length === 0) {
      const longLines = lines.filter(l => l.length > 35 && l.length < 130 && !/VIN|RO|mileage|date/i.test(l)).slice(0, 3);
      longLines.forEach((l, idx) => {
        foundLines.push({
          id: 'line' + Date.now().toString(36) + idx,
          lineNumber: idx + 1,
          description: l.slice(0, 95),
          customerConcern: possibleComplaints[idx] || l,
          technicianNotes: '',
          xentryImages: [],
          extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] },
          warrantyStory: null,
          punchTime: (0.7 + idx * 0.3).toFixed(1)
        });
      });
    }

    const newRO = {
      id: 'RO-' + Date.now().toString(36).slice(-6).toUpperCase(),
      created: new Date().toISOString(),
      roNumber: roNumberMatch ? roNumberMatch[1] : 'R-' + Math.floor(100000 + Math.random() * 900000),
      vehicle: { vin: vinMatch ? vinMatch[1] : '', year: '', model: '', mileageIn: '', mileageOut: '' },
      customer: { name: '', phone: '' },
      complaints: possibleComplaints.length ? possibleComplaints : (text?.length > 40 ? [text.slice(0, 160)] : ['See attached repair order']),
      repairLines: foundLines.length ? foundLines : [{
        id: 'line1', lineNumber: 1, description: 'See full repair order text',
        customerConcern: (text || '').slice(0, 220), technicianNotes: usedOCR ? 'OCR extracted — review and refine' : 'Manual review required',
        xentryImages: [], extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] },
        warrantyStory: null, punchTime: '1.0'
      }]
    };

    saveRO(newRO);
    showROScreen();
    showToast(usedOCR ? 'OCR complete — lines extracted' : 'RO loaded — review text');
  };

  const showManualEntry = () => {
    const newRO = {
      id: 'RO-' + Date.now().toString(36).slice(-6).toUpperCase(),
      created: new Date().toISOString(),
      roNumber: 'R-' + Math.floor(1000000 + Math.random() * 900000),
      vehicle: { vin: '', year: '', model: '', mileageIn: '', mileageOut: '' },
      customer: { name: '', phone: '' },
      complaints: [],
      repairLines: []
    };
    saveRO(newRO);
    showROScreen();
    setTimeout(() => editVehicleInfo(true), 450);
  };

  // ==================== VEHICLE EDIT ====================
  const editVehicleInfo = (focusVIN = false) => {
    if (!currentRO) return;
    const ro = currentRO;

    const name = prompt('Customer name:', ro.customer.name || '') || ro.customer.name;
    const roNum = prompt('Repair Order #:', ro.roNumber) || ro.roNumber;
    const year = prompt('Year:', ro.vehicle.year) || ro.vehicle.year;
    const model = prompt('Model:', ro.vehicle.model) || ro.vehicle.model;
    const vin = prompt('VIN:', ro.vehicle.vin) || ro.vehicle.vin;
    const miIn = prompt('Mileage In:', ro.vehicle.mileageIn) || ro.vehicle.mileageIn;
    const miOut = prompt('Mileage Out:', ro.vehicle.mileageOut) || ro.vehicle.mileageOut;

    const updated = {
      ...ro,
      roNumber: roNum,
      customer: { ...ro.customer, name },
      vehicle: { ...ro.vehicle, year, model, vin: vin.toUpperCase(), mileageIn: miIn, mileageOut: miOut }
    };
    saveRO(updated);
    showToast('Vehicle info updated');
  };

  // ==================== REPAIR LINES ====================
  const addNewRepairLine = () => {
    if (!currentRO) return;
    const newLine = {
      id: 'line_' + Date.now().toString(36),
      lineNumber: currentRO.repairLines.length + 1,
      description: 'New repair item — tap to edit',
      customerConcern: '',
      technicianNotes: '',
      xentryImages: [],
      extractedData: { codes: [], guidedTests: [], measurements: [], components: [], circuits: [] },
      warrantyStory: null,
      punchTime: '0.8'
    };
    const updated = { ...currentRO, repairLines: [...currentRO.repairLines, newLine] };
    saveRO(updated);
    setTimeout(() => openLineDetail(newLine.id), 60);
  };

  const getCurrentLine = () => {
    if (!currentRO || !currentLineId) return null;
    return currentRO.repairLines.find(l => l.id === currentLineId);
  };

  // ==================== LINE UPDATES ====================
  const updateLineField = (field, value) => {
    if (!currentRO || !currentLineId) return;
    updateRO(ro => ({
      ...ro,
      repairLines: ro.repairLines.map(line =>
        line.id === currentLineId ? { ...line, [field]: value } : line
      )
    }));
  };

  const updatePunchTime = (value) => {
    updateLineField('punchTime', value);
  };

  // ==================== XENTRY IMAGES ====================
  const uploadXentryImages = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length || !currentLineId) return;

      const line = getCurrentLine();
      if (!line) return;

      const newImages = [];
      for (const file of files) {
        const dataUrl = await new Promise(res => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.readAsDataURL(file);
        });
        newImages.push({ id: 'img_' + Date.now() + Math.random(), name: file.name, dataUrl });
      }

      updateRO(ro => ({
        ...ro,
        repairLines: ro.repairLines.map(l =>
          l.id === currentLineId
            ? { ...l, xentryImages: [...(l.xentryImages || []), ...newImages] }
            : l
        )
      }));
      showToast(`${files.length} image(s) added`);
    };
    input.click();
  };

  const removeXentryImage = (idx) => {
    if (!currentLineId) return;
    updateRO(ro => ({
      ...ro,
      repairLines: ro.repairLines.map(l =>
        l.id === currentLineId
          ? { ...l, xentryImages: l.xentryImages.filter((_, i) => i !== idx) }
          : l
      )
    }));
  };

  const analyzeXentryImages = async () => {
    const line = getCurrentLine();
    if (!line || !line.xentryImages?.length) {
      showToast('Upload Xentry screenshots first', 'error');
      return;
    }

    let combined = '';
    for (const img of line.xentryImages) {
      try {
        const worker = await Tesseract.createWorker('eng');
        const { data: { text } } = await worker.recognize(img.dataUrl);
        combined += '\n' + text;
        await worker.terminate();
      } catch (e) {}
    }

    const extracted = extractXentryDataFromText(combined, line.extractedData);
    updateRO(ro => ({
      ...ro,
      repairLines: ro.repairLines.map(l =>
        l.id === currentLineId ? { ...l, extractedData: extracted } : l
      )
    }));
    haptic('success');
    showToast('Analysis complete — data extracted');
  };

  const addManualDataItem = () => {
    const line = getCurrentLine();
    if (!line) return;

    const type = prompt('Type? (code / test / measurement / component / circuit)', 'measurement');
    if (!type) return;

    let key = 'measurements';
    if (type.includes('code')) key = 'codes';
    else if (type.includes('test')) key = 'guidedTests';
    else if (type.includes('component')) key = 'components';
    else if (type.includes('circuit')) key = 'circuits';

    let value;
    if (key === 'measurements') {
      const label = prompt('Label:', 'Voltage at connector X254');
      const val = prompt('Value:', '12.58 V');
      if (!label || !val) return;
      value = { label, value: val };
    } else {
      value = prompt('Enter value:', '');
      if (!value) return;
    }

    updateRO(ro => ({
      ...ro,
      repairLines: ro.repairLines.map(l => {
        if (l.id !== currentLineId) return l;
        return {
          ...l,
          extractedData: {
            ...l.extractedData,
            [key]: [...(l.extractedData?.[key] || []), value]
          }
        };
      })
    }));
  };

  // ==================== WARRANTY STORIES ====================
  const generateWarrantyStoryForCurrentLine = async () => {
    const line = getCurrentLine();
    if (!line || !currentRO) return;

    if (!apiKey) {
      openSettings();
      showToast('Please add your Grok API key in Settings first', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const story = await generateStoryWithGrok(currentRO, line, apiKey);
      updateRO(ro => ({
        ...ro,
        repairLines: ro.repairLines.map(l =>
          l.id === currentLineId ? { ...l, warrantyStory: story } : l
        )
      }));
      haptic('success');
      showToast('Real warranty story generated with Grok');
    } catch (err) {
      console.error('Grok API error:', err);
      if (err.message === 'NO_API_KEY' || err.message === 'INVALID_API_KEY') {
        showToast('Invalid or missing Grok API key. Check Settings.', 'error');
        openSettings();
      } else if (err.message === 'RATE_LIMIT') {
        showToast('Rate limit reached. Please wait a moment and try again.', 'error');
      } else if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('CORS') || err.message.includes('Network')) {
        showToast('Network/CORS error. Check your internet connection or try from a different network. Falling back to template.', 'error');
        const fallback = buildWarrantyStory(currentRO, line);
        updateRO(ro => ({
          ...ro,
          repairLines: ro.repairLines.map(l =>
            l.id === currentLineId ? { ...l, warrantyStory: fallback } : l
          )
        }));
      } else {
        showToast('Failed to generate with Grok. Using template fallback.', 'error');
        const fallback = buildWarrantyStory(currentRO, line);
        updateRO(ro => ({
          ...ro,
          repairLines: ro.repairLines.map(l =>
            l.id === currentLineId ? { ...l, warrantyStory: fallback } : l
          )
        }));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateStory = async () => {
    const line = getCurrentLine();
    if (!line || !currentRO) return;

    if (!apiKey) {
      openSettings();
      showToast('Add your Grok API key in Settings to regenerate with AI', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const updatedLine = { ...line, _regenSeed: Date.now() };
      const story = await generateStoryWithGrok(currentRO, updatedLine, apiKey);
      updateRO(ro => ({
        ...ro,
        repairLines: ro.repairLines.map(l =>
          l.id === currentLineId ? { ...updatedLine, warrantyStory: story } : l
        )
      }));
      haptic('success');
      showToast('New AI-generated variation');
    } catch (err) {
      showToast('Grok regeneration failed. Try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyStoryToClipboard = () => {
    const line = getCurrentLine();
    if (!line?.warrantyStory) return;

    navigator.clipboard.writeText(line.warrantyStory).then(() => {
      haptic('medium');
      showToast('Copied to clipboard — ready for Xentry');
    }).catch(() => {
      showToast('Copy failed — select and copy manually');
    });
  };

  const generateAllStories = async () => {
    if (!currentRO) return;

    if (!apiKey) {
      openSettings();
      showToast('Add your Grok API key in Settings to generate real stories', 'error');
      return;
    }

    if (!confirm(`Generate real AI stories for all ${currentRO.repairLines.length} lines using Grok? This may take 10-30 seconds.`)) {
      return;
    }

    setIsGenerating(true);
    let count = 0;
    const updatedLines = [];

    for (const [index, line] of currentRO.repairLines.entries()) {
      try {
        const l = { ...line, _regenSeed: 9000 + (index * 137) };
        l.warrantyStory = await generateStoryWithGrok(currentRO, l, apiKey);
        updatedLines.push(l);
        count++;
      } catch (err) {
        // Fallback for this line
        const fallback = buildWarrantyStory(currentRO, line);
        updatedLines.push({ ...line, warrantyStory: fallback });
      }
    }

    const updated = { ...currentRO, repairLines: updatedLines };
    saveRO(updated);
    setIsGenerating(false);
    haptic('success');
    showToast(`${count} real AI warranty stories generated with Grok`);
  };

  // ==================== RENDER HELPERS ====================
  const currentLine = getCurrentLine();

  // ==================== API KEY HANDLERS ====================
  const saveApiKey = (newKey) => {
    const trimmed = newKey.trim();
    setApiKey(trimmed);
    if (trimmed) {
      localStorage.setItem('benztech_grok_api_key', trimmed);
      showToast('Grok API key saved locally');
    } else {
      localStorage.removeItem('benztech_grok_api_key');
    }
    // Don't auto close - user can tap Back
  };

  const clearApiKey = () => {
    setApiKey('');
    localStorage.removeItem('benztech_grok_api_key');
    showToast('API key cleared');
  };

  const testApiKey = async () => {
    if (!apiKey) {
      showToast('Please enter an API key first', 'error');
      return;
    }
    try {
      const res = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [{ role: 'user', content: 'Reply with exactly: "BenzTech API test successful"' }],
          max_tokens: 20
        })
      });
      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (text.toLowerCase().includes('successful')) {
        showToast('API key works! Grok is reachable.');
      } else {
        showToast('Key accepted but unexpected response. Check key permissions.');
      }
    } catch (e) {
      console.error(e);
      showToast('Test failed — possible invalid key, CORS block, or no internet.', 'error');
    }
  };

  const renderRepairLinesList = () => {
    if (!currentRO?.repairLines?.length) {
      return (
        <div className="ios-card p-5 text-center text-[#8e8e93]">
          No repair lines yet.<br />
          <button onClick={addNewRepairLine} className="mt-3 text-[#0a84ff] font-bold text-sm">ADD FIRST LINE</button>
        </div>
      );
    }

    return currentRO.repairLines.map(line => {
      const hasStory = !!line.warrantyStory;
      const hasNotes = line.technicianNotes?.trim().length > 3;
      const hasXentry = line.xentryImages?.length > 0;
      const hasExtracted = line.extractedData && (line.extractedData.codes?.length || line.extractedData.guidedTests?.length);

      let status = <span className="status-pill bg-[#2a2a2c] text-[#8e8e93]">NEW</span>;
      if (hasStory) status = <span className="status-pill bg-[#0a3c1f] text-[#30d158]">STORY READY</span>;
      else if (hasExtracted || hasNotes || hasXentry) status = <span className="status-pill bg-[#2a2a2c] text-[#ff9f0a]">IN PROGRESS</span>;

      return (
        <div key={line.id} className="repair-line ios-card px-4 py-[13px] flex items-center gap-x-3 active:bg-[#252528]" onClick={() => openLineDetail(line.id)}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-x-2">
              <div className="font-mono text-[11px] text-[#8e8e93] w-5 shrink-0">L{line.lineNumber}</div>
              <div className="font-semibold text-[15px] truncate">{line.description}</div>
            </div>
            <div className="pl-7 text-xs text-[#8e8e93] truncate mt-px">{line.customerConcern || 'Tap to add customer concern'}</div>
          </div>
          <div className="flex flex-col items-end gap-y-1 shrink-0">
            {status}
            <div className="flex items-center gap-x-px text-[10px] text-[#8e8e93]">
              {hasXentry && <span className="px-1">📷</span>}
              {hasExtracted && <span className="px-1">📊</span>}
              {hasNotes && <span className="px-1">✎</span>}
            </div>
          </div>
        </div>
      );
    });
  };

  // ==================== VIEWS ====================
  if (view === 'home') {
    return (
      <div className="app-container mx-auto min-h-dvh flex flex-col bg-[#0a0a0a] text-[#f5f5f7]">
        <header className="ios-header sticky top-0 z-50 safe-top px-5 h-14 flex items-center justify-end">
          <button onClick={() => openSettings()} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-[#2c2c2e] text-[#8e8e93]">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 002.572 1.065c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-2.572-1.065c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="mb-8">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-[#1f1f22] to-[#111113] border border-[#3a3a3c] flex items-center justify-center mb-4 shadow-2xl">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div className="text-4xl font-bold tracking-[-1.2px]">BenzTech</div>
            <div className="text-[#8e8e93] mt-0.5 text-[15px]">Mercedes-Benz Technician Assistant</div>
          </div>

          <div className="w-full max-w-[320px]">
            <button onClick={startScanRepairOrder} className="w-full big-primary-btn flex items-center justify-center gap-x-3 bg-[#0a84ff] active:bg-[#0066cc] shadow-[0_6px_20px_rgba(10,132,255,0.35)] text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>SCAN REPAIR ORDER</span>
            </button>
            <div className="mt-3 text-[11px] text-[#8e8e93] font-medium tracking-[0.3px]">TAP TO OPEN CAMERA • OCR AUTO-RUNS</div>

            <div className="flex gap-x-3 mt-4">
              <button onClick={loadSampleRO} className="flex-1 ios-button h-12 rounded-2xl text-sm font-semibold active:scale-[0.985]">LOAD SAMPLE RO</button>
              <button onClick={showManualEntry} className="flex-1 ios-button h-12 rounded-2xl text-sm font-semibold active:scale-[0.985]">MANUAL ENTRY</button>
            </div>
          </div>
        </div>

        <div className="text-center pb-8">
          <div className="inline-flex items-center gap-x-2 px-4 py-1.5 bg-[#1c1c1e] border border-[#2c2c2e] rounded-2xl text-xs text-[#8e8e93]">
            <div className="w-1.5 h-1.5 bg-[#30d158] rounded-full animate-pulse"></div>
            STORY GENERATION REQUIRES INTERNET + API KEY
          </div>
        </div>

        {/* Toast container */}
        <div id="toast-root" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[460px] px-4" />

      </div>
    );
  }

  if (view === 'ro' && currentRO) {
    return (
      <div className="app-container mx-auto min-h-dvh flex flex-col bg-[#0a0a0a] text-[#f5f5f7]">
        <header className="ios-header sticky top-0 z-50 safe-top">
          <div className="px-4 h-14 flex items-center justify-between">
            <button onClick={goHome} className="flex items-center gap-x-1 text-[#0a84ff] font-semibold pl-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              <span className="font-bold">Home</span>
            </button>
            <div className="text-center">
              <div className="font-bold text-[17px] tracking-[-0.3px]">{currentRO.roNumber}</div>
              <div className="text-[12px] text-[#8e8e93] -mt-0.5">{[currentRO.vehicle.year, currentRO.vehicle.model].filter(Boolean).join(' ') || 'Vehicle details pending'}</div>
            </div>
            <div className="flex items-center gap-x-2">
              <button onClick={() => editVehicleInfo()} className="px-3 py-1.5 text-xs font-bold rounded-full bg-[#2c2c2e] active:bg-[#38383a]">EDIT</button>
              <button onClick={() => openSettings()} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-[#2c2c2e] text-[#8e8e93]" title="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 002.572 1.065c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-2.572-1.065c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6 space-y-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Vehicle + Complaints */}
          <div>
            <div className="section-header px-1 mb-2">VEHICLE &amp; COMPLAINTS</div>
            <div className="ios-card p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-[15px]">{currentRO.customer.name || 'Customer name pending'}</div>
                  <div className="text-sm text-[#8e8e93]">{[currentRO.vehicle.year, currentRO.vehicle.model].filter(Boolean).join(' ') || '—'}</div>
                  <div className="tech-mono text-xs text-[#8e8e93] mt-0.5">{currentRO.vehicle.vin || 'VIN not captured'}</div>
                </div>
                <div className="data-pill text-[#ff9f0a] font-mono">{currentRO.vehicle.mileageIn ? `${currentRO.vehicle.mileageIn} mi` : '— mi'}</div>
              </div>
              <div className="pt-2 border-t border-[#38383a]">
                <div className="text-xs font-semibold tracking-widest text-[#8e8e93] mb-1.5 px-0.5">CUSTOMER CONCERNS</div>
                <div className="text-[14.5px] leading-snug space-y-1 text-[#d1d1d6]">
                  {currentRO.complaints.length ? currentRO.complaints.map((c, i) => <div key={i} className="flex gap-x-2"><span className="text-[#0a84ff] mt-1">•</span><span>{c}</span></div>) : <div className="text-[#8e8e93] italic">No complaints parsed.</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Repair Lines */}
          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="section-header">REPAIR LINES <span className="font-mono text-[#8e8e93]">({currentRO.repairLines.length})</span></div>
              <button onClick={addNewRepairLine} className="text-xs font-bold flex items-center gap-x-1 text-[#0a84ff] active:opacity-70">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                <span>ADD LINE</span>
              </button>
            </div>
            <div className="space-y-2">{renderRepairLinesList()}</div>
          </div>
        </div>

        <div className="px-5 pt-2 pb-5 safe-bottom border-t border-[#38383a] bg-[#0a0a0a]">
          <button 
            onClick={generateAllStories} 
            disabled={isGenerating}
            className="w-full h-14 rounded-2xl flex items-center justify-center gap-x-2 bg-[#2c2c2e] active:bg-[#38383a] text-sm font-semibold border border-[#3a3a3c] disabled:opacity-70"
          >
            {isGenerating ? 'GENERATING WITH GROK...' : 'GENERATE ALL WARRANTY STORIES'}
          </button>
        </div>

        <div id="toast-root" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[460px] px-4" />

      </div>
    );
  }

  // LINE DETAIL VIEW
  if (view === 'line' && currentLine && currentRO) {
    return (
      <div className="app-container mx-auto min-h-dvh flex flex-col bg-[#0a0a0a] text-[#f5f5f7]">
        <header className="ios-header sticky top-0 z-50 safe-top">
          <div className="px-4 h-14 flex items-center">
            <button onClick={closeLineDetail} className="flex items-center gap-x-1 text-[#0a84ff] font-semibold pl-1 pr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.25"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              <span className="font-bold">Back</span>
            </button>
            <div className="flex-1 text-center pr-8 relative">
              <button onClick={() => openSettings()} className="absolute right-4 top-3 w-8 h-8 flex items-center justify-center rounded-full active:bg-[#2c2c2e] text-[#8e8e93]" title="API Settings">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 002.572 1.065c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-2.572-1.065c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
              <div className="font-mono text-[#0a84ff] text-sm">LINE {currentLine.lineNumber}</div>
              <div className="text-base leading-none font-semibold">{currentLine.description}</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8 space-y-5" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
          {/* Customer Concern */}
          <div>
            <div className="section-header mb-1.5 px-1">CUSTOMER CONCERN — THIS LINE</div>
            <textarea value={currentLine.customerConcern || ''} onChange={(e) => updateLineField('customerConcern', e.target.value)} rows={2} placeholder="Customer stated..." className="ios-textarea w-full text-[15px] resize-y min-h-[62px]" />
          </div>

          {/* Notes */}
          <div>
            <div className="flex justify-between items-center px-1 mb-1.5">
              <div className="section-header">TECHNICIAN NOTES</div>
              <div className="text-[10px] text-[#8e8e93]">AUTOSAVED</div>
            </div>
            <textarea value={currentLine.technicianNotes || ''} onChange={(e) => updateLineField('technicianNotes', e.target.value)} rows={4} placeholder="Road test results, chassis ear findings..." className="ios-textarea w-full text-[15px] leading-snug" />
          </div>

          {/* Xentry Images */}
          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <div>
                <div className="section-header">XENTRY DIAGNOSTIC IMAGES</div>
                <div className="text-[11px] text-[#8e8e93]">Upload screenshots • auto-analyzed</div>
              </div>
              <button onClick={uploadXentryImages} className="px-4 h-9 flex items-center gap-x-1.5 text-xs font-bold rounded-2xl ios-button">UPLOAD</button>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3">
              {currentLine.xentryImages?.length > 0 ? currentLine.xentryImages.map((img, idx) => (
                <div key={idx} className="relative group" onClick={() => window.open(img.dataUrl)}>
                  <img src={img.dataUrl} className="w-full aspect-square object-cover rounded-xl border border-[#38383a]" />
                  <button onClick={(e) => { e.stopPropagation(); removeXentryImage(idx); }} className="absolute -top-1 -right-1 bg-[#ff3b30] text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">×</button>
                </div>
              )) : <div className="col-span-4 text-xs text-[#8e8e93] py-2 text-center border border-dashed border-[#38383a] rounded-2xl">No Xentry images uploaded yet</div>}
            </div>

            <button onClick={analyzeXentryImages} className="w-full h-11 mb-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-x-2 border border-[#3a3a3c] bg-[#1f1f22] active:bg-[#2c2c2e]">
              ANALYZE UPLOADED IMAGES
            </button>

            {/* Extracted Data */}
            {currentLine.extractedData && (currentLine.extractedData.codes?.length || currentLine.extractedData.guidedTests?.length || currentLine.extractedData.measurements?.length) && (
              <div>
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="section-header">EXTRACTED TEST DATA</div>
                  <button onClick={addManualDataItem} className="text-[#0a84ff] text-xs font-bold">+ ADD ITEM</button>
                </div>
                <div className="space-y-2 text-sm">
                  {currentLine.extractedData.codes?.map((c, i) => <div key={i} className="extracted-item px-3 py-2 flex justify-between"><span>{c}</span><button onClick={() => { /* simple remove */ }} className="text-[#ff3b30]">×</button></div>)}
                  {currentLine.extractedData.guidedTests?.map((g, i) => <div key={i} className="extracted-item px-3 py-2 flex justify-between"><span>{g}</span><button onClick={() => {}} className="text-[#ff3b30]">×</button></div>)}
                  {currentLine.extractedData.measurements?.map((m, i) => <div key={i} className="extracted-item px-3 py-2 flex justify-between"><span>{m.label}: {m.value}</span><button onClick={() => {}} className="text-[#ff3b30]">×</button></div>)}
                </div>
              </div>
            )}
          </div>

          {/* Punch Time */}
          <div className="pt-1">
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="section-header">PUNCH TIME (HRS)</div>
              <input type="text" value={currentLine.punchTime || '1.0'} onChange={(e) => updatePunchTime(e.target.value)} className="ios-input w-20 text-center py-1 text-sm font-mono" />
            </div>

            <button 
              onClick={generateWarrantyStoryForCurrentLine} 
              disabled={isGenerating}
              className="w-full h-[58px] rounded-[18px] flex items-center justify-center gap-x-3 bg-gradient-to-r from-[#0a84ff] to-[#0077e6] text-white font-extrabold text-[15.5px] tracking-[-0.2px] shadow-[0_4px_18px_rgba(10,132,255,0.4)] active:scale-[0.985] disabled:opacity-70 disabled:cursor-wait"
            >
              {isGenerating ? 'GENERATING WITH GROK...' : 'GENERATE WARRANTY STORY'}
            </button>
          </div>

          {/* Story Output */}
          {currentLine.warrantyStory && (
            <div className="pt-2">
              <div className="section-header px-1 mb-2">WARRANTY STORY</div>
              <div className="story-card p-5 text-[14.8px]">
                <div className="warranty-story leading-relaxed whitespace-pre-line">{currentLine.warrantyStory}</div>
              </div>
              <div className="flex gap-x-3 mt-3">
                <button onClick={copyStoryToClipboard} className="flex-1 h-12 flex items-center justify-center gap-x-2 rounded-2xl bg-[#2c2c2e] active:bg-[#38383a] font-semibold text-sm border border-[#3a3a3c]">COPY TO CLIPBOARD</button>
                <button onClick={regenerateStory} className="h-12 px-5 flex items-center justify-center rounded-2xl bg-[#2c2c2e] active:bg-[#38383a] font-semibold text-sm border border-[#3a3a3c]">REGENERATE</button>
              </div>
            </div>
          )}
        </div>

        <div id="toast-root" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[460px] px-4" />

      </div>
    );
  }

  // ==================== SETTINGS SCREEN ====================
  if (view === 'settings') {
    return (
      <div className="app-container mx-auto min-h-dvh flex flex-col bg-[#0a0a0a] text-[#f5f5f7]">
        <header className="ios-header sticky top-0 z-50 safe-top">
          <div className="px-4 h-14 flex items-center">
            <button onClick={closeSettings} className="flex items-center gap-x-1 text-[#0a84ff] font-semibold pl-1 pr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.25">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-bold">Back</span>
            </button>
            <div className="flex-1 text-center pr-12">
              <div className="font-bold text-[17px]">Settings</div>
              <div className="text-[10px] text-[#8e8e93] -mt-0.5">v1.4.0</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-8 space-y-6" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
          {/* Grok API Key Section */}
          <div className="ios-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold text-[17px]">Grok API Key</div>
                <div className="text-xs text-[#8e8e93]">Stored only in your browser (localStorage)</div>
              </div>
              {apiKey && (
                <div className="text-[10px] px-3 py-1 rounded-full bg-[#0a3c1f] text-[#30d158] font-bold tracking-wider">CONNECTED</div>
              )}
            </div>

            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="xai-YourKeyHere..."
              className="ios-input w-full font-mono text-sm tracking-[1px] mb-4"
            />

            <div className="flex gap-x-3">
              <button 
                onClick={() => saveApiKey(apiKey)}
                className="flex-1 h-12 rounded-2xl bg-[#0a84ff] active:bg-[#0066cc] font-bold text-sm"
              >
                SAVE KEY
              </button>
              {apiKey && (
                <>
                  <button 
                    onClick={testApiKey}
                    className="flex-1 h-12 rounded-2xl bg-[#2c2c2e] active:bg-[#38383a] font-semibold text-sm"
                  >
                    TEST CONNECTION
                  </button>
                  <button 
                    onClick={clearApiKey}
                    className="px-6 h-12 rounded-2xl bg-[#3a2a2a] active:bg-[#4a3a3a] font-semibold text-sm text-[#ff9f0a]"
                  >
                    CLEAR
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="ios-card p-5 text-sm leading-relaxed text-[#d1d1d6]">
            <div className="font-semibold text-[#f5f5f7] mb-2">How to get your key</div>
            <ol className="list-decimal pl-5 space-y-1 text-[13px]">
              <li>Go to <span className="text-[#0a84ff] font-medium">console.x.ai</span></li>
              <li>Create or log into your xAI account</li>
              <li>Generate an API key (starts with xai-)</li>
              <li>Paste it above and tap Save</li>
            </ol>
            <div className="mt-4 pt-4 border-t border-[#38383a] text-xs text-[#8e8e93]">
              Real warranty stories are generated by calling the Grok API directly from your device using the prompt below. The key is never sent to any server except the official Grok API.
            </div>
          </div>

          <div className="text-center text-[11px] text-[#8e8e93] px-4">
            Story generation requires a working internet connection.<br />
            Without a valid key, the app will use a local template as fallback.
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return <div className="p-8 text-center">Loading BenzTech...</div>;
}

export default App;
