import re

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Building, Category, PointOfInterest, Track

User = get_user_model()
_MATRIC_RE = re.compile(r"^[A-Z0-9/_-]{4,32}$")


def build_token_response(user) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh["full_name"] = user.full_name
    refresh["matric_number"] = user.matric_number
    refresh["is_staff_admin"] = user.is_staff_admin

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserProfileSerializer(user).data,
    }


def _unique_building_slug(name: str) -> str:
    base = slugify(name) or "campus-building"
    candidate = base[:160]
    counter = 2
    while Building.objects.filter(slug=candidate).exists():
        suffix = f"-{counter}"
        candidate = f"{base[: 160 - len(suffix)]}{suffix}"
        counter += 1
    return candidate


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug", "color", "icon_identifier", "description")


class BuildingSerializer(serializers.ModelSerializer):
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()

    class Meta:
        model = Building
        fields = ("id", "name", "slug", "description", "latitude", "longitude", "updated_at")

    def get_latitude(self, obj):
        return obj.location.y if obj.location else None

    def get_longitude(self, obj):
        return obj.location.x if obj.location else None


class PointOfInterestGeoSerializer(GeoFeatureModelSerializer):
    category = CategorySerializer(read_only=True)
    building = BuildingSerializer(read_only=True)
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    marker_icon_default = serializers.SerializerMethodField()
    marker_icon_compact = serializers.SerializerMethodField()
    marker_icon_selected = serializers.SerializerMethodField()
    marker_icon_destination = serializers.SerializerMethodField()
    marker_anchor_x = serializers.SerializerMethodField()

    class Meta:
        model = PointOfInterest
        geo_field = "location"
        fields = (
            "id",
            "name",
            "slug",
            "category",
            "building",
            "description",
            "operating_hours",
            "google_place_id",
            "icon_identifier",
            "latitude",
            "longitude",
            "marker_icon_default",
            "marker_icon_compact",
            "marker_icon_selected",
            "marker_icon_destination",
            "marker_anchor_x",
            "is_active",
            "updated_at",
        )

    def get_latitude(self, obj):
        return obj.location.y if obj.location else None

    def get_longitude(self, obj):
        return obj.location.x if obj.location else None

    def _get_marker_tuple(self, obj, variant: str):
        from .markers import render_poi_marker_data_uri

        color = getattr(obj.category, "color", "#2563EB") if obj.category_id else "#2563EB"
        icon = obj.icon_identifier or (
            getattr(obj.category, "icon_identifier", "building-2") if obj.category_id else "building-2"
        )
        return render_poi_marker_data_uri(obj.name, color, icon, variant)

    def _sprites_enabled(self) -> bool:
        return bool(self.context.get("include_sprites", False))

    def get_marker_icon_default(self, obj):
        return self._get_marker_tuple(obj, "default")[0] if self._sprites_enabled() else None

    def get_marker_icon_compact(self, obj):
        return self._get_marker_tuple(obj, "compact")[0] if self._sprites_enabled() else None

    def get_marker_icon_selected(self, obj):
        return self._get_marker_tuple(obj, "selected")[0] if self._sprites_enabled() else None

    def get_marker_icon_destination(self, obj):
        return self._get_marker_tuple(obj, "destination")[0] if self._sprites_enabled() else None

    def get_marker_anchor_x(self, obj):
        return self._get_marker_tuple(obj, "default")[1] if self._sprites_enabled() else None

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        if not self._sprites_enabled():
            props = rep.get("properties")
            if isinstance(props, dict):
                for key in (
                    "marker_icon_default",
                    "marker_icon_compact",
                    "marker_icon_selected",
                    "marker_icon_destination",
                    "marker_anchor_x",
                ):
                    props.pop(key, None)
        return rep


class PointOfInterestWriteSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), source="category", write_only=True
    )
    building_id = serializers.PrimaryKeyRelatedField(
        queryset=Building.objects.all(), source="building", write_only=True, required=False, allow_null=True
    )
    latitude = serializers.FloatField(write_only=True)
    longitude = serializers.FloatField(write_only=True)

    class Meta:
        model = PointOfInterest
        fields = (
            "id",
            "name",
            "category_id",
            "building_id",
            "description",
            "operating_hours",
            "google_place_id",
            "icon_identifier",
            "latitude",
            "longitude",
            "is_active",
        )

    def _set_location(self, attrs):
        latitude = attrs.pop("latitude", None)
        longitude = attrs.pop("longitude", None)
        if latitude is not None and longitude is not None:
            attrs["location"] = Point(float(longitude), float(latitude), srid=4326)
        return attrs

    def create(self, validated_data):
        attrs = self._set_location(validated_data)
        location = attrs.get("location")
        if attrs.get("building") is None and location is not None and attrs.get("name"):
            building = Building.objects.filter(name__iexact=attrs["name"]).first()
            if building is None:
                building = Building.objects.create(
                    name=attrs["name"],
                    slug=_unique_building_slug(attrs["name"]),
                    description=attrs.get("description", ""),
                    location=location,
                )
            elif PointOfInterest.objects.filter(building=building).count() == 0:
                building.location = location
                building.save(update_fields=["location", "updated_at"])
            attrs["building"] = building
        return super().create(attrs)

    def update(self, instance, validated_data):
        attrs = self._set_location(validated_data)
        new_location = attrs.get("location")
        updated = super().update(instance, attrs)
        if (
            new_location is not None
            and updated.building_id
            and PointOfInterest.objects.filter(building_id=updated.building_id)
            .exclude(pk=updated.pk)
            .count()
            == 0
        ):
            updated.building.location = new_location
            updated.building.save(update_fields=["location", "updated_at"])
        return updated

    def to_representation(self, instance):
        return PointOfInterestGeoSerializer(instance, context=self.context).data


class TrackGeoSerializer(GeoFeatureModelSerializer):
    track_type = serializers.SerializerMethodField()

    class Meta:
        model = Track
        geo_field = "geometry"
        fields = ("id", "name", "description", "track_type", "source", "updated_at")

    def get_track_type(self, obj):
        from .routing import resolve_track_type

        return resolve_track_type(obj)


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "full_name", "matric_number", "email", "is_staff_admin")


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(min_length=2, max_length=150)
    matric_number = serializers.CharField(min_length=4, max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    password = serializers.CharField(min_length=6, max_length=128, write_only=True)

    def validate_full_name(self, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise serializers.ValidationError("Enter your full name.")
        return cleaned

    def validate_matric_number(self, value: str) -> str:
        normalized = value.upper().strip()
        if not _MATRIC_RE.fullmatch(normalized):
            raise serializers.ValidationError(
                "Matriculation number must be 4-32 characters using letters, digits, '/', '-', or '_'."
            )
        if User.objects.filter(matric_number__iexact=normalized).exists():
            raise serializers.ValidationError("An account with this matriculation number already exists.")
        return normalized

    def create(self, validated_data):
        return User.objects.create_user(
            matric_number=validated_data["matric_number"],
            full_name=validated_data["full_name"],
            email=(validated_data.get("email") or "").strip().lower(),
            password=validated_data["password"],
            is_staff_admin=False,
            is_active=True,
        )

    def create_token_response(self):
        return build_token_response(self.instance)


class LoginSerializer(serializers.Serializer):
    matric_number = serializers.CharField(max_length=32)
    password = serializers.CharField(max_length=128, write_only=True)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate(self, attrs):
        matric_number = attrs["matric_number"].upper().strip()
        password = attrs.get("password") or ""
        invalid_msg = "Invalid matriculation/staff ID or password."

        try:
            user = User.objects.get(matric_number__iexact=matric_number, is_active=True)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError(invalid_msg) from exc

        if not password or not user.check_password(password):
            raise serializers.ValidationError(invalid_msg)

        attrs["user"] = user
        return attrs

    def create_token_response(self):
        return build_token_response(self.validated_data["user"])
