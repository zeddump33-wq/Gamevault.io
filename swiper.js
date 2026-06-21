class Swiper {
  constructor(el, onCardClick) {
    this._onCardClick = onCardClick;
    this.el = el;
    this.track = el.querySelector('.feat-track');
    this.viewport = el.querySelector('.feat-viewport');
    this.dotsWrap = document.getElementById('featDots');
    this.thumbsWrap = document.getElementById('featThumbs');
    this.progress = document.getElementById('featProgress');
    this.prevBtn = el.querySelector('.feat-prev');
    this.nextBtn = el.querySelector('.feat-next');
    this._idx = 0;
    this._total = 0;
    this._vw = 0;
    this._timer = null;
    this._draggable = null;
    this._swiped = false;
    this._bound = {};
    this._init();
  }

  _init() {
    this._total = this.track.children.length;
    if (this._total < 2) return this._single();
    this._vw = this.viewport.clientWidth;
    this._swiped = false;

    this._idx = [...this.track.children].findIndex(s => s.classList.contains('active'));
    if (this._idx < 0) this._idx = 0;

    gsap.set(this.track, { x: -this._idx * this._vw });

    if (this.dotsWrap) {
      this.dotsWrap.innerHTML = '';
      for (let i = 0; i < this._total; i++) {
        const d = document.createElement('button');
        d.className = 'feat-dot' + (i === this._idx ? ' active' : '');
        d.dataset.i = i;
        this.dotsWrap.appendChild(d);
      }
    }

    if (this.thumbsWrap) {
      const thumbs = this.track.querySelectorAll('.feat-slide');
      this.thumbsWrap.innerHTML = '';
      thumbs.forEach((sl, i) => {
        const firstImg = sl.querySelector('.feat-card-img img');
        const t = document.createElement('button');
        t.className = 'feat-thumb' + (i === this._idx ? ' active' : '');
        t.dataset.i = i;
        t.innerHTML = '<img src="' + (firstImg?.src || '') + '" alt="" loading="lazy">';
        this.thumbsWrap.appendChild(t);
      });
    }

    this._createDraggable();
    this._bind();
    this._start();
  }

  _single() {
    if (this.dotsWrap) this.dotsWrap.style.display = 'none';
    if (this.thumbsWrap) this.thumbsWrap.style.display = 'none';
    if (this.prevBtn) this.prevBtn.style.display = 'none';
    if (this.nextBtn) this.nextBtn.style.display = 'none';
  }

  _createDraggable() {
    const minX = -(this._total - 1) * this._vw;
    let vel = 0, lastX = 0, lastT = 0;

    this._draggable = Draggable.create(this.track, {
      type: 'x',
      edgeResistance: 0.85,
      bounds: { minX, maxX: 0 },
      onPress: () => {
        this._stop();
        this._swiped = false;
        vel = 0; lastX = 0; lastT = 0;
      },
      onDrag: () => {
        const now = performance.now();
        const dt = now - lastT;
        if (dt > 16 && lastX) {
          vel = (this._draggable.x - lastX) / dt;
        }
        lastX = this._draggable.x;
        lastT = now;
      },
      onRelease: () => {
        const x = this._draggable.x;
        const vw = this._vw;
        let targetIdx = Math.round(-x / vw);
        const absVel = Math.abs(vel);
        if (absVel > 0.25) {
          const mom = Math.min(Math.round(absVel * 300 / vw), 2);
          targetIdx += vel < 0 ? mom : -mom;
        }
        targetIdx = Math.max(0, Math.min(this._total - 1, targetIdx));
        const targetX = -targetIdx * vw;
        if (targetIdx !== this._idx) this._swiped = true;
        this._idx = targetIdx;
        gsap.to(this.track, {
          x: targetX,
          duration: Math.min(0.25 + absVel * 40, 0.5),
          ease: 'power2.out',
          overwrite: true,
          onComplete: () => {
            this._updateUI();
            this._resetProgress();
            this._start();
          }
        });
      }
    })[0];
  }

  _bind() {
    this._bound._click = e => {
      const btn = e.target.closest('.feat-arrow, .feat-dot, .feat-thumb');
      if (btn) {
        this._stop();
        if (btn.classList.contains('feat-prev')) this._prev();
        else if (btn.classList.contains('feat-next')) this._next();
        else this._go(+btn.dataset.i);
        this._start();
        return;
      }
      if (this._swiped) { this._swiped = false; return; }
      const card = e.target.closest('.feat-card');
      if (!card) return;
      if (this._onCardClick) this._onCardClick(card);
    };

    this._bound._key = e => {
      const sec = document.getElementById('featuredSection');
      if (!sec?.classList.contains('show')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      this._stop();
      if (e.key === 'ArrowLeft') this._prev();
      else this._next();
      this._start();
    };

    this._bound._mouseEnter = () => this._stop();
    this._bound._mouseLeave = () => this._start();

    this._bound._updateVw = () => {
      const w = this.viewport.clientWidth;
      if (w && w !== this._vw) {
        this._vw = w;
        if (this._draggable) this._draggable.kill();
        this._createDraggable();
        gsap.set(this.track, { x: -this._idx * this._vw });
      }
    };

    this.el.addEventListener('click', this._bound._click);
    this.track.addEventListener('mouseenter', this._bound._mouseEnter);
    this.track.addEventListener('mouseleave', this._bound._mouseLeave);
    document.addEventListener('keydown', this._bound._key);
    window.addEventListener('resize', this._bound._updateVw);
    this.track.addEventListener('dragstart', e => e.preventDefault());
  }

  _go(idx, animate = true) {
    idx = ((idx % this._total) + this._total) % this._total;
    if (idx === this._idx && animate) return;
    this._stop();
    this._idx = idx;
    const targetX = -idx * this._vw;
    if (animate) {
      gsap.to(this.track, {
        x: targetX,
        duration: 0.45,
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => {
          this._updateUI();
          this._resetProgress();
        }
      });
    } else {
      gsap.set(this.track, { x: targetX });
      this._updateUI();
    }
  }

  _prev() { this._go((this._idx - 1 + this._total) % this._total); }
  _next() { this._go((this._idx + 1) % this._total); }

  _updateUI() {
    const idx = this._idx;
    const sl = this.track.children;
    for (let i = 0; i < sl.length; i++) sl[i].classList.toggle('active', i === idx);
    if (this.dotsWrap) {
      const dots = this.dotsWrap.children;
      for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('active', +dots[i].dataset.i === idx);
    }
    if (this.thumbsWrap) {
      const th = this.thumbsWrap.children;
      for (let i = 0; i < th.length; i++) th[i].classList.toggle('active', +th[i].dataset.i === idx);
    }
    const pct = this._total > 1 ? idx / (this._total - 1) : 0;
    this.el.style.setProperty('--fp-x', 30 + pct * 40 + '%');
    this.el.style.setProperty('--fp-y', 30 + (1 - pct) * 20 + '%');
  }

  _start() {
    this._stop();
    if (this._total < 2) return;
    this._resetProgress();
    this._timer = setInterval(() => {
      const next = (this._idx + 1) % this._total;
      if (next === this._idx) return;
      this._go(next);
    }, 5000);
  }

  _stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _resetProgress() {
    if (!this.progress) return;
    this.progress.style.transition = 'none';
    this.progress.style.width = '0%';
    void this.progress.offsetWidth;
    this.progress.style.transition = 'width 5000ms linear';
    this.progress.style.width = '100%';
  }

  destroy() {
    this._stop();
    if (this._draggable) this._draggable.kill();
    this.el.removeEventListener('click', this._bound._click);
    this.track.removeEventListener('mouseenter', this._bound._mouseEnter);
    this.track.removeEventListener('mouseleave', this._bound._mouseLeave);
    document.removeEventListener('keydown', this._bound._key);
    window.removeEventListener('resize', this._bound._updateVw);
  }
}
