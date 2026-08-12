use crate::error::AppError;
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

const KEYRING_SERVICE: &str = "TaskCrate";
const KEYRING_ACCOUNT: &str = "master-key-v1";
const SECRETS_FILE_NAME: &str = "secrets.json";
const MASTER_KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;

pub const AI_API_KEY: &str = "ai_api_key";
pub const WEBHOOK_DING_TALK: &str = "webhook_ding_talk";
pub const WEBHOOK_WE_COM: &str = "webhook_we_com";
pub const WEBHOOK_FEISHU: &str = "webhook_feishu";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedValue {
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SecretsFile {
    version: u32,
    values: HashMap<String, EncryptedValue>,
}

#[derive(Debug, Clone, Default)]
pub struct WebhookTargets {
    pub ding_talk: Option<String>,
    pub we_com: Option<String>,
    pub feishu: Option<String>,
}

fn secrets_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join(SECRETS_FILE_NAME)
}

fn random_bytes<const N: usize>() -> Result<[u8; N], AppError> {
    let mut bytes = [0u8; N];
    getrandom::getrandom(&mut bytes)
        .map_err(|e| AppError::Secrets(format!("系统随机数生成失败：{e}")))?;
    Ok(bytes)
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex<const N: usize>(value: &str) -> Result<[u8; N], AppError> {
    if value.len() != N * 2 {
        return Err(AppError::Secrets(format!(
            "密钥/Nonce 长度无效，期望 {} 个十六进制字符",
            N * 2
        )));
    }
    let mut bytes = [0u8; N];
    for index in 0..N {
        bytes[index] = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .map_err(|e| AppError::Secrets(format!("十六进制解析失败：{e}")))?;
    }
    Ok(bytes)
}

fn decode_hex_bytes(value: &str) -> Result<Vec<u8>, AppError> {
    if value.len() % 2 != 0 {
        return Err(AppError::Secrets("密文长度无效".to_string()));
    }
    let mut bytes = Vec::with_capacity(value.len() / 2);
    for index in (0..value.len()).step_by(2) {
        bytes.push(
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|e| AppError::Secrets(format!("十六进制解析失败：{e}")))?,
        );
    }
    Ok(bytes)
}

fn encrypt_value(
    key: &[u8; MASTER_KEY_LEN],
    name: &str,
    plaintext: &str,
) -> Result<EncryptedValue, AppError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Secrets(format!("加密密钥初始化失败：{e}")))?;
    let nonce = random_bytes::<NONCE_LEN>()?;
    let aad = format!("taskcrate:{name}:v1");
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext.as_bytes(),
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| AppError::Secrets("加密失败：数据无效".to_string()))?;
    Ok(EncryptedValue {
        nonce: encode_hex(&nonce),
        ciphertext: encode_hex(&ciphertext),
    })
}

fn decrypt_value(
    key: &[u8; MASTER_KEY_LEN],
    name: &str,
    value: &EncryptedValue,
) -> Result<String, AppError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Secrets(format!("解密密钥初始化失败：{e}")))?;
    let nonce = decode_hex::<NONCE_LEN>(&value.nonce)?;
    let ciphertext = decode_hex_bytes(&value.ciphertext)?;
    let aad = format!("taskcrate:{name}:v1");
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| AppError::Secrets("密钥校验失败或数据已被篡改".to_string()))?;
    String::from_utf8(plaintext).map_err(|_| AppError::Secrets("解密结果不是有效文本".to_string()))
}

fn read_secrets_file(data_dir: &Path) -> Result<SecretsFile, AppError> {
    let text = match fs::read_to_string(secrets_path(data_dir)) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(SecretsFile {
                version: 1,
                values: HashMap::new(),
            });
        }
        Err(error) => return Err(error.into()),
    };
    serde_json::from_str(&text)
        .map_err(|e| AppError::Secrets(format!("secrets.json 格式无效：{e}")))
}

fn write_secrets_file(data_dir: &Path, file: &SecretsFile) -> Result<(), AppError> {
    let text = serde_json::to_string_pretty(file)
        .map_err(|e| AppError::Secrets(format!("密文序列化失败：{e}")))?;
    fs::write(secrets_path(data_dir), text)?;
    Ok(())
}

fn load_or_create_master_key() -> Result<[u8; MASTER_KEY_LEN], AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| AppError::Secrets(format!("Windows 凭据管理器初始化失败：{e}")))?;
    match entry.get_password() {
        Ok(stored) => match decode_hex::<MASTER_KEY_LEN>(&stored) {
            Ok(key) => Ok(key),
            Err(_) => {
                let _ = entry.delete_credential();
                let key = random_bytes()?;
                entry
                    .set_password(&encode_hex(&key))
                    .map_err(|e| AppError::Secrets(format!("主密钥保存失败：{e}")))?;
                Ok(key)
            }
        },
        Err(keyring::Error::NoEntry) => {
            let key = random_bytes()?;
            entry
                .set_password(&encode_hex(&key))
                .map_err(|e| AppError::Secrets(format!("主密钥保存失败：{e}")))?;
            Ok(key)
        }
        Err(error) => Err(AppError::Secrets(format!(
            "Windows 凭据管理器读取失败：{error}"
        ))),
    }
}

fn get_secret_with_key(
    data_dir: &Path,
    name: &str,
    key: &[u8; MASTER_KEY_LEN],
) -> Result<Option<String>, AppError> {
    let file = read_secrets_file(data_dir)?;
    match file.values.get(name) {
        Some(value) => Ok(Some(decrypt_value(key, name, value)?)),
        None => Ok(None),
    }
}

fn set_secret_with_key(
    data_dir: &Path,
    name: &str,
    value: &str,
    key: &[u8; MASTER_KEY_LEN],
) -> Result<(), AppError> {
    let mut file = read_secrets_file(data_dir)?;
    file.values
        .insert(name.to_string(), encrypt_value(key, name, value.trim())?);
    write_secrets_file(data_dir, &file)
}

fn delete_secret_with_key(
    data_dir: &Path,
    name: &str,
    key: &[u8; MASTER_KEY_LEN],
) -> Result<(), AppError> {
    let mut file = read_secrets_file(data_dir)?;
    if file.values.remove(name).is_some() {
        write_secrets_file(data_dir, &file)?;
    }
    let _ = key;
    Ok(())
}

pub fn get_secret(data_dir: &Path, name: &str) -> Result<Option<String>, AppError> {
    if !secrets_path(data_dir).is_file() {
        return Ok(None);
    }
    let key = load_or_create_master_key()?;
    get_secret_with_key(data_dir, name, &key)
}

pub fn set_secret(data_dir: &Path, name: &str, value: &str) -> Result<(), AppError> {
    let key = load_or_create_master_key()?;
    set_secret_with_key(data_dir, name, value, &key)
}

pub fn delete_secret(data_dir: &Path, name: &str) -> Result<(), AppError> {
    if !secrets_path(data_dir).is_file() {
        return Ok(());
    }
    let key = load_or_create_master_key()?;
    delete_secret_with_key(data_dir, name, &key)
}

pub fn secret_configured(data_dir: &Path, name: &str) -> bool {
    get_secret(data_dir, name)
        .map(|value| value.is_some())
        .unwrap_or(false)
}

pub fn webhook_targets(data_dir: &Path) -> Result<WebhookTargets, AppError> {
    if !secrets_path(data_dir).is_file() {
        return Ok(WebhookTargets::default());
    }
    let key = load_or_create_master_key()?;
    Ok(WebhookTargets {
        ding_talk: get_secret_with_key(data_dir, WEBHOOK_DING_TALK, &key)?,
        we_com: get_secret_with_key(data_dir, WEBHOOK_WE_COM, &key)?,
        feishu: get_secret_with_key(data_dir, WEBHOOK_FEISHU, &key)?,
    })
}

pub fn migrate_legacy(data_dir: &Path, conn: &Connection) -> Result<(), AppError> {
    let legacy_key_file = data_dir.join("ai_api_key");
    let legacy_webhook_exists: bool = conn
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM settings
                WHERE key IN (?1, ?2, ?3) AND TRIM(value) NOT IN ('', '\"\"')
             )",
            rusqlite::params![WEBHOOK_DING_TALK, WEBHOOK_WE_COM, WEBHOOK_FEISHU],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !legacy_key_file.is_file() && !legacy_webhook_exists && !secrets_path(data_dir).is_file() {
        return Ok(());
    }
    let key = load_or_create_master_key()?;
    migrate_legacy_with_key(data_dir, conn, &key)
}

fn migrate_legacy_with_key(
    data_dir: &Path,
    conn: &Connection,
    key: &[u8; MASTER_KEY_LEN],
) -> Result<(), AppError> {
    let legacy_key_file = data_dir.join("ai_api_key");
    match fs::read_to_string(&legacy_key_file) {
        Ok(value) => {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                set_secret_with_key(data_dir, AI_API_KEY, trimmed, key)?;
            }
            fs::remove_file(&legacy_key_file)?;
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }

    let mut stmt = conn.prepare(
        "SELECT key, value FROM settings
         WHERE key IN (?1, ?2, ?3)",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![WEBHOOK_DING_TALK, WEBHOOK_WE_COM, WEBHOOK_FEISHU],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;
    let mut migrated_keys = Vec::new();
    for row in rows {
        let (setting_key, raw) = row?;
        let plaintext = serde_json::from_str::<String>(&raw)
            .unwrap_or_else(|_| raw.clone())
            .trim()
            .to_string();
        if !plaintext.is_empty() {
            set_secret_with_key(data_dir, &setting_key, &plaintext, key)?;
        }
        migrated_keys.push(setting_key);
    }
    for setting_key in migrated_keys {
        conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            rusqlite::params![setting_key],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn test_key() -> [u8; MASTER_KEY_LEN] {
        [7u8; MASTER_KEY_LEN]
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let value = encrypt_value(&test_key(), AI_API_KEY, "sk-test-123").unwrap();
        let plaintext = decrypt_value(&test_key(), AI_API_KEY, &value).unwrap();
        assert_eq!(plaintext, "sk-test-123");
    }

    #[test]
    fn tampered_ciphertext_is_rejected() {
        let mut value = encrypt_value(&test_key(), AI_API_KEY, "sk-test-123").unwrap();
        value.ciphertext = if value.ciphertext.starts_with("00") {
            format!("ff{}", &value.ciphertext[2..])
        } else {
            format!("00{}", &value.ciphertext[2..])
        };
        assert!(decrypt_value(&test_key(), AI_API_KEY, &value).is_err());
    }

    #[test]
    fn aad_binds_secret_name() {
        let value = encrypt_value(&test_key(), AI_API_KEY, "sk-test-123").unwrap();
        assert!(decrypt_value(&test_key(), WEBHOOK_DING_TALK, &value).is_err());
    }

    #[test]
    fn migrate_legacy_moves_plaintext_into_secrets() {
        let dir = std::env::temp_dir().join(format!(
            "taskcrate-secrets-migrate-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();

        let conn = db::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        db::seed_defaults(&conn).unwrap();
        fs::write(dir.join("ai_api_key"), "sk-legacy").unwrap();
        crate::repositories::upsert_setting(
            &conn,
            WEBHOOK_DING_TALK,
            &serde_json::to_string("https://example.com/hook").unwrap(),
        )
        .unwrap();

        migrate_legacy_with_key(&dir, &conn, &test_key()).unwrap();

        assert_eq!(
            get_secret_with_key(&dir, AI_API_KEY, &test_key())
                .unwrap()
                .as_deref(),
            Some("sk-legacy")
        );
        assert!(!dir.join("ai_api_key").exists());
        assert_eq!(
            get_secret_with_key(&dir, WEBHOOK_DING_TALK, &test_key())
                .unwrap()
                .as_deref(),
            Some("https://example.com/hook")
        );
        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM settings WHERE key = ?1",
                rusqlite::params![WEBHOOK_DING_TALK],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);

        fs::remove_dir_all(&dir).unwrap();
    }
}
