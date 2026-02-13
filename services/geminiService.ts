
/**
 * Gets the active API key from localStorage or process.env.API_KEY.
 */
const getApiKey = () => {
  return localStorage.getItem('edulog_api_key') || process.env.API_KEY || "";
};

/**
 * OpenRouter API를 사용하여 학생 기록을 다듬습니다.
 * 구글 직통 API의 할당량 제한(429)을 피하기 위해 중계 서비스를 이용합니다.
 */
export const polishRecord = async (
  rawText: string,
  onStatusUpdate?: (status: string) => void,
  retryCount = 0
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "설정(⚙️)에서 OpenRouter API 키를 먼저 입력해주세요.";

  const maxRetries = 3; 
  const model = "google/gemini-2.0-flash-001"; 

  try {
    if (onStatusUpdate) {
      onStatusUpdate(retryCount === 0 ? "AI 분석 시작..." : `재시도 중 (${retryCount}/${maxRetries})...`);
    }

    // OpenRouter API 호출
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "EduLog Teacher Assistant"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "당신은 한국의 고등학교 교사입니다. 입력되는 학생의 활동 메모를 학교생활기록부 기재 요령에 맞게 전문적인 '~함' 문체로 다듬어주세요. 결과만 출력하고 부연 설명은 하지 마세요."
          },
          {
            role: "user",
            content: rawText.trim().substring(0, 1000)
          }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const result = data.choices[0]?.message?.content?.trim();
    
    if (!result) throw new Error("EMPTY_RESPONSE");
    
    return result;

  } catch (error: any) {
    console.warn(`[OpenRouter Attempt ${retryCount}] Error:`, error.message);

    if (retryCount < maxRetries) {
      if (onStatusUpdate) onStatusUpdate(`연결 재시도 중...`);
      await new Promise(res => setTimeout(res, 2000));
      return polishRecord(rawText, onStatusUpdate, retryCount + 1);
    }

    if (error.message.includes("401") || error.message.includes("key")) {
      return "API 키가 유효하지 않거나 크레딧이 부족합니다. 설정을 확인해 주세요.";
    }
    
    return `AI 변환 오류: ${error.message}. 잠시 후 다시 시도해 주세요.`;
  }
};
