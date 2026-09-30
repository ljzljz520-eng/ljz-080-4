import { useEffect, useState } from 'react';
import { useOnline } from '../lib/useOnline';
import { onOutboxChange, retryOutbox } from '../lib/outbox';

export default function OfflineBar() {
  const online = useOnline();
  const [pending, setPending] = useState(0);
  useEffect(() => onOutboxChange(({ items }) => setPending(items.length)), []);

  if (online && pending === 0) return null;
  return (
    <div className="offline-bar">
      {!online && <span>📵 当前处于离线状态，外勤工单仍可填写，内容保存在本机，联网后自动上报</span>}
      {online && pending > 0 && (
        <>
          <span>📤 有 {pending} 条离线上报待同步</span>
          <button className="btn sm ghost" style={{ borderColor: '#ecd29a', color: '#7c5414' }} onClick={retryOutbox}>立即同步</button>
        </>
      )}
    </div>
  );
}
