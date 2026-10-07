import { API, Message, ThreadType, GroupMessage } from "zca-js";
import { config } from "../config";
import { askJapaneseTutor } from "../ai";
import { getExamSolution } from "../services/solutionService";

// Lưu thời gian gọi gần nhất của từng user để chống spam (cooldown)
const userCooldowns = new Map<string, number>();

// Bộ nhớ đệm thông tin Trưởng/Phó nhóm
interface GroupAdminCache {
  creatorId: string;
  adminIds: string[];
  expiresAt: number;
}
const groupAdminCache = new Map<string, GroupAdminCache>();

/**
 * Xóa cache của một nhóm hoặc toàn bộ khi có sự kiện thay đổi nhóm
 */
export function clearGroupAdminCache(groupId?: string): void {
  if (groupId) {
    groupAdminCache.delete(groupId);
    console.log(`🔄 [Cache] Đã làm mới dữ liệu quyền cho nhóm: ${groupId}`);
  } else {
    groupAdminCache.clear();
    console.log("🔄 [Cache] Đã làm mới toàn bộ dữ liệu quyền các nhóm.");
  }
}

/**
 * Kiểm tra xem người dùng có phải là Trưởng nhóm (Creator) hoặc Phó nhóm (Admin) hay không
 */
async function checkIsGroupAdmin(api: API, groupId: string, userId: string): Promise<boolean> {
  try {
    const now = Date.now();
    let cached = groupAdminCache.get(groupId);

    // Nếu config.groupAdminCacheMinutes = 0: Lưu vĩnh viễn (chỉ làm mới khi nhóm có sự kiện group_event)
    const isExpired = config.groupAdminCacheMinutes > 0 && cached ? now > cached.expiresAt : false;

    if (!cached || isExpired) {
      const res = await api.getGroupInfo(groupId);
      const groupData = res?.gridInfoMap?.[groupId];
      if (groupData) {
        const expiresAt = config.groupAdminCacheMinutes > 0
          ? now + config.groupAdminCacheMinutes * 60 * 1000
          : Infinity;

        cached = {
          creatorId: String(groupData.creatorId || ""),
          adminIds: (groupData.adminIds || []).map((id) => String(id)),
          expiresAt: expiresAt,
        };
        groupAdminCache.set(groupId, cached);
      }
    }

    if (cached) {
      const isCreator = cached.creatorId === String(userId);
      const isAdmin = cached.adminIds.includes(String(userId));
      return isCreator || isAdmin;
    }
    return false;
  } catch (error) {
    console.warn(`⚠️ [GroupAdminCheck] Không thể lấy thông tin nhóm ${groupId}:`, error);
    return false;
  }
}

/**
 * Hàm tạo độ trễ ngẫu nhiên mô phỏng người thật
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tạo menu hướng dẫn sử dụng bot
 */
function getHelpMessage(studentName: string): string {
  return (
    `🌸 Konnichiwa ${studentName}! Mình là ${config.botName}.\n\n` +
    `📖 BẠN CÓ THỂ GỌI MÌNH THEO CÁC CÁCH SAU:\n` +
    `1️⃣ Tag tên bot: @${config.botName} + câu hỏi của bạn\n` +
    `2️⃣ Hoặc gõ các câu lệnh tiện ích:\n` +
    `   • /dapan [khoảng câu hoặc buổi]: Lấy đáp án (VD: /dapan 1-50, /dapan n5 de 1 1-50, /dapan b1)\n` +
    `   • /hoi [nội dung]: Giải đáp mọi thắc mắc tiếng Nhật\n` +
    `   • /kanji [chữ hán/từ]: Tra cứu Hán Việt, On/Kun, cách nhớ & ví dụ\n` +
    `   • /nguphap [mẫu]: Giải thích ngữ pháp N5 - N1, cấu trúc, ví dụ\n` +
    `   • /dich [câu]: Dịch Nhật - Việt / Việt - Nhật, sửa lỗi hành văn\n` +
    `   • /id: Xem Zalo User ID & vai trò của bạn\n` +
    `   • /help: Xem danh sách lệnh hỗ trợ\n\n` +
    `💡 Ví dụ: /dapan 1-50 hoặc /dapan n5 de 1 b1 hoặc @${config.botName} phân biệt ~てたまらない và ~てならない`
  );
}

/**
 * Handler chính xử lý tin nhắn nhận được từ Zalo
 */
export async function handleIncomingMessage(api: API, ownId: string, message: Message): Promise<void> {
  try {
    // 1. Bỏ qua tin nhắn do chính bot gửi
    if (message.isSelf) {
      return;
    }

    // 2. Chỉ xử lý tin nhắn văn bản thuần túy
    const content = message.data?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      return;
    }

    const rawText = content.trim();
    const senderId = String(message.data.uidFrom || "");
    const senderName = message.data.dName || "bạn";
    const isGroup = message.type === ThreadType.Group;

    // 3. Kiểm tra xem bot có được gọi không
    let isCalled = false;
    let matchedPrefix = "";
    let cleanQuery = rawText;

    // Kiểm tra tiền tố lệnh (/hoi, /kanji, /dich, /nguphap, /dapan, /help, /id, /myid,...)
    for (const prefix of config.prefixes) {
      if (rawText.toLowerCase().startsWith(prefix)) {
        isCalled = true;
        matchedPrefix = prefix;
        cleanQuery = rawText.slice(prefix.length).trim();
        break;
      }
    }

    // Luôn luôn nhận diện lệnh /dapan hoặc /da (dù BOT_PREFIXES trong .env có thiếu hay không)
    if (!isCalled) {
      const lowerRaw = rawText.toLowerCase();
      if (lowerRaw === "/dapan" || lowerRaw.startsWith("/dapan ") || lowerRaw === "/da" || lowerRaw.startsWith("/da ")) {
        isCalled = true;
        matchedPrefix = "/dapan";
        cleanQuery = rawText.replace(/^\/(?:dapan|da)\b/i, "").trim();
      }
    }

    // Kiểm tra xem tin nhắn có phải là quote/reply tin nhắn của chính bot không
    const isReplyingToBot = Boolean(
      message.data?.quote && String(message.data.quote.ownerId) === String(ownId)
    );

    // Nếu người dùng bấm "Trả lời" (Reply) tin nhắn của bot mà KHÔNG gõ tiền tố lệnh (/bot, /kanji,...)
    // thì BỎ QUA HOÀN TOÀN (tránh việc học viên rep khen "xịn quá", "cảm ơn", "=))" làm bot nói leo liên tục)
    if (isReplyingToBot && !matchedPrefix) {
      console.log(`ℹ️ [Bỏ qua] Tin nhắn của ${senderName} là quote reply tin bot, không có tiền tố lệnh.`);
      return;
    }

    // Kiểm tra tag bot trong nhóm nếu chưa khớp prefix
    if (!isCalled && isGroup) {
      const groupMsg = message as GroupMessage;
      const mentions = groupMsg.data?.mentions || [];
      const hasMentionedBot = mentions.some((m) => m.uid === ownId);

      if (hasMentionedBot) {
        isCalled = true;
        // Loại bỏ tag mention khỏi chuỗi văn bản nếu có
        cleanQuery = rawText.replace(/@[^ ]+/g, "").trim();
      }
    }

    // Nếu là tin nhắn riêng 1-1 (ThreadType.User) và được phép tự động trả lời
    if (!isGroup && config.replyDirectMessages) {
      isCalled = true;
    }

    // Nếu không được gọi trong nhóm, TUYỆT ĐỐI KHÔNG can thiệp (Chống ban)
    if (!isCalled) {
      return;
    }

    // 4. Xử lý các lệnh tiện ích hệ thống (Không bị giới hạn phân quyền)
    // Lệnh xem ID: /id hoặc /myid
    if (matchedPrefix === "/id" || matchedPrefix === "/myid" || cleanQuery.toLowerCase() === "id" || cleanQuery.toLowerCase() === "myid") {
      let roleInfo = "";
      if (isGroup) {
        const isAdmin = await checkIsGroupAdmin(api, message.threadId, senderId);
        roleInfo = `• Vai trò trong nhóm: ${isAdmin ? "👑 Trưởng nhóm / Phó nhóm" : "👤 Thành viên"}\n`;
      }
      const idInfo =
        `🆔 THÔNG TIN ĐỊNH DANH ZALO:\n\n` +
        `• Tên hiển thị: ${senderName}\n` +
        `• User ID (UID): ${senderId}\n` +
        (isGroup ? `• Group ID: ${message.threadId}\n${roleInfo}` : "") +
        `\n⚙️ Chế độ phân quyền: ${config.onlyGroupAdmins ? "Chỉ Trưởng/Phó nhóm mới được gọi bot" : "Tự do"}`;
      await sendReply(api, message, idInfo);
      return;
    }

    // Lệnh /help
    if (matchedPrefix === "/help" || cleanQuery.toLowerCase() === "help") {
      const helpText = getHelpMessage(senderName);
      await sendReply(api, message, helpText);
      return;
    }

    // 5. Kiểm tra Phân Quyền:
    // A. Chế độ chỉ cho Trưởng nhóm & Phó nhóm (Creator & Admins)
    if (isGroup && config.onlyGroupAdmins) {
      const isAdminOrCreator = await checkIsGroupAdmin(api, message.threadId, senderId);
      if (!isAdminOrCreator) {
        console.log(`🔒 [Chặn phân quyền] User "${senderName}" (UID: ${senderId}) không phải Trưởng/Phó nhóm.`);
        return; // Im lặng bỏ qua
      }
    }

    // B. Chế độ lọc theo danh sách TEACHER_IDS (nếu có cấu hình)
    if (config.teacherIds.length > 0 && !config.teacherIds.includes(senderId)) {
      console.log(`🔒 [Chặn phân quyền] User "${senderName}" (UID: ${senderId}) không nằm trong danh sách TEACHER_IDS.`);
      return; // Im lặng bỏ qua
    }

    // Xử lý các câu cảm ơn / khen ngợi / cười đùa xã giao ngắn (không gọi AI để tránh lãng phí và tránh trả lời lố)
    const casualKeywords = [
      "cảm ơn", "cam on", "thanks", "thank", "arigatou", "arigato",
      "xịn quá", "xin qua", "xịn", "hay quá", "hay qua", "tuyệt", "tuyệt vời",
      "dạ", "da", "ok", "oke", "=)", "=))", "=)))", "haha", "hihi", "hehe"
    ];
    const isCasual = casualKeywords.some((w) => cleanQuery.toLowerCase() === w || cleanQuery.toLowerCase().startsWith(w + " "));
    if (isCasual && cleanQuery.length < 25 && !matchedPrefix) {
      console.log(`💬 [Xã giao] Tin nhắn cảm ơn/khen ngợi từ ${senderName}, phản hồi thân thiện không gọi AI.`);
      await sendReply(api, message, "Dạ không có gì ạ! Bạn cần hỗ trợ gì tiếng Nhật cứ nhắn mình nhé.");
      return;
    }

    // 6. Cơ chế Cooldown / Rate Limiting chống spam
    const now = Date.now();
    const lastRequest = userCooldowns.get(senderId) || 0;
    if (now - lastRequest < config.cooldownMs) {
      console.log(`⏱️  [Cooldown] User ${senderName} (${senderId}) bị chặn do gửi lệnh quá nhanh.`);
      return;
    }
    userCooldowns.set(senderId, now);

    console.log(`📩 [Tin nhắn mới] Từ: ${senderName} (UID: ${senderId}) | Nội dung: "${rawText}" | Nhóm: ${isGroup ? message.threadId : "Tin nhắn riêng"}`);

    // 7. Kích hoạt trạng thái đang soạn tin (isTyping) ngay khi bắt đầu xử lý
    if (config.simulateTyping) {
      try {
        await api.sendTypingEvent(message.threadId, message.type);
      } catch (err) {
        // Không block flow nếu lỗi typing
      }
    }

    // 8. XỬ LÝ LỆNH LẤY ĐÁP ÁN ĐỀ THI: /dapan hoặc câu hỏi chứa từ khóa "đáp án" / "dap an"
    const lowerQuery = cleanQuery.toLowerCase();
    const isSolutionQuery =
      matchedPrefix === "/dapan" ||
      lowerQuery.includes("đáp án") ||
      lowerQuery.includes("dap an");

    if (isSolutionQuery) {
      console.log(`📋 [Lấy đáp án] Giáo viên "${senderName}" yêu cầu đáp án: "${cleanQuery}"`);
      const solutionReply = await getExamSolution(cleanQuery);
      await sendReply(api, message, solutionReply);
      return;
    }

    // Nếu tag bot nhưng không hỏi gì
    if (cleanQuery.length === 0) {
      const greeting = `Chào ${senderName}! Bạn cần Trợ Giảng PThamSS giải đáp thắc mắc gì về tiếng Nhật nào? Hãy gõ câu hỏi kèm nhé! (Gõ /help để xem hướng dẫn)`;
      await sendReply(api, message, greeting);
      return;
    }

    // 9. Tinh chỉnh câu hỏi gửi tới Gemini dựa trên lệnh
    let fullPrompt = cleanQuery;
    if (matchedPrefix === "/kanji") {
      fullPrompt = `Giải thích chi tiết chữ Kanji/từ vựng này: "${cleanQuery}". Nêu rõ Âm Hán Việt, Onyomi, Kunyomi, ý nghĩa, các từ ghép thông dụng và câu ví dụ.`;
    } else if (matchedPrefix === "/nguphap") {
      fullPrompt = `Giải thích chi tiết mẫu ngữ pháp này: "${cleanQuery}". Nêu rõ cấp độ JLPT, ý nghĩa, công thức kết hợp, lưu ý phân biệt và 2-3 ví dụ song ngữ.`;
    } else if (matchedPrefix === "/dich") {
      fullPrompt = `Hãy dịch và phân tích câu/đoạn này giữa tiếng Nhật và tiếng Việt: "${cleanQuery}". Nếu có lỗi ngữ pháp hoặc diễn đạt chưa tự nhiên, hãy sửa lại và giải thích lý do.`;
    }

    // 10. Gọi AI Gemini xử lý
    const aiResponse = await askJapaneseTutor(fullPrompt, senderName);

    // 11. Gửi phản hồi lại cho học viên (kèm độ trễ mô phỏng gõ phím theo độ dài văn bản)
    await sendReply(api, message, aiResponse);
  } catch (error) {
    console.error("❌ [Handler Error] Lỗi khi xử lý tin nhắn:", error);
  }
}

/**
 * Gửi tin nhắn phản hồi, mô phỏng người thật gõ phím theo độ dài văn bản
 */
async function sendReply(api: API, message: Message, replyText: string): Promise<void> {
  // Mô phỏng độ trễ gõ phím theo độ dài văn bản (Dynamic Typing Delay)
  if (config.simulateTyping) {
    const charCount = replyText.length;
    // Thời gian gõ cơ bản = số ký tự * tốc độ (ms/ký tự)
    const baseDuration = charCount * config.typingSpeedMsPerChar;

    // Thêm dao động ngẫu nhiên (+/- 15%) để tạo cảm giác tự nhiên như người thật
    const jitter = (Math.random() * 0.3 - 0.15) * baseDuration;
    const calculatedDelay = Math.round(baseDuration + jitter);

    // Giới hạn trong khoảng [typingDelayMinMs, typingDelayMaxMs]
    const actualDelay = Math.max(
      config.typingDelayMinMs,
      Math.min(calculatedDelay, config.typingDelayMaxMs)
    );

    console.log(
      `✍️  [Typing Simulation] Độ dài tin nhắn: ${charCount} ký tự -> Mô phỏng gõ phím trong ${actualDelay}ms...`
    );

    // Giữ trạng thái "đang soạn tin..." liên tục trên Zalo cho đến khi hết thời gian delay
    const heartbeatMs = 3000;
    let remaining = actualDelay;
    while (remaining > 0) {
      try {
        await api.sendTypingEvent(message.threadId, message.type);
      } catch (err) {
        // Bỏ qua nếu lỗi socket typing
      }
      const sleepTime = Math.min(remaining, heartbeatMs);
      await sleep(sleepTime);
      remaining -= sleepTime;
    }
  }

  try {
    // Thử gửi dạng quote tin nhắn gốc
    await api.sendMessage(
      {
        msg: replyText,
        quote: {
          content: message.data.content,
          msgType: message.data.msgType,
          propertyExt: message.data.propertyExt,
          uidFrom: message.data.uidFrom,
          msgId: message.data.msgId,
          cliMsgId: message.data.cliMsgId,
          ts: message.data.ts,
          ttl: message.data.ttl,
        },
      },
      message.threadId,
      message.type
    );
    console.log(`✅ [Phản hồi thành công] Đã gửi câu trả lời tới ${message.threadId}`);
  } catch (quoteError) {
    console.warn("⚠️ [Quote Failed] Gửi tin dạng Quote thất bại, chuyển sang gửi tin nhắn thường:", quoteError);
    try {
      // Fallback gửi tin nhắn thường
      await api.sendMessage(replyText, message.threadId, message.type);
      console.log(`✅ [Phản hồi thành công (fallback)] Đã gửi câu trả lời thường tới ${message.threadId}`);
    } catch (fallbackError) {
      console.error("❌ [Send Failed] Không thể gửi tin nhắn phản hồi:", fallbackError);
    }
  }
}
