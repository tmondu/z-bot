import { config } from "../config";

interface ParsedExamQuery {
  level: string;
  exam: number;
  session: number;
}

/**
 * Trích xuất cấp độ, số đề và số buổi từ câu hỏi của học viên
 * Ví dụ:
 *  - "n5 de 1 b1" -> { level: "n5", exam: 1, session: 1 }
 *  - "đáp án đề 1 buổi 2" -> { level: "n5", exam: 1, session: 2 }
 *  - "cho em xin đáp án bài tập n4 đề 2 buổi 3" -> { level: "n4", exam: 2, session: 3 }
 */
export function parseExamQuery(text: string): ParsedExamQuery {
  const normalized = text.toLowerCase().trim();

  // 1. Phân tích cấp độ JLPT (n5, n4, n3, n2, n1)
  const levelMatch = normalized.match(/\b(n[1-5])\b/);
  const level = levelMatch ? levelMatch[1] : "n5";

  // 2. Phân tích số đề (đề 1, de 1, đề số 2...)
  const examMatch = normalized.match(/(?:đề|de|đề số|de so)\s*(\d+)/);
  const exam = examMatch ? parseInt(examMatch[1], 10) : 1;

  // 3. Phân tích số buổi (buổi 1, buoi 1, b1, buổi số 2...)
  const sessionMatch = normalized.match(/(?:buổi|buoi|b|buổi số|buoi so)\s*(\d+)/);
  const session = sessionMatch ? parseInt(sessionMatch[1], 10) : 1;

  return { level, exam, session };
}

/**
 * Gọi API từ website để lấy đáp án dạng text cho Zalo
 */
export async function getExamSolution(rawQuery: string): Promise<string> {
  const { level, exam, session } = parseExamQuery(rawQuery);

  try {
    const url = `${config.solutionsApiUrl}?level=${level}&exam=${exam}&session=${session}&format=text`;
    console.log(`📡 [Solutions API] Đang lấy đáp án: ${url}`);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "ZaloBot-PThamSS/1.0",
      },
    });

    if (!res.ok) {
      console.warn(`⚠️ [Solutions API] Máy chủ trả về mã lỗi: ${res.status}`);
      return `⚠️ Hệ thống tra cứu đáp án hiện đang bận (Mã lỗi: ${res.status}).\n👉 Em có thể xem trực tiếp tại: https://www.pthamnihongo.site/vi/solutions?level=${level}&exam=${exam}`;
    }

    const replyText = await res.text();
    return replyText.trim();
  } catch (error) {
    console.error("❌ [Solutions API] Lỗi khi kết nối đến API:", error);
    return `⚠️ Không thể kết nối tới máy chủ đáp án lúc này.\n👉 Em vui lòng truy cập website để xem chi tiết nhé: https://www.pthamnihongo.site/vi/solutions?level=${level}&exam=${exam}`;
  }
}
