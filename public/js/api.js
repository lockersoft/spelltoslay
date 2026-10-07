// Every JSON POST goes through here. The body is wrapped as
// {"z": base64url(JSON)} so the host's request-body filter (mod_security on
// DreamHost) never sees free text. The server unwraps it in sts_input_json().
export function encodeBody(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const z = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return JSON.stringify({ z });
}

export function postJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: encodeBody(payload),
  });
}
