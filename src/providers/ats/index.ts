import { ashbyAdapter } from "./ashby";
import { greenhouseAdapter } from "./greenhouse";
import { leverAdapter } from "./lever";
import type { AtsAdapter, AtsProvider } from "../types";

export const ATS_ADAPTERS: Record<AtsProvider, AtsAdapter> = {
  ashby: ashbyAdapter,
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
};
