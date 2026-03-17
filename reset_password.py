#!/usr/bin/env python
"""
Standalone script to reset a user's password.
Run: python reset_password.py
Works on PythonAnywhere when Flask CLI doesn't.
"""
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from app import User
from werkzeug.security import generate_password_hash


def main():
    with app.app_context():
        email = input("Enter user email: ").strip()
        if not email:
            print("Email is required.")
            return
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


if __name__ == "__main__":
    main()
