const data = window.NOU_NO_SATO_DATA;
// events / friends / seeds はP2-1以降Supabaseから取得して差し替える（失敗時はモックのまま動く）。
// methods / techniques / notes / peers / profile 等は当面静的コンテンツとして mock-data.js を正とする。
let { events, friends, seeds } = data;
const { methods, notes, profile, routes, peers, onboarding, techniques } = data;

const app = document.querySelector("#app");

// 軽い操作状態。気になる/受け取る/つながるはブラウザに保存して再訪でも残す。
// フィルタはセッション内のみ。記録・プロフィール・フォーム入力は保存しない。
const ui = {
  interested: new Set(), // 気になるイベント
  joined: new Set(), // 参加予定に入れたイベント
  following: new Set(), // 活動を受け取る団体
  invited: new Set(), // イベントに誘った個人
  memberMethod: "all", // 仲間ページの農法フィルタ
  memberArea: "all", // 仲間ページの地域フィルタ
  eventType: "all", // イベントページの種別フィルタ
  eventArea: "all", // イベントページの地域フィルタ
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
// 表示上の参加予定人数（自分が参加予定に入れていれば+1）。
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

// セッション内で実際に切り替わる軽いトグル（気になる / 参加予定 / 受け取る / 誘う）。
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

const pageFrame = ({ eyebrow, title, copy, body, actions = "", tone = "" }) => `
  <section class="page ${tone}">
    <header class="page-heading">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
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
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h2>${escapeHtml(title)}</h2>
      ${copy ? `<p>${escapeHtml(copy)}</p>` : ""}
    </div>
  </div>
`;

const routeCards = (ids) => {
  const list = ids ? routes.filter((route) => ids.includes(route.id)) : routes;
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
        <p>${escapeHtml(event.description)}</p>
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
              ${actionButton({ kind: "interested", id: event.id, on: "気になるに追加ずみ", off: "気になる" })}
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
          <em>${escapeHtml(friend.area)}｜${escapeHtml(friend.status)}</em>
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
          <a class="card-action card-action-inline" href="#/groups/${friend.id}">団体ページ・イベントを見る</a>
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

const seedCard = (seed) => `
  <article class="seed-card">
    <div class="seed-top">
      <div class="seed-photo ${seed.photo}" aria-hidden="true"></div>
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
        ${sectionHeading("note", "More", "ほかにできること", "記録や在来種マップも、いつでもどうぞ。")}
        ${routeCards(["notes", "native-map"])}
      </section>

      <section class="section-block">
        ${sectionHeading("users", "For Groups", "団体・サークルの方へ", "イベントを開く側として参加しませんか。")}
        <a class="route-card" href="#/manage">
          <span class="route-icon">${svgIcon("users")}</span>
          <span>
            <h3>団体・活動を登録する</h3>
            <p>団体プロフィールとイベントを登録できます。掲載は運営の審査・承認を経て始まります。</p>
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

  const emptyNote = (label) =>
    `<p class="empty-note">この条件に当てはまる${label}はまだ少ないようです。関心や地域を変えて探してみてください。</p>`;

  return pageFrame({
    eyebrow: "Local Friends",
    title: "仲間を探す",
    copy: "同じ地域・同じ関心の人を、ゆるく探せます。まずは眺めるだけでも大丈夫。",
    body: `
      <div class="peer-band">
        <div><strong>${peers.length}</strong><span>近くの個人</span></div>
        <div><strong>${friends.length}</strong><span>地域の団体</span></div>
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
        ${sectionHeading("users", "Groups", "地域の団体・サークル", "活動のリズムがある集まり。イベント参加からつながれます。")}
        <p class="form-help">団体・活動者の方へ：<a class="text-link" href="#/manage">団体プロフィールやイベントの登録はこちら（運営審査あり）</a></p>
        ${groupList.length ? `<div class="card-grid">${groupList.map(friendCard).join("")}</div>` : emptyNote("団体")}
      </section>
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
            <div><dt>定員</dt><dd>${escapeHtml(event.capacity)}（参加予定 <span data-attending-count="${event.id}" data-base="${event.attending ?? 0}">${attendingTotal(event)}</span>名）</dd></div>
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
              ? `<p class="past-note">このイベントは終了しました。次回の予定は<a class="text-link" href="${host ? `#/groups/${host.id}` : "#/events"}">団体ページ</a>や季節の便りでお知らせします。</p>`
              : `<div class="action-row">
                   ${actionButton({ kind: "interested", id: event.id, on: "気になるに追加ずみ", off: "気になる" })}
                   ${actionButton({ kind: "joined", id: event.id, on: "参加予定に入れました", off: "参加予定に入れる", primary: true })}
                 </div>
                 <p class="interested-count" data-interested-count="${event.id}" data-base="${event.interestedCount || 0}">${interestedTotal(event)}人が「気になる」を押しています</p>
                 <p class="form-help">まずは「気になる」だけでOK。参加予定はマイページにまとまります（実際の申込確定は主催団体からの案内で行う想定です）。</p>`
          }
          ${host ? `<div class="corner-action"><a class="card-action" href="#/groups/${host.id}">開催団体を見る</a></div>` : ""}
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
              ${sectionHeading("calendar", "More Events", "この団体のほかのイベント", "予定が合わなくても、別の回から参加できます。")}
              <div class="card-grid event-grid">${others.map((item) => eventCard(item, true)).join("")}</div>
            </section>`
          : "";
      })()}
    `,
  });
};

const renderGroupDetail = (id) => {
  const group = groupById(id);
  if (!group) return renderNotFound("団体が見つかりません", "#/members");

  const byDate = (a, b) => (parseEventDate(a.date) ?? 0) - (parseEventDate(b.date) ?? 0);
  const allGroupEvents = eventsByGroup(id);
  const groupEvents = [
    ...allGroupEvents.filter((event) => eventStatus(event) !== "past").sort(byDate),
    ...allGroupEvents.filter((event) => eventStatus(event) === "past").sort(byDate).reverse(),
  ];
  const groupSeeds = seedsByGroup(id);

  return pageFrame({
    eyebrow: "Group / Activity",
    title: group.displayName,
    copy: "地域で活動している団体・活動者の紹介ページです。直接の連絡先や畑の正確な場所は表示しません。つながりはイベント参加から始まります。",
    actions: `
      ${backLink("#/members", "仲間一覧へ戻る")}
      <a class="button button-light" href="#/manage/group">情報を編集（団体向け）</a>
      <a class="button button-ghost" href="#/manage/event">イベントを登録（団体向け）</a>
    `,
    body: `
      <article class="detail-card">
        <div class="detail-visual ${group.photo}" aria-hidden="true"></div>
        <div class="detail-body">
          <span class="privacy-note">団体・活動者</span>
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
          <p class="form-help">「活動を受け取る」と、季節の便りや新しいイベントを見逃しにくくなります（デモ・通知処理はありません）。</p>
          <h2>公式リンク</h2>
          ${officialLinks(group.links) || "<p>公式リンクは未登録です。</p>"}
          <p class="form-help">公式リンクは団体自身が管理ページで登録したものです。第三者が勝手に登録することはできません。</p>
        </div>
      </article>

      ${updatesBlock(group.updates)}

      <section class="section-block">
        ${sectionHeading("calendar", "Group Events", "この団体のイベント")}
        ${
          groupEvents.length
            ? `<div class="card-grid event-grid">${groupEvents.map((event) => eventCard(event)).join("")}</div>`
            : "<p>現在公開中のイベントはありません。</p>"
        }
      </section>

      ${relatedSeedsBlock(groupSeeds.map((seed) => seed.id), "この団体が関わる在来種")}
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
        <div class="detail-visual ${seed.photo}" aria-hidden="true"></div>
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
        <p class="auth-note">「気になる」「参加予定」「活動を受け取る」は、この端末以外でも同じ状態で表示されます。</p>
        <button type="button" class="button button-light" data-auth="signout">ログアウト</button>
      </section>
    `;
  }
  if (authEmailSent) {
    return `
      <section class="auth-panel">
        <p><strong>ログイン用のメールを送りました。</strong></p>
        <p class="auth-note">届いたメールのリンクを開くと、このサイトに戻ってログインが完了します。数分待っても届かない場合は迷惑メールもご確認ください。</p>
      </section>
    `;
  }
  return `
    <section class="auth-panel">
      <p><strong>ログイン（メールだけ・パスワード不要）</strong></p>
      <p class="auth-note">ログインすると「気になる」「参加予定」「活動を受け取る」が端末をまたいで保存されます。登録に必要なのはメールアドレスだけです。</p>
      <div class="auth-form">
        <input type="email" id="auth-email" placeholder="メールアドレス" autocomplete="email" />
        <button type="button" class="button button-primary" data-auth="send">ログインリンクを送る</button>
      </div>
    </section>
  `;
};

const renderMyPage = () => {
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
      <p class="form-help">これはデモ用の表示です。実際は、あなた自身の関心・気になる・記録がここに表示されます。</p>
      <section class="profile-panel">
        <div class="profile-main">
          <div class="avatar-placeholder" aria-hidden="true"></div>
          <div>
            <p class="profile-name">${escapeHtml(profile.displayName)}<span class="sample-tag">サンプル</span></p>
            <p>${escapeHtml(profile.area)}｜${escapeHtml(profile.status)}</p>
            <div class="tag-row">${renderTags(profile.interests)}</div>
          </div>
        </div>
        <dl class="stats-grid">
          <div><dt>参加予定</dt><dd>${ui.joined.size}件</dd></div>
          <div><dt>気になる</dt><dd>${ui.interested.size}件</dd></div>
          <div><dt>受け取り中</dt><dd>${ui.following.size}団体</dd></div>
          <div><dt>誘っている人</dt><dd>${ui.invited.size}人</dd></div>
        </dl>
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
          <h2>参加予定イベント</h2>
          ${
            joinedEvents.length
              ? `<div class="stack-list">${joinedEvents.map((event) => eventCard(event, true)).join("")}</div>`
              : `<p class="empty-note">まだありません。イベント詳細の「参加予定に入れる」を押すと、ここにまとまります。</p>`
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
  const stages = ["はじめたばかり", "プランター栽培", "家庭菜園中", "家庭菜園3年目以上", "畑あり"];
  const interestChoices = ["自然農", "自然栽培", "有機農法", "菌ちゃん農法", "在来種に関心"];
  return pageFrame({
    eyebrow: "Edit Profile",
    title: "プロフィールを編集",
    copy: "仲間探しに表示される内容を整えます。（デモのため保存はされません）",
    actions: backLink("#/mypage", "マイページへ戻る"),
    body: `
      <div class="note-layout">
        <form class="note-form" aria-label="プロフィール入力イメージ">
          <label>
            ニックネーム
            <input type="text" value="のうこ" />
          </label>
          <label>
            地域（市町村程度）
            <input type="text" value="${escapeHtml(profile.area)}" />
          </label>
          <label>
            いまのステージ
            <select>
              ${stages.map((stage) => `<option${stage === profile.status ? " selected" : ""}>${escapeHtml(stage)}</option>`).join("")}
            </select>
          </label>
          <div class="field">
            <span class="field-label">関心のあること</span>
            <span class="choice-row">
              ${interestChoices
                .map(
                  (choice) =>
                    `<label><input type="checkbox"${profile.interests.includes(choice) ? " checked" : ""} /> ${escapeHtml(choice)}</label>`,
                )
                .join("")}
            </span>
          </div>
          <label>
            ひとこと（畑の様子・いまの気分）
            <input type="text" value="プランターから畝へ。失敗も記録して楽しんでいます。" />
          </label>
          <label>
            さがしている
            <input type="text" value="近所でゆるく情報交換できる人" />
          </label>
          <label>
            アイコン画像（任意）
            <span class="fake-upload">画像を選ぶ見た目だけ</span>
          </label>
          <p class="form-help">仲間探しに表示されるのは、ニックネーム・市町村程度の地域・ステージ・関心・ひとことだけです。本名・連絡先・詳細住所は登録できません。</p>
          <button class="button button-primary" type="button">保存する（ダミー）</button>
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
    eyebrow: "団体向け管理（デモ）",
    title: "団体メニュー",
    copy: "承認された団体・活動者が、自分たちのプロフィールとイベントを登録・編集する画面です。（デモのため、ログインや保存処理はありません）",
    actions: backLink("#/members", "仲間一覧へ戻る"),
    body: `
      ${manageNoticeBlock()}
      <div class="route-grid">
        <a class="route-card" href="#/manage/group">
          <span class="route-icon">${svgIcon("users")}</span>
          <span>
            <h3>団体プロフィールを登録・編集</h3>
            <p>「仲間を探す」に表示される団体情報と公式リンクを管理します。</p>
          </span>
        </a>
        <a class="route-card" href="#/manage/event">
          <span class="route-icon">${svgIcon("calendar")}</span>
          <span>
            <h3>イベントを登録</h3>
            <p>観察会や勉強会などのイベントを新しく登録します。</p>
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
    eyebrow: "団体向け管理",
    title: "団体プロフィール登録・編集",
    copy: "「仲間を探す」に表示される団体情報を登録・編集します。新規の掲載は運営の承認後に始まります。",
    actions: backLink("#/manage", "団体メニューへ戻る"),
    body: `
      ${manageNoticeBlock()}
      ${!signedIn ? `<p class="form-help">団体を申請するには、<a class="text-link" href="#/mypage">マイページからログイン</a>してください。</p>` : ""}
      ${status ? `<p class="badge-row"><span class="tag ${status.cls}">${escapeHtml(status.label)}</span></p>` : ""}
      <div class="note-layout">
        <form class="note-form" aria-label="団体プロフィール入力フォーム">
          <label>
            団体・活動者名
            <input type="text" id="g-name" value="${escapeHtml(v.name)}" placeholder="例：小さな畝の会" />
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
          <p class="form-help">公開されるのは市町村程度の地域までです。詳細住所・個人の連絡先は登録・表示しません。</p>
          <p class="form-error" data-group-error hidden></p>
          ${
            canSave
              ? `<button class="button button-primary" type="button" data-group-save${group ? ` data-group-id="${group.id}"` : ""}>${group ? "保存する" : "申請する（運営審査へ）"}</button>`
              : `<button class="button button-primary" type="button" disabled>申請する（ログインが必要）</button>`
          }
        </form>
        <aside class="side-panel">
          <h3>登録の方針</h3>
          <p>公式リンクは団体自身が登録します。第三者が勝手に登録することはできません。</p>
          <p>団体アカウントは運営の審査・承認を経て発行されます。</p>
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
      ? `<p class="form-help">イベントを登録できるのは承認済み団体のみです。まず<a class="text-link" href="#/manage/group">団体プロフィールを申請</a>し、運営の承認をお待ちください。</p>`
      : "";

  return pageFrame({
    eyebrow: "団体向け管理",
    title: "イベント登録",
    copy: canSave
      ? "登録したイベントは運営の確認後に公開されます。"
      : "団体が新しいイベントを登録するフォームです。登録は承認済み団体のみ可能です。",
    actions: backLink("#/manage", "団体メニューへ戻る"),
    body: `
      ${manageNoticeBlock()}
      ${gate}
      <div class="note-layout">
        <form class="note-form" aria-label="イベント登録フォーム">
          <div class="field">
            <span class="field-label">開催団体</span>
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
              : `<button class="button button-primary" type="button" disabled>登録する（承認済み団体のみ）</button>`
          }
        </form>
        <aside class="side-panel">
          <h3>登録の注意</h3>
          <p>イベントは運営確認のうえ公開されます。</p>
          <p>誰でも自由に作成できる仕様ではなく、承認済み団体のみ登録できます。</p>
          <div class="tag-row">
            <span class="tag">承認済み団体のみ</span>
            <span class="tag">運営確認</span>
            <span class="tag">位置情報は段階公開</span>
          </div>
        </aside>
      </div>
    `,
  });
};

const routeTable = {
  home: () => renderHome(),
  members: () => renderMembers(),
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
    if (parts[1] === "admin") return renderAdminQueue();
    return renderManageHome();
  },
};

// ---- 運営の承認キュー（P2-4）----
let adminQueue = null;
const loadAdminQueue = async () => {
  const [pendingGroups, pendingEvents, pendingContributions] = await Promise.all([
    window.NOU_API.fetchPendingGroups(),
    window.NOU_API.fetchPendingEvents(),
    window.NOU_API.fetchPendingContributions(),
  ]);
  adminQueue = { groups: pendingGroups, events: pendingEvents, contributions: pendingContributions };
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
    copy: "団体の承認と、イベントの公開を行います。承認・公開すると即座にサイトに表示されます。",
    actions: `
      ${backLink("#/manage", "団体メニューへ戻る")}
      <button class="button button-light" type="button" data-admin="reload">再読み込み</button>
    `,
    body: `
      ${manageNoticeBlock()}
      <section class="section-block">
        ${sectionHeading("users", "Groups", "承認待ちの団体", "活動の実在性と方針への同意を確認してから承認します。")}
        ${
          adminQueue.groups.length
            ? adminQueue.groups
                .map(
                  (group) => `
                    <article class="detail-card admin-card">
                      <div class="detail-body">
                        <h3>${escapeHtml(group.display_name)}</h3>
                        <p>${escapeHtml(group.area)}｜${escapeHtml(group.stage || "")}</p>
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
            : `<p class="empty-note">承認待ちの団体はありません。</p>`
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
    const isActive =
      route === rootRoute ||
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
      color: "#ffffff",
      weight: 2,
      fillColor: research ? "#f59a23" : "#2e7d32",
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

const renderApp = () => {
  // ログインメールから戻った直後は #access_token=... が付く。supabase-js が処理するまで描画しない。
  if (window.location.hash && !window.location.hash.startsWith("#/")) return;
  const parts = getHashParts();
  const rootRoute = rootRouteFor(parts);
  const view = routeTable[rootRoute] ? routeTable[rootRoute](parts) : renderNotFound();

  app.innerHTML = view;
  updateActiveNav(rootRoute);
  setPageTitle(app.querySelector("h1")?.textContent ?? "");
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
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
        errorEl.textContent = "団体名と活動地域を入れてください。";
        errorEl.hidden = false;
      }
      return;
    }
    const payload = {
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
        manageNotice = "便りを届けました。団体ページとホームに表示されます。";
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
        if (action !== "reload") manageNotice = "反映しました。";
        renderApp();
      })
      .catch((error) => {
        console.warn("承認操作に失敗しました。", error);
        adminButton.disabled = false;
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
        renderApp();
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
        await Promise.all([loadMyNotes(), loadMyProfile(), loadMyGroups()]);
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
      }
      renderApp();
    });
    if (session) {
      await syncMyStateWithDb();
      await Promise.all([loadMyNotes(), loadMyProfile(), loadMyGroups()]);
    }
  }

  if (hydrated || session) renderApp();
});
