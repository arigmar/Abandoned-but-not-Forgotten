import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
} from 'three';
import type { DiscoveryStatus } from '../../discovery';
import type { TokenPalette } from '../palette';
import type { MonumentBuild } from './types';

export interface SharedMonumentMats {
  metalLight: MeshStandardMaterial;
  metalMid: MeshStandardMaterial;
  metalDark: MeshStandardMaterial;
  solarCell: MeshStandardMaterial;
  goldFoil: MeshStandardMaterial;
  copper: MeshStandardMaterial;
  stateAccent: MeshStandardMaterial;
}

export function createMonumentMaterials(tokens: TokenPalette): SharedMonumentMats {
  return {
    metalLight: new MeshStandardMaterial({
      color: tokens.metalLight,
      roughness: 0.48,
      metalness: 0.48,
    }),
    metalMid: new MeshStandardMaterial({
      color: tokens.metalMid,
      roughness: 0.58,
      metalness: 0.42,
    }),
    metalDark: new MeshStandardMaterial({
      color: tokens.metalDark,
      roughness: 0.72,
      metalness: 0.3,
    }),
    solarCell: new MeshStandardMaterial({
      color: tokens.solarCell,
      roughness: 0.32,
      metalness: 0.55,
    }),
    goldFoil: new MeshStandardMaterial({
      color: tokens.goldFoil,
      roughness: 0.42,
      metalness: 0.62,
    }),
    copper: new MeshStandardMaterial({
      color: tokens.copper,
      roughness: 0.45,
      metalness: 0.55,
    }),
    stateAccent: new MeshStandardMaterial({
      color: tokens.dormant,
      emissive: tokens.dormant,
      emissiveIntensity: 0.16,
      roughness: 0.4,
      metalness: 0.35,
    }),
  };
}

export function attachMonumentHotspotNodes(
  root: Group,
  points: [number, number, number][],
  tokens: TokenPalette,
  mats: SharedMonumentMats,
  boundingRadius: number,
): MonumentBuild {
  const markerGeom = new SphereGeometry(0.13, 10, 10);
  const stemGeom = new CylinderGeometry(0.015, 0.015, 0.16, 6);

  const hotspotMarkers: {
    anchor: Object3D;
    beaconMesh: Object3D;
    beaconMaterial: MeshStandardMaterial;
  }[] = [];

  for (const [x, y, z] of points) {
    const anchor = new Group();
    anchor.position.set(x, y, z);

    const beaconMaterial = new MeshStandardMaterial({
      color: tokens.dormant,
      emissive: tokens.dormant,
      emissiveIntensity: 0.25,
      roughness: 0.35,
    });

    const stem = new Mesh(stemGeom, mats.metalMid);
    stem.position.y = -0.08;
    anchor.add(stem);

    const orb = new Mesh(markerGeom, beaconMaterial);
    anchor.add(orb);

    root.add(anchor);
    hotspotMarkers.push({ anchor, beaconMesh: orb, beaconMaterial });
  }

  const setDiscoveryState = (status: DiscoveryStatus): void => {
    if (status === 'recovered') {
      mats.stateAccent.color.copy(tokens.amber);
      mats.stateAccent.emissive.copy(tokens.amber);
      mats.stateAccent.emissiveIntensity = 0.62;
    } else if (status === 'inspected') {
      mats.stateAccent.color.copy(tokens.turquoise);
      mats.stateAccent.emissive.copy(tokens.turquoise);
      mats.stateAccent.emissiveIntensity = 0.48;
    } else {
      mats.stateAccent.color.copy(tokens.dormant);
      mats.stateAccent.emissive.copy(tokens.dormant);
      mats.stateAccent.emissiveIntensity = 0.16;
    }
  };

  const setHotspotVisual = (index: number, scanned: boolean, active: boolean): void => {
    const entry = hotspotMarkers[index];
    if (!entry) return;
    if (scanned) {
      entry.beaconMaterial.color.copy(tokens.turquoise);
      entry.beaconMaterial.emissive.copy(tokens.turquoise);
      entry.beaconMaterial.emissiveIntensity = active ? 0.72 : 0.48;
      entry.beaconMesh.scale.setScalar(active ? 1.25 : 0.95);
    } else if (active) {
      entry.beaconMaterial.color.copy(tokens.amber);
      entry.beaconMaterial.emissive.copy(tokens.amber);
      entry.beaconMaterial.emissiveIntensity = 0.6;
      entry.beaconMesh.scale.setScalar(1.3);
    } else {
      entry.beaconMaterial.color.copy(tokens.dormant);
      entry.beaconMaterial.emissive.copy(tokens.dormant);
      entry.beaconMaterial.emissiveIntensity = 0.25;
      entry.beaconMesh.scale.setScalar(1.0);
    }
  };

  return {
    root,
    boundingRadius,
    hotspotMarkers,
    setDiscoveryState,
    setHotspotVisual,
  };
}
