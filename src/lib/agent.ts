import "server-only";

import {
  addActivity,
  addAuditLog,
  createGeneratedApproval,
  createGeneratedAutomation,
  createGeneratedTask,
  getSnapshot,
  workspaceById,
} from "@/lib/demo-store";
import { generateAgentDecision } from "@/lib/services/openai";
import { type AgentResult, type Lead } from "@/lib/types";

function currentLeadForWorkspace(workspaceId: string): Lead | null {
  return (
    getSnapshot().leads.find(
      (lead) => lead.workspaceId === workspaceId && !lead.optOut,
    ) ?? null
  );
}

function buildHeuristicResult(
  workspaceId: string,
  messageText: string,
): AgentResult {
  const lower = messageText.toLowerCase();
  const lead = currentLeadForWorkspace(workspaceId);
  const actionCards: AgentResult["actionCards"] = [];
  let pendingApproval: AgentResult["pendingApproval"];
  let draftAutomation: AgentResult["draftAutomation"];
  let message =
    "I can prepare approvals, schedule tasks, and summarise the workspace. Tell me what you want me to handle.";

  if (lower.includes("call")) {
    pendingApproval = createGeneratedApproval(
      workspaceId,
      "Call selected lead",
      lead?.name ?? "Selected lead",
      "Follow up on the outstanding quote and offer a site survey.",
      "Voice outreach requested in chat.",
      "medium",
      "make_call",
      {
        phone: lead?.phone ?? "",
      },
    );
    actionCards.push({
      id: "action_call",
      kind: "approval",
      title: "Approval required before call",
      description: "AEGIS prepared an outbound sales call with business-hour gating.",
    });
    message =
      "I prepared a call approval with the follow-up script and business-hour guardrails.";
  } else if (lower.includes("sms") || lower.includes("text")) {
    pendingApproval = createGeneratedApproval(
      workspaceId,
      "Send SMS follow-up",
      lead?.name ?? "Selected lead",
      `Hi ${lead?.name?.split(" ")[0] ?? "there"}, just checking whether you want to book the site visit this week.`,
      "Outbound SMS requested in chat.",
      "medium",
      "send_sms",
      {
        phone: lead?.phone ?? "",
      },
    );
    actionCards.push({
      id: "action_sms",
      kind: "approval",
      title: "SMS draft ready",
      description: "Recipient, copy and reason are ready for approval.",
    });
    message =
      "The SMS draft is ready and waiting for approval before anything is sent.";
  } else if (lower.includes("automation") || lower.includes("missed call")) {
    draftAutomation = createGeneratedAutomation(
      workspaceId,
      "Missed call workflow",
      "Missed call received",
      [
        "Send SMS within 2 minutes",
        "Create or update lead in CRM",
        "Notify workspace owner",
        "Schedule follow-up task for next business day",
      ],
    );
    actionCards.push({
      id: "action_auto",
      kind: "automation",
      title: "Automation draft created",
      description: "Review the trigger and actions before activating it.",
    });
    message =
      "I drafted the missed-call automation and kept it disabled until you approve the workflow.";
  } else if (lower.includes("schedule") || lower.includes("weekday")) {
    const task = createGeneratedTask(
      workspaceId,
      "Weekday morning email summary",
      "Every weekday, 09:00",
      "scheduled",
    );
    addActivity({
      id: `activity_${Date.now()}`,
      workspaceId,
      icon: "calendar",
      title: "Scheduled task drafted",
      subtitle: task.title,
      timeLabel: "Just now",
    });
    actionCards.push({
      id: task.id,
      kind: "task",
      title: task.title,
      description: task.dueLabel,
    });
    message =
      "I drafted the scheduled task so you can wire it into the cron runner once the database is connected.";
  } else {
    actionCards.push({
      id: "action_note",
      kind: "note",
      title: "AEGIS reply ready",
      description: "Demo-safe fallback reply generated for the active workspace.",
    });
  }

  return {
    message,
    actionCards,
    pendingApproval,
    draftAutomation,
  };
}

function mapDecisionToResult(
  workspaceId: string,
  messageText: string,
  decision: Awaited<ReturnType<typeof generateAgentDecision>>,
): AgentResult {
  if (!decision) {
    return buildHeuristicResult(workspaceId, messageText);
  }

  if (decision.intent === "send_sms" || decision.intent === "make_call") {
    const lead = currentLeadForWorkspace(workspaceId);
    return {
      message: decision.reply,
      actionCards: [
        {
          id: `action_${decision.intent}`,
          kind: "approval",
          title:
            decision.intent === "send_sms"
              ? "SMS draft ready"
              : "Call approval ready",
          description: "Review the recipient, message and reason before approval.",
        },
      ],
      pendingApproval: createGeneratedApproval(
        workspaceId,
        decision.approvalTitle ??
          (decision.intent === "send_sms" ? "Send SMS follow-up" : "Call selected lead"),
        decision.recipient ?? lead?.name ?? "Selected lead",
        decision.message ??
          (decision.intent === "send_sms"
            ? "Checking in on the quote and next steps."
            : "Follow up on the quote and offer the next step."),
        decision.reason ?? "Prepared from your latest AEGIS request.",
        decision.risk ?? "medium",
        decision.intent,
        {
          phone: lead?.phone ?? "",
        },
      ),
    };
  }

  if (decision.intent === "create_automation") {
    return {
      message: decision.reply,
      actionCards: [
        {
          id: "action_auto",
          kind: "automation",
          title: "Automation draft created",
          description: "Review the trigger and actions before activating it.",
        },
      ],
      draftAutomation: createGeneratedAutomation(
        workspaceId,
        decision.automationName ?? "New automation",
        decision.automationTrigger ?? "Manual trigger",
        decision.automationActions ?? ["Notify user"],
      ),
    };
  }

  if (decision.intent === "schedule_task") {
    const task = createGeneratedTask(
      workspaceId,
      decision.taskTitle ?? "Scheduled AEGIS task",
      decision.taskDueLabel ?? "Scheduled soon",
      "scheduled",
    );
    addActivity({
      id: `activity_${Date.now()}`,
      workspaceId,
      icon: "calendar",
      title: "Scheduled task drafted",
      subtitle: task.title,
      timeLabel: "Just now",
    });
    return {
      message: decision.reply,
      actionCards: [
        {
          id: task.id,
          kind: "task",
          title: task.title,
          description: task.dueLabel,
        },
      ],
    };
  }

  return {
    message: decision.reply,
    actionCards: [
      {
        id: "action_note",
        kind: "note",
        title: "AEGIS reply ready",
        description: "Server-side OpenAI response generated for the active workspace.",
      },
    ],
  };
}

export async function runAegisAgent(input: {
  workspaceId: string;
  userId: string;
  message: string;
}) {
  const workspace = workspaceById(input.workspaceId);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const decision = await generateAgentDecision({
    workspace,
    message: input.message,
  });
  const result = mapDecisionToResult(workspace.id, input.message, decision);

  addAuditLog({
    workspaceId: workspace.id,
    userId: input.userId,
    action: "agent_chat",
    input: input.message,
    output: result.message,
    approvalStatus: result.pendingApproval ? "pending" : "not_required",
  });

  return result satisfies AgentResult;
}
