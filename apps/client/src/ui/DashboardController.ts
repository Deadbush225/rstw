import {
  DEFAULT_HERO_ID,
  HEROES,
  HERO_IDS,
  type HeroId,
  type MatchMode,
} from '@signal-zero/shared';

export type DashboardRoute = 'home' | 'responders' | 'how-to-play' | 'settings';
export type RequestedMode = 'solo' | 'multiplayer';
export type UiScale = 'compact' | 'default' | 'large';

export interface DashboardDeployment {
  name: string;
  /** Human-facing menu choice retained for analytics and future queue presentation. */
  requestedMode: RequestedMode;
  /** Authoritative room contract sent to the server. */
  mode: MatchMode;
  heroId: HeroId;
}

export interface DashboardPreferences {
  masterSound: boolean;
  masterVolume: number;
  reducedMotion: boolean;
  uiScale: UiScale;
  cameraSensitivity: number;
}

export interface DashboardControllerOptions {
  onDeploy(deployment: DashboardDeployment): Promise<void> | void;
  onReturnToDashboard?(): Promise<void> | void;
  onPreferencesChanged?(preferences: DashboardPreferences): void;
}

interface ResponderVisual {
  color: string;
  tint: string;
}

const PREFERENCES_KEY = 'signal-zero:dashboard-preferences';
const PLAYER_NAME_KEY = 'signal-zero:name';

export const DASHBOARD_PREFERENCES_EVENT = 'signal-zero:preferences-changed';

const DEFAULT_PREFERENCES: DashboardPreferences = {
  masterSound: true,
  masterVolume: 0.75,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  uiScale: 'default',
  cameraSensitivity: 1,
};

const RESPONDER_VISUALS: Record<HeroId, ResponderVisual> = {
  maya: { color: '#76dfef', tint: 'rgba(57, 170, 190, 0.2)' },
  tomas: { color: '#ffc964', tint: 'rgba(214, 146, 62, 0.19)' },
  kidlat: { color: '#9ae985', tint: 'rgba(95, 190, 116, 0.18)' },
  amihan: { color: '#c4a7ff', tint: 'rgba(146, 112, 214, 0.18)' },
};

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required dashboard element #${id} was not found.`);
  return element as T;
}

function isUiScale(value: unknown): value is UiScale {
  return value === 'compact' || value === 'default' || value === 'large';
}

function loadPreferences(): DashboardPreferences {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES;
    const saved = parsed as Partial<DashboardPreferences>;
    return {
      masterSound:
        typeof saved.masterSound === 'boolean'
          ? saved.masterSound
          : DEFAULT_PREFERENCES.masterSound,
      masterVolume:
        typeof saved.masterVolume === 'number' &&
        Number.isFinite(saved.masterVolume) &&
        saved.masterVolume >= 0 &&
        saved.masterVolume <= 1
          ? saved.masterVolume
          : DEFAULT_PREFERENCES.masterVolume,
      reducedMotion:
        typeof saved.reducedMotion === 'boolean'
          ? saved.reducedMotion
          : DEFAULT_PREFERENCES.reducedMotion,
      uiScale: isUiScale(saved.uiScale) ? saved.uiScale : DEFAULT_PREFERENCES.uiScale,
      cameraSensitivity:
        typeof saved.cameraSensitivity === 'number' &&
        Number.isFinite(saved.cameraSensitivity) &&
        saved.cameraSensitivity >= 0.5 &&
        saved.cameraSensitivity <= 1.5
          ? saved.cameraSensitivity
          : DEFAULT_PREFERENCES.cameraSensitivity,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function modeFromRequest(requestedMode: RequestedMode): MatchMode {
  return requestedMode === 'solo' ? 'flood-drill' : 'versus';
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

export class DashboardController {
  private readonly bootScreen = requiredElement<HTMLElement>('boot-screen');
  private readonly bootStatus = requiredElement<HTMLElement>('boot-status');
  private readonly bootProgressFill = requiredElement<HTMLElement>('boot-progress-fill');
  private readonly bootProgressLabel = requiredElement<HTMLElement>('boot-progress-label');
  private readonly bootSkip = requiredElement<HTMLButtonElement>('boot-skip');
  private readonly dashboard = requiredElement<HTMLElement>('dashboard-shell');
  private readonly gameShell = requiredElement<HTMLElement>('game-shell');
  private readonly playerLabel = requiredElement<HTMLElement>('dashboard-player-label');
  private readonly playButton = requiredElement<HTMLButtonElement>('dashboard-play-button');
  private readonly rosterCards = requiredElement<HTMLElement>('dashboard-roster-cards');
  private readonly deploymentModal = requiredElement<HTMLElement>('deployment-modal');
  private readonly deploymentClose = requiredElement<HTMLButtonElement>('deployment-close');
  private readonly deploymentBack = requiredElement<HTMLButtonElement>('deployment-back');
  private readonly deploymentConfirm = requiredElement<HTMLButtonElement>('deployment-confirm');
  private readonly deploymentName = requiredElement<HTMLInputElement>('deployment-player-name');
  private readonly deploymentRoster = requiredElement<HTMLElement>('deployment-roster');
  private readonly deploymentSummary = requiredElement<HTMLElement>('deployment-summary');
  private readonly deploymentError = requiredElement<HTMLElement>('deployment-error');
  private readonly modeRules = requiredElement<HTMLElement>('mode-rules');
  private readonly soundSetting = requiredElement<HTMLInputElement>('setting-master-sound');
  private readonly volumeSetting = requiredElement<HTMLInputElement>('setting-master-volume');
  private readonly volumeValue = requiredElement<HTMLOutputElement>('master-volume-value');
  private readonly reducedMotionSetting =
    requiredElement<HTMLInputElement>('setting-reduced-motion');
  private readonly sensitivitySetting = requiredElement<HTMLInputElement>(
    'setting-camera-sensitivity',
  );
  private readonly sensitivityValue = requiredElement<HTMLOutputElement>(
    'camera-sensitivity-value',
  );

  private preferences = loadPreferences();
  private selectedMode: RequestedMode = 'solo';
  private selectedHeroId: HeroId = DEFAULT_HERO_ID;
  private lastFocusedBeforeModal: HTMLElement | null = null;
  private bootTimeouts: number[] = [];
  private bootComplete = false;
  private bootFailed = false;

  constructor(private readonly options: DashboardControllerOptions) {
    this.renderResponderCards();
    this.bindNavigation();
    this.bindDeployment();
    this.bindSettings();
    this.bindReturnButtons();
    this.bindBootControls();
    this.hydrateLocalState();
    this.applyPreferences();
    this.startBootSequence();
  }

  get currentPreferences(): Readonly<DashboardPreferences> {
    return this.preferences;
  }

  get currentDeployment(): DashboardDeployment {
    return {
      name: this.deploymentName.value.trim(),
      requestedMode: this.selectedMode,
      mode: modeFromRequest(this.selectedMode),
      heroId: this.selectedHeroId,
    };
  }

  showDashboard(): void {
    this.gameShell.hidden = true;
    this.dashboard.hidden = false;
    this.dashboard.classList.add('is-ready');
    this.closeDeployment();
    this.navigate('home');
    const playButton = this.playButton;
    window.requestAnimationFrame(() => playButton.focus());
  }

  showGame(): void {
    this.closeDeployment();
    this.dashboard.classList.remove('is-ready');
    this.dashboard.hidden = true;
    this.gameShell.hidden = false;
    window.dispatchEvent(new Event('resize'));
  }

  destroy(): void {
    this.clearBootTimeouts();
  }

  reportBootFailure(message: string): void {
    if (this.bootComplete) return;
    this.bootFailed = true;
    this.clearBootTimeouts();
    this.bootScreen.dataset.state = 'failed';
    this.bootProgressFill.style.width = '100%';
    this.bootProgressLabel.textContent = 'STARTUP ERROR';
    this.bootStatus.textContent = message;
    this.bootSkip.textContent = 'Retry startup';
  }

  private startBootSequence(): void {
    const stages = [
      { progress: 18, status: 'Starting response network…' },
      { progress: 46, status: 'Checking district simulation…' },
      { progress: 74, status: 'Calibrating responder systems…' },
      { progress: 100, status: 'Command center ready.' },
    ] as const;
    const interval = this.preferences.reducedMotion ? 35 : 320;

    stages.forEach((stage, index) => {
      const timeout = window.setTimeout(() => {
        if (this.bootComplete || this.bootFailed) return;
        this.bootProgressFill.style.width = `${stage.progress}%`;
        this.bootProgressLabel.textContent = `${stage.progress}%`;
        this.bootStatus.textContent = stage.status;
        if (stage.progress === 100) this.finishBoot(interval);
      }, interval * index);
      this.bootTimeouts.push(timeout);
    });
  }

  private finishBoot(interval: number): void {
    if (this.bootComplete || this.bootFailed) return;
    this.bootComplete = true;
    this.clearBootTimeouts();
    this.bootProgressFill.style.width = '100%';
    this.bootProgressLabel.textContent = '100%';
    this.bootStatus.textContent = 'Command center ready.';
    const revealTimeout = window.setTimeout(
      () => {
        this.dashboard.hidden = false;
        window.requestAnimationFrame(() => this.dashboard.classList.add('is-ready'));
        this.bootScreen.classList.add('is-leaving');
        const hideTimeout = window.setTimeout(
          () => {
            this.bootScreen.hidden = true;
            this.playButton.focus();
          },
          this.preferences.reducedMotion ? 10 : 430,
        );
        this.bootTimeouts.push(hideTimeout);
      },
      Math.max(80, interval),
    );
    this.bootTimeouts.push(revealTimeout);
  }

  private bindBootControls(): void {
    this.bootSkip.addEventListener('click', () => {
      if (this.bootFailed) {
        window.location.reload();
        return;
      }
      this.finishBoot(0);
    });
  }

  private clearBootTimeouts(): void {
    for (const timeout of this.bootTimeouts) window.clearTimeout(timeout);
    this.bootTimeouts = [];
  }

  private bindNavigation(): void {
    for (const routeControl of document.querySelectorAll<HTMLElement>('[data-dashboard-route]')) {
      routeControl.addEventListener('click', (event) => {
        event.preventDefault();
        const route = routeControl.dataset.dashboardRoute;
        if (
          route === 'home' ||
          route === 'responders' ||
          route === 'how-to-play' ||
          route === 'settings'
        ) {
          this.navigate(route);
        }
      });
    }

    this.playButton.addEventListener('click', () => this.openDeployment());
    for (const quickMode of document.querySelectorAll<HTMLButtonElement>('[data-quick-mode]')) {
      quickMode.addEventListener('click', () => {
        this.selectMode(quickMode.dataset.quickMode === 'multiplayer' ? 'multiplayer' : 'solo');
        this.openDeployment();
      });
    }
  }

  private navigate(route: DashboardRoute): void {
    for (const view of document.querySelectorAll<HTMLElement>('[data-dashboard-view]')) {
      view.hidden = view.dataset.dashboardView !== route;
    }
    for (const navigationItem of document.querySelectorAll<HTMLElement>(
      '.dashboard-nav [data-dashboard-route]',
    )) {
      const active = navigationItem.dataset.dashboardRoute === route;
      navigationItem.classList.toggle('is-active', active);
      if (active) navigationItem.setAttribute('aria-current', 'page');
      else navigationItem.removeAttribute('aria-current');
    }

    const content = requiredElement<HTMLElement>('dashboard-content');
    content.scrollTo({ top: 0, behavior: this.preferences.reducedMotion ? 'auto' : 'smooth' });
    window.history.replaceState(null, '', `#dashboard-${route}`);
  }

  private bindDeployment(): void {
    this.deploymentClose.addEventListener('click', () => this.closeDeployment());
    this.deploymentBack.addEventListener('click', () => this.closeDeployment());
    this.deploymentModal.addEventListener('pointerdown', (event) => {
      if (event.target === this.deploymentModal) this.closeDeployment();
    });
    this.deploymentModal.addEventListener('keydown', (event) => this.handleModalKeydown(event));
    this.deploymentConfirm.addEventListener('click', () => void this.confirmDeployment());
    this.deploymentName.addEventListener('input', () => {
      this.deploymentError.textContent = '';
      this.updatePlayerIdentity();
    });
    this.deploymentName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.confirmDeployment();
      }
    });

    for (const modeButton of document.querySelectorAll<HTMLButtonElement>(
      '[data-deployment-mode]',
    )) {
      modeButton.addEventListener('click', () => {
        this.selectMode(
          modeButton.dataset.deploymentMode === 'multiplayer' ? 'multiplayer' : 'solo',
        );
      });
    }
  }

  private openDeployment(): void {
    this.lastFocusedBeforeModal =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.deploymentModal.hidden = false;
    this.deploymentError.textContent = '';
    this.updateDeploymentSummary();
    window.requestAnimationFrame(() => this.deploymentName.focus());
  }

  private closeDeployment(): void {
    if (this.deploymentModal.hidden) return;
    this.deploymentModal.hidden = true;
    this.deploymentError.textContent = '';
    this.setDeployBusy(false);
    this.lastFocusedBeforeModal?.focus();
    this.lastFocusedBeforeModal = null;
  }

  private selectMode(mode: RequestedMode): void {
    this.selectedMode = mode;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-deployment-mode]')) {
      const selected = button.dataset.deploymentMode === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.modeRules.textContent =
      mode === 'solo'
        ? 'Complete Relay → Core → Beacon before 90 seconds. Pump activation adds score and delays the flood.'
        : 'Both sides race for the same Relay. Secure your team Core and make the first legal deposit at your own Beacon.';
    this.updateDeploymentSummary();
  }

  private selectHero(heroId: HeroId): void {
    this.selectedHeroId = heroId;
    for (const card of this.deploymentRoster.querySelectorAll<HTMLButtonElement>(
      '[data-hero-id]',
    )) {
      const selected = card.dataset.heroId === heroId;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-checked', String(selected));
      card.tabIndex = selected ? 0 : -1;
    }
    this.updateDeploymentSummary();
  }

  private async confirmDeployment(): Promise<void> {
    const deployment = this.currentDeployment;
    if (!deployment.name) {
      this.deploymentError.textContent = 'Enter a responder call sign before deploying.';
      this.deploymentName.focus();
      return;
    }

    this.deploymentError.textContent = '';
    this.setDeployBusy(true);
    sessionStorage.setItem(PLAYER_NAME_KEY, deployment.name);
    this.playerLabel.textContent = deployment.name;
    try {
      await this.options.onDeploy(deployment);
      this.showGame();
    } catch (error) {
      this.deploymentError.textContent =
        error instanceof Error ? error.message : 'Deployment could not start. Try again.';
      this.setDeployBusy(false);
    }
  }

  private setDeployBusy(busy: boolean): void {
    this.deploymentConfirm.disabled = busy;
    this.deploymentConfirm.querySelector('span')!.textContent = busy ? 'Connecting…' : 'Deploy';
    this.deploymentClose.disabled = busy;
    this.deploymentBack.disabled = busy;
  }

  private updateDeploymentSummary(): void {
    const mode = this.selectedMode === 'solo' ? 'Solo' : 'Versus';
    this.deploymentSummary.textContent = `${mode} · ${HEROES[this.selectedHeroId].name}`;
  }

  private updatePlayerIdentity(): void {
    const name = this.deploymentName.value.trim();
    this.playerLabel.textContent = name || 'Responder';
  }

  private handleModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDeployment();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(this.deploymentModal);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  private bindSettings(): void {
    this.soundSetting.addEventListener('change', () => {
      this.preferences = { ...this.preferences, masterSound: this.soundSetting.checked };
      this.applyPreferences();
    });
    this.volumeSetting.addEventListener('input', () => {
      this.preferences = {
        ...this.preferences,
        masterVolume: Number(this.volumeSetting.value) / 100,
      };
      this.applyPreferences();
    });
    this.reducedMotionSetting.addEventListener('change', () => {
      this.preferences = {
        ...this.preferences,
        reducedMotion: this.reducedMotionSetting.checked,
      };
      this.applyPreferences();
    });
    for (const scaleSetting of document.querySelectorAll<HTMLInputElement>('[name="ui-scale"]')) {
      scaleSetting.addEventListener('change', () => {
        if (!scaleSetting.checked || !isUiScale(scaleSetting.value)) return;
        this.preferences = { ...this.preferences, uiScale: scaleSetting.value };
        this.applyPreferences();
      });
    }
    this.sensitivitySetting.addEventListener('input', () => {
      this.preferences = {
        ...this.preferences,
        cameraSensitivity: Number(this.sensitivitySetting.value) / 100,
      };
      this.applyPreferences();
    });
  }

  private applyPreferences(notify = true): void {
    document.documentElement.dataset.uiScale = this.preferences.uiScale;
    document.documentElement.dataset.reducedMotion = String(this.preferences.reducedMotion);
    this.soundSetting.checked = this.preferences.masterSound;
    this.updateSwitchLabel(this.soundSetting, this.preferences.masterSound);
    this.volumeSetting.value = String(Math.round(this.preferences.masterVolume * 100));
    this.volumeValue.value = `${Math.round(this.preferences.masterVolume * 100)}%`;
    this.reducedMotionSetting.checked = this.preferences.reducedMotion;
    this.updateSwitchLabel(this.reducedMotionSetting, this.preferences.reducedMotion);
    const selectedScale = document.querySelector<HTMLInputElement>(
      `[name="ui-scale"][value="${this.preferences.uiScale}"]`,
    );
    if (selectedScale) selectedScale.checked = true;
    this.sensitivitySetting.value = String(Math.round(this.preferences.cameraSensitivity * 100));
    this.sensitivityValue.value = `${Math.round(this.preferences.cameraSensitivity * 100)}%`;
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));

    if (notify) {
      this.options.onPreferencesChanged?.({ ...this.preferences });
      window.dispatchEvent(
        new CustomEvent<DashboardPreferences>(DASHBOARD_PREFERENCES_EVENT, {
          detail: { ...this.preferences },
        }),
      );
    }
  }

  private updateSwitchLabel(input: HTMLInputElement, checked: boolean): void {
    const label = input.closest<HTMLLabelElement>('.switch-control');
    const status = label?.querySelector<HTMLElement>('b');
    if (status) status.textContent = checked ? 'Enabled' : 'Disabled';
  }

  private hydrateLocalState(): void {
    const rememberedName = sessionStorage.getItem(PLAYER_NAME_KEY) ?? '';
    this.deploymentName.value = rememberedName;
    this.updatePlayerIdentity();
    this.selectMode('solo');
    this.selectHero(DEFAULT_HERO_ID);
  }

  private renderResponderCards(): void {
    const fullCards = document.createDocumentFragment();
    const selectCards = document.createDocumentFragment();

    for (const heroId of HERO_IDS) {
      const hero = HEROES[heroId];
      const visual = RESPONDER_VISUALS[heroId];
      const initial = hero.name.slice(0, 1).toUpperCase();

      const fullCard = document.createElement('button');
      fullCard.type = 'button';
      fullCard.className = 'dashboard-responder-card';
      fullCard.dataset.initial = initial;
      fullCard.dataset.heroId = heroId;
      fullCard.style.setProperty('--responder-tint', visual.tint);
      fullCard.setAttribute('aria-label', `Choose ${hero.name}, ${hero.role}`);
      const emblem = document.createElement('span');
      emblem.className = 'responder-emblem';
      emblem.style.borderColor = visual.color;
      const emblemText = document.createElement('span');
      emblemText.textContent = initial;
      emblem.append(emblemText);
      const role = document.createElement('small');
      role.textContent = hero.role;
      const name = document.createElement('strong');
      name.textContent = hero.name;
      const description = document.createElement('p');
      description.textContent = hero.description;
      fullCard.append(emblem, role, name, description);
      fullCard.addEventListener('click', () => {
        this.selectHero(heroId);
        this.openDeployment();
      });
      fullCards.append(fullCard);

      const selectCard = document.createElement('button');
      selectCard.type = 'button';
      selectCard.className = 'responder-select-card';
      selectCard.dataset.heroId = heroId;
      selectCard.setAttribute('role', 'radio');
      selectCard.setAttribute('aria-checked', String(heroId === DEFAULT_HERO_ID));
      selectCard.style.setProperty('--responder-color', visual.color);
      selectCard.style.setProperty('--responder-tint', visual.tint);
      const selectEmblem = document.createElement('span');
      const selectEmblemText = document.createElement('b');
      selectEmblemText.textContent = initial;
      selectEmblem.append(selectEmblemText);
      const selectCopy = document.createElement('span');
      const selectName = document.createElement('strong');
      selectName.textContent = hero.name;
      const selectRole = document.createElement('small');
      selectRole.textContent = hero.role;
      selectCopy.append(selectName, selectRole);
      selectCard.append(selectEmblem, selectCopy);
      selectCard.addEventListener('click', () => this.selectHero(heroId));
      selectCard.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const current = HERO_IDS.indexOf(heroId);
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const next = HERO_IDS[(current + delta + HERO_IDS.length) % HERO_IDS.length];
        if (!next) return;
        this.selectHero(next);
        this.deploymentRoster.querySelector<HTMLButtonElement>(`[data-hero-id="${next}"]`)?.focus();
      });
      selectCards.append(selectCard);
    }

    this.rosterCards.replaceChildren(fullCards);
    this.deploymentRoster.replaceChildren(selectCards);
  }

  private bindReturnButtons(): void {
    const buttons = [
      document.getElementById('return-dashboard-button'),
      document.getElementById('victory-dashboard-button'),
    ].filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);

    for (const button of buttons) {
      button.addEventListener('click', () => void this.returnToDashboard(button));
    }
  }

  private async returnToDashboard(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Leaving match…';
    try {
      await this.options.onReturnToDashboard?.();
      this.showDashboard();
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }
}
