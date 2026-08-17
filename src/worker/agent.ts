import { Agent, callable } from "agents";
import {
  ALL_ATS_SOURCES,
  CORE_ATS_SOURCES,
  DAILY_ATS_SOURCES,
  sourcesForRun,
  type SourceRunMode,
} from "../providers/source-catalog";
import { WEB_SEARCH_SOURCES } from "../providers/web-search";
import {
  executeDiscoveryRun,
  executeWebDiscoveryRun,
  type DiscoveryRunMode,
  type DiscoveryRunStats,
} from "./pipeline";
import {
  ATS_CATALOG_VERSION,
  CORE_REFRESH_CRON,
  DAILY_DEEP_SCRAPE_CRON,
  DAILY_WEB_SEARCH_CRON,
  DISCOVERY_SCHEDULE_VERSION,
  SOURCE_BATCH_SIZE,
  SOURCE_BATCH_STAGGER_SECONDS,
} from "./schedule-config";

type DiscoveryTrigger = "core_schedule" | "daily_schedule" | "web_schedule" | "manual" | "startup";

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
  lastWebSearchAt: string | null;
  lastWebSearchAccepted: number;
  scheduleVersion: number;
  schedulesInitializedAt: string | null;
  bootstrapScheduledAt: string | null;
  catalogRefreshScheduledAt: string | null;
  webSearchScheduledAt: string | null;
  batchPlanId: string | null;
  batchTotal: number;
  batchCompleted: number;
  batchAccepted: number;
  batchRejected: number;
  lastError: string | null;
}

interface DiscoveryBatchPayload {
  version: number;
  planId: string;
  runMode: SourceRunMode;
  batchIndex: number;
  sourceIds: string[];
}

interface QueuedBatchPlan {
  queued: true;
  planId: string;
  batches: number;
  sources: number;
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
  lastWebSearchAt: null,
  lastWebSearchAccepted: 0,
  scheduleVersion: 0,
  schedulesInitializedAt: null,
  bootstrapScheduledAt: null,
  catalogRefreshScheduledAt: null,
  webSearchScheduledAt: null,
  batchPlanId: null,
  batchTotal: 0,
  batchCompleted: 0,
  batchAccepted: 0,
  batchRejected: 0,
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
    const expected = [
      { callback: "runCoreRefresh", cron: CORE_REFRESH_CRON },
      { callback: "runDailyDeepScrape", cron: DAILY_DEEP_SCRAPE_CRON },
      { callback: "runDailyWebSearch", cron: DAILY_WEB_SEARCH_CRON },
    ] as const;

    for (const definition of expected) {
      const matching = existing.filter((schedule) => schedule.type === "cron" && schedule.callback === definition.callback);
      const current = matching.find((schedule) => {
        if (schedule.type !== "cron" || schedule.cron !== definition.cron) return false;
        if (!schedule.payload || typeof schedule.payload !== "object") return false;
        return Reflect.get(schedule.payload, "version") === DISCOVERY_SCHEDULE_VERSION;
      });

      for (const schedule of matching) {
        if (schedule.id !== current?.id) await this.cancelSchedule(schedule.id);
      }

      if (!current) {
        await this.schedule(definition.cron, definition.callback, SCHEDULE_PAYLOAD, { idempotent: true });
      }
    }

    const state = this.currentState();
    let nextState = state;
    if (state.scheduleVersion > 0 && state.scheduleVersion < ATS_CATALOG_VERSION) {
      await this.schedule(
        8,
        "runCatalogUpgrade",
        { ...SCHEDULE_PAYLOAD, catalogUpgrade: true },
        { idempotent: true },
      );
      nextState = { ...nextState, catalogRefreshScheduledAt: new Date().toISOString() };
    }
    if (state.scheduleVersion < DISCOVERY_SCHEDULE_VERSION) {
      await this.schedule(
        state.scheduleVersion > 0 ? 8 : 420,
        "runDailyWebSearch",
        { ...SCHEDULE_PAYLOAD, bootstrap: true },
        { idempotent: true },
      );
      nextState = { ...nextState, webSearchScheduledAt: new Date().toISOString() };
    }
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
    if (this.currentState().scheduleVersion < DISCOVERY_SCHEDULE_VERSION) {
      await this.onStart();
    }
    const schedules = await this.listSchedules({ type: "cron" });
    return {
      ...this.currentState(),
      catalog: {
        coreSources: CORE_ATS_SOURCES.length,
        dailySources: DAILY_ATS_SOURCES.length,
        webSources: WEB_SEARCH_SOURCES.length,
        totalSources: CORE_ATS_SOURCES.length + DAILY_ATS_SOURCES.length + WEB_SEARCH_SOURCES.length,
      },
      schedules: schedules
        .flatMap((schedule) => schedule.type === "cron" && (
          schedule.callback === "runCoreRefresh"
          || schedule.callback === "runDailyDeepScrape"
          || schedule.callback === "runDailyWebSearch"
        )
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
    return this.queueDiscoveryBatches("daily_schedule", "daily");
  }

  async runDailyWebSearch(_payload?: { version: number; bootstrap?: boolean }) {
    return this.runWebSearch("web_schedule");
  }

  @callable()
  async runWebSearch(trigger: DiscoveryTrigger = "manual"): Promise<DiscoveryRunStats> {
    const startedAt = new Date();
    const runId = `web_${startedAt.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
    this.setState({
      ...this.currentState(),
      status: "running",
      lastRunId: runId,
      lastRunMode: "web",
      lastStartedAt: startedAt.toISOString(),
      lastError: null,
    });
    console.log("web_discovery_run_started", { runId, trigger });

    try {
      const result = await executeWebDiscoveryRun(this.env, runId, startedAt);
      const state = this.currentState();
      const batchInProgress = Boolean(
        state.batchPlanId
        && state.batchTotal > 0
        && state.batchCompleted < state.batchTotal,
      );
      this.setState({
        ...state,
        status: result.status === "failed" ? "error" : batchInProgress ? "running" : "idle",
        totalRuns: state.totalRuns + 1,
        lastRunId: runId,
        lastRunMode: "web",
        lastStartedAt: result.startedAt,
        lastFinishedAt: result.finishedAt,
        lastAccepted: result.jobsAccepted,
        lastRejected: result.jobsRejected,
        lastWebSearchAt: result.finishedAt,
        lastWebSearchAccepted: result.jobsAccepted,
        lastError: result.status === "failed" ? result.errors.join("; ") : null,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState({
        ...this.currentState(),
        status: "error",
        lastFinishedAt: new Date().toISOString(),
        lastWebSearchAt: new Date().toISOString(),
        lastError: message,
      });
      throw error;
    }
  }

  async runCatalogUpgrade(_payload?: { version: number; catalogUpgrade?: boolean }) {
    return this.queueDiscoveryBatches("startup", "full");
  }

  private async queueDiscoveryBatches(
    trigger: DiscoveryTrigger,
    runMode: SourceRunMode,
  ): Promise<QueuedBatchPlan> {
    const sources = sourcesForRun(runMode);
    const now = new Date();
    const planWindow = trigger === "manual"
      ? now.toISOString().replace(/[^0-9]/g, "").slice(0, 14)
      : now.toISOString().slice(0, 13).replace(/[^0-9]/g, "");
    const planId = `${trigger}_${runMode}_v${DISCOVERY_SCHEDULE_VERSION}_${planWindow}`;
    const batches = Math.ceil(sources.length / SOURCE_BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batches; batchIndex += 1) {
      const sourceIds = sources
        .slice(batchIndex * SOURCE_BATCH_SIZE, (batchIndex + 1) * SOURCE_BATCH_SIZE)
        .map((source) => source.id);
      await this.schedule(
        2 + batchIndex * SOURCE_BATCH_STAGGER_SECONDS,
        "runDiscoveryBatch",
        { version: DISCOVERY_SCHEDULE_VERSION, planId, runMode, batchIndex, sourceIds },
        { idempotent: true },
      );
    }

    const state = this.currentState();
    if (state.batchPlanId !== planId) {
      this.setState({
        ...state,
        status: "running",
        lastDailyRunAt: runMode === "daily" || runMode === "full" ? now.toISOString() : state.lastDailyRunAt,
        batchPlanId: planId,
        batchTotal: batches,
        batchCompleted: 0,
        batchAccepted: 0,
        batchRejected: 0,
        lastError: null,
      });
    }

    return { queued: true, planId, batches, sources: sources.length };
  }

  async runDiscoveryBatch(payload: DiscoveryBatchPayload) {
    const sourcesById = new Map(ALL_ATS_SOURCES.map((source) => [source.id, source]));
    const sources = payload.sourceIds.flatMap((id) => {
      const source = sourcesById.get(id);
      return source ? [source] : [];
    });
    if (sources.length !== payload.sourceIds.length) {
      throw new Error(`Batch ${payload.planId}/${payload.batchIndex} contains an unknown source.`);
    }

    const startedAt = new Date();
    const runId = `run_${startedAt.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
    this.setState({
      ...this.currentState(),
      status: "running",
      lastRunId: runId,
      lastRunMode: payload.runMode,
      lastStartedAt: startedAt.toISOString(),
      lastError: null,
    });

    const result = await executeDiscoveryRun(this.env, runId, startedAt, payload.runMode, sources);
    const state = this.currentState();
    const samePlan = state.batchPlanId === payload.planId;
    const completed = samePlan ? Math.min(state.batchCompleted + 1, state.batchTotal) : state.batchCompleted;
    const accepted = samePlan ? state.batchAccepted + result.jobsAccepted : state.batchAccepted;
    const rejected = samePlan ? state.batchRejected + result.jobsRejected : state.batchRejected;
    const planFinished = samePlan && completed >= state.batchTotal;
    this.setState({
      ...state,
      status: result.status === "failed" ? "error" : planFinished ? "idle" : "running",
      totalRuns: state.totalRuns + 1,
      lastRunId: runId,
      lastRunMode: payload.runMode,
      lastStartedAt: result.startedAt,
      lastFinishedAt: result.finishedAt,
      lastAccepted: accepted,
      lastRejected: rejected,
      lastDailyAccepted: payload.runMode === "daily" || payload.runMode === "full" ? accepted : state.lastDailyAccepted,
      batchCompleted: completed,
      batchAccepted: accepted,
      batchRejected: rejected,
      lastError: result.status === "failed" ? result.errors.join("; ") : null,
    });
    return result;
  }

  @callable()
  async runPull(
    trigger: DiscoveryTrigger = "manual",
    runMode: SourceRunMode = "full",
  ): Promise<DiscoveryRunStats | QueuedBatchPlan | { skipped: true; reason: string }> {
    if (runMode !== "core") return this.queueDiscoveryBatches(trigger, runMode);
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
        lastDailyRunAt: finishedState.lastDailyRunAt,
        lastDailyAccepted: finishedState.lastDailyAccepted,
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
