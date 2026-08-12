import { z } from "zod";
import type { TaskCreateInput } from "@task-manager/domain";
import {
  REPEAT_FREQUENCIES,
  RESOURCE_KINDS,
  RESOURCE_STATUSES,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@task-manager/domain";

const taskResourceSchema = z.object({
  name: z.string().trim().min(1, "工具/资源名称不能为空").max(100, "工具/资源名称不能超过 100 字"),
  kind: z.enum(RESOURCE_KINDS).default("tool"),
  quantity: z.string().max(50, "数量不能超过 50 字").default(""),
  unit: z.string().max(20, "单位不能超过 20 字").default(""),
  status: z.enum(RESOURCE_STATUSES).default("pending"),
  notes: z.string().max(500, "备注不能超过 500 字").default(""),
  sortOrder: z.number().default(0),
});

export const taskCreateSchema: z.ZodType<TaskCreateInput> = z.object({
  title: z.string().trim().min(1, "任务标题不能为空").max(200, "任务标题不能超过 200 字"),
  notes: z.string().max(10000, "备注不能超过 10000 字").optional().nullable(),
  dueAt: z.string().optional().nullable(),
  repeatFrequency: z.enum(REPEAT_FREQUENCIES).default("none"),
  repeatInterval: z.number().int().min(1).default(1),
  repeatEndsAt: z.string().optional().nullable(),
  assignee: z.string().max(80, "负责人不能超过 80 字").optional().nullable(),
  department: z.string().max(80, "部门不能超过 80 字").optional().nullable(),
  startAt: z.string().optional().nullable(),
  doneCriteria: z.string().max(1000, "完成标准不能超过 1000 字").optional().nullable(),
  budget: z.string().max(50, "预算不能超过 50 字").optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).default("none"),
  status: z.enum(TASK_STATUSES).default("todo"),
  projectId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  parentId: z.string().optional().nullable(),
  taskKind: z.enum(TASK_KINDS).default("main"),
  resources: z.array(taskResourceSchema).optional(),
  children: z.array(z.lazy(() => taskCreateSchema)).optional(),
  sortOrder: z.number().optional(),
});

export const taskUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "任务标题不能为空")
    .max(200, "任务标题不能超过 200 字")
    .optional(),
  notes: z.string().max(10000, "备注不能超过 10000 字").optional().nullable(),
  dueAt: z.string().optional().nullable(),
  repeatFrequency: z.enum(REPEAT_FREQUENCIES).optional(),
  repeatInterval: z.number().int().min(1).optional(),
  repeatEndsAt: z.string().optional().nullable(),
  assignee: z.string().max(80, "负责人不能超过 80 字").optional().nullable(),
  department: z.string().max(80, "部门不能超过 80 字").optional().nullable(),
  startAt: z.string().optional().nullable(),
  doneCriteria: z.string().max(1000, "完成标准不能超过 1000 字").optional().nullable(),
  budget: z.string().max(50, "预算不能超过 50 字").optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  projectId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  parentId: z.string().optional().nullable(),
  taskKind: z.enum(TASK_KINDS).optional(),
  resources: z.array(taskResourceSchema).optional(),
  sortOrder: z.number().optional(),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "项目名称不能为空").max(80, "项目名称不能超过 80 字"),
  color: z.string().optional().nullable(),
});

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1, "标签名称不能为空").max(40, "标签名称不能超过 40 字"),
  color: z.string().optional().nullable(),
});
