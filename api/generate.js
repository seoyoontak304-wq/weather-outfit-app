export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { location, weatherState, activityType, lat, lon } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  try {
    // 1. Open-Meteo API 기상 데이터 조회
    let weatherDetailText = "기상 데이터 실시간 조회 중";
    
    const coordsMap = {
      '서울특별시': { lat: 37.5665, lon: 126.9780 },
      '경기도': { lat: 37.2636, lon: 127.0286 },
      '인천광역시': { lat: 37.4563, lon: 126.7052 },
      '강원특별자치도': { lat: 37.8854, lon: 127.7298 },
      '충청북도': { lat: 36.6372, lon: 127.4897 },
      '충청남도': { lat: 36.6588, lon: 126.6728 },
      '대전광역시': { lat: 36.3504, lon: 127.3845 },
      '세종특별자치시': { lat: 36.4800, lon: 127.2890 },
      '전북특별자치도': { lat: 35.8242, lon: 127.1480 },
      '전라남도': { lat: 34.8161, lon: 126.4629 },
      '광주광역시': { lat: 35.1595, lon: 126.8526 },
      '경상북도': { lat: 36.5760, lon: 128.5056 },
      '경상남도': { lat: 35.2383, lon: 128.6925 },
      '대구광역시': { lat: 35.8714, lon: 128.6014 },
      '울산광역시': { lat: 35.5384, lon: 129.3114 },
      '부산광역시': { lat: 35.1796, lon: 129.0756 },
      '제주특별자치도': { lat: 33.4996, lon: 126.5312 }
    };

    const targetLat = lat || (coordsMap[location]?.lat) || 37.5665;
    const targetLon = lon || (coordsMap[location]?.lon) || 126.9780;

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLon}&current=temperature_2m,relative_humidity_2m,precipitation,uv_index&hourly=precipitation_probability&forecast_days=1`;
    const weatherRes = await fetch(weatherUrl);

    if (weatherRes.ok) {
      const wData = await weatherRes.json();
      const current = wData.current || {};
      const pop = wData.hourly?.precipitation_probability?.[0] || 0;

      weatherDetailText = `기온: ${current.temperature_2m ?? '알 수 없음'}°C, 습도: ${current.relative_humidity_2m ?? '알 수 없음'}%, 강수량: ${current.precipitation ?? 0}mm(강수확률 ${pop}%), UV지수: ${current.uv_index ?? '알 수 없음'}`;
    }

    // 2. Gemini API 프롬프트
    const prompt = `
당신은 야외활동 패션 코디 AI입니다.
지역 실시간 기상 데이터와 사용자가 선택한 느낌/활동을 바탕으로 옷차림을 추천해 주세요.

[정보]
위치: ${location || '미정'}
기상 데이터: ${weatherDetailText}
사용자 체감 상태: ${weatherState || '없음'}
야외활동 목적: ${activityType || '일반 야외활동'}

[응답 규칙]
아래 JSON 구조에 맞추어 한국어로 작성하세요.
{
  "summary": "${location || '해당 지역'}의 실시간 날씨 및 체감 상태 요약 (1-2문장)",
  "top": "추천 상의 및 짧은 이유",
  "bottom": "추천 하의 및 짧은 이유",
  "shoes": "추천 신발 및 짧은 이유",
  "supplies": "필수 준비물",
  "tip": "야외활동 쾌적 팁 (1-2문장)"
}
    `.trim();

    // 3. Gemini API 호출 (Structured Outputs 설정 추가)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json" // 👈 순수 JSON만 반환하도록 강제
          }
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: errorData.error?.message || 'Gemini API 호출 실패' });
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!replyText) {
      return res.status(500).json({ error: 'AI 응답 데이터를 불러올 수 없습니다.' });
    }

    // 이미 순수 JSON이므로 안전하게 파싱
    const resultJson = JSON.parse(replyText);
    return res.status(200).json(resultJson);

  } catch (error) {
    return res.status(500).json({ error: '서버 처리 중 오류 발생: ' + error.message });
  }
}
