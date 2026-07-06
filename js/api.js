// 農の里（仮称）Supabase接続の薄いラッパ（P2-1で main.js から利用開始する）
// anon key は公開前提の値（RLSが守る）。service_role キーは絶対にここへ書かない。
(() => {
  const SUPABASE_URL = "https://msnjnyfncnismoxpgndh.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbmpueWZuY25pc21veHBnbmRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjIxMDksImV4cCI6MjA5ODkzODEwOX0.CTxbquk95zJx9UtITm1-EXyhRajNtEXK6KyUWP-N7dc";

  // supabase-js（CDN）が読み込まれていて、キーが設定済みのときだけ有効になる。
  // 未設定の間、フロントは従来どおり mock-data.js で動く。
  const ready = typeof window !== "undefined" && window.supabase && SUPABASE_ANON_KEY.length > 0;

  const client = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  window.NOU_API = {
    enabled: Boolean(client),
    client,

    // P2-1: 読み取り
    async fetchGroups() {
      const { data, error } = await client.from("groups").select("*, group_updates(*)").eq("status", "approved");
      if (error) throw error;
      return data;
    },
    async fetchEvents() {
      const { data, error } = await client
        .from("events")
        .select("*, event_voices(*), event_seeds(seed_id)")
        .eq("status", "published")
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    async fetchSeeds() {
      const { data, error } = await client.from("seeds").select("*").eq("published", true);
      if (error) throw error;
      return data;
    },
    async fetchEventCounts() {
      const { data, error } = await client.from("event_counts").select("*");
      if (error) throw error;
      return data;
    },
  };
})();
