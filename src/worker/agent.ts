import { Agent, callable } from "agents";
import { CORE_ATS_SOURCES, DAILY_ATS_SOURCES } from "../providers/source-catalog";
import {
  executeDiscoveryRun,
  type DiscoveryRunMode,
  type DiscoveryRunStats,
} from "./pipeline";
import {
  CORE_REFRESH_CRON,
  DAILY_DEEP_SCRAPE_CRON,
  DISCOVERY_SCHEDULE_VERSION,
} from "./schedule-config";

type DiscoveryTrigger = "core_schedule" | "daily_schedule" | "manual" | "startup";

export interface DiscoveryAgentState {
  status: "idle" | "running" | "error";
  totalRuns: number;
  lastRunId: string | null;
  lastRunMode: DiscoveryRunMode | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastAccepted: number;
  lastRejected: number;
  lastDailyRunAt: string | null;
  lastDailyAccepted: number;
  scheduleVersion: number;
  schedulesInitializedAt: string | null;
  bootstrapScheduledAt: string | null;
  lastError: string | null;
}

const INITIAL_STATE: DiscoveryAgentState = {
  status: "idle",
  totalRuns: 0,
  lastRunId: null,
  lastRunMode: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastAccepted: 0,
  lastRejected: 0,
  lastDailyRunAt: null,
  lastDailyAccepted: 0,
  scheduleVersion: 0,
  schedulesInitializedAt: null,
  bootstrapScheduledAt: null,
  lastError: null,
};

const SCHEDULE_PAYLOAD = { version: DISCOVERY_SCHEDULE_VERSION };

export class JobDiscoveryAgent extends Agent<Env, DiscoveryAgentState> {
  initialState: DiscoveryAgentState = INITIAL_STATE;

  private currentState(): DiscoveryAgentState {
    return { ...INITIAL_STATE, ...this.state };
  }

  async onStart() {
    const existing = await this.listSchedules({ type: "cron" });
    const expected = new Map([
      ["runCoreRefresh", CORE_REFRESH_CRON],
      ["runDailyDeepScrape", DAILY_DEEP_SCRAPE_CRON],
    ]);

    for (const schedule of existing) {
      if (schedule.type !== "cron") continue;
      const expectedCron = expected.get(schedule.callback);
      if (expectedCron && schedule.cron !== expectedCron) {
        await this.cancelSchedule(schedule.id);
      }
    }

    await Promise.all([
      this.schedule(CORE_REFRESH_CRON, "runCoreRefresh", SCHEDULE_PAYLOAD),
      this.schedule(DAILY_DEEP_SCRAPE_CRON, "runDailyDeepScrape", SCHEDULE_PAYLOAD),
    ]);

    const state = this.currentState();
    let nextState = state;
    if (!state.lastDailyRunAt && !state.bootstrapScheduledAt) {
      await this.schedule(
        5,
        "runDailyDeepScrape",
        { ...SCHEDULE_PAYLOAD, bootstrap: true },
        { idempotent: true },
      );
      nextState = { ...nextState, bootstrapScheduledAt: new Date().toISOString() };
    }

    if (state.scheduleVersion !== DISCOVERY_SCHEDULE_VERSION) {
      nextState = {
        ...nextState,
        scheduleVersion: DISCOVERY_SCHEDULE_VERSION,
        schedulesInitializedAt: new Date().toISOString(),
      };
    }

    if (nextState !== state) {
      this.setState({
        ...nextState,
      });
    }
  }

  @callable()
  async getStatus() {
    const schedules = await this.listSchedules({ type: "cron" });
    return {
      ...this.currentState(),
      catalog: {
        coreSources: CORE_ATS_SOURCES.length,
        dailySources: DAILY_ATS_SOURCES.length,
        totalSources: CORE_ATS_SOURCES.length + DAILY_ATS_SOURCES.length,
      },
      schedules: schedules
        .flatMap((schedule) => schedule.type === "cron" && (schedule.callback === "runCoreRefresh" || schedule.callback === "runDailyDeepScrape")
          ? [{
              id: schedule.id,
              callback: schedule.callback,
              cron: schedule.cron,
              nextRunAt: new Date(schedule.time * 1_000).toISOString(),
            }]
          : [])
        .sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt)),
    };
  }

  async runCoreRefresh(_payload?: { version: number }) {
    return this.runPull("core_schedule", "core");
  }

  async runDailyDeepScrape(_payload?: { version: number }) {
    return this.runPull("daily_schedule", "daily");
  }

  @callable()
  async runPull(
    trigger: DiscoveryTrigger = "manual",
    runMode: DiscoveryRunMode = "full",
  ): Promise<DiscoveryRunStats | { skipped: true; reason: string }> {
    const state = this.currentState();
    if (state.status === "running") {
      const persistedRun = state.lastRunId
        ? await this.env.JOB_LOBSTER_DB.prepare("SELECT status FROM ingestion_runs WHERE id = ? LIMIT 1").bind(state.lastRunId).first<{ status: string }>()
        : null;
      if (!persistedRun || persistedRun.status === "running") {
        return { skipped: true, reason: "A discovery run is already active." };
      }
      console.warn("recovering_stale_agent_state", { runId: state.lastRunId, persistedStatus: persistedRun.status });
    }

    const startedAt = new Date();
    const runId = `run_${startedAt.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
    this.setState({
      ...state,
      status: "running",
      lastRunId: runId,
      lastRunMode: runMode,
      lastStartedAt: startedAt.toISOString(),
      lastError: null,
    });

    console.log("discovery_run_started", { runId, trigger, runMode });
    try {
      const result = await executeDiscoveryRun(this.env, runId, startedAt, runMode);
      const finishedState = this.currentState();
      const isDaily = runMode === "daily" || runMode === "full";
      this.setState({
        ...finishedState,
        status: result.status === "failed" ? "error" : "idle",
        totalRuns: finishedState.totalRuns + 1,
        lastRunId: runId,
        lastRunMode: runMode,
        lastStartedAt: result.startedAt,
        lastFinishedAt: result.finishedAt,
        lastAccepted: result.jobsAccepted,
        lastRejected: result.jobsRejected,
        lastDailyRunAt: isDaily ? result.finishedAt : finishedState.lastDailyRunAt,
        lastDailyAccepted: isDaily ? result.jobsAccepted : finishedState.lastDailyAccepted,
        lastError: result.status === "failed" ? result.errors.join("; ") : null,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState({
        ...this.currentState(),
        status: "error",
        lastFinishedAt: new Date().toISOString(),
        lastError: message,
      });
      throw error;
    }
  }
}
