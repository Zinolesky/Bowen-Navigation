from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BuildingViewSet,
    CategoryViewSet,
    PointOfInterestViewSet,
    TrackViewSet,
    directions,
    health_check,
    login,
    place_details,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("buildings", BuildingViewSet, basename="building")
router.register("pois", PointOfInterestViewSet, basename="poi")
router.register("tracks", TrackViewSet, basename="track")

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("auth/login/", login, name="login"),
    path("directions/", directions, name="directions"),
    path("places/details/", place_details, name="place-details"),
    path("", include(router.urls)),
]

