import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { t } from '../../i18n/t';

interface SignaturePadProps {
  /** Reçoit le PNG (data URL) du tracé, ou `null` quand le canevas est vide. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

/**
 * Canevas de signature manuscrite, tactile et souris (événements pointeur).
 * `touch-action: none` empêche la page de défiler pendant le tracé.
 */
export const SignaturePad: React.FC<SignaturePadProps> = ({ onChange, height = 180 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const context = useCallback(() => {
    const ctx = canvasRef.current?.getContext?.('2d') ?? null;
    if (ctx) {
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    }
    return ctx;
  }, []);

  // Résolution interne alignée sur la largeur affichée, pour un tracé net.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth || 320;
    canvas.height = height;
  }, [height]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = rect.width ? event.currentTarget.width / rect.width : 1;
    const scaleY = rect.height ? event.currentTarget.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = context();
    if (!ctx) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = context();
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    try {
      onChange(canvasRef.current?.toDataURL('image/png') ?? null);
    } catch {
      onChange(null);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext?.('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid="signature-canvas"
        aria-label={t('Zone de signature : dessinez votre signature')}
        role="img"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          width: '100%',
          height,
          touchAction: 'none',
          border: '1px dashed #9ca3af',
          borderRadius: 8,
          background: '#fff',
          display: 'block'
        }}
      />
      <Button size="small" type="link" onClick={clear} disabled={!hasInk} style={{ paddingInlineStart: 0 }}>
        {t('Effacer')}
      </Button>
    </div>
  );
};
