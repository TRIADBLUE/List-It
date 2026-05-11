import { useState, useEffect } from "react";
import { usePhotoEditor } from "react-photo-editor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, Check, X, Sun, ZoomIn, ZoomOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PhotoEditorProps {
  imageUrl: string;
  onSave: (editedImageUrl: string) => void;
  onCancel: () => void;
}

export default function PhotoEditor({ imageUrl, onSave, onCancel }: PhotoEditorProps) {
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const { toast } = useToast();

  // Load image as File for react-photo-editor
  useEffect(() => {
    const loadImage = async () => {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "photo.jpg", { type: blob.type });
        setImageFile(file);
      } catch (error) {
        console.error("Error loading image:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load image",
        });
      }
    };
    loadImage();
  }, [imageUrl, toast]);

  const {
    canvasRef,
    brightness,
    setBrightness,
    handleZoomIn,
    handleZoomOut,
    handleRotateAntiCw,
    generateEditedFile,
  } = usePhotoEditor({
    file: imageFile,
    defaultBrightness: 100,
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      const editedFile = await generateEditedFile();
      
      if (!editedFile) {
        throw new Error("Failed to generate edited image");
      }

      // Upload edited image
      const formData = new FormData();
      formData.append('file', editedFile, 'edited-image.jpg');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      onSave(data.url);
      
      toast({
        title: "Image saved",
        description: "Your edits have been applied",
      });
    } catch (error) {
      console.error("Error saving image:", error);
      toast({
        variant: "destructive",
        title: "Save failed",
        description: "Could not save edited image",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!imageFile) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Edit Photo</h2>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            data-testid="button-cancel-edit"
          >
            <X className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            onClick={handleSave}
            disabled={loading}
            data-testid="button-save-edit"
          >
            <Check className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/20">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full touch-none"
          style={{
            imageRendering: 'high-quality',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      </div>

      <div className="p-4 border-t space-y-4 bg-background">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1">
            <Sun className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[brightness]}
              onValueChange={([value]) => setBrightness(value)}
              min={0}
              max={200}
              step={1}
              className="flex-1"
              data-testid="slider-brightness"
            />
            <span className="text-sm text-muted-foreground w-12 text-right">
              {brightness}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={handleRotateAntiCw}
            data-testid="button-rotate"
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Rotate
          </Button>
          <Button
            variant="outline"
            onClick={handleZoomIn}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-4 w-4 mr-2" />
            Zoom In
          </Button>
          <Button
            variant="outline"
            onClick={handleZoomOut}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-4 w-4 mr-2" />
            Zoom Out
          </Button>
        </div>
      </div>
    </div>
  );
}
