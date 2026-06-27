const data = window.NOU_NO_SATO_DATA;
const { events, friends, methods, notes, profile, routes, seeds, peers, onboarding } = data;

const app = document.querySelector("#app");

// セッション内だけ保持する軽い操作状態（永続化・バックエンドなし）。
const ui = {
  interested: new Set(), // 気になるイベント
  following: new Set(), // 活動を受け取る団体
  connect: new Set(), // ゆるくつながりたい個人
  memberMethod: "all", // 仲間ページの農法フィルタ
  eventType: "all", // イベントページの種別フィルタ
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
  document.title = title ? `${title} | 農の里` : "農の里 | クリック可能Phase 1プロトタイプ";
};

const methodById = (id) => methods.find((method) => method.id === id);
const eventById = (id) => events.find((event) => event.id === id);
const seedById = (id) => seeds.find((seed) => seed.id === id);
const groupById = (id) => friends.find((group) => group.id === id);
const eventsByGroup = (id) => events.filter((event) => event.hostGroupId === id);
const seedsByGroup = (id) => seeds.filter((seed) => seed.relatedGroupId === id);

const renderTags = (items) => items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");

const backLink = (href, label = "戻る") => `<a class="back-link" href="${href}">${label}</a>`;

// セッション内で実際に切り替わる軽いトグル（気になる / 受け取る / つながる）。
const actionButton = ({ kind, id, on, off }) => {
  const active = ui[kind].has(id);
  return `
    <button
      class="pill-toggle ${active ? "is-on" : ""}"
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

const routeCards = () => `
  <div class="route-grid">
    ${routes
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

const onboardingSection = () => `
  <section class="section-block">
    ${sectionHeading("book", "First Step", "はじめての方へ", "3つの小さなステップから。いきなり申し込まなくて大丈夫です。")}
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

const eventCard = (event, compact = false) => `
  <article class="event-card ${compact ? "card-compact" : ""}">
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
      <span class="tag">${escapeHtml(event.type)}</span>
      <span class="tag">運営登録</span>
    </div>
    ${
      compact
        ? ""
        : `<div class="action-row">
            ${actionButton({ kind: "interested", id: event.id, on: "気になるに追加ずみ", off: "気になる" })}
            <a class="card-action card-action-inline" href="#/events/${event.id}">詳細を見る</a>
          </div>`
    }
    ${compact ? `<a class="card-action" href="#/events/${event.id}">詳細を見る</a>` : ""}
  </article>
`;

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
        : actionButton({ kind: "connect", id: peer.id, on: "つながり希望ずみ", off: "ゆるくつながる" })
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
    eyebrow: "自然農・自然栽培・有機農法に関心のある人へ",
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
          <h2>地元で農を学び、出会い、記録する。</h2>
          <p>自然農や有機農法に関心のある人が、近くの仲間やイベントとゆるくつながる場所。ひとりの「やってみたい」から始められます。</p>
          <div class="hero-points">
            <span>市町村程度の地域表示</span>
            <span>栽培記録は基本非公開</span>
            <span>農法比較は優劣なし</span>
          </div>
        </div>
      </section>

      ${onboardingSection()}

      <section class="section-block">
        ${sectionHeading("users", "Explore", "できること", "気になるところから、ゆっくり覗いてください。")}
        ${routeCards()}
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
    copy: "同じ地域・同じ関心の人が、近くで静かに育てています。まずは眺めるだけ、気になったら軽く一歩。直接の連絡先や畑の正確な場所は表示しません。",
    actions: `
      ${backLink("#/home", "ホームへ戻る")}
      <a class="button button-light" href="#/events">イベントを見る</a>
    `,
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

  return pageFrame({
    eyebrow: "Real Events",
    title: "イベント一覧",
    copy: "運営登録イベントだけを一覧します。誰でもイベント作成できる導線はありません。まずは「気になる」で印をつけて、行くかは後で決められます。",
    actions: `
      ${backLink("#/home", "ホームへ戻る")}
      <a class="button button-light" href="#/mypage">参加予定を見る</a>
    `,
    tone: "warm-view",
    body: `
      ${filterChips("eventType", eventTypeOptions)}
      ${
        list.length
          ? `<div class="card-grid event-grid">${list.map((event) => eventCard(event)).join("")}</div>`
          : `<p class="empty-note">この種別のイベントは今ありません。「すべて」に戻して見てください。</p>`
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
    copy: "参加前に雰囲気と基本情報を確認する静的詳細画面です。実際の登録処理はありません。",
    actions: `
      ${backLink("#/events", "イベント一覧へ戻る")}
      ${host ? `<a class="button button-light" href="#/groups/${host.id}">開催団体を見る</a>` : ""}
    `,
    tone: "warm-view",
    body: `
      <article class="detail-card event-detail">
        <div class="detail-visual ${event.photo}" aria-hidden="true"></div>
        <div class="detail-body">
          <span class="privacy-note">運営登録イベント</span>
          ${event.welcome ? `<p class="welcome-banner">${escapeHtml(event.welcome)}</p>` : ""}
          <h2>開催情報</h2>
          <dl class="detail-list">
            <div><dt>日時</dt><dd>${escapeHtml(event.date)}(${escapeHtml(event.day)}) ${escapeHtml(event.time)}</dd></div>
            <div><dt>地域</dt><dd>${escapeHtml(event.place)}</dd></div>
            <div><dt>定員</dt><dd>${escapeHtml(event.capacity)}</dd></div>
            <div><dt>主催</dt><dd>${host ? `<a class="text-link" href="#/groups/${host.id}">${escapeHtml(host.displayName)}</a>` : escapeHtml(event.host)}</dd></div>
            <div><dt>持ち物</dt><dd>${escapeHtml(event.belongings)}</dd></div>
          </dl>
          <p>${escapeHtml(event.description)}</p>
          <p class="form-help">${escapeHtml(event.note)}</p>
          <div class="action-row">
            ${actionButton({ kind: "interested", id: event.id, on: "気になるに追加ずみ", off: "気になる" })}
            <button class="button button-primary" type="button">参加予定に入れる（デモ）</button>
          </div>
          <p class="form-help">まずは「気になる」だけでOK。参加するかは後から決められます。</p>
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

const renderLearn = () =>
  pageFrame({
    eyebrow: "Learn Farming Styles",
    title: "農法を学ぶ",
    copy: "まずは農法ごとの雰囲気と試しやすい入口をつかみます。比較軸は詳細画面で確認します。",
    actions: backLink("#/home", "ホームへ戻る"),
    body: `
      <p class="method-note">
        比較は優劣づけではありません。畑の広さ、土の状態、地域の気候、続けやすさによって選び方が変わります。
      </p>
      <div class="method-board">${methods.map(methodCard).join("")}</div>

      <section class="section-block">
        ${sectionHeading("map", "Native Varieties", "在来種・固定種を知る")}
        <a class="route-card" href="#/native-map">
          <span class="route-icon">${svgIcon("map")}</span>
          <span>
            <h3>在来種マップを見る</h3>
            <p>茨城県に伝わる在来種・固定種を、地図と出典つきで地域ごとに知る。</p>
          </span>
        </a>
      </section>
    `,
  });

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
        </div>
        <aside class="side-panel">
          <h3>比較軸</h3>
          <ul class="method-list">
            <li><strong>耕すか</strong>${escapeHtml(method.values.tilling)}</li>
            <li><strong>肥料</strong>${escapeHtml(method.values.fertilizer)}</li>
            <li><strong>草</strong>${escapeHtml(method.values.grass)}</li>
            <li><strong>農薬</strong>${escapeHtml(method.values.pesticide)}</li>
          </ul>
        </aside>
      </article>
    `,
  });
};

const renderNotes = () =>
  pageFrame({
    eyebrow: "Private Field Notes",
    title: "栽培記録",
    copy: "自分の観察を振り返るための画面です。Phase 1では基本非公開で、位置情報や詳細な畑住所は扱いません。",
    actions: `
      ${backLink("#/home", "ホームへ戻る")}
      <a class="button button-primary" href="#/notes/new">新しく記録する</a>
    `,
    body: `
      <div class="trust-list">
        <div><strong>基本非公開</strong><span>公開タイムラインはありません。</span></div>
        <div><strong>位置情報なし</strong><span>畑住所や正確な地点は扱いません。</span></div>
        <div><strong>自分の学び</strong><span>共有よりも振り返りを優先します。</span></div>
      </div>
      <div class="card-grid compact-grid">${notes.map(noteCard).join("")}</div>
    `,
  });

const renderNoteForm = () =>
  pageFrame({
    eyebrow: "Create Field Note",
    title: "栽培記録を書く",
    copy: "作物、日付、ひとことだけで残せる静的フォームです。保存処理やlocalStorage保存はありません。",
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
    copy: "茨城県に伝わる在来種・固定種を、地域単位の概略位置で表示します。正確な採種場所や個人宅は示しません。出典つきで少しずつ整理しています。",
    actions: backLink("#/home", "ホームへ戻る"),
    body: `
      <div class="seed-map">
        <div class="map-area">
          <div id="seed-map-canvas" class="map-canvas" aria-label="茨城県の在来種マップ">
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

      <section class="section-block contribute-cta">
        <div>
          <h2>地域の種の情報を寄せる</h2>
          <p>「うちの地域にこんな種がある」を、運営確認のうえで少しずつ地図に加えています。住民の方の知識が、このマップを育てます。</p>
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
    copy: "地域と作物の背景を知るための静的詳細です。出典を確認したうえで掲載し、正確な採種地点や個人宅は表示しません。",
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
  const followingGroups = friends.filter((group) => ui.following.has(group.id));

  return pageFrame({
    eyebrow: "My Page",
    title: "マイページ",
    copy: "SNS的な自己表現ではなく、自分の関心、気になっていること、栽培記録を軽く振り返る画面です。",
    actions: `
      ${backLink("#/home", "ホームへ戻る")}
      <a class="button button-light" href="#/notes">栽培記録を見る</a>
    `,
    body: `
      <section class="profile-panel">
        <div class="profile-main">
          <div class="avatar-placeholder" aria-hidden="true"></div>
          <div>
            <p class="profile-name">${escapeHtml(profile.displayName)}</p>
            <p>${escapeHtml(profile.area)}｜${escapeHtml(profile.status)}</p>
            <div class="tag-row">${renderTags(profile.interests)}</div>
          </div>
        </div>
        <dl class="stats-grid">
          <div><dt>栽培記録</dt><dd>${profile.noteCount}件</dd></div>
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
          <div class="stack-list">${events.slice(0, profile.upcomingEvents).map((event) => eventCard(event, true)).join("")}</div>
        </div>
        <div>
          <h2>最近の栽培記録</h2>
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
            持ち物
            <input type="text" value="帽子、飲み物、汚れてもよい靴" />
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
      (route === "learn" && (rootRoute === "native-map" || rootRoute === "native-varieties"));

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
  seedMap = L.map(el, { scrollWheelZoom: false }).setView([36.3, 140.3], 9);
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
  if (!window.location.hash) {
    window.location.replace("#/home");
    return;
  }

  renderApp();
});
