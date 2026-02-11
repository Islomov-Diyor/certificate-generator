(function () {
  const CONFIG = window.BADGE_CONFIG || {};
  if (!CONFIG.imageUrl || !CONFIG.templateId || !CONFIG.exportUrl) return;

  const firstNameInput = document.getElementById('field-first-name');
  const lastNameInput = document.getElementById('field-last-name');
  const institutionInput = document.getElementById('field-institution');
  const participantTypeSelect = document.getElementById('field-participant-type');
  const downloadBtn = document.getElementById('download-badge-btn');

  let stage, layer, imageNode, transformer;
  let templateWidth = 800;
  let templateHeight = 600;
  let scale = 1;

  const FIELD_KEYS = ['first_name', 'last_name', 'institution', 'participant_type'];
  const fieldGroups = {}; // key -> Konva.Group

  function getDisplaySize() {
    const maxW = 900;
    scale = Math.min(1, maxW / templateWidth);
    return {
      w: Math.round(templateWidth * scale),
      h: Math.round(templateHeight * scale),
    };
  }

  function stageToPctX(x) {
    return (x / (templateWidth * scale)) * 100;
  }
  function stageToPctY(y) {
    return (y / (templateHeight * scale)) * 100;
  }

  function pctToStageX(xPct) {
    return (xPct / 100) * (templateWidth * scale);
  }

  function pctToStageY(yPct) {
    return (yPct / 100) * (templateHeight * scale);
  }

  function initStage(imgW, imgH) {
    templateWidth = imgW;
    templateHeight = imgH;
    const { w: displayW, h: displayH } = getDisplaySize();

    if (stage) {
      stage.destroy();
    }

    stage = new Konva.Stage({
      container: 'cert-editor-stage',
      width: displayW,
      height: displayH,
    });

    layer = new Konva.Layer();
    stage.add(layer);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      imageNode = new Konva.Image({
        image: img,
        x: 0,
        y: 0,
        width: displayW,
        height: displayH,
        listening: false,
      });
      layer.add(imageNode);

      const centerV = new Konva.Line({
        points: [displayW / 2, 0, displayW / 2, displayH],
        stroke: 'rgba(0,0,0,0.08)',
        strokeWidth: 1,
        listening: false,
      });
      const centerH = new Konva.Line({
        points: [0, displayH / 2, displayW, displayH / 2],
        stroke: 'rgba(0,0,0,0.08)',
        strokeWidth: 1,
        listening: false,
      });
      layer.add(centerV);
      layer.add(centerH);

      transformer = new Konva.Transformer({
        rotateEnabled: false,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        boundBoxFunc: function (oldBox, newBox) {
          if (newBox.width < 40 || newBox.height < 20) {
            return oldBox;
          }
          return newBox;
        },
      });
      layer.add(transformer);

      // Create default field positions (centered stack)
      createOrUpdateFieldGroup('first_name');
      createOrUpdateFieldGroup('last_name');
      createOrUpdateFieldGroup('institution');
      createOrUpdateFieldGroup('participant_type');

      layer.draw();
    };
    img.onerror = function () {
      // fallback canvas size
      templateWidth = 800;
      templateHeight = 600;
      initStage(templateWidth, templateHeight);
    };
    img.src = CONFIG.imageUrl;
  }

  function getFieldText(key) {
    if (key === 'first_name') return (firstNameInput.value || '').trim();
    if (key === 'last_name') return (lastNameInput.value || '').trim();
    if (key === 'institution') return (institutionInput.value || '').trim();
    if (key === 'participant_type') return (participantTypeSelect.value || '').trim();
    return '';
  }

  function getDefaultLabel(key) {
    if (key === 'first_name') return 'First Name';
    if (key === 'last_name') return 'Last Name';
    if (key === 'institution') return 'Institution';
    if (key === 'participant_type') return 'Participant Type';
    return key;
  }

  function baseFontSizeForKey(key) {
    if (key === 'first_name' || key === 'last_name') return 32;
    if (key === 'institution') return 20;
    if (key === 'participant_type') return 18;
    return 20;
  }

  function createOrUpdateFieldGroup(key) {
    const textValue = getFieldText(key);
    const hasText = !!textValue;

    // If no text, hide/remove from canvas but keep group instance for layout continuity
    let group = fieldGroups[key];
    if (!hasText) {
      if (group) {
        group.visible(false);
        layer.batchDraw();
      }
      return;
    }

    if (!group) {
      // Initial placement: from existing badge layout if available, otherwise vertical stack
      const stageW = stage.width();
      const stageH = stage.height();
      let x = stageW / 2;
      let y;
      const idx = FIELD_KEYS.indexOf(key);
      const baseY = stageH * 0.4 + idx * 50;
      y = baseY;

      const existing = CONFIG.existingBadge && CONFIG.existingBadge.layout
        ? CONFIG.existingBadge.layout[key]
        : null;
      if (existing && typeof existing.x_pct === 'number' && typeof existing.y_pct === 'number') {
        x = pctToStageX(existing.x_pct);
        y = pctToStageY(existing.y_pct);
      }

      group = new Konva.Group({
        x: x,
        y: y,
        draggable: true,
        name: 'field-' + key,
      });
      group.setAttr('fieldKey', key);
      group.setAttr('anchor', 'center');
      const existingFontSize = existing && typeof existing.font_size === 'number'
        ? existing.font_size
        : baseFontSizeForKey(key);
      group.setAttr('fontSize', existingFontSize);

      const rect = new Konva.Rect({
        x: -150,
        y: -20,
        width: 300,
        height: 40,
        fill: 'rgba(255,255,255,0.9)',
        stroke: '#2563eb',
        strokeWidth: 1.5,
        cornerRadius: 4,
      });

      const textNode = new Konva.Text({
        x: -140,
        y: -14,
        width: 280,
        text: textValue || getDefaultLabel(key),
        fontSize: existingFontSize,
        fontFamily: 'Arial',
        align: 'center',
        listening: false,
        fill: '#000',
      });

      group.add(rect);
      group.add(textNode);
      group.setAttr('rectNode', rect);
      group.setAttr('textNode', textNode);

      group.on('dragmove', function () {
        snapToStageBounds(group);
        layer.batchDraw();
      });

      group.on('click', function () {
        transformer.nodes([group]);
        layer.batchDraw();
      });

      fieldGroups[key] = group;
      layer.add(group);
    }

    const textNode = group.getAttr('textNode');
    const rect = group.getAttr('rectNode');
    if (textNode && rect) {
      const baseSize = group.getAttr('fontSize') || baseFontSizeForKey(key);
      const currentScaleX = group.scaleX() || 1;
      const appliedFontSize = baseSize * currentScaleX;

      group.scale({ x: 1, y: 1 });
      textNode.fontSize(appliedFontSize);
      textNode.text(textValue);

      // Resize rect to fit text
      const paddingX = 20;
      const paddingY = 10;
      const textWidth = textNode.getTextWidth ? textNode.getTextWidth() : textNode.width();
      const textHeight = textNode.height();
      const rectW = Math.max(160, textWidth + paddingX * 2);
      const rectH = Math.max(32, textHeight + paddingY * 2);

      rect.width(rectW);
      rect.height(rectH);
      rect.x(-rectW / 2);
      rect.y(-rectH / 2);

      textNode.width(rectW - paddingX * 2);
      textNode.x(-rectW / 2 + paddingX);
      textNode.y(-rectH / 2 + paddingY / 2);
    }

    group.visible(true);
    layer.batchDraw();
  }

  function snapToStageBounds(group) {
    const margin = 10;
    let x = group.x();
    let y = group.y();
    const stageW = stage.width();
    const stageH = stage.height();

    if (x < margin) x = margin;
    if (y < margin) y = margin;
    if (x > stageW - margin) x = stageW - margin;
    if (y > stageH - margin) y = stageH - margin;

    group.x(x);
    group.y(y);
  }

  function collectExportPayload() {
    const positions = {};
    const data = {
      first_name: getFieldText('first_name'),
      last_name: getFieldText('last_name'),
      institution: getFieldText('institution'),
      participant_type: getFieldText('participant_type'),
    };

    FIELD_KEYS.forEach((key) => {
      const group = fieldGroups[key];
      const text = data[key];
      if (!group || !group.visible() || !text) return;

      const xPct = stageToPctX(group.x());
      const yPct = stageToPctY(group.y());

      const baseSize = group.getAttr('fontSize') || baseFontSizeForKey(key);
      const textNode = group.getAttr('textNode');
      let fontSize = baseSize;
      if (textNode) {
        fontSize = textNode.fontSize();
      }

      positions[key] = {
        x_pct: Math.round(xPct * 100) / 100,
        y_pct: Math.round(yPct * 100) / 100,
        font_size: Math.round(fontSize),
        anchor: 'center',
      };
    });

    return { positions, data };
  }

  function handleDownload() {
    const payload = collectExportPayload();
    const body = {
      template_id: CONFIG.templateId,
      positions: payload.positions,
      data: payload.data,
    };

    fetch(CONFIG.exportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((j) => {
            const msg = j && j.error ? j.error : 'Failed to export badge PDF';
            throw new Error(msg);
          });
        }
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'badge.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error(err);
        alert(err.message || 'Failed to export badge PDF');
      });
  }

  function wireInputs() {
    [firstNameInput, lastNameInput, institutionInput, participantTypeSelect].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', () => {
        FIELD_KEYS.forEach((key) => createOrUpdateFieldGroup(key));
      });
      el.addEventListener('change', () => {
        FIELD_KEYS.forEach((key) => createOrUpdateFieldGroup(key));
      });
    });

    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }
  }

  // Boot
  wireInputs();

  // If reopening an existing badge, inputs are already prefilled by the template
  // and layout is provided in CONFIG.existingBadge.layout. We still need to
  // initialize the stage with the correct image size.
  const probe = new Image();
  probe.onload = function () {
    const w = probe.naturalWidth || probe.width || 800;
    const h = probe.naturalHeight || probe.height || 600;
    initStage(w, h);
    // After stage init, ensure groups reflect any prefilled data
    FIELD_KEYS.forEach((key) => createOrUpdateFieldGroup(key));
  };
  probe.onerror = function () {
    initStage(800, 600);
    FIELD_KEYS.forEach((key) => createOrUpdateFieldGroup(key));
  };
  probe.src = CONFIG.imageUrl;
})();

