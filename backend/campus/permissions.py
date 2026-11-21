from rest_framework import permissions


class IsStaffAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(getattr(request.user, "is_staff_admin", False) or request.user.is_staff)

