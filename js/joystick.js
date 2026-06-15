export class VirtualJoystick {
  constructor(baseEl, knobEl, { deadzone = 0.14, onChange } = {}) {
    this.baseEl = baseEl;
    this.knobEl = knobEl;
    this.deadzone = deadzone;
    this.onChange = onChange;
    this.active = false;
    this.touchId = null;
    this.value = { x: 0, y: 0 };
    this._mouseDown = false;

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    baseEl.addEventListener('touchstart', this._onTouchStart, { passive: false });
    baseEl.addEventListener('touchmove', this._onTouchMove, { passive: false });
    baseEl.addEventListener('touchend', this._onTouchEnd);
    baseEl.addEventListener('touchcancel', this._onTouchEnd);
    baseEl.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  get radius() {
    const r = this.baseEl.getBoundingClientRect();
    return Math.min(r.width, r.height) * 0.38;
  }

  _emit(nx, ny) {
    const mag = Math.hypot(nx, ny);
    if (mag < this.deadzone) {
      this.value = { x: 0, y: 0 };
      this.onChange(0, 0);
      return;
    }
    const scaled = (mag - this.deadzone) / (1 - this.deadzone);
    const ax = (nx / mag) * scaled;
    const ay = (ny / mag) * scaled;
    this.value = { x: ax, y: ay };
    this.onChange(ax, ay);
  }

  _updateFromClient(clientX, clientY) {
    const rect = this.baseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = this.radius;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this._emit(dx / maxR, dy / maxR);
  }

  reset() {
    this.active = false;
    this.touchId = null;
    this._mouseDown = false;
    this.knobEl.style.transform = 'translate(-50%, -50%)';
    this.value = { x: 0, y: 0 };
    this.onChange(0, 0);
  }

  _onTouchStart(e) {
    e.preventDefault();
    if (this.active) return;
    const t = e.changedTouches[0];
    this.active = true;
    this.touchId = t.identifier;
    this._updateFromClient(t.clientX, t.clientY);
  }

  _onTouchMove(e) {
    if (!this.active) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.touchId) {
        this._updateFromClient(t.clientX, t.clientY);
        break;
      }
    }
  }

  _onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.touchId) {
        e.preventDefault();
        this.reset();
        break;
      }
    }
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    this._mouseDown = true;
    this.active = true;
    this._updateFromClient(e.clientX, e.clientY);
  }

  _onMouseMove(e) {
    if (!this._mouseDown) return;
    this._updateFromClient(e.clientX, e.clientY);
  }

  _onMouseUp(e) {
    if (!this._mouseDown || e.button !== 0) return;
    this.reset();
  }
}
