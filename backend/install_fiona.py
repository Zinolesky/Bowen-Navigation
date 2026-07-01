import subprocess
import sys

print("Installing Fiona (this includes a clean, standalone GDAL library)...")
result = subprocess.run([sys.executable, "-m", "pip", "install", "fiona"], capture_output=True, text=True)

print(result.stdout)
if result.stderr:
    print(result.stderr)
    
if result.returncode == 0:
    print("\nSuccessfully installed Fiona and GDAL binaries!")
    print("Please try running 'python manage.py runserver' now.")
else:
    print("\nFailed to install Fiona.")
