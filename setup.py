#!/usr/bin/env python3
"""
University Certificate Generator - Setup Script
This script helps with initial setup and configuration
"""

import os
import sys
import subprocess
import getpass
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 8):
        print("❌ Error: Python 3.8 or higher is required")
        print(f"Current version: {sys.version}")
        sys.exit(1)
    print("✅ Python version is compatible")

def install_dependencies():
    """Install required Python packages"""
    print("\n📦 Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Dependencies installed successfully")
    except subprocess.CalledProcessError:
        print("❌ Error installing dependencies")
        sys.exit(1)

def create_env_file():
    """Create .env file with user input"""
    if os.path.exists('.env'):
        print("\n⚠️  .env file already exists")
        response = input("Do you want to overwrite it? (y/N): ")
        if response.lower() != 'y':
            return
    
    print("\n🔧 Creating .env file...")
    
    secret_key = input("Enter a secret key (or press Enter to generate one): ").strip()
    if not secret_key:
        import secrets
        secret_key = secrets.token_urlsafe(32)
        print(f"Generated secret key: {secret_key}")
    
    university_name = input("Enter university name: ").strip()
    university_website = input("Enter university website URL: ").strip()
    rector_name = input("Enter rector's full name: ").strip()
    
    env_content = f"""# University Certificate Generator Configuration
SECRET_KEY={secret_key}
FLASK_ENV=development
FLASK_DEBUG=True

# University Configuration
UNIVERSITY_NAME={university_name}
UNIVERSITY_WEBSITE={university_website}
RECTOR_NAME={rector_name}
"""
    
    with open('.env', 'w') as f:
        f.write(env_content)
    
    print("✅ .env file created successfully")

def create_directories():
    """Create necessary directories"""
    print("\n📁 Creating directories...")
    directories = [
        'uploads/templates',
        'uploads/generated',
        'uploads/qrcodes',
        'static/images'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
        print(f"✅ Created {directory}")

def init_database():
    """Initialize the database"""
    print("\n🗄️  Initializing database...")
    try:
        from app import app, db
        with app.app_context():
            db.create_all()
        print("✅ Database initialized successfully")
    except Exception as e:
        print(f"❌ Error initializing database: {e}")
        sys.exit(1)

def create_super_admin():
    """Create super admin user"""
    print("\n👤 Creating Super Admin user...")
    
    email = input("Enter Super Admin email: ").strip()
    if not email:
        print("❌ Email is required")
        return
    
    password = getpass.getpass("Enter password: ")
    if not password or len(password) < 6:
        print("❌ Password must be at least 6 characters")
        return
    
    confirm_password = getpass.getpass("Confirm password: ")
    if password != confirm_password:
        print("❌ Passwords do not match")
        return
    
    try:
        from app import app, db, User
        from werkzeug.security import generate_password_hash
        
        with app.app_context():
            # Check if user already exists
            existing_user = User.query.filter_by(email=email).first()
            if existing_user:
                print("⚠️  User with this email already exists")
                return
            
            # Create super admin
            super_admin = User(
                email=email,
                password_hash=generate_password_hash(password),
                role='super_admin'
            )
            db.session.add(super_admin)
            db.session.commit()
        
        print("✅ Super Admin created successfully")
        print(f"   Email: {email}")
        print(f"   Role: Super Admin")
        
    except Exception as e:
        print(f"❌ Error creating Super Admin: {e}")
        sys.exit(1)

def main():
    """Main setup function"""
    print("🎓 University Certificate Generator - Setup")
    print("=" * 50)
    
    try:
        # Check Python version
        check_python_version()
        
        # Install dependencies
        install_dependencies()
        
        # Create .env file
        create_env_file()
        
        # Create directories
        create_directories()
        
        # Initialize database
        init_database()
        
        # Create super admin
        create_super_admin()
        
        print("\n🎉 Setup completed successfully!")
        print("\nNext steps:")
        print("1. Run the application: python app.py")
        print("2. Open http://localhost:5000 in your browser")
        print("3. Login with your Super Admin credentials")
        print("4. Upload certificate templates")
        print("5. Create admin accounts for your staff")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Setup interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()