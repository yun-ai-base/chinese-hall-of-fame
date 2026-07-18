export class StateMachine {
  static MAX_HISTORY = 20;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      level: 'universe',
      centerId: 'china',
      history: [],
    };
  }

  get level() { return this.state.level; }
  get centerId() { return this.state.centerId; }
  get canGoBack() { return this.state.history.length > 0; }

  navigateTo(level, centerId) {
    this.state.history.push({
      level: this.state.level,
      centerId: this.state.centerId,
    });

    // 历史栈上限
    if (this.state.history.length > StateMachine.MAX_HISTORY) {
      this.state.history.shift();
    }

    this.state.level = level;
    this.state.centerId = centerId;
  }

  goBack() {
    if (!this.canGoBack) return null;
    const prev = this.state.history.pop();
    this.state.level = prev.level;
    this.state.centerId = prev.centerId;
    return prev;
  }

  canNavigateTo(targetLevel) {
    const levels = ['universe', 'dimension', 'figure', 'relation'];
    const currentIdx = levels.indexOf(this.state.level);
    const targetIdx = levels.indexOf(targetLevel);
    if (currentIdx >= 2 && targetIdx > currentIdx) return false;
    return true;
  }
}
