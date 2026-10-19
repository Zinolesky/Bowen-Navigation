from django.contrib.gis.geos import Point
from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from django.contrib.auth import get_user_model
from .models import Building, Category, PointOfInterest, Track

User = get_user_model()


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
        icon = obj.icon_identifier or (getattr(obj.category, "icon_identifier", "building-2") if obj.category_id else "building-2")
        return render_poi_marker_data_uri(obj.name, color, icon, variant)

    def get_marker_icon_default(self, obj):
        return self._get_marker_tuple(obj, "default")[0]

    def get_marker_icon_compact(self, obj):
        return self._get_marker_tuple(obj, "compact")[0]

    def get_marker_icon_selected(self, obj):
        return self._get_marker_tuple(obj, "selected")[0]

    def get_marker_icon_destination(self, obj):
        return self._get_marker_tuple(obj, "destination")[0]

    def get_marker_anchor_x(self, obj):
        return self._get_marker_tuple(obj, "default")[1]


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
        return super().create(self._set_location(validated_data))

    def update(self, instance, validated_data):
        return super().update(instance, self._set_location(validated_data))

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
        fields = ("id", "full_name", "matric_number", "is_staff_admin")


class LoginSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    matric_number = serializers.CharField(max_length=32)

    def validate(self, attrs):
        matric_number = attrs["matric_number"].upper().strip()
        full_name = " ".join(attrs["full_name"].split()).lower()

        try:
            user = User.objects.get(matric_number__iexact=matric_number, is_active=True)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("Invalid matriculation number.") from exc

        if user.full_name and user.full_name.lower() != full_name:
            raise serializers.ValidationError("Full name does not match this matriculation number.")

        attrs["user"] = user
        return attrs

    def create_token_response(self):
        user = self.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        refresh["full_name"] = user.full_name
        refresh["matric_number"] = user.matric_number
        refresh["is_staff_admin"] = user.is_staff_admin

        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserProfileSerializer(user).data,
        }

