import { Check, Loader2, X } from "lucide-react";
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
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <label className="image-crop-zoom">
          <span>拡大</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            aria-label="画像の拡大率"
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <p className="image-review-help">
          画像を動かして、使用する範囲を枠の内側に合わせてください。
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
