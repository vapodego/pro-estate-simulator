import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const GEMINI_MODEL = "gemini-3-flash-preview";
const truncate = (value: string, max = 500) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const summary = body?.summary;
    const messages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
    if (!summary || typeof summary !== "object") {
      return NextResponse.json({ error: "summaryが不正です。" }, { status: 400 });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEYが未設定です。" }, { status: 500 });
    }

    const conversationText =
      messages.length > 0
        ? messages
            .map((message) => `${message.role === "user" ? "ユーザー" : "AI"}: ${message.content}`)
            .join("\n")
        : "なし";

    const prompt = `
あなたは不動産投資のアドバイザーです。日本語で回答してください。
以下のサマリーに基づいて回答します。

【回答ルール】
- 形式の指定はありません。自由に書いてください。
- Markdownでの記述を許可します（箇条書きや見出しOK）。
- 会話履歴がある場合は「最後のユーザー質問」に答える
- 数値は推定である旨は不要、断定しすぎない

【サマリー(JSON)】
${JSON.stringify(summary, null, 2)}

【会話履歴】
${conversationText}
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return NextResponse.json(
        {
          error: "AIコメントの生成に失敗しました。",
          details: `Gemini ${geminiRes.status}: ${truncate(errorText)}`,
        },
        { status: 502 }
      );
    }

    const geminiJson = await geminiRes.json();
    const outputText =
      geminiJson?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";

    return NextResponse.json({ message: outputText.trim() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AIコメントに失敗しました。" },
      { status: 500 }
    );
  }
}
