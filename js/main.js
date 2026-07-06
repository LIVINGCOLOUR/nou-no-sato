const data = window.NOU_NO_SATO_DATA;
const { events, friends, methods, notes, profile, routes, seeds, peers, onboarding, techniques } = data;

const app = document.querySelector("#app");

// 軽い操作状態。気になる/受け取る/つながるはブラウザに保存して再訪でも残す。
// フィルタはセッション内のみ。記録・プロフィール・フォーム入力は保存しない。
const ui = {
  interested: new Set(), // 気になるイベント
  joined: new Set(), // 参加予定に入れたイベント
  following: new Set(), // 活動を受け取る団体
  invited: new Set(), // イベントに誘った個人
  memberMethod: "all", // 仲間ページの農法フィルタ
  eventType: "all", // イベントページの種別フィルタ
};

const STORE_KEY = "nounosato:ui";
const PERSISTED = ["interested", "joined", "following", "invited"];

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
  document.title = title ? `${title} | 農の里` : "農の里";
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

const eventTypeOptions = [
  { value: "all", label: "すべて" },
  ...[...new Set(events.map((event) => event.type))].map((type) => ({ value: type, label: type })),
];

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
        <p class="event-line">${escapeHtml(event.place)}｜${escapeHtml(event.time)}｜定員${escapeHtml(event.capacity)}</p>
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

const peerCard = (peer) => `
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
    <p class="peer-looking"><span>さがしている：</span>${escapeHtml(peer.lookingFor)}</p>
    ${
      peer.isMe
        ? `<a class="card-action" href="#/mypage">自分のページを見る</a>`
        : actionButton({ kind: "invited", id: peer.id, on: "イベントに誘いました", off: "イベントに誘う" })
    }
    <span class="privacy-note">ニックネーム・市町村程度のみ</span>
  </article>
`;

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
        <h3>${escapeHtml(friend.interest)}</h3>
        <div class="tag-row">${renderTags(friend.methods)}</div>
        <p>${escapeHtml(friend.note)}</p>
        <p class="rhythm-line"><strong>活動リズム：</strong>${escapeHtml(friend.rhythm)}</p>
        ${friend.welcome ? `<p class="welcome-line">${escapeHtml(friend.welcome)}</p>` : ""}
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

const noteCard = (note) => `
  <article class="note-card">
    <div class="note-top">
      <div class="note-photo ${note.photo}" aria-hidden="true"></div>
      <div>
        <h3>${escapeHtml(note.date)}｜${escapeHtml(note.crop)}</h3>
        <p>${escapeHtml(note.memo)}</p>
      </div>
    </div>
    <div class="tag-row">
      <span class="tag">${escapeHtml(note.method)}</span>
      <span class="tag">非公開</span>
      <span class="tag">位置情報なし</span>
    </div>
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
    title: "農の里",
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
          <h2>自然な農業に関心がある仲間と、地元でつながる。</h2>
          <p>自然農や有機などの自然に寄り添う農法で家庭菜園をする人が、近くの仲間やイベントとゆるくつながる場所。</p>
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

      ${onboardingSection()}

      <section class="section-block">
        ${sectionHeading("note", "More", "ほかにできること", "記録や在来種マップも、いつでもどうぞ。")}
        ${routeCards(["notes", "native-map"])}
      </section>
    `,
  });

const renderMembers = () => {
  const method = ui.memberMethod;
  const matchMethod = (item) => method === "all" || (item.methods || []).includes(method);
  const peerList = peers.filter(matchMethod);
  const groupList = friends.filter(matchMethod);

  const emptyNote = (label) =>
    `<p class="empty-note">「${escapeHtml(method)}」に当てはまる${label}はまだ少ないようです。別の関心でも探してみてください。</p>`;

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

      ${filterChips("memberMethod", methodFilterOptions)}

      <section class="section-block">
        ${sectionHeading("users", "Individuals", "近くの個人", "同じくらいの段階の人と、ゆるく知り合えます。")}
        ${peerList.length ? `<div class="card-grid">${peerList.map(peerCard).join("")}</div>` : emptyNote("個人")}
        <p class="form-help">気になった人は、まずイベントに誘ってみましょう。より深くやりとりするための連絡先の交換は、イベントで直接会ったときに個人どうしでどうぞ。</p>
      </section>

      <section class="section-block">
        ${sectionHeading("users", "Groups", "地域の団体・サークル", "活動のリズムがある集まり。イベント参加からつながれます。")}
        ${groupList.length ? `<div class="card-grid">${groupList.map(friendCard).join("")}</div>` : emptyNote("団体")}
      </section>

      <p class="form-help">団体・活動者の方へ：<a class="text-link" href="#/manage">団体プロフィールやイベントを登録（団体向け管理）</a></p>
    `,
  });
};

const renderEvents = () => {
  const type = ui.eventType;
  const list = events.filter((event) => type === "all" || event.type === type);

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
      ${filterChips("eventType", eventTypeOptions)}
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
          : `<p class="empty-note">この種別の募集中イベントは今ありません。「すべて」に戻して見てください。</p>`
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
    `,
  });
};

const renderGroupDetail = (id) => {
  const group = groupById(id);
  if (!group) return renderNotFound("団体が見つかりません", "#/members");

  const groupEvents = eventsByGroup(id);
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
    eyebrow: "Learn Farming Styles",
    title: "農法を学ぶ",
    copy: "農法ごとの雰囲気と、地域の在来種を、気軽に眺められます。",
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
    `,
  });
};

const renderNotes = () =>
  pageFrame({
    eyebrow: "Private Field Notes",
    title: "栽培記録",
    copy: "自分だけの非公開メモ。位置情報や畑の住所は扱いません。",
    actions: `<a class="button button-primary" href="#/notes/new">新しく記録する</a>`,
    body: `
      <div class="trust-list">
        <div><strong>基本非公開</strong><span>公開タイムラインはありません。</span></div>
        <div><strong>位置情報なし</strong><span>畑住所や正確な地点は扱いません。</span></div>
        <div><strong>自分の学び</strong><span>共有よりも振り返りを優先します。</span></div>
      </div>
      <p class="form-help">下のカードは記入例です。</p>
      <div class="card-grid compact-grid">${notes.map(noteCard).join("")}</div>
    `,
  });

const renderNoteForm = () =>
  pageFrame({
    eyebrow: "Create Field Note",
    title: "栽培記録を書く",
    copy: "作物・日付・ひとことだけで残せます。（デモのため保存はされません）",
    actions: backLink("#/notes", "栽培記録へ戻る"),
    body: `
      <div class="note-layout">
        <form class="note-form" aria-label="栽培記録入力イメージ">
          <label>
            作物
            <input type="text" value="ミニトマト" />
          </label>
          <label>
            日付
            <input type="date" value="2026-06-21" />
          </label>
          <label>
            ひとこと
            <textarea rows="4">葉が少し黄色い。水やりの間隔を見直す。</textarea>
          </label>
          <label>
            写真を追加（任意）
            <span class="fake-upload">写真を選ぶ見た目だけ</span>
          </label>
          <label class="toggle-line">
            <input type="checkbox" checked disabled />
            公開設定：非公開
          </label>
          <p class="form-help">この記録は自分だけに表示されます。正確な位置情報や詳細な畑住所は保存しません。</p>
          <button class="button button-primary" type="button">保存する（ダミー）</button>
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

const renderSeedContribute = () =>
  pageFrame({
    eyebrow: "Contribute",
    title: "在来種の情報提供",
    copy: "地域に伝わる種の情報を運営に伝える静的フォームです。保存処理はありません。寄せられた情報は運営が出典や状況を確認したうえで、地域の目安として掲載します。",
    actions: backLink("#/native-map", "在来種マップへ戻る"),
    body: `
      <div class="note-layout">
        <form class="note-form" aria-label="在来種 情報提供入力イメージ">
          <label>
            作物名・通称
            <input type="text" value="" placeholder="例：◯◯ねぎ、地域での呼び名" />
          </label>
          <label>
            作物の分類（任意）
            <input type="text" value="" placeholder="例：ねぎ、だいこん、大豆" />
          </label>
          <label>
            地域（市町村程度）
            <input type="text" value="" placeholder="例：石岡市八郷周辺" />
          </label>
          <label>
            言い伝え・特徴
            <textarea rows="3" placeholder="どんな種か、いつ頃から、どんな味や使われ方か など"></textarea>
          </label>
          <label>
            出典・聞いた人（任意）
            <input type="text" value="" placeholder="資料名、URL、地域の方からの聞き取り など" />
          </label>
          <label class="toggle-line">
            <input type="checkbox" disabled />
            運営からの確認連絡を受け取ってもよい
          </label>
          <p class="form-help">正確な採種地点・個人宅・栽培者の氏名は登録しません。掲載するのは市町村程度の地域目安だけです。販売や出品の場ではありません。</p>
          <button class="button button-primary" type="button">運営に送る（デモ）</button>
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

const renderMyPage = () => {
  const interestedEvents = events.filter((event) => ui.interested.has(event.id));
  const joinedEvents = events
    .filter((event) => ui.joined.has(event.id))
    .sort((a, b) => (parseEventDate(a.date) ?? 0) - (parseEventDate(b.date) ?? 0));
  const followingGroups = friends.filter((group) => ui.following.has(group.id));

  return pageFrame({
    eyebrow: "My Page",
    title: "マイページ",
    copy: "自分の関心や、気になっていることを軽く振り返る画面です。",
    actions: backLink("#/home", "ホームへ戻る"),
    body: `
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
          <h2>最近の栽培記録（記入例）</h2>
          <div class="card-grid compact-grid">${notes.slice(0, 2).map(noteCard).join("")}</div>
        </div>
      </section>
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
    copy: "承認された団体・活動者が、自分たちのプロフィールとイベントを登録・編集する画面です。Phase 1ではダミーの静的フォームで、ログインや保存処理はありません。",
    actions: backLink("#/members", "仲間一覧へ戻る"),
    body: `
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
      <p class="form-help">実際の運用では、団体登録は運営の審査・承認を経たアカウントだけが利用できます。第三者が他団体の情報を登録・編集することはできません。</p>
    `,
  });

const renderManageGroup = () =>
  pageFrame({
    eyebrow: "団体向け管理（デモ）",
    title: "団体プロフィール登録・編集",
    copy: "「仲間を探す」に表示される団体情報を登録・編集する静的フォームです。保存処理はありません。",
    actions: backLink("#/manage", "団体メニューへ戻る"),
    body: `
      <div class="note-layout">
        <form class="note-form" aria-label="団体プロフィール入力イメージ">
          <label>
            団体・活動者名
            <input type="text" value="小さな畝の会" />
          </label>
          <label>
            活動地域（市町村程度）
            <input type="text" value="笠間市" />
          </label>
          <div class="field">
            <span class="field-label">主な農法</span>
            <span class="choice-row">
              <label><input type="checkbox" checked /> 自然農</label>
              <label><input type="checkbox" /> 自然栽培</label>
              <label><input type="checkbox" /> 有機農法</label>
              <label><input type="checkbox" /> 菌ちゃん農法</label>
            </span>
          </div>
          <label>
            ひとこと・関心
            <input type="text" value="自然農に興味あり / 家庭菜園1年目" />
          </label>
          <label>
            活動の紹介
            <textarea rows="3">小さな畝で葉物から始めています。草を全部抜かず、様子を見ながら続けています。</textarea>
          </label>
          <label>
            活動内容
            <input type="text" value="月1回の観察会を開催" />
          </label>
          <label>
            活動リズム
            <input type="text" value="毎月 第4日曜・午前" />
          </label>
          <label>
            公式サイトURL（任意）
            <input type="url" value="https://example.com/konaune-no-kai" />
          </label>
          <label>
            Instagram（任意）
            <input type="url" value="https://example.com/ig/konaune" />
          </label>
          <label>
            その他公式SNS（任意）
            <input type="url" value="" placeholder="https://" />
          </label>
          <label>
            ロゴ・写真（任意）
            <span class="fake-upload">画像を選ぶ見た目だけ</span>
          </label>
          <p class="form-help">公開されるのは市町村程度の地域までです。詳細住所・個人の連絡先は登録・表示しません。</p>
          <button class="button button-primary" type="button">保存する（ダミー）</button>
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
    `,
  });

const renderManageEventForm = () =>
  pageFrame({
    eyebrow: "団体向け管理（デモ）",
    title: "イベント登録",
    copy: "団体が新しいイベントを登録する静的フォームです。保存処理はありません。実際の登録は承認済み団体のみ可能です。",
    actions: backLink("#/manage", "団体メニューへ戻る"),
    body: `
      <div class="note-layout">
        <form class="note-form" aria-label="イベント登録入力イメージ">
          <div class="field">
            <span class="field-label">開催団体</span>
            <span class="static-field">小さな畝の会（ログイン中の団体）</span>
          </div>
          <label>
            イベント名
            <input type="text" value="里山の草取りと観察会" />
          </label>
          <label>
            種別
            <select>
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
            <input type="date" value="2026-06-28" />
          </label>
          <label>
            時間
            <input type="text" value="10:00 - 12:00" />
          </label>
          <label>
            開催地域（市町村程度）
            <input type="text" value="笠間市周辺" />
          </label>
          <label>
            定員
            <input type="text" value="8名" />
          </label>
          <label>
            料金
            <input type="text" value="無料" placeholder="例：無料 / 500円（材料費）" />
          </label>
          <label>
            申込締切
            <input type="date" value="2026-06-25" />
          </label>
          <label>
            持ち物
            <input type="text" value="帽子、飲み物、汚れてもよい靴" />
          </label>
          <label>
            雨天時の扱い
            <input type="text" value="小雨決行。荒天時は中止（前日18時までにご連絡）" />
          </label>
          <label>
            当日の流れ（任意）
            <textarea rows="3">10:00 集合・自己紹介 / 10:20 畑を歩いて草の観察 / 11:20 考え方の話 / 11:50 ふりかえり</textarea>
          </label>
          <label>
            紹介文
            <textarea rows="3">畑まわりの草を観察し、残す草と刈る草の考え方を学びます。</textarea>
          </label>
          <label>
            はじめての方へのひとこと（任意）
            <input type="text" value="初参加・見学だけ・途中参加も歓迎です。手ぶらで大丈夫。" />
          </label>
          <label>
            補足・注意（任意）
            <textarea rows="2">詳細住所は参加確定後に運営から案内する想定です。</textarea>
          </label>
          <label>
            写真（任意）
            <span class="fake-upload">画像を選ぶ見た目だけ</span>
          </label>
          <p class="form-help">詳細住所や正確な開催地点は、参加確定後に案内する想定です。販売・出品の場ではありません。</p>
          <button class="button button-primary" type="button">登録する（ダミー）</button>
        </form>
        <aside class="side-panel">
          <h3>登録の注意</h3>
          <p>イベントは運営確認のうえ公開される想定です。</p>
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

const routeTable = {
  home: () => renderHome(),
  members: () => renderMembers(),
  groups: (parts) => renderGroupDetail(parts[1]),
  events: (parts) => (parts[1] ? renderEventDetail(parts[1]) : renderEvents()),
  learn: (parts) => (parts[1] ? renderMethodDetail(parts[1]) : renderLearn()),
  techniques: (parts) => (parts[1] ? renderTechniqueDetail(parts[1]) : renderLearn()),
  notes: (parts) => (parts[1] === "new" ? renderNoteForm() : renderNotes()),
  "native-map": (parts) => (parts[1] === "contribute" ? renderSeedContribute() : renderNativeMap()),
  "native-varieties": (parts) => renderSeedDetail(parts[1]),
  mypage: () => renderMyPage(),
  manage: (parts) => {
    if (parts[1] === "group") return renderManageGroup();
    if (parts[1] === "event") return renderManageEventForm();
    return renderManageHome();
  },
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

window.addEventListener("hashchange", renderApp);
window.addEventListener("DOMContentLoaded", () => {
  loadUi();

  if (!window.location.hash) {
    window.location.replace("#/home");
    return;
  }

  renderApp();
});
