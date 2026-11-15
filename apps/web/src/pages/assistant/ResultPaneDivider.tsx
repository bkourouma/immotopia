import React, { useRef } from 'react';

export const MIN_RESULT_WIDTH = 360;
export const DEFAULT_RESULT_WIDTH = 480;
export const MAX_RESULT_WIDTH = 720;
const STORAGE_KEY = 'immotopia.assistant.resultWidth';

export function readResultWidth(): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return saved >= MIN_RESULT_WIDTH && saved <= MAX_RESULT_WIDTH ? saved : DEFAULT_RESULT_WIDTH;
  } catch {
    return DEFAULT_RESULT_WIDTH;
  }
}

export function saveResultWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Le panneau reste redimensionnable sans accès au stockage.
  }
}

interface DividerProps {
  label: string;
  width: number;
  maximum: number;
  rtl: boolean;
  controls: string;
  onResize(width: number): void;
}

export function ResultPaneDivider({ label, width, maximum, rtl, controls, onResize }: DividerProps) {
  const drag = useRef<{ pointerId: number; x: number; width: number }>();
  const direction = rtl ? 1 : -1;
  const resize = (value: number) => onResize(Math.max(MIN_RESULT_WIDTH, Math.min(maximum, Math.round(value))));
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuemin={MIN_RESULT_WIDTH}
      aria-valuemax={maximum}
      aria-valuenow={width}
      className="assistant-result-divider"
      onKeyDown={event => {
        const steps: Record<string, number> = {
          ArrowLeft: width - direction * 24,
          ArrowRight: width + direction * 24,
          Home: MIN_RESULT_WIDTH,
          End: maximum
        };
        if (!Object.prototype.hasOwnProperty.call(steps, event.key)) return;
        event.preventDefault();
        resize(steps[event.key]);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start?.pointerId === event.pointerId) resize(start.width + direction * (event.clientX - start.x));
      }}
      onLostPointerCapture={() => {
        drag.current = undefined;
      }}
    />
  );
}
