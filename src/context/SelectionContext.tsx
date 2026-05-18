import { createContext, useContext, useState, useCallback } from 'react';

interface SelectionContextType {
  hasSelections: boolean | null;
  refreshSelections: () => void;
}

const SelectionContext = createContext<SelectionContextType>({
  hasSelections: null,
  refreshSelections: () => {},
});

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [hasSelections] = useState<boolean | null>(null);

  const refreshSelections = useCallback(() => {
    // No-op: client accounts manage selections via activités/labos
  }, []);

  return (
    <SelectionContext.Provider value={{ hasSelections, refreshSelections }}>
      {children}
    </SelectionContext.Provider>
  );
}

export const useSelection = () => useContext(SelectionContext);
