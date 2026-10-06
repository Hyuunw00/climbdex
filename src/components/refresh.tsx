import { useState } from 'react';
import { RefreshControl } from 'react-native';

export function useRefreshControl(onRefresh?: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  if (!onRefresh) return undefined;
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }}
    />
  );
}
