import os
import sys

venv_scripts = os.path.join(sys.prefix, 'Scripts')
conflicts = ['python312.dll', 'vcruntime140_1.dll', 'vcruntime140.dll', 'sqlite3.dll', 'python3.dll']

for dll in conflicts:
    path = os.path.join(venv_scripts, dll)
    if os.path.exists(path):
        try:
            os.remove(path)
            print(f"Removed {path}")
        except Exception as e:
            print(f"Failed to remove {path}: {e}")
