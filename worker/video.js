// Pages assets may ignore Range; return explicit byte ranges for seekable MP4s.
export async function serveVideo(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return env.ASSETS.fetch(request);
  const headers = new Headers(request.headers);
  for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) headers.delete(name);
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers }));
  if (asset.status !== 200) return asset;
  const bytes = new Uint8Array(await asset.arrayBuffer());
  const total = bytes.byteLength;
  const responseHeaders = new Headers(asset.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.set('content-type', 'video/mp4');
  responseHeaders.set('accept-ranges', 'bytes');
  const ifRange = request.headers.get('if-range');
  const canRange = !ifRange || ifRange === asset.headers.get('etag') || ifRange === asset.headers.get('last-modified');
  const range = canRange && /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  let start = 0, end = total - 1, status = 200;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= total || start > end) {
      responseHeaders.set('content-range', `bytes */${total}`);
      return new Response(null, { status: 416, headers: responseHeaders });
    }
    status = 206;
    responseHeaders.set('content-range', `bytes ${start}-${end}/${total}`);
  }
  const body = bytes.subarray(start, end + 1);
  responseHeaders.set('content-length', String(body.byteLength));
  return new Response(request.method === 'HEAD' ? null : body, { status, headers: responseHeaders });
}
