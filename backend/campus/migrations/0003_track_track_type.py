from django.db import migrations, models


def classify_existing_tracks(apps, schema_editor):
    Track = apps.get_model("campus", "Track")
    pedestrian_keywords = (
        "pedestrian",
        "walkway",
        "footpath",
        "foot path",
        "walking",
        "sidewalk",
        "shortcut",
        "trail",
        "steps",
        "stairs",
        "corridor",
        "alley",
    )
    vehicle_keywords = (
        "vehicle",
        "vehicular",
        "road",
        "drive",
        "driveway",
        "street",
        "avenue",
        "highway",
        "boulevard",
        "car",
        "motor",
        "tarred",
        "lane",
        "roundabout",
    )
    for track in Track.objects.all():
        text = f"{track.name or ''} {track.description or ''} {track.source or ''}".lower()
        has_ped = any(k in text for k in pedestrian_keywords)
        has_veh = any(k in text for k in vehicle_keywords)
        if "both" in text or "shared" in text or (has_ped and has_veh):
            track.track_type = "both"
        elif has_veh:
            track.track_type = "vehicle"
        else:
            track.track_type = "pedestrian"
        track.save(update_fields=["track_type"])


class Migration(migrations.Migration):

    dependencies = [
        ("campus", "0002_alter_building_location"),
    ]

    operations = [
        migrations.AddField(
            model_name="track",
            name="track_type",
            field=models.CharField(
                choices=[
                    ("pedestrian", "Pedestrian Pathway"),
                    ("vehicle", "Vehicle Road"),
                    ("both", "Shared (Vehicle & Pedestrian)"),
                ],
                default="pedestrian",
                max_length=20,
            ),
        ),
        migrations.RunPython(classify_existing_tracks, migrations.RunPython.noop),
    ]
