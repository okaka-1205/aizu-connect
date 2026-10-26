import { Check, Loader2, Minus, Move, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

type ImageCropDialogProps = {
  title: string;
  imageUrl: string;
  imageFile: File;
  alt: string;
  aspect: number;
  circular?: boolean;
  maxOutputWidth: number;
  onCancel: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

const loadImage = (url: string, alt: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.alt = alt;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("切り抜いた画像を作成できませんでした。")),
      "image/webp",
      0.9,
    );
  });

const cropImage = async (
  imageUrl: string,
  sourceFile: File,
  croppedArea: Area,
  alt: string,
  maxOutputWidth: number,
) => {
  const image = await loadImage(imageUrl, alt);
  const scale = Math.min(1, maxOutputWidth / croppedArea.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(croppedArea.width * scale));
  canvas.height = Math.max(1, Math.round(croppedArea.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("このブラウザでは画像を編集できません。");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    croppedArea.x,
    croppedArea.y,
    croppedArea.width,
    croppedArea.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await canvasToBlob(canvas);
  const extension = blob.type === "image/webp" ? "webp" : "png";
  const baseName =
    sourceFile.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") ||
    "image";
  return new File([blob], `${baseName}-cropped.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
};

export function ImageCropDialog({
  title,
  imageUrl,
  imageFile,
  alt,
  aspect,
  circular = false,
  maxOutputWidth,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const dialogRef = useDialogAccessibility<HTMLElement>(onCancel);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const onCropComplete = useCallback(
    (_area: Area, areaPixels: Area) => setCroppedArea(areaPixels),
    [],
  );
  const changeZoom = (amount: number) =>
    setZoom((current) => clampZoom(current + amount));
  const resetCrop = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
  };

  const confirmCrop = async () => {
    if (!croppedArea || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage("");
    try {
      const file = await cropImage(
        imageUrl,
        imageFile,
        croppedArea,
        alt,
        maxOutputWidth,
      );
      onConfirm(file, URL.createObjectURL(file));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "画像の切り抜きに失敗しました。",
      );
      setIsProcessing(false);
    }
  };

  return createPortal(
    <div className="image-review-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="image-review-dialog image-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-review-title"
        tabIndex={-1}
      >
        <div className="image-review-head">
          <div>
            <p className="eyebrow">PHOTO CROP</p>
            <h2 id="image-review-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            aria-label="画像の切り抜きを閉じる"
            data-dialog-initial-focus
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </div>
        <div className="image-crop-workspace" aria-label={alt}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={circular ? "round" : "rect"}
            showGrid={!circular}
            zoomWithScroll={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
          <span className="image-crop-move-hint" aria-hidden="true">
            <Move size={15} />
            ドラッグで移動
          </span>
        </div>
        <div className="image-crop-controls">
          <button
            className="image-crop-step-button"
            type="button"
            aria-label="画像を縮小"
            title="縮小"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => changeZoom(-ZOOM_STEP)}
          >
            <Minus size={18} />
          </button>
          <label className="image-crop-zoom">
            <span>
              拡大率 <output>{Math.round(zoom * 100)}%</output>
            </span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              aria-label="画像の拡大率"
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <button
            className="image-crop-step-button"
            type="button"
            aria-label="画像を拡大"
            title="拡大"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => changeZoom(ZOOM_STEP)}
          >
            <Plus size={18} />
          </button>
          <button
            className="image-crop-reset-button"
            type="button"
            onClick={resetCrop}
          >
            <RotateCcw size={16} />
            中央に戻す
          </button>
        </div>
        <p className="image-review-help">
          写真をドラッグして位置を調整してください。スマホでは2本指でも拡大・縮小できます。
        </p>
        {errorMessage && (
          <div className="form-message" role="alert">
            {errorMessage}
          </div>
        )}
        <div className="image-review-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            選び直す
          </button>
          <button
            className="primary-action"
            type="button"
            disabled={!croppedArea || isProcessing}
            onClick={() => void confirmCrop()}
          >
            {isProcessing ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            この範囲を使う
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
