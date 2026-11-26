from rest_framework import permissions


class IsStaffAdminOrReadOnly(permissions.BasePermission):
    """
    Allows public read-only campus browsing (for students, staff, and guests),
    while restricting all mutations to authenticated staff administrators.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(getattr(request.user, "is_staff_admin", False) or request.user.is_staff)


class IsStaffAdmin(permissions.BasePermission):
    """Restricts access strictly to authenticated campus staff administrators."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(getattr(request.user, "is_staff_admin", False) or request.user.is_staff)
