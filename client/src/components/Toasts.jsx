import { useEffect, useState } from 'react';
import { subscribeToast } from '../lib/toast';

export default function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() =>
    subscribeToast((msg, type) => {
      const id = Math.random().toString(36).slice(2);
      setItems((xs) => [...xs, { id, msg, type }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    }), []);
  return (
    <div className="toast-wrap">
      {items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
    </div>
  );
}
