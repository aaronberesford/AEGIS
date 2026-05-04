import "server-only";

export type AutomationTemplate = {
  key:
    | "missed_call_follow_up"
    | "no_reply_after_2_days"
    | "daily_crm_summary"
    | "weekly_sales_summary";
  name: string;
  description: string;
  trigger: string;
  actions: string[];
  taskType: string;
  requiresApproval: boolean;
  defaultSchedule: string;
  recurrence: "event" | "daily" | "weekly";
};

export const automationTemplates: AutomationTemplate[] = [
  {
    key: "missed_call_follow_up",
    name: "Missed call follow-up",
    description: "Draft an SMS, create a follow-up task, and notify the workspace owner.",
    trigger: "Missed call received",
    actions: [
      "Draft missed-call SMS for approval",
      "Create follow-up task",
      "Notify workspace owner",
    ],
    taskType: "missed_call_follow_up",
    requiresApproval: true,
    defaultSchedule: "Event-driven",
    recurrence: "event",
  },
  {
    key: "no_reply_after_2_days",
    name: "No reply after 2 days",
    description: "Draft a check-in message when a lead has gone quiet for two days.",
    trigger: "Lead has no reply after 2 days",
    actions: [
      "Draft follow-up SMS for approval",
      "Create reminder task",
      "Log activity",
    ],
    taskType: "no_reply_follow_up",
    requiresApproval: true,
    defaultSchedule: "Every day, 09:00",
    recurrence: "daily",
  },
  {
    key: "daily_crm_summary",
    name: "Daily CRM summary",
    description: "Summarise open leads and follow-ups every morning.",
    trigger: "Every morning",
    actions: ["Summarise open leads", "Highlight overdue follow-ups"],
    taskType: "daily_crm_summary",
    requiresApproval: false,
    defaultSchedule: "Every day, 09:00",
    recurrence: "daily",
  },
  {
    key: "weekly_sales_summary",
    name: "Weekly sales summary",
    description: "Roll up pipeline movement and follow-up risk once a week.",
    trigger: "Every Monday morning",
    actions: ["Summarise pipeline movement", "Highlight stale leads"],
    taskType: "weekly_sales_summary",
    requiresApproval: false,
    defaultSchedule: "Every Monday, 08:00",
    recurrence: "weekly",
  },
];

export function getAutomationTemplate(templateKey: string) {
  return automationTemplates.find((template) => template.key === templateKey) ?? null;
}

export function formatDateLabel(date: Date) {
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parseRelativeFollowUpPhrase(messageText: string) {
  const lower = messageText.toLowerCase();

  if (!lower.includes("follow up")) {
    return null;
  }

  let dueAt: Date | null = null;
  if (lower.includes("tomorrow")) {
    dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else if (lower.includes("in 2 days") || lower.includes("2 days")) {
    dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  } else if (lower.includes("next week")) {
    dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  if (!dueAt) {
    return null;
  }

  dueAt.setHours(9, 0, 0, 0);
  const nameMatch = messageText.match(/follow up\s+(.+?)\s+(tomorrow|in 2 days|next week)/i);

  return {
    dueAt,
    dueLabel: formatDateLabel(dueAt),
    targetName: nameMatch?.[1]?.trim() ?? "",
  };
}

export function nextRunForRecurrence(recurrence: AutomationTemplate["recurrence"]) {
  const now = new Date();

  if (recurrence === "daily") {
    const next = new Date(now);
    next.setHours(9, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (recurrence === "weekly") {
    const next = new Date(now);
    next.setHours(8, 0, 0, 0);
    const day = next.getDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    next.setDate(next.getDate() + daysUntilMonday);
    return next;
  }

  return null;
}
