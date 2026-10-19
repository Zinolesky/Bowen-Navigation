from django.conf import settings
from django.db.models import Q
import requests
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .routing import dijkstra_route
from .models import Building, Category, PointOfInterest, Track
from .permissions import IsStaffAdminOrReadOnly
from .serializers import (
    BuildingSerializer,
    CategorySerializer,
    LoginSerializer,
    PointOfInterestGeoSerializer,
    PointOfInterestWriteSerializer,
    TrackGeoSerializer,
)


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
    permission_classes = [AllowAny]
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class BuildingViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    queryset = Building.objects.all()
    serializer_class = BuildingSerializer


class TrackViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    queryset = Track.objects.all()
    serializer_class = TrackGeoSerializer

    def get_queryset(self):
        queryset = Track.objects.all()
        track_type = self.request.query_params.get("track_type")
        if track_type:
            queryset = queryset.filter(track_type=track_type)
        return queryset


class PointOfInterestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffAdminOrReadOnly]

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


def _read_coordinate(data, key):
    import math

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
@permission_classes([AllowAny])
def directions(request):
    try:
        origin = _read_coordinate(request.data, "origin")
        destination = _read_coordinate(request.data, "destination")
    except (TypeError, ValueError) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    mode = request.data.get("mode", "walking") if isinstance(request.data, dict) else "walking"
    route = dijkstra_route(origin, destination, mode=mode)
    if isinstance(route, dict) and route.get("duration_text"):
        from .markers import render_route_callout_data_uri

        route["duration_badge_uri"] = render_route_callout_data_uri(
            route["duration_text"],
            mode=route.get("mode") or mode,
        )
    return Response(route)



@api_view(["POST"])
@permission_classes([AllowAny])
def place_details(request):
    place_id = request.data.get("place_id")
    if not place_id:
        return Response({"detail": "place_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    api_key = settings.GOOGLE_PLACES_API_KEY
    if not api_key:
        return Response(
            {
                "status": "DISABLED",
                "detail": "Configure GOOGLE_PLACES_API_KEY on the backend to enable live place details.",
            }
        )

    try:
        response = requests.get(
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
        
        if data.get("result", {}).get("photos"):
            for photo in data["result"]["photos"]:
                photo_ref = photo.get("photo_reference")
                if photo_ref:
                    photo["url"] = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={photo_ref}&key={api_key}"
                    
        return Response(data)
    except requests.RequestException:
        return Response({"status": "UNAVAILABLE"}, status=status.HTTP_502_BAD_GATEWAY)
