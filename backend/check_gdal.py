"""
Definitive GDAL diagnostic - reads the PE import table of gdal313.dll
and tries loading GDAL via QGIS's own osgeo Python package.

Run:  .venv\\Scripts\\python check_gdal.py
"""
import os, sys, glob, ctypes, struct

# ── helpers ────────────────────────────────────────────────────────────────
def pe_imports(path):
    """Return list of DLL names imported by a PE (DLL/EXE) file."""
    try:
        with open(path, 'rb') as f:
            data = f.read()
        if data[:2] != b'MZ':
            return None
        pe_off = struct.unpack_from('<I', data, 0x3C)[0]
        if data[pe_off:pe_off+4] != b'PE\x00\x00':
            return None
        nsect    = struct.unpack_from('<H', data, pe_off + 6)[0]
        opt_size = struct.unpack_from('<H', data, pe_off + 20)[0]
        opt_off  = pe_off + 24
        magic    = struct.unpack_from('<H', data, opt_off)[0]
        dd_off   = opt_off + (0x70 if magic == 0x20B else 0x60)  # PE32+ vs PE32
        imp_rva  = struct.unpack_from('<I', data, dd_off + 8)[0]
        if not imp_rva:
            return []
        sect_off = opt_off + opt_size
        sects = [(struct.unpack_from('<I', data, sect_off + i*40 + 12)[0],
                  struct.unpack_from('<I', data, sect_off + i*40 + 12)[0]
                  + struct.unpack_from('<I', data, sect_off + i*40 + 8)[0],
                  struct.unpack_from('<I', data, sect_off + i*40 + 20)[0])
                 for i in range(nsect)]
        def rva2off(rva):
            for va, vend, ro in sects:
                if va <= rva < vend:
                    return ro + rva - va
        dlls, off = [], rva2off(imp_rva)
        while off:
            name_rva = struct.unpack_from('<I', data, off + 12)[0]
            if not name_rva:
                break
            name_off = rva2off(name_rva)
            end = data.index(b'\x00', name_off)
            dlls.append(data[name_off:end].decode('ascii', errors='replace'))
            off += 20
        return dlls
    except Exception as e:
        return [f"<error: {e}>"]

# ── locate QGIS ─────────────────────────────────────────────────────────────
qgis_roots = sorted(glob.glob(r"C:\Program Files\QGIS 3*"), reverse=True)
if not qgis_roots:
    print("No QGIS found."); sys.exit(1)

qgis_root = qgis_roots[0]
qgis_bin  = os.path.join(qgis_root, "bin")
print(f"QGIS: {qgis_root}")

# ── set up DLL search dirs ───────────────────────────────────────────────────
dirs = [qgis_bin]
for sub in [("apps","qgis","bin"), ("apps","qgis-ltr","bin"),
            ("apps","qt6","bin"), ("apps","qt5","bin"),
            ("apps","Python312","DLLs"),
            ("apps","Python312","Lib","site-packages","osgeo")]:
    d = os.path.join(qgis_root, *sub)
    if os.path.isdir(d):
        dirs.append(d)

if sys.version_info >= (3, 8):
    for d in dirs:
        os.add_dll_directory(d)
os.environ['PATH'] = ';'.join(dirs) + ';' + os.environ['PATH']

# ── show gdal313.dll import table ───────────────────────────────────────────
gdal_dll = os.path.join(qgis_bin, "gdal313.dll")
print(f"\ngdal313.dll imports these DLLs:")
imports = pe_imports(gdal_dll)
if imports:
    for imp in sorted(imports):
        print(f"  {imp}")
else:
    print("  (none or error)")

pdal_dll = os.path.join(qgis_bin, "pdalcpp.dll")
print(f"\npdalcpp.dll imports these DLLs:")
pdal_imports = pe_imports(pdal_dll)
if pdal_imports:
    for imp in sorted(pdal_imports):
        print(f"  {imp}")

# ── pre-load all non-gdal DLLs from all dirs ────────────────────────────────
print("\nPre-loading non-gdal DLLs (failures only)...")
for d in dirs:
    for dep in sorted(glob.glob(os.path.join(d, "*.dll"))):
        if not os.path.basename(dep).lower().startswith("gdal"):
            try:
                ctypes.CDLL(dep)
            except OSError as e:
                label = os.path.relpath(dep, qgis_root)
                print(f"  FAIL: {label} -> {e}")

# ── try importing GDAL via QGIS Python's osgeo ──────────────────────────────
qgis_py_site = os.path.join(qgis_root, "apps", "Python312", "Lib", "site-packages")
osgeo_ok = False
if os.path.isdir(qgis_py_site):
    print(f"\nTrying osgeo from QGIS Python ({qgis_py_site})...")
    sys.path.insert(0, qgis_py_site)
    try:
        import osgeo.gdal
        print("  osgeo.gdal import: OK  <-- GDAL is now in process memory!")
        osgeo_ok = True
    except Exception as e:
        print(f"  osgeo.gdal import: FAIL -> {e}")
    sys.path.pop(0)

# ── final ctypes test ────────────────────────────────────────────────────────
print("\nFinal ctypes.CDLL test on gdal313.dll:")
try:
    ctypes.CDLL(gdal_dll)
    print("  GDAL LOAD OK")
except OSError as e:
    print(f"  GDAL LOAD FAIL -> {e}")

if osgeo_ok:
    print("\nRecommendation: use osgeo approach in settings.py (GDAL loaded via osgeo).")
else:
    print("\nRecommendation: download standalone GDAL from gisinternals.com.")
