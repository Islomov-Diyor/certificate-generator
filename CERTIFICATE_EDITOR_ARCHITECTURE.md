# Certificate Template Editor – Architecture

## Overview

The certificate template editor is a **drag-and-drop**, **canvas-based** editor (Konva.js) that replaces manual X/Y coordinate input. Templates are PNG only; editing and preview are done on the PNG; the final download is a high-quality A4 PDF (Pillow composes the image, reportlab wraps it to PDF).

## Roles

### Super Admin
- **Upload** a PNG certificate template (portrait) via **Templates → Upload**.
- After upload, is redirected to the **Template Editor** (`/admin/templates/<id>/editor`).
- Can **position all fields** (recipient name, specialization, course, teacher, reg number, date, **QR code**) by dragging boxes on the template.
- **Saves layout** once per template; positions are stored as **percent** in `CertificateTemplate.text_positions` (JSON).
- Does this **once per template**.

### Admin (normal user)
- **Selects** an existing template and **fills** certificate data (name, course, date; optional teacher, optional specialization).
- After generating, lands on the **Preview** page with a **live certificate image** (what you see = what you get).
- Can click **Adjust layout** to open the **Certificate Editor** (`/certificate/<id>/editor`) and drag fields for **this certificate only**; saved as an override file (no DB schema change).
- **Downloads** final certificate as **PDF** (high quality, print-ready).

## Editor UX (no dots, no manual X/Y)

- **Drag-and-drop** text boxes directly on the certificate image.
- **Bounding boxes** with sample/real text.
- **Snap** to center (vertical/horizontal guides).
- **Keyboard nudge**: arrow keys (with Shift for larger steps).
- **Alignment**: Left / Center / Right for the selected field.
- **Max width** with shrink-to-fit for long names (stored as `max_width_pct`).
- **Optional fields**: teacher name and specialization – if empty, the field is **not rendered** in the final PDF.
- **Live preview** in the editor and on the preview page matches the **final downloaded PDF**.

## Technical Design

### Stack (unchanged)
- **Backend**: Flask, Pillow, reportlab, qrcode. No new Python dependencies.
- **Frontend**: Konva.js loaded via CDN.

### Layout JSON schema

Stored in `CertificateTemplate.text_positions` (and optionally in `uploads/certificate_overrides/<certificate_id>.json` for per-certificate overrides):

```json
{
  "version": 1,
  "fields": {
    "recipient_name": {
      "x_pct": 50,
      "y_pct": 35,
      "anchor": "center",
      "max_width_pct": 85,
      "font_size": "large"
    },
    "specialization": { "x_pct": 50, "y_pct": 42, "anchor": "center", "max_width_pct": 80, "font_size": "medium" },
    "course_name": { "x_pct": 50, "y_pct": 50, "anchor": "center", "max_width_pct": 80, "font_size": "medium" },
    "teacher_name": { "x_pct": 50, "y_pct": 58, "anchor": "center", "max_width_pct": 80, "font_size": "medium" },
    "reg_number": { "x_pct": 50, "y_pct": 12, "anchor": "center", "font_size": "small" },
    "date": { "x_pct": 50, "y_pct": 88, "anchor": "center", "font_size": "small" },
    "qr_code": { "x_pct": 88, "y_pct": 92 }
  }
}
```

- **x_pct, y_pct**: 0–100, position of the anchor point on the template (percent of width/height).
- **anchor**: `"center"` | `"left"` | `"right"` – horizontal alignment of text at that point.
- **max_width_pct**: optional; text is shrunk to fit within this width (percent of image).
- **font_size**: `"large"` | `"medium"` | `"small"` (optional).

Legacy pixel-based positions (old `{ "recipient_name": { "x": 397, "y": 450 }, ... }`) are **normalized to percent** at load time using the template image dimensions (`certificate_rendering.normalize_layout`).

### File-by-file summary

| File | Role |
|------|------|
| `certificate_rendering.py` | Layout schema, `normalize_layout`, `render_certificate_to_pil`, `pil_image_to_a4_pdf_buffer`, override load/save. |
| `app.py` | Template editor route, certificate editor route, API layout get/save (template + certificate), preview image endpoint, `generate_pdf_certificate` using new rendering + reportlab A4 wrap. |
| `templates/admin/template_editor.html` | Super admin editor page (Konva stage, sidebar, config). |
| `templates/certificate/certificate_editor.html` | Admin certificate layout editor page. |
| `templates/certificate/preview.html` | Live certificate image + “Adjust layout” button. |
| `static/editor/certificate_editor.js` | Konva editor: drag, snap, nudge, alignment, save/load, export/import JSON. |
| `static/editor/certificate_editor.css` | Editor layout and sidebar styles. |

### Flask endpoints

- **GET** `/admin/templates/<id>/editor` – Template editor page (super admin).
- **GET** `/api/templates/<id>/layout` – Get layout JSON for template.
- **POST** `/api/templates/<id>/layout` – Save layout JSON (super admin).
- **GET** `/certificate/<id>/preview-image` – Certificate as PNG (live preview).
- **GET** `/certificate/<id>/editor` – Certificate editor page (admin).
- **GET** `/api/certificates/<id>/layout` – Get layout (template + override).
- **POST** `/api/certificates/<id>/layout` – Save certificate layout override (admin).

### Pillow rendering

- `render_certificate_to_pil()` in `certificate_rendering.py` composes the certificate on the template PNG using the layout (percent → pixels), draws text with anchor and optional shrink-to-fit, pastes the QR code. Optional fields are skipped when value is empty.
- The result is a single PIL Image. `pil_image_to_a4_pdf_buffer()` wraps it in an A4 portrait PDF with reportlab (image scaled to fit, centered). No HTML-to-PDF; no PDF templates required.

### What was not changed

- Authentication, database models (only reuse of existing `text_positions` and file-based overrides), certificate generation flow (create record → preview → download).
- No OCR, no new Python dependencies, no PDF templates, no HTML-to-PDF.
