import { Bot, MessageSquare, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, IconButton, Input, Textarea } from "@task-manager/ui";
import { shouldIgnoreEnter } from "../lib/ime";
import { useAiStore, useUiStore } from "../stores";
import { useSettingsStore } from "../stores/settingsStore";

const PROVIDER_LABELS: Record<string, string> = {
  off: "未启用",
  local: "本地模型",
  cloud: "云端模型",
};

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "创建主任务",
    prompt: "帮我创建一个主任务「网站改版」，下面分两个大任务",
  },
  {
    label: "最近 7 天到期",
    prompt: "帮我看看未来 7 天内有哪些任务到期",
  },
  {
    label: "任务概况",
    prompt: "统计一下当前任务概况",
  },
  {
    label: "规划项目",
    prompt: "帮我规划一个新项目，列出大任务和小任务",
  },
];

interface ToolSummary {
  title: string;
  lines: string[];
}

function summarizeToolResult(content: string): ToolSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return null;
  }

  const itemLabel = (value: unknown): string | null => {
    if (!value || typeof value !== "object") {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.title === "string") {
      return record.title;
    }
    if (typeof record.name === "string") {
      return record.name;
    }
    if (typeof record.content === "string") {
      return record.content;
    }
    return null;
  };

  if (Array.isArray(parsed)) {
    const items = parsed;
    const lines = [`共 ${items.length} 项`];
    const firstLabel = itemLabel(items[0]);
    if (firstLabel) {
      lines.push(`例如：${firstLabel}`);
    }
    return { title: "查询结果", lines };
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const lines: string[] = [];
  if (Array.isArray(obj.items)) {
    lines.push(`共 ${obj.items.length} 项`);
    const firstLabel = itemLabel(obj.items[0]);
    if (firstLabel) {
      lines.push(`例如：${firstLabel}`);
    }
  }
  if (typeof obj.total === "number" && !Array.isArray(obj.items)) {
    lines.push(`共 ${obj.total} 个任务`);
  }
  if (typeof obj.totalActive === "number") {
    lines.push(
      `进行中 ${obj.inProgress ?? 0}，待办 ${obj.todo ?? 0}，已完成 ${obj.completed ?? 0}，已取消 ${obj.cancelled ?? 0}`,
    );
    lines.push(
      `逾期 ${obj.overdue ?? 0}，7 天内到期 ${obj.dueSoon ?? 0}，高优先级 ${obj.highPriority ?? 0}`,
    );
  }
  if (typeof obj.title === "string") {
    lines.push(`任务：${obj.title}`);
  }
  if (typeof obj.name === "string") {
    lines.push(`名称：${obj.name}`);
  }
  if (typeof obj.content === "string") {
    lines.push(obj.content);
  }
  if (obj.deleted !== undefined) {
    lines.push(obj.deleted === true ? "已删除" : "操作完成");
  }
  if (lines.length === 0) {
    lines.push("操作完成");
  }
  const title =
    typeof obj.title === "string"
      ? obj.title
      : typeof obj.name === "string"
        ? obj.name
        : typeof obj.taskId === "string"
          ? `任务 ${obj.taskId}`
          : "AI 工具执行结果";
  return { title, lines };
}

function ToolResult({ content }: { content: string }) {
  const summary = summarizeToolResult(content);
  if (!summary) {
    return <div className="ai-tool-result">{content}</div>;
  }
  return (
    <div className="ai-tool-result ai-tool-result--card">
      <strong>{summary.title}</strong>
      {summary.lines.map((line, index) => (
        <span key={`${index}-${line}`}>{line}</span>
      ))}
    </div>
  );
}

function renderMessageContent(content: string | null): ReactNode {
  if (!content) {
    return null;
  }
  const parts = content.split(/```/);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const firstBreak = part.indexOf("\n");
          const language = firstBreak >= 0 ? part.slice(0, firstBreak).trim() : "";
          const code = firstBreak >= 0 ? part.slice(firstBreak + 1) : part;
          return (
            <pre key={`code-${index}`} className="ai-code-block">
              {language ? <span className="ai-code-block__lang">{language}</span> : null}
              <code>{code}</code>
            </pre>
          );
        }
        return <span key={`text-${index}`}>{part}</span>;
      })}
    </>
  );
}
export function AiView() {
  const conversations = useAiStore((s) => s.conversations);
  const activeConversationId = useAiStore((s) => s.activeConversationId);
  const messages = useAiStore((s) => s.messages);
  const streamingContent = useAiStore((s) => s.streamingContent);
  const loading = useAiStore((s) => s.loading);
  const error = useAiStore((s) => s.error);
  const pendingActions = useAiStore((s) => s.pendingActions);
  const loadConversations = useAiStore((s) => s.loadConversations);
  const newConversation = useAiStore((s) => s.newConversation);
  const openConversation = useAiStore((s) => s.openConversation);
  const renameConversation = useAiStore((s) => s.renameConversation);
  const deleteConversation = useAiStore((s) => s.deleteConversation);
  const sendMessage = useAiStore((s) => s.sendMessage);
  const retry = useAiStore((s) => s.retry);
  const confirmAction = useAiStore((s) => s.confirmAction);
  const clearConversation = useAiStore((s) => s.clearConversation);
  const settings = useSettingsStore((s) => s.settings);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const chat = chatRef.current;
    if (chat) {
      chat.scrollTop = chat.scrollHeight;
    }
  }, [messages, loading]);

  const provider = settings?.aiProvider ?? "off";
  const model = settings?.aiModel?.trim();
  const submit = () => {
    const text = draft.trim();
    if (!text || loading) {
      return;
    }
    setDraft("");
    void sendMessage(text);
  };

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setRenameDraft(title);
  };

  const saveRename = (id: string) => {
    if (editingId === id) {
      void renameConversation(id, renameDraft);
      setEditingId(null);
    }
  };

  return (
    <section className="ai-view" aria-label="AI 助手视图">
      <aside className="ai-history" aria-label="历史会话">
        <header className="ai-history__header">
          <h3>历史会话</h3>
          <IconButton label="新建对话" onClick={() => void newConversation()}>
            <Plus size={15} />
          </IconButton>
        </header>
        <div className="ai-history__list">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={[
                "ai-history__item",
                activeConversationId === conversation.id
                  ? "ai-history__item--active"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {editingId === conversation.id ? (
                <Input
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => saveRename(conversation.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !shouldIgnoreEnter(event)) {
                      event.preventDefault();
                      saveRename(conversation.id);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="ai-history__title"
                  onClick={() => void openConversation(conversation.id)}
                >
                  <MessageSquare size={14} />
                  <span>
                    {conversation.title}
                    <small>{conversation.messageCount} 条消息</small>
                  </span>
                </button>
              )}
              {editingId !== conversation.id ? (
                <div className="ai-history__actions">
                  <IconButton
                    size="sm"
                    label={`重命名 ${conversation.title}`}
                    onClick={() => startRename(conversation.id, conversation.title)}
                  >
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={`删除 ${conversation.title}`}
                    onClick={() => void deleteConversation(conversation.id)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              ) : null}
            </div>
          ))}
          {conversations.length === 0 ? (
            <p className="ai-history__empty">暂无历史会话</p>
          ) : null}
        </div>
      </aside>

      <div className="ai-main">
        <header className="ai-view__header">
          <div className="ai-view__heading">
            <h2>AI 助手</h2>
            <p>
              {PROVIDER_LABELS[provider] ?? "未启用"}
              {model ? ` · ${model}` : ""}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void clearConversation()}
            disabled={messages.length === 0 || !activeConversationId}
          >
            <Trash2 size={14} />
            清空当前
          </Button>
        </header>

        <div className="ai-chat" ref={chatRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className="ai-empty">
              <Bot size={22} />
              <p>选择历史会话继续，或直接输入消息开始新对话</p>
              {provider === "off" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => useUiStore.getState().setView("settings")}
                >
                  去配置
                </Button>
              ) : (
                <div className="ai-quick">
                  {QUICK_PROMPTS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="ai-quick__item"
                      onClick={() => {
                        setDraft("");
                        void sendMessage(item.prompt);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((message, index) => {
              if (message.role === "tool") {
                return (
                  <ToolResult
                    key={`${message.toolCallId ?? index}-tool`}
                    content={message.content ?? ""}
                  />
                );
              }
              const isUser = message.role === "user";
              return (
                <div
                  key={`${index}-${message.role}`}
                  className={isUser ? "ai-bubble ai-bubble--user" : "ai-bubble"}
                >
                  <span className="ai-bubble__label">{isUser ? "你" : "AI"}</span>
                  <div className="ai-bubble__content">{renderMessageContent(message.content)}</div>
                </div>
              );
            })
          )}
          {streamingContent ? (
            <div className="ai-bubble ai-bubble--streaming">
              <span className="ai-bubble__label">AI</span>
              <div className="ai-bubble__content">{renderMessageContent(streamingContent)}</div>
            </div>
          ) : null}
          {loading && pendingActions.length === 0 ? (
            <div className="ai-typing">AI 正在处理...</div>
          ) : null}
          {error ? (
            <div className="ai-error">
              <p className="view-error">{error}</p>
              <Button size="sm" variant="secondary" onClick={() => void retry()}>
                重试
              </Button>
            </div>
          ) : null}
        </div>

        {pendingActions.length > 0 ? (
          <div className="ai-pending">
            {pendingActions.map((action) => (
              <div key={action.id} className="ai-pending__card">
                <div>
                  <strong>AI 请求执行：{action.description}</strong>
                  <span>确认后才会真正修改任务</span>
                </div>
                <div className="ai-pending__actions">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void confirmAction(action.id, true)}
                  >
                    确认执行
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void confirmAction(action.id, false)}
                  >
                    拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="ai-composer">
          <Textarea
            label=""
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !shouldIgnoreEnter(event)) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="例如：帮我创建主任务「网站改版」，下面分两个大任务"
          />
          <Button onClick={submit} disabled={!draft.trim() || loading}>
            <Send size={15} />
            发送
          </Button>
        </div>
        {provider === "off" ? (
          <p className="ai-hint">当前未启用 AI，请先到设置中配置本地或云端模型。</p>
        ) : null}
      </div>
    </section>
  );
}
