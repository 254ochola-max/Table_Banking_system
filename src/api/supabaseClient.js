import { createClient } from "@supabase/supabase-js";

/*
 * SUPABASE CONFIGURATION
 *
 * Replace ONLY the value of SUPABASE_ANON_KEY with your
 * Supabase browser-safe Publishable/Anon key.
 *
 * NEVER put a service_role/secret key in this file.
 */

const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_JDI1Lx5ZYMj0w7aoZyqTvg_ctUfWYXr";

export const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL ||
  "https://vtjxcaxatiwhvntycclj.supabase.co";

/*
 * Check that Supabase has been configured.
 */
export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY);


/*
 * Create the Supabase client.
 */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;


/*
 * Make sure Supabase is available before performing
 * authenticated/database operations.
 */
export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Open src/api/supabaseClient.js and replace SUPABASE_ANON_KEY with your Supabase Publishable/Anon key."
    );
  }

  return supabase;
}


/*
 * Supabase table mapping.
 */
const tableMap = {
  Member: "members",
  Contribution: "contributions",
  Loan: "loans",
  Repayment: "repayments",
  Fine: "fines",
  Transaction: "transactions",
  GroupSettings: "groupsettings",
  GroupSummaryTable: "groupsummarytables",
  ProfileChangeRequest: "profilechangerequests",
  ContactMessage: "contact_messages",
};


/*
 * Local-storage fallback.
 *
 * This allows the application to continue working locally
 * if Supabase is unavailable.
 */
const localPrefix = "deborahs_local_";


function localRead(name) {
  try {
    return JSON.parse(
      localStorage.getItem(localPrefix + name) || "[]"
    );
  } catch {
    return [];
  }
}


function localWrite(name, rows) {
  try {
    localStorage.setItem(
      localPrefix + name,
      JSON.stringify(rows)
    );
  } catch (e) {
    console.warn(`[Storage] Local write fallback for '${name}':`, e);
  }
}


function makeId(name) {
  return `${name.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}


function sortRows(rows, sortKey) {
  if (!sortKey) return rows;

  const descending = sortKey.startsWith("-");
  const field = descending
    ? sortKey.slice(1)
    : sortKey;

  return [...rows].sort((a, b) => {
    if (a[field] < b[field]) {
      return descending ? 1 : -1;
    }

    if (a[field] > b[field]) {
      return descending ? -1 : 1;
    }

    return 0;
  });
}


/*
 * In-memory result cache.
 *
 * Prevents redundant Supabase round-trips when multiple components or
 * pages mount simultaneously and request the same data. Each cache
 * entry expires after CACHE_TTL_MS (30 seconds for most tables,
 * 60 seconds for Members which change infrequently). Any write
 * (create / update / delete) immediately clears the relevant table
 * entry so the next read is always fresh.
 *
 * In-flight request deduplication: if two callers ask for the same
 * key while a fetch is already in progress, they both await the same
 * Promise instead of issuing two network requests.
 */
const CACHE_TTL_MS = 30_000;
const CACHE_TTL_MEMBERS_MS = 60_000;

// { cacheKey: { data, expiresAt } }
const _memCache = new Map();
// { cacheKey: Promise }  — in-flight deduplication
const _inFlight = new Map();

function _cacheGet(key) {
  const entry = _memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _memCache.delete(key);
    return null;
  }
  return entry.data;
}

function _cacheSet(key, data, tableName) {
  const ttl = tableName === "members" ? CACHE_TTL_MEMBERS_MS : CACHE_TTL_MS;
  _memCache.set(key, { data, expiresAt: Date.now() + ttl });
}

function _cacheInvalidate(tableName) {
  // Remove all entries whose key starts with the table name prefix
  for (const key of _memCache.keys()) {
    if (key.startsWith(tableName + ":")) _memCache.delete(key);
  }
  // Also drop any in-flight promise for this table so the next caller
  // always gets a real network response after a write.
  for (const key of _inFlight.keys()) {
    if (key.startsWith(tableName + ":")) _inFlight.delete(key);
  }
}


/*
 * Generic Supabase entity handler.
 */
class SupabaseEntityHandler {
  constructor(name) {
    this.name = name;
    this.tableName = tableMap[name];
  }


  _enrichRows(rows) {
    if (!Array.isArray(rows)) return rows;
    if (this.name === "Member") {
      const localMembers = localRead("Member");
      const localMap = new Map(localMembers.map(m => [m.id, m]));
      return rows.map(row => {
        const local = localMap.get(row.id);
        let dedicatedPhoto = null;
        try {
          const emailKey = (row.user_email || row.email || "").toLowerCase();
          const nameKey = (row.full_name || "").toLowerCase().trim().replace(/\s+/g, "_");
          dedicatedPhoto = localStorage.getItem(`deborahs_photo_${row.id}`) ||
                           localStorage.getItem(`deborahs_profile_photo_${row.id}`) ||
                           (row.auth_user_id ? localStorage.getItem(`deborahs_photo_${row.auth_user_id}`) : null) ||
                           (emailKey ? localStorage.getItem(`deborahs_photo_${emailKey}`) : null) ||
                           (nameKey ? localStorage.getItem(`deborahs_photo_${nameKey}`) : null) ||
                           (local?.user_email ? localStorage.getItem(`deborahs_photo_${local.user_email.toLowerCase()}`) : null) ||
                           (local?.email ? localStorage.getItem(`deborahs_photo_${local.email.toLowerCase()}`) : null);
        } catch {}

        let cachedPhoto = null;
        if (!dedicatedPhoto && !row.photo_url && !local?.photo_url) {
          for (const [k, v] of _memCache.entries()) {
            if (k.startsWith("members:") && Array.isArray(v?.data)) {
              const found = v.data.find(x => x.id === row.id || (row.email && (x.email === row.email || x.user_email === row.email)) || (row.full_name && x.full_name === row.full_name));
              if (found?.photo_url) {
                cachedPhoto = found.photo_url;
                break;
              }
            }
          }
        }

        const photo_url = row.photo_url || local?.photo_url || dedicatedPhoto || cachedPhoto || null;
        if (photo_url && !row.photo_url) {
          row.photo_url = photo_url;
        }
        if (photo_url) {
          try {
            localStorage.setItem(`deborahs_photo_${row.id}`, photo_url);
            if (row.user_email) localStorage.setItem(`deborahs_photo_${row.user_email.toLowerCase()}`, photo_url);
            if (row.email) localStorage.setItem(`deborahs_photo_${row.email.toLowerCase()}`, photo_url);
            if (row.auth_user_id) localStorage.setItem(`deborahs_photo_${row.auth_user_id}`, photo_url);
            if (row.full_name) localStorage.setItem(`deborahs_photo_${row.full_name.toLowerCase().trim().replace(/\s+/g, '_')}`, photo_url);
          } catch {}
        }
        return row;
      });
    }
    return rows;
  }

  async list(sortKey, limit) {
    const cacheKey = `${this.tableName}:list:${sortKey || ""}:${limit || ""}`;

    // Return cached result if still fresh
    const cached = _cacheGet(cacheKey);
    if (cached) return cached;

    // Deduplicate concurrent in-flight requests for the same key
    if (_inFlight.has(cacheKey)) return _inFlight.get(cacheKey);

    const fetchPromise = (async () => {
      let resultRows = [];
      if (supabase) {
        try {
          let query = supabase
            .from(this.tableName)
            .select("*");

          if (sortKey) {
            const descending = sortKey.startsWith("-");
            query = query.order(
              descending ? sortKey.slice(1) : sortKey,
              { ascending: !descending }
            );
          }

          if (limit > 0) query = query.limit(limit);

          const { data, error } = await query;
          if (!error && data) resultRows = data;
        } catch (e) {
          console.warn(`[Supabase] Table '${this.tableName}' list error, fallback to local storage:`, e);
        }
      }

      if (!resultRows.length) {
        resultRows = sortRows(localRead(this.name), sortKey);
      }

      resultRows = this._enrichRows(resultRows);
      const result = limit > 0 ? resultRows.slice(0, limit) : resultRows;

      _cacheSet(cacheKey, result, this.tableName);
      _inFlight.delete(cacheKey);
      return result;
    })();

    _inFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }


  async filter(queryObj = {}, sortKey, limit) {
    let resultRows = [];
    if (supabase) {
      try {
        let query = supabase
          .from(this.tableName)
          .select("*");

        for (const [key, value] of Object.entries(queryObj)) {
          query = query.eq(key, value);
        }

        if (sortKey) {
          const descending = sortKey.startsWith("-");

          query = query.order(
            descending
              ? sortKey.slice(1)
              : sortKey,
            {
              ascending: !descending,
            }
          );
        }

        if (limit > 0) {
          query = query.limit(limit);
        }

        const { data, error } = await query;

        if (!error && data) {
          resultRows = data;
        }
      } catch (e) {
        console.warn(`[Supabase] Table '${this.tableName}' filter error, fallback to local storage:`, e);
      }
    }

    if (!resultRows.length) {
      resultRows = localRead(this.name).filter(
        (row) =>
          Object.entries(queryObj).every(
            ([key, value]) => row[key] === value
          )
      );
    }

    resultRows = sortRows(resultRows, sortKey);
    resultRows = this._enrichRows(resultRows);

    return limit > 0
      ? resultRows.slice(0, limit)
      : resultRows;
  }


  async get(id) {
    let row = null;
    if (supabase) {
      try {
        let { data, error } = await supabase
          .from(this.tableName)
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if ((!data || error) && this.name === "Member") {
          const { data: byAuth } = await supabase
            .from(this.tableName)
            .select("*")
            .or(`auth_user_id.eq.${id},email.eq.${id},user_email.eq.${id}`)
            .maybeSingle();
          if (byAuth) data = byAuth;
        }

        if (!error && data) row = data;

        // If member has no photo_url in members table, check profiles table
        if (row && this.name === "Member" && !row.photo_url) {
          try {
            const profileQuery = row.auth_user_id
              ? supabase.from("profiles").select("photo_url").eq("id", row.auth_user_id).maybeSingle()
              : (row.email || row.user_email)
              ? supabase.from("profiles").select("photo_url").eq("email", row.email || row.user_email).maybeSingle()
              : null;
            if (profileQuery) {
              const { data: prof } = await profileQuery;
              if (prof?.photo_url) {
                row.photo_url = prof.photo_url;
              }
            }
          } catch {}
        }
      } catch (e) {
        console.warn(`[Supabase] Table '${this.tableName}' get error:`, e);
      }
    }

    if (!row) {
      row = localRead(this.name).find((r) => r.id === id || r.auth_user_id === id || r.email === id || r.user_email === id) || null;
    }

    if (row) {
      const enriched = this._enrichRows([row]);
      return enriched[0];
    }
    return null;
  }


  async create(data) {
    _cacheInvalidate(this.tableName);
    const row = {
      id: data.id || makeId(this.name),
      ...data,
    };

    if (data.photo_url) {
      try {
        localStorage.setItem(`deborahs_photo_${row.id}`, data.photo_url);
      } catch (e) {
        console.warn("Could not cache photo to localStorage:", e);
      }
    }

    // Always update local storage (deduplicating by id or email)
    const localRows = localRead(this.name);
    const existingIndex = localRows.findIndex(
      r => r.id === row.id || (row.email && (r.user_email?.toLowerCase() === row.email.toLowerCase() || r.email?.toLowerCase() === row.email.toLowerCase()))
    );
    if (existingIndex !== -1) {
      localRows[existingIndex] = { ...localRows[existingIndex], ...row };
    } else {
      localRows.unshift(row);
    }
    localWrite(this.name, localRows);

    if (supabase) {
      try {
        const { data: result, error } =
          await supabase
            .from(this.tableName)
            .insert(row)
            .select()
            .maybeSingle();

        if (error) {
          console.warn(`[Supabase] Table '${this.tableName}' insert warning:`, error);
          // If insert fails due to duplicate key or RLS conflict, attempt update/upsert
          if (error.code === "23505" || error.message?.includes("duplicate") || error.code === "42501") {
            const matchEmail = row.user_email || row.email;
            if (matchEmail) {
              const { data: updated } = await supabase
                .from(this.tableName)
                .update(row)
                .or(`user_email.eq.${matchEmail},email.eq.${matchEmail}`)
                .select()
                .maybeSingle();
              if (updated) {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("deborahs-member-updated", { detail: updated }));
                }
                return updated;
              }
            }
          }
        } else if (result) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("deborahs-member-updated", { detail: result }));
          }
          return result;
        }
      } catch (e) {
        console.warn(`[Supabase] Table '${this.tableName}' create error, fallback to local storage:`, e);
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("deborahs-member-updated", { detail: row }));
    }
    return row;
  }


  async bulkCreate(items = []) {
    if (!items.length) return [];

    const rows = items.map((item) => ({
      id: item.id || makeId(this.name),
      ...item,
    }));

    const existing = localRead(this.name);
    localWrite(this.name, [...rows, ...existing]);

    if (supabase) {
      try {
        const { data, error } =
          await supabase
            .from(this.tableName)
            .insert(rows)
            .select();

        if (!error && data) return data;
      } catch (e) {
        console.warn(`[Supabase] Table '${this.tableName}' bulkCreate error, fallback to local storage:`, e);
      }
    }

    return rows;
  }


  async update(id, data) {
    _cacheInvalidate(this.tableName);
    // Save photo to dedicated key if included in update
    if (data.photo_url) {
      try {
        localStorage.setItem(`deborahs_photo_${id}`, data.photo_url);
      } catch (e) {
        console.warn("Could not cache photo to localStorage:", e);
      }
    }

    // 1. ALWAYS update local storage immediately
    const localRows = localRead(this.name);
    const index = localRows.findIndex((row) => row.id === id);
    let updatedRow = null;

    if (index !== -1) {
      localRows[index] = {
        ...localRows[index],
        ...data,
      };
      localWrite(this.name, localRows);
      updatedRow = localRows[index];
    } else {
      updatedRow = { id, ...data };
      localRows.unshift(updatedRow);
      localWrite(this.name, localRows);
    }

    // 2. Sync to Supabase DB
    if (supabase) {
      try {
        const { data: result, error } =
          await supabase
            .from(this.tableName)
            .update(data)
            .eq("id", id)
            .select()
            .maybeSingle();

        if (!error && result) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("deborahs-member-updated", { detail: result }));
          }
          return result;
        }
      } catch (e) {
        console.warn(`[Supabase] Table '${this.tableName}' update error, saved to local storage:`, e);
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("deborahs-member-updated", { detail: updatedRow }));
    }
    return updatedRow;
  }


  async bulkUpdate(items = []) {
    const results = [];

    for (const item of items) {
      if (!item?.id) continue;

      const { id, ...changes } = item;

      results.push(
        await this.update(id, changes)
      );
    }

    return results;
  }


  async delete(id) {
    _cacheInvalidate(this.tableName);
    if (supabase) {
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq("id", id);

      if (error) throw error;

      return {
        success: true,
      };
    }

    localWrite(
      this.name,
      localRead(this.name).filter(
        (row) => row.id !== id
      )
    );

    return {
      success: true,
    };
  }


  async deleteMany(queryObj = {}) {
    _cacheInvalidate(this.tableName);
    if (supabase) {
      let query = supabase
        .from(this.tableName)
        .delete();

      const entries = Object.entries(queryObj);

      if (entries.length === 0) {
        // Supabase enables Postgres' "safeupdate" protection by default,
        // which rejects any DELETE/UPDATE sent through the API with no
        // filter at all (to stop accidental full-table wipes). To delete
        // every row on purpose, we still have to give it a condition —
        // this one matches every row, since "id" is never null.
        query = query.not("id", "is", null);
      } else {
        for (const [key, value] of entries) {
          query = query.eq(key, value);
        }
      }

      try {
        const { error } = await query;
        if (error) console.warn(`[Supabase] Table '${this.tableName}' deleteMany error:`, error);
      } catch (e) {
        console.warn(`[Supabase] Table '${this.tableName}' deleteMany exception:`, e);
      }
    }

    // ALWAYS update local storage cache too
    localWrite(
      this.name,
      localRead(this.name).filter(
        (row) =>
          !Object.entries(queryObj).every(
            ([key, value]) =>
              row[key] === value
          )
      )
    );

    return {
      success: true,
    };
  }
}


/*
 * Get the user's profile from Supabase.
 */
async function profileForUser(user) {
  if (!user) return null;

  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email,

      full_name:
        data?.full_name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "User",

      role: data?.role || "user",

      status:
        data?.status || "Active",

      ...data,
    };
  }

  return {
    id: user.id,
    email: user.email,

    full_name:
      user.user_metadata?.full_name ||
      user.email?.split("@")[0],

    role:
      user.user_metadata?.role ||
      "user",

    status: "Active",
  };
}


/*
 * Main API exposed to the application.
 */
export const api = {
  auth: {

    async me() {
      const client = requireSupabase();

      const {
        data: { user },
        error,
      } = await client.auth.getUser();

      if (error) throw error;

      if (!user) {
        throw new Error(
          "Not authenticated"
        );
      }

      return profileForUser(user);
    },


    async login({ email, password }) {
      const client = requireSupabase();

      const { data, error } =
        await client.auth.signInWithPassword({
          email,
          password,
        });

      if (error) throw error;

      return profileForUser(data.user);
    },


    async loginViaEmailPassword(
      email,
      password
    ) {
      return this.login({
        email,
        password,
      });
    },


    async register({
      email,
      password,
      full_name = "",
      phone = "",
      id_number = "",
    }) {
      const client = requireSupabase();

      const { data, error } =
        await client.auth.signUp({
          email,
          password,

          options: {
            data: {
              full_name,
              phone,
              id_number,
            },
          },
        });

      if (error) throw error;

      return data;
    },


    async verifyOtp({
      email,
      otpCode,
    }) {
      const client = requireSupabase();

      const { data, error } =
        await client.auth.verifyOtp({
          email,
          token: otpCode,
          type: "signup",
        });

      if (error) throw error;

      return data;
    },


    async resendOtp(email) {
      const client = requireSupabase();

      const { data, error } =
        await client.auth.resend({
          type: "signup",
          email,
        });

      if (error) throw error;

      return data;
    },


    async resetPasswordRequest(email) {
      const client = requireSupabase();

      const redirectTo =
        `${window.location.origin}/reset-password`;

      const { data, error } =
        await client.auth.resetPasswordForEmail(
          email,
          {
            redirectTo,
          }
        );

      if (error) throw error;

      return data;
    },


    async resetPassword({
      newPassword,
    }) {
      const client = requireSupabase();

      const { data, error } =
        await client.auth.updateUser({
          password: newPassword,
        });

      if (error) throw error;

      return data;
    },


    setToken() {
      // Supabase persists its own session.
      // Retained for application compatibility.
    },


    async logout() {
      if (supabase) {
        const { error } =
          await supabase.auth.signOut();

        if (error) throw error;
      }
    },


    isAuthenticated() {
      return Boolean(supabase);
    },


    async loginWithProvider(
      provider,
      redirectUrl = "/"
    ) {
      const client = requireSupabase();

      const { error } =
        await client.auth.signInWithOAuth({
          provider,

          options: {
            redirectTo:
              `${window.location.origin}${redirectUrl}`,
          },
        });

      if (error) throw error;
    },


    redirectToLogin() {
      window.location.href = "/login";
    },
  },


  /*
   * Database entities.
   */
  entities: Object.fromEntries(
    Object.entries(tableMap).map(
      ([name]) => [
        name,
        new SupabaseEntityHandler(name),
      ]
    )
  ),


  /*
   * Supabase Edge Functions.
   */
  functions: {

    async invoke(
      functionName,
      payload
    ) {
      const client = requireSupabase();

      const { data, error } =
        await client.functions.invoke(
          functionName,
          {
            body: payload,
          }
        );

      if (error) throw error;

      return data;
    },
  },
};


/*
 * Default export.
 */
export default api;

