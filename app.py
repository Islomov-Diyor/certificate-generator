import os
import secrets
from datetime import datetime, timezone
from flask import Flask, render_template, request, redirect, url_for, flash, send_file, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, login_required, logout_user, current_user, UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import qrcode
from PIL import Image, ImageDraw, ImageFont
import io
import base64
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.lib.units import mm
import json
from editor_blueprint import editor
from certificate_rendering import (
    render_certificate_to_pil,
    normalize_layout,
    get_default_layout,
    load_certificate_override,
    save_certificate_override,
    pil_image_to_a4_pdf_buffer,
)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-change-this')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///certificates.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create upload directories
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'templates'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'generated'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'qrcodes'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'certificate_overrides'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'badge_templates'), exist_ok=True)

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Register editor blueprint
app.register_blueprint(editor)

# Database Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='admin')  # super_admin or admin
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    def __repr__(self):
        return f'<User {self.email}>'

class CertificateTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100), nullable=False)  # subject_course or honor_certificate
    file_path = db.Column(db.String(500), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    # Store text positions as JSON: {"recipient_name": {"x": 397, "y": 450}, ...}
    text_positions = db.Column(db.Text, nullable=True)
    
    def get_text_positions(self):
        """Get text positions as dictionary"""
        if self.text_positions:
            return json.loads(self.text_positions)
        return None
    
    def set_text_positions(self, positions):
        """Set text positions from dictionary"""
        self.text_positions = json.dumps(positions) if positions else None
    
    def __repr__(self):
        return f'<CertificateTemplate {self.name}>'

class GeneratedCertificate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('certificate_template.id'), nullable=False)
    admin_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    recipient_name = db.Column(db.String(255), nullable=False)
    specialization = db.Column(db.String(255), nullable=False)
    course_name = db.Column(db.String(255))
    teacher_name = db.Column(db.String(255))
    reg_number = db.Column(db.String(20), unique=True, nullable=False)
    qr_code_path = db.Column(db.String(500))
    generated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    download_count = db.Column(db.Integer, default=0)
    
    # Relationships
    template = db.relationship('CertificateTemplate', backref='generated_certificates', lazy=True)
    admin = db.relationship('User', backref='generated_certificates', lazy=True)
    
    def __repr__(self):
        return f'<GeneratedCertificate {self.reg_number}>'


class BadgeTemplate(db.Model):
    """Image-based badge templates uploaded by Super Admins."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    created_by_user = db.relationship('User', backref='badge_templates', lazy=True)

    def __repr__(self):
        return f'<BadgeTemplate {self.name}>'


class GeneratedBadge(db.Model):
    """Persisted badges so admins can re-open and re-download designs."""
    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('badge_template.id'), nullable=False)
    admin_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    first_name = db.Column(db.String(255))
    last_name = db.Column(db.String(255))
    institution = db.Column(db.String(255))
    participant_type = db.Column(db.String(50))
    layout_json = db.Column(db.Text, nullable=True)  # stores positions dict as JSON
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    download_count = db.Column(db.Integer, default=0)

    template = db.relationship('BadgeTemplate', backref='generated_badges', lazy=True)
    # Use a distinct backref name on User to avoid clashing with BadgeTemplate.backref
    admin = db.relationship('User', backref='badge_generated_badges', lazy=True)

    def get_layout(self):
        if self.layout_json:
            try:
                return json.loads(self.layout_json)
            except Exception:
                return {}
        return {}

    def set_layout(self, layout):
        self.layout_json = json.dumps(layout or {})

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Helper functions
def generate_registration_number():
    """Generate unique 7-digit registration number"""
    while True:
        number = str(secrets.randbelow(10000000)).zfill(7)
        if not GeneratedCertificate.query.filter_by(reg_number=number).first():
            return number

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'png', 'pdf', 'jpg', 'jpeg'}


def resolve_upload_path(relative_path):
    """Resolve relative file path to absolute (works on PythonAnywhere where CWD may differ)."""
    if not relative_path:
        return None
    if os.path.isabs(relative_path):
        return relative_path
    return os.path.join(app.root_path, relative_path)

def detect_placeholder_positions(template_path):
    """
    Detect placeholder text positions in template image.
    Looks for placeholders like {{RECIPIENT_NAME}}, {{SPECIALIZATION}}, etc.
    Returns dictionary with positions or None if detection fails.
    """
    try:
        # Load template image
        if template_path.lower().endswith('.pdf'):
            # Skip PDF for now - would need pdf2image
            return None
        
        img = Image.open(template_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Define placeholders to look for
        placeholders = {
            'recipient_name': ['{{RECIPIENT_NAME}}', '{{NAME}}', '{{RECIPIENT}}', '[NAME]', '[RECIPIENT]'],
            'specialization': ['{{SPECIALIZATION}}', '{{SPEC}}', '[SPECIALIZATION]'],
            'course_name': ['{{COURSE_NAME}}', '{{COURSE}}', '[COURSE]'],
            'teacher_name': ['{{TEACHER_NAME}}', '{{TEACHER}}', '[TEACHER]'],
            'reg_number': ['{{REG_NUMBER}}', '{{REG}}', '{{REGISTRATION}}', '[REG_NUMBER]'],
            'date': ['{{DATE}}', '{{ISSUE_DATE}}', '[DATE]']
        }
        
        # Try to load a font for text detection
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except:
            try:
                font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
            except:
                font = ImageFont.load_default()
        
        positions = {}
        draw = ImageDraw.Draw(img)
        
        # Search for each placeholder
        for field, placeholder_list in placeholders.items():
            found = False
            for placeholder in placeholder_list:
                # Get text bounding box
                bbox = draw.textbbox((0, 0), placeholder, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                
                # Search image for placeholder text (simple pixel-based search)
                # This is a simplified approach - for production, consider using OCR
                img_array = img.load()
                width, height = img.size
                
                # Try to find text by looking for patterns (simplified)
                # In production, use OCR like pytesseract for better detection
                # For now, we'll use a simpler approach: search for text-like regions
                
                # Since direct text detection is complex, we'll return None
                # and let the user use the editor UI instead
                break
            
            if not found:
                # If placeholder not found, use default positions
                pass
        
        # If we couldn't detect, return None to trigger editor UI
        return None
        
    except Exception as e:
        print(f"Error detecting placeholders: {e}")
        return None

def detect_placeholders_with_ocr(template_path):
    """
    Advanced placeholder detection using OCR (optional - requires pytesseract).
    Falls back to simple detection if OCR not available.
    """
    # Try to import OCR library (optional dependency)
    try:
        import pytesseract  # type: ignore
        from pytesseract import Output  # type: ignore
    except ImportError:
        # OCR not available, return None to use editor
        return None
    
    try:
        # Load image
        img = Image.open(template_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Use OCR to find text
        data = pytesseract.image_to_data(img, output_type=Output.DICT)
        
        placeholders = {
            'recipient_name': ['{{RECIPIENT_NAME}}', '{{NAME}}', '{{RECIPIENT}}'],
            'specialization': ['{{SPECIALIZATION}}', '{{SPEC}}'],
            'course_name': ['{{COURSE_NAME}}', '{{COURSE}}'],
            'teacher_name': ['{{TEACHER_NAME}}', '{{TEACHER}}'],
            'reg_number': ['{{REG_NUMBER}}', '{{REG}}', '{{REGISTRATION}}'],
            'date': ['{{DATE}}', '{{ISSUE_DATE}}']
        }
        
        positions = {}
        
        # Search OCR results for placeholders
        n_boxes = len(data['text'])
        for i in range(n_boxes):
            text = data['text'][i].strip()
            if text:
                for field, placeholder_list in placeholders.items():
                    for placeholder in placeholder_list:
                        if placeholder.upper() in text.upper():
                            x = data['left'][i]
                            y = data['top'][i]
                            positions[field] = {'x': x, 'y': y}
                            break
        
        return positions if positions else None
        
    except Exception as e:
        print(f"OCR detection error: {e}")
        return None

def generate_qr_code(url, filename):
    """Generate QR code and save to file"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(url)
    qr.make(fit=True)

    # Create QR with transparent background so it blends with certificate
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    datas = img.getdata()
    new_data = []
    for item in datas:
        # Turn pure white background pixels fully transparent
        if item[0] == 255 and item[1] == 255 and item[2] == 255:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    img.putdata(new_data)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'qrcodes', filename)
    img.save(filepath)
    return filepath

# Routes
@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        user = User.query.filter_by(email=email).first()
        
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid email or password', 'error')
    
    return render_template('auth/login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    templates = CertificateTemplate.query.all()
    recent_certificates = GeneratedCertificate.query.filter_by(admin_id=current_user.id).order_by(GeneratedCertificate.generated_at.desc()).limit(10).all()
    
    return render_template('admin/dashboard.html', 
                         templates=templates, 
                         recent_certificates=recent_certificates)

@app.route('/admin/templates')
@login_required
def manage_templates():
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('dashboard'))
    
    templates = CertificateTemplate.query.all()
    return render_template('admin/template_management.html', templates=templates)

@app.route('/admin/templates/upload', methods=['GET', 'POST'])
@login_required
def upload_template():
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        name = request.form['name']
        category = request.form['category']
        
        if 'template_file' not in request.files:
            flash('No file selected', 'error')
            return redirect(request.url)
        
        file = request.files['template_file']
        if file.filename == '':
            flash('No file selected', 'error')
            return redirect(request.url)
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{timestamp}_{filename}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'templates', filename)
            file.save(filepath)
            
            # Try to detect placeholder positions
            positions = detect_placeholders_with_ocr(filepath)
            if not positions:
                positions = detect_placeholder_positions(filepath)
            
            template = CertificateTemplate(
                name=name,
                category=category,
                file_path=filepath,
                created_by=current_user.id
            )
            
            # Set positions if detected, otherwise will need manual editing
            if positions:
                template.set_text_positions(positions)
                flash('Template uploaded successfully. Placeholders detected automatically.', 'success')
            else:
                flash('Template uploaded successfully. Please configure text positions in the editor.', 'success')
            
            db.session.add(template)
            db.session.commit()
            
            # If positions not detected, redirect to drag-and-drop editor
            if not positions:
                return redirect(url_for('template_editor', template_id=template.id))
            
            return redirect(url_for('manage_templates'))
        else:
            flash('Invalid file type. Only PNG, PDF, JPG, JPEG allowed.', 'error')
    
    return render_template('admin/upload_template.html')

@app.route('/admin/templates/delete/<int:template_id>')
@login_required
def delete_template(template_id):
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('dashboard'))

    template = CertificateTemplate.query.get_or_404(template_id)

    # Check if any certificates use this template (foreign key constraint)
    cert_count = GeneratedCertificate.query.filter_by(template_id=template_id).count()
    if cert_count > 0:
        flash(
            f'Cannot delete template: {cert_count} certificate(s) were generated from it. '
            'Delete those certificates first, or use a different template.',
            'error'
        )
        return redirect(url_for('manage_templates'))

    file_path = resolve_upload_path(template.file_path)
    try:
        if file_path and os.path.exists(file_path) and os.path.isfile(file_path):
            os.remove(file_path)
    except OSError as e:
        app.logger.warning(f'Could not delete template file {file_path}: {e}')
        # Continue with DB delete; file may be missing after redeploy

    try:
        db.session.delete(template)
        db.session.commit()
        flash('Template deleted successfully', 'success')
    except Exception as e:
        db.session.rollback()
        app.logger.exception('Template delete failed')
        flash(f'Could not delete template: {str(e)}', 'error')

    return redirect(url_for('manage_templates'))

@app.route('/admin/templates/<int:template_id>/edit-positions')
@login_required
def edit_template_positions(template_id):
    """Redirect to the new drag-and-drop template editor."""
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('dashboard'))
    return redirect(url_for('template_editor', template_id=template_id))


@app.route('/admin/templates/<int:template_id>/editor')
@login_required
def template_editor(template_id):
    """Drag-and-drop certificate template editor (Super Admin)."""
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('dashboard'))
    template = CertificateTemplate.query.get_or_404(template_id)
    return render_template('admin/template_editor.html', template=template)


@app.route('/api/templates/<int:template_id>/layout', methods=['GET'])
@login_required
def api_template_layout_get(template_id):
    if current_user.role != 'super_admin':
        return jsonify({'error': 'Forbidden'}), 403
    template = CertificateTemplate.query.get_or_404(template_id)
    raw = template.get_text_positions()
    if not raw:
        return jsonify(get_default_layout())
    if raw.get('version') == 1 and 'fields' in raw:
        return jsonify(raw)
    # Legacy pixel format: normalize using template image size
    try:
        path = resolve_upload_path(template.file_path)
        if path and os.path.exists(path):
            img = Image.open(path)
            w, h = img.size
        else:
            w, h = 794, 1123
    except Exception:
        w, h = 794, 1123
    return jsonify(normalize_layout(raw, w, h))


@app.route('/api/templates/<int:template_id>/layout', methods=['POST'])
@login_required
def api_template_layout_save(template_id):
    if current_user.role != 'super_admin':
        return jsonify({'error': 'Forbidden'}), 403
    template = CertificateTemplate.query.get_or_404(template_id)
    layout = request.get_json(force=True)
    if not layout or 'fields' not in layout:
        return jsonify({'error': 'Invalid layout: expected { version, fields }'}), 400
    template.set_text_positions(layout)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/admin/templates/<int:template_id>/image')
@login_required
def serve_template(template_id):
    """Serve template image for preview"""
    template = CertificateTemplate.query.get_or_404(template_id)
    file_path = resolve_upload_path(template.file_path)
    if file_path and os.path.exists(file_path) and os.path.isfile(file_path):
        return send_file(file_path)
    app.logger.warning(f'Template file not found: {template.file_path} (resolved: {file_path})')
    return '', 404


@app.route('/uploads/qrcodes/<path:filename>')
@login_required
def serve_qrcode(filename):
    """Serve generated QR code image (for preview sidebar)."""
    safe_dir = os.path.realpath(os.path.join(app.config['UPLOAD_FOLDER'], 'qrcodes'))
    path = os.path.realpath(os.path.join(app.config['UPLOAD_FOLDER'], 'qrcodes', filename))
    if not path.startswith(safe_dir) or not os.path.exists(path) or not os.path.isfile(path):
        return '', 404
    return send_file(path, mimetype='image/png')


@app.route('/badges')
@login_required
def badge_generator():
    """
    Badge Generator landing page.
    - Super Admin: can upload/manage badge templates and start designing.
    - Regular Admin: can pick an existing badge template and design participant badges.
    """
    templates = BadgeTemplate.query.order_by(BadgeTemplate.created_at.desc()).all()
    return render_template('badge/badge_dashboard.html', templates=templates)


@app.route('/badges/upload', methods=['GET', 'POST'])
@login_required
def upload_badge_template():
    """Super Admin upload for badge background images (PNG/JPG)."""
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('badge_generator'))

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        if not name:
            flash('Template name is required.', 'error')
            return redirect(request.url)

        if 'template_file' not in request.files:
            flash('No file selected', 'error')
            return redirect(request.url)

        file = request.files['template_file']
        if file.filename == '':
            flash('No file selected', 'error')
            return redirect(request.url)

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{timestamp}_{filename}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'badge_templates', filename)
            file.save(filepath)

            template = BadgeTemplate(
                name=name,
                file_path=filepath,
                created_by=current_user.id,
            )
            db.session.add(template)
            db.session.commit()

            flash('Badge template uploaded successfully.', 'success')
            return redirect(url_for('badge_generator'))
        else:
            flash('Invalid file type. Only PNG, JPG, JPEG allowed for badges.', 'error')

    return render_template('badge/upload_badge_template.html')


@app.route('/badges/templates/delete/<int:template_id>')
@login_required
def delete_badge_template(template_id):
    """Delete a badge template (Super Admin only)."""
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('badge_generator'))

    template = BadgeTemplate.query.get_or_404(template_id)

    file_path = resolve_upload_path(template.file_path)
    try:
        if file_path and os.path.exists(file_path) and os.path.isfile(file_path):
            os.remove(file_path)
    except OSError as e:
        app.logger.warning(f'Could not delete badge file {file_path}: {e}')

    try:
        db.session.delete(template)
        db.session.commit()
        flash('Badge template deleted successfully.', 'success')
    except Exception as e:
        db.session.rollback()
        app.logger.exception('Badge template delete failed')
        flash(f'Could not delete badge template: {str(e)}', 'error')

    return redirect(url_for('badge_generator'))


@app.route('/badges/templates/<int:template_id>/image')
@login_required
def serve_badge_template_image(template_id):
    """Serve badge template image for the badge designer."""
    template = BadgeTemplate.query.get_or_404(template_id)
    file_path = resolve_upload_path(template.file_path)
    if file_path and os.path.exists(file_path) and os.path.isfile(file_path):
        return send_file(file_path)
    app.logger.warning(f'Badge template file not found: {template.file_path}')
    return '', 404


@app.route('/badges/designer/<int:template_id>')
@login_required
def badge_designer(template_id):
    """
    Badge design page for a given template (new badge).
    Both Super Admin and Regular Admin can design badges here.
    """
    template = BadgeTemplate.query.get_or_404(template_id)
    return render_template('badge/designer.html', template=template, badge=None)


@app.route('/badges/designer/reopen/<int:badge_id>')
@login_required
def badge_designer_reopen(badge_id):
    """
    Re-open an existing saved badge in the designer with its data and layout.
    """
    badge = GeneratedBadge.query.get_or_404(badge_id)
    if current_user.role != 'super_admin' and badge.admin_id != current_user.id:
        flash('Access denied.', 'error')
        return redirect(url_for('badge_history'))
    template = badge.template
    return render_template('badge/designer.html', template=template, badge=badge)


def render_badge_to_pdf(template_path, positions, data):
    """
    Render a single badge to a high-quality PDF.
    - template_path: path to background image (PNG/JPG)
    - positions: { field_key: { x_pct, y_pct, font_size, anchor } }
    - data: { field_key: text }
    """
    # Open template image at native resolution
    img = Image.open(template_path).convert('RGB')
    w, h = img.size
    draw = ImageDraw.Draw(img)

    # Try to load a TrueType font; fall back to default
    font_paths = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/times.ttf",
    ]
    base_font = None
    for fp in font_paths:
        try:
            base_font = ImageFont.truetype(fp, size=32)
            break
        except Exception:
            continue
    if base_font is None:
        try:
            base_font = ImageFont.load_default()
        except Exception:
            base_font = None

    for key, meta in (positions or {}).items():
        text = (data or {}).get(key, '')
        if not text:
            continue

        x_pct = float(meta.get('x_pct', 50))
        y_pct = float(meta.get('y_pct', 50))
        font_size = int(meta.get('font_size', 32))
        anchor = meta.get('anchor', 'center')

        px = int(w * (x_pct / 100.0))
        py = int(h * (y_pct / 100.0))

        # Resolve font size
        font = base_font
        if font is not None:
            try:
                # If base_font has path, recreate with requested size
                if hasattr(font, "path") and font.path:
                    font = ImageFont.truetype(font.path, size=font_size)
                else:
                    # Best-effort for default font
                    font = ImageFont.truetype("arial.ttf", size=font_size)
            except Exception:
                font = base_font

        # Measure text for anchoring
        if font is not None:
            bbox = draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
        else:
            tw = th = 0

        if anchor == 'center':
            draw_x = px - tw // 2
            draw_y = py - th // 2
        elif anchor == 'right':
            draw_x = px - tw
            draw_y = py - th // 2
        else:  # left
            draw_x = px
            draw_y = py - th // 2

        draw.text((draw_x, draw_y), text, fill=(0, 0, 0), font=font)

    # Reuse existing helper to wrap image into an A4 PDF buffer
    pdf_buffer = pil_image_to_a4_pdf_buffer(img, dpi=300)
    return pdf_buffer


@app.route('/badges/export', methods=['POST'])
@login_required
def export_badge_pdf():
    """
    Export the currently designed badge as a PDF.
    Expects JSON body:
    {
      "template_id": 1,
      "positions": { field_key: { x_pct, y_pct, font_size, anchor } },
      "data": { "first_name": "...", "last_name": "...", "institution": "...", "participant_type": "..." }
    }
    """
    payload = request.get_json(force=True)
    template_id = payload.get('template_id')
    positions = payload.get('positions') or {}
    data = payload.get('data') or {}

    if not template_id:
        return jsonify({'error': 'template_id is required'}), 400

    template = BadgeTemplate.query.get_or_404(template_id)

    # Persist this badge so admins can re-download or re-open later
    badge = GeneratedBadge(
        template_id=template.id,
        admin_id=current_user.id,
        first_name=(data.get('first_name') or '').strip(),
        last_name=(data.get('last_name') or '').strip(),
        institution=(data.get('institution') or '').strip(),
        participant_type=(data.get('participant_type') or '').strip(),
    )
    badge.set_layout(positions)
    db.session.add(badge)
    db.session.commit()

    try:
        tpl_path = resolve_upload_path(template.file_path)
        pdf_buffer = render_badge_to_pdf(tpl_path, positions, data)
    except Exception as e:
        print(f"Error rendering badge PDF: {e}")
        # Roll back persisted badge if rendering fails
        db.session.delete(badge)
        db.session.commit()
        return jsonify({'error': 'Failed to render badge PDF'}), 500

    # Compose a friendly download filename
    first_name = (data.get('first_name') or '').strip().replace(' ', '_')
    last_name = (data.get('last_name') or '').strip().replace(' ', '_')
    display_name = (first_name + '_' + last_name).strip('_') or 'badge'
    download_name = f'{display_name}.pdf'

    return send_file(
        pdf_buffer,
        as_attachment=True,
        download_name=download_name,
        mimetype='application/pdf',
    )


@app.route('/badges/history')
@login_required
def badge_history():
    """
    List of previously generated badges for the current admin.
    Super Admins see all badges.
    """
    if current_user.role == 'super_admin':
        badges = GeneratedBadge.query.order_by(GeneratedBadge.created_at.desc()).all()
    else:
        badges = GeneratedBadge.query.filter_by(admin_id=current_user.id).order_by(GeneratedBadge.created_at.desc()).all()
    return render_template('badge/history.html', badges=badges)


@app.route('/badges/download/<int:badge_id>')
@login_required
def download_badge(badge_id):
    """Re-download a previously generated badge as PDF."""
    badge = GeneratedBadge.query.get_or_404(badge_id)
    if current_user.role != 'super_admin' and badge.admin_id != current_user.id:
        flash('Access denied.', 'error')
        return redirect(url_for('badge_history'))

    positions = badge.get_layout()
    data = {
        'first_name': badge.first_name or '',
        'last_name': badge.last_name or '',
        'institution': badge.institution or '',
        'participant_type': badge.participant_type or '',
    }

    try:
        tpl_path = resolve_upload_path(badge.template.file_path)
        pdf_buffer = render_badge_to_pdf(tpl_path, positions, data)
    except Exception as e:
        print(f"Error re-rendering badge PDF: {e}")
        flash('Failed to generate badge PDF.', 'error')
        return redirect(url_for('badge_history'))

    badge.download_count += 1
    db.session.commit()

    first_name = (badge.first_name or '').strip().replace(' ', '_')
    last_name = (badge.last_name or '').strip().replace(' ', '_')
    display_name = (first_name + '_' + last_name).strip('_') or f'badge_{badge.id}'
    download_name = f'{display_name}.pdf'

    return send_file(
        pdf_buffer,
        as_attachment=True,
        download_name=download_name,
        mimetype='application/pdf',
    )

@app.route('/certificate/design/<int:template_id>')
@login_required
def certificate_design(template_id):
    """Canva-style certificate editor (new certificate) – both Admin and Super Admin."""
    template = CertificateTemplate.query.get_or_404(template_id)
    return render_template('certificate/canva_editor.html', template=template, certificate=None)


@app.route('/certificate/<int:certificate_id>/design')
@login_required
def certificate_design_edit(certificate_id):
    """Canva-style certificate editor (existing certificate) – both Admin and Super Admin."""
    certificate = GeneratedCertificate.query.get_or_404(certificate_id)
    if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('dashboard'))
    return render_template('certificate/canva_editor.html',
                           template=certificate.template, certificate=certificate)


@app.route('/api/certificate/design/generate', methods=['POST'])
@login_required
def api_design_generate():
    """API: create (or update) a certificate from the Canva editor and return download URL."""
    data = request.get_json(force=True)
    template_id = data.get('template_id')
    certificate_id = data.get('certificate_id')
    fields = data.get('fields') or {}
    layout_data = data.get('layout')

    if not template_id:
        return jsonify({'error': 'template_id is required'}), 400

    template = CertificateTemplate.query.get_or_404(template_id)

    if certificate_id:
        certificate = GeneratedCertificate.query.get_or_404(certificate_id)
        if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
            return jsonify({'error': 'Forbidden'}), 403
        certificate.recipient_name = fields.get('recipient_name', certificate.recipient_name) or ''
        certificate.specialization = fields.get('specialization', certificate.specialization) or ''
        certificate.course_name = fields.get('course_name', certificate.course_name)
        certificate.teacher_name = fields.get('teacher_name', certificate.teacher_name)
    else:
        reg_number = generate_registration_number()
        qr_filename = f"qr_{reg_number}.png"
        qr_url = "https://university.uz"
        qr_code_path = generate_qr_code(qr_url, qr_filename)
        certificate = GeneratedCertificate(
            template_id=template_id,
            admin_id=current_user.id,
            recipient_name=fields.get('recipient_name', '') or '',
            specialization=fields.get('specialization', '') or '',
            course_name=fields.get('course_name', ''),
            teacher_name=fields.get('teacher_name', ''),
            reg_number=reg_number,
            qr_code_path=qr_code_path,
        )
        db.session.add(certificate)
        db.session.flush()

    if layout_data and 'fields' in layout_data:
        save_certificate_override(resolve_upload_path(app.config['UPLOAD_FOLDER']) or app.config['UPLOAD_FOLDER'], certificate.id, layout_data)

    db.session.commit()

    return jsonify({
        'ok': True,
        'certificate_id': certificate.id,
        'download_url': url_for('download_certificate', certificate_id=certificate.id),
        'preview_url': url_for('preview_certificate', certificate_id=certificate.id),
    })


@app.route('/certificate/generate/<int:template_id>')
@login_required
def generate_certificate_form(template_id):
    template = CertificateTemplate.query.get_or_404(template_id)
    return render_template('certificate/generator.html', template=template)

@app.route('/certificate/generate/<int:template_id>', methods=['POST'])
@login_required
def generate_certificate(template_id):
    template = CertificateTemplate.query.get_or_404(template_id)
    
    recipient_name = request.form['recipient_name']
    specialization = request.form['specialization']
    course_name = request.form.get('course_name', '')
    teacher_name = request.form.get('teacher_name', '')
    
    # Generate unique registration number
    reg_number = generate_registration_number()
    
    # Generate QR code
    qr_filename = f"qr_{reg_number}.png"
    qr_url = "https://university.uz"  # Replace with actual university website
    qr_code_path = generate_qr_code(qr_url, qr_filename)
    
    # Create certificate record
    certificate = GeneratedCertificate(
        template_id=template_id,
        admin_id=current_user.id,
        recipient_name=recipient_name,
        specialization=specialization,
        course_name=course_name,
        teacher_name=teacher_name,
        reg_number=reg_number,
        qr_code_path=qr_code_path
    )
    
    db.session.add(certificate)
    db.session.commit()
    
    flash('Certificate generated successfully', 'success')
    return redirect(url_for('preview_certificate', certificate_id=certificate.id))

@app.route('/certificate/preview/<int:certificate_id>')
@login_required
def preview_certificate(certificate_id):
    certificate = GeneratedCertificate.query.get_or_404(certificate_id)
    if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('dashboard'))
    return render_template('certificate/preview.html', certificate=certificate)


@app.route('/certificate/<int:certificate_id>/preview-image')
@login_required
def certificate_preview_image(certificate_id):
    """Return the certificate as PNG for live preview (what you see = what you get)."""
    certificate = GeneratedCertificate.query.get_or_404(certificate_id)
    if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
        return '', 403
    try:
        path = resolve_upload_path(certificate.template.file_path)
        if not path or not os.path.exists(path):
            return '', 404
        template_img = Image.open(path)
        w, h = template_img.size
    except Exception:
        return '', 404
    layout = certificate.template.get_text_positions()
    override = load_certificate_override(resolve_upload_path(app.config['UPLOAD_FOLDER']) or app.config['UPLOAD_FOLDER'], certificate.id)
    if override and 'fields' in override:
        layout = override
    layout = normalize_layout(layout, w, h)
    qr_img = None
    qr_path = resolve_upload_path(certificate.qr_code_path) if certificate.qr_code_path else None
    if qr_path and os.path.exists(qr_path):
        qr_img = Image.open(qr_path)
    pil_out = render_certificate_to_pil(
        template_img,
        recipient_name=certificate.recipient_name,
        specialization=certificate.specialization or '',
        course_name=certificate.course_name or '',
        teacher_name=certificate.teacher_name or '',
        reg_number=certificate.reg_number,
        date_text=certificate.generated_at.strftime('%B %d, %Y'),
        qr_img=qr_img,
        layout=layout,
        img_width=w,
        img_height=h,
    )
    buf = io.BytesIO()
    pil_out.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


@app.route('/certificate/<int:certificate_id>/editor')
@login_required
def certificate_editor_page(certificate_id):
    """Drag-and-drop editor for this certificate (admin can adjust layout)."""
    certificate = GeneratedCertificate.query.get_or_404(certificate_id)
    if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('dashboard'))
    return render_template('certificate/certificate_editor.html', certificate=certificate)


@app.route('/api/certificates/<int:certificate_id>/layout', methods=['GET'])
@login_required
def api_certificate_layout_get(certificate_id):
    certificate = GeneratedCertificate.query.get_or_404(certificate_id)
    if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
        return jsonify({'error': 'Forbidden'}), 403
    override = load_certificate_override(resolve_upload_path(app.config['UPLOAD_FOLDER']) or app.config['UPLOAD_FOLDER'], certificate.id)
    if override and 'fields' in override:
        return jsonify(override)
    template = certificate.template
    raw = template.get_text_positions()
    if not raw:
        return jsonify(get_default_layout())
    try:
        path = resolve_upload_path(template.file_path)
        if path and os.path.exists(path):
            img = Image.open(path)
            w, h = img.size
        else:
            w, h = 794, 1123
    except Exception:
        w, h = 794, 1123
    return jsonify(normalize_layout(raw, w, h))


@app.route('/api/certificates/<int:certificate_id>/layout', methods=['POST'])
@login_required
def api_certificate_layout_save(certificate_id):
    certificate = GeneratedCertificate.query.get_or_404(certificate_id)
    if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
        return jsonify({'error': 'Forbidden'}), 403
    layout = request.get_json(force=True)
    if not layout or 'fields' not in layout:
        return jsonify({'error': 'Invalid layout'}), 400
    save_certificate_override(resolve_upload_path(app.config['UPLOAD_FOLDER']) or app.config['UPLOAD_FOLDER'], certificate.id, layout)
    return jsonify({'ok': True})

@app.route('/certificate/download/<int:certificate_id>')
@login_required
def download_certificate(certificate_id):
    certificate = GeneratedCertificate.query.get_or_404(certificate_id)
    
    # Check if user has permission to download this certificate
    if current_user.role != 'super_admin' and certificate.admin_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('dashboard'))
    
    # Generate PDF
    pdf_buffer = generate_pdf_certificate(certificate)
    
    # Update download count
    certificate.download_count += 1
    db.session.commit()
    
    return send_file(
        pdf_buffer,
        as_attachment=True,
        download_name=f'certificate_{certificate.reg_number}.pdf',
        mimetype='application/pdf'
    )

def generate_pdf_certificate(certificate):
    """Generate PDF: Pillow composes certificate on template PNG; reportlab wraps to A4 (print-ready)."""
    try:
        template_path = resolve_upload_path(certificate.template.file_path)
        if not template_path or not os.path.exists(template_path):
            raise FileNotFoundError(f"Template file not found: {certificate.template.file_path}")
        if template_path.lower().endswith('.pdf'):
            try:
                from pdf2image import convert_from_path
                images = convert_from_path(template_path, first_page=1, last_page=1, dpi=300)
                template_img = images[0].convert('RGB') if images else Image.new('RGB', (794, 1123), 'white')
            except Exception:
                template_img = Image.new('RGB', (794, 1123), 'white')
        else:
            template_img = Image.open(template_path)
        w, h = template_img.size
        layout = certificate.template.get_text_positions()
        override = load_certificate_override(resolve_upload_path(app.config['UPLOAD_FOLDER']) or app.config['UPLOAD_FOLDER'], certificate.id)
        if override and 'fields' in override:
            layout = override
        layout = normalize_layout(layout, w, h)
        qr_img = None
        qr_path = resolve_upload_path(certificate.qr_code_path) if certificate.qr_code_path else None
        if qr_path and os.path.exists(qr_path):
            qr_img = Image.open(qr_path)
        pil_out = render_certificate_to_pil(
            template_img,
            recipient_name=certificate.recipient_name,
            specialization=certificate.specialization or '',
            course_name=certificate.course_name or '',
            teacher_name=certificate.teacher_name or '',
            reg_number=certificate.reg_number,
            date_text=certificate.generated_at.strftime('%B %d, %Y'),
            qr_img=qr_img,
            layout=layout,
            img_width=w,
            img_height=h,
        )
        return pil_image_to_a4_pdf_buffer(pil_out, dpi=300)
    except Exception as e:
        print(f"Error generating certificate: {e}")
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        c.setFont("Helvetica", 20)
        c.drawString(100, 750, f"Certificate for: {certificate.recipient_name}")
        c.drawString(100, 700, f"Specialization: {certificate.specialization}")
        if certificate.course_name:
            c.drawString(100, 650, f"Course: {certificate.course_name}")
        c.drawString(100, 600, f"Registration Number: {certificate.reg_number}")
        c.drawString(100, 550, f"Date: {certificate.generated_at.strftime('%Y-%m-%d')}")
        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer

@app.route('/admin/users')
@login_required
def manage_users():
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('dashboard'))
    
    users = User.query.all()
    return render_template('admin/user_management.html', users=users)

@app.route('/admin/users/create', methods=['POST'])
@login_required
def create_user():
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('dashboard'))
    
    email = request.form['email']
    password = request.form['password']
    role = request.form['role']
    
    # Check if user already exists
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        flash('User with this email already exists', 'error')
        return redirect(url_for('manage_users'))
    
    # Create new user
    new_user = User(
        email=email,
        password_hash=generate_password_hash(password),
        role=role
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    flash('User created successfully', 'success')
    return redirect(url_for('manage_users'))

@app.route('/admin/users/delete/<int:user_id>')
@login_required
def delete_user(user_id):
    if current_user.role != 'super_admin':
        flash('Access denied. Super Admin only.', 'error')
        return redirect(url_for('manage_users'))

    if user_id == current_user.id:
        flash('Cannot delete your own account', 'error')
        return redirect(url_for('manage_users'))

    user = User.query.get_or_404(user_id)

    # Check for related records (foreign key constraints)
    cert_count = GeneratedCertificate.query.filter_by(admin_id=user_id).count()
    badge_count = GeneratedBadge.query.filter_by(admin_id=user_id).count()
    template_count = CertificateTemplate.query.filter_by(created_by=user_id).count()
    badge_tpl_count = BadgeTemplate.query.filter_by(created_by=user_id).count()

    if cert_count or badge_count or template_count or badge_tpl_count:
        parts = []
        if cert_count:
            parts.append(f'{cert_count} certificate(s)')
        if badge_count:
            parts.append(f'{badge_count} badge(s)')
        if template_count:
            parts.append(f'{template_count} certificate template(s)')
        if badge_tpl_count:
            parts.append(f'{badge_tpl_count} badge template(s)')
        flash(
            f'Cannot delete user: they have {", ".join(parts)}. '
            'Delete or reassign those first.',
            'error'
        )
        return redirect(url_for('manage_users'))

    try:
        db.session.delete(user)
        db.session.commit()
        flash('User deleted successfully', 'success')
    except Exception as e:
        db.session.rollback()
        app.logger.exception('User delete failed')
        flash(f'Could not delete user: {str(e)}', 'error')

    return redirect(url_for('manage_users'))

# API endpoints for AJAX requests
@app.route('/api/templates')
@login_required
def api_templates():
    templates = CertificateTemplate.query.all()
    return jsonify([{
        'id': t.id,
        'name': t.name,
        'category': t.category,
        'created_at': t.created_at.isoformat()
    } for t in templates])

@app.route('/api/certificates')
@login_required
def api_certificates():
    if current_user.role == 'super_admin':
        certificates = GeneratedCertificate.query.all()
    else:
        certificates = GeneratedCertificate.query.filter_by(admin_id=current_user.id).all()
    
    return jsonify([{
        'id': c.id,
        'recipient_name': c.recipient_name,
        'specialization': c.specialization,
        'reg_number': c.reg_number,
        'generated_at': c.generated_at.isoformat(),
        'download_count': c.download_count
    } for c in certificates])

# Initialize database and create default super admin
@app.cli.command('init-db')
def init_db():
    """Initialize the database"""
    db.create_all()
    print("Database initialized successfully")

@app.cli.command('create-super-admin')
def create_super_admin():
    """Create default super admin user"""
    email = input("Enter super admin email: ")
    password = input("Enter password: ")
    
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        print("User with this email already exists")
        return
    
    super_admin = User(
        email=email,
        password_hash=generate_password_hash(password),
        role='super_admin'
    )
    
    db.session.add(super_admin)
    db.session.commit()
    print("Super admin created successfully")


@app.cli.command('reset-password')
def reset_password():
    """Reset password for a user by email"""
    email = input("Enter user email: ")
    user = User.query.filter_by(email=email).first()
    if not user:
        print(f"User with email '{email}' not found.")
        return
    password = input("Enter new password: ")
    if not password:
        print("Password cannot be empty.")
        return
    user.password_hash = generate_password_hash(password)
    db.session.commit()
    print(f"Password reset successfully for {email}")


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    # Use FLASK_DEBUG=1 in the environment to enable debug mode locally.
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug_mode)