param(
    [string]$KmlPath = ".\data\sample_tracks.kml",
    [string]$DbName = "bowen_navigator",
    [string]$DbUser = "bowen",
    [string]$DbHost = "127.0.0.1",
    [string]$DbPort = "5432"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ogr2ogr -ErrorAction SilentlyContinue)) {
    throw "ogr2ogr was not found. Install GDAL or OSGeo4W and add it to PATH."
}

ogr2ogr `
    -f "PostgreSQL" `
    "PG:host=$DbHost port=$DbPort dbname=$DbName user=$DbUser" `
    $KmlPath `
    -nln campus_track_import `
    -overwrite `
    -lco GEOMETRY_NAME=geometry `
    -lco FID=id `
    -nlt LINESTRING `
    -t_srs EPSG:4326

Write-Host "Imported KML tracks into campus_track_import."

