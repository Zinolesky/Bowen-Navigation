#!/bin/bash
set -e

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting server..."
if [ "${DEBUG,,}" = "true" ] || [ -z "${DEBUG}" ]; then
  exec gunicorn bowen_navigator.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 1 \
    --threads 8 \
    --keep-alive 5 \
    --reload
else
  exec gunicorn bowen_navigator.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 1 \
    --threads 8 \
    --keep-alive 5
fi
