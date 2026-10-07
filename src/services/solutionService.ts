import { config } from "../config";

export interface ParsedExamQuery {
  level: string;
  exam: number;
  session: number | null;
  range: { start: number; end: number } | null;
}

/**
 * Trích xuất cấp độ, số đề, dải câu hỏi hoặc số buổi từ câu hỏi của giáo viên / học viên
 * Ví dụ:
 *  - "n5 de 1 1-50" -> { level: "n5", exam: 1, range: { start: 1, end: 50 }, session: null }
 *  - "n5 đề 1 câu 1 đến 50" -> { level: "n5", exam: 1, range: { start: 1, end: 50 }, session: null }
 *  - "1-50" -> { level: "n5", exam: 1, range: { start: 1, end: 50 }, session: null }
 *  - "n5 de 1 b1" -> { level: "n5", exam: 1, range: null, session: 1 }
 *  - "đáp án đề 1 buổi 2" -> { level: "n5", exam: 1, range: null, session: 2 }
 */
export function parseExamQuery(text: string): ParsedExamQuery {
  const normalized = text.toLowerCase().trim();

  // 1. Phân tích cấp độ JLPT (n5, n4, n3, n2, n1)
  const levelMatch = normalized.match(/\b(n[1-5])\b/);
  const level = levelMatch ? levelMatch[1] : "n5";

  // 2. Phân tích số đề (đề 1, de 1, đề số 2...)
  const examMatch = normalized.match(/(?:đề|de|đề số|de so)\s*(\d+)/);
  const exam = examMatch ? parseInt(examMatch[1], 10) : 1;

  // Loại bỏ level và exam đã nhận diện để không bị trùng lặp số
  let remaining = normalized;
  if (levelMatch) {
    remaining = remaining.replace(levelMatch[0], " ");
  }
  if (examMatch) {
    remaining = remaining.replace(examMatch[0], " ");
  }

  // 3. Phân tích Dải câu hỏi (Range): VD: 1-50, 1 - 50, 1~50, 1 đến 50, từ câu 1 đến câu 50, câu 1-20
  const rangeMatch = remaining.match(
    /(?:từ\s*câu|tu\s*cau|từ|tu|câu|cau)?\s*(\d+)\s*(?:[-–~]|đến|den|tới|toi)\s*(?:câu|cau)?\s*(\d+)/
  );

  let range: { start: number; end: number } | null = null;
  let session: number | null = null;

  if (rangeMatch) {
    const q1 = parseInt(rangeMatch[1], 10);
    const q2 = parseInt(rangeMatch[2], 10);
    range = {
      start: Math.min(q1, q2),
      end: Math.max(q1, q2),
    };
  } else {
    // Kiểm tra câu đơn lẻ: VD 'câu 15', 'cau 5'
    const singleQMatch = remaining.match(/(?:câu|cau)\s*(\d+)/);
    if (singleQMatch) {
      const q = parseInt(singleQMatch[1], 10);
      range = { start: q, end: q };
    } else {
      // 4. Phân tích số buổi / bài (buổi 1, buoi 1, bài 1, bai 1, b1, buổi số 2...)
      const sessionMatch = remaining.match(
        /(?:buổi|buoi|bài|bai|buổi số|buoi so|bài số|bai so|b)\s*(\d+)/
      );
      session = sessionMatch ? parseInt(sessionMatch[1], 10) : null;
    }
  }

  return { level, exam, session, range };
}

/**
 * Gọi API từ website để lấy đáp án dạng text cho Zalo
 */
export async function getExamSolution(rawQuery: string): Promise<string> {
  const { level, exam, session, range } = parseExamQuery(rawQuery);

  try {
    let url = `${config.solutionsApiUrl}?level=${level}&exam=${exam}&format=text`;
    if (range) {
      url += `&range=${range.start}-${range.end}`;
    } else if (session !== null) {
      url += `&session=${session}`;
    }

    console.log(`📡 [Solutions API] Đang lấy đáp án: ${url}`);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "ZaloBot-PThamSS/1.0",
      },
    });

    if (!res.ok) {
      console.warn(`⚠️ [Solutions API] Máy chủ trả về mã lỗi: ${res.status}`);
      return `⚠️ Hệ thống tra cứu đáp án hiện đang bận (Mã lỗi: ${res.status}).\n👉 Xem trực tiếp tại: https://www.pthamnihongo.site/vi/solutions?level=${level}&exam=${exam}`;
    }

    const replyText = await res.text();
    return replyText.trim();
  } catch (error) {
    console.error("❌ [Solutions API] Lỗi khi kết nối đến API:", error);
    return `⚠️ Không thể kết nối tới máy chủ đáp án lúc này.\n👉 Xem chi tiết tại: https://www.pthamnihongo.site/vi/solutions?level=${level}&exam=${exam}`;
  }
}
