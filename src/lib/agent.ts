import "server-only";

import { parseRelativeFollowUpPhrase } from "@/lib/automation-templates";
import {
  addCrmNote,
  addAuditLog,
  createAutomationFromTemplate,
  createFollowUpTask,
  createGeneratedApproval,
  createGeneratedAutomation,
  createLeadRecord,
  createScheduledTaskDraft,
  findCrmMatches,
  findPrimaryLeadForWorkspace,
  getAutomationTemplates,
  getOverdueFollowUps,
  scheduleLeadFollowUp,
  summarizeRecentCrmActivity,
  updateLeadStatus,
  workspaceById,
} from "@/lib/repository";
import { generateAgentDecision } from "@/lib/services/openai";
import { type AgentResult, type Lead } from "@/lib/types";

async function currentLeadForWorkspace(workspaceId: string): Promise<Lead | null> {
  return findPrimaryLeadForWorkspace(workspaceId);
}

async function buildHeuristicResult(
  workspaceId: string,
  messageText: string,
): Promise<AgentResult> {
  const lower = messageText.toLowerCase();
  const lead = await currentLeadForWorkspace(workspaceId);
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
        leadId: lead?.id ?? "",
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
        leadId: lead?.id ?? "",
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
    const template = getAutomationTemplates().find(
      (entry) => entry.key === "missed_call_follow_up",
    );
    draftAutomation = createGeneratedAutomation(
      workspaceId,
      template?.name ?? "Missed call workflow",
      template?.trigger ?? "Missed call received",
      template?.actions ?? [
        "Send SMS within 2 minutes",
        "Create or update lead in CRM",
        "Notify workspace owner",
        "Schedule follow-up task for next business day",
      ],
      {
        description: template?.description,
        templateKey: template?.key,
      },
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
    const task = await createScheduledTaskDraft(
      workspaceId,
      "Weekday morning CRM summary",
      "Every weekday, 09:00",
    );
    actionCards.push({
      id: task.id,
      kind: "task",
      title: task.title,
      description: task.dueLabel,
    });
    message =
      "I drafted the scheduled CRM summary task for the automation runner.";
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

async function handleCrmToolIntent(
  workspaceId: string,
  messageText: string,
): Promise<AgentResult | null> {
  const lower = messageText.toLowerCase();

  const followUpRequest = parseRelativeFollowUpPhrase(messageText);
  if (followUpRequest) {
    const matches = await findCrmMatches(workspaceId, followUpRequest.targetName);
    const lead = matches.leads[0] ?? (await findPrimaryLeadForWorkspace(workspaceId));
    if (!lead) {
      return {
        message: "I could not find a matching lead to schedule that follow-up.",
        actionCards: [],
      };
    }
    const { job } = await scheduleLeadFollowUp({
      workspaceId,
      leadId: lead.id,
      dueAt: followUpRequest.dueAt.toISOString(),
      title: `Follow up ${lead.name}`,
      description: `Scheduled by AEGIS from chat: ${messageText}`,
    });
    return {
      message: `Follow-up scheduled for ${lead.name} on ${followUpRequest.dueLabel}.`,
      actionCards: [
        {
          id: job.id,
          kind: "task",
          title: job.name,
          description: job.nextRunAt ?? followUpRequest.dueLabel,
        },
      ],
    };
  }

  if (lower.includes("every morning summarize my leads")) {
    const { automation, job } = await createAutomationFromTemplate({
      workspaceId,
      templateKey: "daily_crm_summary",
      enabled: true,
    });
    return {
      message: "Daily CRM summary automation is active and will run every morning.",
      actionCards: [
        {
          id: automation.id,
          kind: "automation",
          title: automation.name,
          description: job.schedule,
        },
      ],
    };
  }

  if (
    lower.includes("create a missed-call follow-up automation") ||
    lower.includes("create a missed call follow-up automation")
  ) {
    const { automation, job } = await createAutomationFromTemplate({
      workspaceId,
      templateKey: "missed_call_follow_up",
      enabled: false,
    });
    return {
      message:
        "I created the missed-call follow-up automation as a draft so you can enable it when ready.",
      actionCards: [
        {
          id: automation.id,
          kind: "automation",
          title: automation.name,
          description: job.schedule,
        },
      ],
    };
  }

  if (lower.includes("show overdue follow-ups")) {
    const overdue = await getOverdueFollowUps(workspaceId);
    if (overdue.length === 0) {
      return {
        message: "You have no overdue lead follow-ups right now.",
        actionCards: [],
      };
    }
    return {
      message: `You have ${overdue.length} overdue follow-ups: ${overdue
        .slice(0, 3)
        .map((lead) => lead.name)
        .join(", ")}.`,
      actionCards: overdue.slice(0, 3).map((lead) => ({
        id: lead.id,
        kind: "task",
        title: `Overdue follow-up: ${lead.name}`,
        description: lead.nextFollowUpAt,
      })),
    };
  }

  if (lower.includes("summarize crm") || lower.includes("summarise crm")) {
    const summary = await summarizeRecentCrmActivity(workspaceId);
    return {
      message: summary,
      actionCards: [
        {
          id: "crm_summary",
          kind: "note",
          title: "CRM summary ready",
          description: "Recent CRM activity has been summarized.",
        },
      ],
    };
  }

  if (lower.startsWith("find ") || lower.startsWith("search ")) {
    const query = messageText.replace(/^(find|search)\s+/i, "").trim();
    const matches = await findCrmMatches(workspaceId, query);
    return {
      message: `Found ${matches.contacts.length} contacts and ${matches.leads.length} leads for "${query}".`,
      actionCards: [
        {
          id: "crm_search",
          kind: "note",
          title: "CRM search",
          description: `${matches.contacts.length} contacts, ${matches.leads.length} leads`,
        },
      ],
    };
  }

  if (lower.startsWith("create lead")) {
    const lead = await createLeadRecord({
      workspaceId,
      name: "New Lead",
      phone: "+44 7000 000000",
      email: "pending@example.com",
      source: "AEGIS chat",
      status: "New lead",
    });
    return {
      message: `${lead.name} was added to CRM and is ready for follow-up.`,
      actionCards: [
        {
          id: lead.id,
          kind: "note",
          title: "Lead created",
          description: lead.name,
        },
      ],
    };
  }

  if (lower.includes("update lead status")) {
    const lead = await findPrimaryLeadForWorkspace(workspaceId);
    if (!lead) {
      return null;
    }
    const updated = await updateLeadStatus({
      workspaceId,
      leadId: lead.id,
      status: "Follow-up scheduled",
    });
    return {
      message: `${updated.name} is now marked as ${updated.stage}.`,
      actionCards: [
        {
          id: updated.id,
          kind: "note",
          title: "Lead updated",
          description: updated.stage,
        },
      ],
    };
  }

  if (lower.startsWith("add note")) {
    const lead = await findPrimaryLeadForWorkspace(workspaceId);
    if (!lead) {
      return null;
    }
    const content = messageText.replace(/^add note\s*/i, "").trim() || "Follow-up note added from chat.";
    await addCrmNote({
      workspaceId,
      leadId: lead.id,
      contactId: lead.contactId,
      content,
    });
    return {
      message: `Note saved against ${lead.name}.`,
      actionCards: [
        {
          id: `note_${lead.id}`,
          kind: "note",
          title: "Note added",
          description: content,
        },
      ],
    };
  }

  if (lower.startsWith("create task") || lower.includes("follow-up task")) {
    const lead = await findPrimaryLeadForWorkspace(workspaceId);
    if (!lead) {
      return null;
    }
    const task = await createFollowUpTask({
      workspaceId,
      title: `Follow up ${lead.name}`,
      description: "Follow-up task created from AEGIS chat.",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      leadId: lead.id,
      contactId: lead.contactId,
    });
    return {
      message: `Follow-up task created for ${lead.name}.`,
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

  return null;
}

function mapDecisionToResult(
  workspaceId: string,
  messageText: string,
  decision: Awaited<ReturnType<typeof generateAgentDecision>>,
): Promise<AgentResult> {
  if (!decision) {
    return buildHeuristicResult(workspaceId, messageText);
  }

  if (decision.intent === "send_sms" || decision.intent === "make_call") {
    return currentLeadForWorkspace(workspaceId).then((lead) => ({
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
        decision.intent === "send_sms" ? "send_sms" : "make_call",
        {
          phone: lead?.phone ?? "",
          leadId: lead?.id ?? "",
        },
      ),
    }));
  }

  if (decision.intent === "create_automation") {
    return Promise.resolve({
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
    });
  }

  if (decision.intent === "schedule_task") {
    return createScheduledTaskDraft(
      workspaceId,
      decision.taskTitle ?? "Scheduled AEGIS task",
      decision.taskDueLabel ?? "Scheduled soon",
    ).then((task) => ({
      message: decision.reply,
      actionCards: [
        {
          id: task.id,
          kind: "task",
          title: task.title,
          description: task.dueLabel,
        },
      ],
    }));
  }

  return Promise.resolve({
    message: decision.reply,
    actionCards: [
      {
        id: "action_note",
        kind: "note",
        title: "AEGIS reply ready",
        description: "Server-side OpenAI response generated for the active workspace.",
      },
    ],
  });
}

export async function runAegisAgent(input: {
  workspaceId: string;
  userId: string;
  message: string;
}) {
  const workspace = await workspaceById(input.workspaceId);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const crmToolResult = await handleCrmToolIntent(workspace.id, input.message);
  if (crmToolResult) {
    await addAuditLog({
      workspaceId: workspace.id,
      userId: input.userId,
      action: "agent_crm_tool",
      input: input.message,
      output: crmToolResult.message,
      approvalStatus: crmToolResult.pendingApproval ? "pending" : "not_required",
    });
    return crmToolResult;
  }

  const decision = await generateAgentDecision({
    workspace,
    message: input.message,
  });
  const result = await mapDecisionToResult(workspace.id, input.message, decision);

  await addAuditLog({
    workspaceId: workspace.id,
    userId: input.userId,
    action: "agent_chat",
    input: input.message,
    output: result.message,
    approvalStatus: result.pendingApproval ? "pending" : "not_required",
  });

  return result satisfies AgentResult;
}
