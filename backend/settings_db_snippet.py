"""
============================================================
 MLOPS- Django settings.py- Database Configuration
 Military Logistics Optimization & Prediction System
============================================================
 INSTRUCTIONS:
   1. pip install python-decouple mysqlclient
   2. Create a .env file in your Django project root (see below)
   3. Copy the DATABASES block into your settings.py
   4. Keep .env in .gitignore- NEVER commit passwords
============================================================

.env file template (create at project root, next to manage.py):
------------------------------------------------------------
DB_HOST=localhost
DB_PORT=3306
DB_NAME=mlops_db
DB_USER=root
DB_PASSWORD=your_mysql_password_here
SECRET_KEY=your-django-secret-key-here
DEBUG=True
------------------------------------------------------------
"""

# ── settings.py additions ────────────────────────────────────
# Place these imports at the top of your settings.py:

from decouple import config

# ── DATABASES block ──────────────────────────────────────────
# Replace the existing DATABASES dict in settings.py with this:

DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.mysql',
        'NAME':     config('DB_NAME',     default='mlops_db'),
        'USER':     config('DB_USER',     default='root'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST':     config('DB_HOST',     default='localhost'),
        'PORT':     config('DB_PORT',     default='3306', cast=int),
        'OPTIONS': {
            'charset': 'utf8mb4',
            # Recommended for production MySQL connections:
            'connect_timeout': 10,
            'sql_mode': 'STRICT_TRANS_TABLES',
        },
        'CONN_MAX_AGE': 60,   # Keep connections alive for 60 seconds (connection pooling)
    }
}

# ── INSTALLED_APPS addition ──────────────────────────────────
# Add your app to INSTALLED_APPS in settings.py, e.g.:
#
# INSTALLED_APPS = [
#     ...
#     'backend',      # ← your app containing models.py
# ]

# ── AUTH_USER_MODEL note ─────────────────────────────────────
# The Admin model uses a custom PK (user_id). If you want Django's
# authentication system to use it, set:
#
# AUTH_USER_MODEL = 'backend.Admin'
#
# And make Admin subclass AbstractBaseUser instead of models.Model.
# If using the Admin model only for display (not auth), leave as-is.

# ── Migration note ───────────────────────────────────────────
# health_scores is managed=False- Django won't create/alter it.
# All other tables are managed=True but the schema is already applied
# via: mysql -u root -p < database/schema.sql
#
# To avoid migration conflicts, run:
#   python manage.py migrate --fake-initial
#
# Or if starting fresh after schema import:
#   python manage.py migrate --run-syncdb
