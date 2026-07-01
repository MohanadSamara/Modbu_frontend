import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import modbusApi from '../api/modbus.js';

const DeviceContext = createContext();

export function DeviceProvider({ children }) {
  const [currentDevice, setCurrentDevice] = useState(null);
  const [loading, setLoading] = useState(false);

  const connect = useCallback(async (device) => {
    setLoading(true);
    try {
      const result = await modbusApi.connect(device.id);
      if (result?.success) {
        setCurrentDevice(device);
        return { success: true };
      }
      // Backend returned 2xx but success=false; try to surface any message.
      const message =
        result?.error || result?.detail || result?.message || 'Connection refused by server';
      return { success: false, error: message };
    } catch (error) {
      // Log once for debugging, but let the caller display the real message.
      console.warn('Connect failed:', error?.message || error);
      return { success: false, error: error?.message || 'Connection failed' };
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      const success = await modbusApi.disconnect();
      if (success.success) {
        setCurrentDevice(null);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Disconnect failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    currentDevice,
    connect,
    disconnect,
    loading,
    isConnected: !!currentDevice
  };

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within DeviceProvider');
  }
  return context;
}

