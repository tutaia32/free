/*
  REMODELED BY GEMINI AI (Final Version + Cek Server Live)
  Fitur: 
  1. UI Tombol Lengkap (Claim, Create, Info, Donasi, Cek Server)
  2. One-Click Create (Instant Random)
  3. Force Subscribe & Limit Harian
  4. Fitur Donasi (Upload QRIS Local)
  5. Cek Server Real-Time Status
*/

const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const config = require("./config");

// --- KONFIGURASI CHANNEL ---
const CHANNEL_ID = "@tokopicung"; 
const CHANNEL_LINK = "https://t.me/tokopicung"; 
const LOG_CHANNEL_ID = "-1001864324191"; 

// --- DATABASE & MEDIA PATHS ---
const userFile = path.join(__dirname, "src", "database", "users.json");
const dailyClaimsFile = path.join(__dirname, "src", "database", "daily_claims.json");
const serversFile = path.join(__dirname, "src", "database", "servers.json");
const createdServersFile = path.join(__dirname, "src", "database", "user_servers.json");
const qrisFile = path.join(__dirname, "src", "media", "qris.jpg"); 

// --- INIT BOT ---
if (!config.BOT_TOKEN) {
  console.error("BOT_TOKEN kosong di config.js");
  process.exit(1);
}
const bot = new Telegraf(config.BOT_TOKEN);
const OWNER_ID = config.OWNER_ID;

// --- UTILS FILES ---
function ensureFile(filepath, defaultData) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, JSON.stringify(defaultData, null, 2));
}

// Pastikan folder media ada
const mediaDir = path.dirname(qrisFile);
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

// Init Database Default
const defaultServers = [
  { id: 1, name: "Server V1", domain: "", plta: "", pltc: "", loc: "1", egg: "15" },
  { id: 2, name: "Server V2", domain: "", plta: "", pltc: "", loc: "1", egg: "15" },
  { id: 3, name: "Server V3", domain: "", plta: "", pltc: "", loc: "1", egg: "15" },
  { id: 4, name: "Server V4", domain: "", plta: "", pltc: "", loc: "1", egg: "15" }
];

ensureFile(userFile, []);
ensureFile(dailyClaimsFile, { date: "", claimed: [], success: [] }); 
ensureFile(serversFile, defaultServers);
ensureFile(createdServersFile, []);

// --- FUNCTIONS READ/WRITE ---
const db = {
  read: (file) => {
    try { return JSON.parse(fs.readFileSync(file)); } catch (e) { return {}; }
  },
  write: (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2)),
  
  addUser: (id) => {
    const users = db.read(userFile);
    if (!Array.isArray(users)) db.write(userFile, [id]);
    else if (!users.includes(id)) { users.push(id); db.write(userFile, users); }
  },
  
  getDailyData: () => {
    const data = db.read(dailyClaimsFile);
    const today = new Date().toLocaleDateString("id-ID");
    if (data.date !== today || !Array.isArray(data.claimed) || !Array.isArray(data.success)) {
      const newData = { date: today, claimed: [], success: [] };
      db.write(dailyClaimsFile, newData);
      return newData;
    }
    return data;
  },

  checkClaim: (id) => db.getDailyData().claimed.includes(id),
  
  addClaim: (id) => {
    const data = db.getDailyData();
    if (!data.claimed.includes(id)) {
      data.claimed.push(id);
      db.write(dailyClaimsFile, data);
      return true;
    }
    return false;
  },

  checkUsage: (id) => db.getDailyData().success.includes(id),

  addUsage: (id) => {
    const data = db.getDailyData();
    if (!data.success.includes(id)) {
      data.success.push(id);
      db.write(dailyClaimsFile, data);
    }
  },

  getServer: (index) => db.read(serversFile)[index],
  
  updateServer: (index, key, value) => {
    const servers = db.read(serversFile);
    if (servers[index]) {
      servers[index][key] = value;
      db.write(serversFile, servers);
      return true;
    }
    return false;
  }
};

function isOwner(id) { return String(id) === String(OWNER_ID); }

async function checkMember(ctx) {
    try {
        const userId = ctx.from.id;
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
        const status = member.status;
        return (status === 'creator' || status === 'administrator' || status === 'member');
    } catch (e) { return false; }
}

// --- LOGIC HANDLERS ---

// 1. Logic Claim
const handleClaim = async (ctx) => {
  const userId = ctx.from.id;
  const isJoined = await checkMember(ctx);
  if (!isJoined) return ctx.reply("⚠️ Wajib join channel dulu!", Markup.inlineKeyboard([[Markup.button.url("📢 Join Channel", CHANNEL_LINK)]]));

  if (db.checkClaim(userId)) return ctx.reply("❌ Sudah ambil tiket hari ini. Langsung buat server saja.");

  db.addClaim(userId);
  ctx.reply("✅ *Berhasil Ambil Tiket!*\nSekarang tekan tombol '🚀 Buat Server' untuk membuat panel.", { parse_mode: "Markdown" });
};

// 2. Logic Info
const handleInfo = (ctx) => {
  const userId = ctx.from.id;
  const isClaimed = db.checkClaim(userId);
  const isUsed = db.checkUsage(userId);
  let statusText = "❌ Belum Ambil Tiket";
  if (isClaimed && !isUsed) statusText = "✅ Tiket Ready";
  if (isUsed) statusText = "⛔ Limit Habis";
  
  ctx.reply(
    `📊 *INFO AKUN*\nID: \`${userId}\`\nStatus Harian: ${statusText}\nChannel: ${CHANNEL_ID}`, 
    { parse_mode: "Markdown" }
  );
};

// 3. Logic Create (Menu Server)
const handleCreate = async (ctx) => {
  const userId = ctx.from.id;
  const isJoined = await checkMember(ctx);
  if (!isJoined) return ctx.reply("⚠️ Unfollow terdeteksi. Silakan join kembali.", Markup.inlineKeyboard([[Markup.button.url("📢 Join Channel", CHANNEL_LINK)]]));

  if (!db.checkClaim(userId)) return ctx.reply("⚠️ Belum punya tiket. Tekan '🎁 Ambil Tiket' dulu.");
  if (db.checkUsage(userId)) return ctx.reply("⛔ Limit Habis! Kamu sudah buat server hari ini.");

  const servers = db.read(serversFile);
  const buttons = [];
  
  servers.forEach(srv => {
    // Check config saja, real status dicek di /cekserver
    const status = (srv.domain && srv.plta) ? "🟢 ON" : "🔴 OFF"; 
    buttons.push([Markup.button.callback(`${srv.name} [${status}]`, `AUTO_CREATE|${srv.id}`)]);
  });

  ctx.reply("⚡ PILIHAN SERVER\nKlik server di bawah ini, akun akan dibuat otomatis:", Markup.inlineKeyboard(buttons));
};

// 4. Logic Donasi (QRIS Local)
const handleDonasi = async (ctx) => {
    if (fs.existsSync(qrisFile)) {
        await ctx.replyWithPhoto({ source: qrisFile }, {
            caption: `☕ *TRAKTIR KOPI ADMIN*\n\n` +
                  
                     `Dukungan Anda membantu server tetap hidup gratis.\n\n` +
                     `_Terima kasih orang baik!_`,
            parse_mode: "Markdown"
        });
    } else {
        ctx.reply("⚠️ *Maaf, Admin belum mengupload file QRIS.*\nSilakan hubungi Owner.", { parse_mode: "Markdown" });
    }
};


// 5. Logic Cek Server Real-Time
const checkServerStatus = async (node) => {
    if (!node.domain || !node.plta) return { status: "🔴 OFFLINE (Config Kosong)", error: "Domain/PLTA belum disetting." };

    try {
        const res = await fetch(`${node.domain}/api/application/nodes`, {
            method: "GET",
            headers: { "Accept": "application/json", "Authorization": `Bearer ${node.plta}` }
        });

        if (res.status === 200) {
            return { status: "✅ API OK", error: null };
        } else if (res.status === 401) {
            return { status: "⚠️ API KEY SALAH (PLTA)", error: "Key tidak valid/expired." };
        } else if (res.status === 403 || res.status === 404) {
             return { status: "⚠️ DOMAIN/PATH SALAH", error: "Domain salah atau folder API tersembunyi." };
        } else {
            return { status: `❌ API ERROR (${res.status})`, error: `Code ${res.status}` };
        }
    } catch (e) {
        // Ini menangkap error koneksi, DNS, atau timeout
        return { status: "❌ KONEKSI GAGAL", error: e.message.substring(0, 50) + '...' };
    }
};

const handleCheckServer = async (ctx) => {
    const loadingMsg = await ctx.reply("⏳ *Mengecek status server secara real-time...*", { parse_mode: "Markdown" });
    
    const servers = db.read(serversFile);
    let statusMsg = "📊 *STATUS SERVER LIVE CHECK*\n\n";
    
    for (const node of servers) {
        const result = await checkServerStatus(node);
        
        statusMsg += `🖥️ **${node.name}**\n`;
        statusMsg += `Status: ${result.status}\n`;
        if (result.error) {
            statusMsg += `_Detail: ${result.error}_\n`;
        }
        statusMsg += "\n";
    }
    
    // Hapus pesan loading, kirim hasil
    await ctx.telegram.deleteMessage(loadingMsg.chat.id, loadingMsg.message_id).catch(() => {});

    await ctx.reply(statusMsg, { parse_mode: "Markdown" });
};


// --- BOT START & MENU ---
bot.start((ctx) => {
  db.addUser(ctx.from.id);
  const name = ctx.from.first_name || "User";

  // KEYBOARD BAWAH (REPLY KEYBOARD)
  const mainKeyboard = Markup.keyboard([
      ["🎁 Ambil Tiket", "🚀 Buat Server"],
      ["👤 Info Akun", "💰 Donasi"],
      ["🔍 Cek Server"] // Tombol Baru
  ]).resize();

  ctx.replyWithMarkdown(
    `Halo *${name}* 👋\n\nSelamat datang di Bot *Instant Free Panel*.\n` +
    `Gunakan tombol di bawah untuk navigasi.\n\n` +
    `_Syarat: Wajib join channel ${CHANNEL_ID}_`,
    mainKeyboard
  );
});

// --- MAPPING TOMBOL KE LOGIC ---
bot.hears("🎁 Ambil Tiket", handleClaim);
bot.hears("🚀 Buat Server", handleCreate);
bot.hears("👤 Info Akun", handleInfo);
bot.hears("💰 Donasi", handleDonasi); 
bot.hears("🔍 Cek Server", handleCheckServer); // Mapping Baru

// --- MAPPING COMMAND LAMA ---
bot.command("claim", handleClaim);
bot.command("create", handleCreate);
bot.command("info", handleInfo);
bot.command("donasi", handleDonasi); 
bot.command("cekserver", handleCheckServer); // Command Baru

// --- ACTION: AUTO CREATE (LOGIKA UTAMA) ---
bot.action(/AUTO_CREATE\|(\d+)/, async (ctx) => {
  const userId = ctx.from.id;
  const nodeId = parseInt(ctx.match[1]);

  const isJoined = await checkMember(ctx);
  if (!isJoined) return ctx.answerCbQuery("❌ Kamu belum join channel!", { show_alert: true });
  
  if (!db.checkClaim(userId)) return ctx.answerCbQuery("❌ Belum ambil tiket!", { show_alert: true });
  if (db.checkUsage(userId)) return ctx.answerCbQuery("⛔ Limit harian habis!", { show_alert: true });

  const servers = db.read(serversFile);
  const node = servers.find(s => s.id === nodeId);
  if (!node || !node.domain || !node.plta) return ctx.answerCbQuery("⚠️ Server gangguan.", { show_alert: true });
  
  // Lakukan cek koneksi cepat sebelum proses, agar user tidak menunggu lama jika server mati
  const statusCheck = await checkServerStatus(node);
  if (statusCheck.status !== "✅ API OK") {
      return ctx.answerCbQuery(`❌ Server ${node.name} GAGAL KONEKSI.\nDetail: ${statusCheck.error}`, { show_alert: true });
  }

  const cleanName = ctx.from.first_name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase() || "user";
  const randomNum = Math.floor(Math.random() * 10000);
  const username = `${cleanName}${randomNum}`;
  const password = `pw${Math.random().toString(36).slice(-8)}`;
  const email = `${username}@auto.id`;

  await ctx.editMessageText(`⏳ *Memproses...*\nMembuat akun di ${node.name} (Username: ${username})...`, { parse_mode: "Markdown" });

  try {
    const domain = node.domain;
    const plta = node.plta;

    const userRes = await fetch(`${domain}/api/application/users`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${plta}` },
      body: JSON.stringify({ email, username, first_name: username, last_name: "User", language: "en", password })
    });
    const userData = await userRes.json();
    if (userData.errors) return ctx.editMessageText(`❌ Gagal User: ${userData.errors[0].detail}`);
    const pteroUser = userData.attributes;

    const serverRes = await fetch(`${domain}/api/application/servers`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${plta}` },
      body: JSON.stringify({
        name: `${username} Server`, user: pteroUser.id, egg: parseInt(node.egg) || 15, 
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18", startup: "npm start",
        environment: { INST: "npm", USER_UPLOAD: "0", AUTO_UPDATE: "0", CMD_RUN: "npm start" },
        limits: { memory: 1024, swap: 0, disk: 1024, io: 500, cpu: 100 },
        feature_limits: { databases: 1, backups: 1, allocations: 1 },
        deploy: { locations: [parseInt(node.loc) || 1], dedicated_ip: false, port_range: [] }
      })
    });
    const serverData = await serverRes.json();
    if (serverData.errors) return ctx.editMessageText(`❌ Gagal Server: ${serverData.errors[0].detail}`);

    db.addUsage(userId);
    await ctx.deleteMessage().catch(()=>{}); 
    
    await ctx.reply(
      `✅ *PANEL BERHASIL DIBUAT*\n\n` +
      `🖥️ Node: ${node.name}\n` +
      `🔗 Login: ${domain}\n` +
      `👤 Username: \`${username}\`\n` +
      `🔐 Password: \`${password}\`\n\n` +
      `⚠️ _Simpan data ini sekarang!_`,
      { parse_mode: "Markdown" }
    );

    // LOGGING
    const logMessage = 
      `🔔 𝗣𝗔𝗡𝗘𝗟 𝗚𝗥𝗔𝗧𝗜𝗦 𝗦𝗨𝗞𝗦𝗘𝗦 🔔\n\n` +
      `👤 User: [${ctx.from.first_name}](tg://user?id=${userId})\n` +
      `🆔 ID Telegram: \`${userId}\`\n` +
      `🖥️ Node Server: ${node.name}\n` +
      `📛 Username Panel: \`${username}\`\n` +
      `📅 Waktu: ${new Date().toLocaleString("id-ID")}`;

    await bot.telegram.sendMessage(LOG_CHANNEL_ID, logMessage, { parse_mode: "Markdown" }).catch(() => {});
    await bot.telegram.sendMessage(OWNER_ID, logMessage, { parse_mode: "Markdown" }).catch(()=>{});

    const logs = db.read(createdServersFile);
    logs.push({ date: new Date().toLocaleString(), userId, serverName: node.name, username });
    db.write(createdServersFile, logs);

  } catch (e) {
    console.error(e);
    ctx.editMessageText("❌ Terjadi kesalahan sistem.");
  }
});

// ==========================================
// CONFIG & ADMIN COMMANDS
// ==========================================

const configHandler = async (ctx, serverId, key, value) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("⛔ Khusus Owner.");
  if (!value) return ctx.reply(`❌ Format: /set${key}v${serverId} <nilai>`);
  if (db.updateServer(serverId - 1, key, value)) ctx.reply(`✅ V${serverId} ${key} updated.`);
  else ctx.reply("❌ Gagal update.");
};

// Config V1
bot.command("seturlv1", (ctx) => configHandler(ctx, 1, "domain", ctx.message.text.split(" ")[1]));
bot.command("setpltav1", (ctx) => configHandler(ctx, 1, "plta", ctx.message.text.split(" ")[1]));
bot.command("setpltcv1", (ctx) => configHandler(ctx, 1, "pltc", ctx.message.text.split(" ")[1]));
bot.command("setlocv1", (ctx) => configHandler(ctx, 1, "loc", ctx.message.text.split(" ")[1]));
bot.command("seteggv1", (ctx) => configHandler(ctx, 1, "egg", ctx.message.text.split(" ")[1]));

// Config V2
bot.command("seturlv2", (ctx) => configHandler(ctx, 2, "domain", ctx.message.text.split(" ")[1]));
bot.command("setpltav2", (ctx) => configHandler(ctx, 2, "plta", ctx.message.text.split(" ")[1]));
bot.command("setpltcv2", (ctx) => configHandler(ctx, 2, "pltc", ctx.message.text.split(" ")[1]));
bot.command("setlocv2", (ctx) => configHandler(ctx, 2, "loc", ctx.message.text.split(" ")[1]));
bot.command("seteggv2", (ctx) => configHandler(ctx, 2, "egg", ctx.message.text.split(" ")[1]));

// Config V3
bot.command("seturlv3", (ctx) => configHandler(ctx, 3, "domain", ctx.message.text.split(" ")[1]));
bot.command("setpltav3", (ctx) => configHandler(ctx, 3, "plta", ctx.message.text.split(" ")[1]));
bot.command("setpltcv3", (ctx) => configHandler(ctx, 3, "pltc", ctx.message.text.split(" ")[1]));
bot.command("setlocv3", (ctx) => configHandler(ctx, 3, "loc", ctx.message.text.split(" ")[1]));
bot.command("seteggv3", (ctx) => configHandler(ctx, 3, "egg", ctx.message.text.split(" ")[1]));

// Config V4
bot.command("seturlv4", (ctx) => configHandler(ctx, 4, "domain", ctx.message.text.split(" ")[1]));
bot.command("setpltav4", (ctx) => configHandler(ctx, 4, "plta", ctx.message.text.split(" ")[1]));
bot.command("setpltcv4", (ctx) => configHandler(ctx, 4, "pltc", ctx.message.text.split(" ")[1]));
bot.command("setlocv4", (ctx) => configHandler(ctx, 4, "loc", ctx.message.text.split(" ")[1]));
bot.command("seteggv4", (ctx) => configHandler(ctx, 4, "egg", ctx.message.text.split(" ")[1]));

// Cek Config
bot.command("checkconfig", (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  const servers = db.read(serversFile);
  let msg = "⚙️ *CONFIG:*\n";
  servers.forEach(s => {
      msg += `🖥️ ${s.name}\n`;
      msg += `URL: ${s.domain ? "✅" : "❌"} | PLTA: ${s.plta ? "✅" : "❌"} | PLTC: ${s.pltc ? "✅" : "❌"}\n`;
      msg += `Loc: ${s.loc} | Egg: ${s.egg}\n\n`;
  });
  ctx.reply(msg, { parse_mode: "Markdown" });
});

// Hapus Server
bot.command("delsrv", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const args = ctx.message.text.split(" ");
    const node = db.read(serversFile).find(s => s.id === parseInt(args[1]));
    if (!node) return ctx.reply("❌ Node invalid.");
    try {
        await fetch(`${node.domain}/api/application/servers/${args[2]}`, { method: "DELETE", headers: { "Authorization": `Bearer ${node.plta}` } });
        ctx.reply("✅ Deleted.");
    } catch (e) { ctx.reply("❌ Error."); }
});

// Broadcast
bot.command("bc", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  const text = ctx.message.text.split(" ").slice(1).join(" ");
  const users = db.read(userFile);
  ctx.reply(`📢 Broadcast ke ${users.length} user...`);
  for (const id of users) {
      await bot.telegram.sendMessage(id, text).catch(()=>{});
      await new Promise(r => setTimeout(r, 100));
  }
  ctx.reply("✅ Selesai.");
});

const express = require('express');
const app = express();
app.use(express.json());

// Ping endpoint
app.get('/ping', (req, res) => res.send('OK - Bot alive! 🤖'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ping ready on port ${PORT}`));

// ... sisa kode Telegraf ...

console.log("Bot Full UI + Cek Server Berjalan...");
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
