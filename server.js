// เซิร์ฟเวอร์แอปเปิดไพ่ทาโรต์ (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม ใช้ Node 18 ขึ้นไป)
// รัน: node server.js  แล้วเปิด http://localhost:3000
// ถ้าต้องการคำตอบจาก AI จริง ตั้งค่า ANTHROPIC_API_KEY ก่อนรัน ถ้าไม่ตั้ง จะใช้ข้อความสำรองในตัว

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DEV_MODE = process.env.DEV_MODE !== "0"; // เปิดไว้สำหรับทดสอบ ปิดก่อนเปิดให้คนจริงใช้
const DB_FILE = path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const TRIAL_READINGS = 3;
// ซ่อนระบบเหรียญไว้ก่อน: ปิดอยู่ทุกครั้ง ทำให้ทุกคนอ่านคำตอบเต็มได้ (เปิดใหม่ด้วย COINS_ENABLED=1)
const COINS_ENABLED = process.env.COINS_ENABLED === "1";
const DEMO_USER = process.env.DEMO_USER || "demo";
const DEMO_PASS = process.env.DEMO_PASS || "kannarat";
const MEMBER_PRICE_NOTE = "สมาชิกรายเดือน (ยังไม่เปิดชำระเงิน)";

// ---------- ฐานข้อมูลแบบไฟล์ JSON ----------
let db = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
  : { users: {}, tokens: {}, readings: [] };
db.daily = db.daily || {};

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- ไพ่ 78 ใบ ----------
const MAJOR = [
  ["คนโง่", "The Fool", "การเริ่มต้นใหม่ ความกล้าที่จะก้าวออกไป"],
  ["นักเวทย์", "The Magician", "มีทรัพยากรและทักษะพร้อมแล้ว ถึงเวลาลงมือ"],
  ["นักบวชหญิง", "The High Priestess", "ฟังเสียงลึก ๆ ในใจ คำตอบบางอย่างยังซ่อนอยู่"],
  ["จักรพรรดินี", "The Empress", "ความอุดมสมบูรณ์ ความรัก และการเติบโต"],
  ["จักรพรรดิ", "The Emperor", "ความมั่นคงและระเบียบ การวางแผนอย่างมีวินัย"],
  ["ผู้นำทางศาสนา", "The Hierophant", "คำแนะนำจากผู้มีประสบการณ์หรือค่านิยมที่ยึดถือ"],
  ["คู่รัก", "The Lovers", "การเลือกที่มาจากหัวใจ ความสัมพันธ์ที่สมดุล"],
  ["รถศึก", "The Chariot", "ความมุ่งมั่นและการควบคุมตัวเอง"],
  ["ความยุติธรรม", "Justice", "ทุกการกระทำมีผล ตัดสินใจอย่างเป็นธรรม"],
  ["ฤาษี", "The Hermit", "ช่วงเวลาพิจารณาตัวเอง ค้นหาคำตอบจากภายใน"],
  ["วงล้อโชคชะตา", "Wheel of Fortune", "โชคและจังหวะชีวิตกำลังหมุน จงยอมรับการเปลี่ยนแปลง"],
  ["ความแข็งแกร่ง", "Strength", "พลังแห่งความอ่อนโยนและความอดทน"],
  ["คนแขวนหัว", "The Hanged Man", "มองจากมุมใหม่ บางครั้งการรอคือการเตรียมตัว"],
  ["ความตาย", "Death", "จบบทหนึ่งเพื่อเปิดอีกบทหนึ่ง การปล่อยวางคือการเริ่มใหม่"],
  ["การประสาน", "Temperance", "ความพอดีและความอดทน ผสมสิ่งต่าง ๆ ให้ลงตัว"],
  ["ปีศาจ", "The Devil", "ระวังความยึดติด ตระหนักแล้วจะเป็นอิสระ"],
  ["หอคอย", "The Tower", "การเปลี่ยนแปลงกะทันหัน แต่จะเปิดทางให้สิ่งที่แท้จริง"],
  ["ดวงดาว", "The Star", "ความหวังและแรงบันดาลใจกลับมา"],
  ["พระจันทร์", "The Moon", "ความไม่แน่นอน ต้องการความระมัดระวังและสังเกต"],
  ["พระอาทิตย์", "The Sun", "ความสุข ความสำเร็จ และพลังบวก"],
  ["การตัดสิน", "Judgement", "ถึงเวลาตื่นรู้และให้อภัย รับฟังเสียงภายใน"],
  ["โลก", "The World", "ความสมบูรณ์ จุดจบที่สวยงามของบทหนึ่ง"]
];
const SUITS = [
  ["ไม้เท้า", "พลังงาน ความคิดสร้างสรรค์ และแรงบันดาลใจ"],
  ["ถ้วย", "อารมณ์ ความรัก และความสัมพันธ์"],
  ["ดาบ", "ความคิด การตัดสินใจ และความท้าทาย"],
  ["เหรียญ", "การเงิน วัตถุ และความมั่นคง"]
];
const RANKS = ["เอซ", "2", "3", "4", "5", "6", "7", "8", "9", "10", "เพจ", "อัศวิน", "ราชินี", "ราชา"];
const SUITS_EN = ["Wands", "Cups", "Swords", "Pentacles"];
const RANKS_EN = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Page", "Knight", "Queen", "King"];

const FULL_DECK = [
  ...MAJOR.map(([th, en, meaning]) => ({ name: th, sub: en, meaning })),
  ...SUITS.flatMap(([suit, theme], si) =>
    RANKS.map((r, ri) => ({ name: `${suit} ${r}`, sub: `${SUITS_EN[si]} ${RANKS_EN[ri]}`, meaning: `เกี่ยวกับ${theme}` }))
  )
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCards(count) {
  return shuffle(FULL_DECK)
    .slice(0, count)
    .map((c) => ({ ...c, reversed: crypto.randomInt(100) < 30 }));
}

// ---------- ตรวจข้อความที่มีสัญญาณอันตราย ----------
const CRISIS_WORDS = ["ฆ่าตัวตาย", "อยากตาย", "ไม่อยากอยู่แล้ว", "จะทำร้ายตัวเอง", "ทำร้ายตัวเอง", "อยากหายไป", "ไม่อยากมีชีวิต"];
function isCrisis(text) {
  const t = (text || "").toLowerCase();
  return CRISIS_WORDS.some((w) => t.includes(w));
}
const CRISIS_MESSAGE = [
  "ขอให้รู้ว่าความรู้สึกที่คุณกำลังเผชิญอยู่นั้นหนักมาก และการที่คุณเล่ามามันมีค่ามาก",
  "ตอนนี้ไพ่ไม่สามารถช่วยคุณได้เท่ากับการได้คุยกับคนจริงที่พร้อมรับฟัง",
  "กรุณาติดต่อ:",
  "• สายด่วนสุขภาพจิต 1323 (ตลอด 24 ชั่วโมง)",
  "• ฉุกเฉินหรือต้องการความช่วยเหลือทันที โทร 191 หรือ 1669",
  "ถ้าคุณอยู่ใกล้คนที่ไว้ใจ ลองบอกเขาตอนนี้ได้ไหมคะ"
].join("\n");

// ---------- สร้างคำตอบ ----------
const NEGATIVE_HINTS = ["เสียใจ", "เศร้า", "กังวล", "กลัว", "ผิดหวัง", "เหนื่อย", "ทุกข์", "แย่", "เลิก", "ไม่สบายใจ"];

// ความหมายของตำแหน่งไพ่ในแต่ละแบบการจั่ว
// 3 ใบ: สถานการณ์ปัจจุบัน / อุปสรรคและปัญหา / คำแนะนำและวิธีแก้ไข
// 5 ใบ: สถานการณ์หรือความรู้สึกตอนนี้ / ขยายความใบแรก / อุปสรรคที่เกิดขึ้นจริง / ทางออกและการแก้ปัญหา / บทสรุปว่าจะหาทางแก้ได้อย่างไร
const POSITIONS = {
  3: ["สถานการณ์ปัจจุบัน", "อุปสรรคและปัญหา", "คำแนะนำและวิธีแก้ไข"],
  5: ["สถานการณ์หรือความรู้สึกตอนนี้", "ขยายความใบแรก", "อุปสรรคและปัญหาที่เกิดขึ้นจริง", "ทางออกและการแก้ปัญหา", "บทสรุปว่าจะหาทางแก้ได้อย่างไร"]
};

async function generateInterpretation({ topic, question, cards }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const positions = POSITIONS[cards.length] || POSITIONS[3];
  if (apiKey) {
    try {
      const cardText = cards
        .map((c, i) => `ใบที่ ${i + 1} (${positions[i]}): ${c.name} (${c.sub})${c.reversed ? " กลับหัว" : " ตั้งตรง"} ความหมายพื้นฐาน: ${c.meaning}`)
        .join("\n");
      const system = [
        "คุณคือนักพยากรณ์ไพ่ทาโรต์ผู้มีประสบการณ์ พูดภาษาไทยอย่างอบอุ่น น่าเชื่อถือ และเป็นธรรมชาติ เหมือนหมอดูที่เข้าใจคนฟังจริง ๆ",
        "การแปลความหมายต้องละเอียด: สำหรับแต่ละใบ ให้ระบุชื่อไพ่และสถานะ (ตั้งตรงหรือกลับหัว) แล้วอธิบายความหมายของไพ่ใบนั้นในบริบทของตำแหน่งและคำถาม พร้อมชี้ให้เห็นว่าไพ่สองใบหรือสามใบเชื่อมโยงกันอย่างไร และปิดท้ายด้วยข้อสรุปรวมของการอ่านครั้งนี้",
        "ถ้าไพ่กลับหัว ให้ตีความด้านที่ติดขัด ล่าช้า หรือต้องการการทบทวน ไม่ใช่ตีความว่าเป็นสิ่งเลวร้ายเสมอไป",
        "ให้ตีความไพ่ตามตำแหน่งที่กำหนดในข้อความของผู้ใช้ ดังนี้",
        "- ให้ตีความแต่ละใบตามชื่อตำแหน่งที่ระบุไว้ข้างใบนั้น",
        "- ถ้าเป็นแบบ 5 ใบ ใบที่ 2 คือการขยายความของใบที่ 1 ให้เชื่อมโยงกัน",
        "ก่อนตอบ ให้อ่านโทนของคำถามก่อน:",
        "- ถ้าคำถามมีความเศร้า กังวล หรือเจ็บปวด ให้ตอบด้วยโทนให้กำลังใจ",
        "- ถ้าคำถามตรงไปตรงมาหรือต้องการความชัดเจน ให้ตอบตรง ชัดเจน นำไปใช้ได้",
        "กฎ: ห้ามให้คำแนะนำทางการแพทย์ กฎหมาย หรือการลงทุนที่เฉพาะเจาะจง ให้เน้นการสะท้อนความคิดและแนวทางให้ตัดสินใจเอง",
        "รูปแบบ: เปิดด้วยประโยคต้อนรับสั้น ๆ 1 ประโยค จากนั้นอธิบายหน้าไพ่แต่ละใบเป็นย่อหน้า ย่อหน้าละ 3-5 ประโยค โดยเริ่มด้วยชื่อไพ่และสถานะ (ตั้งตรงหรือกลับหัว) ห้ามขึ้นต้นย่อหน้าด้วยชื่อตำแหน่งหรือหัวข้อใด ๆ ปิดด้วยย่อหน้าสรุปโดยไม่ต้องมีหัวข้อ และคำถามชวนคิดหนึ่งข้อ",
        "ห้ามใช้ Markdown เช่น ตัวหนา หัวข้อ # หรือรายการ ให้เขียนเป็นข้อความธรรมดา",
        "ความยาวรวม: ประมาณ 15-25 ประโยค ใช้ภาษาไทยที่เข้าใจง่าย"
      ].join("\n");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
          max_tokens: 2000,
          system,
          messages: [{
            role: "user",
            content: `หัวข้อ: ${topic || "ภาพรวม"}\nคำถาม: ${question || "ไม่ได้ระบุ"}\nไพ่ที่ออก:\n${cardText}`
          }]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = (data.content || []).map((b) => b.text || "").join("").trim();
        if (text) return text;
      }
      console.error("AI response not ok:", res.status);
    } catch (err) {
      console.error("AI call failed:", err.message);
    }
  }
  return fallbackInterpretation({ topic, question, cards });
}

function fallbackInterpretation({ topic, question, cards }) {
  const q = question || "";
  const tone = NEGATIVE_HINTS.some((w) => q.includes(w)) ? "gentle" : "direct";
  const opener = tone === "gentle"
    ? "ขอให้รู้ว่าความรู้สึกของคุณเป็นเรื่องจริงและสำคัญ ลองดูไพ่ทีละใบแล้วค่อย ๆ หาความหมายไปพร้อมกัน"
    : "ลองดูไพ่ที่ออกมาเพื่อตอบคำถามของคุณโดยตรง";
  const positions = POSITIONS[cards.length] || POSITIONS[3];
  const parts = cards.map((c, i) => {
    const pos = c.reversed ? "กลับหัว" : "ตั้งตรง";
    const note = c.reversed
      ? "ช่วงนี้อาจต้องทบทวนเรื่องนี้ให้ละเอียดขึ้น และอย่าเร่งตัดสินใจ"
      : c.meaning + " นี่คือสัญญาณที่ควรให้ความสนใจ";
    return `${positions[i]} — ไพ่ ${c.name} (${pos}): ${note}`;
  });
  const closing = tone === "gentle"
    ? "ไม่ว่าคำตอบจะออกมาทางไหน คุณไม่ต้องเผชิญมันคนเดียว ลองถามตัวเองว่าก้าวเล็ก ๆ ที่ทำได้วันนี้คืออะไร"
    : "ลองถามตัวเองว่า ถ้าเลือกทางที่ไพ่ชี้ไป คุณจะก้าวแรกอย่างไร";
  return [opener, ...parts, closing].join("\n\n");
}

// ---------- ไพ่ประจำวัน ----------
// เรียก Claude หนึ่งครั้ง คืนค่า null ถ้าไม่มีคีย์หรือเรียกไม่ได้
async function callClaude({ system, user, maxTokens = 2000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }]
      })
    });
    if (!res.ok) { console.error("AI response not ok:", res.status); return null; }
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();
    return text || null;
  } catch (err) {
    console.error("AI call failed:", err.message);
    return null;
  }
}

const DAILY_SYSTEM = [
  "คุณคือนักพยากรณ์ไพ่ทาโรต์ พูดภาษาไทยอย่างอบอุ่น กระชับ และเป็นธรรมชาติ",
  "จากไพ่ประจำวันใบเดียวที่ให้มา ตอบเป็นสองส่วนเท่านั้น",
  "ส่วนแรกขึ้นต้นด้วย 'โอกาสวันนี้:' อธิบายว่าวันนี้มีโอกาสจะเกิดอะไรขึ้นจากความหมายของไพ่ ส่วนที่สองขึ้นต้นด้วย 'คำเตือนวันนี้:' บอกสิ่งที่ควรระวังหรือหลีกเลี่ยงในวันนี้",
  "ไพ่กลับหัวให้ตีความเป็นด้านที่ติดขัดหรือต้องทบทวน ห้ามให้คำแนะนำทางการแพทย์ กฎหมาย หรือการลงทุนเฉพาะเจาะจง ห้ามใช้ Markdown ความยาวรวมประมาณ 5-8 ประโยค"
].join("\n");

// วันที่ตามเวลาไทย (UTC+7) รูปแบบ YYYY-MM-DD ใช้เป็นคีย์รีเซ็ตไพ่ทุกวัน
function todayKey() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

async function generateDailyText(card) {
  const dir = card.reversed ? "กลับหัว" : "ตั้งตรง";
  const meaning = card.reversed ? `ให้ทบทวนเรื่องนี้ก่อน: ${card.meaning}` : card.meaning;
  const warn = card.reversed
    ? `คำเตือนวันนี้: ไพ่ ${card.name} กลับหัว ให้ระวังความติดขัด ความใจร้อน หรือการตัดสินใจเร็วเกินไป`
    : "คำเตือนวันนี้: แม้วันนี้ดูเปิดให้ แต่อย่าประมาทกับเรื่องที่ยังไม่แน่นอน ควรทบทวนก่อนลงมือ";
  const fallback = `โอกาสวันนี้: ไพ่ ${card.name} (${dir}) ชี้ว่า ${meaning}\n\n${warn}`;
  const text = await callClaude({
    system: DAILY_SYSTEM,
    user: `ไพ่ประจำวัน: ${card.name} (${card.sub}) ${dir}\nความหมายพื้นฐาน: ${meaning}`,
    maxTokens: 600
  });
  return text || fallback;
}

// ตัดคำตอบฟรี: เอาแค่ส่วนแรกและปิดด้วยการชวนปลดล็อก
function truncateForFree(text) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const head = sentences.slice(0, 3).join("\n");
  return head + "\n\n… (อ่านคำตอบฉบับเต็มเพื่อดูความหมายของทุกใบ)";
}

// ---------- ช่วยจัดการผู้ใช้ ----------
function getUser(req) {
  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  const userId = db.tokens[auth];
  return userId ? db.users[userId] : null;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    trialLeft: Math.max(0, TRIAL_READINGS - u.trialUsed),
    coins: u.coins,
    member: u.member,
    memberNote: MEMBER_PRICE_NOTE
  };
}

// ---------- ตัว route ----------
function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error("too large"));
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === "POST /api/login") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    // บัญชีทดลองสำหรับการทดสอบ ตั้งค่าได้ด้วย DEMO_USER / DEMO_PASS
    if (username !== DEMO_USER || password !== DEMO_PASS) {
      return sendJson(res, 401, { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
    const name = username.slice(0, 40);
    const email = "";
    // TODO: แทนด้วย Google OAuth และ LINE Login ตอนทำจริง
    const id = crypto.createHash("sha1").update(email || name).digest("hex").slice(0, 16);
    if (!db.users[id]) {
      db.users[id] = { id, name, email, trialUsed: 0, coins: 0, member: false, createdAt: Date.now() };
    }
    const token = crypto.randomBytes(24).toString("hex");
    db.tokens[token] = id;
    saveDb();
    return sendJson(res, 200, { token, user: publicUser(db.users[id]) });
  }

  if (route === "GET /api/me") {
    const u = getUser(req);
    if (!u) return sendJson(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    const readings = db.readings.filter((r) => r.userId === u.id).length;
    const dailyDays = Object.keys(db.daily).filter((k) => k.startsWith(u.id + ":")).length;
    return sendJson(res, 200, { user: publicUser(u), stats: { readings, dailyDays } });
  }

  if (route === "POST /api/read") {
    const u = getUser(req);
    if (!u) return sendJson(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    const body = await readBody(req);
    const count = body.count === 5 ? 5 : 3;
    const topic = String(body.topic || "ภาพรวม").slice(0, 30);
    const question = String(body.question || "").slice(0, 300);

    if (isCrisis(question)) {
      return sendJson(res, 200, {
        crisis: true,
        message: CRISIS_MESSAGE,
        user: publicUser(u)
      });
    }

    const cards = drawCards(count);
    const fullText = await generateInterpretation({ topic, question, cards });

    // กำหนดว่าได้อ่านเต็มแบบไหน
    let access;
    if (!COINS_ENABLED) access = "open";
    else if (u.member) access = "member";
    else if (u.trialUsed < TRIAL_READINGS) { access = "trial"; u.trialUsed += 1; }
    else access = "free";

    const reading = {
      id: crypto.randomBytes(8).toString("hex"),
      userId: u.id,
      topic,
      question,
      count,
      cards,
      fullText,
      unlocked: access !== "free",
      createdAt: Date.now()
    };
    db.readings.push(reading);
    saveDb();

    return sendJson(res, 200, {
      readingId: reading.id,
      cards,
      text: reading.unlocked ? fullText : truncateForFree(fullText),
      unlocked: reading.unlocked,
      access,
      cost: count === 5 ? 2 : 1,
      user: publicUser(u)
    });
  }

  if (route === "POST /api/unlock") {
    const u = getUser(req);
    if (!u) return sendJson(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    const body = await readBody(req);
    const reading = db.readings.find((r) => r.id === body.readingId && r.userId === u.id);
    if (!reading) return sendJson(res, 404, { error: "ไม่พบการอ่านนี้" });
    if (reading.unlocked) return sendJson(res, 200, { text: reading.fullText, user: publicUser(u) });
    if (u.member) {
      reading.unlocked = true;
    } else {
      const cost = reading.count === 5 ? 2 : 1;
      if (u.coins < cost) {
        return sendJson(res, 402, { error: "เหรียญไม่พอ", needCoins: cost, user: publicUser(u) });
      }
      u.coins -= cost;
      reading.unlocked = true;
    }
    saveDb();
    return sendJson(res, 200, { text: reading.fullText, user: publicUser(u) });
  }

  if (route === "GET /api/history") {
    const u = getUser(req);
    if (!u) return sendJson(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    const list = db.readings
      .filter((r) => r.userId === u.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((r) => ({
        id: r.id, topic: r.topic, question: r.question, count: r.count,
        cards: r.cards.map((c) => c.name), unlocked: r.unlocked, createdAt: r.createdAt,
        text: r.unlocked ? r.fullText : null
      }));
    return sendJson(res, 200, { history: list });
  }

  // ไพ่ประจำวัน: หนึ่งใบต่อวันต่อผู้ใช้ เรียก AI ครั้งเดียวต่อวัน
  if (route === "GET /api/daily") {
    const u = getUser(req);
    if (!u) return sendJson(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    const date = todayKey();
    const key = `${u.id}:${date}`;
    let d = db.daily[key];
    if (!d) {
      const [card] = drawCards(1);
      d = { card, text: null, createdAt: Date.now() };
      db.daily[key] = d;
      saveDb();
    }
    if (!d.text) {
      d.text = await generateDailyText(d.card);
      saveDb();
    }
    return sendJson(res, 200, { date, card: d.card, text: d.text, user: publicUser(u) });
  }

  // ---- ทดสอบเท่านั้น: เติมเหรียญหรือเปิดสมาชิก (ปิดเมื่อ DEV_MODE=0) ----
  if (route === "POST /api/dev/grant") {
    if (!DEV_MODE) return sendJson(res, 404, { error: "not found" });
    const u = getUser(req);
    if (!u) return sendJson(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    const body = await readBody(req);
    if (typeof body.coins === "number") u.coins += Math.max(0, Math.min(500, body.coins));
    if (typeof body.member === "boolean") u.member = body.member;
    saveDb();
    return sendJson(res, 200, { user: publicUser(u) });
  }

  return sendJson(res, 404, { error: "not found" });
}

// ---------- เสิร์ฟไฟล์หน้าเว็บ ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    const filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" });
  }
});

server.listen(PORT, () => {
  console.log(`เปิดแอปได้ที่ http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("ยังไม่ได้ตั้ง ANTHROPIC_API_KEY จะใช้ข้อความสำรอง");
});
