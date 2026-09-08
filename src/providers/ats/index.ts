import { workableAdapter } from "./workable";
import { smartRecruitersAdapter } from "./smartrecruiters";
import { ashbyAdapter } from "./ashby";
import { greenhouseAdapter } from "./greenhouse";
import { leverAdapter } from "./lever";
import type { AtsAdapter, AtsProvider } from "../types";

export const ATS_ADAPTERS: Record<AtsProvider, AtsAdapter> = {
  workable: workableAdapter,
  smartrecruiters: smartRecruitersAdapter,
  ashby: ashbyAdapter,
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
};
