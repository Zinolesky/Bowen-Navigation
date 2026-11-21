import math
from urllib.parse import quote

from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from django.http import HttpResponse
import requests
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Building, Category, PointOfInterest, Track
from .permissions import IsStaffAdminOrReadOnly
from .routing import dijkstra_route
from .serializers import (
    BuildingSerializer,
    CategorySerializer,
    LoginSerializer,
    PointOfInterestGeoSerializer,
    PointOfInterestWriteSerializer,
    TrackGeoSerializer,
)
from .signals import get_campus_cache_version

_google_session = requests.Session()
_PLACE_DETAILS_TTL = 3600
_PLACE_PHOTO_TTL = 86400


def _etag_matches(request, etag: str) -> bool:
    inm = request.META.get("HTTP_IF_NONE_MATCH", "")
    if not inm:
        return False
    return any(tag.strip() in (etag, "*") for tag in inm.split(","))


def _cached_etag_response(request, suffix: str, cache_key: str, builder):
    version = get_campus_cache_version()
    etag = f'W/"campus-v{version}-{suffix}"'
    if _etag_matches(request, etag):
        resp = Response(status=status.HTTP_304_NOT_MODIFIED)
        resp["ETag"] = etag
        resp["Cache-Control"] = "private, no-cache"
        return resp

    full_key = f"campus:v{version}:{cache_key}"
    data = cache.get(full_key)
    if data is None:
        data = builder()
        cache.set(full_key, data, timeout=None)

    resp = Response(data)
    resp["ETag"] = etag
    resp["Cache-Control"] = "private, no-cache"
    return resp


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "ok", "service": "Bowen Navigator API"})


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(serializer.create_token_response())


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def list(self, request, *args, **kwargs):
        return _cached_etag_response(
            request,
            "categories",
            "categories",
            lambda: self.get_serializer(self.get_queryset(), many=True).data,
        )


class BuildingViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Building.objects.all()
    serializer_class = BuildingSerializer


class TrackViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Track.objects.all()
    serializer_class = TrackGeoSerializer

    def get_queryset(self):
        queryset = Track.objects.all()
        track_type = self.request.query_params.get("track_type")
        if track_type:
            queryset = queryset.filter(track_type=track_type)
        return queryset

    def list(self, request, *args, **kwargs):
        track_type = (request.query_params.get("track_type") or "all").strip()
        return _cached_etag_response(
            request,
            f"tracks-{track_type}",
            f"tracks:{track_type}",
            lambda: self.get_serializer(self.get_queryset(), many=True).data,
        )


class PointOfInterestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffAdminOrReadOnly]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["include_sprites"] = self.request.query_params.get("include_sprites") == "true"
        return ctx

    def get_queryset(self):
        queryset = PointOfInterest.objects.select_related("category", "building")
        if self.request.query_params.get("include_inactive") != "true":
            queryset = queryset.filter(is_active=True)

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(description__icontains=search)
                | Q(category__name__icontains=search)
                | Q(building__name__icontains=search)
            )

        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category__slug=category)

        return queryset.distinct()

    def get_serializer_class(self):
        if self.request.method in ("POST", "PUT", "PATCH"):
            return PointOfInterestWriteSerializer
        return PointOfInterestGeoSerializer

    def list(self, request, *args, **kwargs):
        search = request.query_params.get("search")
        category = request.query_params.get("category")
        if not search and not category:
            include_inactive = request.query_params.get("include_inactive") == "true"
            include_sprites = request.query_params.get("include_sprites") == "true"
            suffix = f"pois-{int(include_inactive)}-{int(include_sprites)}"
            return _cached_etag_response(
                request,
                suffix,
                suffix,
                lambda: self.get_serializer(self.get_queryset(), many=True).data,
            )
        return super().list(request, *args, **kwargs)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def campus_bootstrap(request):
    include_sprites = request.query_params.get("include_sprites") == "true"
    version = get_campus_cache_version()
    suffix = f"bootstrap-{int(include_sprites)}"

    def _build():
        categories_data = CategorySerializer(Category.objects.all(), many=True).data
        pois_qs = PointOfInterest.objects.select_related("category", "building").filter(is_active=True)
        pois_data = PointOfInterestGeoSerializer(
            pois_qs,
            many=True,
            context={"request": request, "include_sprites": include_sprites},
        ).data
        tracks_data = TrackGeoSerializer(Track.objects.all(), many=True).data
        return {
            "version": version,
            "categories": categories_data,
            "pois": pois_data,
            "tracks": tracks_data,
        }

    return _cached_etag_response(request, suffix, suffix, _build)


def _read_coordinate(data, key):
    value = data.get(key) if isinstance(data, dict) else None
    lat_raw = None
    lon_raw = None
    if isinstance(value, dict):
        lat_raw = value.get("latitude")
        lon_raw = value.get("longitude")
    elif isinstance(value, (list, tuple)) and len(value) == 2:
        lat_raw, lon_raw = value[0], value[1]
    else:
        raise ValueError(f"{key} must be a coordinate object or [latitude, longitude] pair.")

    if lat_raw is None or lon_raw is None:
        raise ValueError(f"{key} requires both latitude and longitude.")

    lat = float(lat_raw)
    lon = float(lon_raw)
    if math.isnan(lat) or math.isnan(lon) or math.isinf(lat) or math.isinf(lon):
        raise ValueError(f"{key} coordinates must be finite numbers.")
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise ValueError(f"{key} coordinates are out of valid geographic bounds.")
    return {"latitude": lat, "longitude": lon}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def directions(request):
    try:
        origin = _read_coordinate(request.data, "origin")
        destination = _read_coordinate(request.data, "destination")
    except (TypeError, ValueError) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    mode = request.data.get("mode", "walking") if isinstance(request.data, dict) else "walking"
    include_alternate = request.data.get("include_alternate", True) if isinstance(request.data, dict) else True
    route = dijkstra_route(origin, destination, mode=mode, include_alternate=bool(include_alternate))
    if isinstance(route, dict) and route.get("duration_text"):
        from .markers import render_route_callout_data_uri

        route["duration_badge_uri"] = render_route_callout_data_uri(
            route["duration_text"],
            mode=route.get("mode") or mode,
        )
    return Response(route)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def place_details(request):
    place_id = (request.data.get("place_id") or "").strip() if isinstance(request.data, dict) else ""
    if not place_id or len(place_id) > 255:
        return Response({"detail": "place_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    api_key = settings.GOOGLE_PLACES_API_KEY
    if not api_key:
        return Response(
            {
                "status": "DISABLED",
                "detail": "Configure GOOGLE_PLACES_API_KEY on the backend to enable live place details.",
            }
        )

    cache_key = f"place_details:{place_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    try:
        response = _google_session.get(
            "https://maps.googleapis.com/maps/api/place/details/json",
            params={
                "place_id": place_id,
                "fields": "name,formatted_address,geometry,opening_hours,website,formatted_phone_number,photos,rating,user_ratings_total",
                "key": api_key,
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        photos = data.get("result", {}).get("photos")
        if isinstance(photos, list):
            sanitized_photos = []
            for photo in photos:
                if not isinstance(photo, dict):
                    continue
                photo_copy = dict(photo)
                photo_copy.pop("url", None)
                photo_ref = photo_copy.get("photo_reference")
                if photo_ref:
                    photo_copy["proxy_path"] = f"/places/photo/?ref={quote(str(photo_ref), safe='')}"
                sanitized_photos.append(photo_copy)
            data["result"]["photos"] = sanitized_photos

        if data.get("status") == "OK":
            cache.set(cache_key, data, timeout=_PLACE_DETAILS_TTL)

        return Response(data)
    except requests.RequestException:
        return Response({"status": "UNAVAILABLE"}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def place_photo(request):
    ref = (request.query_params.get("ref") or "").strip()
    if not ref or len(ref) > 1024:
        return Response({"detail": "A valid ref query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        raw_width = int(request.query_params.get("maxwidth", 800))
    except (TypeError, ValueError):
        raw_width = 800
    maxwidth = min(1200, max(200, raw_width))

    api_key = settings.GOOGLE_PLACES_API_KEY
    if not api_key:
        return Response(
            {"detail": "GOOGLE_PLACES_API_KEY is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    cache_key = f"place_photo:{maxwidth}:{ref}"
    cached = cache.get(cache_key)
    if cached is not None:
        img_bytes, content_type = cached
        resp = HttpResponse(img_bytes, content_type=content_type)
        resp["Cache-Control"] = "private, max-age=86400"
        return resp

    try:
        google_resp = _google_session.get(
            "https://maps.googleapis.com/maps/api/place/photo",
            params={
                "maxwidth": maxwidth,
                "photo_reference": ref,
                "key": api_key,
            },
            timeout=15,
        )
        google_resp.raise_for_status()
        content_type = google_resp.headers.get("Content-Type", "image/jpeg")
        img_bytes = google_resp.content
        cache.set(cache_key, (img_bytes, content_type), timeout=_PLACE_PHOTO_TTL)
        resp = HttpResponse(img_bytes, content_type=content_type)
        resp["Cache-Control"] = "private, max-age=86400"
        return resp
    except requests.RequestException:
        return Response({"status": "UNAVAILABLE"}, status=status.HTTP_502_BAD_GATEWAY)
