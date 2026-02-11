# Login credentials

There are **no built-in default usernames or passwords**. Users are created in one of these ways.

---

## Quick one-step setup (after Python is installed)

From the project folder in **Command Prompt** or **PowerShell**:

```bash
python setup_admin.py
```

This initializes the database (if needed) and then you can create a **super admin** account using your **own email and a strong password** (see options below). Do **not** use hard-coded example passwords in production.

On Windows you can also double-click **RUN_SETUP_ADMIN.bat** (after Python is on your PATH).

---

## Super Admin

### Option 1: Flask CLI (interactive – recommended)

```bash
python -m flask init-db          # if DB not yet created
python -m flask create-super-admin
```

Then enter the **email** and **password** you want when prompted. That user will be **super_admin**. Choose a **unique email** and a **strong password** that are not used anywhere else.

---

## Admin (normal user)

There is **no default admin account**. Regular admins are created by a **super admin**:

1. Log in as **super admin**.
2. Go to **Users** (or **Admin → Users**).
3. Use **Create New User**.
4. Enter email, password, and role **admin**.

Those email/password values are the admin’s login credentials.

---

## Summary

| Role         | How to get credentials |
|-------------|-------------------------|
| **Super admin** | Create via `python -m flask create-super-admin` and choose your own **email** and **strong password** (nothing is hard-coded). |
| **Admin**       | Created by super admin in the app (Users → Create New User). No default; use the email/password set there. |

---

## If `python` doesn't work

- **Windows:** If you see only "Python" or "python is not recognized", install Python from [python.org](https://www.python.org/downloads/) and check **"Add Python to PATH"** during setup. Then open a **new** Command Prompt or PowerShell and run the commands again.
- **Git Bash:** Prefer **Command Prompt** or **PowerShell** for `python` and `flask`; or use the full path to your real `python.exe` (e.g. in `AppData\Local\Programs\Python\Python3xx\`).
