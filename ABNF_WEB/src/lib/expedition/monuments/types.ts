import type { MeshStandardMaterial, Object3D, Group } from 'three';
import type { DiscoveryStatus } from '../../discovery';

export interface MonumentBuild {
  root: Group;
  boundingRadius: number;
  hotspotMarkers: {
    anchor: Object3D;
    beaconMesh: Object3D;
    beaconMaterial: MeshStandardMaterial;
  }[];
  setDiscoveryState: (status: DiscoveryStatus) => void;
  setHotspotVisual: (index: number, scanned: boolean, active: boolean) => void;
}
