use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{ChatCraftError, Result};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub infill_density: Option<u8>,
    pub infill_pattern: Option<String>,
    pub wall_count: Option<u8>,
    pub wall_thickness: Option<f64>,
    pub top_layers: Option<u8>,
    pub bottom_layers: Option<u8>,
    pub supports_enabled: Option<bool>,
    pub support_type: Option<String>,
    pub support_density: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingKey {
    InfillDensity,
    InfillPattern,
    WallCount,
    WallThickness,
    TopLayers,
    BottomLayers,
    SupportsEnabled,
    SupportType,
    SupportDensity,
}

impl SettingKey {
    pub fn label(self) -> &'static str {
        match self {
            SettingKey::InfillDensity => "Infill density",
            SettingKey::InfillPattern => "Infill pattern",
            SettingKey::WallCount => "Wall count",
            SettingKey::WallThickness => "Wall thickness",
            SettingKey::TopLayers => "Top layers",
            SettingKey::BottomLayers => "Bottom layers",
            SettingKey::SupportsEnabled => "Supports enabled",
            SettingKey::SupportType => "Support type",
            SettingKey::SupportDensity => "Support density",
        }
    }

    fn slicer_key(self) -> &'static str {
        match self {
            SettingKey::InfillDensity => "sparse_infill_density",
            SettingKey::InfillPattern => "sparse_infill_pattern",
            SettingKey::WallCount => "wall_loops",
            SettingKey::WallThickness => "wall_thickness",
            SettingKey::TopLayers => "top_shell_layers",
            SettingKey::BottomLayers => "bottom_shell_layers",
            SettingKey::SupportsEnabled => "enable_support",
            SettingKey::SupportType => "support_type",
            SettingKey::SupportDensity => "support_density",
        }
    }
}

pub fn parse_project_settings(raw: &Map<String, Value>) -> ProjectSettings {
    ProjectSettings {
        infill_density: raw.get("sparse_infill_density").and_then(parse_percent),
        infill_pattern: raw
            .get("sparse_infill_pattern")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        wall_count: raw.get("wall_loops").and_then(parse_u8),
        wall_thickness: raw.get("wall_thickness").and_then(parse_f64),
        top_layers: raw.get("top_shell_layers").and_then(parse_u8),
        bottom_layers: raw.get("bottom_shell_layers").and_then(parse_u8),
        supports_enabled: raw.get("enable_support").and_then(parse_bool),
        support_type: raw
            .get("support_type")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        support_density: raw.get("support_density").and_then(parse_percent),
    }
}

pub fn apply_project_settings(raw: &mut Map<String, Value>, settings: &ProjectSettings) {
    if let Some(value) = settings.infill_density {
        raw.insert(
            SettingKey::InfillDensity.slicer_key().to_owned(),
            Value::String(format!("{value}%")),
        );
    }
    if let Some(value) = &settings.infill_pattern {
        raw.insert(
            SettingKey::InfillPattern.slicer_key().to_owned(),
            Value::String(value.clone()),
        );
    }
    if let Some(value) = settings.wall_count {
        raw.insert(
            SettingKey::WallCount.slicer_key().to_owned(),
            Value::String(value.to_string()),
        );
    }
    if let Some(value) = settings.wall_thickness {
        raw.insert(
            SettingKey::WallThickness.slicer_key().to_owned(),
            Value::String(value.to_string()),
        );
    }
    if let Some(value) = settings.top_layers {
        raw.insert(
            SettingKey::TopLayers.slicer_key().to_owned(),
            Value::String(value.to_string()),
        );
    }
    if let Some(value) = settings.bottom_layers {
        raw.insert(
            SettingKey::BottomLayers.slicer_key().to_owned(),
            Value::String(value.to_string()),
        );
    }
    if let Some(value) = settings.supports_enabled {
        raw.insert(
            SettingKey::SupportsEnabled.slicer_key().to_owned(),
            Value::String(if value { "1" } else { "0" }.to_owned()),
        );
    }
    if let Some(value) = &settings.support_type {
        raw.insert(
            SettingKey::SupportType.slicer_key().to_owned(),
            Value::String(value.clone()),
        );
    }
    if let Some(value) = settings.support_density {
        raw.insert(
            SettingKey::SupportDensity.slicer_key().to_owned(),
            Value::String(format!("{value}%")),
        );
    }
}

pub fn validate_percent(value: u8, label: &str) -> Result<()> {
    if value > 100 {
        return Err(ChatCraftError::invalid_setting(
            "invalid_setting_value",
            format!("{label} must be between 0 and 100."),
        ));
    }
    Ok(())
}

pub fn validate_positive_count(value: u8, label: &str, max: u8) -> Result<()> {
    if value == 0 || value > max {
        return Err(ChatCraftError::invalid_setting(
            "invalid_setting_value",
            format!("{label} must be between 1 and {max}."),
        ));
    }
    Ok(())
}

pub fn validate_infill_pattern(pattern: &str) -> Result<()> {
    let allowed = [
        "grid",
        "gyroid",
        "honeycomb",
        "line",
        "rectilinear",
        "cubic",
        "adaptive cubic",
        "support cubic",
        "lightning",
        "concentric",
        "triangles",
        "tri-hexagon",
    ];
    if !allowed.contains(&pattern.to_ascii_lowercase().as_str()) {
        return Err(ChatCraftError::unsupported(
            "unsupported_setting_value",
            format!("Unsupported infill pattern: {pattern}."),
        ));
    }
    Ok(())
}

fn parse_percent(value: &Value) -> Option<u8> {
    value
        .as_str()
        .and_then(|text| text.trim().trim_end_matches('%').parse::<u8>().ok())
        .or_else(|| value.as_u64().and_then(|number| u8::try_from(number).ok()))
}

fn parse_u8(value: &Value) -> Option<u8> {
    value
        .as_str()
        .and_then(|text| text.trim().parse::<u8>().ok())
        .or_else(|| value.as_u64().and_then(|number| u8::try_from(number).ok()))
}

fn parse_f64(value: &Value) -> Option<f64> {
    value
        .as_str()
        .and_then(|text| text.trim().parse::<f64>().ok())
        .or_else(|| value.as_f64())
}

fn parse_bool(value: &Value) -> Option<bool> {
    match value {
        Value::Bool(value) => Some(*value),
        Value::Number(number) => Some(number.as_u64()? != 0),
        Value::String(text) => {
            let normalized = text.to_ascii_lowercase();
            Some(matches!(normalized.as_str(), "1" | "true" | "yes" | "on"))
        }
        _ => None,
    }
}
