// Offline Module Manager for LibreOffice & Tesseract
use std::path::{Path, PathBuf};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PluginStatus {
    pub name: String,
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[allow(dead_code)]
pub fn get_app_plugins_dir() -> PathBuf {
    let mut dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("LocalPDF");
    dir.push("plugins");
    std::fs::create_dir_all(&dir).ok();
    dir
}

pub fn detect_libreoffice(custom_path: Option<&str>) -> PluginStatus {
    if let Some(cp) = custom_path {
        if Path::new(cp).is_file() {
            return PluginStatus {
                name: "LibreOffice".into(),
                installed: true,
                path: Some(cp.to_string()),
                version: Some("Configured".into()),
            };
        }
    }

    let default_paths = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/usr/bin/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ];

    for p in default_paths {
        if Path::new(p).is_file() {
            return PluginStatus {
                name: "LibreOffice".into(),
                installed: true,
                path: Some(p.to_string()),
                version: Some("System Installed".into()),
            };
        }
    }

    PluginStatus {
        name: "LibreOffice".into(),
        installed: false,
        path: None,
        version: None,
    }
}

pub fn detect_tesseract(custom_path: Option<&str>) -> PluginStatus {
    if let Some(cp) = custom_path {
        if Path::new(cp).is_file() {
            return PluginStatus {
                name: "Tesseract OCR".into(),
                installed: true,
                path: Some(cp.to_string()),
                version: Some("Configured".into()),
            };
        }
    }

    let default_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
    ];

    for p in default_paths {
        if Path::new(p).is_file() {
            return PluginStatus {
                name: "Tesseract OCR".into(),
                installed: true,
                path: Some(p.to_string()),
                version: Some("System Installed".into()),
            };
        }
    }

    PluginStatus {
        name: "Tesseract OCR".into(),
        installed: false,
        path: None,
        version: None,
    }
}
