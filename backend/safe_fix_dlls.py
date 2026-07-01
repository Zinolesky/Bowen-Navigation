import os
import sys
import shutil

venv_scripts = os.path.join(sys.prefix, 'Scripts')
qgis_bin = r"C:\Program Files\QGIS 3.44.11\bin"

# We only copy sqlite3.dll. Do NOT copy python312.dll, python3.dll, or vcruntime dlls, 
# as they will break the Python environment itself.
dlls_to_copy = ['sqlite3.dll']

print("Copying only safe conflicting DLLs to venv Scripts to override Python's built-ins...")
for dll in dlls_to_copy:
    src = os.path.join(qgis_bin, dll)
    dst = os.path.join(venv_scripts, dll)
    if os.path.exists(src):
        try:
            shutil.copy2(src, dst)
            print(f"  Successfully copied {dll}")
        except Exception as e:
            print(f"  Failed to copy {dll}: {e}")
    else:
        print(f"  Source not found: {src}")

print("\nDone! Please try running 'python manage.py runserver' again.")
