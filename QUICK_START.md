# 🚀 Quick Start Guide

## Get Started in 5 Minutes

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Up Environment
```bash
# Copy example environment file
cp .env.example .env

# Edit .env file with your settings
nano .env  # or use any text editor
```

### 3. Initialize Database
```bash
python -m flask init-db
```

### 4. Create Super Admin
```bash
python -m flask create-super-admin
```

### 5. Run the Application
```bash
python app.py
```

### 6. Access the Application
- Open browser: `http://localhost:5000`
- Login with your Super Admin credentials

## Alternative: Automated Setup

Run the automated setup script:
```bash
python setup.py
```

This will:
- ✅ Check Python version
- ✅ Install dependencies
- ✅ Create .env file
- ✅ Create directories
- ✅ Initialize database
- ✅ Create Super Admin user

## First Time Setup

### As Super Admin:
1. **Upload Templates**: Go to Templates → Upload New Template
   - Upload PNG/PDF files from Canva
   - Choose category: Subject Course or Honor Certificate
   
2. **Create Users**: Go to Users → Create New User
   - Create Regular Admin accounts for your staff

### As Regular Admin:
1. **Generate Certificates**: Select template → Fill details → Generate
2. **Download PDF**: Preview certificate → Download

## Template Design Guidelines

Design templates in Canva with:
- **Size**: A4 (210mm x 297mm)
- **Format**: PNG or PDF
- **Elements to include**:
  - University logo
  - Official signatures
  - Decorative borders
  - Space for dynamic text
- **Elements that will be auto-added**:
  - Registration numbers
  - QR codes
  - Student names
  - Dates

## File Structure
```
├── app.py              # Main application
├── requirements.txt    # Python packages
├── templates/          # HTML templates
├── static/            # CSS, JS, images
├── uploads/           # Templates & generated files
└── certificates.db    # Database
```

## Common Commands

```bash
# Run application
python app.py

# Initialize database
python -m flask init-db

# Create super admin
python -m flask create-super-admin

# Run with Docker
docker-compose up

# Run tests (if implemented)
pytest
```

## Need Help?

- Check `README.md` for detailed documentation
- Review application logs for errors
- Ensure database is initialized
- Check file permissions for uploads

## Production Deployment

1. **Security**: Change SECRET_KEY in .env
2. **Database**: Consider PostgreSQL/MySQL
3. **Server**: Use Gunicorn + Nginx
4. **HTTPS**: Enable SSL certificate

---

**Ready to start? Run `python app.py` and visit http://localhost:5000**