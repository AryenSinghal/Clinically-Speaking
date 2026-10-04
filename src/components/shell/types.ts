export type ShellStatus = {
  study: { id: string; title: string } | null;
  setup: { fields: number; visits: number };
  recruitment: { selected: number; screened: number; accepted: number };
  survey: { enrolled: number };
  escalations: number;
};

export const EMPTY_STATUS: ShellStatus = {
  study: null,
  setup: { fields: 0, visits: 0 },
  recruitment: { selected: 0, screened: 0, accepted: 0 },
  survey: { enrolled: 0 },
  escalations: 0,
};
