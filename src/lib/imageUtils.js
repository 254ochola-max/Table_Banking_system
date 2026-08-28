/**
 * Utility for image compression and resizing before storing in Supabase & local storage.
 * Compresses images (JPEG/WebP) to standard avatar dimensions (~300-400px),
 * reducing file size from 5-10MB down to ~20-40KB.
 */
export async function compressImage(file, maxWidth = 400, maxHeight = 400, quality = 0.82) {
  if (!file) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = (err) => reject(err);
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // Clean white background for transparent images
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to optimized JPEG dataURL
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
