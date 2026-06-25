use std::io::{Cursor, Write};

use chatcraft_core::{ChatCraftSession, read_three_mf_package};
use zip::{ZipWriter, write::SimpleFileOptions};

fn make_project(extra: &[(&str, &[u8])]) -> Vec<u8> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        writer.start_file("[Content_Types].xml", options).unwrap();
        writer.write_all(b"<Types></Types>").unwrap();
        writer.start_file("3D/3dmodel.model", options).unwrap();
        writer
            .write_all(
                br#"<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="Calibration Cube" type="model"><mesh /></object>
  </resources>
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
  </build>
</model>"#,
            )
            .unwrap();
        writer
            .start_file("Metadata/project_settings.config", options)
            .unwrap();
        writer
            .write_all(
                br#"{
  "sparse_infill_density": "15%",
  "sparse_infill_pattern": "grid",
  "wall_loops": "2",
  "top_shell_layers": "3",
  "bottom_shell_layers": "3",
  "enable_support": "0"
}"#,
            )
            .unwrap();
        for (path, data) in extra {
            writer.start_file(*path, options).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap();
    }
    cursor.into_inner()
}

#[test]
fn rejects_unsafe_zip_entries() {
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut cursor);
        let options = SimpleFileOptions::default();
        writer.start_file("../outside.txt", options).unwrap();
        writer.write_all(b"owned").unwrap();
        writer.finish().unwrap();
    }

    let error = read_three_mf_package(&cursor.into_inner()).unwrap_err();
    assert_eq!(error.code(), "unsafe_zip_entry");
}

#[test]
fn loads_summary_from_3mf_project() {
    let session = ChatCraftSession::load(&make_project(&[])).unwrap();
    let summary = session.get_project_summary();

    assert_eq!(summary.objects[0].id, "1");
    assert_eq!(summary.objects[0].name, "Calibration Cube");
    assert_eq!(summary.settings.infill_density, Some(15));
    assert_eq!(summary.settings.infill_pattern.as_deref(), Some("grid"));
    assert_eq!(summary.settings.wall_count, Some(2));
    assert_eq!(summary.pending_change_count, 0);
}

#[test]
fn edits_compares_and_exports_reloadable_project() {
    let original = make_project(&[("Metadata/vendor.bin", &[1, 2, 3, 4])]);
    let mut session = ChatCraftSession::load(&original).unwrap();

    session.set_infill_density(25).unwrap();
    session.set_infill_pattern("gyroid").unwrap();
    session.set_wall_count(4).unwrap();
    session.toggle_supports(true);

    assert_eq!(
        session.compare_project_settings(),
        vec![
            comparison("Infill density", "15%", "25%"),
            comparison("Infill pattern", "grid", "gyroid"),
            comparison("Wall count", "2", "4"),
            comparison("Supports enabled", "false", "true"),
        ]
    );

    let exported = session.export_project().unwrap();
    let reloaded = ChatCraftSession::load(&exported).unwrap();
    let summary = reloaded.get_project_summary();
    assert_eq!(summary.settings.infill_density, Some(25));
    assert_eq!(summary.settings.infill_pattern.as_deref(), Some("gyroid"));
    assert_eq!(summary.settings.wall_count, Some(4));
    assert_eq!(summary.settings.supports_enabled, Some(true));

    let package = read_three_mf_package(&exported).unwrap();
    assert!(
        package
            .entries
            .iter()
            .any(|entry| entry.path == "Metadata/vendor.bin" && entry.data == [1, 2, 3, 4])
    );
}

#[test]
fn validates_values_and_supports_undo_reset() {
    let mut session = ChatCraftSession::load(&make_project(&[])).unwrap();

    assert!(session.set_wall_count(0).is_err());
    assert!(session.set_infill_pattern("moonbeams").is_err());

    session.set_top_layers(5).unwrap();
    session.set_bottom_layers(6).unwrap();
    assert_eq!(
        session.get_project_summary().settings.bottom_layers,
        Some(6)
    );

    session.revert_last_change();
    assert_eq!(session.get_project_summary().settings.top_layers, Some(5));
    assert_eq!(
        session.get_project_summary().settings.bottom_layers,
        Some(3)
    );

    session.reset_to_original();
    assert!(session.list_change_history().is_empty());
    assert_eq!(session.get_project_summary().settings.top_layers, Some(3));
}

fn comparison(setting: &str, before: &str, after: &str) -> chatcraft_core::SettingComparison {
    chatcraft_core::SettingComparison {
        scope: "project".to_owned(),
        setting: setting.to_owned(),
        before: before.to_owned(),
        after: after.to_owned(),
    }
}
