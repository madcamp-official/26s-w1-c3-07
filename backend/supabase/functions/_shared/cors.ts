// 프론트엔드(브라우저)에서 직접 호출하므로 CORS 프리플라이트(OPTIONS) 응답에 필요한 공통 헤더.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
