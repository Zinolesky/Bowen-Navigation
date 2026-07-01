import subprocess
import os
import json

bat_content = r"""@echo off
call "C:\Program Files\QGIS 3.44.11\bin\o4w_env.bat"
python -c "import os, json; print(json.dumps(dict(os.environ)))"
"""

with open('temp_extract.bat', 'w') as f:
    f.write(bat_content)

try:
    result = subprocess.run(['temp_extract.bat'], capture_output=True, text=True)
    if result.returncode == 0:
        env_vars = json.loads(result.stdout.strip())
        
        path = env_vars.get('PATH', '')
        gdal_data = env_vars.get('GDAL_DATA', '')
        proj_lib = env_vars.get('PROJ_LIB', '')
        
        print("Successfully extracted OSGeo4W environment!")
        
        with open('osgeo4w_env.json', 'w') as f:
            json.dump({
                'PATH': path,
                'GDAL_DATA': gdal_data,
                'PROJ_LIB': proj_lib
            }, f, indent=2)
            
        print("Wrote osgeo4w_env.json.")
    else:
        print("Failed to run script:")
        print(result.stderr)
        print(result.stdout)
except Exception as e:
    print(f"Error: {e}")
finally:
    if os.path.exists('temp_extract.bat'):
        os.remove('temp_extract.bat')
