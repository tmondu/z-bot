# 🤖 Zalo Bot Trợ Giảng Tiếng Nhật PThamSS (Standalone)

Ứng dụng Bot Zalo độc lập (Node.js & TypeScript), kết nối tài khoản Zalo cá nhân (nick phụ) để tự động hỗ trợ học viên giải đáp thắc mắc Kanji, từ vựng, ngữ pháp JLPT và dịch câu thông qua **Google Gemini AI**.

Dự án được thiết kế **hoàn toàn độc lập** (`package.json`, `tsconfig.json` riêng biệt), tối ưu để triển khai chạy 24/7 trên **máy ảo Windows (ESXi)** hoặc Linux VPS.

---

## 🌟 Tính Năng Nổi Bật

1. **Bộ não Trợ Giảng Tiếng Nhật (Gemini 2.5 Flash / 1.5 Flash)**:
   - **Kanji / Từ vựng**: Chiết tự Hán Việt, âm On, âm Kun, từ ghép phổ biến và ví dụ song ngữ.
   - **Ngữ pháp JLPT (N5 - N1)**: Giải thích ý nghĩa, công thức chia, sắc thái sử dụng và câu ví dụ minh họa.
   - **Dịch thuật & Sửa câu**: Dịch chuẩn ngữ cảnh, phát hiện lỗi sai trong câu của học viên và giải thích nguyên nhân.
   - **Tối ưu hiển thị Zalo**: Định dạng ngắn gọn, gạch đầu dòng rõ ràng, dễ đọc trên điện thoại.

2. **Cơ chế Chống Ban & Bảo Vệ Tài Khoản (Anti-Ban & Safety Shield)**:
   - **Chỉ trả lời khi được gọi**: Chỉ phản hồi khi học viên **tag bot (@Bot)** hoặc dùng lệnh có tiền tố (`/hoi`, `/kanji`, `/nguphap`, `/dich`). Tuyệt đối không can thiệp vào các cuộc trò chuyện tự do trong nhóm.
   - **Mô phỏng người thật**: Gửi trạng thái "Đang soạn tin..." (`isTyping`) kèm độ trễ ngẫu nhiên (1.5s - 3s) trước khi gửi tin.
   - **Rate Limiting (Cooldown)**: Tự động giới hạn tần suất gọi bot của từng học viên (mặc định 5s) để chống spam.
   - **Quote Reply**: Tự động trích dẫn lại đúng câu hỏi của học viên trong nhóm.

3. **Cơ chế Quản Lý Phiên (Session Management)**:
   - Quét mã QR trực tiếp trên màn hình terminal trong lần khởi động đầu tiên.
   - Tự động trích xuất và lưu phiên vào `session.json`. Các lần chạy sau sẽ đăng nhập trực tiếp không cần quét lại.

---

## 📁 Cấu Trúc Thư Mục

```text
zalo-bot/
├── src/
│   ├── index.ts                # Điểm khởi chạy chính (login, QR display, listener)
│   ├── config.ts               # Quản lý cấu hình từ file .env
│   ├── session.ts              # Quản lý đọc/ghi session.json (cookie, imei, userAgent)
│   ├── ai.ts                   # Kết nối Google Gemini API với System Prompt chuyên ngữ
│   └── handlers/
│       └── messageHandler.ts   # Xử lý tin nhắn nhóm, anti-ban shield, cooldown, quote reply
├── session.json                # (Tự động sinh sau khi quét QR lần đầu - Không commit git)
├── .env.example                # File mẫu cấu hình API key, tên bot, prefix
├── .gitignore                  # Loại trừ node_modules, session.json, .env
├── package.json                # Dependencies độc lập
├── tsconfig.json               # Cấu hình TypeScript độc lập
└── README.md                   # Tài liệu hướng dẫn sử dụng và triển khai
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Nhanh

### Bước 1: Chuẩn bị môi trường
Yêu cầu đã cài đặt **Node.js** (khuyến nghị phiên bản LTS từ v18 trở lên).

```bash
# Di chuyển vào thư mục zalo-bot
cd /algo/software/zalo-bot

# Cài đặt các thư viện cần thiết
npm install
```

### Bước 2: Cấu hình biến môi trường
Tạo file `.env` từ file mẫu `.env.example`:

```bash
cp .env.example .env
```

Mở `.env` và điền `GEMINI_API_KEY`:
```env
# Đăng ký lấy API key miễn phí tại https://aistudio.google.com/
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here

GEMINI_MODEL=gemini-2.5-flash
BOT_NAME=Trợ Giảng Tiếng Nhật PThamSS
BOT_PREFIXES=/hoi,/kanji,/dich,/nguphap,/help
COOLDOWN_MS=5000
REPLY_DIRECT_MESSAGES=true
SIMULATE_TYPING=true
```

### Bước 3: Khởi chạy và Quét mã QR lần đầu
Chạy lệnh dev:
```bash
npm run dev
```

1. Màn hình terminal sẽ in ra mã QR dạng ASCII.
2. Dùng điện thoại mở Zalo (tài khoản phụ làm bot), vào mục Quét mã QR để quét.
3. Xác nhận "Đăng nhập" trên điện thoại.
4. Bot sẽ tự động lưu thông tin vào file `session.json` và bắt đầu lắng nghe tin nhắn!

---

## 🖥️ Hướng Dẫn Triển Khai Chạy 24/7 Trên Máy Ảo Windows (ESXi)

Để bot hoạt động liên tục 24/7 và tự động khởi động cùng Windows khi máy chủ ESXi reboot, hãy làm theo các bước sau:

### 1. Copy mã nguồn sang máy ảo Windows
- Bạn có thể nén hoặc copy toàn bộ thư mục `zalo-bot` sang máy ảo Windows (ví dụ đặt tại `C:\Bots\zalo-bot`).
- **Mẹo**: Nếu bạn đã quét QR thành công trên máy phát triển, bạn chỉ cần copy luôn cả file `session.json` sang máy ảo Windows, bot sẽ vào thẳng mà không cần quét lại!

### 2. Cài đặt Node.js trên Windows
- Tải và cài đặt bản **Node.js LTS** (Windows Installer `.msi`) từ trang chủ [nodejs.org](https://nodejs.org/).
- Mở **Command Prompt (CMD)** hoặc **PowerShell** kiểm tra:
  ```cmd
  node -v
  npm -v
  ```

### 3. Cài đặt Dependencies & Build trên Windows
Trong thư mục `C:\Bots\zalo-bot`:
```cmd
npm install
npm run build
```

### 4. Cài đặt PM2 để chạy nền & Tự khởi động cùng Windows

Mở CMD hoặc PowerShell với quyền **Administrator**:

```cmd
# 1. Cài đặt PM2 toàn cục
npm install -g pm2

# 2. Cài đặt công cụ hỗ trợ PM2 chạy dạng Windows Service
npm install -g pm2-windows-service

# 3. Cấu hình PM2 service (làm theo hướng dẫn trên màn hình)
pm2-service-install -n PM2

# 4. Khởi chạy bot bằng PM2
cd C:\Bots\zalo-bot
pm2 start dist/index.js --name "zalo-japanese-bot"

# 5. Lưu danh sách tiến trình để tự bật khi máy ảo khởi động lại
pm2 save
```

### Các lệnh quản lý PM2 tiện ích:
- `pm2 status`: Xem trạng thái bot đang chạy hay dừng.
- `pm2 logs zalo-japanese-bot`: Xem nhật ký hoạt động thời gian thực.
- `pm2 restart zalo-japanese-bot`: Khởi động lại bot.
- `pm2 stop zalo-japanese-bot`: Tạm dừng bot.

---

## 💬 Hướng Dẫn Học Viên Sử Dụng Trong Nhóm Zalo

Thêm tài khoản bot vào nhóm học viên Zalo. Học viên có thể tương tác theo các cách sau:

| Lệnh / Thao tác | Mô tả | Ví dụ thực tế |
| :--- | :--- | :--- |
| `@Tên_Bot [câu hỏi]` | Tag bot hỏi bất kỳ điều gì | `@Trợ Giảng phân biệt ように và ために` |
| `/kanji [chữ/từ]` | Tra cứu Hán tự, On, Kun, ví dụ | `/kanji 勉強` hoặc `/kanji 諦` |
| `/nguphap [mẫu]` | Giải thích ngữ pháp N5 - N1 | `/nguphap ~てたまらない` |
| `/dich [câu]` | Dịch song ngữ & sửa lỗi hành văn | `/dich Tôi muốn trở thành kỹ sư phần mềm tại Nhật` |
| `/hoi [câu hỏi]` | Đặt câu hỏi nhanh không cần tag | `/hoi Vì sao nói 行ってきます khi ra khỏi nhà?` |
| `/help` | Xem bảng hướng dẫn các lệnh | `/help` |

---

## 🛡️ Lưu Ý Quan Trọng Về An Toàn Tài Khoản Zalo

> [!WARNING]
> - `zca-js` là thư viện mô phỏng giao thức Zalo Web không chính thức.
> - **Bắt buộc dùng tài khoản phụ (nick clone)** làm bot, không dùng tài khoản chính để tránh rủi ro bị hạn chế tính năng.
> - Bot đã được tích hợp sẵn lớp bảo vệ: **chỉ trả lời khi được tag hoặc gõ lệnh**, **mô phỏng typing 1.5s - 3s**, và **cooldown 5s mỗi người dùng**. Không nên tắt các cơ chế này.
