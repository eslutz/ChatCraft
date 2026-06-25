use std::io::{Cursor, Read, Write};

use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::{ChatCraftError, Result};

const MAX_ENTRY_COUNT: usize = 10_000;
const MAX_ENTRY_BYTES: usize = 256 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackageEntry {
    pub path: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ThreeMfPackage {
    pub entries: Vec<PackageEntry>,
}

pub fn read_three_mf_package(bytes: &[u8]) -> Result<ThreeMfPackage> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))?;
    if archive.len() > MAX_ENTRY_COUNT {
        return Err(ChatCraftError::invalid_package(
            "too_many_zip_entries",
            "3MF package has too many entries.",
        ));
    }

    let mut entries = Vec::new();
    let mut total_bytes = 0usize;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        if file.is_dir() {
            continue;
        }

        let path = file.name().to_owned();
        validate_entry_path(&path)?;

        let mut data = Vec::new();
        file.read_to_end(&mut data)?;
        if data.len() > MAX_ENTRY_BYTES {
            return Err(ChatCraftError::invalid_package(
                "zip_entry_too_large",
                format!("3MF entry is too large: {path}"),
            ));
        }
        total_bytes = total_bytes.saturating_add(data.len());
        if total_bytes > MAX_TOTAL_UNCOMPRESSED_BYTES {
            return Err(ChatCraftError::invalid_package(
                "zip_too_large",
                "3MF package is too large after decompression.",
            ));
        }

        entries.push(PackageEntry { path, data });
    }

    if !entries.iter().any(|entry| entry.path == "3D/3dmodel.model") {
        return Err(ChatCraftError::invalid_package(
            "missing_model",
            "3MF package is missing 3D/3dmodel.model.",
        ));
    }

    Ok(ThreeMfPackage { entries })
}

pub fn write_three_mf_package(entries: &[PackageEntry]) -> Result<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for entry in entries {
            validate_entry_path(&entry.path)?;
            writer.start_file(&entry.path, options)?;
            writer.write_all(&entry.data)?;
        }
        writer.finish()?;
    }
    Ok(cursor.into_inner())
}

fn validate_entry_path(path: &str) -> Result<()> {
    let unsafe_path = path.starts_with('/')
        || path.contains('\\')
        || path.contains('\0')
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "..");

    if unsafe_path {
        return Err(ChatCraftError::invalid_package(
            "unsafe_zip_entry",
            format!("Unsafe 3MF ZIP entry path: {path}"),
        ));
    }
    Ok(())
}
