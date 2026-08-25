// Imported data: date attribution, units, and the sync paths actually running.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','integrations.js'];

function sb(store, opts) {
  const s = createSandbox({ files: FILES, store, fetch: (opts||{}).fetch });
  run(s, `
    settings=${JSON.stringify((opts||{}).settings || { units: 'metric' })};
    curView='home'; track=function(){}; go=function(){};
    weightLog=JSON.parse(localStorage.getItem('hvi_weight_log')||'{}');
    sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
  `);
  return s;
}

module.exports = async function () {
  const r = createReporter('integrations');

  r.section('imported weights land in the user\'s unit');
  {
    const metric = sb({}, { settings: { units: 'metric' } });
    r.check('metric keeps kilograms', run(metric, '_kgToDisplayWeight(80)') === 80,
      `(${run(metric, '_kgToDisplayWeight(80)')})`);

    const imperial = sb({}, { settings: { units: 'imperial' } });
    const lbs = run(imperial, '_kgToDisplayWeight(80)');
    r.check('imperial converts to pounds', Math.abs(lbs - 176.4) < 0.2, `(${lbs})`);
    r.check('80 kg is no longer shown as 80 lbs', lbs !== 80);

    r.check('rubbish input is rejected', run(imperial, '_kgToDisplayWeight(undefined)') === null);
    r.check('non-numeric rejected', run(imperial, '_kgToDisplayWeight("abc")') === null);
  }

  // A bulk rename once produced `const dateKey = dateKey(...)`, which throws a
  // temporal-dead-zone ReferenceError the moment a sync runs.
  r.section('sync paths run without a scope collision');
  {
    const now = Date.now();
    const gfit = (url) => {
      if (url.includes('sessions')) return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ session: [{
          activityType: 8, name: 'Evening Run',
          startTimeMillis: String(now - 3600000), endTimeMillis: String(now),
        }] }) });
      if (url.includes('dataset') || url.includes('dataSources')) return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ point: [{
          startTimeNanos: String((now - 86400000) * 1e6), value: [{ fpVal: 80 }],
        }] }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    const s = sb({ hvi_integrations: JSON.stringify({ googlefit: { access_token: 't', expires_at: now + 1e7 } }) },
      { settings: { units: 'imperial' }, fetch: gfit });
    run(s, `_authedFetch=function(svc,url){ return fetch(url); };`);
    let threw = null;
    try { await run(s, '_syncGoogleFit()'); } catch (e) { threw = e.message; }
    r.check('google fit sync does not throw', !threw, `(${threw})`);

    const wl = JSON.parse(s.localStorage._d['hvi_weight_log'] || '{}');
    const vals = Object.values(wl);
    r.check('weight imported', vals.length > 0, '(nothing imported)');
    r.check('imported weight converted for imperial',
      vals.length > 0 && Math.abs(vals[0] - 176.4) < 0.2, `(${vals[0]})`);
  }

  r.section('imported days use local dates, not UTC');
  {
    const s = sb({});
    // 23:30 local must file under today, not tomorrow
    const key = run(s, `(function(){ var d=new Date(); d.setHours(23,30,0,0); return dateKey(d); })()`);
    const expect = run(s, `(function(){ var d=new Date(); d.setHours(23,30,0,0); return d.toLocaleDateString('en-CA'); })()`);
    r.check('late-evening activity keeps the local day', key === expect, `(${key} vs ${expect})`);
    r.check('dateKey accepts a timestamp too',
      run(s, `dateKey(new Date(Date.now())) === today()`) === true);
  }

  r.section('the global date helper is not shadowed anywhere it is called');
  {
    const s = sb({});
    r.check('dateKey is the shared helper', run(s, 'typeof dateKey') === 'function');
    r.check('still correct after integrations loads', run(s, 'dateKey(new Date()) === today()') === true);
  }

  return r.finish();
};
