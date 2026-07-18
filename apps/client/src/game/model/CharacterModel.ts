import { TEAMS, type HeroId, type TeamId } from '@signal-zero/shared';
import * as THREE from 'three';

const CHARACTER_HEIGHT = 2.12;
const TEAM_EMISSIVE_INTENSITY = 0.22;

interface HeroVisualProfile {
  readonly displayName: string;
  readonly accentColor: number;
  readonly shellColor: number;
  readonly undersuitColor: number;
  readonly skinColor: number;
  readonly hairColor: number;
  readonly torsoTopRadius: number;
  readonly torsoBottomRadius: number;
  readonly torsoHeight: number;
  readonly shoulderX: number;
  readonly armRadius: number;
  readonly armLength: number;
  readonly hipX: number;
  readonly legRadius: number;
  readonly legLength: number;
  readonly headY: number;
  readonly headScale: readonly [number, number, number];
}

/** Hero colors identify roles while team colors remain reserved for badges, lights, and selection. */
const HERO_VISUALS = {
  maya: {
    displayName: 'Maya',
    accentColor: 0x2fd0c7,
    shellColor: 0x124f5b,
    undersuitColor: 0x17363f,
    skinColor: 0xb9785c,
    hairColor: 0x111a20,
    torsoTopRadius: 0.29,
    torsoBottomRadius: 0.37,
    torsoHeight: 0.57,
    shoulderX: 0.39,
    armRadius: 0.095,
    armLength: 0.43,
    hipX: 0.17,
    legRadius: 0.12,
    legLength: 0.53,
    headY: 1.65,
    headScale: [0.9, 1.04, 0.94],
  },
  tomas: {
    displayName: 'Tomas',
    accentColor: 0xf29c38,
    shellColor: 0x3c5052,
    undersuitColor: 0x26383c,
    skinColor: 0x9f664d,
    hairColor: 0x171b1b,
    torsoTopRadius: 0.36,
    torsoBottomRadius: 0.43,
    torsoHeight: 0.61,
    shoulderX: 0.47,
    armRadius: 0.12,
    armLength: 0.46,
    hipX: 0.2,
    legRadius: 0.145,
    legLength: 0.53,
    headY: 1.67,
    headScale: [0.96, 1, 0.98],
  },
  kidlat: {
    displayName: 'Kidlat',
    accentColor: 0xffd449,
    shellColor: 0x17405b,
    undersuitColor: 0x142d3d,
    skinColor: 0xc48763,
    hairColor: 0x101820,
    torsoTopRadius: 0.265,
    torsoBottomRadius: 0.325,
    torsoHeight: 0.55,
    shoulderX: 0.36,
    armRadius: 0.085,
    armLength: 0.46,
    hipX: 0.155,
    legRadius: 0.105,
    legLength: 0.56,
    headY: 1.67,
    headScale: [0.86, 1.06, 0.9],
  },
  amihan: {
    displayName: 'Amihan',
    accentColor: 0xa99af7,
    shellColor: 0x28566a,
    undersuitColor: 0x213a4a,
    skinColor: 0xab6c54,
    hairColor: 0x17202a,
    torsoTopRadius: 0.3,
    torsoBottomRadius: 0.41,
    torsoHeight: 0.66,
    shoulderX: 0.405,
    armRadius: 0.09,
    armLength: 0.47,
    hipX: 0.165,
    legRadius: 0.11,
    legLength: 0.55,
    headY: 1.69,
    headScale: [0.88, 1.08, 0.92],
  },
} as const satisfies Record<HeroId, HeroVisualProfile>;

function createDiamondGeometry(radius: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, radius);
  shape.lineTo(radius, 0);
  shape.lineTo(0, -radius);
  shape.lineTo(-radius, 0);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export interface CharacterModelOptions {
  readonly team: TeamId;
  readonly heroId: HeroId;
  readonly isLocalPlayer?: boolean;
}

export interface CharacterAnimationState {
  /** Normalized visual speed. Authoritative movement still comes from server snapshots. */
  readonly movementAmount: number;
  readonly alive?: boolean;
  readonly selected?: boolean;
  readonly hasCore?: boolean;
  readonly floodImmune?: boolean;
  /** Authoritative height above the ground in rendered world units, used only for posing. */
  readonly elevation?: number;
  readonly jumping?: boolean;
  readonly diving?: boolean;
  /** Boolean for a standard reaction or 0..1 for an explicitly blended reaction. */
  readonly stumbling?: boolean | number;
  readonly grabbing?: boolean;
  /** Signed turn/strafe lean from -1 (left) to 1 (right). */
  readonly facingLean?: number;
}

/**
 * A procedural, asset-free responder model for the third-person prototype.
 * The root origin sits between the responder's feet and the model faces local +Z.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly heroId: HeroId;

  private readonly rig = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly hood = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly signalBeacon = new THREE.Group();
  private readonly coreCradle = new THREE.Group();
  private readonly floodAura = new THREE.Group();
  private readonly circleSelection: THREE.Mesh;
  private readonly diamondSelection: THREE.LineLoop;
  private readonly circleBadge: THREE.Mesh;
  private readonly diamondBadge: THREE.Mesh;
  private readonly teamMaterial: THREE.MeshStandardMaterial;
  private readonly teamGlowMaterial: THREE.MeshStandardMaterial;
  private readonly accentMaterial: THREE.MeshStandardMaterial;
  private readonly accentGlowMaterial: THREE.MeshStandardMaterial;
  private readonly selectionMaterial: THREE.MeshBasicMaterial;
  private readonly diamondSelectionMaterial: THREE.LineBasicMaterial;

  private team: TeamId;
  private elapsedSeconds = 0;
  private alive = true;
  private selected: boolean;
  private hasCore = false;
  private floodImmune = false;
  private wasJumping = false;
  private airborneSeconds = 0;
  private landingBounce = 0;
  private stumbleBlend = 0;

  constructor(options: CharacterModelOptions) {
    this.team = options.team;
    this.heroId = options.heroId;
    this.selected = options.isLocalPlayer ?? false;

    const teamColor = TEAMS[this.team].color;
    const profile = HERO_VISUALS[this.heroId];
    this.teamMaterial = new THREE.MeshStandardMaterial({
      color: teamColor,
      emissive: teamColor,
      emissiveIntensity: TEAM_EMISSIVE_INTENSITY,
      metalness: 0.18,
      roughness: 0.5,
      flatShading: true,
    });
    this.teamGlowMaterial = new THREE.MeshStandardMaterial({
      color: teamColor,
      emissive: teamColor,
      emissiveIntensity: 1.35,
      metalness: 0.2,
      roughness: 0.28,
      flatShading: true,
    });
    this.accentMaterial = new THREE.MeshStandardMaterial({
      color: profile.accentColor,
      emissive: profile.accentColor,
      emissiveIntensity: 0.16,
      metalness: 0.14,
      roughness: 0.46,
      flatShading: true,
    });
    this.accentGlowMaterial = new THREE.MeshStandardMaterial({
      color: profile.accentColor,
      emissive: profile.accentColor,
      emissiveIntensity: 1.45,
      metalness: 0.2,
      roughness: 0.24,
      flatShading: true,
    });
    this.selectionMaterial = new THREE.MeshBasicMaterial({
      color: teamColor,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.diamondSelectionMaterial = new THREE.LineBasicMaterial({
      color: teamColor,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    this.circleSelection = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.57, 32, 1, 0, Math.PI * 1.72),
      this.selectionMaterial,
    );
    const diamondPoints = [
      new THREE.Vector3(0, 0.018, 0.62),
      new THREE.Vector3(0.62, 0.018, 0),
      new THREE.Vector3(0, 0.018, -0.62),
      new THREE.Vector3(-0.62, 0.018, 0),
    ];
    this.diamondSelection = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(diamondPoints),
      this.diamondSelectionMaterial,
    );
    this.circleBadge = new THREE.Mesh(
      new THREE.RingGeometry(0.058, 0.09, 12),
      this.teamGlowMaterial,
    );
    this.diamondBadge = new THREE.Mesh(createDiamondGeometry(0.095), this.teamGlowMaterial);

    this.root.name = `${profile.displayName} responder model`;
    this.rig.name = `${profile.displayName} visual rig`;
    this.root.userData.heroId = this.heroId;
    this.root.add(this.rig);
    this.buildResponder(profile);
    this.buildSelectionMarkers();
    this.buildFloodAura();
    this.setTeam(this.team);
    this.setSelected(this.selected);
    this.setCoreCarried(false);
  }

  get height(): number {
    return CHARACTER_HEIGHT;
  }

  setTeam(team: TeamId): void {
    this.team = team;
    const color = TEAMS[team].color;
    this.teamMaterial.color.setHex(color);
    this.teamMaterial.emissive.setHex(color);
    this.teamGlowMaterial.color.setHex(color);
    this.teamGlowMaterial.emissive.setHex(color);
    this.selectionMaterial.color.setHex(color);
    this.diamondSelectionMaterial.color.setHex(color);

    const isCircleTeam = TEAMS[team].marker === 'circle';
    this.circleBadge.visible = isCircleTeam;
    this.diamondBadge.visible = !isCircleTeam;
    this.refreshSelectionVisibility();
  }

  setCoreCarried(carried: boolean): void {
    this.hasCore = carried;
    this.coreCradle.visible = carried && this.alive;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.refreshSelectionVisibility();
  }

  setAlive(alive: boolean): void {
    this.alive = alive;
    this.coreCradle.visible = this.hasCore && alive;
    this.floodAura.visible = this.floodImmune && alive;
    this.refreshSelectionVisibility();
  }

  setFloodImmune(immune: boolean): void {
    this.floodImmune = immune;
    this.floodAura.visible = immune && this.alive;
  }

  update(deltaSeconds: number, state: CharacterAnimationState): void {
    const safeDelta = THREE.MathUtils.clamp(deltaSeconds, 0, 0.1);
    const movement = THREE.MathUtils.clamp(state.movementAmount, 0, 1);
    const elevation = Math.max(0, state.elevation ?? 0);
    const shouldBeAlive = state.alive ?? this.alive;
    const jumping = (state.jumping ?? false) && shouldBeAlive;
    const diving = (state.diving ?? false) && shouldBeAlive;
    const grabbing = (state.grabbing ?? false) && shouldBeAlive;
    const facingLean = THREE.MathUtils.clamp(state.facingLean ?? 0, -1, 1);
    const stumbleTarget =
      typeof state.stumbling === 'number'
        ? THREE.MathUtils.clamp(state.stumbling, 0, 1)
        : state.stumbling
          ? 1
          : 0;
    this.elapsedSeconds += safeDelta;

    if (state.alive !== undefined && state.alive !== this.alive) this.setAlive(state.alive);
    if (state.selected !== undefined && state.selected !== this.selected) {
      this.setSelected(state.selected);
    }
    if (state.hasCore !== undefined && state.hasCore !== this.hasCore) {
      this.setCoreCarried(state.hasCore);
    }
    if (state.floodImmune !== undefined && state.floodImmune !== this.floodImmune) {
      this.setFloodImmune(state.floodImmune);
    }

    if (jumping) {
      this.airborneSeconds = this.wasJumping ? this.airborneSeconds + safeDelta : 0;
    } else {
      if (this.wasJumping) this.landingBounce = 1;
      this.airborneSeconds = 0;
    }
    this.wasJumping = jumping;
    this.landingBounce = Math.max(0, this.landingBounce - safeDelta * 4.8);
    const stumbleResponse =
      1 - Math.exp(-safeDelta * (stumbleTarget > this.stumbleBlend ? 18 : 5.5));
    this.stumbleBlend = THREE.MathUtils.lerp(this.stumbleBlend, stumbleTarget, stumbleResponse);

    const walkPhase = this.elapsedSeconds * (3.5 + movement * 6.5);
    const stride = Math.sin(walkPhase) * movement;
    const idleBreath = Math.sin(this.elapsedSeconds * 2.1);
    const settle = 1 - Math.exp(-safeDelta * 12);
    const quickSettle = 1 - Math.exp(-safeDelta * 18);
    const landingPulse = Math.sin(this.landingBounce * Math.PI) * this.landingBounce;
    const takeoffSquash = jumping ? THREE.MathUtils.clamp(1 - this.airborneSeconds / 0.1, 0, 1) : 0;
    const airborneStretch = jumping ? 0.07 + THREE.MathUtils.clamp(elevation * 0.025, 0, 0.09) : 0;
    const squash = takeoffSquash * 0.13 + landingPulse * 0.16 + (diving ? 0.06 : 0);
    const targetHorizontalScale = 1 + squash;
    const targetVerticalScale = 1 - squash + airborneStretch;
    this.rig.scale.x = THREE.MathUtils.lerp(this.rig.scale.x, targetHorizontalScale, quickSettle);
    this.rig.scale.y = THREE.MathUtils.lerp(this.rig.scale.y, targetVerticalScale, quickSettle);
    this.rig.scale.z = THREE.MathUtils.lerp(
      this.rig.scale.z,
      targetHorizontalScale + (diving ? 0.08 : 0),
      quickSettle,
    );

    const stumbleWobble = Math.sin(this.elapsedSeconds * 24) * 0.24 * this.stumbleBlend;
    const targetPitch = this.alive
      ? (diving ? 1.08 : movement * 0.09) + this.stumbleBlend * 0.24
      : 0;
    const targetRoll = this.alive
      ? -facingLean * 0.17 - stride * 0.04 + stumbleWobble
      : -Math.PI / 2;
    this.rig.rotation.x = THREE.MathUtils.lerp(this.rig.rotation.x, targetPitch, settle);
    this.rig.rotation.z = THREE.MathUtils.lerp(this.rig.rotation.z, targetRoll, settle);
    const stepBounce = Math.abs(Math.sin(walkPhase * 2)) * 0.045 * movement;
    const targetRigHeight = this.alive
      ? stepBounce + (diving ? 0.42 : this.stumbleBlend * 0.1)
      : 0.32;
    this.rig.position.y = THREE.MathUtils.lerp(this.rig.position.y, targetRigHeight, settle);
    this.rig.position.z = THREE.MathUtils.lerp(this.rig.position.z, diving ? 0.32 : 0, settle);

    const idlePhase = this.elapsedSeconds % 7.5;
    const idleGesture =
      movement < 0.08 &&
      !jumping &&
      !diving &&
      !grabbing &&
      this.stumbleBlend < 0.08 &&
      idlePhase > 5
        ? Math.sin(((idlePhase - 5) / 2.5) * Math.PI)
        : 0;
    let leftArmPitch = stride * 0.78;
    let rightArmPitch = -stride * 0.78 - idleGesture * 0.2;
    let leftArmRoll = 0.08;
    let rightArmRoll = -0.08 + idleGesture * 1.9;
    let leftLegPitch = -stride * 0.82;
    let rightLegPitch = stride * 0.82;

    if (jumping) {
      leftArmPitch -= 0.34;
      rightArmPitch -= 0.34;
      leftLegPitch = 0.42;
      rightLegPitch = 0.42;
    }
    if (grabbing) {
      leftArmPitch = -1.26;
      rightArmPitch = -1.26;
      leftArmRoll = -0.13;
      rightArmRoll = 0.13;
    }
    if (diving) {
      leftArmPitch = -1.48;
      rightArmPitch = -1.48;
      leftArmRoll = -0.18;
      rightArmRoll = 0.18;
      leftLegPitch = 0.5;
      rightLegPitch = 0.5;
    }
    if (this.stumbleBlend > 0.01) {
      leftArmPitch += Math.sin(this.elapsedSeconds * 20) * 0.65 * this.stumbleBlend;
      rightArmPitch -= Math.sin(this.elapsedSeconds * 22) * 0.65 * this.stumbleBlend;
      leftArmRoll -= 0.72 * this.stumbleBlend;
      rightArmRoll += 0.72 * this.stumbleBlend;
      leftLegPitch += stumbleWobble;
      rightLegPitch -= stumbleWobble;
    }

    const limbSettle = this.alive ? quickSettle : settle;
    this.leftArm.rotation.x = THREE.MathUtils.lerp(
      this.leftArm.rotation.x,
      leftArmPitch,
      limbSettle,
    );
    this.rightArm.rotation.x = THREE.MathUtils.lerp(
      this.rightArm.rotation.x,
      rightArmPitch,
      limbSettle,
    );
    this.leftArm.rotation.z = THREE.MathUtils.lerp(
      this.leftArm.rotation.z,
      leftArmRoll,
      limbSettle,
    );
    this.rightArm.rotation.z = THREE.MathUtils.lerp(
      this.rightArm.rotation.z,
      rightArmRoll,
      limbSettle,
    );
    this.leftLeg.rotation.x = THREE.MathUtils.lerp(
      this.leftLeg.rotation.x,
      leftLegPitch,
      limbSettle,
    );
    this.rightLeg.rotation.x = THREE.MathUtils.lerp(
      this.rightLeg.rotation.x,
      rightLegPitch,
      limbSettle,
    );

    this.torso.scale.y = 1 + idleBreath * 0.025 * (1 - movement);
    this.torso.rotation.z = THREE.MathUtils.lerp(
      this.torso.rotation.z,
      -stride * 0.07 + idleBreath * 0.018 * (1 - movement),
      settle,
    );
    this.hood.rotation.z = THREE.MathUtils.lerp(
      this.hood.rotation.z,
      stride * 0.055 + idleBreath * 0.018 - facingLean * 0.06,
      settle,
    );
    this.hood.rotation.y = THREE.MathUtils.lerp(
      this.hood.rotation.y,
      idleGesture * Math.sin(this.elapsedSeconds * 4) * 0.2,
      settle,
    );

    this.signalBeacon.rotation.y += safeDelta * 1.4;
    const beaconPulse = 1 + Math.sin(this.elapsedSeconds * 4) * 0.08;
    this.signalBeacon.scale.setScalar(beaconPulse);

    if (this.coreCradle.visible) {
      this.coreCradle.rotation.y += safeDelta * 1.8;
      const corePulse = 1 + Math.sin(this.elapsedSeconds * 5.2) * 0.07;
      this.coreCradle.scale.setScalar(corePulse);
    }

    if (this.floodAura.visible) {
      this.floodAura.rotation.y -= safeDelta * 1.25;
      const auraPulse = 0.92 + Math.sin(this.elapsedSeconds * 5.8) * 0.08;
      this.floodAura.scale.setScalar(auraPulse);
    }

    this.circleSelection.rotation.z -= safeDelta * 0.35;
    this.diamondSelection.rotation.y += safeDelta * 0.35;
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    this.root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of objectMaterials) materials.add(material);
      } else if (object instanceof THREE.Sprite) {
        materials.add(object.material);
      }
    });

    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }

    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }

  private buildResponder(profile: HeroVisualProfile): void {
    const navyMaterial = this.standardMaterial(0x092631, 0.72);
    const rainShellMaterial = this.standardMaterial(profile.shellColor, 0.58);
    const undersuitMaterial = this.standardMaterial(profile.undersuitColor, 0.82);
    const reflectiveMaterial = this.standardMaterial(0xd8fff1, 0.36, 0.16);
    const skinMaterial = this.standardMaterial(profile.skinColor, 0.88);
    const hairMaterial = this.standardMaterial(profile.hairColor, 0.9);
    const bootMaterial = this.standardMaterial(0x061319, 0.74);
    const metalMaterial = this.standardMaterial(0x758f94, 0.32, 0.72);

    const pelvis = this.mesh(
      new THREE.BoxGeometry(profile.torsoBottomRadius * 1.42, 0.24, 0.34),
      navyMaterial,
    );
    pelvis.position.set(0, 0.74, 0);
    this.rig.add(pelvis);

    this.torso.position.set(0, 1.12, 0);
    this.rig.add(this.torso);
    const coat = this.mesh(
      new THREE.CylinderGeometry(
        profile.torsoTopRadius,
        profile.torsoBottomRadius,
        profile.torsoHeight,
        this.heroId === 'tomas' ? 8 : 7,
      ),
      rainShellMaterial,
    );
    this.torso.add(coat);

    const chestFront = profile.torsoTopRadius + 0.045;
    const chestPanel = this.mesh(
      new THREE.BoxGeometry(profile.torsoTopRadius * 1.45, 0.23, 0.045),
      navyMaterial,
    );
    chestPanel.position.set(0, 0.05, chestFront);
    this.torso.add(chestPanel);
    const chestStripe = this.mesh(
      new THREE.BoxGeometry(profile.torsoTopRadius * 1.5, 0.055, 0.022),
      reflectiveMaterial,
    );
    chestStripe.position.set(0, -0.02, chestFront + 0.028);
    this.torso.add(chestStripe);

    const roleStripe = this.mesh(
      new THREE.BoxGeometry(profile.torsoTopRadius * 0.42, 0.16, 0.026),
      this.accentMaterial,
    );
    roleStripe.position.set(-profile.torsoTopRadius * 0.43, 0.08, chestFront + 0.03);
    roleStripe.rotation.z = -0.18;
    this.torso.add(roleStripe);

    this.circleBadge.position.set(0, 0.085, chestFront + 0.033);
    this.torso.add(this.circleBadge);

    this.diamondBadge.position.set(0, 0.085, chestFront + 0.033);
    this.torso.add(this.diamondBadge);

    const belt = this.mesh(
      new THREE.BoxGeometry(profile.torsoBottomRadius * 1.68, 0.085, 0.38),
      bootMaterial,
    );
    belt.position.set(0, 0.87, 0);
    this.rig.add(belt);
    for (const x of [-profile.torsoBottomRadius * 0.62, profile.torsoBottomRadius * 0.62]) {
      const pouch = this.mesh(new THREE.BoxGeometry(0.16, 0.18, 0.15), navyMaterial);
      pouch.position.set(x, 0.79, 0.2);
      this.rig.add(pouch);
    }

    this.buildLimb(
      this.leftArm,
      -profile.shoulderX,
      1.36,
      0,
      undersuitMaterial,
      skinMaterial,
      false,
      profile.armLength,
      profile.armRadius,
    );
    this.buildLimb(
      this.rightArm,
      profile.shoulderX,
      1.36,
      0,
      undersuitMaterial,
      skinMaterial,
      false,
      profile.armLength,
      profile.armRadius,
    );
    this.buildLimb(
      this.leftLeg,
      -profile.hipX,
      0.7,
      0,
      undersuitMaterial,
      bootMaterial,
      true,
      profile.legLength,
      profile.legRadius,
    );
    this.buildLimb(
      this.rightLeg,
      profile.hipX,
      0.7,
      0,
      undersuitMaterial,
      bootMaterial,
      true,
      profile.legLength,
      profile.legRadius,
    );

    const neck = this.mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.13, 8), skinMaterial);
    neck.position.set(0, profile.headY - 0.16, 0);
    this.rig.add(neck);
    const head = this.mesh(new THREE.IcosahedronGeometry(0.24, 1), skinMaterial);
    head.scale.set(profile.headScale[0], profile.headScale[1], profile.headScale[2]);
    head.position.set(0, profile.headY, 0.015);
    this.rig.add(head);
    const hair = this.mesh(
      new THREE.SphereGeometry(0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.54),
      hairMaterial,
    );
    hair.position.set(0, profile.headY + 0.05, -0.025);
    this.rig.add(hair);

    for (const x of [-0.085, 0.085]) {
      const eye = this.mesh(new THREE.SphereGeometry(0.025, 7, 5), bootMaterial);
      eye.scale.y = 1.25;
      eye.position.set(x, profile.headY + 0.04, 0.225);
      this.rig.add(eye);
    }

    const smile = this.mesh(new THREE.TorusGeometry(0.065, 0.009, 4, 10, Math.PI), bootMaterial);
    smile.rotation.z = Math.PI;
    smile.position.set(0, profile.headY - 0.05, 0.235);
    this.rig.add(smile);

    this.hood.position.set(0, profile.headY + 0.19, -0.015);
    this.rig.add(this.hood);
    this.buildHeadgear(rainShellMaterial, reflectiveMaterial, metalMaterial);
    this.buildBackpack(profile, navyMaterial, metalMaterial, reflectiveMaterial);
    this.buildHeroEquipment(metalMaterial, reflectiveMaterial, bootMaterial);
    this.buildCoreCradle(metalMaterial);
  }

  private buildHeadgear(
    shellMaterial: THREE.Material,
    reflectiveMaterial: THREE.Material,
    metalMaterial: THREE.Material,
  ): void {
    switch (this.heroId) {
      case 'maya': {
        const canopy = this.mesh(
          new THREE.CylinderGeometry(0.29, 0.48, 0.13, 8),
          this.teamMaterial,
        );
        const crown = this.mesh(new THREE.ConeGeometry(0.295, 0.28, 8), shellMaterial);
        crown.position.y = 0.14;
        const band = this.mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 8), reflectiveMaterial);
        band.position.y = 0.045;
        this.hood.add(canopy, crown, band);
        break;
      }
      case 'tomas': {
        const brim = this.mesh(
          new THREE.CylinderGeometry(0.33, 0.38, 0.075, 12),
          this.accentMaterial,
        );
        const crown = this.mesh(
          new THREE.SphereGeometry(0.275, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56),
          this.accentMaterial,
        );
        crown.position.y = 0.035;
        crown.scale.z = 0.92;
        const ridge = this.mesh(new THREE.BoxGeometry(0.055, 0.16, 0.38), reflectiveMaterial);
        ridge.position.y = 0.13;
        this.hood.add(brim, crown, ridge);
        break;
      }
      case 'kidlat': {
        const helmet = this.mesh(
          new THREE.SphereGeometry(0.26, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62),
          shellMaterial,
        );
        helmet.scale.z = 0.9;
        for (const x of [-0.255, 0.255]) {
          const earGuard = this.mesh(
            new THREE.CylinderGeometry(0.09, 0.09, 0.045, 8),
            this.accentMaterial,
          );
          earGuard.rotation.z = Math.PI / 2;
          earGuard.position.set(x, -0.055, 0);
          this.hood.add(earGuard);
        }
        const crest = this.mesh(new THREE.BoxGeometry(0.045, 0.21, 0.32), this.teamMaterial);
        crest.position.y = 0.12;
        crest.rotation.x = -0.16;
        this.hood.add(helmet, crest);
        break;
      }
      case 'amihan': {
        const hoodRing = this.mesh(new THREE.TorusGeometry(0.27, 0.055, 6, 16), shellMaterial);
        hoodRing.rotation.x = Math.PI / 2;
        const crown = this.mesh(new THREE.ConeGeometry(0.3, 0.3, 10, 1, true), this.accentMaterial);
        crown.position.y = 0.11;
        const visor = this.mesh(new THREE.BoxGeometry(0.38, 0.045, 0.1), reflectiveMaterial);
        visor.position.set(0, 0.005, 0.25);
        const sensor = this.mesh(new THREE.OctahedronGeometry(0.055, 0), metalMaterial);
        sensor.position.set(0.19, 0.08, 0.1);
        this.hood.add(hoodRing, crown, visor, sensor);
        break;
      }
    }
  }

  private buildHeroEquipment(
    metalMaterial: THREE.Material,
    reflectiveMaterial: THREE.Material,
    bootMaterial: THREE.Material,
  ): void {
    switch (this.heroId) {
      case 'maya':
        this.buildMayaEquipment(metalMaterial);
        break;
      case 'tomas':
        this.buildTomasEquipment(metalMaterial, reflectiveMaterial);
        break;
      case 'kidlat':
        this.buildKidlatEquipment(metalMaterial, bootMaterial);
        break;
      case 'amihan':
        this.buildAmihanEquipment(metalMaterial, reflectiveMaterial);
        break;
    }
  }

  private buildMayaEquipment(metalMaterial: THREE.Material): void {
    const rescueSpool = this.mesh(
      new THREE.CylinderGeometry(0.115, 0.115, 0.095, 12),
      this.accentMaterial,
    );
    rescueSpool.rotation.z = Math.PI / 2;
    rescueSpool.position.set(0.42, 0.92, 0.03);
    const spoolHub = this.mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 10), metalMaterial);
    spoolHub.rotation.z = Math.PI / 2;
    rescueSpool.add(spoolHub);
    const ropeLoop = this.mesh(new THREE.TorusGeometry(0.18, 0.022, 6, 18), this.teamMaterial);
    ropeLoop.position.set(-0.23, 1.16, -0.43);
    this.rig.add(rescueSpool, ropeLoop);
  }

  private buildTomasEquipment(
    metalMaterial: THREE.Material,
    reflectiveMaterial: THREE.Material,
  ): void {
    for (const arm of [this.leftArm, this.rightArm]) {
      const shoulderPlate = this.mesh(new THREE.BoxGeometry(0.28, 0.13, 0.34), this.accentMaterial);
      shoulderPlate.position.set(0, -0.055, 0);
      arm.add(shoulderPlate);
    }
    for (const x of [-0.43, 0.43]) {
      const toolCase = this.mesh(new THREE.BoxGeometry(0.2, 0.3, 0.19), this.accentMaterial);
      toolCase.position.set(x, 0.82, 0.06);
      const clasp = this.mesh(new THREE.BoxGeometry(0.11, 0.045, 0.205), reflectiveMaterial);
      clasp.position.y = 0.04;
      toolCase.add(clasp);
      this.rig.add(toolCase);
    }
    const surveyBar = this.mesh(new THREE.BoxGeometry(0.08, 0.62, 0.07), metalMaterial);
    surveyBar.position.set(-0.23, 1.18, -0.43);
    surveyBar.rotation.z = -0.2;
    const level = this.mesh(new THREE.BoxGeometry(0.38, 0.075, 0.075), this.teamMaterial);
    level.position.set(0.18, 1.28, -0.44);
    level.rotation.z = 0.22;
    this.rig.add(surveyBar, level);
  }

  private buildKidlatEquipment(metalMaterial: THREE.Material, bootMaterial: THREE.Material): void {
    for (const arm of [this.leftArm, this.rightArm]) {
      const cuff = this.mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.13, 8), this.accentMaterial);
      cuff.position.y = -0.34;
      arm.add(cuff);
    }
    for (const leg of [this.leftLeg, this.rightLeg]) {
      const insulationBand = this.mesh(
        new THREE.CylinderGeometry(0.135, 0.135, 0.12, 8),
        bootMaterial,
      );
      insulationBand.position.y = -0.35;
      leg.add(insulationBand);
    }
    const cableCoil = this.mesh(new THREE.TorusGeometry(0.27, 0.035, 7, 22), this.accentMaterial);
    cableCoil.position.set(0, 1.16, -0.46);
    const cableHub = this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), metalMaterial);
    cableHub.rotation.x = Math.PI / 2;
    cableCoil.add(cableHub);
    for (const direction of [-1, 1]) {
      const chargeRail = this.mesh(new THREE.BoxGeometry(0.045, 0.42, 0.045), this.teamMaterial);
      chargeRail.position.set(direction * 0.23, 1.28, -0.41);
      chargeRail.rotation.z = direction * 0.24;
      this.rig.add(chargeRail);
    }
    this.rig.add(cableCoil);
  }

  private buildAmihanEquipment(
    metalMaterial: THREE.Material,
    reflectiveMaterial: THREE.Material,
  ): void {
    for (const direction of [-1, 1]) {
      const ponchoWing = this.mesh(new THREE.BoxGeometry(0.42, 0.045, 0.48), this.accentMaterial);
      ponchoWing.position.set(direction * 0.3, 0.08, -0.02);
      ponchoWing.rotation.z = direction * 0.2;
      this.torso.add(ponchoWing);

      const windRibbon = this.mesh(new THREE.BoxGeometry(0.055, 0.035, 0.52), reflectiveMaterial);
      windRibbon.position.set(direction * 0.15, -0.04, -0.31);
      windRibbon.rotation.y = direction * 0.16;
      this.hood.add(windRibbon);
    }
    const fieldTablet = this.mesh(new THREE.BoxGeometry(0.2, 0.08, 0.16), metalMaterial);
    fieldTablet.position.set(0, -0.31, 0.12);
    fieldTablet.rotation.x = -0.24;
    const screen = this.mesh(new THREE.BoxGeometry(0.14, 0.015, 0.1), this.accentGlowMaterial);
    screen.position.y = 0.047;
    fieldTablet.add(screen);
    this.leftArm.add(fieldTablet);
  }

  private buildLimb(
    pivot: THREE.Group,
    x: number,
    y: number,
    z: number,
    limbMaterial: THREE.Material,
    endMaterial: THREE.Material,
    leg: boolean,
    limbLength: number,
    limbRadius: number,
  ): void {
    pivot.position.set(x, y, z);
    this.rig.add(pivot);
    const limb = this.mesh(
      new THREE.CylinderGeometry(limbRadius * 0.86, limbRadius, limbLength, 7),
      limbMaterial,
    );
    limb.position.y = -limbLength / 2;
    pivot.add(limb);

    const end = this.mesh(
      leg ? new THREE.BoxGeometry(0.24, 0.17, 0.33) : new THREE.IcosahedronGeometry(0.12, 1),
      endMaterial,
    );
    end.position.set(0, -limbLength, leg ? 0.055 : 0);
    pivot.add(end);
  }

  private buildBackpack(
    profile: HeroVisualProfile,
    shellMaterial: THREE.Material,
    metalMaterial: THREE.Material,
    reflectiveMaterial: THREE.Material,
  ): void {
    const backpackDimensions: Record<HeroId, readonly [number, number, number]> = {
      maya: [0.42, 0.48, 0.23],
      tomas: [0.52, 0.56, 0.29],
      kidlat: [0.36, 0.5, 0.21],
      amihan: [0.43, 0.58, 0.23],
    };
    const [width, height, depth] = backpackDimensions[this.heroId];
    const backpack = this.mesh(new THREE.BoxGeometry(width, height, depth), shellMaterial);
    backpack.position.set(0, 1.16, -0.3);
    this.rig.add(backpack);
    const battery = this.mesh(
      new THREE.BoxGeometry(Math.min(0.24, width * 0.54), height * 0.53, 0.055),
      this.teamMaterial,
    );
    battery.position.set(0, 0, -depth / 2 - 0.03);
    backpack.add(battery);
    const safetyBar = this.mesh(
      new THREE.BoxGeometry(width * 0.76, 0.05, 0.028),
      reflectiveMaterial,
    );
    safetyBar.position.set(0, -height * 0.23, -depth / 2 - 0.055);
    backpack.add(safetyBar);

    const roleBar = this.mesh(
      new THREE.BoxGeometry(width * 0.17, height * 0.72, 0.025),
      this.accentMaterial,
    );
    roleBar.position.set(-width * 0.3, 0, -depth / 2 - 0.057);
    backpack.add(roleBar);

    const mast = this.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.27, 6), metalMaterial);
    const mastX = this.heroId === 'tomas' ? 0.21 : this.heroId === 'kidlat' ? 0 : 0.15;
    mast.position.set(mastX, 1.53, -0.3);
    this.rig.add(mast);
    this.signalBeacon.position.set(mastX, 1.68, -0.3);
    this.rig.add(this.signalBeacon);
    this.buildSignalInstrument(profile, metalMaterial);
  }

  private buildSignalInstrument(profile: HeroVisualProfile, metalMaterial: THREE.Material): void {
    switch (this.heroId) {
      case 'maya': {
        const beacon = this.mesh(new THREE.OctahedronGeometry(0.065, 0), this.teamGlowMaterial);
        const guard = this.mesh(
          new THREE.TorusGeometry(0.095, 0.012, 5, 14),
          this.accentGlowMaterial,
        );
        guard.rotation.x = Math.PI / 2;
        this.signalBeacon.add(beacon, guard);
        break;
      }
      case 'tomas': {
        const warningLamp = this.mesh(
          new THREE.BoxGeometry(0.13, 0.13, 0.13),
          this.accentGlowMaterial,
        );
        const cap = this.mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 8), metalMaterial);
        cap.position.y = 0.085;
        const teamLens = this.mesh(new THREE.SphereGeometry(0.035, 7, 5), this.teamGlowMaterial);
        teamLens.position.z = 0.075;
        this.signalBeacon.add(warningLamp, cap, teamLens);
        break;
      }
      case 'kidlat': {
        const core = this.mesh(new THREE.OctahedronGeometry(0.05, 0), this.teamGlowMaterial);
        const verticalLoop = this.mesh(
          new THREE.TorusGeometry(0.105, 0.013, 5, 14),
          this.accentGlowMaterial,
        );
        verticalLoop.rotation.y = Math.PI / 2;
        const crossLoop = this.mesh(
          new THREE.TorusGeometry(0.105, 0.013, 5, 14),
          this.accentGlowMaterial,
        );
        crossLoop.rotation.x = Math.PI / 2;
        this.signalBeacon.add(core, verticalLoop, crossLoop);
        break;
      }
      case 'amihan': {
        const hub = this.mesh(new THREE.SphereGeometry(0.052, 8, 6), this.teamGlowMaterial);
        for (let index = 0; index < 3; index += 1) {
          const arm = new THREE.Group();
          arm.rotation.y = (index / 3) * Math.PI * 2;
          const bar = this.mesh(new THREE.BoxGeometry(0.21, 0.018, 0.018), metalMaterial);
          bar.position.x = 0.095;
          const cup = this.mesh(
            new THREE.SphereGeometry(0.045, 7, 5, 0, Math.PI),
            this.accentGlowMaterial,
          );
          cup.position.x = 0.2;
          cup.rotation.z = Math.PI / 2;
          arm.add(bar, cup);
          this.signalBeacon.add(arm);
        }
        const identityPin = this.mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.07, 6),
          this.standardMaterial(profile.accentColor, 0.35, 0.55),
        );
        identityPin.position.y = -0.06;
        this.signalBeacon.add(hub, identityPin);
        break;
      }
    }
  }

  private buildCoreCradle(metalMaterial: THREE.Material): void {
    this.coreCradle.position.set(-0.42, 1.15, -0.28);
    this.rig.add(this.coreCradle);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9fbff,
      emissive: 0x4cecff,
      emissiveIntensity: 2.1,
      metalness: 0.35,
      roughness: 0.18,
      flatShading: true,
    });
    const core = this.mesh(new THREE.OctahedronGeometry(0.135, 0), coreMaterial);
    this.coreCradle.add(core);
    const orbit = this.mesh(new THREE.TorusGeometry(0.19, 0.015, 5, 16), metalMaterial);
    orbit.rotation.x = Math.PI / 2;
    this.coreCradle.add(orbit);
  }

  private buildSelectionMarkers(): void {
    this.circleSelection.rotation.x = -Math.PI / 2;
    this.circleSelection.position.y = 0.018;
    this.circleSelection.renderOrder = 2;
    this.root.add(this.circleSelection);

    this.diamondSelection.renderOrder = 2;
    this.root.add(this.diamondSelection);
  }

  private buildFloodAura(): void {
    this.floodAura.position.y = 0.13;
    this.root.add(this.floodAura);
    const auraMaterial = new THREE.MeshBasicMaterial({
      color: 0x8df5ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const radius of [0.36, 0.49]) {
      const ring = this.mesh(new THREE.TorusGeometry(radius, 0.014, 5, 20), auraMaterial);
      ring.rotation.x = Math.PI / 2;
      this.floodAura.add(ring);
    }
    this.floodAura.visible = false;
  }

  private refreshSelectionVisibility(): void {
    const shouldShow = this.selected && this.alive;
    const isCircleTeam = TEAMS[this.team].marker === 'circle';
    this.circleSelection.visible = shouldShow && isCircleTeam;
    this.diamondSelection.visible = shouldShow && !isCircleTeam;
  }

  private standardMaterial(
    color: number,
    roughness: number,
    metalness = 0.08,
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      flatShading: true,
    });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

export function createCharacterModel(options: CharacterModelOptions): CharacterModel {
  return new CharacterModel(options);
}
