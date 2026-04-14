import os
from pathlib import Path

try:
    from decouple import config as env
except ImportError:
    env = None

try:
    import pymysql

    pymysql.install_as_MySQLdb()
except ImportError:
    # mysqlclient can still be used; this fallback keeps local setup flexible.
    pass


BASE_DIR = Path(__file__).resolve().parent.parent


def get_env(name: str, default: str = "") -> str:
    if env is not None:
        return env(name, default=default)
    return os.environ.get(name, default)


def get_env_bool(name: str, default: bool = False) -> bool:
    raw = get_env(name, str(default))
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


SECRET_KEY = get_env(
    "SECRET_KEY",
    "unsafe-local-dev-key-change-before-production",
)

DEBUG = get_env_bool("DEBUG", True)

ALLOWED_HOSTS = [
    host.strip() for host in get_env("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "backend",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mlops_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mlops_backend.wsgi.application"
ASGI_APPLICATION = "mlops_backend.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": get_env("DB_NAME", "mlops_db"),
        "USER": get_env("DB_USER", "user"),
        "PASSWORD": get_env("DB_PASSWORD", "user"),
        "HOST": get_env("DB_HOST", "localhost"),
        "PORT": int(get_env("DB_PORT", "3306")),
        "OPTIONS": {
            "charset": "utf8mb4",
            "connect_timeout": 10,
            "sql_mode": "STRICT_TRANS_TABLES",
        },
        "CONN_MAX_AGE": 60,
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
}

# Service-level toggles for modular orchestration.
BLOCKCHAIN_ENABLED = get_env_bool("BLOCKCHAIN_ENABLED", True)
BLOCKCHAIN_STRICT_LAYER1 = get_env_bool("BLOCKCHAIN_STRICT_LAYER1", True)
ML_PIPELINE_ROOT = BASE_DIR / "Army_ML_Pipeline_and_Files"
ML_PYTHON_EXECUTABLE = get_env("ML_PYTHON_EXECUTABLE", "python")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
