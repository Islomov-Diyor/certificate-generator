// Minimal Konva-based editor client
// Exposes: upload template, add draggable markers for fields, save/load positions, preview PDF

const stageParent = document.getElementById('stage-parent');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const saveBtn = document.getElementById('save-btn');
const exportBtn = document.getElementById('export-btn');
const previewBtn = document.getElementById('preview-btn');
const suggestBtn = document.getElementById('suggest-btn');
const fieldsList = document.getElementById('fields-list');
const sampleDataEl = document.getElementById('sample-data');
const importJson = document.getElementById('import-json');

const FIELD_DEFINITIONS = [
  { key: 'recipient_name', label: 'Recipient Name' },
  { key: 'course_name', label: 'Course Name' },
  { key: 'teacher_name', label: 'Teacher Name' },
  { key: 'reg_number', label: 'Registration Number' },
  { key: 'date', label: 'Date' }
];

let stage, layer, imageNode, templateMeta = null;
let fieldNodes = {}; // key -> { group, shape, text }

function initStage(width = 794, height = 1123) {
  if (stage) stage.destroy();
  
  stage = new Konva.Stage({
    container: 'stage-parent',
    width: width,
    height: height
  });
  
  layer = new Konva.Layer();
  stage.add(layer);
  
  // draw center guide lines
  const centerV = new Konva.Line({ points: [width/2, 0, width/2, height], stroke: 'rgba(0,0,0,0.06)', strokeWidth:1 });
  const centerH = new Konva.Line({ points: [0, height/2, width, height/2], stroke: 'rgba(0,0,0,0.06)', strokeWidth:1 });
  layer.add(centerV);
  layer.add(centerH);
  layer.draw();
}

function createFieldListUI() {
  fieldsList.innerHTML = '';
  FIELD_DEFINITIONS.forEach(def => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<div><strong>${def.label}</strong><div class="small">${def.key}</div></div><div><button class="btn" data-key="${def.key}">Add</button></div>`;
    fieldsList.appendChild(row);
    row.querySelector('button').addEventListener('click', () => {
      addFieldMarker(def.key, def.label);
    });
  });
}

function addFieldMarker(key, label, options = {}) {
  if (!layer) return;
  
  if (fieldNodes[key]) {
    // focus existing
    const group = fieldNodes[key].group;
    stage.to({ x: -Math.max(0, group.x() - stage.width()/2), duration: 0.1 });
    return;
  }
  
  const x = options.x || stage.width()/2;
  const y = options.y || stage.height()/2;
  
  const group = new Konva.Group({
    x, y, draggable: true, id: 'field-' + key
  });
  
  const circle = new Konva.Circle({
    x: 0, y: 0, radius: 8, fill: '#ef4444'
  });
  
  const box = new Konva.Rect({
    x: 12, y: -18, width: 220, height: 36, fill: 'rgba(0,0,0,0.02)', stroke: 'rgba(0,0,0,0.08)', cornerRadius:6
  });
  
  const text = new Konva.Text({
    x: 20, y: -14, text: label, fontSize: 13, fontFamily: 'Arial', fill:'#111'
  });
  
  group.add(circle);
  group.add(box);
  group.add(text);
  
  // add change handlers for snapping to center
  group.on('dragmove', function() {
    // snap to center lines if close
    const snapDistance = 8;
    const gx = group.x(), gy = group.y();
    if (Math.abs(gx - stage.width()/2) < snapDistance) {
      group.x(stage.width()/2);
    }
    if (Math.abs(gy - stage.height()/2) < snapDistance) {
      group.y(stage.height()/2);
    }
    layer.batchDraw();
  });
  
  layer.add(group);
  fieldNodes[key] = { group, circle, box, text, anchor: 'center', unit: 'percent' };
  
  // double click to remove
  group.on('dblclick dbltap', () => {
    group.destroy();
    delete fieldNodes[key];
    layer.draw();
  });
  
  layer.draw();
}

function exportPositions() {
  if (!templateMeta) {
    alert('Upload a template first');
    return;
  }
  
  const positions = {};
  Object.entries(fieldNodes).forEach(([key, n]) => {
    const g = n.group;
    const unit = 'percent';
    const xPct = Math.round((g.x() / stage.width()) * 10000) / 100.0;
    const yPct = Math.round((g.y() / stage.height()) * 10000) / 100.0;
    positions[key] = { x: xPct, y: yPct, unit: unit, anchor: n.anchor, max_width: 80 };
  });
  
  const out = { template_id: templateMeta.template_id, positions };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = templateMeta.template_id + '.json'; document.body.appendChild(a); a.click(); a.remove();
}

function savePositionsToServer() {
  if (!templateMeta) {
    alert('Upload template first');
    return;
  }
  
  const positions = {};
  Object.entries(fieldNodes).forEach(([key, n]) => {
    const g = n.group;
    positions[key] = { x: Math.round((g.x() / stage.width()) * 10000) / 100.0, y: Math.round((g.y() / stage.height()) * 10000) / 100.0, unit: 'percent', anchor: n.anchor, max_width: 80 };
  });
  
  fetch('/editor/save_positions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ template_id: templateMeta.template_id, positions })
  }).then(r => r.json()).then(j => {
    if (j.ok) alert('Positions saved');
    else alert('Save failed');
  });
}

function uploadTemplateFile(file) {
  const fd = new FormData();
  fd.append('template', file, file.name);
  fetch('/editor/upload_template', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(j => {
      if (j.template_id) {
        templateMeta = j;
        loadTemplateImage(j.url, j.width, j.height);
      } else {
        alert('Upload failed');
      }
    }).catch(e => { console.error(e); alert('Upload error'); });
}

function loadTemplateImage(url, w, h) {
  // set the stage size to image size (max cap for performance) or scale down for display
  const MAX_W = 900;
  const scale = Math.min(1, MAX_W / w);
  const displayW = Math.round(w * scale);
  const displayH = Math.round(h * scale);
  
  initStage(displayW, displayH);
  
  const img = new Image();
  img.onload = function() {
    const kImage = new Konva.Image({
      image: img,
      x: 0, y: 0, width: displayW, height: displayH
    });
    layer.add(kImage);
    imageNode = kImage;
    layer.draw();
  };
  img.src = url;
}

uploadBtn.addEventListener('click', () => {
  const f = fileInput.files[0];
  if (!f) return alert('Choose a file first');
  uploadTemplateFile(f);
});

exportBtn.addEventListener('click', exportPositions);
saveBtn.addEventListener('click', savePositionsToServer);

previewBtn.addEventListener('click', () => {
  if (!templateMeta) return alert('Upload a template first');
  
  let positions = {};
  Object.entries(fieldNodes).forEach(([k, n]) => {
    positions[k] = { x: Math.round((n.group.x() / stage.width()) * 10000) / 100.0, y: Math.round((n.group.y() / stage.height()) * 10000) / 100.0, unit: 'percent', anchor: n.anchor, max_width: 80 };
  });
  
  let data = {};
  try { data = JSON.parse(sampleDataEl.value); } catch (e) { alert('Invalid sample JSON'); return; }
  
  fetch('/editor/preview_render', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ template_id: templateMeta.template_id, positions, data })
  }).then(r => {
    if (!r.ok) { r.json().then(j => alert('Preview failed: ' + (j.error || JSON.stringify(j)))) ; return; }
    return r.blob();
  }).then(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }).catch(e => { console.error(e); alert('Preview error'); });
});

suggestBtn.addEventListener('click', () => {
  if (!templateMeta) return alert('Upload a template first');
  
  // call suggest endpoint; currently returns empty with message because OCR not installed
  fetch('/editor/suggest_positions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ template_id: templateMeta.template_id }) })
    .then(r => r.json()).then(j => {
      if (j.suggestions && j.suggestions.length) {
        // apply suggestions (not used in this prototype)
      } else {
        alert('Autosuggest not available: server reports no OCR service installed. You can still drag fields manually.');
      }
    });
});

// import positions
importJson.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const j = JSON.parse(reader.result);
      if (!j.template_id || !j.positions) {
        alert('Invalid JSON');
        return;
      }
      
      // place markers according to percent positions
      Object.entries(j.positions).forEach(([k, p]) => {
        addFieldMarker(k, k, { x: (p.x / 100.0) * stage.width(), y: (p.y / 100.0) * stage.height() });
      });
    } catch (e) {
      alert('Import JSON parse error');
    }
  };
  reader.readAsText(f);
});

createFieldListUI();
initStage(794, 1123);



