// In-memory diagnostics for the Settings → Diagnostics screen. Records the
// last successful API sync and the last API error (status / message /
// sib-request-id). Populated by the API client in src/lib/brevo.ts.
const BACKEND_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}`;

export type ApiErrorInfo = {
  status: number;
  message: string;
  requestId?: string | null;
  at: number; // epoch ms
};

const state = {
  lastSyncAt: null as number | null,
  lastError: null as ApiErrorInfo | null,
};

export const diagnostics = {
  backendUrl: BACKEND_URL,

  recordSuccess() {
    state.lastSyncAt = Date.now();
  },

  recordError(info: ApiErrorInfo) {
    state.lastError = info;
  },

  getLastSyncAt() {
    return state.lastSyncAt;
  },

  getLastError() {
    return state.lastError;
  },
};
