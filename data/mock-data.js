window.NOU_NO_SATO_DATA = {
  routes: [
  {
    id: "friends",
    title: "地元の仲間を探す",
    text: "市町村程度の地域と関心ごとから、近くの実践者や初心者をゆるく見つけます。",
    icon: "users",
  },
  {
    id: "events",
    title: "イベントを見る",
    text: "観察会、勉強会、種交換会など、運営登録のリアルな場につながります。",
    icon: "calendar",
  },
  {
    id: "learn",
    title: "農法を学ぶ",
    text: "自然農、自然栽培、有機農法などの違いを、やさしい比較で学びます。",
    icon: "book",
  },
  {
    id: "notes",
    title: "畑ノートを記録する",
    text: "写真と一言で、作物の変化や困ったこと、学びを自分だけの記録として残します。",
    icon: "note",
  },
  {
    id: "seeds",
    title: "在来種マップを見る",
    text: "地域の在来種・固定種を、運営整備のカードとピン風UIで眺めます。",
    icon: "map",
  },
  ],

  friends: [
  {
    area: "笠間市",
    interest: "自然農に興味あり",
    status: "家庭菜園1年目",
    methods: ["自然農", "家庭菜園"],
    note: "小さな畝で葉物から始めています。",
    photo: "photo-field",
  },
  {
    area: "石岡市",
    interest: "有機農法を実践中",
    status: "畑あり",
    methods: ["有機農法", "畑あり"],
    note: "地域の勉強会に参加しながら試しています。",
    photo: "photo-community",
  },
  {
    area: "水戸市",
    interest: "菌ちゃん農法を勉強中",
    status: "プランター栽培",
    methods: ["菌ちゃん農法", "プランター"],
    note: "土づくりを学びながら、庭先で実験中です。",
    photo: "photo-sprout",
  },
  ],

  events: [
  {
    date: "6/28",
    day: "日",
    title: "里山の草取りと観察会",
    place: "笠間市周辺",
    description: "畑まわりの草を観察し、残す草と刈る草の考え方を学びます。",
    capacity: "8名",
  },
  {
    date: "7/5",
    day: "日",
    title: "在来種を知る小さな勉強会",
    place: "石岡市周辺",
    description: "地域に残る種の話を聞き、保存と共有の基本を学びます。",
    capacity: "12名",
  },
  {
    date: "7/12",
    day: "日",
    title: "自然農の畑見学会",
    place: "水戸市周辺",
    description: "耕さない畑の様子を見ながら、初心者の始め方を確認します。",
    capacity: "10名",
  },
  {
    date: "7/19",
    day: "日",
    title: "種交換会",
    place: "県央エリア",
    description: "運営確認済みの小さな会。持ち寄り方とマナーを学びます。",
    capacity: "15名",
  },
  {
    date: "7/26",
    day: "日",
    title: "土づくりワークショップ",
    place: "八郷周辺",
    description: "落ち葉や草を活かした土づくりの基礎を体験します。",
    capacity: "9名",
  },
  ],

  methods: [
  {
    name: "自然農",
    color: "green",
    values: {
      tilling: "耕しすぎず、土の状態を観察する考え方。",
      fertilizer: "外から多く入れず、循環を大切にする。",
      grass: "草を敵にせず、必要に応じて刈る。",
      pesticide: "使わない前提で環境を整える。",
      beginner: "小さな畝で観察を続けたいとき。",
    },
  },
  {
    name: "自然栽培",
    color: "leaf",
    values: {
      tilling: "畑や作物により考え方が分かれる。",
      fertilizer: "肥料に頼りすぎない設計を重視。",
      grass: "作物との競合を見ながら管理。",
      pesticide: "使わない方向を基本にする。",
      beginner: "土づくりを長い目で見たいとき。",
    },
  },
  {
    name: "有機農法",
    color: "orange",
    values: {
      tilling: "畑の条件に応じて耕す場合がある。",
      fertilizer: "有機質資材を活かして土を育てる。",
      grass: "草管理は作物や季節に合わせる。",
      pesticide: "使用できる資材にも基準がある。",
      beginner: "基準や資料を見ながら始めたいとき。",
    },
  },
  {
    name: "菌ちゃん農法",
    color: "soil",
    values: {
      tilling: "畝づくりと有機物の分解を意識。",
      fertilizer: "菌の働きと有機物の循環を重視。",
      grass: "草や枝葉を資源として見る。",
      pesticide: "健康な土づくりを中心に考える。",
      beginner: "プランターや小さな畝で土づくりを試したいとき。",
    },
  },
  {
    name: "不耕起・草生栽培",
    color: "sky",
    values: {
      tilling: "耕さない、または最小限にする。",
      fertilizer: "土壌生態の回復を大切にする。",
      grass: "草を地表保護や多様性として活かす。",
      pesticide: "環境全体のバランスを見る。",
      beginner: "場所の条件を観察しながら進めたいとき。",
    },
  },
  ],

  notes: [
  {
    date: "2026/06/21",
    crop: "ミニトマト",
    method: "自然栽培",
    memo: "葉が少し黄色い。水やりの間隔を見直す。",
    learning: "日当たりと水分の変化を続けて見る。",
    photo: "photo-veggie",
  },
  {
    date: "2026/06/18",
    crop: "小松菜",
    method: "有機農法",
    memo: "発芽を確認。虫食いはまだ少ない。",
    learning: "小さい変化も写真で残すと比べやすい。",
    photo: "photo-sprout",
  },
  {
    date: "2026/06/10",
    crop: "畝づくり",
    method: "自然農",
    memo: "草を残して様子を見る。",
    learning: "刈る場所と残す場所を分けて観察する。",
    photo: "photo-field",
  },
  ],

  seeds: [
  {
    area: "茨城県北",
    name: "在来豆",
    note: "運営が公的情報や地域の聞き取りを参考に整備する想定。",
    photo: "photo-veggie",
  },
  {
    area: "八郷周辺",
    name: "地域のなす",
    note: "固定種・在来種への関心を高める紹介カード。",
    photo: "photo-field",
  },
  {
    area: "県南地域",
    name: "昔ながらの葉物",
    note: "ユーザー投稿で無制限に増やさず、運営確認を前提にする。",
    photo: "photo-map",
  },
  ],
};
