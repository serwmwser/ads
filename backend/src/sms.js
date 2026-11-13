import { env } from './util.js';

export async function sendSms(phone, text) {
  const provider = env('SMS_PROVIDER', 'console').toLowerCase();
  if (provider === 'console') {
    console.log('[SMS dev] ' + phone + ': ' + text);
    return { ok: true, provider };
  }
  if (provider === 'smsru') {
    const url = 'https://sms.ru/sms/send?api_id=' + encodeURIComponent(env('SMS_API_KEY')) +
      '&to=' + encodeURIComponent(phone.replace('+', '')) +
      '&msg=' + encodeURIComponent(text) + '&json=1';
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK') throw new Error('SMS.ru: ' + JSON.stringify(json));
    return { ok: true, provider };
  }
  throw new Error('Неизвестный SMS_PROVIDER: ' + provider);
}
