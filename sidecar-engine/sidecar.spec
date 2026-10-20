# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

datas = []
datas += collect_data_files('pypdfium2')
datas += collect_data_files('pikepdf')
datas += collect_data_files('pdfminer')

hiddenimports = []
hiddenimports += collect_submodules('uvicorn')
hiddenimports += collect_submodules('fastapi')
hiddenimports += collect_submodules('pydantic')
hiddenimports += collect_submodules('pikepdf')
hiddenimports += collect_submodules('pypdf')
hiddenimports += collect_submodules('pypdfium2')
hiddenimports += collect_submodules('pdfplumber')
hiddenimports += collect_submodules('reportlab')
hiddenimports += collect_submodules('docx')
hiddenimports += collect_submodules('openpyxl')
hiddenimports += collect_submodules('pptx')
hiddenimports += collect_submodules('pyhanko')
hiddenimports += collect_submodules('PIL')

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['PyMuPDF', 'fitz', 'ghostscript', 'pdf2docx', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='sidecar-engine-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
