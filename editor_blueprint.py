from flask import Blueprint, request, jsonify, current_app, send_file, render_template, url_for
from flask_login import login_required
import os
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import json
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import qrcode

editor = Blueprint('editor', __name__, template_folder='templates', static_folder='static')

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
META_DIR = os.path.join(BASE_DIR, 'templates_meta')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(META_DIR, exist_ok=True)

@editor.route('/editor')
@login_required
def editor_page():
    return render_template('editor.html')

@editor.route('/editor/upload_template', methods=['POST'])
@login_required
def upload_template():
    """
    Save uploaded template image and return metadata (template_id, width, height, url).
    """
    f = request.files.get('template')
    if not f:
        return jsonify({'error': 'No file uploaded'}), 400
    
    filename = f.filename
    # Ensure unique filename
    base, ext = os.path.splitext(filename)
    i = 0
    while True:
        candidate = f"{base}{('-' + str(i) if i else '')}{ext}"
        path = os.path.join(UPLOAD_DIR, candidate)
        if not os.path.exists(path):
            break
        i += 1
    
    f.save(path)
    
    # get image size
    img = Image.open(path)
    w, h = img.size
    
    template_id = os.path.basename(path)
    url = url_for('editor.uploaded_template', filename=template_id)
    
    return jsonify({'template_id': template_id, 'width': w, 'height': h, 'url': url})

@editor.route('/uploads/<path:filename>')
@login_required
def uploaded_template(filename):
    return send_file(os.path.join(UPLOAD_DIR, filename))

@editor.route('/editor/save_positions', methods=['POST'])
@login_required
def save_positions():
    payload = request.get_json(force=True)
    template_id = payload.get('template_id')
    positions = payload.get('positions')
    
    if not template_id or not positions:
        return jsonify({'error': 'template_id and positions required'}), 400
    
    meta_path = os.path.join(META_DIR, f"{template_id}.json")
    with open(meta_path, 'w', encoding='utf-8') as fh:
        json.dump({'template_id': template_id, 'positions': positions}, fh, ensure_ascii=False, indent=2)
    
    return jsonify({'ok': True, 'meta_path': meta_path})

@editor.route('/editor/load_positions')
@login_required
def load_positions():
    template_id = request.args.get('template_id')
    if not template_id:
        return jsonify({'error': 'template_id required'}), 400
    
    meta_path = os.path.join(META_DIR, f"{template_id}.json")
    if not os.path.exists(meta_path):
        return jsonify({'positions': None})
    
    with open(meta_path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    
    return jsonify(data)

@editor.route('/editor/suggest_positions', methods=['POST'])
@login_required
def suggest_positions():
    """
    Placeholder autosuggest endpoint.
    NOTE: Project dependencies do NOT include OCR. Return empty suggestion list and explanation.
    """
    # Return empty suggestions with guidance so UI can still work
    return jsonify({
        'ok': True,
        'suggestions': [],
        'message': 'No OCR engine available in current environment. Install pytesseract/tesseract and re-enable autosuggest for automatic placeholder detection.'
    })

@editor.route('/editor/preview_render', methods=['POST'])
@login_required
def preview_render():
    """
    Renders a PDF preview composed from the template image and data fields.
    Payload:
    {
        "template_id": "file.png",
        "positions": { "recipient_name": {"x":..., "y":..., "anchor":"center", "max_width":...}, ... },
        "data": { "recipient_name": "Name", ... }
    }
    """
    payload = request.get_json(force=True)
    template_id = payload.get('template_id')
    positions = payload.get('positions', {})
    data = payload.get('data', {})
    
    if not template_id:
        return jsonify({'error': 'template_id required'}), 400
    
    template_path = os.path.join(UPLOAD_DIR, template_id)
    if not os.path.exists(template_path):
        return jsonify({'error': 'template not found'}), 404
    
    # Open template image
    img = Image.open(template_path).convert('RGB')
    w, h = img.size
    
    # Create a PDF in memory with reportlab sized to A4 (we will place image centered)
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    
    # Compute scale to place template image on A4 while preserving aspect ratio
    a4_w, a4_h = A4  # points (1 point = 1/72 inch)
    # We will convert pixels to points by assuming 96 DPI for the image. If template has different DPI, consider storing DPI in metadata.
    DPI = 96.0
    img_w_pts = w * 72.0 / DPI
    img_h_pts = h * 72.0 / DPI
    scale = min(a4_w / img_w_pts, a4_h / img_h_pts)
    draw_w = img_w_pts * scale
    draw_h = img_h_pts * scale
    offset_x = (a4_w - draw_w) / 2
    offset_y = (a4_h - draw_h) / 2
    
    # Place template image
    pil_img_reader = ImageReader(img)
    c.drawImage(pil_img_reader, offset_x, offset_y, width=draw_w, height=draw_h)
    
    # Draw text fields onto the PDF using provided positions
    # Use Pillow to render text into a temporary image, then composite onto PDF to support better font metrics. We will use a default font.
    for key, meta in positions.items():
        text = data.get(key, '')
        if not text:
            continue
        
        # Expected meta: {x: <percent_or_px>, y: <percent_or_px>, unit: 'percent'|'px', anchor: 'center'|'left'|'right', max_width: <px_or_percent>}
        unit = meta.get('unit', 'percent')
        x_raw = meta.get('x', 50)
        y_raw = meta.get('y', 50)
        anchor = meta.get('anchor', 'center')
        max_width = meta.get('max_width', None)
        
        # Convert to image px coords first
        if unit == 'percent':
            px = int(w * (x_raw / 100.0))
            py = int(h * (y_raw / 100.0))
            if isinstance(max_width, (int,float)):
                max_w_px = int(w * (max_width / 100.0))
            else:
                max_w_px = None
        else:
            px = int(x_raw)
            py = int(y_raw)
            max_w_px = int(max_width) if max_width else None
        
        # Create a tiny image to render the text to measure size
        # Choose a default TrueType font from system; fallback to default PIL font
        font = None
        # Try common Windows font paths
        font_paths = [
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibri.ttf",
            "C:/Windows/Fonts/times.ttf",
        ]
        for font_path in font_paths:
            try:
                font = ImageFont.truetype(font_path, size=36)
                break
            except Exception:
                continue
        
        if font is None:
            try:
                font = ImageFont.load_default()
            except:
                font = None
        
        # Render onto a transparent image then paste onto PDF with transformation
        txt_img = Image.new('RGBA', (w, h), (0,0,0,0))
        draw = ImageDraw.Draw(txt_img)
        
        # Simple shrink-to-fit: if max width provided, reduce font size until fits
        font_size = 48
        if font and getattr(font, 'path', None) is None:
            # loaded default font doesn't allow resizing; skip shrink logic for default
            current_font = font
        else:
            # attempt to resize if truetype available
            if font and hasattr(font, 'path') and font.path:
                try:
                    font_path = font.path
                    while font_size > 8:
                        try_font = ImageFont.truetype(font_path, size=font_size)
                        bbox = draw.textbbox((0, 0), text, font=try_font)
                        tw = bbox[2] - bbox[0]
                        th = bbox[3] - bbox[1]
                        if max_w_px is None or tw <= max_w_px:
                            current_font = try_font
                            break
                        font_size -= 2
                    else:
                        current_font = ImageFont.truetype(font_path, size=12)
                except Exception:
                    current_font = font
            else:
                current_font = font
        
        bbox = draw.textbbox((0, 0), text, font=current_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        
        # Compute draw position according to anchor
        if anchor == 'center':
            draw_x = px - tw // 2
            draw_y = py - th // 2
        elif anchor == 'right':
            draw_x = px - tw
            draw_y = py - th // 2
        else:  # left or default
            draw_x = px
            draw_y = py - th // 2
        
        draw.text((draw_x, draw_y), text, fill=(0,0,0,255), font=current_font)
        
        # Composite this text image onto the PDF. Convert pixel coords to points with the same DPI scaling used earlier
        # Create an ImageReader for the txt_img crop that contains the bounding box
        crop_box = (draw_x, draw_y, draw_x + tw, draw_y + th)
        # Ensure box is within image bounds
        crop_box = (
            max(0, crop_box[0]), max(0, crop_box[1]),
            min(w, crop_box[2]), min(h, crop_box[3])
        )
        
        if crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
            continue
        
        pieces = txt_img.crop(crop_box)
        piece_w_px, piece_h_px = pieces.size
        
        # convert to points then scale with 'scale' and offset_x/offset_y
        piece_w_pts = piece_w_px * 72.0 / DPI * scale
        piece_h_pts = piece_h_px * 72.0 / DPI * scale
        
        # compute destination position in points
        dest_x_pts = offset_x + (crop_box[0] * 72.0 / DPI) * scale
        dest_y_pts = offset_y + ((h - crop_box[3]) * 72.0 / DPI) * scale  # reportlab origin bottom-left, we anchored top-left -> convert
        
        # Draw onto PDF
        c.drawImage(ImageReader(pieces), dest_x_pts, dest_y_pts, width=piece_w_pts, height=piece_h_pts, mask='auto')
    
    c.showPage()
    c.save()
    buffer.seek(0)
    
    return send_file(buffer, as_attachment=False, download_name='preview.pdf', mimetype='application/pdf')

