// Progress photos sync on their own, not inside the main document.
//
// They are the largest thing the app stores — up to 30 base64 JPEGs — and they
// change rarely, while sync runs on every launch and every visibility change.
// Carried inside `data` they were downloaded and re-uploaded every time.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js'];
const UID = 'u-1';
const PHOTO = { date: '2026-08-01T10:00:00.000Z', thumb: 'data:image/jpeg;base64,' + 'A'.repeat(4000), note: '' };

function sb(store, reply) {
  const calls = [];
  const s = createSandbox({
    files: FILES,
    store: Object.assign({
      hvi_session: JSON.stringify({
        access_token: 'tok', refresh_token: 'rt',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: UID },
      }),
    }, store || {}),
    fetch: (url, opts) => {
      calls.push({ url: String(url), opts: opts || {} });
      const body = typeof reply === 'function' ? reply(String(url), opts || {}) : (reply || []);
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    },
  });
  run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
          setSyncStatus=function(){}; _syncToast=function(){}; habits=[];
          lbSyncStats=undefined;`);
  s._calls = calls;
  return s;
}
const photoStore = n => JSON.stringify(Array.from({ length: n },
  (_, i) => Object.assign({}, PHOTO, { date: `2026-08-0${i + 1}T10:00:00.000Z` })));

module.exports = async function () {
  const r = createReporter('photos');

  r.section('photos are out of the main sync payload');
  {
    const s = sb({ hvi_progress_photos: photoStore(3), hvi_habits: '[]' });
    await run(s, 'cloudPush()');
    const push = s._calls.find(c => c.opts.method === 'POST' && c.url.includes('hvi_data'));
    r.check('a push happened', !!push);
    const body = JSON.parse(push.opts.body || '{}');
    r.check('the document carries no photos',
      !('hvi_progress_photos' in (body.data || {})),
      '(photos re-uploaded on every sync)');
    r.check('and the payload stays small', (push.opts.body || '').length < 4000,
      `(${(push.opts.body || '').length} bytes)`);
  }

  r.section('SYNC_KEYS no longer lists them');
  {
    const s = sb();
    r.check('not a synced key',
      run(s, `SYNC_KEYS.indexOf('hvi_progress_photos')`) === -1,
      '(back in the launch payload)');
  }

  r.section('photos push to their own column');
  {
    const s = sb({ hvi_progress_photos: photoStore(2) });
    const ok = await run(s, 'pushPhotos()');
    r.check('the push succeeds', ok === true);
    const put = s._calls.find(c => c.opts.method === 'POST');
    const body = JSON.parse(put.opts.body || '{}');
    r.check('written to the photos column', Array.isArray(body.photos) && body.photos.length === 2,
      `(${JSON.stringify(Object.keys(body))})`);
    r.check('and not into data', !('data' in body));
  }

  r.section('photos are pulled only when wanted');
  {
    const s = sb({}, () => [{ photos: JSON.parse(photoStore(2)) }]);
    r.check('nothing fetched yet', s._calls.length === 0);
    await run(s, 'pullPhotos()');
    const got = JSON.parse(run(s, `localStorage.getItem('hvi_progress_photos')`) || '[]');
    r.check('they arrive on request', got.length === 2);
    r.check('selecting only the photos column',
      s._calls.some(c => c.url.includes('select=photos')), `(${s._calls[0] && s._calls[0].url})`);

    const before = s._calls.length;
    await run(s, 'pullPhotos()');
    r.check('a second call in the same session is free', s._calls.length === before,
      '(re-fetched needlessly)');
  }

  r.section('a merge keeps both sides');
  {
    const local = JSON.parse(photoStore(2));
    const cloudOnly = Object.assign({}, PHOTO, { date: '2026-07-01T10:00:00.000Z' });
    const s = sb({ hvi_progress_photos: JSON.stringify(local) },
                 () => [{ photos: [cloudOnly] }]);
    await run(s, 'pullPhotos()');
    const got = JSON.parse(run(s, `localStorage.getItem('hvi_progress_photos')`) || '[]');
    r.check('nothing is dropped', got.length === 3, `(${got.length})`);
    r.check('newest first', got[0].date > got[got.length - 1].date);
  }

  // Anyone who synced before the split still has photos inside the document.
  r.section('photos synced under the old scheme are rescued');
  {
    const s = sb({});
    const legacy = JSON.parse(photoStore(2));
    run(s, `_rescueLegacyPhotos({ hvi_progress_photos: ${JSON.stringify(legacy)} })`);
    const got = JSON.parse(run(s, `localStorage.getItem('hvi_progress_photos')`) || '[]');
    r.check('lifted out of the old document', got.length === 2,
      '(photos would be lost when data is next written without them)');
    // The rescue deliberately does not await the push — it runs inside the sync
    // merge path and must not slow it down. Let the queue drain before asserting.
    await new Promise(res => setTimeout(res, 20));
    r.check('and pushed to the new column',
      s._calls.some(c => c.opts.method === 'POST'), '(rescued photos never reach the cloud)');
  }

  r.section('the rescue never overwrites a fuller local set');
  {
    const s = sb({ hvi_progress_photos: photoStore(5) });
    run(s, `_rescueLegacyPhotos({ hvi_progress_photos: ${photoStore(1)} })`);
    const got = JSON.parse(run(s, `localStorage.getItem('hvi_progress_photos')`) || '[]');
    r.check('local wins when it has more', got.length === 5, `(${got.length})`);
  }

  r.section('signed out, photos do nothing');
  {
    const s = sb({ hvi_session: '', hvi_progress_photos: photoStore(2) });
    const pushed = await run(s, 'pushPhotos()');
    const pulled = await run(s, 'pullPhotos()');
    r.check('no push', pushed === false);
    r.check('no pull', pulled === false);
    r.check('and no requests at all', s._calls.length === 0);
  }

  return r.finish();
};
