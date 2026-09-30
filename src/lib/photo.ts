// 拍照后本地压缩，控制 base64 体积，便于离线暂存与补传
export function compressImage(file: File, maxSize = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize }
        else if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function draftKey(orderId: string) { return `draft-${orderId}` }
