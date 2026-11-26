from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    BuildingViewSet,
    CategoryViewSet,
    PointOfInterestViewSet,
    TrackViewSet,
    campus_bootstrap,
    directions,
    health_check,
    import_students,
    login,
    place_details,
    place_photo,
    register,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("buildings", BuildingViewSet, basename="building")
router.register("pois", PointOfInterestViewSet, basename="poi")
router.register("tracks", TrackViewSet, basename="track")

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("auth/login/", login, name="login"),
    path("auth/register/", register, name="register"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("admin/import-students/", import_students, name="import-students"),
    path("bootstrap/", campus_bootstrap, name="campus-bootstrap"),
    path("directions/", directions, name="directions"),
    path("places/details/", place_details, name="place-details"),
    path("places/photo/", place_photo, name="place-photo"),
    path("", include(router.urls)),
]
