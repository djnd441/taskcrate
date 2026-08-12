import type {
  AiChatMessage,
  AiConversation,
  AiConversationSummary,
  AiToolCall,
} from "@task-manager/domain";
import { create } from "zustand";
import { getAdapters } from "../adapters";
import { useSettingsStore } from "./settingsStore";
import { useProjectsStore } from "./projectsStore";
import { useTagsStore } from "./tagsStore";
import { useTasksStore } from "./tasksStore";

const DESTRUCTIVE_TOOLS = new Set([
  "archive_task",
  "unarchive_task",
  "soft_delete_task",
  "restore_task",
  "hard_delete_task",
]);

const MAX_TOOL_ROUNDS = 8;

export interface PendingAiAction {
  id: string;
  toolCall: AiToolCall;
  description: string;
}

export interface AiState {
  conversations: AiConversationSummary[];
  activeConversationId: string | null;
  messages: AiChatMessage[];
  streamingContent: string | null;
  loading: boolean;
  error: string | null;
  pendingActions: PendingAiAction[];
  rounds: number;
  loadConversations: () => Promise<void>;
  newConversation: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  confirmAction: (id: string, allow: boolean) => Promise<void>;
  clearConversation: () => Promise<void>;
}

function parseArgs(argumentsText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsText) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function describeToolCall(call: AiToolCall): string {
  const args = parseArgs(call.arguments);
  switch (call.name) {
    case "create_task":
      return `创建任务：${String(args.title ?? "未命名")}`;
    case "update_task":
      return `修改任务：${String(args.id ?? "")}`;
    case "complete_task":
      return `完成任务：${String(args.id ?? "")}`;
    case "soft_delete_task":
      return `删除任务：${String(args.id ?? "")}`;
    case "hard_delete_task":
      return `彻底删除任务：${String(args.id ?? "")}`;
    case "restore_task":
      return `恢复任务：${String(args.id ?? "")}`;
    case "archive_task":
      return `归档任务：${String(args.id ?? "")}`;
    case "unarchive_task":
      return `取消归档：${String(args.id ?? "")}`;
    case "transition_task_status":
      return `切换任务状态：${String(args.id ?? "")}`;
    case "create_project":
      return `创建项目：${String(args.name ?? "未命名")}`;
    case "create_tag":
      return `创建标签：${String(args.name ?? "未命名")}`;
    case "add_task_comment":
      return `评论任务：${String(args.taskId ?? "")}`;
    case "list_due_tasks":
      return "查看未来到期任务";
    case "get_task_stats":
      return "查看任务统计概况";
    case "list_tasks":
    case "search_tasks":
      return "查询任务";
    default:
      return call.name;
  }
}

function autoTitle(messages: AiChatMessage[]): string {
  const first = messages.find((message) => message.role === "user")?.content;
  return first ? first.trim().slice(0, 20) || "新对话" : "新对话";
}

function toSummary(conversation: AiConversation): AiConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    provider: conversation.provider,
    model: conversation.model,
    messageCount: conversation.messages.length,
    updatedAt: conversation.updatedAt,
  };
}

function upsertSummary(
  conversations: AiConversationSummary[],
  conversation: AiConversation,
): AiConversationSummary[] {
  const summary = toSummary(conversation);
  const exists = conversations.some((item) => item.id === conversation.id);
  const next = exists
    ? conversations.map((item) => (item.id === conversation.id ? summary : item))
    : [...conversations, summary];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const useAiStore = create<AiState>((set, get) => {
  async function persistActive(messages: AiChatMessage[]): Promise<void> {
    const id = get().activeConversationId;
    if (!id) {
      return;
    }
    const existing = await getAdapters().ai.getConversation(id);
    if (!existing) {
      return;
    }
    const title = existing.title === "新对话" ? autoTitle(messages) : existing.title;
    const saved = await getAdapters().ai.saveConversation({
      ...existing,
      title,
      messages,
    });
    set((state) => ({
      conversations: upsertSummary(state.conversations, saved),
    }));
  }

  async function runChat(messages: AiChatMessage[], round: number): Promise<void> {
    if (round > MAX_TOOL_ROUNDS) {
      const next = [
        ...messages,
        {
          role: "assistant" as const,
          content: "已达到最大工具调用次数，请简化指令后重试。",
        },
      ];
      set({ messages: next, loading: false, streamingContent: null });
      await persistActive(next);
      return;
    }
    try {
      const result = await getAdapters().ai.chat(messages, (chunk) => {
        if (chunk.type === "delta") {
          set((state) => ({
            streamingContent: (state.streamingContent ?? "") + (chunk.content ?? ""),
          }));
        } else if (chunk.type === "error") {
          set({
            error: chunk.message ?? "AI 响应中断",
            streamingContent: null,
            loading: false,
          });
        }
      });
      set({ streamingContent: null });
      if (result.toolCalls.length === 0) {
        const next = [
          ...messages,
          {
            role: "assistant" as const,
            content: result.text ?? "已完成",
          },
        ];
        set({ messages: next, loading: false, rounds: round });
        await persistActive(next);
        return;
      }

      const settings = useSettingsStore.getState().settings;
      const needsConfirm =
        settings?.aiConfirmDestructive !== false &&
        result.toolCalls.some((call) => DESTRUCTIVE_TOOLS.has(call.name));
      const assistantMessage: AiChatMessage = {
        role: "assistant",
        content: result.text,
        toolCalls: result.toolCalls,
      };
      const withAssistant = [...messages, assistantMessage];
      const destructiveCalls = result.toolCalls.filter((call) => DESTRUCTIVE_TOOLS.has(call.name));
      const autoCalls = result.toolCalls.filter((call) => !DESTRUCTIVE_TOOLS.has(call.name));
      if (needsConfirm) {
        const withAutoResults =
          autoCalls.length > 0
            ? await executeToolCalls(withAssistant, autoCalls, false)
            : withAssistant;
        set({
          messages: withAutoResults,
          pendingActions: destructiveCalls.map((toolCall) => ({
            id: toolCall.id,
            toolCall,
            description: describeToolCall(toolCall),
          })),
          rounds: round,
          streamingContent: null,
          loading: false,
        });
        await persistActive(withAutoResults);
        return;
      }

      const nextMessages = await executeToolCalls(withAssistant, result.toolCalls, true);
      set({ messages: nextMessages });
      await persistActive(nextMessages);
      await runChat(nextMessages, round + 1);
    } catch (error) {
      set({
        streamingContent: null,
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  }

  async function executeToolCalls(
    messages: AiChatMessage[],
    toolCalls: AiToolCall[],
    confirmed: boolean,
  ): Promise<AiChatMessage[]> {
    const nextMessages = [...messages];
    for (const call of toolCalls) {
      try {
        const content = await getAdapters().ai.executeTool(
          call.name,
          parseArgs(call.arguments),
          confirmed,
        );
        nextMessages.push({
          role: "tool",
          toolCallId: call.id,
          content,
        });
        void Promise.all([
          useTasksStore.getState().refreshTasks(),
          useProjectsStore.getState().loadProjects(),
          useTagsStore.getState().loadTags(),
        ]);
      } catch (toolError) {
        nextMessages.push({
          role: "tool",
          toolCallId: call.id,
          content: `执行失败：${toolError instanceof Error ? toolError.message : String(toolError)}`,
        });
      }
    }
    return nextMessages;
  }

  return {
    conversations: [],
    activeConversationId: null,
    messages: [],
    streamingContent: null,
    loading: false,
    error: null,
    pendingActions: [],
    rounds: 0,

    async loadConversations() {
      const conversations = await getAdapters().ai.listConversations();
      set({ conversations });
    },

    async newConversation() {
      set({
        activeConversationId: null,
        messages: [],
        streamingContent: null,
        pendingActions: [],
        loading: false,
        error: null,
        rounds: 0,
      });
    },

    async openConversation(id) {
      if (get().loading) {
        return;
      }
      const conversation = await getAdapters().ai.getConversation(id);
      if (!conversation) {
        return;
      }
      set({
        activeConversationId: id,
        messages: conversation.messages,
        streamingContent: null,
        pendingActions: [],
        loading: false,
        error: null,
        rounds: 0,
      });
    },

    async renameConversation(id, title) {
      const existing = await getAdapters().ai.getConversation(id);
      if (!existing) {
        return;
      }
      const saved = await getAdapters().ai.saveConversation({
        ...existing,
        title: title.trim() || "新对话",
      });
      set((state) => ({
        conversations: upsertSummary(state.conversations, saved),
      }));
    },

    async deleteConversation(id) {
      await getAdapters().ai.deleteConversation(id);
      set((state) => ({
        conversations: state.conversations.filter((item) => item.id !== id),
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        messages: state.activeConversationId === id ? [] : state.messages,
        streamingContent: state.activeConversationId === id ? null : state.streamingContent,
        pendingActions: state.activeConversationId === id ? [] : state.pendingActions,
      }));
    },

    async retry() {
      const { messages, loading, rounds } = get();
      if (loading || messages.length === 0) {
        return;
      }
      set({ error: null, loading: true, pendingActions: [], streamingContent: null });
      await runChat(messages, rounds);
    },

    async sendMessage(text) {
      const content = text.trim();
      if (!content || get().loading) {
        return;
      }
      let activeId = get().activeConversationId;
      let messages = get().messages;
      if (!activeId) {
        const settings = useSettingsStore.getState().settings;
        const conversation = await getAdapters().ai.createConversation(
          settings?.aiProvider ?? "off",
          settings?.aiModel ?? "",
        );
        activeId = conversation.id;
        messages = [];
        set((state) => ({
          activeConversationId: activeId,
          conversations: upsertSummary(state.conversations, conversation),
        }));
      }
      const userMessage: AiChatMessage = { role: "user", content };
      const nextMessages = [...messages, userMessage];
      set({
        messages: nextMessages,
        loading: true,
        error: null,
        pendingActions: [],
        streamingContent: null,
        activeConversationId: activeId,
      });
      await persistActive(nextMessages);
      await runChat(nextMessages, 0);
    },

    async confirmAction(id, allow) {
      const pending = get().pendingActions.find((action) => action.id === id);
      if (!pending) {
        return;
      }
      const remaining = get().pendingActions.filter((action) => action.id !== id);
      let messages = [...get().messages];
      if (allow) {
        messages = await executeToolCalls(messages, [pending.toolCall], true);
      } else {
        messages.push({
          role: "tool",
          toolCallId: pending.toolCall.id,
          content: "用户拒绝执行该操作",
        });
      }
      set({
        messages,
        streamingContent: null,
        pendingActions: remaining,
        loading: remaining.length > 0,
      });
      await persistActive(messages);
      if (remaining.length === 0) {
        await runChat(messages, get().rounds + 1);
      }
    },

    async clearConversation() {
      set({ messages: [], pendingActions: [], loading: false, rounds: 0, streamingContent: null });
      await persistActive([]);
    },
  };
});
