import * as THREE from 'three';
import {
  ABILITIES,
  ARENA_COLS,
  ARENA_HEIGHT,
  ARENA_ROWS,
  ARENA_WIDTH,
  BEACON_INTERACT_RADIUS,
  BEACON_POSITIONS,
  BUILDING_RECTS,
  CORE_INTERACT_RADIUS,
  GRAB_RADIUS,
  PUMP_PRESSURE_RADIUS,
  RELAY_CAPTURE_RADIUS,
  RESCUE_CRATE_RADIUS,
  TEAMS,
  TILE_SIZE,
  clampToArena,
  distance,
  getTileKind,
  type AbilitySlot,
  type GameEvent,
  type PublicPlayerState,
  type PublicPropState,
  type PublicSnapshot,
  type PublicStormBarrierState,
  type TeamId,
  type Vector2,
} from '@signal-zero/shared';

import type { GameStore } from '../state/GameStore';
import { createCharacterModel, type CharacterModel } from './CharacterModel';
import type { ArenaUiBridge, CommandGateway } from './CommandGateway';
import { cameraRelativeDirection, isZeroDirection } from './inputMath';

const WORLD_SCALE = 0.045;
const TILE_WORLD_SIZE = TILE_SIZE * WORLD_SCALE;
const GROUND_Y = 0;
const STEER_COMMAND_INTERVAL_MS = 90;
const CAMERA_MIN_DISTANCE = 4.8;
const CAMERA_MAX_DISTANCE = 12;

const COLORS = {
  sky: 0x071924,
  fog: 0x0b2934,
  streetA: 0x385058,
  streetB: 0x31484f,
  streetLine: 0xc1d7d5,
  building: 0x28404a,
  buildingAccent: 0x40606a,
  roof: 0x16323b,
  canal: 0x0b6682,
  shallowFlood: 0x21b9d4,
  deepFlood: 0x0877a5,
  neutral: 0xd8eef4,
  warning: 0xffc857,
  success: 0x67d7ad,
} as const;

type TargetMode = { type: 'ability'; slot: 'Q' };

interface PlayerVisual {
  model: CharacterModel;
  readonly label: THREE.Sprite;
  readonly lastPosition: THREE.Vector3;
  team: TeamId;
  initialized: boolean;
}

interface TimedEffect {
  readonly root: THREE.Object3D;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly maximumScale: number;
}

interface PropVisual {
  readonly root: THREE.Group;
  readonly crate: THREE.Group;
}

interface StormBarrierVisual {
  readonly root: THREE.Group;
  targetAngle: number;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function simulationToWorld(point: Vector2, height = GROUND_Y): THREE.Vector3 {
  return new THREE.Vector3(
    (point.x - ARENA_WIDTH / 2) * WORLD_SCALE,
    height,
    (point.y - ARENA_HEIGHT / 2) * WORLD_SCALE,
  );
}

function worldToSimulation(point: THREE.Vector3): Vector2 {
  return clampToArena({
    x: point.x / WORLD_SCALE + ARENA_WIDTH / 2,
    y: point.z / WORLD_SCALE + ARENA_HEIGHT / 2,
  });
}

function colorForTeam(team: TeamId): THREE.Color {
  return new THREE.Color(TEAMS[team].color);
}

function lerpAngle(current: number, target: number, amount: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}

function setObjectOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = opacity;
    }
  });
}

function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points
    ) {
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    } else if (object instanceof THREE.Sprite) {
      materials.add(object.material);
      if (object.material.map) textures.add(object.material.map);
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function createLabelSprite(
  text: string,
  color = '#eaf9fc',
  background = 'rgba(3, 15, 22, 0.78)',
  width = 512,
  height = 96,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');

  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(4, 4, width - 8, height - 8, 18);
  context.fill();
  context.strokeStyle = color;
  context.globalAlpha = 0.48;
  context.lineWidth = 3;
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = color;
  context.font = '700 29px Inter, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(5.4, 1.01, 1);
  return sprite;
}

/**
 * Three.js presentation for the authoritative 2D server simulation.
 * The client maps server x/y coordinates to world x/z and never simulates outcomes.
 */
export class ArenaScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 180);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly cameraCollisionRaycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly playerViews = new Map<string, PlayerVisual>();
  private readonly propViews = new Map<string, PropVisual>();
  private readonly stormBarrierViews = new Map<string, StormBarrierVisual>();
  private readonly cameraObstacles: THREE.Mesh[] = [];
  private readonly queuedEvents: GameEvent[] = [];
  private readonly effects: TimedEffect[] = [];
  private readonly keysHeld = new Set<string>();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly targetPointWorld = new THREE.Vector3();

  private readonly floodMesh: THREE.InstancedMesh;
  private readonly floodMaterial = new THREE.MeshPhysicalMaterial({
    color: COLORS.shallowFlood,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    roughness: 0.18,
    metalness: 0.04,
    transmission: 0.08,
  });
  private readonly relayRoot = new THREE.Group();
  private readonly relayMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.neutral,
    emissive: COLORS.neutral,
    emissiveIntensity: 0.22,
    roughness: 0.36,
    metalness: 0.54,
  });
  private readonly relayCaptureRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly coreRoot = new THREE.Group();
  private readonly pumpRoot = new THREE.Group();
  private readonly pumpMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.warning,
    emissive: 0x4b2d08,
    emissiveIntensity: 0.55,
    roughness: 0.48,
  });
  private readonly beaconRoots = new Map<TeamId, THREE.Group>();
  private readonly beaconMaterials = new Map<TeamId, THREE.MeshStandardMaterial>();
  private readonly beaconBeams = new Map<
    TeamId,
    THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>
  >();
  private readonly targetMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly targetLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly rain: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly interactionPrompt: THREE.Sprite;
  private readonly grabPrompt: THREE.Sprite;
  private readonly releasePrompt: THREE.Sprite;

  private animationFrame = 0;
  private ready = false;
  private destroyed = false;
  private targetMode: TargetMode | null = null;
  private latestRenderedPlayers: PublicPlayerState[] = [];
  private lastRenderedTick = -1;
  private lastMatchPhase: PublicSnapshot['match']['phase'] | null = null;
  private localMenuOpen = false;
  private orbiting = false;
  private orbitPointerId: number | null = null;
  private orbitStart = { x: 0, y: 0 };
  private orbitDragDistance = 0;
  private cameraYaw = Math.PI * 0.96;
  private cameraPitch = 0.38;
  private cameraDistance = 7.6;
  private cameraSensitivity = 1;
  private lastSteerCommandAt = 0;
  private lastSteerDirection: Vector2 = { x: 0, y: 0 };
  private shakeUntil = 0;

  private readonly suppressContextMenu = (event: Event): void => event.preventDefault();

  private readonly handleKeyDownBound = (event: KeyboardEvent): void => this.handleKeyDown(event);

  private readonly handleKeyUpBound = (event: KeyboardEvent): void => this.handleKeyUp(event);

  private readonly handlePointerDownBound = (event: PointerEvent): void =>
    this.handlePointerDown(event);

  private readonly handlePointerMoveBound = (event: PointerEvent): void =>
    this.handlePointerMove(event);

  private readonly handlePointerUpBound = (event: PointerEvent): void =>
    this.handlePointerUp(event);

  private readonly handleWheelBound = (event: WheelEvent): void => this.handleWheel(event);

  private readonly handleResizeBound = (): void => this.resize();

  constructor(
    private readonly container: HTMLElement,
    private readonly store: GameStore,
    private readonly commands: CommandGateway,
    private readonly ui: ArenaUiBridge,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Third-person multiplayer flood response arena',
    );
    this.renderer.domElement.tabIndex = 0;
    this.container.replaceChildren(this.renderer.domElement);

    const floodGeometry = new THREE.BoxGeometry(
      TILE_WORLD_SIZE * 0.96,
      0.09,
      TILE_WORLD_SIZE * 0.96,
    );
    this.floodMesh = new THREE.InstancedMesh(
      floodGeometry,
      this.floodMaterial,
      ARENA_COLS * ARENA_ROWS,
    );
    this.floodMesh.count = 0;
    this.floodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.floodMesh.frustumCulled = false;

    this.relayCaptureRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.32, 0.065, 12, 72),
      new THREE.MeshBasicMaterial({ color: COLORS.neutral, transparent: true, opacity: 0.9 }),
    );
    this.relayCaptureRing.rotation.x = Math.PI / 2;

    this.targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.47, 48),
      new THREE.MeshBasicMaterial({
        color: 0x72e6f1,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.targetMarker.rotation.x = -Math.PI / 2;
    this.targetMarker.visible = false;

    this.targetLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x72e6f1, transparent: true, opacity: 0.84 }),
    );
    this.targetLine.visible = false;

    this.interactionPrompt = createLabelSprite('F  ·  INTERACT', '#dcfbff', 'rgba(3, 15, 22, 0.9)');
    this.interactionPrompt.position.set(0, -0.31, -1.3);
    this.interactionPrompt.scale.set(0.49, 0.087, 1);
    this.interactionPrompt.material.depthTest = false;
    this.interactionPrompt.renderOrder = 1_000;
    this.interactionPrompt.visible = false;

    this.grabPrompt = createLabelSprite(
      'LMB  ·  GRAB RESCUE CRATE',
      '#fff1ad',
      'rgba(31, 21, 5, 0.92)',
    );
    this.grabPrompt.position.set(0, -0.4, -1.3);
    this.grabPrompt.scale.set(0.62, 0.1, 1);
    this.grabPrompt.material.depthTest = false;
    this.grabPrompt.renderOrder = 1_000;
    this.grabPrompt.visible = false;

    this.releasePrompt = createLabelSprite(
      'LMB  ·  RELEASE CRATE',
      '#fff1ad',
      'rgba(31, 21, 5, 0.92)',
    );
    this.releasePrompt.position.copy(this.grabPrompt.position);
    this.releasePrompt.scale.copy(this.grabPrompt.scale);
    this.releasePrompt.material.depthTest = false;
    this.releasePrompt.renderOrder = 1_000;
    this.releasePrompt.visible = false;

    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(850 * 3);
    const arenaWorldWidth = ARENA_WIDTH * WORLD_SCALE;
    const arenaWorldHeight = ARENA_HEIGHT * WORLD_SCALE;
    for (let index = 0; index < 850; index += 1) {
      const offset = index * 3;
      rainPositions[offset] = (((index * 67) % 997) / 997) * arenaWorldWidth - arenaWorldWidth / 2;
      rainPositions[offset + 1] = 2 + (((index * 37) % 211) / 211) * 14;
      rainPositions[offset + 2] =
        (((index * 83) % 991) / 991) * arenaWorldHeight - arenaWorldHeight / 2;
    }
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({ color: 0x9eefff, size: 0.045, transparent: true, opacity: 0.55 }),
    );
    this.rain.visible = false;

    this.initializeScene();
    this.bindInput();
    this.resize();
    this.timer.connect(document);
    this.timer.reset();
    this.ready = true;
    for (const event of this.queuedEvents.splice(0)) this.playEvent(event);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  setCameraSensitivity(value: number): void {
    this.cameraSensitivity = THREE.MathUtils.clamp(value, 0.5, 1.75);
  }

  beginAbilityTargeting(slot: AbilitySlot): void {
    if (!ABILITIES[slot].implemented) {
      this.ui.showToast(`${slot} is reserved for a future responder module.`, 'info');
      return;
    }
    if (!this.ensureCanControl()) return;

    if (slot === 'W') {
      const local = this.getLocalPlayer();
      if (local) this.commands.castAbility('W', { x: local.x, y: local.y });
      return;
    }
    if (slot !== 'Q') return;

    this.targetMode = { type: 'ability', slot };
    this.targetMarker.visible = true;
    this.targetLine.visible = true;
    this.ui.setTargeting(
      true,
      ABILITIES[slot].name,
      'Aim at the street · Click to deploy · Esc to cancel',
    );
  }

  resumeFromMenu(): void {
    this.localMenuOpen = false;
  }

  resetForSession(): void {
    this.cancelTargeting();
    this.keysHeld.clear();
    this.latestRenderedPlayers = [];
    this.lastRenderedTick = -1;
    this.lastMatchPhase = null;
    this.localMenuOpen = false;
    this.lastSteerDirection = { x: 0, y: 0 };
    this.grabPrompt.visible = false;
    this.releasePrompt.visible = false;
    for (const [id, view] of this.playerViews) {
      this.removePlayerView(id, view);
    }
  }

  playEvent(event: GameEvent): void {
    if (!this.ready) {
      this.queuedEvents.push(event);
      return;
    }

    switch (event.type) {
      case 'HIT': {
        const target = this.playerViews.get(event.targetId);
        if (target) this.pulseAt(target.model.root.position, 0xff766e, 1.8);
        if (event.targetId === this.commands.playerId) this.shakeUntil = performance.now() + 240;
        break;
      }
      case 'DEFEATED': {
        const target = this.playerViews.get(event.playerId);
        if (target) this.pulseAt(target.model.root.position, 0xff9a90, 2.7);
        break;
      }
      case 'RESPAWNED': {
        const target = this.playerViews.get(event.playerId);
        if (target) this.pulseAt(target.model.root.position, COLORS.success, 2.8);
        break;
      }
      case 'JUMPED': {
        const player = this.playerViews.get(event.playerId);
        if (player) this.pulseAt(player.model.root.position, 0xb9f6ff, 1.35);
        break;
      }
      case 'LANDED': {
        const player = this.playerViews.get(event.playerId);
        if (player) this.pulseAt(player.model.root.position, 0xffffff, 0.85);
        break;
      }
      case 'DIVE_STARTED': {
        const player = this.playerViews.get(event.playerId);
        if (player) this.pulseAt(player.model.root.position, COLORS.warning, 1.65);
        break;
      }
      case 'PROP_GRABBED':
      case 'PROP_RELEASED': {
        const prop = this.propViews.get(event.propId);
        if (prop) this.pulseAt(prop.root.position, 0xffdc67, 1.8);
        break;
      }
      case 'HAZARD_HIT': {
        const player = this.playerViews.get(event.playerId);
        if (player) this.pulseAt(player.model.root.position, 0xff756c, 2.1);
        if (event.playerId === this.commands.playerId) {
          this.shakeUntil = performance.now() + 360;
        }
        break;
      }
      case 'ABILITY_CAST':
        if (event.slot === 'Q') this.drawRescueLine(event.from, event.to);
        else this.pulseAt(simulationToWorld(event.from), COLORS.success, 3.4);
        break;
      case 'RELAY_CAPTURED':
        this.pulseAt(
          simulationToWorld({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }),
          TEAMS[event.team].color,
          4.2,
        );
        break;
      case 'PUMP_ACTIVATED':
        this.pulseAt(this.pumpRoot.position, COLORS.warning, 3.2);
        break;
      case 'CORE_PICKED_UP': {
        const carrier = this.playerViews.get(event.playerId);
        if (carrier) this.pulseAt(carrier.model.root.position, 0xc7f6ff, 2.4);
        break;
      }
      case 'CORE_DROPPED':
        this.pulseAt(simulationToWorld(event.position), COLORS.warning, 2.3);
        break;
      case 'CORE_DEPOSITED':
      case 'MATCH_WON': {
        const beacon = this.beaconRoots.get(event.team);
        if (beacon) this.pulseAt(beacon.position, TEAMS[event.team].color, 6.5);
        break;
      }
      case 'FLOOD_STARTED':
        this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.018);
        break;
      case 'MATCH_STARTED':
        this.pulseAt(new THREE.Vector3(0, 0.08, 0), 0x72d9ff, 7.5);
        break;
      case 'MATCH_EXPIRED':
      case 'PLAYER_DISCONNECTED':
      case 'PLAYER_RECONNECTED':
        break;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    this.unbindInput();
    this.ui.setScoreboardVisible(false);
    this.cancelTargeting();
    for (const view of this.playerViews.values()) view.model.dispose();
    this.playerViews.clear();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.timer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly animate = (): void => {
    if (this.destroyed) return;
    this.animationFrame = window.requestAnimationFrame(this.animate);
    this.timer.update();
    const deltaSeconds = Math.min(0.05, this.timer.getDelta());
    const now = performance.now();

    this.updateSnapshot(deltaSeconds);
    this.updateKeyboardMovement(now);
    this.updateCamera(deltaSeconds, now);
    this.updateTargeting(now);
    this.updateEffects(now);
    this.updateAtmosphere(deltaSeconds);
    this.renderer.render(this.scene, this.camera);
  };

  private initializeScene(): void {
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.012);

    const hemisphere = new THREE.HemisphereLight(0xbfeeff, 0x122229, 2.15);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff0d2, 3.3);
    sun.position.set(-18, 28, -12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x39c8ee, 1.35);
    rim.position.set(18, 10, 15);
    this.scene.add(rim);

    this.createDistrict();
    this.createRelay();
    this.createCore();
    this.createPump();
    this.createBeacons();
    this.scene.add(this.floodMesh, this.targetMarker, this.targetLine, this.rain);

    const reticle = this.createReticle();
    reticle.position.set(0, 0, -1.25);
    this.camera.add(reticle, this.interactionPrompt, this.grabPrompt, this.releasePrompt);
    this.scene.add(this.camera);

    this.camera.position.set(0, 9, 13);
    this.camera.lookAt(0, 1.2, 0);
  }

  private createDistrict(): void {
    const arenaWorldWidth = ARENA_WIDTH * WORLD_SCALE;
    const arenaWorldHeight = ARENA_HEIGHT * WORLD_SCALE;

    const outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(arenaWorldWidth + 36, arenaWorldHeight + 36),
      new THREE.MeshStandardMaterial({ color: 0x0a2028, roughness: 0.95 }),
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.17;
    outerGround.receiveShadow = true;
    this.scene.add(outerGround);

    const tileGeometry = new THREE.BoxGeometry(
      TILE_WORLD_SIZE * 0.985,
      0.14,
      TILE_WORLD_SIZE * 0.985,
    );
    const streetMaterials = [
      new THREE.MeshStandardMaterial({ color: COLORS.streetA, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: COLORS.streetB, roughness: 0.9 }),
    ];
    const canalMaterial = new THREE.MeshPhysicalMaterial({
      color: COLORS.canal,
      roughness: 0.16,
      metalness: 0.04,
      transparent: true,
      opacity: 0.84,
    });

    for (let row = 0; row < ARENA_ROWS; row += 1) {
      for (let col = 0; col < ARENA_COLS; col += 1) {
        const kind = getTileKind(col, row);
        if (kind === 'building') continue;
        const tile = new THREE.Mesh(
          tileGeometry,
          kind === 'canal' ? canalMaterial : streetMaterials[(row + col) % 2],
        );
        tile.position.copy(
          simulationToWorld(
            { x: (col + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE },
            kind === 'canal' ? -0.12 : -0.02,
          ),
        );
        tile.receiveShadow = true;
        this.scene.add(tile);

        if (kind === 'street' && (row === 6 || row === 7) && col % 2 === 0) {
          const dash = new THREE.Mesh(
            new THREE.BoxGeometry(TILE_WORLD_SIZE * 0.36, 0.018, 0.055),
            new THREE.MeshBasicMaterial({
              color: COLORS.streetLine,
              transparent: true,
              opacity: 0.48,
            }),
          );
          dash.position.set(tile.position.x, 0.061, tile.position.z);
          this.scene.add(dash);
        }
      }
    }

    for (const [index, rect] of BUILDING_RECTS.entries()) {
      const width = rect.width * TILE_WORLD_SIZE - 0.34;
      const depth = rect.height * TILE_WORLD_SIZE - 0.34;
      const height = 3.8 + (index % 2) * 1.05;
      const center = simulationToWorld({
        x: (rect.col + rect.width / 2) * TILE_SIZE,
        y: (rect.row + rect.height / 2) * TILE_SIZE,
      });

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? COLORS.building : COLORS.buildingAccent,
          roughness: 0.72,
          metalness: 0.08,
        }),
      );
      building.position.set(center.x, height / 2, center.z);
      building.castShadow = true;
      building.receiveShadow = true;
      this.scene.add(building);
      this.cameraObstacles.push(building);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.22, 0.24, depth + 0.22),
        new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.6, metalness: 0.22 }),
      );
      roof.position.set(center.x, height + 0.12, center.z);
      roof.castShadow = true;
      this.scene.add(roof);

      const solar = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.42, 0.08, depth * 0.34),
        new THREE.MeshStandardMaterial({ color: 0x174b63, metalness: 0.64, roughness: 0.24 }),
      );
      solar.position.set(center.x, height + 0.3, center.z);
      solar.rotation.x = -0.12;
      this.scene.add(solar);
    }

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(arenaWorldWidth, 0.2, arenaWorldHeight)),
      new THREE.LineBasicMaterial({ color: 0x6ab2c0, transparent: true, opacity: 0.44 }),
    );
    border.position.y = 0.02;
    this.scene.add(border);

    this.createBanderitas(
      -arenaWorldWidth * 0.34,
      arenaWorldWidth * 0.34,
      -arenaWorldHeight * 0.37,
    );
  }

  private createBanderitas(startX: number, endX: number, z: number): void {
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(startX, 5.4, z),
      new THREE.Vector3(endX, 5.4, z),
    ]);
    this.scene.add(
      new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: 0xc9e8ea, transparent: true, opacity: 0.52 }),
      ),
    );
    const colors = [TEAMS.A.color, 0xf5e4bc, TEAMS.B.color, 0xe85353];
    for (let index = 0; index < 16; index += 1) {
      const pennant = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.52, 3),
        new THREE.MeshBasicMaterial({
          color: colors[index % colors.length] ?? COLORS.neutral,
          side: THREE.DoubleSide,
        }),
      );
      pennant.position.set(THREE.MathUtils.lerp(startX, endX, (index + 0.5) / 16), 5.12, z);
      pennant.rotation.z = Math.PI;
      this.scene.add(pennant);
    }
  }

  private createRelay(): void {
    this.relayRoot.position.copy(simulationToWorld({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }));

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.55, 0.34, 32),
      new THREE.MeshStandardMaterial({ color: 0x142b33, metalness: 0.58, roughness: 0.42 }),
    );
    platform.position.y = 0.17;
    platform.receiveShadow = true;

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.28, 3.4, 16),
      this.relayMaterial,
    );
    mast.position.y = 1.9;
    mast.castShadow = true;

    const dish = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 0.34, 24, 1, true),
      this.relayMaterial,
    );
    dish.position.set(0.28, 3.55, 0);
    dish.rotation.z = -Math.PI / 2.7;
    dish.castShadow = true;

    const signalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.74, 0.055, 10, 44),
      this.relayMaterial,
    );
    signalRing.position.y = 2.72;
    signalRing.rotation.x = Math.PI / 2;

    this.relayCaptureRing.position.y = 0.12;
    const label = createLabelSprite('WEATHER RELAY');
    label.position.y = 4.65;
    const beam = this.createGuidanceBeam(COLORS.neutral, 8.5);
    this.relayRoot.add(platform, mast, dish, signalRing, this.relayCaptureRing, label, beam);
    this.scene.add(this.relayRoot);
  }

  private createCore(): void {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x81eafa,
      emissive: 0x1a8fa6,
      emissiveIntensity: 1.8,
      roughness: 0.16,
      metalness: 0.15,
      transmission: 0.25,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), material);
    crystal.position.y = 1.03;
    crystal.castShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.83, 0.045, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.8 }),
    );
    ring.position.y = 0.55;
    ring.rotation.x = Math.PI / 2;
    const label = createLabelSprite('RESILIENCE CORE', '#c7f8ff');
    label.position.y = 2.35;
    this.coreRoot.add(crystal, ring, label, this.createGuidanceBeam(0x72e6f1, 6.5));
    this.coreRoot.visible = false;
    this.scene.add(this.coreRoot);
  }

  private createPump(): void {
    this.pumpRoot.position.copy(simulationToWorld({ x: 9.5 * TILE_SIZE, y: 1.5 * TILE_SIZE }));
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.82, 0.35, 20),
      this.pumpMaterial,
    );
    base.position.y = 0.18;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.25, 0.72), this.pumpMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    const pipe = new THREE.Mesh(
      new THREE.TorusGeometry(0.54, 0.12, 10, 24, Math.PI),
      this.pumpMaterial,
    );
    pipe.position.set(0.35, 1.5, 0);
    pipe.rotation.y = Math.PI / 2;
    const label = createLabelSprite('BARANGAY PUMP', '#ffd676');
    label.position.y = 2.55;
    const pressurePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(
        PUMP_PRESSURE_RADIUS * WORLD_SCALE,
        PUMP_PRESSURE_RADIUS * WORLD_SCALE + 0.18,
        0.12,
        40,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xd97f28,
        emissive: 0x61300a,
        emissiveIntensity: 0.45,
        roughness: 0.62,
      }),
    );
    pressurePlate.position.y = 0.04;
    pressurePlate.receiveShadow = true;
    const plateRing = new THREE.Mesh(
      new THREE.TorusGeometry(PUMP_PRESSURE_RADIUS * WORLD_SCALE * 0.82, 0.09, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe38d }),
    );
    plateRing.position.y = 0.14;
    plateRing.rotation.x = Math.PI / 2;
    const pressureLabel = createLabelSprite('PARK RESCUE CRATE HERE', '#ffe6a3');
    pressureLabel.position.set(0, 0.45, 2.15);
    pressureLabel.scale.set(4.6, 0.82, 1);
    this.pumpRoot.add(
      pressurePlate,
      plateRing,
      base,
      body,
      pipe,
      label,
      pressureLabel,
      this.createGuidanceBeam(COLORS.warning, 6.2),
    );
    this.scene.add(this.pumpRoot);
  }

  private createBeacons(): void {
    for (const team of ['A', 'B'] as const) {
      const root = new THREE.Group();
      root.position.copy(simulationToWorld(BEACON_POSITIONS[team]));
      const material = new THREE.MeshStandardMaterial({
        color: TEAMS[team].color,
        emissive: TEAMS[team].color,
        emissiveIntensity: 0.52,
        metalness: 0.42,
        roughness: 0.32,
      });
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.08, 1.28, 0.32, team === 'A' ? 32 : 4),
        new THREE.MeshStandardMaterial({ color: 0x10242c, roughness: 0.75 }),
      );
      base.position.y = 0.16;
      const pillar = new THREE.Mesh(
        team === 'A'
          ? new THREE.CylinderGeometry(0.48, 0.62, 2.25, 28)
          : new THREE.OctahedronGeometry(0.76, 0),
        material,
      );
      pillar.position.y = team === 'A' ? 1.35 : 1.25;
      pillar.castShadow = true;
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.08, 0.07, 10, 48),
        new THREE.MeshBasicMaterial({ color: TEAMS[team].color, transparent: true, opacity: 0.78 }),
      );
      halo.position.y = 0.23;
      halo.rotation.x = Math.PI / 2;
      const label = createLabelSprite(
        `${TEAMS[team].name.toUpperCase()} BEACON`,
        TEAMS[team].cssColor,
      );
      label.position.y = 3.25;
      const beam = this.createGuidanceBeam(TEAMS[team].color, 7.4);
      root.add(base, pillar, halo, label, beam);
      this.beaconRoots.set(team, root);
      this.beaconMaterials.set(team, material);
      this.beaconBeams.set(team, beam);
      this.scene.add(root);
    }
  }

  private updateSnapshot(deltaSeconds: number): void {
    const snapshot = this.store.latest;
    if (!snapshot) return;

    if (snapshot.match.phase !== this.lastMatchPhase) {
      this.lastMatchPhase = snapshot.match.phase;
      this.cancelTargeting();
      this.localMenuOpen = false;
    }

    this.latestRenderedPlayers = this.store.interpolatedPlayers();
    this.syncPlayers(this.latestRenderedPlayers, deltaSeconds, snapshot.serverTime);
    this.syncProps(snapshot.props, snapshot.players, deltaSeconds);
    this.syncStormBarriers(snapshot.stormBarriers);
    this.updateInteractionPrompt(snapshot);
    if (snapshot.tick === this.lastRenderedTick) return;

    this.lastRenderedTick = snapshot.tick;
    this.updateFlood(snapshot.floodLevels);
    this.updateObjectives(snapshot);
    this.rain.visible = snapshot.match.floodStarted;
  }

  private syncPlayers(
    players: PublicPlayerState[],
    deltaSeconds: number,
    serverTime: number,
  ): void {
    const present = new Set<string>();
    for (const player of players) {
      present.add(player.id);
      let view = this.playerViews.get(player.id);
      if (!view) {
        view = this.createPlayerView(player);
        this.playerViews.set(player.id, view);
      }

      if (view.model.heroId !== player.heroId) this.replacePlayerModel(view, player);

      if (view.team !== player.team) {
        view.model.setTeam(player.team);
        view.team = player.team;
      }
      const position = simulationToWorld(player, player.elevation * WORLD_SCALE);
      let movementAmount = 0;
      if (view.initialized) {
        const deltaX = position.x - view.lastPosition.x;
        const deltaZ = position.z - view.lastPosition.z;
        const movementDistance = Math.hypot(deltaX, deltaZ);
        movementAmount = THREE.MathUtils.clamp(
          movementDistance / Math.max(0.001, deltaSeconds * 7.5),
          0,
          1,
        );
      }
      view.model.root.position.copy(position);
      view.lastPosition.copy(position);
      view.initialized = true;

      let facingLean = 0;
      const facingLength = Math.hypot(player.facing.x, player.facing.y);
      if (facingLength > 0.001) {
        const facingAngle = Math.atan2(player.facing.x, player.facing.y);
        const facingDelta = Math.atan2(
          Math.sin(facingAngle - view.model.root.rotation.y),
          Math.cos(facingAngle - view.model.root.rotation.y),
        );
        facingLean = THREE.MathUtils.clamp(facingDelta * 1.8, -1, 1);
        view.model.root.rotation.y = lerpAngle(
          view.model.root.rotation.y,
          facingAngle,
          1 - Math.exp(-deltaSeconds * 16),
        );
      }
      const diving = player.commandMode === 'diving';
      const stumbling = player.stumbleUntil > serverTime;

      const selected = player.id === this.commands.playerId;
      view.model.setSelected(selected);
      view.model.setCoreCarried(player.hasCore);
      view.model.setAlive(player.alive);
      view.model.root.visible = player.connected || player.alive;
      view.model.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      view.model.update(deltaSeconds, {
        movementAmount,
        alive: player.alive,
        selected,
        hasCore: player.hasCore,
        floodImmune: player.floodImmuneUntil > serverTime,
        elevation: player.elevation * WORLD_SCALE,
        jumping: !player.grounded,
        diving,
        stumbling,
        grabbing: player.grabbedObjectId !== null,
        facingLean,
      });
      view.label.visible = player.connected;
    }

    for (const [id, view] of this.playerViews) {
      if (!present.has(id)) this.removePlayerView(id, view);
    }
  }

  private createPlayerView(player: PublicPlayerState): PlayerVisual {
    const model = createCharacterModel({
      team: player.team,
      heroId: player.heroId,
      isLocalPlayer: player.id === this.commands.playerId,
    });
    model.root.userData.playerId = player.id;
    const label = createLabelSprite(
      `${player.name} · ${TEAMS[player.team].marker.toUpperCase()}`,
      TEAMS[player.team].cssColor,
      'rgba(3, 15, 22, 0.72)',
      420,
      84,
    );
    label.position.y = 3.55;
    label.scale.set(3.9, 0.78, 1);
    model.root.add(label);

    this.scene.add(model.root);

    return {
      model,
      label,
      lastPosition: new THREE.Vector3(),
      team: player.team,
      initialized: false,
    };
  }

  private replacePlayerModel(view: PlayerVisual, player: PublicPlayerState): void {
    const previousModel = view.model;
    const previousPosition = previousModel.root.position.clone();
    const previousQuaternion = previousModel.root.quaternion.clone();
    const previousVisibility = previousModel.root.visible;

    // The label belongs to the player view, not one hero rig, so retain it across model disposal.
    previousModel.root.remove(view.label);
    previousModel.dispose();

    const replacement = createCharacterModel({
      team: player.team,
      heroId: player.heroId,
      isLocalPlayer: player.id === this.commands.playerId,
    });
    replacement.root.position.copy(previousPosition);
    replacement.root.quaternion.copy(previousQuaternion);
    replacement.root.visible = previousVisibility;
    replacement.root.userData.playerId = player.id;
    replacement.root.add(view.label);
    this.scene.add(replacement.root);

    view.model = replacement;
    view.team = player.team;
    view.initialized = false;
  }

  private removePlayerView(id: string, view: PlayerVisual): void {
    this.scene.remove(view.model.root);
    view.model.dispose();
    this.playerViews.delete(id);
  }

  private syncProps(
    props: readonly PublicPropState[],
    players: readonly PublicPlayerState[],
    deltaSeconds: number,
  ): void {
    const present = new Set<string>();
    for (const prop of props) {
      present.add(prop.id);
      let visual = this.propViews.get(prop.id);
      if (!visual) {
        visual = this.createRescueCrate(prop.id);
        this.propViews.set(prop.id, visual);
      }
      const carrier = prop.grabbedBy
        ? players.find((player) => player.id === prop.grabbedBy)
        : undefined;
      const desired = simulationToWorld(
        prop,
        carrier ? 0.82 + carrier.elevation * WORLD_SCALE : 0.12,
      );
      visual.root.position.lerp(desired, 1 - Math.exp(-deltaSeconds * 18));
      visual.root.userData.grabbed = Boolean(prop.grabbedBy);
    }

    for (const [id, visual] of this.propViews) {
      if (present.has(id)) continue;
      this.scene.remove(visual.root);
      disposeObject(visual.root);
      this.propViews.delete(id);
    }
  }

  private createRescueCrate(id: string): PropVisual {
    const root = new THREE.Group();
    root.userData.propId = id;
    const crate = new THREE.Group();
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xffb72f,
      emissive: 0x6e3500,
      emissiveIntensity: 0.34,
      roughness: 0.48,
      metalness: 0.12,
    });
    const bumperMaterial = new THREE.MeshStandardMaterial({
      color: 0x20343a,
      roughness: 0.58,
      metalness: 0.38,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.86, 1.05), shellMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    const strapHorizontal = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.13, 1.11), bumperMaterial);
    const strapVertical = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.92, 1.11), bumperMaterial);
    const badge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20),
      new THREE.MeshStandardMaterial({
        color: 0xeafcff,
        emissive: 0x5ac8d8,
        emissiveIntensity: 0.65,
      }),
    );
    badge.rotation.x = Math.PI / 2;
    badge.position.z = 0.55;
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.055, 8, 20, Math.PI),
      bumperMaterial,
    );
    handle.position.y = 0.52;
    handle.rotation.z = Math.PI;
    const label = createLabelSprite('RESCUE CRATE · CLICK TO GRAB', '#fff0a4');
    label.position.y = 1.75;
    label.scale.set(4.5, 0.82, 1);
    crate.add(body, strapHorizontal, strapVertical, badge, handle, label);
    crate.position.y = 0.52;
    root.add(crate);

    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(
        RESCUE_CRATE_RADIUS * WORLD_SCALE * 1.05,
        RESCUE_CRATE_RADIUS * WORLD_SCALE * 1.18,
        36,
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffda60,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = -0.08;
    root.add(groundRing);
    this.scene.add(root);
    return { root, crate };
  }

  private syncStormBarriers(barriers: readonly PublicStormBarrierState[]): void {
    const present = new Set<string>();
    for (const barrier of barriers) {
      present.add(barrier.id);
      let visual = this.stormBarrierViews.get(barrier.id);
      if (!visual) {
        visual = this.createStormBarrier(barrier);
        this.stormBarrierViews.set(barrier.id, visual);
      }
      visual.root.position.copy(simulationToWorld(barrier));
      visual.targetAngle = -barrier.angle;
    }
    for (const [id, visual] of this.stormBarrierViews) {
      if (present.has(id)) continue;
      this.scene.remove(visual.root);
      disposeObject(visual.root);
      this.stormBarrierViews.delete(id);
    }
  }

  private createStormBarrier(barrier: PublicStormBarrierState): StormBarrierVisual {
    const root = new THREE.Group();
    const armLength = barrier.length * WORLD_SCALE;
    const armWidth = Math.max(0.32, barrier.width * WORLD_SCALE);
    const hazardMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5e59,
      emissive: 0x7a0c12,
      emissiveIntensity: 0.65,
      roughness: 0.42,
      metalness: 0.2,
    });
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff2b8,
      emissive: 0x7b5a16,
      emissiveIntensity: 0.42,
      roughness: 0.48,
    });
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.9, 0.42, 24),
      new THREE.MeshStandardMaterial({ color: 0x17333b, metalness: 0.54, roughness: 0.44 }),
    );
    base.position.y = 0.21;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 1.8, 20), hazardMaterial);
    hub.position.y = 0.94;
    hub.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.48, armWidth), hazardMaterial);
    arm.position.y = 1.28;
    arm.castShadow = true;
    for (const side of [-1, 1]) {
      const bumper = new THREE.Mesh(
        new THREE.SphereGeometry(armWidth * 0.68, 16, 12),
        stripeMaterial,
      );
      bumper.position.set((armLength / 2) * side, 1.28, 0);
      bumper.castShadow = true;
      root.add(bumper);
    }
    for (let index = -3; index <= 3; index += 2) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(armLength / 11, 0.52, armWidth + 0.035),
        stripeMaterial,
      );
      stripe.position.set((index * armLength) / 9, 1.28, 0);
      stripe.rotation.z = 0.28;
      root.add(stripe);
    }
    const label = createLabelSprite('STORM SPINNER · JUMP OR DIVE!', '#ffd0c7');
    label.position.y = 2.75;
    label.scale.set(4.5, 0.8, 1);
    root.add(base, hub, arm, label);
    root.rotation.y = -barrier.angle;
    root.position.copy(simulationToWorld(barrier));
    this.scene.add(root);
    return { root, targetAngle: -barrier.angle };
  }

  private updateFlood(levels: readonly number[]): void {
    const matrix = new THREE.Matrix4();
    let count = 0;
    for (let index = 0; index < Math.min(levels.length, ARENA_COLS * ARENA_ROWS); index += 1) {
      const level = levels[index] ?? 0;
      if (level <= 0) continue;
      const col = index % ARENA_COLS;
      const row = Math.floor(index / ARENA_COLS);
      const position = simulationToWorld(
        { x: (col + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE },
        0.095 + level * 0.055,
      );
      matrix.makeTranslation(position.x, position.y, position.z);
      this.floodMesh.setMatrixAt(count, matrix);
      this.floodMesh.setColorAt(
        count,
        new THREE.Color(level >= 2 ? COLORS.deepFlood : COLORS.shallowFlood),
      );
      count += 1;
    }
    this.floodMesh.count = count;
    this.floodMesh.instanceMatrix.needsUpdate = true;
    if (this.floodMesh.instanceColor) this.floodMesh.instanceColor.needsUpdate = true;
  }

  private updateObjectives(snapshot: PublicSnapshot): void {
    const relayTeam = snapshot.relay.ownerTeam ?? snapshot.relay.captureTeam;
    const relayColor = relayTeam ? colorForTeam(relayTeam) : new THREE.Color(COLORS.neutral);
    this.relayMaterial.color.copy(relayColor);
    this.relayMaterial.emissive.copy(relayColor);
    this.relayCaptureRing.material.color.copy(relayColor);
    this.relayCaptureRing.scale.setScalar(
      snapshot.relay.captureProgress > 0 ? 0.85 + snapshot.relay.captureProgress * 0.3 : 1,
    );

    const coreVisible = snapshot.core.status === 'available';
    this.coreRoot.visible = coreVisible;
    if (coreVisible) this.coreRoot.position.copy(simulationToWorld(snapshot.core));

    const pumpActive = snapshot.pump.state === 'active';
    this.pumpMaterial.color.setHex(pumpActive ? COLORS.success : COLORS.warning);
    this.pumpMaterial.emissive.setHex(pumpActive ? 0x154a34 : 0x4b2d08);
    this.pumpMaterial.emissiveIntensity = pumpActive ? 1.2 : 0.55;

    for (const team of ['A', 'B'] as const) {
      const material = this.beaconMaterials.get(team);
      if (material) material.emissiveIntensity = snapshot.match.winnerTeam === team ? 2.8 : 0.52;
      const beam = this.beaconBeams.get(team);
      if (beam) beam.material.opacity = this.commands.team === team ? 0.2 : 0.045;
    }
  }

  private updateKeyboardMovement(now: number): void {
    const direction = this.currentMovementDirection();
    const stopped = isZeroDirection(direction);
    const wasStopped = isZeroDirection(this.lastSteerDirection);

    if (!this.ensureCanControl(false) || this.localMenuOpen || this.targetMode) {
      if (!wasStopped && this.commands.connected) {
        this.commands.steer({ x: 0, y: 0 });
        this.lastSteerDirection = { x: 0, y: 0 };
      }
      return;
    }

    if (stopped) {
      if (!wasStopped) {
        this.commands.steer(direction);
        this.lastSteerDirection = direction;
      }
      return;
    }
    if (now - this.lastSteerCommandAt < STEER_COMMAND_INTERVAL_MS) return;
    this.commands.steer(direction);
    this.lastSteerDirection = direction;
    this.lastSteerCommandAt = now;
  }

  private currentMovementDirection(): Vector2 {
    const horizontal =
      Number(this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) -
      Number(this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft'));
    const vertical =
      Number(this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) -
      Number(this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown'));
    return cameraRelativeDirection(horizontal, vertical, this.cameraYaw);
  }

  private updateCamera(deltaSeconds: number, now: number): void {
    const localView = this.commands.playerId ? this.playerViews.get(this.commands.playerId) : null;
    const desiredTarget = localView
      ? localView.model.root.position.clone().add(new THREE.Vector3(0, 1.25, 0))
      : new THREE.Vector3(0, 1.1, 0);
    this.cameraTarget.lerp(desiredTarget, 1 - Math.exp(-deltaSeconds * 8.5));

    const horizontalDistance = Math.cos(this.cameraPitch) * this.cameraDistance;
    const desiredCamera = new THREE.Vector3(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontalDistance,
      this.cameraTarget.y + Math.sin(this.cameraPitch) * this.cameraDistance + 0.65,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontalDistance,
    );
    const cameraOffset = desiredCamera.clone().sub(this.cameraTarget);
    const desiredDistance = cameraOffset.length();
    cameraOffset.normalize();
    this.cameraCollisionRaycaster.set(this.cameraTarget, cameraOffset);
    this.cameraCollisionRaycaster.near = 0.25;
    this.cameraCollisionRaycaster.far = desiredDistance;
    const collision = this.cameraCollisionRaycaster.intersectObjects(
      this.cameraObstacles,
      false,
    )[0];
    const safeDistance = collision
      ? Math.max(1.6, Math.min(desiredDistance, collision.distance - 0.45))
      : desiredDistance;
    desiredCamera.copy(this.cameraTarget).addScaledVector(cameraOffset, safeDistance);
    this.camera.position.lerp(desiredCamera, 1 - Math.exp(-deltaSeconds * 16));

    if (now < this.shakeUntil) {
      const strength = ((this.shakeUntil - now) / 240) * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * strength;
      this.camera.position.y += (Math.random() - 0.5) * strength;
    }
    this.camera.lookAt(this.cameraTarget);
  }

  private updateTargeting(now: number): void {
    if (!this.targetMode) return;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.targetPointWorld);
    if (!hit) return;

    const target = worldToSimulation(hit);
    const local = this.getLocalPlayer();
    if (!local) return;
    const inRange = distance(local, target) <= ABILITIES.Q.range;
    const color = inRange ? 0x72e6f1 : 0xff766e;
    this.targetMarker.material.color.setHex(color);
    this.targetLine.material.color.setHex(color);
    this.targetMarker.position.set(hit.x, 0.13 + Math.sin(now / 130) * 0.025, hit.z);
    this.targetMarker.rotation.z = now / 900;
    const origin = simulationToWorld(local, 0.92);
    this.targetLine.geometry.setFromPoints([origin, new THREE.Vector3(hit.x, 0.12, hit.z)]);
  }

  private updateEffects(now: number): void {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      if (!effect) continue;
      const progress = (now - effect.startedAt) / effect.durationMs;
      if (progress >= 1) {
        this.scene.remove(effect.root);
        disposeObject(effect.root);
        this.effects.splice(index, 1);
        continue;
      }
      const eased = 1 - (1 - progress) * (1 - progress);
      effect.root.scale.setScalar(1 + eased * effect.maximumScale);
      setObjectOpacity(effect.root, 1 - progress);
    }
  }

  private updateAtmosphere(deltaSeconds: number): void {
    this.coreRoot.rotation.y += deltaSeconds * 1.15;
    this.relayCaptureRing.rotation.z += deltaSeconds * 0.42;
    for (const [team, root] of this.beaconRoots) {
      root.rotation.y += deltaSeconds * (team === 'A' ? 0.08 : -0.08);
    }
    for (const visual of this.propViews.values()) {
      visual.crate.rotation.y += deltaSeconds * (visual.root.userData.grabbed ? 0.9 : 0.18);
      visual.crate.position.y = 0.52 + Math.sin(performance.now() / 360) * 0.035;
    }
    for (const visual of this.stormBarrierViews.values()) {
      visual.root.rotation.y = lerpAngle(
        visual.root.rotation.y,
        visual.targetAngle,
        1 - Math.exp(-deltaSeconds * 18),
      );
    }
    this.floodMesh.position.y = Math.sin(performance.now() / 720) * 0.025;
    if (this.rain.visible) {
      const positions = this.rain.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const nextY = positions.getY(index) - deltaSeconds * 8.5;
        positions.setY(index, nextY < 0.2 ? 14 : nextY);
      }
      positions.needsUpdate = true;
    }
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', this.suppressContextMenu);
    canvas.addEventListener('pointerdown', this.handlePointerDownBound);
    canvas.addEventListener('pointermove', this.handlePointerMoveBound);
    canvas.addEventListener('pointerup', this.handlePointerUpBound);
    canvas.addEventListener('pointercancel', this.handlePointerUpBound);
    canvas.addEventListener('wheel', this.handleWheelBound, { passive: false });
    window.addEventListener('keydown', this.handleKeyDownBound);
    window.addEventListener('keyup', this.handleKeyUpBound);
    window.addEventListener('resize', this.handleResizeBound);
  }

  private unbindInput(): void {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('contextmenu', this.suppressContextMenu);
    canvas.removeEventListener('pointerdown', this.handlePointerDownBound);
    canvas.removeEventListener('pointermove', this.handlePointerMoveBound);
    canvas.removeEventListener('pointerup', this.handlePointerUpBound);
    canvas.removeEventListener('pointercancel', this.handlePointerUpBound);
    canvas.removeEventListener('wheel', this.handleWheelBound);
    window.removeEventListener('keydown', this.handleKeyDownBound);
    window.removeEventListener('keyup', this.handleKeyUpBound);
    window.removeEventListener('resize', this.handleResizeBound);
  }

  private handlePointerDown(event: PointerEvent): void {
    this.updatePointerCoordinates(event);
    this.renderer.domElement.focus({ preventScroll: true });

    if (this.targetMode && event.button === 0) {
      event.preventDefault();
      if (!this.ensureCanControl()) return;
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
      if (!hit) return;
      this.commands.castAbility(this.targetMode.slot, worldToSimulation(hit));
      this.cancelTargeting();
      return;
    }

    if (event.button !== 0 && event.button !== 2) return;
    this.orbiting = true;
    this.orbitPointerId = event.pointerId;
    this.orbitStart = { x: event.clientX, y: event.clientY };
    this.orbitDragDistance = 0;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  }

  private handlePointerMove(event: PointerEvent): void {
    this.updatePointerCoordinates(event);
    if (!this.orbiting || this.orbitPointerId !== event.pointerId) return;
    const deltaX = event.clientX - this.orbitStart.x;
    const deltaY = event.clientY - this.orbitStart.y;
    this.orbitDragDistance += Math.hypot(deltaX, deltaY);
    this.cameraYaw -= deltaX * 0.006 * this.cameraSensitivity;
    this.cameraPitch = THREE.MathUtils.clamp(
      this.cameraPitch + deltaY * 0.004 * this.cameraSensitivity,
      0.2,
      0.82,
    );
    this.orbitStart = { x: event.clientX, y: event.clientY };
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.orbitPointerId !== event.pointerId) return;
    const wasClick = event.button === 0 && this.orbitDragDistance < 5;
    this.orbiting = false;
    this.orbitPointerId = null;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    if (wasClick && !this.targetMode && !this.localMenuOpen) this.handleWorldClick();
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    this.cameraDistance = THREE.MathUtils.clamp(
      this.cameraDistance + event.deltaY * 0.012,
      CAMERA_MIN_DISTANCE,
      CAMERA_MAX_DISTANCE,
    );
  }

  private updatePointerCoordinates(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
      -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1,
    );
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;
    const movementCodes = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ]);
    if (movementCodes.has(event.code)) {
      event.preventDefault();
      this.keysHeld.add(event.code);
      return;
    }

    const captured = new Set([
      'KeyQ',
      'KeyE',
      'KeyR',
      'KeyF',
      'KeyX',
      'KeyC',
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'Escape',
      'Tab',
    ]);
    if (captured.has(event.code)) event.preventDefault();
    if (event.code === 'Tab') {
      this.ui.setScoreboardVisible(true);
      return;
    }
    if (event.repeat) return;

    if (event.code === 'Escape') {
      if (this.targetMode) {
        this.cancelTargeting('Targeting cancelled');
      } else if (this.commands.connected) {
        this.localMenuOpen = !this.localMenuOpen;
        this.ui.togglePause();
      }
      return;
    }
    if (this.localMenuOpen) return;

    switch (event.code) {
      case 'KeyQ':
        this.beginAbilityTargeting('Q');
        break;
      case 'KeyE':
        // W remains the shared/network slot; E is its third-person keyboard binding.
        this.beginAbilityTargeting('W');
        break;
      case 'KeyR':
        this.beginAbilityTargeting(event.code.slice(-1) as AbilitySlot);
        break;
      case 'KeyF':
        if (this.ensureCanControl()) this.contextualInteract();
        break;
      case 'KeyX':
        if (this.ensureCanControl()) this.attackMoveForward();
        break;
      case 'Space':
        if (this.ensureCanControl()) this.commands.jump();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        if (this.ensureCanControl()) this.triggerDive();
        break;
      case 'KeyC':
        this.cameraYaw = Math.PI;
        this.cameraPitch = 0.38;
        this.cameraDistance = 7.6;
        break;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.keysHeld.delete(event.code);
    if (event.code === 'Tab') {
      event.preventDefault();
      this.ui.setScoreboardVisible(false);
    }
  }

  private attackMoveForward(): void {
    const local = this.getLocalPlayer();
    if (!local) return;
    const destination = clampToArena({
      x: local.x - Math.sin(this.cameraYaw) * 340,
      y: local.y - Math.cos(this.cameraYaw) * 340,
    });
    this.commands.attackMove(destination);
  }

  private triggerDive(): void {
    const local = this.getLocalPlayer();
    if (!local) return;
    const movementDirection = this.currentMovementDirection();
    const direction = isZeroDirection(movementDirection) ? local.facing : movementDirection;
    if (isZeroDirection(direction)) {
      this.ui.showToast('Hold a movement direction, then press Shift to dive.', 'warning');
      return;
    }
    this.commands.dive(direction);
  }

  private handleWorldClick(): void {
    if (!this.ensureCanControl(false)) return;
    if (this.attackClickedHostile()) return;
    this.grabNearestRescueCrate();
  }

  private attackClickedHostile(): boolean {
    if (!this.ensureCanControl(false)) return false;
    const local = this.getLocalPlayer();
    if (!local) return false;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hostileRoots = this.latestRenderedPlayers
      .filter((player) => player.team !== local.team && player.alive)
      .map((player) => this.playerViews.get(player.id)?.model.root)
      .filter((root): root is THREE.Group => Boolean(root));
    const hit = this.raycaster.intersectObjects(hostileRoots, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && typeof object.userData.playerId !== 'string') object = object.parent;
    if (object && typeof object.userData.playerId === 'string') {
      this.commands.attackTarget(object.userData.playerId);
      return true;
    }
    return false;
  }

  private grabNearestRescueCrate(): void {
    const snapshot = this.store.latest;
    const local = this.getLocalPlayer();
    if (!snapshot || !local) return;
    if (local.grabbedObjectId) {
      this.commands.grab();
      return;
    }
    let nearest: PublicPropState | null = null;
    let nearestDistance = GRAB_RADIUS;
    for (const prop of snapshot.props) {
      if (prop.grabbedBy) continue;
      const candidateDistance = distance(local, prop);
      if (candidateDistance <= nearestDistance) {
        nearest = prop;
        nearestDistance = candidateDistance;
      }
    }
    if (nearest) {
      this.commands.grab(nearest.id);
    } else {
      this.ui.showToast('Move closer to the gold Rescue Crate to grab it.', 'warning');
    }
  }

  private updateInteractionPrompt(snapshot: PublicSnapshot): void {
    const local = this.getLocalPlayer();
    if (!local || snapshot.match.phase !== 'active' || !local.alive) {
      this.interactionPrompt.visible = false;
      this.grabPrompt.visible = false;
      this.releasePrompt.visible = false;
      return;
    }
    const ownBeacon = snapshot.beacons.find((beacon) => beacon.team === local.team);
    this.interactionPrompt.visible = Boolean(
      (local.hasCore && ownBeacon && distance(local, ownBeacon) <= BEACON_INTERACT_RADIUS) ||
        (snapshot.core.status === 'available' &&
          snapshot.core.earnedByTeam === local.team &&
          distance(local, snapshot.core) <= CORE_INTERACT_RADIUS) ||
        distance(local, snapshot.relay) <= RELAY_CAPTURE_RADIUS,
    );
    const crateInRange = snapshot.props.some(
      (prop) => !prop.grabbedBy && distance(local, prop) <= GRAB_RADIUS,
    );
    this.grabPrompt.visible = !local.grabbedObjectId && crateInRange;
    this.releasePrompt.visible = Boolean(local.grabbedObjectId);
  }

  private contextualInteract(): void {
    const snapshot = this.store.latest;
    const local = this.getLocalPlayer();
    if (!snapshot || !local) return;
    const ownBeacon = snapshot.beacons.find((beacon) => beacon.team === local.team);
    if (local.hasCore && ownBeacon && distance(local, ownBeacon) <= BEACON_INTERACT_RADIUS) {
      this.commands.interact(ownBeacon.id);
      return;
    }
    if (
      snapshot.core.status === 'available' &&
      snapshot.core.earnedByTeam === local.team &&
      distance(local, snapshot.core) <= CORE_INTERACT_RADIUS
    ) {
      this.commands.interact(snapshot.core.id);
      return;
    }
    if (distance(local, snapshot.relay) <= RELAY_CAPTURE_RADIUS) {
      this.commands.interact(snapshot.relay.id);
      return;
    }
    if (
      snapshot.pump.state === 'offline' &&
      distance(local, snapshot.pump) <= PUMP_PRESSURE_RADIUS
    ) {
      this.ui.showToast('Carry the Rescue Crate onto this orange pressure plate.', 'warning');
      return;
    }
    this.ui.showToast('No response object is close enough to interact with.', 'warning');
  }

  private ensureCanControl(showMessage = true): boolean {
    if (!this.commands.connected) {
      if (showMessage)
        this.ui.showToast('Join the response room before issuing commands.', 'error');
      return false;
    }
    if (this.store.latest?.match.phase !== 'active') {
      if (showMessage)
        this.ui.showToast('Responder controls unlock when the active phase begins.', 'warning');
      return false;
    }
    const local = this.getLocalPlayer();
    if (!local?.alive) {
      if (showMessage) this.ui.showToast('Your responder is waiting to redeploy.', 'warning');
      return false;
    }
    return true;
  }

  private getLocalPlayer(): PublicPlayerState | null {
    return (
      this.latestRenderedPlayers.find((player) => player.id === this.commands.playerId) ?? null
    );
  }

  private cancelTargeting(message?: string): void {
    this.targetMode = null;
    this.targetMarker.visible = false;
    this.targetLine.visible = false;
    this.ui.setTargeting(false);
    if (message) this.ui.showToast(message, 'info');
  }

  private pulseAt(position: THREE.Vector3, color: number, maximumScale: number): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.48, 48), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.position.y = Math.max(0.13, position.y + 0.13);
    this.scene.add(ring);
    this.effects.push({ root: ring, startedAt: performance.now(), durationMs: 680, maximumScale });
  }

  private drawRescueLine(from: Vector2, to: Vector2): void {
    const fromWorld = simulationToWorld(from, 0.82);
    const toWorld = simulationToWorld(to, 0.3);
    const geometry = new THREE.BufferGeometry().setFromPoints([fromWorld, toWorld]);
    const material = new THREE.LineBasicMaterial({
      color: 0xd4fbff,
      transparent: true,
      opacity: 1,
    });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.effects.push({
      root: line,
      startedAt: performance.now(),
      durationMs: 520,
      maximumScale: 0.03,
    });
    this.pulseAt(toWorld, 0x77e5f0, 2.1);
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(width, height, false);
  }

  private createReticle(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.strokeStyle = 'rgba(218, 250, 255, 0.72)';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(48, 48, 10, 0, Math.PI * 2);
    context.moveTo(48, 24);
    context.lineTo(48, 34);
    context.moveTo(48, 62);
    context.lineTo(48, 72);
    context.moveTo(24, 48);
    context.lineTo(34, 48);
    context.moveTo(62, 48);
    context.lineTo(72, 48);
    context.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(0.055);
    sprite.renderOrder = 999;
    return sprite;
  }

  private createGuidanceBeam(
    color: number,
    height: number,
  ): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.42, height, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.y = height / 2;
    beam.renderOrder = 1;
    return beam;
  }
}
