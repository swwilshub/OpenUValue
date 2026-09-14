import { useCallback, useEffect, useRef, useState } from 'react';
import { exposureZone } from '@openuvalue/engine';
import type { ExposureZoneId } from '@openuvalue/engine';
import { readExposureArea } from '../state/exposureColour.js';
import type { AreaReading, Rgb } from '../state/exposureColour.js';

/**
 * Read the exposure zone off the real map, by clicking it.
 *
 * Approved Document C Diagram 12 shades the country in four flat greys, so the answer is
 * already in the figure: point at where the building is and the shade under the pointer
 * says which band that is. No geography is shipped, redrawn or guessed, and the four
 * bands are matched by the tool rather than by eye.
 *
 * **The figure is not shipped with this tool.** Approved Document C is Crown copyright
 * and permits free reproduction only for research, private study or internal circulation;
 * putting it inside a public web page is re-use beyond that. So the reader takes the
 * user's own copy of the figure, from the free download, and the image never leaves the
 * browser: it is drawn straight into a canvas here and read back from it. There is no
 * upload because there is no server.
 *
 * The loupe is what makes this workable rather than fiddly. At the size a page of a PDF
 * screenshots to, a town is a few pixels across and a coastline is one; the magnifier
 * shows what is actually under the crosshair and names the band before the click commits
 * to it.
 */

const LOUPE_SOURCE_PIXELS = 17;
const LOUPE_SIZE = 136;
/** Odd, so it is centred on the pixel under the pointer. */
const SAMPLE_WINDOW = 5;

const ADC_PUBLICATION_URL =
  'https://www.gov.uk/government/publications/site-preparation-and-resistance-to-contaminates-and-moisture-approved-document-c';

export interface ExposureMapReaderProps {
  readonly onRead: (zoneId: ExposureZoneId) => void;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export function ExposureMapReader({ onRead }: ExposureMapReaderProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadProblem, setLoadProblem] = useState<string | undefined>(undefined);
  const [hover, setHover] = useState<{ point: Point; reading: AreaReading } | undefined>(undefined);
  const [clicked, setClicked] = useState<{ point: Point; reading: AreaReading } | undefined>(
    undefined,
  );
  const hasImage = image !== null;

  /*
   * The canvas only exists once there is an image to put in it, so the drawing cannot
   * happen in the load handler: at that moment the ref is still null. It waits for the
   * render that mounts the canvas instead.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (image === null || canvas === null) {
      return;
    }
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      setLoadProblem('This browser would not give a drawing context to read the image with.');
      return;
    }
    context.drawImage(image, 0, 0);
    imageRef.current = image;
  }, [image]);

  const load = useCallback((file: Blob): void => {
    const url = URL.createObjectURL(file);
    const next = new Image();
    next.onload = () => {
      setClicked(undefined);
      setHover(undefined);
      setLoadProblem(undefined);
      setImage(next);
      URL.revokeObjectURL(url);
    };
    next.onerror = () => {
      setLoadProblem('That file did not decode as an image.');
      URL.revokeObjectURL(url);
    };
    next.src = url;
  }, []);

  // Pasting is the shortest route: screenshot the diagram, click here, press Ctrl+V.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const items = event.clipboardData?.items;
      if (items === undefined) {
        return;
      }
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file !== null) {
            load(file);
            event.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [load]);

  /** Canvas pixel under a pointer event, from the element's own scaling. */
  const pixelAt = (event: { clientX: number; clientY: number }): Point | undefined => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return undefined;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return undefined;
    }
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * canvas.height),
    };
  };

  const sampleAround = (point: Point): AreaReading => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (canvas === null || context === null || context === undefined) {
      return { kind: 'unclear' };
    }
    const half = Math.floor(SAMPLE_WINDOW / 2);
    const x = Math.max(0, Math.min(canvas.width - SAMPLE_WINDOW, point.x - half));
    const y = Math.max(0, Math.min(canvas.height - SAMPLE_WINDOW, point.y - half));
    const data = context.getImageData(x, y, SAMPLE_WINDOW, SAMPLE_WINDOW).data;
    const samples: Rgb[] = [];
    for (let index = 0; index + 3 < data.length; index += 4) {
      samples.push({ r: data[index] ?? 0, g: data[index + 1] ?? 0, b: data[index + 2] ?? 0 });
    }
    return readExposureArea(samples);
  };

  const drawLoupe = (point: Point): void => {
    const loupe = loupeRef.current;
    const image = imageRef.current;
    if (loupe === null || image === null) {
      return;
    }
    const context = loupe.getContext('2d');
    if (context === null) {
      return;
    }
    const half = Math.floor(LOUPE_SOURCE_PIXELS / 2);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    context.drawImage(
      image,
      point.x - half,
      point.y - half,
      LOUPE_SOURCE_PIXELS,
      LOUPE_SOURCE_PIXELS,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE,
    );
    // Crosshair on the centre pixel, so it is obvious which one is being read.
    const step = LOUPE_SIZE / LOUPE_SOURCE_PIXELS;
    context.strokeStyle = '#a5301f';
    context.lineWidth = 1.5;
    context.strokeRect(half * step, half * step, step, step);
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const point = pixelAt(event);
    if (point === undefined) {
      return;
    }
    drawLoupe(point);
    setHover({ point, reading: sampleAround(point) });
  };

  const onClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const point = pixelAt(event);
    if (point === undefined) {
      return;
    }
    const reading = sampleAround(point);
    setClicked({ point, reading });
    if (reading.kind === 'zone') {
      onRead(reading.zoneId);
    }
  };

  // The pointer's reading while it is over the map, and the committed one after it leaves.
  const shown = hover?.reading ?? clicked?.reading;
  const shownZone = shown?.kind === 'zone' ? exposureZone(shown.zoneId) : undefined;

  return (
    <div className="map-reader">
      {!hasImage && (
        <label
          className="map-drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file !== undefined) {
              load(file);
            }
          }}
        >
          <strong>Drop the exposure map here</strong>
          <span>
            Open{' '}
            <a href={ADC_PUBLICATION_URL} target="_blank" rel="noreferrer">
              Approved Document C
            </a>{' '}
            and find <em>Diagram 12, UK zones for exposure to driving rain</em>, on page 34.
            Screenshot it and paste with Ctrl+V, drag the image in here, or choose a file.
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                load(file);
              }
            }}
          />
          <span className="map-drop-note">
            The image is read in your browser and goes nowhere. We cannot ship the map
            itself: it is Crown copyright, and free to download but not to republish.
          </span>
        </label>
      )}

      {loadProblem !== undefined && <p className="exposure-conflict">{loadProblem}</p>}

      {hasImage && (
        <>
          <div className="map-canvas-wrap">
            {/* Shrink-wraps the canvas, so the pin's percentages land on the drawing. */}
            <span className="map-canvas-frame">
              <canvas
                ref={canvasRef}
                className="map-canvas"
                onPointerMove={onMove}
                onPointerLeave={() => setHover(undefined)}
                onClick={onClick}
              />
              {clicked?.reading.kind === 'zone' && (
                <span
                  className="map-pin"
                  style={{
                    left: `${(clicked.point.x / (canvasRef.current?.width ?? 1)) * 100}%`,
                    top: `${(clicked.point.y / (canvasRef.current?.height ?? 1)) * 100}%`,
                  }}
                />
              )}
            </span>
          </div>

          <div className="map-reader-side">
            <span className="map-loupe-caption">Under the crosshair</span>
            <canvas ref={loupeRef} width={LOUPE_SIZE} height={LOUPE_SIZE} className="map-loupe" />
            <p className="map-live">
              {shown === undefined && 'Move over the map, then click where the building is.'}
              {shown?.kind === 'background' && 'Sea, or off the figure.'}
              {shown?.kind === 'unclear' && 'Between two bands, or on a line. Move slightly.'}
              {shownZone !== undefined && (
                <>
                  <strong>{shownZone.label}</strong>
                  <em>{shownZone.rangeText}</em>
                  {hover === undefined && <em>Clicked.</em>}
                </>
              )}
            </p>
            <button type="button" className="ghost-button" onClick={() => setImage(null)}>
              Use a different image
            </button>
          </div>
        </>
      )}
    </div>
  );
}
