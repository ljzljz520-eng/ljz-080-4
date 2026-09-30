export const STATUS_LABELS = {
  dispatched: '待接单',
  accepted: '已接单',
  enroute: '前往中',
  onsite: '已到场',
  in_progress: '作业中',
  pending_confirm: '待客户确认',
  confirmed: '已恢复作业',
  rejected: '客户要求返工',
  cancelled: '已取消'
};
export const STATUS_TONE = {
  dispatched: 'blue',
  accepted: 'blue',
  enroute: 'blue',
  onsite: 'amber',
  in_progress: 'amber',
  pending_confirm: 'amber',
  confirmed: 'green',
  rejected: 'red',
  cancelled: 'gray'
};
export const PRIORITY_LABELS = { urgent: '紧急', high: '优先', normal: '常规' };
export const PRIORITY_TONE = { urgent: 'red', high: 'amber', normal: 'gray' };
export const TYPE_LABELS = { excavator: '挖掘机', crane: '吊车', roller: '压路机' };

export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtMinutes(min) {
  if (!min) return '0 分钟';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} 小时${m ? ' ' + m + ' 分' : ''}` : `${m} 分钟`;
}

// 文件 -> 压缩后的 JPEG dataURL（工地现场照片通常较大，离线存储前压缩到 1024px）
export function fileToCompressedDataUrl(file, maxSize = 1024, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
