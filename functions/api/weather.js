import { json } from '../_shared/helpers.js';

export async function onRequestGet({ env, request }) {
  const amapKey = env.AMAP_KEY;
  if (!amapKey) {
    return json({ error: 'AMAP_KEY 未配置' }, 503, { 'Cache-Control': 'no-store' });
  }

  const ipUrl = new URL('https://restapi.amap.com/v3/ip');
  ipUrl.searchParams.set('key', amapKey);
  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip');
  if (clientIp) ipUrl.searchParams.set('ip', clientIp);

  const ipResponse = await fetch(ipUrl);
  if (!ipResponse.ok) {
    return json({ error: 'IP 定位服务响应异常' }, 502, { 'Cache-Control': 'no-store' });
  }

  const ipData = await ipResponse.json();
  if (ipData.status !== '1' || !ipData.adcode) {
    return json({ error: ipData.info || 'IP 定位失败' }, 502, { 'Cache-Control': 'no-store' });
  }

  const weatherUrl = new URL('https://restapi.amap.com/v3/weather/weatherInfo');
  weatherUrl.searchParams.set('key', amapKey);
  weatherUrl.searchParams.set('city', ipData.adcode);
  weatherUrl.searchParams.set('extensions', 'all');

  const weatherResponse = await fetch(weatherUrl);
  if (!weatherResponse.ok) {
    return json({ error: '天气服务响应异常' }, 502, { 'Cache-Control': 'no-store' });
  }

  const weatherData = await weatherResponse.json();
  const today = weatherData.forecasts?.[0]?.casts?.[0];
  if (weatherData.status !== '1' || !today) {
    return json({ error: weatherData.info || '天气数据为空' }, 502, { 'Cache-Control': 'no-store' });
  }

  return json({
    city: ipData.city || '',
    today: {
      dayweather: today.dayweather,
      nighttemp: today.nighttemp,
      daytemp: today.daytemp,
      daywind: today.daywind,
      daypower: today.daypower
    }
  }, 200, { 'Cache-Control': 'no-store' });
}
