from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("matric_number", "full_name", "is_staff_admin", "is_staff", "is_superuser")
    search_fields = ("matric_number", "full_name")
    ordering = ("matric_number",)

    fieldsets = (
        (None, {"fields": ("matric_number", "password")}),
        ("Personal info", {"fields": ("full_name",)}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "is_staff_admin", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
