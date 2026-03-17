"""
Certificate layout schema and Pillow-based rendering.
Layout is stored as JSON (percent-based) in CertificateTemplate.text_positions
and optionally in uploads/certificate_overrides/{certificate_id}.json.

JSON schema (layout):
{
  "version": 1,
  "fields": {
    "recipient_name": { "x_pct": 50, "y_pct": 35, "anchor": "center", "max_width_pct": 85, "font_size": "large" },
    "specialization": { "x_pct": 50, "y_pct": 42, "anchor": "center", "max_width_pct": 80, "font_size": "medium" },
    "course_name": { ... },
    "teacher_name": { ... },
    "reg_number": { "x_pct": 50, "y_pct": 12, "anchor": "center", "font_size": "small" },
    "date": { "x_pct": 50, "y_pct": 88, "anchor": "center", "font_size": "small" },
    "qr_code": { "x_pct": 88, "y_pct": 92 }
  }
}
- x_pct, y_pct: 0-100 (anchor point position).
- anchor: "center" | "left" | "right" (horizontal alignment of text at anchor).
- max_width_pct: optional; text shrinks to fit within this width (percent of image).
- font_size: "large" | "medium" | "small" (optional).
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

# Base font sizes at reference height (so text scales with template size)
REFERENCE_HEIGHT = 1123  # A4 portrait at 96 DPI
FONT_SIZE_LARGE = 48
FONT_SIZE_MEDIUM = 32
FONT_SIZE_SMALL = 24
TEXT_COLOR = (0, 0, 0)
QR_DEFAULT_SIZE_PX = 150
# Scale factor limits so text is never tiny or huge
FONT_SCALE_MIN = 0.7
FONT_SCALE_MAX = 4.0

def _parse_color(val, default: Tuple[int, int, int] = (0, 0, 0)) -> Tuple[int, int, int]:
    """Convert a hex color string like '#ff0000' to an (R,G,B) tuple."""
    if not val or not isinstance(val, str):
        return default
    val = val.strip().lstrip('#')
    if len(val) == 6:
        try:
            return (int(val[0:2], 16), int(val[2:4], 16), int(val[4:6], 16))
        except ValueError:
            return default
    return default


LAYOUT_VERSION = 1
FIELD_KEYS = [
    'recipient_name', 'specialization', 'course_name', 'teacher_name',
    'reg_number', 'date', 'qr_code'
]
OPTIONAL_FIELDS = {'teacher_name', 'specialization'}  # Not rendered if value empty

# Default layout (percent) for A4 portrait
def get_default_layout() -> Dict[str, Any]:
    return {
        'version': LAYOUT_VERSION,
        'fields': {
            'recipient_name': {'x_pct': 50, 'y_pct': 35, 'anchor': 'center', 'max_width_pct': 85, 'font_size': 'large'},
            'specialization': {'x_pct': 50, 'y_pct': 42, 'anchor': 'center', 'max_width_pct': 80, 'font_size': 'medium'},
            'course_name': {'x_pct': 50, 'y_pct': 50, 'anchor': 'center', 'max_width_pct': 80, 'font_size': 'medium'},
            'teacher_name': {'x_pct': 50, 'y_pct': 58, 'anchor': 'center', 'max_width_pct': 80, 'font_size': 'medium'},
            'reg_number': {'x_pct': 50, 'y_pct': 12, 'anchor': 'center', 'font_size': 'small'},
            'date': {'x_pct': 50, 'y_pct': 88, 'anchor': 'center', 'font_size': 'small'},
            'qr_code': {'x_pct': 88, 'y_pct': 92},
        }
    }


def _pixel_layout_from_legacy(positions: Dict[str, Any], img_width: int, img_height: int) -> Dict[str, Any]:
    """Convert old pixel-based positions to new percent layout."""
    layout = {'version': LAYOUT_VERSION, 'fields': {}}
    for key in FIELD_KEYS:
        p = positions.get(key)
        if not p or 'x' not in p:
            layout['fields'][key] = get_default_layout()['fields'][key]
            continue
        x_pct = round((p['x'] / img_width) * 100, 2)
        y_pct = round((p['y'] / img_height) * 100, 2)
        if key == 'qr_code':
            layout['fields'][key] = {'x_pct': x_pct, 'y_pct': y_pct}
        else:
            layout['fields'][key] = {
                'x_pct': x_pct, 'y_pct': y_pct,
                'anchor': p.get('anchor', 'center'),
                'max_width_pct': p.get('max_width_pct', 85),
                'font_size': p.get('font_size', 'medium' if key != 'recipient_name' else 'large')
            }
    return layout


def normalize_layout(positions: Optional[Dict], img_width: int, img_height: int) -> Dict[str, Any]:
    """
    Return layout dict in canonical form (version + fields with x_pct, y_pct, anchor, etc.).
    If positions is old-style (flat x,y per field), convert to percent.
    """
    if not positions:
        return get_default_layout()
    if positions.get('version') == LAYOUT_VERSION and 'fields' in positions:
        return positions
    # Legacy: { recipient_name: { x, y }, ... }
    return _pixel_layout_from_legacy(positions, img_width, img_height)


def _scale_font_size(size_key: str, img_height: int) -> int:
    """Scale font size by template height so text is readable at any resolution."""
    base = FONT_SIZE_LARGE if size_key == 'large' else (FONT_SIZE_MEDIUM if size_key == 'medium' else FONT_SIZE_SMALL)
    scale = img_height / REFERENCE_HEIGHT
    scale = max(FONT_SCALE_MIN, min(FONT_SCALE_MAX, scale))
    return max(12, min(200, int(round(base * scale))))


def _get_font_at_size(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = [
        "C:/Windows/Fonts/arial.ttf",
        "arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _draw_text_with_anchor(
    draw: ImageDraw.ImageDraw,
    text: str,
    x_px: int, y_px: int,
    anchor: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    color: Tuple[int, int, int] = TEXT_COLOR,
    max_width_px: Optional[int] = None,
) -> None:
    if not text:
        return
    anchor = (anchor or 'center').lower()
    if max_width_px and max_width_px > 0:
        # Shrink font until text fits (only for truetype)
        font_path = getattr(font, 'path', None)
        try:
            if not font_path and hasattr(font, 'font') and hasattr(font.font, 'filename'):
                font_path = font.font.filename
        except Exception:
            font_path = None
        if font_path:
            start_size = getattr(font, 'size', 24)
            for size in range(start_size, 8, -2):
                try:
                    f = ImageFont.truetype(font_path, size)
                except Exception:
                    continue
                bbox = draw.textbbox((0, 0), text, font=f)
                tw = bbox[2] - bbox[0]
                if tw <= max_width_px:
                    font = f
                    break
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    if anchor == 'center':
        dx = x_px - tw // 2
    elif anchor == 'right':
        dx = x_px - tw
    else:
        dx = x_px
    dy = y_px - th // 2
    draw.text((dx, dy), text, fill=color, font=font)


def render_certificate_to_pil(
    template_img: Image.Image,
    *,
    recipient_name: str = '',
    specialization: str = '',
    course_name: str = '',
    teacher_name: str = '',
    reg_number: str = '',
    date_text: str = '',
    qr_img: Optional[Image.Image] = None,
    layout: Optional[Dict[str, Any]] = None,
    img_width: Optional[int] = None,
    img_height: Optional[int] = None,
) -> Image.Image:
    """
    Compose certificate on template image. Uses layout (percent-based).
    Optional fields: if value is empty, that field is not drawn.
    """
    # Work in RGBA so we can support transparent overlays (e.g., QR code background)
    if template_img.mode != 'RGBA':
        template_img = template_img.convert('RGBA')
    w = img_width or template_img.width
    h = img_height or template_img.height
    layout = normalize_layout(layout, w, h)
    fields_cfg = layout.get('fields', {})

    out = template_img.copy()
    draw = ImageDraw.Draw(out)

    data = {
        'recipient_name': recipient_name,
        'specialization': specialization,
        'course_name': course_name,
        'teacher_name': teacher_name,
        'reg_number': reg_number,
        'date': date_text,
    }

    for key in ['recipient_name', 'specialization', 'course_name', 'teacher_name', 'reg_number', 'date']:
        value = data.get(key, '')
        if key in OPTIONAL_FIELDS and not value:
            continue
        if key == 'date' and not value:
            continue
        cfg = fields_cfg.get(key, {})
        if cfg.get('visible') is False:
            continue
        x_pct = cfg.get('x_pct', 50)
        y_pct = cfg.get('y_pct', 50)
        x_px = int(w * (x_pct / 100.0))
        y_px = int(h * (y_pct / 100.0))
        anchor = cfg.get('anchor', 'center')
        max_width_pct = cfg.get('max_width_pct')
        max_width_px = int(w * (max_width_pct / 100.0)) if max_width_pct else None

        if cfg.get('font_size_px'):
            scale_ratio = h / REFERENCE_HEIGHT
            scale_ratio = max(FONT_SCALE_MIN, min(FONT_SCALE_MAX, scale_ratio))
            font_px = max(12, min(200, int(round(cfg['font_size_px'] * scale_ratio))))
        else:
            font_size_key = cfg.get('font_size', 'medium')
            if key == 'recipient_name':
                font_size_key = 'large'
            elif key in ('reg_number', 'date'):
                font_size_key = 'small'
            font_px = _scale_font_size(font_size_key, h)

        font = _get_font_at_size(font_px)
        color = _parse_color(cfg.get('color'), TEXT_COLOR)
        _draw_text_with_anchor(draw, value, x_px, y_px, anchor, font, color, max_width_px)

    if qr_img and 'qr_code' in fields_cfg and fields_cfg['qr_code'].get('visible', True) is not False:
        cfg = fields_cfg['qr_code']
        x_pct = cfg.get('x_pct', 88)
        y_pct = cfg.get('y_pct', 92)
        qr_scale = max(FONT_SCALE_MIN, min(FONT_SCALE_MAX, h / REFERENCE_HEIGHT))
        qr_size = max(80, min(int(round(QR_DEFAULT_SIZE_PX * qr_scale)), w // 4, h // 4))
        qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)
        x_px = int(w * (x_pct / 100.0)) - qr_size // 2
        y_px = int(h * (y_pct / 100.0)) - qr_size // 2
        x_px = max(0, min(x_px, w - qr_size))
        y_px = max(0, min(y_px, h - qr_size))
        # Preserve alpha channel so QR background can be transparent
        if qr_img.mode != 'RGBA':
            qr_img = qr_img.convert('RGBA')
        out.paste(qr_img, (x_px, y_px), mask=qr_img)

    return out


def load_certificate_override(upload_folder: str, certificate_id: int) -> Optional[Dict]:
    path = os.path.join(upload_folder, 'certificate_overrides', f'{certificate_id}.json')
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def save_certificate_override(upload_folder: str, certificate_id: int, layout: Dict) -> None:
    dir_path = os.path.join(upload_folder, 'certificate_overrides')
    os.makedirs(dir_path, exist_ok=True)
    path = os.path.join(dir_path, f'{certificate_id}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(layout, f, ensure_ascii=False, indent=2)


def pil_image_to_a4_pdf_buffer(pil_image: Image.Image, dpi: int = 300):
    """
    Wrap a PIL image in an A4 landscape PDF (print-ready). Image is scaled to
    fill the A4 page (fit within 841 x 595 points) so the certificate always
    fills the page with no tiny content or wrong fit.
    Returns io.BytesIO for send_file.
    """
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    import io

    # Use A4 landscape so certificates open in album orientation
    a4_w, a4_h = landscape(A4)  # points: ~841.89 x 595.28 (landscape)
    img_w, img_h = pil_image.size
    # Scale image to fit A4 so it fills the page (same logic for any template resolution)
    scale = min(a4_w / img_w, a4_h / img_h)
    draw_w = img_w * scale
    draw_h = img_h * scale
    offset_x = (a4_w - draw_w) / 2
    offset_y = (a4_h - draw_h) / 2

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(a4_w, a4_h))
    c.drawImage(ImageReader(pil_image), offset_x, offset_y, width=draw_w, height=draw_h)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf
