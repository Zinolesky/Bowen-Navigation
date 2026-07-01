from datetime import timedelta
import os
from pathlib import Path


import sys

BASE_DIR = Path(__file__).resolve().parent.parent

if os.name == 'nt':
    import sys as _sys
    import glob as _glob
    
    # ── Locate GDAL/GEOS from Python packages (fiona/rasterio) ────────────────
    # QGIS's GDAL on Windows is notoriously difficult to load outside of its shell
    # due to complex Qt/C++ plugin dependencies and DLL Hell.
    # The modern, robust way to use GeoDjango on Windows is to point it to the 
    # clean GDAL binaries bundled in wheels for packages like 'fiona' or 'rasterio'.
    
    _site_packages = os.path.join(sys.prefix, "Lib", "site-packages")
    _gdal_dll = None
    _geos_dll = None
    
    # Check fiona.libs, rasterio.libs, or osgeo
    for _lib_dir in ["fiona.libs", "rasterio.libs", "osgeo"]:
        _path = os.path.join(_site_packages, _lib_dir)
        if os.path.isdir(_path):
            if _sys.version_info >= (3, 8):
                os.add_dll_directory(_path)
            
            # Find gdal*.dll
            _gdals = _glob.glob(os.path.join(_path, "gdal*.dll"))
            if _gdals:
                _gdal_dll = _gdals[0]
            
            # Find geos_c*.dll (GeoDjango needs the C API, not the C++ API)
            _geoses = _glob.glob(os.path.join(_path, "geos_c*.dll"))
            if _geoses:
                _geos_dll = _geoses[0]
                
            if _gdal_dll:
                break

    if _gdal_dll:
        os.environ.setdefault('GDAL_LIBRARY_PATH', _gdal_dll)
    if _geos_dll:
        os.environ.setdefault('GEOS_LIBRARY_PATH', _geos_dll)

from decouple import Csv, config

SECRET_KEY = config("SECRET_KEY", default="local-development-secret-change-in-env")
DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="127.0.0.1,localhost,10.0.2.2", cast=Csv())

GDAL_LIBRARY_PATH = config("GDAL_LIBRARY_PATH", default="")
GEOS_LIBRARY_PATH = config("GEOS_LIBRARY_PATH", default="")
if GDAL_LIBRARY_PATH:
    os.environ.setdefault("GDAL_LIBRARY_PATH", GDAL_LIBRARY_PATH)
if GEOS_LIBRARY_PATH:
    os.environ.setdefault("GEOS_LIBRARY_PATH", GEOS_LIBRARY_PATH)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "corsheaders",
    "rest_framework",
    "rest_framework_gis",
    "rest_framework_simplejwt",
    "colorfield",
    "leaflet",
    "accounts",
    "campus",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "bowen_navigator.urls"

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

WSGI_APPLICATION = "bowen_navigator.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": config("POSTGRES_DB", default="bowen_navigator"),
        "USER": config("POSTGRES_USER", default="bowen"),
        "PASSWORD": config("POSTGRES_PASSWORD", default="bowen_dev_password"),
        "HOST": config("POSTGRES_HOST", default="127.0.0.1"),
        "PORT": config("POSTGRES_PORT", default="5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Lagos"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_ALL_ORIGINS = config("CORS_ALLOW_ALL_ORIGINS", default=DEBUG, cast=bool)

REST_FRAMEWORK = {
    # "DEFAULT_AUTHENTICATION_CLASSES": (
    #     "rest_framework_simplejwt.authentication.JWTAuthentication",
    # ),
    # "DEFAULT_PERMISSION_CLASSES": (
    #     "rest_framework.permissions.IsAuthenticated",
    # ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

LEAFLET_CONFIG = {
    "DEFAULT_CENTER": (7.6236297, 4.1889662),
    "DEFAULT_ZOOM": 16,
    "MIN_ZOOM": 14,
    "MAX_ZOOM": 20,
    "TILES": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "ATTRIBUTION_PREFIX": "Powered by Leaflet",
}

GOOGLE_DIRECTIONS_API_KEY = config("GOOGLE_DIRECTIONS_API_KEY", default="")
GOOGLE_PLACES_API_KEY = config("GOOGLE_PLACES_API_KEY", default="")
