import { useCallback, useEffect, useState } from 'react';
import { get } from './api';

export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);

  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    get(path)
      .then((d) => {
        setData(d);
        setError(null);
        setOffline(false);
      })
      .catch((e) => {
        setError(e.message);
        setOffline(!!e.offline);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, offline, reload, setData };
}
