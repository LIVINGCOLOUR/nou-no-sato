const data = window.NOU_NO_SATO_DATA;
// events / friends / seeds はP2-1以降Supabaseから取得して差し替える（失敗時はモックのまま動く）。
// methods / techniques / notes / peers / profile 等は当面静的コンテンツとして mock-data.js を正とする。
let { events, friends, seeds } = data;
let equipment = data.equipment || [];
const { methods, notes, profile, routes, peers, onboarding, techniques } = data;

const app = document.querySelector("#app");

// 軽い操作状態。気になる/受け取る/つながるはブラウザに保存して再訪でも残す。
// フィルタはセッション内のみ。記録・プロフィール・フォーム入力は保存しない。
const ui = {
  interested: new Set(), // 気になるイベント
  joined: new Set(), // 予定メモに入れたイベント
  following: new Set(), // 活動を受け取る団体
  invited: new Set(), // イベントに誘った個人
  memberMethod: "all", // 仲間ページの農法フィルタ
  memberArea: "all", // 仲間ページの地域フィルタ
  eventType: "all", // イベントページの種別フィルタ
  eventArea: "all", // イベントページの地域フィルタ
  equipmentCategory: "all", // 農具シェアの種類フィルタ
  equipmentArea: "all", // 農具シェアの地域フィルタ
  noteCrop: "all", // 栽培記録の作物フィルタ
};

const STORE_KEY = "nounosato:ui";
const PERSISTED = ["interested", "joined", "following", "invited"];

// ログイン状態（P2-2）。null のときは従来どおり localStorage のみで動く。
let session = null;
let authEmailSent = false;
const dbConnected = () => document.documentElement.dataset.source === "supabase";

// 管理画面の一時メッセージ（1回表示したら消える）
let manageNotice = "";
const manageNoticeBlock = () => {
  if (!manageNotice) return "";
  const text = manageNotice;
  manageNotice = "";
  return `<p class="welcome-banner">${escapeHtml(text)}</p>`;
};

// 「時刻 内容」を / か改行区切りで書いたテキストを schedule 配列にする。
const parseScheduleText = (text) =>
  (text || "")
    .split(/\r?\n|\/|／/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S{1,7})\s+(.+)$/);
      return match ? { time: match[1], label: match[2] } : { time: "", label: line };
    });

// 自分のプロフィールと団体（P2-4）
let myProfile = null;
let myGroups = null;
let myEquipmentListings = null;
let myBorrowRequests = null;
let equipmentRequestsForOwner = null;
const isAdmin = () => myProfile?.role === "admin";
const myApprovedGroup = () => (myGroups || []).find((group) => group.status === "approved") || null;

const loadMyProfile = async () => {
  if (!session || !dbConnected() || !window.NOU_API?.enabled) {
    myProfile = null;
    return;
  }
  try {
    myProfile = await window.NOU_API.fetchMyProfile(session.user.id);
    if (!myProfile) {
      const nickname = (session.user.email || "").split("@")[0].slice(0, 30) || "メンバー";
      await window.NOU_API.upsertProfile({ id: session.user.id, nickname });
      myProfile = await window.NOU_API.fetchMyProfile(session.user.id);
    }
  } catch (error) {
    console.warn("プロフィールの読み込みに失敗しました。", error);
    myProfile = null;
  }
};

const loadMyGroups = async () => {
  if (!session || !dbConnected() || !window.NOU_API?.enabled) {
    myGroups = null;
    return;
  }
  try {
    myGroups = await window.NOU_API.fetchMyGroups(session.user.id);
  } catch (error) {
    console.warn("団体情報の読み込みに失敗しました。", error);
    myGroups = null;
  }
};

// 自分の栽培記録（P2-3）。null = 未ログアウトまたは未読込 → 記入例（mock）を表示。
let myNotes = null;
const activeNotes = () => myNotes ?? notes;
const usingOwnNotes = () => myNotes !== null;

const dbNoteToUi = (row) => {
  const isStorage = (row.photo || "").startsWith("storage:");
  return {
    id: row.id,
    date: (row.noted_on || "").replaceAll("-", "/"),
    crop: row.crop,
    method: row.method,
    memo: row.memo,
    learning: row.learning,
    photo: !row.photo || isStorage ? "photo-sprout" : row.photo,
    photoPath: isStorage ? row.photo.slice("storage:".length) : null,
    photoUrl: null,
  };
};

const loadMyNotes = async () => {
  if (!session || !dbConnected() || !window.NOU_API?.enabled) {
    myNotes = null;
    return;
  }
  try {
    const rows = await window.NOU_API.fetchMyNotes(session.user.id);
    const list = rows.map(dbNoteToUi);
    await Promise.all(
      list
        .filter((note) => note.photoPath)
        .map(async (note) => {
          try {
            note.photoUrl = await window.NOU_API.signNotePhoto(note.photoPath);
          } catch (error) {
            console.warn("写真の表示URL取得に失敗しました。", error);
          }
        }),
    );
    myNotes = list;
  } catch (error) {
    console.warn("栽培記録の読み込みに失敗しました。", error);
    myNotes = null;
  }
};

const loadUi = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    PERSISTED.forEach((key) => {
      if (Array.isArray(raw[key])) ui[key] = new Set(raw[key]);
    });
  } catch (_) {
    // 保存が読めなくても初期状態で続行する。
  }
};

const saveUi = () => {
  try {
    const payload = {};
    PERSISTED.forEach((key) => {
      payload[key] = [...ui[key]];
    });
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch (_) {
    // 保存できない環境（プライベートモード等）でも操作は継続する。
  }
};

const iconPaths = {
  users:
    "M8 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm8.5 1a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7ZM2 21c.6-4 2.8-6.5 6-6.5S13.4 17 14 21H2Zm12.5 0c-.2-1.7-.8-3.2-1.7-4.3 1-.8 2.2-1.2 3.7-1.2 2.9 0 4.9 2.1 5.5 5.5h-7.5Z",
  calendar: "M5 3h2v2h10V3h2v2h2v16H3V5h2V3Zm14 8H5v8h14v-8Z",
  book:
    "M4 5.5C6.6 4.2 9.4 4.2 12 5.5c2.6-1.3 5.4-1.3 8 0V20c-2.6-1.2-5.4-1.2-8 0-2.6-1.2-5.4-1.2-8 0V5.5Zm7 2C9.4 6.8 7.7 6.7 6 7.2v9.9c1.7-.4 3.4-.3 5 .3V7.5Zm2 9.9c1.6-.6 3.3-.7 5-.3V7.2c-1.7-.5-3.4-.4-5 .3v9.9Z",
  note: "M5 3h12l2 2v16H5V3Zm3 5h8V6H8v2Zm0 4h8v-2H8v2Zm0 4h5v-2H8v2Z",
  map:
    "M4 4.5 10 2l5 2.5L20 2v17.5L15 22l-5-2.5L4 22V4.5Zm7 .9v12.4l3 1.5V6.9l-3-1.5Z",
  shield:
    "M12 2 20 5v6c0 5-3.1 9-8 11-4.9-2-8-6-8-11V5l8-3Zm0 4.1L7 8v3c0 3.3 1.8 5.9 5 7.5 3.2-1.6 5-4.2 5-7.5V8l-5-1.9Z",
  tools:
    "M14.7 3.3a5 5 0 0 0-6.2 6.2L3 15v4h4l5.5-5.5a5 5 0 0 0 6.2-6.2l-3 3-2-2 3-3-2-2ZM5 17l4.8-4.8 2 2L7 19H5v-2Z",
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const svgIcon = (name) => `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="${iconPaths[name] ?? iconPaths.book}"></path>
  </svg>
`;

const getHashParts = () => {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const normalized = raw || "home";
  return normalized.split("/").filter(Boolean);
};

const setPageTitle = (title) => {
  document.title = title ? `${title} | 農の里（仮称）` : "農の里（仮称）";
};

const methodById = (id) => methods.find((method) => method.id === id);
const techniqueById = (id) => techniques.find((technique) => technique.id === id);
const eventById = (id) => events.find((event) => event.id === id);
const seedById = (id) => seeds.find((seed) => seed.id === id);
const groupById = (id) => friends.find((group) => group.id === id);
const equipmentById = (id) => equipment.find((item) => item.id === id);
const eventsByGroup = (id) => events.filter((event) => event.hostGroupId === id);
const seedsByGroup = (id) => seeds.filter((seed) => seed.relatedGroupId === id);

// 種の交換会の約束事。販売にせず、種苗法（登録品種）に配慮した交換の場として運用する。
const SEED_EXCHANGE_RULES = [
  "在来種・固定種を中心に、自分で育てて採った種を少量ずつ持ち寄ります。",
  "品種登録された品種（登録品種）の種苗は交換に出しません。種袋の表示などで確認します。",
  "販売・出品の場ではありません。無償の交換・お裾分けとして行います。",
  "「いつ・どこで・どう育てたか」の来歴をひとこと添えて渡します。",
];

const seedExchangeEvents = () => events.filter((event) => event.seedExchange);

const seedExchangeRulesBlock = () => `
  <div class="exchange-rules">
    <h2>種の交換会の約束事</h2>
    <ul class="check-list">
      ${SEED_EXCHANGE_RULES.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}
    </ul>
    <p class="form-help">種の背景は<a class="text-link" href="#/native-map">在来種マップ</a>で、種の採り方は<a class="text-link" href="#/techniques/seed-saving">自家採種のページ</a>で学べます。</p>
  </div>
`;

const capacityNum = (event) => parseInt(event.capacity, 10) || 0;
const isPopular = (event) => {
  const cap = capacityNum(event);
  return (cap > 0 && event.attending / cap >= 0.7) || (event.interestedCount || 0) >= 12;
};
// 表示上の「気になる」人数（他の人の数＋自分が押していれば+1）。
const interestedTotal = (event) => (event.interestedCount || 0) + (ui.interested.has(event.id) ? 1 : 0);
// 表示上の予定メモ人数（自分が予定メモに入れていれば+1）。
const attendingTotal = (event) => (event.attending || 0) + (ui.joined.has(event.id) ? 1 : 0);

// 日付は「M/D」表記。年はプロトタイプの想定年で補う。
const EVENT_YEAR = 2026;
const parseEventDate = (text) => {
  if (!text) return null;
  const [month, day] = text.split("/").map(Number);
  if (!month || !day) return null;
  return new Date(EVENT_YEAR, month - 1, day);
};
const todayDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// 募集ステータス: past(終了) / deadline-soon(締切間近) / few-left(残りわずか) / open(募集中)
const eventStatus = (event) => {
  const now = todayDate();
  const date = parseEventDate(event.date);
  if (date && date < now) return "past";
  const deadline = parseEventDate(event.deadline);
  if (deadline) {
    const daysLeft = Math.round((deadline - now) / 86400000);
    if (daysLeft < 0) return "past";
    if (daysLeft <= 5) return "deadline-soon";
  }
  const remaining = capacityNum(event) - attendingTotal(event);
  if (remaining > 0 && remaining <= 2) return "few-left";
  return "open";
};

const statusBadge = (event) => {
  const status = eventStatus(event);
  if (status === "past") return `<span class="tag tag-status-past">終了</span>`;
  if (status === "deadline-soon") return `<span class="tag tag-status-urgent">締切間近</span>`;
  if (status === "few-left") return `<span class="tag tag-status-urgent">残りわずか</span>`;
  return `<span class="tag tag-status-open">募集中</span>`;
};

const eventMonthLabel = (event) => {
  const date = parseEventDate(event.date);
  return date ? `${date.getMonth() + 1}月` : "日程調整中";
};

const upcomingEvents = () =>
  events
    .filter((event) => eventStatus(event) !== "past")
    .sort((a, b) => (parseEventDate(a.date) ?? 0) - (parseEventDate(b.date) ?? 0));

// 「イベントに誘う」の誘い先を具体的にするため、その人の地域で近く開かれるイベントを提案する。
const suggestEventFor = (peer) => {
  const list = upcomingEvents();
  return list.find((event) => peer.area && event.place.includes(peer.area)) || list[0] || null;
};

const nextEventOf = (groupId) => upcomingEvents().find((event) => event.hostGroupId === groupId) || null;

// ホームに「動き」を出すため、全団体の季節の便りを新しい順にまとめる。
const latestGroupUpdates = (count = 2) =>
  friends
    .flatMap((group) => (group.updates || []).map((item) => ({ ...item, groupId: group.id, groupName: group.displayName })))
    .sort((a, b) => (parseEventDate(b.date) ?? 0) - (parseEventDate(a.date) ?? 0))
    .slice(0, count);

const renderTags = (items) => items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");

const backLink = (href, label = "戻る") => `<a class="back-link" href="${href}">${label}</a>`;

const actionGuide = (items) => `
  <div class="action-guide" aria-label="操作の意味">
    ${items.map((item) => `<p><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.text)}</span></p>`).join("")}
  </div>
`;

// セッション内で実際に切り替わる軽いトグル（気になる / 予定メモ / 受け取る / 誘う）。
const actionButton = ({ kind, id, on, off, primary = false }) => {
  const active = ui[kind].has(id);
  return `
    <button
      class="pill-toggle ${primary ? "pill-primary" : ""} ${active ? "is-on" : ""}"
      type="button"
      data-toggle="${kind}"
      data-id="${escapeHtml(id)}"
      data-on="${escapeHtml(on)}"
      data-off="${escapeHtml(off)}"
      aria-pressed="${active}"
    >
      <span class="pill-toggle-icon" aria-hidden="true">${active ? "✓" : "＋"}</span>
      <span class="pill-toggle-label">${escapeHtml(active ? on : off)}</span>
    </button>
  `;
};

const filterChips = (key, options) => `
  <div class="toolbar" role="group" aria-label="絞り込み">
    ${options
      .map((opt) => {
        const active = (ui[key] ?? "all") === opt.value;
        return `<button type="button" class="chip ${active ? "is-active" : ""}" data-filter="${key}" data-value="${escapeHtml(opt.value)}" aria-pressed="${active}">${escapeHtml(opt.label)}</button>`;
      })
      .join("")}
  </div>
`;

const methodFilterOptions = [
  { value: "all", label: "すべて" },
  { value: "自然農", label: "自然農" },
  { value: "自然栽培", label: "自然栽培" },
  { value: "有機農法", label: "有機農法" },
  { value: "菌ちゃん農法", label: "菌ちゃん農法" },
];

const buildEventTypeOptions = () => [
  { value: "all", label: "すべて" },
  ...[...new Set(events.map((event) => event.type))].map((type) => ({ value: type, label: type })),
];

const buildAreaFilterOptions = () => [
  { value: "all", label: "すべての地域" },
  ...[...new Set([...peers.filter((peer) => !peer.isMe), ...friends].map((item) => item.area))].map((area) => ({
    value: area,
    label: area,
  })),
];

const buildEventAreaOptions = () => [
  { value: "all", label: "すべての地域" },
  ...[...new Set(events.map((event) => event.place))].map((place) => ({ value: place, label: place })),
];

let eventTypeOptions = buildEventTypeOptions();
let areaFilterOptions = buildAreaFilterOptions();
let eventAreaOptions = buildEventAreaOptions();

const rebuildFilterOptions = () => {
  eventTypeOptions = buildEventTypeOptions();
  areaFilterOptions = buildAreaFilterOptions();
  eventAreaOptions = buildEventAreaOptions();
};

const officialLinks = (links) => {
  if (!links) return "";
  const items = [
    links.website ? { label: "公式サイト", url: links.website } : null,
    links.instagram ? { label: "Instagram", url: links.instagram } : null,
    links.sns ? { label: "公式SNS", url: links.sns } : null,
  ].filter(Boolean);
  if (!items.length) return "";
  return `
    <div class="link-row">
      ${items
        .map(
          (item) =>
            `<a class="official-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}<span aria-hidden="true">↗</span></a>`,
        )
        .join("")}
    </div>
  `;
};

// 英字だけの飾りラベルはスマホでは非表示にする（.eyebrow-en）。日本語の説明は残す。
const isLatinLabel = (text) => /^[\x20-\x7E]+$/.test(text || "");

const pageFrame = ({ eyebrow, title, copy, body, actions = "", tone = "" }) => `
  <section class="page ${tone}">
    <header class="page-heading">
      <p class="eyebrow${isLatinLabel(eyebrow) ? " eyebrow-en" : ""}">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      ${copy ? `<p>${escapeHtml(copy)}</p>` : ""}
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </header>
    ${body}
  </section>
`;

const sectionHeading = (icon, eyebrow, title, copy = "") => `
  <div class="section-heading compact-heading">
    <span class="section-number">${svgIcon(icon)}</span>
    <div>
      <p class="eyebrow${isLatinLabel(eyebrow) ? " eyebrow-en" : ""}">${escapeHtml(eyebrow)}</p>
      <h2>${escapeHtml(title)}</h2>
      ${copy ? `<p>${escapeHtml(copy)}</p>` : ""}
    </div>
  </div>
`;

const routeCards = (ids) => {
  const list = ids ? ids.map((id) => routes.find((route) => route.id === id)).filter(Boolean) : routes;
  return `
    <div class="route-grid">
      ${list
        .map(
          (route) => `
            <a class="route-card" href="${route.path}">
              <span class="route-icon">${svgIcon(route.icon)}</span>
              <span>
                <h3>${escapeHtml(route.title)}</h3>
                <p>${escapeHtml(route.text)}</p>
              </span>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
};

const onboardingSection = () => `
  <section class="section-block">
    ${sectionHeading("book", "First Step", "はじめての方へ", "3つの小さなステップから。")}
    <ol class="onboard-grid">
      ${onboarding
        .map(
          (item) => `
            <li class="onboard-card">
              <span class="onboard-step" aria-hidden="true">${escapeHtml(item.step)}</span>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.text)}</p>
              <a class="card-action" href="${item.path}">${escapeHtml(item.cta)}</a>
            </li>
          `,
        )
        .join("")}
    </ol>
  </section>
`;

const eventCard = (event, compact = false) => {
  const isPast = eventStatus(event) === "past";
  return `
  <article class="event-card ${compact ? "card-compact" : ""} ${isPast ? "card-past" : ""}">
    <div class="event-top">
      <div class="event-date">${escapeHtml(event.date)}<small>${escapeHtml(event.day)}</small></div>
      <div>
        <h3>${escapeHtml(event.title)}</h3>
        <p class="event-line">${escapeHtml(event.place)}｜${escapeHtml(event.time)}｜定員${escapeHtml(event.capacity)}｜${escapeHtml(event.fee || "無料")}</p>
        <p class="event-desc">${escapeHtml(event.description)}</p>
        <p class="event-host">主催：${escapeHtml(event.host)}</p>
      </div>
    </div>
    <div class="tag-row event-tags">
      ${statusBadge(event)}
      ${!isPast && isPopular(event) ? `<span class="tag tag-popular">人気</span>` : ""}
      <span class="tag">${escapeHtml(event.type)}</span>
      <span class="tag">運営登録</span>
    </div>
    ${
      compact
        ? `<a class="card-action" href="#/events/${event.id}">詳細を見る</a>`
        : isPast
          ? `<a class="card-action" href="#/events/${event.id}">当日の様子・声を見る</a>`
          : `<div class="action-row">
              ${actionButton({ kind: "interested", id: event.id, on: "気になるに追加済み", off: "気になる" })}
              <a class="card-action card-action-inline" href="#/events/${event.id}">詳細を見る</a>
            </div>`
    }
  </article>
`;
};

const peerCard = (peer) => {
  const me = peers.find((item) => item.isMe);
  const shared = !peer.isMe && me ? (peer.methods || []).filter((m) => (me.methods || []).includes(m)) : [];
  const suggestion = peer.isMe ? null : suggestEventFor(peer);
  return `
  <article class="peer-card">
    <div class="peer-top">
      <span class="peer-photo ${peer.photo}" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(peer.nickname)}${peer.isMe ? '<span class="peer-me">あなた</span>' : ""}</strong>
        <em>${escapeHtml(peer.area)}｜${escapeHtml(peer.status)}</em>
      </div>
    </div>
    <p class="peer-line">${escapeHtml(peer.oneLiner)}</p>
    <div class="tag-row">${renderTags(peer.methods)}</div>
    ${shared.length ? `<p class="peer-common">あなたと同じ関心：${shared.map(escapeHtml).join("・")}</p>` : ""}
    <p class="peer-looking"><span>さがしている：</span>${escapeHtml(peer.lookingFor)}</p>
    ${
      suggestion
        ? `<p class="peer-suggest"><span>一緒に行けそうなイベント：</span><a href="#/events/${suggestion.id}">${escapeHtml(suggestion.date)}(${escapeHtml(suggestion.day)}) ${escapeHtml(suggestion.title)}</a></p>`
        : ""
    }
    ${
      peer.isMe
        ? `<a class="card-action" href="#/mypage">自分のページを見る</a>`
        : actionButton({ kind: "invited", id: peer.id, on: "イベントに誘いました", off: "イベントに誘う" })
    }
    <span class="privacy-note">ニックネーム・市町村程度のみ</span>
  </article>
`;
};

const friendCard = (friend) => `
  <article class="friend-card">
    <details>
      <summary>
        <span class="friend-photo ${friend.photo}" aria-hidden="true"></span>
        <span>
          <strong>${escapeHtml(friend.displayName)}</strong>
          <em>${escapeHtml(friend.area)}｜${friend.entityType === "farmer" ? "農家・農園" : "団体・サークル"}｜${escapeHtml(friend.status)}</em>
        </span>
      </summary>
      <div class="detail-panel">
        ${friend.interest ? `<h3>${escapeHtml(friend.interest)}</h3>` : ""}
        <div class="tag-row">${renderTags(friend.methods)}</div>
        <p>${escapeHtml(friend.note)}</p>
        <p class="rhythm-line"><strong>活動リズム：</strong>${escapeHtml(friend.rhythm)}</p>
        ${friend.welcome ? `<p class="welcome-line">${escapeHtml(friend.welcome)}</p>` : ""}
        ${(() => {
          const nextEvent = nextEventOf(friend.id);
          return nextEvent
            ? `<p class="next-event-line"><strong>次のイベント：</strong><a href="#/events/${nextEvent.id}">${escapeHtml(nextEvent.date)}(${escapeHtml(nextEvent.day)}) ${escapeHtml(nextEvent.title)}</a>${statusBadge(nextEvent)}</p>`
            : "";
        })()}
        ${officialLinks(friend.links)}
        <div class="action-row">
          ${actionButton({ kind: "following", id: friend.id, on: "活動を受け取り中", off: "活動を受け取る" })}
          <a class="card-action card-action-inline" href="#/groups/${friend.id}">${friend.entityType === "farmer" ? "農園" : "団体"}ページ・イベントを見る</a>
        </div>
        <span class="privacy-note">市町村程度・直接連絡先なし・イベント参加でつながる</span>
      </div>
    </details>
  </article>
`;

const methodCard = (method) => `
  <article class="method-card method-${method.color}">
    <h3>${escapeHtml(method.name)}</h3>
    <p>${escapeHtml(method.summary)}</p>
    <p class="method-entry"><strong>入口:</strong> ${escapeHtml(method.entry)}</p>
    <a class="card-action" href="#/learn/${method.id}">詳しく見る</a>
  </article>
`;

const noteCard = (note, own = false) => `
  <article class="note-card">
    <div class="note-top">
      <div class="note-photo ${note.photoUrl ? "note-photo-real" : note.photo}" aria-hidden="true">${
        note.photoUrl ? `<img src="${note.photoUrl}" alt="" loading="lazy" />` : ""
      }</div>
      <div>
        <h3>${escapeHtml(note.date)}｜${escapeHtml(note.crop)}</h3>
        <p>${escapeHtml(note.memo)}</p>
      </div>
    </div>
    ${note.learning ? `<p class="note-learning"><span>学び：</span>${escapeHtml(note.learning)}</p>` : ""}
    <div class="tag-row">
      ${note.method ? `<span class="tag">${escapeHtml(note.method)}</span>` : ""}
      <span class="tag">非公開</span>
      <span class="tag">位置情報なし</span>
    </div>
    ${
      own
        ? `<div class="action-row note-actions">
            <a class="card-action card-action-inline" href="#/notes/edit/${note.id}">編集</a>
            <button type="button" class="card-action card-action-inline note-delete" data-note-delete="${note.id}">削除</button>
          </div>`
        : ""
    }
  </article>
`;

const sourceBadge = (seed) =>
  seed.sourceType === "research_needed"
    ? `<span class="source-badge badge-research">${escapeHtml(seed.sourceLabel)}</span>`
    : `<span class="source-badge badge-source">${escapeHtml(seed.sourceLabel)}</span>`;

const nativeVisualClassById = {
  "ibaraki-red-negi": "photo-native-red-negi",
  "ukishima-daikon": "photo-native-ukishima-daikon",
};

const EQUIPMENT_CATEGORY_LABELS = {
  hand_tool: "手動農具",
  small_powered: "小型動力農機",
  material: "農業資材",
};
const EQUIPMENT_FEE_UNIT_LABELS = { half_day: "半日", day: "1日", week: "1週間" };
const CONSUMABLES_LABELS = {
  included: "貸出料金に含む",
  actual_cost: "使用分を当事者間で確認",
  owner: "通常使用分は貸し手負担",
};
const EQUIPMENT_REQUEST_STATUS = {
  pending: "確認待ち",
  approved: "承認済み・受渡調整",
  declined: "今回は見送り",
  cancelled: "取り消し",
  handed_over: "貸出中",
  returned: "返却確認済み",
  incident: "使用停止・状態確認中",
};

const equipmentFeeLabel = (item) =>
  item.feeType === "free"
    ? "無料"
    : `${Number(item.feeAmount || 0).toLocaleString("ja-JP")}円／${EQUIPMENT_FEE_UNIT_LABELS[item.feeUnit] || "1日"}`;

const equipmentOwnerLabel = (item) =>
  item.ownerType === "farmer" ? "農家・農園" : item.ownerType === "group" ? "団体・サークル" : "個人";

const equipmentCard = (item) => `
  <article class="equipment-card">
    <div class="equipment-photo ${escapeHtml(item.photo || "photo-tool-generic")}" aria-hidden="true"></div>
    <div class="equipment-card-body">
      <div class="tag-row">
        <span class="tag">${escapeHtml(EQUIPMENT_CATEGORY_LABELS[item.category] || "農具")}</span>
        <span class="tag ${item.riskLevel === "powered" ? "tag-status-urgent" : "tag-status-open"}">${item.riskLevel === "powered" ? "操作確認が必要" : "低危険度"}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.area)}｜${escapeHtml(equipmentOwnerLabel(item))}：${escapeHtml(item.ownerName)}</p>
      <p class="equipment-fee">${escapeHtml(equipmentFeeLabel(item))}</p>
      <p>${escapeHtml(item.description)}</p>
      <div class="equipment-condition"><strong>${escapeHtml(item.conditionLabel || "状態を確認")}</strong><span>最終点検 ${escapeHtml(item.lastInspectedOn || "未記入")}</span></div>
      <a class="card-action" href="#/tools/${item.id}">状態・条件を見る</a>
    </div>
  </article>
`;

const communitySubnav = (active) => `
  <nav class="local-tabs" aria-label="地域でつながるメニュー">
    <a href="#/members" class="${active === "members" ? "is-active" : ""}"${active === "members" ? ' aria-current="page"' : ""}>仲間・農家・団体</a>
    <a href="#/tools" class="${active === "tools" ? "is-active" : ""}"${active === "tools" ? ' aria-current="page"' : ""}>農具シェア</a>
  </nav>
`;

const loadMyEquipment = async () => {
  if (!session || !dbConnected() || !window.NOU_API?.enabled) {
    myEquipmentListings = null;
    myBorrowRequests = null;
    equipmentRequestsForOwner = null;
    return;
  }
  try {
    [myEquipmentListings, myBorrowRequests, equipmentRequestsForOwner] = await Promise.all([
      window.NOU_API.fetchMyEquipmentListings(session.user.id),
      window.NOU_API.fetchMyBorrowRequests(session.user.id),
      window.NOU_API.fetchEquipmentRequestsForOwner(session.user.id),
    ]);
  } catch (error) {
    console.warn("農具シェアの利用状況を読み込めませんでした。DB更新前の可能性があります。", error);
    myEquipmentListings = null;
    myBorrowRequests = null;
    equipmentRequestsForOwner = null;
  }
};

const seedPhotoClass = (seed) => nativeVisualClassById[seed.id] || seed.photo || "photo-map";

const seedCard = (seed) => `
  <article class="seed-card">
    <div class="seed-top">
      <div class="seed-photo ${seedPhotoClass(seed)}" aria-hidden="true"></div>
      <div>
        <h3>${escapeHtml(seed.name)}</h3>
        <p class="seed-meta">${escapeHtml(seed.cropType)}｜${escapeHtml(seed.area)}</p>
      </div>
    </div>
    <p>${escapeHtml(seed.descriptionShort)}</p>
    <div class="tag-row">
      ${sourceBadge(seed)}
      <span class="tag">位置は地域の目安</span>
    </div>
    <a class="card-action" href="#/native-varieties/${seed.id}">背景・出典を見る</a>
  </article>
`;

const voicesBlock = (voices) =>
  !voices || !voices.length
    ? ""
    : `
      <section class="section-block">
        ${sectionHeading("users", "Voices", "参加した人の声", "実際に来た人の感想です。雰囲気の参考にどうぞ。")}
        <div class="voice-list">
          ${voices
            .map(
              (voice) =>
                `<blockquote class="voice-card"><p>「${escapeHtml(voice.text)}」</p><cite>${escapeHtml(voice.who)}</cite></blockquote>`,
            )
            .join("")}
        </div>
      </section>
    `;

const updatesBlock = (updates) =>
  !updates || !updates.length
    ? ""
    : `
      <section class="section-block">
        ${sectionHeading("note", "Notice", "季節の便り", "団体からの一方向のお知らせです。コメントやチャットはありません。")}
        <div class="update-list">
          ${updates
            .map(
              (item) =>
                `<article class="update-card"><span class="update-date">${escapeHtml(item.date)}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div></article>`,
            )
            .join("")}
        </div>
      </section>
    `;

const relatedSeedsBlock = (ids, heading = "この会に関わる在来種") => {
  const list = (ids || []).map(seedById).filter(Boolean);
  if (!list.length) return "";
  return `
    <section class="section-block">
      ${sectionHeading("map", "Related Seeds", heading, "学びと地域の種をつなげて見られます。")}
      <div class="card-grid compact-grid">${list.map(seedCard).join("")}</div>
    </section>
  `;
};

const renderHome = () =>
  pageFrame({
    eyebrow: "自然に寄り添う農業に関心がある人へ",
    title: "農の里（仮称）",
    copy: "",
    tone: "home-view",
    body: `
      <section class="hero-panel" aria-label="農の里の概要">
        <div class="hero-visual" aria-hidden="true">
          <picture>
            <source media="(max-width: 640px)" srcset="./assets/visuals/hero-satoyama-mobile.jpg" />
            <img class="hero-image" src="./assets/visuals/hero-satoyama.jpg" alt="" />
          </picture>
        </div>
        <div class="hero-copy-panel">
          <h2>自然に寄り添う農法に関心がある仲間と、地元でつながる。</h2>
          <div class="hero-actions">
            <a class="button button-primary" href="#/events">近くのイベントを見る</a>
            <a class="button button-light" href="#/native-map">在来種マップを見る</a>
          </div>
        </div>
      </section>

      <ul class="trust-strip" aria-label="このアプリの方針">
        <li>市町村程度の地域表示</li>
        <li>栽培記録は基本非公開</li>
        <li>農法比較は優劣なし</li>
      </ul>

      <section class="section-block">
        ${sectionHeading("calendar", "Upcoming", "近日のイベント", "直近の3件。「気になる」を押して、行くかは後で決められます。")}
        ${actionGuide([
          { label: "気になる", text: "あとで見返すための印。申込ではありません。" },
          { label: "予定メモ", text: "行けそうな会を自分用に残します。正式申込は主催団体からの案内で行います。" },
        ])}
        <div class="card-grid event-grid">${upcomingEvents()
          .slice(0, 3)
          .map((event) => eventCard(event))
          .join("")}</div>
        <p class="form-help"><a class="text-link" href="#/events">すべてのイベントを見る</a></p>
      </section>

      ${onboardingSection()}

      <section class="section-block">
        ${sectionHeading("note", "Notice", "地域の最近の便り", "団体からの一方向のお知らせです。気になる団体は「活動を受け取る」でどうぞ。")}
        <div class="update-list">
          ${latestGroupUpdates(2)
            .map(
              (item) =>
                `<article class="update-card"><span class="update-date">${escapeHtml(item.date)}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p><a class="text-link" href="#/groups/${item.groupId}">${escapeHtml(item.groupName)}のページへ</a></div></article>`,
            )
            .join("")}
        </div>
      </section>

      <section class="section-block">
        ${sectionHeading("note", "More", "ほかにできること", "記録、在来種、地域の農具も、いつでもどうぞ。")}
        ${routeCards(["notes", "native-map", "tools"])}
      </section>

      <section class="section-block">
        ${sectionHeading("users", "For Hosts", "農家・団体・サークルの方へ", "イベントを開く側、農具を貸す側として参加しませんか。")}
        <a class="route-card" href="#/manage">
          <span class="route-icon">${svgIcon("users")}</span>
          <span>
            <h3>農家・団体・活動を登録する</h3>
            <p>プロフィール、イベント、農具を登録できます。一般公開は運営の審査・承認を経て始まります。</p>
          </span>
        </a>
      </section>
    `,
  });

const renderMembers = () => {
  const method = ui.memberMethod;
  const area = ui.memberArea;
  const matchItem = (item) =>
    (method === "all" || (item.methods || []).includes(method)) &&
    (area === "all" || item.area === area);
  const peerList = peers.filter(matchItem);
  const groupList = friends.filter(matchItem);
  const farmerCount = friends.filter((item) => item.entityType === "farmer").length;
  const groupCount = friends.length - farmerCount;

  const emptyNote = (label) =>
    `<p class="empty-note">この条件に当てはまる${label}はまだ少ないようです。関心や地域を変えて探してみてください。</p>`;

  return pageFrame({
    eyebrow: "Local Friends",
    title: "仲間を探す",
    copy: "同じ地域・同じ関心の人を、ゆるく探せます。まずは眺めるだけでも大丈夫。",
    body: `
      ${communitySubnav("members")}
      <div class="peer-band">
        <div><strong>${peers.length}</strong><span>近くの個人</span></div>
        <div><strong>${farmerCount}</strong><span>地域の農家</span></div>
        <div><strong>${groupCount}</strong><span>地域の団体</span></div>
        <p class="peer-band-note">ニックネームと市町村程度だけを表示します。本名・詳細住所・畑の正確な位置は出しません。</p>
      </div>

      <div class="filter-stack">
        <div class="filter-row"><span class="filter-label">関心</span>${filterChips("memberMethod", methodFilterOptions)}</div>
        <div class="filter-row"><span class="filter-label">地域</span>${filterChips("memberArea", areaFilterOptions)}</div>
      </div>

      <section class="section-block">
        ${sectionHeading("users", "Individuals", "近くの個人", "同じくらいの段階の人と、ゆるく知り合えます。")}
        ${peerList.length ? `<div class="card-grid">${peerList.map(peerCard).join("")}</div>` : emptyNote("個人")}
        <p class="form-help">気になった人は、まずイベントに誘ってみましょう。より深くやりとりするための連絡先の交換は、イベントで直接会ったときに個人どうしでどうぞ。</p>
      </section>

      <section class="section-block">
        ${sectionHeading("users", "Farms & Groups", "地域の農家・団体・サークル", "畑見学や体験会など、イベント参加からつながれます。")}
        <p class="form-help">農家・団体・活動者の方へ：<a class="text-link" href="#/manage">プロフィール、イベント、農具の登録はこちら（運営審査あり）</a></p>
        ${groupList.length ? `<div class="card-grid">${groupList.map(friendCard).join("")}</div>` : emptyNote("農家・団体")}
      </section>
    `,
  });
};

const renderTools = () => {
  const categoryOptions = [
    { value: "all", label: "すべて" },
    ...Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  ];
  const areaOptions = [
    { value: "all", label: "すべての地域" },
    ...[...new Set(equipment.map((item) => item.area).filter(Boolean))].map((area) => ({ value: area, label: area })),
  ];
  const list = equipment.filter(
    (item) =>
      (ui.equipmentCategory === "all" || item.category === ui.equipmentCategory) &&
      (ui.equipmentArea === "all" || item.area === ui.equipmentArea) &&
      item.availabilityStatus !== "archived",
  );

  return pageFrame({
    eyebrow: "Local Tool Share",
    title: "農具を借りる・貸す",
    copy: "地域の手動農具や個人向け小型農機を、状態と約束を確認して貸し借りします。無料・有料のどちらにも対応します。",
    actions: `<a class="button button-primary" href="#/manage/tools/new">農具を掲載する</a><a class="button button-light" href="#/manage/tools">貸し借りの状況</a>`,
    body: `
      ${communitySubnav("tools")}
      <section class="safety-summary" aria-label="農具シェアの基本方針">
        <div><strong>正確な受渡場所は承認後</strong><span>一覧では市町村程度までです。</span></div>
        <div><strong>一般DMはありません</strong><span>承認済み案件内の受渡連絡だけです。</span></div>
        <div><strong>故障時はまず使用停止</strong><span>無断で分解・修理せず、状態を記録します。</span></div>
      </section>
      <p class="form-help">貸し借りの契約、料金精算、破損・修理の協議は貸し手と借り手の間で行います。運営は農具の安全性を保証せず、賠償額の判定や立替は行いません。ただし危険・虚偽掲載は運営確認の対象です。</p>

      <div class="filter-stack">
        <div class="filter-row"><span class="filter-label">種類</span>${filterChips("equipmentCategory", categoryOptions)}</div>
        <div class="filter-row"><span class="filter-label">地域</span>${filterChips("equipmentArea", areaOptions)}</div>
      </div>

      <section class="section-block">
        ${sectionHeading("tools", "Available", "貸し出せる農具", "状態、料金、点検日、使い方の条件を確認してから申請します。")}
        ${list.length ? `<div class="equipment-grid">${list.map(equipmentCard).join("")}</div>` : `<p class="empty-note">この条件で掲載中の農具はありません。</p>`}
      </section>

      <section class="section-block excluded-equipment">
        ${sectionHeading("shield", "Not Eligible", "対象外の機械", "事故リスクが高い機械は掲載できません。")}
        <div class="tag-row">
          ${["乗用型・大型農機", "刈払機", "チェーンソー", "高所作業機", "農薬散布機", "公道走行を伴う機械", "改造品・故障品・リコール対象品"].map((label) => `<span class="tag">${label}</span>`).join("")}
        </div>
      </section>
    `,
  });
};

const renderToolDetail = (id) => {
  const item = equipmentById(id);
  if (!item) return renderNotFound("農具が見つかりません", "#/tools");
  const isOwner = Boolean(session && item.ownerId === session.user.id);
  const canRequest = Boolean(session && item.persisted && !isOwner && item.availabilityStatus === "available");

  return pageFrame({
    eyebrow: "Tool Details",
    title: item.title,
    copy: `${item.area}で貸し出し中。正確な受渡場所は利用申請の承認後に、案件内で確認します。`,
    actions: `${backLink("#/tools", "農具一覧へ戻る")}${isOwner ? `<a class="button button-light" href="#/manage/tools">掲載を管理</a>` : `<a class="button button-primary" href="#/tools/${item.id}/request">利用を申請する</a>`}`,
    body: `
      <article class="detail-card equipment-detail">
        <div class="detail-visual ${escapeHtml(item.photo || "photo-tool-generic")}" aria-hidden="true"></div>
        <div class="detail-body">
          <div class="tag-row">
            <span class="tag">${escapeHtml(EQUIPMENT_CATEGORY_LABELS[item.category] || "農具")}</span>
            <span class="tag">${escapeHtml(equipmentOwnerLabel(item))}</span>
            <span class="tag ${item.riskLevel === "powered" ? "tag-status-urgent" : "tag-status-open"}">${item.riskLevel === "powered" ? "小型動力農機" : "低危険度"}</span>
          </div>
          <p><strong>貸し手：</strong>${escapeHtml(item.ownerName)}</p>
          <p>${escapeHtml(item.description)}</p>
          <dl class="detail-list">
            <div><dt>料金</dt><dd>${escapeHtml(equipmentFeeLabel(item))}</dd></div>
            <div><dt>メーカー・型式</dt><dd>${escapeHtml([item.maker, item.model].filter(Boolean).join(" / ") || "未記入")}</dd></div>
            <div><dt>使用年数</dt><dd>${escapeHtml(item.yearsUsed || "未記入")}</dd></div>
            <div><dt>最終点検</dt><dd>${escapeHtml(item.lastInspectedOn || "未記入")}</dd></div>
            <div><dt>状態</dt><dd>${escapeHtml(item.conditionLabel || "受渡時に確認")}</dd></div>
            <div><dt>取扱説明書</dt><dd>${item.manualAvailable ? "あり" : "なし"}</dd></div>
            <div><dt>使用経験</dt><dd>${item.experienceRequired ? "経験者のみ" : "未経験は受渡時に相談"}</dd></div>
            <div><dt>消耗品</dt><dd>${escapeHtml(CONSUMABLES_LABELS[item.consumablesPolicy] || "当事者間で確認")}</dd></div>
          </dl>
          <h2>既知の不具合・癖</h2>
          <p>${escapeHtml(item.knownIssues || "特記事項なし。受渡時に現物を確認してください。")}</p>
          <h2>運搬と受渡</h2>
          <p>${escapeHtml(item.transportNote || "受渡方法は承認後に確認します。")}</p>
          <h2>貸し手からの条件</h2>
          <p>${escapeHtml(item.lenderTerms || "受渡時の状態確認と、使用後の清掃をお願いします。")}</p>
          ${item.feeNote ? `<p class="form-help">料金・消耗品の補足：${escapeHtml(item.feeNote)}</p>` : ""}
        </div>
      </article>

      <section class="section-block two-column">
        <div class="side-panel">
          <h3>受渡時に確認すること</h3>
          <ul class="check-list">
            <li>外観、傷、漏れ、異音を写真と一緒に確認</li>
            <li>小型動力農機は始動・停止・緊急停止を双方で確認</li>
            <li>積み降ろし方法と必要人数を確認</li>
            <li>返却日、料金、燃料・消耗品の扱いを確認</li>
          </ul>
        </div>
        <div class="side-panel">
          <h3>故障・事故が起きたら</h3>
          <ol class="number-list">
            <li>すぐに使用を止める</li>
            <li>写真・動画で状態を残す</li>
            <li>貸し手へ案件内で連絡する</li>
            <li>合意前に分解・修理しない</li>
          </ol>
          <p>通常摩耗・経年劣化は原則貸し手、説明と異なる使用や明らかな操作ミスは原則借り手として、修理店の見積もりをもとに当事者間で確認します。</p>
        </div>
      </section>
      ${
        !item.persisted
          ? `<p class="empty-note">これは表示確認用の掲載例です。DB更新後に登録された農具から実際の利用申請ができます。</p>`
          : isOwner
            ? `<p class="empty-note">自分の掲載です。<a class="text-link" href="#/manage/tools">貸し借りの状況</a>から管理できます。</p>`
            : !session
              ? `<p class="empty-note">利用申請には<a class="text-link" href="#/mypage">ログイン</a>が必要です。</p>`
              : canRequest
                ? `<div class="sticky-cta"><a class="button button-primary" href="#/tools/${item.id}/request">この農具の利用を申請する</a></div>`
                : `<p class="empty-note">現在は利用申請を受け付けていません。</p>`
      }
    `,
  });
};

const renderEquipmentRequestForm = (id) => {
  const item = equipmentById(id);
  if (!item) return renderNotFound("農具が見つかりません", "#/tools");
  const signedIn = Boolean(session && dbConnected() && window.NOU_API?.enabled);
  const canSave = signedIn && item.persisted && item.ownerId !== session.user.id && item.availabilityStatus === "available";
  return pageFrame({
    eyebrow: "Borrow Request",
    title: "利用を申請する",
    copy: `${item.title}の希望日と使い方を貸し手へ伝えます。これは予約確定ではありません。`,
    actions: backLink(`#/tools/${item.id}`, "農具の詳細へ戻る"),
    body: `
      ${!signedIn ? `<p class="form-help">申請には<a class="text-link" href="#/mypage">ログイン</a>が必要です。</p>` : ""}
      <div class="note-layout">
        <form class="note-form" aria-label="農具利用申請フォーム">
          <div class="field"><span class="field-label">農具</span><span class="static-field">${escapeHtml(item.title)}｜${escapeHtml(equipmentFeeLabel(item))}</span></div>
          <label>利用開始日<input type="date" id="tool-start" /></label>
          <label>返却予定日<input type="date" id="tool-end" /></label>
          <label>利用目的<textarea rows="3" id="tool-purpose" placeholder="例：家庭菜園約30㎡の畝を耕すため"></textarea></label>
          <label>使用経験
            <select id="tool-experience">
              <option value="">選んでください</option>
              <option>同型機を使ったことがある</option>
              <option>管理機・耕運機の経験がある</option>
              <option>手動農具のみ経験がある</option>
              <option>初めて使う</option>
            </select>
          </label>
          <label>運搬方法<textarea rows="2" id="tool-transport" placeholder="例：軽ワゴン、歩み板あり、2人で積み降ろし"></textarea></label>
          <label>貸し手への補足（任意）<textarea rows="3" id="tool-borrower-note"></textarea></label>
          <label class="check-field"><input type="checkbox" id="tool-terms" /> <span>状態・料金・消耗品・運搬条件を確認しました。契約、精算、故障・修理の協議は当事者間で行い、故障時は使用を止め、合意前に修理しません。</span></label>
          <p class="form-error" data-equipment-request-error hidden></p>
          ${canSave ? `<button class="button button-primary" type="button" data-equipment-request data-id="${item.id}">貸し手へ申請する</button>` : `<button class="button button-primary" type="button" disabled>申請する（ログイン・DB更新が必要）</button>`}
        </form>
        <aside class="side-panel">
          <h3>申請後の流れ</h3>
          <ol class="number-list"><li>貸し手が内容を確認</li><li>承認後、案件内で受渡連絡を確認</li><li>受渡時に状態と操作を双方で確認</li><li>返却時にもう一度状態を確認</li></ol>
          <p>一般的なDMはありません。この貸し借りに必要な連絡だけを扱います。</p>
        </aside>
      </div>
    `,
  });
};

const renderEvents = () => {
  const type = ui.eventType;
  const area = ui.eventArea;
  const list = events.filter(
    (event) => (type === "all" || event.type === type) && (area === "all" || event.place === area),
  );

  const byDate = (a, b) => (parseEventDate(a.date) ?? 0) - (parseEventDate(b.date) ?? 0);
  const upcoming = list.filter((event) => eventStatus(event) !== "past").sort(byDate);
  const past = list.filter((event) => eventStatus(event) === "past").sort(byDate).reverse();

  // 開催月ごとにまとめて、カレンダー感覚で眺められるようにする。
  const monthGroups = [];
  upcoming.forEach((event) => {
    const label = eventMonthLabel(event);
    const group = monthGroups.find((item) => item.label === label);
    if (group) group.events.push(event);
    else monthGroups.push({ label, events: [event] });
  });

  return pageFrame({
    eyebrow: "Real Events",
    title: "イベント一覧",
    copy: "地域の団体が開く観察会や勉強会の予定です。「気になる」で印をつけて、行くかは後で決められます。",
    tone: "warm-view",
    body: `
      ${actionGuide([
        { label: "気になる", text: "あとで見返すための印。相手には連絡されません。" },
        { label: "予定メモ", text: "マイページに残る自分用メモ。申込確定ではありません。" },
      ])}
      <div class="filter-stack">
        <div class="filter-row"><span class="filter-label">種別</span>${filterChips("eventType", eventTypeOptions)}</div>
        <div class="filter-row"><span class="filter-label">地域</span>${filterChips("eventArea", eventAreaOptions)}</div>
      </div>
      ${
        upcoming.length
          ? monthGroups
              .map(
                (group) => `
                  <section class="month-block">
                    <h2 class="month-heading">${escapeHtml(group.label)}<span>${group.events.length}件</span></h2>
                    <div class="card-grid event-grid">${group.events.map((event) => eventCard(event)).join("")}</div>
                  </section>
                `,
              )
              .join("")
          : `<p class="empty-note">この条件の募集中イベントは今ありません。種別や地域の絞り込みを変えてみてください。</p>`
      }
      ${
        past.length
          ? `<section class="section-block">
              ${sectionHeading("note", "Past Events", "開催済みのイベント", "雰囲気の参考に。参加した人の声は各詳細ページで読めます。")}
              <div class="card-grid event-grid">${past.map((event) => eventCard(event)).join("")}</div>
            </section>`
          : ""
      }
    `,
  });
};

const renderEventDetail = (id) => {
  const event = eventById(id);
  if (!event) return renderNotFound("イベントが見つかりません", "#/events");

  const host = groupById(event.hostGroupId);
  const hostPageLabel = host?.entityType === "farmer" ? "農園ページ" : "団体ページ";

  return pageFrame({
    eyebrow: "Event Detail",
    title: event.title,
    copy: "参加前に、雰囲気と基本情報を確認できます。",
    actions: backLink("#/events", "イベント一覧へ戻る"),
    tone: "warm-view",
    body: `
      <article class="detail-card event-detail">
        <div class="detail-visual ${event.photo}" aria-hidden="true"></div>
        <div class="detail-body">
          <div class="badge-row">
            <span class="privacy-note">運営登録イベント</span>
            ${statusBadge(event)}
            ${eventStatus(event) !== "past" && isPopular(event) ? `<span class="tag tag-popular">人気</span>` : ""}
          </div>
          <p class="event-lead">${escapeHtml(event.description)}</p>
          ${event.welcome ? `<p class="welcome-banner">${escapeHtml(event.welcome)}</p>` : ""}
          <h2>開催情報</h2>
          <dl class="detail-list">
            <div><dt>日時</dt><dd>${escapeHtml(event.date)}(${escapeHtml(event.day)}) ${escapeHtml(event.time)}</dd></div>
            <div><dt>地域</dt><dd>${escapeHtml(event.place)}${event.areaNote ? `（${escapeHtml(event.areaNote)}）` : ""}</dd></div>
            <div><dt>定員</dt><dd>${escapeHtml(event.capacity)}（予定メモ <span data-attending-count="${event.id}" data-base="${event.attending ?? 0}">${attendingTotal(event)}</span>名）</dd></div>
            <div><dt>料金</dt><dd>${escapeHtml(event.fee || "無料")}</dd></div>
            <div><dt>申込締切</dt><dd>${escapeHtml(event.deadline || "-")}</dd></div>
            <div><dt>主催</dt><dd>${escapeHtml(host ? host.displayName : event.host)}</dd></div>
            <div><dt>持ち物</dt><dd>${escapeHtml(event.belongings)}</dd></div>
            ${event.rainPolicy ? `<div><dt>雨天時</dt><dd>${escapeHtml(event.rainPolicy)}</dd></div>` : ""}
          </dl>
          ${
            event.schedule && event.schedule.length
              ? `<h2>当日の流れ</h2>
                 <ol class="timeline">
                   ${event.schedule.map((step) => `<li><span class="timeline-time">${escapeHtml(step.time)}</span><span class="timeline-label">${escapeHtml(step.label)}</span></li>`).join("")}
                 </ol>`
              : ""
          }
          ${event.note ? `<p class="form-help">${escapeHtml(event.note)}</p>` : ""}
          ${event.seedExchange ? seedExchangeRulesBlock() : ""}
          ${
            eventStatus(event) === "past"
              ? `<p class="past-note">このイベントは終了しました。次回の予定は<a class="text-link" href="${host ? `#/groups/${host.id}` : "#/events"}">${hostPageLabel}</a>や季節の便りでお知らせします。</p>`
              : `<div class="action-row">
                   ${actionButton({ kind: "interested", id: event.id, on: "気になるに追加済み", off: "気になる" })}
                   ${actionButton({ kind: "joined", id: event.id, on: "予定メモに入れました", off: "予定メモに入れる", primary: true })}
                 </div>
                 <p class="interested-count" data-interested-count="${event.id}" data-base="${event.interestedCount || 0}">${interestedTotal(event)}人が「気になる」を押しています</p>
                 ${actionGuide([
                   { label: "気になる", text: "あとで見返すための印です。申込や連絡は発生しません。" },
                   { label: "予定メモ", text: "マイページに残る自分用メモです。正式な申込確定は主催者からの案内で行います。" },
                 ])}`
          }
          ${host ? `<div class="corner-action"><a class="card-action" href="#/groups/${host.id}">主催者を見る</a></div>` : ""}
        </div>
      </article>

      ${voicesBlock(event.voices)}
      ${relatedSeedsBlock(event.relatedSeedIds)}
      ${(() => {
        const others = upcomingEvents()
          .filter((item) => item.hostGroupId === event.hostGroupId && item.id !== event.id)
          .slice(0, 2);
        return others.length
          ? `<section class="section-block">
              ${sectionHeading("calendar", "More Events", `この${host?.entityType === "farmer" ? "農園" : "団体"}のほかのイベント`, "予定が合わなくても、別の回から参加できます。")}
              <div class="card-grid event-grid">${others.map((item) => eventCard(item, true)).join("")}</div>
            </section>`
          : "";
      })()}
    `,
  });
};

const renderGroupDetail = (id) => {
  const group = groupById(id);
  if (!group) return renderNotFound("農家・団体が見つかりません", "#/members");
  const subjectLabel = group.entityType === "farmer" ? "農家・農園" : "団体・活動者";

  const byDate = (a, b) => (parseEventDate(a.date) ?? 0) - (parseEventDate(b.date) ?? 0);
  const allGroupEvents = eventsByGroup(id);
  const groupEvents = [
    ...allGroupEvents.filter((event) => eventStatus(event) !== "past").sort(byDate),
    ...allGroupEvents.filter((event) => eventStatus(event) === "past").sort(byDate).reverse(),
  ];
  const groupSeeds = seedsByGroup(id);

  return pageFrame({
    eyebrow: group.entityType === "farmer" ? "Farm Profile" : "Group / Activity",
    title: group.displayName,
    copy: `地域で活動している${subjectLabel}の紹介ページです。直接の連絡先や畑の正確な場所は表示しません。つながりはイベント参加から始まります。`,
    actions: `
      ${backLink("#/members", "仲間一覧へ戻る")}
      <a class="button button-light" href="#/manage/group">情報を編集（主催者向け）</a>
      <a class="button button-ghost" href="#/manage/event">イベントを登録（主催者向け）</a>
    `,
    body: `
      <article class="detail-card">
        <div class="detail-visual ${group.photo}" aria-hidden="true"></div>
        <div class="detail-body">
          <span class="privacy-note">${subjectLabel}</span>
          <p>${escapeHtml(group.area)}｜${escapeHtml(group.status)}</p>
          <div class="tag-row">${renderTags(group.methods)}</div>
          <p class="rhythm-line"><strong>活動リズム：</strong>${escapeHtml(group.rhythm)}</p>
          ${group.welcome ? `<p class="welcome-banner">${escapeHtml(group.welcome)}</p>` : ""}
          <h2>活動の様子</h2>
          <p>${escapeHtml(group.note)}</p>
          <p><strong>活動:</strong> ${escapeHtml(group.activity)}</p>
          <div class="action-row">
            ${actionButton({ kind: "following", id: group.id, on: "活動を受け取り中", off: "活動を受け取る" })}
          </div>
          <p class="form-help">「活動を受け取る」と、この${group.entityType === "farmer" ? "農園" : "団体"}がマイページにまとまり、季節の便りや新しいイベントを見逃しにくくなります（メール等の通知はありません）。</p>
          <h2>公式リンク</h2>
          ${officialLinks(group.links) || "<p>公式リンクは未登録です。</p>"}
          <p class="form-help">公式リンクは${group.entityType === "farmer" ? "農家" : "団体"}自身が管理ページで登録したものです。第三者が勝手に登録することはできません。</p>
        </div>
      </article>

      ${updatesBlock(group.updates)}

      <section class="section-block">
        ${sectionHeading("calendar", "Hosted Events", `この${group.entityType === "farmer" ? "農園" : "団体"}のイベント`)}
        ${
          groupEvents.length
            ? `<div class="card-grid event-grid">${groupEvents.map((event) => eventCard(event)).join("")}</div>`
            : "<p>現在公開中のイベントはありません。</p>"
        }
      </section>

      ${relatedSeedsBlock(groupSeeds.map((seed) => seed.id), `この${group.entityType === "farmer" ? "農園" : "団体"}が関わる在来種`)}
    `,
  });
};

const methodCompareTable = () => `
  <div class="table-scroll" role="region" aria-label="農法の比較表" tabindex="0">
    <table class="compare-table">
      <thead>
        <tr>
          <th>農法</th>
          <th>ひとこと</th>
          <th>大切にする考え方</th>
          <th>試しやすい入口</th>
          <th>注意点</th>
          <th>耕すか</th>
          <th>肥料</th>
          <th>草</th>
          <th>農薬</th>
          <th>機械</th>
          <th>資材</th>
        </tr>
      </thead>
      <tbody>
        ${methods
          .map(
            (method) => `
              <tr>
                <th scope="row"><a class="text-link" href="#/learn/${method.id}">${escapeHtml(method.name)}</a></th>
                <td>${escapeHtml(method.summary)}</td>
                <td>${escapeHtml(method.perspective)}</td>
                <td>${escapeHtml(method.entry)}</td>
                <td>${escapeHtml(method.caution)}</td>
                <td>${escapeHtml(method.values.tilling)}</td>
                <td>${escapeHtml(method.values.fertilizer)}</td>
                <td>${escapeHtml(method.values.grass)}</td>
                <td>${escapeHtml(method.values.pesticide)}</td>
                <td>${escapeHtml(method.values.machinery || "-")}</td>
                <td>${escapeHtml(method.values.materials || "-")}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  </div>
  <p class="map-note">横にスクロールして全体を見られます。並び順に優劣の意味はありません。</p>
`;

const renderLearn = () =>
  pageFrame({
    eyebrow: "Learn",
    title: "学ぶ",
    copy: "在来種・農法・技法を、気軽に眺められます。",
    body: `
      <section class="section-block learn-lead">
        ${sectionHeading("map", "Native Varieties", "在来種・固定種を知る", "地図で地域ごとの在来種を、出典つきで気軽に眺められます。")}
        <a class="route-card" href="#/native-map">
          <span class="route-icon">${svgIcon("map")}</span>
          <span>
            <h3>在来種マップを見る</h3>
            <p>関東・福島に伝わる在来種・固定種を、地図と出典つきで地域ごとに知る。</p>
          </span>
        </a>
      </section>

      <section class="section-block">
        ${sectionHeading("book", "Farming Styles", "農法ごとに知る", "比較は優劣づけではありません。畑の条件や続けやすさで選び方が変わります。")}
        <div class="method-board">${methods.map(methodCard).join("")}</div>
      </section>

      <section class="section-block">
        ${sectionHeading("note", "Compare", "比較表でまとめて見る", "ひとこと・考え方・入口・注意点・比較軸を一覧できます。")}
        ${methodCompareTable()}
      </section>

      <section class="section-block">
        ${sectionHeading("book", "Techniques", "技法を学ぶ", "どの農法の人にも役立つ、畑の手仕事。農法どうしの橋渡しにもなります。")}
        <div class="method-board technique-board">
          ${techniques
            .map(
              (technique) => `
                <article class="method-card method-${technique.color}">
                  <h3>${escapeHtml(technique.name)}</h3>
                  <p>${escapeHtml(technique.tagline)}</p>
                  <p class="method-entry"><strong>入口:</strong> ${escapeHtml(technique.entry)}</p>
                  <a class="card-action" href="#/techniques/${technique.id}">詳しく見る</a>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    `,
  });

const renderTechniqueDetail = (id) => {
  const technique = techniqueById(id);
  if (!technique) return renderNotFound("技法が見つかりません", "#/learn");

  const relatedMethods = (technique.relatedMethodIds || []).map(methodById).filter(Boolean);

  return pageFrame({
    eyebrow: "Technique Detail",
    title: technique.name,
    copy: "特定の農法に属さない、どの畑でも使える手仕事です。",
    actions: `
      ${backLink("#/learn", "学ぶへ戻る")}
      <a class="button button-light" href="#/notes/new">記録してみる</a>
    `,
    body: `
      <article class="detail-card method-detail method-${technique.color}">
        <div class="detail-body">
          <span class="privacy-note">農法を横断する技法</span>
          <h2>ひとことで言うと</h2>
          <p>${escapeHtml(technique.tagline)}</p>
          <h2>試しやすい入口</h2>
          <p>${escapeHtml(technique.entry)}</p>
          <h2>くわしく知る</h2>
          ${technique.detail.map((para) => `<p>${escapeHtml(para)}</p>`).join("")}
          ${
            technique.seedMapLink
              ? `<div class="contribute-inline">
                   <p>この手仕事が、地域の在来種・固定種を残してきました。あなたの地域の種も見てみませんか。</p>
                   <div class="action-row">
                     <a class="card-action card-action-inline" href="#/native-map">在来種マップを見る</a>
                     <a class="card-action card-action-inline" href="#/native-map/contribute">種の情報を寄せる</a>
                   </div>
                 </div>`
              : ""
          }
        </div>
        <aside class="side-panel">
          ${
            relatedMethods.length
              ? `<h3>つながる農法</h3>
                 <ul class="source-list">
                   ${relatedMethods.map((method) => `<li><a class="text-link" href="#/learn/${method.id}">${escapeHtml(method.name)}</a></li>`).join("")}
                 </ul>`
              : ""
          }
          ${
            technique.links && technique.links.length
              ? `<h3>出典・もっと学ぶ</h3>
                 <ul class="source-list">
                   ${technique.links.map((link) => `<li><a class="text-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} ↗</a></li>`).join("")}
                 </ul>
                 <p class="side-note">この解説は上記の公開情報を参考に、当サイトが要約したものです。</p>`
              : ""
          }
        </aside>
      </article>

      ${
        technique.seedMapLink && seedExchangeEvents().length
          ? `<section class="section-block">
              ${sectionHeading("calendar", "Seed Exchange", "種の交換会に行ってみる", "採った種を持ち寄り、来歴とともに交換する運営登録イベントです。")}
              <div class="card-grid event-grid">${seedExchangeEvents().map((event) => eventCard(event)).join("")}</div>
            </section>`
          : ""
      }
    `,
  });
};

const renderMethodDetail = (id) => {
  const method = methodById(id);
  if (!method) return renderNotFound("農法が見つかりません", "#/learn");

  return pageFrame({
    eyebrow: "Method Detail",
    title: method.name,
    copy: "農法の正解を決める画面ではなく、考え方の違いと観察の入口を確認する画面です。",
    actions: `
      ${backLink("#/learn", "農法一覧へ戻る")}
      <a class="button button-light" href="#/notes/new">記録してみる</a>
    `,
    body: `
      <article class="detail-card method-detail method-${method.color}">
        <div class="detail-body">
          <span class="privacy-note">優劣ではなく違いとして理解</span>
          <h2>ひとことで言うと</h2>
          <p>${escapeHtml(method.summary)}</p>
          <h2>大切にする考え方</h2>
          <p>${escapeHtml(method.perspective)}</p>
          <h2>試しやすい入口</h2>
          <p>${escapeHtml(method.entry)}</p>
          <h2>注意点</h2>
          <p>${escapeHtml(method.caution)}</p>
          ${method.founder ? `<h2>成り立ち・提唱者</h2><p>${escapeHtml(method.founder)}</p>` : ""}
          ${method.detail && method.detail.length ? `<h2>くわしく知る</h2>${method.detail.map((para) => `<p>${escapeHtml(para)}</p>`).join("")}` : ""}
        </div>
        <aside class="side-panel">
          <h3>比較軸</h3>
          <ul class="method-list">
            <li><strong>耕すか</strong>${escapeHtml(method.values.tilling)}</li>
            <li><strong>肥料</strong>${escapeHtml(method.values.fertilizer)}</li>
            <li><strong>草</strong>${escapeHtml(method.values.grass)}</li>
            <li><strong>農薬</strong>${escapeHtml(method.values.pesticide)}</li>
            ${method.values.machinery ? `<li><strong>機械</strong>${escapeHtml(method.values.machinery)}</li>` : ""}
            ${method.values.materials ? `<li><strong>資材</strong>${escapeHtml(method.values.materials)}</li>` : ""}
          </ul>
          ${
            method.links && method.links.length
              ? `<h3>出典・もっと学ぶ</h3>
                 <ul class="source-list">
                   ${method.links.map((link) => `<li><a class="text-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} ↗</a></li>`).join("")}
                 </ul>
                 <p class="side-note">この解説は上記の公開情報を参考に、当サイトが要約したものです。</p>`
              : ""
          }
        </aside>
      </article>

      ${
        methodFilterOptions.some((opt) => opt.value === method.name)
          ? `<section class="section-block">
              ${sectionHeading("users", "Community", "この農法でつながる", "読むだけで終わらせず、同じ関心の仲間や近くのイベントへ。")}
              <div class="action-row">
                <a class="button button-primary" data-preset="memberMethod" data-preset-value="${escapeHtml(method.name)}" href="#/members">この農法に関心がある仲間を見る</a>
                <a class="button button-light" href="#/events">近くのイベントを見る</a>
              </div>
            </section>`
          : ""
      }
    `,
  });
};

const parseNoteDate = (text) => {
  const [year, month, day] = (text || "").split("/").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const buildNoteCropOptions = (list) => [
  { value: "all", label: "すべて" },
  ...[...new Set(list.map((note) => note.crop))].map((crop) => ({ value: crop, label: crop })),
];

const renderNotes = () => {
  const source = activeNotes();
  const own = usingOwnNotes();
  const noteCropOptions = buildNoteCropOptions(source);
  const crop = ui.noteCrop;
  const list = source
    .filter((note) => crop === "all" || note.crop === crop)
    .sort((a, b) => (parseNoteDate(b.date) ?? 0) - (parseNoteDate(a.date) ?? 0));

  // 月ごとにまとめて、あとから振り返りやすくする。
  const monthGroups = [];
  list.forEach((note) => {
    const date = parseNoteDate(note.date);
    const label = date ? `${date.getFullYear()}年${date.getMonth() + 1}月` : "日付なし";
    const group = monthGroups.find((item) => item.label === label);
    if (group) group.notes.push(note);
    else monthGroups.push({ label, notes: [note] });
  });

  const cropCount = new Set(source.map((note) => note.crop)).size;
  const learningCount = source.filter((note) => note.learning).length;

  return pageFrame({
    eyebrow: "Private Field Notes",
    title: "栽培記録",
    copy: "自分だけの非公開メモ。位置情報や畑の住所は扱いません。",
    actions: `<a class="button button-primary" href="#/notes/new">新しく記録する</a>`,
    body: `
      <div class="peer-band">
        <div><strong>${source.length}</strong><span>記録</span></div>
        <div><strong>${cropCount}</strong><span>作物</span></div>
        <div><strong>${learningCount}</strong><span>学びメモ</span></div>
        <p class="peer-band-note">${
          own
            ? "あなたの記録です。他の人には一切表示されません。"
            : "下の記録は記入例です。ログイン（マイページ）すると自分の記録を保存できます。"
        }</p>
      </div>
      <div class="trust-list">
        <div><strong>基本非公開</strong><span>公開タイムラインはありません。</span></div>
        <div><strong>位置情報なし</strong><span>畑住所や正確な地点は扱いません。</span></div>
        <div><strong>自分の学び</strong><span>共有よりも振り返りを優先します。</span></div>
      </div>
      <div class="filter-stack">
        <div class="filter-row"><span class="filter-label">作物</span>${filterChips("noteCrop", noteCropOptions)}</div>
      </div>
      ${
        monthGroups.length
          ? monthGroups
              .map(
                (group) => `
                  <section class="month-block">
                    <h2 class="month-heading">${escapeHtml(group.label)}<span>${group.notes.length}件</span></h2>
                    <div class="card-grid compact-grid">${group.notes.map((note) => noteCard(note, own)).join("")}</div>
                  </section>
                `,
              )
              .join("")
          : own
            ? `<p class="empty-note">まだ記録がありません。<a class="text-link" href="#/notes/new">最初の記録</a>を書いてみましょう。作物と日付とひとことだけで残せます。</p>`
            : `<p class="empty-note">この作物の記録はまだありません。「すべて」に戻すか、新しく記録してみましょう。</p>`
      }
    `,
  });
};

const renderNoteForm = (noteId = null) => {
  const own = Boolean(session && dbConnected() && window.NOU_API?.enabled);
  const editing = noteId ? (myNotes || []).find((note) => note.id === noteId) : null;
  if (noteId && !editing) return renderNotFound("記録が見つかりません", "#/notes");

  const todayIso = new Date().toISOString().slice(0, 10);
  const values = {
    crop: editing ? editing.crop : own ? "" : "ミニトマト",
    date: editing ? editing.date.replaceAll("/", "-") : todayIso,
    method: editing ? editing.method : "自然農",
    memo: editing ? editing.memo : own ? "" : "葉が少し黄色い。水やりの間隔を見直す。",
    learning: editing ? editing.learning : own ? "" : "草マルチを厚くした畝は乾きにくい。",
  };

  return pageFrame({
    eyebrow: editing ? "Edit Field Note" : "Create Field Note",
    title: editing ? "栽培記録を編集" : "栽培記録を書く",
    copy: own
      ? "作物・日付・ひとことだけで残せます。保存した記録は自分にしか見えません。"
      : "作物・日付・ひとことだけで残せます。（ログインすると実際に保存できます）",
    actions: backLink("#/notes", "栽培記録へ戻る"),
    body: `
      <div class="note-layout">
        <form class="note-form" aria-label="栽培記録入力フォーム">
          <label>
            作物
            <input type="text" id="note-crop" value="${escapeHtml(values.crop)}" placeholder="ミニトマト" />
          </label>
          <label>
            日付
            <input type="date" id="note-date" value="${escapeHtml(values.date)}" />
          </label>
          <label>
            農法（任意）
            <select id="note-method">
              ${methods.map((method) => `<option${method.name === values.method ? " selected" : ""}>${escapeHtml(method.name)}</option>`).join("")}
              <option${values.method === "その他・決めていない" ? " selected" : ""}>その他・決めていない</option>
            </select>
          </label>
          <label>
            ひとこと
            <textarea rows="4" id="note-memo" placeholder="葉が少し黄色い。水やりの間隔を見直す。">${escapeHtml(values.memo)}</textarea>
          </label>
          <label>
            うまくいったこと・学び（任意）
            <textarea rows="2" id="note-learning" placeholder="草マルチを厚くした畝は乾きにくい。">${escapeHtml(values.learning)}</textarea>
          </label>
          ${
            own
              ? `<label>
                  写真を追加（任意・5MBまで）
                  <input type="file" id="note-photo-file" accept="image/jpeg,image/png,image/webp" />
                  ${editing?.photoUrl ? `<span class="form-help">保存済みの写真があります。新しく選ぶと差し替わります。</span>` : ""}
                </label>`
              : `<label>
                  写真を追加（任意）
                  <span class="fake-upload">写真の保存はログイン後に使えます</span>
                </label>`
          }
          <label class="toggle-line">
            <input type="checkbox" checked disabled />
            公開設定：非公開
          </label>
          <p class="form-help">この記録は自分だけに表示されます。写真も非公開で、正確な位置情報や詳細な畑住所は保存しません。</p>
          <p class="form-error" data-note-error hidden></p>
          ${
            own
              ? `<button class="button button-primary" type="button" data-note-save${editing ? ` data-note-id="${editing.id}"` : ""}>保存する</button>`
              : `<button class="button button-primary" type="button">保存する（ダミー・<a class="text-link" href="#/mypage">ログイン</a>で有効化）</button>`
          }
        </form>
        <aside class="side-panel">
          <h3>記録の方針</h3>
          <p>日々の変化を自分で振り返るための場所です。他人の畑記録を閲覧する導線は作りません。</p>
          <div class="tag-row">
            <span class="tag">非公開</span>
            <span class="tag">位置情報なし</span>
            <span class="tag">共有前提なし</span>
          </div>
        </aside>
      </div>
    `,
  });
};

const renderNativeMap = () =>
  pageFrame({
    eyebrow: "Local Seed Map",
    title: "在来種マップ",
    copy: "関東地方と福島県に伝わる在来種・固定種を、地域単位の概略位置で表示します。正確な採種場所や個人宅は示しません。出典つきで少しずつ整理しています。",
    actions: backLink("#/home", "ホームへ戻る"),
    body: `
      <div class="seed-map">
        <div class="map-area">
          <div id="seed-map-canvas" class="map-canvas" aria-label="関東・福島の在来種マップ">
            <p class="map-loading">地図を読み込んでいます…</p>
          </div>
          <div class="map-legend">
            <span class="legend-item"><span class="legend-dot dot-source"></span>公的DB・地域資料</span>
            <span class="legend-item"><span class="legend-dot dot-research"></span>調査中・本人確認前</span>
          </div>
          <p class="map-note">背景地図：地理院タイル（国土地理院）。位置は地域の目安で、正確な圃場所在地ではありません。</p>
        </div>
        <div class="card-grid compact-grid">${seeds.map(seedCard).join("")}</div>
      </div>

      ${
        seedExchangeEvents().length
          ? `<section class="section-block">
              ${sectionHeading("calendar", "Seed Exchange", "種の交換会に行ってみる", "地図で知った種と、実際に出会える場です。種がなくても参加できます。")}
              <div class="card-grid event-grid">${seedExchangeEvents().map((event) => eventCard(event)).join("")}</div>
            </section>`
          : ""
      }

      <section class="section-block contribute-cta">
        <div>
          <h2>地域の種の情報を寄せる</h2>
          <p>「うちの地域にこんな種がある」を、運営確認のうえで少しずつ地図に加えています。住民の方の知識が、このマップを育てます。種を自分でつなぐ方法は<a class="text-link" href="#/techniques/seed-saving">自家採種のページ</a>へ。</p>
        </div>
        <a class="button button-primary" href="#/native-map/contribute">情報提供する（運営確認つき）</a>
      </section>
    `,
  });

const renderSeedContribute = () => {
  const canSave = Boolean(session && dbConnected() && window.NOU_API?.enabled);
  return pageFrame({
    eyebrow: "Contribute",
    title: "在来種の情報提供",
    copy: "地域に伝わる種の情報を運営に伝えるフォームです。寄せられた情報は運営が出典や状況を確認したうえで、地域の目安として掲載します。",
    actions: backLink("#/native-map", "在来種マップへ戻る"),
    body: `
      ${manageNoticeBlock()}
      ${canSave ? "" : `<p class="form-help">情報提供には<a class="text-link" href="#/mypage">ログイン</a>が必要です（運営からの確認のため）。</p>`}
      <div class="note-layout">
        <form class="note-form" aria-label="在来種 情報提供フォーム">
          <label>
            作物名・通称
            <input type="text" id="c-name" value="" placeholder="例：◯◯ねぎ、地域での呼び名" />
          </label>
          <label>
            作物の分類（任意）
            <input type="text" id="c-crop" value="" placeholder="例：ねぎ、だいこん、大豆" />
          </label>
          <label>
            地域（市町村程度）
            <input type="text" id="c-area" value="" placeholder="例：石岡市八郷周辺" />
          </label>
          <label>
            言い伝え・特徴
            <textarea rows="3" id="c-story" placeholder="どんな種か、いつ頃から、どんな味や使われ方か など"></textarea>
          </label>
          <label>
            出典・聞いた人（任意）
            <input type="text" id="c-source" value="" placeholder="資料名、URL、地域の方からの聞き取り など" />
          </label>
          <p class="form-help">正確な採種地点・個人宅・栽培者の氏名は登録しません。掲載するのは市町村程度の地域目安だけです。販売や出品の場ではありません。</p>
          <p class="form-error" data-contrib-error hidden></p>
          ${
            canSave
              ? `<button class="button button-primary" type="button" data-contrib-send>運営に送る</button>`
              : `<button class="button button-primary" type="button" disabled>運営に送る（ログインが必要）</button>`
          }
        </form>
        <aside class="side-panel">
          <h3>掲載までの流れ</h3>
          <ol class="check-list">
            <li>住民・関係者から情報が寄せられる</li>
            <li>運営が出典・現存状況を確認する</li>
            <li>地域の目安として「調査中」または「地域資料」で掲載</li>
          </ol>
          <div class="tag-row">
            <span class="tag">運営確認つき</span>
            <span class="tag">地域目安のみ</span>
            <span class="tag">自由投稿ではない</span>
          </div>
        </aside>
      </div>
    `,
  });
};

const renderSeedDetail = (id) => {
  const seed = seedById(id);
  if (!seed) return renderNotFound("在来種情報が見つかりません", "#/native-map");

  const relatedGroup = seed.relatedGroupId ? groupById(seed.relatedGroupId) : null;
  const relatedEvents = (seed.relatedEventIds || []).map(eventById).filter(Boolean);
  const hasLinks = relatedGroup || relatedEvents.length;

  return pageFrame({
    eyebrow: "Native Variety Detail",
    title: seed.name,
    copy: "地域と作物の背景を知る画面です。出典を確認したうえで掲載し、正確な採種地点や個人宅は表示しません。",
    actions: backLink("#/native-map", "在来種マップへ戻る"),
    body: `
      <article class="detail-card">
        <div class="detail-visual ${seedPhotoClass(seed)}" aria-hidden="true"></div>
        <div class="detail-body">
          ${sourceBadge(seed)}
          <dl class="detail-list">
            <div><dt>地域</dt><dd>${escapeHtml(seed.area)}</dd></div>
            <div><dt>作物分類</dt><dd>${escapeHtml(seed.cropType)}</dd></div>
            ${seed.aliases && seed.aliases.length ? `<div><dt>別名</dt><dd>${escapeHtml(seed.aliases.join("、"))}</dd></div>` : ""}
            <div><dt>データ確度</dt><dd>${escapeHtml(seed.dataConfidence)}</dd></div>
          </dl>
          <h2>背景</h2>
          <p>${escapeHtml(seed.descriptionShort)}</p>
          <h2>出典</h2>
          <p>${seed.sourceUrl ? `<a class="text-link" href="${escapeHtml(seed.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(seed.sourceName)} ↗</a>` : escapeHtml(seed.sourceName)}</p>
          <p class="form-help">${escapeHtml(seed.locationNote)}</p>
          <div class="contribute-inline">
            <p>${seed.sourceType === "research_needed" ? "この種について、地域での呼び名や栽培の記憶をお持ちですか？" : "情報の追加や訂正があればお寄せください。"}</p>
            <a class="card-action" href="#/native-map/contribute">情報提供する（運営確認つき）</a>
          </div>
        </div>
      </article>

      ${
        hasLinks
          ? `<section class="section-block">
              ${sectionHeading("users", "Connect", "この種につながる人・場")}
              ${
                relatedGroup
                  ? `<a class="route-card" href="#/groups/${relatedGroup.id}">
                       <span class="route-icon">${svgIcon("users")}</span>
                       <span><h3>${escapeHtml(relatedGroup.displayName)}</h3><p>${escapeHtml(relatedGroup.area)}でこの種に関わる団体・活動者です。</p></span>
                     </a>`
                  : ""
              }
              ${
                relatedEvents.length
                  ? `<div class="card-grid event-grid" style="margin-top:14px;">${relatedEvents.map((event) => eventCard(event)).join("")}</div>`
                  : ""
              }
            </section>`
          : ""
      }
    `,
  });
};

const authSection = () => {
  if (!window.NOU_API?.enabled || !dbConnected()) return "";
  if (session) {
    return `
      <section class="auth-panel is-signed-in">
        <p><strong>ログイン中：</strong>${escapeHtml(session.user.email || "")}</p>
        <p class="auth-note">「気になる」「予定メモ」「活動を受け取る」は、この端末以外でも同じ状態で表示されます。</p>
        <button type="button" class="button button-light" data-auth="signout">ログアウト</button>
      </section>
    `;
  }
  if (authEmailSent) {
    return `
      <section class="auth-panel">
        <p><strong>ログイン用のメールを送りました。</strong></p>
        <p class="auth-note">この画面を閉じずにメールアプリを開き、届いたリンクを押してください。このサイトに戻るとログインが完了します。数分待っても届かない場合は迷惑メールもご確認ください。</p>
      </section>
    `;
  }
  return `
    <section class="auth-panel">
      <p><strong>ログイン（メールだけ・パスワード不要）</strong></p>
      <p class="auth-note">ログインすると「気になる」「予定メモ」「活動を受け取る」が端末をまたいで保存されます。登録に必要なのはメールアドレスだけです。スマホでは、この画面を閉じずにメールのリンクを開いてください。</p>
      <div class="auth-form">
        <input type="email" id="auth-email" placeholder="メールアドレス" autocomplete="email" />
        <button type="button" class="button button-primary" data-auth="send">ログインリンクを送る</button>
      </div>
    </section>
  `;
};

const renderMyPage = () => {
  const own = Boolean(session && dbConnected() && window.NOU_API?.enabled && myProfile);
  const display = own
    ? {
        name: myProfile.nickname,
        area: myProfile.area,
        status: myProfile.stage,
        interests: myProfile.interests || [],
        oneLiner: myProfile.one_liner,
      }
    : {
        name: profile.displayName,
        area: profile.area,
        status: profile.status,
        interests: profile.interests,
        oneLiner: "",
      };
  const interestedEvents = events.filter((event) => ui.interested.has(event.id));
  const joinedEvents = events
    .filter((event) => ui.joined.has(event.id))
    .sort((a, b) => (parseEventDate(a.date) ?? 0) - (parseEventDate(b.date) ?? 0));
  const followingGroups = friends.filter((group) => ui.following.has(group.id));
  const invitedPeers = peers.filter((peer) => ui.invited.has(peer.id));

  return pageFrame({
    eyebrow: "My Page",
    title: "マイページ",
    copy: "自分の関心や、気になっていることを軽く振り返る画面です。",
    actions: `
      ${backLink("#/home", "ホームへ戻る")}
      <a class="button button-light" href="#/mypage/edit">プロフィールを編集</a>
    `,
    body: `
      ${authSection()}
      ${manageNoticeBlock()}
      ${own ? "" : `<p class="form-help">これはデモ用の表示です。実際は、あなた自身の関心・気になる・記録がここに表示されます。</p>`}
      <section class="profile-panel">
        <div class="profile-main">
          <div class="avatar-placeholder" aria-hidden="true"></div>
          <div>
            <p class="profile-name">${escapeHtml(display.name)}${own ? "" : `<span class="sample-tag">サンプル</span>`}</p>
            <p>${escapeHtml(display.area || "地域未設定")}｜${escapeHtml(display.status)}</p>
            <div class="tag-row">${renderTags(display.interests)}</div>
            ${display.oneLiner ? `<p class="profile-oneliner">${escapeHtml(display.oneLiner)}</p>` : ""}
          </div>
        </div>
        <dl class="stats-grid">
          <div><dt>予定メモ</dt><dd>${ui.joined.size}件</dd></div>
          <div><dt>気になる</dt><dd>${ui.interested.size}件</dd></div>
          <div><dt>受け取り中</dt><dd>${ui.following.size}団体</dd></div>
          <div><dt>誘っている人</dt><dd>${ui.invited.size}人</dd></div>
        </dl>
      </section>

      <section class="section-block">
        ${sectionHeading("tools", "Tool Share", "農具の貸し借り", "掲載、利用申請、受渡、返却を案件ごとに確認します。")}
        <a class="route-card" href="#/manage/tools">
          <span class="route-icon">${svgIcon("tools")}</span>
          <span><h3>貸し借りの状況を見る</h3><p>貸す農具 ${myEquipmentListings?.length || 0}件｜借りる申請 ${myBorrowRequests?.length || 0}件</p></span>
        </a>
      </section>

      <section class="section-block">
        ${sectionHeading("calendar", "Interested", "気になっているイベント", "「気になる」を押したイベントがここに集まります。")}
        ${
          interestedEvents.length
            ? `<div class="stack-list">${interestedEvents.map((event) => eventCard(event, true)).join("")}</div>`
            : `<p class="empty-note">まだありません。<a class="text-link" href="#/events">イベント一覧</a>で気になるものに印をつけてみましょう。</p>`
        }
      </section>

      ${
        followingGroups.length
          ? `<section class="section-block">
              ${sectionHeading("users", "Following", "活動を受け取っている団体")}
              <div class="tag-row">${followingGroups.map((group) => `<a class="official-link" href="#/groups/${group.id}">${escapeHtml(group.displayName)}</a>`).join("")}</div>
            </section>`
          : ""
      }

      ${
        invitedPeers.length
          ? `<section class="section-block">
              ${sectionHeading("users", "Invited", "イベントに誘っている人", "連絡先の交換は、イベントで直接会ったときに個人どうしでどうぞ。")}
              <div class="tag-row">${invitedPeers.map((peer) => `<span class="tag">${escapeHtml(peer.nickname)}（${escapeHtml(peer.area)}）</span>`).join("")}</div>
            </section>`
          : ""
      }

      <section class="section-block">
        ${sectionHeading("shield", "Privacy", "公開範囲の説明")}
        <div class="trust-list">
          ${profile.privacy.map((item) => `<div><strong>${escapeHtml(item.split("は")[0] || "方針")}</strong><span>${escapeHtml(item)}</span></div>`).join("")}
        </div>
      </section>

      <section class="section-block two-column">
        <div>
          <h2>予定メモに入れたイベント</h2>
          ${
            joinedEvents.length
              ? `<div class="stack-list">${joinedEvents.map((event) => eventCard(event, true)).join("")}</div>`
              : `<p class="empty-note">まだありません。イベント詳細の「予定メモに入れる」を押すと、ここにまとまります。</p>`
          }
        </div>
        <div>
          <h2>最近の栽培記録${usingOwnNotes() ? "" : "（記入例）"}</h2>
          ${
            activeNotes().length
              ? `<div class="card-grid compact-grid">${activeNotes().slice(0, 2).map((note) => noteCard(note)).join("")}</div>`
              : `<p class="empty-note">まだ記録がありません。<a class="text-link" href="#/notes/new">最初の記録</a>からどうぞ。</p>`
          }
        </div>
      </section>
    `,
  });
};

const renderProfileEdit = () => {
  const own = Boolean(session && dbConnected() && window.NOU_API?.enabled && myProfile);
  const stages = ["はじめたばかり", "プランター栽培", "家庭菜園中", "家庭菜園3年目以上", "畑あり"];
  const interestChoices = ["自然農", "自然栽培", "有機農法", "菌ちゃん農法", "在来種に関心"];
  const values = own
    ? {
        nickname: myProfile.nickname || "",
        area: myProfile.area || "",
        stage: myProfile.stage || stages[0],
        interests: myProfile.interests || [],
        oneLiner: myProfile.one_liner || "",
        lookingFor: myProfile.looking_for || "",
      }
    : {
        nickname: "のうこ",
        area: profile.area,
        stage: profile.status,
        interests: profile.interests,
        oneLiner: "プランターから畝へ。失敗も記録して楽しんでいます。",
        lookingFor: "近所でゆるく情報交換できる人",
      };
  return pageFrame({
    eyebrow: "Edit Profile",
    title: "プロフィールを編集",
    copy: own
      ? "仲間探しに表示される内容を整えます。"
      : "仲間探しに表示される内容を整えます。（保存には、マイページからのログインが必要です）",
    actions: backLink("#/mypage", "マイページへ戻る"),
    body: `
      <div class="note-layout">
        <form class="note-form" aria-label="プロフィール入力フォーム">
          <label>
            ニックネーム
            <input type="text" id="p-nickname" maxlength="30" value="${escapeHtml(values.nickname)}" />
          </label>
          <label>
            地域（市町村程度）
            <input type="text" id="p-area" value="${escapeHtml(values.area)}" placeholder="例：笠間市" />
          </label>
          <label>
            いまのステージ
            <select id="p-stage">
              ${stages.map((stage) => `<option${stage === values.stage ? " selected" : ""}>${escapeHtml(stage)}</option>`).join("")}
            </select>
          </label>
          <div class="field">
            <span class="field-label">関心のあること</span>
            <span class="choice-row">
              ${interestChoices
                .map(
                  (choice) =>
                    `<label><input type="checkbox" name="p-interest" value="${escapeHtml(choice)}"${values.interests.includes(choice) ? " checked" : ""} /> ${escapeHtml(choice)}</label>`,
                )
                .join("")}
            </span>
          </div>
          <label>
            ひとこと（畑の様子・いまの気分）
            <input type="text" id="p-oneliner" value="${escapeHtml(values.oneLiner)}" />
          </label>
          <label>
            さがしている
            <input type="text" id="p-looking" value="${escapeHtml(values.lookingFor)}" />
          </label>
          <p class="form-help">仲間探しに表示されるのは、ニックネーム・市町村程度の地域・ステージ・関心・ひとことだけです。本名・連絡先・詳細住所は登録できません。</p>
          <p class="form-error" data-profile-error hidden></p>
          ${
            own
              ? `<button class="button button-primary" type="button" data-profile-save>保存する</button>`
              : `<button class="button button-primary" type="button" disabled>保存する（ログインが必要）</button>`
          }
        </form>
        <aside class="side-panel">
          <h3>公開範囲</h3>
          <p>プロフィールは仲間探しのカードにだけ使われます。栽培記録が他の人に見えることはありません。</p>
          <div class="tag-row">
            <span class="tag">本名不要</span>
            <span class="tag">連絡先なし</span>
            <span class="tag">市町村程度</span>
          </div>
          <p class="side-note">連絡先の交換は、イベントで直接会ったときに個人どうしで行う方針です。</p>
        </aside>
      </div>
    `,
  });
};

const renderNotFound = (message = "画面が見つかりません", href = "#/home") =>
  pageFrame({
    eyebrow: "Not Found",
    title: message,
    copy: "指定された静的画面はありません。主要導線から確認してください。",
    actions: backLink(href, "戻る"),
    body: routeCards(),
  });

const renderManageHome = () =>
  pageFrame({
    eyebrow: "主催者・貸し手向け管理",
    title: "活動メニュー",
    copy: "農家・団体・個人が、プロフィール、イベント、貸し出す農具を管理する画面です。公開情報は運営確認を経て掲載されます。",
    actions: backLink("#/members", "仲間一覧へ戻る"),
    body: `
      ${manageNoticeBlock()}
      <section class="onboarding-callout">
        <div>
          <p class="eyebrow">Start Here</p>
          <h2>掲載までの次の一手</h2>
          <p>イベントを開く農家・団体はプロフィール申請から始めます。個人の農具掲載はプロフィール登録後に申請できます。</p>
        </div>
        <ol>
          <li class="${!session ? "is-current" : ""}"><strong>ログイン</strong><span>メールだけで本人確認します。</span></li>
          <li class="${session && !(myGroups || []).length ? "is-current" : ""}"><strong>活動主体を申請</strong><span>農家・農園、または団体として登録します。</span></li>
          <li class="${(myGroups || []).some((group) => group.status === "pending") ? "is-current" : ""}"><strong>運営審査</strong><span>承認されるまで一般公開されません。</span></li>
          <li class="${myApprovedGroup() ? "is-current" : ""}"><strong>イベント登録</strong><span>掲載中の団体だけが申請できます。</span></li>
        </ol>
        <div class="onboarding-next">
          ${
            !session
              ? `<a class="button button-primary" href="#/mypage">ログインする</a>`
              : myApprovedGroup()
                ? `<a class="button button-primary" href="#/manage/event">イベントを登録する</a>`
                : `<a class="button button-primary" href="#/manage/group">団体プロフィールを申請する</a>`
          }
        </div>
      </section>
      <div class="route-grid">
        <a class="route-card" href="#/manage/group">
          <span class="route-icon">${svgIcon("users")}</span>
          <span>
            <h3>農家・団体プロフィールを登録・編集</h3>
            <p>イベントを開く方はこちら。承認後に「仲間を探す」へ掲載されます。</p>
          </span>
        </a>
        <a class="route-card" href="#/manage/event">
          <span class="route-icon">${svgIcon("calendar")}</span>
          <span>
            <h3>イベントを登録</h3>
            <p>掲載中の農家・団体が使えます。登録後、運営確認を経て公開されます。</p>
          </span>
        </a>
        <a class="route-card" href="#/manage/tools">
          <span class="route-icon">${svgIcon("tools")}</span>
          <span>
            <h3>農具の掲載・貸し借りを管理</h3>
            <p>個人、農家、団体が利用できます。無料・有料を選び、申請や受渡状況を確認します。</p>
          </span>
        </a>
      </div>
      ${
        session && dbConnected() && (myGroups || []).length
          ? `<section class="section-block">
              ${sectionHeading("users", "My Group", "あなたの団体")}
              ${(myGroups || [])
                .map((group) => {
                  const status = GROUP_STATUS_LABELS[group.status] || GROUP_STATUS_LABELS.pending;
                  return `<p class="badge-row"><strong>${escapeHtml(group.display_name)}</strong>　<span class="tag ${status.cls}">${escapeHtml(status.label)}</span></p>`;
                })
                .join("")}
            </section>`
          : ""
      }

      ${
        session && isAdmin()
          ? `<section class="section-block">
              ${sectionHeading("shield", "Admin", "運営メニュー")}
              <a class="route-card" href="#/manage/admin">
                <span class="route-icon">${svgIcon("shield")}</span>
                <span>
                  <h3>承認キューを見る</h3>
                  <p>団体の承認・イベントの公開・却下を行います（運営のみ表示されています）。</p>
                </span>
              </a>
            </section>`
          : ""
      }

      <section class="section-block">
        ${sectionHeading("book", "How to Join", "新規登録の流れ", "これから掲載を始める団体・活動者の方へ。")}
        <div class="trust-list">
          <div><strong>1. 申請</strong><span>団体プロフィールを記入して送信します。</span></div>
          <div><strong>2. 運営審査</strong><span>活動の実在性とプライバシー方針への同意を運営が確認します。</span></div>
          <div><strong>3. 承認</strong><span>団体アカウントが発行され、情報を編集できるようになります。</span></div>
          <div><strong>4. 掲載</strong><span>「仲間を探す」とイベント一覧に表示されます。</span></div>
        </div>
      </section>
      <p class="form-help">実際の運用では、団体登録は運営の審査・承認を経たアカウントだけが利用できます。第三者が他団体の情報を登録・編集することはできません。</p>
    `,
  });

const GROUP_STATUS_LABELS = {
  pending: { label: "運営の承認待ち", cls: "tag-status-urgent" },
  approved: { label: "掲載中", cls: "tag-status-open" },
  rejected: { label: "今回は掲載を見送りました", cls: "tag-status-past" },
};

const renderManageGroup = () => {
  const signedIn = Boolean(session && dbConnected() && window.NOU_API?.enabled);
  const group = (myGroups || [])[0] || null;
  const canSave = signedIn;
  const v = {
    entityType: group ? group.entity_type || "group" : "group",
    name: group ? group.display_name : canSave ? "" : "小さな畝の会",
    area: group ? group.area : canSave ? "" : "笠間市",
    methods: group ? group.methods || [] : ["自然農"],
    stage: group ? group.stage : canSave ? "" : "自然農に興味あり / 家庭菜園1年目",
    note: group ? group.note : canSave ? "" : "小さな畝で葉物から始めています。草を全部抜かず、様子を見ながら続けています。",
    activity: group ? group.activity : canSave ? "" : "月1回の観察会を開催",
    rhythm: group ? group.rhythm : canSave ? "" : "毎月 第4日曜・午前",
    welcome: group ? group.welcome : canSave ? "" : "はじめての方の見学・途中参加・見るだけ参加を歓迎しています。",
    website: group ? group.links?.website || "" : canSave ? "" : "https://example.com/konaune-no-kai",
    instagram: group ? group.links?.instagram || "" : "",
    sns: group ? group.links?.sns || "" : "",
  };
  const status = group ? GROUP_STATUS_LABELS[group.status] : null;

  return pageFrame({
    eyebrow: "主催者向け管理",
    title: "農家・団体プロフィール登録・編集",
    copy: "「仲間を探す」に表示される農家・農園、団体・サークルの情報を登録します。新規掲載は運営の承認後に始まります。",
    actions: backLink("#/manage", "活動メニューへ戻る"),
    body: `
      ${manageNoticeBlock()}
      ${!signedIn ? `<p class="form-help">団体を申請するには、<a class="text-link" href="#/mypage">マイページからログイン</a>してください。</p>` : ""}
      ${status ? `<p class="badge-row"><span class="tag ${status.cls}">${escapeHtml(status.label)}</span></p>` : ""}
      <div class="note-layout">
        <form class="note-form" aria-label="農家・団体プロフィール入力フォーム">
          <label>
            活動主体
            <select id="g-entity-type">
              <option value="group"${v.entityType === "group" ? " selected" : ""}>団体・サークル</option>
              <option value="farmer"${v.entityType === "farmer" ? " selected" : ""}>農家・農園</option>
            </select>
          </label>
          <label>
            表示名
            <input type="text" id="g-name" value="${escapeHtml(v.name)}" placeholder="例：小さな畝の会 / みどり農園" />
          </label>
          <label>
            活動地域（市町村程度）
            <input type="text" id="g-area" value="${escapeHtml(v.area)}" placeholder="例：笠間市" />
          </label>
          <div class="field">
            <span class="field-label">主な農法</span>
            <span class="choice-row">
              ${["自然農", "自然栽培", "有機農法", "菌ちゃん農法"]
                .map(
                  (name) =>
                    `<label><input type="checkbox" name="g-method" value="${name}"${v.methods.includes(name) ? " checked" : ""} /> ${name}</label>`,
                )
                .join("")}
            </span>
          </div>
          <label>
            ひとこと・関心
            <input type="text" id="g-stage" value="${escapeHtml(v.stage)}" placeholder="例：自然農を実践中" />
          </label>
          <label>
            活動の紹介
            <textarea rows="3" id="g-note">${escapeHtml(v.note)}</textarea>
          </label>
          <label>
            活動内容
            <input type="text" id="g-activity" value="${escapeHtml(v.activity)}" placeholder="例：月1回の観察会を開催" />
          </label>
          <label>
            活動リズム
            <input type="text" id="g-rhythm" value="${escapeHtml(v.rhythm)}" placeholder="例：毎月 第4日曜・午前" />
          </label>
          <label>
            歓迎メッセージ（任意）
            <input type="text" id="g-welcome" value="${escapeHtml(v.welcome)}" />
          </label>
          <label>
            公式サイトURL（任意）
            <input type="url" id="g-website" value="${escapeHtml(v.website)}" placeholder="https://" />
          </label>
          <label>
            Instagram（任意）
            <input type="url" id="g-instagram" value="${escapeHtml(v.instagram)}" placeholder="https://" />
          </label>
          <label>
            その他公式SNS（任意）
            <input type="url" id="g-sns" value="${escapeHtml(v.sns)}" placeholder="https://" />
          </label>
          <label>
            ロゴ・写真（任意）
            <span class="fake-upload">写真は今後対応予定です</span>
          </label>
          <p class="form-help">公開されるのは市町村程度の地域までです。詳細住所・個人の連絡先は登録・表示しません。農法は本人申告として表示し、有機JAS認証を示す表示は運営確認なしに付けません。</p>
          <p class="form-error" data-group-error hidden></p>
          ${
            canSave
              ? `<button class="button button-primary" type="button" data-group-save${group ? ` data-group-id="${group.id}"` : ""}>${group ? "保存する" : "申請する（運営審査へ）"}</button>`
              : `<button class="button button-primary" type="button" disabled>申請する（ログインが必要）</button>`
          }
        </form>
        <aside class="side-panel">
          <h3>登録の方針</h3>
          <p>公式リンクは農家・団体自身が登録します。第三者が勝手に登録することはできません。</p>
          <p>農家・団体プロフィールは運営の審査・承認を経て掲載されます。</p>
          <div class="tag-row">
            <span class="tag">団体が登録</span>
            <span class="tag">運営審査</span>
            <span class="tag">市町村程度</span>
          </div>
        </aside>
      </div>
      ${
        group && group.status === "approved"
          ? `<section class="section-block">
              ${sectionHeading("note", "Notice", "季節の便りを届ける", "「活動を受け取る」を押した人に一方向で届きます。返信・コメント機能はありません。")}
              <form class="note-form update-form" aria-label="季節の便り投稿フォーム">
                <label>
                  タイトル
                  <input type="text" id="u-title" placeholder="例：梅雨の草の便り" />
                </label>
                <label>
                  本文
                  <textarea rows="3" id="u-body" placeholder="例：雨続きで草の伸びが早いです。観察会では残す草と刈る草の見分けをやります。"></textarea>
                </label>
                <p class="form-error" data-update-error hidden></p>
                <button class="button button-primary" type="button" data-update-send data-group-id="${group.id}">この内容で届ける</button>
              </form>
            </section>`
          : ""
      }
    `,
  });
};

const renderManageEventForm = () => {
  const signedIn = Boolean(session && dbConnected() && window.NOU_API?.enabled);
  const group = myApprovedGroup();
  const canSave = signedIn && group;

  const gate = !signedIn
    ? `<p class="form-help">イベントを登録するには、<a class="text-link" href="#/mypage">マイページからログイン</a>してください。</p>`
    : !group
      ? `<p class="form-help">イベントを登録できるのは承認済みの農家・団体のみです。まず<a class="text-link" href="#/manage/group">プロフィールを申請</a>し、運営の承認をお待ちください。</p>`
      : "";

  return pageFrame({
    eyebrow: "主催者向け管理",
    title: "イベント登録",
    copy: canSave
      ? "登録したイベントは運営の確認後に公開されます。"
      : "農家・団体が新しいイベントを登録するフォームです。登録は承認済みの活動主体のみ可能です。",
    actions: backLink("#/manage", "活動メニューへ戻る"),
    body: `
      ${manageNoticeBlock()}
      ${gate}
      <div class="note-layout">
        <form class="note-form" aria-label="イベント登録フォーム">
          <div class="field">
            <span class="field-label">主催者</span>
            <span class="static-field">${escapeHtml(group ? group.display_name : "小さな畝の会（サンプル表示）")}</span>
          </div>
          <label>
            イベント名
            <input type="text" id="e-title" value="${canSave ? "" : "里山の草取りと観察会"}" placeholder="例：夏の畑の観察会" />
          </label>
          <label>
            種別
            <select id="e-type">
              <option>観察会</option>
              <option>勉強会</option>
              <option>見学会</option>
              <option>交流会</option>
              <option>ワークショップ</option>
              <option>種の交換会</option>
            </select>
          </label>
          <label>
            日付
            <input type="date" id="e-date" value="${canSave ? "" : "2026-06-28"}" />
          </label>
          <label>
            時間
            <input type="text" id="e-time" value="${canSave ? "" : "10:00 - 12:00"}" placeholder="例：10:00 - 12:00" />
          </label>
          <label>
            開催地域（市町村程度）
            <input type="text" id="e-place" value="${canSave ? "" : "笠間市周辺"}" placeholder="例：笠間市周辺" />
          </label>
          <label>
            定員（人数）
            <input type="number" id="e-capacity" min="1" value="${canSave ? "" : "8"}" placeholder="例：8" />
          </label>
          <label>
            料金
            <input type="text" id="e-fee" value="無料" placeholder="例：無料 / 500円（材料費）" />
          </label>
          <label>
            申込締切（任意）
            <input type="date" id="e-deadline" />
          </label>
          <label>
            持ち物（任意）
            <input type="text" id="e-belongings" value="${canSave ? "" : "帽子、飲み物、汚れてもよい靴"}" />
          </label>
          <label>
            雨天時の扱い（任意）
            <input type="text" id="e-rain" value="${canSave ? "" : "小雨決行。荒天時は中止（前日18時までにご連絡）"}" placeholder="例：小雨決行。荒天時は中止" />
          </label>
          <label>
            当日の流れ（任意・「時刻 内容」を / か改行で区切る）
            <textarea rows="3" id="e-schedule" placeholder="10:00 集合・自己紹介 / 10:20 畑の観察 / 11:50 ふりかえり">${canSave ? "" : "10:00 集合・自己紹介 / 10:20 畑を歩いて草の観察 / 11:20 考え方の話 / 11:50 ふりかえり"}</textarea>
          </label>
          <label>
            紹介文
            <textarea rows="3" id="e-desc" placeholder="どんな会か、ひとことで。">${canSave ? "" : "畑まわりの草を観察し、残す草と刈る草の考え方を学びます。"}</textarea>
          </label>
          <label>
            はじめての方へのひとこと（任意）
            <input type="text" id="e-welcome" value="${canSave ? "" : "初参加・見学だけ・途中参加も歓迎です。手ぶらで大丈夫。"}" />
          </label>
          <label>
            補足・注意（任意）
            <textarea rows="2" id="e-note">${canSave ? "" : "詳細住所は参加確定後に運営から案内する想定です。"}</textarea>
          </label>
          <label>
            写真（任意）
            <span class="fake-upload">写真は今後対応予定です</span>
          </label>
          <p class="form-help">詳細住所や正確な開催地点は、参加確定後に案内する想定です。販売・出品の場ではありません。</p>
          <p class="form-error" data-event-error hidden></p>
          ${
            canSave
              ? `<button class="button button-primary" type="button" data-event-save>登録を申請する（運営確認後に公開）</button>`
              : `<button class="button button-primary" type="button" disabled>登録する（承認済み農家・団体のみ）</button>`
          }
        </form>
        <aside class="side-panel">
          <h3>登録の注意</h3>
          <p>イベントは運営確認のうえ公開されます。</p>
          <p>誰でも自由に作成できる仕様ではなく、承認済みの農家・団体のみ登録できます。</p>
          <div class="tag-row">
            <span class="tag">承認済み主催者のみ</span>
            <span class="tag">運営確認</span>
            <span class="tag">位置情報は段階公開</span>
          </div>
        </aside>
      </div>
    `,
  });
};

const renderManageEquipment = () => {
  const signedIn = Boolean(session && dbConnected() && window.NOU_API?.enabled);
  if (!signedIn) {
    return pageFrame({
      eyebrow: "Tool Share",
      title: "農具の貸し借りを管理",
      copy: "掲載、利用申請、受渡、返却を案件ごとに確認します。",
      actions: backLink("#/manage", "活動メニューへ戻る"),
      body: `<p class="empty-note">利用するには<a class="text-link" href="#/mypage">ログイン</a>してください。</p>`,
    });
  }

  const listingRows = myEquipmentListings || [];
  const inbound = equipmentRequestsForOwner || [];
  const borrowed = myBorrowRequests || [];
  const moderationLabel = { pending: "運営確認待ち", approved: "掲載中", rejected: "掲載見送り" };

  return pageFrame({
    eyebrow: "Tool Share",
    title: "農具の貸し借りを管理",
    copy: "貸し手・借り手の双方が、同じ案件の状態を確認できます。一般DMや運営による賠償仲裁はありません。",
    actions: `${backLink("#/manage", "活動メニューへ戻る")}<a class="button button-primary" href="#/manage/tools/new">農具を掲載する</a>`,
    body: `
      ${manageNoticeBlock()}
      ${myEquipmentListings === null ? `<p class="form-help">農具シェア用DBが未適用の場合、実データは表示されません。画面とSQL適用後に利用できます。</p>` : ""}
      <section class="section-block">
        ${sectionHeading("tools", "My Listings", "貸し出す農具", "掲載内容は運営確認後に一般公開されます。")}
        ${
          listingRows.length
            ? `<div class="stack-list">${listingRows
                .map(
                  (item) => `<article class="management-card">
                    <div><div class="tag-row"><span class="tag">${escapeHtml(moderationLabel[item.moderation_status] || item.moderation_status)}</span><span class="tag">${escapeHtml(item.availability_status === "available" ? "受付中" : item.availability_status === "paused" ? "受付停止" : item.availability_status === "loaned" ? "貸出中" : "終了")}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.area)}｜${escapeHtml(item.fee_type === "free" ? "無料" : `${Number(item.fee_amount).toLocaleString("ja-JP")}円／${EQUIPMENT_FEE_UNIT_LABELS[item.fee_unit] || "1日"}`)}</p></div>
                    <div class="action-row">
                      ${item.moderation_status === "approved" && item.availability_status !== "archived" ? `<button type="button" class="button button-light" data-equipment-availability data-id="${item.id}" data-status="${item.availability_status === "available" ? "paused" : "available"}">${item.availability_status === "available" ? "受付を止める" : "受付を再開"}</button>` : ""}
                    </div>
                  </article>`,
                )
                .join("")}</div>`
            : `<p class="empty-note">まだ掲載申請はありません。</p>`
        }
      </section>

      <section class="section-block">
        ${sectionHeading("users", "Requests To You", "あなたへの利用申請", "承認後に、この案件だけで使う受渡連絡を入力します。")}
        ${
          inbound.length
            ? `<div class="stack-list">${inbound.map((request) => equipmentOwnerRequestCard(request)).join("")}</div>`
            : `<p class="empty-note">確認待ちの利用申請はありません。</p>`
        }
      </section>

      <section class="section-block">
        ${sectionHeading("calendar", "Your Requests", "あなたが借りる申請", "貸し手の承認状況と受渡連絡を確認できます。")}
        ${
          borrowed.length
            ? `<div class="stack-list">${borrowed.map((request) => equipmentBorrowRequestCard(request)).join("")}</div>`
            : `<p class="empty-note">借りる申請はまだありません。<a class="text-link" href="#/tools">農具を探す</a></p>`
        }
      </section>
    `,
  });
};

const equipmentOwnerRequestCard = (request) => {
  const status = EQUIPMENT_REQUEST_STATUS[request.status] || request.status;
  return `<article class="management-card request-card">
    <div>
      <div class="tag-row"><span class="tag">${escapeHtml(status)}</span></div>
      <h3>${escapeHtml(request.listing?.title || "農具")}</h3>
      <p><strong>申請者：</strong>${escapeHtml(request.borrower?.nickname || "登録ユーザー")}（${escapeHtml(request.borrower?.area || "地域未設定")}）</p>
      <p><strong>希望：</strong>${escapeHtml(request.start_on)} 〜 ${escapeHtml(request.end_on)}</p>
      <p><strong>目的：</strong>${escapeHtml(request.purpose || "未記入")}</p>
      <p><strong>経験：</strong>${escapeHtml(request.experience || "未記入")}</p>
      <p><strong>運搬：</strong>${escapeHtml(request.transport_plan || "未記入")}</p>
      ${request.borrower_note ? `<p><strong>補足：</strong>${escapeHtml(request.borrower_note)}</p>` : ""}
      ${request.lender_contact ? `<p class="private-contact"><strong>受渡連絡：</strong>${escapeHtml(request.lender_contact)}</p>` : ""}
      ${request.handover_condition ? `<p><strong>受渡時の状態：</strong>${escapeHtml(request.handover_condition)}</p>` : ""}
      ${request.return_condition ? `<p><strong>返却時の状態：</strong>${escapeHtml(request.return_condition)}</p>` : ""}
      ${request.incident_note ? `<p class="incident-note"><strong>使用停止時の記録：</strong>${escapeHtml(request.incident_note)}</p>` : ""}
    </div>
    <div class="request-actions">
      ${
        request.status === "pending"
          ? `<label>承認後に見せる受渡連絡<input type="text" id="request-contact-${request.id}" placeholder="例：受渡候補場所、連絡方法" /></label><div class="action-row"><button class="button button-primary" type="button" data-equipment-request-action="approve" data-id="${request.id}">承認する</button><button class="button button-light" type="button" data-equipment-request-action="decline" data-id="${request.id}">見送る</button></div>`
          : request.status === "approved"
            ? `<label>受渡時の状態<input type="text" id="handover-condition-${request.id}" placeholder="外観、始動・停止、傷、付属品" /></label><button class="button button-primary" type="button" data-equipment-request-action="handover" data-id="${request.id}">双方で確認して貸出開始</button>`
            : request.status === "handed_over" || request.status === "incident"
              ? `<label>返却時の状態<input type="text" id="return-condition-${request.id}" placeholder="外観、動作、消耗、修理相談の有無" /></label><button class="button button-primary" type="button" data-equipment-request-action="return" data-id="${request.id}">双方で確認して返却完了</button>`
              : ""
      }
    </div>
  </article>`;
};

const equipmentBorrowRequestCard = (request) => {
  const listing = request.listing || {};
  const ownerName = listing.group?.display_name || listing.owner?.nickname || "貸し手";
  return `<article class="management-card request-card">
    <div>
      <div class="tag-row"><span class="tag">${escapeHtml(EQUIPMENT_REQUEST_STATUS[request.status] || request.status)}</span></div>
      <h3>${escapeHtml(listing.title || "農具")}</h3>
      <p>${escapeHtml(request.start_on)} 〜 ${escapeHtml(request.end_on)}｜貸し手：${escapeHtml(ownerName)}</p>
      ${request.lender_contact && ["approved", "handed_over", "incident", "returned"].includes(request.status) ? `<p class="private-contact"><strong>受渡連絡：</strong>${escapeHtml(request.lender_contact)}</p>` : ""}
      ${request.handover_condition ? `<p><strong>受渡時の状態：</strong>${escapeHtml(request.handover_condition)}</p>` : ""}
      ${request.return_condition ? `<p><strong>返却時の状態：</strong>${escapeHtml(request.return_condition)}</p>` : ""}
      ${request.incident_note ? `<p class="incident-note"><strong>使用停止時の記録：</strong>${escapeHtml(request.incident_note)}</p>` : ""}
    </div>
    ${request.status === "pending" ? `<button class="button button-light" type="button" data-equipment-request-action="cancel" data-id="${request.id}">申請を取り消す</button>` : request.status === "handed_over" ? `<div class="request-actions"><label>故障・異常の状態<textarea rows="2" id="incident-note-${request.id}" placeholder="いつ、どの操作中に、どんな音や動きがあったか"></textarea></label><button class="button button-light" type="button" data-equipment-request-action="incident" data-id="${request.id}">使用を止めて貸し手へ知らせる</button></div>` : ""}
  </article>`;
};

const renderManageEquipmentForm = () => {
  const signedIn = Boolean(session && dbConnected() && window.NOU_API?.enabled && myProfile);
  const approvedGroups = (myGroups || []).filter((group) => group.status === "approved");
  return pageFrame({
    eyebrow: "List A Tool",
    title: "貸し出す農具を掲載",
    copy: "個人、承認済みの農家・団体が掲載できます。一般公開は運営の安全確認後です。",
    actions: backLink("#/manage/tools", "貸し借りの管理へ戻る"),
    body: `
      ${!signedIn ? `<p class="form-help">掲載申請には<a class="text-link" href="#/mypage">ログインとプロフィール登録</a>が必要です。</p>` : ""}
      <div class="note-layout">
        <form class="note-form" aria-label="農具掲載フォーム">
          <label>貸し手として表示する名前
            <select id="t-owner">
              <option value="personal">個人：${escapeHtml(myProfile?.nickname || "自分のプロフィール")}</option>
              ${approvedGroups.map((group) => `<option value="${group.id}">${group.entity_type === "farmer" ? "農家・農園" : "団体"}：${escapeHtml(group.display_name)}</option>`).join("")}
            </select>
          </label>
          <label>農具名<input type="text" id="t-title" maxlength="80" placeholder="例：小型管理機 2.2馬力" /></label>
          <label>種類
            <select id="t-category"><option value="hand_tool">手動農具</option><option value="small_powered">小型管理機・歩行型耕運機</option><option value="material">農業資材</option></select>
          </label>
          <label>受渡地域（市町村程度）<input type="text" id="t-area" placeholder="例：笠間市周辺" /></label>
          <div class="two-field"><label>メーカー<input type="text" id="t-maker" /></label><label>型式<input type="text" id="t-model" /></label></div>
          <label>使用年数<input type="text" id="t-years" placeholder="例：5年" /></label>
          <label>最終点検日<input type="date" id="t-inspected" /></label>
          <label>現在の状態<input type="text" id="t-condition" placeholder="例：始動・停止・ロータリー確認済み" /></label>
          <label>既知の不具合・癖<textarea rows="3" id="t-issues" placeholder="始動方法、傷、異音、詰まりやすさなど。ない場合も「特になし」と記入"></textarea></label>
          <label class="check-field"><input type="checkbox" id="t-manual" /> <span>取扱説明書を一緒に渡せる</span></label>
          <fieldset class="field"><legend class="field-label">貸出料金</legend><span class="choice-row"><label><input type="radio" name="t-fee-type" value="free" checked /> 無料</label><label><input type="radio" name="t-fee-type" value="paid" /> 有料</label></span></fieldset>
          <div id="t-paid-fields" class="two-field" hidden><label>金額（円）<input type="number" id="t-fee-amount" min="1" /></label><label>単位<select id="t-fee-unit"><option value="half_day">半日</option><option value="day" selected>1日</option><option value="week">1週間</option></select></label></div>
          <label>料金・燃料の補足<textarea rows="2" id="t-fee-note" placeholder="無料の場合の交通費、有料の場合の燃料代など"></textarea></label>
          <label>消耗品の扱い<select id="t-consumables"><option value="owner">通常使用分は貸し手負担</option><option value="included">貸出料金に含む</option><option value="actual_cost">使用分を当事者間で確認</option></select></label>
          <label class="check-field"><input type="checkbox" id="t-experience" /> <span>使用経験がある人に限る</span></label>
          <label>運搬・積み降ろし条件<textarea rows="3" id="t-transport" placeholder="重量、必要人数、歩み板、公道走行不可など"></textarea></label>
          <label>農具の説明<textarea rows="3" id="t-description"></textarea></label>
          <label>貸し手からの条件・注意事項<textarea rows="3" id="t-terms" placeholder="利用できる畑、清掃、返却時刻など"></textarea></label>
          <label class="check-field safety-check"><input type="checkbox" id="t-safety" /> <span>故障品・改造品・リコール対象品ではなく、貸出前に動作と安全状態を確認します。小型動力農機は受渡時に始動・停止方法を説明します。</span></label>
          <p class="form-error" data-equipment-listing-error hidden></p>
          ${signedIn ? `<button class="button button-primary" type="button" data-equipment-listing-save>運営確認へ申請する</button>` : `<button class="button button-primary" type="button" disabled>申請する（ログインが必要）</button>`}
        </form>
        <aside class="side-panel">
          <h3>掲載できない機械</h3>
          <p>乗用型・大型農機、刈払機、チェーンソー、高所作業機、農薬散布機、公道走行を伴う機械は対象外です。</p>
          <h3>修理の基本</h3>
          <p>通常摩耗・経年劣化は原則貸し手、説明と異なる使用や明らかな操作ミスは原則借り手。原因が分からない場合は修理店の見積もりを双方で確認します。</p>
          <p>運営は責任割合・賠償額を判定しません。</p>
        </aside>
      </div>
    `,
  });
};

const routeTable = {
  home: () => renderHome(),
  members: () => renderMembers(),
  tools: (parts) => {
    if (parts[2] === "request" && parts[1]) return renderEquipmentRequestForm(parts[1]);
    return parts[1] ? renderToolDetail(parts[1]) : renderTools();
  },
  groups: (parts) => renderGroupDetail(parts[1]),
  events: (parts) => (parts[1] ? renderEventDetail(parts[1]) : renderEvents()),
  learn: (parts) => (parts[1] ? renderMethodDetail(parts[1]) : renderLearn()),
  techniques: (parts) => (parts[1] ? renderTechniqueDetail(parts[1]) : renderLearn()),
  notes: (parts) => {
    if (parts[1] === "new") return renderNoteForm();
    if (parts[1] === "edit" && parts[2]) return renderNoteForm(parts[2]);
    return renderNotes();
  },
  "native-map": (parts) => (parts[1] === "contribute" ? renderSeedContribute() : renderNativeMap()),
  "native-varieties": (parts) => renderSeedDetail(parts[1]),
  mypage: (parts) => (parts[1] === "edit" ? renderProfileEdit() : renderMyPage()),
  manage: (parts) => {
    if (parts[1] === "group") return renderManageGroup();
    if (parts[1] === "event") return renderManageEventForm();
    if (parts[1] === "tools" && parts[2] === "new") return renderManageEquipmentForm();
    if (parts[1] === "tools") return renderManageEquipment();
    if (parts[1] === "admin") return renderAdminQueue();
    return renderManageHome();
  },
};

// ---- 運営の承認キュー（P2-4）----
let adminQueue = null;
const loadAdminQueue = async () => {
  const [pendingGroups, pendingEvents, pendingContributions, pendingEquipment] = await Promise.all([
    window.NOU_API.fetchPendingGroups(),
    window.NOU_API.fetchPendingEvents(),
    window.NOU_API.fetchPendingContributions(),
    window.NOU_API.fetchPendingEquipment().catch((error) => {
      console.warn("農具掲載の承認キューはDB更新後に有効になります。", error);
      return [];
    }),
  ]);
  adminQueue = { groups: pendingGroups, events: pendingEvents, contributions: pendingContributions, equipment: pendingEquipment };
};

const renderAdminQueue = () => {
  if (!session || !isAdmin()) return renderNotFound("この画面は運営のみ利用できます", "#/manage");
  if (!adminQueue) {
    loadAdminQueue()
      .then(renderApp)
      .catch((error) => console.warn("承認キューの読み込みに失敗しました。", error));
    return pageFrame({
      eyebrow: "運営",
      title: "承認キュー",
      copy: "読み込んでいます…",
      actions: backLink("#/manage", "団体メニューへ戻る"),
      body: `<p class="empty-note">読み込んでいます…</p>`,
    });
  }

  return pageFrame({
    eyebrow: "運営",
    title: "承認キュー",
    copy: "農家・団体、イベント、農具掲載の確認を行います。承認・公開すると即座にサイトに表示されます。",
    actions: `
      ${backLink("#/manage", "団体メニューへ戻る")}
      <button class="button button-light" type="button" data-admin="reload">再読み込み</button>
    `,
    body: `
      ${manageNoticeBlock()}
      <section class="section-block">
        ${sectionHeading("users", "Hosts", "承認待ちの農家・団体", "活動の実在性と方針への同意を確認してから承認します。")}
        ${
          adminQueue.groups.length
            ? adminQueue.groups
                .map(
                  (group) => `
                    <article class="detail-card admin-card">
                      <div class="detail-body">
                        <h3>${escapeHtml(group.display_name)}</h3>
                        <p>${group.entity_type === "farmer" ? "農家・農園" : "団体・サークル"}｜${escapeHtml(group.area)}｜${escapeHtml(group.stage || "")}</p>
                        <div class="tag-row">${renderTags(group.methods || [])}</div>
                        <p>${escapeHtml(group.note || "")}</p>
                        <div class="action-row">
                          <button class="button button-primary" type="button" data-admin="approve-group" data-id="${group.id}">承認して掲載する</button>
                          <button class="button button-light" type="button" data-admin="reject-group" data-id="${group.id}">見送る</button>
                        </div>
                      </div>
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-note">承認待ちの農家・団体はありません。</p>`
        }
      </section>
      <section class="section-block">
        ${sectionHeading("tools", "Tool Listings", "確認待ちの農具掲載", "対象機種、点検、既知の不具合、運搬条件、安全確認を見て判断します。")}
        ${
          (adminQueue.equipment || []).length
            ? adminQueue.equipment
                .map(
                  (item) => `<article class="detail-card admin-card"><div class="detail-body">
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(EQUIPMENT_CATEGORY_LABELS[item.category] || item.category)}｜${escapeHtml(item.area)}｜貸し手：${escapeHtml(item.group?.display_name || item.owner?.nickname || "登録ユーザー")}</p>
                    <p>${escapeHtml(item.description || "")}</p>
                    <dl class="detail-list"><div><dt>料金</dt><dd>${item.fee_type === "free" ? "無料" : `${Number(item.fee_amount).toLocaleString("ja-JP")}円／${EQUIPMENT_FEE_UNIT_LABELS[item.fee_unit] || "1日"}`}</dd></div><div><dt>最終点検</dt><dd>${escapeHtml(item.last_inspected_on || "未記入")}</dd></div><div><dt>状態</dt><dd>${escapeHtml(item.condition_label || "未記入")}</dd></div><div><dt>経験条件</dt><dd>${item.experience_required ? "経験者のみ" : "指定なし"}</dd></div></dl>
                    <p><strong>既知の不具合：</strong>${escapeHtml(item.known_issues || "特記事項なし")}</p>
                    <p><strong>運搬条件：</strong>${escapeHtml(item.transport_note || "未記入")}</p>
                    <div class="action-row"><button class="button button-primary" type="button" data-admin="approve-equipment" data-id="${item.id}">承認して掲載する</button><button class="button button-light" type="button" data-admin="reject-equipment" data-id="${item.id}">見送る</button></div>
                  </div></article>`,
                )
                .join("")
            : `<p class="empty-note">確認待ちの農具掲載はありません。</p>`
        }
      </section>
      <section class="section-block">
        ${sectionHeading("calendar", "Events", "公開待ちのイベント", "内容を確認してから公開します。")}
        ${
          adminQueue.events.length
            ? adminQueue.events
                .map(
                  (event) => `
                    <article class="detail-card admin-card">
                      <div class="detail-body">
                        <h3>${escapeHtml(event.title)}</h3>
                        <p>${escapeHtml(event.event_date || "")}｜${escapeHtml(event.place || "")}｜${escapeHtml(event.event_type || "")}｜主催：${escapeHtml(event.groups?.display_name || "")}</p>
                        <p>${escapeHtml(event.description || "")}</p>
                        <div class="action-row">
                          <button class="button button-primary" type="button" data-admin="publish-event" data-id="${event.id}">公開する</button>
                          <button class="button button-light" type="button" data-admin="cancel-event" data-id="${event.id}">見送る</button>
                        </div>
                      </div>
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-note">公開待ちのイベントはありません。</p>`
        }
      </section>
      <section class="section-block">
        ${sectionHeading("map", "Seeds", "在来種の情報提供", "出典・現存状況を確認してから「調査中」ラベルで掲載します。")}
        ${
          (adminQueue.contributions || []).length
            ? adminQueue.contributions
                .map(
                  (contrib) => `
                    <article class="detail-card admin-card">
                      <div class="detail-body">
                        <h3>${escapeHtml(contrib.seed_name)}</h3>
                        <p>${escapeHtml(contrib.area || "地域未記入")}${contrib.crop_type ? `｜${escapeHtml(contrib.crop_type)}` : ""}</p>
                        <p>${escapeHtml(contrib.story || "")}</p>
                        ${contrib.source_hint ? `<p>出典の手がかり：${escapeHtml(contrib.source_hint)}</p>` : ""}
                        <div class="action-row">
                          <button class="button button-primary" type="button" data-admin="approve-contrib" data-id="${contrib.id}">「調査中」で掲載する</button>
                          <button class="button button-light" type="button" data-admin="reject-contrib" data-id="${contrib.id}">見送る</button>
                        </div>
                      </div>
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-note">確認待ちの情報提供はありません。</p>`
        }
      </section>
    `,
  });
};

const rootRouteFor = (parts) => parts[0] ?? "home";

const updateActiveNav = (rootRoute) => {
  document.querySelectorAll("[data-route]").forEach((link) => {
    const route = link.dataset.route;
    const also = (link.dataset.routeAlso || "").split(" ").filter(Boolean);
    const isActive =
      route === rootRoute ||
      also.includes(rootRoute) ||
      (route === "members" && rootRoute === "groups") ||
      (route === "learn" && (rootRoute === "native-map" || rootRoute === "native-varieties" || rootRoute === "techniques"));

    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
};

let seedMap = null;
const mountSeedMap = () => {
  const el = document.querySelector("#seed-map-canvas");
  if (!el || typeof L === "undefined") return;
  if (seedMap) {
    seedMap.remove();
    seedMap = null;
  }
  el.innerHTML = "";
  seedMap = L.map(el, { scrollWheelZoom: false }).setView([36.4, 139.8], 8);
  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution: "地理院タイル（国土地理院）",
    maxZoom: 18,
  }).addTo(seedMap);
  const points = [];
  seeds.forEach((seed) => {
    if (typeof seed.lat !== "number" || typeof seed.lng !== "number") return;
    const research = seed.sourceType === "research_needed";
    L.circleMarker([seed.lat, seed.lng], {
      radius: 9,
      color: "#faf9f5",
      weight: 2,
      fillColor: research ? "#c15f3c" : "#556247",
      fillOpacity: 0.95,
    })
      .addTo(seedMap)
      .bindPopup(
        `<strong>${escapeHtml(seed.name)}</strong><br>${escapeHtml(seed.cropType)}｜${escapeHtml(seed.area)}<br><a href="#/native-varieties/${seed.id}">背景・出典を見る</a>`,
      );
    points.push([seed.lat, seed.lng]);
  });
  if (points.length) {
    seedMap.fitBounds(points, { padding: [28, 28], maxZoom: 10 });
  }
  requestAnimationFrame(() => seedMap && seedMap.invalidateSize());
};

const renderApp = (options = {}) => {
  // ログインメールから戻った直後は #access_token=... が付く。supabase-js が処理するまで描画しない。
  if (window.location.hash && !window.location.hash.startsWith("#/")) return;
  const parts = getHashParts();
  const rootRoute = rootRouteFor(parts);
  const view = routeTable[rootRoute] ? routeTable[rootRoute](parts) : renderNotFound();

  // 同じ画面の中の操作（削除・承認など）では読んでいた位置を保つ。ページ移動時は先頭へ。
  const scrollTarget = options.preserveScroll ? window.scrollY : 0;
  app.innerHTML = view;
  updateActiveNav(rootRoute);
  setPageTitle(app.querySelector("h1")?.textContent ?? "");
  window.scrollTo(0, scrollTarget);
  requestAnimationFrame(() => window.scrollTo(0, scrollTarget));
  app.focus({ preventScroll: true });

  if (rootRoute === "native-map" && parts[1] !== "contribute") {
    requestAnimationFrame(mountSeedMap);
  } else if (seedMap) {
    seedMap.remove();
    seedMap = null;
  }
};

// 軽いトグルと絞り込みチップのイベント委譲。
app.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    const kind = toggle.dataset.toggle;
    const id = toggle.dataset.id;
    const set = ui[kind];
    if (!set) return;
    const willOn = !set.has(id);
    if (willOn) set.add(id);
    else set.delete(id);
    toggle.classList.toggle("is-on", willOn);
    toggle.setAttribute("aria-pressed", String(willOn));
    const icon = toggle.querySelector(".pill-toggle-icon");
    if (icon) icon.textContent = willOn ? "✓" : "＋";
    const label = toggle.querySelector(".pill-toggle-label");
    if (label) label.textContent = willOn ? toggle.dataset.on : toggle.dataset.off;
    if (kind === "interested") {
      document.querySelectorAll(`[data-interested-count="${id}"]`).forEach((el) => {
        const base = Number(el.dataset.base) || 0;
        el.textContent = `${base + (willOn ? 1 : 0)}人が「気になる」を押しています`;
      });
    }
    if (kind === "joined") {
      document.querySelectorAll(`[data-attending-count="${id}"]`).forEach((el) => {
        const base = Number(el.dataset.base) || 0;
        el.textContent = String(base + (willOn ? 1 : 0));
      });
    }
    saveUi();
    persistActionToDb(kind, id, willOn);
    return;
  }

  const groupSave = event.target.closest("[data-group-save]");
  if (groupSave) {
    const errorEl = document.querySelector("[data-group-error]");
    const name = (document.querySelector("#g-name")?.value || "").trim();
    const area = (document.querySelector("#g-area")?.value || "").trim();
    if (!name || !area) {
      if (errorEl) {
        errorEl.textContent = "表示名と活動地域を入れてください。";
        errorEl.hidden = false;
      }
      return;
    }
    const payload = {
      entity_type: document.querySelector("#g-entity-type")?.value || "group",
      display_name: name,
      area,
      methods: [...document.querySelectorAll('input[name="g-method"]:checked')].map((el) => el.value),
      stage: (document.querySelector("#g-stage")?.value || "").trim(),
      note: (document.querySelector("#g-note")?.value || "").trim(),
      activity: (document.querySelector("#g-activity")?.value || "").trim(),
      rhythm: (document.querySelector("#g-rhythm")?.value || "").trim(),
      welcome: (document.querySelector("#g-welcome")?.value || "").trim(),
      links: {
        website: (document.querySelector("#g-website")?.value || "").trim(),
        instagram: (document.querySelector("#g-instagram")?.value || "").trim(),
        sns: (document.querySelector("#g-sns")?.value || "").trim(),
      },
    };
    groupSave.disabled = true;
    const groupId = groupSave.dataset.groupId;
    const task = groupId
      ? window.NOU_API.updateGroup(groupId, payload)
      : window.NOU_API.createGroup(session.user.id, payload);
    task
      .then(async () => {
        await loadMyGroups();
        await hydrateFromApi();
        manageNotice = groupId
          ? "保存しました。"
          : "申請を受け付けました。運営の承認後に「仲間を探す」へ掲載されます。";
        renderApp();
      })
      .catch((error) => {
        console.warn("団体情報の保存に失敗しました。", error);
        groupSave.disabled = false;
        if (errorEl) {
          errorEl.textContent = "保存に失敗しました。少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const updateSend = event.target.closest("[data-update-send]");
  if (updateSend) {
    const errorEl = document.querySelector("[data-update-error]");
    const title = (document.querySelector("#u-title")?.value || "").trim();
    const body = (document.querySelector("#u-body")?.value || "").trim();
    if (!title || !body) {
      if (errorEl) {
        errorEl.textContent = "タイトルと本文を入れてください。";
        errorEl.hidden = false;
      }
      return;
    }
    updateSend.disabled = true;
    window.NOU_API.createGroupUpdate(updateSend.dataset.groupId, title, body)
      .then(async () => {
        await hydrateFromApi();
        manageNotice = "便りを届けました。主催者ページとホームに表示されます。";
        renderApp();
      })
      .catch((error) => {
        console.warn("便りの送信に失敗しました。", error);
        updateSend.disabled = false;
        if (errorEl) {
          errorEl.textContent = "送信に失敗しました。少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const eventSave = event.target.closest("[data-event-save]");
  if (eventSave) {
    const errorEl = document.querySelector("[data-event-error]");
    const group = myApprovedGroup();
    const title = (document.querySelector("#e-title")?.value || "").trim();
    const eventDate = document.querySelector("#e-date")?.value || "";
    const place = (document.querySelector("#e-place")?.value || "").trim();
    if (!group || !title || !eventDate || !place) {
      if (errorEl) {
        errorEl.textContent = "イベント名・日付・開催地域を入れてください。";
        errorEl.hidden = false;
      }
      return;
    }
    const capacityValue = parseInt(document.querySelector("#e-capacity")?.value || "", 10);
    const payload = {
      group_id: group.id,
      title,
      event_type: document.querySelector("#e-type")?.value || "観察会",
      event_date: eventDate,
      time_label: (document.querySelector("#e-time")?.value || "").trim(),
      place,
      capacity: Number.isFinite(capacityValue) ? capacityValue : null,
      fee: (document.querySelector("#e-fee")?.value || "無料").trim() || "無料",
      deadline: document.querySelector("#e-deadline")?.value || null,
      belongings: (document.querySelector("#e-belongings")?.value || "").trim(),
      rain_policy: (document.querySelector("#e-rain")?.value || "").trim(),
      schedule: parseScheduleText(document.querySelector("#e-schedule")?.value),
      description: (document.querySelector("#e-desc")?.value || "").trim(),
      welcome: (document.querySelector("#e-welcome")?.value || "").trim(),
      note: (document.querySelector("#e-note")?.value || "").trim(),
      seed_exchange: (document.querySelector("#e-type")?.value || "") === "種の交換会",
    };
    eventSave.disabled = true;
    window.NOU_API.createEvent(payload)
      .then(() => {
        manageNotice = "イベントを申請しました。運営の確認後に公開されます。";
        window.location.hash = "#/manage";
        renderApp();
      })
      .catch((error) => {
        console.warn("イベントの申請に失敗しました。", error);
        eventSave.disabled = false;
        if (errorEl) {
          errorEl.textContent = "申請に失敗しました。少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const equipmentListingSave = event.target.closest("[data-equipment-listing-save]");
  if (equipmentListingSave) {
    const errorEl = document.querySelector("[data-equipment-listing-error]");
    const title = (document.querySelector("#t-title")?.value || "").trim();
    const area = (document.querySelector("#t-area")?.value || "").trim();
    const category = document.querySelector("#t-category")?.value || "hand_tool";
    const conditionLabel = (document.querySelector("#t-condition")?.value || "").trim();
    const knownIssues = (document.querySelector("#t-issues")?.value || "").trim();
    const lastInspectedOn = document.querySelector("#t-inspected")?.value || null;
    const transportNote = (document.querySelector("#t-transport")?.value || "").trim();
    const safetyConfirmed = Boolean(document.querySelector("#t-safety")?.checked);
    const manualAvailable = Boolean(document.querySelector("#t-manual")?.checked);
    const experienceRequired = Boolean(document.querySelector("#t-experience")?.checked);
    const maker = (document.querySelector("#t-maker")?.value || "").trim();
    const model = (document.querySelector("#t-model")?.value || "").trim();
    const feeType = document.querySelector('input[name="t-fee-type"]:checked')?.value || "free";
    const feeAmount = feeType === "free" ? 0 : Number(document.querySelector("#t-fee-amount")?.value || 0);
    const poweredMissing = category === "small_powered" && (!maker || !model || !manualAvailable || !experienceRequired || !transportNote);
    if (!title || !area || !conditionLabel || !knownIssues || !lastInspectedOn || !safetyConfirmed || (feeType === "paid" && feeAmount <= 0) || poweredMissing) {
      if (errorEl) {
        errorEl.textContent = poweredMissing
          ? "小型管理機・耕運機は、メーカー・型式・説明書・経験者限定・運搬条件をすべて確認してください。"
          : "農具名、地域、点検日、状態、不具合の有無、料金、安全確認を入力してください。";
        errorEl.hidden = false;
      }
      return;
    }
    const ownerValue = document.querySelector("#t-owner")?.value || "personal";
    const payload = {
      group_id: ownerValue === "personal" ? null : ownerValue,
      title,
      category,
      area,
      maker,
      model,
      years_used: (document.querySelector("#t-years")?.value || "").trim(),
      last_inspected_on: lastInspectedOn,
      condition_label: conditionLabel,
      known_issues: knownIssues,
      manual_available: manualAvailable,
      fee_type: feeType,
      fee_amount: feeAmount,
      fee_unit: document.querySelector("#t-fee-unit")?.value || "day",
      fee_note: (document.querySelector("#t-fee-note")?.value || "").trim(),
      consumables_policy: document.querySelector("#t-consumables")?.value || "owner",
      experience_required: experienceRequired,
      transport_note: transportNote,
      description: (document.querySelector("#t-description")?.value || "").trim(),
      lender_terms: (document.querySelector("#t-terms")?.value || "").trim(),
      risk_level: category === "small_powered" ? "powered" : "low",
      safety_confirmed: true,
      photo: category === "small_powered" ? "photo-tool-cultivator" : category === "material" ? "photo-tool-material" : "photo-tool-generic",
    };
    equipmentListingSave.disabled = true;
    window.NOU_API.createEquipmentListing(session.user.id, payload)
      .then(async () => {
        await loadMyEquipment();
        manageNotice = "農具の掲載を申請しました。運営の安全確認後に公開されます。";
        window.location.hash = "#/manage/tools";
        renderApp();
      })
      .catch((error) => {
        console.warn("農具掲載の申請に失敗しました。", error);
        equipmentListingSave.disabled = false;
        if (errorEl) {
          errorEl.textContent = "申請に失敗しました。DB更新状況を確認し、少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const equipmentRequest = event.target.closest("[data-equipment-request]");
  if (equipmentRequest) {
    const item = equipmentById(equipmentRequest.dataset.id);
    const errorEl = document.querySelector("[data-equipment-request-error]");
    const startOn = document.querySelector("#tool-start")?.value || "";
    const endOn = document.querySelector("#tool-end")?.value || "";
    const purpose = (document.querySelector("#tool-purpose")?.value || "").trim();
    const experience = document.querySelector("#tool-experience")?.value || "";
    const transportPlan = (document.querySelector("#tool-transport")?.value || "").trim();
    const termsAccepted = Boolean(document.querySelector("#tool-terms")?.checked);
    const lacksRequiredExperience = item?.experienceRequired && (experience === "" || experience === "初めて使う" || experience === "手動農具のみ経験がある");
    if (!item || !startOn || !endOn || endOn < startOn || !purpose || !experience || !transportPlan || !termsAccepted || lacksRequiredExperience) {
      if (errorEl) {
        errorEl.textContent = lacksRequiredExperience
          ? "この農機は使用経験がある方に限られます。経験条件をご確認ください。"
          : "利用日、目的、経験、運搬方法、約束の確認を入力してください。";
        errorEl.hidden = false;
      }
      return;
    }
    equipmentRequest.disabled = true;
    window.NOU_API.createEquipmentRequest(session.user.id, item.id, {
      start_on: startOn,
      end_on: endOn,
      purpose,
      experience,
      transport_plan: transportPlan,
      borrower_note: (document.querySelector("#tool-borrower-note")?.value || "").trim(),
      terms_accepted: true,
    })
      .then(async () => {
        await loadMyEquipment();
        manageNotice = "利用申請を送りました。貸し手の承認後に受渡連絡が表示されます。";
        window.location.hash = "#/manage/tools";
        renderApp();
      })
      .catch((error) => {
        console.warn("農具の利用申請に失敗しました。", error);
        equipmentRequest.disabled = false;
        if (errorEl) {
          errorEl.textContent = "申請に失敗しました。少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const equipmentAvailability = event.target.closest("[data-equipment-availability]");
  if (equipmentAvailability) {
    equipmentAvailability.disabled = true;
    window.NOU_API.updateEquipmentAvailability(equipmentAvailability.dataset.id, equipmentAvailability.dataset.status)
      .then(async () => {
        await loadMyEquipment();
        await hydrateEquipmentFromApi();
        manageNotice = "受付状態を更新しました。";
        renderApp({ preserveScroll: true });
      })
      .catch((error) => {
        console.warn("受付状態の更新に失敗しました。", error);
        equipmentAvailability.disabled = false;
      });
    return;
  }

  const equipmentRequestAction = event.target.closest("[data-equipment-request-action]");
  if (equipmentRequestAction) {
    const action = equipmentRequestAction.dataset.equipmentRequestAction;
    const id = equipmentRequestAction.dataset.id;
    const contact = (document.querySelector(`#request-contact-${id}`)?.value || "").trim();
    const handoverCondition = (document.querySelector(`#handover-condition-${id}`)?.value || "").trim();
    const returnCondition = (document.querySelector(`#return-condition-${id}`)?.value || "").trim();
    const incidentNote = (document.querySelector(`#incident-note-${id}`)?.value || "").trim();
    if ((action === "approve" && !contact) || (action === "handover" && !handoverCondition) || (action === "return" && !returnCondition) || (action === "incident" && !incidentNote)) {
      const input = action === "approve" ? document.querySelector(`#request-contact-${id}`) : action === "handover" ? document.querySelector(`#handover-condition-${id}`) : document.querySelector(`#return-condition-${id}`);
      (action === "incident" ? document.querySelector(`#incident-note-${id}`) : input)?.focus();
      return;
    }
    const payload =
      action === "approve"
        ? { status: "approved", lender_contact: contact }
        : action === "decline"
          ? { status: "declined" }
          : action === "handover"
            ? { status: "handed_over", handover_condition: handoverCondition }
            : action === "return"
              ? { status: "returned", return_condition: returnCondition }
              : action === "cancel"
                ? { status: "cancelled" }
                : null;
    if (!payload && action !== "incident") return;
    equipmentRequestAction.disabled = true;
    const task = action === "incident" ? window.NOU_API.reportEquipmentIncident(id, incidentNote) : window.NOU_API.updateEquipmentRequest(id, payload);
    task
      .then(async () => {
        await loadMyEquipment();
        manageNotice = "貸し借りの状態を更新しました。";
        renderApp({ preserveScroll: true });
      })
      .catch((error) => {
        console.warn("貸し借り状態の更新に失敗しました。", error);
        equipmentRequestAction.disabled = false;
      });
    return;
  }

  const adminButton = event.target.closest("[data-admin]");
  if (adminButton) {
    const action = adminButton.dataset.admin;
    const id = adminButton.dataset.id;
    const contribution = (adminQueue?.contributions || []).find((item) => String(item.id) === id);
    adminButton.disabled = true;
    const task =
      action === "approve-group"
        ? window.NOU_API.setGroupStatus(id, "approved")
        : action === "reject-group"
          ? window.NOU_API.setGroupStatus(id, "rejected")
          : action === "publish-event"
            ? window.NOU_API.setEventStatus(id, "published")
            : action === "cancel-event"
              ? window.NOU_API.setEventStatus(id, "cancelled")
              : action === "approve-equipment"
                ? window.NOU_API.setEquipmentModeration(id, "approved")
                : action === "reject-equipment"
                  ? window.NOU_API.setEquipmentModeration(id, "rejected")
              : action === "approve-contrib" && contribution
                ? window.NOU_API.resolveSeedContribution(contribution, true)
                : action === "reject-contrib" && contribution
                  ? window.NOU_API.resolveSeedContribution(contribution, false)
                  : Promise.resolve();
    task
      .then(async () => {
        await loadAdminQueue();
        await hydrateFromApi();
        await loadMyGroups();
        await loadMyEquipment();
        if (action !== "reload") manageNotice = "反映しました。";
        renderApp({ preserveScroll: true });
      })
      .catch((error) => {
        console.warn("承認操作に失敗しました。", error);
        adminButton.disabled = false;
      });
    return;
  }

  const profileSave = event.target.closest("[data-profile-save]");
  if (profileSave) {
    const errorEl = document.querySelector("[data-profile-error]");
    const nickname = (document.querySelector("#p-nickname")?.value || "").trim();
    if (!nickname) {
      if (errorEl) {
        errorEl.textContent = "ニックネームを入れてください。";
        errorEl.hidden = false;
      }
      return;
    }
    profileSave.disabled = true;
    window.NOU_API.upsertProfile({
      id: session.user.id,
      nickname,
      area: (document.querySelector("#p-area")?.value || "").trim(),
      stage: document.querySelector("#p-stage")?.value || "はじめたばかり",
      interests: [...document.querySelectorAll('input[name="p-interest"]:checked')].map((el) => el.value),
      one_liner: (document.querySelector("#p-oneliner")?.value || "").trim(),
      looking_for: (document.querySelector("#p-looking")?.value || "").trim(),
    })
      .then(async () => {
        await loadMyProfile();
        manageNotice = "プロフィールを保存しました。";
        window.location.hash = "#/mypage";
        renderApp();
      })
      .catch((error) => {
        console.warn("プロフィールの保存に失敗しました。", error);
        profileSave.disabled = false;
        if (errorEl) {
          errorEl.textContent = "保存に失敗しました。少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const contribSend = event.target.closest("[data-contrib-send]");
  if (contribSend) {
    const errorEl = document.querySelector("[data-contrib-error]");
    const seedName = (document.querySelector("#c-name")?.value || "").trim();
    const area = (document.querySelector("#c-area")?.value || "").trim();
    const story = (document.querySelector("#c-story")?.value || "").trim();
    if (!seedName || !area || !story) {
      if (errorEl) {
        errorEl.textContent = "作物名・地域・言い伝えを入れてください。";
        errorEl.hidden = false;
      }
      return;
    }
    contribSend.disabled = true;
    window.NOU_API.submitSeedContribution(session.user.id, {
      seed_name: seedName,
      crop_type: (document.querySelector("#c-crop")?.value || "").trim(),
      area,
      story,
      source_hint: (document.querySelector("#c-source")?.value || "").trim(),
    })
      .then(() => {
        manageNotice = "情報を運営に送りました。出典・現存状況を確認のうえ、地域の目安として掲載します。";
        window.location.hash = "#/native-map";
        renderApp();
      })
      .catch((error) => {
        console.warn("情報提供の送信に失敗しました。", error);
        contribSend.disabled = false;
        if (errorEl) {
          errorEl.textContent = "送信に失敗しました。少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const noteSave = event.target.closest("[data-note-save]");
  if (noteSave) {
    const crop = (document.querySelector("#note-crop")?.value || "").trim();
    const date = document.querySelector("#note-date")?.value || "";
    const method = document.querySelector("#note-method")?.value || "";
    const memo = (document.querySelector("#note-memo")?.value || "").trim();
    const learning = (document.querySelector("#note-learning")?.value || "").trim();
    const errorEl = document.querySelector("[data-note-error]");
    if (!crop || !date) {
      if (errorEl) {
        errorEl.textContent = "作物と日付を入れてください。";
        errorEl.hidden = false;
      }
      return;
    }
    const photoFile = document.querySelector("#note-photo-file")?.files?.[0] || null;
    if (photoFile && photoFile.size > 5 * 1024 * 1024) {
      if (errorEl) {
        errorEl.textContent = "写真は5MBまでです。小さい画像を選んでください。";
        errorEl.hidden = false;
      }
      return;
    }
    noteSave.disabled = true;
    const payload = { crop, noted_on: date, method, memo, learning };
    const noteId = noteSave.dataset.noteId;
    const task = (photoFile
      ? window.NOU_API.uploadNotePhoto(session.user.id, photoFile).then((path) => {
          payload.photo = path;
        })
      : Promise.resolve()
    ).then(() =>
      noteId ? window.NOU_API.updateNote(noteId, payload) : window.NOU_API.createNote(session.user.id, payload),
    );
    task
      .then(async () => {
        await loadMyNotes();
        window.location.hash = "#/notes";
        renderApp();
      })
      .catch((error) => {
        console.warn("記録の保存に失敗しました。", error);
        noteSave.disabled = false;
        if (errorEl) {
          errorEl.textContent = "保存に失敗しました。少し待ってからもう一度お試しください。";
          errorEl.hidden = false;
        }
      });
    return;
  }

  const noteDelete = event.target.closest("[data-note-delete]");
  if (noteDelete) {
    if (!window.confirm("この記録を削除しますか？")) return;
    noteDelete.disabled = true;
    window.NOU_API.deleteNote(noteDelete.dataset.noteDelete)
      .then(async () => {
        await loadMyNotes();
        renderApp({ preserveScroll: true });
      })
      .catch((error) => {
        console.warn("記録の削除に失敗しました。", error);
        noteDelete.disabled = false;
      });
    return;
  }

  const authButton = event.target.closest("[data-auth]");
  if (authButton) {
    if (authButton.dataset.auth === "send") {
      const input = document.querySelector("#auth-email");
      const email = (input?.value || "").trim();
      if (!email || !email.includes("@")) {
        if (input) input.focus();
        return;
      }
      authButton.disabled = true;
      window.NOU_API.signInWithEmail(email)
        .then(() => {
          authEmailSent = true;
          renderApp();
        })
        .catch((error) => {
          console.warn("ログインメールの送信に失敗しました。", error);
          authButton.disabled = false;
          authButton.textContent = "送信に失敗しました。もう一度";
        });
    }
    if (authButton.dataset.auth === "signout") {
      window.NOU_API.signOut().then(() => {
        session = null;
        renderApp();
      });
    }
    return;
  }

  // 別ページのフィルタを先に設定してから遷移するリンク（例：農法詳細→その農法の仲間一覧）。
  const preset = event.target.closest("[data-preset]");
  if (preset) {
    const key = preset.dataset.preset;
    if (key in ui) ui[key] = preset.dataset.presetValue;
    return;
  }

  const chip = event.target.closest("[data-filter]");
  if (chip) {
    const key = chip.dataset.filter;
    if (!(key in ui)) return;
    ui[key] = chip.dataset.value;
    renderApp();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches('input[name="t-fee-type"]')) {
    const paid = event.target.value === "paid";
    const fields = document.querySelector("#t-paid-fields");
    if (fields) fields.hidden = !paid;
    const amount = document.querySelector("#t-fee-amount");
    if (amount) amount.required = paid;
  }
});

// ---- Supabase からの読み込み（P2-1）----
// DBの行を、これまでの画面が期待する形に変換する。失敗時は mock-data のまま動く。
const DB_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const isoToShortDate = (iso) => {
  if (!iso) return "";
  const [, month, day] = iso.split("-").map(Number);
  return `${month}/${day}`;
};
const isoToWeekday = (iso) => {
  const [year, month, day] = iso.split("-").map(Number);
  return DB_WEEKDAYS[new Date(year, month - 1, day).getDay()];
};

const dbGroupToUi = (row) => ({
  id: row.id,
  displayName: row.display_name,
  entityType: row.entity_type || "group",
  area: row.area,
  status: row.stage,
  methods: row.methods || [],
  interest: (row.methods || [])[0] || "",
  note: row.note,
  activity: row.activity,
  rhythm: row.rhythm,
  welcome: row.welcome,
  links: row.links || {},
  photo: row.photo,
  updates: (row.group_updates || [])
    .slice()
    .sort((a, b) => (a.published_on < b.published_on ? 1 : -1))
    .map((item) => ({ date: isoToShortDate(item.published_on), title: item.title, text: item.body })),
});

const dbEquipmentToUi = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  groupId: row.group_id,
  title: row.title,
  category: row.category,
  area: row.area,
  ownerName: row.group?.display_name || row.owner?.nickname || "登録ユーザー",
  ownerType: row.group?.entity_type || (row.group_id ? "group" : "personal"),
  maker: row.maker,
  model: row.model,
  yearsUsed: row.years_used,
  lastInspectedOn: row.last_inspected_on ? row.last_inspected_on.replaceAll("-", "/") : "",
  conditionLabel: row.condition_label,
  knownIssues: row.known_issues,
  manualAvailable: row.manual_available,
  feeType: row.fee_type,
  feeAmount: row.fee_amount,
  feeUnit: row.fee_unit,
  feeNote: row.fee_note,
  consumablesPolicy: row.consumables_policy,
  experienceRequired: row.experience_required,
  transportNote: row.transport_note,
  description: row.description,
  lenderTerms: row.lender_terms,
  riskLevel: row.risk_level,
  availabilityStatus: row.availability_status,
  moderationStatus: row.moderation_status,
  photo: row.photo,
  persisted: true,
});

const dbEventToUi = (row, counts, groupNames) => ({
  id: row.id,
  date: isoToShortDate(row.event_date),
  day: isoToWeekday(row.event_date),
  time: row.time_label,
  title: row.title,
  place: row.place,
  areaNote: row.area_note,
  description: row.description,
  capacity: row.capacity ? `${row.capacity}名` : "",
  attending: (row.attending_base || 0) + (counts?.joined_count || 0),
  fee: row.fee,
  deadline: isoToShortDate(row.deadline),
  interestedCount: (row.interested_base || 0) + (counts?.interested_count || 0),
  host: groupNames.get(row.group_id) || "",
  hostGroupId: row.group_id,
  type: row.event_type,
  belongings: row.belongings,
  note: row.note,
  welcome: row.welcome,
  rainPolicy: row.rain_policy,
  schedule: row.schedule || [],
  seedExchange: row.seed_exchange,
  photo: row.photo,
  relatedSeedIds: (row.event_seeds || []).map((link) => link.seed_id),
  voices: (row.event_voices || []).map((voice) => ({ who: voice.who, text: voice.body })),
});

const dbSeedToUi = (row, eventLinks) => ({
  id: row.id,
  name: row.name,
  aliases: row.aliases || [],
  cropType: row.crop_type,
  area: row.area,
  lat: row.lat,
  lng: row.lng,
  sourceType: row.source_type,
  sourceLabel: row.source_label,
  sourceName: row.source_name,
  sourceUrl: row.source_url,
  descriptionShort: row.description_short,
  dataConfidence: row.data_confidence,
  locationNote: row.location_note,
  photo: row.photo,
  relatedGroupId: row.related_group_id,
  relatedEventIds: eventLinks.get(row.id) || [],
});

// ログイン中は DB にも書く（未ログイン・mockフォールバック時は localStorage のみ）。
const persistActionToDb = (kind, id, on) => {
  if (!session || !dbConnected() || !window.NOU_API?.enabled) return;
  const userId = session.user.id;
  let task = null;
  if (kind === "interested" || kind === "joined") {
    task = window.NOU_API.setEventAction(userId, id, kind, on);
  } else if (kind === "following") {
    task = window.NOU_API.setFollow(userId, id, on);
  }
  // invited の相手（peers）はまだ実ユーザーではないため localStorage のみ。
  if (task) task.catch((error) => console.warn("操作の保存に失敗しました。", error));
};

// ログイン時: DB の状態と localStorage の状態を合流させる。
// ローカルにしかない操作は DB へ送り、以後は DB を正とする。
const syncMyStateWithDb = async () => {
  if (!session || !dbConnected() || !window.NOU_API?.enabled) return;
  const userId = session.user.id;
  try {
    const mine = await window.NOU_API.fetchMyState(userId);
    const dbInterested = new Set(mine.actions.filter((row) => row.kind === "interested").map((row) => row.event_id));
    const dbJoined = new Set(mine.actions.filter((row) => row.kind === "joined").map((row) => row.event_id));
    const dbFollowing = new Set(mine.follows.map((row) => row.group_id));

    const eventIds = new Set(events.map((event) => event.id));
    const groupIds = new Set(friends.map((group) => group.id));
    const pushes = [];
    ui.interested.forEach((id) => {
      if (eventIds.has(id) && !dbInterested.has(id)) pushes.push(window.NOU_API.setEventAction(userId, id, "interested", true));
    });
    ui.joined.forEach((id) => {
      if (eventIds.has(id) && !dbJoined.has(id)) pushes.push(window.NOU_API.setEventAction(userId, id, "joined", true));
    });
    ui.following.forEach((id) => {
      if (groupIds.has(id) && !dbFollowing.has(id)) pushes.push(window.NOU_API.setFollow(userId, id, true));
    });
    await Promise.all(pushes);

    ui.interested = new Set([...dbInterested, ...[...ui.interested].filter((id) => eventIds.has(id))]);
    ui.joined = new Set([...dbJoined, ...[...ui.joined].filter((id) => eventIds.has(id))]);
    ui.following = new Set([...dbFollowing, ...[...ui.following].filter((id) => groupIds.has(id))]);
    saveUi();

    // event_counts には自分の行も含まれるため、表示の二重加算を避ける
    // （画面側は ui.joined / ui.interested にあるものへ +1 して見せるため）。
    events.forEach((event) => {
      if (dbJoined.has(event.id)) event.attending = Math.max(0, (event.attending || 0) - 1);
      if (dbInterested.has(event.id)) event.interestedCount = Math.max(0, (event.interestedCount || 0) - 1);
    });
  } catch (error) {
    console.warn("ログイン状態の同期に失敗しました。", error);
  }
};

const hydrateEquipmentFromApi = async () => {
  if (!window.NOU_API?.enabled) return false;
  try {
    const rows = await window.NOU_API.fetchEquipment();
    equipment = rows.map(dbEquipmentToUi);
    return true;
  } catch (error) {
    console.warn("農具シェア用DBが未適用のため、掲載例を表示します。", error);
    return false;
  }
};

const hydrateFromApi = async () => {
  if (!window.NOU_API || !window.NOU_API.enabled) return false;
  try {
    const [groupRows, eventRows, seedRows, countRows] = await Promise.all([
      window.NOU_API.fetchGroups(),
      window.NOU_API.fetchEvents(),
      window.NOU_API.fetchSeeds(),
      window.NOU_API.fetchEventCounts(),
    ]);
    const counts = new Map(countRows.map((row) => [row.event_id, row]));
    const groupNames = new Map(groupRows.map((row) => [row.id, row.display_name]));
    const eventLinks = new Map();
    eventRows.forEach((row) =>
      (row.event_seeds || []).forEach((link) => {
        if (!eventLinks.has(link.seed_id)) eventLinks.set(link.seed_id, []);
        eventLinks.get(link.seed_id).push(row.id);
      }),
    );
    friends = groupRows.map(dbGroupToUi);
    events = eventRows.map((row) => dbEventToUi(row, counts.get(row.id), groupNames));
    seeds = seedRows.map((row) => dbSeedToUi(row, eventLinks));
    await hydrateEquipmentFromApi();
    rebuildFilterOptions();
    document.documentElement.dataset.source = "supabase";
    return true;
  } catch (error) {
    console.warn("Supabaseからの読み込みに失敗したため、サンプルデータで表示します。", error);
    return false;
  }
};

window.addEventListener("hashchange", renderApp);
window.addEventListener("DOMContentLoaded", async () => {
  loadUi();

  if (!window.location.hash) {
    window.location.replace("#/home");
  } else {
    renderApp();
  }

  const hydrated = await hydrateFromApi();

  if (window.NOU_API?.enabled) {
    session = await window.NOU_API.getSession();
    window.NOU_API.onAuthChange(async (next) => {
      const wasLoggedIn = Boolean(session);
      session = next;
      if (session && !wasLoggedIn) {
        authEmailSent = false;
        await syncMyStateWithDb();
        await Promise.all([loadMyNotes(), loadMyProfile(), loadMyGroups(), loadMyEquipment()]);
        // ログインメールから戻った直後はマイページへ案内する。
        if (!window.location.hash.startsWith("#/")) {
          window.location.replace("#/mypage");
          return;
        }
      }
      if (!session) {
        myNotes = null;
        myProfile = null;
        myGroups = null;
        myEquipmentListings = null;
        myBorrowRequests = null;
        equipmentRequestsForOwner = null;
      }
      renderApp();
    });
    if (session) {
      await syncMyStateWithDb();
      await Promise.all([loadMyNotes(), loadMyProfile(), loadMyGroups(), loadMyEquipment()]);
    }
  }

  if (hydrated || session) renderApp();
});
