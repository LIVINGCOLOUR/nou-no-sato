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

    // P2-2: 認証（メールのマジックリンク）
    async signInWithEmail(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
    },
    async signOut() {
      await client.auth.signOut();
    },
    async getSession() {
      const { data } = await client.auth.getSession();
      return data.session || null;
    },
    onAuthChange(callback) {
      client.auth.onAuthStateChange((_event, session) => callback(session || null));
    },

    // P2-2: 操作の永続化（気になる／参加予定／活動を受け取る）
    async fetchMyState(userId) {
      const [actions, follows] = await Promise.all([
        client.from("user_event_actions").select("event_id, kind").eq("user_id", userId),
        client.from("follows").select("group_id").eq("user_id", userId),
      ]);
      if (actions.error) throw actions.error;
      if (follows.error) throw follows.error;
      return { actions: actions.data, follows: follows.data };
    },
    async setEventAction(userId, eventId, kind, on) {
      if (on) {
        const { error } = await client
          .from("user_event_actions")
          .upsert({ user_id: userId, event_id: eventId, kind });
        if (error) throw error;
      } else {
        const { error } = await client
          .from("user_event_actions")
          .delete()
          .match({ user_id: userId, event_id: eventId, kind });
        if (error) throw error;
      }
    },
    // P2-3: 栽培記録（RLSにより本人の行しか読み書きできない）
    async fetchMyNotes(userId) {
      const { data, error } = await client
        .from("notes")
        .select("*")
        .eq("user_id", userId)
        .order("noted_on", { ascending: false });
      if (error) throw error;
      return data;
    },
    async createNote(userId, note) {
      const { error } = await client.from("notes").insert({ user_id: userId, ...note });
      if (error) throw error;
    },
    async updateNote(noteId, note) {
      const { error } = await client.from("notes").update(note).eq("id", noteId);
      if (error) throw error;
    },
    async deleteNote(noteId) {
      const { error } = await client.from("notes").delete().eq("id", noteId);
      if (error) throw error;
    },

    async setFollow(userId, groupId, on) {
      if (on) {
        const { error } = await client.from("follows").upsert({ user_id: userId, group_id: groupId });
        if (error) throw error;
      } else {
        const { error } = await client.from("follows").delete().match({ user_id: userId, group_id: groupId });
        if (error) throw error;
      }
    },
  };
})();
