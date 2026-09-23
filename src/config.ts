import dotenv from "dotenv";
import path from "path";

// Nạp cấu hình từ file .env
dotenv.config();

export interface BotConfig {
  geminiApiKey: string;
  geminiModel: string;
  botName: string;
  prefixes: string[];
  replyDirectMessages: boolean;
  cooldownMs: number;
  simulateTyping: boolean;
  typingSpeedMsPerChar: number;
  typingDelayMinMs: number;
  typingDelayMaxMs: number;
  sessionPath: string;
}

const rawPrefixes = process.env.BOT_PREFIXES || "/hoi,/kanji,/dich,/nguphap,/help";
const prefixes = rawPrefixes
  .split(",")
  .map((p) => p.trim().toLowerCase())
  .filter((p) => p.length > 0);

export const config: BotConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  botName: process.env.BOT_NAME || "Trợ Giảng Tiếng Nhật PThamSS",
  prefixes: prefixes.length > 0 ? prefixes : ["/hoi", "/kanji", "/dich", "/nguphap", "/help"],
  replyDirectMessages: process.env.REPLY_DIRECT_MESSAGES !== "false",
  cooldownMs: parseInt(process.env.COOLDOWN_MS || "5000", 10),
  simulateTyping: process.env.SIMULATE_TYPING !== "false",
  typingSpeedMsPerChar: parseInt(process.env.TYPING_SPEED_MS_PER_CHAR || "20", 10),
  typingDelayMinMs: parseInt(process.env.TYPING_DELAY_MIN_MS || "1500", 10),
  typingDelayMaxMs: parseInt(process.env.TYPING_DELAY_MAX_MS || "8000", 10),
  sessionPath: path.resolve(process.cwd(), "session.json"),
};

export function validateConfig(): void {
  if (!config.geminiApiKey || config.geminiApiKey === "your_gemini_api_key_here") {
    console.warn("\n⚠️  [CẢNH BÁO] Chưa cấu hình GEMINI_API_KEY trong file .env!");
    console.warn("👉 Bot vẫn có thể đăng nhập Zalo nhưng chức năng giải đáp AI sẽ không hoạt động.");
    console.warn("👉 Vui lòng tạo key miễn phí tại: https://aistudio.google.com/ và điền vào .env\n");
  }
}
