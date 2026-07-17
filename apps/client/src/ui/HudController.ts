import {
  ABILITIES,
  HEROES,
  REQUIRED_PLAYERS,
  TEAMS,
  type AbilitySlot,
  type GameEvent,
  type MatchMode,
  type PublicPlayerState,
  type PublicSnapshot,
  type TeamId,
  type WelcomeMessage,
} from '@signal-zero/shared';

import { CLIENT_CONFIG } from '../config';
import type { ArenaUiBridge } from '../game/CommandGateway';
import type { ConnectionState } from '../network/GameClient';

interface HudActions {
  join(name: string): Promise<void>;
  setReady(ready: boolean): void;
  rematch(): void;
  targetAbility(slot: AbilitySlot): void;
  resume(): void;
}

interface DrillRecord {
  name: string;
  score: number;
  elapsedMs: number;
}

const DRILL_LEADERBOARD_KEY = 'signal-zero:flood-drill-leaderboard';

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required HUD element #${id} was not found.`);
  return element as T;
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function playerName(snapshot: PublicSnapshot | null, playerId: string): string {
  return snapshot?.players.find((player) => player.id === playerId)?.name ?? 'A responder';
}

function eventDescription(event: GameEvent, snapshot: PublicSnapshot | null): string {
  switch (event.type) {
    case 'HIT':
      return `${playerName(snapshot, event.sourceId)} dealt ${event.damage} ${event.attackKind === 'rescue-line' ? 'Rescue Line' : 'basic'} damage.`;
    case 'DEFEATED':
      return `${playerName(snapshot, event.playerId)} was defeated by ${playerName(snapshot, event.byPlayerId)}.`;
    case 'RESPAWNED':
      return `${playerName(snapshot, event.playerId)} redeployed.`;
    case 'JUMPED':
      return `${playerName(snapshot, event.playerId)} jumped the course.`;
    case 'LANDED':
      return `${playerName(snapshot, event.playerId)} landed safely.`;
    case 'DIVE_STARTED':
      return `${playerName(snapshot, event.playerId)} launched into a rescue dive.`;
    case 'PROP_GRABBED':
      return `${playerName(snapshot, event.playerId)} grabbed the Rescue Crate.`;
    case 'PROP_RELEASED':
      return `${playerName(snapshot, event.playerId)} released the Rescue Crate.`;
    case 'HAZARD_HIT':
      return `${playerName(snapshot, event.playerId)} was bonked by a Storm Spinner.`;
    case 'ABILITY_CAST':
      return `${playerName(snapshot, event.playerId)} deployed ${ABILITIES[event.slot].name}.`;
    case 'RELAY_CAPTURED':
      return `${TEAMS[event.team].name} secured the Weather Relay.`;
    case 'PUMP_ACTIVATED':
      return `${playerName(snapshot, event.playerId)} activated the Barangay Pump. Flood spread delayed.`;
    case 'CORE_PICKED_UP':
      return `${playerName(snapshot, event.playerId)} recovered the Resilience Core.`;
    case 'CORE_DROPPED':
      return `${playerName(snapshot, event.playerId)} dropped the Resilience Core.`;
    case 'CORE_DEPOSITED':
      return `${playerName(snapshot, event.playerId)} activated the ${TEAMS[event.team].name} beacon.`;
    case 'FLOOD_STARTED':
      return 'Flood warning: water is spreading from the canal.';
    case 'MATCH_STARTED':
      return 'Response operation started. Secure the relay.';
    case 'MATCH_WON':
      return `${TEAMS[event.team].name} completed the response protocol.`;
    case 'MATCH_EXPIRED':
      return 'Flood Drill time expired. Try a faster route or activate the pump.';
    case 'PLAYER_DISCONNECTED':
      return `${playerName(snapshot, event.playerId)} lost their signal.`;
    case 'PLAYER_RECONNECTED':
      return `${playerName(snapshot, event.playerId)} restored their signal.`;
  }
}

function setFill(element: HTMLElement, ratio: number): void {
  element.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

export class HudController implements ArenaUiBridge {
  private readonly joinPanel = requiredElement<HTMLElement>('join-panel');
  private readonly joinForm = requiredElement<HTMLFormElement>('join-form');
  private readonly playerNameInput = requiredElement<HTMLInputElement>('player-name');
  private readonly joinButton = requiredElement<HTMLButtonElement>('join-button');
  private readonly joinError = requiredElement<HTMLElement>('join-error');
  private readonly lobbySection = requiredElement<HTMLElement>('lobby-section');
  private readonly lobbyTeam = requiredElement<HTMLElement>('lobby-team');
  private readonly lobbyRoster = requiredElement<HTMLUListElement>('lobby-roster');
  private readonly readyButton = requiredElement<HTMLButtonElement>('ready-button');
  private readonly connectionPill = requiredElement<HTMLElement>('connection-pill');
  private readonly connectionLabel = requiredElement<HTMLElement>('connection-label');
  private readonly matchPhase = requiredElement<HTMLElement>('match-phase');
  private readonly matchTimer = requiredElement<HTMLElement>('match-timer');
  private readonly waterPhase = requiredElement<HTMLElement>('water-phase');
  private readonly waterTimer = requiredElement<HTMLElement>('water-timer');
  private readonly drillScore = requiredElement<HTMLElement>('drill-score');
  private readonly drillBest = requiredElement<HTMLElement>('drill-best');
  private readonly drillLeaderboard = requiredElement<HTMLOListElement>('drill-leaderboard');
  private readonly objectiveTitle = requiredElement<HTMLElement>('objective-title');
  private readonly objectiveProgress = requiredElement<HTMLElement>('objective-progress');
  private readonly objectiveStatus = requiredElement<HTMLElement>('objective-status');
  private readonly coreStatus = requiredElement<HTMLElement>('core-status');
  private readonly floodStatus = requiredElement<HTMLElement>('flood-status');
  private readonly pumpStatus = requiredElement<HTMLElement>('pump-status');
  private readonly heldItemStatus = requiredElement<HTMLElement>('held-item-status');
  private readonly healthFill = requiredElement<HTMLElement>('health-fill');
  private readonly healthLabel = requiredElement<HTMLElement>('health-label');
  private readonly energyFill = requiredElement<HTMLElement>('energy-fill');
  private readonly energyLabel = requiredElement<HTMLElement>('energy-label');
  private readonly heroPortrait = requiredElement<HTMLElement>('hero-portrait');
  private readonly heroName = requiredElement<HTMLElement>('hero-name');
  private readonly teamLabel = requiredElement<HTMLElement>('team-label');
  private readonly commandMode = requiredElement<HTMLElement>('command-mode');
  private readonly respawnLabel = requiredElement<HTMLElement>('respawn-label');
  private readonly abilityQ = requiredElement<HTMLButtonElement>('ability-q');
  private readonly qCooldown = requiredElement<HTMLElement>('q-cooldown');
  private readonly abilityW = requiredElement<HTMLButtonElement>('ability-w');
  private readonly wCooldown = requiredElement<HTMLElement>('w-cooldown');
  private readonly targetingHint = requiredElement<HTMLElement>('targeting-hint');
  private readonly targetingTitle = requiredElement<HTMLElement>('targeting-title');
  private readonly targetingCopy = requiredElement<HTMLElement>('targeting-copy');
  private readonly eventFeed = requiredElement<HTMLOListElement>('event-feed');
  private readonly scoreboard = requiredElement<HTMLElement>('scoreboard');
  private readonly scoreboardRows = requiredElement<HTMLElement>('scoreboard-rows');
  private readonly pausePanel = requiredElement<HTMLElement>('pause-panel');
  private readonly resumeButton = requiredElement<HTMLButtonElement>('resume-button');
  private readonly victoryPanel = requiredElement<HTMLElement>('victory-panel');
  private readonly victoryTitle = requiredElement<HTMLElement>('victory-title');
  private readonly victoryCopy = requiredElement<HTMLElement>('victory-copy');
  private readonly victoryScore = requiredElement<HTMLElement>('victory-score');
  private readonly rematchButton = requiredElement<HTMLButtonElement>('rematch-button');
  private readonly rematchStatus = requiredElement<HTMLElement>('rematch-status');
  private readonly toastStack = requiredElement<HTMLElement>('toast-stack');

  private currentPlayerId: string | null = null;
  private currentTeam: TeamId | null = null;
  private currentMode: MatchMode = 'flood-drill';
  private localReady = false;
  private rematchVoted = false;
  private latestSnapshot: PublicSnapshot | null = null;
  private readonly recordedDrills = new Set<number>();

  constructor(private readonly actions: HudActions) {
    const rememberedName = sessionStorage.getItem('signal-zero:name');
    if (rememberedName) this.playerNameInput.value = rememberedName;

    this.joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitJoin();
    });
    this.readyButton.addEventListener('click', () => {
      this.localReady = !this.localReady;
      this.actions.setReady(this.localReady);
      this.renderReadyButton();
    });
    this.rematchButton.addEventListener('click', () => {
      if (this.rematchVoted) return;
      this.rematchVoted = true;
      this.rematchButton.disabled = true;
      this.rematchButton.textContent = 'Vote Sent';
      this.actions.rematch();
    });
    this.abilityQ.addEventListener('click', () => this.actions.targetAbility('Q'));
    this.abilityW.addEventListener('click', () => this.actions.targetAbility('W'));
    for (const button of document.querySelectorAll<HTMLButtonElement>('.ability-locked')) {
      button.addEventListener('click', () => {
        this.showToast(`${button.dataset.slot ?? 'This slot'} is not implemented yet.`, 'info');
      });
    }
    this.resumeButton.addEventListener('click', () => {
      this.pausePanel.hidden = true;
      this.actions.resume();
    });
  }

  prepareDeployment(name: string, mode: MatchMode): void {
    this.currentPlayerId = null;
    this.currentTeam = null;
    this.currentMode = mode;
    this.latestSnapshot = null;
    this.localReady = false;
    this.rematchVoted = false;
    this.playerNameInput.value = name;
    this.joinError.textContent = '';
    this.joinPanel.hidden = false;
    this.joinForm.hidden = true;
    this.lobbySection.hidden = false;
    this.lobbyTeam.style.removeProperty('color');
    this.lobbyTeam.textContent =
      mode === 'flood-drill'
        ? 'Solo Flood Drill · Connecting…'
        : 'Multiplayer Versus · Connecting…';
    this.teamLabel.style.removeProperty('color');
    this.teamLabel.textContent = 'No team';
    this.heroName.textContent = 'Responder';
    this.heroPortrait.textContent = '—';
    this.lobbyRoster.replaceChildren(this.createPendingLobbyPlayer(name, 'CONNECTING'));
    if (mode === 'versus') {
      this.lobbyRoster.append(this.createWaitingLobbyPlayer('Waiting for opponent…'));
    }
    this.scoreboardRows.replaceChildren();
    this.renderReadyButton();
  }

  setConnection(state: ConnectionState, detail?: string): void {
    this.connectionPill.className = `status-pill status-${state}`;
    const label: Record<ConnectionState, string> = {
      offline: 'Offline',
      connecting: 'Connecting',
      connected: 'Connected',
      disconnected: 'Signal lost',
    };
    this.connectionLabel.textContent = detail ? `${label[state]} · ${detail}` : label[state];
    if (state === 'disconnected' || state === 'offline') {
      this.pausePanel.hidden = true;
      this.victoryPanel.hidden = true;
      this.scoreboard.hidden = true;
      this.targetingHint.hidden = true;
      this.joinPanel.hidden = false;
      this.joinForm.hidden = false;
      this.lobbySection.hidden = true;
      this.joinButton.disabled = false;
      this.joinButton.textContent = state === 'disconnected' ? 'Rejoin Room' : 'Join Room';
      this.currentPlayerId = null;
      this.currentTeam = null;
      this.latestSnapshot = null;
      this.localReady = false;
      this.rematchVoted = false;
    }
  }

  acceptWelcome(message: WelcomeMessage): void {
    this.currentPlayerId = message.playerId;
    this.currentTeam = message.team;
    this.joinForm.hidden = true;
    this.lobbySection.hidden = false;
    this.lobbyTeam.textContent = `${TEAMS[message.team].name} · ${TEAMS[message.team].marker}`;
    this.lobbyTeam.style.color = TEAMS[message.team].cssColor;
    this.teamLabel.textContent = `${TEAMS[message.team].name} · ${TEAMS[message.team].marker}`;
    this.teamLabel.style.color = TEAMS[message.team].cssColor;
  }

  renderSnapshot(snapshot: PublicSnapshot): void {
    this.latestSnapshot = snapshot;
    this.currentMode = snapshot.match.mode;
    const phase = snapshot.match.phase;
    this.matchPhase.textContent = phase.toUpperCase();
    this.matchPhase.dataset.phase = phase;
    this.matchTimer.textContent = formatClock(
      snapshot.match.timeLimitMs === null
        ? snapshot.match.elapsedMs
        : Math.max(0, snapshot.match.timeLimitMs - snapshot.match.elapsedMs),
    );
    this.waterPhase.textContent = snapshot.match.waterPhase;
    this.waterPhase.dataset.waterPhase = snapshot.match.waterPhase;
    this.waterPhase.hidden = phase !== 'active';
    this.waterTimer.textContent = formatClock(snapshot.match.timerRemaining);
    this.waterTimer.hidden = phase !== 'active';
    this.drillScore.hidden = snapshot.match.mode !== 'flood-drill';
    this.drillScore.textContent = `DRILL SCORE ${snapshot.match.score}`;
    this.renderDrillLeaderboard(snapshot);
    this.renderObjective(snapshot);
    this.renderPlayers(snapshot);
    this.renderRoster(snapshot);

    if (phase === 'waiting' || phase === 'countdown') {
      this.joinPanel.hidden = false;
      if (this.currentPlayerId) {
        this.joinForm.hidden = true;
        this.lobbySection.hidden = false;
      }
    } else {
      this.joinPanel.hidden = true;
    }

    if (phase === 'ended') {
      this.victoryPanel.hidden = false;
      const winner = snapshot.match.winnerTeam;
      const won = snapshot.match.outcome === 'success' && winner !== null;
      this.victoryTitle.textContent = won
        ? `${TEAMS[winner].name} activated their beacon`
        : 'Flood Drill time expired';
      this.victoryTitle.style.color = won ? TEAMS[winner].cssColor : '#ffca61';
      this.victoryCopy.textContent = won
        ? winner === this.currentTeam
          ? 'Your response route restored Barangay Maligaya.'
          : `${TEAMS[winner].name} delivered the Resilience Core first.`
        : 'The water reached the district first. Use the pump or Bayanihan Pulse to find a faster route.';
      this.victoryScore.hidden = snapshot.match.mode !== 'flood-drill';
      this.victoryScore.textContent = `Flood Drill score: ${snapshot.match.score}`;
      this.rematchStatus.textContent = `${snapshot.match.rematchVotes} / ${snapshot.match.requiredRematchVotes} votes`;
    } else {
      this.victoryPanel.hidden = true;
      this.rematchVoted = false;
      this.rematchButton.disabled = false;
      this.rematchButton.textContent = 'Vote Rematch';
    }
  }

  renderRealtime(serverNow: number): void {
    const snapshot = this.latestSnapshot;
    const local = snapshot?.players.find((player) => player.id === this.currentPlayerId);
    if (!snapshot || !local) return;

    const cooldownMs = Math.max(0, local.qCooldownEndsAt - serverNow);
    const canCast =
      snapshot.match.phase === 'active' &&
      local.alive &&
      local.energy >= ABILITIES.Q.energyCost &&
      cooldownMs === 0;
    this.abilityQ.disabled = !canCast;
    this.abilityQ.classList.toggle('ability-unavailable', !canCast && cooldownMs === 0);
    if (cooldownMs > 0) {
      this.abilityQ.classList.remove('ability-ready');
      this.abilityQ.classList.add('ability-cooldown');
      this.qCooldown.textContent = `${(cooldownMs / 1_000).toFixed(1)}s`;
      this.abilityQ.style.setProperty('--cooldown', `${cooldownMs / ABILITIES.Q.cooldownMs}`);
    } else {
      this.abilityQ.classList.toggle('ability-ready', canCast);
      this.abilityQ.classList.remove('ability-cooldown');
      this.qCooldown.textContent = !local.alive
        ? 'DOWN'
        : snapshot.match.phase !== 'active'
          ? 'WAIT'
          : local.energy >= ABILITIES.Q.energyCost
            ? 'READY'
            : 'LOW EN';
      this.abilityQ.style.setProperty('--cooldown', '0');
    }

    this.renderSelfAbility(
      this.abilityW,
      this.wCooldown,
      local.wCooldownEndsAt,
      ABILITIES.W,
      serverNow,
      snapshot.match.phase === 'active' && local.alive,
      local.energy,
    );

    if (!local.alive && local.respawnAt) {
      this.respawnLabel.textContent = `Redeploy in ${Math.max(0, (local.respawnAt - serverNow) / 1_000).toFixed(1)}s`;
    } else {
      this.respawnLabel.textContent = '';
    }

    if (snapshot.match.phase === 'countdown' && snapshot.match.countdownEndsAt) {
      const countdown = Math.max(0, snapshot.match.countdownEndsAt - serverNow);
      this.matchTimer.textContent = `${Math.max(1, Math.ceil(countdown / 1_000))}`;
    }
  }

  showEvent(event: GameEvent): void {
    const item = document.createElement('li');
    item.className = `event-item event-${event.type.toLowerCase().replaceAll('_', '-')}`;
    item.textContent = eventDescription(event, this.latestSnapshot);
    this.eventFeed.prepend(item);
    while (this.eventFeed.children.length > 5) this.eventFeed.lastElementChild?.remove();
    window.setTimeout(() => item.remove(), CLIENT_CONFIG.eventFeedLifetimeMs);

    if (event.type === 'FLOOD_STARTED')
      this.showToast('Flood spreading — shallow water slows movement.', 'warning');
    if (event.type === 'RELAY_CAPTURED')
      this.showToast('Relay secured. Recover the Resilience Core.', 'success');
    if (event.type === 'CORE_PICKED_UP')
      this.showToast('Core recovered. Bring it to your own beacon.', 'success');
    if (event.type === 'PUMP_ACTIVATED')
      this.showToast('Barangay Pump active: flood surge delayed by 8 seconds.', 'success');
    if (event.type === 'HAZARD_HIT')
      this.showToast('Storm Spinner bonk! Jump or dive through the next opening.', 'warning');
    if (event.type === 'PROP_GRABBED')
      this.showToast('Rescue Crate secured. Carry it onto the orange Pump plate.', 'success');
  }

  showError(message: string): void {
    this.joinError.textContent = message;
    this.showToast(message, 'error');
  }

  clearError(): void {
    this.joinError.textContent = '';
  }

  setTargeting(active: boolean, title?: string, copy?: string): void {
    this.targetingHint.hidden = !active;
    if (title) this.targetingTitle.textContent = title;
    if (copy) this.targetingCopy.textContent = copy;
  }

  setScoreboardVisible(visible: boolean): void {
    this.scoreboard.hidden = !visible;
  }

  togglePause(): void {
    this.pausePanel.hidden = !this.pausePanel.hidden;
  }

  showToast(message: string, tone: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.textContent = message;
    this.toastStack.append(toast);
    window.setTimeout(() => {
      toast.classList.add('toast-leaving');
      window.setTimeout(() => toast.remove(), 220);
    }, 3_400);
  }

  private async submitJoin(): Promise<void> {
    const name = this.playerNameInput.value.trim();
    if (!name) {
      this.showError('Enter a responder name before joining.');
      this.playerNameInput.focus();
      return;
    }
    this.clearError();
    this.currentMode = 'flood-drill';
    this.joinButton.disabled = true;
    this.joinButton.textContent = 'Connecting…';
    sessionStorage.setItem('signal-zero:name', name);
    try {
      await this.actions.join(name);
    } catch {
      this.joinButton.disabled = false;
      this.joinButton.textContent = 'Try Again';
    }
  }

  private renderObjective(snapshot: PublicSnapshot): void {
    const relay = snapshot.relay;
    const local = snapshot.players.find((player) => player.id === this.currentPlayerId);
    setFill(this.objectiveProgress, relay.captureProgress);
    if (relay.state === 'captured' && relay.ownerTeam) {
      this.objectiveTitle.textContent = 'Bring the Core Home';
      this.objectiveStatus.textContent = local?.hasCore
        ? 'Follow the blue beacon marker, then press F beside it'
        : 'Walk to the glowing Core and press F to carry it';
      this.objectiveProgress.style.backgroundColor = TEAMS[relay.ownerTeam].cssColor;
    } else if (relay.state === 'contested') {
      this.objectiveTitle.textContent = 'Relay contested';
      this.objectiveStatus.textContent = 'Clear opposing responders from the capture radius';
      this.objectiveProgress.style.backgroundColor = '#ffcf69';
    } else if (relay.state === 'capturing' && relay.captureTeam) {
      this.objectiveTitle.textContent = 'Securing Weather Relay';
      this.objectiveStatus.textContent = `${TEAMS[relay.captureTeam].name}: ${Math.round(relay.captureProgress * 100)}%`;
      this.objectiveProgress.style.backgroundColor = TEAMS[relay.captureTeam].cssColor;
    } else {
      this.objectiveTitle.textContent = 'Restore the Barangay Relay';
      this.objectiveStatus.textContent =
        'Reach the center ring. For bonus response time, click the Rescue Crate and carry it onto the orange Pump plate.';
      this.objectiveProgress.style.backgroundColor = '#78ddea';
    }

    const coreDescriptions: Record<PublicSnapshot['core']['status'], string> = {
      locked: 'Core: locked at relay',
      available: 'Core: ready for pickup',
      carried: local?.hasCore ? 'Core: you are carrying it' : 'Core: carried by a responder',
      deposited: 'Core: deposited',
    };
    this.coreStatus.textContent = coreDescriptions[snapshot.core.status];

    const flooded = snapshot.floodLevels.filter((level) => level > 0).length;
    const deep = snapshot.floodLevels.filter((level) => level >= 2).length;
    if (!snapshot.match.floodStarted) this.floodStatus.textContent = 'Flood: dormant';
    else this.floodStatus.textContent = `Flood: ${flooded} zones · ${deep} deep`;
    this.floodStatus.classList.toggle('flood-warning', snapshot.match.floodStarted);
    this.pumpStatus.textContent =
      snapshot.pump.state === 'active'
        ? `Pump: active by ${TEAMS[snapshot.pump.activatedByTeam ?? 'A'].name}`
        : 'Pump: park Rescue Crate for +400 / +8 sec flood delay';
  }

  private renderPlayers(snapshot: PublicSnapshot): void {
    const local = snapshot.players.find((player) => player.id === this.currentPlayerId);
    if (!local) return;
    const hero = HEROES[local.heroId];
    this.heroName.textContent = hero.name;
    this.heroPortrait.textContent = hero.name.slice(0, 1).toUpperCase();
    setFill(this.healthFill, local.health / Math.max(1, local.maxHealth));
    setFill(this.energyFill, local.energy / Math.max(1, local.maxEnergy));
    this.healthLabel.textContent = `${Math.ceil(local.health)} / ${local.maxHealth} HP`;
    this.energyLabel.textContent = `${Math.floor(local.energy)} / ${local.maxEnergy} EN`;
    this.heldItemStatus.textContent =
      local.heldItem === 'NONE' ? '' : `Holding: ${local.heldItem}`;
    this.heldItemStatus.style.color =
      local.heldItem === 'SANDBAG' ? '#ffcf69' : local.heldItem === 'GENERATOR' ? '#67d7ad' : '';
    this.commandMode.textContent = local.alive
      ? local.commandMode.replace('-', ' ').toUpperCase()
      : 'DEFEATED';
    this.localReady = local.ready;
    this.renderReadyButton();
  }

  private renderRoster(snapshot: PublicSnapshot): void {
    this.lobbyRoster.replaceChildren();
    this.scoreboardRows.replaceChildren();
    for (const player of snapshot.players) {
      this.lobbyRoster.append(this.createLobbyPlayer(player));
      this.scoreboardRows.append(this.createScoreboardPlayer(player));
    }
    if (snapshot.match.mode === 'versus') {
      for (let index = snapshot.players.length; index < REQUIRED_PLAYERS; index += 1) {
        this.lobbyRoster.append(this.createWaitingLobbyPlayer('Waiting for opponent…'));
      }
    }
  }

  private createPendingLobbyPlayer(name: string, statusText: string): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'roster-player roster-waiting';
    const identity = document.createElement('span');
    identity.textContent = name;
    const status = document.createElement('strong');
    status.textContent = statusText;
    item.append(identity, status);
    return item;
  }

  private createWaitingLobbyPlayer(message: string): HTMLLIElement {
    const waiting = document.createElement('li');
    waiting.className = 'roster-player roster-waiting';
    waiting.textContent = message;
    return waiting;
  }

  private createLobbyPlayer(player: PublicPlayerState): HTMLLIElement {
    const item = document.createElement('li');
    item.className = `roster-player team-${player.team.toLowerCase()}`;
    const identity = document.createElement('span');
    identity.textContent = `${TEAMS[player.team].marker} ${player.name}`;
    const status = document.createElement('strong');
    status.textContent = !player.connected ? 'SIGNAL LOST' : player.ready ? 'READY' : 'PREPARING';
    status.className = player.ready ? 'ready-text' : '';
    item.append(identity, status);
    return item;
  }

  private createScoreboardPlayer(player: PublicPlayerState): HTMLElement {
    const row = document.createElement('div');
    row.className = `scoreboard-row team-${player.team.toLowerCase()}`;
    const marker = document.createElement('span');
    marker.className = `team-marker marker-${TEAMS[player.team].marker}`;
    marker.setAttribute('aria-label', `${TEAMS[player.team].marker} team marker`);
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = player.name;
    const team = document.createElement('small');
    team.textContent = TEAMS[player.team].name;
    identity.append(name, team);
    const stats = document.createElement('div');
    stats.className = 'scoreboard-stats';
    stats.textContent = player.alive
      ? `${Math.ceil(player.health)} HP · ${player.hasCore ? 'CORE CARRIER' : player.commandMode.toUpperCase()}`
      : 'REDEPLOYING';
    row.append(marker, identity, stats);
    return row;
  }

  private renderSelfAbility(
    button: HTMLButtonElement,
    label: HTMLElement,
    cooldownEndsAt: number,
    ability: (typeof ABILITIES)[keyof typeof ABILITIES],
    serverNow: number,
    canUseDuringMatch: boolean,
    energy: number,
  ): void {
    const cooldownMs = Math.max(0, cooldownEndsAt - serverNow);
    const available = canUseDuringMatch && energy >= ability.energyCost && cooldownMs === 0;
    button.disabled = !available;
    button.classList.toggle('ability-ready', available);
    button.classList.toggle('ability-cooldown', cooldownMs > 0);
    button.classList.toggle('ability-unavailable', !available && cooldownMs === 0);
    label.textContent =
      cooldownMs > 0
        ? `${(cooldownMs / 1_000).toFixed(1)}s`
        : !canUseDuringMatch
          ? 'WAIT'
          : available
            ? 'READY'
            : 'LOW EN';
    button.style.setProperty('--cooldown', `${cooldownMs / ability.cooldownMs}`);
  }

  private renderReadyButton(): void {
    if (this.currentMode === 'flood-drill') {
      this.readyButton.textContent = this.localReady ? 'Flood Drill ready ✓' : 'Start Flood Drill';
    } else {
      const waitingForOpponent = (this.latestSnapshot?.players.length ?? 0) < REQUIRED_PLAYERS;
      this.readyButton.textContent = this.localReady
        ? waitingForOpponent
          ? 'Ready · Waiting for opponent'
          : 'Ready ✓'
        : waitingForOpponent
          ? 'Ready Up · Waiting for opponent'
          : 'Ready Up';
    }
    this.readyButton.classList.toggle('button-ready', this.localReady);
  }

  private renderDrillLeaderboard(snapshot: PublicSnapshot): void {
    const drill = snapshot.match.mode === 'flood-drill';
    this.drillBest.hidden = !drill;
    this.drillLeaderboard.hidden = !drill;
    if (!drill) return;

    if (snapshot.match.phase === 'ended' && !this.recordedDrills.has(snapshot.match.elapsedMs)) {
      this.recordedDrills.add(snapshot.match.elapsedMs);
      const localName = snapshot.players.find((player) => player.id === this.currentPlayerId)?.name;
      if (localName) {
        const records = this.readDrillRecords();
        records.push({
          name: localName,
          score: snapshot.match.score,
          elapsedMs: snapshot.match.elapsedMs,
        });
        const topThree = records
          .sort((left, right) => right.score - left.score || left.elapsedMs - right.elapsedMs)
          .slice(0, 3);
        localStorage.setItem(DRILL_LEADERBOARD_KEY, JSON.stringify(topThree));
      }
    }

    const records = this.readDrillRecords();
    this.drillBest.textContent = `BEST ${records[0]?.score ?? 0}`;
    this.drillLeaderboard.replaceChildren();
    for (const record of records) {
      const item = document.createElement('li');
      item.textContent = `${record.name} — ${record.score} pts · ${formatClock(record.elapsedMs)}`;
      this.drillLeaderboard.append(item);
    }
    if (records.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'Finish a drill to set the first record.';
      this.drillLeaderboard.append(item);
    }
  }

  private readDrillRecords(): DrillRecord[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(DRILL_LEADERBOARD_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (entry): entry is DrillRecord =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as DrillRecord).name === 'string' &&
            typeof (entry as DrillRecord).score === 'number' &&
            typeof (entry as DrillRecord).elapsedMs === 'number',
        )
        .slice(0, 3);
    } catch {
      return [];
    }
  }
}
