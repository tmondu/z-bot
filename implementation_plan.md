# Kế Hoạch Triển Khai: Zalo Bot Trợ Giảng Tiếng Nhật PThamSS (Standalone)

Xây dựng một ứng dụng Bot Zalo độc lập (standalone project) bằng Node.js & TypeScript, sử dụng tài khoản Zalo cá nhân (nick phụ) để tham gia các nhóm học viên và tự động giải đáp thắc mắc tiếng Nhật (từ vựng, kanji, ngữ pháp) thông qua Google Gemini AI.

---

## 1. Yêu Cầu & Kiến Trúc Tổng Quan

1. **Vị trí dự án**: Đặt tại thư mục `zalo-bot/` trong workspace. Dự án hoàn toàn độc lập với web Next.js (`package.json`, `tsconfig.json` riêng biệt), giúp bạn có thể copy toàn bộ thư mục này sang máy ảo Windows trên ESXi một cách dễ dàng.
2. **Cơ chế Zalo Client (`zca-js`)**:
   - Sử dụng thư viện `zca-js` mô phỏng phiên Zalo Web.
   - Lần đầu chạy: In mã QR trực tiếp ra màn hình terminal (dùng `qrcode-terminal`) để bạn mở Zalo điện thoại quét.
   - Đăng nhập thành công: Tự động trích xuất `cookie`, `imei`, `userAgent` lưu vào file `session.json`. Các lần khởi động sau sẽ tự động đọc session này để vào thẳng, không cần quét lại.
3. **Cơ chế Chống Ban & Bảo Vệ Tài Khoản (Anti-Ban / Safety Shield)**:
   - **Chỉ trả lời khi được gọi**: Lắng nghe tin nhắn trong nhóm (`ThreadType.Group`), chỉ phản hồi khi học viên **tag tên bot** (`@Trợ Giảng`) hoặc gõ lệnh có tiền tố `/hoi`, `/kanji`, `/dich`. Tuyệt đối không tự ý chen vào mọi cuộc trò chuyện.
   - **Mô phỏng hành vi người thật**: Gửi trạng thái `isTyping` (đang soạn tin...) và tạo độ trễ ngẫu nhiên (1.5s – 3s) trước khi gửi tin nhắn.
   - **Rate Limiting (Cooldown)**: Giới hạn mỗi người dùng chỉ được gọi bot 1 lần trong 5–10 giây để chống học viên spam phá hoại.
4. **Bộ Não Trợ Giảng (Gemini AI Engine)**:
   - Kết nối Google Gemini API (model `gemini-1.5-flash` hoặc `gemini-2.5-flash` tốc độ cao, tiếng Nhật - tiếng Việt chuẩn xác).
   - System Prompt đóng vai *Trợ giảng tiếng Nhật PThamSS*: Giải thích rõ ràng, cung cấp Kanji, Furigana, Romaji, dịch nghĩa và câu ví dụ thực tế.

---

## 2. Cấu Trúc Thư Mục Dự Án (`zalo-bot/`)

```text
zalo-bot/
├── src/
│   ├── index.ts                # Điểm khởi chạy chính (login, QR display, listener)
│   ├── config.ts               # Load biến môi trường từ .env
│   ├── session.ts              # Quản lý đọc/ghi session.json (cookie, imei, userAgent)
│   ├── ai.ts                   # Tích hợp Gemini API với System Prompt chuyên ngữ
│   └── handlers/
│       └── messageHandler.ts   # Bắt tin nhắn group, kiểm tra tag/prefix, cooldown, gửi reply
├── session.json                # (Tự sinh sau khi quét QR, được gitignore)
├── .env.example                # File mẫu cấu hình API key, tên bot, prefix
├── .gitignore                  # Bỏ qua node_modules, session.json, .env
├── package.json                # Khai báo dependencies độc lập
├── tsconfig.json               # Cấu hình TypeScript độc lập
└── README.md                   # Hướng dẫn chi tiết copy & chạy trên Windows VM (ESXi) với PM2
```

---

## 3. Các Bước Triển Khai Chi Tiết

### Bước 1: Khởi tạo Project & Dependencies
- Tạo thư mục `zalo-bot/`.
- Cấu hình `package.json` với các thư viện:
  - `zca-js`: Thư viện kết nối Zalo.
  - `@google/genai` (hoặc `@google/generative-ai`): SDK Gemini chính thức của Google.
  - `qrcode-terminal`: Hiển thị mã QR trực tiếp trên màn hình console để quét bằng điện thoại.
  - `dotenv`: Quản lý biến môi trường.
  - `typescript`, `ts-node`, `@types/node`: Hỗ trợ chạy trực tiếp TypeScript.

### Bước 2: Module Quản Lý Session (`src/session.ts`)
- Hàm `saveSession(context)`: Lưu `cookie`, `imei`, `userAgent` vào `session.json`.
- Hàm `loadSession()`: Kiểm tra nếu có `session.json` hợp lệ thì nạp lại để Zalo login tự động.

### Bước 3: Module Trí Tuệ Nhân Tạo (`src/ai.ts`)
- Khởi tạo client Gemini từ `GEMINI_API_KEY`.
- Xây dựng System Instruction tối ưu cho việc học tiếng Nhật:
  - Phân tích ngữ pháp theo cấp độ JLPT (N5 - N1).
  - Chiết tự Kanji (âm Hán Việt, On, Kun, bộ thủ).
  - Sửa lỗi câu tiếng Nhật cho học viên kèm giải thích tại sao sai.

### Bước 4: Xử Lý Sự Kiện & Chống Ban (`src/handlers/messageHandler.ts`)
- Kiểm tra tin nhắn đến:
  - Bỏ qua tin nhắn từ chính bot gửi đi.
  - Kiểm tra xem tin nhắn có tag bot hoặc bắt đầu bằng `/hoi`, `/kanji` không.
  - Kiểm tra thời gian chờ (cooldown map per user).
- Kích hoạt trạng thái soạn thảo (`sendTyping / isTyping`).
- Gọi `ai.ts` lấy câu trả lời.
- Gửi phản hồi dạng quote/reply tin nhắn của học viên trong nhóm.

### Bước 5: Hướng Dẫn Vận Hành Trên Windows VM ESXi (`README.md`)
- Hướng dẫn cài Node.js trên máy ảo Windows.
- Hướng dẫn chạy thử lần đầu bằng `npm run dev`.
- Hướng dẫn cài đặt **PM2** hoặc **NSSM** để biến bot thành Windows Service tự chạy 24/7 khi máy chủ khởi động lại.

---

## 4. Kế Hoạch Kiểm Thử (Verification Plan)

### Automated Checks
- Kiểm tra biên dịch TypeScript không có lỗi syntax:
  ```bash
  cd zalo-bot && npx tsc --noEmit
  ```
- Kiểm tra file `.env.example` và cấu trúc các module.

### Manual Verification (Khi chạy trên máy tính / VM)
1. Chạy `npm run dev` trong thư mục `zalo-bot`.
2. Kiểm tra mã QR hiển thị trên màn hình terminal.
3. Dùng điện thoại mở Zalo nick phụ quét mã QR.
4. Kiểm tra file `session.json` được tạo ra thành công.
5. Thêm bot vào 1 nhóm Zalo test, tag `@Bot hỏi ngữ pháp ~てたまらない` và kiểm tra phản hồi của bot.
