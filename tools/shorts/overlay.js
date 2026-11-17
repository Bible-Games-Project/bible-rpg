// In-page part of a short (injected by record.mjs): the title, the
// captions that follow the narration word by word, name labels over the
// actors, the end card; and the director that runs a scene's cues and
// camera keys at each recorded frame. Everything is a function of the
// short's time t (seconds), so every frame comes out the same each run.
(() => {
  const css = `
  #short-root{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:'Pixelify Sans',sans-serif;color:#fff}
  #short-root .hook{position:absolute;left:6%;right:6%;top:11%;text-align:center;padding:18px 16px 20px;background:rgba(22,16,8,.82);border:3px solid #e8c467;border-radius:14px;box-shadow:0 6px 0 rgba(0,0,0,.35)}
  #short-root .hook small{display:block;font-size:22px;color:#e8c467;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
  #short-root .hook b{display:block;font-size:38px;line-height:1.12;font-weight:700}
  #short-root .ref{position:absolute;left:50%;top:9%;transform:translateX(-50%);font-size:20px;padding:6px 14px;background:rgba(22,16,8,.75);border:2px solid #e8c467;border-radius:10px;color:#f6e7b8;white-space:nowrap}
  #short-root .cap{position:absolute;left:5%;right:5%;top:63%;text-align:center;font-size:44px;font-weight:700;line-height:1.15;
    text-shadow:0 4px 0 #1a1208,3px 3px 0 #1a1208,-3px 3px 0 #1a1208,3px -3px 0 #1a1208,-3px -3px 0 #1a1208,0 0 14px rgba(0,0,0,.6)}
  #short-root .cap span{display:inline-block;margin:0 .14em}
  #short-root .cap span.on{color:#ffd84a;transform:scale(1.12)}
  #short-root .label{position:absolute;transform:translate(-50%,-100%);font-size:24px;font-weight:700;padding:4px 12px;background:#fff6dc;color:#3a2a12;border:3px solid #3a2a12;border-radius:10px;white-space:nowrap;box-shadow:0 4px 0 rgba(0,0,0,.3)}
  #short-root .end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:90px;text-align:center;
    background:linear-gradient(rgba(10,8,4,0) 70%,rgba(10,8,4,.85)),var(--bg) center/cover}
  #short-root .end .t{font-size:58px;font-weight:700;color:#ffe08a;text-shadow:0 5px 0 #3a2508,0 0 20px rgba(0,0,0,.6)}
  #short-root .end .s{font-size:26px;margin-top:14px;text-shadow:0 3px 0 #1a1208}
  #short-root .end .c{font-size:22px;margin-top:34px;padding:10px 20px;border:3px solid #e8c467;border-radius:12px;background:rgba(22,16,8,.8);color:#f6e7b8}
  `;
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  // ease out with a little overshoot (a pop)
  const pop = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

  window.SHORT = {
    init(cfg, words) {
      this.cfg = cfg;
      this.words = words.map((w) => ({ ...w, s: w.s + cfg.voiceAt, e: w.e + cfg.voiceAt }));
      // caption groups: a few words, broken after punctuation
      this.groups = [];
      let g = [];
      for (const w of this.words) {
        g.push(w);
        if (/[.,?!;:]$/.test(w.w) || g.length >= (cfg.groupWords || 3)) {
          this.groups.push(g);
          g = [];
        }
      }
      if (g.length) this.groups.push(g);
      const st = document.createElement('style');
      st.textContent = css;
      document.head.append(st);
      const root = document.createElement('div');
      root.id = 'short-root';
      root.innerHTML = `<div class="hook"><small>${cfg.kicker || 'Did you know?'}</small><b>${cfg.question}</b></div><div class="ref">${cfg.reference}</div><div class="cap"></div><div class="labels"></div>
        <div class="end" style="--bg:url('${cfg.endBg}')">${cfg.endTitle ? `<div class="t">${cfg.endTitle}</div>` : ""}<div class="s">${cfg.endSub}</div><div class="c">${cfg.endCall}</div></div>`;
      document.body.append(root);
      this.el = (s) => root.querySelector(s);
      this.labels = [];
      this.cap = '';
    },
    label(actor, text, at) {
      const d = document.createElement('div');
      d.className = 'label';
      d.textContent = text;
      this.el('.labels').append(d);
      this.labels.push({ actor, d, at });
    },
    frame(t, S) {
      const c = this.cfg;
      // the hook, then the reference
      const hook = this.el('.hook');
      const hi = ease((t - 0.05) / 0.35);
      const ho = ease((t - c.hookEnd) / 0.35);
      hook.style.opacity = String(hi * (1 - ho));
      hook.style.transform = `scale(${0.85 + 0.15 * pop((t - 0.05) / 0.45)})`;
      this.el('.ref').style.opacity = String(ease((t - c.hookEnd - 0.2) / 0.4) * (1 - ease((t - c.endAt) / 0.4)));
      // captions
      let html = '';
      for (let i = 0; i < this.groups.length; i++) {
        const g = this.groups[i];
        const next = this.groups[i + 1];
        const end = next ? next[0].s : g[g.length - 1].e + 0.5;
        if (t >= g[0].s - 0.05 && t < end) {
          html = g.map((w, k) => `<span class="${t >= w.s && t < (g[k + 1]?.s ?? end) ? 'on' : ''}">${w.w}</span>`).join('');
          break;
        }
      }
      if (t < c.hookEnd) html = ''; // the hook says it
      if (html !== this.cap) this.el('.cap').innerHTML = this.cap = html;
      // name labels over who they belong to
      const cam = S.cameras.main;
      const dpr = window.devicePixelRatio || 1;
      for (const l of this.labels) {
        const k = t - l.at;
        const a = l.actor;
        const sx = ((a.x - cam.worldView.x) * cam.zoom) / dpr;
        const sy = ((a.topY() - 8 - cam.worldView.y) * cam.zoom) / dpr;
        l.d.style.left = `${sx}px`;
        l.d.style.top = `${sy}px`;
        l.d.style.opacity = k < 0 ? '0' : String(Math.min(1, k / 0.12));
        l.d.style.transform = `translate(-50%,-100%) scale(${k < 0 ? 0 : 0.6 + 0.4 * pop(k / 0.3)})`;
      }
      // the end card
      const e = ease((t - c.endAt) / 0.5);
      const end = this.el('.end');
      end.style.opacity = String(e);
      end.style.backgroundSize = `100% 100%, auto ${(1.08 - 0.08 * ease((t - c.endAt) / 2.5)) * 100}%`;
      end.querySelector('.c').style.transform = `scale(${0.6 + 0.4 * pop((t - c.endAt - 0.4) / 0.5)})`;
      this.el('.labels').style.opacity = String(1 - e);
    },
  };

  /** Camera keys [t, x, y, zoom × the play zoom, 'cut'?]: eased between keys, a cut jumps. */
  window.SHORT_CAMERA = (S, keys, t, base) => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] <= t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    let x = a[1], y = a[2], z = a[3];
    if (b && b[4] !== 'cut' && t > a[0]) {
      const k = ease((t - a[0]) / (b[0] - a[0]));
      x += (b[1] - x) * k;
      y += (b[2] - y) * k;
      z += (b[3] - z) * k;
    }
    const cam = S.cameras.main;
    cam.stopFollow();
    cam.panEffect?.reset?.();
    S.setView(base * z);
    cam.centerOn(x, y);
  };
})();
