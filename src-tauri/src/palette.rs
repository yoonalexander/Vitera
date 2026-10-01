use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Palettes {
    pub light: Option<Palette>,
    pub dark: Option<Palette>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Palette {
    pub canvas: String,
    pub surface: String,
    pub header: String,
    pub header_ink: String,
    pub ink: String,
    pub muted: String,
    pub line: String,
    pub accent: String,
    pub accent_ink: String,
    pub soft: String,
    pub error: String,
    pub error_bg: String,
}

impl Palettes {
    pub fn validate(&self) -> Result<(), String> {
        for p in [&self.light, &self.dark].into_iter().flatten() {
            for color in [
                &p.canvas,
                &p.surface,
                &p.header,
                &p.header_ink,
                &p.ink,
                &p.muted,
                &p.line,
                &p.accent,
                &p.accent_ink,
                &p.soft,
                &p.error,
                &p.error_bg,
            ] {
                if color.len() != 7
                    || !color.starts_with('#')
                    || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
                {
                    return Err(
                        "Choose a six-digit hex color, such as #2563EB, for every palette color."
                            .into(),
                    );
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
pub fn fixture() -> Palette {
    serde_json::from_value(serde_json::json!({
        "canvas":"#f3f7fc", "surface":"#ffffff", "header":"#152e50",
        "headerInk":"#f4f8ff", "ink":"#152c47", "muted":"#52657b",
        "line":"#c9d7e8", "accent":"#245b9e", "accentInk":"#ffffff",
        "soft":"#e4edf8", "error":"#8e3434", "errorBg":"#fff0f0"
    }))
    .unwrap()
}
