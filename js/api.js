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
    async fetchEquipment() {
      const { data, error } = await client
        .from("equipment_listings")
        .select(
          "*, group:groups(display_name, entity_type), owner:profiles!equipment_listings_owner_id_fkey(nickname)",
        )
        .eq("moderation_status", "approved")
        .neq("availability_status", "archived")
        .order("created_at", { ascending: false });
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
    // P2-4: プロフィール（roleの確認・初回作成）
    async fetchMyProfile(userId) {
      const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async upsertProfile(profile) {
      const { error } = await client.from("profiles").upsert(profile);
      if (error) throw error;
    },

    // P2-4: 団体（申請・編集・便り・イベント登録）
    async fetchMyGroups(userId) {
      const { data, error } = await client.from("groups").select("*").eq("owner_id", userId);
      if (error) throw error;
      return data;
    },
    async createGroup(userId, fields) {
      const { error } = await client.from("groups").insert({ owner_id: userId, ...fields });
      if (error) throw error;
    },
    async updateGroup(groupId, fields) {
      const { error } = await client.from("groups").update(fields).eq("id", groupId);
      if (error) throw error;
    },
    async createGroupUpdate(groupId, title, body) {
      const { error } = await client.from("group_updates").insert({ group_id: groupId, title, body });
      if (error) throw error;
    },
    async createEvent(fields) {
      const { error } = await client.from("events").insert(fields);
      if (error) throw error;
    },

    // 農具シェア: 掲載・利用申請・案件内の受渡確認
    async fetchMyEquipmentListings(userId) {
      const { data, error } = await client
        .from("equipment_listings")
        .select("*, group:groups(display_name, entity_type)")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async createEquipmentListing(userId, fields) {
      const { error } = await client.from("equipment_listings").insert({ owner_id: userId, ...fields });
      if (error) throw error;
    },
    async updateEquipmentAvailability(listingId, availabilityStatus) {
      const { error } = await client
        .from("equipment_listings")
        .update({ availability_status: availabilityStatus })
        .eq("id", listingId);
      if (error) throw error;
    },
    async fetchMyBorrowRequests(userId) {
      const { data, error } = await client
        .from("equipment_requests")
        .select(
          "*, listing:equipment_listings(title, area, fee_type, fee_amount, fee_unit, owner_id, group:groups(display_name, entity_type), owner:profiles!equipment_listings_owner_id_fkey(nickname))",
        )
        .eq("borrower_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async fetchEquipmentRequestsForOwner(userId) {
      const { data, error } = await client
        .from("equipment_requests")
        .select(
          "*, listing:equipment_listings!inner(title, owner_id), borrower:profiles!equipment_requests_borrower_id_fkey(nickname, area)",
        )
        .eq("listing.owner_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async createEquipmentRequest(userId, listingId, fields) {
      const { error } = await client
        .from("equipment_requests")
        .insert({ borrower_id: userId, listing_id: listingId, ...fields });
      if (error) throw error;
    },
    async updateEquipmentRequest(requestId, fields) {
      const { error } = await client.from("equipment_requests").update(fields).eq("id", requestId);
      if (error) throw error;
    },
    async reportEquipmentIncident(requestId, note) {
      const { error } = await client.rpc("report_equipment_incident", { request_id: requestId, note });
      if (error) throw error;
    },

    // P2-4: 運営の承認キュー（RLSにより admin のみ pending が見える・statusを変えられる）
    async fetchPendingGroups() {
      const { data, error } = await client.from("groups").select("*").eq("status", "pending");
      if (error) throw error;
      return data;
    },
    async fetchPendingEvents() {
      const { data, error } = await client.from("events").select("*, groups(display_name)").eq("status", "pending");
      if (error) throw error;
      return data;
    },
    async fetchPendingEquipment() {
      const { data, error } = await client
        .from("equipment_listings")
        .select(
          "*, group:groups(display_name, entity_type), owner:profiles!equipment_listings_owner_id_fkey(nickname)",
        )
        .eq("moderation_status", "pending");
      if (error) throw error;
      return data;
    },
    async setGroupStatus(groupId, status) {
      const { error } = await client.from("groups").update({ status }).eq("id", groupId);
      if (error) throw error;
    },
    async setEventStatus(eventId, status) {
      const { error } = await client.from("events").update({ status }).eq("id", eventId);
      if (error) throw error;
    },
    async setEquipmentModeration(listingId, moderationStatus) {
      const { error } = await client
        .from("equipment_listings")
        .update({ moderation_status: moderationStatus })
        .eq("id", listingId);
      if (error) throw error;
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

    // P2-5: 在来種の情報提供（審査キュー）
    async submitSeedContribution(userId, fields) {
      const { error } = await client.from("seed_contributions").insert({ user_id: userId, ...fields });
      if (error) throw error;
    },
    async fetchPendingContributions() {
      const { data, error } = await client.from("seed_contributions").select("*").eq("status", "pending");
      if (error) throw error;
      return data;
    },
    async resolveSeedContribution(contribution, approve) {
      if (approve) {
        const slug = `contrib-${Date.now()}`;
        const { error: seedError } = await client.from("seeds").insert({
          id: slug,
          name: contribution.seed_name,
          crop_type: contribution.crop_type,
          area: contribution.area,
          source_type: "research_needed",
          source_label: "調査中・情報提供",
          source_name: "住民からの情報提供（運営確認中）",
          description_short: contribution.story,
          data_confidence: "情報提供・確認中",
          location_note: "地図上の位置は確認後に表示します",
          photo: "photo-seed",
        });
        if (seedError) throw seedError;
      }
      const { error } = await client
        .from("seed_contributions")
        .update({ status: approve ? "approved" : "rejected" })
        .eq("id", contribution.id);
      if (error) throw error;
    },

    // P2-5: 栽培記録の写真（非公開バケット・本人のみ）
    async uploadNotePhoto(userId, file) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await client.storage.from("note-photos").upload(path, file);
      if (error) throw error;
      return `storage:${path}`;
    },
    async signNotePhoto(path) {
      const { data, error } = await client.storage.from("note-photos").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
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
