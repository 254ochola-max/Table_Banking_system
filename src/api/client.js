// Compatibility API client for the application.
// The existing Supabase client is re-exported here so legacy imports
// such as `@/api/client` continue to work.
export * from "./supabaseClient";
import * as supabaseClient from "./supabaseClient";

export const api = supabaseClient.default ?? supabaseClient;
export default api;
