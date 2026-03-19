import { useState, useEffect } from 'react';

export function useStorage(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storage.getItem(`local:${key}`).then((storedValue) => {
      if (storedValue !== null && storedValue !== undefined) {
        setValue(storedValue);
      } else {
        setValue(initialValue);
      }
      setLoading(false);
    });

    const unwatch = storage.watch(`local:${key}`, (newValue) => {
      setValue(newValue !== null && newValue !== undefined ? newValue : initialValue);
    });

    return () => {
      unwatch();
    };
  }, [key]);

  const setStoredValue = async (newValue) => {
    try {
      const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
      setValue(valueToStore);
      await storage.setItem(`local:${key}`, valueToStore);
    } catch (error) {
      console.error(`Error setting storage key ${key}:`, error);
    }
  };

  return [value, setStoredValue, loading];
}
