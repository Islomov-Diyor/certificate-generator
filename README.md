# University Certificate Generator

A Flask-based web application for university staff to generate certificates using pre-designed templates. The system supports two admin levels: Super Admin (manages templates and users) and Regular Admins (generate certificates).

## Features

- **Role-based Access Control**: Super Admin and Regular Admin roles
- **Template Management**: Upload and manage certificate templates (PNG/PDF from Canva)
- **Certificate Generation**: Fill forms with student details and generate PDF certificates
- **Auto-generated Elements**: Registration numbers, QR codes, university logos, and signatures
- **Download & Preview**: Preview certificates before downloading as PDF
- **User Management**: Super Admin can create and manage admin accounts

## Technology Stack
   
- **Backend**: Flask, SQLAlchemy
- **Frontend**: Bootstrap 5, Jinja2 templates
- **Database**: SQLite (easily configurable for PostgreSQL/MySQL)
- **PDF Generation**: ReportLab
- **QR Codes**: qrcode library
- **Authentication**: Flask-Login with bcrypt password hashing

## Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

### Setup Instructions

1. **Clone or download the project files**

2. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables** (optional but recommended):
   Create a `.env` file in the project root:
   ```env
   SECRET_KEY=your-secret-key-here-change-this-in-production
   FLASK_ENV=development
   ```

5. **Initialize the database**:
   ```bash
   python -m flask init-db
   ```

6. **Create the first Super Admin user**:
   ```bash
   python -m flask create-super-admin
   ```
   Follow the prompts to enter email and password.

7. **Run the application**:
   ```bash
   python app.py
   ```

8. **Access the application**:
   Open your browser and go to `http://localhost:5000`
   
   Login with the Super Admin credentials you created.

## Usage

### For Super Admin:

1. **Upload Templates**:
   - Go to "Templates" → "Upload New Template"
   - Upload certificate templates designed in Canva (PNG/PDF format)
   - Choose category: Subject Course or Honor Certificate

2. **Manage Users**:
   - Go to "Users" → "Create New User"
   - Create Regular Admin accounts for certificate generation staff

### For Regular Admins:

1. **Generate Certificates**:
   - From Dashboard, select a template
   - Fill in recipient details (name, specialization, course, etc.)
   - Preview the certificate
   - Download as PDF

2. **View Recent Certificates**:
   - Dashboard shows your recently generated certificates
   - Preview or download previously generated certificates

## File Structure

```
certificate_project/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── certificates.db        # SQLite database (created automatically)
├── uploads/
│   ├── templates/         # Uploaded certificate templates
│   ├── generated/         # Generated certificates (optional)
│   └── qrcodes/           # Generated QR codes
├── static/
│   ├── css/
│   │   └── style.css      # Custom styles
│   ├── js/
│   │   └── main.js        # JavaScript functionality
│   └── images/            # University logos, signatures
├── templates/
│   ├── base.html          # Base template
│   ├── auth/
│   │   └── login.html     # Login page
│   ├── admin/
│   │   ├── dashboard.html # Admin dashboard
│   │   ├── template_management.html
│   │   ├── upload_template.html
│   │   └── user_management.html
│   └── certificate/
│       ├── generator.html # Certificate generation form
│       └── preview.html   # Certificate preview
└── README.md              # This file
```

## Configuration

### Database Configuration

To use a different database (PostgreSQL, MySQL, etc.), modify the `SQLALCHEMY_DATABASE_URI` in `app.py`:

```python
# PostgreSQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://username:password@localhost/dbname'

# MySQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql://username:password@localhost/dbname'
```

### Security Configuration

**Important**: Change the default SECRET_KEY before deploying to production:

```python
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-production-secret-key')
```

### File Upload Configuration

Modify upload settings in `app.py`:

```python
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
```

## Deployment

### Production Deployment

1. **Use a production WSGI server**:
   ```bash
   pip install gunicorn
   gunicorn -w 4 app:app
   ```

2. **Environment variables for production**:
   ```bash
   export SECRET_KEY="your-production-secret-key"
   export FLASK_ENV="production"
   ```

3. **Reverse proxy with Nginx** (recommended):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
       
       location /static {
           alias /path/to/your/app/static;
       }
   }
   ```

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN mkdir -p uploads/templates uploads/generated uploads/qrcodes

EXPOSE 5000

CMD ["python", "app.py"]
```

Build and run:
```bash
docker build -t certificate-generator .
docker run -p 5000:5000 certificate-generator
```

## Security Considerations

1. **Change default SECRET_KEY** before production deployment
2. **Use HTTPS** in production
3. **Regular backups** of the database and uploaded templates
4. **File upload validation** is implemented (PNG, PDF, JPG, JPEG only)
5. **Password hashing** uses bcrypt
6. **Session management** with Flask-Login
7. **SQL injection protection** through SQLAlchemy ORM

## Troubleshooting

### Common Issues

1. **Database errors**:
   - Ensure write permissions for the application directory
   - Run `python -m flask init-db` to initialize database

2. **File upload errors**:
   - Check upload directory permissions
   - Ensure sufficient disk space
   - Verify file type and size limits

3. **Login issues**:
   - Clear browser cookies/cache
   - Verify user exists in database
   - Check password (use `create-super-admin` to reset)

### Getting Help

- Check application logs for error details
- Verify all dependencies are installed correctly
- Ensure database is properly initialized
- Check file permissions for upload directories

## License

This project is created for educational/institutional use. Please ensure compliance with your university's policies and data protection regulations.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For technical support or questions:
1. Check the troubleshooting section
2. Review application logs
3. Consult Flask documentation
4. Check Bootstrap 5 documentation for UI issues