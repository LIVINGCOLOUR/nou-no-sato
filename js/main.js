const { events, friends, methods, notes, routes, seeds } = window.NOU_NO_SATO_DATA;

const iconPaths = {
  users:
    "M8 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm8.5 1a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7ZM2 21c.6-4 2.8-6.5 6-6.5S13.4 17 14 21H2Zm12.5 0c-.2-1.7-.8-3.2-1.7-4.3 1-.8 2.2-1.2 3.7-1.2 2.9 0 4.9 2.1 5.5 5.5h-7.5Z",
  calendar: "M5 3h2v2h10V3h2v2h2v16H3V5h2V3Zm14 8H5v8h14v-8Z",
  book:
    "M4 5.5C6.6 4.2 9.4 4.2 12 5.5c2.6-1.3 5.4-1.3 8 0V20c-2.6-1.2-5.4-1.2-8 0-2.6-1.2-5.4-1.2-8 0V5.5Zm7 2C9.4 6.8 7.7 6.7 6 7.2v9.9c1.7-.4 3.4-.3 5 .3V7.5Zm2 9.9c1.6-.6 3.3-.7 5-.3V7.2c-1.7-.5-3.4-.4-5 .3v9.9Z",
  note: "M5 3h12l2 2v16H5V3Zm3 5h8V6H8v2Zm0 4h8v-2H8v2Zm0 4h5v-2H8v2Z",
  map:
    "M4 4.5 10 2l5 2.5L20 2v17.5L15 22l-5-2.5L4 22V4.5Zm7 .9v12.4l3 1.5V6.9l-3-1.5Z",
};

const qs = (selector) => document.querySelector(selector);

const createSvg = (name) => `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="${iconPaths[name] ?? iconPaths.book}"></path>
  </svg>
`;

const routeGrid = qs("#route-grid");
routeGrid.innerHTML = routes
  .map(
    (route) => `
      <a class="route-card" href="#${route.id}">
        <span class="route-icon">${createSvg(route.icon)}</span>
        <span>
          <h3>${route.title}</h3>
          <p>${route.text}</p>
        </span>
      </a>
    `,
  )
  .join("");

const renderFriends = (filter = "all") => {
  const list = qs("#friends-list");
  const visibleFriends =
    filter === "all" ? friends : friends.filter((friend) => friend.methods.includes(filter));

  list.innerHTML = visibleFriends
    .map(
      (friend) => `
        <article class="friend-card">
          <div class="friend-top">
            <div class="friend-photo ${friend.photo}" aria-hidden="true"></div>
            <div>
              <h3>${friend.area}</h3>
              <p>${friend.interest}</p>
            </div>
          </div>
          <div class="tag-row">
            <span class="tag">${friend.status}</span>
            ${friend.methods.map((method) => `<span class="tag">${method}</span>`).join("")}
          </div>
          <p>${friend.note}</p>
          <span class="privacy-note">市町村程度・詳細住所なし</span>
          <a class="card-action" href="#profile">プロフィールを見る</a>
        </article>
      `,
    )
    .join("");
};

renderFriends();

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    renderFriends(button.dataset.filter);
  });
});

qs("#events-list").innerHTML = events
  .map(
    (event) => `
      <article class="event-card">
        <div class="event-top">
          <div class="event-date">${event.date}<small>${event.day}</small></div>
          <div>
            <h3>${event.title}</h3>
            <p>${event.description}</p>
          </div>
        </div>
        <div class="event-meta">
          <span>場所：${event.place}</span>
          <span>定員：${event.capacity}</span>
          <span>登録：運営登録イベント</span>
        </div>
        <button class="button button-primary" type="button">参加する</button>
      </article>
    `,
  )
  .join("");

qs("#method-board").innerHTML = methods
  .map(
    (method) => `
      <article class="method-card method-${method.color}">
        <h3>${method.name}</h3>
        <ul class="method-list">
          <li><strong>耕すか</strong>${method.values.tilling}</li>
          <li><strong>肥料の考え方</strong>${method.values.fertilizer}</li>
          <li><strong>草の扱い</strong>${method.values.grass}</li>
          <li><strong>農薬の考え方</strong>${method.values.pesticide}</li>
          <li><strong>試しやすい場面</strong>${method.values.beginner}</li>
        </ul>
      </article>
    `,
  )
  .join("");

qs("#notes-list").innerHTML = notes
  .map(
    (note) => `
      <article class="note-card">
        <div class="note-photo ${note.photo}" aria-hidden="true"></div>
        <h3>${note.date}｜${note.crop}</h3>
        <div class="tag-row">
          <span class="tag">${note.method}</span>
          <span class="tag">非公開</span>
          <span class="tag">位置情報なし</span>
        </div>
        <p>${note.memo}</p>
        <p>学び：${note.learning}</p>
      </article>
    `,
  )
  .join("");

qs("#seeds-list").innerHTML = seeds
  .map(
    (seed) => `
      <article class="seed-card">
        <div class="seed-top">
          <div class="seed-photo ${seed.photo}" aria-hidden="true"></div>
          <div>
            <h3>${seed.area}</h3>
            <p>${seed.name}</p>
          </div>
        </div>
        <p>${seed.note}</p>
        <span class="privacy-note">運営整備データ</span>
      </article>
    `,
  )
  .join("");

const navLinks = document.querySelectorAll(".bottom-nav a");
const watchedSections = ["home", "friends", "events", "learn", "notes"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.nav === visible.target.id);
    });
  },
  {
    rootMargin: "-35% 0px -55% 0px",
    threshold: [0.1, 0.25, 0.5],
  },
);

watchedSections.forEach((section) => observer.observe(section));
