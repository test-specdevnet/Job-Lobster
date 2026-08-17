import { Agent, callable } from "agents";
import { executeDiscoveryRun, type DiscoveryRunStats } from "./pipeline";

export interface DiscoveryAgentState {
  status: "idle" | "running" | "error";
  totalRuns: number;
  lastRunId: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastAccepted: number;
  lastRejected: number;
  lastError: string | null;
}

export class JobDiscoveryAgent extends Agent<Env, DiscoveryAgentState> {
  initialState: DiscoveryAgentState = {
    status: "idle",
    totalRuns: 0,
    lastRunId: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastAccepted: 0,
    lastRejected: 0,
    lastError: null,
  };

  @callable()
  getStatus() {
    return this.state;
  }

  @callable()
  async runPull(trigger: "cron" | "manual" | "startup" = "manual"): Promise<DiscoveryRunStats | { skipped: true; reason: string }> {
    if (this.state.status === "running") {
      const persistedRun = this.state.lastRunId
        ? await this.env.JOB_LOBSTER_DB.prepare("SELECT status FROM ingestion_runs WHERE id = ? LIMIT 1").bind(this.state.lastRunId).first<{ status: string }>()
        : null;
      if (!persistedRun || persistedRun.status === "running") {
        return { skipped: true, reason: "A discovery run is already active." };
      }
      console.warn("recovering_stale_agent_state", { runId: this.state.lastRunId, persistedStatus: persistedRun.status });
    }
    const startedAt = new Date();
    const runId = `run_${startedAt.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
    this.setState({
      ...this.state,
      status: "running",
      lastRunId: runId,
      lastStartedAt: startedAt.toISOString(),
      lastError: null,
    });

    console.log("discovery_run_started", { runId, trigger });
    try {
      const result = await executeDiscoveryRun(this.env, runId, startedAt);
      this.setState({
        ...this.state,
        status: result.status === "failed" ? "error" : "idle",
        totalRuns: this.state.totalRuns + 1,
        lastRunId: runId,
        lastStartedAt: result.startedAt,
        lastFinishedAt: result.finishedAt,
        lastAccepted: result.jobsAccepted,
        lastRejected: result.jobsRejected,
        lastError: result.status === "failed" ? result.errors.join("; ") : null,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState({ ...this.state, status: "error", lastFinishedAt: new Date().toISOString(), lastError: message });
      throw error;
    }
  }
}
