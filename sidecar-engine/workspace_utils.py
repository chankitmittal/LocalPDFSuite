"""
Workspace and Path Security Utilities for LocalPDF Suite
Confines all output files and temporary artifacts safely within WORKSPACE_DIR.
"""

import os
import re
import tempfile
from typing import Optional

_custom_workspace = os.environ.get("LOCALPDF_WORKSPACE_DIR")
if _custom_workspace and _custom_workspace.strip():
    WORKSPACE_DIR = os.path.realpath(_custom_workspace.strip())
else:
    WORKSPACE_DIR = os.path.realpath(os.path.join(tempfile.gettempdir(), "localpdf_workspace"))

os.makedirs(WORKSPACE_DIR, exist_ok=True)


def purge_expired_workspace_files(max_age_hours: float = 24.0) -> int:
    """Removes temporary files older than max_age_hours from WORKSPACE_DIR."""
    import time

    purged_count = 0
    now = time.time()
    cutoff = now - (max_age_hours * 3600)
    try:
        for entry in os.scandir(WORKSPACE_DIR):
            if entry.is_file():
                try:
                    if entry.stat().st_mtime < cutoff:
                        os.remove(entry.path)
                        purged_count += 1
                except Exception:
                    pass
    except Exception:
        pass
    return purged_count


def get_safe_workspace_path(filename: Optional[str], default_name: str = "output.pdf") -> str:
    """
    Safely resolves an output path strictly confined within WORKSPACE_DIR.
    Strips directory separators, null bytes, and traversal elements to prevent arbitrary file overwrites.
    """
    chosen = filename.strip() if (filename and filename.strip()) else default_name
    safe_name = os.path.basename(chosen)
    safe_name = re.sub(r'[\0\r\n\t]', '', safe_name)
    if not safe_name or safe_name in ('.', '..'):
        safe_name = default_name

    dest_path = os.path.realpath(os.path.join(WORKSPACE_DIR, safe_name))
    real_workspace = os.path.realpath(WORKSPACE_DIR)
    if not (dest_path == real_workspace or dest_path.startswith(real_workspace + os.sep)):
        return os.path.join(real_workspace, default_name)
    return dest_path
