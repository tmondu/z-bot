import fs from "fs";
import { Credentials } from "zca-js";
import { config } from "./config";

/**
 * Lưu thông tin phiên đăng nhập (cookies, imei, userAgent) vào file session.json
 */
export function saveSession(sessionData: Credentials): void {
  try {
    const jsonStr = JSON.stringify(sessionData, null, 2);
    fs.writeFileSync(config.sessionPath, jsonStr, "utf-8");
    console.log(`💾 [Session] Đã lưu thông tin phiên đăng nhập vào: ${config.sessionPath}`);
  } catch (error) {
    console.error("❌ [Session] Không thể lưu file session.json:", error);
  }
}

/**
 * Nạp thông tin phiên đăng nhập từ file session.json nếu có
 */
export function loadSession(): Credentials | null {
  try {
    if (!fs.existsSync(config.sessionPath)) {
      return null;
    }

    const rawData = fs.readFileSync(config.sessionPath, "utf-8");
    const parsed = JSON.parse(rawData) as Credentials;

    if (!parsed || !parsed.imei || !parsed.cookie || !parsed.userAgent) {
      console.warn("⚠️ [Session] File session.json không hợp lệ hoặc thiếu trường bắt buộc.");
      return null;
    }

    console.log(`🔑 [Session] Đã tìm thấy session.json hợp lệ, tiến hành đăng nhập trực tiếp...`);
    return parsed;
  } catch (error) {
    console.error("⚠️ [Session] Lỗi khi đọc file session.json:", error);
    return null;
  }
}

/**
 * Xóa file session.json khi phiên đăng nhập hết hạn hoặc bị từ chối
 */
export function clearSession(): void {
  try {
    if (fs.existsSync(config.sessionPath)) {
      fs.unlinkSync(config.sessionPath);
      console.log("🗑️  [Session] Đã xóa session cũ không hợp lệ.");
    }
  } catch (error) {
    console.error("⚠️ [Session] Lỗi khi xóa session.json:", error);
  }
}
