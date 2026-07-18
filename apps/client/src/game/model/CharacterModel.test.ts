import { HERO_IDS, type HeroId } from '@signal-zero/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createCharacterModel, type CharacterModel } from './CharacterModel';

function meshesIn(model: CharacterModel): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  model.root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function silhouetteSignature(model: CharacterModel): string {
  model.root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
  const geometryKinds = meshesIn(model)
    .map((mesh) => mesh.geometry.type)
    .sort()
    .join(',');
  return [
    meshesIn(model).length,
    size.x.toFixed(3),
    size.y.toFixed(3),
    size.z.toFixed(3),
    geometryKinds,
  ].join('|');
}

function createHero(heroId: HeroId): CharacterModel {
  return createCharacterModel({ heroId, team: 'A', isLocalPlayer: true });
}

describe('procedural character models', () => {
  it('builds a distinct responder silhouette for every authoritative hero id', () => {
    const models = HERO_IDS.map(createHero);
    try {
      expect(models.map((model) => model.heroId)).toEqual(HERO_IDS);
      expect(new Set(models.map(silhouetteSignature)).size).toBe(HERO_IDS.length);
      for (const model of models) {
        expect(model.root.name.toLowerCase()).toContain(model.heroId);
        expect(model.root.userData.heroId).toBe(model.heroId);
      }
    } finally {
      for (const model of models) model.dispose();
    }
  });

  it('keeps every variant compatible with the shared action poses', () => {
    for (const heroId of HERO_IDS) {
      const model = createHero(heroId);
      try {
        model.update(1 / 60, {
          movementAmount: 1,
          alive: true,
          selected: true,
          hasCore: true,
          floodImmune: true,
          elevation: 1.2,
          jumping: true,
          diving: true,
          stumbling: 0.7,
          grabbing: true,
          facingLean: -0.8,
        });
        model.update(1 / 60, {
          movementAmount: 0,
          alive: false,
          selected: false,
          hasCore: false,
          floodImmune: false,
          jumping: false,
          diving: false,
          stumbling: false,
          grabbing: false,
        });

        expect(model.root.children.length).toBeGreaterThan(0);
        model.root.traverse((object) => {
          expect(object.position.toArray().every(Number.isFinite)).toBe(true);
          expect(object.rotation.toArray().slice(0, 3).every(Number.isFinite)).toBe(true);
          expect(object.scale.toArray().every(Number.isFinite)).toBe(true);
        });
      } finally {
        model.dispose();
      }
    }
  });

  it('disposes every owned geometry, material, and texture exactly through the model root', () => {
    const model = createHero('amihan');
    const scene = new THREE.Scene();
    scene.add(model.root);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    model.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        const ownedMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of ownedMaterials) materials.add(material);
      }
    });
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }

    let disposedGeometries = 0;
    let disposedMaterials = 0;
    let disposedTextures = 0;
    for (const geometry of geometries) {
      geometry.addEventListener('dispose', () => {
        disposedGeometries += 1;
      });
    }
    for (const material of materials) {
      material.addEventListener('dispose', () => {
        disposedMaterials += 1;
      });
    }
    for (const texture of textures) {
      texture.addEventListener('dispose', () => {
        disposedTextures += 1;
      });
    }

    model.dispose();

    expect(model.root.parent).toBeNull();
    expect(model.root.children).toHaveLength(0);
    expect(disposedGeometries).toBe(geometries.size);
    expect(disposedMaterials).toBe(materials.size);
    expect(disposedTextures).toBe(textures.size);
  });
});
