import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Coupon } from '../types/coupon';
import { getCoupon, listCoupons } from '../db/appDb';
import { useAuth } from '../context/AuthContext';
import { deadlineTimestamp } from '../rules/couponRules';
import { onDataChanged } from '../lib/dataBus';

function sortByDeadline(a: Coupon, b: Coupon) {
  return deadlineTimestamp(a) - deadlineTimestamp(b);
}

export function useCoupons() {
  const { dataVersion } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listCoupons();
      setCoupons([...list].sort(sortByDeadline));
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, dataVersion]);

  useEffect(() => onDataChanged(() => void reload()), [reload]);

  const byId = useMemo(() => new Map(coupons.map((c) => [c.id, c])), [coupons]);

  const findById = useCallback(
    async (id: string): Promise<Coupon | undefined> => {
      const cached = byId.get(id);
      if (cached) return cached;
      return getCoupon(id);
    },
    [byId],
  );

  return { coupons, loading, error, reload, findById };
}
