import os
import sys
import shutil
import glob

print("Base Python executable:", sys.base_exec_prefix)
print("Venv executable:", sys.prefix)

base_python = sys.base_exec_prefix
venv_scripts = os.path.join(sys.prefix, 'Scripts')
qgis_bin = r"C:\Program Files\QGIS 3.44.11\bin"

if not os.path.isdir(qgis_bin):
    print("QGIS not found!")
    sys.exit(1)

# Find all DLLs in base python
python_dlls = set()
for path in glob.glob(os.path.join(base_python, '*.dll')) + glob.glob(os.path.join(base_python, 'DLLs', '*.dll')):
    python_dlls.add(os.path.basename(path).lower())

print(f"Found {len(python_dlls)} DLLs in Base Python.")

# Find all DLLs in QGIS
qgis_dlls = set()
for path in glob.glob(os.path.join(qgis_bin, '*.dll')):
    qgis_dlls.add(os.path.basename(path).lower())

print(f"Found {len(qgis_dlls)} DLLs in QGIS.")

conflicts = python_dlls.intersection(qgis_dlls)
print(f"Conflicts ({len(conflicts)}):", conflicts)

print("\nCopying conflicting DLLs from QGIS to venv Scripts to prioritize QGIS versions...")
for dll_name in conflicts:
    src = os.path.join(qgis_bin, dll_name)
    dst = os.path.join(venv_scripts, dll_name)
    if os.path.exists(src):
        print(f"  Copying {dll_name}...")
        try:
            shutil.copy2(src, dst)
        except Exception as e:
            print(f"    Failed: {e}")

print("\nDone. Please run 'python manage.py runserver' again to see if it fixed the issue.")
