use crate::secrets::WebhookTargets;
use serde_json::json;

pub fn send_webhook(targets: &WebhookTargets, title: &str, content: &str) -> Result<usize, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("通知客户端初始化失败：{e}"))?;
    let message = format!("TaskCrate\n{title}\n{content}");
    let mut sent = 0;

    if let Some(url) = targets
        .ding_talk
        .as_deref()
        .filter(|url| !url.trim().is_empty())
    {
        let payload = json!({ "msgtype": "text", "text": { "content": message } });
        if post_json(&client, url, &payload).is_ok() {
            sent += 1;
        }
    }
    if let Some(url) = targets
        .we_com
        .as_deref()
        .filter(|url| !url.trim().is_empty())
    {
        let payload = json!({ "msgtype": "text", "text": { "content": message } });
        if post_json(&client, url, &payload).is_ok() {
            sent += 1;
        }
    }
    if let Some(url) = targets
        .feishu
        .as_deref()
        .filter(|url| !url.trim().is_empty())
    {
        let payload = json!({ "msg_type": "text", "content": { "text": message } });
        if post_json(&client, url, &payload).is_ok() {
            sent += 1;
        }
    }
    Ok(sent)
}

fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    client
        .post(url)
        .json(payload)
        .send()
        .map_err(|e| format!("发送失败：{e}"))?
        .error_for_status()
        .map_err(|e| format!("发送失败：{e}"))?;
    Ok(())
}

pub fn has_mention(content: &str) -> bool {
    content.contains('@')
}
