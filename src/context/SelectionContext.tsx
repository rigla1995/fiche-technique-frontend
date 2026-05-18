import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';

interface SelectionContextType {
  hasSelections: boolean | null;
  refreshSelections: () => void;
}

const SelectionContext = createContext<SelectionContextType>({
  hasSelections: null,
  refreshSelections: () => {},
});

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [hasSelections, setHasSelections] = useState<boolean | null>(null);

  const isIndep = user?.role === 'client' && user?.compteType === 'independant';

  const refreshSelections = useCallback(() => {
    if (isIndep) {
      api.get('/ingredients/has-selections')
        .then(({ data }) => setHasSelections(data.hasSelections))
        .catch(() => setHasSelections(false));
    }
  }, [isIndep]);

  useEffect(() => {
    refreshSelections();
  }, [refreshSelections]);

  return (
    <SelectionContext.Provider value={{ hasSelections, refreshSelections }}>
      {children}
    </SelectionContext.Provider>
  );
}

export const useSelection = () => useContext(SelectionContext);
