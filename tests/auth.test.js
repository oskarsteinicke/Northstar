// Sign-up / sign-in error handling.
// GoTrue reports failures as { code, error_code, msg } with no `error` property.
// The app used to test for `res.error`, so every failed signup looked like a
// success and fell through to a confusing "Invalid login credentials".
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js'];
const json = (status, obj) => Promise.resolve({
  ok: status < 400, status, json: () => Promise.resolve(obj),
});

function authSandbox(routes) {
  const sb = createSandbox({ files: FILES, fetch: routes });
  run(sb, `settings={}; curView='home'; init=function(){}; track=function(){};`);
  return sb;
}
const fill = (sb, f) => run(sb, `(function(){
  document.getElementById('auth-email').value=${JSON.stringify(f.email || '')};
  document.getElementById('auth-password').value=${JSON.stringify(f.password || '')};
  document.getElementById('auth-confirm').value=${JSON.stringify(f.confirm || '')};
  document.getElementById('auth-name').value=${JSON.stringify(f.name || '')};
})()`);
const errText = sb => sb._els['auth-error'].textContent;

module.exports = async function () {
  const r = createReporter('auth');

  r.section('signing up with an email that already exists');
  {
    const sb = authSandbox(url =>
      url.includes('/auth/v1/signup')
        ? json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
        : json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }));
    run(sb, "_authMode='signup';renderAuth()");
    fill(sb, { email: 'her@example.com', password: 'newpass123', confirm: 'newpass123', name: 'Ada' });
    await run(sb, 'submitAuth()');
    r.check('no bogus sign-in failure', !/invalid login credentials/i.test(errText(sb)), `(${errText(sb)})`);
    r.check('switched to sign in', run(sb, '_authMode') === 'signin');
    r.check('says the account exists', /sign in below/i.test(sb._els['auth-overlay'].innerHTML));
    r.check('keeps the email', sb._els['auth-overlay'].innerHTML.includes('her@example.com'));
    r.check('never attempts a doomed sign-in', !sb._fetches.some(f => f.url.includes('grant_type=password')));
  }

  r.section('other signup failures surface');
  for (const [body, expect] of [
    [{ code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters' }, /at least 6 characters/i],
    [{ code: 400, error_code: 'validation_failed', msg: 'Unable to validate email address' }, /validate email/i],
    [{ code: 429, error_code: 'over_request_rate_limit', msg: 'Email rate limit exceeded' }, /rate limit/i],
  ]) {
    const sb = authSandbox(url => url.includes('/auth/v1/signup') ? json(body.code, body) : json(200, {}));
    run(sb, "_authMode='signup';renderAuth()");
    fill(sb, { email: 'x@example.com', password: 'abcdef', confirm: 'abcdef', name: 'Ada' });
    await run(sb, 'submitAuth()');
    r.check(`shows "${body.error_code}"`, expect.test(errText(sb)), `(${errText(sb)})`);
    r.check('  no fall-through to sign-in', !sb._fetches.some(f => f.url.includes('grant_type=password')));
  }

  r.section('a genuine signup still works');
  {
    const ok = { access_token: 't', refresh_token: 'r', user: { id: 'U1' } };
    const sb = authSandbox(() => json(200, ok));
    run(sb, "_authMode='signup';renderAuth()");
    fill(sb, { email: 'new@example.com', password: 'goodpass1', confirm: 'goodpass1', name: 'Ada' });
    await run(sb, 'submitAuth()');
    r.check('signed in', !!sb.localStorage._d['hvi_session']);
    r.check('name stored', sb.localStorage._d['hvi_user_name'] === 'Ada');
    r.check('no error shown', errText(sb) === '', `(${errText(sb)})`);
  }

  r.section('wrong password reads like a human wrote it');
  {
    const sb = authSandbox(url => url.includes('grant_type=password')
      ? json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      : json(200, {}));
    run(sb, "_authMode='signin';renderAuth()");
    fill(sb, { email: 'her@example.com', password: 'wrongpass' });
    await run(sb, 'submitAuth()');
    r.check('names both possibilities', /don't match/i.test(errText(sb)) && /sign up/i.test(errText(sb)), `(${errText(sb)})`);
    r.check('not signed in', !sb.localStorage._d['hvi_session']);
    r.check('button re-enabled', sb._els['auth-btn'].disabled === false);
  }

  r.section('one-shot notices');
  {
    const sb = authSandbox(url => url.includes('/auth/v1/signup')
      ? json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
      : json(200, {}));
    run(sb, "_authMode='signup';renderAuth()");
    fill(sb, { email: 'her@example.com', password: 'goodpass1', confirm: 'goodpass1', name: 'Ada' });
    await run(sb, 'submitAuth()');
    r.check('notice shown', /sign in below/i.test(sb._els['auth-overlay'].innerHTML));
    run(sb, 'renderAuth()');
    r.check('gone next render', !/sign in below/i.test(sb._els['auth-overlay'].innerHTML));
    r.check('prefill cleared', !sb._els['auth-overlay'].innerHTML.includes('her@example.com'));
  }

  return r.finish();
};
