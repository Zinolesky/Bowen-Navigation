import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bowen_navigator.settings")
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
try:
    user = User.objects.get(matric_number="BU22CSC1136")
    print("User exists:", user.full_name)
except Exception as e:
    print("Error:", e)
