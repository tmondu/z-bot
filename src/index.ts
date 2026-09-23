import { Zalo, API, LoginQRCallbackEventType } from "zca-js";
import qrcodeTerminal from "qrcode-terminal";
import { config, validateConfig } from "./config";
import { loadSession, saveSession, clearSession } from "./session";
import { handleIncomingMessage } from "./handlers/messageHandler";

function printBanner(): void {
  console.log("=======================================================");
  console.log(`🤖 ${config.botName.toUpperCase()} - STANDALONE BOT`);
  console.log("   Dự án hỗ trợ học tiếng Nhật tự động qua Zalo & Gemini");
  console.log("=======================================================\n");
}

/**
 * Đăng nhập Zalo bằng cách quét mã QR hiển thị trên Terminal
 */
async function loginWithQR(zalo: Zalo): Promise<API> {
  console.log("📲 Đang khởi tạo mã QR đăng nhập...");

  return await zalo.loginQR(
    {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          console.log("\n=======================================================");
          console.log("  👉 VUI LÒNG DÙNG ZALO ĐIỆN THOẠI QUÉT MÃ QR DƯỚI ĐÂY:");
          console.log("=======================================================\n");

          // Đường dẫn URL đăng nhập chính thức của Zalo
          const qrUrl = event.data.token
            ? `http://zaloapp.com/qr/l?tk=${event.data.token}`
            : event.data.code;

          qrcodeTerminal.generate(qrUrl, { small: true });

          // Tự động lưu ảnh qr.png vào thư mục để có thể mở xem trực tiếp nếu terminal bị méo
          event.actions.saveToFile("qr.png").catch(() => {});

          console.log("\n💡 MẸO:");
          console.log("   1. Dùng tính năng [Quét mã QR] trong app Zalo (biểu tượng quét cạnh ô tìm kiếm).");
          console.log("   2. Nếu quét trên terminal khó, hãy mở file ảnh 'qr.png' trong thư mục bot để quét!\n");
          break;
        }

        case LoginQRCallbackEventType.QRCodeScanned: {
          console.log(`\n👀 [Zalo] Đã quét QR từ tài khoản: "${event.data.display_name}".`);
          console.log("👉 Vui lòng nhấn 'Đăng nhập' xác nhận trên điện thoại của bạn...\n");
          break;
        }

        case LoginQRCallbackEventType.QRCodeExpired: {
          console.log("⏳ [Zalo] Mã QR đã hết hạn. Đang tự động tạo lại mã mới...");
          event.actions.retry();
          break;
        }

        case LoginQRCallbackEventType.QRCodeDeclined: {
          console.error("❌ [Zalo] Bạn đã từ chối yêu cầu đăng nhập trên điện thoại.");
          break;
        }

        case LoginQRCallbackEventType.GotLoginInfo: {
          console.log("🎉 [Zalo] Đã xác thực thành công! Đang lưu thông tin phiên...");
          saveSession({
            cookie: event.data.cookie,
            imei: event.data.imei,
            userAgent: event.data.userAgent,
          });
          break;
        }
      }
    }
  );
}

/**
 * Hàm khởi chạy ứng dụng
 */
async function main(): Promise<void> {
  printBanner();
  validateConfig();

  const zalo = new Zalo({
    selfListen: false,
    checkUpdate: true,
    logging: false,
  });

  let api: API | null = null;

  // 1. Thử đăng nhập bằng session.json đã lưu từ trước
  const existingSession = loadSession();
  if (existingSession) {
    try {
      console.log("🔄 Đang thử đăng nhập bằng phiên cũ...");
      api = await zalo.login(existingSession);
      console.log("🎉 Đăng nhập Zalo thành công qua Session đã lưu!");
    } catch (sessionError) {
      console.warn("⚠️ Phiên đăng nhập cũ đã hết hạn hoặc không hợp lệ. Sẽ đăng nhập bằng mã QR mới...");
      clearSession();
      api = null;
    }
  }

  // 2. Nếu chưa có session hoặc session hết hạn, đăng nhập qua mã QR
  if (!api) {
    try {
      api = await loginWithQR(zalo);
      console.log("🎉 Đăng nhập Zalo bằng mã QR thành công!");
    } catch (qrError) {
      console.error("❌ Đăng nhập bằng mã QR thất bại:", qrError);
      process.exit(1);
    }
  }

  // 3. Lấy thông tin tài khoản Bot
  const ownId = api.getOwnId();
  console.log(`\n✅ Bot đã sẵn sàng hoạt động!`);
  console.log(`🆔 Bot User ID: ${ownId}`);
  console.log(`⚙️  Model AI: ${config.geminiModel}`);
  console.log(`🎯 Prefix lệnh: ${config.prefixes.join(", ")}`);
  console.log(`🛡️  Chế độ chống ban: BẬT (Chỉ trả lời khi tag bot hoặc gõ lệnh, cooldown: ${config.cooldownMs}ms)`);
  console.log("\n🚀 Đang lắng nghe tin nhắn Zalo...\n");

  // 4. Lắng nghe các sự kiện socket
  api.listener.on("connected", () => {
    console.log("🟢 [Zalo Socket] Đã kết nối thành công tới máy chủ Zalo.");
  });

  api.listener.on("closed", (code, reason) => {
    console.warn(`🟡 [Zalo Socket] Kết nối bị đóng (mã: ${code}, lý do: ${reason}). Đang tự động kết nối lại...`);
  });

  api.listener.on("error", (error) => {
    console.error("🔴 [Zalo Socket Lỗi]:", error);
  });

  // Bắt sự kiện có tin nhắn mới
  api.listener.on("message", (message) => {
    handleIncomingMessage(api!, ownId, message);
  });

  // Bắt đầu lắng nghe tin nhắn với cờ retryOnClose
  api.listener.start({ retryOnClose: true });

  // 5. Xử lý tắt ứng dụng một cách an toàn
  const gracefulShutdown = () => {
    console.log("\n🛑 Đang dừng Bot Zalo và giải phóng kết nối...");
    try {
      api?.listener.stop();
    } catch (err) {
      // Bỏ qua lỗi khi stop
    }
    console.log("👋 Tạm biệt!");
    process.exit(0);
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
}

// Chạy bot
main().catch((fatalError) => {
  console.error("💥 Lỗi nghiêm trọng khiến bot dừng đột ngột:", fatalError);
  process.exit(1);
});
