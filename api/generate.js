export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 프론트엔드에서 넘겨주는 파라미터 수신
  const { location, weatherState, activityType, lat, lon } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  try {
    // 1. Open-Meteo API를 통한 정밀 기상 데이터 조회 (좌표가 없을 경우 기본 시/도 중심 좌표 매핑)
    let weatherDetailText = "기상 데이터 실시간 조회 중";
    
    // 주요 시/도 대표 위도/경도 기본값
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

      weatherDetailText = `기온: ${current.temperature_2m ?? '알 수 없음'}°C, 습도: ${current.relative_humidity_2m ?? '알 수 없음'}\%, 강수량: ${current.precipitation ?? 0}mm(강수확률 ${pop}\%), UV지수: ${current.uv_index ?? '알 수 없음'}`;
    }

    // 2. Gemini API 프롬프트 (JSON 반환 규격 지정)
    const prompt = `
당신은 야외활동 패션 코디 AI입니다.
아래 지역 실시간 기상 데이터와 사용자가 선택한 느낌/활동을 바탕으로 적절한 옷차림을 추천해 주세요.

[지역 및 기상 정보]
위치: ${location || '미정'}
실시간 기상 데이터: ${weatherDetailText}
사용자 체감 상태: ${weatherState || '없음'}
야외활동 목적: ${activityType || '일반 야외활동'}

[응답 규칙]
오직 아래의 JSON 포맷으로만 응답하세요. 다른 설명이나 마크다운 문법(```json 등)은 작성하지 마세요.

{
  "summary": "${location}의 실시간 기온, 습도 및 느낌 요약 (1-2문장)",
  "top": "추천 상의 단어 및 짧은 설명",
  "bottom": "추천 하의 단어 및 짧은 설명",
  "shoes": "추천 신발 단어 및 짧은 설명",
  "supplies": "필수 준비물 (단어 또는 문장)",
  "tip": "야외활동 시 유용한 쾌적 팁 (1-2문장)"
}
    `.trim();

    const response = await fetch(
      `[https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=$){apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: errorData.error?.message || 'Gemini API 호출 실패' });
    }

    const data = await response.json();
    let replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 백틱 및 json 레이블 제거 후 JSON 파싱
    replyText = replyText.replace(/```json/g, '').replace(/```/g, '').trim();
    const resultJson = JSON.parse(replyText);

    return res.status(200).json(resultJson);

  } catch (error) {
    return res.status(500).json({ error: '서버 에러가 발생했습니다: ' + error.message });
  }
}
