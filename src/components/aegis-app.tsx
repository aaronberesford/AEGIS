"use client";

import { startTransition, useMemo, useRef, useState } from "react";

import { type Approval, type Lead, type Snapshot } from "@/lib/types";
import { cn, formatRiskTone } from "@/lib/utils";

type ScreenKey =
  | "home"
  | "conversations"
  | "tasks"
  | "crm"
  | "calls"
  | "messages"
  | "automations"
  | "approvals"
  | "settings"
  | "more";

type IntegrationState = {
  openai?: { status: "idle" | "loading" | "success" | "error"; detail?: string };
  twilio?: { status: "idle" | "loading" | "success" | "error"; detail?: string };
};

type ApprovalEditState = {
  id: string;
  recipient: string;
  phone: string;
  message: string;
  reason: string;
};

const screenTitles: Record<ScreenKey, string> = {
  home: "Ask AEGIS",
  conversations: "Conversations",
  tasks: "Tasks",
  crm: "CRM",
  calls: "Calls",
  messages: "Messages",
  automations: "Automations",
  approvals: "Approvals",
  settings: "Settings",
  more: "More",
};

export function AegisApp({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [screen, setScreen] = useState<ScreenKey>("home");
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "thinking">(
    "idle",
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastInfo, setLastInfo] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [integrationState, setIntegrationState] = useState<IntegrationState>({});
  const [editingApproval, setEditingApproval] = useState<ApprovalEditState | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [crmNote, setCrmNote] = useState("");
  const [crmTaskTitle, setCrmTaskTitle] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentWorkspace =
    snapshot.workspaces.find(
      (workspace) => workspace.id === snapshot.currentWorkspaceId,
    ) ?? snapshot.workspaces[0];
  const currentConversation =
    snapshot.conversations.find(
      (conversation) => conversation.workspaceId === currentWorkspace.id,
    ) ?? snapshot.conversations[0];
  const workspaceApprovals = snapshot.approvals.filter(
    (approval) =>
      approval.workspaceId === currentWorkspace.id && approval.status === "pending",
  );
  const workspaceActivities = snapshot.activities.filter(
    (activity) => activity.workspaceId === currentWorkspace.id,
  );
  const workspaceTasks = snapshot.tasks.filter(
    (task) => task.workspaceId === currentWorkspace.id,
  );
  const workspaceLeads = snapshot.leads.filter(
    (lead) => lead.workspaceId === currentWorkspace.id,
  );
  const workspaceContacts = snapshot.contacts.filter(
    (contact) => contact.workspaceId === currentWorkspace.id,
  );
  const workspaceCrmTimeline = snapshot.crmTimeline.filter(
    (item) => item.workspaceId === currentWorkspace.id,
  );
  const workspaceAutomations = snapshot.automations.filter(
    (automation) => automation.workspaceId === currentWorkspace.id,
  );
  const selectedLead =
    workspaceLeads.find((lead) => lead.id === selectedLeadId) ?? workspaceLeads[0] ?? null;

  const quickActions = useMemo(
    () => [
      {
        label: "Call a lead",
        color: "text-[#3ce67b]",
        prompt: "Call this lead and follow up on their quote.",
      },
      {
        label: "Send follow up",
        color: "text-[#5f89ff]",
        prompt: "Send an SMS follow-up to the latest lead.",
      },
      {
        label: "Check schedule",
        color: "text-[#f5b749]",
        prompt: "Every weekday at 9am, summarize important emails.",
      },
      {
        label: "More",
        color: "text-[var(--text-secondary)]",
        prompt: "Create an automation for missed calls.",
      },
    ],
    [],
  );

  async function refreshState() {
    const response = await fetch("/api/state", { cache: "no-store" });
    const nextSnapshot = (await response.json()) as Snapshot;
    setSnapshot(nextSnapshot);
  }

  async function readJson<T>(response: Response) {
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed");
    }
    return payload;
  }

  async function playAudio(audioBase64?: string | null, mimeType?: string | null) {
    if (!audioBase64 || !mimeType) {
      return;
    }

    const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
    await audio.play();
  }

  async function sendMessage(content: string) {
    if (!content.trim()) {
      return;
    }

    setBusy(true);
    setLastError(null);
    setLastInfo(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          userId: snapshot.user.id,
          message: content.trim(),
        }),
      });

      const payload = await readJson<{
        assistantMessage: string;
      }>(response);

      setComposer("");
      setLastTranscript(content.trim());
      setLastInfo(payload.assistantMessage);
      await refreshState();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Unable to contact AEGIS.");
    } finally {
      setBusy(false);
      setVoiceState("idle");
    }
  }

  async function beginVoice() {
    if (!navigator.mediaDevices?.getUserMedia || voiceState !== "idle") {
      return;
    }

    setLastError(null);
    setLastInfo(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setVoiceState("thinking");

        try {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", audioBlob, "voice.webm");
          formData.append("workspaceId", currentWorkspace.id);
          formData.append("userId", snapshot.user.id);

          const response = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });

          const payload = await readJson<{
            transcript: string;
            assistantMessage: string;
            audioBase64?: string | null;
            mimeType?: string | null;
          }>(response);

          setLastTranscript(payload.transcript);
          setLastInfo(payload.assistantMessage);
          await refreshState();
          await playAudio(payload.audioBase64, payload.mimeType);
        } catch (error) {
          setLastError(
            error instanceof Error ? error.message : "Voice request failed.",
          );
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          setBusy(false);
          setVoiceState("idle");
        }
      };

      recorder.start();
      setBusy(true);
      setVoiceState("recording");
    } catch (error) {
      setLastError(
        error instanceof Error ? error.message : "Microphone access was not granted.",
      );
      setVoiceState("idle");
    }
  }

  function stopVoice() {
    recorderRef.current?.stop();
  }

  async function switchWorkspace(workspaceId: string) {
    setLastError(null);

    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspaceId }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setLastError(payload.error ?? "Unable to switch workspace.");
      return;
    }

    startTransition(() => {
      void refreshState();
    });
  }

  async function decideApproval(
    id: string,
    decision: "approved" | "cancelled",
  ) {
    setBusy(true);
    setLastError(null);
    setLastInfo(null);

    try {
      const response = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
      });

      const payload = await readJson<{ approval?: Approval } & { execution?: unknown }>(
        response,
      );

      setLastInfo(
        decision === "approved"
          ? "Approval executed successfully."
          : "Approval was cancelled.",
      );
      setEditingApproval(null);
      await refreshState();
      if (payload.approval?.type === "make_call") {
        setScreen("calls");
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Approval failed.");
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function saveApprovalEdit() {
    if (!editingApproval) {
      return;
    }

    setBusy(true);
    setLastError(null);

    try {
      const response = await fetch(`/api/approvals/${editingApproval.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "edit",
          recipient: editingApproval.recipient,
          phone: editingApproval.phone,
          message: editingApproval.message,
          reason: editingApproval.reason,
        }),
      });

      await readJson<{ approval: Approval }>(response);
      setLastInfo("Approval draft updated.");
      setEditingApproval(null);
      await refreshState();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Unable to edit approval.");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(provider: "openai" | "twilio") {
    setIntegrationState((current) => ({
      ...current,
      [provider]: { status: "loading" },
    }));
    setLastError(null);

    try {
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          workspaceId: currentWorkspace.id,
        }),
      });

      const payload = await readJson<{ detail: string }>(response);

      setIntegrationState((current) => ({
        ...current,
        [provider]: { status: "success", detail: payload.detail },
      }));
      setLastInfo(payload.detail);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection test failed.";
      setIntegrationState((current) => ({
        ...current,
        [provider]: { status: "error", detail: message },
      }));
      setLastError(message);
    }
  }

  function startEditingApproval(approval: Approval) {
    setEditingApproval({
      id: approval.id,
      recipient: approval.recipient,
      phone: approval.metadata?.phone ?? "",
      message: approval.message,
      reason: approval.reason,
    });
  }

  async function addLeadNote() {
    if (!selectedLead || !crmNote.trim()) {
      return;
    }

    setBusy(true);
    setLastError(null);
    try {
      const response = await fetch("/api/crm/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          leadId: selectedLead.id,
          contactId: selectedLead.contactId,
          content: crmNote.trim(),
        }),
      });
      await readJson<{ ok: boolean }>(response);
      setCrmNote("");
      setLastInfo("CRM note added.");
      await refreshState();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Unable to add note.");
    } finally {
      setBusy(false);
    }
  }

  async function createLeadTask() {
    if (!selectedLead || !crmTaskTitle.trim()) {
      return;
    }

    setBusy(true);
    setLastError(null);
    try {
      const response = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          title: crmTaskTitle.trim(),
          description: `Follow-up task for ${selectedLead.name}.`,
          leadId: selectedLead.id,
          contactId: selectedLead.contactId,
        }),
      });
      await readJson<{ task: unknown }>(response);
      setCrmTaskTitle("");
      setLastInfo("Follow-up task created.");
      await refreshState();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Unable to create task.");
    } finally {
      setBusy(false);
    }
  }

  async function summarizeCrm() {
    setBusy(true);
    setLastError(null);
    try {
      const response = await fetch(
        `/api/crm/summary?workspaceId=${encodeURIComponent(currentWorkspace.id)}`,
      );
      const payload = await readJson<{ summary: string }>(response);
      setLastInfo(payload.summary);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Unable to summarize CRM.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-6xl items-start justify-center gap-10">
        <section className="hidden w-[280px] flex-col gap-6 lg:flex">
          <div className="glass-panel rounded-[28px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
              Workspace control
            </p>
            <div className="mt-4 space-y-3">
              {snapshot.workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => void switchWorkspace(workspace.id)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-4 text-left transition",
                    workspace.id === currentWorkspace.id
                      ? "border-[rgba(143,100,255,0.55)] bg-[rgba(109,76,255,0.18)]"
                      : "border-white/8 bg-white/3 hover:border-white/16",
                  )}
                >
                  <p className="text-sm font-semibold text-white">{workspace.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {workspace.industry}
                  </p>
                </button>
              ))}
            </div>
          </div>
          <div className="glass-panel rounded-[28px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
              Phase 2 status
            </p>
            <ul className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <li>OpenAI voice and agent calls stay on the server.</li>
              <li>Twilio actions execute only after approval.</li>
              <li>Demo mode still works without live credentials.</li>
            </ul>
          </div>
        </section>

        <section className="screen-fade w-full max-w-[430px] rounded-[42px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,14,27,0.98),rgba(4,6,13,0.98))] p-3 shadow-[0_40px_120px_rgba(0,0,0,0.55)] sm:p-4">
          <div className="relative overflow-hidden rounded-[34px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(74,43,161,0.22),transparent_30%),linear-gradient(180deg,#090b16_0%,#05070e_100%)] pb-6">
            <div className="px-6 pt-4">
              <div className="flex items-center justify-between text-white">
                <span className="text-2xl font-semibold tracking-tight">9:41</span>
                <div className="flex h-8 items-center gap-1 rounded-full bg-black/50 px-5">
                  <span className="h-2 w-2 rounded-full bg-[#0d5eff]" />
                  <span className="h-2 w-2 rounded-full bg-[#09184a]" />
                </div>
                <div className="text-sm text-[var(--text-secondary)]">Live</div>
              </div>

              <div className="mt-8 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <ShieldMark />
                    <div>
                      <h1 className="text-[30px] font-bold tracking-[0.04em] text-white">
                        AEGIS
                      </h1>
                      <p className="text-xs tracking-[0.12em] text-[var(--text-secondary)]">
                        AI OPERATIONS COMMAND
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setScreen("settings")}
                    className="mt-4 rounded-full border border-[rgba(143,100,255,0.25)] bg-[rgba(124,77,255,0.12)] px-3 py-1 text-xs text-[var(--accent-soft)]"
                  >
                    {currentWorkspace.name}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <BellIcon className="h-6 w-6 text-white" />
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
                      {workspaceApprovals.length}
                    </span>
                  </div>
                  <div className="relative h-14 w-14 rounded-full border border-white/10 bg-[linear-gradient(180deg,#fde7c7,#be875c)]">
                    <div className="absolute inset-[3px] grid place-items-center rounded-full bg-[linear-gradient(180deg,#312117,#120f17)] text-sm font-semibold">
                      {snapshot.user.avatar}
                    </div>
                    <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border border-[#11141f] bg-[#22c55e]" />
                  </div>
                </div>
              </div>

              <div className="mt-10">
                <h2 className="text-[30px] font-semibold tracking-tight text-white">
                  Good morning, {snapshot.user.name}
                </h2>
                <p className="mt-2 text-[16px] text-[var(--text-secondary)]">
                  How can I help you today?
                </p>
              </div>

              {(lastError || lastInfo || lastTranscript) && (
                <div className="mt-5 space-y-2">
                  {lastError && (
                    <div className="rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[rgba(120,22,22,0.24)] px-4 py-3 text-sm text-[#ffb3b3]">
                      {lastError}
                    </div>
                  )}
                  {lastInfo && !lastError && (
                    <div className="rounded-2xl border border-[rgba(124,77,255,0.24)] bg-[rgba(70,39,142,0.22)] px-4 py-3 text-sm text-[var(--accent-soft)]">
                      {lastInfo}
                    </div>
                  )}
                  {lastTranscript && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-[var(--text-secondary)]">
                      Last transcript: {lastTranscript}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-7 rounded-[28px] border border-[rgba(122,77,255,0.35)] bg-[linear-gradient(180deg,rgba(30,18,63,0.7),rgba(8,10,22,0.92))] px-6 py-7 shadow-[0_20px_90px_rgba(80,39,181,0.22)]">
                <VoiceWave isRecording={voiceState === "recording"} />
                <div className="mt-4 flex flex-col items-center">
                  <button
                    onClick={() =>
                      voiceState === "recording"
                        ? stopVoice()
                        : void beginVoice()
                    }
                    className="aurora-orb grid h-24 w-24 place-items-center rounded-full bg-[radial-gradient(circle,#9b72ff_0%,#6e42ff_50%,#4b26d5_100%)]"
                  >
                    <MicIcon className="h-10 w-10 text-white" />
                  </button>
                  <p className="mt-5 text-[18px] font-medium text-white">
                    {voiceState === "recording" ? "Tap to stop" : "Tap to speak"}
                  </p>
                  <p className="mt-1 text-base text-[var(--accent-soft)]">
                    {voiceState === "recording"
                      ? "Listening"
                      : voiceState === "thinking"
                        ? "Transcribing and replying"
                        : "Voice-ready command center"}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {quickActions.map((action, index) => (
                  <button
                    key={action.label}
                    onClick={() => {
                      if (index === 3) {
                        setScreen("more");
                        return;
                      }
                      void sendMessage(action.prompt);
                    }}
                    className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4 text-left"
                  >
                    <span className={cn("text-xl", action.color)}>
                      {index === 0 ? "C" : index === 1 ? "S" : index === 2 ? "T" : "M"}
                    </span>
                    <span className="text-sm font-medium text-white">{action.label}</span>
                  </button>
                ))}
              </div>

              <section className="mt-10">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[16px] font-semibold text-white">Pending Approvals</h3>
                  <button
                    onClick={() => setScreen("approvals")}
                    className="text-[15px] font-medium text-[var(--accent-soft)]"
                  >
                    See all
                  </button>
                </div>
                <div className="glass-panel rounded-[24px] p-4">
                  {workspaceApprovals.slice(0, 3).map((approval) => (
                    <article
                      key={approval.id}
                      className="border-b border-white/6 py-4 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(124,77,255,0.18)] text-base font-semibold text-white">
                            {approval.type === "make_call"
                              ? "CL"
                              : approval.type === "post_online"
                                ? "PO"
                                : "SM"}
                          </div>
                          <div>
                            <h4 className="text-[17px] font-medium text-white">
                              {approval.title}
                            </h4>
                            <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
                              {approval.message}
                            </p>
                            <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
                              {approval.scheduledFor}
                            </p>
                            {approval.lastError && (
                              <p className="mt-2 text-sm text-[#ff9b9b]">
                                {approval.lastError}
                              </p>
                            )}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-sm font-medium capitalize",
                            formatRiskTone(approval.risk),
                          )}
                        >
                          {approval.risk}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="mt-8">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[16px] font-semibold text-white">Recent Activity</h3>
                  <button
                    onClick={() => setScreen("conversations")}
                    className="text-[15px] font-medium text-[var(--accent-soft)]"
                  >
                    See all
                  </button>
                </div>
                <div className="glass-panel rounded-[24px] p-4">
                  {workspaceActivities.slice(0, 4).map((activity) => (
                    <article key={activity.id} className="flex items-start justify-between py-3">
                      <div className="flex gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.05] text-base font-semibold text-white">
                          {activity.icon.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-[17px] font-medium text-white">
                            {activity.title}
                          </h4>
                          <p className="text-[15px] text-[var(--text-secondary)]">
                            {activity.subtitle}
                          </p>
                        </div>
                      </div>
                      <span className="text-[15px] text-[var(--text-secondary)]">
                        {activity.timeLabel}
                      </span>
                    </article>
                  ))}
                </div>
              </section>

              {screen !== "home" && (
                <section className="mt-8 rounded-[24px] border border-white/8 bg-[rgba(8,11,19,0.85)] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-[16px] font-semibold text-white">
                      {screenTitles[screen]}
                    </h3>
                    <button
                      onClick={() => setScreen("home")}
                      className="text-sm text-[var(--accent-soft)]"
                    >
                      Back home
                    </button>
                  </div>

                  {screen === "conversations" && (
                    <div className="space-y-3">
                      {currentConversation.messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            "rounded-2xl px-4 py-3 text-sm",
                            message.role === "assistant"
                              ? "bg-[rgba(124,77,255,0.14)] text-white"
                              : "bg-white/[0.05] text-[var(--text-secondary)]",
                          )}
                        >
                          <p>{message.content}</p>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">
                            {message.timestamp}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {screen === "tasks" && (
                    <div className="space-y-3">
                      {workspaceTasks.map((task) => (
                        <article
                          key={task.id}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                        >
                          <h4 className="text-sm font-semibold text-white">{task.title}</h4>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {task.dueLabel}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}

                  {screen === "crm" && (
                    <div className="space-y-3">
                      <button
                        onClick={() => void summarizeCrm()}
                        className="w-full rounded-2xl border border-[rgba(124,77,255,0.25)] bg-[rgba(124,77,255,0.12)] px-4 py-3 text-left text-sm font-semibold text-white"
                      >
                        Summarize recent CRM activity
                      </button>
                      {workspaceLeads.map((lead) => (
                        <button
                          key={lead.id}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className={cn(
                            "w-full rounded-2xl border bg-white/[0.03] p-4 text-left",
                            selectedLead?.id === lead.id
                              ? "border-[rgba(124,77,255,0.35)]"
                              : "border-white/8",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white">{lead.name}</h4>
                            <span className="rounded-full bg-[rgba(124,77,255,0.12)] px-2 py-1 text-xs text-[var(--accent-soft)]">
                              {lead.stage}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {lead.company} | {lead.source}
                          </p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            {lead.phone} | {lead.email}
                          </p>
                        </button>
                      ))}
                      {selectedLead && (
                        <CrmLeadDrawer
                          lead={selectedLead}
                          contactName={
                            workspaceContacts.find(
                              (contact) => contact.id === selectedLead.contactId,
                            )?.name ?? selectedLead.name
                          }
                          timeline={workspaceCrmTimeline.filter(
                            (item) =>
                              item.leadId === selectedLead.id ||
                              item.contactId === selectedLead.contactId,
                          )}
                          crmNote={crmNote}
                          setCrmNote={setCrmNote}
                          crmTaskTitle={crmTaskTitle}
                          setCrmTaskTitle={setCrmTaskTitle}
                          onCall={() =>
                            void sendMessage(`Call ${selectedLead.name} and follow up on their quote.`)
                          }
                          onSms={() =>
                            void sendMessage(`Send an SMS follow-up to ${selectedLead.name}.`)
                          }
                          onAddNote={() => void addLeadNote()}
                          onCreateTask={() => void createLeadTask()}
                        />
                      )}
                    </div>
                  )}

                  {screen === "calls" && (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary)]">
                        Outbound calls stay blocked until approval passes and the request is inside business hours.
                      </div>
                      {workspaceApprovals
                        .filter((approval) => approval.type === "make_call")
                        .map((approval) => (
                          <article
                            key={approval.id}
                            className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                          >
                            <h4 className="text-sm font-semibold text-white">{approval.title}</h4>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {approval.message}
                            </p>
                          </article>
                        ))}
                    </div>
                  )}

                  {screen === "messages" && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary)]">
                      Twilio SMS is ready to execute through approvals, with demo-safe behavior when `DEMO_MODE=true`.
                    </div>
                  )}

                  {screen === "automations" && (
                    <div className="space-y-3">
                      {workspaceAutomations.map((automation) => (
                        <article
                          key={automation.id}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white">
                              {automation.name}
                            </h4>
                            <span className="text-xs text-[var(--accent-soft)]">
                              {automation.status}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {automation.trigger}
                          </p>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">
                            {automation.actions.join(" | ")}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}

                  {screen === "approvals" && (
                    <div className="space-y-3">
                      {workspaceApprovals.map((approval) => (
                        <article
                          key={approval.id}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-white">
                                {approval.title}
                              </h4>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                Recipient: {approval.recipient}
                              </p>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                {approval.reason}
                              </p>
                              <p className="mt-1 text-sm text-[var(--text-muted)]">
                                {approval.metadata?.phone ?? "No phone stored"}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold uppercase",
                                formatRiskTone(approval.risk),
                              )}
                            >
                              {approval.risk}
                            </span>
                          </div>
                          <p className="mt-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-white">
                            {approval.message}
                          </p>
                          {approval.lastError && (
                            <p className="mt-3 text-sm text-[#ff9b9b]">
                              {approval.lastError}
                            </p>
                          )}
                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={() => void decideApproval(approval.id, "approved")}
                              className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => startEditingApproval(approval)}
                              className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void decideApproval(approval.id, "cancelled")}
                              className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </article>
                      ))}

                      {editingApproval && (
                        <div className="rounded-2xl border border-[rgba(124,77,255,0.28)] bg-[rgba(52,29,111,0.24)] p-4">
                          <h4 className="text-sm font-semibold text-white">Edit approval</h4>
                          <div className="mt-3 space-y-3">
                            <input
                              value={editingApproval.recipient}
                              onChange={(event) =>
                                setEditingApproval((current) =>
                                  current
                                    ? { ...current, recipient: event.target.value }
                                    : current,
                                )
                              }
                              placeholder="Recipient"
                              className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
                            />
                            <input
                              value={editingApproval.phone}
                              onChange={(event) =>
                                setEditingApproval((current) =>
                                  current ? { ...current, phone: event.target.value } : current,
                                )
                              }
                              placeholder="Phone number"
                              className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
                            />
                            <textarea
                              value={editingApproval.message}
                              onChange={(event) =>
                                setEditingApproval((current) =>
                                  current
                                    ? { ...current, message: event.target.value }
                                    : current,
                                )
                              }
                              placeholder="Message or script"
                              className="min-h-24 w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
                            />
                            <textarea
                              value={editingApproval.reason}
                              onChange={(event) =>
                                setEditingApproval((current) =>
                                  current ? { ...current, reason: event.target.value } : current,
                                )
                              }
                              placeholder="Reason"
                              className="min-h-20 w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
                            />
                          </div>
                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={() => void saveApprovalEdit()}
                              className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingApproval(null)}
                              className="flex-1 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {screen === "settings" && (
                    <div className="space-y-4 text-sm text-[var(--text-secondary)]">
                      <SettingsCard
                        title="OpenAI connection"
                        detail={
                          integrationState.openai?.detail ??
                          "Test the server-side OpenAI agent, transcription and speech pipeline."
                        }
                        status={integrationState.openai?.status ?? "idle"}
                        onClick={() => void testConnection("openai")}
                        buttonLabel="Test OpenAI"
                      />
                      <SettingsCard
                        title="Twilio connection"
                        detail={
                          integrationState.twilio?.detail ??
                          "Test server-side SMS and outbound call credentials."
                        }
                        status={integrationState.twilio?.status ?? "idle"}
                        onClick={() => void testConnection("twilio")}
                        buttonLabel="Test Twilio"
                      />
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                        <p className="font-semibold text-white">Business hours</p>
                        <p className="mt-2">{currentWorkspace.businessHours}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                        <p className="font-semibold text-white">Approval rules</p>
                        <p className="mt-2">{currentWorkspace.approvalPolicy}</p>
                      </div>
                    </div>
                  )}

                  {screen === "more" && (
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          "crm",
                          "calls",
                          "messages",
                          "automations",
                          "approvals",
                          "settings",
                        ] as ScreenKey[]
                      ).map((item) => (
                        <button
                          key={item}
                          onClick={() => setScreen(item)}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-left text-sm font-medium text-white"
                        >
                          {screenTitles[item]}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className="mt-8">
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Chat with AEGIS</p>
                    <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      {busy ? "Working" : "Ready"}
                    </span>
                  </div>
                  <textarea
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder={`Ask AEGIS about ${currentWorkspace.name}...`}
                    className="min-h-24 w-full resize-none rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void sendMessage(composer)}
                      disabled={busy}
                      className="flex-1 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => void sendMessage("Create an automation for missed calls.")}
                      disabled={busy}
                      className="rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white"
                    >
                      Draft automation
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <nav className="sticky bottom-0 mt-8 border-t border-white/6 bg-[rgba(8,11,18,0.98)] px-4 py-4 backdrop-blur-xl">
              <div className="grid grid-cols-5 items-end gap-2 text-center">
                <NavButton label="Home" active={screen === "home"} onClick={() => setScreen("home")} />
                <NavButton
                  label="Conversations"
                  active={screen === "conversations"}
                  onClick={() => setScreen("conversations")}
                />
                <button
                  onClick={() => setScreen("home")}
                  className="mx-auto -mt-10 grid h-20 w-20 place-items-center rounded-full bg-[radial-gradient(circle,#9a74ff_0%,#7147ff_55%,#4320c4_100%)] shadow-[0_20px_60px_rgba(120,73,255,0.55)]"
                >
                  <span className="text-3xl text-white">A</span>
                </button>
                <NavButton label="Tasks" active={screen === "tasks"} onClick={() => setScreen("tasks")} />
                <NavButton label="More" active={screen === "more"} onClick={() => setScreen("more")} />
              </div>
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingsCard({
  title,
  detail,
  status,
  onClick,
  buttonLabel,
}: {
  title: string;
  detail: string;
  status: "idle" | "loading" | "success" | "error";
  onClick: () => void;
  buttonLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{title}</p>
          <p className="mt-2">{detail}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold uppercase",
            status === "success"
              ? "bg-[rgba(34,197,94,0.16)] text-[#4ade80]"
              : status === "error"
                ? "bg-[rgba(239,68,68,0.16)] text-[#ff7f7f]"
                : "bg-white/[0.06] text-[var(--text-secondary)]",
          )}
        >
          {status}
        </span>
      </div>
      <button
        onClick={onClick}
        className="mt-4 rounded-full border border-[rgba(124,77,255,0.28)] bg-[rgba(124,77,255,0.16)] px-4 py-2 text-sm font-semibold text-white"
      >
        {status === "loading" ? "Testing..." : buttonLabel}
      </button>
    </div>
  );
}

function NavButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-[20px] px-2 py-3 text-[12px] transition",
        active
          ? "bg-[rgba(124,77,255,0.25)] text-white"
          : "text-[var(--text-secondary)]",
      )}
    >
      <span className="text-lg">{active ? "O" : "."}</span>
      <span>{label}</span>
    </button>
  );
}

function VoiceWave({ isRecording }: { isRecording: boolean }) {
  const bars = [18, 28, 38, 46, 58, 68, 82, 96, 80, 62, 48, 34, 22];

  return (
    <div className="flex items-center justify-center gap-[5px] pt-2">
      {[...bars, ...bars.slice().reverse()].map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={cn(
            "waveform-bar block w-[3px] rounded-full bg-[linear-gradient(180deg,#9d76ff,#5a31ef)]",
            !isRecording && "opacity-60",
          )}
          style={{
            height: `${height}px`,
            animationDelay: `${index * 0.045}s`,
          }}
        />
      ))}
    </div>
  );
}

function ShieldMark() {
  return (
    <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-[linear-gradient(180deg,#8f61ff,#5b26eb)] shadow-[0_12px_36px_rgba(112,74,255,0.4)]">
      <svg viewBox="0 0 48 48" className="h-9 w-9 text-white" fill="none">
        <path
          d="M24 7 35 11.6v9.1c0 7.6-4.7 14.5-11 18.3-6.3-3.8-11-10.7-11-18.3v-9.1L24 7Z"
          stroke="currentColor"
          strokeWidth="2.8"
        />
      </svg>
    </div>
  );
}

function CrmLeadDrawer({
  lead,
  contactName,
  timeline,
  crmNote,
  setCrmNote,
  crmTaskTitle,
  setCrmTaskTitle,
  onCall,
  onSms,
  onAddNote,
  onCreateTask,
}: {
  lead: Lead;
  contactName: string;
  timeline: Snapshot["crmTimeline"];
  crmNote: string;
  setCrmNote: (value: string) => void;
  crmTaskTitle: string;
  setCrmTaskTitle: (value: string) => void;
  onCall: () => void;
  onSms: () => void;
  onAddNote: () => void;
  onCreateTask: () => void;
}) {
  return (
    <div className="rounded-3xl border border-[rgba(124,77,255,0.28)] bg-[rgba(18,12,37,0.9)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{lead.name}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {contactName} | {lead.company}
          </p>
        </div>
        <span className="rounded-full bg-[rgba(124,77,255,0.14)] px-3 py-1 text-xs text-[var(--accent-soft)]">
          GBP {lead.estimatedValue.toLocaleString()}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[var(--text-secondary)]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <p className="font-semibold text-white">Status</p>
          <p className="mt-1">{lead.stage}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <p className="font-semibold text-white">Next follow-up</p>
          <p className="mt-1">{lead.nextFollowUpAt}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onCall}
          className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
        >
          Call
        </button>
        <button
          onClick={onSms}
          className="rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white"
        >
          SMS
        </button>
      </div>
      <textarea
        value={crmNote}
        onChange={(event) => setCrmNote(event.target.value)}
        placeholder="Add a quick note"
        className="mt-4 min-h-24 w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
      />
      <button
        onClick={onAddNote}
        className="mt-2 w-full rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white"
      >
        Add note
      </button>
      <input
        value={crmTaskTitle}
        onChange={(event) => setCrmTaskTitle(event.target.value)}
        placeholder="Create follow-up task"
        className="mt-4 w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
      />
      <button
        onClick={onCreateTask}
        className="mt-2 w-full rounded-full border border-[rgba(124,77,255,0.28)] bg-[rgba(124,77,255,0.16)] px-4 py-3 text-sm font-semibold text-white"
      >
        Create task
      </button>
      <div className="mt-5">
        <p className="text-sm font-semibold text-white">Activity timeline</p>
        <div className="mt-3 space-y-3">
          {timeline.length === 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm text-[var(--text-secondary)]">
              No CRM activity yet.
            </div>
          )}
          {timeline.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <span className="text-xs text-[var(--text-muted)]">{item.timestamp}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3a4 4 0 0 0-4 4v1.1c0 .7-.2 1.4-.5 2L6 13v2h12v-2l-1.5-2.9c-.3-.6-.5-1.3-.5-2V7a4 4 0 0 0-4-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 4a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V7a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3M8.5 20h7" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
