(function() {
  const CONFIG = window.EDITOR_CONFIG;
  if (!CONFIG || !CONFIG.imageUrl) return;

  const REFERENCE_HEIGHT = 1123;
  const FONT_SIZE_LARGE = 48, FONT_SIZE_MEDIUM = 32, FONT_SIZE_SMALL = 24;
  const FONT_SCALE_MIN = 0.7, FONT_SCALE_MAX = 4.0;
  const QR_DEFAULT_SIZE_PX = 150;
  const FIELD_KEYS = ['recipient_name', 'specialization', 'course_name', 'teacher_name', 'reg_number', 'date', 'qr_code'];
  const FIELD_LABELS = {
    recipient_name: 'Recipient Name',
    specialization: 'Specialization',
    course_name: 'Course Name',
    teacher_name: 'Teacher Name',
    reg_number: 'Registration Number',
    date: 'Date',
    qr_code: 'QR Code'
  };
  const DEFAULT_LAYOUT = {
    version: 1,
    fields: {
      recipient_name: { x_pct: 50, y_pct: 35, anchor: 'center', max_width_pct: 85, font_size: 'large' },
      specialization: { x_pct: 50, y_pct: 42, anchor: 'center', max_width_pct: 80, font_size: 'medium' },
      course_name: { x_pct: 50, y_pct: 50, anchor: 'center', max_width_pct: 80, font_size: 'medium' },
      teacher_name: { x_pct: 50, y_pct: 58, anchor: 'center', max_width_pct: 80, font_size: 'medium' },
      reg_number: { x_pct: 50, y_pct: 12, anchor: 'center', font_size: 'small' },
      date: { x_pct: 50, y_pct: 88, anchor: 'center', font_size: 'small' },
      qr_code: { x_pct: 88, y_pct: 92 }
    }
  };

  let stage, layer, imageNode;
  let templateWidth = 794, templateHeight = 1123;
  let scale = 1;
  let fieldGroups = {};
  let layout = { version: 1, fields: {} };
  let currentData = {};
  let selectedKey = null;

  function getDisplaySize() {
    const maxW = 900;
    scale = Math.min(1, maxW / templateWidth);
    return { w: Math.round(templateWidth * scale), h: Math.round(templateHeight * scale) };
  }

  function getDisplayFontSize(sizeKey, templateH) {
    const base = sizeKey === 'large' ? FONT_SIZE_LARGE : (sizeKey === 'small' ? FONT_SIZE_SMALL : FONT_SIZE_MEDIUM);
    let s = templateH / REFERENCE_HEIGHT;
    s = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, s));
    const px = Math.max(12, Math.min(200, Math.round(base * s)));
    return Math.round(px * scale);
  }

  function pctToStageX(xPct) { return (xPct / 100) * (templateWidth * scale); }
  function pctToStageY(yPct) { return (yPct / 100) * (templateHeight * scale); }
  function stageXToPct(x) { return (x / (templateWidth * scale)) * 100; }
  function stageYToPct(y) { return (y / (templateHeight * scale)) * 100; }

  function getCurrentData() {
    if (CONFIG.mode === 'certificate' && CONFIG.certificateData) {
      const toggle = document.getElementById('sample-data-toggle');
      if (toggle && toggle.value === 'real') return CONFIG.certificateData;
    }
    const toggle = document.getElementById('sample-data-toggle');
    const kind = toggle ? toggle.value : 'short';
    return kind === 'long' ? (CONFIG.sampleDataLong || {}) : (CONFIG.sampleDataShort || {});
  }

  function fetchLayout() {
    return fetch(CONFIG.layoutUrl, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        if (data && data.fields) {
          layout = { version: data.version || 1, fields: { ...data.fields } };
        } else {
          layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
        }
        return layout;
      })
      .catch(() => ({ ...DEFAULT_LAYOUT }));
  }

  function createFieldGroup(key, cfg, stageW, stageH) {
    const x = pctToStageX(cfg.x_pct || 50);
    const y = pctToStageY(cfg.y_pct || 50);
    const anchor = cfg.anchor || 'center';
    const label = FIELD_LABELS[key] || key;
    const text = key === 'qr_code' ? '' : (currentData[key] || (key === 'date' ? 'December 18, 2025' : label));
    const group = new Konva.Group({ x, y, draggable: true, name: 'field-' + key });
    group.setAttr('fieldKey', key);
    group.setAttr('anchor', anchor);
    group.setAttr('max_width_pct', cfg.max_width_pct);
    group.setAttr('font_size', cfg.font_size);

    if (key === 'qr_code') {
      const qrScale = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, templateHeight / REFERENCE_HEIGHT));
      const qrPx = Math.max(80, Math.min(Math.round(QR_DEFAULT_SIZE_PX * qrScale), templateWidth / 4, templateHeight / 4));
      const size = Math.round(qrPx * scale);
      const rect = new Konva.Rect({ x: -size/2, y: -size/2, width: size, height: size, fill: '#f0f0f0', stroke: '#333', strokeWidth: 1 });
      const txt = new Konva.Text({ x: -size/2, y: -size/2 - 18, width: size, text: 'QR', fontSize: 10, align: 'center' });
      group.add(rect);
      group.add(txt);
    } else {
      const padding = 8;
      const fontSize = getDisplayFontSize(cfg.font_size || 'medium', templateHeight);
      const maxWidthPct = cfg.max_width_pct || 80;
      const textMaxW = Math.round(stageW * (maxWidthPct / 100));
      const line = new Konva.Text({ x: -textMaxW/2, y: -12, text: text || '(empty)', fontSize, fontFamily: 'Arial', width: textMaxW, wrap: 'word', align: 'center', listening: false });
      const boxW = Math.min(textMaxW + padding * 2, Math.max(120, line.getWidth() + padding * 2));
      const boxH = Math.max(28, line.height() + padding);
      const rect = new Konva.Rect({ x: -boxW/2, y: -boxH/2, width: boxW, height: boxH, fill: 'rgba(255,255,255,0.9)', stroke: '#2563eb', strokeWidth: 1.5, cornerRadius: 4 });
      const textNode = new Konva.Text({ x: -boxW/2 + padding, y: -boxH/2 + padding/2, width: boxW - padding*2, text: text || '(empty)', fontSize, fontFamily: 'Arial', wrap: 'word', align: 'center', listening: false });
      group.add(rect);
      group.add(textNode);
      group.setAttr('textNode', textNode);
      group.setAttr('rectNode', rect);
    }

    group.on('dragmove', function() {
      snapToCenter(this, stageW, stageH);
      layer.batchDraw();
    });
    group.on('dragend', function() {
      updateLayoutFromStage();
    });
    group.on('click', function() {
      selectField(key);
    });
    if (CONFIG.mode === 'template') {
      group.on('dblclick dbltap', function() {
        this.destroy();
        delete fieldGroups[key];
        layer.draw();
      });
    }
    return group;
  }

  function snapToCenter(group, stageW, stageH) {
    const snapDist = 12;
    let x = group.x(), y = group.y();
    if (Math.abs(x - stageW/2) < snapDist) x = stageW/2;
    if (Math.abs(y - stageH/2) < snapDist) y = stageH/2;
    const margin = 30;
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    if (x > stageW - margin) x = stageW - margin;
    if (y > stageH - margin) y = stageH - margin;
    group.x(x);
    group.y(y);
  }

  function updateLayoutFromStage() {
    const stageW = stage.width(), stageH = stage.height();
    Object.keys(fieldGroups).forEach(key => {
      const g = fieldGroups[key];
      if (!g.getParent()) return;
      const cfg = layout.fields[key] || {};
      layout.fields[key] = {
        ...cfg,
        x_pct: Math.round(stageXToPct(g.x()) * 100) / 100,
        y_pct: Math.round(stageYToPct(g.y()) * 100) / 100,
        anchor: g.getAttr('anchor') || 'center',
        max_width_pct: g.getAttr('max_width_pct'),
        font_size: g.getAttr('font_size')
      };
      if (key === 'qr_code') delete layout.fields[key].max_width_pct;
    });
  }

  function selectField(key) {
    selectedKey = key;
    Object.keys(fieldGroups).forEach(k => {
      const g = fieldGroups[k];
      if (g && g.findOne('Rect')) g.findOne('Rect').stroke('#2563eb').strokeWidth(1.5);
    });
    const g = fieldGroups[key];
    if (g && g.findOne('Rect')) g.findOne('Rect').stroke('#0d6efd').strokeWidth(2);
    layer.batchDraw();
  }

  function updateSampleData() {
    currentData = getCurrentData();
    const stageW = stage.width(), stageH = stage.height();
    FIELD_KEYS.forEach(key => {
      if (key === 'qr_code') return;
      const g = fieldGroups[key];
      if (!g) return;
      const textNode = g.getAttr('textNode');
      if (textNode) {
        const text = currentData[key] || (key === 'date' ? 'December 18, 2025' : FIELD_LABELS[key]);
        textNode.text(text || '(optional)');
        const rect = g.getAttr('rectNode');
        if (rect) {
          const maxWidthPct = g.getAttr('max_width_pct') || layout.fields[key]?.max_width_pct || 80;
          const textMaxW = Math.round(stageW * (maxWidthPct / 100));
          textNode.width(textMaxW - 16);
          const w = Math.min(textMaxW + 16, Math.max(120, textNode.getWidth() + 20));
          const h = Math.max(28, textNode.height() + 12);
          rect.width(w).height(h).x(-w/2).y(-h/2);
          textNode.x(-w/2 + 8).y(-h/2 + 4).width(w - 16);
        }
      }
      g.getChildren().forEach(c => c.visible(true));
    });
    layer.batchDraw();
  }

  function initStage(imgW, imgH) {
    templateWidth = imgW;
    templateHeight = imgH;
    const { w: displayW, h: displayH } = getDisplaySize();
    const container = document.getElementById('cert-editor-stage');
    if (stage) stage.destroy();
    stage = new Konva.Stage({ container: 'cert-editor-stage', width: displayW, height: displayH });
    layer = new Konva.Layer();
    stage.add(layer);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      imageNode = new Konva.Image({ image: img, x: 0, y: 0, width: displayW, height: displayH, listening: false });
      layer.add(imageNode);
      const centerV = new Konva.Line({ points: [displayW/2, 0, displayW/2, displayH], stroke: 'rgba(0,0,0,0.08)', strokeWidth: 1, listening: false });
      const centerH = new Konva.Line({ points: [0, displayH/2, displayW, displayH/2], stroke: 'rgba(0,0,0,0.08)', strokeWidth: 1, listening: false });
      layer.add(centerV);
      layer.add(centerH);
      FIELD_KEYS.forEach(key => {
        const cfg = layout.fields[key] || DEFAULT_LAYOUT.fields[key];
        const group = createFieldGroup(key, cfg, displayW, displayH);
        group.listening(true);
        group.setAttr('fieldKey', key);
        layer.add(group);
        fieldGroups[key] = group;
      });
      updateSampleData();
      layer.draw();
    };
    img.src = CONFIG.imageUrl;
  }

  function saveLayout() {
    updateLayoutFromStage();
    const payload = JSON.stringify({ version: layout.version || 1, fields: layout.fields });
    fetch(CONFIG.layoutSaveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      body: payload
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          const btn = document.getElementById('save-layout-btn');
          if (btn) { btn.textContent = 'Saved!'; btn.classList.add('btn-success'); btn.classList.remove('btn-primary'); setTimeout(() => { btn.textContent = ' Save layout'; btn.classList.remove('btn-success'); btn.classList.add('btn-primary'); }, 1500); }
        } else alert('Save failed: ' + (data.error || 'Unknown error'));
      })
      .catch(e => { console.error(e); alert('Save failed'); });
  }

  function exportJson() {
    updateLayoutFromStage();
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (CONFIG.templateId ? 'template-' + CONFIG.templateId : 'cert-' + CONFIG.certificateId) + '-layout.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.fields) { alert('Invalid layout JSON'); return; }
        layout = { version: data.version || 1, fields: { ...data.fields } };
        const stageW = stage.width(), stageH = stage.height();
        FIELD_KEYS.forEach(key => {
          const cfg = layout.fields[key];
          if (!cfg || !fieldGroups[key]) return;
          const g = fieldGroups[key];
          g.x(pctToStageX(cfg.x_pct)).y(pctToStageY(cfg.y_pct));
          g.setAttr('anchor', cfg.anchor || 'center');
          g.setAttr('max_width_pct', cfg.max_width_pct);
          g.setAttr('font_size', cfg.font_size);
        });
        layer.batchDraw();
      } catch (e) { alert('Invalid JSON'); }
    };
    reader.readAsText(file);
  }

  document.getElementById('save-layout-btn').addEventListener('click', saveLayout);
  document.getElementById('sample-data-toggle').addEventListener('change', updateSampleData);
  document.querySelectorAll('[data-anchor]').forEach(btn => {
    btn.addEventListener('click', function() {
      const anchor = this.getAttribute('data-anchor');
      if (!selectedKey || !fieldGroups[selectedKey]) return;
      fieldGroups[selectedKey].setAttr('anchor', anchor);
      if (layout.fields[selectedKey]) layout.fields[selectedKey].anchor = anchor;
      layer.batchDraw();
    });
  });
  const exportBtn = document.getElementById('export-json-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportJson);
  const importInput = document.getElementById('import-json-input');
  if (importInput) importInput.addEventListener('change', function() { if (this.files[0]) importJson(this.files[0]); });

  document.addEventListener('keydown', function(e) {
    if (!selectedKey || !fieldGroups[selectedKey]) return;
    const step = e.shiftKey ? 10 : 4;
    const g = fieldGroups[selectedKey];
    if (e.key === 'ArrowLeft') { g.x(g.x() - step); e.preventDefault(); updateLayoutFromStage(); layer.batchDraw(); }
    if (e.key === 'ArrowRight') { g.x(g.x() + step); e.preventDefault(); updateLayoutFromStage(); layer.batchDraw(); }
    if (e.key === 'ArrowUp') { g.y(g.y() - step); e.preventDefault(); updateLayoutFromStage(); layer.batchDraw(); }
    if (e.key === 'ArrowDown') { g.y(g.y() + step); e.preventDefault(); updateLayoutFromStage(); layer.batchDraw(); }
  });

  fetch(CONFIG.layoutUrl, { credentials: 'same-origin' })
    .then(r => r.json())
    .then(data => {
      if (data && data.fields) {
        layout = { version: data.version || 1, fields: { ...data.fields } };
      }
      const serverW = data.template_width;
      const serverH = data.template_height;
      const img = new Image();
      img.onload = function() {
        const imgW = serverW || img.naturalWidth || img.width;
        const imgH = serverH || img.naturalHeight || img.height;
        initStage(imgW, imgH);
      };
      img.onerror = function() { initStage(serverW || 794, serverH || 1123); };
      img.src = CONFIG.imageUrl;
    })
    .catch(() => {
      layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
      const img = new Image();
      img.onload = function() { initStage(img.naturalWidth || 794, img.naturalHeight || 1123); };
      img.onerror = function() { initStage(794, 1123); };
      img.src = CONFIG.imageUrl;
    });
})();
