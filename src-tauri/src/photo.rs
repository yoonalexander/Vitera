//! Original images are never written to disk. Prepared images live in bounded process memory.
use crate::db::{Database, Entry, EntryInput};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{codecs::jpeg::JpegEncoder, DynamicImage, ImageDecoder, ImageFormat, ImageReader};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, io::Cursor, sync::Mutex};

type Result<T> = std::result::Result<T, String>;
const MAX_BYTES: usize = 20 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhotoInfo {
    pub id: String,
    pub width: u32,
    pub height: u32,
}
impl PhotoInfo {
    pub fn validate(&self) -> Result<()> {
        uuid::Uuid::parse_str(&self.id).map_err(|_| "Invalid photo identifier.")?;
        if self.width == 0 || self.height == 0 || self.width > 1280 || self.height > 1280 {
            return Err("Invalid prepared photo dimensions.".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedPhoto {
    #[serde(flatten)]
    pub info: PhotoInfo,
    pub data: String,
}
#[derive(Clone)]
pub struct Photo {
    pub info: PhotoInfo,
    pub jpeg: Vec<u8>,
}
impl Photo {
    pub fn prepared(&self) -> PreparedPhoto {
        PreparedPhoto {
            info: self.info.clone(),
            data: STANDARD.encode(&self.jpeg),
        }
    }
}
#[derive(Default)]
pub struct Photos(Mutex<HashMap<String, Photo>>);
impl Photos {
    pub fn prepare(&self, data: &str) -> Result<PreparedPhoto> {
        let photo = sanitize(data)?;
        let prepared = photo.prepared();
        let mut photos = self
            .0
            .lock()
            .map_err(|_| "Photo preparation is unavailable.")?;
        if photos.len() >= 4 {
            return Err("Close an existing photo draft before opening another.".into());
        }
        photos.insert(photo.info.id.clone(), photo);
        Ok(prepared)
    }
    pub fn get(&self, id: &str) -> Result<Photo> {
        self.0
            .lock()
            .map_err(|_| "Photo preparation is unavailable.")?
            .get(id)
            .cloned()
            .ok_or_else(|| "The temporary photo is no longer available. Choose it again.".into())
    }
    pub fn release(&self, id: &str) -> Result<()> {
        self.0
            .lock()
            .map_err(|_| "Photo cleanup is unavailable.")?
            .remove(id);
        Ok(())
    }
}
fn sanitize(data: &str) -> Result<Photo> {
    if data.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err("Choose a JPEG, PNG or WebP photo no larger than 20 MiB.".into());
    }
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| "The photo could not be read.")?;
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("Choose a photo no larger than 20 MiB.".into());
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "The photo could not be read.")?;
    if !matches!(
        reader.format(),
        Some(ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::WebP)
    ) {
        return Err("Choose a JPEG, PNG or WebP photo. Convert HEIC photos first.".into());
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(12000);
    limits.max_image_height = Some(12000);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "The photo is corrupt or too large to decode.")?;
    let (width, height) = decoder.dimensions();
    if u64::from(width) * u64::from(height) > 24_000_000 {
        return Err("Choose a photo with at most 24 megapixels.".into());
    }
    let orientation = decoder
        .orientation()
        .map_err(|_| "The photo orientation could not be read.")?;
    let mut decoded = DynamicImage::from_decoder(decoder)
        .map_err(|_| "The photo is corrupt or too large to decode.")?;
    decoded.apply_orientation(orientation);
    let rgba = decoded
        .resize(
            decoded.width().min(1280),
            decoded.height().min(1280),
            image::imageops::FilterType::Triangle,
        )
        .to_rgba8();
    // Flatten transparency onto white instead of silently turning it black.
    let rgb = image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let p = rgba.get_pixel(x, y);
        let a = u32::from(p[3]);
        image::Rgb([0, 1, 2].map(|i| ((u32::from(p[i]) * a + 255 * (255 - a) + 127) / 255) as u8))
    });
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, 85)
        .encode_image(&rgb)
        .map_err(|_| "The photo could not be prepared.")?;
    // A fresh encoder carries none of the input EXIF, GPS, filenames or other metadata.
    Ok(Photo {
        info: PhotoInfo {
            id: uuid::Uuid::new_v4().to_string(),
            width: rgb.width(),
            height: rgb.height(),
        },
        jpeg,
    })
}
impl Database {
    pub fn save_photo_entries(
        &mut self,
        entries: Vec<EntryInput>,
        photo: &Photo,
        retain: bool,
    ) -> Result<Vec<Entry>> {
        photo.info.validate()?;
        if entries.is_empty()
            || entries.iter().any(|e| {
                e.nutrition
                    .ai
                    .as_ref()
                    .is_none_or(|a| a.photo.as_ref() != Some(&photo.info))
            })
        {
            return Err("The reviewed draft does not belong to this photo.".into());
        }
        let request = entries[0].nutrition.ai.as_ref().unwrap().request_id.clone();
        let previous: Option<(String, bool)> = self
            .connection
            .query_row(
                "SELECT photo_id,retained FROM photo_saves WHERE request_id=?1",
                [&request],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|_| "Photo receipt could not be read.")?;
        if previous
            .as_ref()
            .is_some_and(|old| old != &(photo.info.id.clone(), retain))
        {
            return Err(
                "This photo draft was already saved with different retention settings.".into(),
            );
        }
        self.connection
            .execute_batch("SAVEPOINT photo_batch")
            .map_err(|_| "Photo draft could not be saved.")?;
        let result = (|| {
            let saved = self.save_ai_entries(entries)?;
            self.connection
                .execute(
                    "INSERT INTO photo_saves VALUES (?1,?2,?3) ON CONFLICT DO NOTHING",
                    params![request, photo.info.id, retain],
                )
                .map_err(|_| "Photo receipt could not be saved.")?;
            // A retry after attachment removal never recreates it.
            if retain && previous.is_none() {
                self.connection
                    .execute(
                        "INSERT INTO photo_attachments VALUES (?1,?2,?3,?4)",
                        params![request, photo.jpeg, photo.info.width, photo.info.height],
                    )
                    .map_err(|_| "Photo attachment could not be saved.")?;
            }
            Ok(saved)
        })();
        match result {
            Ok(saved) => {
                self.connection
                    .execute_batch("RELEASE photo_batch")
                    .map_err(|_| "Photo draft could not be committed.")?;
                Ok(saved)
            }
            Err(error) => {
                let _ = self
                    .connection
                    .execute_batch("ROLLBACK TO photo_batch; RELEASE photo_batch");
                Err(error)
            }
        }
    }
    pub fn attachment(&self, request: &str) -> Result<Option<PreparedPhoto>> {
        self.connection.query_row("SELECT s.photo_id,a.width,a.height,a.jpeg FROM photo_attachments a JOIN photo_saves s USING(request_id) WHERE request_id=?1",[request],|r|Ok(Photo { info:PhotoInfo { id:r.get(0)?,width:r.get(1)?,height:r.get(2)? },jpeg:r.get(3)? }.prepared())).optional().map_err(|_| "The retained photo could not be read.".into())
    }
    pub fn remove_attachment(&self, request: &str) -> Result<()> {
        self.connection
            .execute(
                "DELETE FROM photo_attachments WHERE request_id=?1",
                [request],
            )
            .map_err(|_| "The retained photo could not be removed.")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::AiProvenance;
    use crate::nutrition::NutritionSnapshot;
    fn jpeg(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        JpegEncoder::new_with_quality(&mut bytes, 85)
            .encode_image(&image::RgbImage::from_pixel(
                width,
                height,
                image::Rgb([210, 120, 40]),
            ))
            .unwrap();
        bytes
    }
    fn photo() -> Photo {
        sanitize(&STANDARD.encode(jpeg(64, 32))).unwrap()
    }
    fn entry(photo: &Photo, request: &str) -> EntryInput {
        let origin:AiProvenance=serde_json::from_value(serde_json::json!({"requestId":request,"provider":"ollama","model":"synthetic-vision","promptVersion":"photo-1","schemaVersion":1,"generatedAt":"2026-10-01T12:00:00Z","originalName":"Synthetic meal","originalQuantity":1,"originalUnit":"serving","quantity":1,"unit":"serving","assumptions":["Visual portion assumption"],"questions":[],"reviewed":true,"photo":photo.info})).unwrap();
        EntryInput {
            id: uuid::Uuid::new_v4().to_string(),
            date: "2026-10-01".into(),
            meal: "Lunch".into(),
            name: "Synthetic photo meal".into(),
            kcal: 123.0,
            revision: None,
            nutrition: NutritionSnapshot {
                ai: Some(origin),
                ..Default::default()
            },
        }
    }
    #[test]
    fn orientation_resize_and_metadata_removal_are_independent_of_file_extension() {
        // EXIF little-endian orientation 6 (rotate clockwise), plus private metadata.
        let exif = [
            b"Exif\0\0".as_slice(),
            b"II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0".as_slice(),
            b"PRIVATE GPS sample".as_slice(),
        ]
        .concat();
        let bytes = jpeg(2000, 1000);
        let mut original = bytes[..2].to_vec();
        original.extend_from_slice(&[0xff, 0xe1]);
        original.extend_from_slice(&((exif.len() + 2) as u16).to_be_bytes());
        original.extend_from_slice(&exif);
        original.extend_from_slice(&bytes[2..]);
        let prepared = sanitize(&STANDARD.encode(original)).unwrap();
        assert_eq!((prepared.info.width, prepared.info.height), (640, 1280));
        assert!(!prepared.jpeg.windows(6).any(|w| w == b"Exif\0\0"));
        assert!(!prepared.jpeg.windows(7).any(|w| w == b"PRIVATE"));
        let mut transparent = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            3,
            2,
            image::Rgba([0, 0, 0, 0]),
        ))
        .write_to(&mut transparent, ImageFormat::Png)
        .unwrap();
        let flat = sanitize(&STANDARD.encode(transparent.into_inner())).unwrap();
        let decoded = image::load_from_memory(&flat.jpeg).unwrap().to_rgb8();
        assert_eq!(decoded.get_pixel(0, 0).0, [255, 255, 255]);
    }
    #[test]
    fn invalid_inputs_and_memory_lifetime_are_bounded() {
        assert!(sanitize("not base64").is_err());
        assert!(sanitize(&STANDARD.encode(b"<svg/>")).is_err());
        assert!(sanitize(&"A".repeat(MAX_BYTES.div_ceil(3) * 4 + 1)).is_err());
        let photos = Photos::default();
        let data = STANDARD.encode(jpeg(3, 2));
        let ids = (0..4)
            .map(|_| photos.prepare(&data).unwrap().info.id)
            .collect::<Vec<_>>();
        assert!(photos.prepare(&data).is_err());
        photos.release(&ids[0]).unwrap();
        assert!(photos.get(&ids[0]).is_err());
        assert!(photos.prepare(&data).is_ok());
    }
    #[test]
    fn optional_retention_and_atomic_receipts_survive_upgrade_and_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("photo.sqlite3");
        let mut db = Database::open(&path).unwrap();
        // Upgrade a schema-4 database while preserving its existing catalog.
        db.connection
            .execute_batch(
                "DROP TABLE photo_attachments; DROP TABLE photo_saves; ALTER TABLE settings DROP COLUMN palette; PRAGMA user_version=4;",
            )
            .unwrap();
        drop(db);
        db = Database::open(&path).unwrap();
        let photo = photo();
        let request = uuid::Uuid::new_v4().to_string();
        let input = entry(&photo, &request);
        let input_json = serde_json::to_string(&input).unwrap();
        db.save_photo_entries(vec![input], &photo, true).unwrap();
        db.save_photo_entries(
            vec![serde_json::from_str(&input_json).unwrap()],
            &photo,
            true,
        )
        .unwrap();
        assert_eq!(db.day("2026-10-01").unwrap().total_kcal, 123.0);
        assert!(db
            .save_photo_entries(
                vec![serde_json::from_str(&input_json).unwrap()],
                &photo,
                false
            )
            .is_err());
        drop(db);
        db = Database::open(&path).unwrap();
        assert_eq!(
            STANDARD
                .decode(db.attachment(&request).unwrap().unwrap().data)
                .unwrap(),
            photo.jpeg
        );
        db.remove_attachment(&request).unwrap();
        db.save_photo_entries(
            vec![serde_json::from_str(&input_json).unwrap()],
            &photo,
            true,
        )
        .unwrap();
        assert!(db.attachment(&request).unwrap().is_none());
        let no_retention = uuid::Uuid::new_v4().to_string();
        db.save_photo_entries(vec![entry(&photo, &no_retention)], &photo, false)
            .unwrap();
        assert!(db.attachment(&no_retention).unwrap().is_none());
        let failed = uuid::Uuid::new_v4().to_string();
        let valid = entry(&photo, &failed);
        let mut invalid = entry(&photo, &failed);
        invalid.kcal = -1.0;
        assert!(db
            .save_photo_entries(vec![valid, invalid], &photo, true)
            .is_err());
        assert_eq!(db.day("2026-10-01").unwrap().total_kcal, 246.0);
        assert!(db.attachment(&failed).unwrap().is_none());
        let mut unreviewed = entry(&photo, &failed);
        unreviewed.nutrition.ai.as_mut().unwrap().reviewed = false;
        assert!(db
            .save_photo_entries(vec![unreviewed], &photo, true)
            .is_err());
        let different = sanitize(&STANDARD.encode(jpeg(2, 2))).unwrap();
        assert!(db
            .save_photo_entries(vec![entry(&photo, &failed)], &different, true)
            .is_err());
    }
}
