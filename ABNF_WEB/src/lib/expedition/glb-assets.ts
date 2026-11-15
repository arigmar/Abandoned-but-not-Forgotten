import {
  Box3,
  Color,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withBase } from '../base-path';
import { disposeObjectTree } from './utils';

const DRACO_DECODER_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export interface GlbLoaderHandle {
  loader: GLTFLoader;
  dispose: () => void;
}

export interface LoadGlbOptions {
  /** Largest bounding dimension after scaling. */
  targetSize: number;
  /** Optional procedural fallback object to remove/hide once the GLB finishes loading. */
  fallbackToRemove?: Object3D | null;
  /** Hide untextured proxy/backdrop meshes (needed for `earth.glb`). */
  filterNonMappedMeshes?: boolean;
  /** Snap the bottom of the scaled bounding box to `y = 0` instead of centering vertically. */
  groundAtMinY?: boolean;
  /** Apply `DoubleSide` and moderate matte roughness suitable for terrain/hull inspection. */
  doubleSide?: boolean;
  /** Optional Y rotation after centering (in radians). */
  rotateY?: number;
  /** Return true when the owning scene has already been torn down. */
  isDisposed?: () => boolean;
  /** Optional hook after the normalized model is inserted into `container`. */
  onLoaded?: (model: Object3D) => void;
}

/** Creates a Three.js GLTFLoader wired to Draco decoding. */
export function createDracoGltfLoader(): GlbLoaderHandle {
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_URL);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return {
    loader,
    dispose() {
      draco.dispose();
    },
  };
}

function clampStandardMaterial(material: Material, doubleSide: boolean): void {
  const mat = material as MeshStandardMaterial;
  if (doubleSide) {
    mat.side = DoubleSide;
  }
  if (mat.color instanceof Color) {
    const peak = Math.max(mat.color.r, mat.color.g, mat.color.b);
    if (peak > 0.88) {
      mat.color.multiplyScalar(0.88 / peak);
    }
  }
  if (mat.map) {
    mat.map.colorSpace = SRGBColorSpace;
    mat.map.needsUpdate = true;
  }
  mat.needsUpdate = true;
}

/**
 * Loads a GLB progressively into `container` while keeping procedural geometry
 * visible if offline, blocked, or slow.
 */
export function loadNormalizedGlbIntoGroup(
  loader: GLTFLoader,
  publicPath: string,
  container: Group,
  options: LoadGlbOptions,
): void {
  const {
    targetSize,
    fallbackToRemove,
    filterNonMappedMeshes = false,
    groundAtMinY = false,
    doubleSide = false,
    rotateY = 0,
    isDisposed,
    onLoaded,
  } = options;

  loader.load(
    withBase(publicPath),
    (gltf) => {
      const model = gltf.scene;
      if (isDisposed?.()) {
        disposeObjectTree(model);
        return;
      }

      const box = new Box3();
      model.traverse((node) => {
        if (!(node as Mesh).isMesh) return;
        const mesh = node as Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        if (filterNonMappedMeshes) {
          const hasTexture = mats.some((m) => Boolean((m as MeshStandardMaterial)?.map));
          if (!hasTexture) {
            mesh.visible = false;
            return;
          }
        }

        mats.forEach((m) => clampStandardMaterial(m, doubleSide));
        box.expandByObject(mesh);
      });

      const size = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? targetSize / maxDim : 1;
      model.scale.setScalar(scale);
      if (rotateY !== 0) {
        model.rotation.y = rotateY;
      }

      const scaledBox = new Box3().setFromObject(model);
      const center = scaledBox.getCenter(new Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= groundAtMinY ? scaledBox.min.y : center.y;

      if (fallbackToRemove && fallbackToRemove.parent) {
        fallbackToRemove.parent.remove(fallbackToRemove);
      }
      container.add(model);
      onLoaded?.(model);
    },
    undefined,
    () => {
      // Keep procedural fallback intact when offline or uncached
    },
  );
}
