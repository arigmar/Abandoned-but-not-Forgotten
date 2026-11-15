export interface InputCallbacks {
  onSkip: () => void;
  onPulse: () => void;
  onInteract: () => void;
  onAutoApproach: () => void;
  onPauseToggle: () => void;
  onPrevHotspot: () => void;
  onNextHotspot: () => void;
  onSelectHotspotIndex: (index: number) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onRetry?: () => void;
  onLaunchOrbit?: () => void;
  onDiagnosticTest?: () => void;
}

export interface ExpeditionInput {
  readonly throttle: number;
  readonly steer: number;
  readonly inspectRotate: number;
  readonly inspectZoom: number;
  isKeyDown: (code: string) => boolean;
  consumeOrbitDelta: () => { yaw: number; pitch: number };
  consumeWheelZoom: () => number;
  isHoldingInteractKey: () => boolean;
  setActive: (active: boolean) => void;
  destroy: () => void;
}

export function createExpeditionInput(
  canvas: HTMLCanvasElement,
  joystickEl: HTMLElement | null,
  joystickThumbEl: HTMLElement | null,
  callbacks: InputCallbacks,
): ExpeditionInput {
  const keys = new Set<string>();
  let active = true;
  let orbitYaw = 0;
  let orbitPitch = 0;
  let wheelZoom = 0;
  let dragPointerId: number | null = null;
  let lastDragX = 0;
  let lastDragY = 0;

  let joyPointerId: number | null = null;
  let joyX = 0;
  let joyY = 0;
  let holdKeyDown = false;

  const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!active) return;
    if (isTypingTarget(event.target)) return;

    const code = event.code;
    keys.add(code);

    if (code === 'Escape') {
      event.preventDefault();
      callbacks.onPauseToggle();
      return;
    }

    const onButtonOrLink =
      event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement;

    if (code === 'Enter' && !onButtonOrLink) {
      event.preventDefault();
      callbacks.onSkip();
      return;
    }

    if (code === 'Space') {
      if (!onButtonOrLink) {
        event.preventDefault();
        if (!event.repeat) callbacks.onPulse();
      }
      return;
    }

    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      event.preventDefault();
    }

    if (event.repeat) return;

    if (code === 'KeyE') {
      holdKeyDown = true;
      callbacks.onInteract();
      callbacks.onHoldStart();
    } else if (code === 'KeyG') {
      callbacks.onAutoApproach();
    } else if (code === 'KeyR') {
      callbacks.onRetry?.();
    } else if (code === 'KeyL') {
      callbacks.onLaunchOrbit?.();
    } else if (code === 'KeyF') {
      callbacks.onDiagnosticTest?.();
    } else if (code === 'BracketLeft') {
      callbacks.onPrevHotspot();
    } else if (code === 'BracketRight') {
      callbacks.onNextHotspot();
    } else if (code >= 'Digit1' && code <= 'Digit5') {
      const idx = Number(code.slice(5)) - 1;
      callbacks.onSelectHotspotIndex(idx);
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.code);
    if (event.code === 'KeyE' && holdKeyDown) {
      holdKeyDown = false;
      callbacks.onHoldEnd();
    }
  };

  const onBlur = (): void => {
    keys.clear();
    if (holdKeyDown) {
      holdKeyDown = false;
      callbacks.onHoldEnd();
    }
    dragPointerId = null;
    joyPointerId = null;
    joyX = 0;
    joyY = 0;
    if (joystickThumbEl) {
      joystickThumbEl.style.transform = 'translate(0px, 0px)';
    }
  };

  const onCanvasPointerDown = (event: PointerEvent): void => {
    if (!active || dragPointerId !== null) return;
    dragPointerId = event.pointerId;
    lastDragX = event.clientX;
    lastDragY = event.clientY;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Ignore synthetic events
    }
  };

  const onCanvasPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== dragPointerId) return;
    const dx = event.clientX - lastDragX;
    const dy = event.clientY - lastDragY;
    lastDragX = event.clientX;
    lastDragY = event.clientY;
    orbitYaw -= dx * 0.0065;
    orbitPitch -= dy * 0.0052;
  };

  const onCanvasPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = null;
    try {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  const onCanvasWheel = (event: WheelEvent): void => {
    if (!active) return;
    event.preventDefault();
    wheelZoom += Math.sign(event.deltaY) * Math.min(2.5, Math.abs(event.deltaY) * 0.015);
  };

  const updateJoystickFromPointer = (clientX: number, clientY: number): void => {
    if (!joystickEl) return;
    const rect = joystickEl.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxRadius = Math.max(20, rect.width * 0.34);

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      const ratio = maxRadius / dist;
      dx *= ratio;
      dy *= ratio;
    }

    joyX = dx / maxRadius;
    joyY = -dy / maxRadius;
    if (joystickThumbEl) {
      joystickThumbEl.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
  };

  const onJoyPointerDown = (event: PointerEvent): void => {
    if (!active || !joystickEl) return;
    event.preventDefault();
    joyPointerId = event.pointerId;
    try {
      joystickEl.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture errors
    }
    updateJoystickFromPointer(event.clientX, event.clientY);
  };

  const onJoyPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== joyPointerId) return;
    updateJoystickFromPointer(event.clientX, event.clientY);
  };

  const onJoyPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== joyPointerId) return;
    joyPointerId = null;
    joyX = 0;
    joyY = 0;
    if (joystickThumbEl) {
      joystickThumbEl.style.transform = 'translate(0px, 0px)';
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  canvas.addEventListener('pointerdown', onCanvasPointerDown);
  canvas.addEventListener('pointermove', onCanvasPointerMove);
  canvas.addEventListener('pointerup', onCanvasPointerUp);
  canvas.addEventListener('pointercancel', onCanvasPointerUp);
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });

  joystickEl?.addEventListener('pointerdown', onJoyPointerDown);
  joystickEl?.addEventListener('pointermove', onJoyPointerMove);
  joystickEl?.addEventListener('pointerup', onJoyPointerUp);
  joystickEl?.addEventListener('pointercancel', onJoyPointerUp);

  return {
    get throttle() {
      const k =
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      return Math.max(-1, Math.min(1, k + joyY));
    },
    get steer() {
      const k =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return Math.max(-1, Math.min(1, k + joyX));
    },
    get inspectRotate() {
      const k =
        (keys.has('KeyD') || keys.has('ArrowRight') || keys.has('KeyQ') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('KeyZ') ? 1 : 0);
      return k || joyX;
    },
    get inspectZoom() {
      const k =
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return k || -joyY;
    },
    isKeyDown(code: string) {
      return keys.has(code);
    },
    consumeOrbitDelta() {
      const delta = { yaw: orbitYaw, pitch: orbitPitch };
      orbitYaw = 0;
      orbitPitch = 0;
      return delta;
    },
    consumeWheelZoom() {
      const z = wheelZoom;
      wheelZoom = 0;
      return z;
    },
    isHoldingInteractKey() {
      return holdKeyDown;
    },
    setActive(value: boolean) {
      active = value;
      if (!value) onBlur();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);

      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      canvas.removeEventListener('pointerup', onCanvasPointerUp);
      canvas.removeEventListener('pointercancel', onCanvasPointerUp);
      canvas.removeEventListener('wheel', onCanvasWheel);

      joystickEl?.removeEventListener('pointerdown', onJoyPointerDown);
      joystickEl?.removeEventListener('pointermove', onJoyPointerMove);
      joystickEl?.removeEventListener('pointerup', onJoyPointerUp);
      joystickEl?.removeEventListener('pointercancel', onJoyPointerUp);
    },
  };
}
