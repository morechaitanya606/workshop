"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Loader2, X } from "lucide-react";
import { getCroppedFile } from "@/lib/crop-image";

const DEFAULT_ASPECT = 5 / 4;

type CropperModalProps = {
    file: File;
    aspect: number;
    index: number;
    total: number;
    onApply: (file: File) => void;
    onCancel: () => void;
};

function ImageCropperModal({ file, aspect, index, total, onApply, onCancel }: CropperModalProps) {
    const [src, setSrc] = useState("");
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [areaPixels, setAreaPixels] = useState<Area | null>(null);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const url = URL.createObjectURL(file);
        setSrc(url);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setAreaPixels(null);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const onCropComplete = useCallback((_area: Area, areaInPixels: Area) => {
        setAreaPixels(areaInPixels);
    }, []);

    const handleApply = async () => {
        if (!areaPixels) return;
        setProcessing(true);
        try {
            const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
            const cropped = await getCroppedFile(src, areaPixels, file.name, mimeType);
            onApply(cropped);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
            <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                        <h3 className="font-inter text-sm font-bold text-dark">Adjust crop</h3>
                        <p className="text-xs font-inter text-dark-muted">
                            Drag to reposition, use the slider to zoom.
                            {total > 1 ? ` Image ${index + 1} of ${total}.` : ""}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={processing}
                        aria-label="Cancel crop"
                        className="rounded-full p-1.5 text-dark-muted transition-colors hover:bg-gray-100 hover:text-dark"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="relative h-[55vh] w-full bg-black">
                    {src && (
                        <Cropper
                            image={src}
                            crop={crop}
                            zoom={zoom}
                            aspect={aspect}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                        />
                    )}
                </div>

                <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                        Zoom
                    </span>
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={zoom}
                        onChange={(event) => setZoom(Number(event.target.value))}
                        className="flex-1 accent-terracotta"
                        aria-label="Zoom"
                    />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={processing}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-inter font-semibold text-dark transition-colors hover:border-gray-300"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={processing || !areaPixels}
                        className="inline-flex items-center gap-2 rounded-lg bg-terracotta px-4 py-2 text-xs font-inter font-semibold text-white transition-colors hover:bg-terracotta/90 disabled:opacity-60"
                    >
                        {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {total > 1 && index + 1 < total ? "Apply & next" : "Apply crop"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Hook that opens an interactive crop modal for one or more files in sequence
 * and resolves with the cropped files.
 *
 * Usage:
 *   const { cropImages, cropperElement } = useImageCropper();
 *   // in an upload handler:
 *   const [cropped] = await cropImages([file]);
 *   if (!cropped) return; // user cancelled
 *   // ...upload `cropped`
 *   // render {cropperElement} once in the page.
 */
export function useImageCropper(aspect: number = DEFAULT_ASPECT) {
    const [queue, setQueue] = useState<File[]>([]);
    const [index, setIndex] = useState(0);
    const resultsRef = useRef<File[]>([]);
    const resolverRef = useRef<((files: File[]) => void) | null>(null);

    const settle = useCallback(() => {
        const resolver = resolverRef.current;
        const results = resultsRef.current;
        resolverRef.current = null;
        resultsRef.current = [];
        setQueue([]);
        setIndex(0);
        resolver?.(results);
    }, []);

    const cropImages = useCallback((files: File[]) => {
        return new Promise<File[]>((resolve) => {
            const imageFiles = files.filter((file) => file.type.startsWith("image/"));
            if (!imageFiles.length) {
                resolve([]);
                return;
            }
            resultsRef.current = [];
            resolverRef.current = resolve;
            setIndex(0);
            setQueue(imageFiles);
        });
    }, []);

    const current = queue[index] ?? null;

    const handleApply = useCallback(
        (cropped: File) => {
            resultsRef.current = [...resultsRef.current, cropped];
            if (index + 1 < queue.length) {
                setIndex((value) => value + 1);
            } else {
                settle();
            }
        },
        [index, queue.length, settle]
    );

    const cropperElement = current ? (
        <ImageCropperModal
            key={index}
            file={current}
            aspect={aspect}
            index={index}
            total={queue.length}
            onApply={handleApply}
            onCancel={settle}
        />
    ) : null;

    return { cropImages, cropperElement };
}
