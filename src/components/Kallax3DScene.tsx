import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  RotateCcw,
  Eye,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Info,
  ChevronDown,
  ChevronUp,
  Box as BoxIcon,
  Sparkles,
} from 'lucide-react';
import { KallaxConfig, PlacedBox, GameBox } from '../types/kallax';
import { getEffectiveDimensions } from '../utils/kallaxMath';

interface Kallax3DSceneProps {
  config: KallaxConfig;
  placedBoxes: PlacedBox[];
  gamesMap: Record<string, GameBox>;
  selectedBoxId: string | null;
  onSelectBox: (boxId: string | null) => void;
  onOpenCubeDetail: (row: number, col: number) => void;
  onRotateBox?: (placedId: string, e?: React.MouseEvent) => void;
}

// Procedural texture generator for box faces (spine & cover)
const createBoxFaceTexture = (
  game: GameBox,
  text: string,
  bgColor: string,
  width: number,
  height: number,
  isSpine: boolean
): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  // High-DPI canvas texture
  const scale = 4;
  canvas.width = Math.max(128, Math.min(1024, Math.round(width * scale * 4)));
  canvas.height = Math.max(128, Math.min(1024, Math.round(height * scale * 4)));

  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle edge gradient / crease
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.3)');
    grad.addColorStop(0.08, 'rgba(0,0,0,0.02)');
    grad.addColorStop(0.92, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = Math.max(2, canvas.width * 0.02);
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    // Text styling
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fontSize = Math.max(
      14,
      Math.min(canvas.width * 0.6, canvas.height * 0.25, 48)
    );
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

    // Drop shadow for text
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    if (isSpine && canvas.height > canvas.width * 2) {
      // Vertical spine text: rotate 90 degrees
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(text.slice(0, 24), 0, 0);
      ctx.restore();
    } else {
      // Horizontal text
      ctx.fillText(text.slice(0, 22), canvas.width / 2, canvas.height / 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const Kallax3DScene: React.FC<Kallax3DSceneProps> = ({
  config,
  placedBoxes,
  gamesMap,
  selectedBoxId,
  onSelectBox,
  onOpenCubeDetail,
  onRotateBox,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(-999, -999));
  const boxMeshesRef = useRef<Map<string, { mesh: THREE.Mesh; placed: PlacedBox; game: GameBox }>>(new Map());
  const hoveredBoxIdRef = useRef<string | null>(null);

  const [hoveredBox, setHoveredBox] = useState<{ name: string; dims: string; cube: string } | null>(null);
  const [selectedBoxInfo, setSelectedBoxInfo] = useState<{
    id: string;
    name: string;
    dims: string;
    cube: string;
    orientation: string;
  } | null>(null);
  const [isControlsExpanded, setIsControlsExpanded] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Kallax shelf physical specs (in cm)
  const outerThickness = 3.8; // cm
  const innerThickness = 1.6; // cm
  const cubeW = config.cubeWidth || 33.5;
  const cubeH = config.cubeHeight || 33.5;
  const cubeD = config.cubeDepth || 39.0;
  const totalW = config.cols * cubeW + (config.cols - 1) * innerThickness + 2 * outerThickness;
  const totalH = config.rows * cubeH + (config.rows - 1) * innerThickness + 2 * outerThickness;
  const totalD = cubeD;

  // Shelf color materials
  const getShelfMaterial = useCallback(() => {
    switch (config.shelfColor) {
      case 'black-brown':
        return new THREE.MeshStandardMaterial({
          color: 0x1f1b18,
          roughness: 0.65,
          metalness: 0.05,
        });
      case 'oak':
        return new THREE.MeshStandardMaterial({
          color: 0xc89d6b,
          roughness: 0.6,
          metalness: 0.05,
        });
      case 'grey':
        return new THREE.MeshStandardMaterial({
          color: 0x5a6068,
          roughness: 0.5,
          metalness: 0.05,
        });
      case 'white':
      default:
        return new THREE.MeshStandardMaterial({
          color: 0xf5f5f7,
          roughness: 0.4,
          metalness: 0.02,
        });
    }
  }, [config.shelfColor]);

  // Camera presets
  const setCameraPreset = useCallback(
    (preset: 'perspective' | 'front' | 'top' | 'side' | 'isometric') => {
      if (!cameraRef.current || !controlsRef.current) return;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const center = new THREE.Vector3(0, totalH / 2, 0);
      controls.target.copy(center);

      const distance = Math.max(totalW, totalH) * 2.15;

      switch (preset) {
        case 'front':
          camera.position.set(0, totalH / 2, distance * 1.15);
          break;
        case 'top':
          camera.position.set(0, totalH * 2.1, distance * 0.95);
          break;
        case 'side':
          camera.position.set(distance * 1.25, totalH / 2, distance * 0.4);
          break;
        case 'isometric':
          camera.position.set(distance * 0.9, totalH * 1.25, distance * 1.0);
          break;
        case 'perspective':
        default:
          camera.position.set(distance * 0.65, totalH * 0.95, distance * 1.15);
          break;
      }
      camera.lookAt(center);
      controls.update();
    },
    [totalW, totalH]
  );

  // Initialize Scene, Renderer, Lights, and OrbitControls
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software GL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0f172a); // Deep slate background
    scene.fog = new THREE.FogExp2(0x0f172a, 0.0035);

    // Camera
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    const camera = new THREE.PerspectiveCamera(42, width / height, 1, 3000);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // Studio Environment (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xfff8f0, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.0);
    keyLight.position.set(totalW * 0.8, totalH * 1.5, totalD * 2.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xcfd8dc, 0.9);
    fillLight.position.set(-totalW * 1.2, totalH * 0.6, totalD * 1.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfef08a, 0.7);
    rimLight.position.set(0, totalH * 1.2, -totalD * 2.0);
    scene.add(rimLight);

    // Soft Contact Shadow Plane beneath the shelf
    const shadowGeo = new THREE.PlaneGeometry(totalW * 1.8, totalD * 2.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x030712,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.1;
    scene.add(shadowPlane);

    // Subtle Ground Floor Grid (helps spatial orientation)
    const gridHelper = new THREE.GridHelper(totalW * 2.5, 20, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.15;
    scene.add(gridHelper);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Don't flip below ground
    controls.minDistance = Math.min(cubeW, cubeH) * 1.2;
    controls.maxDistance = Math.max(totalW, totalH) * 4.5;

    // Initial camera position
    setCameraPreset('perspective');

    // Animation / Render loop
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();

      // Check raycasting for hover highlight
      if (raycasterRef.current && cameraRef.current) {
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const meshes = Array.from(boxMeshesRef.current.values()).map((v) => v.mesh);
        const intersects = raycasterRef.current.intersectObjects(meshes, false);

        if (intersects.length > 0) {
          const hitMesh = intersects[0].object as THREE.Mesh;
          const hitData = Array.from(boxMeshesRef.current.values()).find((v) => v.mesh === hitMesh);
          if (hitData && hitData.placed.id !== hoveredBoxIdRef.current) {
            hoveredBoxIdRef.current = hitData.placed.id;
            setHoveredBox({
              name: hitData.game.name,
              dims: `${hitData.game.width} × ${hitData.game.height} × ${hitData.game.depth} cm (da ${hitData.game.dimensionSource || (hitData.game.bggId ? 'BGG' : 'Catalogo')})`,
              cube: `Vano [${hitData.placed.cubeRow + 1},${hitData.placed.cubeCol + 1}]`,
            });
            container.style.cursor = 'pointer';
          }
        } else if (hoveredBoxIdRef.current !== null) {
          hoveredBoxIdRef.current = null;
          setHoveredBox(null);
          container.style.cursor = 'default';
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [totalW, totalH, totalD, cubeW, cubeH, setCameraPreset]);

  // Build / Rebuild Kallax 3D Model and Placed Boxes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous shelf and boxes
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData && (obj.userData.isShelfPart || obj.userData.isGameBox)) {
        toRemove.push(obj);
      }
    });
    for (const obj of toRemove) {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: any) => {
            m.map?.dispose();
            m.dispose();
          });
        } else if (obj.material) {
          (obj.material as any).map?.dispose();
          obj.material.dispose();
        }
      }
    }
    boxMeshesRef.current.clear();

    const shelfMat = getShelfMaterial();

    // --- 1. BUILD KALLAX SHELF FRAME ---
    const shelfGroup = new THREE.Group();
    shelfGroup.userData = { isShelfPart: true };

    // Top outer board
    const topBoardGeo = new THREE.BoxGeometry(totalW, outerThickness, totalD);
    const topBoard = new THREE.Mesh(topBoardGeo, shelfMat);
    topBoard.position.set(0, totalH - outerThickness / 2, 0);
    topBoard.castShadow = true;
    topBoard.receiveShadow = true;
    topBoard.userData = { isShelfPart: true };
    shelfGroup.add(topBoard);

    // Bottom outer board
    const bottomBoardGeo = new THREE.BoxGeometry(totalW, outerThickness, totalD);
    const bottomBoard = new THREE.Mesh(bottomBoardGeo, shelfMat);
    bottomBoard.position.set(0, outerThickness / 2, 0);
    bottomBoard.castShadow = true;
    bottomBoard.receiveShadow = true;
    bottomBoard.userData = { isShelfPart: true };
    shelfGroup.add(bottomBoard);

    // Left outer board
    const sideBoardH = totalH - 2 * outerThickness;
    const sideBoardGeo = new THREE.BoxGeometry(outerThickness, sideBoardH, totalD);
    const leftBoard = new THREE.Mesh(sideBoardGeo, shelfMat);
    leftBoard.position.set(-totalW / 2 + outerThickness / 2, totalH / 2, 0);
    leftBoard.castShadow = true;
    leftBoard.receiveShadow = true;
    leftBoard.userData = { isShelfPart: true };
    shelfGroup.add(leftBoard);

    // Right outer board
    const rightBoard = new THREE.Mesh(sideBoardGeo, shelfMat);
    rightBoard.position.set(totalW / 2 - outerThickness / 2, totalH / 2, 0);
    rightBoard.castShadow = true;
    rightBoard.receiveShadow = true;
    rightBoard.userData = { isShelfPart: true };
    shelfGroup.add(rightBoard);

    // Internal Horizontal Dividers
    const innerW = totalW - 2 * outerThickness;
    const hDividerGeo = new THREE.BoxGeometry(innerW, innerThickness, totalD);
    for (let r = 1; r < config.rows; r++) {
      const hDivider = new THREE.Mesh(hDividerGeo, shelfMat);
      const yPos = outerThickness + r * (cubeH + innerThickness) - innerThickness / 2;
      hDivider.position.set(0, yPos, 0);
      hDivider.castShadow = true;
      hDivider.receiveShadow = true;
      hDivider.userData = { isShelfPart: true };
      shelfGroup.add(hDivider);
    }

    // Internal Vertical Dividers (compartment by compartment)
    const vDividerGeo = new THREE.BoxGeometry(innerThickness, cubeH, totalD);
    for (let c = 1; c < config.cols; c++) {
      const xPos = -totalW / 2 + outerThickness + c * (cubeW + innerThickness) - innerThickness / 2;
      for (let r = 0; r < config.rows; r++) {
        const vDivider = new THREE.Mesh(vDividerGeo, shelfMat);
        const yPos = outerThickness + r * (cubeH + innerThickness) + cubeH / 2;
        vDivider.position.set(xPos, yPos, 0);
        vDivider.castShadow = true;
        vDivider.receiveShadow = true;
        vDivider.userData = { isShelfPart: true };
        shelfGroup.add(vDivider);
      }
    }

    scene.add(shelfGroup);

    // --- 2. BUILD BOARD GAME BOXES IN 3D ---
    const boxesGroup = new THREE.Group();
    boxesGroup.userData = { isGameBox: true };

    for (const placed of placedBoxes) {
      const game = gamesMap[placed.gameId];
      if (!game) continue;

      const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
      const boxGeo = new THREE.BoxGeometry(eff.displayWidth, eff.displayHeight, eff.shelfDepth);

      // Compute cube coordinate origin in 3D
      // Row 0 is the TOP row, Row (config.rows - 1) is the BOTTOM row
      const visualRowFromBottom = config.rows - 1 - placed.cubeRow;
      const cubeOriginX =
        -totalW / 2 + outerThickness + placed.cubeCol * (cubeW + innerThickness);
      const cubeOriginY =
        outerThickness + visualRowFromBottom * (cubeH + innerThickness);

      // Box center coordinates
      const boxX = cubeOriginX + (placed.posX ?? 0) + eff.displayWidth / 2;
      const boxY = cubeOriginY + (placed.posY ?? 0) + eff.displayHeight / 2;
      // Position flush with front edge of shelf (slight 1.5 cm set-back)
      const boxZ = totalD / 2 - 1.5 - eff.shelfDepth / 2;

      // Color & Textures for 6 faces
      const baseColorHex = game.color || '#3b82f6';
      const isSelected = placed.id === selectedBoxId;

      // Materials for Box faces: [Right, Left, Top, Bottom, Front, Back]
      // Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z (Front), -Z (Back)
      const frontTex = createBoxFaceTexture(
        game,
        game.name,
        baseColorHex,
        eff.displayWidth,
        eff.displayHeight,
        false
      );

      const spineTex = createBoxFaceTexture(
        game,
        game.name,
        baseColorHex,
        eff.displayWidth,
        eff.displayHeight,
        true
      );

      const standardFaceMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColorHex),
        roughness: 0.35,
        metalness: 0.1,
      });

      const frontFaceMat = new THREE.MeshStandardMaterial({
        map: frontTex,
        roughness: 0.3,
        metalness: 0.05,
        emissive: isSelected ? new THREE.Color(0xf59e0b) : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.3 : 0,
      });

      const spineFaceMat = new THREE.MeshStandardMaterial({
        map: spineTex,
        roughness: 0.3,
        metalness: 0.05,
        emissive: isSelected ? new THREE.Color(0xf59e0b) : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.3 : 0,
      });

      // Assign materials based on orientation
      let materials: THREE.Material[];
      if (placed.orientation === 'vertical') {
        // Spine is on front (+Z)
        materials = [
          standardFaceMat, // +X
          standardFaceMat, // -X
          standardFaceMat, // +Y
          standardFaceMat, // -Y
          spineFaceMat,    // +Z (Front facing user)
          standardFaceMat, // -Z
        ];
      } else if (placed.orientation === 'frontal') {
        // Cover is on front (+Z)
        materials = [
          standardFaceMat,
          standardFaceMat,
          standardFaceMat,
          standardFaceMat,
          frontFaceMat,    // +Z Cover
          standardFaceMat,
        ];
      } else {
        // Horizontal stacked
        materials = [
          standardFaceMat,
          standardFaceMat,
          frontFaceMat,    // Top face
          standardFaceMat,
          spineFaceMat,    // Front face
          standardFaceMat,
        ];
      }

      const boxMesh = new THREE.Mesh(boxGeo, materials);
      boxMesh.position.set(boxX, boxY, boxZ);
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      boxMesh.userData = {
        isGameBox: true,
        placedId: placed.id,
        gameId: placed.gameId,
      };

      boxesGroup.add(boxMesh);
      boxMeshesRef.current.set(placed.id, { mesh: boxMesh, placed, game });
    }

    scene.add(boxesGroup);
  }, [
    config,
    placedBoxes,
    gamesMap,
    selectedBoxId,
    getShelfMaterial,
    totalW,
    totalH,
    totalD,
    cubeW,
    cubeH,
  ]);

  // Pointer move for Raycasting
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  // Pointer click on Box
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    if (!container || !cameraRef.current) return;
    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
    const meshes = Array.from(boxMeshesRef.current.values()).map((v) => v.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      const hitData = Array.from(boxMeshesRef.current.values()).find((v) => v.mesh === hitMesh);
      if (hitData) {
        const p = hitData.placed;
        const g = hitData.game;
        onSelectBox(p.id === selectedBoxId ? null : p.id);
        setSelectedBoxInfo({
          id: p.id,
          name: g.name,
          dims: `${g.width} × ${g.height} × ${g.depth} cm (da ${g.dimensionSource || (g.bggId ? 'BGG' : 'Catalogo')})`,
          cube: `Vano [${p.cubeRow + 1},${p.cubeCol + 1}]`,
          orientation:
            p.orientation === 'vertical'
              ? 'In costa (verticale)'
              : p.orientation === 'horizontal'
              ? 'In pila (orizzontale)'
              : 'Frontale',
        });
      }
    } else {
      // Clicked on empty space: deselect
      onSelectBox(null);
      setSelectedBoxInfo(null);
    }
  };

  // Zoom controls
  const handleZoom = (direction: 'in' | 'out') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const factor = direction === 'in' ? 0.8 : 1.25;
    cameraRef.current.position.sub(controlsRef.current.target).multiplyScalar(factor).add(controlsRef.current.target);
    controlsRef.current.update();
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!mountRef.current) return;
    if (!document.fullscreenElement) {
      mountRef.current.parentElement?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative w-full rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-[500px] sm:min-h-[620px]">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        className="w-full flex-1 h-[500px] sm:h-[620px] select-none touch-none outline-hidden cursor-grab active:cursor-grabbing"
      />

      {/* Top HUD Badge: 3D Scene specs & interaction hints */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none z-10">
        <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-mono font-bold text-white shadow-lg flex items-center gap-2 backdrop-blur-md">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span>IKEA Kallax {config.rows}×{config.cols} (3D Reale)</span>
          <span className="text-slate-400 font-normal">| {config.cubeWidth}×{config.cubeHeight}×{config.cubeDepth} cm</span>
        </div>

        {hoveredBox && (
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/90 border border-amber-400 text-xs font-sans font-bold text-slate-950 shadow-lg animate-in fade-in zoom-in-95">
            <span>{hoveredBox.name}</span>
            <span className="ml-1.5 text-[11px] font-mono font-medium opacity-90">({hoveredBox.dims}) · {hoveredBox.cube}</span>
          </div>
        )}
      </div>

      {/* Top Right Actions: Fullscreen & Reset */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        <button
          onClick={() => setCameraPreset('perspective')}
          className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-white/10 shadow-lg transition-colors cursor-pointer"
          title="Ripristina vista 3D iniziale"
          aria-label="Reset visuale 3D"
        >
          <RotateCcw className="w-4 h-4 text-amber-400" />
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-white/10 shadow-lg transition-colors cursor-pointer"
          title={isFullscreen ? 'Esci da schermo intero' : 'Schermo intero'}
          aria-label="Schermo intero"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Selected Box Card (if any box is clicked) */}
      {selectedBoxInfo && (
        <div className="absolute top-14 left-3 max-w-sm p-3 rounded-xl bg-slate-900/95 border border-amber-400/80 shadow-2xl z-20 animate-in fade-in zoom-in-95 backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <BoxIcon className="w-4 h-4 text-amber-400 shrink-0" />
                <h3 className="text-sm font-bold text-white leading-tight">{selectedBoxInfo.name}</h3>
              </div>
              <p className="text-xs text-slate-300 font-mono mt-1">
                Dimensioni: <strong className="text-white">{selectedBoxInfo.dims}</strong>
              </p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-amber-300">
                <span>{selectedBoxInfo.cube}</span>
                <span>·</span>
                <span>{selectedBoxInfo.orientation}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedBoxInfo(null)}
              className="text-slate-400 hover:text-white p-1 text-xs"
              title="Chiudi dettagli"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-800">
            {onRotateBox && (
              <button
                onClick={() => onRotateBox(selectedBoxInfo.id)}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Ruota 90°</span>
              </button>
            )}
            <button
              onClick={() => {
                const p = placedBoxes.find((b) => b.id === selectedBoxInfo.id);
                if (p) onOpenCubeDetail(p.cubeRow, p.cubeCol);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Apri vano</span>
            </button>
          </div>
        </div>
      )}

      {/* Unified Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-auto max-w-[95%] z-20 flex flex-col items-center">
        {/* Collapse / Expand Toggle */}
        <button
          onClick={() => setIsControlsExpanded((prev) => !prev)}
          className="mb-1.5 px-2.5 py-0.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-[11px] text-slate-300 border border-white/10 flex items-center gap-1 shadow-md cursor-pointer backdrop-blur-xs"
        >
          {isControlsExpanded ? (
            <>
              <span>Nascondi comandi</span>
              <ChevronDown className="w-3 h-3 text-amber-400" />
            </>
          ) : (
            <>
              <span>Mostra comandi visuale 3D</span>
              <ChevronUp className="w-3 h-3 text-amber-400" />
            </>
          )}
        </button>

        {/* Floating Dock Bar */}
        {isControlsExpanded && (
          <div className="p-1.5 sm:p-2 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 backdrop-blur-md">
            {/* Camera angle presets */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <span className="text-[10px] text-slate-400 font-semibold px-1 hidden sm:inline">Angolo:</span>
              <button
                onClick={() => setCameraPreset('perspective')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Visuale Prospettica 3D"
              >
                Prospettiva
              </button>
              <button
                onClick={() => setCameraPreset('front')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Visuale Frontale diretta"
              >
                Frontale
              </button>
              <button
                onClick={() => setCameraPreset('top')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Visuale Inclinata dall'Alto"
              >
                Dall'Alto
              </button>
              <button
                onClick={() => setCameraPreset('side')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Visuale Laterale (Profondità 39 cm)"
              >
                Laterale
              </button>
            </div>

            {/* Zoom In / Out */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => handleZoom('in')}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Ingrandisci (Zoom In)"
                aria-label="Zoom avanti"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleZoom('out')}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Rimpicciolisci (Zoom Out)"
                aria-label="Zoom indietro"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Helper Tip */}
            <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 px-2 font-mono">
              <Eye className="w-3 h-3 text-amber-400" />
              <span>Trascina per ruotare 360° · Rotellina per zoom</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
