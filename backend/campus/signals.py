from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Building, Category, PointOfInterest, Track
from .routing import clear_routing_cache

CAMPUS_VERSION_KEY = "campus:data_version"


def get_campus_cache_version() -> int:
    version = cache.get(CAMPUS_VERSION_KEY)
    if version is None:
        version = 1
        cache.set(CAMPUS_VERSION_KEY, version, timeout=None)
    return int(version)


def bump_campus_cache_version() -> int:
    try:
        return int(cache.incr(CAMPUS_VERSION_KEY))
    except ValueError:
        cache.set(CAMPUS_VERSION_KEY, 2, timeout=None)
        return 2


@receiver([post_save, post_delete], sender=Track)
def invalidate_track_caches(sender, **kwargs):
    clear_routing_cache()
    bump_campus_cache_version()


@receiver([post_save, post_delete], sender=PointOfInterest)
@receiver([post_save, post_delete], sender=Building)
@receiver([post_save, post_delete], sender=Category)
def invalidate_campus_data_caches(sender, **kwargs):
    bump_campus_cache_version()
