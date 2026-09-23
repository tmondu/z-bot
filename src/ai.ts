import { GoogleGenAI } from "@google/genai";
import { config } from "./config";

// Khởi tạo Gemini AI Client khi có API Key
let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!config.geminiApiKey || config.geminiApiKey === "your_gemini_api_key_here") {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return aiClient;
}

const JAPANESE_TUTOR_SYSTEM_INSTRUCTION = `
Bạn là một người có chuyên môn tiếng Nhật lâu năm đang trò chuyện, giải đáp thắc mắc cho học viên trong nhóm chat Zalo.

### NGUYÊN TẮC CỐT LÕI (LOẠI BỎ HOÀN TOÀN MÙI AI / ROBOT):
1. VÀO THẲNG VẤN ĐỀ: Tuyệt đối KHÔNG chào hỏi rườm rà ("Chào bạn...", "Rất vui được gặp bạn...", "Mình xin trả lời...", "Trợ Giảng xin trả lời..."). Hãy trả lời trực diện vào câu hỏi ngay dòng đầu tiên.
2. KHÔNG KẾT BÀI VĂN MẪU: Tuyệt đối KHÔNG dùng các câu kết gượng gạo kiểu "Bạn có thắc mắc gì nữa không...", "Cứ thoải mái chia sẻ nhé!", "Chúc bạn học tốt!". Giải thích xong là dừng lại tự nhiên.
3. HẠN CHẾ TỐI ĐA ICON/EMOJI: Tuyệt đối KHÔNG dùng các icon rập khuôn kiểu 📌, 🔹, 💡, 📝, ✨, 🚀, ⚠️, 😊. Toàn bài chỉ dùng tối đa 0-1 emoji nếu thật sự tự nhiên, ưu tiên dùng dấu gạch đầu dòng (-) hoặc số thứ tự khi liệt kê.
4. KHÔNG DÙNG MARKDOWN RƯỜM RÀ: Không dùng tiêu đề lớn (###), không dùng đường kẻ phân cách (---) vì trên Zalo nhìn rất giống máy gõ.
5. NGẮN GỌN, ĐÚNG TRỌNG TÂM:
   - Trả lời súc tích, cô đọng như một người thật đang nhắn tin Zalo hỗ trợ.
   - Giải thích ý chính, kèm 1-2 ví dụ thực tế nhất (có tiếng Nhật + nghĩa tiếng Việt).
   - Xưng "mình" và gọi "bạn", giọng văn gần gũi, chia sẻ kinh nghiệm thực tế.
`;

/**
 * Gửi câu hỏi của học viên tới Gemini và nhận phản hồi trợ giảng
 */
export async function askJapaneseTutor(query: string, studentName?: string): Promise<string> {
  const client = getAIClient();
  if (!client) {
    return (
      "⚠️ Trợ Giảng chưa được kích hoạt kết nối (chưa cấu hình GEMINI_API_KEY).\n" +
      "👉 Vui lòng liên hệ quản trị viên để cập nhật API Key vào file .env nhé!"
    );
  }

  const prompt = query;

  const candidateModels = [
    config.geminiModel,
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
  ].filter((v, i, a) => a.indexOf(v) === i && Boolean(v));

  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: JAPANESE_TUTOR_SYSTEM_INSTRUCTION,
          temperature: 0.6,
        },
      });

      const reply = response.text;
      if (!reply || reply.trim().length === 0) {
        return "Xin lỗi bạn, hiện tại mình chưa thể xử lý câu trả lời này. Bạn hãy thử đặt lại câu hỏi ngắn gọn hơn nhé!";
      }

      return reply.trim();
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || String(error);
      const shouldFallback =
        msg.includes("404") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("429") ||
        msg.includes("no longer available") ||
        msg.includes("is not found");

      if (shouldFallback && modelName !== candidateModels[candidateModels.length - 1]) {
        console.warn(`⚠️ [Gemini Fallback] Model "${modelName}" đang bận/quá tải, tự động chuyển sang model dự phòng...`);
        continue;
      }

      console.error("❌ [Gemini Error]:", error);

      if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
        return "⏳ Hiện tại lượng câu hỏi gửi về đang hơi đông, bạn vui lòng đợi 1-2 phút rồi hỏi lại nhé!";
      }

      if (msg.includes("API_KEY_INVALID") || msg.includes("401")) {
        return "⚠️ GEMINI_API_KEY không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại cấu hình trên máy chủ!";
      }

      return "Cảm ơn câu hỏi của bạn. Hệ thống đang gặp chút gián đoạn kết nối, bạn hãy thử lại sau ít phút nhé!";
    }
  }

  return "Xin lỗi bạn, hiện tại mình đang gặp chút gián đoạn kết nối. Bạn hãy thử lại sau ít phút nhé!";
}
