use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{
    ChatCraftError, Result, ThreeMfPackage,
    package::{PackageEntry, read_three_mf_package, write_three_mf_package},
    settings::{
        ProjectSettings, SettingKey, apply_project_settings, parse_project_settings,
        validate_infill_pattern, validate_percent, validate_positive_count,
    },
};

const PROJECT_SETTINGS_PATH: &str = "Metadata/project_settings.config";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectObject {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub objects: Vec<ProjectObject>,
    pub settings: ProjectSettings,
    pub pending_change_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRecord {
    pub scope: String,
    pub setting: String,
    pub before: String,
    pub after: String,
    #[serde(skip)]
    pub key: Option<SettingKey>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingComparison {
    pub scope: String,
    pub setting: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone)]
pub struct ChatCraftSession {
    package: ThreeMfPackage,
    raw_project_settings: Map<String, Value>,
    original_settings: ProjectSettings,
    current_settings: ProjectSettings,
    objects: Vec<ProjectObject>,
    history: Vec<ChangeRecord>,
}

impl ChatCraftSession {
    pub fn load(bytes: &[u8]) -> Result<Self> {
        let package = read_three_mf_package(bytes)?;
        let raw_project_settings = package
            .entries
            .iter()
            .find(|entry| entry.path == PROJECT_SETTINGS_PATH)
            .map(|entry| serde_json::from_slice::<Map<String, Value>>(&entry.data))
            .transpose()?
            .unwrap_or_default();
        let original_settings = parse_project_settings(&raw_project_settings);
        let model = package
            .entries
            .iter()
            .find(|entry| entry.path == "3D/3dmodel.model")
            .ok_or_else(|| {
                ChatCraftError::invalid_package(
                    "missing_model",
                    "3MF package is missing 3D/3dmodel.model.",
                )
            })?;
        let objects = parse_objects(std::str::from_utf8(&model.data).map_err(|_| {
            ChatCraftError::invalid_package("invalid_model_xml", "3MF model XML is not UTF-8.")
        })?);

        Ok(Self {
            package,
            raw_project_settings,
            current_settings: original_settings.clone(),
            original_settings,
            objects,
            history: Vec::new(),
        })
    }

    pub fn get_project_summary(&self) -> ProjectSummary {
        ProjectSummary {
            objects: self.objects.clone(),
            settings: self.current_settings.clone(),
            pending_change_count: self.history.len(),
        }
    }

    pub fn list_objects(&self) -> &[ProjectObject] {
        &self.objects
    }

    pub fn set_infill_density(&mut self, percent: u8) -> Result<()> {
        validate_percent(percent, "Infill density")?;
        let before = self.current_settings.infill_density;
        self.current_settings.infill_density = Some(percent);
        self.record_setting_change(SettingKey::InfillDensity, before, Some(percent));
        Ok(())
    }

    pub fn set_infill_pattern(&mut self, pattern: &str) -> Result<()> {
        validate_infill_pattern(pattern)?;
        let normalized = pattern.to_ascii_lowercase();
        let before = self.current_settings.infill_pattern.clone();
        self.current_settings.infill_pattern = Some(normalized.clone());
        self.record_setting_change(SettingKey::InfillPattern, before, Some(normalized));
        Ok(())
    }

    pub fn set_wall_count(&mut self, count: u8) -> Result<()> {
        validate_positive_count(count, "Wall count", 20)?;
        let before = self.current_settings.wall_count;
        self.current_settings.wall_count = Some(count);
        self.record_setting_change(SettingKey::WallCount, before, Some(count));
        Ok(())
    }

    pub fn set_top_layers(&mut self, count: u8) -> Result<()> {
        validate_positive_count(count, "Top layers", 50)?;
        let before = self.current_settings.top_layers;
        self.current_settings.top_layers = Some(count);
        self.record_setting_change(SettingKey::TopLayers, before, Some(count));
        Ok(())
    }

    pub fn set_bottom_layers(&mut self, count: u8) -> Result<()> {
        validate_positive_count(count, "Bottom layers", 50)?;
        let before = self.current_settings.bottom_layers;
        self.current_settings.bottom_layers = Some(count);
        self.record_setting_change(SettingKey::BottomLayers, before, Some(count));
        Ok(())
    }

    pub fn toggle_supports(&mut self, enabled: bool) {
        let before = self.current_settings.supports_enabled;
        self.current_settings.supports_enabled = Some(enabled);
        self.record_setting_change(SettingKey::SupportsEnabled, before, Some(enabled));
    }

    pub fn compare_project_settings(&self) -> Vec<SettingComparison> {
        self.history
            .iter()
            .map(|change| SettingComparison {
                scope: change.scope.clone(),
                setting: change.setting.clone(),
                before: change.before.clone(),
                after: change.after.clone(),
            })
            .collect()
    }

    pub fn list_change_history(&self) -> &[ChangeRecord] {
        &self.history
    }

    pub fn revert_last_change(&mut self) {
        let Some(change) = self.history.pop() else {
            return;
        };
        if let Some(key) = change.key {
            let prior = self
                .history
                .iter()
                .rev()
                .find(|candidate| candidate.key == Some(key))
                .map(|candidate| candidate.after.clone());
            self.restore_setting(key, prior);
        }
    }

    pub fn reset_to_original(&mut self) {
        self.current_settings = self.original_settings.clone();
        self.history.clear();
    }

    pub fn export_project(&self) -> Result<Vec<u8>> {
        let mut raw = self.raw_project_settings.clone();
        apply_project_settings(&mut raw, &self.current_settings);
        let settings_data = serde_json::to_vec_pretty(&raw)?;
        let mut entries: Vec<PackageEntry> = self
            .package
            .entries
            .iter()
            .filter(|entry| entry.path != PROJECT_SETTINGS_PATH)
            .cloned()
            .collect();
        entries.push(PackageEntry {
            path: PROJECT_SETTINGS_PATH.to_owned(),
            data: settings_data,
        });
        write_three_mf_package(&entries)
    }

    fn record_setting_change<T>(&mut self, key: SettingKey, before: Option<T>, after: Option<T>)
    where
        T: ToString + PartialEq,
    {
        if before == after {
            return;
        }
        self.history.push(ChangeRecord {
            scope: "project".to_owned(),
            setting: key.label().to_owned(),
            before: before.map_or_else(|| "unset".to_owned(), |value| format_value(key, value)),
            after: after.map_or_else(|| "unset".to_owned(), |value| format_value(key, value)),
            key: Some(key),
        });
    }

    fn restore_setting(&mut self, key: SettingKey, formatted: Option<String>) {
        match key {
            SettingKey::InfillDensity => {
                self.current_settings.infill_density = formatted
                    .as_deref()
                    .and_then(|value| value.trim_end_matches('%').parse().ok())
                    .or(self.original_settings.infill_density)
            }
            SettingKey::InfillPattern => {
                self.current_settings.infill_pattern =
                    formatted.or_else(|| self.original_settings.infill_pattern.clone())
            }
            SettingKey::WallCount => {
                self.current_settings.wall_count = formatted
                    .as_deref()
                    .and_then(|value| value.parse().ok())
                    .or(self.original_settings.wall_count)
            }
            SettingKey::TopLayers => {
                self.current_settings.top_layers = formatted
                    .as_deref()
                    .and_then(|value| value.parse().ok())
                    .or(self.original_settings.top_layers)
            }
            SettingKey::BottomLayers => {
                self.current_settings.bottom_layers = formatted
                    .as_deref()
                    .and_then(|value| value.parse().ok())
                    .or(self.original_settings.bottom_layers)
            }
            SettingKey::SupportsEnabled => {
                self.current_settings.supports_enabled = formatted
                    .as_deref()
                    .and_then(|value| value.parse().ok())
                    .or(self.original_settings.supports_enabled)
            }
            SettingKey::WallThickness | SettingKey::SupportType | SettingKey::SupportDensity => {}
        }
    }
}

fn format_value<T: ToString>(key: SettingKey, value: T) -> String {
    match key {
        SettingKey::InfillDensity | SettingKey::SupportDensity => format!("{}%", value.to_string()),
        _ => value.to_string(),
    }
}

fn parse_objects(xml: &str) -> Vec<ProjectObject> {
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut objects = Vec::new();

    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Start(event))
            | Ok(quick_xml::events::Event::Empty(event))
                if event.name().as_ref() == b"object" =>
            {
                let mut id = None;
                let mut name = None;
                for attribute in event.attributes().flatten() {
                    if attribute.key.as_ref() == b"id" {
                        id = Some(String::from_utf8_lossy(&attribute.value).into_owned());
                    }
                    if attribute.key.as_ref() == b"name" {
                        name = Some(String::from_utf8_lossy(&attribute.value).into_owned());
                    }
                }
                if let Some(id) = id {
                    objects.push(ProjectObject {
                        name: name.unwrap_or_else(|| format!("Object {id}")),
                        id,
                    });
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Ok(_) => {}
            Err(_) => break,
        }
    }

    objects
}
