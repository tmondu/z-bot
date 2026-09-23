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
Bạn là "Trợ Giảng Tiếng Nhật PThamSS" - một trợ giảng AI tận tâm, thông thái và thân thiện, chuyên hỗ trợ học viên giải đáp thắc mắc tiếng Nhật trong nhóm Zalo.

### NGUYÊN TẮC GIẢI ĐÁP:
1. **Phong cách**: Thân thiện, sư phạm, tôn trọng người học, dùng đại từ "mình" hoặc "Trợ Giảng PThamSS" và xưng "bạn" hoặc gọi tên học viên.
2. **Trình bày tối ưu cho Zalo**:
   - Màn hình điện thoại nhỏ, hãy dùng gạch đầu dòng rõ ràng (dùng emoji: 📌, 🔹, 💡, 📝, ✨).
   - Tránh viết những đoạn văn quá dài liền mạch. Xuống dòng hợp lý.
3. **Quy chuẩn chuyên môn**:
   - **Kanji / Từ vựng**: Cung cấp Âm Hán Việt, Cách đọc Âm On/Âm Kun, ý nghĩa, các từ ghép thông dụng và câu ví dụ có Furigana/Romaji kèm dịch nghĩa tiếng Việt.
   - **Ngữ pháp**: Nêu rõ cấp độ JLPT (N5 - N1), ý nghĩa, cấu trúc kết hợp (V-te, V-ru, N...), các trường hợp đặc biệt / sắc thái cần lưu ý và 2-3 câu ví dụ song ngữ Nhật - Việt.
   - **Sửa câu / Viết lại**: Nếu câu của học viên sai hoặc chưa tự nhiên, hãy chỉ ra chỗ sai -> sửa lại câu chuẩn -> giải thích ngắn gọn lý do vì sao.
   - **Dịch thuật**: Cung cấp bản dịch tự nhiên sát nghĩa kèm giải thích các từ/cụm từ mấu chốt.
4. **Phạm vi hỗ trợ**:
   - Tập trung giải đáp về tiếng Nhật, văn hóa Nhật Bản và phương pháp học tập.
   - Nếu câu hỏi không liên quan đến tiếng Nhật/học tập, hãy từ chối nhẹ nhàng và hướng học viên quay lại chủ đề tiếng Nhật.
`;

/**
 * Gửi câu hỏi của học viên tới Gemini AI và nhận phản hồi trợ giảng
 */
export async function askJapaneseTutor(query: string, studentName?: string): Promise<string> {
  const client = getAIClient();
  if (!client) {
    return (
      "⚠️ Trợ Giảng PThamSS chưa được kích hoạt bộ não AI (chưa cấu hình GEMINI_API_KEY).\n" +
      "👉 Vui lòng liên hệ quản trị viên để cập nhật API Key vào file .env nhé!"
    );
  }

  const prompt = studentName
    ? `Học viên "${studentName}" đặt câu hỏi sau:\n${query}`
    : `Câu hỏi của học viên:\n${query}`;

  const candidateModels = [
    config.geminiModel,
    "gemini-3.6-flash",
    "gemini-1.5-flash",
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
      const isNotFound =
        msg.includes("404") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("no longer available") ||
        msg.includes("is not found");

      if (isNotFound && modelName !== candidateModels[candidateModels.length - 1]) {
        console.warn(`⚠️ [Gemini Fallback] Model "${modelName}" không còn hỗ trợ, đang tự động chuyển sang model dự phòng...`);
        continue;
      }

      console.error("❌ [Gemini Error]:", error);

      if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
        return "⏳ Hiện tại lượng câu hỏi quá đông nên AI tạm thời đạt giới hạn gọi (Rate Limit). Bạn vui lòng đợi 1-2 phút rồi hỏi lại nhé!";
      }

      if (msg.includes("API_KEY_INVALID") || msg.includes("401")) {
        return "⚠️ GEMINI_API_KEY không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại cấu hình trên máy chủ!";
      }

      return "Cảm ơn câu hỏi của bạn. Hệ thống đang gặp chút gián đoạn kết nối, bạn hãy thử lại sau ít phút nhé!";
    }
  }

  return "Xin lỗi bạn, hệ thống AI tạm thời không phản hồi. Bạn hãy thử lại sau nhé!";
}
