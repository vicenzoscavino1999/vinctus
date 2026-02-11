import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNativePlatform } from '@/shared/lib/native/capacitor';

export interface NativeCameraCaptureResult {
  native: boolean;
  dataUrl: string | null;
  format: string | null;
}

export const captureNativeCameraPhoto = async (): Promise<NativeCameraCaptureResult> => {
  const native = isNativePlatform();
  const photo = await Camera.getPhoto({
    quality: 85,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    saveToGallery: false,
    promptLabelCancel: 'Cancelar',
    promptLabelPhoto: 'Galeria',
    promptLabelPicture: 'Camara',
  });

  return {
    native,
    dataUrl: photo.dataUrl ?? null,
    format: photo.format ?? null,
  };
};
