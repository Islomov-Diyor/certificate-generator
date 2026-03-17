/**
 * Canva-style Certificate Editor
 * Full drag-drop editor with live preview, font controls, snap guides, undo/redo, zoom.
 */
(function () {
  'use strict';
  const C = window.CE_CONFIG;
  if (!C) return;

  /* ── Constants ── */
  const FIELD_DEFS = [
    { key: 'recipient_name', label: 'Recipient Name', icon: 'bi-person', placeholder: 'e.g. Ali Valiyev', defaultSize: 'large' },
    { key: 'specialization', label: 'Specialization', icon: 'bi-mortarboard', placeholder: 'e.g. Computer Science', defaultSize: 'medium' },
    { key: 'course_name', label: 'Course Name', icon: 'bi-book', placeholder: 'e.g. Web Development', defaultSize: 'medium' },
    { key: 'teacher_name', label: 'Teacher Name', icon: 'bi-person-workspace', placeholder: 'e.g. Prof. Karimov', defaultSize: 'medium' },
  ];
  const AUTO_FIELDS = ['reg_number', 'date', 'qr_code'];
  const ALL_KEYS = FIELD_DEFS.map(f => f.key).concat(AUTO_FIELDS);

  const SIZE_MAP = { large: 48, medium: 32, small: 24 };
  const DEFAULT_LAYOUT = {
    version: 1,
    fields: {
      recipient_name: { x_pct: 50, y_pct: 35, anchor: 'center', max_width_pct: 85, font_size: 'large', font_size_px: 48, color: '#000000', bold: false, italic: false, visible: true },
      specialization: { x_pct: 50, y_pct: 42, anchor: 'center', max_width_pct: 80, font_size: 'medium', font_size_px: 32, color: '#000000', bold: false, italic: false, visible: true },
      course_name:    { x_pct: 50, y_pct: 50, anchor: 'center', max_width_pct: 80, font_size: 'medium', font_size_px: 32, color: '#000000', bold: false, italic: false, visible: true },
      teacher_name:   { x_pct: 50, y_pct: 58, anchor: 'center', max_width_pct: 80, font_size: 'medium', font_size_px: 32, color: '#000000', bold: false, italic: false, visible: true },
      reg_number:     { x_pct: 50, y_pct: 12, anchor: 'center', font_size: 'small', font_size_px: 24, color: '#000000', bold: false, italic: false, visible: true },
      date:           { x_pct: 50, y_pct: 88, anchor: 'center', font_size: 'small', font_size_px: 24, color: '#000000', bold: false, italic: false, visible: true },
      qr_code:        { x_pct: 88, y_pct: 92, visible: true },
    },
  };
  const SNAP_THRESHOLD = 6;

  /* ── State ── */
  let stage, bgLayer, guideLayer, fieldLayer;
  let bgImageNode;
  let tplWidth = 794, tplHeight = 1123;
  let zoom = 1, fitZoom = 1;
  let layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  let fieldNodes = {};
  let selectedKey = null;
  let undoStack = [], redoStack = [];
  let fieldValues = {};
  let generating = false;

  /* ── DOM refs ── */
  const $stage = document.getElementById('ceStage');
  const $loading = document.getElementById('ceLoading');
  const $zoomLabel = document.getElementById('zoomLabel');
  const $toast = document.getElementById('ceToast');
  const $ctxBar = document.getElementById('ctxBar');
  const $ctxFontSize = document.getElementById('ctxFontSize');
  const $ctxBold = document.getElementById('ctxBold');
  const $ctxItalic = document.getElementById('ctxItalic');
  const $ctxColor = document.getElementById('ctxColor');
  const $fieldsList = document.getElementById('fieldsList');

  /* ── Utility ── */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pct2px(pct, total) { return (pct / 100) * total; }
  function px2pct(px, total) { return (px / total) * 100; }
  function toast(msg, type) {
    $toast.textContent = msg;
    $toast.className = 'ce-toast show' + (type ? ' ' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { $toast.className = 'ce-toast'; }, 2500);
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ── Undo / Redo ── */
  function pushUndo() {
    undoStack.push({ layout: deepClone(layout), values: deepClone(fieldValues) });
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push({ layout: deepClone(layout), values: deepClone(fieldValues) });
    const s = undoStack.pop();
    layout = s.layout;
    fieldValues = s.values;
    rebuildFields();
    syncSidebarInputs();
    toast('Undo');
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push({ layout: deepClone(layout), values: deepClone(fieldValues) });
    const s = redoStack.pop();
    layout = s.layout;
    fieldValues = s.values;
    rebuildFields();
    syncSidebarInputs();
    toast('Redo');
  }

  /* ── Sidebar: build field cards ── */
  function buildSidebar() {
    $fieldsList.innerHTML = '';
    FIELD_DEFS.forEach(def => {
      const cfg = layout.fields[def.key] || {};
      const visible = cfg.visible !== false;
      const val = fieldValues[def.key] || '';
      const card = document.createElement('div');
      card.className = 'ce-field-card' + (selectedKey === def.key ? ' selected' : '');
      card.dataset.key = def.key;
      card.innerHTML =
        '<div class="ce-fc-header">' +
          '<span class="ce-fc-label"><span class="ce-fc-icon"><i class="bi ' + def.icon + '"></i></span> ' + def.label + '</span>' +
          '<span style="display:flex;align-items:center;gap:6px">' +
            '<span class="ce-fc-tag">optional</span>' +
            '<span class="ce-vis-toggle' + (visible ? '' : ' hidden') + '" data-key="' + def.key + '" title="Toggle visibility"><i class="bi ' + (visible ? 'bi-eye' : 'bi-eye-slash') + '"></i></span>' +
          '</span>' +
        '</div>' +
        '<input type="text" data-key="' + def.key + '" placeholder="' + def.placeholder + '" value="">';
      const input = card.querySelector('input');
      input.value = val;
      input.addEventListener('input', function () {
        pushUndo();
        fieldValues[this.dataset.key] = this.value;
        updateFieldNodeText(this.dataset.key);
      });
      input.addEventListener('focus', function () { selectField(this.dataset.key); });
      card.addEventListener('click', function (e) {
        if (e.target.tagName === 'INPUT') return;
        selectField(def.key);
      });
      const visBtn = card.querySelector('.ce-vis-toggle');
      visBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        pushUndo();
        const k = this.dataset.key;
        const cur = layout.fields[k] ? layout.fields[k].visible !== false : true;
        if (!layout.fields[k]) layout.fields[k] = {};
        layout.fields[k].visible = !cur;
        this.className = 'ce-vis-toggle' + (layout.fields[k].visible ? '' : ' hidden');
        this.querySelector('i').className = 'bi ' + (layout.fields[k].visible ? 'bi-eye' : 'bi-eye-slash');
        updateFieldNodeVisibility(k);
      });
      $fieldsList.appendChild(card);
    });
  }

  function syncSidebarInputs() {
    $fieldsList.querySelectorAll('input[data-key]').forEach(inp => {
      inp.value = fieldValues[inp.dataset.key] || '';
    });
    $fieldsList.querySelectorAll('.ce-vis-toggle').forEach(btn => {
      const k = btn.dataset.key;
      const vis = layout.fields[k] ? layout.fields[k].visible !== false : true;
      btn.className = 'ce-vis-toggle' + (vis ? '' : ' hidden');
      btn.querySelector('i').className = 'bi ' + (vis ? 'bi-eye' : 'bi-eye-slash');
    });
    highlightSidebarCard();
  }

  function highlightSidebarCard() {
    $fieldsList.querySelectorAll('.ce-field-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.key === selectedKey);
    });
  }

  /* ── Konva: init stage ── */
  function initStage(imgWidth, imgHeight) {
    tplWidth = imgWidth;
    tplHeight = imgHeight;
    const area = document.getElementById('ceCanvasArea');
    const areaW = area.clientWidth - 60;
    const areaH = area.clientHeight - 100;
    fitZoom = Math.min(areaW / tplWidth, areaH / tplHeight, 1);
    zoom = fitZoom;
    const w = Math.round(tplWidth * zoom);
    const h = Math.round(tplHeight * zoom);

    if (stage) stage.destroy();
    stage = new Konva.Stage({ container: 'ceStage', width: w, height: h });

    bgLayer = new Konva.Layer({ listening: false });
    guideLayer = new Konva.Layer({ listening: false });
    fieldLayer = new Konva.Layer();
    stage.add(bgLayer);
    stage.add(guideLayer);
    stage.add(fieldLayer);

    stage.on('click tap', function (e) {
      if (e.target === stage || e.target === bgImageNode) deselectAll();
    });

    updateZoomLabel();
  }

  function loadBgImage(url, cb) {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      if (bgImageNode) bgImageNode.destroy();
      bgImageNode = new Konva.Image({
        image: img, x: 0, y: 0,
        width: stage.width(), height: stage.height(),
        listening: false,
      });
      bgLayer.add(bgImageNode);
      bgLayer.batchDraw();
      if (cb) cb(img.naturalWidth || img.width, img.naturalHeight || img.height);
    };
    img.onerror = function () { toast('Failed to load template image', 'error'); };
    img.src = url;
  }

  /* ── Konva: field nodes ── */
  function stageW() { return tplWidth * zoom; }
  function stageH() { return tplHeight * zoom; }

  function fontSizePx(key) {
    const cfg = layout.fields[key] || {};
    if (cfg.font_size_px) return Math.round(cfg.font_size_px * zoom);
    return Math.round((SIZE_MAP[cfg.font_size || 'medium'] || 32) * zoom);
  }

  function fontStyle(key) {
    const cfg = layout.fields[key] || {};
    let s = '';
    if (cfg.italic) s += 'italic ';
    if (cfg.bold) s += 'bold';
    return s.trim() || 'normal';
  }

  function textForField(key) {
    if (key === 'reg_number') return C.certificateData ? C.certificateData.reg_number : 'REG-0000000';
    if (key === 'date') return C.certificateData ? C.certificateData.date : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return fieldValues[key] || '';
  }

  function createFieldNode(key) {
    const cfg = layout.fields[key] || DEFAULT_LAYOUT.fields[key] || {};
    const x = pct2px(cfg.x_pct || 50, stageW());
    const y = pct2px(cfg.y_pct || 50, stageH());
    const visible = cfg.visible !== false;

    if (key === 'qr_code') {
      const sz = Math.max(40, Math.min(100, stageW() * 0.1));
      const group = new Konva.Group({ x: x, y: y, draggable: true, visible: visible, name: 'field-qr_code' });
      group.setAttr('fieldKey', 'qr_code');
      const rect = new Konva.Rect({ x: -sz / 2, y: -sz / 2, width: sz, height: sz, fill: '#f3f4f6', stroke: '#6b7280', strokeWidth: 1, cornerRadius: 4 });
      const label = new Konva.Text({ x: -sz / 2, y: -sz / 2, width: sz, height: sz, text: 'QR', fontSize: 11 * zoom, fontFamily: 'Arial', align: 'center', verticalAlign: 'middle', fill: '#6b7280', listening: false });
      group.add(rect, label);
      setupDrag(group);
      return group;
    }

    const text = textForField(key) || cfg.label || key;
    const fs = fontSizePx(key);
    const color = cfg.color || '#000000';
    const anchor = cfg.anchor || 'center';
    const maxWPct = cfg.max_width_pct || 85;
    const maxWPx = pct2px(maxWPct, stageW());

    const group = new Konva.Group({ x: x, y: y, draggable: true, visible: visible, name: 'field-' + key });
    group.setAttr('fieldKey', key);

    const padding = 8;
    const textNode = new Konva.Text({
      text: text || '(empty)',
      fontSize: fs,
      fontFamily: 'Arial, sans-serif',
      fontStyle: fontStyle(key),
      fill: color,
      width: maxWPx,
      align: anchor,
      wrap: 'word',
      listening: false,
    });
    const tw = Math.min(maxWPx, Math.max(80 * zoom, textNode.width()));
    const th = Math.max(24 * zoom, textNode.height());
    textNode.width(tw);

    const offsetX = anchor === 'center' ? tw / 2 : (anchor === 'right' ? tw : 0);
    textNode.x(-offsetX);
    textNode.y(-th / 2);

    const bg = new Konva.Rect({
      x: -offsetX - padding,
      y: -th / 2 - padding / 2,
      width: tw + padding * 2,
      height: th + padding,
      fill: 'rgba(255,255,255,0.75)',
      stroke: selectedKey === key ? '#7c3aed' : '#a5b4fc',
      strokeWidth: selectedKey === key ? 2 : 1,
      cornerRadius: 4,
      dash: [4, 2],
    });

    group.add(bg, textNode);
    group.setAttr('_textNode', textNode);
    group.setAttr('_bgRect', bg);
    setupDrag(group);
    return group;
  }

  function updateFieldNodeText(key) {
    const g = fieldNodes[key];
    if (!g || key === 'qr_code') return;
    const tn = g.getAttr('_textNode');
    const bg = g.getAttr('_bgRect');
    if (!tn) return;

    const text = textForField(key) || '(empty)';
    const fs = fontSizePx(key);
    const cfg = layout.fields[key] || {};
    const anchor = cfg.anchor || 'center';
    const color = cfg.color || '#000000';
    const maxWPx = pct2px(cfg.max_width_pct || 85, stageW());

    tn.text(text);
    tn.fontSize(fs);
    tn.fontStyle(fontStyle(key));
    tn.fill(color);
    tn.width(maxWPx);
    tn.align(anchor);

    const tw = Math.min(maxWPx, Math.max(80 * zoom, tn.width()));
    const th = Math.max(24 * zoom, tn.height());
    tn.width(tw);

    const offsetX = anchor === 'center' ? tw / 2 : (anchor === 'right' ? tw : 0);
    tn.x(-offsetX);
    tn.y(-th / 2);

    const pad = 8;
    bg.x(-offsetX - pad);
    bg.y(-th / 2 - pad / 2);
    bg.width(tw + pad * 2);
    bg.height(th + pad);

    fieldLayer.batchDraw();
  }

  function updateFieldNodeVisibility(key) {
    const g = fieldNodes[key];
    if (!g) return;
    const vis = layout.fields[key] ? layout.fields[key].visible !== false : true;
    g.visible(vis);
    fieldLayer.batchDraw();
  }

  /* ── Drag with snap guides ── */
  function setupDrag(group) {
    group.on('dragstart', function () { pushUndo(); });
    group.on('dragmove', function () { applySnap(this); });
    group.on('dragend', function () {
      clearGuides();
      syncLayoutFromNode(this);
    });
    group.on('click tap', function (e) {
      e.cancelBubble = true;
      selectField(this.getAttr('fieldKey'));
    });
  }

  function applySnap(group) {
    let x = group.x(), y = group.y();
    const sw = stageW(), sh = stageH();
    clearGuides();
    const guides = [];

    const snapPositionsX = [sw * 0.5, sw * 0.333, sw * 0.667, 0, sw];
    const snapPositionsY = [sh * 0.5, sh * 0.333, sh * 0.667, 0, sh];

    ALL_KEYS.forEach(k => {
      if (k === group.getAttr('fieldKey')) return;
      const g = fieldNodes[k];
      if (!g || !g.visible()) return;
      snapPositionsX.push(g.x());
      snapPositionsY.push(g.y());
    });

    snapPositionsX.forEach(sx => {
      if (Math.abs(x - sx) < SNAP_THRESHOLD) { x = sx; guides.push({ orient: 'v', pos: sx }); }
    });
    snapPositionsY.forEach(sy => {
      if (Math.abs(y - sy) < SNAP_THRESHOLD) { y = sy; guides.push({ orient: 'h', pos: sy }); }
    });

    x = clamp(x, 20, sw - 20);
    y = clamp(y, 20, sh - 20);
    group.x(x);
    group.y(y);
    drawGuides(guides);
  }

  function drawGuides(guides) {
    guideLayer.destroyChildren();
    guides.forEach(g => {
      if (g.orient === 'v') {
        guideLayer.add(new Konva.Line({ points: [g.pos, 0, g.pos, stageH()], stroke: '#7c3aed', strokeWidth: 1, dash: [4, 3] }));
      } else {
        guideLayer.add(new Konva.Line({ points: [0, g.pos, stageW(), g.pos], stroke: '#7c3aed', strokeWidth: 1, dash: [4, 3] }));
      }
    });
    guideLayer.batchDraw();
  }

  function clearGuides() { guideLayer.destroyChildren(); guideLayer.batchDraw(); }

  function syncLayoutFromNode(group) {
    const key = group.getAttr('fieldKey');
    if (!layout.fields[key]) layout.fields[key] = {};
    layout.fields[key].x_pct = Math.round(px2pct(group.x(), stageW()) * 100) / 100;
    layout.fields[key].y_pct = Math.round(px2pct(group.y(), stageH()) * 100) / 100;
  }

  /* ── Selection ── */
  function selectField(key) {
    selectedKey = key;
    highlightSidebarCard();
    Object.keys(fieldNodes).forEach(k => {
      const g = fieldNodes[k];
      if (!g) return;
      const bg = g.getAttr('_bgRect') || g.findOne('Rect');
      if (bg) {
        bg.stroke(k === key ? '#7c3aed' : '#a5b4fc');
        bg.strokeWidth(k === key ? 2 : 1);
      }
    });
    fieldLayer.batchDraw();
    updateCtxBar();
  }

  function deselectAll() {
    selectedKey = null;
    highlightSidebarCard();
    Object.keys(fieldNodes).forEach(k => {
      const g = fieldNodes[k];
      if (!g) return;
      const bg = g.getAttr('_bgRect') || g.findOne('Rect');
      if (bg) { bg.stroke('#a5b4fc'); bg.strokeWidth(1); }
    });
    fieldLayer.batchDraw();
    $ctxBar.classList.remove('active');
  }

  /* ── Context toolbar ── */
  function updateCtxBar() {
    if (!selectedKey || selectedKey === 'qr_code') { $ctxBar.classList.remove('active'); return; }
    $ctxBar.classList.add('active');
    const cfg = layout.fields[selectedKey] || {};
    $ctxFontSize.value = cfg.font_size_px || SIZE_MAP[cfg.font_size || 'medium'] || 32;
    $ctxBold.classList.toggle('active', !!cfg.bold);
    $ctxItalic.classList.toggle('active', !!cfg.italic);
    $ctxColor.value = cfg.color || '#000000';
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.classList.toggle('active', (cfg.anchor || 'center') === btn.dataset.align);
    });
  }

  /* ── Zoom ── */
  function setZoom(z) {
    zoom = clamp(z, 0.15, 3);
    const w = Math.round(tplWidth * zoom);
    const h = Math.round(tplHeight * zoom);
    stage.width(w);
    stage.height(h);
    if (bgImageNode) { bgImageNode.width(w); bgImageNode.height(h); }
    rebuildFields();
    updateZoomLabel();
  }

  function updateZoomLabel() { $zoomLabel.textContent = Math.round(zoom * 100) + '%'; }

  /* ── Build / Rebuild all field nodes ── */
  function rebuildFields() {
    fieldLayer.destroyChildren();
    fieldNodes = {};
    ALL_KEYS.forEach(key => {
      const node = createFieldNode(key);
      fieldLayer.add(node);
      fieldNodes[key] = node;
    });
    if (selectedKey) selectField(selectedKey);
    fieldLayer.batchDraw();
    bgLayer.batchDraw();
  }

  /* ── Network: load layout ── */
  function fetchLayout() {
    return fetch(C.layoutUrl, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        if (data && data.fields) {
          layout = { version: data.version || 1, fields: {} };
          ALL_KEYS.forEach(k => {
            const merged = { ...(DEFAULT_LAYOUT.fields[k] || {}), ...(data.fields[k] || {}) };
            layout.fields[k] = merged;
          });
        }
      })
      .catch(() => { layout = deepClone(DEFAULT_LAYOUT); });
  }

  /* ── Network: save layout ── */
  function saveLayout() {
    syncAllPositions();
    return fetch(C.saveLayoutUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(layout),
    })
      .then(r => r.json())
      .then(d => { if (d.ok) toast('Layout saved', 'success'); else toast('Save failed', 'error'); })
      .catch(() => toast('Save failed', 'error'));
  }

  function syncAllPositions() {
    ALL_KEYS.forEach(key => {
      const g = fieldNodes[key];
      if (!g) return;
      syncLayoutFromNode(g);
    });
  }

  /* ── Network: generate certificate ── */
  function generateCertificate() {
    if (generating) return;
    generating = true;
    syncAllPositions();
    const payload = {
      template_id: C.templateId,
      certificate_id: C.certificateId || null,
      fields: {
        recipient_name: fieldValues.recipient_name || '',
        specialization: fieldValues.specialization || '',
        course_name: fieldValues.course_name || '',
        teacher_name: fieldValues.teacher_name || '',
      },
      layout: layout,
    };
    toast('Generating…');
    fetch(C.generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    })
      .then(r => {
        if (!r.ok) throw new Error('Generate failed');
        return r.json();
      })
      .then(data => {
        if (data.error) { toast(data.error, 'error'); generating = false; return; }
        toast('Certificate generated!', 'success');
        if (data.download_url) {
          const a = document.createElement('a');
          a.href = data.download_url;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        if (data.preview_url && C.mode === 'new') {
          setTimeout(() => { window.location.href = data.preview_url; }, 800);
        }
        generating = false;
      })
      .catch(() => { toast('Generation failed', 'error'); generating = false; });
  }

  /* ── Keyboard shortcuts ── */
  function setupKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        if (e.key === 'Escape') { e.target.blur(); deselectAll(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveLayout(); return; }

      if (!selectedKey || !fieldNodes[selectedKey]) return;
      const step = e.shiftKey ? 10 : 2;
      const g = fieldNodes[selectedKey];
      let moved = false;
      if (e.key === 'ArrowLeft')  { pushUndo(); g.x(g.x() - step); moved = true; }
      if (e.key === 'ArrowRight') { pushUndo(); g.x(g.x() + step); moved = true; }
      if (e.key === 'ArrowUp')    { pushUndo(); g.y(g.y() - step); moved = true; }
      if (e.key === 'ArrowDown')  { pushUndo(); g.y(g.y() + step); moved = true; }
      if (moved) { e.preventDefault(); syncLayoutFromNode(g); fieldLayer.batchDraw(); }
      if (e.key === 'Escape') deselectAll();
    });
  }

  /* ── Mouse-wheel zoom ── */
  function setupWheelZoom() {
    const area = document.getElementById('ceCanvasArea');
    area.addEventListener('wheel', function (e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(zoom + delta);
    }, { passive: false });
  }

  /* ── Toolbar event wiring ── */
  function setupToolbar() {
    $ctxFontSize.addEventListener('change', function () {
      if (!selectedKey) return;
      pushUndo();
      if (!layout.fields[selectedKey]) layout.fields[selectedKey] = {};
      layout.fields[selectedKey].font_size_px = parseInt(this.value, 10) || 32;
      updateFieldNodeText(selectedKey);
    });
    $ctxBold.addEventListener('click', function () {
      if (!selectedKey) return;
      pushUndo();
      if (!layout.fields[selectedKey]) layout.fields[selectedKey] = {};
      layout.fields[selectedKey].bold = !layout.fields[selectedKey].bold;
      this.classList.toggle('active');
      updateFieldNodeText(selectedKey);
    });
    $ctxItalic.addEventListener('click', function () {
      if (!selectedKey) return;
      pushUndo();
      if (!layout.fields[selectedKey]) layout.fields[selectedKey] = {};
      layout.fields[selectedKey].italic = !layout.fields[selectedKey].italic;
      this.classList.toggle('active');
      updateFieldNodeText(selectedKey);
    });
    $ctxColor.addEventListener('input', function () {
      if (!selectedKey) return;
      pushUndo();
      if (!layout.fields[selectedKey]) layout.fields[selectedKey] = {};
      layout.fields[selectedKey].color = this.value;
      updateFieldNodeText(selectedKey);
    });
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (!selectedKey) return;
        pushUndo();
        if (!layout.fields[selectedKey]) layout.fields[selectedKey] = {};
        layout.fields[selectedKey].anchor = this.dataset.align;
        document.querySelectorAll('[data-align]').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        updateFieldNodeText(selectedKey);
      });
    });

    document.getElementById('btnUndo').addEventListener('click', undo);
    document.getElementById('btnRedo').addEventListener('click', redo);
    document.getElementById('btnSave').addEventListener('click', saveLayout);
    document.getElementById('btnGenerate').addEventListener('click', generateCertificate);
    document.getElementById('btnSidebarSave').addEventListener('click', saveLayout);
    document.getElementById('btnSidebarGenerate').addEventListener('click', generateCertificate);

    document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
    document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
    document.getElementById('zoomFit').addEventListener('click', () => setZoom(fitZoom));

    const qrTog = document.getElementById('qrToggle');
    const qrIcon = document.getElementById('qrToggleIcon');
    if (qrTog) {
      qrTog.checked = layout.fields.qr_code ? layout.fields.qr_code.visible !== false : true;
      qrIcon.className = 'bi ' + (qrTog.checked ? 'bi-eye' : 'bi-eye-slash');
      qrTog.addEventListener('change', function () {
        pushUndo();
        if (!layout.fields.qr_code) layout.fields.qr_code = {};
        layout.fields.qr_code.visible = this.checked;
        qrIcon.className = 'bi ' + (this.checked ? 'bi-eye' : 'bi-eye-slash');
        updateFieldNodeVisibility('qr_code');
      });
    }
  }

  /* ── Init ── */
  function init() {
    if (C.certificateData) {
      fieldValues = {
        recipient_name: C.certificateData.recipient_name || '',
        specialization: C.certificateData.specialization || '',
        course_name: C.certificateData.course_name || '',
        teacher_name: C.certificateData.teacher_name || '',
      };
    }
    fetchLayout().then(() => {
      buildSidebar();
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        const w = img.naturalWidth || img.width || 794;
        const h = img.naturalHeight || img.height || 1123;
        initStage(w, h);
        loadBgImage(C.imageUrl, function () {
          rebuildFields();
          $loading.style.display = 'none';
        });
      };
      img.onerror = function () {
        initStage(794, 1123);
        rebuildFields();
        $loading.style.display = 'none';
        toast('Could not load template image', 'error');
      };
      img.src = C.imageUrl;
    });
    setupToolbar();
    setupKeyboard();
    setupWheelZoom();
  }

  init();
})();
