export interface FeedbackInput {
  type: string;
  description: string;
  appVersion: string;
  platform: string;
  userAgent: string;
}

export function buildFeedbackText(input: FeedbackInput): string {
  return [
    "TaskCrate 反馈",
    `类型：${input.type}`,
    `应用版本：${input.appVersion}`,
    `系统平台：${input.platform}`,
    `浏览器/WebView：${input.userAgent}`,
    "",
    "描述：",
    input.description.trim() || "（未填写）",
  ].join("\n");
}

export async function copyFeedbackText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy copy
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export function downloadFeedbackFile(text: string): void {
  const blob = new Blob([`\u{feff}${text}`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `TaskCrate反馈-${new Date().toISOString().slice(0, 10)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
