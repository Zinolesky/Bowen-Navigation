from rest_framework.settings import api_settings
from rest_framework.throttling import SimpleRateThrottle


class AuthRateThrottle(SimpleRateThrottle):
    """Per-client IP rate limit for login and student registration endpoints."""

    scope = "auth"

    def get_rate(self):
        return (api_settings.DEFAULT_THROTTLE_RATES or {}).get(self.scope)

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class PlacesRateThrottle(SimpleRateThrottle):
    """Per-user (or per-IP) rate limit for proxied Google Places API endpoints."""

    scope = "places"

    def get_rate(self):
        return (api_settings.DEFAULT_THROTTLE_RATES or {}).get(self.scope)

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = f"user-{request.user.pk}"
        else:
            ident = self.get_ident(request)
        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }
