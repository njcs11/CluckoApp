import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const TrainContext = createContext(null);

const DEFAULT_MODULE_STATE = {
  status: 'idle', // 'idle' | 'running' | 'completed' | 'failed'
  progress: 0,
  stage: 'Idle',
  message: '',
  logs: [],
  result: null,
  error: null
};

export function TrainProvider({ children }) {
  const [trainStatus, setTrainStatus] = useState({
    eye: { ...DEFAULT_MODULE_STATE },
    wing: { ...DEFAULT_MODULE_STATE }
  });

  const [activeModule, setActiveModule] = useState('eye');
  const pollingRef = useRef(null);
  const prevStatusRef = useRef({});

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/train/status');
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([modKey, modState]) => {
          if (!modState || typeof modState !== 'object') return;
          const prev = prevStatusRef.current[modKey] || 'idle';
          if (prev === 'running' && modState.status === 'completed') {
            toast.success(`${modKey.toUpperCase()} model training completed! (${modState.result?.train_accuracy || 0}%)`);
          } else if (prev === 'running' && modState.status === 'failed') {
            toast.error(`${modKey.toUpperCase()} model training failed: ${modState.error || 'Unknown error'}`);
          }
          prevStatusRef.current[modKey] = modState.status;
        });

        setTrainStatus(data);
      }
    } catch (err) {
      console.warn('Could not fetch train status:', err.message);
    }
  }, []);

  // Fetch status on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isAnyTrainingRunning = Object.values(trainStatus).some(s => s && s.status === 'running');

  // User controls activeModule freely; startTraining automatically sets activeModule when started


  // Robust Polling: 1000ms when actively training, 3000ms background heartbeat
  useEffect(() => {
    const intervalTime = isAnyTrainingRunning ? 1000 : 3000;
    
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(fetchStatus, intervalTime);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isAnyTrainingRunning, fetchStatus]);

  // Prevent accidental tab closing or reload when training is running
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isAnyTrainingRunning) {
        e.preventDefault();
        e.returnValue = 'Model training is currently active. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnyTrainingRunning]);

  const startTraining = async (module, hyperparameters = {}) => {
    if (trainStatus[module]?.status === 'running') {
      toast.error(`${module.toUpperCase()} training is already in progress`);
      return;
    }

    try {
      setActiveModule(module);
      setTrainStatus(prev => ({
        ...prev,
        [module]: {
          ...prev[module],
          status: 'running',
          progress: 5,
          stage: 'Initializing',
          message: 'Starting training background thread...',
          logs: [`[${new Date().toLocaleTimeString()}] Requested ${module} model training...`],
          error: null
        }
      }));

      const { data } = await axios.post('/api/train', {
        module,
        epochs: hyperparameters.epochs || 10,
        batch_size: hyperparameters.batch_size || 16,
        learning_rate: hyperparameters.learning_rate || 0.0001
      });

      if (data.success) {
        toast.success(`Started ${module.toUpperCase()} model training in background!`);
        fetchStatus();
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start training';
      setTrainStatus(prev => ({
        ...prev,
        [module]: {
          ...prev[module],
          status: 'failed',
          error: msg,
          stage: 'Failed',
          message: msg
        }
      }));
      toast.error(msg);
    }
  };

  const resetTraining = async (module) => {
    try {
      await axios.post('/api/train/reset', { module });
      setTrainStatus(prev => ({
        ...prev,
        [module]: { ...DEFAULT_MODULE_STATE }
      }));
      toast.success(`Reset ${module} training state`);
    } catch (err) {
      toast.error('Could not reset training');
    }
  };

  return (
    <TrainContext.Provider
      value={{
        trainStatus,
        isAnyTrainingRunning,
        activeModule,
        setActiveModule,
        startTraining,
        resetTraining,
        refreshStatus: fetchStatus
      }}
    >
      {children}
    </TrainContext.Provider>
  );
}

export function useTrain() {
  const context = useContext(TrainContext);
  if (!context) {
    throw new Error('useTrain must be used within a TrainProvider');
  }
  return context;
}
